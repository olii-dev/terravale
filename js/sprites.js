// Procedural item sprites + HUD icons at 2× pixel scale (32×32 items,
// 18×18 status icons) — same pixel art, doubled resolution for the
// detailed texture pass.

import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';
import { B, I, BLOCKS } from './blocks.js';
import { ITEMS, TOOL_CLASSES, toolId } from './items.js';
import { blockIcon, atlasCanvasEl, TILE_INDEX, TILE, ATLAS_COLS } from './textures.js';

const PIX = 2; // each art pixel is a 2×2 block

const TIER_HEAD = ['#9a6b3a', '#8a8a8a', '#d8d8d8', '#f2d24a', '#5ee0d8', '#4a4a52'];
const TIER_HEAD_DARK = ['#6e4a26', '#5c5c5c', '#a0a0a0', '#b8941f', '#3fc4bc', '#2e2e34'];
const HANDLE = '#8a6a3f';
const HANDLE_DARK = '#6e5330';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x * PIX, y * PIX, PIX, PIX); }

// diagonal handle from (x0,y0) up-right
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
    for (let i = 0; i < 9; i++) {
      const x = 4 + i;
      const y = 3 + Math.round(Math.abs(i - 4) * 0.75);
      px(ctx, x, y, h);
      px(ctx, x, y + 1, d);
      if (y > 0) px(ctx, x, y - 1, i % 2 ? d : h);
    }
  },
  axe(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    handle(ctx, 4, 11, 7);
    ctx.fillStyle = h;
    ctx.fillRect(7 * PIX, 2 * PIX, 5 * PIX, 6 * PIX);
    ctx.fillStyle = d;
    ctx.fillRect(7 * PIX, 2 * PIX, 2 * PIX, 6 * PIX);
    px(ctx, 12, 3, h); px(ctx, 12, 4, d); px(ctx, 11, 8, d);
    px(ctx, 6, 2, d); px(ctx, 6, 7, d);
  },
  shovel(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    handle(ctx, 2, 13, 9);
    ctx.fillStyle = h;
    ctx.fillRect(10 * PIX, 2 * PIX, 4 * PIX, 4 * PIX);
    ctx.fillStyle = d;
    ctx.fillRect(10 * PIX, 2 * PIX, PIX, 4 * PIX);
    px(ctx, 13, 5, d); px(ctx, 13, 6, h); px(ctx, 10, 5, d);
  },
  hoe(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    handle(ctx, 3, 12, 9);
    ctx.fillStyle = h;
    ctx.fillRect(10 * PIX, 3 * PIX, 4 * PIX, PIX);
    ctx.fillRect(12 * PIX, 3 * PIX, 2 * PIX, 5 * PIX);
    ctx.fillStyle = d;
    ctx.fillRect(10 * PIX, 4 * PIX, 2 * PIX, PIX);
    px(ctx, 13, 8, d);
  },
  sword(ctx, tier) {
    const h = TIER_HEAD[tier], d = TIER_HEAD_DARK[tier];
    for (let i = 0; i < 8; i++) {
      px(ctx, 12 - i, 3 + i, h);
      px(ctx, 12 - i, 4 + i, d);
    }
    px(ctx, 12, 2, h);
    px(ctx, 3, 9, HANDLE_DARK); px(ctx, 4, 8, HANDLE_DARK);
    px(ctx, 5, 9, HANDLE_DARK); px(ctx, 4, 10, HANDLE_DARK);
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
    ctx.fillRect(4 * PIX, 5 * PIX, 8 * PIX, 7 * PIX);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(5 * PIX, 4 * PIX, 5 * PIX, 2 * PIX);
    ctx.fillRect(3 * PIX, 7 * PIX, 2 * PIX, 3 * PIX);
    px(ctx, 6, 7, '#4a4a4a'); px(ctx, 9, 9, '#4a4a4a'); px(ctx, 7, 10, '#171412');
    px(ctx, 5, 6, '#5c5c5c');
  },
  [102](ctx) { ingot(ctx, '#d8d8d8', '#a0a0a0'); },
  [103](ctx) { ingot(ctx, '#f2d24a', '#b8941f'); },
  [104](ctx) { // diamond
    const h = '#5ee0d8', d = '#3fc4bc';
    const rows = [[7, 2], [6, 4], [5, 6], [4, 8]];
    rows.forEach(([x0, w], i) => {
      ctx.fillStyle = i < 2 ? h : d;
      ctx.fillRect(x0 * PIX, (4 + i * 2) * PIX, w * PIX, 2 * PIX);
    });
    ctx.fillStyle = h;
    ctx.fillRect(6 * PIX, 12 * PIX, 4 * PIX, PIX);
    px(ctx, 7, 5, '#c4f5f0'); px(ctx, 8, 5, '#c4f5f0');
  },
  [105](ctx) { // apple
    ctx.fillStyle = '#c4373a';
    ctx.fillRect(4 * PIX, 5 * PIX, 8 * PIX, 8 * PIX);
    px(ctx, 3, 7, '#c4373a'); px(ctx, 3, 8, '#a8342f'); px(ctx, 12, 7, '#c4373a'); px(ctx, 12, 8, '#a8342f');
    ctx.fillStyle = '#a8342f';
    ctx.fillRect(5 * PIX, 11 * PIX, 6 * PIX, 2 * PIX);
    px(ctx, 5, 6, '#e8837f'); px(ctx, 6, 5, '#e8837f');
    px(ctx, 8, 3, '#4a7a24'); px(ctx, 9, 3, '#4a7a24'); px(ctx, 9, 2, '#3d7a24');
  },
  [106](ctx) { meat(ctx, '#d97b7b', '#a84a4a'); },
  [107](ctx) { meat(ctx, '#9a5c30', '#6e3d1c'); },

  [I.BREAD](ctx) { // bread loaf
    ctx.fillStyle = '#b8863f';
    ctx.fillRect(3 * PIX, 6 * PIX, 10 * PIX, 7 * PIX);
    ctx.fillStyle = '#d9a860';
    ctx.fillRect(3 * PIX, 5 * PIX, 10 * PIX, 2 * PIX);
    ctx.fillStyle = '#8a6330';
    ctx.fillRect(3 * PIX, 11 * PIX, 10 * PIX, 2 * PIX);
    px(ctx, 5, 7, '#e8c88f'); px(ctx, 8, 6, '#e8c88f'); px(ctx, 11, 7, '#e8c88f');
  },
  [I.STRING](ctx) { // string coil
    ctx.fillStyle = '#e9ecec';
    ctx.fillRect(4 * PIX, 4 * PIX, 8 * PIX, 2 * PIX);
    ctx.fillRect(4 * PIX, 9 * PIX, 8 * PIX, 2 * PIX);
    ctx.fillRect(4 * PIX, 6 * PIX, 2 * PIX, 4 * PIX);
    ctx.fillRect(10 * PIX, 6 * PIX, 2 * PIX, 4 * PIX);
    ctx.fillStyle = '#c9cdd0';
    px(ctx, 6, 5, '#c9cdd0'); px(ctx, 9, 8, '#c9cdd0'); px(ctx, 5, 10, '#c9cdd0');
  },
  [I.FEATHER](ctx) { // feather
    ctx.fillStyle = '#f0f2f4';
    ctx.fillRect(9 * PIX, 2 * PIX, 4 * PIX, 9 * PIX);
    ctx.fillRect(8 * PIX, 4 * PIX, 6 * PIX, 5 * PIX);
    ctx.fillStyle = '#cdd2d8';
    px(ctx, 9, 4, '#cdd2d8'); px(ctx, 12, 8, '#cdd2d8'); px(ctx, 10, 3, '#cdd2d8');
    ctx.fillStyle = '#b8863f';
    for (let i = 0; i < 7; i++) px(ctx, 8 - i * 0.7 | 0, 9 + i, '#b8863f');
    px(ctx, 4, 12, '#b8863f'); px(ctx, 3, 13, '#b8863f');
  },
  [I.FLINT](ctx) { // flint shard
    ctx.fillStyle = '#3a3a3e';
    ctx.fillRect(5 * PIX, 4 * PIX, 6 * PIX, 4 * PIX);
    ctx.fillRect(4 * PIX, 7 * PIX, 8 * PIX, 4 * PIX);
    ctx.fillStyle = '#54545c';
    ctx.fillRect(6 * PIX, 5 * PIX, 2 * PIX, 2 * PIX);
    ctx.fillStyle = '#26262a';
    ctx.fillRect(7 * PIX, 9 * PIX, 4 * PIX, 2 * PIX);
  },
  [I.BEEF](ctx) { meat(ctx, '#c4525c', '#8c3a42'); },
  [I.COOKED_BEEF](ctx) { meat(ctx, '#8a5230', '#5e3520'); },
  [I.CHICKEN_RAW](ctx) {
    ctx.fillStyle = '#e8b8a8';
    ctx.fillRect(5 * PIX, 5 * PIX, 7 * PIX, 6 * PIX);
    ctx.fillStyle = '#d99f8f';
    ctx.fillRect(6 * PIX, 8 * PIX, 5 * PIX, 3 * PIX);
    ctx.fillStyle = '#e9ecec';
    ctx.fillRect(10 * PIX, 10 * PIX, 3 * PIX, 3 * PIX);
    px(ctx, 6, 6, '#f7ddd4');
  },
  [I.CHICKEN_COOKED](ctx) {
    ctx.fillStyle = '#c98a4c';
    ctx.fillRect(5 * PIX, 5 * PIX, 7 * PIX, 6 * PIX);
    ctx.fillStyle = '#a86a38';
    ctx.fillRect(6 * PIX, 8 * PIX, 5 * PIX, 3 * PIX);
    ctx.fillStyle = '#e9ecec';
    ctx.fillRect(10 * PIX, 10 * PIX, 3 * PIX, 3 * PIX);
    px(ctx, 6, 6, '#e0aa70');
  },
  [I.LEATHER](ctx) { // hide
    ctx.fillStyle = '#9a6b3a';
    ctx.fillRect(3 * PIX, 4 * PIX, 10 * PIX, 9 * PIX);
    ctx.fillStyle = '#7e542c';
    ctx.fillRect(3 * PIX, 11 * PIX, 10 * PIX, 2 * PIX);
    px(ctx, 4, 5, '#b8864c'); px(ctx, 11, 5, '#b8864c');
    px(ctx, 5, 12, '#6e4824'); px(ctx, 10, 12, '#6e4824');
  },
  [I.BUCKET](ctx) { // bucket
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(4 * PIX, 6 * PIX, 8 * PIX, 7 * PIX);
    ctx.fillStyle = '#a8a8a8';
    ctx.fillRect(4 * PIX, 6 * PIX, 8 * PIX, PIX);
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(4 * PIX, 11 * PIX, 8 * PIX, 2 * PIX);
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = PIX;
    ctx.beginPath();
    ctx.arc(8 * PIX, 6 * PIX, 4 * PIX, Math.PI, 0);
    ctx.stroke();
  },
  [I.WATER_BUCKET](ctx) {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(4 * PIX, 6 * PIX, 8 * PIX, 7 * PIX);
    ctx.fillStyle = '#2a59c8';
    ctx.fillRect(5 * PIX, 7 * PIX, 6 * PIX, 5 * PIX);
    ctx.fillStyle = '#7ba3f0';
    ctx.fillRect(5 * PIX, 7 * PIX, 6 * PIX, PIX);
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = PIX;
    ctx.beginPath();
    ctx.arc(8 * PIX, 6 * PIX, 4 * PIX, Math.PI, 0);
    ctx.stroke();
  },
  [I.BOW](ctx) { // bow
    ctx.strokeStyle = HANDLE;
    ctx.lineWidth = PIX;
    ctx.beginPath();
    ctx.arc(5 * PIX, 8 * PIX, 7 * PIX, -Math.PI / 2.6, Math.PI / 2.6);
    ctx.stroke();
    ctx.strokeStyle = '#e9ecec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(9 * PIX, 2 * PIX);
    ctx.lineTo(9 * PIX, 14 * PIX);
    ctx.stroke();
  },
  [I.ARROW](ctx) { // arrow
    ctx.fillStyle = HANDLE;
    for (let i = 0; i < 7; i++) px(ctx, 4 + i, 12 - i, HANDLE);
    ctx.fillStyle = '#54545c';
    ctx.fillRect(10 * PIX, 3 * PIX, 3 * PIX, 3 * PIX);
    px(ctx, 12, 2, '#54545c');
    ctx.fillStyle = '#e9ecec';
    ctx.fillRect(3 * PIX, 12 * PIX, 3 * PIX, PIX);
    px(ctx, 3, 13, '#e9ecec'); px(ctx, 5, 11, '#e9ecec');
  },
  [I.WHEAT](ctx) { // wheat sheaf
    ctx.fillStyle = '#c9b44a';
    for (const x of [4, 7, 10]) ctx.fillRect(x * PIX, 4 * PIX, PIX, 10 * PIX);
    ctx.fillStyle = '#e0c565';
    for (const x of [4, 7, 10]) ctx.fillRect(x * PIX, 2 * PIX, PIX, 3 * PIX);
    ctx.fillStyle = '#b39342';
    for (const x of [4, 7, 10]) ctx.fillRect(x * PIX, 10 * PIX, PIX, 3 * PIX);
  },
  [I.SEEDS](ctx) { // seeds
    ctx.fillStyle = '#3d7a24';
    px(ctx, 5, 6, '#3d7a24'); px(ctx, 8, 5, '#3d7a24'); px(ctx, 11, 7, '#3d7a24');
    px(ctx, 6, 9, '#4e9a30'); px(ctx, 10, 10, '#4e9a30'); px(ctx, 7, 11, '#3d7a24');
    px(ctx, 4, 11, '#4e9a30'); px(ctx, 12, 11, '#4e9a30');
  },
  [I.DOOR](ctx) { // door icon
    ctx.fillStyle = '#a07847';
    ctx.fillRect(4 * PIX, 2 * PIX, 8 * PIX, 12 * PIX);
    ctx.fillStyle = '#8a6330';
    ctx.fillRect(4 * PIX, 2 * PIX, PIX, 12 * PIX);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(6 * PIX, 4 * PIX, 4 * PIX, 3 * PIX);
    px(ctx, 11, 8, '#3a3a3a'); px(ctx, 12, 8, '#3a3a3a');
  },
  [I.FLINT_AND_STEEL](ctx) { // flint & steel
    ctx.fillStyle = '#54545c';
    ctx.fillRect(4 * PIX, 3 * PIX, 6 * PIX, 5 * PIX); // flint
    ctx.fillStyle = '#767680';
    ctx.fillRect(5 * PIX, 4 * PIX, 2 * PIX, 2 * PIX);
    ctx.fillStyle = '#c9cdd0'; // steel C shape
    ctx.fillRect(9 * PIX, 5 * PIX, 4 * PIX, PIX);
    ctx.fillRect(12 * PIX, 6 * PIX, PIX, 4 * PIX);
    ctx.fillRect(9 * PIX, 10 * PIX, 4 * PIX, PIX);
    px(ctx, 9, 6, '#c9cdd0'); px(ctx, 13, 9, '#c9cdd0');
  },
  [I.NETHERITE_SCRAP](ctx) { // scrap chunk
    ctx.fillStyle = '#4a4a52';
    ctx.fillRect(4 * PIX, 5 * PIX, 8 * PIX, 6 * PIX);
    ctx.fillStyle = '#5e5e68';
    ctx.fillRect(5 * PIX, 4 * PIX, 4 * PIX, 2 * PIX);
    ctx.fillStyle = '#2e2e34';
    ctx.fillRect(6 * PIX, 9 * PIX, 5 * PIX, 2 * PIX);
    px(ctx, 5, 6, '#7a7a86');
  },
  [I.NETHERITE_INGOT](ctx) { ingot(ctx, '#6a6a76', '#3e3e46'); },
  [I.BED_ITEM](ctx) { // bed icon
    ctx.fillStyle = '#e9ecec';
    ctx.fillRect(2 * PIX, 6 * PIX, 5 * PIX, 6 * PIX);
    ctx.fillStyle = '#8a2c2c';
    ctx.fillRect(7 * PIX, 7 * PIX, 8 * PIX, 5 * PIX);
    ctx.fillStyle = '#6e4d2c';
    ctx.fillRect(2 * PIX, 12 * PIX, 13 * PIX, 2 * PIX);
    ctx.fillStyle = '#cdd3d6';
    ctx.fillRect(2 * PIX, 6 * PIX, 5 * PIX, PIX);
  },

  ...(() => {
    const acc = {};
    const TIER = [['#a86b4c', '#7e5236'], ['#d8d8d8', '#a0a0a0'], ['#f2d24a', '#b8941f'], ['#5ee0d8', '#3fc4bc'], ['#4a4a52', '#2e2e34']];
    const SIL = {
      0: (ctx, h, d) => { // helmet
        ctx.fillStyle = h; ctx.fillRect(3 * PIX, 4 * PIX, 10 * PIX, 6 * PIX);
        ctx.fillStyle = d; ctx.fillRect(3 * PIX, 9 * PIX, 10 * PIX, 2 * PIX);
        ctx.fillStyle = d; ctx.fillRect(3 * PIX, 4 * PIX, PIX, 6 * PIX);
        px(ctx, 4, 5, '#ffffff');
      },
      1: (ctx, h, d) => { // chestplate
        ctx.fillStyle = h; ctx.fillRect(3 * PIX, 3 * PIX, 10 * PIX, 9 * PIX);
        ctx.fillStyle = d; ctx.fillRect(3 * PIX, 3 * PIX, PIX, 9 * PIX);
        ctx.fillStyle = d; ctx.fillRect(7 * PIX, 3 * PIX, 2 * PIX, 9 * PIX);
        ctx.fillStyle = h; ctx.fillRect(2 * PIX, 3 * PIX, PIX, 4 * PIX); ctx.fillRect(13 * PIX, 3 * PIX, PIX, 4 * PIX);
      },
      2: (ctx, h, d) => { // leggings
        ctx.fillStyle = h; ctx.fillRect(3 * PIX, 3 * PIX, 10 * PIX, 4 * PIX);
        ctx.fillStyle = d; ctx.fillRect(3 * PIX, 3 * PIX, 10 * PIX, PIX);
        ctx.fillStyle = h; ctx.fillRect(3 * PIX, 6 * PIX, 4 * PIX, 8 * PIX); ctx.fillRect(9 * PIX, 6 * PIX, 4 * PIX, 8 * PIX);
        ctx.fillStyle = d; ctx.fillRect(3 * PIX, 6 * PIX, PIX, 8 * PIX); ctx.fillRect(9 * PIX, 6 * PIX, PIX, 8 * PIX);
      },
      3: (ctx, h, d) => { // boots
        ctx.fillStyle = h; ctx.fillRect(3 * PIX, 6 * PIX, 4 * PIX, 6 * PIX); ctx.fillRect(9 * PIX, 6 * PIX, 4 * PIX, 6 * PIX);
        ctx.fillStyle = d; ctx.fillRect(2 * PIX, 10 * PIX, 5 * PIX, 2 * PIX); ctx.fillRect(9 * PIX, 10 * PIX, 5 * PIX, 2 * PIX);
      },
    };
    for (let slot = 0; slot < 4; slot++) {
      for (let tier = 0; tier < 4; tier++) {
        const id = I.ARMOR_BASE + slot * 5 + tier;
        const [h, d] = TIER[tier];
        acc[id] = (ctx) => SIL[slot](ctx, h, d);
      }
    }
    // hoes
    for (let tier = 0; tier < 5; tier++) {
      acc[I.HOE_BASE + tier] = (ctx) => TOOL_PAINTERS.hoe(ctx, tier);
    }
    return acc;
  })(),
};

function ingot(ctx, h, d) {
  ctx.fillStyle = d;
  ctx.fillRect(3 * PIX, 8 * PIX, 10 * PIX, 4 * PIX);
  ctx.fillStyle = h;
  ctx.fillRect(4 * PIX, 6 * PIX, 8 * PIX, 3 * PIX);
  px(ctx, 4, 6, '#ffffff'); px(ctx, 5, 6, '#ffffff');
}

function meat(ctx, main, dark) {
  ctx.fillStyle = main;
  ctx.fillRect(4 * PIX, 4 * PIX, 8 * PIX, 7 * PIX);
  ctx.fillStyle = dark;
  ctx.fillRect(5 * PIX, 8 * PIX, 6 * PIX, 3 * PIX);
  px(ctx, 5, 5, '#ffffff'); px(ctx, 6, 5, '#ffffff');
  ctx.fillStyle = '#e9ecec';
  ctx.fillRect(10 * PIX, 10 * PIX, 3 * PIX, 3 * PIX);
  px(ctx, 9, 12, '#e9ecec'); px(ctx, 13, 9, '#e9ecec');
}

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
const SPRITE_SIZE = 16 * PIX;

function itemSpriteCanvas(id) {
  if (spriteCache.has(id)) return spriteCache.get(id);
  const { c, ctx } = makeCanvas(SPRITE_SIZE);
  const painter = ITEM_PAINTERS[id];
  if (painter) painter(ctx, mulberry32(hashSeed('item:' + id)));
  else {
    ctx.fillStyle = '#c400c4';
    ctx.fillRect(4 * PIX, 4 * PIX, 8 * PIX, 8 * PIX);
  }
  spriteCache.set(id, c);
  return c;
}

// flat icon (any item or block) at given size, for UI
export function itemIcon(id, size = 64) {
  if (id < 100 && BLOCKS[id]) return blockIcon(id, size);
  const { c, ctx } = makeCanvas(size);
  const sprite = itemSpriteCanvas(id);
  ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, size * 0.1, size * 0.1, size * 0.8, size * 0.8);
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
    const { c, ctx } = makeCanvas(TILE);
    ctx.drawImage(atlas, (idx % ATLAS_COLS) * TILE, Math.floor(idx / ATLAS_COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
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

// ---- HUD status icons (9×9 grid at 2×) ----
const HUD_GRID = 9 * PIX;
const hudCache = new Map();

function hudIcon(kind) {
  if (hudCache.has(kind)) return hudCache.get(kind);
  const { c, ctx } = makeCanvas(HUD_GRID);
  const px9 = (x, y, col) => px(ctx, x, y, col);

  const heartShape = (fill, half) => {
    const O = '#1d0a0a';
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
    for (let y = 1; y <= 5; y++) for (let x = 3; x <= 7; x++) {
      if (x === 3 && (y === 1 || y === 5)) continue;
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
  } else if (kind === 'armor') {
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(2 * PIX, 1 * PIX, 5 * PIX, 4 * PIX);
    ctx.fillRect(1 * PIX, 1 * PIX, PIX, 3 * PIX);
    ctx.fillRect(7 * PIX, 1 * PIX, PIX, 3 * PIX);
    ctx.fillStyle = '#a0a0a0';
    ctx.fillRect(2 * PIX, 4 * PIX, 5 * PIX, PIX);
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
