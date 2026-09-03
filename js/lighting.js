// Voxel lighting: per-chunk sky + block light arrays with BFS flood
// propagation across chunk borders. Sky light columns pass straight down
// through air; everything else spreads with distance falloff. Incremental
// relight on edits uses the classic remove-then-repropagate algorithm.

import { CHUNK, HEIGHT } from './worldgen.js';
import { B, isOpaque, lightOf } from './blocks.js';

const ATT_WATER = 2;   // extra falloff through water/lava
const DIRECT_SKY = 15;

function attenuation(id) {
  if (id === B.AIR) return 0;
  if (isOpaque(id)) return 99;       // blocks light entirely
  if (id === B.WATER || id === B.LAVA) return 1 + ATT_WATER;
  return 1;                          // plants, glass, torches
}

export class Lighting {
  constructor(world) {
    this.world = world;
    this.maps = new Map(); // chunk key -> { sky, block }
    world.onBlockChanged = (x, y, z, newId, oldId) => this.onBlockChanged(x, y, z, newId, oldId);
  }

  key(cx, cz) { return cx + ',' + cz; }

  ensureMaps(cx, cz) {
    const k = this.key(cx, cz);
    let m = this.maps.get(k);
    if (!m) {
      m = { sky: new Uint8Array(CHUNK * CHUNK * HEIGHT), block: new Uint8Array(CHUNK * CHUNK * HEIGHT) };
      this.maps.set(k, m);
    }
    return m;
  }

  hasMaps(cx, cz) { return this.maps.has(this.key(cx, cz)); }

  #local(x, y, z, cx, cz) {
    return (y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK);
  }

  getSky(x, y, z) {
    if (y < 0) return 0;
    if (y >= HEIGHT) return DIRECT_SKY;
    const m = this.maps.get(this.key(x >> 4, z >> 4));
    if (!m) {
      // no light data yet: estimate from the heightmap instead of returning
      // full sky (a bright lie that poisons spreads and border meshes)
      return y >= this.world.worldgen.heightAt(x, z) ? DIRECT_SKY : 0;
    }
    return m.sky[this.#local(x, y, z, x >> 4, z >> 4)];
  }

  getBlockLight(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    const m = this.maps.get(this.key(x >> 4, z >> 4));
    if (!m) return 0;
    return m.block[this.#local(x, y, z, x >> 4, z >> 4)];
  }

  #setSky(x, y, z, v) {
    const m = this.maps.get(this.key(x >> 4, z >> 4));
    if (m) m.sky[this.#local(x, y, z, x >> 4, z >> 4)] = v;
  }

  #setBlockLight(x, y, z, v) {
    const m = this.maps.get(this.key(x >> 4, z >> 4));
    if (m) m.block[this.#local(x, y, z, x >> 4, z >> 4)] = v;
  }

  // drop light arrays for unloaded chunks (regenerated on demand)
  dropChunk(cx, cz) {
    this.maps.delete(this.key(cx, cz));
  }

  // ---- initial lighting for a freshly generated chunk ----
  initChunk(cx, cz) {
    this.ensureMaps(cx, cz);
    const world = this.world;
    const data = world.ensureChunk(cx, cz).data;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    const addQ = [];   // spread queue: [x,y,z]
    const addQL = [];  // block light queue

    // 1) sky columns + emitters
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        let level = DIRECT_SKY;
        for (let y = HEIGHT - 1; y >= 0; y--) {
          const id = data[(y * CHUNK + lz) * CHUNK + lx];
          if (level > 0) {
            const att = id === B.AIR ? 0 : (id === B.WATER || id === B.LAVA ? 3 : (isOpaque(id) ? 99 : 1));
            level = att >= 99 ? 0 : Math.max(0, level - att);
            this.#setSky(x0 + lx, y, z0 + lz, level);
            if (level > 1) addQ.push(x0 + lx, y, z0 + lz);
          } else {
            this.#setSky(x0 + lx, y, z0 + lz, 0);
          }
          const emit = lightOf(id);
          if (emit > 0) {
            this.#setBlockLight(x0 + lx, y, z0 + lz, emit);
            addQL.push(x0 + lx, y, z0 + lz);
          }
        }
      }
    }

    // 2) seed from loaded neighbors' border cells so light flows both ways
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!world.hasChunk(cx + dx, cz + dz) || !this.hasMaps(cx + dx, cz + dz)) continue;
      for (let t = 0; t < CHUNK; t++) {
        for (let y = 0; y < HEIGHT; y++) {
          const nx = dx === 1 ? x0 + CHUNK : dx === -1 ? x0 - 1 : x0 + t;
          const nz = dz === 1 ? z0 + CHUNK : dz === -1 ? z0 - 1 : z0 + t;
          if (this.getSky(nx, y, nz) > 1) addQ.push(nx, y, nz);
          if (this.getBlockLight(nx, y, nz) > 1) addQL.push(nx, y, nz);
        }
      }
    }

    this.#spread(addQ, true);
    this.#spread(addQL, false);
  }

  #spread(queue, sky) {
    const get = sky ? this.getSky.bind(this) : this.getBlockLight.bind(this);
    const set = sky ? this.#setSky.bind(this) : this.#setBlockLight.bind(this);
    const world = this.world;
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++];
      const level = get(x, y, z);
      if (level <= 1) continue;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= HEIGHT) continue;
        const cx = nx >> 4, cz = nz >> 4;
        if (!this.maps.has(this.key(cx, cz))) continue; // not loaded
        const nid = world.getBlock(nx, ny, nz);
        const att = attenuation(nid);
        if (att >= 99) continue;
        const nl = level - att;
        if (nl > get(nx, ny, nz)) {
          set(nx, ny, nz, nl);
          if (nl > 1) queue.push(nx, ny, nz);
        }
      }
      if (queue.length > 200000) queue.splice(0, head), head = 0; // bound memory
    }
  }

  // ---- incremental updates on block edits ----
  onBlockChanged(x, y, z, newId, oldId) {
    const world = this.world;
    const affected = new Set();

    const mark = (px, py, pz) => {
      affected.add(world.key(px >> 4, pz >> 4));
    };

    // recompute the whole sky column (cheap: 128 cells)
    this.#recomputeSkyColumn(x, z, mark);

    // block light: handle emitters and occluders
    const oldEmit = lightOf(oldId ?? 0);
    const newEmit = lightOf(newId);
    if (oldEmit > 0 || (isOpaque(oldId ?? 0) && this.getBlockLight(x, y, z) > 0)) {
      this.#removeLight(x, y, z, false, mark);
    }
    if (newEmit > 0) {
      this.#setBlockLight(x, y, z, newEmit);
      this.#spread([x, y, z], false);
      mark(x, y, z);
    }
    if (!isOpaque(newId) && newEmit === 0) {
      // opened up (or transparent): let neighbors' light flow in
      const q = [];
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        q.push(nx, ny, nz);
      }
      this.#spread(q, false);
      this.#spread(q, true);
      mark(x, y, z);
    }
    if (isOpaque(newId)) {
      this.#removeLight(x, y, z, false, mark);
      mark(x, y, z);
    }

    for (const k of affected) world.dirtyChunks.add(k);
  }

  #recomputeSkyColumn(x, z, mark) {
    let level = DIRECT_SKY;
    const q = [];
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const id = this.world.getBlock(x, y, z);
      const att = id === B.AIR ? 0 : (id === B.WATER || id === B.LAVA ? 3 : (isOpaque(id) ? 99 : 1));
      level = att >= 99 ? 0 : Math.max(0, level - att);
      this.#setSky(x, y, z, level);
      if (level > 1) q.push(x, y, z);
    }
    // pull lateral light into the column from mapped neighbors only
    for (let y = 0; y < HEIGHT; y++) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!this.maps.has(this.key(nx >> 4, nz >> 4))) continue;
        q.push(nx, y, nz);
      }
    }
    this.#spread(q, true);
    mark(x, z);
  }

  // standard two-phase removal: darken everything fed by this cell, then
  // re-propagate from the surviving perimeter
  #removeLight(x, y, z, sky, mark) {
    const get = sky ? this.getSky.bind(this) : this.getBlockLight.bind(this);
    const set = sky ? this.#setSky.bind(this) : this.#setBlockLight.bind(this);
    const startLevel = get(x, y, z);
    if (startLevel === 0) return;
    set(x, y, z, 0);

    const darkQ = [[x, y, z, startLevel]];
    const relightQ = [];
    let head = 0;
    while (head < darkQ.length) {
      const [qx, qy, qz, ql] = darkQ[head++];
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = qx + dx, ny = qy + dy, nz = qz + dz;
        if (ny < 0 || ny >= HEIGHT) continue;
        if (!this.maps.has(this.key(nx >> 4, nz >> 4))) continue;
        const nl = get(nx, ny, nz);
        if (nl === 0) continue;
        if (nl < ql) {
          set(nx, ny, nz, 0);
          darkQ.push([nx, ny, nz, nl]);
          mark(nx, ny, nz);
        } else {
          relightQ.push(nx, ny, nz);
        }
      }
    }
    this.#spread(relightQ, sky);
    mark(x, y, z);
  }
}

const NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
