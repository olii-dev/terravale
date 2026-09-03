// Voxel lighting v3: per-chunk sky light (single channel) + COLORED block
// light (three channels: warm torches, red lava, golden glowstone) with
// BFS flood propagation across chunk borders. Incremental relight on edits
// uses the classic remove-then-repropagate algorithm per channel.

import { CHUNK, HEIGHT } from './worldgen.js';
import { B, isOpaque, BLOCKS } from './blocks.js';

const ATT_WATER = 2;   // extra falloff through water/lava
const DIRECT_SKY = 15;

function attenuation(id) {
  if (id === B.AIR) return 0;
  // leaves diffuse light (attenuate by 1) instead of blocking it — else
  // canopies render pitch black underneath
  if (id >= B.OAK_LEAVES && id <= B.SPRUCE_LEAVES) return 1;
  if (isOpaque(id)) return 99;       // blocks light entirely
  if (id === B.WATER || id === B.LAVA) return 1 + ATT_WATER;
  return 1;                          // plants, glass, torches
}

// emission color of a block, scaled 0..15 per channel
function emitterRGB(id) {
  const bl = BLOCKS[id];
  if (!bl || !bl.light) return null;
  const c = bl.lightColor ?? [1, 1, 1];
  return [bl.light * c[0], bl.light * c[1], bl.light * c[2]];
}

export class Lighting {
  constructor(world) {
    this.world = world;
    this.maps = new Map(); // chunk key -> { sky, br, bg, bb }
    this.touched = new Set(); // chunks whose light arrays changed
    world.onBlockChanged = (x, y, z, newId, oldId) => this.onBlockChanged(x, y, z, newId, oldId);
  }

  key(cx, cz) { return cx + ',' + cz; }

  ensureMaps(cx, cz) {
    const k = this.key(cx, cz);
    let m = this.maps.get(k);
    if (!m) {
      m = {
        sky: new Uint8Array(CHUNK * CHUNK * HEIGHT),
        br: new Uint8Array(CHUNK * CHUNK * HEIGHT),
        bg: new Uint8Array(CHUNK * CHUNK * HEIGHT),
        bb: new Uint8Array(CHUNK * CHUNK * HEIGHT),
      };
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

  // block light as normalized RGB triple
  getBlockRGB(x, y, z, out) {
    if (y < 0 || y >= HEIGHT) return (out[0] = out[1] = out[2] = 0);
    const m = this.maps.get(this.key(x >> 4, z >> 4));
    if (!m) return (out[0] = out[1] = out[2] = 0);
    const i = this.#local(x, y, z, x >> 4, z >> 4);
    out[0] = m.br[i] / 15;
    out[1] = m.bg[i] / 15;
    out[2] = m.bb[i] / 15;
    return out;
  }

  // max channel, for spawn checks
  getBlockLight(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    const m = this.maps.get(this.key(x >> 4, z >> 4));
    if (!m) return 0;
    const i = this.#local(x, y, z, x >> 4, z >> 4);
    return Math.max(m.br[i], m.bg[i], m.bb[i]);
  }

  #setSky(x, y, z, v) {
    const cx = x >> 4, cz = z >> 4;
    this.touched.add(this.key(cx, cz));
    const m = this.maps.get(this.key(cx, cz));
    if (m) m.sky[this.#local(x, y, z, cx, cz)] = v;
  }

  #setBlockRGB(x, y, z, r, g, b) {
    const cx = x >> 4, cz = z >> 4;
    this.touched.add(this.key(cx, cz));
    const m = this.maps.get(this.key(cx, cz));
    if (!m) return;
    const i = this.#local(x, y, z, cx, cz);
    m.br[i] = r; m.bg[i] = g; m.bb[i] = b;
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

    const addQ = [];    // sky spread queue: [x,y,z]
    const addQL = [];   // block light queue: [x,y,z]

    // 1) sky columns + emitters
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        let level = DIRECT_SKY;
        for (let y = HEIGHT - 1; y >= 0; y--) {
          const id = data[(y * CHUNK + lz) * CHUNK + lx];
          if (level > 0) {
            let att;
            if (id === B.AIR) att = 0;
            else if (id >= B.OAK_LEAVES && id <= B.SPRUCE_LEAVES) att = 1;
            else if (id === B.WATER || id === B.LAVA) att = 3;
            else if (isOpaque(id)) att = 99;
            else att = 1;
            level = att >= 99 ? 0 : Math.max(0, level - att);
            this.#setSky(x0 + lx, y, z0 + lz, level);
            if (level > 1) addQ.push(x0 + lx, y, z0 + lz);
          } else {
            this.#setSky(x0 + lx, y, z0 + lz, 0);
          }
          const emit = emitterRGB(id);
          if (emit) {
            this.#setBlockRGB(x0 + lx, y, z0 + lz, emit[0], emit[1], emit[2]);
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

    this.#spreadSky(addQ);
    this.#spreadBlock(addQL);
  }

  #spreadSky(queue) {
    const world = this.world;
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++];
      const level = this.getSky(x, y, z);
      if (level <= 1) continue;
      for (let f = 0; f < 6; f++) {
        const nx = x + NX[f], ny = y + NY[f], nz = z + NZ[f];
        if (ny < 0 || ny >= HEIGHT) continue;
        const cx = nx >> 4, cz = nz >> 4;
        if (!this.maps.has(this.key(cx, cz))) continue; // not loaded
        const nid = world.getBlock(nx, ny, nz);
        const att = attenuation(nid);
        if (att >= 99) continue;
        const nl = level - att;
        if (nl > this.getSky(nx, ny, nz)) {
          this.#setSky(nx, ny, nz, nl);
          if (nl > 1) queue.push(nx, ny, nz);
        }
      }
      if (queue.length > 200000) { queue.splice(0, head); head = 0; }
    }
  }

  // block light spreads per channel; a cell's channels advance independently
  #spreadBlock(queue) {
    const world = this.world;
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++];
      const m = this.maps.get(this.key(x >> 4, z >> 4));
      if (!m) continue;
      const i = this.#local(x, y, z, x >> 4, z >> 4);
      const cr = m.br[i], cg = m.bg[i], cb = m.bb[i];
      if (Math.max(cr, cg, cb) <= 1) continue;
      for (let f = 0; f < 6; f++) {
        const nx = x + NX[f], ny = y + NY[f], nz = z + NZ[f];
        if (ny < 0 || ny >= HEIGHT) continue;
        const cx = nx >> 4, cz = nz >> 4;
        if (!this.maps.has(this.key(cx, cz))) continue;
        const nid = world.getBlock(nx, ny, nz);
        const att = attenuation(nid);
        if (att >= 99) continue;
        const nm = this.maps.get(this.key(cx, cz));
        const ni = this.#local(nx, ny, nz, cx, cz);
        const dr = Math.max(0, cr - att), dg = Math.max(0, cg - att), db = Math.max(0, cb - att);
        let pushed = false;
        if (dr > nm.br[ni]) { nm.br[ni] = dr; pushed = true; }
        if (dg > nm.bg[ni]) { nm.bg[ni] = dg; pushed = true; }
        if (db > nm.bb[ni]) { nm.bb[ni] = db; pushed = true; }
        if (pushed && Math.max(dr, dg, db) > 1) queue.push(nx, ny, nz);
      }
      if (queue.length > 240000) { queue.splice(0, head); head = 0; }
    }
  }

  // ---- incremental updates on block edits ----
  onBlockChanged(x, y, z, newId, oldId) {
    const world = this.world;
    const affected = new Set();
    this.touched.clear();

    const mark = (px, py, pz) => {
      affected.add(world.key(px >> 4, pz >> 4));
    };

    // recompute the whole sky column (cheap: 128 cells)
    this.#recomputeSkyColumn(x, z, mark);

    // block light: remove old contribution, then add the new one
    if (this.getBlockLight(x, y, z) > 0) {
      this.#removeBlockLight(x, y, z, mark);
    }
    const emit = emitterRGB(newId);
    if (emit) {
      this.#setBlockRGB(x, y, z, emit[0], emit[1], emit[2]);
      this.#spreadBlock([x, y, z]);
      mark(x, y, z);
    }
    if (!isOpaque(newId)) {
      // opened up: let neighbors' light flow in
      const q = [];
      for (let f = 0; f < 6; f++) q.push(x + NX[f], y + NY[f], z + NZ[f]);
      this.#spreadBlock(q);
      this.#spreadSky(q);
      mark(x, y, z);
    }
    if (isOpaque(newId)) {
      this.#removeBlockLight(x, y, z, mark);
      mark(x, y, z);
    }

    for (const k of affected) world.dirtyChunks.add(k);
    // light that spread into neighbor chunks must remesh those too, or the
    // edited chunk renders bright while its stale neighbors stay dark
    for (const k of this.touched) world.dirtyChunks.add(k);
    this.touched.clear();
  }

  #recomputeSkyColumn(x, z, mark) {
    let level = DIRECT_SKY;
    const q = [];
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const id = this.world.getBlock(x, y, z);
      let att;
      if (id === B.AIR) att = 0;
      else if (id >= B.OAK_LEAVES && id <= B.SPRUCE_LEAVES) att = 1;
      else if (id === B.WATER || id === B.LAVA) att = 3;
      else if (isOpaque(id)) att = 99;
      else att = 1;
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
    this.#spreadSky(q);
    mark(x, z);
  }

  // two-phase removal for all three channels at once: darken everything fed
  // by this cell, then re-propagate from the surviving perimeter
  #removeBlockLight(x, y, z, mark) {
    const start = this.getBlockLight(x, y, z);
    if (start === 0) return;
    this.#setBlockRGB(x, y, z, 0, 0, 0);

    const darkQ = [[x, y, z, start]];
    const relightQ = [];
    let head = 0;
    while (head < darkQ.length) {
      const [qx, qy, qz, ql] = darkQ[head++];
      for (let f = 0; f < 6; f++) {
        const nx = qx + NX[f], ny = qy + NY[f], nz = qz + NZ[f];
        if (ny < 0 || ny >= HEIGHT) continue;
        if (!this.maps.has(this.key(nx >> 4, nz >> 4))) continue;
        const nl = this.getBlockLight(nx, ny, nz);
        if (nl === 0) continue;
        if (nl < ql) {
          this.#setBlockRGB(nx, ny, nz, 0, 0, 0);
          darkQ.push([nx, ny, nz, nl]);
          mark(nx, ny, nz);
        } else {
          relightQ.push(nx, ny, nz);
        }
      }
    }
    this.#spreadBlock(relightQ);
    mark(x, y, z);
  }
}

const NX = [1, -1, 0, 0, 0, 0];
const NY = [0, 0, 1, -1, 0, 0];
const NZ = [0, 0, 0, 0, 1, -1];
