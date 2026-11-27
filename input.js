// Vereinheitlichte Eingabe: Tastatur, Maus (Pointer Lock), Touch (über press/setHeld) und Gamepad.
import { S } from '../settings/settings.js';

export class Input {
  constructor() {
    this.codes = new Set();      // gedrückte Tasten-Codes
    this.heldA = new Set();      // gehaltene Aktionen
    this.pressedA = new Set();   // Aktionen mit Flanke seit letztem endFrame()
    this.lookX = 0; this.lookY = 0;
    this.enabled = false;        // nur wenn Spiel aktiv
    this.touchMove = { x: 0, y: 0 };
    this.padPrev = {};
    this.rebinding = null;       // Callback beim Tasten-Umbelegen

    addEventListener('keydown', e => this.onKey(e, true));
    addEventListener('keyup', e => this.onKey(e, false));
    addEventListener('mousemove', e => {
      if (this.enabled && document.pointerLockElement) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    addEventListener('mousedown', e => {
      if (!this.enabled || !document.pointerLockElement) return;
      if (e.button === 0) this.setHeld('fire', true); else if (e.button === 2) this.setHeld('ads', true);
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.setHeld('fire', false); else if (e.button === 2) this.setHeld('ads', false);
    });
    addEventListener('contextmenu', e => { if (this.enabled) e.preventDefault(); });
    addEventListener('blur', () => this.releaseAll());
  }

  onKey(e, down) {
    if (down && this.rebinding) { e.preventDefault(); const cb = this.rebinding; this.rebinding = null; cb(e.code); return; }
    if (!this.enabled) return;
    if (down && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this.codes.add(e.code);
      for (const [a, list] of Object.entries(S.keys)) if (list.includes(e.code)) { this.heldA.add(a); this.pressedA.add(a); }
    } else {
      this.codes.delete(e.code);
      for (const [a, list] of Object.entries(S.keys)) if (list.includes(e.code) && !list.some(c => this.codes.has(c))) this.heldA.delete(a);
    }
  }

  releaseAll() { this.codes.clear(); this.heldA.clear(); this.pressedA.clear(); this.touchMove.x = this.touchMove.y = 0; }
  held(a) { return this.heldA.has(a); }
  pressed(a) { return this.pressedA.has(a); }
  setHeld(a, v) { if (v) { if (!this.heldA.has(a)) this.pressedA.add(a); this.heldA.add(a); } else this.heldA.delete(a); }
  press(a) { this.pressedA.add(a); }
  endFrame() { this.pressedA.clear(); }
  consumeLook() { const r = { x: this.lookX, y: this.lookY }; this.lookX = this.lookY = 0; return r; }

  /** Bewegungsachsen: x = rechts, z = vorwärts, Länge ≤ 1 */
  moveAxis() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let z = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
    x += this.touchMove.x; z += this.touchMove.y;
    x += this.padMove?.x || 0; z += this.padMove?.y || 0;
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    return { x, z };
  }

  /** Controller (Standard-Mapping): wird pro Frame abgefragt. */
  pollGamepad(dt) {
    if (!this.enabled) { this.padMove = null; return; }
    const pad = (navigator.getGamepads?.() || []).find(p => p && p.connected);
    if (!pad) { this.padMove = null; return; }
    const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
    this.padMove = { x: dz(pad.axes[0]), y: -dz(pad.axes[1]) };
    this.lookX += dz(pad.axes[2]) * 900 * dt; this.lookY += dz(pad.axes[3]) * 900 * dt;
    const b = i => !!pad.buttons[i]?.pressed;
    const map = { fire: b(7), ads: b(6), sprint: b(10) };
    for (const [a, v] of Object.entries(map)) if (v !== !!this.padPrev[a]) this.setHeld(a, v);
    const edges = { jump: b(0), reload: b(2), slot1: b(3) };
    const bc = b(1); if (bc && !this.padPrev.crouchBtn) { this.padCrouch = !this.padCrouch; this.setHeld('crouch', this.padCrouch); }
    for (const [a, v] of Object.entries(edges)) { if (v && !this.padPrev[a]) this.press(a); }
    this.padPrev = { ...map, ...edges, crouchBtn: bc };
  }
}
