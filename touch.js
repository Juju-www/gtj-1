// Touch-Steuerung: Joystick links (dynamisch), Kamera-Wischen rechts, Buttons; Multi-Touch über Pointer Events.
// Größe/Transparenz einstellbar, Buttons per Layout-Editor verschiebbar (Positionen in localStorage).
import { S } from '../settings/settings.js';

const POS_KEY = 'frontline_zero_touchpos_v1';
const $ = id => document.getElementById(id);
export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

export class Touch {
  constructor(input, hooks) {
    this.input = input; this.hooks = hooks; this.root = $('touch'); this.editing = false;
    this._joy(); this._look(); this._buttons(); this.applySettings(); this._loadPositions();
    // Browser-Gesten unterdrücken
    for (const ev of ['touchmove', 'gesturestart', 'gesturechange']) addEventListener(ev, e => { if (!this.root.classList.contains('hidden')) e.preventDefault(); }, { passive: false });
  }
  show(v) { this.root.classList.toggle('hidden', !v); if (!v) { this.input.touchMove.x = this.input.touchMove.y = 0; ['fire', 'ads', 'sprint'].forEach(a => this.input.setHeld(a, false)); } }
  applySettings() { this.root.style.setProperty('--tsize', S.touch.size); this.root.style.setProperty('--topa', S.touch.opacity); }

  _joy() {
    const zone = $('joyZone'), base = $('joyBase'), knob = $('joyKnob'); let id = null, cx = 0, cy = 0; const R = 55;
    zone.addEventListener('pointerdown', e => {
      if (this.editing || id !== null) return; id = e.pointerId; zone.setPointerCapture(id); cx = e.clientX; cy = e.clientY;
      base.style.display = 'block'; base.style.left = cx + 'px'; base.style.top = (cy - zone.getBoundingClientRect().top) + 'px'; knob.style.transform = '';
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / R);
      dx = dx / l * k; dy = dy / l * k; knob.style.transform = `translate(${dx * R * 0.9}px,${dy * R * 0.9}px)`;
      this.input.touchMove.x = Math.abs(dx) < 0.12 ? 0 : dx; this.input.touchMove.y = Math.abs(dy) < 0.12 ? 0 : -dy;
      this.input.setHeld('sprint', k > 0.97 && -dy > 0.75);   // Joystick ganz nach vorn = Sprint
    });
    const end = e => { if (e.pointerId !== id) return; id = null; base.style.display = 'none'; this.input.touchMove.x = this.input.touchMove.y = 0; this.input.setHeld('sprint', false); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  _look() {
    const zone = $('lookZone'); let id = null, lx = 0, ly = 0;
    zone.addEventListener('pointerdown', e => { if (this.editing || id !== null) return; id = e.pointerId; zone.setPointerCapture(id); lx = e.clientX; ly = e.clientY; });
    zone.addEventListener('pointermove', e => { if (e.pointerId !== id) return; this.input.lookX += (e.clientX - lx) * 1.5; this.input.lookY += (e.clientY - ly) * 1.5; lx = e.clientX; ly = e.clientY; });
    const end = e => { if (e.pointerId === id) id = null; }; zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  _buttons() {
    const hold = new Set(['fire', 'ads', 'sprint']), toggle = new Set(['crouch']);
    for (const b of this.root.querySelectorAll('.tb[data-act]')) {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); if (this.editing) return; b.setPointerCapture(e.pointerId); b.classList.add('down');
        if (hold.has(act)) this.input.setHeld(act, true);
        else if (toggle.has(act)) this.input.setHeld(act, !this.input.held(act));
        else { this.input.press(act); if (act === 'jump') this.input.setHeld('jump', true); }
      });
      const up = () => { b.classList.remove('down'); if (hold.has(act)) this.input.setHeld(act, false); if (act === 'jump') this.input.setHeld('jump', false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    $('tbPause').addEventListener('pointerdown', e => { e.preventDefault(); if (!this.editing) this.hooks.onPause?.(); });
  }

  // ---- Layout-Editor ----
  _loadPositions() {
    let pos = {}; try { pos = JSON.parse(localStorage.getItem(POS_KEY)) || {}; } catch { /* */ }
    for (const [id, p] of Object.entries(pos)) this._place($(id), p[0], p[1]);
  }
  _place(el, xp, yp) { if (!el) return; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.left = xp + '%'; el.style.top = yp + '%'; }
  startEdit(onDone) {
    this.editing = true; this.show(true); this.root.style.setProperty('--topa', 1);
    const done = document.createElement('button'); done.textContent = 'Fertig'; done.className = 'primary';
    done.style.cssText = 'position:absolute;left:50%;top:40%;transform:translateX(-50%);z-index:5;width:auto'; this.root.appendChild(done);
    const hint = document.createElement('div'); hint.textContent = 'Buttons ziehen, um sie zu verschieben'; hint.style.cssText = 'position:absolute;left:50%;top:30%;transform:translateX(-50%);font-weight:700;text-shadow:0 1px 3px #000'; this.root.appendChild(hint);
    const handlers = [];
    for (const b of this.root.querySelectorAll('.tb')) {
      b.style.outline = '2px dashed var(--acc)';
      const down = e => {
        e.preventDefault(); b.setPointerCapture(e.pointerId);
        const move = ev => { const xp = Math.max(0, Math.min(94, (ev.clientX - b.offsetWidth / 2) / innerWidth * 100)), yp = Math.max(0, Math.min(90, (ev.clientY - b.offsetHeight / 2) / innerHeight * 100)); this._place(b, xp.toFixed(1), yp.toFixed(1)); };
        const up = () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); this._savePositions(); };
        b.addEventListener('pointermove', move); b.addEventListener('pointerup', up);
      };
      b.addEventListener('pointerdown', down); handlers.push([b, down]);
    }
    done.addEventListener('click', () => {
      this.editing = false; done.remove(); hint.remove(); this.applySettings();
      handlers.forEach(([b, h]) => { b.removeEventListener('pointerdown', h); b.style.outline = ''; });
      this.show(false); onDone?.();
    });
  }
  _savePositions() {
    const pos = {}; for (const b of this.root.querySelectorAll('.tb')) if (b.style.left) pos[b.id] = [parseFloat(b.style.left), parseFloat(b.style.top)];
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* */ }
  }
  resetPositions() { try { localStorage.removeItem(POS_KEY); } catch { /* */ } for (const b of this.root.querySelectorAll('.tb')) { b.style.left = b.style.top = b.style.right = b.style.bottom = ''; } }
}
