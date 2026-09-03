// Block registry. Every texture name here gets a procedurally drawn tile
// in the atlas (see textures.js). Ids must stay stable — they travel over
// the network and live in saves.

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
};

export const BLOCKS = [];

function def(id, name, opt = {}) {
  BLOCKS[id] = {
    id,
    name,
    top: opt.top ?? opt.all,
    bottom: opt.bottom ?? opt.all,
    side: opt.side ?? opt.all,
    // collision
    solid: opt.solid ?? true,
    // hides neighboring faces & rendered in opaque pass
    opaque: opt.opaque ?? true,
    // cross-shaped plant (no collision)
    cross: opt.cross ?? false,
    water: opt.water ?? false,
    glass: opt.glass ?? false,
    breakable: opt.breakable ?? true,
    sound: opt.sound ?? 'stone',
    group: opt.group ?? 'natural',
  };
}

// --- natural ---
def(B.GRASS, 'Grass', { top: 'grass_top', side: 'grass_side', bottom: 'dirt', sound: 'grass' });
def(B.DIRT, 'Dirt', { all: 'dirt', sound: 'gravel' });
def(B.STONE, 'Stone', { all: 'stone' });
def(B.COBBLE, 'Cobblestone', { all: 'cobble' });
def(B.BEDROCK, 'Bedrock', { all: 'bedrock', breakable: false });
def(B.SAND, 'Sand', { all: 'sand', sound: 'sand' });
def(B.SANDSTONE, 'Sandstone', { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_top' });
def(B.GRAVEL, 'Gravel', { all: 'gravel', sound: 'gravel' });
def(B.SNOWY_GRASS, 'Snowy grass', { top: 'snow', side: 'grass_side_snow', bottom: 'dirt', sound: 'snow' });
def(B.CLAY, 'Clay', { all: 'clay', sound: 'gravel' });
def(B.MOSSY_COBBLE, 'Mossy cobblestone', { all: 'mossy_cobble' });
def(B.WATER, 'Water', { all: 'water', solid: false, opaque: false, water: true });
def(B.SNOW, 'Snow block', { all: 'snow', sound: 'snow' });

// --- wood ---
def(B.OAK_LOG, 'Oak log', { side: 'oak_log_side', top: 'oak_log_top', bottom: 'oak_log_top', sound: 'wood' });
def(B.BIRCH_LOG, 'Birch log', { side: 'birch_log_side', top: 'birch_log_top', bottom: 'birch_log_top', sound: 'wood' });
def(B.SPRUCE_LOG, 'Spruce log', { side: 'spruce_log_side', top: 'spruce_log_top', bottom: 'spruce_log_top', sound: 'wood' });
def(B.OAK_LEAVES, 'Oak leaves', { all: 'oak_leaves', sound: 'leaves' });
def(B.BIRCH_LEAVES, 'Birch leaves', { all: 'birch_leaves', sound: 'leaves' });
def(B.SPRUCE_LEAVES, 'Spruce leaves', { all: 'spruce_leaves', sound: 'leaves' });
def(B.OAK_PLANKS, 'Oak planks', { all: 'oak_planks', sound: 'wood' });
def(B.BIRCH_PLANKS, 'Birch planks', { all: 'birch_planks', sound: 'wood' });
def(B.SPRUCE_PLANKS, 'Spruce planks', { all: 'spruce_planks', sound: 'wood' });

// --- ores & minerals ---
def(B.COAL_ORE, 'Coal ore', { all: 'coal_ore' });
def(B.IRON_ORE, 'Iron ore', { all: 'iron_ore' });
def(B.GOLD_ORE, 'Gold ore', { all: 'gold_ore' });
def(B.DIAMOND_ORE, 'Diamond ore', { all: 'diamond_ore' });
def(B.COAL_BLOCK, 'Coal block', { all: 'coal_block' });
def(B.IRON_BLOCK, 'Iron block', { all: 'iron_block' });
def(B.GOLD_BLOCK, 'Gold block', { all: 'gold_block' });
def(B.DIAMOND_BLOCK, 'Diamond block', { all: 'diamond_block' });

// --- building ---
def(B.BRICKS, 'Bricks', { all: 'bricks' });
def(B.STONE_BRICKS, 'Stone bricks', { all: 'stone_bricks' });
def(B.MOSSY_STONE_BRICKS, 'Mossy stone bricks', { all: 'mossy_stone_bricks' });
def(B.GLASS, 'Glass', { all: 'glass', opaque: false, glass: true, sound: 'glass' });
def(B.OBSIDIAN, 'Obsidian', { all: 'obsidian' });
def(B.BOOKSHELF, 'Bookshelf', { side: 'bookshelf', top: 'oak_planks', bottom: 'oak_planks', sound: 'wood' });

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
  def(B[key], name, { all: tile, sound: 'wool', group: 'wool' });
}
export const WOOL_HEX = Object.fromEntries(WOOLS.map(([key, , , hex]) => [B[key], hex]));

// --- plants (cross-shaped, no collision) ---
def(B.BLOOM_RED, 'Red bloom', { all: 'flower_red', solid: false, opaque: false, cross: true, sound: 'leaves', group: 'plants' });
def(B.BLOOM_YELLOW, 'Yellow bloom', { all: 'flower_yellow', solid: false, opaque: false, cross: true, sound: 'leaves', group: 'plants' });
def(B.WILD_GRASS, 'Wild grass', { all: 'tall_grass', solid: false, opaque: false, cross: true, sound: 'leaves', group: 'plants' });
def(B.DEAD_BUSH, 'Dead bush', { all: 'dead_bush', solid: false, opaque: false, cross: true, sound: 'leaves', group: 'plants' });

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

export const isOpaque = (id) => BLOCKS[id]?.opaque ?? false;
export const isSolid = (id) => BLOCKS[id]?.solid ?? false;
export const isWater = (id) => id === B.WATER;
export const isCross = (id) => BLOCKS[id]?.cross ?? false;
export const isReplaceable = (id) => id === B.AIR || isCross(id) || isWater(id);

// picker groups in display order
export const GROUP_LABELS = {
  natural: 'Natural',
  wood: 'Wood',
  ores: 'Ores & minerals',
  building: 'Building',
  wool: 'Wool',
  plants: 'Plants',
};
for (const [id] of Object.entries({ COAL_ORE: 0, IRON_ORE: 0, GOLD_ORE: 0, DIAMOND_ORE: 0, COAL_BLOCK: 0, IRON_BLOCK: 0, GOLD_BLOCK: 0, DIAMOND_BLOCK: 0 })) {
  BLOCKS[B[id]].group = 'ores';
}
BLOCKS[B.SANDSTONE].group = 'natural';
[B.BRICKS, B.STONE_BRICKS, B.MOSSY_STONE_BRICKS, B.GLASS, B.OBSIDIAN, B.BOOKSHELF].forEach((id) => (BLOCKS[id].group = 'building'));
[B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS].forEach((id) => (BLOCKS[id].group = 'wood'));

// blocks shown in the palette (everything placeable)
export const PALETTE_IDS = BLOCKS.filter((b) => b && b.id !== B.AIR && b.id !== B.WATER).map((b) => b.id);

export const DEFAULT_HOTBAR = [
  B.GRASS, B.STONE, B.OAK_PLANKS, B.OAK_LOG, B.GLASS,
  B.BRICKS, B.SAND, B.WOOL_RED, B.BLOOM_RED,
];
