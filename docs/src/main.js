// Einstieg: Menüs (Hauptmenü, Lobby, Pause, Ergebnis, Einstellungen) und Start des Spiels.
import { Game } from './core/game.js';
import { S, saveSettings, applyPreset, resetSettings, KEY_LABELS, QUALITY } from './settings/settings.js';
import { esc } from './ui/hud.js';
import { MODES, TEAM_NAMES } from '../shared/constants.js';

const $ = id => document.getElementById(id);
const SCREENS = ['loading', 'mainMenu', 'lobby', 'pause', 'settings', 'results', 'reconnect'];
const show = id => SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
let game = null, settingsReturn = 'mainMenu', lobbyActive = false;

const ui = {
  onDeploy() { lobbyActive = false; show(null); },
  showPause() { show('pause'); }, hidePause() { show(null); },
  showReconnect() { show('reconnect'); },
  showResults(r, result) {
    $('resTitle').textContent = (result?.label || 'MATCH ENDE').toUpperCase();
    const ffa = r?.mode === 'ffa';
    $('resBody').innerHTML = [...(r?.players || [])].sort((a, b) => b.score - a.score || b.k - a.k)
      .map(p => `<tr><td>${esc(p.name)}</td><td>${ffa ? '–' : TEAM_NAMES[p.team] ?? '–'}</td><td>${p.k}</td><td>${p.d}</td></tr>`).join('');
    $('resNext').textContent = 'Das nächste Match startet automatisch.'; show('results');
  },
  hideResults() { show(null); },
  onRoster(r, myId) {
    if (!lobbyActive) return;
    $('lobbyInfo').textContent = `${MODES[r.mode]?.name || r.mode} · ${r.phase === 'warmup' ? 'Match startet in ' + Math.ceil(r.endsIn / 1000) + ' s' : r.phase === 'running' ? 'Match läuft' : r.phase}`;
    $('lobbyBody').innerHTML = r.players.filter(p => p.connected).map(p =>
      `<tr class="${p.id === myId ? 'me' : ''}"><td>${esc(p.name)}</td><td>${r.mode === 'ffa' ? '–' : TEAM_NAMES[p.team] ?? '–'}</td><td>${p.ping} ms</td></tr>`).join('');
  },
};

// ---------------- Einstellungen ----------------
function buildSettings() {
  const body = $('settingsBody'); body.innerHTML = '';
  const group = t => { const d = document.createElement('div'); d.className = 'settings-group'; d.textContent = t; body.appendChild(d); };
  const row = (label, ctrl) => { const l = document.createElement('label'); l.className = 'row'; l.append(label, ctrl); body.appendChild(l); return l; };
  const sel = (opts, val, fn) => { const s = document.createElement('select'); opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }); s.value = String(val); s.onchange = () => fn(s.value); return s; };
  const range = (min, max, step, val, fn) => { const r = document.createElement('input'); r.type = 'range'; Object.assign(r, { min, max, step, value: val }); r.oninput = () => fn(parseFloat(r.value)); r.onchange = () => saveSettings(); return r; };
  const check = (val, fn) => { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = val; c.onchange = () => { fn(c.checked); saveSettings(); }; return c; };
  const set = (fn) => v => { fn(v); saveSettings(); };

  group('Grafik');
  row('Qualitätsprofil', sel([['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch'], ['ultra', 'Ultra']], S.quality, v => { applyPreset(v); buildSettings(); }));
  row('Schatten', sel([['off', 'Aus'], ['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']], S.shadows, set(v => { S.shadows = v; })));
  row('Texturen', sel([['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']], S.textures, set(v => { S.textures = v; })));
  row('Render-Auflösung', range(0.5, 1, 0.05, S.renderScale, v => { S.renderScale = v; }));
  row('Dynamische Auflösung', check(S.dynRes, v => { S.dynRes = v; }));
  row('FPS-Limit', sel([[0, 'Unbegrenzt'], [30, '30'], [60, '60'], [90, '90'], [120, '120'], [144, '144']], S.fpsLimit, set(v => { S.fpsLimit = parseInt(v, 10); })));
  row('Sichtfeld (FOV)', range(60, 110, 1, S.fov, v => { S.fov = v; }));
  row('FPS-Anzeige', check(S.showFps, v => { S.showFps = v; }));

  group('Steuerung');
  row('Maus-Sensitivität', range(0.2, 3, 0.05, S.sens, v => { S.sens = v; }));
  row('ADS-Sensitivität', range(0.2, 1.5, 0.05, S.adsSens, v => { S.adsSens = v; }));
  row('Y-Achse invertieren', check(S.invertY, v => { S.invertY = v; }));
  for (const [act, label] of Object.entries(KEY_LABELS)) {
    const b = document.createElement('button'); const fmt = c => c.replace('Key', '').replace('Digit', '').replace('Left', ' L').replace('Right', ' R');
    b.textContent = fmt(S.keys[act][0]); b.style.minWidth = '150px';
    b.onclick = () => { b.textContent = 'Taste drücken …'; game.input.rebinding = code => { if (code !== 'Escape') { S.keys[act][0] = code; saveSettings(); } b.textContent = fmt(S.keys[act][0]); }; };
    row(label, b);
  }
  const info = document.createElement('p'); info.className = 'sub'; info.textContent = 'Controller: Standardbelegung (Sticks, RT/LT, A/X/B/Y) – keine freie Belegung.'; body.appendChild(info);
  group('Touch');
  row('Button-Größe', range(0.6, 1.6, 0.05, S.touch.size, v => { S.touch.size = v; game.touch.applySettings(); }));
  row('Transparenz', range(0.2, 1, 0.05, S.touch.opacity, v => { S.touch.opacity = v; game.touch.applySettings(); }));
  const eb = document.createElement('button'); eb.textContent = 'Layout bearbeiten';
  eb.onclick = () => { show(null); game.touch.startEdit(() => show('settings')); };
  const rb = document.createElement('button'); rb.textContent = 'Layout zurücksetzen'; rb.onclick = () => game.touch.resetPositions();
  row('Touch-Layout', eb); row('', rb);

  group('Audio');
  row('Master', range(0, 1, 0.05, S.vol.master, v => { S.vol.master = v; saveSettings(); }));
  row('Effekte', range(0, 1, 0.05, S.vol.sfx, v => { S.vol.sfx = v; saveSettings(); }));
  row('Umgebung', range(0, 1, 0.05, S.vol.ambient, v => { S.vol.ambient = v; saveSettings(); }));
  row('Interface', range(0, 1, 0.05, S.vol.ui, v => { S.vol.ui = v; saveSettings(); }));

  group('Gameplay');
  row('Fadenkreuz', sel([['cross', 'Kreuz'], ['dot', 'Punkt'], ['crossdot', 'Kreuz + Punkt']], S.crosshair, set(v => { S.crosshair = v; })));
  const col = document.createElement('input'); col.type = 'color'; col.value = S.crosshairColor; col.onchange = () => { S.crosshairColor = col.value; saveSettings(); }; row('Fadenkreuz-Farbe', col);
  row('Trefferfeedback', check(S.hitFeedback, v => { S.hitFeedback = v; }));
  row('Kameraeffekte (Bob, Neigung)', check(S.cameraEffects, v => { S.cameraEffects = v; }));
  row('Untertitel (Audio-Hinweise)', check(S.subtitles, v => { S.subtitles = v; }));
  row('Ping anzeigen', check(S.showPing, v => { S.showPing = v; }));
}
const openSettings = from => { settingsReturn = from; buildSettings(); show('settings'); };

// ---------------- Menü-Verdrahtung ----------------
function wire() {
  $('nameInput').value = S.name;
  const click = (id, fn) => $(id).addEventListener('click', () => { game.audio.ui(); fn(); });
  click('btnSettings', () => openSettings('mainMenu'));
  click('btnPauseSettings', () => openSettings('pause'));
  click('btnSettingsBack', () => show(settingsReturn));
  click('btnSettingsReset', () => { resetSettings(); buildSettings(); });
  click('btnResume', () => game.resume());
  click('btnQuit', () => { game.quit(); show('mainMenu'); });
  click('btnResLeave', () => { game.quit(); show('mainMenu'); });
  click('btnLeave', () => { lobbyActive = false; game.quit(); show('mainMenu'); });
  click('btnDeploy', () => game.deploy());
  click('btnReconnectGo', () => { game.net.deploy(); game.resume(); });
  click('btnTraining', () => { S.name = $('nameInput').value.trim() || 'Operator'; saveSettings(); game.startTraining(); });
  click('btnOnline', async () => {
    S.name = $('nameInput').value.trim() || 'Operator'; saveSettings();
    $('menuMsg').textContent = 'Verbinde …'; $('btnOnline').disabled = true;
    const r = await game.joinOnline(S.name, $('modeSelect').value);
    $('btnOnline').disabled = false;
    if (!r.ok) { $('menuMsg').textContent = r.error; return; }
    $('menuMsg').textContent = ''; lobbyActive = true; show('lobby');
  });
  $('tbPause')?.addEventListener('click', () => game.pause());
  $('pause').addEventListener('contextmenu', e => e.preventDefault());
}

(async () => {
  const bar = $('loadBar'), txt = $('loadText');
  try {
    game = new Game($('view'), ui); window.frontline = game;   // window.frontline: Debug-Zugriff (z. B. ADS-Offset feinjustieren)
    await game.init((p, t) => { bar.style.width = (p * 100) + '%'; txt.textContent = t; });
    wire(); show('mainMenu');
  } catch (e) {
    console.error(e); txt.textContent = 'Fehler beim Laden: ' + (e?.message || e); txt.style.color = '#ff6b5b';
  }
})();
