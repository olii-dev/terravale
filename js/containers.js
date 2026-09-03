// Furnace logic (host-side ticking) + container helpers. Chests are static
// storage; furnaces smelt over time using fuel.

import { smeltOf, fuelOf, maxStack, canMerge } from './items.js';
import { B } from './blocks.js';

export const SMELT_TIME = 10; // seconds per item

export function tickFurnace(c, dt, onChange) {
  if (!c || c.type !== 'furnace') return;
  let changed = false;

  const canOutput = (out) => {
    const result = smeltOf(c.in?.id ?? 0);
    if (!result) return false;
    if (!c.out) return true;
    return canMerge(c.out, result) && c.out.count + result.count <= maxStack(result.id);
  };

  if (c.burnT > 0) {
    c.burnT -= dt;
    if (c.in && canOutput(c.out)) {
      c.cookT += dt;
      if (c.cookT >= SMELT_TIME) {
        c.cookT = 0;
        const result = smeltOf(c.in.id);
        c.in.count--;
        if (c.in.count <= 0) c.in = null;
        if (c.out) c.out.count += result.count;
        else c.out = result;
      }
    } else {
      c.cookT = Math.max(0, c.cookT - dt * 2);
    }
    changed = true;
  } else {
    c.cookT = Math.max(0, c.cookT - dt * 2);
    // try to ignite
    if (c.in && canOutput(c.out) && c.fuel && fuelOf(c.fuel.id) > 0) {
      c.burnMax = fuelOf(c.fuel.id);
      c.burnT = c.burnMax;
      c.fuel.count--;
      if (c.fuel.count <= 0) c.fuel = null;
      changed = true;
    }
  }

  if (changed && onChange) onChange(c);
}

// ---------- generic slot access used by the container UI ----------
// zones: 'inv' (player 0-35), 'chest' (0-26), 'fin' | 'ffuel' | 'fout'

export function getSlot(zone, idx, playerInv, container) {
  if (zone === 'inv') return playerInv.slots[idx] ?? null;
  if (zone === 'chest') return container.slots[idx] ?? null;
  if (zone === 'fin') return container.in;
  if (zone === 'ffuel') return container.fuel;
  if (zone === 'fout') return container.out;
  return null;
}

export function setSlot(zone, idx, value, playerInv, container) {
  if (zone === 'inv') playerInv.slots[idx] = value;
  else if (zone === 'chest') container.slots[idx] = value;
  else if (zone === 'fin') container.in = value;
  else if (zone === 'ffuel') container.fuel = value;
  else if (zone === 'fout') container.out = value;
}

// primitive UI ops on (playerInv, container) — applied locally and
// wholesale-synced on close in multiplayer
export function swapSlots(a, ai, b, bi, playerInv, container) {
  const sa = getSlot(a, ai, playerInv, container);
  const sb = getSlot(b, bi, playerInv, container);
  if (sa && sb && canMerge(sa, sb)) {
    // merge a into b up to cap
    const cap = maxStack(sa.id);
    const take = Math.min(cap - sb.count, sa.count);
    if (take > 0) {
      sb.count += take;
      sa.count -= take;
      if (sa.count <= 0) setSlot(a, ai, null, playerInv, container);
      return;
    }
  }
  setSlot(a, ai, sb, playerInv, container);
  setSlot(b, bi, sa, playerInv, container);
}

export function takeHalf(zone, idx, playerInv, container) {
  const s = getSlot(zone, idx, playerInv, container);
  if (!s) return null;
  const half = Math.ceil(s.count / 2);
  const out = { id: s.id, count: half };
  if (s.dur !== undefined) out.dur = s.dur;
  s.count -= half;
  if (s.count <= 0) setSlot(zone, idx, null, playerInv, container);
  return out;
}

// shift-click: move a stack between inventory <-> container quickly
export function quickMove(zone, idx, playerInv, container) {
  const s = getSlot(zone, idx, playerInv, container);
  if (!s) return;
  const cap = maxStack(s.id);

  const targets = [];
  if (zone === 'inv' && container) {
    if (container.type === 'chest') {
      // fuel-able items prefer the fuel slot? keep simple: chest slots
      for (let i = 0; i < 27; i++) targets.push(['chest', i]);
    } else if (container.type === 'furnace') {
      const dest = smeltOf(s.id) ? 'fin' : (fuelOf(s.id) > 0 ? 'ffuel' : null);
      if (dest) targets.push([dest, 0]);
      for (let i = 0; i < 27; i++) targets.push(['inv', i === idx ? -1 : i]);
      targets.length = 1; // furnaces only auto-slot into their bins
    }
  } else {
    for (let i = 0; i < 36; i++) targets.push(['inv', i]);
  }

  for (const [tz, ti] of targets) {
    if (ti < 0) continue;
    const t = getSlot(tz, ti, playerInv, container);
    if (t && canMerge(t, s) && t.count < cap) {
      const take = Math.min(cap - t.count, s.count);
      t.count += take;
      s.count -= take;
      if (s.count <= 0) { setSlot(zone, idx, null, playerInv, container); return; }
    }
  }
  for (const [tz, ti] of targets) {
    if (ti < 0) continue;
    if (!getSlot(tz, ti, playerInv, container)) {
      setSlot(tz, ti, s, playerInv, container);
      setSlot(zone, idx, null, playerInv, container);
      return;
    }
  }
}
