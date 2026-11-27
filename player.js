// First-Person-Controller: Mouse-Look, Beschleunigung, Sprint mit Ausdauer, Springen, Ducken,
// Kollision (physics.js), Head-Bob, Landestoß, Lehnen beim Strafen, ADS-/Sprint-FOV, Kamera-Rückstoß.
import * as THREE from 'three';
import { PLAYER } from '../../../shared/constants.js';
import { movePlayer, canStand } from './physics.js';
import { S } from '../settings/settings.js';

const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const rad = d => d * Math.PI / 180;

export class PlayerController {
  constructor(camera, input, boxes, audio) {
    this.camera = camera; this.input = input; this.boxes = boxes; this.audio = audio;
    camera.rotation.order = 'YXZ';
    this.st = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, crouch: false };
    this.yaw = 0; this.pitch = 0; this.recoilP = 0; this.roll = 0;
    this.eye = PLAYER.eye; this.stamina = PLAYER.staminaMax; this.exhausted = false; this.regenDelay = 0;
    this.sprinting = false; this.speed = 0; this.bobT = 0; this.stepAcc = 0; this.landDip = 0; this.land = 0;
    this.alive = true; this.deadBlend = 0; this.lastLook = { x: 0, y: 0 };
    this.sprintFov = 0;
  }

  teleport(x, y, z, yaw = this.yaw) {
    Object.assign(this.st, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, crouch: false });
    this.yaw = yaw; this.pitch = 0; this.recoilP = 0; this.stamina = PLAYER.staminaMax; this.exhausted = false;
  }

  addRecoil(pitchDeg, yawDeg) {
    this.pitch = Math.min(1.5, this.pitch + rad(pitchDeg * 0.6)); this.recoilP += rad(pitchDeg * 0.4);
    this.yaw += rad((Math.random() - 0.5) * 2 * yawDeg);
  }

  /** ctx: {active, ads(0..1), adsFov, blockSprint} */
  update(dt, ctx) {
    const st = this.st, input = this.input, k = rad(0.115) * S.sens;
    let ax = { x: 0, z: 0 };
    this.lastLook = { x: 0, y: 0 };
    if (ctx.active && this.alive) {
      const l = input.consumeLook(), sens = k * (1 - ctx.ads * (1 - S.adsSens));
      this.lastLook = l;
      this.yaw -= l.x * sens; this.pitch -= l.y * sens * (S.invertY ? -1 : 1);
      this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
      ax = input.moveAxis();

      // Ducken
      const wantCrouch = input.held('crouch');
      if (wantCrouch && !st.crouch) st.crouch = true;
      else if (!wantCrouch && st.crouch) { st.crouch = false; if (!canStand(st, this.boxes)) st.crouch = true; }

      // Sprint + Ausdauer
      const can = ax.z > 0.3 && !st.crouch && !ctx.blockSprint && !this.exhausted;
      this.sprinting = input.held('sprint') && can;
      if (this.sprinting && st.onGround) { this.stamina -= PLAYER.staminaDrain * dt; this.regenDelay = 0.8; if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; this.sprinting = false; } }
      else { this.regenDelay -= dt; if (this.regenDelay <= 0) this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt); }
      if (this.exhausted && this.stamina >= PLAYER.staminaMinToSprint) this.exhausted = false;

      // Wunschgeschwindigkeit
      let speed = st.crouch ? PLAYER.crouch : this.sprinting ? PLAYER.sprint : PLAYER.walk;
      speed *= 1 - 0.35 * ctx.ads;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const tx = (-sy * ax.z + cy * ax.x) * speed, tz = (-cy * ax.z - sy * ax.x) * speed;
      if (st.onGround) {
        const rate = (ax.x || ax.z) ? 55 * dt : 40 * dt;
        st.vx = approach(st.vx, tx, rate); st.vz = approach(st.vz, tz, rate);
      } else {   // Luftkontrolle
        const f = Math.min(1, 2.2 * dt); st.vx += (tx - st.vx) * f; st.vz += (tz - st.vz) * f;
      }
      if ((input.pressed('jump') || input.held('jump')) && st.onGround && !st.crouch) {
        st.vy = PLAYER.jump; st.onGround = false; this.audio.jump();
      }
    } else { this.sprinting = false; st.vx = approach(st.vx, 0, 30 * dt); st.vz = approach(st.vz, 0, 30 * dt); }

    const wasGround = st.onGround, vyBefore = st.vy;
    movePlayer(st, dt, this.boxes);
    if (!wasGround && st.onGround && vyBefore < -3.5) { this.land = Math.min(1, -vyBefore / 12); this.landDip = this.land * 0.12; this.audio.land(-vyBefore); }
    this.speed = Math.hypot(st.vx, st.vz);

    // Schritte
    if (st.onGround && this.speed > 1 && ctx.active && this.alive) {
      this.stepAcc += this.speed * dt;
      const stride = this.sprinting ? 2.3 : st.crouch ? 2.8 : 1.9;
      if (this.stepAcc > stride) { this.stepAcc = 0; this.audio.step(this.sprinting); }
    }

    // ---- Kamera ----
    const fx = S.cameraEffects ? 1 : 0;
    this.eye += ((st.crouch ? PLAYER.crouchEye : PLAYER.eye) - this.eye) * Math.min(1, dt * 12);
    this.bobT += this.speed * dt * (this.sprinting ? 1.35 : 1.7);
    const bobAmp = (this.sprinting ? 0.045 : 0.022) * (1 - 0.85 * ctx.ads) * fx * (st.onGround ? 1 : 0.2);
    const bobY = this.speed > 0.4 ? Math.sin(this.bobT * 2) * bobAmp : 0;
    const bobX = this.speed > 0.4 ? Math.cos(this.bobT) * bobAmp * 0.6 : 0;
    this.landDip *= Math.exp(-9 * dt); this.land *= Math.exp(-6 * dt);
    this.recoilP *= Math.exp(-8 * dt);
    this.roll += ((-ax.x * 0.016 * fx) - this.roll) * Math.min(1, dt * 8);
    this.deadBlend += ((this.alive ? 0 : 1) - this.deadBlend) * Math.min(1, dt * 4);

    const cam = this.camera;
    cam.position.set(st.x + Math.cos(this.yaw) * bobX, st.y + this.eye + bobY - this.landDip - this.deadBlend * 1.2, st.z - Math.sin(this.yaw) * bobX);
    cam.rotation.set(this.pitch + this.recoilP, this.yaw, this.roll + this.deadBlend * 0.7, 'YXZ');

    this.sprintFov += ((this.sprinting ? 5 : 0) - this.sprintFov) * Math.min(1, dt * 6);
    const fov = (S.fov + this.sprintFov * fx) * (1 - ctx.ads) + ctx.adsFov * ctx.ads;
    if (Math.abs(cam.fov - fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  netState(ads) {
    const s = this.st;
    return { x: s.x, y: s.y, z: s.z, yaw: this.yaw, pitch: this.pitch, c: s.crouch ? 1 : 0, s: this.sprinting ? 1 : 0, a: ads > 0.5 ? 1 : 0 };
  }
}
