// Item registry + stack logic. Blocks are items too (id < 100); the
// registry below covers tools, materials and food (id >= 100).

import { B, BLOCKS } from './blocks.js';

export { I } from './blocks.js'; // item-id constants live with the block ids

export const TOOL_CLASSES = ['pickaxe', 'axe', 'shovel', 'sword'];
export const TIER_NAMES = ['Wooden', 'Stone', 'Iron', 'Golden', 'Diamond'];
export const TIER_KEYS = ['wood', 'stone', 'iron', 'gold', 'diamond'];
export const TIER_SPEED = [2, 4, 6, 12, 8];
export const TIER_DURABILITY = [60, 132, 251, 33, 1562];
export const TIER_MATERIAL = [B.OAK_PLANKS, B.COBBLE, 102, 103, 104]; // matches I ids below

export const ITEMS = {};

function defItem(id, name, opt = {}) {
  ITEMS[id] = {
    id, name,
    food: opt.food ?? 0,          // hunger restored
    fuel: opt.fuel ?? 0,          // furnace burn seconds
    tool: opt.tool ?? null,       // {cls, tier}
    maxDur: opt.maxDur ?? 0,
    damage: opt.damage ?? 1,      // melee damage
  };
}

defItem(100, 'Stick', { fuel: 5 });
defItem(101, 'Coal', { fuel: 80 });
defItem(102, 'Iron ingot', {});
defItem(103, 'Gold ingot', {});
defItem(104, 'Diamond', {});
defItem(105, 'Apple', { food: 4 });
defItem(106, 'Raw meat', { food: 3 });
defItem(107, 'Cooked meat', { food: 8 });

// tools: 110 + tier*4 + class index
const SWORD_DMG = [4, 5, 6, 4, 7];
const TOOL_DMG = [2, 3, 4, 2, 5];
for (let tier = 0; tier < 5; tier++) {
  for (let ci = 0; ci < TOOL_CLASSES.length; ci++) {
    const cls = TOOL_CLASSES[ci];
    const id = toolId(cls, tier);
    const label = `${TIER_NAMES[tier]} ${cls.charAt(0).toUpperCase() + cls.slice(1)}`;
    defItem(id, label, {
      tool: { cls, tier },
      maxDur: TIER_DURABILITY[tier],
      damage: cls === 'sword' ? SWORD_DMG[tier] : TOOL_DMG[tier],
      fuel: tier === 0 ? 10 : 0,
    });
  }
}

export function toolId(cls, tier) {
  return 110 + tier * 4 + TOOL_CLASSES.indexOf(cls);
}

export function isTool(id) { return ITEMS[id]?.tool ?? null; }
export function isBlockItem(id) { return id > 0 && id < 100 && !!BLOCKS[id]; }
export function isFood(id) { return (ITEMS[id]?.food ?? 0) > 0; }

export function nameOf(id) {
  return BLOCKS[id]?.name ?? ITEMS[id]?.name ?? '???';
}

export function maxStack(id) {
  return ITEMS[id]?.maxDur ? 1 : 64;
}

export function fuelOf(id) {
  if (ITEMS[id]?.fuel) return ITEMS[id].fuel;
  if (id === B.OAK_PLANKS || id === B.BIRCH_PLANKS || id === B.SPRUCE_PLANKS) return 15;
  if (id === B.OAK_LOG || id === B.BIRCH_LOG || id === B.SPRUCE_LOG) return 15;
  return 0;
}

// mining speed multiplier a tool gives against a block
export function miningSpeed(toolItem, blockId) {
  const bl = BLOCKS[blockId];
  if (!bl) return 1;
  if (!toolItem) return 1;
  const tool = isTool(toolItem.id);
  if (!tool) return 1;
  if (bl.tool !== tool.cls) return 1;
  return TIER_SPEED[tool.tier];
}

// can the held tool harvest drops from this block?
export function canHarvest(toolItem, blockId) {
  const bl = BLOCKS[blockId];
  if (!bl || !bl.needsTool) return true;
  const tool = toolItem ? isTool(toolItem.id) : null;
  if (!tool || tool.cls !== bl.tool) return false;
  return tool.tier >= bl.tier;
}

// seconds to break bare-handed baseline at full speed
export function breakTime(toolItem, blockId) {
  const bl = BLOCKS[blockId];
  if (!bl) return 0;
  const speed = miningSpeed(toolItem, blockId);
  const harvest = canHarvest(toolItem, blockId);
  const base = bl.hardness;
  let t = harvest ? base * 1.5 / speed : base * 5;
  return Math.max(0.05, t);
}

// ---- ItemStack helpers (stacks are plain objects: {id, count, dur}) ----

export function stack(id, count = 1, dur) {
  const s = { id, count };
  if (ITEMS[id]?.maxDur) s.dur = dur ?? ITEMS[id].maxDur;
  return s;
}

export function canMerge(a, b) {
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  if (ITEMS[a.id]?.maxDur) return false; // tools never stack
  return true;
}

// smelting: input id -> output stack
export const SMELT = new Map([
  [B.IRON_ORE, () => stack(102)],
  [B.GOLD_ORE, () => stack(103)],
  [B.SAND, () => stack(B.GLASS)],
  [B.COBBLE, () => stack(B.STONE)],
  [B.CLAY, () => stack(B.BRICKS)],
  [106, () => stack(107)],
]);

export function smeltOf(id) {
  const f = SMELT.get(id);
  return f ? f() : null;
}
