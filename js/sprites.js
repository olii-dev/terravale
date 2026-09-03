// Procedural item sprites (16×16 pixel art) + HUD icons. Tools draw as
// diagonal silhouettes with tier-colored heads; food/materials get simple
// original pixel art.

import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';
import { B, BLOCKS } from './blocks.js';
import { ITEMS, TOOL_CLASSES, toolId } from './items.js';
import { blockIcon, atlasCanvasEl, TILE_INDEX, TILE, ATLAS_COLS } from './textures.js';

const TIER_HEAD = ['#9a6b3a', '#8a8a8a', '#d8d8d8', '#f2d24a', '#5ee0d8'];
const TIER_HEAD_DARK = ['#6e4a26', '#5c5c5c', '#a0a0a0', '#b8941f', '#3fc4bc'];
const HANDLE = '#8a6a3f';
const HANDLE_DARK = '#6e5330';

function makeCanvas(size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }

// diagonal handle from (3,12) to (10,5)-ish
function handle(ctx, x0 = 3, y0 = 12, len = 8) {
  for (let i = 0; i < len; i++) {
    px(ctx, x0 + i, y0 - i, HANDLE);
    px(ctx, x0 + i + 1, y0 - i, HANDLE_DARK);
  }
}

const TOOL_PAINTERS = {
  pickaxe(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    handle(ctx);
    // arc head across the top
    for (let i = 0; i < 9; i++) {
      const x = 4 + i;
      const y = 3 + Math.round(Math.abs(i - 4) * 0.75);
      px(ctx, x, y, h);
      px(ctx, x, y + 1, d);
      px(ctx, x, y - 1 < 0 ? 0 : y - 1, i % 2 ? d : h);
    }
  },
  axe(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    handle(ctx, 4, 11, 7);
    ctx.fillStyle = h;
    ctx.fillRect(7, 2, 5, 6);
    ctx.fillStyle = d;
    ctx.fillRect(7, 2, 2, 6);
    px(ctx, 12, 3, h); px(ctx, 12, 4, d); px(ctx, 11, 8, d);
    px(ctx, 6, 2, d); px(ctx, 6, 7, d);
  },
  shovel(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    handle(ctx, 2, 13, 9);
    ctx.fillStyle = h;
    ctx.fillRect(10, 2, 4, 4);
    ctx.fillStyle = d;
    ctx.fillRect(10, 2, 1, 4);
    px(ctx, 13, 5, d); px(ctx, 13, 6, h); px(ctx, 10, 5, d);
  },
  sword(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    // blade from (12,3) down-left
    for (let i = 0; i < 8; i++) {
      px(ctx, 12 - i, 3 + i, h);
      px(ctx, 12 - i, 4 + i, d);
    }
    px(ctx, 12, 2, h);
    // guard
    px(ctx, 3, 9, HANDLE_DARK); px(ctx, 4, 8, HANDLE_DARK);
    px(ctx, 5, 9, HANDLE_DARK); px(ctx, 4, 10, HANDLE_DARK);
    // grip
    px(ctx, 3, 10, HANDLE); px(ctx, 2, 11, HANDLE); px(ctx, 3, 11, HANDLE_DARK);
    px(ctx, 1, 13, HANDLE); px(ctx, 2, 13, HANDLE_DARK);
  },
};

const ITEM_PAINTERS = {
  [100](ctx) { // stick
    for (let i = 0; i < 10; i++) {
      px(ctx, 4 + i, 12 - i, HANDLE);
      px(ctx, 5 + i, 12 - i, HANDLE_DARK);
    }
  },
  [101](ctx) { // coal
    ctx.fillStyle = '#26221f';
    ctx.fillRect(4, 5, 8, 7);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(5, 4, 5, 2); ctx.fillRect(3, 7, 2, 3);
    px(ctx, 6, 7, '#4a4a4a'); px(ctx, 9, 9, '#4a4a4a'); px(ctx, 7, 10, '#171412');
  },
  [102](ctx) { ingot(ctx, '#d8d8d8', '#a0a0a0'); },
  [103](ctx) { ingot(ctx, '#f2d24a', '#b8941f'); },
  [104](ctx) { // diamond
    const h = '#5ee0d8', d = '#3fc4bc';
    const rows = [[7, 2], [6, 4], [5, 6], [4, 8]];
    rows.forEach(([x0, w], i) => {
      ctx.fillStyle = i < 2 ? h : d;
      ctx.fillRect(x0, 4 + i * 2, w, 2);
    });
    ctx.fillStyle = h;
    ctx.fillRect(6, 12, 4, 1);
    px(ctx, 7, 5, '#c4f5f0'); px(ctx, 8, 5, '#c4f5f0');
  },
  [105](ctx) { // apple
    ctx.fillStyle = '#c4373a';
    ctx.fillRect(4, 5, 8, 8);
    px(ctx, 3, 7, '#c4373a'); px(ctx, 3, 8, '#a8342f'); px(ctx, 12, 7, '#c4373a'); px(ctx, 12, 8, '#a8342f');
    ctx.fillStyle = '#a8342f';
    ctx.fillRect(5, 11, 6, 2);
    px(ctx, 5, 6, '#e8837f'); px(ctx, 6, 5, '#e8837f');
    px(ctx, 8, 3, '#4a7a24'); px(ctx, 9, 3, '#4a7a24'); px(ctx, 9, 2, '#3d7a24');
  },
  [106](ctx) { meat(ctx, '#d97b7b', '#a84a4a'); },
  [107](ctx) { meat(ctx, '#9a5c30', '#6e3d1c'); },
};

function ingot(ctx, h, d) {
  ctx.fillStyle = d;
  ctx.fillRect(3, 8, 10, 4);
  ctx.fillStyle = h;
  ctx.fillRect(4, 6, 8, 3);
  px(ctx, 4, 6, '#ffffff'); px(ctx, 5, 6, '#ffffff');
}

function meat(ctx, main, dark) {
  ctx.fillStyle = main;
  ctx.fillRect(4, 4, 8, 7);
  ctx.fillStyle = dark;
  ctx.fillRect(5, 8, 6, 3);
  px(ctx, 5, 5, '#ffffff'); px(ctx, 6, 5, '#ffffff');
  // bone
  ctx.fillStyle = '#e9ecec';
  ctx.fillRect(10, 10, 3, 3);
  px(ctx, 9, 12, '#e9ecec'); px(ctx, 13, 9, '#e9ecec');
}

// tool painters per id
for (let tier = 0; tier < 5; tier++) {
  for (let ci = 0; ci < TOOL_CLASSES.length; ci++) {
    const cls = TOOL_CLASSES[ci];
    const painter = TOOL_PAINTERS[cls];
    ITEM_PAINTERS[toolId(cls, tier)] = (ctx) => painter(ctx, tier);
  }
}

// ---- public icon API ----
const spriteCache = new Map();
const texCache = new Map();

function itemSpriteCanvas(id) {
  if (spriteCache.has(id)) return spriteCache.get(id);
  const { c, ctx } = makeCanvas(16);
  const painter = ITEM_PAINTERS[id];
  if (painter) painter(ctx, mulberry32(hashSeed('item:' + id)));
  else {
    // unknown item: magenta checker
    ctx.fillStyle = '#c400c4';
    ctx.fillRect(4, 4, 8, 8);
  }
  spriteCache.set(id, c);
  return c;
}

// flat icon (any item or block) at given size, for UI
export function itemIcon(id, size = 64) {
  if (id < 100 && BLOCKS[id]) return blockIcon(id, size);
  const { c, ctx } = makeCanvas(size);
  const sprite = itemSpriteCanvas(id);
  ctx.drawImage(sprite, 0, 0, 16, 16, size * 0.1, size * 0.1, size * 0.8, size * 0.8);
  return c;
}

// THREE texture for a raw item id (drop entities, held item view)
export function itemTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  let tex;
  if (id < 100 && BLOCKS[id]) {
    const bl = BLOCKS[id];
    const idx = TILE_INDEX[bl.side];
    const atlas = atlasCanvasEl();
    const { c, ctx } = makeCanvas(16);
    ctx.drawImage(atlas, (idx % ATLAS_COLS) * TILE, Math.floor(idx / ATLAS_COLS) * TILE, TILE, TILE, 0, 0, 16, 16);
    tex = new THREE.CanvasTexture(c);
  } else {
    tex = new THREE.CanvasTexture(itemSpriteCanvas(id));
  }
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(id, tex);
  return tex;
}

// ---- HUD status icons (drawn on a 9×9 grid) ----
const hudCache = new Map();

function hudIcon(kind) {
  if (hudCache.has(kind)) return hudCache.get(kind);
  const { c, ctx } = makeCanvas(9);
  const px9 = (x, y, col) => px(ctx, x, y, col);

  const heartShape = (fill, half) => {
    const O = '#1d0a0a';
    // outline ring
    for (const [x, y] of [[1,1],[2,1],[6,1],[7,1],[0,2],[3,2],[4,2],[5,2],[8,2],[0,3],[8,3],[0,4],[8,4],[1,5],[7,5],[2,6],[6,6],[3,7],[5,7],[4,8]]) px9(x, y, O);
    const rows = [[1,1,2],[6,1,2],[1,2,3],[5,2,3],[1,3,7],[1,4,7],[2,5,5],[3,6,3],[4,7,1]];
    for (const [x0, y, w] of rows) {
      for (let x = x0; x < x0 + w; x++) {
        if (half && x > 4) { px9(x, y, '#3a3a3a'); continue; }
        px9(x, y, fill);
      }
    }
    px9(2, 2, '#ff9d9d');
  };

  if (kind === 'heart') heartShape('#e03434');
  else if (kind === 'heart_half') heartShape('#e03434', true);
  else if (kind === 'heart_empty') heartShape('#3a3a3a');
  else if (kind === 'hunger' || kind === 'hunger_empty') {
    const meat = kind === 'hunger' ? '#b3652f' : '#3a3a3a';
    const bone = kind === 'hunger' ? '#e9ecec' : '#2a2a2a';
    // drumstick
    for (let y = 1; y <= 5; y++) for (let x = 3; x <= 7; x++) {
      if ((x === 3 && (y === 1 || y === 5))) continue;
      px9(x, y, meat);
    }
    px9(4, 2, '#d98a4c');
    px9(6, 6, bone); px9(7, 7, bone); px9(5, 7, bone); px9(2, 8, bone); px9(3, 8, bone); px9(7, 5, bone);
  } else if (kind === 'bubble') {
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
      const d = Math.hypot(x - 4, y - 4);
      if (d < 2.6) px9(x, y, '#5b9be8');
    }
    px9(3, 3, '#c4e0ff');
  } else if (kind === 'arrow') {
    for (let i = 0; i < 7; i++) px9(1 + i, 4, i === 6 ? '#fff' : '#555');
    px9(5, 3, '#fff'); px9(5, 5, '#fff'); px9(6, 2, '#fff'); px9(6, 6, '#fff');
  } else if (kind === 'flame') {
    px9(4, 1, '#f7c95c'); px9(3, 2, '#e8741e'); px9(4, 2, '#f2a13c'); px9(5, 2, '#e8741e');
    for (let y = 3; y <= 6; y++) for (let x = 2; x <= 6; x++) px9(x, y, y < 5 ? '#f2a13c' : '#e8741e');
    px9(4, 3, '#fff3b0');
  }

  hudCache.set(kind, c);
  return c;
}

export function hudIconURL(kind) {
  return hudIcon(kind).toDataURL();
}
