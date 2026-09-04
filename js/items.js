// Item registry + stack logic. Blocks are items too (id < 100); the
// registry below covers tools, materials and food (id >= 100).

import { B, BLOCKS } from './blocks.js';

import { I } from './blocks.js';
export { I };

export const TOOL_CLASSES = ['pickaxe', 'axe', 'shovel', 'sword'];
export const TIER_NAMES = ['Wooden', 'Stone', 'Iron', 'Golden', 'Diamond', 'Netherite'];
export const TIER_KEYS = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'];
export const TIER_SPEED = [2, 4, 6, 12, 8, 9];
export const TIER_DURABILITY = [60, 132, 251, 33, 1562, 2031];
export const TIER_MATERIAL = [B.OAK_PLANKS, B.COBBLE, 102, 103, 104]; // matches I ids below

export const ITEMS = {};

function defItem(id, name, opt = {}) {
  ITEMS[id] = {
    id, name,
    food: opt.food ?? 0,          // hunger restored
    fuel: opt.fuel ?? 0,          // furnace burn seconds
    tool: opt.tool ?? null,       // {cls, tier}
    armor: opt.armor ?? null,     // {slot, tier, points}
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
// round 4
defItem(I.WHEAT, 'Wheat', {});
defItem(I.SEEDS, 'Seeds', {});
defItem(I.BREAD, 'Bread', { food: 5 });
defItem(I.STRING, 'String', {});
defItem(I.FEATHER, 'Feather', {});
defItem(I.FLINT, 'Flint', {});
defItem(I.BEEF, 'Raw beef', { food: 3 });
defItem(I.COOKED_BEEF, 'Steak', { food: 8 });
defItem(I.CHICKEN_RAW, 'Raw chicken', { food: 2 });
defItem(I.CHICKEN_COOKED, 'Cooked chicken', { food: 6 });
defItem(I.LEATHER, 'Leather', {});
defItem(I.BUCKET, 'Bucket', {});
defItem(I.WATER_BUCKET, 'Water bucket', {});
defItem(I.BOW, 'Bow', { maxDur: 384, damage: 1 });
defItem(I.ARROW, 'Arrow', {});
defItem(I.BED_ITEM, 'Bed', {});
defItem(I.FLINT_AND_STEEL, 'Flint and steel', { maxDur: 64 });
defItem(I.NETHERITE_SCRAP, 'Netherite scrap', {});
defItem(I.NETHERITE_INGOT, 'Netherite ingot', {});

// armor: 140 + slot*5 + tier (slots 0 head, 1 chest, 2 legs, 3 feet)
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];
export const ARMOR_POINTS = {
  leather: [1, 3, 2, 1],
  iron: [2, 6, 5, 2],
  gold: [2, 5, 3, 1],
  diamond: [3, 8, 6, 3],
};
const ARMOR_TIER_NAMES = ['Leather', 'Iron', 'Golden', 'Diamond'];
const ARMOR_TIER_KEYS = ['leather', 'iron', 'gold', 'diamond'];
const ARMOR_SLOT_NAMES = ['Cap', 'Tunic', 'Pants', 'Boots'];
for (let slot = 0; slot < 4; slot++) {
  for (let tier = 0; tier < 4; tier++) {
    const id = I.ARMOR_BASE + slot * 5 + tier;
    defItem(id, `${ARMOR_TIER_NAMES[tier]} ${ARMOR_SLOT_NAMES[slot]}`, {
      armor: { slot, tier, points: ARMOR_POINTS[ARMOR_TIER_KEYS[tier]][slot] },
      maxDur: [80, 180, 120, 500][tier],
    });
  }
}
// netherite tools: 270-274 (sword, pickaxe, axe, shovel, hoe) — own range
const NT_DMG = [8, 2, 2, 2, 2];
defItem(270, 'Netherite sword', { tool: { cls: 'sword', tier: 5 }, maxDur: 2031, damage: 8 });
defItem(271, 'Netherite pickaxe', { tool: { cls: 'pickaxe', tier: 5 }, maxDur: 2031, damage: 5 });
defItem(272, 'Netherite axe', { tool: { cls: 'axe', tier: 5 }, maxDur: 2031, damage: 6 });
defItem(273, 'Netherite shovel', { tool: { cls: 'shovel', tier: 5 }, maxDur: 2031, damage: 5 });
defItem(274, 'Netherite hoe', { tool: { cls: 'hoe', tier: 5 }, maxDur: 2031, damage: 2 });
// netherite armor: 244, 249, 254, 259 (slot*5 + tier 4)
defItem(244, 'Netherite Cap', { armor: { slot: 0, tier: 4, points: 3 }, maxDur: 600 });
defItem(249, 'Netherite Tunic', { armor: { slot: 1, tier: 4, points: 8 }, maxDur: 600 });
defItem(254, 'Netherite Pants', { armor: { slot: 2, tier: 4, points: 6 }, maxDur: 600 });
defItem(259, 'Netherite Boots', { armor: { slot: 3, tier: 4, points: 3 }, maxDur: 600 });

export function armorId(slot, tier) { return I.ARMOR_BASE + slot * 5 + tier; }
export const isBlockItemId = (id) => id > 0 && id < 200;
export function armorOf(id) { return ITEMS[id]?.armor ?? null; }

// hoes: separate id range so existing tool ids stay stable
const HOE_DMG = [2, 3, 4, 2, 5];
defItem(I.HOE_BASE, 'Wooden hoe', { tool: { cls: 'hoe', tier: 0 }, maxDur: 60, damage: 2, fuel: 10 });
for (let tier = 1; tier < 5; tier++) {
  defItem(I.HOE_BASE + tier, `${TIER_NAMES[tier]} hoe`, { tool: { cls: 'hoe', tier }, maxDur: TIER_DURABILITY[tier], damage: HOE_DMG[tier] });
}
export function hoeId(tier) { return I.HOE_BASE + tier; }

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
  return I.TOOLS_BASE + tier * 4 + TOOL_CLASSES.indexOf(cls);
}

export function isTool(id) { return ITEMS[id]?.tool ?? null; }
export function isBlockItem(id) { return id > 0 && id < 200 && !!BLOCKS[id]; }
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
  [122, () => stack(I.NETHERITE_SCRAP)], // ancient debris -> netherite scrap
]);

export function smeltOf(id) {
  const f = SMELT.get(id);
  return f ? f() : null;
}
