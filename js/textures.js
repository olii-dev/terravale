// Procedural texture atlas v3: every tile is 32×32, painted with layered
// value-noise ramps (shadow/mid/highlight), edge shading and material
// detail. Deterministic per tile name so all peers match. Also exports
// block icons and the mining crack overlay textures, plus tileColors()
// which samples a tile's palette for break particles.

import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';
import { BLOCKS, WOOL_HEX } from './blocks.js';

export const TILE = 32;
export const ATLAS_COLS = 10;
export const ATLAS_ROWS = 8;

// ---- color helpers ----
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function shade(hex, amt) {
  const [r, g, b] = hex2rgb(hex);
  return `rgb(${clamp255(r + amt)},${clamp255(g + amt)},${clamp255(b + amt)})`;
}
function rgba(hex, a) {
  const [r, g, b] = hex2rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

// ---- layered value noise: smooth fields that make materials read richly ----
function noiseField(rand, octaves = 3) {
  const S = TILE;
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const scale = 4 << o; // 4, 8, 16 lattice cells
    const g = new Float32Array((scale + 1) * (scale + 1));
    for (let i = 0; i < g.length; i++) g[i] = rand();
    layers.push({ scale, g });
  }
  const sampleLayer = (l, x, y) => {
    const fx = (x / S) * l.scale, fy = (y / S) * l.scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const w = l.scale + 1;
    const a = l.g[y0 * w + x0], b = l.g[y0 * w + x0 + 1];
    const c = l.g[(y0 + 1) * w + x0], d = l.g[(y0 + 1) * w + x0 + 1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  return (x, y) => {
    let v = 0, w = 1, norm = 0;
    for (const l of layers) { v += sampleLayer(l, x, y) * w; norm += w; w *= 0.5; }
    return v / norm;
  };
}

// paint a tile from a base palette ramp driven by a noise field
function rampFill(ctx, rand, palette, opts = {}) {
  const f1 = noiseField(rand, opts.octaves ?? 3);
  const f2 = opts.detail ? noiseField(rand, 2) : null;
  const n = palette.length;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let t = f1(x, y);
      if (f2) t = t * 0.8 + f2(x, y) * 0.2;
      const idx = Math.min(n - 1, Math.floor(t * n));
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function fillPx(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
function fillAll(ctx, color) { ctx.fillStyle = color; ctx.fillRect(0, 0, TILE, TILE); }
function speckle(ctx, rand, colors, count) {
  for (let i = 0; i < count; i++) fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), pick(rand, colors));
}
function edgeDarken(ctx, rand, amt = 14) {
  ctx.fillStyle = `rgba(0,0,0,${amt / 255})`;
  ctx.fillRect(0, 0, TILE, 1);
  ctx.fillRect(0, TILE - 1, TILE, 1);
  ctx.fillRect(0, 0, 1, TILE);
  ctx.fillRect(TILE - 1, 0, 1, TILE);
  void rand;
}

const RAMP = {
  dirt: ['#5f4128', '#75543a', '#866043', '#96714f', '#a5825e'],
  grass: ['#4c7a2a', '#5d9034', '#6faa3e', '#7fbc4a', '#8ecb57'],
  stone: ['#6f6f6f', '#7d7d7d', '#8a8a8a', '#969696', '#a3a3a3'],
  sand: ['#c9b983', '#d4c691', '#dbcf9c', '#e3d8a9', '#ebdfb6'],
  snow: ['#dbe4ee', '#e6edf4', '#eff4f9', '#f4f8fb', '#fbfdfe'],
  gravel: ['#58514d', '#6b6460', '#7f7b78', '#8f8b87', '#a09a92'],
};

// ---- tile painters (32×32) ----
const PAINTERS = {
  dirt(ctx, rand) {
    rampFill(ctx, rand, RAMP.dirt, { detail: true });
    speckle(ctx, rand, ['#4a3112', '#5f4128', '#a5825e'], 70);
  },
  grass_top(ctx, rand) {
    rampFill(ctx, rand, RAMP.grass, { detail: true });
    // soft blade tufts (low contrast so tiling doesn't pop)
    for (let i = 0; i < 110; i++) {
      const x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE);
      const c = pick(rand, ['#659838', '#74b043', '#5d9034', '#83c14f']);
      fillPx(ctx, x, y, c);
    }
  },
  grass_side(ctx, rand) {
    PAINTERS.dirt(ctx, rand);
    const f = noiseField(rand, 2);
    for (let x = 0; x < TILE; x++) {
      const d = 4 + Math.floor(f(x, 0) * 5);
      for (let y = 0; y < d; y++) {
        fillPx(ctx, x, y, pick(rand, ['#4c7a2a', '#5d9034', '#6faa3e', '#7fbc4a', '#8ecb57']));
      }
      // hanging blades
      if (rand() < 0.3) fillPx(ctx, x, d, pick(rand, ['#5d9034', '#4c7a2a']));
    }
  },
  grass_side_snow(ctx, rand) {
    PAINTERS.dirt(ctx, rand);
    const f = noiseField(rand, 2);
    for (let x = 0; x < TILE; x++) {
      const d = 4 + Math.floor(f(x, 0) * 4);
      for (let y = 0; y < d; y++) fillPx(ctx, x, y, pick(rand, ['#e6edf4', '#f4f8fb', '#fbfdfe']));
    }
  },
  stone(ctx, rand) {
    rampFill(ctx, rand, RAMP.stone, { detail: true });
    // cracks
    for (let i = 0; i < 4; i++) {
      let x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE);
      const len = 5 + Math.floor(rand() * 9);
      for (let j = 0; j < len; j++) {
        fillPx(ctx, x, y, '#5f5f5f');
        x += Math.floor(rand() * 3) - 1;
        y += Math.floor(rand() * 3) - 1;
        x = Math.max(0, Math.min(TILE - 1, x));
        y = Math.max(0, Math.min(TILE - 1, y));
      }
    }
    speckle(ctx, rand, ['#666666', '#a8a8a8'], 40);
  },
  cobble(ctx, rand) {
    fillAll(ctx, '#4e4e4e');
    const stones = 14;
    for (let i = 0; i < stones; i++) {
      const cx = 2 + Math.floor(rand() * (TILE - 5));
      const cy = 2 + Math.floor(rand() * (TILE - 5));
      const r = 3 + Math.floor(rand() * 4);
      const base = shade('#8a8a8a', Math.floor((rand() * 2 - 1) * 22));
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r + 1) {
          const x = (cx + dx + TILE) % TILE, y = (cy + dy + TILE) % TILE;
          fillPx(ctx, x, y, rand() < 0.2 ? shade(base, -14) : base);
        }
      }
      // highlight top-left of each stone
      for (let dx = -r + 1; dx <= 0; dx++) fillPx(ctx, (cx + dx + TILE) % TILE, (cy - r + TILE) % TILE, shade(base, 18));
    }
    edgeDarken(ctx, rand);
  },
  mossy_cobble(ctx, rand) {
    PAINTERS.cobble(ctx, rand);
    const f = noiseField(rand, 2);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (f(x, y) > 0.55 && rand() < 0.7) fillPx(ctx, x, y, pick(rand, ['#4e6a30', '#5c7a3a', '#42592a', '#6b8a45']));
    }
  },
  bedrock(ctx, rand) {
    for (let y = 0; y < TILE; y += 2) for (let x = 0; x < TILE; x += 2) {
      ctx.fillStyle = pick(rand, ['#2b2b2b', '#3a3a3a', '#4a4a4a', '#575757', '#666666']);
      ctx.fillRect(x, y, 2, 2);
    }
  },
  sand(ctx, rand) {
    rampFill(ctx, rand, RAMP.sand, { detail: true });
    speckle(ctx, rand, ['#bfb27e', '#efe3ba'], 50);
  },
  sandstone_top(ctx, rand) {
    rampFill(ctx, rand, ['#cfc190', '#d8cb96', '#dfd4a3', '#e6dcb0'], { octaves: 2 });
  },
  sandstone_side(ctx, rand) {
    PAINTERS.sandstone_top(ctx, rand);
    for (let y = 0; y < TILE; y++) {
      const amt = y % 9 === 0 ? -18 : (y % 9 === 8 ? 10 : 0);
      if (amt === 0) continue;
      for (let x = 0; x < TILE; x++) fillPx(ctx, x, y, shade('#d8cb96', amt + Math.floor((rand() * 2 - 1) * 6)));
    }
  },
  gravel(ctx, rand) {
    rampFill(ctx, rand, RAMP.gravel, { detail: true });
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand() * (TILE - 3)), y = Math.floor(rand() * (TILE - 3));
      ctx.fillStyle = pick(rand, ['#58514d', '#6b6460', '#8f8b87', '#9b968f', '#5d5a58']);
      ctx.fillRect(x, y, 2 + Math.floor(rand() * 3), 2 + Math.floor(rand() * 2));
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, 2, 1);
    }
  },
  snow(ctx, rand) {
    rampFill(ctx, rand, RAMP.snow, { octaves: 2 });
    speckle(ctx, rand, ['#e6edf3'], 20);
  },
  clay(ctx, rand) {
    rampFill(ctx, rand, ['#8c95a1', '#9aa3ae', '#a5adb8', '#b0b8c2'], { octaves: 2 });
  },
  water(ctx, rand) {
    ctx.fillStyle = rgba('#2450bd', 0.82);
    ctx.fillRect(0, 0, TILE, TILE);
    const f = noiseField(rand, 2);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = f(x, y);
      if (v > 0.62) fillPx(ctx, x, y, rgba('#4a78e0', 0.55));
      else if (v < 0.3) fillPx(ctx, x, y, rgba('#1c3f9a', 0.5));
    }
    for (let i = 0; i < 8; i++) {
      const y = Math.floor(rand() * TILE);
      const x = Math.floor(rand() * (TILE - 10));
      ctx.fillStyle = rgba('#7ba3f0', 0.5);
      ctx.fillRect(x, y, 6 + Math.floor(rand() * 8), 1);
    }
  },
  lava(ctx, rand) {
    rampFill(ctx, rand, ['#8a2c08', '#a83410', '#cf4a12', '#e8741e', '#f2a13c'], { detail: true });
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(rand() * (TILE - 8)), y = Math.floor(rand() * TILE);
      ctx.fillStyle = pick(rand, ['#f7c95c', '#ffe9a8', '#f2a13c']);
      ctx.fillRect(x, y, 5 + Math.floor(rand() * 8), 1 + Math.floor(rand() * 2));
    }
  },
  logSide(bark, dark, light) {
    return (ctx, rand) => {
      fillAll(ctx, bark);
      for (let x = 0; x < TILE; x++) {
        const f = noiseField(rand, 2);
        for (let y = 0; y < TILE; y++) {
          const v = f(x, y);
          if (v > 0.6) fillPx(ctx, x, y, light);
          else if (v < 0.32) fillPx(ctx, x, y, dark);
        }
      }
      // vertical fissures
      for (let x = 0; x < TILE; x += 4 + Math.floor(rand() * 3)) {
        for (let y = 0; y < TILE; y++) if (rand() < 0.85) fillPx(ctx, x, y, dark);
      }
      edgeDarken(ctx, rand, 10);
    };
  },
  logTop(bark, ringLight, ringDark) {
    return (ctx, rand) => {
      fillAll(ctx, ringLight);
      const c = (TILE - 1) / 2;
      for (let r = TILE / 2 - 1; r >= 1; r -= 3) {
        ctx.fillStyle = ((TILE / 2 - r) / 3) % 2 < 1 ? ringDark : ringLight;
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke();
      }
      ctx.strokeStyle = bark; ctx.lineWidth = 3; ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
      // grain speckle
      speckle(ctx, rand, [ringDark, shade(ringLight, -14)], 30);
    };
  },
  leaves(base, dark, bright) {
    return (ctx, rand) => {
      fillAll(ctx, base);
      const f = noiseField(rand, 3);
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const v = f(x, y);
        if (v > 0.62) fillPx(ctx, x, y, bright);
        else if (v < 0.34) fillPx(ctx, x, y, dark);
        else if (rand() < 0.08) fillPx(ctx, x, y, dark);
      }
    };
  },
  planks(base, dark) {
    return (ctx, rand) => {
      rampFill(ctx, rand, [shade(base, -16), base, shade(base, 12), shade(base, 24)], { octaves: 2 });
      ctx.fillStyle = dark;
      for (const y of [7, 15, 23, 31]) ctx.fillRect(0, y, TILE, 1);
      // board end seams + nail dots
      const seams = [[8, 0], [24, 0], [16, 8], [4, 16], [22, 16], [12, 24], [27, 24]];
      for (const [x, y0] of seams) {
        ctx.fillRect(x, y0, 1, 7);
        fillPx(ctx, x - 1, y0 + 1, '#3e2a14');
      }
      // grain streaks
      for (let i = 0; i < 60; i++) {
        const x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE);
        if (y % 8 === 7) continue;
        fillPx(ctx, x, y, rand() < 0.5 ? shade(base, -10) : shade(base, 10));
      }
    };
  },
  ore(stoneRamp, oreColors) {
    return (ctx, rand) => {
      PAINTERS.stone(ctx, rand);
      const clusters = 5 + Math.floor(rand() * 2);
      for (let i = 0; i < clusters; i++) {
        const cx = 3 + Math.floor(rand() * (TILE - 7));
        const cy = 3 + Math.floor(rand() * (TILE - 7));
        const n = 6 + Math.floor(rand() * 7);
        for (let j = 0; j < n; j++) {
          const x = cx + Math.floor((rand() * 2 - 1) * 3);
          const y = cy + Math.floor((rand() * 2 - 1) * 3);
          fillPx(ctx, x, y, pick(rand, oreColors));
        }
        fillPx(ctx, cx, cy, oreColors[0]);
        fillPx(ctx, cx + 1, cy - 1, '#ffffff'); // sparkle
      }
    };
  },
  mineralBlock(base) {
    return (ctx, rand) => {
      rampFill(ctx, rand, [shade(base, -20), shade(base, -8), base, shade(base, 14)], { octaves: 2 });
      ctx.fillStyle = shade(base, 40);
      ctx.fillRect(0, 0, TILE, 2); ctx.fillRect(0, 0, 2, TILE);
      ctx.fillStyle = shade(base, -44);
      ctx.fillRect(0, TILE - 2, TILE, 2); ctx.fillRect(TILE - 2, 0, 2, TILE);
      // corner rivets
      for (const [x, y] of [[4, 4], [TILE - 6, 4], [4, TILE - 6], [TILE - 6, TILE - 6]]) {
        ctx.fillStyle = shade(base, 30);
        ctx.fillRect(x, y, 2, 2);
      }
      void rand;
    };
  },
  brickPattern(brick, mortar) {
    return (ctx, rand) => {
      fillAll(ctx, mortar);
      const bh = 8, bw = 16;
      for (let row = 0; row < TILE / bh; row++) {
        const y = row * bh;
        const offset = row % 2 === 0 ? 0 : 8;
        for (let bx = -bw; bx < TILE + bw; bx += bw) {
          const x = bx + offset;
          const c = shade(brick, Math.floor((rand() * 2 - 1) * 14));
          ctx.fillStyle = c;
          const x0 = Math.max(0, x), x1 = Math.min(TILE, x + bw - 1);
          ctx.fillRect(x0, y, x1 - x0, bh - 1);
          // top highlight
          ctx.fillStyle = shade(c, 16);
          ctx.fillRect(x0, y, x1 - x0, 1);
          // bottom shadow
          ctx.fillStyle = shade(c, -18);
          ctx.fillRect(x0, y + bh - 2, x1 - x0, 1);
        }
      }
    };
  },
  glass(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(205,235,240,0.95)';
    ctx.fillRect(0, 0, TILE, 2); ctx.fillRect(0, TILE - 2, TILE, 2);
    ctx.fillRect(0, 0, 2, TILE); ctx.fillRect(TILE - 2, 0, 2, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(5 + i * 4, 4 + i * 3, 1, 10);
    }
    ctx.fillRect(20, 14, 1, 12); ctx.fillRect(21, 13, 1, 12);
    ctx.fillStyle = 'rgba(160,200,220,0.25)';
    ctx.fillRect(4, 4, TILE - 8, TILE - 8);
  },
  obsidian(ctx, rand) {
    rampFill(ctx, rand, ['#0d0812', '#17101f', '#221736', '#2e1f4a', '#3d2c5e'], { detail: true });
    speckle(ctx, rand, ['#4a3568', '#5e4685', '#7b5fa8'], 24);
    // sheen streaks
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE);
      for (let j = 0; j < 8; j++) {
        fillPx(ctx, x, y, rgba('#7b5fa8', 0.5));
        x += 1; y += Math.floor(rand() * 3) - 1;
      }
    }
  },
  bookshelf(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    const spineColors = ['#a8342f', '#3841a0', '#4a7a24', '#d9c02a', '#7a3ba0', '#d97b2a', '#2f8b8b', '#8a5c3a'];
    for (const y of [5, 20]) {
      let x = 2;
      while (x < TILE - 3) {
        const w = 2 + Math.floor(rand() * 2);
        const c = pick(rand, spineColors);
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, 11);
        ctx.fillStyle = shade(c, 30);
        ctx.fillRect(x, y + 1, w, 1);
        ctx.fillStyle = shade(c, -30);
        ctx.fillRect(x, y + 9, w, 1);
        x += w + (rand() < 0.2 ? 1 : 0);
      }
    }
  },
  wool(base) {
    return (ctx, rand) => {
      rampFill(ctx, rand, [shade(base, -24), shade(base, -10), base, shade(base, 14)], { detail: true });
      for (let i = 0; i < 60; i++) {
        fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), rand() < 0.5 ? shade(base, 22) : shade(base, -22));
      }
      // weave lines
      for (let y = 0; y < TILE; y += 5) {
        for (let x = 0; x < TILE; x++) if (rand() < 0.4) fillPx(ctx, x, y, shade(base, -16));
      }
    };
  },
  flower(petal, center) {
    return (ctx, rand) => {
      ctx.clearRect(0, 0, TILE, TILE);
      ctx.fillStyle = '#3d7a24';
      ctx.fillRect(14, 16, 2, 15); ctx.fillRect(16, 18, 2, 13);
      fillPx(ctx, 12, 22, '#4e9a30'); fillPx(ctx, 11, 23, '#4e9a30');
      fillPx(ctx, 19, 24, '#4e9a30'); fillPx(ctx, 20, 25, '#4e9a30');
      const cx = 15, cy = 10;
      for (const [dx, dy] of [[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,2],[2,-2],[-2,2],[-1,-3],[1,3],[3,1],[-3,-1]]) {
        fillPx(ctx, cx + dx, cy + dy, petal);
      }
      ctx.fillStyle = center;
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      fillPx(ctx, cx - 2, cy - 4, petal); fillPx(ctx, cx + 3, cy + 2, petal);
    };
  },
  tall_grass(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    const blades = 13;
    for (let i = 0; i < blades; i++) {
      let x = 3 + Math.floor(rand() * (TILE - 6));
      const h = 12 + Math.floor(rand() * 16);
      const c = pick(rand, ['#4e7d2a', '#5e9633', '#6faa3e', '#43661f']);
      for (let y = TILE - 1; y > TILE - 1 - h; y--) {
        fillPx(ctx, x, y, c);
        if (rand() < 0.28) x += rand() < 0.5 ? -1 : 1;
        x = Math.max(1, Math.min(TILE - 2, x));
      }
      if (rand() < 0.4) fillPx(ctx, x, TILE - h, shade(c, 20));
    }
  },
  dead_bush(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    const c = '#8a6a3f';
    const branch = (x, y, dx, dy, len) => {
      for (let i = 0; i < len; i++) {
        fillPx(ctx, Math.round(x), Math.round(y), rand() < 0.3 ? '#6e5330' : c);
        x += dx + (rand() - 0.5) * 0.7;
        y += dy + (rand() - 0.5) * 0.5;
      }
    };
    branch(15, 31, 0, -1, 12);
    branch(14, 24, -0.7, -0.8, 10); branch(16, 21, 0.7, -0.8, 10);
    branch(14, 17, -0.4, -1, 8); branch(16, 15, 0.5, -1, 8);
    branch(15, 12, 0.2, -1, 5);
  },
  torch(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#8a6a3f';
    ctx.fillRect(14, 12, 4, 19);
    ctx.fillStyle = '#6e5330';
    ctx.fillRect(14, 12, 2, 19);
    ctx.fillStyle = '#a5825e';
    ctx.fillRect(16, 12, 1, 19);
    // flame
    ctx.fillStyle = '#f7c95c';
    ctx.fillRect(12, 5, 8, 7);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(14, 6, 4, 4);
    ctx.fillStyle = '#e8741e';
    ctx.fillRect(13, 3, 2, 3); ctx.fillRect(17, 3, 2, 3); ctx.fillRect(12, 10, 8, 2);
  },
  table_top(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    ctx.strokeStyle = '#5c4022';
    ctx.lineWidth = 2;
    ctx.strokeRect(4.5, 4.5, TILE - 9, TILE - 9);
    ctx.fillStyle = '#5c4022';
    ctx.fillRect(15, 4, 2, TILE - 8); ctx.fillRect(4, 15, TILE - 8, 2);
    void rand;
  },
  table_side(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    ctx.fillStyle = '#5c4022';
    ctx.fillRect(4, 8, 10, 12);
    ctx.fillStyle = '#8f8a82';
    ctx.fillRect(18, 8, 9, 12);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(20, 10, 5, 4);
    void rand;
  },
  furnace_top(ctx, rand) {
    PAINTERS.stone(ctx, rand);
    ctx.strokeStyle = '#5c5c5c';
    ctx.lineWidth = 2;
    ctx.strokeRect(6.5, 6.5, TILE - 13, TILE - 13);
  },
  furnace_side(ctx, rand) {
    PAINTERS.stone(ctx, rand);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(8, 14, 16, 12);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(8, 14, 16, 2);
    ctx.fillStyle = '#e8741e';
    ctx.fillRect(10, 22, 12, 4);
    ctx.fillStyle = '#f7c95c';
    ctx.fillRect(12, 23, 8, 3); ctx.fillRect(14, 22, 4, 1);
  },
  chest_top(ctx, rand) {
    PAINTERS.planks('#9a6b3a', '#6e4a26')(ctx, rand);
    ctx.strokeStyle = '#5c3d1e';
    ctx.lineWidth = 2;
    ctx.strokeRect(2.5, 2.5, TILE - 5, TILE - 5);
  },
  chest_side(ctx, rand) {
    PAINTERS.planks('#9a6b3a', '#6e4a26')(ctx, rand);
    ctx.fillStyle = '#5c3d1e';
    ctx.fillRect(0, 10, TILE, 2);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(14, 6, 4, 8);
    ctx.fillStyle = '#9c9c9c';
    ctx.fillRect(14, 6, 4, 2);
  },
  glowstone(ctx, rand) {
    rampFill(ctx, rand, ['#8a6a30', '#b8934a', '#d9b45c', '#f2d97a', '#ffe9a8'], { detail: true });
    speckle(ctx, rand, ['#fff7d0', '#fffbe0'], 40);
    speckle(ctx, rand, ['#8a6a30'], 12);
  },
  cactus_top(ctx, rand) {
    rampFill(ctx, rand, ['#2e5c22', '#3d7a2e', '#4e9a3a'], { octaves: 2 });
    ctx.fillStyle = '#5cb046';
    ctx.fillRect(4, 4, TILE - 8, TILE - 8);
    for (let i = 0; i < 60; i++) {
      fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade('#5cb046', Math.floor((rand() * 2 - 1) * 10)));
    }
  },
  cactus_side(ctx, rand) {
    fillAll(ctx, '#2e5c22');
    for (const x of [2, 12, 22]) {
      ctx.fillStyle = '#4e9a3a';
      ctx.fillRect(x, 0, 6, TILE);
      ctx.fillStyle = '#5cb046';
      ctx.fillRect(x + 1, 0, 2, TILE);
    }
    for (let i = 0; i < 18; i++) fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), '#d9e8c4');
  },
  pumpkin_top(ctx, rand) {
    rampFill(ctx, rand, ['#c4691e', '#d97b2a', '#e8913f'], { octaves: 2 });
    ctx.fillStyle = '#6e5330';
    ctx.fillRect(13, 12, 6, 6);
    ctx.fillStyle = '#8a6a3f';
    ctx.fillRect(15, 9, 2, 8);
  },
  door_lower(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    // panel inset + handle
    ctx.strokeStyle = '#5c4022'; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, TILE - 8, TILE - 8);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(TILE - 8, TILE / 2 - 1, 3, 3);
  },
  door_upper(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    ctx.strokeStyle = '#5c4022'; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, TILE - 8, TILE - 8);
    // window
    ctx.fillStyle = '#a8d8e8';
    ctx.fillRect(7, 7, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(8, 8, 3, 3);
  },
  sapling(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    // tiny trunk + leaf blob
    ctx.fillStyle = '#6e5330';
    ctx.fillRect(15, 22, 2, 10);
    ctx.fillStyle = '#4a7a24';
    ctx.fillRect(10, 10, 12, 12);
    ctx.fillStyle = '#5e9633';
    ctx.fillRect(12, 8, 8, 6);
    ctx.fillStyle = '#38611a';
    ctx.fillRect(10, 18, 12, 4);
    ctx.fillStyle = '#6faa3e';
    ctx.fillRect(13, 11, 3, 3);
  },
  farmland_top(ctx, rand) {
    rampFill(ctx, rand, ['#4e3a20', '#5f4128', '#6e5330'], { octaves: 2 });
    // wet furrow rows
    for (let y = 0; y < TILE; y += 8) {
      ctx.fillStyle = 'rgba(20,12,4,0.55)';
      ctx.fillRect(0, y + 3, TILE, 2);
    }
  },
  farmland_side(ctx, rand) {
    PAINTERS.dirt(ctx, rand);
    ctx.fillStyle = '#4e3a20';
    ctx.fillRect(0, 0, TILE, 4);
    for (let x = 0; x < TILE; x += 8) {
      ctx.fillStyle = 'rgba(20,12,4,0.5)';
      ctx.fillRect(x, 0, 4, 4);
    }
  },
  wheat_0(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#5ea742';
    for (const x of [6, 15, 24]) ctx.fillRect(x, 24, 2, 8);
  },
  wheat_1(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#6faa3e';
    for (const x of [4, 11, 18, 25]) ctx.fillRect(x, 16, 2, 16);
  },
  wheat_2(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#8bb84a';
    for (const x of [3, 9, 15, 21, 27]) ctx.fillRect(x, 8, 2, 24);
    ctx.fillStyle = '#a8c455';
    for (const x of [3, 15, 27]) ctx.fillRect(x + 1, 8, 2, 6);
  },
  wheat_3(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    // golden wheat with heads
    for (const x of [3, 9, 15, 21, 27]) {
      ctx.fillStyle = '#c9b44a';
      ctx.fillRect(x, 6, 2, 26);
      ctx.fillStyle = '#e0c565';
      ctx.fillRect(x - 1, 4, 4, 6);
      ctx.fillStyle = '#b39342';
      ctx.fillRect(x, 14, 2, 4);
    }
  },
  andesite(ctx, rand) {
    rampFill(ctx, rand, ['#7e7e7a', '#88888a', '#939395', '#9c9c9e'], { detail: true });
    speckle(ctx, rand, ['#6a6a68', '#a5a5a7'], 30);
  },
  granite(ctx, rand) {
    rampFill(ctx, rand, ['#8f5a4d', '#9c685a', '#a87666', '#b58473'], { detail: true });
    speckle(ctx, rand, ['#7a4a3e', '#c49a8a'], 40);
  },
  diorite(ctx, rand) {
    rampFill(ctx, rand, ['#b5b5b8', '#c2c2c5', '#ceced1', '#d8d8db'], { detail: true });
    speckle(ctx, rand, ['#8e8e92', '#e6e6ea'], 45);
  },
  polished_andesite(ctx, rand) {
    rampFill(ctx, rand, ['#848484', '#8d8d8f', '#96969a'], { octaves: 2 });
    ctx.strokeStyle = '#6a6a6c'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, TILE - 2, TILE - 2);
  },
  polished_granite(ctx, rand) {
    rampFill(ctx, rand, ['#a06e5e', '#a87868', '#b08272'], { octaves: 2 });
    ctx.strokeStyle = '#7e5244'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, TILE - 2, TILE - 2);
  },
  polished_diorite(ctx, rand) {
    rampFill(ctx, rand, ['#c4c4c8', '#cdcdd1', '#d6d6da'], { octaves: 2 });
    ctx.strokeStyle = '#9c9ca0'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, TILE - 2, TILE - 2);
  },
  smooth_stone(ctx, rand) {
    rampFill(ctx, rand, ['#9a9a9a', '#a3a3a3', '#ababab'], { octaves: 2 });
    ctx.fillStyle = '#8e8e8e';
    ctx.fillRect(0, 0, TILE, 2);
  },
  ice(ctx, rand) {
    ctx.fillStyle = 'rgba(120,180,235,0.85)';
    ctx.fillRect(0, 0, TILE, TILE);
    // cracks + shine
    ctx.strokeStyle = 'rgba(220,240,255,0.5)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(rand() * TILE, rand() * TILE);
      ctx.lineTo(rand() * TILE, rand() * TILE);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(240,250,255,0.5)';
    ctx.fillRect(3, 3, 8, 3);
  },
  packed_ice(ctx, rand) {
    rampFill(ctx, rand, ['#8db8e0', '#9cc4e8', '#abd0f0'], { octaves: 2 });
    ctx.strokeStyle = 'rgba(230,245,255,0.4)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(rand() * TILE, rand() * TILE);
      ctx.lineTo(rand() * TILE, rand() * TILE);
      ctx.stroke();
    }
  },
  terracotta(ctx, rand) {
    rampFill(ctx, rand, ['#8e5a3c', '#9c6644', '#a8704a', '#b47a52'], { detail: true });
  },
  netherrack(ctx, rand) {
    rampFill(ctx, rand, ['#5c1e1e', '#6e2626', '#7e2e2e', '#8e3838'], { detail: true });
    speckle(ctx, rand, ['#4a1414', '#a04848'], 45);
  },
  soul_sand(ctx, rand) {
    rampFill(ctx, rand, ['#4a3a30', '#56443a', '#624e42'], { detail: true });
    // screaming faces hint
    ctx.fillStyle = '#2e221c';
    ctx.fillRect(5, 8, 4, 6); ctx.fillRect(20, 8, 4, 6);
    ctx.fillRect(10, 20, 12, 4);
  },
  nether_bricks(ctx, rand) {
    PAINTERS.brickPattern('#3a2226', '#241417')(ctx, rand);
  },
  magma(ctx, rand) {
    rampFill(ctx, rand, ['#2e1a10', '#4a2414', '#8a3818', '#c45816', '#e8801e'], { detail: true });
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rand() * (TILE - 6)), y = Math.floor(rand() * TILE);
      ctx.fillStyle = pick(rand, ['#ffb84a', '#ffd07a']);
      ctx.fillRect(x, y, 4 + Math.floor(rand() * 5), 1);
    }
  },
  quartz_block(ctx, rand) {
    rampFill(ctx, rand, ['#e4e2de', '#ebe9e5', '#f2f0ec'], { octaves: 2 });
    ctx.fillStyle = '#d2d0cc';
    ctx.fillRect(0, TILE - 2, TILE, 2);
  },
  crimson_stem_side(ctx, rand) {
    rampFill(ctx, rand, ['#5e1f2a', '#6e2530', '#7e2b38'], { octaves: 2 });
    for (let x = 0; x < TILE; x += 5) {
      ctx.fillStyle = '#4a1822';
      ctx.fillRect(x, 0, 2, TILE);
    }
    speckle(ctx, rand, ['#8e3545'], 20);
  },
  crimson_stem_top(ctx, rand) {
    fillAll(ctx, '#7e2b38');
    ctx.strokeStyle = '#5e1f2a'; ctx.lineWidth = 2;
    for (let r = 13; r > 2; r -= 4) {
      ctx.beginPath(); ctx.arc(16, 16, r, 0, Math.PI * 2); ctx.stroke();
    }
  },
  crimson_planks(ctx, rand) {
    PAINTERS.planks('#6e2530', '#4a1822')(ctx, rand);
  },
  warped_stem_side(ctx, rand) {
    rampFill(ctx, rand, ['#184a4a', '#1e5a58', '#256a66'], { octaves: 2 });
    for (let x = 0; x < TILE; x += 5) {
      ctx.fillStyle = '#123a3a';
      ctx.fillRect(x, 0, 2, TILE);
    }
    speckle(ctx, rand, ['#2e7a76'], 20);
  },
  warped_stem_top(ctx, rand) {
    fillAll(ctx, '#256a66');
    ctx.strokeStyle = '#184a4a'; ctx.lineWidth = 2;
    for (let r = 13; r > 2; r -= 4) {
      ctx.beginPath(); ctx.arc(16, 16, r, 0, Math.PI * 2); ctx.stroke();
    }
  },
  warped_planks(ctx, rand) {
    PAINTERS.planks('#1e5a58', '#123a3a')(ctx, rand);
  },
  portal(ctx, rand) {
    // swirly purple
    rampFill(ctx, rand, ['#6a1e9c', '#7a28b0', '#8a32c4', '#9c3cd8'], { detail: true });
    speckle(ctx, rand, ['#b45ce8', '#d48cf0'], 30);
    speckle(ctx, rand, ['#4a1470'], 14);
  },
  bed_top(ctx, rand) {
    // red blanket with white pillow
    ctx.fillStyle = '#8a2c2c';
    ctx.fillRect(0, 12, TILE, TILE - 12);
    ctx.fillStyle = '#a83a3a';
    ctx.fillRect(0, 12, TILE, 2);
    ctx.fillStyle = '#e9ecec';
    ctx.fillRect(0, 0, TILE, 12);
    ctx.fillStyle = '#cdd3d6';
    ctx.fillRect(0, 10, TILE, 2);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#dbe2e6' : '#f6f9fb';
      ctx.fillRect(Math.floor(Math.random() * TILE), Math.floor(Math.random() * 12), 2, 1);
    }
  },
  bed_side(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    ctx.fillStyle = '#8a2c2c';
    ctx.fillRect(0, 0, TILE, 10);
    ctx.fillStyle = '#e9ecec';
    ctx.fillRect(0, 0, 10, 10);
    ctx.fillStyle = '#a83a3a';
    ctx.fillRect(0, 8, TILE, 2);
  },
  pumpkin_side(ctx, rand) {
    rampFill(ctx, rand, ['#c4691e', '#d97b2a', '#e8913f'], { octaves: 2 });
    for (const x of [0, 8, 16, 24]) {
      ctx.fillStyle = '#b35a14';
      ctx.fillRect(x, 0, 2, TILE);
      ctx.fillStyle = '#e8913f';
      ctx.fillRect(x + 2, 0, 2, TILE);
    }
  },
};

// named composites
Object.assign(PAINTERS, {
  oak_log_side: PAINTERS.logSide('#6e5433', '#54402a', '#7d6440'),
  oak_log_top: PAINTERS.logTop('#6e5433', '#b09058', '#96774a'),
  birch_log_side: PAINTERS.logSide('#d8d3c3', '#c4bda8', '#e6e2d6'),
  birch_log_top: PAINTERS.logTop('#d8d3c3', '#d8c99a', '#c9b887'),
  spruce_log_side: PAINTERS.logSide('#4a3520', '#362717', '#5c4530'),
  spruce_log_top: PAINTERS.logTop('#4a3520', '#9a7847', '#7d6039'),
  oak_leaves: PAINTERS.leaves('#4a7a24', '#38611a', '#5e9633'),
  birch_leaves: PAINTERS.leaves('#6b9a4a', '#558036', '#83b45e'),
  spruce_leaves: PAINTERS.leaves('#2e5c2e', '#224722', '#3d7038'),
  oak_planks: PAINTERS.planks('#a07847', '#6e4d2c'),
  birch_planks: PAINTERS.planks('#c9b887', '#96774a'),
  spruce_planks: PAINTERS.planks('#7d5c36', '#57401f'),
  coal_ore: PAINTERS.ore(RAMP.stone, ['#171412', '#26221f', '#3a3a3a']),
  iron_ore: PAINTERS.ore(RAMP.stone, ['#b58868', '#c69a7b', '#d8af93']),
  gold_ore: PAINTERS.ore(RAMP.stone, ['#b8941f', '#d9b432', '#f2d24a']),
  diamond_ore: PAINTERS.ore(RAMP.stone, ['#3fc4bc', '#5ee0d8', '#8beee7']),
  coal_block: PAINTERS.mineralBlock('#26221f'),
  iron_block: PAINTERS.mineralBlock('#d8af93'),
  gold_block: PAINTERS.mineralBlock('#f2d24a'),
  diamond_block: PAINTERS.mineralBlock('#5ee0d8'),
  bricks: PAINTERS.brickPattern('#9c4a3a', '#b8a89c'),
  stone_bricks: PAINTERS.brickPattern('#8a8a8a', '#5f5f5f'),
  mossy_stone_bricks(ctx, rand) {
    PAINTERS.brickPattern('#8a8a8a', '#5f5f5f')(ctx, rand);
    const f = noiseField(rand, 2);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (f(x, y) > 0.52 && rand() < 0.6) fillPx(ctx, x, y, pick(rand, ['#4e6a30', '#5c7a3a', '#42592a']));
    }
  },
  flower_red: PAINTERS.flower('#c4373a', '#f2d24a'),
  flower_yellow: PAINTERS.flower('#e8c62e', '#a8742a'),
});

for (const [id, hex] of Object.entries(WOOL_HEX)) {
  PAINTERS[BLOCKS[+id].side] = PAINTERS.wool(hex);
}

// ---- atlas assembly ----
export const TILE_NAMES = [];
export const TILE_INDEX = {};

let atlasCanvas = null;
let atlasTexture = null;

export function buildAtlas() {
  if (atlasTexture) return atlasTexture;

  for (const bl of BLOCKS) {
    if (!bl) continue;
    for (const t of [bl.top, bl.bottom, bl.side]) {
      if (!(t in TILE_INDEX)) {
        TILE_INDEX[t] = TILE_NAMES.length;
        TILE_NAMES.push(t);
      }
    }
  }

  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_COLS * TILE;
  atlasCanvas.height = ATLAS_ROWS * TILE;
  const ctx = atlasCanvas.getContext('2d');

  TILE_NAMES.forEach((name, i) => {
    const painter = PAINTERS[name];
    if (!painter) { console.warn('no painter for tile', name); return; }
    const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    ctx.save();
    ctx.translate(col * TILE, row * TILE);
    ctx.beginPath(); ctx.rect(0, 0, TILE, TILE); ctx.clip();
    painter(ctx, mulberry32(hashSeed('terravale32:' + name)));
    ctx.restore();
  });

  atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  return atlasTexture;
}

const EPS = 0.02 / ATLAS_COLS;
export function uvRect(tileIdx) {
  const col = tileIdx % ATLAS_COLS, row = Math.floor(tileIdx / ATLAS_COLS);
  const u0 = col / ATLAS_COLS + EPS;
  const u1 = (col + 1) / ATLAS_COLS - EPS;
  const v1 = 1 - row / ATLAS_ROWS - EPS;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + EPS;
  return [u0, v0, u1, v1];
}

export function atlasCanvasEl() { return atlasCanvas; }

// dominant colors of a block's side tile, for break particles
const tileColorCache = new Map();
export function tileColors(blockId) {
  if (tileColorCache.has(blockId)) return tileColorCache.get(blockId);
  if (!atlasCanvas) return ['#8a8a8a'];
  const bl = BLOCKS[blockId];
  if (!bl) return ['#8a8a8a'];
  const idx = TILE_INDEX[bl.side];
  const sx = (idx % ATLAS_COLS) * TILE;
  const sy = Math.floor(idx / ATLAS_COLS) * TILE;
  const data = atlasCanvas.getContext('2d').getImageData(sx, sy, TILE, TILE).data;
  const counts = new Map();
  for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
    if (data[i + 3] < 40) continue;
    const key = (data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k]) => {
      const [r, g, b] = k.split(',').map((v, i) => (v << 4) + 8);
      return `rgb(${r},${g},${b})`;
    });
  const colors = top.length ? top : ['#8a8a8a'];
  tileColorCache.set(blockId, colors);
  return colors;
}

// ---- crack overlay textures (10 stages) ----
let crackTextures = null;
export function getCrackTextures() {
  if (crackTextures) return crackTextures;
  crackTextures = [];
  for (let stage = 0; stage < 10; stage++) {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d');
    const rand = mulberry32(hashSeed('crack32:' + stage));
    const segments = 3 + stage * 4;
    ctx.fillStyle = 'rgba(10,8,6,0.85)';
    for (let i = 0; i < segments; i++) {
      let x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE);
      const len = 4 + Math.floor(rand() * (5 + stage));
      for (let j = 0; j < len; j++) {
        ctx.fillRect(x, y, 1, 1);
        x += Math.floor(rand() * 3) - 1;
        y += Math.floor(rand() * 3) - 1;
        x = Math.max(0, Math.min(TILE - 1, x));
        y = Math.max(0, Math.min(TILE - 1, y));
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    crackTextures.push(tex);
  }
  return crackTextures;
}

// ---- isometric block icons ----
const iconCache = new Map();

export function blockIcon(blockId, size = 64) {
  const key = 'b' + blockId + ':' + size;
  if (iconCache.has(key)) return iconCache.get(key);

  const bl = BLOCKS[blockId];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (!bl) return c;

  const src = (tileName) => {
    const idx = TILE_INDEX[tileName];
    return {
      sx: (idx % ATLAS_COLS) * TILE,
      sy: Math.floor(idx / ATLAS_COLS) * TILE,
    };
  };

  if (bl.cross || bl.water || bl.glass || bl.liquid) {
    const { sx, sy } = src(bl.side);
    ctx.drawImage(atlasCanvas, sx, sy, TILE, TILE, size * 0.1, size * 0.1, size * 0.8, size * 0.8);
    iconCache.set(key, c);
    return c;
  }

  const a = size * 0.42;
  const b = a / 2;
  const y0 = size * 0.06;
  const ch = size * 0.44;
  const k = a / TILE;

  const drawFace = (tileName, m, dark) => {
    const { sx, sy } = src(tileName);
    ctx.save();
    ctx.setTransform(...m);
    ctx.drawImage(atlasCanvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    if (dark > 0) {
      ctx.fillStyle = `rgba(0,0,20,${dark})`;
      ctx.fillRect(0, 0, TILE, TILE);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  drawFace(bl.top, [k, b / TILE, -k, b / TILE, size / 2, y0], 0);
  drawFace(bl.side, [k, b / TILE, 0, ch / TILE, size / 2 - a, y0 + b], 0.22);
  drawFace(bl.side, [k, -b / TILE, 0, ch / TILE, size / 2, y0 + 2 * b], 0.42);

  iconCache.set(key, c);
  return c;
}
