// Crafting recipes. Patterns use ids or arrays of acceptable ids; grids are
// matched after trimming to the bounding box of filled cells, plus the
// left-right mirrored pattern. Shapeless recipes match multisets.

import { B } from './blocks.js';
import { I, toolId, stack, hoeId, armorId } from './items.js';

const PLANKS = [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const LOGS = [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG];

// shaped(out, rows...) — rows of cells (id | [ids] | 0 for empty)
function shaped(out, rows) {
  return { shaped: true, w: rows[0].length, h: rows.length, cells: rows.flat(), out };
}
function shapeless(out, ids) {
  return { shaped: false, ids, out };
}

const R = [];

// wood chain
for (let li = 0; li < 3; li++) {
  R.push(shapeless(stack([B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS][li], 4), [LOGS[li]]));
}
R.push(shaped(stack(I.STICK, 4), [[PLANKS], [PLANKS]]));
R.push(shaped(stack(B.TABLE, 1), [[PLANKS, PLANKS], [PLANKS, PLANKS]]));
R.push(shaped(stack(B.TORCH, 4), [[I.COAL], [I.STICK]]));
R.push(shaped(stack(B.FURNACE, 1), [
  [B.COBBLE, B.COBBLE, B.COBBLE],
  [B.COBBLE, 0, B.COBBLE],
  [B.COBBLE, B.COBBLE, B.COBBLE],
]));
R.push(shaped(stack(B.CHEST, 1), [
  [PLANKS, PLANKS, PLANKS],
  [PLANKS, 0, PLANKS],
  [PLANKS, PLANKS, PLANKS],
]));
R.push(shaped(stack(B.BOOKSHELF, 1), [
  [PLANKS, PLANKS, PLANKS],
  [B.WOOL_RED, B.WOOL_WHITE, B.WOOL_BLUE],
  [PLANKS, PLANKS, PLANKS],
]));

// tools per tier
const MATS = [PLANKS, B.COBBLE, I.IRON_INGOT, I.GOLD_INGOT, I.DIAMOND];
for (let tier = 0; tier < 5; tier++) {
  const M = MATS[tier];
  const S = I.STICK;
  R.push(shaped(stack(toolId('pickaxe', tier)), [[M, M, M], [0, S, 0], [0, S, 0]]));
  R.push(shaped(stack(toolId('axe', tier)), [[M, M], [M, S], [0, S]]));
  R.push(shaped(stack(toolId('shovel', tier)), [[M], [S], [S]]));
  R.push(shaped(stack(toolId('sword', tier)), [[M], [M], [S]]));
}

// round 4: farming, combat, beds
R.push(shaped(stack(I.BREAD), [[I.WHEAT, I.WHEAT, I.WHEAT]]));

// hoe per tier: MM / .S / .S
for (let tier = 0; tier < 5; tier++) {
  const M = MATS[tier], S = I.STICK;
  R.push(shaped(stack(hoeId(tier)), [[M, M], [0, S], [0, S]]));
}

// bow + arrows
R.push(shaped(stack(I.BOW), [[0, I.STICK, I.STRING], [I.STICK, 0, I.STRING], [0, I.STICK, I.STRING]]));
R.push(shaped(stack(I.ARROW, 4), [[I.FLINT], [I.STICK], [I.FEATHER]]));

// bucket
R.push(shaped(stack(I.BUCKET), [[102, 0, 102], [0, 102, 0]]));

// bed: wool over planks
R.push(shaped(stack(I.BED_ITEM), [
  [B.WOOL_WHITE, B.WOOL_WHITE, B.WOOL_WHITE],
  [B.OAK_PLANKS, B.OAK_PLANKS, B.OAK_PLANKS],
]));

// armor: 4 slots x 4 tiers (leather..diamond)
const AMATS = [B.WOOL_BROWN /* leather substitute */, 102, 103, 104];
const APAT = {
  0: [[1, 1, 1], [1, 0, 1]],                      // helmet
  1: [[1, 0, 1], [1, 1, 1], [1, 1, 1]],           // chestplate
  2: [[1, 1, 1], [1, 0, 1], [1, 0, 1]],           // leggings
  3: [[1, 0, 1], [1, 0, 1]],                      // boots
};
for (let tier = 0; tier < 4; tier++) {
  const M = AMATS[tier];
  for (let slot = 0; slot < 4; slot++) {
    const rows = APAT[slot].map(row => row.map(c => (c === 0 ? 0 : M)));
    R.push(shaped(stack(armorId(slot, tier)), rows));
  }
}

// mineral blocks and unpacking
const MINERAL_9 = [
  [I.COAL, B.COAL_BLOCK],
  [I.IRON_INGOT, B.IRON_BLOCK],
  [I.GOLD_INGOT, B.GOLD_BLOCK],
  [I.DIAMOND, B.DIAMOND_BLOCK],
];
for (const [item, block] of MINERAL_9) {
  R.push(shaped(stack(block, 1), [[item, item, item], [item, item, item], [item, item, item]]));
  R.push(shapeless(stack(item, 9), [block]));
}

export const RECIPES = R;

function cellMatches(cell, id) {
  if (cell === 0 || cell == null) return id === 0;
  if (Array.isArray(cell)) return cell.includes(id);
  return cell === id;
}

// grid: array of stacks-or-null, size: 2 or 3 (side length)
// returns matching recipe's out stack or null
export function matchGrid(grid, size) {
  // bounding box of filled cells
  let minR = 9, minC = 9, maxR = -1, maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r * size + c]) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) return null;
  const gw = maxC - minC + 1, gh = maxR - minR + 1;

  const ids = grid.map((s) => (s ? s.id : 0));

  for (const rec of RECIPES) {
    if (rec.shaped) {
      if (rec.w !== gw || rec.h !== gh) continue;
      if (size < 3 && (rec.w > 2 || rec.h > 2)) continue;
      if (checkPattern(rec, ids, minR, minC, size, false)) return { ...rec.out };
      if (checkPattern(rec, ids, minR, minC, size, true)) return { ...rec.out };
    } else {
      const present = ids.filter((v) => v !== 0);
      if (present.length !== rec.ids.length) continue;
      const need = [...rec.ids];
      let ok = true;
      for (const id of present) {
        const idx = need.findIndex((n) => cellMatches(n, id));
        if (idx < 0) { ok = false; break; }
        need.splice(idx, 1);
      }
      if (ok && need.length === 0) return { ...rec.out };
    }
  }
  return null;
}

function checkPattern(rec, ids, minR, minC, size, mirror) {
  for (let r = 0; r < rec.h; r++) {
    for (let c = 0; c < rec.w; c++) {
      const cell = rec.cells[r * rec.w + (mirror ? rec.w - 1 - c : c)];
      const id = ids[(minR + r) * size + (minC + c)];
      if (!cellMatches(cell, id)) return false;
    }
  }
  return true;
}

// consume one of each ingredient after taking the result
export function consumeGrid(grid) {
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (!s) continue;
    s.count--;
    if (s.count <= 0) grid[i] = null;
  }
}
