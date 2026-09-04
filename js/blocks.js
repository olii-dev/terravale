// Block registry v2. Ids are stable — they travel over the network and
// live in saves. Every texture name gets a procedurally drawn tile in the
// atlas (textures.js); item sprites come from sprites.js.

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  BEDROCK: 5,
  SAND: 6,
  SANDSTONE: 7,
  GRAVEL: 8,
  SNOWY_GRASS: 9,
  CLAY: 10,
  MOSSY_COBBLE: 11,
  WATER: 12,
  SNOW: 13,
  OAK_LOG: 14,
  BIRCH_LOG: 15,
  SPRUCE_LOG: 16,
  OAK_LEAVES: 17,
  BIRCH_LEAVES: 18,
  SPRUCE_LEAVES: 19,
  OAK_PLANKS: 20,
  BIRCH_PLANKS: 21,
  SPRUCE_PLANKS: 22,
  COAL_ORE: 23,
  IRON_ORE: 24,
  GOLD_ORE: 25,
  DIAMOND_ORE: 26,
  COAL_BLOCK: 27,
  IRON_BLOCK: 28,
  GOLD_BLOCK: 29,
  DIAMOND_BLOCK: 30,
  BRICKS: 31,
  STONE_BRICKS: 32,
  MOSSY_STONE_BRICKS: 33,
  GLASS: 34,
  OBSIDIAN: 35,
  BOOKSHELF: 36,
  WOOL_WHITE: 37,
  WOOL_SILVER: 38,
  WOOL_GRAY: 39,
  WOOL_BLACK: 40,
  WOOL_RED: 41,
  WOOL_ORANGE: 42,
  WOOL_YELLOW: 43,
  WOOL_LIME: 44,
  WOOL_GREEN: 45,
  WOOL_CYAN: 46,
  WOOL_BLUE: 47,
  WOOL_PURPLE: 48,
  WOOL_MAGENTA: 49,
  WOOL_PINK: 50,
  WOOL_BROWN: 51,
  WOOL_MINT: 52,
  BLOOM_RED: 53,
  BLOOM_YELLOW: 54,
  WILD_GRASS: 55,
  DEAD_BUSH: 56,
  TORCH: 57,
  TABLE: 58,
  FURNACE: 59,
  CHEST: 60,
  GLOWSTONE: 61,
  LAVA: 62,
  CACTUS: 63,
  PUMPKIN: 64,
  // round 4: world feel + farming + beds
  TORCH_WALL_N: 65,
  TORCH_WALL_E: 66,
  TORCH_WALL_S: 67,
  TORCH_WALL_W: 68,
  SAPLING: 69,
  FARMLAND: 70,
  WHEAT_0: 71,
  WHEAT_1: 72,
  WHEAT_2: 73,
  WHEAT_3: 74,
  BED: 75,
  // flowing water levels 1..7 (WATER itself = source, level 0)
  WATER_FLOW1: 76,
  WATER_FLOW2: 77,
  WATER_FLOW3: 78,
  WATER_FLOW4: 79,
  WATER_FLOW5: 80,
  WATER_FLOW6: 81,
  WATER_FLOW7: 82,
  ANDESITE: 83,
  GRANITE: 84,
  DIORITE: 85,
  POLISHED_ANDESITE: 86,
  POLISHED_GRANITE: 87,
  POLISHED_DIORITE: 88,
  SMOOTH_STONE: 89,
  ICE: 90,
  PACKED_ICE: 91,
  TERRACOTTA: 92,
  NETHERRACK: 100,
  SOUL_SAND: 101,
  NETHER_BRICKS: 102,
  MAGMA: 103,
  QUARTZ_BLOCK: 104,
  CRIMSON_STEM: 105,
  CRIMSON_PLANKS: 106,
  WARPED_STEM: 107,
  WARPED_PLANKS: 108,
  NETHER_PORTAL: 109,
  STONE_SLAB_B: 110,
  STONE_SLAB_T: 111,
  OAK_SLAB_B: 112,
  OAK_SLAB_T: 113,
  STAIRS_STONE_N: 114,
  STAIRS_STONE_E: 115,
  STAIRS_STONE_S: 116,
  STAIRS_STONE_W: 117,
  STAIRS_OAK_N: 118,
  STAIRS_OAK_E: 119,
  STAIRS_OAK_S: 120,
  STAIRS_OAK_W: 121,
  ANCIENT_DEBRIS: 122,
  DOOR_L_N_C: 123, DOOR_L_E_C: 124, DOOR_L_S_C: 125, DOOR_L_W_C: 126,
  DOOR_L_N_O: 127, DOOR_L_E_O: 128, DOOR_L_S_O: 129, DOOR_L_W_O: 130,
  DOOR_U_N_C: 131, DOOR_U_E_C: 132, DOOR_U_S_C: 133, DOOR_U_W_C: 134,
  DOOR_U_N_O: 135, DOOR_U_E_O: 136, DOOR_U_S_O: 137, DOOR_U_W_O: 138,
  OAK_FENCE: 139,
  BIRCH_SLAB_B: 140, BIRCH_SLAB_T: 141,
  SPRUCE_SLAB_B: 142, SPRUCE_SLAB_T: 143,
  COBBLE_SLAB_B: 144, COBBLE_SLAB_T: 145,
  STAIRS_BIRCH_N: 146, STAIRS_BIRCH_S: 147,
  STAIRS_SPRUCE_N: 148, STAIRS_SPRUCE_S: 149,
  STAIRS_COBBLE_N: 150, STAIRS_COBBLE_S: 151,
};

// slab/stair helpers
export const SLAB_B = new Set([B.STONE_SLAB_B, B.OAK_SLAB_B]);
export function stairsFacing(id) {
  if (id >= B.STAIRS_STONE_N && id <= B.STAIRS_STONE_W) return id - B.STAIRS_STONE_N;
  if (id >= B.STAIRS_OAK_N && id <= B.STAIRS_OAK_W) return id - B.STAIRS_OAK_N;
  return -1;
}

// flowing-water helpers: every water-ish id maps to a level 0..7 (0 = source)
export const WATER_IDS = new Set([B.WATER]);
for (let l = 1; l <= 7; l++) WATER_IDS.add(B.WATER_FLOW1 + l - 1);
export function waterLevel(id) {
  if (id === B.WATER) return 0;
  if (id >= B.WATER_FLOW1 && id <= B.WATER_FLOW7) return id - B.WATER_FLOW1 + 1;
  return -1; // not water
}
export function waterBlockForLevel(level) {
  return level <= 0 ? B.WATER : B.WATER_FLOW1 + level - 1;
}

// item ids (registry details in items.js). Items live at 200+ so the
// 100..199 range stays free for block ids.
export const I = {
  STICK: 200,
  COAL: 201,
  IRON_INGOT: 202,
  GOLD_INGOT: 203,
  DIAMOND: 204,
  APPLE: 205,
  RAW_MEAT: 206,
  COOKED_MEAT: 207,
  WHEAT: 208,
  SEEDS: 209,
  TOOLS_BASE: 210, // 210 + tier*4 + class; tiers: wood, stone, iron, gold, diamond
  BREAD: 220,
  STRING: 221,
  FEATHER: 222,
  FLINT: 223,
  BEEF: 224,
  COOKED_BEEF: 225,
  CHICKEN_RAW: 226,
  CHICKEN_COOKED: 227,
  LEATHER: 228,
  BUCKET: 229,
  WATER_BUCKET: 230,
  BOW: 231,
  ARROW: 232,
  BED_ITEM: 233,
  FLINT_AND_STEEL: 234,
  DOOR: 235,
  NETHERITE_SCRAP: 238,
  NETHERITE_INGOT: 239,
  ARMOR_BASE: 240, // 240 + slot*5 + tier; slots: head/chest/legs/feet, tiers leather..diamond
  HOE_BASE: 260,   // 260 + tier (wooden..diamond hoe)
};

export const BLOCKS = [];

function def(id, name, opt = {}) {
  BLOCKS[id] = {
    id,
    name,
    top: opt.top ?? opt.all,
    bottom: opt.bottom ?? opt.all,
    side: opt.side ?? opt.all,
    solid: opt.solid ?? true,
    opaque: opt.opaque ?? true,
    cross: opt.cross ?? false,
    plant: opt.plant ?? false,
    water: opt.water ?? false,
    glass: opt.glass ?? false,
    breakable: opt.breakable ?? true,
    sound: opt.sound ?? 'stone',
    group: opt.group ?? 'natural',
    // v2 mining
    hardness: opt.hardness ?? 1.5,
    tool: opt.tool ?? null,              // 'pickaxe' | 'axe' | 'shovel'
    tier: opt.tier ?? 0,                 // min tool tier for drops
    needsTool: opt.needsTool ?? false,
    drops: opt.drops,                    // undefined => itself
    light: opt.light ?? 0,               // emission intensity 0..15
    lightColor: opt.lightColor ?? [1, 1, 1], // emission tint for colored light
    liquid: opt.liquid ?? false,
    damage: opt.damage ?? 0,             // contact damage per second
    interact: opt.interact ?? null,      // 'table' | 'furnace' | 'chest'
  };
}

// --- natural ---
def(B.GRASS, 'Grass block', { top: 'grass_top', side: 'grass_side', bottom: 'dirt', sound: 'grass', hardness: 0.6, tool: 'shovel', drops: () => [{ id: B.DIRT, count: 1 }] });
def(B.DIRT, 'Dirt', { all: 'dirt', sound: 'gravel', hardness: 0.5, tool: 'shovel' });
def(B.STONE, 'Stone', { all: 'stone', hardness: 1.5, tool: 'pickaxe', needsTool: true, drops: () => [{ id: B.COBBLE, count: 1 }] });
def(B.COBBLE, 'Cobblestone', { all: 'cobble', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.BEDROCK, 'Bedrock', { all: 'bedrock', breakable: false, hardness: 1e9 });
def(B.SAND, 'Sand', { all: 'sand', sound: 'sand', hardness: 0.5, tool: 'shovel' });
def(B.SANDSTONE, 'Sandstone', { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_top', hardness: 0.8, tool: 'pickaxe', needsTool: true });
def(B.GRAVEL, 'Gravel', { all: 'gravel', sound: 'gravel', hardness: 0.6, tool: 'shovel', drops: () => (Math.random() < 0.15 ? [{ id: I.FLINT, count: 1 }] : [{ id: B.GRAVEL, count: 1 }]) });
def(B.SNOWY_GRASS, 'Snowy grass', { top: 'snow', side: 'grass_side_snow', bottom: 'dirt', sound: 'snow', hardness: 0.6, tool: 'shovel', drops: () => [{ id: B.DIRT, count: 1 }] });
def(B.CLAY, 'Clay', { all: 'clay', sound: 'gravel', hardness: 0.6, tool: 'shovel' });
def(B.MOSSY_COBBLE, 'Mossy cobblestone', { all: 'mossy_cobble', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.WATER, 'Water', { all: 'water', solid: false, opaque: false, water: true, liquid: true, hardness: 1e9, breakable: false });
def(B.SNOW, 'Snow block', { all: 'snow', sound: 'snow', hardness: 0.3, tool: 'shovel' });

// --- wood ---
def(B.OAK_LOG, 'Oak log', { side: 'oak_log_side', top: 'oak_log_top', bottom: 'oak_log_top', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.BIRCH_LOG, 'Birch log', { side: 'birch_log_side', top: 'birch_log_top', bottom: 'birch_log_top', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.SPRUCE_LOG, 'Spruce log', { side: 'spruce_log_side', top: 'spruce_log_top', bottom: 'spruce_log_top', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.OAK_LEAVES, 'Oak leaves', { all: 'oak_leaves', sound: 'leaves', hardness: 0.2, drops: () => (Math.random() < 0.06 ? [{ id: I.APPLE, count: 1 }] : (Math.random() < 0.08 ? [{ id: B.SAPLING, count: 1 }] : [])) });
def(B.BIRCH_LEAVES, 'Birch leaves', { all: 'birch_leaves', sound: 'leaves', hardness: 0.2, drops: () => (Math.random() < 0.06 ? [{ id: I.APPLE, count: 1 }] : []) });
def(B.SPRUCE_LEAVES, 'Spruce leaves', { all: 'spruce_leaves', sound: 'leaves', hardness: 0.2, drops: () => [] });
def(B.OAK_PLANKS, 'Oak planks', { all: 'oak_planks', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.BIRCH_PLANKS, 'Birch planks', { all: 'birch_planks', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.SPRUCE_PLANKS, 'Spruce planks', { all: 'spruce_planks', sound: 'wood', hardness: 2, tool: 'axe' });

// --- ores & minerals ---
def(B.COAL_ORE, 'Coal ore', { all: 'coal_ore', hardness: 3, tool: 'pickaxe', needsTool: true, tier: 0, drops: () => [{ id: I.COAL, count: 1 }] });
def(B.IRON_ORE, 'Iron ore', { all: 'iron_ore', hardness: 3, tool: 'pickaxe', needsTool: true, tier: 1 });
def(B.GOLD_ORE, 'Gold ore', { all: 'gold_ore', hardness: 3, tool: 'pickaxe', needsTool: true, tier: 2 });
def(B.DIAMOND_ORE, 'Diamond ore', { all: 'diamond_ore', hardness: 3, tool: 'pickaxe', needsTool: true, tier: 2, drops: () => [{ id: I.DIAMOND, count: 1 }] });
def(B.COAL_BLOCK, 'Coal block', { all: 'coal_block', hardness: 5, tool: 'pickaxe', needsTool: true });
def(B.IRON_BLOCK, 'Iron block', { all: 'iron_block', hardness: 5, tool: 'pickaxe', needsTool: true, tier: 1 });
def(B.GOLD_BLOCK, 'Gold block', { all: 'gold_block', hardness: 3, tool: 'pickaxe', needsTool: true, tier: 2 });
def(B.DIAMOND_BLOCK, 'Diamond block', { all: 'diamond_block', hardness: 5, tool: 'pickaxe', needsTool: true, tier: 2 });

// --- building ---
def(B.BRICKS, 'Bricks', { all: 'bricks', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.STONE_BRICKS, 'Stone bricks', { all: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.MOSSY_STONE_BRICKS, 'Mossy stone bricks', { all: 'mossy_stone_bricks', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.GLASS, 'Glass', { all: 'glass', opaque: false, glass: true, sound: 'glass', hardness: 0.3, drops: () => [] });
def(B.OBSIDIAN, 'Obsidian', { all: 'obsidian', hardness: 12, tool: 'pickaxe', needsTool: true, tier: 3 });
def(B.BOOKSHELF, 'Bookshelf', { side: 'bookshelf', top: 'oak_planks', bottom: 'oak_planks', sound: 'wood', hardness: 1.5, tool: 'axe', drops: () => [{ id: B.OAK_PLANKS, count: 3 }] });

// --- wool ---
const WOOLS = [
  ['WOOL_WHITE', 'White wool', 'wool_white', '#e9ecec'],
  ['WOOL_SILVER', 'Silver wool', 'wool_silver', '#a4a8a8'],
  ['WOOL_GRAY', 'Gray wool', 'wool_gray', '#5b5d5d'],
  ['WOOL_BLACK', 'Black wool', 'wool_black', '#26221f'],
  ['WOOL_RED', 'Red wool', 'wool_red', '#a8342f'],
  ['WOOL_ORANGE', 'Orange wool', 'wool_orange', '#d97b2a'],
  ['WOOL_YELLOW', 'Yellow wool', 'wool_yellow', '#d9c02a'],
  ['WOOL_LIME', 'Lime wool', 'wool_lime', '#8bc42a'],
  ['WOOL_GREEN', 'Green wool', 'wool_green', '#4a7a24'],
  ['WOOL_CYAN', 'Cyan wool', 'wool_cyan', '#2f8b8b'],
  ['WOOL_BLUE', 'Blue wool', 'wool_blue', '#3841a0'],
  ['WOOL_PURPLE', 'Purple wool', 'wool_purple', '#7a3ba0'],
  ['WOOL_MAGENTA', 'Magenta wool', 'wool_magenta', '#a83b8b'],
  ['WOOL_PINK', 'Pink wool', 'wool_pink', '#d98ba0'],
  ['WOOL_BROWN', 'Brown wool', 'wool_brown', '#6e4a2a'],
  ['WOOL_MINT', 'Mint wool', 'wool_mint', '#6bc490'],
];
for (const [key, name, tile, hex] of WOOLS) {
  def(B[key], name, { all: tile, sound: 'wool', hardness: 0.8, group: 'wool' });
}
export const WOOL_HEX = Object.fromEntries(WOOLS.map(([key, , , hex]) => [B[key], hex]));

// --- plants ---
def(B.BLOOM_RED, 'Red bloom', { all: 'flower_red', plant: true, solid: false, opaque: false, cross: true, sound: 'leaves', hardness: 0.05, group: 'plants' });
def(B.BLOOM_YELLOW, 'Yellow bloom', { all: 'flower_yellow', plant: true, solid: false, opaque: false, cross: true, sound: 'leaves', hardness: 0.05, group: 'plants' });
def(B.WILD_GRASS, 'Wild grass', { all: 'tall_grass', plant: true, solid: false, opaque: false, cross: true, sound: 'leaves', hardness: 0.05, group: 'plants', drops: () => (Math.random() < 0.35 ? [{ id: I.SEEDS, count: 1 }] : []) });
def(B.DEAD_BUSH, 'Dead bush', { all: 'dead_bush', solid: false, opaque: false, cross: true, sound: 'leaves', hardness: 0.05, group: 'plants', drops: () => (Math.random() < 0.35 ? [{ id: I.STICK, count: 1 }] : []) });

// --- functional / special ---
def(B.TORCH, 'Torch', { all: 'torch', solid: false, opaque: false, cross: true, sound: 'wood', hardness: 0.05, light: 14, lightColor: [1.0, 0.62, 0.28], group: 'building' });
def(B.TABLE, 'Crafting table', { top: 'table_top', side: 'table_side', bottom: 'oak_planks', sound: 'wood', hardness: 2.5, tool: 'axe', interact: 'table', group: 'building' });
def(B.FURNACE, 'Furnace', { top: 'furnace_top', side: 'furnace_side', bottom: 'furnace_top', hardness: 3.5, tool: 'pickaxe', needsTool: true, interact: 'furnace', group: 'building' });
def(B.CHEST, 'Chest', { top: 'chest_top', side: 'chest_side', bottom: 'chest_top', sound: 'wood', hardness: 2.5, tool: 'axe', interact: 'chest', group: 'building' });
def(B.GLOWSTONE, 'Glowstone', { all: 'glowstone', sound: 'glass', hardness: 0.3, light: 15, lightColor: [1.0, 0.85, 0.5], group: 'building' });
def(B.LAVA, 'Lava', { all: 'lava', solid: false, opaque: false, water: true, liquid: true, light: 15, lightColor: [1.0, 0.32, 0.1], hardness: 1e9, breakable: false, damage: 8 });
def(B.CACTUS, 'Cactus', { side: 'cactus_side', top: 'cactus_top', bottom: 'cactus_top', sound: 'wool', hardness: 0.4, damage: 2, group: 'plants' });
def(B.PUMPKIN, 'Pumpkin', { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top', sound: 'wood', hardness: 1, tool: 'axe', group: 'natural' });

// --- round 5: stone family + nether ---
def(B.ANDESITE, 'Andesite', { all: 'andesite', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.GRANITE, 'Granite', { all: 'granite', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.DIORITE, 'Diorite', { all: 'diorite', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.POLISHED_ANDESITE, 'Polished andesite', { all: 'polished_andesite', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.POLISHED_GRANITE, 'Polished granite', { all: 'polished_granite', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.POLISHED_DIORITE, 'Polished diorite', { all: 'polished_diorite', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.SMOOTH_STONE, 'Smooth stone', { all: 'smooth_stone', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.ICE, 'Ice', { all: 'ice', opaque: false, glass: true, sound: 'glass', hardness: 0.5, drops: () => [] });
def(B.PACKED_ICE, 'Packed ice', { all: 'packed_ice', sound: 'glass', hardness: 0.5, drops: () => [] });
def(B.TERRACOTTA, 'Terracotta', { all: 'terracotta', hardness: 1.25, tool: 'pickaxe', needsTool: true });
def(B.NETHERRACK, 'Netherrack', { all: 'netherrack', hardness: 0.4, tool: 'pickaxe', needsTool: true });
def(B.SOUL_SAND, 'Soul sand', { all: 'soul_sand', sound: 'sand', hardness: 0.5, tool: 'shovel' });
def(B.NETHER_BRICKS, 'Nether bricks', { all: 'nether_bricks', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.MAGMA, 'Magma block', { all: 'magma', light: 6, lightColor: [1.0, 0.45, 0.15], hardness: 0.5, tool: 'pickaxe', needsTool: true, damage: 2 });
def(B.QUARTZ_BLOCK, 'Quartz block', { all: 'quartz_block', hardness: 0.8, tool: 'pickaxe', needsTool: true });
def(B.CRIMSON_STEM, 'Crimson stem', { side: 'crimson_stem_side', top: 'crimson_stem_top', bottom: 'crimson_stem_top', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.CRIMSON_PLANKS, 'Crimson planks', { all: 'crimson_planks', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.WARPED_STEM, 'Warped stem', { side: 'warped_stem_side', top: 'warped_stem_top', bottom: 'warped_stem_top', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.WARPED_PLANKS, 'Warped planks', { all: 'warped_planks', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.NETHER_PORTAL, 'Nether portal', { all: 'portal', solid: false, opaque: false, water: true, hardness: 1e9, breakable: false, light: 11, lightColor: [0.7, 0.25, 1.0] });
def(B.STONE_SLAB_B, 'Stone slab', { all: 'stone', shape: 'slab', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.STONE_SLAB_T, 'Stone slab', { all: 'stone', shape: 'slabtop', hardness: 1.5, tool: 'pickaxe', needsTool: true, drops: () => [{ id: B.STONE_SLAB_B, count: 1 }] });
def(B.OAK_SLAB_B, 'Oak slab', { all: 'oak_planks', shape: 'slab', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.OAK_SLAB_T, 'Oak slab', { all: 'oak_planks', shape: 'slabtop', sound: 'wood', hardness: 2, tool: 'axe', drops: () => [{ id: B.OAK_SLAB_B, count: 1 }] });
def(B.STAIRS_STONE_N, 'Stone stairs', { all: 'stone', shape: 'stairs', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.STAIRS_STONE_E, 'Stone stairs', { all: 'stone', shape: 'stairs', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.STAIRS_STONE_S, 'Stone stairs', { all: 'stone', shape: 'stairs', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.STAIRS_STONE_W, 'Stone stairs', { all: 'stone', shape: 'stairs', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.STAIRS_OAK_N, 'Oak stairs', { all: 'oak_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.STAIRS_OAK_E, 'Oak stairs', { all: 'oak_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.STAIRS_OAK_S, 'Oak stairs', { all: 'oak_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.STAIRS_OAK_W, 'Oak stairs', { all: 'oak_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.ANCIENT_DEBRIS, 'Ancient debris', { all: 'ancient_debris', hardness: 8, tool: 'pickaxe', needsTool: true, tier: 3 });

// --- doors: facing (N/E/S/W) x state (closed/open), lower + upper halves ---
const DOOR_FACING = [['N', 0, -0.5], ['E', 0.32, 0], ['S', 0, 0.5], ['W', -0.32, 0]];
for (const [F, ox, oz] of DOOR_FACING) {
  for (const [st, half] of [['C', 'L'], ['O', 'L'], ['C', 'U'], ['O', 'U']]) {
    const id = B['DOOR_' + half + '_' + F + '_' + st];
    def(id, 'Door', {
      all: st === 'C' ? 'door_lower' : 'door_upper',
      solid: true, opaque: false, shape: 'door',
      sound: 'wood', hardness: 1.2, tool: 'axe',
      interact: st === 'C' ? 'door' : 'door',
      drops: () => [{ id: I.DOOR, count: 1 }],
    });
    BLOCKS[id].doorFacing = F;
    BLOCKS[id].doorOpen = st === 'O';
    BLOCKS[id].doorHalf = half;
    BLOCKS[id].doorOffset = [ox, oz];
  }
}
def(B.OAK_FENCE, 'Oak fence', { all: 'oak_planks', shape: 'fence', sound: 'wood', hardness: 2, tool: 'axe' });

// birch/spruce/cobble slabs + stairs (N/S facings)
def(B.BIRCH_SLAB_B, 'Birch slab', { all: 'birch_planks', shape: 'slab', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.BIRCH_SLAB_T, 'Birch slab', { all: 'birch_planks', shape: 'slabtop', sound: 'wood', hardness: 2, tool: 'axe', drops: () => [{ id: B.BIRCH_SLAB_B, count: 1 }] });
def(B.SPRUCE_SLAB_B, 'Spruce slab', { all: 'spruce_planks', shape: 'slab', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.SPRUCE_SLAB_T, 'Spruce slab', { all: 'spruce_planks', shape: 'slabtop', sound: 'wood', hardness: 2, tool: 'axe', drops: () => [{ id: B.SPRUCE_SLAB_B, count: 1 }] });
def(B.COBBLE_SLAB_B, 'Cobblestone slab', { all: 'cobble', shape: 'slab', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.COBBLE_SLAB_T, 'Cobblestone slab', { all: 'cobble', shape: 'slabtop', hardness: 2, tool: 'pickaxe', needsTool: true, drops: () => [{ id: B.COBBLE_SLAB_B, count: 1 }] });
def(B.STAIRS_BIRCH_N, 'Birch stairs', { all: 'birch_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.STAIRS_BIRCH_S, 'Birch stairs', { all: 'birch_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.STAIRS_SPRUCE_N, 'Spruce stairs', { all: 'spruce_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.STAIRS_SPRUCE_S, 'Spruce stairs', { all: 'spruce_planks', shape: 'stairs', sound: 'wood', hardness: 2, tool: 'axe' });
def(B.STAIRS_COBBLE_N, 'Cobblestone stairs', { all: 'cobble', shape: 'stairs', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.STAIRS_COBBLE_S, 'Cobblestone stairs', { all: 'cobble', shape: 'stairs', hardness: 2, tool: 'pickaxe', needsTool: true });

// partial-block collision heights (bottom slabs are half height)
export function blockHeight(id) {
  if (id === B.STONE_SLAB_B || id === B.OAK_SLAB_B) return 0.5;
  return 1;
}

// --- round 4: world feel + farming + beds ---
for (const [tid, ox, oz] of [['N', 0, -0.32], ['E', 0.32, 0], ['S', 0, 0.32], ['W', -0.32, 0]]) {
  def(B['TORCH_WALL_' + tid], 'Torch', { all: 'torch', solid: false, opaque: false, cross: true, sound: 'wood', hardness: 0.05, light: 14, lightColor: [1.0, 0.62, 0.28], group: 'building', drops: () => [{ id: B.TORCH, count: 1 }] });
  BLOCKS[B['TORCH_WALL_' + tid]].wallOffset = [ox, oz];
}
def(B.SAPLING, 'Oak sapling', { all: 'sapling', plant: true, solid: false, opaque: false, cross: true, sound: 'leaves', hardness: 0.05, group: 'plants' });
def(B.FARMLAND, 'Farmland', { top: 'farmland_top', side: 'farmland_side', bottom: 'dirt', sound: 'gravel', hardness: 0.6, tool: 'shovel', drops: () => [{ id: B.DIRT, count: 1 }] });
for (let s = 0; s < 4; s++) {
  def(B['WHEAT_' + s], 'Wheat crops', { all: 'wheat_' + s, solid: false, opaque: false, cross: true, sound: 'leaves', hardness: 0.05, group: 'plants', drops: s === 3
    ? () => [{ id: I.WHEAT, count: 1 }, { id: I.SEEDS, count: 1 + Math.floor(Math.random() * 2) }]
    : () => [{ id: I.SEEDS, count: 1 }] });
}
def(B.BED, 'Bed', { top: 'bed_top', side: 'bed_side', bottom: 'oak_planks', solid: true, opaque: false, sound: 'wood', hardness: 0.8, interact: 'bed', group: 'building' });

// flowing water levels share the water tile
for (let l = 1; l <= 7; l++) {
  def(B['WATER_FLOW' + l], 'Water', { all: 'water', solid: false, opaque: false, water: true, liquid: true, hardness: 1e9, breakable: false });
}

// group fixes
for (const id of [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.COAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK]) {
  BLOCKS[id].group = 'ores';
}
BLOCKS[B.SANDSTONE].group = 'natural';
for (const id of [B.ANDESITE, B.GRANITE, B.DIORITE, B.POLISHED_ANDESITE, B.POLISHED_GRANITE, B.POLISHED_DIORITE, B.SMOOTH_STONE, B.TERRACOTTA, B.NETHERRACK, B.SOUL_SAND, B.NETHER_BRICKS, B.MAGMA, B.QUARTZ_BLOCK, B.CRIMSON_STEM, B.CRIMSON_PLANKS, B.WARPED_STEM, B.WARPED_PLANKS]) BLOCKS[id].group = 'building';
for (const id of [B.ICE, B.PACKED_ICE]) BLOCKS[id].group = 'natural';
for (const id of [B.STONE_SLAB_B, B.STONE_SLAB_T, B.OAK_SLAB_B, B.OAK_SLAB_T, B.STAIRS_STONE_N, B.STAIRS_STONE_E, B.STAIRS_STONE_S, B.STAIRS_STONE_W, B.STAIRS_OAK_N, B.STAIRS_OAK_E, B.STAIRS_OAK_S, B.STAIRS_OAK_W]) BLOCKS[id].group = 'building';
for (const id of [B.BRICKS, B.STONE_BRICKS, B.MOSSY_STONE_BRICKS, B.GLASS, B.OBSIDIAN, B.BOOKSHELF]) BLOCKS[id].group = 'building';
for (const id of [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS]) BLOCKS[id].group = 'wood';

export const isOpaque = (id) => BLOCKS[id]?.opaque ?? false;
export const isSolid = (id) => BLOCKS[id]?.solid ?? false;
export const isWater = (id) => waterLevel(id) >= 0;
export const isLava = (id) => id === B.LAVA;
export const isLiquid = (id) => BLOCKS[id]?.liquid ?? false;
export const isCross = (id) => BLOCKS[id]?.cross ?? false;
export const lightOf = (id) => BLOCKS[id]?.light ?? 0;
export const isReplaceable = (id) => id === B.AIR || isCross(id) || isLiquid(id);

// faceTiles[face] with face order: +X, -X, +Y(top), -Y(bottom), +Z, -Z
export function resolveFaceTiles(tileIndex) {
  for (const bl of BLOCKS) {
    if (!bl) continue;
    bl.faceTiles = [
      tileIndex[bl.side], tileIndex[bl.side],
      tileIndex[bl.top], tileIndex[bl.bottom],
      tileIndex[bl.side], tileIndex[bl.side],
    ];
  }
}

export const isBlockItem = (id) => !!BLOCKS[id];

export const GROUP_LABELS = {
  natural: 'Natural',
  wood: 'Wood',
  ores: 'Ores & minerals',
  building: 'Building',
  wool: 'Wool',
  plants: 'Plants',
};

// blocks placeable from the creative palette
export const PALETTE_IDS = BLOCKS.filter((b) => b && b.id !== B.AIR && !b.water && b.id !== B.LAVA && b.id !== B.BEDROCK).map((b) => b.id);

// drop computation: returns [{id, count}]
export function dropsFor(blockId, rand = Math.random) {
  const bl = BLOCKS[blockId];
  if (!bl) return [];
  if (bl.drops) return bl.drops(rand);
  return [{ id: blockId, count: 1 }];
}
