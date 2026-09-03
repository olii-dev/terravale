// World = chunk data cache + edit overlay. getBlock falls back to pure
// worldgen when a chunk isn't materialized yet (physics & meshing need
// this at chunk borders), and always honors edits.

import { createWorldgen, CHUNK, HEIGHT } from './worldgen.js';
import { B } from './blocks.js';

export { CHUNK, HEIGHT };

export class World {
  constructor(seed) {
    this.seed = seed;
    this.worldgen = createWorldgen(seed);
    this.chunks = new Map();          // "cx,cz" -> Uint8Array
    this.edits = new Map();           // "x,y,z" -> block id
    this.dirtyChunks = new Set();     // keys needing remesh
  }

  key(cx, cz) { return cx + ',' + cz; }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    let data = this.chunks.get(k);
    if (!data) {
      data = this.worldgen.generateChunk(cx, cz);
      // re-apply any edits inside this chunk (it may have been unloaded)
      if (this.edits.size) {
        for (const [ek, id] of this.edits) {
          const [ex, ey, ez] = ek.split(',').map(Number);
          if ((ex >> 4) === cx && (ez >> 4) === cz && ey >= 0 && ey < HEIGHT) {
            data[(ey * CHUNK + (ez - cz * CHUNK)) * CHUNK + (ex - cx * CHUNK)] = id;
          }
        }
      }
      this.chunks.set(k, data);
    }
    return data;
  }

  hasChunk(cx, cz) { return this.chunks.has(this.key(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0 || y >= HEIGHT) return y < 0 ? B.BEDROCK : B.AIR;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const e = this.edits.get(x + ',' + y + ',' + z);
    if (e !== undefined) return e;
    const cx = x >> 4, cz = z >> 4;
    const data = this.chunks.get(this.key(cx, cz));
    if (data) return data[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)];
    // unmaterialized: query pure worldgen (rare — borders/far queries)
    const h = this.worldgen.heightAt(x, z);
    const biome = this.worldgen.biomeAt(x, z);
    return this.worldgen.terrainBlock(x, y, z, h, biome);
  }

  // returns list of chunk keys affected
  setBlock(x, y, z, id) {
    if (y < 1 || y >= HEIGHT) return [];
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    this.edits.set(x + ',' + y + ',' + z, id);
    const cx = x >> 4, cz = z >> 4;
    const data = this.chunks.get(this.key(cx, cz));
    if (data) data[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)] = id;

    const affected = [this.key(cx, cz)];
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0) affected.push(this.key(cx - 1, cz));
    if (lx === CHUNK - 1) affected.push(this.key(cx + 1, cz));
    if (lz === 0) affected.push(this.key(cx, cz - 1));
    if (lz === CHUNK - 1) affected.push(this.key(cx, cz + 1));
    for (const k of affected) this.dirtyChunks.add(k);
    return affected;
  }

  serializeEdits() {
    const out = [];
    for (const [k, id] of this.edits) out.push(k + ':' + id);
    return out.join(';');
  }

  loadEdits(str) {
    this.edits.clear();
    if (!str) return;
    for (const part of str.split(';')) {
      if (!part) continue;
      const [k, id] = part.split(':');
      this.edits.set(k, +id);
    }
  }

  editsArray() {
    const out = [];
    for (const [k, id] of this.edits) {
      const [x, y, z] = k.split(',').map(Number);
      out.push([x, y, z, id]);
    }
    return out;
  }

  applyEditsArray(arr) {
    for (const [x, y, z, id] of arr) {
      this.edits.set(x + ',' + y + ',' + z, id);
      const cx = x >> 4, cz = z >> 4;
      const data = this.chunks.get(this.key(cx, cz));
      if (data) data[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)] = id;
      this.dirtyChunks.add(this.key(cx, cz));
    }
  }
}
