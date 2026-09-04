// World = chunk data cache + edit overlay + container storage. getBlock
// falls back to pure worldgen when a chunk isn't materialized yet.

import { createWorldgen, CHUNK, HEIGHT } from './worldgen.js';
import { B, BLOCKS, isReplaceable } from './blocks.js';

export { CHUNK, HEIGHT };

export class World {
  constructor(seed) {
    this.seed = seed;
    this.worldgen = createWorldgen(seed);
    this.chunks = new Map();      // "cx,cz" -> { data, maxY }
    this.edits = new Map();       // "x,y,z" -> block id
    this.dirtyChunks = new Set();
    this.containers = new Map();  // "x,y,z" -> container object (chest/furnace)
    this.gamemode = 'survival';
    this.difficulty = 'normal';
    this.spawn = null;
    this.maxYs = new Map();       // "cx,cz" -> int (highest non-air + 1)
  }

  key(cx, cz) { return cx + ',' + cz; }
  ckey(x, y, z) { return x + ',' + y + ',' + z; }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    let entry = this.chunks.get(k);
    if (!entry) {
      const g = this.worldgen.generateChunk(cx, cz);
      entry = { data: g.data, maxY: g.maxY };
      // re-apply edits inside this chunk (it may have been unloaded)
      if (this.edits.size) {
        for (const [ek, id] of this.edits) {
          const ci = ek.indexOf(',');
          const cj = ek.indexOf(',', ci + 1);
          const ex = +ek.slice(0, ci), ey = +ek.slice(ci + 1, cj), ez = +ek.slice(cj + 1);
          if ((ex >> 4) === cx && (ez >> 4) === cz && ey >= 0 && ey < HEIGHT) {
            entry.data[(ey * CHUNK + (ez - cz * CHUNK)) * CHUNK + (ex - cx * CHUNK)] = id;
            if (id !== B.AIR && ey + 1 > entry.maxY) entry.maxY = ey + 1;
          }
        }
      }
      this.chunks.set(k, entry);
    }
    return entry;
  }

  hasChunk(cx, cz) { return this.chunks.has(this.key(cx, cz)); }

  chunkMaxY(cx, cz) { return this.maxYs.get(this.key(cx, cz)) ?? this.chunks.get(this.key(cx, cz))?.maxY ?? HEIGHT; }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const e = this.edits.get(this.ckey(x, y, z));
    if (e !== undefined) return e;
    const cx = x >> 4, cz = z >> 4;
    const entry = this.chunks.get(this.key(cx, cz));
    if (entry) return entry.data[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)];
    const h = this.worldgen.heightAt(x, z);
    const biome = this.worldgen.biomeAt(x, z);
    return this.worldgen.terrainBlock(x, y, z, h, biome);
  }

  // returns list of chunk keys affected
  setBlock(x, y, z, id) {
    if (y < 1 || y >= HEIGHT) return [];
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const oldId = this.getBlock(x, y, z);
    this.edits.set(this.ckey(x, y, z), id);
    const cx = x >> 4, cz = z >> 4;
    const entry = this.chunks.get(this.key(cx, cz));
    if (entry) {
      entry.data[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)] = id;
      if (id !== B.AIR && y + 2 > entry.maxY) entry.maxY = y + 2;
    }
    this.onBlockChanged?.(x, y, z, id, oldId);
    this.onBlockChanged2?.(x, y, z, id);

    const affected = [this.key(cx, cz)];
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0) affected.push(this.key(cx - 1, cz));
    if (lx === CHUNK - 1) affected.push(this.key(cx + 1, cz));
    if (lz === 0) affected.push(this.key(cx, cz - 1));
    if (lz === CHUNK - 1) affected.push(this.key(cx, cz + 1));
    for (const k of affected) this.dirtyChunks.add(k);
    return affected;
  }

  // remove the container tied to a block (on break)
  removeContainer(x, y, z) {
    this.containers.delete(this.ckey(x, y, z));
  }

  getContainer(x, y, z) {
    return this.containers.get(this.ckey(x, y, z));
  }

  ensureContainer(x, y, z, type) {
    const k = this.ckey(x, y, z);
    let c = this.containers.get(k);
    if (!c) {
      if (type === 'chest') {
        c = { type, slots: new Array(27).fill(null) };
      } else {
        c = { type, in: null, fuel: null, out: null, burnT: 0, burnMax: 0, cookT: 0 };
      }
      this.containers.set(k, c);
    }
    return c;
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
      const sep = part.lastIndexOf(':');
      if (sep < 0) continue;
      this.edits.set(part.slice(0, sep), +part.slice(sep + 1));
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
      this.edits.set(this.ckey(x, y, z), id);
      const cx = x >> 4, cz = z >> 4;
      const entry = this.chunks.get(this.key(cx, cz));
      if (entry) {
        entry.data[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)] = id;
        if (id !== B.AIR && y + 2 > entry.maxY) entry.maxY = y + 2;
      }
      this.dirtyChunks.add(this.key(cx, cz));
    }
  }

  serializeContainers() {
    const out = [];
    for (const [k, c] of this.containers) {
      if (c.type === 'chest') out.push([k, c.type, c.slots]);
      else out.push([k, c.type, { in: c.in, fuel: c.fuel, out: c.out, burnT: c.burnT, burnMax: c.burnMax, cookT: c.cookT }]);
    }
    return out;
  }

  loadContainers(arr) {
    this.containers.clear();
    for (const [k, type, data] of arr || []) {
      if (type === 'chest') this.containers.set(k, { type, slots: data });
      else this.containers.set(k, { type, ...data });
    }
  }

  spawnPoint() {
    if (!this.spawn) this.spawn = this.worldgen.spawnPoint();
    return this.spawn;
  }
}

export { isReplaceable, BLOCKS };
