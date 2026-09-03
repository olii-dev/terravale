// Voxelheim — main entry. Owns the render loop, input, and the glue
// between world, player, sky, UI, chat, saves and the P2P network.

import * as THREE from 'three';
import { B, BLOCKS, DEFAULT_HOTBAR, isReplaceable, isCross, isSolid } from './blocks.js';
import { buildAtlas, TILE_INDEX } from './textures.js';
import { resolveFaceTiles } from './blocks.js';
import { World, HEIGHT } from './world.js';
import { CHUNK } from './worldgen.js';
import { ChunkManager } from './chunks.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { Sfx } from './sounds.js';
import { UI } from './ui.js';
import { Chat } from './chat.js';
import { Avatars } from './avatars.js';
import { Net, makeRoomCode } from './network.js';
import { saveWorld, loadWorld, savePrefs, loadPrefs } from './save.js';

// ---------- boot ----------

if ('ontouchstart' in window && !window.matchMedia('(pointer: fine)').matches) {
  document.getElementById('mobile-warn').classList.remove('hidden');
}

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.classList.add('game');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 900);

buildAtlas();
resolveFaceTiles(TILE_INDEX);

const sfx = new Sfx();

// block highlight wireframe
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 })
);
highlight.visible = false;
scene.add(highlight);

// ---------- game state ----------

let state = 'menu'; // menu | connecting | playing
let world = null, cm = null, player = null, sky = null, avatars = null, net = null, chat = null, ui = null;
let myName = 'Wanderer', myColor = '#7ddb5a';
let hostCode = null;
let expectUnlock = false;   // pointer unlock we initiated (picker)
let holdBtn = null, nextActionAt = 0;
let lastPosSend = 0, lastSaveAt = 0, lastTimeSync = 0;
let frames = 0, fpsTime = 0, fps = 0;
let wasInWater = false;
const keys = new Set();

// ---------- ui + chat ----------

ui = new UI({
  onCreate: () => startHost(null),
  onJoin: (code) => startClient(code),
  onResumeHost: (code) => startHost(code),
  onCancelConnect: () => cancelConnect(),
  onChatSubmit: (text) => sendChat(text),
  onPauseResume: () => requestLock(),
  onQuit: () => quitToMenu(true),
  onSoundToggle: () => {
    sfx.setMuted(!sfx.muted);
    ui.setSoundLabel(sfx.muted);
  },
  onRenderDistance: (r) => {
    if (cm) { cm.setRadius(r); sky.setRenderDistance(r * CHUNK); cm.lastCenter = null; }
  },
  onPickerPick: (id) => {
    ui.setSlotBlock(ui.selected, id);
    ui.closePicker();
  },
  onPickerVisibility: (open) => {
    if (open) {
      expectUnlock = true;
      document.exitPointerLock();
    } else {
      requestLock();
    }
  },
});

chat = new Chat({
  logEl: document.getElementById('chat'),
  inputWrap: document.getElementById('chat-input-wrap'),
  inputEl: document.getElementById('chat-input'),
  onSubmit: (text) => sendChat(text),
});

const prefs = loadPrefs();
if (prefs.name) document.getElementById('name-input').value = prefs.name;

ui.showMenu();

// ---------- flows ----------

function freshColor() {
  const c = new THREE.Color().setHSL(Math.random(), 0.62, 0.55);
  return '#' + c.getHexString();
}

function startHost(resumeCode) {
  myName = ui.getName();
  myColor = freshColor();
  savePrefs({ name: myName });

  const code = resumeCode ?? makeRoomCode();
  const saved = resumeCode ? loadWorld(resumeCode) : null;
  const seed = saved?.seed ?? 'w' + Math.random().toString(36).slice(2, 10);

  world = new World(seed);
  if (saved?.edits) world.loadEdits(saved.edits);

  setupGameCommon();

  state = 'connecting';
  ui.showConnecting('Starting room ' + code + '…');

  net = new Net(netHandlers());
  net.hostWorld(code, seed, world.editsArray(), saved?.time ?? 0.32, myName, myColor);
  hostCode = code;
}

function startClient(code) {
  if (!code || code.length < 4) { ui.menuError('Enter the 5-letter room code first.'); return; }
  myName = ui.getName();
  myColor = freshColor();
  savePrefs({ name: myName });

  state = 'connecting';
  ui.menuError('');
  ui.showConnecting('Looking for room ' + code + '…');

  net = new Net(netHandlers());
  net.joinWorld(code, myName, myColor);
}

function setupGameCommon() {
  player = new Player(world);
  cm = new ChunkManager(world, scene);
  sky = new Sky(scene, camera);
  avatars = new Avatars(scene);
  cm.setRadius(+document.getElementById('render-dist').value);
  sky.setRenderDistance(cm.radius * CHUNK);
  // debug/testing handle
  window.__game = { get player() { return player; }, get world() { return world; }, get ui() { return ui; }, get net() { return net; }, get sky() { return sky; } };
  window.__testAction = (btn) => doAction(btn);
}

function enterGame(savedPos) {
  if (savedPos && savedPos.length === 3 && savedPos.every((v) => typeof v === 'number' && isFinite(v))) {
    player.pos.set(savedPos[0], savedPos[1], savedPos[2]);
  }
  // pre-build the spawn chunk so there's something under your feet
  cm.buildChunk(Math.floor(player.pos.x / CHUNK), Math.floor(player.pos.z / CHUNK));

  state = 'playing';
  ui.showHud();
  ui.buildHotbar([...DEFAULT_HOTBAR]);
  ui.buildPicker();
  ui.setRoom(net.code, net.mode);
  ui.setHint(true);
  chat.add({ text: 'Welcome to Voxelheim! Break with left click, place with right.', system: true });
  chat.add({ text: 'Share the room code to play with friends.', system: true });
}

function cancelConnect() {
  net?.destroy();
  net = null;
  teardownGame();
  state = 'menu';
  ui.showMenu();
}

function quitToMenu(save) {
  if (save && net?.mode === 'host' && world) hostSave(true);
  net?.destroy();
  net = null;
  teardownGame();
  state = 'menu';
  ui.showMenu();
}

function teardownGame() {
  if (cm) { cm.dispose(); cm = null; }
  if (avatars) { avatars.clear(); avatars = null; }
  highlight.visible = false;
  keys.clear();
  holdBtn = null;
  document.exitPointerLock?.();
  hostCode = null;
}

// ---------- network handlers ----------

function netHandlers() {
  return {
    onStatus: (s) => ui.setConnectStatus(s),

    onReady: (code) => {
      const saved = loadWorld(code);
      enterGame(saved?.pos);
      chat.add({ text: 'Room ' + code + ' is live. You are the host.', system: true });
      sfx.joinChime();
    },

    onInit: (msg) => {
      world = new World(msg.seed);
      world.applyEditsArray(msg.edits);
      setupGameCommon();
      sky.setTime(msg.time);
      enterGame(null);
      for (const p of msg.players) avatars.add(p.id, p.name, p.color, null);
      ui.updatePlayerList(net.roster(), net.myId);
      chat.add({ text: 'Joined room ' + net.code + '.', system: true });
      sfx.joinChime();
    },

    onJoin: (id, name, color) => {
      avatars.add(id, name, color, null);
      chat.add({ text: name + ' joined the world.', system: true });
      sfx.joinChime();
      ui.updatePlayerList(net.roster(), net.myId);
    },

    onLeave: (id, name) => {
      avatars.remove(id);
      chat.add({ text: (name ?? 'Someone') + ' left.', system: true });
      sfx.leaveChime();
      ui.updatePlayerList(net.roster(), net.myId);
    },

    onPos: (id, s) => avatars.setState(id, s),

    onEdit: (id, x, y, z, b) => {
      world.setBlock(x, y, z, b);
      if (player) {
        const d = Math.hypot(x - player.pos.x, y - player.pos.y, z - player.pos.z);
        if (d < 28) sfx.place((BLOCKS[b] ?? BLOCKS[1]).sound);
      }
    },

    onChat: (id, name, color, text) => {
      chat.add({ name, color, text });
      if (id !== net.myId) sfx.chatPing();
    },

    onTime: (t) => sky?.setTime(t),

    onError: (msg) => {
      net?.destroy();
      net = null;
      teardownGame();
      state = 'menu';
      ui.showMenu();
      ui.menuError(msg);
    },

    onHostGone: () => {
      chat.add({ text: 'The host left — the world went with them.', system: true });
      setTimeout(() => quitToMenu(false), 2500);
    },
  };
}

// ---------- actions ----------

function sendChat(text) {
  // host sees its own message via hostChat's onChat; clients get no echo
  if (net?.mode === 'client') chat.add({ name: myName, color: myColor, text });
  net?.sendChat(text, myName, myColor);
  sfx.chatPing();
}

function doAction(btn) {
  if (!player || !ui) return;
  const hit = player.raycast();
  if (!hit.hit) return;

  if (btn === 0) {
    const bl = BLOCKS[hit.id];
    if (!bl?.breakable) {
      sfx.tone(120, 'square', 0.06, 0.2);
      return;
    }
    world.setBlock(hit.x, hit.y, hit.z, B.AIR);
    net?.sendEdit(hit.x, hit.y, hit.z, B.AIR);
    sfx.break_(bl.sound);
  } else {
    const cur = ui.currentBlock();
    if (!cur) return;
    let tx = hit.px, ty = hit.py, tz = hit.pz;
    if (isCross(hit.id)) { tx = hit.x; ty = hit.y; tz = hit.z; }
    if (!isReplaceable(world.getBlock(tx, ty, tz))) return;
    if (player.intersectsBlock(tx, ty, tz)) return;
    world.setBlock(tx, ty, tz, cur);
    net?.sendEdit(tx, ty, tz, cur);
    sfx.place(BLOCKS[cur].sound);
  }
}

function hostSave(force) {
  if (net?.mode !== 'host' || !world || !sky || !player) return;
  saveWorld(net.code, {
    seed: world.seed,
    editsStr: world.serializeEdits(),
    time: sky.getTime(),
    pos: [player.pos.x, player.pos.y, player.pos.z],
    yaw: player.yaw,
  });
}

// ---------- input ----------

const canvas = renderer.domElement;

function requestLock() {
  if (state !== 'playing') return;
  ui.hidePause();
  try { canvas.requestPointerLock(); } catch { /* needs gesture */ }
}

canvas.addEventListener('click', () => {
  sfx.resume();
  if (state === 'playing' && !ui.isPickerOpen() && !chat.isOpen() && document.pointerLockElement !== canvas) {
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
    if (!ui.isPickerOpen() && !chat.isOpen()) ui.showPause();
  }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && player && !chat.isOpen()) {
    player.look(e.movementX, e.movementY);
  }
});

document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas || state !== 'playing' || chat.isOpen()) return;
  if (e.button === 0 || e.button === 2) {
    holdBtn = e.button;
    doAction(e.button);
    nextActionAt = performance.now() + 280;
  }
});

document.addEventListener('mouseup', () => (holdBtn = null));
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('wheel', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  const dir = Math.sign(e.deltaY);
  ui.selectSlot((ui.selected + dir + 9) % 9);
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (state !== 'playing' || chat.isOpen()) return;

  if (e.code === 'KeyE') {
    e.preventDefault();
    if (ui.isPickerOpen()) ui.closePicker();
    else ui.openPicker();
    return;
  }
  if (e.code === 'Escape' && ui.isPickerOpen()) {
    ui.closePicker();
    return;
  }
  if (e.code === 'KeyT') {
    e.preventDefault();
    chat.openInput();
    return;
  }
  if (e.code === 'Tab') {
    e.preventDefault();
    ui.showPlayerList(true);
    return;
  }
  if (e.code === 'F3') {
    e.preventDefault();
    ui.toggleDebug();
    return;
  }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 9) ui.selectSlot(n - 1);
    return;
  }
  if (e.code === 'Space' && document.pointerLockElement === canvas) {
    const flew = player?.onSpace();
    if (flew !== null && flew !== undefined) sfx.flyWhoosh();
  }
  keys.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Tab') ui.showPlayerList(false);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', () => hostSave(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) hostSave(true); });

// ---------- main loop ----------

let lastT = performance.now();

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

  if (state === 'playing' && player) {
    const locked = document.pointerLockElement === canvas;
    const activeKeys = locked ? keys : new Set();

    // fixed-step physics (avoids tunneling on lag spikes)
    let step = dt;
    while (step > 0) {
      const h = Math.min(step, 1 / 60);
      player.update(h, activeKeys);
      step -= h;
    }

    // splash on entering water
    if (player.inWater && !wasInWater && Math.hypot(player.vel.x, player.vel.y, player.vel.z) > 3) sfx.splash();
    wasInWater = player.inWater;

    // footsteps
    if (player.stepAccum > 2.1) {
      player.stepAccum = 0;
      const under = world.getBlock(player.pos.x, player.pos.y - 0.3, player.pos.z);
      if (under !== B.AIR) sfx.step(BLOCKS[under]?.sound ?? 'stone');
    }

    // held mouse button repeats break/place
    if (holdBtn !== null && locked && now >= nextActionAt) {
      doAction(holdBtn);
      nextActionAt = now + 220;
    }

    player.applyToCamera(camera);

    // chunk streaming
    cm.update(player.pos.x, player.pos.z, 6);

    // sky & lighting
    sky.update(dt, camera.position);
    cm.setBrightness(sky.brightness);
    avatars.setBrightness(sky.brightness);
    avatars.setCameraPos(camera.position);
    avatars.update(dt);

    // underwater fog override
    if (player.headInWater) {
      scene.fog.color.set(0x1d4291);
      scene.fog.near = 1;
      scene.fog.far = 22;
      scene.background.set(0x1d4291);
    }

    // block highlight
    const hit = player.raycast();
    if (hit.hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlight.visible = false;
    }

    // network position sync @10Hz
    if (net && now - lastPosSend > 100) {
      lastPosSend = now;
      net.sendPos(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.pitch, player.fly);
    }

    // host: save every 5s, sync time every 30s
    if (net?.mode === 'host') {
      if (now - lastSaveAt > 5000) { lastSaveAt = now; hostSave(false); }
      if (now - lastTimeSync > 30000) {
        lastTimeSync = now;
        net.hostTime(sky.getTime());
      }
    }

    chat.update();

    if (ui.debugVisible) {
      const cx = Math.floor(player.pos.x / CHUNK), cz = Math.floor(player.pos.z / CHUNK);
      ui.setDebug([
        `Voxelheim · ${fps} fps`,
        `xyz ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}`,
        `chunk ${cx},${cz} · pending ${cm.pending()}`,
        `${player.fly ? 'flying' : player.inWater ? 'swimming' : player.onGround ? 'on ground' : 'airborne'} · seed ${world.seed}`,
        `players ${net ? net.players.size : 1}`,
      ]);
    }
  }

  renderer.render(scene, camera);
}

animate();
