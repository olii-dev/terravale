// Deterministic world generation v2. Terrain is a pure function of
// (x, y, z, seed) so every peer generates identical chunks; trees are
// stamped per-chunk by scanning a margin (they can cross borders).

import { SimplexNoise, hash2, hashSeed, mulberry32 } from './noise.js';
import { B } from './blocks.js';

export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 40;
export const LAVA_LEVEL = 11;

const BIOMES = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOWY: 3, TAIGA: 4, SAVANNA: 5 };

export function createWorldgen(seed) {
  const nHeight = new SimplexNoise(hashSeed(seed + ':h'));
  const nDetail = new SimplexNoise(hashSeed(seed + ':d'));
  const nTemp = new SimplexNoise(hashSeed(seed + ':t'));
  const nMoist = new SimplexNoise(hashSeed(seed + ':m'));
  const nCave = new SimplexNoise(hashSeed(seed + ':c'));
  const nOre = new SimplexNoise(hashSeed(seed + ':o'));
  const numSeed = hashSeed(seed);

  function biomeAt(x, z) {
    const t = nTemp.fbm2(x / 420, z / 420, 3);
    const m = nMoist.fbm2(x / 380 + 100, z / 380 - 100, 3);
    if (t < -0.3) return BIOMES.SNOWY;
    if (t < -0.12) return BIOMES.TAIGA;
    if (t > 0.32 && m < 0.05) return BIOMES.DESERT;
    if (t > 0.2 && m < 0.14) return BIOMES.SAVANNA;
    if (m > 0.08) return BIOMES.FOREST;
    return BIOMES.PLAINS;
  }

  function heightAt(x, z) {
    const base = nHeight.fbm2(x / 230, z / 230, 4);
    const hills = nDetail.fbm2(x / 62, z / 62, 3);
    let h = 50 + base * 26 + hills * 8;
    // occasional mountains
    if (base > 0.4) h += (base - 0.4) * 46;
    if (h < SEA + 2 && h > SEA - 3) h = SEA + (h - SEA) * 0.55;
    return Math.max(4, Math.min(HEIGHT - 24, Math.floor(h)));
  }

  function caveAt(x, y, z) {
    if (y <= 2 || y > HEIGHT - 6) return false;
    const n1 = nCave.noise3(x / 26, y / 18, z / 26);
    const n2 = nCave.noise3(x / 26 + 90, y / 18 + 90, z / 26 - 90);
    return n1 * n1 + n2 * n2 < 0.012;
  }

  function oreAt(x, y, z) {
    const n = nOre.noise3(x / 7, y / 7, z / 7);
    if (n < 0.62) return B.STONE;
    if (y < 16 && n > 0.78) return B.DIAMOND_ORE;
    if (y < 28 && n > 0.74) return B.GOLD_ORE;
    if (y < 48 && n > 0.70) return B.IRON_ORE;
    if (y < 72) return B.COAL_ORE;
    return B.STONE;
  }

  function surfaceBlocks(biome) {
    switch (biome) {
      case BIOMES.DESERT: return { top: B.SAND, filler: B.SAND, depth: 5 };
      case BIOMES.SNOWY:
      case BIOMES.TAIGA: return { top: B.SNOWY_GRASS, filler: B.DIRT, depth: 3 };
      default: return { top: B.GRASS, filler: B.DIRT, depth: 3 };
    }
  }

  // pure terrain column (no trees). Water fills below sea; caves below the
  // lava level flood with lava.
  function terrainAt(x, y, z, h, biome) {
    if (y === 0) return B.BEDROCK;
    if (y === 1 && hash2(x, z, numSeed ^ 0xbed) < 0.5) return B.BEDROCK;
    if (y > h) return y <= SEA ? B.WATER : B.AIR;
    if (y === h) {
      if (h <= SEA + 1) return B.SAND;
      return surfaceBlocks(biome).top;
    }
    const { filler, depth } = surfaceBlocks(biome);
    if (y > h - depth) {
      if (biome === BIOMES.DESERT && y > h - 3) return B.SAND;
      return filler;
    }
    if (biome === BIOMES.DESERT && y > h - 6) return B.SANDSTONE;
    return oreAt(x, y, z);
  }

  function terrainBlock(x, y, z, h, biome) {
    let id = terrainAt(x, y, z, h, biome);
    if (id !== B.AIR && id !== B.WATER && caveAt(x, y, z)) {
      id = y <= LAVA_LEVEL ? B.LAVA : B.AIR;
    }
    return id;
  }

  // surface decoration per column (pure)
  function plantAt(x, z, h, biome) {
    if (h < SEA) return B.AIR;
    const r = hash2(x, z, numSeed ^ 0x9a7);
    if (biome === BIOMES.DESERT) {
      if (r < 0.006) return B.CACTUS;
      if (r < 0.012) return B.DEAD_BUSH;
      return B.AIR;
    }
    if (biome === BIOMES.SAVANNA) {
      if (r < 0.02) return B.WILD_GRASS;
      if (r < 0.024) return B.PUMPKIN;
      return B.AIR;
    }
    if (biome === BIOMES.PLAINS || biome === BIOMES.FOREST) {
      if (r < 0.052) return B.WILD_GRASS;
      if (r < 0.060) return B.BLOOM_RED;
      if (r < 0.068) return B.BLOOM_YELLOW;
    }
    if (biome === BIOMES.TAIGA && r < 0.01) return B.WILD_GRASS;
    return B.AIR;
  }

  function treeAt(x, z) {
    const biome = biomeAt(x, z);
    const h = heightAt(x, z);
    if (h <= SEA + 1) return null;
    const r = hash2(x, z, numSeed ^ 0x7ee);
    let chance = 0, kind = 'oak';
    if (biome === BIOMES.FOREST) chance = 0.028;
    else if (biome === BIOMES.PLAINS) chance = 0.003;
    else if (biome === BIOMES.TAIGA) { chance = 0.03; kind = 'spruce'; }
    else if (biome === BIOMES.SNOWY) { chance = 0.012; kind = 'spruce'; }
    else if (biome === BIOMES.SAVANNA) { chance = 0.004; kind = 'acacia'; }
    if (r >= chance) return null;
    if (hash2(x + 7919, z + 104729, numSeed) < 0.35) return null; // thin clusters
    const rr = hash2(x, z, numSeed ^ 0x55a);
    if (kind === 'spruce') return { x, z, base: h + 1, trunk: 6 + Math.floor(rr * 3), kind };
    if (kind === 'acacia') return { x, z, base: h + 1, trunk: 5 + Math.floor(rr * 3), kind };
    kind = rr < 0.25 ? 'birch' : 'oak';
    return { x, z, base: h + 1, trunk: 4 + Math.floor(rr * 3), kind };
  }

  function stampTree(data, tree, x0, z0, maxY) {
    const set = (lx, y, lz, id, replaceOnly = false) => {
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return maxY;
      const idx = (y * CHUNK + lz) * CHUNK + lx;
      if (replaceOnly && data[idx] !== B.AIR && data[idx] !== B.WATER) return maxY;
      data[idx] = id;
      return Math.max(maxY, y + 1);
    };
    const { x, z, base, trunk, kind } = tree;
    const log = kind === 'birch' ? B.BIRCH_LOG : kind === 'spruce' ? B.SPRUCE_LOG : B.OAK_LOG;
    const leaf = kind === 'birch' ? B.BIRCH_LEAVES : kind === 'spruce' ? B.SPRUCE_LEAVES : B.OAK_LEAVES;
    const top = base + trunk;
    let my = maxY;

    if (kind === 'spruce') {
      for (let i = 0; i < trunk; i++) my = set(x - x0, base + i, z - z0, log);
      let r = 0;
      for (let y = top + 1; y >= base + 2; y--) {
        r = Math.min(2, r + ((top + 1 - y) % 2 === 0 ? 1 : 0));
        const rr = y > top - 1 ? 1 : r;
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= rr + 1 && !(dx === 0 && dz === 0 && y <= top)) {
            my = set(x + dx - x0, y, z + dz - z0, leaf, true);
          }
        }
      }
      my = set(x - x0, top + 2, z - z0, leaf, true);
    } else if (kind === 'acacia') {
      for (let i = 0; i < trunk; i++) my = set(x - x0, base + i, z - z0, log);
      for (let dy = -1; dy <= 0; dy++) {
        const r = dy === 0 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          if (dx === 0 && dz === 0 && dy < 0) continue;
          my = set(x + dx - x0, top + dy, z + dz - z0, leaf, true);
        }
      }
      my = set(x - x0, top + 1, z - z0, leaf, true);
    } else {
      for (let i = 0; i < trunk; i++) my = set(x - x0, base + i, z - z0, log);
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy >= 0 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          my = set(x + dx - x0, top + dy, z + dz - z0, leaf, true);
        }
      }
    }
    return my;
  }

  function generateChunk(cx, cz) {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    let maxY = 1;

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const biome = biomeAt(x, z);
        const h = heightAt(x, z);
        for (let y = 0; y <= Math.max(h + 1, SEA); y++) {
          const id = terrainBlock(x, y, z, h, biome);
          data[(y * CHUNK + lz) * CHUNK + lx] = id;
          if (id !== B.AIR) maxY = Math.max(maxY, y + 1);
        }
        // surface plant / cactus column
        const surf = data[(h * CHUNK + lz) * CHUNK + lx];
        if (surf === surfaceBlocks(biome).top) {
          const plant = plantAt(x, z, h, biome);
          if (plant && h + 1 < HEIGHT) {
            if (plant === B.CACTUS) {
              const ch = 1 + Math.floor(hash2(x, z, numSeed ^ 0xca7) * 3);
              for (let i = 0; i < ch && h + 1 + i < HEIGHT; i++) {
                data[((h + 1 + i) * CHUNK + lz) * CHUNK + lx] = B.CACTUS;
                maxY = Math.max(maxY, h + 2 + i);
              }
            } else {
              data[((h + 1) * CHUNK + lz) * CHUNK + lx] = plant;
              maxY = Math.max(maxY, h + 2);
            }
          }
        }
      }
    }

    // trees, scanning beyond the chunk for overlap
    for (let x = x0 - 3; x < x0 + CHUNK + 3; x++) {
      for (let z = z0 - 3; z < z0 + CHUNK + 3; z++) {
        const tree = treeAt(x, z);
        if (tree) maxY = stampTree(data, tree, x0, z0, maxY);
      }
    }

    return { data, maxY: Math.min(HEIGHT, maxY + 1) };
  }

  function spawnPoint() {
    const rand = mulberry32(numSeed);
    for (let i = 0; i < 400; i++) {
      const x = Math.floor((rand() - 0.5) * 160);
      const z = Math.floor((rand() - 0.5) * 160);
      const h = heightAt(x, z);
      if (h > SEA + 1) return { x: x + 0.5, y: h + 2.5, z: z + 0.5 };
    }
    return { x: 0.5, y: HEIGHT - 10, z: 0.5 };
  }

  return { seed, generateChunk, heightAt, biomeAt, terrainBlock, spawnPoint, BIOMES };
}

export const BIOME_NAMES = ['Plains', 'Forest', 'Desert', 'Snowfield', 'Taiga', 'Savanna'];
