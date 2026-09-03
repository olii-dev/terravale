// First-person player: pointer-lock look, WASD movement, gravity + AABB
// collision against voxels, swimming, creative flight, and a voxel DDA
// raycast for targeting blocks.

import * as THREE from 'three';
import { isSolid, isWater, B } from './blocks.js';

const HALF_W = 0.3;
const P_HEIGHT = 1.8;
const EYE = 1.62;
const GRAVITY = 26;
const JUMP_VEL = 8.4;
const TERMINAL = -42;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(0.5, 50, 0.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.fly = false;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.sprinting = false;
    this.lastSpace = 0;
    this.stepAccum = 0;
    this.spawn();
  }

  spawn() {
    const s = this.world.worldgen.spawnPoint();
    this.pos.set(s.x, s.y, s.z);
    this.vel.set(0, 0, 0);
    this.fly = false;
  }

  look(dx, dy, sensitivity = 0.0023) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  onSpace() {
    const now = performance.now();
    if (now - this.lastSpace < 280) {
      this.fly = !this.fly;
      this.vel.y = 0;
      this.lastSpace = 0;
      return this.fly;
    }
    this.lastSpace = now;
    return null;
  }

  blockAtFeet() {
    return this.world.getBlock(this.pos.x, this.pos.y + 0.1, this.pos.z);
  }

  update(dt, keys) {
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    this.sprinting = keys.has('ControlLeft') || keys.has('ControlRight');

    this.inWater = isWater(this.blockAtFeet()) || isWater(this.world.getBlock(this.pos.x, this.pos.y + 0.9, this.pos.z));
    this.headInWater = isWater(this.world.getBlock(this.pos.x, this.pos.y + EYE, this.pos.z));

    // horizontal wish direction in world space
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = (-sin * fwd) + (cos * strafe);
    let wz = (-cos * fwd) + (-sin * strafe);
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    let speed;
    if (this.fly) speed = this.sprinting ? 17 : 10.5;
    else if (this.inWater) speed = 3.2;
    else speed = this.sprinting ? 6.8 : 4.35;

    // horizontal velocity with acceleration/damping
    const accel = this.onGround || this.fly ? 42 : 14;
    this.vel.x = approach(this.vel.x, wx * speed, accel * dt);
    this.vel.z = approach(this.vel.z, wz * speed, accel * dt);

    if (this.fly) {
      const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
      this.vel.y = approach(this.vel.y, up * (this.sprinting ? 12 : 8), 60 * dt);
    } else if (this.inWater) {
      this.vel.y += -5 * dt;
      if (keys.has('Space')) this.vel.y = approach(this.vel.y, 4.2, 26 * dt);
      this.vel.y = Math.max(-6, this.vel.y * (1 - 2.2 * dt));
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < TERMINAL) this.vel.y = TERMINAL;
      if (keys.has('Space') && this.onGround) {
        this.vel.y = JUMP_VEL;
        this.onGround = false;
      }
    }

    // integrate + collide, one axis at a time
    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('y', this.vel.y * dt);
    this.moveAxis('z', this.vel.z * dt);

    // footsteps
    if (this.onGround && wl > 0) {
      this.stepAccum += Math.hypot(this.vel.x, this.vel.z) * dt;
    }

    if (this.pos.y < -12) this.spawn();
  }

  moveAxis(axis, delta) {
    if (delta === 0) return;
    this.pos[axis] += delta;

    const minX = this.pos.x - HALF_W, maxX = this.pos.x + HALF_W;
    const minY = this.pos.y, maxY = this.pos.y + P_HEIGHT;
    const minZ = this.pos.z - HALF_W, maxZ = this.pos.z + HALF_W;

    const x0 = Math.floor(minX), x1 = Math.floor(maxX - 1e-7);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY - 1e-7);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - 1e-7);

    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          if (!isSolid(this.world.getBlock(bx, by, bz))) continue;
          // resolve against this block depending on axis & direction
          if (axis === 'x') {
            if (delta > 0) this.pos.x = bx - HALF_W - 1e-4;
            else this.pos.x = bx + 1 + HALF_W + 1e-4;
            this.vel.x = 0;
          } else if (axis === 'z') {
            if (delta > 0) this.pos.z = bz - HALF_W - 1e-4;
            else this.pos.z = bz + 1 + HALF_W + 1e-4;
            this.vel.z = 0;
          } else {
            if (delta > 0) {
              this.pos.y = by - P_HEIGHT - 1e-4;
            } else {
              this.pos.y = by + 1 + 1e-4;
              this.onGround = true;
            }
            this.vel.y = 0;
          }
          return; // resolved; single-block clamp is enough per axis step
        }
      }
    }
  }

  eyePosition(out) {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  applyToCamera(camera) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    this.eyePosition(camera.position);
  }

  // voxel DDA raycast (Amanatides & Woo). Returns hit block cell plus the
  // adjacent cell for placement; skips air & water.
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
      if (id !== B.AIR && !isWater(id)) {
        return { hit: true, x, y, z, px, py, pz, id };
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

  lookVector(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // does the player's AABB intersect a block cell?
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
