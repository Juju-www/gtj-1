// Waffenlogik (Client): Munition, Schussmodi, Streuung, Rückstoß, Nachladen (synchron zur Animation), Waffenwechsel.
// Die Animationen kommen aus der Original-FBX (viewmodel.js); der Server prüft Munition/Feuerrate/Treffer erneut.
import * as THREE from 'three';
import { WEAPONS } from '../../../shared/constants.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class WeaponSystem {
  constructor({ vm, input, audio, camera, player, hud, onShot, onReload }) {
    Object.assign(this, { vm, input, audio, camera, player, hud, onShot, onReload });
    this.slots = [WEAPONS.m4, null]; this.slot = 0; this.w = this.slots[0];
    this.mag = this.w.mag; this.reserve = this.w.reserve;
    this.fireMode = 'auto'; this.ads = 0; this.reloading = false; this.reloadEnd = 0; this.reloadTotal = 1;
    this.switching = false; this.lastShot = -10; this.bloom = 0; this.burstLeft = 0; this.latch = false; this.emptyClicked = false;
    this.time = 0; this.infiniteReserve = false; this.spreadNow = this.w.spreadHip;
  }

  get wantsFire() { return this.input.held('fire'); }
  get reloadProgress() { return this.reloading ? clamp(1 - (this.reloadEnd - this.time) / this.reloadTotal, 0, 1) : 0; }

  resetAmmo() { this.mag = this.w.mag; this.reserve = this.w.reserve; this.reloading = false; this.burstLeft = 0; this.bloom = 0; }
  deploy() {
    this.resetAmmo(); this.switching = true;
    const d = this.vm.playOnce('draw', { onDone: () => { this.switching = false; } });
    if (!d) this.switching = false;
    this.audio.switchWeapon();
  }
  setAmmo(mag, reserve) { this.mag = mag; this.reserve = reserve; }

  switchTo(i) {
    if (i === this.slot || this.reloading || this.switching) return;
    if (!this.slots[i]) { this.hud.banner('Sekundärwaffe: Slot leer', 1200); return; }
    this.switching = true; this.slot = i; this.w = this.slots[i];
    this.vm.playOnce('holster', { onDone: () => this.vm.playOnce('draw', { onDone: () => { this.switching = false; } }) });
    this.audio.switchWeapon();
  }

  startReload() {
    const w = this.w;
    if (this.reloading || this.switching || this.mag >= w.mag || (this.reserve <= 0 && !this.infiniteReserve)) return;
    const empty = this.mag === 0, t = empty ? w.reloadEmptyTime : w.reloadTime, name = empty ? 'reload_empty' : 'reload';
    this.vm.playOnce(name, { scale: (this.vm.clipDuration(name) || t) / t });   // Animation auf Nachladezeit skaliert
    this.reloading = true; this.reloadTotal = t; this.reloadEnd = this.time + t; this.burstLeft = 0;
    this.audio.reload(t, empty); this.onReload?.();
  }
  _finishReload() {
    const w = this.w, need = w.mag - this.mag, take = this.infiniteReserve ? need : Math.min(need, this.reserve);
    this.mag += take; if (!this.infiniteReserve) this.reserve -= take;
    this.reloading = false; this.emptyClicked = false;
  }

  _shoot(ctx) {
    const w = this.w;
    this.lastShot = this.time; this.mag--;
    const moving = ctx.speed > 0.6;
    let spread = w.spreadHip + (w.spreadAds - w.spreadHip) * this.ads + (moving ? w.spreadMove * (1 - this.ads * 0.7) : 0) + this.bloom;
    spread = Math.min(spread, w.spreadMax + w.spreadHip);
    this.spreadNow = spread;
    this.bloom = Math.min(w.spreadMax, this.bloom + w.spreadPerShot);
    const ang = Math.sqrt(Math.random()) * spread * Math.PI / 180, rot = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(ang) * Math.cos(rot), Math.sin(ang) * Math.sin(rot), -Math.cos(ang)).applyQuaternion(this.camera.quaternion).normalize();
    this.player.addRecoil(w.recoilPitch * (1 - 0.3 * this.ads), w.recoilYaw);
    const interval = 60 / w.rpm;
    this.vm.playOnce('fire', { scale: clamp((this.vm.clipDuration('fire') || 0.8) / (interval * 1.6), 1, 6), fade: 0.01 });
    this.vm.fireFlash(); this.vm.kick(this.ads);
    this.audio.shot();
    this.onShot?.(dir);
  }

  update(dt, ctx) {   // ctx: {active, alive, sprinting, speed}
    this.time += dt;
    const w = this.w, live = ctx.active && ctx.alive;
    const wantAds = live && this.input.held('ads') && !ctx.sprinting && !this.reloading && !this.switching;
    const rate = dt / w.adsTime; this.ads = clamp(this.ads + clamp((wantAds ? 1 : 0) - this.ads, -rate, rate), 0, 1);
    this.bloom = Math.max(0, this.bloom - dt * 2.2);
    if (!live) { this.burstLeft = 0; return; }

    if (this.input.pressed('reload')) this.startReload();
    if (this.input.pressed('fireMode')) {
      const m = w.fireModes, i = (m.indexOf(this.fireMode) + 1) % m.length; this.fireMode = m[i];
      this.hud.banner('Schussmodus: ' + ({ auto: 'Dauerfeuer', burst: 'Feuerstoß', semi: 'Einzelschuss' })[this.fireMode], 1000); this.audio.ui();
    }
    if (this.input.pressed('slot1')) this.switchTo(0);
    if (this.input.pressed('slot2')) this.switchTo(1);
    if (this.reloading && this.time >= this.reloadEnd) this._finishReload();

    const fire = this.input.held('fire');
    if (!fire) { this.latch = false; this.emptyClicked = false; }
    const busy = this.reloading || this.switching || ctx.sprinting;
    if (busy) { if (!this.reloading) this.burstLeft = 0; return; }

    const interval = 60 / w.rpm, ready = this.time - this.lastShot >= interval;
    let want = false;
    if (this.burstLeft > 0) want = true;
    else if (fire) {
      if (this.fireMode === 'auto') want = true;
      else if (!this.latch) { want = true; this.latch = true; if (this.fireMode === 'burst') this.burstLeft = w.burstCount; }
    }
    if (!want || !ready) return;
    if (this.mag <= 0) {
      if (!this.emptyClicked) { this.audio.empty(); this.emptyClicked = true; }
      this.burstLeft = 0; this.startReload(); return;
    }
    this._shoot(ctx);
    if (this.burstLeft > 0) this.burstLeft--;
  }
}
