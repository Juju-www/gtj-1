// Vollständig synthetisiertes Audio (WebAudio) – keine fremden Sounddateien, keine Lizenzprobleme.
// Räumliches 3D-Audio für entfernte Schüsse (HRTF-Panner + Tiefpass nach Entfernung).
import { S, onSettingsChange } from '../settings/settings.js';

export class AudioSystem {
  constructor() { this.ctx = null; this.onSubtitle = null; this.stepT = 0; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.connect(c.destination);
    this.bus = {};
    for (const k of ['sfx', 'ambient', 'ui']) { this.bus[k] = c.createGain(); this.bus[k].connect(this.master); }
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.applyVolumes(); onSettingsChange(() => this.applyVolumes());
    this.startAmbient();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = S.vol.master; this.bus.sfx.gain.value = S.vol.sfx;
    this.bus.ambient.gain.value = S.vol.ambient; this.bus.ui.gain.value = S.vol.ui;
  }

  setListener(pos, yaw) {
    const l = this.ctx?.listener; if (!l) return;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition?.(pos.x, pos.y, pos.z); l.setOrientation?.(fx, 0, fz, 0, 1, 0); }
  }

  sub(text) { if (S.subtitles) this.onSubtitle?.(text); }

  // --- Bausteine ---
  _noise(dest, { t = 0, dur = 0.1, type = 'bandpass', freq = 1500, q = 1, gain = 1, attack = 0.002 }) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(), t0 = c.currentTime + t;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }
  _tone(dest, { t = 0, dur = 0.15, f0 = 120, f1 = 50, gain = 0.6, type = 'sine' }) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + t;
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  _spatial(pos) {
    const c = this.ctx, p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 6; p.rolloffFactor = 1.3; p.maxDistance = 400;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.bus.sfx); return p;
  }

  /** Schuss: eigener (dist=0, direkt) oder entfernter (pos + dist → Tiefpass + Echo). */
  shot(pos = null, dist = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    let dest = this.bus.sfx;
    if (pos) {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 9000 - dist * 70);
      lp.connect(this._spatial(pos)); dest = lp;
      if (dist > 35) {   // Hall/Echo über offenes Gelände
        const dl = c.createDelay(1); dl.delayTime.value = 0.28; const fb = c.createGain(); fb.gain.value = 0.35;
        dl.connect(fb); fb.connect(dl); const eg = c.createGain(); eg.gain.value = 0.4; lp.connect(dl); dl.connect(eg); eg.connect(this._spatial(pos));
        setTimeout(() => { try { dl.disconnect(); fb.disconnect(); } catch { /* */ } }, 2500);
      }
    }
    this._noise(dest, { dur: 0.2, freq: 1800, q: 0.6, gain: 1.0 });
    this._noise(dest, { dur: 0.05, type: 'highpass', freq: 3500, gain: 0.8, attack: 0.001 });
    this._tone(dest, { dur: 0.16, f0: 170, f1: 45, gain: 0.9 });
    if (pos && dist > 15) this.sub('[Schüsse in der Ferne]'); else if (pos) this.sub('[Schüsse in der Nähe]');
  }
  empty() { if (!this.ctx) return; this._noise(this.bus.sfx, { dur: 0.04, freq: 2500, q: 3, gain: 0.5 }); this._tone(this.bus.sfx, { dur: 0.04, f0: 800, f1: 500, gain: 0.2, type: 'square' }); }
  /** Nachladen: Magazin raus / rein / (Verschluss) – zeitlich auf die Animationsdauer verteilt. */
  reload(duration, empty) {
    if (!this.ctx) return;
    const clack = (t, f) => { this._noise(this.bus.sfx, { t, dur: 0.07, freq: f, q: 2, gain: 0.7 }); this._tone(this.bus.sfx, { t, dur: 0.06, f0: f / 6, f1: f / 12, gain: 0.35, type: 'triangle' }); };
    clack(duration * 0.22, 1400); clack(duration * 0.62, 2000);
    if (empty) clack(duration * 0.86, 1100);
    this.sub('[Nachladen]');
  }
  switchWeapon() { if (this.ctx) { this._noise(this.bus.sfx, { dur: 0.09, freq: 900, q: 1, gain: 0.5 }); } }
  step(sprint, pos = null) {
    if (!this.ctx) return;
    this._noise(this.bus.sfx, { dur: 0.09, type: 'lowpass', freq: sprint ? 900 : 600, gain: sprint ? 0.35 : 0.2 });
  }
  jump() { if (this.ctx) this._noise(this.bus.sfx, { dur: 0.1, type: 'lowpass', freq: 500, gain: 0.25 }); }
  land(v) { if (this.ctx) this._noise(this.bus.sfx, { dur: 0.16, type: 'lowpass', freq: 400, gain: Math.min(0.8, 0.2 + v * 0.05) }); }
  hitmarker(head) { if (this.ctx) this._tone(this.bus.ui, { dur: 0.07, f0: head ? 1900 : 1300, f1: head ? 1700 : 1100, gain: 0.25, type: 'square' }); }
  kill() { if (this.ctx) { this._tone(this.bus.ui, { dur: 0.12, f0: 900, f1: 900, gain: 0.25, type: 'square' }); this._tone(this.bus.ui, { t: 0.1, dur: 0.18, f0: 1350, f1: 1350, gain: 0.25, type: 'square' }); } }
  hurt() { if (this.ctx) { this._noise(this.bus.sfx, { dur: 0.15, type: 'lowpass', freq: 700, gain: 0.7 }); this._tone(this.bus.sfx, { dur: 0.2, f0: 120, f1: 70, gain: 0.5 }); } }
  ui(kind = 'click') { if (this.ctx) this._tone(this.bus.ui, { dur: 0.05, f0: kind === 'back' ? 500 : 800, f1: kind === 'back' ? 380 : 650, gain: 0.18, type: 'triangle' }); }

  startAmbient() {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain); src.connect(f); f.connect(g); g.connect(this.bus.ambient); src.start(); lfo.start();
  }
}
