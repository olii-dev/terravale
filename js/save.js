// localStorage persistence v2: worlds (per room code), player prefs.
// Keys are namespaced tv:*.

const WORLD_PREFIX = 'tv:world:';
const PREFS_KEY = 'tv:prefs';

export function saveWorld(code, data) {
  try {
    localStorage.setItem(WORLD_PREFIX + code, JSON.stringify({
      v: 2,
      seed: data.seed,
      mode: data.mode,
      difficulty: data.difficulty ?? 'normal',
      edits: data.editsStr,
      time: data.time,
      pos: data.pos,
      yaw: data.yaw ?? 0,
      containers: data.containers ?? [],
      inv: data.inv ?? null,
      stats: data.stats ?? null,
      blocks: data.editsStr ? data.editsStr.split(';').filter(Boolean).length : 0,
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
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
