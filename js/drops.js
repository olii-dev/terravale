// Item drop entities: mini spinning textured cubes (blocks) or billboard
// sprites (items) with gravity, magnet pickup and merging. The host is
// authoritative; clients mirror the broadcast state.

import * as THREE from 'three';
import { BLOCKS, B } from './blocks.js';
import { maxStack, canMerge } from './items.js';
import { moveEntity } from './physics.js';
import { buildAtlas, uvRect } from './textures.js';
import { itemTexture } from './sprites.js';

let dropMat = null;
function getDropMaterial() {
  if (!dropMat) {
    dropMat = new THREE.MeshBasicMaterial({ map: buildAtlas() });
  }
  return dropMat;
}

// small cube with correct per-face atlas UVs (also used by the held-item view)
export function buildBlockMesh(blockId, size = 0.3) {
  const bl = BLOCKS[blockId];
  const geo = new THREE.BoxGeometry(size, size, size);
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const rect = uvRect(bl.faceTiles[f]);
    const corners = [
      [rect[0], rect[3]], [rect[2], rect[3]],
      [rect[0], rect[1]], [rect[2], rect[1]],
    ];
    for (let v = 0; v < 4; v++) {
      uv.setXY(f * 4 + v, corners[v][0], corners[v][1]);
    }
  }
  uv.needsUpdate = true;
  return new THREE.Mesh(geo, getDropMaterial());
}

function buildSpriteMesh(itemId, size = 0.36) {
  const mat = new THREE.MeshBasicMaterial({
    map: itemTexture(itemId), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(size, size);
  return new THREE.Mesh(geo, mat);
}

let NEXT_ID = 1;

export class Drops {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.map = new Map(); // id -> entity
    this.isHost = true;
    this.onPickup = null;   // host: (stack) => bool (did it fit?)
    this.onPickupRequest = null; // client: (id) => void
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  spawn(stack, x, y, z, vel) {
    const id = NEXT_ID++;
    const e = {
      id,
      stack: { ...stack },
      pos: new THREE.Vector3(x, y, z),
      vel: vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 2.4, 3.4 + Math.random() * 1.2, (Math.random() - 0.5) * 2.4),
      age: 0,
      spin: Math.random() * Math.PI * 2,
      mesh: null,
    };
    this.map.set(id, e);
    this.attach(e);
    return id;
  }

  attach(e) {
    if (e.stack.id < 100 && BLOCKS[e.stack.id] && !BLOCKS[e.stack.id].cross) {
      e.mesh = buildBlockMesh(e.stack.id, 0.3);
    } else {
      e.mesh = buildSpriteMesh(e.stack.id);
    }
    e.mesh.position.copy(e.pos);
    this.group.add(e.mesh);
  }

  remove(id) {
    const e = this.map.get(id);
    if (!e) return;
    this.group.remove(e.mesh);
    e.mesh.geometry.dispose();
    if (e.mesh.material !== dropMat) e.mesh.material.dispose();
    this.map.delete(id);
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  update(dt) {
    for (const e of this.map.values()) {
      e.age += dt;
      // physics only where it matters (host sim; clients get positions)
      if (this.isHost) {
        e.vel.y -= 22 * dt;
        if (e.vel.y < -30) e.vel.y = -30;
        const inLiquid = this.world.getBlock(e.pos.x, e.pos.y, e.pos.z) === B.WATER;
        if (inLiquid) e.vel.y = Math.min(e.vel.y + 30 * dt, 1.2);
        moveEntity(this.world, e, e.vel.x * dt, e.vel.y * dt, e.vel.z * dt, 0.14, 0.28);
        e.vel.x *= (1 - 4 * dt);
        e.vel.z *= (1 - 4 * dt);
        if (this.world.getBlock(e.pos.x, e.pos.y - 0.1, e.pos.z) === B.LAVA) this.remove(e.id);
      }
      e.spin += dt * 2.2;
      if (e.mesh) {
        e.mesh.position.set(e.pos.x, e.pos.y + 0.18 + Math.sin(e.age * 2.4) * 0.05, e.pos.z);
        e.mesh.rotation.y = e.spin;
      }
      if (this.isHost && e.age > 300) this.remove(e.id);
    }

    // periodic merge pass
    if (this.isHost) {
      this.mergeTimer = (this.mergeTimer ?? 0) + dt;
      if (this.mergeTimer > 1.5) {
        this.mergeTimer = 0;
        this.mergeAll();
      }
    }
  }

  mergeAll() {
    const arr = [...this.map.values()].filter((e) => e.stack.count < maxStack(e.stack.id));
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!this.map.has(a.id)) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (!this.map.has(b.id)) continue;
        if (a.stack.id !== b.stack.id || !canMerge(a.stack, b.stack)) continue;
        if (a.pos.distanceToSquared(b.pos) > 1.2) continue;
        const cap = maxStack(a.stack.id);
        const take = Math.min(cap - a.stack.count, b.stack.count);
        if (take <= 0) continue;
        a.stack.count += take;
        b.stack.count -= take;
        if (b.stack.count <= 0) this.remove(b.id);
      }
    }
  }

  // host: collect drops near a player; returns granted stacks
  collect(playerPos, radius = 1.7) {
    const granted = [];
    for (const e of [...this.map.values()]) {
      if (e.age < 0.5) continue;
      const d = e.pos.distanceTo(playerPos);
      if (d < radius) {
        granted.push({ id: e.id, stack: e.stack });
      } else if (d < radius + 1.4) {
        // magnet drift
        const dir = playerPos.clone().sub(e.pos).normalize();
        e.pos.addScaledVector(dir, dt_magnet(d));
      }
    }
    return granted;
  }

  states() {
    const out = [];
    for (const e of this.map.values()) {
      out.push([e.id, e.stack.id, e.stack.count, +e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2)]);
    }
    return out;
  }

  // client: reconcile with host state
  applyStates(list) {
    const seen = new Set();
    for (const [id, itemId, count, x, y, z] of list) {
      seen.add(id);
      let e = this.map.get(id);
      if (!e) {
        e = {
          id, stack: { id: itemId, count },
          pos: new THREE.Vector3(x, y, z),
          vel: new THREE.Vector3(),
          age: 1, spin: 0, mesh: null,
        };
        this.map.set(id, e);
        this.attach(e);
      } else {
        e.stack.id = itemId;
        e.stack.count = count;
        e.target = e.target || new THREE.Vector3();
        e.target.set(x, y, z);
      }
    }
    for (const id of [...this.map.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  // smooth client-side positions toward host targets
  interpolate(dt) {
    for (const e of this.map.values()) {
      if (e.target) e.pos.lerp(e.target, Math.min(1, 10 * dt));
    }
  }
}

function dt_magnet(d) {
  return 0.12 * (1.7 + 1.4 - d);
}
