// localStorage persistence: worlds (per room code) and player prefs.

const WORLD_PREFIX = 'vhm:world:';
const PREFS_KEY = 'vhm:prefs';

export function saveWorld(code, { seed, editsStr, time, pos, yaw }) {
  try {
    localStorage.setItem(WORLD_PREFIX + code, JSON.stringify({
      v: 1,
      seed,
      edits: editsStr,
      time,
      pos: pos ? [round2(pos[0]), round2(pos[1]), round2(pos[2])] : null,
      yaw: yaw ?? 0,
      blocks: editsStr ? editsStr.split(';').filter(Boolean).length : 0,
      updated: Date.now(),
    }));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadWorld(code) {
  try {
    const raw = localStorage.getItem(WORLD_PREFIX + code);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function listWorlds() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(WORLD_PREFIX)) continue;
    try {
      const w = JSON.parse(localStorage.getItem(key));
      out.push({ code: key.slice(WORLD_PREFIX.length), ...w });
    } catch { /* skip corrupt */ }
  }
  out.sort((a, b) => b.updated - a.updated);
  return out;
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}

function round2(n) { return Math.round(n * 100) / 100; }
