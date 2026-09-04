// First-person player v2: action-based input (rebindable), survival-aware
// movement (no flight outside creative), mining progress with tool speeds,
// fall tracking for damage, swimming, auto-jump.

import * as THREE from 'three';
import { BLOCKS, isSolid, isWater, isLiquid, B } from './blocks.js';
import { breakTime, canHarvest } from './items.js';
import { moveEntity, liquidAt } from './physics.js';

const HALF_W = 0.3;
const P_HEIGHT = 1.8;
const EYE = 1.62;
const EYE_SNEAK = 1.47;
const GRAVITY = 26;
const JUMP_VEL = 8.4;
const TERMINAL = -42;

export class Player {
  constructor(world) {
    this.world = world;
    this.gamemodeOverride = null;
    this.pos = new THREE.Vector3(0.5, 60, 0.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.fly = false;
    this.onGround = false;
    this.inWater = false;
    this.inLava = false;
    this.headInWater = false;
    this.sprinting = false;
    this.lastSpace = 0;
    this.stepAccum = 0;
    this.peakY = 0;           // highest point since airborne (fall damage)
    this.wasAirborne = false;
    this.onLand = null;        // callback(fallDistance)
    this.mining = null;        // {x,y,z,progress,total}
    this.spawn();
  }

  get gamemode() { return this.gamemodeOverride ?? this.world.gamemode; }

  spawn(at) {
    const s = at ?? this.world.spawnPoint();
    this.pos.set(s.x, s.y, s.z);
    this.vel.set(0, 0, 0);
    this.fly = false;
    this.peakY = s.y;
  }

  look(dx, dy, sensitivity = 1, invertY = false) {
    const s = 0.0023 * sensitivity;
    this.yaw -= dx * s;
    this.pitch -= (invertY ? -dy : dy) * s;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  onSpace() {
    const now = performance.now();
    if (now - this.lastSpace < 280) {
      if (this.gamemode === 'creative') {
        this.fly = !this.fly;
        this.vel.y = 0;
      }
      this.lastSpace = 0;
      return this.fly;
    }
    this.lastSpace = now;
    return null;
  }

  update(dt, actions) {
    const fwd = (actions.has('forward') ? 1 : 0) - (actions.has('back') ? 1 : 0);
    const strafe = (actions.has('right') ? 1 : 0) - (actions.has('left') ? 1 : 0);
    this.sprinting = actions.has('sprint') && fwd > 0;
    this.sneaking = !this.fly && actions.has('flyDown');

    const feetLiquid = liquidAt(this.world, this.pos.x, this.pos.y + 0.1, this.pos.z);
    const midLiquid = liquidAt(this.world, this.pos.x, this.pos.y + 0.9, this.pos.z);
    this.inWater = feetLiquid === B.WATER || midLiquid === B.WATER;
    this.inLava = feetLiquid === B.LAVA || midLiquid === B.LAVA;
    this.headInWater = isWater(this.world.getBlock(this.pos.x, this.pos.y + EYE, this.pos.z));

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = (-sin * fwd) + (cos * strafe);
    let wz = (-cos * fwd) + (-sin * strafe);
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    let speed;
    if (this.fly) speed = this.sprinting ? 17 : 10.5;
    else if (this.inWater) speed = 3.2;
    else if (this.inLava) speed = 1.6;
    else speed = this.sneaking ? 1.4 : (this.sprinting ? 6.8 : 4.35);

    const accel = this.onGround || this.fly ? 42 : 14;
    this.vel.x = approach(this.vel.x, wx * speed, accel * dt);
    this.vel.z = approach(this.vel.z, wz * speed, accel * dt);

    if (this.fly) {
      const up = (actions.has('jump') ? 1 : 0) - (actions.has('flyDown') ? 1 : 0);
      this.vel.y = approach(this.vel.y, up * (this.sprinting ? 12 : 8), 60 * dt);
    } else if (this.inWater) {
      this.vel.y += -5 * dt;
      if (actions.has('jump')) this.vel.y = approach(this.vel.y, 4.2, 26 * dt);
      this.vel.y = Math.max(-6, this.vel.y * (1 - 2.2 * dt));
    } else if (this.inLava) {
      this.vel.y += -4 * dt;
      if (actions.has('jump')) this.vel.y = approach(this.vel.y, 2.4, 16 * dt);
      this.vel.y = Math.max(-3, this.vel.y * (1 - 4 * dt));
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < TERMINAL) this.vel.y = TERMINAL;
      if (actions.has('jump') && this.onGround) {
        this.vel.y = JUMP_VEL;
        this.onGround = false;
      }
    }

    const wasOnGround = this.onGround;
    const px0 = this.pos.x, pz0 = this.pos.z;
    const flags = moveEntity(this.world, this, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, HALF_W, P_HEIGHT);

    // sneaking edge guard: refuse movement that would leave support
    if (this.sneaking && wasOnGround && !this.onGround && this.vel.y <= 0) {
      if (px0 !== this.pos.x) { this.pos.x = px0; this.vel.x = 0; }
      if (pz0 !== this.pos.z) { this.pos.z = pz0; this.vel.z = 0; }
      this.onGround = true;
    }

    // ground snap: kill the airborne/on-ground flicker when skimming terrain
    if (!this.onGround && !this.fly && !this.inWater && this.vel.y <= 0.01 && this.vel.y > -3) {
      const probeY = this.pos.y - 0.12;
      for (const [ox, oz] of GROUND_PROBES) {
        if (isSolid(this.world.getBlock(this.pos.x + ox, probeY, this.pos.z + oz))) {
          this.onGround = true;
          break;
        }
      }
    }

    // fall tracking
    if (this.onGround || this.inWater || this.inLava || this.fly) {
      if (this.wasAirborne && this.onGround) {
        const fall = this.peakY - this.pos.y;
        if (this.onLand && fall > 1.5 && this.gamemode !== 'creative') this.onLand(fall);
      }
      this.wasAirborne = false;
      this.peakY = this.pos.y;
    } else {
      this.wasAirborne = true;
      this.peakY = Math.max(this.peakY, this.pos.y);
    }

    // auto-jump: bumped into a 1-high step while moving on the ground
    if (flags.hitX || flags.hitZ) {
      if (this.autoJump && this.onGround && wl > 0 && !this.fly) {
        const ax = this.pos.x + wx * 0.7, az = this.pos.z + wz * 0.7;
        const feetBlock = this.world.getBlock(ax, this.pos.y + 0.2, az);
        const headBlock = this.world.getBlock(ax, this.pos.y + 1.2, az);
        if (isSolid(feetBlock) && !isSolid(headBlock)) this.vel.y = JUMP_VEL * 0.9;
      }
    }

    if (this.onGround && wl > 0) {
      this.stepAccum += Math.hypot(this.vel.x, this.vel.z) * dt;
    }

    if (this.pos.y < -12) this.spawn();
  }

  eyePosition(out) {
    return out.set(this.pos.x, this.pos.y + (this.sneaking ? EYE_SNEAK : EYE), this.pos.z);
  }

  applyToCamera(camera) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = 0; // never inherit roll from lookAt/panorama
    this.eyePosition(camera.position);
  }

  lookVector(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // ---- mining progress (survival). Returns the crack stage 0..9, or -1
  // when idle; throws {completed:true} via return value when finished.
  tickMining(dt, hit, heldStack, creative) {
    if (!hit || !hit.hit) { this.mining = null; return { stage: -1 }; }
    const bl = hit.block;
    if (!bl?.breakable) { this.mining = null; return { stage: -1 }; }
    if (creative) {
      this.mining = null;
      return { stage: -1, instant: true };
    }
    if (!this.mining || this.mining.x !== hit.x || this.mining.y !== hit.y || this.mining.z !== hit.z) {
      const total = breakTime(heldStack, hit.id);
      this.mining = { x: hit.x, y: hit.y, z: hit.z, progress: 0, total };
    }
    this.mining.progress += dt;
    if (this.mining.progress >= this.mining.total) {
      const m = this.mining;
      this.mining = null;
      return { stage: 9, completed: true, target: m };
    }
    const stage = Math.min(9, Math.floor((this.mining.progress / this.mining.total) * 10));
    return { stage };
  }

  // voxel DDA raycast (Amanatides & Woo); hits solids + plants, skips liquids
  raycast(maxDist = 5.5, origin, dir) {
    const o = origin ?? this.eyePosition(new THREE.Vector3());
    const d = dir ?? this.lookVector(new THREE.Vector3());

    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const stepX = Math.sign(d.x), stepY = Math.sign(d.y), stepZ = Math.sign(d.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / d.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / d.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / d.z) : Infinity;
    let tMaxX = stepX !== 0 ? (stepX > 0 ? (x + 1 - o.x) : (o.x - x)) * tDeltaX : Infinity;
    let tMaxY = stepY !== 0 ? (stepY > 0 ? (y + 1 - o.y) : (o.y - y)) * tDeltaY : Infinity;
    let tMaxZ = stepZ !== 0 ? (stepZ > 0 ? (z + 1 - o.z) : (o.z - z)) * tDeltaZ : Infinity;

    let px = x, py = y, pz = z;
    let t = 0;
    while (t <= maxDist) {
      const id = this.world.getBlock(x, y, z);
      if (id !== B.AIR && !isLiquid(id)) {
        return { hit: true, x, y, z, px, py, pz, id, block: BLOCKS[id], dist: t };
      }
      px = x; py = y; pz = z;
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      }
    }
    return { hit: false };
  }

  intersectsBlock(bx, by, bz) {
    return (
      bx + 1 > this.pos.x - HALF_W && bx < this.pos.x + HALF_W &&
      by + 1 > this.pos.y && by < this.pos.y + P_HEIGHT &&
      bz + 1 > this.pos.z - HALF_W && bz < this.pos.z + HALF_W
    );
  }
}

function approach(cur, target, maxDelta) {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

const GROUND_PROBES = [[0, 0], [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
