// Player inventory: 36 slots (0-8 hotbar). Stacks are {id, count, dur?}.

import { BLOCKS } from './blocks.js';
import { ITEMS, maxStack, isTool, armorOf } from './items.js';

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null);
    this.armor = [null, null, null, null]; // head/chest/legs/feet
    this.selected = 0;
  }

  armorPoints() {
    let pts = 0;
    for (let i = 0; i < 4; i++) {
      const s = this.armor[i];
      if (s) pts += armorOf(s.id)?.points ?? 0;
    }
    return pts;
  }

  // try to equip/unequip via the UI: only matching slot accepted
  toggleArmor(invIdx) {
    const s = this.slots[invIdx];
    if (!s) return false;
    const a = armorOf(s.id);
    if (!a) return false;
    if (this.armor[a.slot]) {
      const old = this.armor[a.slot];
      this.armor[a.slot] = s;
      this.slots[invIdx] = old;
    } else {
      this.armor[a.slot] = s;
      this.slots[invIdx] = null;
    }
    return true;
  }

  held() { return this.slots[this.selected]; }

  select(i) {
    if (i >= 0 && i < 9) this.selected = i;
  }

  // add a stack; returns leftover count that didn't fit
  add(stack) {
    let left = stack.count;
    const cap = maxStack(stack.id);
    if (cap > 1) {
      // merge into existing stacks first (hotbar first for feel)
      for (let i = 0; i < 36 && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === stack.id && s.count < cap) {
          const take = Math.min(cap - s.count, left);
          s.count += take;
          left -= take;
        }
      }
    }
    for (let i = 0; i < 36 && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(cap, left);
        this.slots[i] = { id: stack.id, count: take };
        if (stack.dur !== undefined && isTool(stack.id)) this.slots[i].dur = stack.dur;
        left -= take;
      }
    }
    return left;
  }

  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  removeId(id, count) {
    let left = count;
    for (let i = 0; i < 36 && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, left);
        s.count -= take;
        left -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return count - left;
  }

  consumeHeldOne() {
    const s = this.slots[this.selected];
    if (!s) return false;
    s.count--;
    if (s.count <= 0) this.slots[this.selected] = null;
    return true;
  }

  // returns true if the tool broke
  damageHeldTool() {
    const s = this.slots[this.selected];
    if (!s || !isTool(s.id)) return false;
    s.dur = (s.dur ?? ITEMS[s.id].maxDur) - 1;
    if (s.dur <= 0) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  clear() {
    this.slots.fill(null);
    this.armor = [null, null, null, null];
  }

  serialize() {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), armor: this.armor.map((s) => (s ? { ...s } : null)) };
  }

  load(data) {
    this.slots = new Array(36).fill(null);
    this.armor = [null, null, null, null];
    if (Array.isArray(data)) { // legacy: plain slots array
      data.forEach((s, i) => { if (s && i < 36) this.slots[i] = { ...s }; });
      return;
    }
    (data?.slots || []).forEach((s, i) => { if (s && i < 36) this.slots[i] = { ...s }; });
    (data?.armor || []).forEach((s, i) => { if (s && i < 4) this.armor[i] = { ...s }; });
  }
}
