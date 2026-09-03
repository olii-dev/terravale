// Settings: persisted options + rebindable keys. Everything lives in
// localStorage under tv:settings and is applied live by main.js.

const KEY = 'tv:settings';

export const DEFAULT_BINDS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ControlLeft',
  flyDown: 'ShiftLeft',
  inventory: 'KeyE',
  chat: 'KeyT',
  drop: 'KeyQ',
  debug: 'F3',
  playerList: 'Tab',
};

export const BIND_LABELS = {
  forward: 'Walk forward',
  back: 'Walk backward',
  left: 'Strafe left',
  right: 'Strafe right',
  jump: 'Jump / swim up',
  sprint: 'Sprint',
  flyDown: 'Fly down',
  inventory: 'Inventory / blocks',
  chat: 'Chat',
  drop: 'Drop item',
  debug: 'Debug info',
  playerList: 'Player list',
};

export const DEFAULTS = {
  renderDist: 4,        // chunks
  fov: 75,
  gamma: 0.3,           // 0..1 brightness lift for dark areas
  fullscreen: false,
  clouds: true,
  showFps: false,
  sens: 1.0,            // mouse sensitivity multiplier
  invertY: false,
  master: 0.8,
  sfx: 1.0,
  autoJump: false,
  hints: true,
  binds: { ...DEFAULT_BINDS },
};

class Settings {
  constructor() {
    this.values = structuredClone(DEFAULTS);
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      Object.assign(this.values, raw);
      this.values.binds = { ...DEFAULT_BINDS, ...(raw.binds || {}) };
    } catch { /* keep defaults */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
  }

  get(k) { return this.values[k]; }
  set(k, v) { this.values[k] = v; this.save(); }

  bind(action) { return this.values.binds[action]; }
  setBind(action, code) { this.values.binds[action] = code; this.save(); }

  // reverse map: code -> action (rebuilt on demand)
  actionFor(code) {
    for (const [action, c] of Object.entries(this.values.binds)) {
      if (c === code) return action;
    }
    return null;
  }

  prettyKey(code) {
    if (!code) return '—';
    const map = {
      ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
      ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
      AltLeft: 'L-Alt', AltRight: 'R-Alt',
      Space: 'Space', Tab: 'Tab', CapsLock: 'Caps',
      Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Semicolon: ';', Quote: "'", Backslash: '\\', Comma: ',', Period: '.',
      Slash: '/', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('F') && code.length <= 3) return code;
    return code;
  }
}

export const settings = new Settings();
