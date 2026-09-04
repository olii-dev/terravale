// Terravale — main entry v2. Owns the render loop, input, and the glue
// between world, lighting, player, survival systems, mobs, UI, chat,
// saves and the P2P network.

import * as THREE from 'three';
import { B, BLOCKS, isReplaceable, isCross, dropsFor, waterLevel, waterBlockForLevel, isWater as isWaterId } from './blocks.js';
import { buildAtlas, TILE_INDEX, getCrackTextures } from './textures.js';
import { resolveFaceTiles } from './blocks.js';
import { World, HEIGHT } from './world.js';
import { CHUNK, NETHER_X, isNetherX } from './worldgen.js';
import { Lighting } from './lighting.js';
import { ChunkManager, TERRAIN_UNIFORMS } from './chunks.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { Sfx } from './sounds.js';
import { UI } from './ui.js';
import { Chat } from './chat.js';
import { Hud } from './hud.js';
import { Avatars } from './avatars.js';
import { Mobs, entityRaycast, MOB_TYPES } from './mobs.js';
const MOBS_HOSTILE = (t) => !!MOB_TYPES[t]?.hostile;
import { Drops } from './drops.js';
import { HandView } from './handview.js';
import { Inventory } from './inventory.js';
import { Stats } from './stats.js';
import { Net, makeRoomCode } from './network.js';
import { saveWorld, loadWorld, savePrefs, loadPrefs } from './save.js';
import { settings } from './settings.js';
import { runCommand, commandSuggestions } from './commands.js';
import { canHarvest, isFood, isBlockItem, nameOf, ITEMS } from './items.js';
import { tickFurnace } from './containers.js';
import { itemIcon } from './sprites.js';
import { Particles } from './particles.js';
import { Weather } from './weather.js';
import { tileColors } from './textures.js';
import { WaterSim } from './water.js';
import { WorldTick } from './worldtick.js';
import { hoeId, armorOf, I } from './items.js';

// ---------- boot ----------

if ('ontouchstart' in window && !window.matchMedia('(pointer: fine)').matches) {
  document.getElementById('mobile-warn').classList.remove('hidden');
}

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.classList.add('game');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.get('fov'), window.innerWidth / window.innerHeight, 0.08, 900);
scene.add(camera); // so the hand view (child of camera) renders

buildAtlas();
resolveFaceTiles(TILE_INDEX);

const sfx = new Sfx();
sfx.setVolumes(settings.get('master'), settings.get('sfx'));

// block highlight + mining crack overlay
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 })
);
highlight.visible = false;
scene.add(highlight);

const crackTextures = getCrackTextures();
const crackMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.004, 1.004, 1.004),
  new THREE.MeshBasicMaterial({ map: crackTextures[0], transparent: true, depthWrite: false })
);
crackMesh.visible = false;
crackMesh.renderOrder = 3;
scene.add(crackMesh);

// ---------- state ----------

let state = 'menu'; // menu | connecting | playing
let world = null, lighting = null, cm = null, player = null, sky = null;
let avatars = null, mobs = null, drops = null, hand = null, net = null;
let inventory = null, stats = null, ui = null, chat = null, hud = null;
let particles = null, weather = null, waterSim = null, worldtick = null;
let myName = 'Wanderer', myColor = '#7ddb5a', myGamemode = 'survival';
let expectUnlock = false;
let holdBtn = null, nextActionAt = 0, attackCd = 0, placeCd = 0, hitSoundT = 0;
let lastPosSend = 0, lastSaveAt = 0, lastTimeSync = 0, lastEntitySync = 0, lastMobSync = "", lastDropSync = "";
let lastCstate = 0, furnaceUiTick = 0;
let frames = 0, fpsTime = 0, fps = 0;
let pickupReqT = new Map();
let deathDropped = false, bobPhase = 0, bowCharging = 0, hurtTilt = 0, portalTime = 0;

function g0etBlockSafe(world, p) {
  return world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
}

function teleportDimension() {
  const p = player.pos;
  const inNether = isNetherX(p.x);
  const targetX = inNether ? p.x - NETHER_X : p.x + NETHER_X;
  // find or build a destination portal near the target
  let px = Math.round(targetX), pz = Math.round(p.z);
  // scan for an existing portal nearby
  let found = null;
  for (let dx = -12; dx <= 12 && !found; dx++) for (let dz = -12; dz <= 12 && !found; dz++) {
    for (let y = 40; y < 100; y++) {
      if (world.getBlock(px + dx, y, pz + dz) === B.NETHER_PORTAL) { found = [px + dx, y, pz + dz]; break; }
    }
  }
  if (found) {
    player.pos.set(found[0] + 0.5, found[1], found[2] + 0.5);
  } else {
    // build a return portal on a small platform
    const baseY = inNether ? 90 : 80; // high; a platform drops you safely-ish
    for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
      world.setBlock(px + dx, baseY - 1, pz + dz, inNether ? B.NETHERRACK : B.STONE);
    }
    // frame: 2 wide (x) 3 tall (y)
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) {
      world.setBlock(px + dx, baseY + dy, pz, B.NETHER_PORTAL);
    }
    world.setBlock(px - 1, baseY - 1 + 1, pz, B.OBSIDIAN); world.setBlock(px + 2, baseY, pz, B.OBSIDIAN);
    for (let dx = -1; dx <= 2; dx++) {
      world.setBlock(px + dx, baseY - 1 + 3, pz, B.OBSIDIAN);
      world.setBlock(px + dx, baseY - 1, pz, B.OBSIDIAN);
    }
    for (let dy = 0; dy < 3; dy++) {
      world.setBlock(px - 1, baseY + dy, pz, B.OBSIDIAN);
      world.setBlock(px + 2, baseY + dy, pz, B.OBSIDIAN);
    }
    player.pos.set(px + 0.5, baseY, pz + 1.5);
  }
  player.vel.set(0, 0, 0);
  chat.add({ text: inNether ? 'You return to the Overworld.' : 'You enter the Nether…', system: true });
  sfx.flyWhoosh();
}
const worldtickLater = []; // crop ids to register once worldtick exists
const keys = new Set();
const actions = new Set();

// title panorama world
let panWorld = null, panCm = null, panT = 0;

// ---------- prefs ----------

const prefs = loadPrefs();
myName = prefs.name || ('Wanderer' + Math.floor(1000 + Math.random() * 9000));
myColor = prefs.color || freshColor();
savePrefs({ name: myName, color: myColor });

function freshColor() {
  const c = new THREE.Color().setHSL(Math.random(), 0.62, 0.55);
  return '#' + c.getHexString();
}

// ---------- UI + chat + hud ----------

ui = new UI({
  onCreate: ({ mode, seed }) => startHost(null, { mode, seed }),
  onJoin: (code) => startClient(code),
  onResumeHost: (code) => startHost(code),
  onCancelConnect: () => cancelConnect(),
  onChatSubmit: (text) => {
    if (text.startsWith('/')) {
      net?.sendCommand(text);
    } else {
      net?.sendChat(text, myName, myColor);
    }
  },
  onCommandComplete: (text) => {
    if (text.startsWith('/') && !text.includes(' ')) {
      const sugg = commandSuggestions(text);
      if (sugg.length === 1) return sugg[0] + ' ';
      if (sugg.length > 1) {
        // common prefix
        let p = sugg[0];
        for (const s of sugg) while (!s.startsWith(p)) p = p.slice(0, -1);
        return p;
      }
      return null;
    }
    // complete player names
    const words = text.split(' ');
    const last = words[words.length - 1].toLowerCase();
    if (last) {
      for (const p of net ? net.roster() : []) {
        if (p.name.toLowerCase().startsWith(last)) {
          words[words.length - 1] = p.name;
          return words.join(' ');
        }
      }
    }
    return null;
  },
  onPauseResume: () => requestLock(),
  onQuit: () => quitToMenu(true),
  onDeathRespawn: () => respawn(),
  onDeathTitle: () => { ui.hideDeath(); quitToMenu(true); },
  onOptionsBack: () => {
    ui.hideOptions();
    if (ui.optionsFrom === 'pause' && state === 'playing') ui.showPause(pauseMeta());
    // from title: nothing else to do
  },
  onSettingsChange: (key) => applySettings(key),
  onScreenClose: (mode, posKey, container) => {
    // sync containers back
    if (posKey && container && (mode === 'chest' || mode === 'furnace')) {
      const data = container.type === 'chest' ? container.slots : { in: container.in, fuel: container.fuel, out: container.out };
      if (net?.mode === 'host') net.hostCstate(posKey, data);
      else if (net?.mode === 'client') net.sendCstate(posKey, data);
    }
    requestLock();
  },
  onInventoryChange: () => {
    hand.setHeld(inventory.held());
    hud.updateHotbar(inventory, inventory.selected);
  },
  onTossCursor: (stack) => {
    if (!player || stats?.dead) return;
    const dir = player.lookVector(new THREE.Vector3());
    if (net?.mode === 'host' || !net) {
      drops.spawn(stack, player.pos.x + dir.x, player.pos.y + 1.4, player.pos.z + dir.z, new THREE.Vector3(dir.x * 4, 2, dir.z * 4));
    } else {
      net.clientSend({ t: 'drop', id: stack.id, count: stack.count, dur: stack.dur });
    }
  },
});

chat = new Chat({
  logEl: document.getElementById('chat'),
  inputWrap: document.getElementById('chat-input-wrap'),
  inputEl: document.getElementById('chat-input'),
  onSubmit: (text) => {
    if (text.startsWith('/')) net?.sendCommand(text);
    else net?.sendChat(text, myName, myColor);
  },
  onCommandComplete: null,
});
// wire the same completion helper into chat
chat.onCommandComplete = (text) => ui.cb.onCommandComplete(text);

hud = new Hud();
hud.onSlotClick = (i) => { inventory.select(i); hud.updateHotbar(inventory, inventory.selected); hud.flashHeldName(inventory.held()); hand.setHeld(inventory.held()); };

ui.showTitle(); // render splash + saved worlds on first load

function pauseMeta() {
  if (!net) return '';
  const online = Math.max(1, net.players.size); // yourself included
  return `Room ${net.code} · ${myGamemode} · ${online} online`;
}

// ---------- title panorama ----------

function startPanorama() {
  panWorld = new World('panorama' + Math.floor(Math.random() * 99999));
  panCm = new ChunkManager(panWorld, scene, null);
  panCm.setRadius(2);
  const s = panWorld.spawnPoint();
  panCm._panCenter = [s.x, s.z];
  panT = 0;
}

function stopPanorama() {
  if (panCm) { panCm.dispose(); panCm = null; }
  panWorld = null;
}

// ---------- flows ----------

function startHost(resumeCode, opts = {}) {
  myName = prefs.name || myName;
  myColor = prefs.color || myColor;

  const code = resumeCode ?? makeRoomCode();
  const saved = resumeCode ? loadWorld(resumeCode) : null;
  const mode = saved?.mode ?? opts.mode ?? 'survival';
  const seed = saved?.seed ?? (opts.seed && opts.seed.length ? opts.seed : 'w' + Math.random().toString(36).slice(2, 10));

  world = new World(seed);
  world.gamemode = mode;
  world.difficulty = saved?.difficulty ?? 'normal';
  if (saved?.edits) world.loadEdits(saved.edits);
  if (saved?.edits) {
    for (const [k, id] of world.edits) {
      const [x, y, z] = k.split(',').map(Number);
      worldtickLater.push([x, y, z, id]);
    }
  }
  if (saved?.containers) world.loadContainers(saved.containers);
  myGamemode = mode;

  setupGame();

  state = 'connecting';
  ui.showConnecting('Starting room ' + code + '…');

  net = new Net(netHandlers());
  net.hostWorld(code, {
    seed,
    edits: world.editsArray(),
    time: saved?.time ?? 0.30,
    gamemode: mode,
    difficulty: world.difficulty,
    spawn: world.spawnPoint(),
    containers: world.serializeContainers(),
  }, myName, myColor);
}

function startClient(code) {
  if (!code || code.length < 4) { ui.menuError('Enter the 5-letter room code first.'); return; }
  myName = prefs.name || myName;
  myColor = prefs.color || myColor;

  state = 'connecting';
  ui.menuError('');
  ui.showConnecting('Looking for room ' + code + '…');

  net = new Net(netHandlers());
  net.joinWorld(code, myName, myColor);
}

function setupGame() {
  stopPanorama();
  player = new Player(world);
  player.gamemodeOverride = myGamemode;
  player.autoJump = settings.get('autoJump');
  lighting = new Lighting(world);
  cm = new ChunkManager(world, scene, lighting);
  sky = new Sky(scene, camera);
  avatars = new Avatars(scene);
  mobs = new Mobs(scene, world, lighting);
  mobs.isHost = net === null || net.mode === 'host';
  mobs.difficulty = world.difficulty;
  mobs.onPlayerDamage = onMobAttackPlayer;
  mobs.onMobDeath = (m, dropStacks) => {
    for (const s of dropStacks) drops.spawn(s, m.pos.x, m.pos.y + 0.5, m.pos.z);
  };
  drops = new Drops(scene, world);
  drops.isHost = mobs.isHost;
  particles = new Particles(scene);
  weather = new Weather(scene, world, sky);
  weather.isHost = mobs.isHost;
  weather.enabled = settings.get('weather');
  particles.setVisible(settings.get('particles'));
  waterSim = new WaterSim(world);
  waterSim.isHost = mobs.isHost;
  for (const [x, y, z, id] of worldtickLater) worldtick.notifyBlock(x, y, z, id);
  worldtickLater.length = 0;
  waterSim.onEdit = (x, y, z, id) => { if (net?.mode === 'host') net.hostEdit(x, y, z, id); };
  worldtick = new WorldTick(world);
  worldtick.isHost = mobs.isHost;
  worldtick.onEdit = (x, y, z, id) => { if (net?.mode === 'host') net.hostEdit(x, y, z, id); };
  world.onBlockChanged2 = (x, y, z, id) => worldtick?.notifyBlock(x, y, z, id);
  hand = new HandView(camera);
  inventory = new Inventory();
  ui.setPlayerInv(inventory);
  stats = new Stats(world);
  stats.player = player;
  stats.onDeath = onDeath;
  stats.onDamage = () => { sfx.hurt(); flashHurt(); hurtTilt = (Math.random() < 0.5 ? -1 : 1) * 0.1; };
  player.onLand = (fall) => stats.fallDamage(fall);

  cm.setRadius(settings.get('renderDist'));
  cm.setFancy(settings.get('fancy'));
  sky.setRenderDistance(settings.get('renderDist') * CHUNK);
  sky.setCloudsVisible(settings.get('clouds'));
  document.getElementById('vignette').classList.toggle('hidden', !settings.get('vignette'));
  camera.fov = settings.get('fov');
  camera.updateProjectionMatrix();

  // debug/testing handle
  window.__game = {
    get player() { return player; }, get world() { return world; }, get ui() { return ui; },
    get net() { return net; }, get sky() { return sky; }, get inventory() { return inventory; },
    get stats() { return stats; }, get mobs() { return mobs; }, get drops() { return drops; },
    get lighting() { return lighting; }, get cm() { return cm; }, get scene() { return scene; }, get particles() { return particles; }, get weather() { return weather; }, get waterSim() { return waterSim; }, get worldtick() { return worldtick; }, teleportDimension, tryLightPortalAt: (x, y, z) => tryLightPortal({ px: x, py: y, pz: z, id: B.OBSIDIAN, hit: true }),
  };
  window.__testAction = (btn) => doAction(btn);
  window.__testGive = (id, count) => { inventory.add({ id, count }); hud.updateHotbar(inventory, inventory.selected); };
}

function enterGame(saved) {
  if (saved?.pos && saved.pos.length === 3 && saved.pos.every((v) => typeof v === 'number' && isFinite(v))) {
    player.pos.set(saved.pos[0], saved.pos[1], saved.pos[2]);
    if (typeof saved.yaw === 'number') player.yaw = saved.yaw;
  }
  if (saved?.bedSpawn) player.bedSpawn = saved.bedSpawn;
  if (saved?.inv) inventory.load(saved.inv);
  if (saved?.stats) {
    stats.hp = saved.stats.hp ?? 20;
    stats.hunger = saved.stats.hunger ?? 20;
    stats.air = saved.stats.air ?? 10;
  }

  cm.buildChunk(Math.floor(player.pos.x / CHUNK), Math.floor(player.pos.z / CHUNK));

  // clear any roll/lookAt residue from the title panorama
  camera.rotation.set(0, 0, 0);
  camera.rotation.order = 'YXZ';

  state = 'playing';
  ui.showHud();
  ui.setRoom(net.code, net.mode);
  ui.setHint(true);
  if (myGamemode === 'creative' && !saved) {
    for (const id of [B.GRASS, B.STONE, B.OAK_PLANKS, B.OAK_LOG, B.GLASS, B.TORCH, B.BRICKS, B.WOOL_RED, B.GLOWSTONE]) {
      inventory.add({ id, count: 64 });
    }
  }
  hud.updateHotbar(inventory, inventory.selected);
  hand.setHeld(inventory.held());
  chat.add({ text: 'Welcome to Terravale! Punch a tree to get started.', system: true });
  chat.add({ text: 'T chat · E inventory · /help commands · share the room code to play together.', system: true });
}

function cancelConnect() {
  net?.destroy();
  net = null;
  teardownGame();
  state = 'menu';
  ui.showTitle();
  startPanoramaSoon();
}

function quitToMenu(save) {
  if (save && net?.mode === 'host' && world) hostSave(true);
  net?.destroy();
  net = null;
  teardownGame();
  state = 'menu';
  ui.showTitle();
  ui.hideDeath();
  startPanoramaSoon();
}

let panoramaTimer = null;
function startPanoramaSoon() {
  clearTimeout(panoramaTimer);
  panoramaTimer = setTimeout(() => { if (state === 'menu') startPanorama(); }, 400);
}

function teardownGame() {
  if (cm) { cm.dispose(); cm = null; }
  if (avatars) { avatars.clear(); avatars = null; }
  if (mobs) { mobs.clear(); mobs = null; }
  if (drops) { drops.clear(); drops = null; }
  if (particles) { particles = null; }
  if (weather) { sfx.stopRain(); weather = null; }
  waterSim = null; worldtick = null;
  highlight.visible = false;
  crackMesh.visible = false;
  keys.clear();
  holdBtn = null;
  deathDropped = false;
  document.exitPointerLock?.();
}

// ---------- network handlers ----------

function netHandlers() {
  return {
    onStatus: (s) => ui.setConnectStatus(s),

    onWorldSnapshot: () => ({
      seed: world.seed,
      edits: world.editsArray(),
      time: sky.getTime(),
      gamemode: world.gamemode,
      difficulty: world.difficulty,
      spawn: world.spawnPoint(),
      containers: world.serializeContainers(),
    }),

    onReady: (code) => {
      const saved = loadWorld(code);
      enterGame(saved);
      chat.add({ text: 'Room ' + code + ' is live. You are the host.', system: true });
      sfx.joinChime();
    },

    onInit: (msg) => {
      world = new World(msg.seed);
      world.gamemode = msg.gamemode;
      world.difficulty = msg.difficulty ?? 'normal';
      world.loadEdits(serializeEdits(msg.edits));
      world.loadContainers(msg.containers);
      myGamemode = msg.gamemode;
      setupGame();
      sky.setTime(msg.time);
      enterGame(null);
      // register the whole roster (host + other clients) locally too
      for (const p of msg.players) {
        net.players.set(p.id, { name: p.name, color: p.color, conn: null, pos: null });
        avatars.add(p.id, p.name, p.color, null);
      }
      ui.updatePlayerList([...net.roster(), { id: net.myId, name: myName, color: myColor }], net.myId);
      chat.add({ text: 'Joined room ' + net.code + '.', system: true });
      sfx.joinChime();
    },

    onJoin: (id, name, color) => {
      avatars.add(id, name, color, null);
      chat.add({ text: name + ' joined the world.', system: true });
      sfx.joinChime();
      ui.updatePlayerList([...net.roster(), { id: net.myId, name: myName, color: myColor }], net.myId);
    },

    onLeave: (id, name) => {
      avatars.remove(id);
      chat.add({ text: (name ?? 'Someone') + ' left.', system: true });
      sfx.leaveChime();
      ui.updatePlayerList([...net.roster(), { id: net.myId, name: myName, color: myColor }], net.myId);
    },

    onPos: (id, s) => avatars.setState(id, s),

    onEdit: (id, x, y, z, b) => {
      const prev = world.getBlock(x, y, z);
      world.setBlock(x, y, z, b);
      if (net.mode === 'host' && b === B.AIR && prev !== B.AIR && myGamemode !== 'creative') {
        // host spawns drops on behalf of remote breakers
        for (const st of dropsFor(prev)) drops.spawn(st, x + 0.5, y + 0.3, z + 0.5);
      }
      if (net.mode === 'host') { waterSim?.scheduleAround(x, y, z); worldtick?.scheduleFallCheck(x, y, z); }
      if (net.mode === 'host' && b === B.AIR) world.removeContainer(x, y, z);
      if (player) {
        const d = Math.hypot(x - player.pos.x, y - player.pos.y, z - player.pos.z);
        if (d < 24) sfx.place((BLOCKS[b] ?? BLOCKS[1]).sound);
      }
    },

    onChat: (uid, id, name, color, text) => {
      chat.add({ uid, name, color, text });
      if (id !== net.myId) sfx.chatPing();
    },

    onTime: (t) => sky?.setTime(t),
    onMobs: (s, a) => { mobs?.applyStates(s); mobs?.applyArrowStates(a); },
    onDrops: (s) => drops?.applyStates(s),

    onDamage: (dmg, kx, kz, cause) => {
      if (!stats || stats.dead) return;
      stats.damage(dmg, cause ?? 'a gloomer');
      if (kx || kz) {
        player.vel.x += kx * 7;
        player.vel.z += kz * 7;
        player.vel.y = Math.max(player.vel.y, 4.5);
      }
    },

    onGive: (id, count) => {
      if (id === -1) {
        inventory.clear();
      } else {
        inventory.add({ id, count });
        sfx.pop();
      }
      hud.updateHotbar(inventory, inventory.selected);
      hand.setHeld(inventory.held());
    },

    onTp: (x, y, z) => {
      player.pos.set(x, y, z);
      player.vel.set(0, 0, 0);
    },

    onGamemode: (mode) => {
      setGamemodeLocal(mode);
      chat.add({ text: 'Game mode set to ' + mode, system: true });
    },

    onCmdout: (text) => chat.add({ text, system: true }),

    onContainerState: (k, data) => {
      const c = world.containers.get(k);
      if (!c) return;
      if (c.type === 'chest') c.slots = data;
      else {
        // keep authoritative burn/cook timers; take the item slots
        c.in = data.in; c.fuel = data.fuel; c.out = data.out;
      }
      if (ui.isScreenOpen() && ui.screenPos === k) ui.renderScreen();
    },

    onDifficulty: (d) => {
      world.difficulty = d;
      mobs.difficulty = d;
    },

    onWeather: (s) => {
      weather?.setState(s);
    },

    onPickupRequest: (connId, dropId) => {
      // host validates loosely and grants
      const e = drops.map.get(dropId);
      if (!e) return;
      const p = net.players.get(connId);
      if (p?.pos) {
        const d = Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y, p.pos.z - e.pos.z);
        if (d > 4) return;
      }
      drops.remove(dropId);
      net.hostGive(connId, e.stack);
    },

    onMobHit: (connId, mobId, dmg, kx, kz) => {
      applyMobHit(mobId, dmg, kx, kz, connId);
    },

    onSleep: (connId, bedKey) => {
      // validate: night and no hostiles near that player, then skip night
      const p = net.players.get(connId);
      if (!p?.pos) return;
      if (sky.getDayFactor() > 0.5) return;
      for (const m of mobs.mobs.values()) {
        if (MOB_TYPES[m.type]?.hostile && m.pos.distanceTo(new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z)) < 10) return;
      }
      sky.setTime(0.27);
      net.hostTime(0.27);
    },

    onPlayerArrow: (connId, msg) => {
      mobs.spawnPlayerArrow(new THREE.Vector3(msg.x, msg.y, msg.z), new THREE.Vector3(msg.vx, msg.vy, msg.vz), msg.dmg, connId);
    },

    onDrop: (connId, itemId, count, dur) => {
      // host spawns a dropped item at that player's position
      const p = net.players.get(connId);
      if (!p?.pos) return;
      const st = { id: itemId, count };
      if (dur !== undefined) st.dur = dur;
      drops.spawn(st, p.pos.x, p.pos.y + 1.4, p.pos.z);
    },

    onCommand: (senderId, text) => {
      runCommand(text, commandCtx(senderId));
    },

    onError: (msg) => {
      net?.destroy();
      net = null;
      teardownGame();
      state = 'menu';
      ui.showTitle();
      ui.menuError(msg);
      startPanoramaSoon();
    },

    onHostGone: () => {
      chat.add({ text: 'The host left — the world went with them.', system: true });
      setTimeout(() => quitToMenu(false), 2500);
    },
  };
}

function serializeEdits(arr) {
  return (arr || []).map(([x, y, z, id]) => `${x},${y},${z}:${id}`).join(';');
}

function commandCtx(senderId) {
  return {
    world,
    sky,
    senderId,
    reply: (t) => {
      if (senderId === 0 || senderId === net.myId) chat.add({ text: t.startsWith('§') ? t.slice(1) : t, system: true });
      else net.hostCmdout(senderId, t.startsWith('§') ? t.slice(1) : t);
    },
    broadcast: (t) => net.broadcast({ t: 'chat', uid: net.chatUid++, id: -1, name: '', color: '#ffd27d', text: t }),
    findPlayer: (name) => {
      const q = name.toLowerCase();
      for (const [id, p] of net.players) if (p.name.toLowerCase() === q) return { id, name: p.name, pos: p.pos };
      return null;
    },
    setGamemode: (id, mode) => {
      if (id === 0) setGamemodeLocal(mode);
      else net.hostGamemode(id, mode);
    },
    give: (id, st) => {
      if (id === 0) { inventory.add(st); hud.updateHotbar(inventory, inventory.selected); }
      else net.hostGive(id, st);
    },
    clearInventory: (id) => {
      if (id === 0) { inventory.clear(); hud.updateHotbar(inventory, inventory.selected); }
      else net.hostGive(id, { id: -1, count: 0 }); // -1 = clear signal
    },
    teleport: (id, x, y, z) => {
      if (id === 0) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); }
      else net.hostTp(id, x, y, z);
    },
    kill: (id) => {
      if (id === 0) stats.damage(999, 'a command');
      else net.hostDamage(id, 999, 0, 0, 'a command');
    },
    setTime: (t) => {
      sky.setTime(t);
      net.hostTime(t);
    },
    setDifficulty: (d) => {
      world.difficulty = d;
      mobs.difficulty = d;
      net.hostDifficulty(d);
    },
  };
}

function setGamemodeLocal(mode) {
  myGamemode = mode;
  player.gamemodeOverride = mode;
  if (mode === 'survival') player.fly = false;
  hud._lastStatsKey = '';
  hud._lastHotbarKey = '';
}

// ---------- survival gameplay helpers ----------

function onMobAttackPlayer(playerId, dmg, kx, kz, cause = 'a gloomer') {
  if (playerId === 0 || playerId === net.myId) {
    if (!stats || stats.dead) return;
    stats.damage(dmg, cause);
    player.vel.x += kx * 7;
    player.vel.z += kz * 7;
    player.vel.y = Math.max(player.vel.y, 4.5);
  } else {
    net.hostDamage(playerId, dmg, kx, kz, 'a gloomer');
  }
}

function applyMobHit(mobId, dmg, kx, kz, sourceId) {
  const m = mobs.mobs.get(mobId);
  const pos = m ? m.pos.clone() : null;
  const res = mobs.hit(mobId, dmg, kx, kz, sourceId);
  if (!res) return;
  sfx.mobHurt();
  if (res.died && pos) {
    sfx.mobDeath();
    for (const st of res.drops) drops.spawn(st, pos.x, pos.y + 0.5, pos.z);
    particles?.burst(pos.x, pos.y + 0.6, pos.z, ['#c4c4c4', '#9a9a9a', '#e8e8e8'], 20, 2.4);
  }
}

function flashHurt() {
  const el = document.getElementById('hurt-overlay');
  el.style.opacity = 1;
  setTimeout(() => (el.style.opacity = 0), 120);
}

function onDeath(cause) {
  sfx.death();
  document.exitPointerLock?.();
  // scatter the inventory as drops
  if (!deathDropped) {
    deathDropped = true;
    if (myGamemode !== 'creative') {
      for (const s of inventory.slots) {
        if (!s) continue;
        if (drops.isHost) drops.spawn(s, player.pos.x, player.pos.y + 1, player.pos.z);
      }
    }
    inventory.clear();
  }
  ui.showDeath(cause);
}

function respawn() {
  stats.reset();
  deathDropped = false;
  player.spawn(player.bedSpawn ? { x: player.bedSpawn[0], y: player.bedSpawn[1], z: player.bedSpawn[2] } : null);
  ui.hideDeath();
  requestLock();
}

// ---------- block actions ----------

function doAction(btn) {
  if (!player || !ui || stats?.dead) return;

  const eye = player.eyePosition(new THREE.Vector3());
  const dir = player.lookVector(new THREE.Vector3());

  // attack first: mobs in reach before blocks
  if (btn === 0 && tryAttack(eye, dir)) return;

  // feed wheat to passive mobs (breeding)
  const held0 = inventory.held();
  if (held0 && held0.id === I.WHEAT) {
    const mobHit = entityRaycast(eye, dir, mobs.mobs, 3.4);
    if (mobHit && !MOB_TYPES[mobHit.mob.type]?.hostile) {
      const res = mobs.feedNearest(mobHit.mob.pos);
      if (res?.fed) {
        inventory.consumeHeldOne();
        hud.updateHotbar(inventory, inventory.selected);
        if (res.bred) particles?.burst(mobHit.mob.pos.x, mobHit.mob.pos.y + 1, mobHit.mob.pos.z, ['#ff6b9d', '#ff9ec4'], 14, 1.6);
        return;
      }
    }
  }

  const hit = player.raycast();
  if (!hit.hit) {
    if (btn === 0) hand.swing();
    return;
  }

  if (btn === 0) {
    // creative: instant break
    doBreak(hit);
    return;
  }

  // right click: eat / interact / place
  const held = inventory.held();
  const targetBlock = BLOCKS[hit.id];

  if (held && isFood(held.id) && stats.hunger < 20) {
    const ate = stats.tryEat(held);
    if (ate) {
      inventory.consumeHeldOne();
      sfx.eat();
      hud.updateHotbar(inventory, inventory.selected);
      hand.setHeld(inventory.held());
      return;
    }
  }

  if (targetBlock?.interact === 'bed') {
    trySleep(hit);
    return;
  }
  if (targetBlock?.interact) {
    const c = world.ensureContainer(hit.x, hit.y, hit.z, targetBlock.interact);
    expectUnlock = true;
    document.exitPointerLock();
    ui.openScreen(targetBlock.interact, c, hit.x + ',' + hit.y + ',' + hit.z);
    sfx.place('wood');
    return;
  }

  // bucket: scoop a water source
  if (held && held.id === I.BUCKET && isWaterId(hit.id) && waterLevel(hit.id) === 0) {
    world.setBlock(hit.x, hit.y, hit.z, B.AIR);
    net?.sendEdit(hit.x, hit.y, hit.z, B.AIR);
    inventory.slots[inventory.selected] = { id: I.WATER_BUCKET, count: 1 };
    sfx.splash();
    hud.updateHotbar(inventory, inventory.selected);
    return;
  }
  // water bucket: place a source
  if (held && held.id === I.WATER_BUCKET) {
    let tx = hit.px, ty = hit.py, tz = hit.pz;
    if (isCross(hit.id)) { tx = hit.x; ty = hit.y; tz = hit.z; }
    if (!isReplaceable(world.getBlock(tx, ty, tz))) return;
    world.setBlock(tx, ty, tz, B.WATER);
    net?.sendEdit(tx, ty, tz, B.WATER);
    inventory.slots[inventory.selected] = { id: I.BUCKET, count: 1 };
    sfx.splash();
    hud.updateHotbar(inventory, inventory.selected);
    hand.setHeld(inventory.held());
    return;
  }
  // hoe: till grass/dirt with air above
  if (held && ITEMS[held.id]?.tool?.cls === 'hoe' && (hit.id === B.GRASS || hit.id === B.DIRT) && world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
    world.setBlock(hit.x, hit.y, hit.z, B.FARMLAND);
    net?.sendEdit(hit.x, hit.y, hit.z, B.FARMLAND);
    sfx.place('gravel');
    hand.swing();
    if (inventory.damageHeldTool()) sfx.toolBreak();
    hud.updateHotbar(inventory, inventory.selected);
    return;
  }
  // seeds: plant on farmland
  if (held && held.id === I.SEEDS && hit.id === B.FARMLAND && world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
    world.setBlock(hit.x, hit.y + 1, hit.z, B.WHEAT_0);
    net?.sendEdit(hit.x, hit.y + 1, hit.z, B.WHEAT_0);
    inventory.consumeHeldOne();
    sfx.place('leaves');
    hud.updateHotbar(inventory, inventory.selected);
    hand.setHeld(inventory.held());
    return;
  }
  // flint & steel: light a nether portal on obsidian
  if (held && held.id === I.FLINT_AND_STEEL && hit.id === B.OBSIDIAN) {
    const lit = tryLightPortal(hit);
    if (lit) {
      sfx.place('glass');
      if (inventory.damageHeldTool()) sfx.toolBreak();
    } else {
      chat.add({ text: 'Build a 2×3 obsidian frame first.', system: true });
    }
    return;
  }

  // bow: ignore here (charging handled on mousedown/up)
  if (held && held.id === I.BOW) {
    return; // bow handled by hold-to-charge
  }

  if (!held || !isBlockItem(held.id)) { hand.swing(); return; }
  let tx = hit.px, ty = hit.py, tz = hit.pz;
  if (isCross(hit.id)) { tx = hit.x; ty = hit.y; tz = hit.z; }
  if (!isReplaceable(world.getBlock(tx, ty, tz))) return;
  if (player.intersectsBlock(tx, ty, tz)) return;
  // torches need something under them
  if (held.id === B.TORCH && !BLOCKS[world.getBlock(tx, ty - 1, tz)]?.solid) return;

  world.setBlock(tx, ty, tz, held.id);
  net?.sendEdit(tx, ty, tz, held.id);
  worldSimAfter(tx, ty, tz);
  sfx.place(BLOCKS[held.id].sound);
  hand.swing();
  particles?.burst(tx + 0.5, ty + 1.05, tz + 0.5, tileColors(held.id), 6, 1.2);
  if (myGamemode === 'survival') {
    inventory.consumeHeldOne();
    hud.updateHotbar(inventory, inventory.selected);
    hand.setHeld(inventory.held());
  }
}

// validate a 2x3 interior nether portal frame touching the given air cell;
// returns the interior cells to fill, or null
function checkPortalFrame(ax, ay, az) {
  const world_ = world;
  const isObs = (x, y, z) => world_.getBlock(x, y, z) === B.OBSIDIAN;
  const isAir = (x, y, z) => world_.getBlock(x, y, z) === B.AIR;
  for (const plane of ['x', 'z']) {
    for (let oy = -2; oy <= 0; oy++) {
      for (let ox = -1; ox <= 0; ox++) {
        const oz = plane === 'x' ? 0 : ox; ox = plane === 'x' ? ox : 0;
        // interior origin (bottom-left)
        const bx = ax + (plane === 'x' ? ox : 0);
        const by = ay + oy;
        const bz = az + (plane === 'z' ? ox : 0);
        let ok = true;
        const cells = [];
        for (let w = 0; w < 2 && ok; w++) {
          for (let h = 0; h < 3 && ok; h++) {
            const cx = bx + (plane === 'x' ? w : 0);
            const cz = bz + (plane === 'z' ? w : 0);
            if (!isAir(cx, by + h, cz)) ok = false;
            cells.push([cx, by + h, cz]);
          }
        }
        if (!ok) continue;
        // ring check: bottom, top, left, right all obsidian
        for (let w = 0; w < 2 && ok; w++) {
          const wx = bx + (plane === 'x' ? w : 0);
          const wz = bz + (plane === 'z' ? w : 0);
          if (!isObs(wx, by - 1, wz)) ok = false;
          if (!isObs(wx, by + 3, wz)) ok = false;
        }
        for (let h = 0; h < 3 && ok; h++) {
          if (plane === 'x') {
            if (!isObs(bx - 1, by + h, bz)) ok = false;
            if (!isObs(bx + 2, by + h, bz)) ok = false;
          } else {
            if (!isObs(bx, by + h, bz - 1)) ok = false;
            if (!isObs(bx, by + h, bz + 2)) ok = false;
          }
        }
        if (ok) return cells;
      }
    }
  }
  return null;
}

function tryLightPortal(hit) {
  // the clicked face's adjacent cell is where portal air would be
  const ax = hit.px, ay = hit.py, az = hit.pz;
  const cells = checkPortalFrame(ax, ay, az);
  if (!cells) return false;
  for (const [x, y, z] of cells) {
    world.setBlock(x, y, z, B.NETHER_PORTAL);
    net?.sendEdit(x, y, z, B.NETHER_PORTAL);
  }
  return true;
}

function trySleep(hit) {
  const bedKey = hit.x + ',' + hit.y + ',' + hit.z;
  const sleep = () => {
    player.bedSpawn = [hit.x + 0.5, hit.y + 1.2, hit.z + 0.5];
    sky.setTime(0.27);
    if (net?.mode === 'host') net.hostTime(0.27);
    document.getElementById('sleep-fade').classList.add('active');
    setTimeout(() => document.getElementById('sleep-fade').classList.remove('active'), 1800);
    chat.add({ text: 'You slept. Spawn point set.', system: true });
  };
  if (sky.getDayFactor() > 0.5) {
    chat.add({ text: 'You can only sleep at night.', system: true });
    return;
  }
  // monsters nearby?
  let danger = false;
  for (const m of mobs.mobs.values()) {
    if (MOBS_HOSTILE(m.type) && m.pos.distanceTo(player.pos) < 10) { danger = true; break; }
  }
  if (danger) {
    chat.add({ text: 'You may not rest now — there are monsters nearby.', system: true });
    return;
  }
  if (net?.mode === 'client') {
    net.clientSend({ t: 'sleep', k: bedKey });
    // optimistic: host will broadcast time
    player.bedSpawn = [hit.x + 0.5, hit.y + 1.2, hit.z + 0.5];
  } else {
    sleep();
  }
}

// one swing at a nearby mob; returns true if something was hit
function tryAttack(eye, dir) {
  if (attackCd > 0) return false;
  const mobHit = entityRaycast(eye, dir, mobs.mobs, 3.6);
  if (!mobHit) return false;
  const blockHit = player.raycast();
  if (blockHit.hit && blockHit.dist < mobHit.dist) return false;

  attackCd = 0.5;
  hand.swing();
  sfx.swing();
  const held = inventory.held();
  const dmg = held && ITEMS[held.id]?.damage ? ITEMS[held.id].damage : 1;
  const kx = dir.x, kz = dir.z;
  if (net.mode === 'host') {
    applyMobHit(mobHit.id, dmg, kx, kz, net.myId);
  } else {
    net.sendMobHit(mobHit.id, dmg, kx, kz);
    sfx.mobHurt();
  }
  if (held && ITEMS[held.id]?.tool && inventory.damageHeldTool()) sfx.toolBreak();
  return true;
}

// after any block edit: reschedule water + gravity checks (host only sims)
  function worldSimAfter(x, y, z) {
    waterSim?.scheduleAround(x, y, z);
    worldtick?.scheduleFallCheck(x, y, z);
  }

function fireArrow(charge) {
  if (!player || stats?.dead) return;
  inventory.removeId(I.ARROW, 1);
  hud.updateHotbar(inventory, inventory.selected);
  const eye = player.eyePosition(new THREE.Vector3());
  const dir = player.lookVector(new THREE.Vector3());
  const speed = 12 + charge * 22;
  const vel = dir.clone().multiplyScalar(speed);
  sfx.bow();
  hand.swing();
  if (net?.mode === 'host') {
    mobs.spawnPlayerArrow(eye, vel, charge);
  } else {
    net.clientSend({ t: 'playerArrow', x: eye.x, y: eye.y, z: eye.z, vx: vel.x, vy: vel.y, vz: vel.z, dmg: Math.round(2 + charge * 5) });
  }
}

function doBreak(hit) {
  const bl = BLOCKS[hit.id];
  if (!bl?.breakable) {
    sfx.tone(120, 'square', 0.06, 0.2);
    return;
  }
  const held = inventory.held();
  const creative = myGamemode === 'creative';

  world.setBlock(hit.x, hit.y, hit.z, B.AIR);
  net?.sendEdit(hit.x, hit.y, hit.z, B.AIR);
  world.removeContainer(hit.x, hit.y, hit.z);
  worldSimAfter(hit.x, hit.y, hit.z);
  sfx.break_(bl.sound);
  hand.swing();
  particles?.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, tileColors(hit.id), 18, 3);

  if (!creative) {
    // drops (host spawns for everyone)
    if (drops.isHost) {
      if (canHarvest(held, hit.id)) {
        for (const st of dropsFor(hit.id)) drops.spawn(st, hit.x + 0.5, hit.y + 0.3, hit.z + 0.5);
      }
    }
    if (held && ITEMS[held.id]?.tool && bl.hardness > 0.1) {
      if (inventory.damageHeldTool()) sfx.toolBreak();
    }
  }
  hud.updateHotbar(inventory, inventory.selected);
}

// ---------- input ----------

const canvas = renderer.domElement;

function requestLock() {
  if (state !== 'playing') return;
  ui.hidePause();
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { /* needs a user gesture; hint stays visible */ });
  } catch { /* needs gesture */ }
}

canvas.addEventListener('click', () => {
  sfx.resume();
  if (state === 'playing' && !ui.isScreenOpen() && !chat.isOpen() && document.pointerLockElement !== canvas) {
    requestLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    ui.hidePause();
    ui.setHint(false);
  } else if (state === 'playing') {
    keys.clear();
    holdBtn = null;
    if (expectUnlock) { expectUnlock = false; return; }
    if (!ui.isScreenOpen() && !chat.isOpen()) ui.showPause(pauseMeta());
  }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && player && !chat.isOpen()) {
    player.look(e.movementX, e.movementY, settings.get('sens'), settings.get('invertY'));
  }
});

document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas || state !== 'playing' || chat.isOpen() || stats?.dead) return;
  if (e.button === 0) {
    const eye = player.eyePosition(new THREE.Vector3());
    const dir = player.lookVector(new THREE.Vector3());
    if (!tryAttack(eye, dir)) {
      holdBtn = 0; // survival mining / creative breaking handled in the loop
      if (myGamemode === 'creative') {
        doAction(0);
        nextActionAt = performance.now() + 270;
      }
    }
  } else if (e.button === 2) {
    const held = inventory.held();
    if (held && held.id === I.BOW && inventory.countOf(I.ARROW) > 0) {
      bowCharging = performance.now();
      return;
    }
    holdBtn = 2;
    doAction(2);
    nextActionAt = performance.now() + 270;
  }
});

document.addEventListener('mouseup', (e) => {
  if (bowCharging && e.button === 2) {
    const charge = Math.min(1, (performance.now() - bowCharging) / 1100);
    bowCharging = 0;
    fireArrow(charge);
  }
  holdBtn = null;
  player && (player.mining = null);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('wheel', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  const dir = Math.sign(e.deltaY);
  inventory.select((inventory.selected + dir + 9) % 9);
  hud.updateHotbar(inventory, inventory.selected);
  hud.flashHeldName(inventory.held());
  hand.setHeld(inventory.held());
}, { passive: true });

window.addEventListener('keydown', (e) => {
  // bind capture for options
  if (ui.bindListening) {
    e.preventDefault();
    if (e.code !== 'Escape') {
      settings.setBind(ui.bindListening, e.code);
    }
    ui.stopBindListening();
    ui.renderOptionsTab('controls');
    return;
  }

  if (state !== 'playing' || chat.isOpen()) return;

  // container screen keys
  if (ui.isScreenOpen()) {
    if (e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      ui.closeScreen();
    } else if (e.code.startsWith('Digit')) {
      const n = +e.code.slice(5);
      if (n >= 1 && n <= 9) {
        ui.hoverSwap(n - 1);
        inventory.select(n - 1);
        hand.setHeld(inventory.held());
      }
    }
    return;
  }

  if (bowCharging) { bowCharging = 0; } // opening chat cancels a charged bow

  const action = settings.actionFor(e.code);

  if (e.code === 'KeyT' || action === 'chat') {
    e.preventDefault();
    chat.openInput();
    return;
  }
  if (action === 'inventory') {
    e.preventDefault();
    expectUnlock = true;
    document.exitPointerLock();
    ui.openScreen(myGamemode === 'creative' ? 'creative' : 'inventory');
    return;
  }
  if (action === 'playerList') {
    e.preventDefault();
    ui.showPlayerList(true);
    return;
  }
  if (action === 'debug') {
    e.preventDefault();
    ui.toggleDebug();
    return;
  }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 9) {
      inventory.select(n - 1);
      hud.updateHotbar(inventory, inventory.selected);
      hud.flashHeldName(inventory.held());
      hand.setHeld(inventory.held());
    }
    return;
  }
  if (action === 'drop') {
    dropHeldItem();
    return;
  }
  if (action === 'jump' && document.pointerLockElement === canvas) {
    const flew = player?.onSpace();
    if (flew) sfx.flyWhoosh();
  }
  if (action) keys.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (settings.actionFor(e.code) === 'playerList') ui.showPlayerList(false);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', () => hostSave(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) hostSave(true); });

function dropHeldItem() {
  const s = inventory.held();
  if (!s || stats?.dead) return;
  const one = { id: s.id, count: 1, ...(s.dur !== undefined ? { dur: s.dur } : {}) };
  s.count--;
  if (s.count <= 0) inventory.slots[inventory.selected] = null;
  const dir = player.lookVector(new THREE.Vector3());
  if (net?.mode === 'host') {
    drops.spawn(one, player.pos.x + dir.x, player.pos.y + 1.4, player.pos.z + dir.z, new THREE.Vector3(dir.x * 5, 2.4, dir.z * 5));
  } else {
    net.clientSend({ t: 'drop', id: one.id, count: one.count, dur: one.dur });
  }
  hud.updateHotbar(inventory, inventory.selected);
  hand.setHeld(inventory.held());
}

// ---------- settings live application ----------

function applySettings(key) {
  if (key === 'renderDist' && cm) {
    cm.setRadius(settings.get('renderDist'));
    sky?.setRenderDistance(settings.get('renderDist') * CHUNK);
    cm.lastCenter = null;
  } else if (key === 'fov') {
    camera.fov = settings.get('fov');
    camera.updateProjectionMatrix();
  } else if (key === 'clouds') {
    sky?.setCloudsVisible(settings.get('clouds'));
  } else if (key === 'master' || key === 'sfx') {
    sfx.setVolumes(settings.get('master'), settings.get('sfx'));
  } else if (key === 'autoJump') {
    if (player) player.autoJump = settings.get('autoJump');
  } else if (key === 'fullscreen') {
    if (settings.get('fullscreen')) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } else if (key === 'showFps') {
    ui.toggleDebug(!!settings.get('showFps'));
  } else if (key === 'particles') {
    particles?.setVisible(settings.get('particles'));
  } else if (key === 'weather') {
    if (weather) weather.enabled = settings.get('weather');
  } else if (key === 'fancy') {
    cm?.setFancy(settings.get('fancy'));
  } else if (key === 'vignette') {
    document.getElementById('vignette').classList.toggle('hidden', !settings.get('vignette'));
  }
  // gamma + sens + invertY are read live in the render loop / look()
}

// ---------- saving ----------

function hostSave(force) {
  if (net?.mode !== 'host' || !world || !sky || !player) return;
  saveWorld(net.code, {
    seed: world.seed,
    mode: world.gamemode,
    editsStr: world.serializeEdits(),
    time: sky.getTime(),
    pos: [player.pos.x, player.pos.y, player.pos.z],
    yaw: player.yaw,
    bedSpawn: player.bedSpawn ?? null,
    containers: world.serializeContainers(),
    inv: inventory.serialize(),
    stats: { hp: stats.hp, hunger: stats.hunger, air: stats.air },
  });
}

// ---------- main loop ----------

let lastT = performance.now();
startPanoramaSoon();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;

  frames++;
  if (now - fpsTime > 500) {
    fps = Math.round((frames * 1000) / (now - fpsTime));
    frames = 0;
    fpsTime = now;
  }

  if (state === 'menu' && panCm) {
    // title panorama: slow orbit over the generated world
    scene.background = scene.background ?? new THREE.Color('#78b5e8');
    panT += dt;
    const c = panCm._panCenter ?? [0, 0];
    const cx = c[0], cz = c[1];
    const h = panWorld.worldgen.heightAt(Math.floor(cx), Math.floor(cz));
    const a = panT * 0.06;
    camera.position.set(cx + Math.sin(a) * 34, h + 16, cz + Math.cos(a) * 34);
    camera.lookAt(cx, h + 2, cz);
    panCm.update(cx, cz, 5);
    renderer.render(scene, camera);
    return;
  }

  if (state === 'playing' && player) {
    const locked = document.pointerLockElement === canvas;
    const screenOpen = ui.isScreenOpen();
    const active = locked && !screenOpen && !stats.dead;

    // map keys -> actions
    actions.clear();
    if (active) {
      for (const code of keys) {
        const a = settings.actionFor(code);
        if (a) actions.add(a);
      }
    }

    attackCd = Math.max(0, attackCd - dt);
    placeCd = Math.max(0, placeCd - dt);

    // physics
    let step = dt;
    while (step > 0) {
      const h = Math.min(step, 1 / 60);
      player.update(h, active ? actions : new Set());
      step -= h;
    }

    stats.armorPoints = inventory.armorPoints();
    stats.update(dt, player, actions.size > 0);

    // splash + steps
    if (player.stepAccum > 2.1) {
      player.stepAccum = 0;
      const under = world.getBlock(player.pos.x, player.pos.y - 0.3, player.pos.z);
      if (under !== B.AIR) sfx.step(BLOCKS[under]?.sound ?? 'stone');
    }

    player.applyToCamera(camera);

    // view bob while walking on the ground + sprint FOV kick
    const hSpeed = Math.hypot(player.vel.x, player.vel.z);
    if (player.onGround && hSpeed > 0.5) bobPhase += dt * hSpeed * 1.7;
    const bobAmp = Math.min(hSpeed / 6.8, 1) * 0.05;
    const bobY = Math.abs(Math.sin(bobPhase)) * bobAmp;
    const bobX = Math.sin(bobPhase) * bobAmp * 0.6;
    const bobRoll = Math.sin(bobPhase) * bobAmp * 0.35;
    camera.position.y += bobY - bobAmp * 0.4;
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    camera.position.addScaledVector(right, bobX);
    camera.rotation.z += bobRoll;
    const targetFov = settings.get('fov') * (player.sprinting && hSpeed > 4 ? 1.08 : 1);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, 8 * dt);
      camera.updateProjectionMatrix();
    }
    hurtTilt *= Math.max(0, 1 - 6 * dt);
    camera.rotation.z += hurtTilt;
    // low-health pulse
    document.getElementById('vignette').style.opacity =
      (myGamemode !== 'creative' && stats.hp <= 6 && !stats.dead) ? (0.55 + 0.45 * Math.sin(now / 150)) : 1;

    // targeting + mining
    const hit = player.raycast();
    if (hit.hit && active) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlight.visible = false;
    }

    let crackStage = -1;
    if (holdBtn === 0 && active && hit.hit && myGamemode === 'survival') {
      const res = player.tickMining(dt, hit, inventory.held(), false);
      crackStage = res.stage;
      if (res.completed) {
        doBreak(hit);
        player.mining = null;
        crackStage = -1;
        nextActionAt = now + 270;
      } else if (crackStage >= 0) {
        hitSoundT -= dt;
        if (hitSoundT <= 0) {
          hitSoundT = 0.25;
          sfx.hit(BLOCKS[hit.id]?.sound ?? 'stone');
        }
      }
    } else {
      player.mining = null;
    }
    crackMesh.visible = crackStage >= 0;
    if (crackStage >= 0) {
      crackMesh.material.map = crackTextures[crackStage];
      crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    }

    // held right button repeats place/use (creative break repeats too)
    if (holdBtn !== null && active && now >= nextActionAt) {
      if (holdBtn === 2 || myGamemode === 'creative') {
        doAction(holdBtn);
        nextActionAt = now + 220;
      }
    }
    // world streaming + sky
    cm.update(player.pos.x, player.pos.z, 6);
    const inNether = isNetherX(player.pos.x);
    sky.setNether(inNether);
    sky.update(dt, camera.position, player.headInWater);

    // portal standing → teleport between dimensions
    if (!stats.dead) {
      const head = g0etBlockSafe(world, camera.position);
      const feet = head; // same cell test for simplicity
      if (head === B.NETHER_PORTAL) {
        portalTime += dt;
        if (portalTime > 1.2) {
          portalTime = -3; // cooldown
          teleportDimension();
        }
      } else if (portalTime > 0) portalTime = 0;
      else portalTime = Math.min(0, portalTime + dt);
    }
    TERRAIN_UNIFORMS.uTime.value += dt;
    const gamma = settings.get('gamma');
    cm.setDaylight(sky.dayFactor, gamma, { color: scene.fog.color, near: scene.fog.near, far: scene.fog.far });
    avatars.setBrightness(0.25 + 0.75 * sky.dayFactor);
    mobs.setBrightness(0.25 + 0.75 * sky.dayFactor);
    drops.group.visible = true;
    avatars.setCameraPos(camera.position);
    avatars.update(dt);

    // mobs (host sims; clients animate)
    const hostilesGroan = myGamemode !== 'creative' && !stats.dead;
    if (net?.mode === 'host') {
      const players = [];
      players.push({ id: 0, pos: player.pos, gm: myGamemode, hp: stats.hp });
      for (const [id, p] of net.players) {
        if (id !== 0 && p.pos) players.push({ id, pos: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z), gm: p.pos.gm ?? world.gamemode, hp: p.pos.hp ?? 20 });
      }
      mobs.update(dt, players, sky.dayFactor);
    } else {
      mobs.update(dt, [], sky.dayFactor);
    }

    // ambient gloomer groans near the player
    if (hostilesGroan && Math.random() < dt * 0.15) {
      for (const m of mobs.mobs.values()) {
        if (m.type === 'gloomer' && m.pos.distanceTo(player.pos) < 12) { sfx.groan(); break; }
      }
    }

    // held item + arm respond to local light
    if (hand && lighting) {
      const eye = camera.position;
      const skyL = lighting.getSky(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) / 15;
      const blk = [0, 0, 0];
      lighting.getBlockRGB(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z), blk);
      hand.setLight(Math.max(blk[0], Math.max(blk[1], blk[2])), skyL * sky.dayFactor, sky.dayFactor);
    }

    drops.update(dt);
    drops.interpolate(dt);

    // weather (host simulates, clients mirror state) + ambient rain audio
    if (net?.mode === 'host') {
      weather.update(dt, player, camera.position, () => sfx.thunder());
    } else {
      weather.update(dt, player, camera.position, () => {});
    }
    if (weather.state === 'rain' && weather.enabled && !stats.dead) sfx.startRain();
    else sfx.stopRain();
    particles.update(dt, world);

    // host simulations: flowing water, gravity blocks, random ticks, arrows
    if (net?.mode === 'host') {
      waterSim.tick();
      worldtick.processFallChecks();
      const players = [{ id: 0, pos: player.pos, gm: myGamemode }];
      for (const [id, p] of net.players) {
        if (id !== 0 && p.pos) players.push({ id, pos: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z), gm: p.pos.gm ?? world.gamemode });
      }
      worldtick.growTicks(dt);
      mobs.updateArrows(dt, players, (pid, dmg, kx, kz) => onMobAttackPlayer(pid, dmg, kx, kz, 'a skeleton'));
    } else {
      mobs.updateArrows(dt, [], null);
    }
    hand.update(dt, Math.hypot(player.vel.x, player.vel.z), player.onGround);

    // item pickup
    if (!stats.dead) {
      if (drops.isHost) {
        const near = drops.collect(player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
        for (const g of near) {
          const left = inventory.add(g.stack);
          if (left === 0) {
            drops.remove(g.id);
            sfx.pop();
            hud.updateHotbar(inventory, inventory.selected);
            hand.setHeld(inventory.held());
          } else {
            g.stack.count = left;
          }
        }
      } else {
        for (const e of drops.map.values()) {
          const last = pickupReqT.get(e.id) ?? 0;
          if (now - last < 900) continue;
          if (e.pos.distanceTo(player.pos) < 1.7) {
            pickupReqT.set(e.id, now);
            net.sendPickupReq(e.id);
          }
        }
      }
    }

    // furnaces tick (host)
    if (net?.mode === 'host') {
      for (const [k, c] of world.containers) {
        if (c.type === 'furnace') tickFurnace(c, dt, null);
      }
      if (ui.isScreenOpen() && ui.screenMode === 'furnace' && now - furnaceUiTick > 400) {
        furnaceUiTick = now;
        ui.renderScreen();
      }

      // periodic entity sync — only when changed, drops capped to bound payload
      if (now - lastEntitySync > 300) {
        lastEntitySync = now;
        const ms = mobs.states();
        const arrows = mobs.arrowStates();
        const msStr = JSON.stringify([ms, arrows]);
        if (msStr !== lastMobSync) {
          lastMobSync = msStr;
          net.hostMobs(ms, arrows);
        }
        const allDrops = drops.states();
        const ds = allDrops.length > 80 ? allDrops.slice(0, 80) : allDrops;
        const dsStr = JSON.stringify(ds);
        if (dsStr !== lastDropSync) {
          lastDropSync = dsStr;
          net.hostDrops(ds);
        }
      }
    }

    // HUD
    hud.updateStats(stats, myGamemode, inventory.armorPoints());
    hud.updateHotbar(inventory, inventory.selected);

    // network position sync @10Hz
    if (net && now - lastPosSend > 100) {
      lastPosSend = now;
      net.sendPos(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.pitch, player.fly, stats.hp, myGamemode);
    }

    // host: save every 5s, sync time every 30s
    if (net?.mode === 'host') {
      if (now - lastSaveAt > 5000) { lastSaveAt = now; hostSave(false); }
      if (now - lastTimeSync > 30000) {
        lastTimeSync = now;
        net.hostTime(sky.getTime());
        net.broadcast({ t: 'weather', s: weather.getState() });
      }
    }

    chat.update();

    if (ui.debugVisible) {
      const cx = Math.floor(player.pos.x / CHUNK), cz = Math.floor(player.pos.z / CHUNK);
      const biome = world.worldgen.biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
      const BIOME_NAMES = ['Plains', 'Forest', 'Desert', 'Snowfield', 'Taiga', 'Savanna'];
      const skyL = lighting.getSky(Math.floor(player.pos.x), Math.floor(player.pos.y + 1.6), Math.floor(player.pos.z));
      const bl = lighting.getBlockLight(Math.floor(player.pos.x), Math.floor(player.pos.y + 1.6), Math.floor(player.pos.z));
      ui.setDebug([
        `Terravale ${settings.get('showFps') || ui.debugVisible ? '· ' + fps + ' fps' : ''}`,
        `xyz ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}`,
        `chunk ${cx},${cz} · pending ${cm.pending()} · biome ${BIOME_NAMES[biome] ?? '?'}`,
        `light sky ${skyL} block ${bl} · time ${(sky.getTime() * 24).toFixed(1)}h`,
        `${player.fly ? 'flying' : player.inWater ? 'swimming' : player.onGround ? 'on ground' : 'airborne'} · ${myGamemode}`,
        `mobs ${mobs.count()} · drops ${drops.map.size} · players ${net ? net.players.size : 1}`,
      ]);
    }
  }

  renderer.render(scene, camera);
}

animate();
