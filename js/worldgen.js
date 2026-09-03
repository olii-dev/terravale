// Deterministic world generation. Terrain is a pure function of
// (x, y, z, seed) so every peer generates identical chunks; trees are
// stamped per-chunk by scanning a margin (they can cross chunk borders).

import { SimplexNoise, hash2, hashSeed, mulberry32 } from './noise.js';
import { B } from './blocks.js';

export const CHUNK = 16;   // horizontal chunk size
export const HEIGHT = 80;  // world height
export const SEA = 28;     // water level

const BIOMES = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOWY: 3 };

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
    if (t < -0.28) return BIOMES.SNOWY;
    if (t > 0.32 && m < 0.05) return BIOMES.DESERT;
    if (m > 0.08) return BIOMES.FOREST;
    return BIOMES.PLAINS;
  }

  function heightAt(x, z) {
    const base = nHeight.fbm2(x / 210, z / 210, 4);       // continents
    const hills = nDetail.fbm2(x / 62, z / 62, 3);         // local relief
    let h = 30 + base * 22 + hills * 7;
    // flatten around sea level a bit for nicer beaches
    if (h < SEA + 2 && h > SEA - 3) h = SEA + (h - SEA) * 0.55;
    return Math.max(4, Math.min(HEIGHT - 20, Math.floor(h)));
  }

  function caveAt(x, y, z) {
    if (y <= 2 || y > HEIGHT - 6) return false;
    const n1 = nCave.noise3(x / 26, y / 18, z / 26);
    const n2 = nCave.noise3(x / 26 + 90, y / 18 + 90, z / 26 - 90);
    // intersection of two tunnel fields = winding caverns
    return n1 * n1 + n2 * n2 < 0.012;
  }

  function oreAt(x, y, z) {
    const n = nOre.noise3(x / 7, y / 7, z / 7);
    if (n < 0.62) return B.STONE;
    if (y < 14 && n > 0.78) return B.DIAMOND_ORE;
    if (y < 22 && n > 0.74) return B.GOLD_ORE;
    if (y < 34 && n > 0.70) return B.IRON_ORE;
    if (y < 50) return B.COAL_ORE;
    return B.STONE;
  }

  // surface block by biome
  function surfaceBlocks(biome) {
    switch (biome) {
      case BIOMES.DESERT: return { top: B.SAND, filler: B.SAND, depth: 5 };
      case BIOMES.SNOWY: return { top: B.SNOWY_GRASS, filler: B.DIRT, depth: 3 };
      default: return { top: B.GRASS, filler: B.DIRT, depth: 3 };
    }
  }

  // pure terrain column (no trees). Water fills below sea level.
  function terrainAt(x, y, z, h, biome) {
    if (y === 0) return B.BEDROCK;
    if (y === 1 && hash2(x, z, numSeed ^ 0xbed) < 0.5) return B.BEDROCK;
    if (y > h) return y <= SEA ? B.WATER : B.AIR;
    if (y === h) {
      if (h <= SEA + 1) return biome === BIOMES.SNOWY && h <= SEA ? B.SAND : B.SAND; // beaches
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

  // terrain incl. caves, pure per block — used by chunk gen and by
  // World.getBlock for not-yet-materialized chunks
  function terrainBlock(x, y, z, h, biome) {
    let id = terrainAt(x, y, z, h, biome);
    if (id !== B.AIR && id !== B.WATER && caveAt(x, y, z)) id = B.AIR;
    return id;
  }

  // ground surface decoration per column (pure): plants on grass/sand
  function plantAt(x, z, h, biome) {
    if (h < SEA) return B.AIR;
    const r = hash2(x, z, numSeed ^ 0x9a7);
    if (biome === BIOMES.DESERT) {
      if (r < 0.008) return B.DEAD_BUSH;
      return B.AIR;
    }
    if (biome === BIOMES.PLAINS || biome === BIOMES.FOREST) {
      if (r < 0.052) return B.WILD_GRASS;
      if (r < 0.060) return B.BLOOM_RED;
      if (r < 0.068) return B.BLOOM_YELLOW;
    }
    return B.AIR;
  }

  // deterministic tree placement per column
  function treeAt(x, z) {
    const biome = biomeAt(x, z);
    const h = heightAt(x, z);
    if (h <= SEA + 1) return null;
    const r = hash2(x, z, numSeed ^ 0x7ee);
    let chance = 0, kind = 'oak';
    if (biome === BIOMES.FOREST) chance = 0.028;
    else if (biome === BIOMES.PLAINS) chance = 0.003;
    else if (biome === BIOMES.SNOWY) { chance = 0.012; kind = 'spruce'; }
    if (r >= chance) return null;
    // thin out: no adjacent-tree clusters, keep 2-block spacing
    if (hash2(x + 7919, z + 104729, numSeed) < 0.35) return null;
    const rr = hash2(x, z, numSeed ^ 0x55a);
    if (kind === 'spruce') {
      return { x, z, base: h + 1, trunk: 6 + Math.floor(rr * 3), kind };
    }
    kind = rr < 0.25 ? 'birch' : 'oak';
    return { x, z, base: h + 1, trunk: 4 + Math.floor(rr * 3), kind };
  }

  // stamp a tree into a chunk's data buffer wherever it overlaps
  function stampTree(data, tree, x0, z0) {
    const set = (lx, y, lz, id, replaceOnly = false) => {
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      const idx = (y * CHUNK + lz) * CHUNK + lx;
      if (replaceOnly && data[idx] !== B.AIR && data[idx] !== B.WATER) return;
      data[idx] = id;
    };
    const { x, z, base, trunk, kind } = tree;
    const log = kind === 'birch' ? B.BIRCH_LOG : kind === 'spruce' ? B.SPRUCE_LOG : B.OAK_LOG;
    const leaf = kind === 'birch' ? B.BIRCH_LEAVES : kind === 'spruce' ? B.SPRUCE_LEAVES : B.OAK_LEAVES;
    const top = base + trunk;

    if (kind === 'spruce') {
      for (let i = 0; i < trunk; i++) set(x - x0, base + i, z - z0, log);
      // conical canopy
      let r = 0;
      for (let y = top + 1; y >= base + 2; y--) {
        r = Math.min(2, r + ((top + 1 - y) % 2 === 0 ? 1 : 0));
        const rr = y > top - 1 ? 1 : r;
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= rr + 1 && !(dx === 0 && dz === 0 && y <= top)) {
            set(x + dx - x0, y, z + dz - z0, leaf, true);
          }
        }
      }
      set(x - x0, top + 2, z - z0, leaf, true);
    } else {
      for (let i = 0; i < trunk; i++) set(x - x0, base + i, z - z0, log);
      // blobby canopy
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy >= 0 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue; // trunk
          set(x + dx - x0, top + dy, z + dz - z0, leaf, true);
        }
      }
    }
  }

  // full chunk data: terrain + plants + trees (margin scan) 
  function generateChunk(cx, cz) {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const biome = biomeAt(x, z);
        const h = heightAt(x, z);
        for (let y = 0; y < HEIGHT; y++) {
          data[(y * CHUNK + lz) * CHUNK + lx] = terrainBlock(x, y, z, h, biome);
        }
        // surface plant
        if (data[(h * CHUNK + lz) * CHUNK + lx] === surfaceBlocks(biome).top) {
          const plant = plantAt(x, z, h, biome);
          if (plant && h + 1 < HEIGHT) data[((h + 1) * CHUNK + lz) * CHUNK + lx] = plant;
        }
      }
    }

    // trees, scanning 2 blocks beyond the chunk for overlap
    for (let x = x0 - 3; x < x0 + CHUNK + 3; x++) {
      for (let z = z0 - 3; z < z0 + CHUNK + 3; z++) {
        const tree = treeAt(x, z);
        if (tree) stampTree(data, tree, x0, z0);
      }
    }

    return data;
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
