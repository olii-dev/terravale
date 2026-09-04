// World ticking: gravity blocks (sand/gravel), random ticks (crop growth,
// sapling growth), all host-authoritative. Changes flow through
// world.setBlock so lighting + network stay consistent.

import { B, BLOCKS } from './blocks.js';

const GRAVITY_BLOCKS = new Set([B.SAND, B.GRAVEL]);

export class WorldTick {
  constructor(world) {
    this.world = world;
    this.isHost = true;
    this.randomTimer = 0;
    this.onEdit = null; // set by main: (x, y, z, id) => broadcast
    this.fallChecks = new Set(); // "x,y,z" columns to check after edits
    this.cropCells = new Set(); // "x,y,z" of growing crops/saplings
    this.growTimer = 0;
  }

  notifyBlock(x, y, z, id) {
    const k = x + ',' + y + ',' + z;
    if ((id >= B.WHEAT_0 && id < B.WHEAT_3) || id === B.SAPLING) this.cropCells.add(k);
    else this.cropCells.delete(k);
  }

  // returns crop keys to grow this tick
  pickGrowing(n) {
    const keys = [...this.cropCells];
    const out = [];
    for (let i = 0; i < n && keys.length; i++) {
      out.push(keys[Math.floor(Math.random() * keys.length)]);
    }
    return out;
  }

  // called after any block change near (x, y, z)
  scheduleFallCheck(x, y, z) {
    if (!this.isHost) return;
    // the block above the change might lose support
    this.fallChecks.add((x) + ',' + (y + 1) + ',' + z);
  }

  dropTree(world, x, y, z, kind = 'oak') {
    const log = kind === 'birch' ? B.BIRCH_LOG : kind === 'spruce' ? B.SPRUCE_LOG : B.OAK_LOG;
    const leaf = kind === 'birch' ? B.BIRCH_LEAVES : kind === 'spruce' ? B.SPRUCE_LEAVES : B.OAK_LEAVES;
    const height = kind === 'spruce' ? 6 + Math.floor(Math.random() * 2) : 4 + Math.floor(Math.random() * 3);
    const blocks = [];
    for (let i = 0; i < height; i++) blocks.push([x, y + i, z, log]);
    const top = y + height;
    const r = 2;
    for (let dy = -2; dy <= 1; dy++) {
      const rr = dy >= 0 ? 1 : r;
      for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
        if (dx * dx + dz * dz > rr * rr + 1) continue;
        if (dx === 0 && dz === 0 && dy < 1) continue;
        blocks.push([x + dx, top + dy, z + dz, leaf]);
      }
    }
    for (const [bx, by, bz, id] of blocks) {
      const cur = world.getBlock(bx, by, bz);
      if (cur === B.AIR || (cur >= B.OAK_LEAVES && cur <= B.SPRUCE_LEAVES)) {
        world.setBlock(bx, by, bz, id);
        this.onEdit?.(bx, by, bz, id);
      }
    }
  }

  processFallChecks() {
    if (!this.isHost || !this.fallChecks.size) return;
    const checks = [...this.fallChecks];
    this.fallChecks.clear();
    for (const key of checks) {
      const [x, y, z] = key.split(',').map(Number);
      // cascade upward: each gravity block above the change falls
      let yy = y;
      while (GRAVITY_BLOCKS.has(this.world.getBlock(x, yy, z))) {
        this.fallOne(x, yy, z);
        yy++;
      }
    }
  }

  fallOne(x, y, z) {
    const world = this.world;
    const id = world.getBlock(x, y, z);
    world.setBlock(x, y, z, B.AIR);
    this.onEdit?.(x, y, z, B.AIR);
    // find landing spot below
    let ly = y;
    while (ly > 1 && world.getBlock(x, ly - 1, z) === B.AIR) ly--;
    world.setBlock(x, ly, z, id);
    this.onEdit?.(x, ly, z, id);
  }

  // grow crops/saplings from the registry — reliable, no random sampling
  growTicks(dt) {
    if (!this.isHost || !this.cropCells.size) return;
    this.growTimer -= dt;
    if (this.growTimer > 0) return;
    this.growTimer = 0.5;
    const keys = [...this.cropCells];
    const picks = Math.min(keys.length, 2 + Math.floor(keys.length / 8));
    for (let i = 0; i < picks; i++) {
      const key = keys[Math.floor(Math.random() * keys.length)];
      const [x, y, z] = key.split(',').map(Number);
      const id = this.world.getBlock(x, y, z);
      if (id >= B.WHEAT_0 && id < B.WHEAT_3) {
        if (Math.random() < 0.4) {
          this.world.setBlock(x, y, z, id + 1);
          this.onEdit?.(x, y, z, id + 1);
          this.notifyBlock(x, y, z, id + 1);
        }
      } else if (id === B.SAPLING) {
        if (Math.random() < 0.15) {
          this.world.setBlock(x, y, z, B.AIR);
          this.onEdit?.(x, y, z, B.AIR);
          this.dropTree(this.world, x, y, z, Math.random() < 0.25 ? 'birch' : 'oak');
        }
      } else {
        this.cropCells.delete(key); // stale
      }
    }
  }
}
