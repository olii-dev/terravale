// Mobs: passive trotters & woollies plus hostile night gloomers. The host
// simulates AI/physics/spawning and broadcasts states; clients interpolate
// and render rigs with walk animation, hurt flash and burn.

import * as THREE from 'three';
import { B } from './blocks.js';
import { I, stack } from './items.js';
import { moveEntity } from './physics.js';

export const MOB_TYPES = {
  trotter: { hp: 10, speed: 1.7, hostile: false, w: 0.42, h: 0.95, drops: () => [stack(I.RAW_MEAT, 1 + Math.floor(Math.random() * 2))] },
  woolly: { hp: 8, speed: 1.6, hostile: false, w: 0.45, h: 1.1, drops: () => [stack(B.WOOL_WHITE, 1), stack(I.RAW_MEAT, 1)] },
  gloomer: { hp: 20, speed: 2.9, hostile: true, w: 0.3, h: 1.9, dmg: 3, drops: () => (Math.random() < 0.4 ? [stack(I.RAW_MEAT, 1)] : []) },
};
export const MOB_NAMES = Object.keys(MOB_TYPES);

let NEXT_MOB = 1;

// ---- rigs ----
function boxPart(w, h, d, color) {
  const mat = new THREE.MeshBasicMaterial({ color });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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
      return;
    }
    const tList = [...this.mobs.values()];

    for (const m of tList) {
      const t = MOB_TYPES[m.type];
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.attackCd = Math.max(0, m.attackCd - dt);
      m.wanderT -= dt;
      m.fleeT = Math.max(0, m.fleeT - dt);

      // nearest player
      let target = null, bestD = Infinity;
      for (const p of players) {
        const d = p.pos.distanceTo(m.pos);
        if (d < bestD) { bestD = d; target = p; }
      }

      // despawn far from everyone
      if (bestD > 70) { this.remove(m.id); continue; }

      let wishX = 0, wishZ = 0, speed = 0;

      if (t.hostile && target && bestD < 24) {
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
      if (h > 41 && this.world.getBlock(x, h, z) === B.GRASS) {
        const type = Math.random() < 0.55 ? 'trotter' : 'woolly';
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
    else rig = buildGloomer();
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
