// HUD: Punktestand, Timer, Munition, Gesundheit/Ausdauer, dynamisches Fadenkreuz, Trefferfeedback,
// Killfeed, Minimap, Scoreboard, Banner/Untertitel. DOM-Werte werden nur bei Änderung geschrieben.
import { S } from '../settings/settings.js';
import { TEAM_NAMES } from '../../../shared/constants.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.el = {};
    for (const id of ['hud', 'scoreA', 'scoreB', 'timer', 'hudMode', 'minimap', 'killfeed', 'fps', 'conn', 'hpBar', 'hpText', 'stamBar', 'wName', 'ammoMag', 'ammoRes', 'fireMode',
      'reloadBar', 'crosshair', 'chT', 'chB', 'chL', 'chR', 'chDot', 'hitmarker', 'damage', 'dmgArrow', 'hint', 'banner', 'subtitle', 'deathOverlay', 'deathText', 'scoreboard', 'sbBody', 'sbTitle'])
      this.el[id] = $(id);
    this.last = {}; this.timers = {};
    this.mm = this.el.minimap.getContext('2d'); this.mmBase = this._buildMinimapBase(world);
    this.fpsAcc = 0; this.fpsN = 0;
  }

  set(id, prop, val) { if (this.last[id + prop] !== val) { this.last[id + prop] = val; this.el[id][prop] = val; } }
  setStyle(id, prop, val) { if (this.last[id + '.' + prop] !== val) { this.last[id + '.' + prop] = val; this.el[id].style[prop] = val; } }
  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  _buildMinimapBase(world) {
    const c = document.createElement('canvas'); c.width = c.height = 560; const g = c.getContext('2d');
    g.fillStyle = '#1a1f24'; g.fillRect(0, 0, 560, 560);
    for (const b of world.solid) {
      if (b.maxy <= 0.05) continue;
      g.fillStyle = b.maxy > 6 ? '#8a949e' : b.maxy > 2.5 ? '#6b747d' : '#4a525a';
      g.fillRect((b.minx + 70) * 4, (b.minz + 70) * 4, (b.maxx - b.minx) * 4, (b.maxz - b.minz) * 4);
    }
    return c;
  }

  applyCrosshairStyle() {
    const e = this.el, line = S.crosshair !== 'dot';
    for (const id of ['chT', 'chB', 'chL', 'chR']) e[id].style.display = line ? '' : 'none';
    e.chDot.style.display = S.crosshair === 'cross' ? 'none' : 'block';
    e.crosshair.style.setProperty('--ch', S.crosshairColor);
  }

  banner(text, ms = 2000) {
    this.el.banner.textContent = text; clearTimeout(this.timers.banner);
    this.timers.banner = setTimeout(() => { this.el.banner.textContent = ''; }, ms);
  }
  subtitle(text) {
    this.el.subtitle.textContent = text; clearTimeout(this.timers.sub);
    this.timers.sub = setTimeout(() => { this.el.subtitle.textContent = ''; }, 1800);
  }
  hint(text) { this.set('hint', 'textContent', text); }

  hitmarker(kill, head) {
    if (!S.hitFeedback) return;
    const h = this.el.hitmarker; h.classList.remove('show', 'kill'); void h.offsetWidth;
    h.classList.add('show'); if (kill) h.classList.add('kill'); h.style.filter = head ? 'drop-shadow(0 0 3px #fa0)' : '';
    clearTimeout(this.timers.hm); this.timers.hm = setTimeout(() => h.classList.remove('show', 'kill'), kill ? 220 : 90);
  }
  damageFlash(angle) {
    const d = this.el.damage, a = this.el.dmgArrow;
    d.classList.add('show'); a.classList.add('show'); a.style.transform = `rotate(${angle}rad)`;
    clearTimeout(this.timers.dmg); this.timers.dmg = setTimeout(() => { d.classList.remove('show'); a.classList.remove('show'); }, 160);
  }
  killfeed(killer, victim, head, mine) {
    const d = document.createElement('div'); d.textContent = `${killer}  ▸  ${victim}`; if (head) d.className = 'head';
    if (mine) d.style.borderLeft = '3px solid var(--acc)'; this.el.killfeed.prepend(d);
    setTimeout(() => d.remove(), 5000); while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
  }
  death(text) { this.el.deathOverlay.classList.toggle('hidden', !text); if (text) this.set('deathText', 'textContent', text); }

  /** Roster -> Kopfzeile + Scoreboard */
  onRoster(r, myId, modeName) {
    this.roster = r; this.myId = myId; this.modeName = modeName;
    const ffa = r.mode === 'ffa';
    this.set('hudMode', 'textContent', modeName.toUpperCase());
    if (ffa) {
      const me = r.players.find(p => p.id === myId); const top = [...r.players].sort((a, b) => b.score - a.score)[0];
      this.set('scoreA', 'textContent', String(me ? me.score : 0)); this.set('scoreB', 'textContent', String(top ? top.score : 0));
    } else { this.set('scoreA', 'textContent', String(r.scores?.[0] ?? 0)); this.set('scoreB', 'textContent', String(r.scores?.[1] ?? 0)); }
    const ms = r.timeLeft || 0, m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
    this.set('timer', 'textContent', r.phase === 'running' ? (ms ? `${m}:${String(s).padStart(2, '0')}` : '∞') : r.phase === 'warmup' ? `START ${Math.ceil(r.endsIn / 1000)}` : 'ENDE');
    if (!this.el.scoreboard.classList.contains('hidden')) this.renderScoreboard();
  }
  showScoreboard(v) { this.el.scoreboard.classList.toggle('hidden', !v); if (v) this.renderScoreboard(); }
  renderScoreboard() {
    const r = this.roster; if (!r) return;
    this.el.sbTitle.textContent = `${this.modeName} · ${r.phase === 'running' ? 'läuft' : r.phase}`;
    const rows = [...r.players].filter(p => p.deployed || p.connected).sort((a, b) => b.score - a.score || b.k - a.k);
    this.el.sbBody.innerHTML = rows.map(p => `<tr class="${p.id === this.myId ? 'me' : ''}"><td>${esc(p.name)}</td><td>${r.mode === 'ffa' ? '–' : TEAM_NAMES[p.team] ?? '–'}</td><td>${p.k}</td><td>${p.d}</td><td>${p.ping}</td></tr>`).join('');
  }

  /** pro Frame */
  update(f) {
    this.set('hpText', 'textContent', String(Math.max(0, Math.round(f.hp))));
    this.setStyle('hpBar', 'width', Math.max(0, f.hp) + '%'); this.el.hpBar.classList.toggle('low', f.hp < 30);
    this.setStyle('stamBar', 'width', f.stamina + '%');
    this.set('ammoMag', 'textContent', String(f.mag)); this.el.ammoMag.classList.toggle('low', f.mag <= 8);
    this.set('ammoRes', 'textContent', '/ ' + (f.infinite ? '∞' : f.reserve));
    this.set('wName', 'textContent', f.weaponName);
    this.set('fireMode', 'textContent', ({ auto: 'DAUERFEUER', burst: 'FEUERSTOSS', semi: 'EINZELSCHUSS' })[f.fireMode] + (f.reloading ? ' · NACHLADEN' : ''));
    this.setStyle('reloadBar', 'width', f.reloadProgress * 100 + '%');
    this.hint(f.reloading ? '' : f.mag === 0 && f.reserve === 0 && !f.infinite ? 'KEINE MUNITION' : f.mag <= 8 && f.alive ? 'NACHLADEN [R]' : '');
    // Fadenkreuz: Abstand aus Streuung (Grad) -> Pixel
    const h = innerHeight, gap = Math.tan(f.spread * Math.PI / 180) * (h / 2) / Math.tan(f.fov * Math.PI / 360) + 3;
    this.setStyle('chT', 'top', -(gap + 9) + 'px'); this.setStyle('chB', 'top', gap + 'px'); this.setStyle('chL', 'left', -(gap + 9) + 'px'); this.setStyle('chR', 'left', gap + 'px');
    this.setStyle('crosshair', 'opacity', f.ads > 0.6 ? '0' : '1');
    // FPS
    this.fpsAcc += f.dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { const fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = this.fpsN = 0; this.set('fps', 'textContent', S.showFps ? `${fps} FPS` : ''); }
    this.set('conn', 'textContent', f.conn);
  }

  drawMinimap(px, pz, yaw, others) {
    const g = this.mm, W = 160, s = 0.4;
    g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(80, 80, 79, 0, 7); g.clip();
    g.translate(80, 80); g.rotate(-Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw))); g.scale(s, s);
    g.translate(-(px + 70) * 4, -(pz + 70) * 4); g.drawImage(this.mmBase, 0, 0);
    for (const o of others) { g.fillStyle = o.friend ? '#4aa3ff' : '#ff4d3d'; g.beginPath(); g.arc((o.x + 70) * 4, (o.z + 70) * 4, 14, 0, 7); g.fill(); }
    g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(80, 71); g.lineTo(86, 86); g.lineTo(80, 83); g.lineTo(74, 86); g.closePath(); g.fill();
  }
}

export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
