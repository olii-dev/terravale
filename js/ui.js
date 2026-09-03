// DOM UI glue: menu, connecting overlay, HUD (hotbar/debug/chat chrome),
// pause menu, block picker, player list, toasts.

import { BLOCKS, GROUP_LABELS, PALETTE_IDS } from './blocks.js';
import { blockIcon } from './textures.js';
import { listWorlds } from './save.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.hotbarIds = [];
    this.selected = 0;
    this.pickerOpen = false;
    this.debugVisible = false;

    this.el = {
      menu: $('menu'), connecting: $('connecting'), hud: $('hud'), pause: $('pause'), picker: $('picker'),
      nameInput: $('name-input'), codeInput: $('code-input'), menuError: $('menu-error'),
      savedWrap: $('saved-wrap'), savedWorlds: $('saved-worlds'),
      connectStatus: $('connecting-status'),
      hotbar: $('hotbar'), blockName: $('block-name'), debug: $('debug'),
      hudCode: $('hud-code'), hudRole: $('hud-role'), hint: $('hint'),
      chatLog: $('chat'), chatWrap: $('chat-input-wrap'), chatInput: $('chat-input'),
      playerList: $('player-list'), toasts: $('toasts'),
      pauseCode: $('pause-code'), pickerGroups: $('picker-groups'),
      btnSound: $('btn-sound'), renderDist: $('render-dist'),
    };

    this.initMenuStars();
    this.wire();
  }

  wire() {
    $('btn-create').addEventListener('click', () => this.cb.onCreate());
    this.el.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cb.onCreate();
      e.stopPropagation();
    });
    this.el.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cb.onJoin(this.el.codeInput.value.trim().toUpperCase());
      e.stopPropagation();
    });
    $('btn-join').addEventListener('click', () => this.cb.onJoin(this.el.codeInput.value.trim().toUpperCase()));
    $('btn-cancel-connect').addEventListener('click', () => this.cb.onCancelConnect());
    $('btn-resume').addEventListener('click', () => this.cb.onPauseResume());
    $('btn-quit').addEventListener('click', () => this.cb.onQuit());
    this.el.btnSound.addEventListener('click', () => this.cb.onSoundToggle());
    this.el.renderDist.addEventListener('change', () => this.cb.onRenderDistance(+this.el.renderDist.value));
  }

  initMenuStars() {
    const wrap = $('menu-stars');
    for (let i = 0; i < 70; i++) {
      const s = document.createElement('i');
      s.style.left = (Math.random() * 100) + '%';
      s.style.top = (Math.random() * 100) + '%';
      s.style.animationDelay = (Math.random() * 3) + 's';
      wrap.appendChild(s);
    }
  }

  // ---------- screens ----------

  showMenu() {
    this.el.menu.classList.remove('hidden');
    this.el.connecting.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.refreshSavedWorlds();
  }

  showConnecting(status) {
    this.el.menu.classList.add('hidden');
    this.el.connecting.classList.remove('hidden');
    this.el.connectStatus.textContent = status;
  }

  setConnectStatus(s) { this.el.connectStatus.textContent = s; }

  menuError(msg) { this.el.menuError.textContent = msg || ''; }

  showHud() {
    this.el.menu.classList.add('hidden');
    this.el.connecting.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  refreshSavedWorlds() {
    const worlds = listWorlds();
    this.el.savedWrap.classList.toggle('hidden', worlds.length === 0);
    this.el.savedWorlds.innerHTML = '';
    for (const w of worlds.slice(0, 4)) {
      const div = document.createElement('div');
      div.className = 'saved-world';
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = w.code;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${w.blocks} edits · ${new Date(w.updated).toLocaleDateString()}`;
      const btn = document.createElement('button');
      btn.textContent = 'Host';
      btn.addEventListener('click', () => this.cb.onResumeHost(w.code));
      div.append(code, meta, btn);
      this.el.savedWorlds.appendChild(div);
    }
  }

  // ---------- HUD ----------

  setRoom(code, role) {
    this.el.hudCode.textContent = code;
    this.el.hudRole.textContent = role === 'host' ? 'you are the host' : 'connected';
    this.el.pauseCode.textContent = code;
  }

  buildHotbar(ids) {
    this.hotbarIds = ids;
    this.selected = Math.min(this.selected, ids.length - 1);
    this.el.hotbar.innerHTML = '';
    ids.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === this.selected ? ' selected' : '');
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = i + 1;
      const img = document.createElement('img');
      img.src = blockIcon(id, 64).toDataURL();
      img.alt = BLOCKS[id]?.name ?? '';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = BLOCKS[id]?.name ?? '';
      slot.append(key, img, label);
      slot.addEventListener('click', () => this.selectSlot(i));
      this.el.hotbar.appendChild(slot);
    });
  }

  selectSlot(i) {
    if (i < 0 || i >= this.hotbarIds.length) return;
    this.selected = i;
    [...this.el.hotbar.children].forEach((el, idx) => el.classList.toggle('selected', idx === i));
    this.flashBlockName(BLOCKS[this.hotbarIds[i]]?.name ?? '');
  }

  currentBlock() { return this.hotbarIds[this.selected]; }

  setSlotBlock(i, id) {
    this.hotbarIds[i] = id;
    this.buildHotbar(this.hotbarIds);
    this.selectSlot(i);
  }

  flashBlockName(name) {
    this.el.blockName.textContent = name;
    this.el.blockName.style.opacity = 0.95;
    clearTimeout(this._nameTimer);
    this._nameTimer = setTimeout(() => (this.el.blockName.style.opacity = 0), 1200);
  }

  setHint(visible) { this.el.hint.classList.toggle('hidden', !visible); }

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

  showPlayerList(show) {
    this.el.playerList.classList.toggle('hidden', !show);
  }

  toast(msg, ms = 2600) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // ---------- pause ----------

  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }

  setSoundLabel(muted) {
    this.el.btnSound.textContent = muted ? 'Off' : 'On';
  }

  // ---------- picker ----------

  openPicker() {
    if (this.pickerOpen) return;
    this.pickerOpen = true;
    this.el.picker.classList.remove('hidden');
    this.cb.onPickerVisibility(true);
  }

  closePicker() {
    if (!this.pickerOpen) return;
    this.pickerOpen = false;
    this.el.picker.classList.add('hidden');
    this.cb.onPickerVisibility(false);
  }

  isPickerOpen() { return this.pickerOpen; }

  buildPicker() {
    const groups = new Map();
    for (const id of PALETTE_IDS) {
      const g = BLOCKS[id].group ?? 'natural';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(id);
    }
    this.el.pickerGroups.innerHTML = '';
    for (const [g, ids] of groups) {
      const wrap = document.createElement('div');
      wrap.className = 'picker-group';
      const h = document.createElement('h4');
      h.textContent = GROUP_LABELS[g] ?? g;
      const grid = document.createElement('div');
      grid.className = 'picker-grid';
      for (const id of ids) {
        const pick = document.createElement('div');
        pick.className = 'pick';
        const img = document.createElement('img');
        img.src = blockIcon(id, 64).toDataURL();
        img.alt = BLOCKS[id].name;
        const tip = document.createElement('span');
        tip.className = 'tip-label';
        tip.textContent = BLOCKS[id].name;
        pick.append(img, tip);
        pick.addEventListener('click', () => this.cb.onPickerPick(id));
        grid.appendChild(pick);
      }
      wrap.append(h, grid);
      this.el.pickerGroups.appendChild(wrap);
    }
  }

  // ---------- misc ----------

  getName() { return this.el.nameInput.value.trim() || 'Wanderer'; }
  getCode() { return this.el.codeInput.value.trim().toUpperCase(); }
}
