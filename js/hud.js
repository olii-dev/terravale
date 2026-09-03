// HUD: hearts, hunger, air bubbles, hotbar with counts/durability, held
// item name popup. Rebuilds are cheap and happen only on state changes.

import { itemIcon, hudIconURL } from './sprites.js';
import { BLOCKS } from './blocks.js';
import { ITEMS, nameOf } from './items.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.heartsEl = $('hearts');
    this.hungerEl = $('hunger');
    this.airEl = $('air');
    this.hotbarEl = $('hotbar');
    this.heldNameEl = $('held-name');
    this._nameTimer = null;
    this._lastStatsKey = '';
    this._lastHotbarKey = '';
  }

  updateStats(stats, gamemode) {
    if (gamemode === 'creative') {
      this.heartsEl.innerHTML = '';
      this.hungerEl.innerHTML = '';
      this.airEl.innerHTML = '';
      this._lastStatsKey = '';
      return;
    }
    const key = `${stats.hp}|${stats.hunger}|${stats.air}|${stats.dead}`;
    if (key === this._lastStatsKey) return;
    this._lastStatsKey = key;

    let hearts = '';
    for (let i = 0; i < 10; i++) {
      const v = stats.hp - i * 2;
      const kind = v >= 2 ? 'heart' : v === 1 ? 'heart_half' : 'heart_empty';
      hearts += `<img src="${hudURL(kind)}" draggable="false">`;
    }
    this.heartsEl.innerHTML = stats.dead ? '' : hearts;

    let hunger = '';
    for (let i = 0; i < 10; i++) {
      const kind = stats.hunger - i * 2 >= 1 ? 'hunger' : 'hunger_empty';
      hunger += `<img src="${hudURL(kind)}" draggable="false">`;
    }
    this.hungerEl.innerHTML = hunger;

    let air = '';
    if (stats.air < 10) {
      for (let i = 0; i < Math.ceil(stats.air); i++) {
        air += `<img src="${hudURL('bubble')}" draggable="false">`;
      }
    }
    this.airEl.innerHTML = air;
  }

  updateHotbar(inv, selected) {
    const key = inv.serialize().map((s) => (s ? `${s.id}:${s.count}:${s.dur ?? 0}` : '-')).join(',') + '|' + selected;
    if (key === this._lastHotbarKey) return;
    this._lastHotbarKey = key;

    this.hotbarEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = inv.slots[i];
      const slot = document.createElement('div');
      slot.className = 'hslot' + (i === selected ? ' selected' : '');
      if (s) {
        const img = document.createElement('img');
        img.src = itemIcon(s.id, 64).toDataURL();
        img.draggable = false;
        slot.appendChild(img);
        if (s.count > 1) {
          const c = document.createElement('span');
          c.className = 'count';
          c.textContent = s.count;
          slot.appendChild(c);
        }
        if (ITEMS[s.id]?.maxDur && s.dur < ITEMS[s.id].maxDur) {
          const wrap = document.createElement('div');
          wrap.className = 'durwrap';
          const bar = document.createElement('div');
          bar.className = 'durbar';
          const frac = Math.max(0.05, s.dur / ITEMS[s.id].maxDur);
          bar.style.width = (frac * 100) + '%';
          bar.style.background = frac > 0.5 ? '#4cd44c' : frac > 0.2 ? '#d4c44c' : '#d44c4c';
          wrap.appendChild(bar);
          slot.appendChild(wrap);
        }
      }
      slot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onSlotClick?.(i);
      });
      this.hotbarEl.appendChild(slot);
    }
  }

  flashHeldName(stack) {
    if (!stack) { this.heldNameEl.style.opacity = 0; return; }
    this.heldNameEl.textContent = nameOf(stack.id);
    this.heldNameEl.style.opacity = 0.95;
    clearTimeout(this._nameTimer);
    this._nameTimer = setTimeout(() => (this.heldNameEl.style.opacity = 0), 1400);
  }
}

const hudURLCache = new Map();
function hudURL(kind) {
  if (!hudURLCache.has(kind)) {
    hudURLCache.set(kind, hudIconURL(kind));
  }
  return hudURLCache.get(kind);
}
