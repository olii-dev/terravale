// Procedural texture atlas v2: every 16×16 tile is drawn with code at
// startup. Deterministic per tile name, so every peer generates identical
// textures. Also owns block icons and the mining crack overlay textures.

import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';
import { BLOCKS, WOOL_HEX } from './blocks.js';

export const TILE = 16;
export const ATLAS_COLS = 10;
export const ATLAS_ROWS = 8;

// ---- tiny color helpers ----
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

// ---- generic tile painting helpers (ctx origin = tile corner) ----
function fillPx(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
function fillAll(ctx, color) { ctx.fillStyle = color; ctx.fillRect(0, 0, TILE, TILE); }
function speckle(ctx, rand, colors, count) {
  for (let i = 0; i < count; i++) fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), pick(rand, colors));
}
function grain(ctx, rand, base, amt, chance = 0.45) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (rand() < chance) fillPx(ctx, x, y, shade(base, Math.floor((rand() * 2 - 1) * amt)));
  }
}

// ---- tile painters ----
const PAINTERS = {
  dirt(ctx, rand) {
    fillAll(ctx, '#866043');
    grain(ctx, rand, '#866043', 16);
    speckle(ctx, rand, ['#6e4d34', '#9a7351'], 22);
  },
  grass_top(ctx, rand) {
    fillAll(ctx, '#6faa3e');
    grain(ctx, rand, '#6faa3e', 18);
    speckle(ctx, rand, ['#5e9633', '#83c14c', '#79b845'], 40);
  },
  grass_side(ctx, rand) {
    PAINTERS.dirt(ctx, rand);
    for (let x = 0; x < TILE; x++) {
      const d = 2 + (rand() < 0.4 ? 1 : 0) + (rand() < 0.15 ? 1 : 0);
      for (let y = 0; y < d; y++) fillPx(ctx, x, y, pick(rand, ['#6faa3e', '#79b845', '#5e9633']));
    }
  },
  grass_side_snow(ctx, rand) {
    PAINTERS.dirt(ctx, rand);
    for (let x = 0; x < TILE; x++) {
      const d = 2 + (rand() < 0.4 ? 1 : 0);
      for (let y = 0; y < d; y++) fillPx(ctx, x, y, pick(rand, ['#f4f8fb', '#e6edf3']));
    }
  },
  stone(ctx, rand) {
    fillAll(ctx, '#8a8a8a');
    grain(ctx, rand, '#8a8a8a', 12);
    speckle(ctx, rand, ['#7b7b7b', '#979797', '#747474'], 30);
  },
  cobble(ctx, rand) {
    fillAll(ctx, '#5f5f5f');
    const stones = 7;
    for (let i = 0; i < stones; i++) {
      const cx = 1 + Math.floor(rand() * (TILE - 4));
      const cy = 1 + Math.floor(rand() * (TILE - 4));
      const r = 2 + Math.floor(rand() * 2);
      const base = shade('#8a8a8a', Math.floor((rand() * 2 - 1) * 16));
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r + 1) {
          const x = (cx + dx + TILE) % TILE, y = (cy + dy + TILE) % TILE;
          fillPx(ctx, x, y, rand() < 0.25 ? shade(base, -12) : base);
        }
      }
    }
  },
  mossy_cobble(ctx, rand) {
    PAINTERS.cobble(ctx, rand);
    for (let i = 0; i < 26; i++) fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), pick(rand, ['#5c7a3a', '#4e6a30', '#6b8a45']));
  },
  bedrock(ctx, rand) {
    for (let y = 0; y < TILE; y += 2) for (let x = 0; x < TILE; x += 2) {
      ctx.fillStyle = pick(rand, ['#3a3a3a', '#575757', '#2b2b2b', '#666666']);
      ctx.fillRect(x, y, 2, 2);
    }
  },
  sand(ctx, rand) {
    fillAll(ctx, '#dbcf9c');
    grain(ctx, rand, '#dbcf9c', 10);
    speckle(ctx, rand, ['#cec08a', '#e6dbb0'], 26);
  },
  sandstone_top(ctx, rand) {
    fillAll(ctx, '#d8cb96');
    grain(ctx, rand, '#d8cb96', 7, 0.3);
  },
  sandstone_side(ctx, rand) {
    fillAll(ctx, '#d8cb96');
    for (let y = 0; y < TILE; y++) {
      const amt = y % 5 === 0 ? -14 : (y % 5 === 4 ? 8 : 0);
      for (let x = 0; x < TILE; x++) fillPx(ctx, x, y, shade('#d8cb96', amt + Math.floor((rand() * 2 - 1) * 6)));
    }
    speckle(ctx, rand, ['#bfb27e'], 10);
  },
  gravel(ctx, rand) {
    fillAll(ctx, '#7f7b78');
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(rand() * (TILE - 2)), y = Math.floor(rand() * (TILE - 2));
      const c = pick(rand, ['#6b6764', '#8f8b87', '#5d5a58', '#9b968f']);
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
    }
  },
  snow(ctx, rand) {
    fillAll(ctx, '#f4f8fb');
    grain(ctx, rand, '#f4f8fb', 7, 0.3);
    speckle(ctx, rand, ['#e6edf3'], 12);
  },
  clay(ctx, rand) {
    fillAll(ctx, '#9aa3ae');
    grain(ctx, rand, '#9aa3ae', 8, 0.35);
  },
  water(ctx, rand) {
    ctx.fillStyle = rgba('#2a59c8', 0.82);
    ctx.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 5; i++) {
      const y = Math.floor(rand() * TILE);
      const x = Math.floor(rand() * (TILE - 6));
      ctx.fillStyle = rgba('#5b86e8', 0.5);
      ctx.fillRect(x, y, 3 + Math.floor(rand() * 4), 1);
    }
  },
  lava(ctx, rand) {
    fillAll(ctx, '#cf4a12');
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rand() * (TILE - 5)), y = Math.floor(rand() * TILE);
      ctx.fillStyle = pick(rand, ['#f2a13c', '#e8741e', '#f7c95c']);
      ctx.fillRect(x, y, 3 + Math.floor(rand() * 4), 1 + Math.floor(rand() * 2));
    }
    speckle(ctx, rand, ['#8a2c08', '#a83410'], 14);
  },
  logSide(bark, dark) {
    return (ctx, rand) => {
      fillAll(ctx, bark);
      for (let x = 0; x < TILE; x++) {
        if (rand() < 0.35) {
          const c = rand() < 0.5 ? dark : shade(bark, 14);
          for (let y = 0; y < TILE; y++) if (rand() < 0.8) fillPx(ctx, x, y, c);
        }
      }
      speckle(ctx, rand, [dark, shade(bark, 20)], 14);
    };
  },
  logTop(bark, ringLight, ringDark) {
    return (ctx, rand) => {
      fillAll(ctx, ringLight);
      const c = 7.5;
      for (let r = 7; r >= 1; r -= 2) {
        ctx.fillStyle = r % 4 === 1 ? ringDark : ringLight;
        ctx.fillRect(Math.ceil(c - r), Math.ceil(c - r), r * 2 - 1, r * 2 - 1);
      }
      ctx.strokeStyle = bark; ctx.lineWidth = 2; ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
      speckle(ctx, rand, [ringDark, shade(ringLight, -12)], 8);
    };
  },
  leaves(base, dark, bright) {
    return (ctx, rand) => {
      fillAll(ctx, base);
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const r = rand();
        if (r < 0.22) fillPx(ctx, x, y, dark);
        else if (r < 0.42) fillPx(ctx, x, y, bright);
      }
    };
  },
  planks(base, dark) {
    return (ctx, rand) => {
      fillAll(ctx, base);
      grain(ctx, rand, base, 10, 0.3);
      ctx.fillStyle = dark;
      for (const y of [3, 7, 11, 15]) ctx.fillRect(0, y, TILE, 1);
      fillPx(ctx, 4, 0, dark); fillPx(ctx, 5, 0, dark);
      fillPx(ctx, 11, 4, dark); fillPx(ctx, 12, 4, dark);
      fillPx(ctx, 6, 8, dark); fillPx(ctx, 7, 8, dark);
      fillPx(ctx, 13, 12, dark); fillPx(ctx, 14, 12, dark);
    };
  },
  ore(stoneBase, oreColors) {
    return (ctx, rand) => {
      PAINTERS.stone(ctx, rand);
      const clusters = 4 + Math.floor(rand() * 2);
      for (let i = 0; i < clusters; i++) {
        const cx = 2 + Math.floor(rand() * (TILE - 4));
        const cy = 2 + Math.floor(rand() * (TILE - 4));
        const n = 3 + Math.floor(rand() * 4);
        for (let j = 0; j < n; j++) {
          const x = cx + Math.floor((rand() * 2 - 1) * 2);
          const y = cy + Math.floor((rand() * 2 - 1) * 2);
          fillPx(ctx, x, y, pick(rand, oreColors));
        }
        fillPx(ctx, cx, cy, oreColors[0]);
      }
    };
  },
  mineralBlock(base) {
    return (ctx, rand) => {
      fillAll(ctx, base);
      grain(ctx, rand, base, 10, 0.25);
      ctx.fillStyle = shade(base, 34);
      ctx.fillRect(0, 0, TILE, 1); ctx.fillRect(0, 0, 1, TILE);
      ctx.fillStyle = shade(base, -38);
      ctx.fillRect(0, TILE - 1, TILE, 1); ctx.fillRect(TILE - 1, 0, 1, TILE);
    };
  },
  brickPattern(brick, mortar) {
    return (ctx, rand) => {
      fillAll(ctx, mortar);
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        const offset = row % 2 === 0 ? 0 : 4;
        for (let bx = -8; bx < TILE; bx += 8) {
          const x = bx + offset;
          ctx.fillStyle = shade(brick, Math.floor((rand() * 2 - 1) * 12));
          ctx.fillRect(Math.max(0, x), y, Math.min(7, TILE - Math.max(0, x)), 3);
        }
      }
    };
  },
  glass(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(210,235,240,0.95)';
    ctx.fillRect(0, 0, TILE, 1); ctx.fillRect(0, TILE - 1, TILE, 1);
    ctx.fillRect(0, 0, 1, TILE); ctx.fillRect(TILE - 1, 0, 1, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(3, 3, 1, 4); ctx.fillRect(4, 2, 1, 4);
    ctx.fillRect(11, 9, 1, 4); ctx.fillRect(12, 8, 1, 4);
  },
  obsidian(ctx, rand) {
    fillAll(ctx, '#17101f');
    speckle(ctx, rand, ['#241736', '#2e1f4a', '#100a16'], 40);
    speckle(ctx, rand, ['#4a3568'], 8);
    speckle(ctx, rand, ['#7b5fa8'], 3);
  },
  bookshelf(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    const spineColors = ['#a8342f', '#3841a0', '#4a7a24', '#d9c02a', '#7a3ba0', '#d97b2a', '#2f8b8b'];
    for (const y of [3, 10]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(rand() * 2);
        ctx.fillStyle = pick(rand, spineColors);
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y + 1, w, 1);
        x += w + (rand() < 0.2 ? 1 : 0);
      }
    }
  },
  wool(base) {
    return (ctx, rand) => {
      fillAll(ctx, base);
      grain(ctx, rand, base, 14, 0.5);
      for (let i = 0; i < 14; i++) {
        fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), rand() < 0.5 ? shade(base, 18) : shade(base, -18));
      }
    };
  },
  flower(petal, center) {
    return (ctx, rand) => {
      ctx.clearRect(0, 0, TILE, TILE);
      ctx.fillStyle = '#3d7a24';
      ctx.fillRect(7, 8, 1, 7); ctx.fillRect(8, 9, 1, 6);
      fillPx(ctx, 6, 11, '#4e9a30'); fillPx(ctx, 9, 12, '#4e9a30');
      const cx = 7, cy = 5;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) {
        fillPx(ctx, cx + dx, cy + dy, petal);
      }
      fillPx(ctx, cx, cy, center);
      fillPx(ctx, cx - 1, cy - 2, petal); fillPx(ctx, cx + 2, cy + 1, petal);
    };
  },
  tall_grass(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      let x = 2 + Math.floor(rand() * 12);
      const h = 6 + Math.floor(rand() * 8);
      const c = pick(rand, ['#5e9633', '#6faa3e', '#4e7d2a']);
      for (let y = 15; y > 15 - h; y--) {
        fillPx(ctx, x, y, c);
        if (rand() < 0.3) x += rand() < 0.5 ? -1 : 1;
        x = Math.max(0, Math.min(15, x));
      }
    }
  },
  dead_bush(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    const c = '#8a6a3f';
    const branch = (x, y, dx, dy, len) => {
      for (let i = 0; i < len; i++) {
        fillPx(ctx, Math.round(x), Math.round(y), rand() < 0.3 ? '#6e5330' : c);
        x += dx + (rand() - 0.5) * 0.6;
        y += dy + (rand() - 0.5) * 0.6;
      }
    };
    branch(7.5, 15, 0, -1, 6);
    branch(7, 11, -0.7, -0.8, 5); branch(8, 10, 0.7, -0.8, 5);
    branch(7, 8, -0.4, -1, 4); branch(8, 7, 0.5, -1, 4);
  },
  torch(ctx, rand) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#8a6a3f';
    ctx.fillRect(7, 6, 2, 9);
    ctx.fillStyle = '#6e5330';
    ctx.fillRect(7, 6, 1, 9);
    // flame
    ctx.fillStyle = '#f7c95c';
    ctx.fillRect(6, 3, 4, 3);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(7, 3, 2, 2);
    fillPx(ctx, 6, 2, '#e8741e'); fillPx(ctx, 9, 2, '#e8741e');
  },
  table_top(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    ctx.fillStyle = '#5c4022';
    ctx.strokeStyle = '#5c4022';
    ctx.strokeRect(2.5, 2.5, 11, 11);
    ctx.fillRect(2, 2, 12, 1); ctx.fillRect(2, 13, 12, 1);
    ctx.fillRect(2, 2, 1, 12); ctx.fillRect(13, 2, 1, 12);
    ctx.fillRect(7, 2, 1, 12); ctx.fillRect(2, 7, 12, 1);
  },
  table_side(ctx, rand) {
    PAINTERS.planks('#a07847', '#6e4d2c')(ctx, rand);
    ctx.fillStyle = '#5c4022';
    ctx.fillRect(2, 4, 5, 6);
    ctx.fillStyle = '#8f8a82';
    ctx.fillRect(9, 4, 4, 6);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(10, 5, 2, 2);
  },
  furnace_top(ctx, rand) {
    PAINTERS.stone(ctx, rand);
    ctx.strokeStyle = '#5c5c5c';
    ctx.strokeRect(3.5, 3.5, 9, 9);
  },
  furnace_side(ctx, rand) {
    PAINTERS.stone(ctx, rand);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(4, 7, 8, 6);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(4, 7, 8, 1);
    ctx.fillStyle = '#e8741e';
    ctx.fillRect(5, 11, 6, 2);
    ctx.fillStyle = '#f7c95c';
    ctx.fillRect(6, 12, 4, 1); ctx.fillRect(7, 11, 2, 1);
  },
  chest_top(ctx, rand) {
    PAINTERS.planks('#9a6b3a', '#6e4a26')(ctx, rand);
    ctx.strokeStyle = '#5c3d1e';
    ctx.strokeRect(1.5, 1.5, 13, 13);
  },
  chest_side(ctx, rand) {
    PAINTERS.planks('#9a6b3a', '#6e4a26')(ctx, rand);
    ctx.fillStyle = '#5c3d1e';
    ctx.fillRect(0, 5, TILE, 1);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(7, 3, 2, 4);
    ctx.fillStyle = '#9c9c9c';
    ctx.fillRect(7, 3, 2, 1);
  },
  glowstone(ctx, rand) {
    fillAll(ctx, '#b8934a');
    speckle(ctx, rand, ['#f2d97a', '#ffe9a8', '#d9b45c'], 60);
    speckle(ctx, rand, ['#8a6a30'], 10);
  },
  cactus_top(ctx, rand) {
    fillAll(ctx, '#3d7a2e');
    ctx.fillStyle = '#4e9a3a';
    ctx.fillRect(2, 2, 12, 12);
    grain(ctx, rand, '#4e9a3a', 10, 0.3);
  },
  cactus_side(ctx, rand) {
    fillAll(ctx, '#2e5c22');
    for (const x of [1, 6, 11]) {
      ctx.fillStyle = '#4e9a3a';
      ctx.fillRect(x, 0, 3, TILE);
    }
    ctx.fillStyle = '#d9e8c4';
    for (let i = 0; i < 10; i++) fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), '#c4d4a8');
  },
  pumpkin_top(ctx, rand) {
    fillAll(ctx, '#d97b2a');
    grain(ctx, rand, '#d97b2a', 10, 0.35);
    ctx.fillStyle = '#6e5330';
    ctx.fillRect(6, 6, 3, 3);
    ctx.fillStyle = '#8a6a3f';
    ctx.fillRect(7, 5, 1, 4);
  },
  pumpkin_side(ctx, rand) {
    fillAll(ctx, '#d97b2a');
    for (const x of [0, 5, 10]) {
      ctx.fillStyle = '#c4691e';
      ctx.fillRect(x, 0, 1, TILE);
    }
    grain(ctx, rand, '#d97b2a', 10, 0.3);
  },
};

// named composites
Object.assign(PAINTERS, {
  oak_log_side: PAINTERS.logSide('#6e5433', '#54402a'),
  oak_log_top: PAINTERS.logTop('#6e5433', '#b09058', '#96774a'),
  birch_log_side: PAINTERS.logSide('#d8d3c3', '#c4bda8'),
  birch_log_top: PAINTERS.logTop('#d8d3c3', '#d8c99a', '#c9b887'),
  spruce_log_side: PAINTERS.logSide('#4a3520', '#362717'),
  spruce_log_top: PAINTERS.logTop('#4a3520', '#9a7847', '#7d6039'),
  oak_leaves: PAINTERS.leaves('#4a7a24', '#3a6119', '#5e9633'),
  birch_leaves: PAINTERS.leaves('#6b9a4a', '#558036', '#83b45e'),
  spruce_leaves: PAINTERS.leaves('#2e5c2e', '#224722', '#3d7038'),
  oak_planks: PAINTERS.planks('#a07847', '#6e4d2c'),
  birch_planks: PAINTERS.planks('#c9b887', '#96774a'),
  spruce_planks: PAINTERS.planks('#7d5c36', '#57401f'),
  coal_ore: PAINTERS.ore('#8a8a8a', ['#26221f', '#3a3a3a', '#171412']),
  iron_ore: PAINTERS.ore('#8a8a8a', ['#d8af93', '#c69a7b', '#b58868']),
  gold_ore: PAINTERS.ore('#8a8a8a', ['#f2d24a', '#d9b432', '#b8941f']),
  diamond_ore: PAINTERS.ore('#8a8a8a', ['#5ee0d8', '#3fc4bc', '#8beee7']),
  coal_block: PAINTERS.mineralBlock('#26221f'),
  iron_block: PAINTERS.mineralBlock('#d8af93'),
  gold_block: PAINTERS.mineralBlock('#f2d24a'),
  diamond_block: PAINTERS.mineralBlock('#5ee0d8'),
  bricks: PAINTERS.brickPattern('#9c4a3a', '#b8a89c'),
  stone_bricks: PAINTERS.brickPattern('#8a8a8a', '#666666'),
  mossy_stone_bricks(ctx, rand) {
    PAINTERS.brickPattern('#8a8a8a', '#666666')(ctx, rand);
    for (let i = 0; i < 20; i++) fillPx(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), pick(rand, ['#5c7a3a', '#4e6a30']));
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
    painter(ctx, mulberry32(hashSeed('terravale:' + name)));
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

// ---- crack overlay textures (10 stages) ----
let crackTextures = null;
export function getCrackTextures() {
  if (crackTextures) return crackTextures;
  crackTextures = [];
  for (let stage = 0; stage < 10; stage++) {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d');
    const rand = mulberry32(hashSeed('crack:' + stage));
    const segments = 3 + stage * 3;
    ctx.fillStyle = 'rgba(10,8,6,0.85)';
    for (let i = 0; i < segments; i++) {
      let x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE);
      const len = 2 + Math.floor(rand() * (3 + stage * 0.5));
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

// ---- isometric block icons for hotbar / pickers ----
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
