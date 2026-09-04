// Shared voxel collision for players, mobs and item drops: integrate one
// axis at a time and clamp against overlapping solid cells.

import { isSolid, isLiquid, B, blockHeight } from './blocks.js';
import { isWater } from './blocks.js';

// entity: { pos: Vector3 (feet center), vel: Vector3, onGround }
// halfW: half width, height: full height. dt already applied to vel.
export function moveEntity(world, entity, dx, dy, dz, halfW, height) {
  const flags = { hitX: false, hitY: false, hitZ: false, landed: false };
  entity.onGround = false;

  const tryAxis = (axis, delta) => {
    if (delta === 0) return;
    entity.pos[axis] += delta;
    const minX = entity.pos.x - halfW, maxX = entity.pos.x + halfW;
    const minY = entity.pos.y, maxY = entity.pos.y + height;
    const minZ = entity.pos.z - halfW, maxZ = entity.pos.z + halfW;
    const x0 = Math.floor(minX), x1 = Math.floor(maxX - 1e-7);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY - 1e-7);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - 1e-7);
    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          const cellId = world.getBlock(bx, by, bz);
          if (!isSolid(cellId)) continue;
          // bottom slabs only block the lower half
          const h = blockHeight(cellId);
          if (h < 1 && entity.pos.y >= by + h - 0.01) continue;
          if (axis === 'x') {
            entity.pos.x = delta > 0 ? bx - halfW - 1e-4 : bx + 1 + halfW + 1e-4;
            entity.vel.x = 0;
            flags.hitX = true;
          } else if (axis === 'z') {
            entity.pos.z = delta > 0 ? bz - halfW - 1e-4 : bz + 1 + halfW + 1e-4;
            entity.vel.z = 0;
            flags.hitZ = true;
          } else {
            if (delta > 0) {
              entity.pos.y = by - height - 1e-4;
            } else {
              entity.pos.y = by + blockHeight(cellId) + 1e-4;
              entity.onGround = true;
              flags.landed = true;
            }
            entity.vel.y = 0;
            flags.hitY = true;
          }
          return;
        }
      }
    }
  };

  tryAxis('x', dx);
  tryAxis('y', dy);
  tryAxis('z', dz);
  return flags;
}

// what liquid is at a position (B.WATER / B.LAVA / 0)
export function liquidAt(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  return isLiquid(id) ? id : 0;
}

export function headInWater(world, eyePos) {
  return isWater(world.getBlock(eyePos.x, eyePos.y, eyePos.z));
}

// does an AABB entity intersect a block cell?
export function aabbIntersectsBlock(pos, halfW, height, bx, by, bz) {
  return (
    bx + 1 > pos.x - halfW && bx < pos.x + halfW &&
    by + 1 > pos.y && by < pos.y + height &&
    bz + 1 > pos.z - halfW && bz < pos.z + halfW
  );
}
