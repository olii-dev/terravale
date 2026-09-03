// Chunk manager: streams chunk meshes in/out around the player with a
// per-frame time budget. Owns the three shared materials (day/night
// brightness is applied to them globally).

import * as THREE from 'three';
import { CHUNK } from './worldgen.js';
import { buildChunkGeometry } from './mesher.js';
import { buildAtlas } from './textures.js';

export class ChunkManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.radius = 4;
    this.entries = new Map(); // key -> { meshes: [], key, cx, cz }
    this.queue = [];
    this.lastCenter = null;

    const atlas = buildAtlas();
    this.materials = {
      opaque: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true }),
      cutout: new THREE.MeshBasicMaterial({
        map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide,
      }),
      water: new THREE.MeshBasicMaterial({
        map: atlas, vertexColors: true, transparent: true, opacity: 0.8,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    };
  }

  setRadius(r) { this.radius = r; }

  key(cx, cz) { return cx + ',' + cz; }

  update(px, pz, budgetMs = 6) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const r = this.radius;

    if (this.lastCenter === null || this.lastCenter[0] !== ccx || this.lastCenter[1] !== ccz) {
      this.lastCenter = [ccx, ccz];
      this.rebuildQueue(ccx, ccz, r);
      this.unloadFar(ccx, ccz, r + 2);
    }

    // remesh dirty chunks right away (block edits) — small and urgent
    if (this.world.dirtyChunks.size) {
      for (const k of [...this.world.dirtyChunks]) {
        this.world.dirtyChunks.delete(k);
        if (this.entries.has(k)) this.buildChunk(...k.split(',').map(Number));
      }
    }

    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const { cx, cz } = this.queue.shift();
      const k = this.key(cx, cz);
      if (this.entries.has(k)) continue;
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > r) continue;
      this.buildChunk(cx, cz);
    }
  }

  rebuildQueue(ccx, ccz, r) {
    const list = [];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (!this.entries.has(this.key(cx, cz))) list.push({ cx, cz, d: dx * dx + dz * dz });
    }
    list.sort((a, b) => a.d - b.d);
    this.queue = list;
  }

  buildChunk(cx, cz) {
    const k = this.key(cx, cz);
    this.disposeEntry(k);

    // make sure neighbor data exists so border faces mesh fast & correct
    this.world.ensureChunk(cx, cz);
    this.world.ensureChunk(cx + 1, cz);
    this.world.ensureChunk(cx - 1, cz);
    this.world.ensureChunk(cx, cz + 1);
    this.world.ensureChunk(cx, cz - 1);

    const geos = buildChunkGeometry(this.world, cx, cz);
    const meshes = [];
    const add = (geo, mat, order) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx * CHUNK, 0, cz * CHUNK);
      m.renderOrder = order;
      this.group.add(m);
      meshes.push(m);
    };
    add(geos.opaque, this.materials.opaque, 0);
    add(geos.cutout, this.materials.cutout, 1);
    add(geos.water, this.materials.water, 2);

    this.entries.set(k, { meshes, cx, cz });
  }

  disposeEntry(k) {
    const e = this.entries.get(k);
    if (!e) return;
    for (const m of e.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.entries.delete(k);
  }

  unloadFar(ccx, ccz, maxR) {
    for (const [k, e] of this.entries) {
      if (Math.max(Math.abs(e.cx - ccx), Math.abs(e.cz - ccz)) > maxR) {
        this.disposeEntry(k);
      }
    }
    // bound cached chunk data too (edits survive in the overlay)
    for (const k of this.world.chunks.keys()) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > maxR + 2) {
        this.world.chunks.delete(k);
      }
    }
  }

  pending() { return this.queue.length; }

  setBrightness(b) {
    this.materials.opaque.color.setScalar(b);
    this.materials.cutout.color.setScalar(b);
    this.materials.water.color.setScalar(b);
  }

  dispose() {
    for (const k of [...this.entries.keys()]) this.disposeEntry(k);
    this.scene.remove(this.group);
  }
}
