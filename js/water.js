// Flowing water: finite Minecraft-style levels. WATER is the source
// (level 0); WATER_FLOW1..7 are spread levels. The host ticks a schedule
// queue with a per-frame budget; every change flows through world.setBlock
// so it syncs to clients as a normal edit.

import { B, waterLevel, waterBlockForLevel, isWater } from './blocks.js';

const MAX_LEVEL = 7;
const TICK_BUDGET = 220; // cells processed per tick call

export class WaterSim {
  constructor(world) {
    this.world = world;
    this.queue = new Set(); // "x,y,z" cells to evaluate
    this.isHost = true;
    this.onEdit = null; // set by main: (x, y, z, id) => broadcast
  }

  // enqueue a cell + its neighbors (call after any block change)
  scheduleAround(x, y, z) {
    if (!this.isHost) return;
    this.queue.add(x + ',' + y + ',' + z);
    for (const [dx, dy, dz] of NEIGHBORS) {
      this.queue.add((x + dx) + ',' + (y + dy) + ',' + (z + dz));
    }
  }

  tick(maxProcess = TICK_BUDGET) {
    if (!this.isHost || !this.queue.size) return;
    let processed = 0;
    const next = [];
    for (const key of this.queue) {
      if (processed >= maxProcess) { next.push(key); continue; }
      processed++;
      const [x, y, z] = key.split(',').map(Number);
      this.evalCell(x, y, z, next);
    }
    this.queue = new Set(next);
  }

  evalCell(x, y, z, next) {
    const world = this.world;
    const id = world.getBlock(x, y, z);
    const level = waterLevel(id);

    if (level === 0) {
      // sources are permanent: they just flow
      this.tryFlow(x, y - 1, z, 0);
      for (const [dx, dz] of HORIZ) this.tryFlow(x + dx, y, z + dz, 1);
      return;
    }
    if (level >= 1) {
      // what level should this flowing cell be? fed by the lowest neighbor
      let want = -1;
      if (isWater(world.getBlock(x, y + 1, z))) want = 0; // column feed
      for (const [dx, dz] of HORIZ) {
        const nl = waterLevel(world.getBlock(x + dx, y, z + dz));
        if (nl >= 0 && nl < MAX_LEVEL) {
          const w = nl + 1;
          if (want < 0 || w < want) want = w;
        }
      }
      if (want < 0) {
        // no feeder: dry out
        world.setBlock(x, y, z, B.AIR);
        this.onEdit?.(x, y, z, B.AIR);
        this.scheduleAround(x, y, z);
        return;
      }
      if (want !== level) {
        world.setBlock(x, y, z, waterBlockForLevel(want));
        this.onEdit?.(x, y, z, waterBlockForLevel(want));
        this.scheduleAround(x, y, z);
        return;
      }
      // stable: try to flow into adjacent air and below
      this.tryFlow(x, y - 1, z, 0);
      if (level < MAX_LEVEL) {
        for (const [dx, dz] of HORIZ) this.tryFlow(x + dx, y, z + dz, level + 1);
      }
    } else if (id === B.AIR) {
      // air: could water flow into me?
      const above = world.getBlock(x, y + 1, z);
      if (isWater(above)) {
        world.setBlock(x, y, z, waterBlockForLevel(0)); // falling column
        this.onEdit?.(x, y, z, waterBlockForLevel(0));
        this.scheduleAround(x, y, z);
        return;
      }
      let best = -1;
      for (const [dx, dz] of HORIZ) {
        const nl = waterLevel(world.getBlock(x + dx, y, z + dz));
        if (nl >= 0 && nl < MAX_LEVEL && (best < 0 || nl + 1 < best)) best = nl + 1;
      }
      if (best >= 0) {
        world.setBlock(x, y, z, waterBlockForLevel(best));
        this.onEdit?.(x, y, z, waterBlockForLevel(best));
        this.scheduleAround(x, y, z);
      }
    }
  }

  tryFlow(x, y, z, level) {
    const world = this.world;
    const id = world.getBlock(x, y, z);
    if (id !== B.AIR) {
      // water flows into replaceable plants
      if (!(id === B.WILD_GRASS || (id >= B.BLOOM_RED && id <= B.DEAD_BUSH))) return;
    }
    const cur = waterLevel(id);
    if (cur >= 0 && cur <= level) return;
    world.setBlock(x, y, z, waterBlockForLevel(level));
    this.onEdit?.(x, y, z, waterBlockForLevel(level));
    this.scheduleAround(x, y, z);
  }
}

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const HORIZ = [[1, 0], [-1, 0], [0, 1], [0, -1]];
