// Einstellungen: werden in localStorage gespeichert und beim Start geladen.
const KEY = 'frontline_zero_settings_v1';

export const QUALITY = {
  low:    { shadows: 'off',    textures: 'low',    renderScale: 0.75, maxDpr: 1 },
  medium: { shadows: 'low',    textures: 'medium', renderScale: 1,    maxDpr: 1 },
  high:   { shadows: 'medium', textures: 'high',   renderScale: 1,    maxDpr: 1.5 },
  ultra:  { shadows: 'high',   textures: 'high',   renderScale: 1,    maxDpr: 2 },
};
export const SHADOW_SIZE = { off: 0, low: 1024, medium: 2048, high: 4096 };
export const ANISO = { low: 1, medium: 4, high: 16 };

export const DEFAULTS = {
  name: 'Operator',
  sens: 1.0, adsSens: 0.75, invertY: false, fov: 75,
  quality: 'high', shadows: 'medium', textures: 'high', renderScale: 1, dynRes: true, fpsLimit: 0,
  showFps: false, showPing: true,
  crosshair: 'cross', crosshairColor: '#ffffff', hitFeedback: true, cameraEffects: true, subtitles: false,
  vol: { master: 0.8, sfx: 1, ambient: 0.5, ui: 0.8 },
  keys: {
    forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    sprint: ['ShiftLeft'], jump: ['Space'], crouch: ['ControlLeft', 'KeyC'],
    reload: ['KeyR'], slot1: ['Digit1'], slot2: ['Digit2'], fireMode: ['KeyB'], scoreboard: ['Tab'],
  },
  touch: { size: 1, opacity: 0.55 },
};

export const KEY_LABELS = {
  forward: 'Vorwärts', back: 'Rückwärts', left: 'Links', right: 'Rechts', sprint: 'Sprinten', jump: 'Springen',
  crouch: 'Ducken', reload: 'Nachladen', slot1: 'Primärwaffe', slot2: 'Sekundärwaffe', fireMode: 'Schussmodus', scoreboard: 'Scoreboard',
};

function merge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    const b = base[k], o = over[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, o);
    else if (Array.isArray(b)) out[k] = Array.isArray(o) && o.every(x => typeof x === 'string') ? o : b;
    else if (typeof b === typeof o) out[k] = o;
  }
  return out;
}

export const S = (() => {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY)); } catch { /* ignorieren */ }
  return merge(DEFAULTS, stored);
})();

const listeners = new Set();
export function onSettingsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* Speicher voll/gesperrt */ }
  listeners.forEach(fn => fn(S));
}
export function applyPreset(name) {
  const q = QUALITY[name]; if (!q) return;
  S.quality = name; S.shadows = q.shadows; S.textures = q.textures; S.renderScale = q.renderScale;
  saveSettings();
}
export function resetSettings() { Object.assign(S, merge(DEFAULTS, null)); saveSettings(); }
