// Mobs: passive trotters & woollies plus hostile night gloomers. The host
// simulates AI/physics/spawning and broadcasts states; clients interpolate
// and render rigs with walk animation, hurt flash and burn.

import * as THREE from 'three';
import { B } from './blocks.js';
import { I, stack } from './items.js';
import { moveEntity } from './physics.js';

export const MOB_TYPES = {
  trotter: { hp: 10, speed: 1.7, hostile: false, w: 0.42, h: 0.95, drops: () => [stack(I.RAW_MEAT, 1 + Math.floor(Math.random() * 2))] },
  woolly: { hp: 8, speed: 1.6, hostile: false, w: 0.45, h: 1.1, drops: () => [stack(B.WOOL_WHITE, 1), stack(I.RAW_MEAT, 1), stack(I.STRING, 1)] },
  gloomer: { hp: 20, speed: 2.9, hostile: true, w: 0.3, h: 1.9, dmg: 3, drops: () => (Math.random() < 0.4 ? [stack(I.RAW_MEAT, 1)] : []) },
  cow: { hp: 10, speed: 1.5, hostile: false, w: 0.45, h: 1.25, drops: () => [stack(I.BEEF, 1 + Math.floor(Math.random() * 2)), stack(I.LEATHER, Math.random() < 0.6 ? 1 : 0).valueOf ? stack(I.LEATHER, 1) : null].filter(Boolean) },
  chicken: { hp: 4, speed: 1.8, hostile: false, w: 0.22, h: 0.7, drops: () => [stack(I.CHICKEN_RAW, 1), stack(I.FEATHER, Math.random() < 0.7 ? 1 : 0)].filter(s => s.count > 0) },
  skeleton: { hp: 18, speed: 2.5, hostile: true, w: 0.3, h: 1.9, dmg: 0, ranged: true, drops: () => [stack(I.ARROW, Math.floor(Math.random() * 3)), stack(I.FLINT, Math.random() < 0.3 ? 1 : 0)].filter(s => s.count > 0) },
};
export const MOB_NAMES = Object.keys(MOB_TYPES);

let NEXT_MOB = 1;

// ---- rigs ----
// noise-shaded material: gives flat boxes subtle depth without real lighting
function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

const shadedMatCache = new Map();
function shadedMaterial(colorHex) {
  if (shadedMatCache.has(colorHex)) return shadedMatCache.get(colorHex).clone();
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = shadeHex(colorHex, (Math.random() - 0.5) * 30);
    ctx.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  shadedMatCache.set(colorHex, mat);
  return mat.clone();
}

function boxPart(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shadedMaterial(color));
}

function buildQuadruped(bodyColor, headColor, legColor, fluffy) {
  const g = new THREE.Group();
  const parts = { mats: [] };
  const mk = (w, h, d, c) => {
    const m = boxPart(w, h, d, c);
    parts.mats.push(m.material);
    return m;
  };
  const body = mk(fluffy ? 0.95 : 0.9, fluffy ? 0.7 : 0.55, 0.5, bodyColor);
  body.position.y = 0.62;
  g.add(body);
  const head = mk(0.42, 0.42, 0.42, headColor);
  head.position.set(0.62, 0.78, 0);
  g.add(head);
  if (fluffy) {
    const tuft = mk(0.3, 0.22, 0.3, headColor);
    tuft.position.set(0.62, 1.03, 0);
    g.add(tuft);
  }
  const legs = [];
  for (const [lx, lz] of [[0.32, 0.14], [0.32, -0.14], [-0.32, 0.14], [-0.32, -0.14]]) {
    const holder = new THREE.Group();
    holder.position.set(lx, 0.36, lz);
    const leg = mk(0.16, 0.36, 0.16, legColor);
    leg.position.y = -0.18;
    holder.add(leg);
    g.add(holder);
    legs.push(holder);
  }
  // eyes
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1d1d1d });
  parts.mats.push(eyeM);
  for (const dz of [0.1, -0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), eyeM);
    eye.position.set(0.84, 0.84, dz);
    g.add(eye);
  }
  return { group: g, legs, head, mats: parts.mats };
}

function buildGloomer() {
  const g = new THREE.Group();
  const mats = [];
  const mk = (w, h, d, c) => {
    const m = boxPart(w, h, d, c);
    mats.push(m.material);
    return m;
  };
  const green = '#4a7a4a', dark = '#3a5c3a';
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.75, 0);
  const ll = mk(0.22, 0.75, 0.22, dark); ll.position.y = -0.375; legL.add(ll);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.75, 0);
  const lr = mk(0.22, 0.75, 0.22, dark); lr.position.y = -0.375; legR.add(lr);
  const body = mk(0.5, 0.7, 0.26, green); body.position.y = 1.1;
  const armL = new THREE.Group(); armL.position.set(-0.36, 1.4, 0);
  const al = mk(0.18, 0.68, 0.22, green); al.position.y = -0.3; armL.add(al);
  const armR = new THREE.Group(); armR.position.set(0.36, 1.4, 0);
  const ar = mk(0.18, 0.68, 0.22, green); ar.position.y = -0.3; armR.add(ar);
  // zombie arms reach forward
  armL.rotation.x = -1.35; armR.rotation.x = -1.35;
  const head = mk(0.46, 0.46, 0.46, '#5e8a55'); head.position.y = 1.68;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111508 });
  mats.push(eyeM);
  for (const dx of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), eyeM);
    eye.position.set(dx, 1.72, 0.24);
    head.add(eye);
  }
  g.add(legL, legR, body, armL, armR, head);
  return { group: g, legs: [legL, legR], arms: [armL, armR], head, mats };
}

export class Mobs {
  constructor(scene, world, lighting) {
    this.scene = scene;
    this.world = world;
    this.lighting = lighting;
    this.isHost = true;
    this.mobs = new Map();     // id -> mob (host) / view entry (client)
    this.group = new THREE.Group();
    scene.add(this.group);
    this.onPlayerDamage = null; // (playerId, dmg, kx, kz)
    this.spawnTimer = 0;
    this.stateTimer = 0;
    this.difficulty = 'normal';
    this.brightness = 1;
    this.arrows = new Map(); // id -> {id, pos, vel, mesh, age, ownerId}
    this.arrowId = 1;
    this.arrowGroup = new THREE.Group();
    scene.add(this.arrowGroup);
    // shared blob shadow
    this.shadowGeo = new THREE.CircleGeometry(0.45, 10);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  }

  updateShadow(id) {
    const m = this.mobs.get(id);
    if (!m?.view) return;
    if (!m.shadow) {
      m.shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
      m.shadow.rotation.x = -Math.PI / 2;
      this.scene.add(m.shadow);
    }
    // find ground under the mob
    let gy = -1;
    for (let yy = Math.floor(m.pos.y); yy >= Math.floor(m.pos.y) - 6; yy--) {
      if (this.world.getBlock(Math.floor(m.pos.x), yy, Math.floor(m.pos.z)) !== B.AIR) { gy = yy + 1; break; }
    }
    if (gy < 0) { m.shadow.visible = false; return; }
    m.shadow.visible = true;
    m.shadow.position.set(m.pos.x, gy + 0.03, m.pos.z);
  }

  fireArrow(m, target) {
    const id = this.arrowId++;
    const pos = m.pos.clone(); pos.y += 1.5;
    const dir = target.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).sub(pos).normalize();
    const vel = dir.multiplyScalar(16);
    vel.y += bestDist(Math.hypot(target.pos.x - m.pos.x, target.pos.z - m.pos.z));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0xd8cfa8 }));
    mesh.position.copy(pos);
    this.arrowGroup.add(mesh);
    this.arrows.set(id, { id, pos, vel, mesh, age: 0, ownerId: m.id });
    this.onArrowFired?.();
  }

  spawnPlayerArrow(eye, vel, dmg = 3, ownerId = 0) {
    const id = this.arrowId++;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0xe8d8a8 }));
    mesh.position.copy(eye);
    this.arrowGroup.add(mesh);
    this.arrows.set(id, { id, pos: eye.clone(), vel: vel.clone(), mesh, age: 0, kind: 'player', dmg, ownerId });
  }

  updateArrows(dt, players, damagePlayer) {
    for (const a of [...this.arrows.values()]) {
      a.age += dt;
      a.vel.y -= 18 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(a.vel));
      const bid = this.world.getBlock(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z));
      let dead = a.age > 6 || bid !== B.AIR;
      // player arrows hit mobs (host authority)
      if (!dead && this.isHost && a.kind === 'player') {
        for (const m of this.mobs.values()) {
          const t = MOB_TYPES[m.type];
          const dx = m.pos.x - a.pos.x, dy = (m.pos.y + t.h / 2) - a.pos.y, dz = m.pos.z - a.pos.z;
          if (dx * dx + dy * dy + dz * dz < (t.w + 0.25) ** 2) {
            const res = this.hit(m.id, a.dmg ?? 3, a.vel.x * 0.08, a.vel.z * 0.08, a.ownerId);
            if (res?.died) {
              this.onMobDeath?.(m, res.drops);
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead && this.isHost) {
        for (const p of players) {
          if (p.gm === 'creative') continue;
          const dx = p.pos.x - a.pos.x, dy = (p.pos.y + 0.9) - a.pos.y, dz = p.pos.z - a.pos.z;
          if (dx * dx + dy * dy + dz * dz < 0.55) {
            damagePlayer?.(p.id, 3, a.vel.x * 0.06, a.vel.z * 0.06);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this.arrowGroup.remove(a.mesh);
        this.arrows.delete(a.id);
      }
    }
  }

  arrowStates() {
    const out = [];
    for (const a of this.arrows.values()) {
      out.push([a.id, +a.pos.x.toFixed(2), +a.pos.y.toFixed(2), +a.pos.z.toFixed(2), +a.vel.x.toFixed(2), +a.vel.y.toFixed(2), +a.vel.z.toFixed(2)]);
    }
    return out;
  }

  applyArrowStates(list) {
    const seen = new Set();
    for (const [id, x, y, z, vx, vy, vz] of list || []) {
      seen.add(id);
      let a = this.arrows.get(id);
      if (!a) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0xd8cfa8 }));
        this.arrowGroup.add(mesh);
        a = { id, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), mesh, age: 0 };
        this.arrows.set(id, a);
      }
      a.pos.set(x, y, z);
      a.vel.set(vx, vy, vz);
    }
    for (const id of [...this.arrows.keys()]) if (!seen.has(id)) this.removeArrow(id);
  }

  removeArrow(id) {
    const a = this.arrows.get(id);
    if (!a) return;
    this.arrowGroup.remove(a.mesh);
    this.arrows.delete(id);
  }

  // ---------- host ----------

  spawn(type, x, y, z) {
    const t = MOB_TYPES[type];
    const mob = {
      id: NEXT_MOB++,
      type,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      hp: t.hp,
      onGround: false,
      wanderT: 0,
      wanderDir: null,
      attackCd: 0,
      hurtT: 0,
      burnT: 0,
      fleeT: 0,
      fleeFrom: null,
      phase: Math.random() * 10,
      speed: 0,
    };
    this.mobs.set(mob.id, { ...mob, view: this.attachView(mob) });
    return mob.id;
  }

  remove(id) {
    const m = this.mobs.get(id);
    if (!m) return;
    if (m.shadow) { this.scene.remove(m.shadow); }
    if (m.view) {
      this.group.remove(m.view.rig.group);
      m.view.rig.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.mobs.delete(id);
  }

  clear() {
    for (const id of [...this.mobs.keys()]) this.remove(id);
  }

  // returns {fed:true, ready:bool} if a passive mob ate the wheat
  feedNearest(pos) {
    let best = null, bestD = 2.6;
    for (const m of this.mobs.values()) {
      if (MOB_TYPES[m.type].hostile) continue;
      const d = m.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (!best) return null;
    best.loveT = 8;
    this.onHearts?.(best.pos);
    // look for a partner also in love
    for (const other of this.mobs.values()) {
      if (other === best || MOB_TYPES[other.type].hostile || other.type !== best.type) continue;
      if ((other.loveT ?? 0) > 0) {
        best.loveT = 0; other.loveT = 0;
        const babyId = this.spawn(best.type, best.pos.x, best.pos.y, best.pos.z);
        const baby = this.mobs.get(babyId);
        if (baby) { baby.babyT = 90; if (baby.view) baby.view.rig.group.scale.setScalar(0.55); }
        return { fed: true, bred: true };
      }
    }
    return { fed: true, bred: false };
  }

  hit(id, dmg, kx, kz, attackerId) {
    const m = this.mobs.get(id);
    if (!m) return null;
    m.hp -= dmg;
    m.hurtT = 0.35;
    m.vel.x += kx * 6;
    m.vel.z += kz * 6;
    m.vel.y = Math.max(m.vel.y, 4);
    // passives flee from the attacker direction
    const t = MOB_TYPES[m.type];
    if (!t.hostile) {
      m.fleeT = 4;
      m.fleeFrom = new THREE.Vector3(m.pos.x - kx, m.pos.y, m.pos.z - kz);
    }
    if (m.hp <= 0) {
      const drops = t.drops();
      this.remove(id);
      return { died: true, drops };
    }
    return { died: false };
  }

  update(dt, players, dayFactor) {
    if (!this.isHost) {
      this.updateViews(dt);
      this.updateArrows(dt, [], null);
      return;
    }
    const tList = [...this.mobs.values()];

    for (const m of tList) {
      const t = MOB_TYPES[m.type];
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.attackCd = Math.max(0, m.attackCd - dt);
      m.wanderT -= dt;
      m.fleeT = Math.max(0, m.fleeT - dt);
      if (m.loveT > 0) m.loveT -= dt;
      if (m.babyT > 0) {
        m.babyT -= dt;
        if (m.view) m.view.rig.group.scale.setScalar(0.55 + 0.45 * Math.max(0, Math.min(1, 1 - m.babyT / 90)));
        if (m.babyT <= 0 && m.view) m.view.rig.group.scale.setScalar(1);
      }

      // nearest player
      let target = null, bestD = Infinity;
      for (const p of players) {
        const d = p.pos.distanceTo(m.pos);
        if (d < bestD) { bestD = d; target = p; }
      }

      // despawn far from everyone
      if (bestD > 70) { this.remove(m.id); continue; }

      let wishX = 0, wishZ = 0, speed = 0;

      if (t.hostile && t.ranged && target && bestD < 22) {
        // skeleton: keep mid distance and shoot
        const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        if (bestD < 5) { wishX = -dx / l; wishZ = -dz / l; }
        else if (bestD > 10) { wishX = dx / l; wishZ = dz / l; }
        speed = t.speed;
        m.yaw = Math.atan2(dx, dz);
        m.shootCd = (m.shootCd ?? 0) - dt;
        if (m.shootCd <= 0 && bestD < 16) {
          m.shootCd = 2.2;
          this.fireArrow(m, target);
        }
      } else if (t.hostile && target && bestD < 24) {
        // chase
        const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        wishX = dx / l; wishZ = dz / l;
        speed = t.speed;
        m.yaw = Math.atan2(dx, dz);
        if (bestD < 1.5 && m.attackCd <= 0) {
          m.attackCd = 1.1;
          const kx = dx / l, kz = dz / l;
          this.onPlayerDamage?.(target.id, t.dmg, kx, kz);
        }
      } else if (m.fleeT > 0 && m.fleeFrom) {
        const dx = m.pos.x - m.fleeFrom.x, dz = m.pos.z - m.fleeFrom.z;
        const l = Math.hypot(dx, dz) || 1;
        wishX = dx / l; wishZ = dz / l;
        speed = t.speed * 1.6;
        m.yaw = Math.atan2(wishX, wishZ);
      } else {
        // wander
        if (m.wanderT <= 0) {
          m.wanderT = 2.5 + Math.random() * 5;
          m.wanderDir = Math.random() < 0.35 ? null : Math.random() * Math.PI * 2;
        }
        if (m.wanderDir !== null) {
          wishX = Math.sin(m.wanderDir); wishZ = Math.cos(m.wanderDir);
          speed = t.speed * 0.55;
          m.yaw = m.wanderDir;
        }
      }

      // physics
      m.vel.x = approach(m.vel.x, wishX * speed, 24 * dt);
      m.vel.z = approach(m.vel.z, wishZ * speed, 24 * dt);

      const inWater = this.world.getBlock(m.pos.x, m.pos.y + 0.3, m.pos.z) === B.WATER;
      const inLava = this.world.getBlock(m.pos.x, m.pos.y + 0.3, m.pos.z) === B.LAVA;
      if (inWater) {
        m.vel.y += 14 * dt;
        m.vel.y = Math.min(m.vel.y, 2.2);
      } else {
        m.vel.y -= 26 * dt;
        if (m.vel.y < -40) m.vel.y = -40;
      }

      const flags = moveEntity(this.world, m, m.vel.x * dt, m.vel.y * dt, m.vel.z * dt, t.w, t.h);
      // hop over 1-block obstacles
      if ((flags.hitX || flags.hitZ) && m.onGround && (wishX || wishZ)) m.vel.y = 7.4;

      m.speed = Math.hypot(m.vel.x, m.vel.z);

      // hazards
      if (inLava) { m.hp -= 8 * dt; m.hurtT = 0.2; }
      if (t.hostile && dayFactor > 0.55) {
        const sky = this.lighting ? this.lighting.getSky(Math.floor(m.pos.x), Math.floor(m.pos.y + 1.5), Math.floor(m.pos.z)) : 15;
        if (sky >= 14) {
          m.burnT += dt;
          if (m.burnT > 1) { m.burnT = 0; m.hp -= 2; m.hurtT = 0.3; }
        }
      }
      if (m.hp <= 0) {
        const drops = t.drops();
        this.remove(m.id);
        this.onMobDeath?.(m, drops);
        continue;
      }
    }

    // periodic spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.trySpawn(players, dayFactor);
    }

    this.updateViews(dt);
  }

  trySpawn(players, dayFactor) {
    if (!players.length) return;
    const list = [...this.mobs.values()];
    const passive = list.filter((m) => !MOB_TYPES[m.type].hostile).length;
    const hostile = list.length - passive;
    const player = players[Math.floor(Math.random() * players.length)];

    const spot = (minR, maxR) => {
      const a = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * (maxR - minR);
      const x = Math.floor(player.pos.x + Math.sin(a) * r);
      const z = Math.floor(player.pos.z + Math.cos(a) * r);
      const h = this.world.worldgen.heightAt(x, z);
      return { x, z, h };
    };

    if (passive < 10 && dayFactor > 0.5) {
      const { x, z, h } = spot(16, 44);
      if (h > 41 && (this.world.getBlock(x, h, z) === B.GRASS || this.world.getBlock(x, h, z) === B.SNOWY_GRASS)) {
        const roll = Math.random();
        const type = roll < 0.3 ? 'trotter' : roll < 0.55 ? 'woolly' : roll < 0.8 ? 'cow' : 'chicken';
        const n = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          this.spawn(type, x + 0.5 + (Math.random() - 0.5) * 2, h + 1.5, z + 0.5 + (Math.random() - 0.5) * 2);
        }
      }
    }

    if (this.difficulty !== 'peaceful' && hostile < 12) {
      const { x, z, h } = spot(18, 40);
      const y = h + 1;
      const sky = this.lighting ? this.lighting.getSky(x, y, z) : 15;
      const blockL = this.lighting ? this.lighting.getBlockLight(x, y, z) : 0;
      const darkEnough = sky < 4 || blockL < 3 ? (dayFactor < 0.35 ? sky < 6 : sky < 4) : false;
      if (h > 41 && darkEnough && this.world.getBlock(x, h, z) !== B.WATER) {
        this.spawn('gloomer', x + 0.5, y, z + 0.5);
      }
    }
  }

  states() {
    const out = [];
    for (const m of this.mobs.values()) {
      out.push([
        m.id, MOB_NAMES.indexOf(m.type),
        +m.pos.x.toFixed(2), +m.pos.y.toFixed(2), +m.pos.z.toFixed(2),
        +m.yaw.toFixed(2), m.hp > 0 ? Math.ceil(m.hp) : 0, m.hurtT > 0 ? 1 : 0,
      ]);
    }
    return out;
  }

  // ---------- client ----------

  applyStates(list) {
    const seen = new Set();
    for (const [id, typeIdx, x, y, z, yaw, hp, hurt] of list) {
      seen.add(id);
      let m = this.mobs.get(id);
      if (!m) {
        const type = MOB_NAMES[typeIdx] ?? 'trotter';
        m = {
          id, type, pos: new THREE.Vector3(x, y, z),
          target: new THREE.Vector3(x, y, z),
          yaw, targetYaw: yaw, hp, hurtT: hurt ? 0.3 : 0,
          speed: 0, phase: 0, view: this.attachView({ type, hurtT: 0 }),
        };
        this.mobs.set(id, m);
      } else {
        m.target.set(x, y, z);
        m.targetYaw = yaw;
        m.hp = hp;
        if (hurt) m.hurtT = 0.3;
      }
    }
    for (const id of [...this.mobs.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  // ---------- rendering ----------

  attachView(mob) {
    let rig;
    if (mob.type === 'trotter') rig = buildQuadruped('#e8a0a0', '#d98b8b', '#c47b7b', false);
    else if (mob.type === 'woolly') rig = buildQuadruped('#e9ecec', '#b9c2cf', '#c9b887', true);
    else if (mob.type === 'cow') rig = buildQuadruped('#5c4033', '#8a6a52', '#4a352b', false);
    else if (mob.type === 'chicken') {
      rig = buildQuadruped('#f0f0f0', '#f0f0f0', '#e0b24a', false);
      rig.group.scale.setScalar(0.55);
    } else if (mob.type === 'skeleton') {
      rig = buildGloomer();
      // bone-white palette
      for (const m of rig.mats) { m.userData.base0 = m.userData.base0 ?? m.color.clone(); m.color.set('#d8d8d0'); m.userData.base0 = m.color.clone(); }
      // bow in hand
      const bowMat = new THREE.MeshBasicMaterial({ color: '#8a6a3f' });
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), bowMat);
      bow.position.set(0.42, 1.05, 0.25);
      rig.mats.push(bowMat);
      rig.group.add(bow);
    } else rig = buildGloomer();
    this.group.add(rig.group);
    return { rig, hurtT: 0 };
  }

  updateViews(dt) {
    for (const m of this.mobs.values()) {
      if (m.target) {
        const prev = m.pos.clone();
        m.pos.lerp(m.target, Math.min(1, 12 * dt));
        m.speed = m.pos.distanceTo(prev) / Math.max(dt, 1e-4);
        let dy = m.targetYaw - m.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        m.yaw += dy * Math.min(1, 10 * dt);
      }
      m.hurtT = Math.max(0, (m.hurtT ?? 0) - dt);
      m.phase = (m.phase ?? 0) + dt * (1 + m.speed * 2.2);

      const v = m.view;
      if (!v) continue;
      v.rig.group.position.copy(m.pos);
      v.rig.group.rotation.y = m.yaw;
      this.updateShadow(m.id);

      const swing = Math.sin(m.phase * 4) * Math.min(0.7, m.speed * 0.35);
      if (v.rig.legs) {
        v.rig.legs.forEach((leg, i) => { leg.rotation.x = (i % 2 ? -1 : 1) * swing; });
      }
      if (v.rig.arms) {
        v.rig.arms.forEach((arm, i) => { arm.rotation.x = -1.35 + (i % 2 ? 1 : -1) * swing * 0.4; });
      }

      // hurt flash + brightness
      for (const mat of v.rig.mats) {
        if (!mat.userData.base) mat.userData.base = mat.color.clone();
        mat.color.copy(mat.userData.base);
        if (m.hurtT > 0) mat.color.lerp(new THREE.Color(1, 0.2, 0.2), 0.55);
        mat.color.multiplyScalar(this.brightness);
      }
    }
  }

  setBrightness(b) { this.brightness = b; }

  count() { return this.mobs.size; }
}

function approach(cur, target, maxDelta) {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

// ray vs mob AABBs — used to pick attack targets before block hits
export function entityRaycast(origin, dir, mobs, maxDist) {
  let best = null;
  for (const m of mobs.values()) {
    const t = MOB_TYPES[m.type];
    const min = { x: m.pos.x - t.w, y: m.pos.y, z: m.pos.z - t.w };
    const max = { x: m.pos.x + t.w, y: m.pos.y + t.h, z: m.pos.z + t.w };
    const d = rayAabb(origin, dir, min, max);
    if (d !== null && d <= maxDist && (!best || d < best.dist)) {
      best = { id: m.id, dist: d, mob: m };
    }
  }
  return best;
}

function rayAabb(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(d[axis]) < 1e-9) {
      if (o[axis] < min[axis] || o[axis] > max[axis]) return null;
    } else {
      let t1 = (min[axis] - o[axis]) / d[axis];
      let t2 = (max[axis] - o[axis]) / d[axis];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
