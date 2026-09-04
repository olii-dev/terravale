// Survival stats: health, hunger (+saturation/exhaustion), air, damage
// from the environment, regeneration, death. Creative ignores everything.

import { B, BLOCKS } from './blocks.js';
import { isFood, ITEMS } from './items.js';

export class Stats {
  constructor(world) {
    this.world = world;
    this.player = null; // set by main; per-player gamemode lives there
    this.hp = 20;
    this.hunger = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 10;
    this.dead = false;
    this.onDeath = null;      // callback()
    this.onDamage = null;     // callback(amount, cause)
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
    this.contactTimer = 0;
    this.hurtFlash = 0;
    this.eatCooldown = 0;
  }

  gamemode() { return this.player?.gamemodeOverride ?? this.world.gamemode; }

  reset() {
    this.hp = 20;
    this.hunger = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 10;
    this.dead = false;
  }

  damage(amount, cause) {
    if (this.dead || this.gamemode() === 'creative') return false;
    amount = amount * (1 - 0.04 * (this.armorPoints || 0));
    this.hp = Math.max(0, this.hp - amount);
    this.hurtFlash = 0.4;
    this.onDamage?.(amount, cause);
    if (this.hp <= 0) {
      this.dead = true;
      this.onDeath?.(cause);
    }
    return true;
  }

  addExhaustion(amount) {
    if (this.gamemode() === 'creative') return;
    this.exhaustion += amount;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
  }

  tryEat(stack) {
    if (this.eatCooldown > 0) return null;
    const food = isFood(stack.id) ? ITEMS[stack.id].food : 0;
    if (!food || this.hunger >= 20) return null;
    this.hunger = Math.min(20, this.hunger + food);
    this.saturation = Math.min(this.hunger, this.saturation + food * 0.6);
    this.eatCooldown = 1.6;
    return food;
  }

  update(dt, player, moving) {
    if (this.gamemode() === 'creative' || this.dead) {
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      return;
    }
    this.eatCooldown = Math.max(0, this.eatCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // hunger drain from activity
    if (moving) this.addExhaustion(player.sprinting ? dt * 0.35 : dt * 0.08);
    if (player.fly) this.addExhaustion(dt * 0.2);

    // regeneration when well fed
    if (this.hunger >= 18 && this.hp < 20) {
      this.regenTimer += dt;
      if (this.regenTimer >= 2.0) {
        this.regenTimer = 0;
        this.hp = Math.min(20, this.hp + 1);
        this.addExhaustion(1.5);
      }
    } else {
      this.regenTimer = 0;
    }

    // starvation
    if (this.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 2.5) {
        this.starveTimer = 0;
        if (this.hp > 2) this.damage(1, 'starving');
      }
    }

    // drowning
    if (player.headInWater) {
      this.drownTimer += dt;
      if (this.drownTimer > 1 && this.air > 0) {
        this.drownTimer = 0;
        this.air -= 1;
        if (this.air <= 0) this.damage(2, 'drowning');
      }
    } else {
      this.air = Math.min(10, this.air + dt * 4);
      this.drownTimer = 0;
    }

    // lava + damaging blocks (cactus) contact
    if (player.inLava) {
      this.contactTimer += dt;
      if (this.contactTimer >= 0.5) {
        this.contactTimer = 0;
        this.damage(4, 'lava');
      }
    } else {
      // cactus: touching from any side
      const feet = this.world.getBlock(player.pos.x, player.pos.y + 0.1, player.pos.z);
      const side1 = this.world.getBlock(player.pos.x + 0.45, player.pos.y + 0.9, player.pos.z);
      const side2 = this.world.getBlock(player.pos.x - 0.45, player.pos.y + 0.9, player.pos.z);
      const side3 = this.world.getBlock(player.pos.x, player.pos.y + 0.9, player.pos.z + 0.45);
      const side4 = this.world.getBlock(player.pos.x, player.pos.y + 0.9, player.pos.z - 0.45);
      const cactusTouch = [feet, side1, side2, side3, side4].some((id) => id === B.CACTUS);
      if (cactusTouch) {
        this.contactTimer += dt;
        if (this.contactTimer >= 0.7) {
          this.contactTimer = 0;
          this.damage(1, 'a cactus');
        }
      } else {
        this.contactTimer = 0;
      }
    }
  }

  fallDamage(dist) {
    const dmg = Math.floor(dist - 3);
    if (dmg > 0) this.damage(dmg, 'falling');
  }
}
