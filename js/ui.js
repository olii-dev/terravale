// UI v2: title screen (splash + create/join), options with rebinding,
// pause, death, HUD chrome helpers, player list, toasts — and the full
// container screen: inventory + 2×2/3×3 crafting, furnace, chest, creative
// palette. Slot interactions use a cursor stack like the classic UI.

import { BLOCKS, PALETTE_IDS, GROUP_LABELS, B } from './blocks.js';
import { ITEMS, nameOf, maxStack, canMerge, isTool, armorOf } from './items.js';
import { itemIcon } from './sprites.js';

const uiIconCache = new Map();
function iconURL(id) {
  if (!uiIconCache.has(id)) uiIconCache.set(id, itemIcon(id, 64).toDataURL());
  return uiIconCache.get(id);
}
import { matchGrid, consumeGrid } from './crafting.js';
import { getSlot, setSlot, swapSlots, takeHalf, quickMove } from './containers.js';
import { listWorlds } from './save.js';
import { settings, BIND_LABELS, DEFAULT_BINDS } from './settings.js';
import { commandSuggestions } from './commands.js';

const $ = (id) => document.getElementById(id);

const SPLASHES = [
  'Now with commands!', '100% code-generated!', 'Punch trees, get wood',
  'Watch out at night!', 'Torch-lit and cozy', 'Trotters are friends',
  'Diamonds live deep', 'Runs in your browser!', 'Room codes = instant MP',
  'Gloomers hate sunlight', 'Try /give diamond_sword', 'Made of triangles',
  'Also try real gardening', 'Handcrafted noise!', 'Blocks all the way down',
];

export class UI {
  constructor(cb) {
    this.cb = cb;
    this.pickerOpen = false; // legacy flag: any screen covering gameplay
    this.bindListening = null;

    this.el = {
      title: $('title'), options: $('options'), connecting: $('connecting'),
      pause: $('pause'), death: $('death'), screen: $('screen'), hud: $('hud'),
      splash: $('splash'), createPanel: $('create-panel'), titleMain: $('title-main'),
      savedWrap: $('saved-wrap'), savedWorlds: $('saved-worlds'), menuError: $('menu-error'),
      connectStatus: $('connecting-status'),
      optionsTabs: $('options-tabs'), optionsBody: $('options-body'),
      pauseMeta: $('pause-meta'),
      debug: $('debug'), hudCode: $('hud-code'), hudRole: $('hud-role'),
      playerList: $('player-list'), toasts: $('toasts'),
      screenTitle: $('screen-title'), containerArea: $('container-area'),
      invGrid: $('player-inv-grid'), hotbarGrid: $('player-hotbar-grid'),
      cursor: $('cursor-stack'), tooltip: $('tooltip'),
      chatLog: $('chat'),
    };

    this.createMode = 'survival';
    this.playerInv = null;     // set by main (Inventory)
    this.container = null;     // active container object (chest/furnace)
    this.screenMode = null;    // 'inventory' | 'table' | 'furnace' | 'chest' | 'creative'
    this.screenPos = null;     // "x,y,z" for real containers
    this.craft = new Array(9).fill(null);
    this.cursorStack = null;

    this.wire();
    this.setSplash();
  }

  wire() {
    $('btn-host').addEventListener('click', () => {
      this.el.createPanel.classList.remove('hidden');
      this.el.titleMain.classList.add('hidden');
    });
    $('btn-create-back').addEventListener('click', () => {
      this.el.createPanel.classList.add('hidden');
      this.el.titleMain.classList.remove('hidden');
    });
    $('mode-survival').addEventListener('click', () => this.setCreateMode('survival'));
    $('mode-creative').addEventListener('click', () => this.setCreateMode('creative'));
    $('btn-create-go').addEventListener('click', () => {
      this.cb.onCreate({ mode: this.createMode, seed: $('seed-input').value.trim() });
    });
    $('btn-join').addEventListener('click', () => this.cb.onJoin($('code-input').value.trim().toUpperCase()));
    $('code-input').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.cb.onJoin($('code-input').value.trim().toUpperCase());
    });
    $('btn-options').addEventListener('click', () => this.showOptions('title'));
    $('btn-options-back').addEventListener('click', () => this.cb.onOptionsBack());
    $('btn-cancel-connect').addEventListener('click', () => this.cb.onCancelConnect());
    $('btn-resume').addEventListener('click', () => this.cb.onPauseResume());
    $('btn-pause-options').addEventListener('click', () => this.showOptions('pause'));
    $('btn-quit').addEventListener('click', () => this.cb.onQuit());
    $('btn-respawn').addEventListener('click', () => this.cb.onDeathRespawn());
    $('btn-death-title').addEventListener('click', () => this.cb.onDeathTitle());
    // clicking the dimmed backdrop throws the held cursor stack
    $('screen-shade').addEventListener('mousedown', () => { this.tossCursor(); });

    // cursor stack follows the mouse across the container screen
    document.addEventListener('mousemove', (e) => {
      if (this.cursorStack) {
        this.el.cursor.style.left = e.clientX - 20 + 'px';
        this.el.cursor.style.top = e.clientY - 20 + 'px';
      }
      if (!this.el.tooltip.classList.contains('hidden')) {
        this.el.tooltip.style.left = e.clientX + 14 + 'px';
        this.el.tooltip.style.top = e.clientY - 10 + 'px';
      }
    });
  }

  setCreateMode(m) {
    this.createMode = m;
    $('mode-survival').classList.toggle('on', m === 'survival');
    $('mode-creative').classList.toggle('on', m === 'creative');
  }

  setSplash() {
    this.el.splash.textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
  }

  // ---------- screens ----------

  showTitle() {
    document.body.classList.add('blur-behind');
    this.el.title.classList.remove('hidden');
    this.el.connecting.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.death.classList.add('hidden');
    this.closeScreen(true);
    this.refreshSavedWorlds();
    this.setSplash();
  }

  showConnecting(status) {
    this.el.title.classList.add('hidden');
    this.el.connecting.classList.remove('hidden');
    this.el.connectStatus.textContent = status;
  }

  setConnectStatus(s) { this.el.connectStatus.textContent = s; }
  menuError(msg) { this.el.menuError.textContent = msg || ''; }

  showHud() {
    document.body.classList.remove('blur-behind');
    this.el.title.classList.add('hidden');
    this.el.connecting.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  hideAllOverlays() {
    for (const k of ['title', 'connecting', 'pause', 'death', 'options', 'screen']) {
      this.el[k].classList.add('hidden');
    }
  }

  refreshSavedWorlds() {
    const worlds = listWorlds();
    this.el.savedWrap.classList.toggle('hidden', worlds.length === 0);
    this.el.savedWorlds.innerHTML = '';
    for (const w of worlds.slice(0, 5)) {
      const div = document.createElement('div');
      div.className = 'saved-world';
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = w.code;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${w.mode ?? 'survival'} · ${w.blocks} edits · ${new Date(w.updated).toLocaleDateString()}`;
      const btn = document.createElement('button');
      btn.className = 'mcbtn small';
      btn.textContent = 'Host';
      btn.addEventListener('click', () => this.cb.onResumeHost(w.code));
      div.append(code, meta, btn);
      this.el.savedWorlds.appendChild(div);
    }
  }

  // ---------- options ----------

  showOptions(from) {
    this.optionsFrom = from;
    this.el.options.classList.remove('hidden');
    this.renderOptionsTab('video');
  }

  hideOptions() {
    this.el.options.classList.add('hidden');
    this.stopBindListening();
  }

  renderOptionsTab(tab) {
    this.optionsTab = tab;
    const tabs = [
      ['video', 'Video'], ['controls', 'Controls'], ['sound', 'Sound'], ['gameplay', 'Gameplay'],
    ];
    this.el.optionsTabs.innerHTML = '';
    for (const [key, label] of tabs) {
      const b = document.createElement('button');
      b.className = 'mcbtn small' + (key === tab ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => this.renderOptionsTab(key));
      this.el.optionsTabs.appendChild(b);
    }

    const body = this.el.optionsBody;
    body.innerHTML = '';

    const row = (labelText, control, valueEl) => {
      const r = document.createElement('div');
      r.className = 'opt-row';
      const l = document.createElement('label');
      l.textContent = labelText;
      r.appendChild(l);
      r.appendChild(control);
      if (valueEl) r.appendChild(valueEl);
      body.appendChild(r);
    };

    const slider = (key, min, max, step, fmt) => {
      const s = document.createElement('input');
      s.type = 'range';
      s.className = 'mcslider';
      s.min = min; s.max = max; s.step = step;
      s.value = settings.get(key);
      const val = document.createElement('span');
      val.className = 'opt-val';
      val.textContent = fmt(settings.get(key));
      s.addEventListener('input', () => {
        settings.set(key, parseFloat(s.value));
        val.textContent = fmt(settings.get(key));
        this.cb.onSettingsChange(key, settings.get(key));
      });
      return [s, val];
    };

    const toggle = (key, label) => {
      const b = document.createElement('button');
      b.className = 'mcbtn' + (settings.get(key) ? ' on' : '');
      b.style.minWidth = '150px';
      const paint = () => { b.textContent = settings.get(key) ? 'On' : 'Off'; b.classList.toggle('on', settings.get(key)); };
      paint();
      b.addEventListener('click', () => {
        settings.set(key, !settings.get(key));
        paint();
        this.cb.onSettingsChange(key, settings.get(key));
      });
      row(label, b);
    };

    if (tab === 'video') {
      let [s, v] = slider('renderDist', 2, 10, 1, (x) => x + ' chunks');
      row('Render distance', s, v);
      [s, v] = slider('fov', 60, 110, 1, (x) => x + '°');
      row('Field of view', s, v);
      [s, v] = slider('gamma', 0, 1, 0.05, (x) => Math.round(x * 100) + '%');
      row('Brightness', s, v);
      toggle('clouds', 'Clouds');
      toggle('fancy', 'Fancy graphics (sway + water)');
      toggle('particles', 'Particles');
      toggle('vignette', 'Vignette');
      toggle('showFps', 'Show FPS');
      const fs = document.createElement('button');
      fs.className = 'mcbtn';
      fs.style.minWidth = '150px';
      fs.textContent = settings.get('fullscreen') ? 'On' : 'Off';
      fs.addEventListener('click', () => {
        const on = !settings.get('fullscreen');
        settings.set('fullscreen', on);
        fs.textContent = on ? 'On' : 'Off';
        this.cb.onSettingsChange('fullscreen', on);
      });
      row('Fullscreen', fs);
    } else if (tab === 'controls') {
      let [s, v] = slider('sens', 0.2, 3, 0.05, (x) => Math.round(x * 100) + '%');
      row('Mouse sensitivity', s, v);
      toggle('invertY', 'Invert mouse Y');
      const note = document.createElement('div');
      note.className = 'opt-row';
      note.style.opacity = '0.6';
      note.textContent = 'Click a control, then press the new key. Esc cancels.';
      body.appendChild(note);
      for (const [action, code] of Object.entries(settings.values.binds)) {
        const b = document.createElement('button');
        b.className = 'mcbtn binding';
        b.style.minWidth = '170px';
        const paint = () => { b.textContent = this.bindListening === action ? '> press key <' : settings.prettyKey(code); };
        paint();
        b.addEventListener('click', () => { this.stopBindListening(); this.bindListening = action; paint(); });
        this.bindButtons = this.bindButtons || new Map();
        this.bindButtons.set(action, { b, paint });
        row(BIND_LABELS[action] ?? action, b);
      }
    } else if (tab === 'sound') {
      let [s, v] = slider('master', 0, 1, 0.05, (x) => Math.round(x * 100) + '%');
      row('Master volume', s, v);
      [s, v] = slider('sfx', 0, 1, 0.05, (x) => Math.round(x * 100) + '%');
      row('Effects volume', s, v);
    } else if (tab === 'gameplay') {
      toggle('autoJump', 'Auto-jump');
      toggle('hints', 'Show hints');
      toggle('weather', 'Weather (rain & snow)');
      const reset = document.createElement('button');
      reset.className = 'mcbtn danger';
      reset.textContent = 'Reset all settings';
      reset.addEventListener('click', () => {
        Object.assign(settings.values, { sens: 1, invertY: false, autoJump: false });
        settings.values.binds = { ...DEFAULT_BINDS };
        settings.save();
        this.renderOptionsTab('gameplay');
        this.cb.onSettingsChange('reset', null);
      });
      const r = document.createElement('div');
      r.className = 'opt-row';
      r.appendChild(reset);
      body.appendChild(r);
    }
  }

  stopBindListening() {
    if (!this.bindListening) return;
    const entry = this.bindButtons?.get(this.bindListening);
    if (entry) entry.paint();
    this.bindListening = null;
  }

  // ---------- pause / death ----------

  showPause(meta) {
    this.el.pause.classList.remove('hidden');
    this.el.pauseMeta.textContent = meta ?? '';
  }
  hidePause() { this.el.pause.classList.add('hidden'); }

  showDeath(cause) {
    this.el.death.classList.remove('hidden');
    $('death-sub').textContent = cause ? `You were defeated by ${cause}.` : 'Your items scattered where you fell…';
  }
  hideDeath() { this.el.death.classList.add('hidden'); }

  // ---------- HUD chrome ----------

  setRoom(code, role) {
    this.el.hudCode.textContent = code;
    this.el.hudRole.textContent = role === 'host' ? 'you are the host' : 'connected';
  }

  setHint(visible) { $('hint').classList.toggle('hidden', !visible || !settings.get('hints')); }

  toggleDebug(force) {
    this.debugVisible = force ?? !this.debugVisible;
    this.el.debug.classList.toggle('hidden', !this.debugVisible);
  }

  setDebug(lines) {
    if (!this.debugVisible) return;
    this.el.debug.innerHTML = lines.join('<br>');
  }

  updatePlayerList(players, myId) {
    const el = this.el.playerList;
    el.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = `Online — ${players.length}`;
    el.appendChild(h);
    for (const p of players) {
      const row = document.createElement('div');
      row.className = 'pl-row';
      const dot = document.createElement('span');
      dot.className = 'pl-dot';
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.textContent = p.name;
      row.append(dot, name);
      if (p.id === myId) {
        const you = document.createElement('span');
        you.className = 'pl-you';
        you.textContent = 'YOU';
        row.appendChild(you);
      }
      el.appendChild(row);
    }
  }

  showPlayerList(show) { this.el.playerList.classList.toggle('hidden', !show); }

  toast(msg, ms = 2600) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // ---------- container screen ----------

  setPlayerInv(inv) { this.playerInv = inv; }

  openScreen(mode, container = null, posKey = null) {
    this.screenMode = mode;
    this.container = container;
    this.screenPos = posKey;
    this.craft = new Array(9).fill(null);
    this.el.screenTitle.textContent = {
      inventory: 'Inventory', table: 'Crafting', furnace: 'Furnace',
      chest: 'Chest', creative: 'Creative palette',
    }[mode] ?? 'Inventory';
    this.el.screen.classList.remove('hidden');
    this.renderScreen();
  }

  closeScreen(silent = false) {
    if (this.el.screen.classList.contains('hidden')) return;
    this.el.screen.classList.add('hidden');
    // return crafting grid + cursor to the inventory
    if (this.playerInv) {
      for (let i = 0; i < 9; i++) {
        if (this.craft[i]) { this.playerInv.add(this.craft[i]); this.craft[i] = null; }
      }
      if (this.cursorStack) { this.playerInv.add(this.cursorStack); this.cursorStack = null; }
    }
    this.updateCursor();
    this.hideTooltip();
    if (!silent) this.cb.onScreenClose(this.screenMode, this.screenPos, this.container);
    this.screenMode = null;
    this.screenPos = null;
    this.container = null;
  }

  isScreenOpen() { return !this.el.screen.classList.contains('hidden'); }
  isContainerScreen() { return this.isScreenOpen() && this.screenMode !== 'inventory' && this.screenMode !== 'creative'; }

  renderScreen() {
    this.renderContainerArea();
    this.renderArmorRow();
    this.renderPlayerGrid();
    this.updateCursor();
  }

  renderArmorRow() {
    let row = document.getElementById('armor-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'armor-row';
      row.style.cssText = 'display:flex; gap:4px; margin-bottom:8px;';
      const label = document.createElement('div');
      label.textContent = 'Armor';
      label.style.cssText = "font-family:'Silkscreen',monospace; font-size:12px; color:var(--text-dark); margin-right:6px; align-self:center;";
      row.appendChild(label);
      this.el.screenPanel.insertBefore(row, this.el.containerArea);
    }
    row.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div');
      slot.className = 'islot';
      const s = this.playerInv?.armor[i] ?? null;
      if (s) {
        const img = document.createElement('img');
        img.src = iconURL(s.id);
        slot.appendChild(img);
        slot.addEventListener('mouseenter', () => this.showTooltip(s));
        slot.addEventListener('mouseleave', () => this.hideTooltip());
      }
      slot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.armorClick(i);
      });
      row.appendChild(slot);
    }
  }

  armorClick(i) {
    if (!this.playerInv) return;
    const cur = this.cursorStack;
    const eq = this.playerInv.armor[i];
    if (cur) {
      const a = armorOf(cur.id);
      if (!a || a.slot !== i) return; // wrong slot
      if (eq) {
        this.playerInv.armor[i] = { ...cur };
        this.cursorStack = eq;
      } else {
        this.playerInv.armor[i] = { ...cur };
        this.cursorStack = null;
      }
    } else if (eq) {
      this.cursorStack = eq;
      this.playerInv.armor[i] = null;
    }
    if (this.cursorStack && this.cursorStack.count <= 0) this.cursorStack = null;
    this.renderScreen();
    this.cb.onInventoryChange();
  }

  renderContainerArea() {
    const area = this.el.containerArea;
    area.innerHTML = '';
    const mode = this.screenMode;

    const grid = (size, zone, cssCols) => {
      const g = document.createElement('div');
      g.className = 'slotgrid';
      g.style.gridTemplateColumns = `repeat(${cssCols ?? size}, 44px)`;
      for (let i = 0; i < size * size; i++) {
        g.appendChild(this.makeSlot(zone, i));
      }
      return g;
    };

    if (mode === 'inventory' || mode === 'table') {
      const size = mode === 'table' ? 3 : 2;
      area.appendChild(grid(size, 'craft', size));
      const arrow = document.createElement('img');
      arrow.src = arrowURL();
      arrow.className = 'arrow-icon';
      area.appendChild(arrow);
      area.appendChild(this.makeSlot('result', 0));
    } else if (mode === 'furnace') {
      const col = document.createElement('div');
      col.id = 'furnace-col';
      col.appendChild(this.makeSlot('fin', 0));
      const flame = document.createElement('img');
      flame.src = flameURL();
      flame.className = 'arrow-icon';
      flame.style.transform = 'rotate(-90deg)';
      if (this.container?.burnMax > 0) {
        const frac = Math.max(0, this.container.burnT / this.container.burnMax);
        flame.style.clipPath = `inset(${(1 - frac) * 100}% 0 0 0)`;
      } else {
        flame.style.opacity = '0.3';
      }
      col.appendChild(flame);
      col.appendChild(this.makeSlot('ffuel', 0));
      area.appendChild(col);
      const arrow = document.createElement('img');
      arrow.src = arrowURL();
      arrow.className = 'arrow-icon';
      const cookFrac = this.container ? Math.min(1, this.container.cookT / 10) : 0;
      arrow.style.clipPath = `inset(0 ${(1 - cookFrac) * 100}% 0 0)`;
      area.appendChild(arrow);
      area.appendChild(this.makeSlot('fout', 0));
    } else if (mode === 'chest') {
      area.appendChild(grid(3, 'chest', 9));
    } else if (mode === 'creative') {
      const g = document.createElement('div');
      g.className = 'slotgrid';
      g.style.gridTemplateColumns = 'repeat(9, 44px)';
      g.style.maxHeight = '270px';
      g.style.overflowY = 'auto';
      for (const id of creativeItems()) {
        g.appendChild(this.makeSlot('creative', id, { id, count: 1 }));
      }
      area.appendChild(g);
    }
  }

  renderPlayerGrid() {
    const inv = this.playerInv;
    this.el.invGrid.innerHTML = '';
    this.el.hotbarGrid.innerHTML = '';
    if (!inv) return;
    for (let i = 9; i < 36; i++) this.el.invGrid.appendChild(this.makeSlot('inv', i));
    for (let i = 0; i < 9; i++) this.el.hotbarGrid.appendChild(this.makeSlot('inv', i));
  }

  makeSlot(zone, idx, fakeStack) {
    const slot = document.createElement('div');
    slot.className = 'islot';
    const s = fakeStack ?? this.zoneGet(zone, idx);
    slot.addEventListener('mouseenter', () => { this.hoverSlot = { zone, idx, fake: fakeStack ?? null }; });
    slot.addEventListener('mouseleave', () => { if (this.hoverSlot?.zone === zone && this.hoverSlot?.idx === idx) this.hoverSlot = null; });
    if (s) {
      const img = document.createElement('img');
      img.src = iconURL(s.id);
      img.draggable = false;
      slot.appendChild(img);
      if (s.count > 1) {
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = s.count;
        slot.appendChild(c);
      }
      if (isTool(s.id) && s.dur !== undefined && s.dur < ITEMS[s.id].maxDur) {
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
      slot.addEventListener('mouseenter', () => this.showTooltip(s));
      slot.addEventListener('mouseleave', () => this.hideTooltip());
    }
    slot.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.slotClick(zone, idx, e.button, e.shiftKey, fakeStack);
    });
    return slot;
  }

  zoneGet(zone, idx) {
    if (zone === 'craft') return this.craft[idx] ?? null;
    if (zone === 'result') {
      const size = this.screenMode === 'table' ? 3 : 2;
      const n = size * size;
      const gridArr = [];
      for (let i = 0; i < n; i++) gridArr.push(this.craft[i]);
      return matchGrid(gridArr, size);
    }
    if (zone === 'creative') return null;
    if (!this.playerInv) return null;
    return getSlot(zone, idx, this.playerInv, this.container ?? {});
  }

  zoneSet(zone, idx, value) {
    if (zone === 'craft') { this.craft[idx] = value; return; }
    if (zone === 'creative' || zone === 'result') return;
    setSlot(zone, idx, value, this.playerInv, this.container);
  }

  slotClick(zone, idx, button, shift, fakeStack) {
    if (zone === 'creative') {
      // palette: one click = a full stack straight into the selected hotbar slot
      const full = { id: idx, count: maxStack(idx) };
      this.playerInv.slots[this.playerInv.selected] = full;
      this.renderScreen();
      this.cb.onInventoryChange();
      return;
    }

    if (zone === 'result') {
      const size = this.screenMode === 'table' ? 3 : 2;
      const n = size * size;
      const gridArr = [];
      for (let i = 0; i < n; i++) gridArr.push(this.craft[i]);
      let result = matchGrid(gridArr, size);
      if (!result) return;
      if (shift) {
        // craft as many as fit
        let guard = 0;
        while (result && guard++ < 64) {
          if (this.playerInv.add({ ...result }) > 0) break;
          consumeGrid(gridArr);
          result = matchGrid(gridArr, size);
        }
      } else {
        if (!this.cursorStack) {
          this.cursorStack = { ...result };
          consumeGrid(gridArr);
        } else if (canMerge(this.cursorStack, result) && this.cursorStack.count + result.count <= maxStack(result.id)) {
          this.cursorStack.count += result.count;
          consumeGrid(gridArr);
        }
      }
      for (let i = 0; i < n; i++) this.craft[i] = gridArr[i];
      this.renderScreen();
      this.cb.onInventoryChange();
      return;
    }

    if (zone === 'fout') {
      // output slots are take-only
      const s = this.zoneGet('fout', 0);
      if (!s) return;
      if (!this.cursorStack) { this.cursorStack = s; this.zoneSet('fout', 0, null); }
      else if (canMerge(this.cursorStack, s)) { this.cursorStack.count += s.count; this.zoneSet('fout', 0, null); }
      this.renderScreen();
      this.cb.onInventoryChange();
      return;
    }

    if (shift) {
      if (zone === 'craft') {
        const s = this.zoneGet(zone, idx);
        if (s && this.playerInv.add(s) === 0) this.zoneSet(zone, idx, null);
      } else {
        quickMove(zone, idx, this.playerInv, this.container ?? { type: 'chest', slots: [] });
      }
      this.renderScreen();
      this.cb.onInventoryChange();
      return;
    }

    const cur = this.cursorStack;
    const s = this.zoneGet(zone, idx);

    if (button === 2) {
      // right click: place one / take half
      if (cur && (!s || (canMerge(cur, s) && s.count < maxStack(s.id)))) {
        if (!s) this.zoneSet(zone, idx, { id: cur.id, count: 1, ...(cur.dur !== undefined ? { dur: cur.dur } : {}) });
        else s.count++;
        cur.count--;
        if (cur.count <= 0) this.cursorStack = null;
      } else if (!cur && s) {
        this.cursorStack = takeHalf(zone, idx, this.playerInv, this.container ?? {});
      }
    } else {
      // left click: swap / merge
      if (cur && s && canMerge(cur, s)) {
        const cap = maxStack(s.id);
        const take = Math.min(cap - s.count, cur.count);
        s.count += take;
        cur.count -= take;
        if (cur.count <= 0) this.cursorStack = null;
      } else {
        this.zoneSet(zone, idx, cur);
        this.cursorStack = s ?? null;
      }
    }
    if (this.cursorStack && this.cursorStack.count <= 0) this.cursorStack = null;
    if (zone === 'inv' && this.playerInv) {
      for (let i = 0; i < 36; i++) {
        if (this.playerInv.slots[i] && this.playerInv.slots[i].count <= 0) this.playerInv.slots[i] = null;
      }
    }
    this.renderScreen();
    this.cb.onInventoryChange();
  }

  updateCursor() {
    const el = this.el.cursor;
    if (this.cursorStack) {
      el.style.display = 'block';
      el.querySelector('img').src = iconURL(this.cursorStack.id);
      el.querySelector('.count').textContent = this.cursorStack.count > 1 ? this.cursorStack.count : '';
    } else {
      el.style.display = 'none';
    }
  }

  // swap the hovered slot with a hotbar slot (number keys while hovering)
  hoverSwap(hotIdx) {
    if (!this.hoverSlot || this.hoverSlot.zone !== 'inv') return;
    const invIdx = this.hoverSlot.idx;
    if (invIdx === hotIdx) return;
    const a = this.playerInv.slots[invIdx] ?? null;
    const b = this.playerInv.slots[hotIdx] ?? null;
    if (a && b && canMerge(a, b)) {
      const cap = maxStack(a.id);
      const take = Math.min(cap - b.count, a.count);
      if (take > 0) {
        b.count += take;
        a.count -= take;
        if (a.count <= 0) this.playerInv.slots[invIdx] = null;
      }
    } else {
      this.playerInv.slots[invIdx] = b;
      this.playerInv.slots[hotIdx] = a;
    }
    this.renderScreen();
    this.cb.onInventoryChange();
  }

  // throw the cursor stack away (backdrop click)
  tossCursor() {
    if (!this.cursorStack) return false;
    const tossed = { ...this.cursorStack };
    this.cursorStack = null;
    this.updateCursor();
    this.cb.onTossCursor?.(tossed);
    this.cb.onInventoryChange();
    return true;
  }

  showTooltip(s) {
    const t = this.el.tooltip;
    t.textContent = nameOf(s.id);
    t.style.display = 'block';
  }
  hideTooltip() { this.el.tooltip.style.display = 'none'; }
}

// creative palette: every placeable block + every item
let CREATIVE_LIST = null;
function creativeItems() {
  if (CREATIVE_LIST) return CREATIVE_LIST;
  const ids = [...PALETTE_IDS];
  for (const id of Object.keys(ITEMS).map(Number)) ids.push(id);
  ids.sort((a, b) => {
    const ga = a < 100 ? (BLOCKS[a]?.group ?? 'zz') : 'zz-items';
    const gb = b < 100 ? (BLOCKS[b]?.group ?? 'zz') : 'zz-items';
    return ga === gb ? a - b : ga.localeCompare(gb);
  });
  CREATIVE_LIST = ids;
  return ids;
}

const iconURLCache = new Map();
function cachedDataURL(key, maker) {
  if (!iconURLCache.has(key)) iconURLCache.set(key, maker());
  return iconURLCache.get(key);
}
function arrowURL() {
  return cachedDataURL('arrow', () => {
    const c = document.createElement('canvas');
    c.width = 36; c.height = 24;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8b8b8b';
    ctx.fillRect(4, 9, 22, 6);
    ctx.beginPath();
    ctx.moveTo(26, 4); ctx.lineTo(34, 12); ctx.lineTo(26, 20);
    ctx.closePath();
    ctx.fillStyle = '#8b8b8b';
    ctx.fill();
    return c.toDataURL();
  });
}
function flameURL() {
  return cachedDataURL('flame', () => {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8741e';
    ctx.fillRect(9, 6, 6, 14);
    ctx.fillRect(7, 10, 10, 10);
    ctx.fillStyle = '#f7c95c';
    ctx.fillRect(10, 10, 4, 8);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(11, 12, 2, 4);
    return c.toDataURL();
  });
}
