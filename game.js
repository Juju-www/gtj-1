// Orchestrierung: Renderer, Hauptschleife, Spielzustand (Menü/Online/Training), Netzwerk-Ereignisse, Treffer-Logik.
import * as THREE from 'three';
import { PLAYER, WEAPONS, MODES } from '../../../shared/constants.js';
import { raycastWorld } from '../../../shared/math.js';
import { S, QUALITY, onSettingsChange } from '../settings/settings.js';
import { Input } from './input.js';
import { AudioSystem } from '../audio/audio.js';
import { World } from '../world/world.js';
import { Effects } from '../weapons/effects.js';
import { ViewModel } from '../weapons/viewmodel.js';
import { WeaponSystem } from '../weapons/weapons.js';
import { PlayerController } from '../player/player.js';
import { Remotes } from '../multiplayer/remotes.js';
import { Net } from '../multiplayer/net.js';
import { HUD } from '../ui/hud.js';
import { Touch, isTouchDevice } from '../ui/touch.js';

const DUMMY_SPOTS = [[-40, -1], [-30, 5], [-22, 2], [-12, 8], [-52, -14], [-26, 14]];

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas; this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
    this.camera = new THREE.PerspectiveCamera(S.fov, 1, 0.05, 600);
    this.audio = new AudioSystem(); this.input = new Input();
    this.isTouch = isTouchDevice();
    this.mode = 'menu'; this.deployed = false; this.alive = false; this.paused = false;
    this.hp = PLAYER.maxHealth; this.myId = null; this.myTeam = -1; this.roster = null; this.phase = null; this.modeId = 'tdm';
    this.dynScale = 1; this.frameEma = 16; this.dynTimer = 0; this.lastT = 0; this.stateTimer = 0; this.mmTimer = 0; this.shotCount = 0;
    this.dummies = []; this.deathUntil = 0; this.resultsShown = false;
  }

  async init(progress) {
    progress(0.05, 'Welt wird aufgebaut …');
    this.world = new World(this.renderer);
    this.effects = new Effects(this.world.scene);
    progress(0.2, 'Waffe wird geladen (M4 + Hände + Animationen) …');
    this.vm = new ViewModel(this.world.envMap);
    await this.vm.load(p => progress(0.2 + p * 0.7, 'Waffe wird geladen …'));
    progress(0.95, 'Systeme werden gestartet …');
    this.player = new PlayerController(this.camera, this.input, this.world.solid, this.audio);
    this.hud = new HUD(this.world);
    this.weapon = new WeaponSystem({
      vm: this.vm, input: this.input, audio: this.audio, camera: this.camera, player: this.player, hud: this.hud,
      onShot: dir => this.onShot(dir), onReload: () => this.net.reload(),
    });
    this.remotes = new Remotes(this.world.scene, this.effects, this.audio);
    this.audio.onSubtitle = t => this.hud.subtitle(t);
    this.touch = new Touch(this.input, { onPause: () => this.pause() });
    this.net = new Net(this._netHandlers());
    this.world.scene.add(this.camera);
    addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.deployed && !this.paused) this.pause(); });
    onSettingsChange(() => this.applySettings());
    this.applySettings(); this.resize();
    this.vm.visible = false;
    requestAnimationFrame(t => { this.lastT = t; this.loop(t); });
    progress(1, 'Bereit');
  }

  applySettings() {
    this.world.applyQuality(); this.hud.applyCrosshairStyle(); this.touch.applySettings(); this.resize();
    this.camera.fov = S.fov; this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = innerWidth, h = innerHeight, q = QUALITY[S.quality] || QUALITY.high;
    const pr = Math.min(devicePixelRatio || 1, q.maxDpr) * S.renderScale * this.dynScale;
    this.renderer.setPixelRatio(Math.max(0.35, pr)); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.vm?.resize(w / h);
    document.getElementById('rotate').classList.toggle('hidden', !(this.isTouch && h > w && this.deployed));
  }

  // ---------------- Spielfluss ----------------
  async joinOnline(name, modeId) {
    this.audio.init();
    if (!this.net.available || !this.net.connect()) return { ok: false, error: 'Socket.IO nicht verfügbar – Server gestartet? (npm start)' };
    if (!(await this.net.waitConnected())) return { ok: false, error: 'Server nicht erreichbar.' };
    const r = await this.net.join(name, modeId);
    if (!r?.ok) return { ok: false, error: 'Beitritt abgelehnt.' };
    this.mode = 'online'; this.myId = r.id; this.myTeam = r.team; this.modeId = r.mode; this.phase = r.phase;
    this.remotes.setSelf(this.myId, this.myTeam, r.mode === 'ffa');
    return { ok: true, result: r };
  }

  startTraining() {
    this.audio.init(); this.mode = 'training'; this.modeId = 'training';
    this.remotes.clear(); this.remotes.setSelf('me', 0, false);
    this.dummies = DUMMY_SPOTS.map(([x, z], i) => ({ id: 'dummy' + i, x, z, hp: 100, alive: true, respawnAt: 0, yaw: Math.PI / 2 }));
    this.dummies.forEach(d => this.remotes.setDummy(d.id, d.x, 0, d.z, d.yaw, true));
    this.weapon.infiniteReserve = true; this.deploy();
  }

  deploy() {
    this.audio.init(); this.deployed = true; this.paused = false; this.resultsShown = false;
    this.input.enabled = true; this.ui.onDeploy();
    if (!this.isTouch) this.canvas.requestPointerLock?.();
    this.touch.show(this.isTouch); this.hud.show(true); this.hud.applyCrosshairStyle();
    if (this.mode === 'training') { this.spawnLocal(); this.hud.banner('Training – Ziele treffen', 3000); }
    else { this.net.deploy(); this.alive = false; this.updateDeathText(); }
    this.resize();
  }
  spawnLocal() {
    this.player.teleport(-62, 0, 0, -Math.PI / 2); this.hp = PLAYER.maxHealth; this.alive = true; this.vm.visible = true;
    this.weapon.deploy(); this.hud.death(null);
  }

  pause() {
    if (!this.deployed || this.paused) return; this.paused = true; this.input.releaseAll(); this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock(); this.touch.show(false); this.ui.showPause();
  }
  resume() {
    this.paused = false; this.input.enabled = true; this.ui.hidePause();
    if (!this.isTouch) this.canvas.requestPointerLock?.(); this.touch.show(this.isTouch);
  }
  onLockChange() {
    if (this.isTouch || !this.deployed) return;
    if (!document.pointerLockElement && !this.paused && !this.resultsShown) this.pause();
  }
  quit() {
    this.net.leave(); this.remotes.clear(); this.deployed = false; this.paused = false; this.alive = false; this.mode = 'menu';
    this.vm.visible = false; this.weapon.infiniteReserve = false; this.input.enabled = false; this.input.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.touch.show(false); this.hud.show(false); this.hud.death(null); this.hud.showScoreboard(false); this.resize();
  }

  updateDeathText() {
    if (this.mode !== 'online') return;
    if (this.phase?.phase === 'warmup') this.hud.death('MATCH STARTET GLEICH …');
    else if (this.phase?.phase === 'ended') this.hud.death('MATCH BEENDET');
    else if (this.deathUntil > Date.now()) this.hud.death(`${this.killedBy ? 'ELIMINIERT VON ' + this.killedBy.toUpperCase() : 'ELIMINIERT'}\nRESPAWN IN ${Math.ceil((this.deathUntil - Date.now()) / 1000)}`);
    else this.hud.death('EINSATZ WIRD VORBEREITET …');
  }

  // ---------------- Netzwerk ----------------
  _netHandlers() {
    const g = this;
    return {
      onStatus: s => { if (s === 'reconnecting') g.hud.banner('Verbindung unterbrochen – versuche Wiederverbindung …', 4000); },
      onReconnected: r => { if (r?.ok) { g.myId = r.id; g.remotes.setSelf(r.id, r.team, g.modeId === 'ffa'); g.alive = false; g.pause(); g.ui.showReconnect(); } },
      on_snap: s => g.remotes.onSnapshot(s),
      on_roster: r => {
        g.roster = r; g.remotes.onRoster(r.players);
        g.hud.onRoster(r, g.myId, MODES[r.mode]?.name || r.mode); g.ui.onRoster(r, g.myId);
        const me = r.players.find(p => p.id === g.myId); if (me && me.team !== g.myTeam) { g.myTeam = me.team; g.remotes.setSelf(g.myId, g.myTeam, r.mode === 'ffa'); }
      },
      on_phase: p => {
        g.phase = p; g.updateDeathText();
        if (p.phase === 'ended') { g.resultsShown = true; g.pause(); g.ui.showResults(g.roster, p.result); }
        else if (g.resultsShown) { g.resultsShown = false; g.ui.hideResults(); if (g.deployed) g.ui.showPause(); }
        if (p.phase === 'running') g.hud.banner('LOS!', 1500);
      },
      on_fire: f => g.remotes.onFire(f),
      on_hit: h => { g.hud.hitmarker(h.kill, h.head); if (S.hitFeedback) { h.kill ? g.audio.kill() : g.audio.hitmarker(h.head); } },
      on_damaged: d => {
        g.hp = d.hp; g.audio.hurt();
        const px = g.player.st, yaw = g.player.yaw, vx = d.fx - px.x, vz = d.fz - px.z;
        const fwd = vx * -Math.sin(yaw) + vz * -Math.cos(yaw), right = vx * Math.cos(yaw) + vz * -Math.sin(yaw);
        g.hud.damageFlash(Math.atan2(right, fwd));   // 0 = Angreifer vor mir, positiv = rechts
      },
      on_kill: k => g.hud.killfeed(k.killerName, k.victimName, k.head, k.killer === g.myId),
      on_dead: d => { g.alive = false; g.hp = 0; g.killedBy = d.by; g.deathUntil = Date.now() + d.respawn * 1000; g.vm.visible = false; g.updateDeathText(); },
      on_respawn: r => {
        g.player.teleport(r.x, r.y, r.z, r.yaw); g.player.alive = true; g.hp = r.hp; g.alive = true; g.vm.visible = true;
        g.weapon.deploy(); g.weapon.setAmmo(r.mag, r.reserve); g.hud.death(null);
      },
      on_ammo: a => g.weapon.setAmmo(a.mag, a.reserve),
      on_correct: c => { g.player.st.x = c.x; g.player.st.y = c.y; g.player.st.z = c.z; g.player.st.vx = g.player.st.vz = 0; },
    };
  }

  // ---------------- Schießen ----------------
  onShot(dir) {
    const cam = this.camera, o = cam.position, w = WEAPONS.m4;
    const wall = raycastWorld(this.world.solid, o.x, o.y, o.z, dir.x, dir.y, dir.z, w.maxRange);
    let maxT = wall ? wall.t : w.maxRange, hitDummy = null;
    if (this.mode === 'training') {
      const h = this.remotes.firstEnemyHit(o.x, o.y, o.z, dir.x, dir.y, dir.z, maxT);
      if (h) { hitDummy = h; maxT = h.t; }
    } else this.net.shoot(dir);

    const end = o.clone().addScaledVector(dir, Math.min(maxT, 120));
    const muzzle = this.vm.muzzleWorld(cam, this.weapon.ads);
    if (end.distanceTo(muzzle) > 3) this.effects.tracer(muzzle, end);
    if (this.shotCount++ % 3 === 0) this.effects.smokePuff(muzzle, dir);

    if (hitDummy) {
      const d = this.dummies.find(x => x.id === hitDummy.r.id), dmg = w.damage * (hitDummy.head ? w.headshotMult : 1);
      d.hp -= dmg; this.effects.bloodHit(o.clone().addScaledVector(dir, hitDummy.t));
      const kill = d.hp <= 0; this.hud.hitmarker(kill, hitDummy.head);
      if (S.hitFeedback) kill ? this.audio.kill() : this.audio.hitmarker(hitDummy.head);
      if (kill) { d.alive = false; d.respawnAt = performance.now() + 2500; this.remotes.setDummy(d.id, d.x, 0, d.z, d.yaw, false); }
    } else if (wall) {
      this.effects.impact(o.clone().addScaledVector(dir, wall.t), new THREE.Vector3(wall.nx, wall.ny, wall.nz));
    }
  }

  // ---------------- Hauptschleife ----------------
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt));
    if (S.fpsLimit > 0 && t - this.lastT < 1000 / S.fpsLimit - 1) return;
    const dt = Math.min(0.05, (t - this.lastT) / 1000); this.lastT = t;
    this.frameEma = this.frameEma * 0.95 + dt * 1000 * 0.05;
    this.dynamicResolution(dt);

    const active = this.deployed && !this.paused && (this.isTouch || !!document.pointerLockElement);
    this.input.enabled = active;
    this.input.pollGamepad(dt);
    this.player.alive = this.alive;

    const w = this.weapon, p = this.player;
    p.update(dt, { active, ads: w.ads, adsFov: w.w.adsFov, blockSprint: w.wantsFire && !w.reloading || w.ads > 0.3 });
    w.update(dt, { active, alive: this.alive, sprinting: p.sprinting, speed: p.speed });
    if (active && this.input.pressed('scoreboard')) this.hud.showScoreboard(true);
    if (!this.input.held('scoreboard') && !this.hud.el.scoreboard.classList.contains('hidden') && !this.resultsShown) this.hud.showScoreboard(false);

    this.vm.update(dt, { speed: p.speed, onGround: p.st.onGround, sprint: p.sprinting ? 1 : 0, ads: w.ads, crouch: p.st.crouch, lookX: p.lastLook.x, lookY: p.lastLook.y, land: p.land });
    this.world.update(this.camera.position);
    this.remotes.update(dt); this.effects.update(dt);
    this.audio.setListener(this.camera.position, p.yaw);

    if (this.mode === 'online' && this.deployed && this.alive) {   // 20 Hz Zustands-Upload
      this.stateTimer += dt; if (this.stateTimer >= 0.05) { this.stateTimer = 0; this.net.sendState(p.netState(w.ads)); }
    }
    if (this.mode === 'training') {
      const now = performance.now();
      for (const d of this.dummies) if (!d.alive && now >= d.respawnAt) { d.alive = true; d.hp = 100; this.remotes.setDummy(d.id, d.x, 0, d.z, d.yaw, true); }
    }
    if (!this.alive && this.mode === 'online') this.updateDeathText();

    if (this.deployed) {
      const moving = p.speed > 0.6, ws = w.w;
      const spread = ws.spreadHip + (ws.spreadAds - ws.spreadHip) * w.ads + (moving ? ws.spreadMove * (1 - w.ads * 0.7) : 0) + w.bloom;
      this.hud.update({
        dt, hp: this.hp, stamina: p.stamina, mag: w.mag, reserve: w.reserve, infinite: w.infiniteReserve, weaponName: ws.name, fireMode: w.fireMode,
        reloading: w.reloading, reloadProgress: w.reloadProgress, spread, fov: this.camera.fov, ads: w.ads, alive: this.alive,
        conn: this.mode === 'online' ? (this.net.status === 'connected' ? (S.showPing ? `PING ${this.net.rtt} ms` : '') : 'VERBINDUNG UNTERBROCHEN') : 'OFFLINE-TRAINING',
      });
      this.mmTimer += dt;
      if (this.mmTimer > 0.1) { this.mmTimer = 0; this.hud.drawMinimap(p.st.x, p.st.z, p.yaw, this.remotes.minimapList()); }
    }

    this.renderer.clear();
    this.renderer.render(this.world.scene, this.camera);
    if (this.vm.loaded && this.vm.visible) { this.renderer.clearDepth(); this.renderer.render(this.vm.scene, this.vm.camera); }
    this.input.endFrame();
  }

  /** Dynamische Renderauflösung: bei dauerhaft niedriger Framerate Auflösung senken, bei Reserve wieder erhöhen. */
  dynamicResolution(dt) {
    if (!S.dynRes || !this.deployed) return;
    this.dynTimer += dt; if (this.dynTimer < 2) return; this.dynTimer = 0;
    const target = S.fpsLimit > 0 ? 1000 / S.fpsLimit : 16.7;
    let s = this.dynScale;
    if (this.frameEma > target * 1.35 && s > 0.55) s = Math.max(0.55, s - 0.1);
    else if (this.frameEma < target * 0.8 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.dynScale) { this.dynScale = s; this.resize(); }
  }
}
