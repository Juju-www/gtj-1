// Andere Spieler (und Trainingsziele): Low-Poly-Soldaten, Snapshot-Interpolation (100 ms Puffer).
import * as THREE from 'three';
import { PLAYER } from '../../shared/constants.js';

const INTERP_MS = 100;
const geoBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GEO = { leg: geoBox(0.16, 0.8, 0.2), torso: geoBox(0.46, 0.6, 0.26), head: geoBox(0.22, 0.24, 0.22), arm: geoBox(0.12, 0.5, 0.12), gun: geoBox(0.07, 0.1, 0.7) };

function nameSprite(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48; const g = c.getContext('2d');
  g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(text, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(1.6, 0.3, 1); s.renderOrder = 5; return s;
}

class RemotePlayer {
  constructor(id, scene) {
    this.id = id; this.samples = []; this.team = -1; this.name = ''; this.alive = true; this.lastFire = -99; this.flags = {};
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.mats = { cloth: new THREE.MeshStandardMaterial({ color: 0x5a6a50, roughness: 0.9 }), dark: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.7 }), skin: new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.8 }) };
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; this.body.add(m); return m; };
    add(GEO.leg, this.mats.dark, -0.12, 0.4, 0); add(GEO.leg, this.mats.dark, 0.12, 0.4, 0);
    this.torso = add(GEO.torso, this.mats.cloth, 0, 1.1, 0);
    add(GEO.head, this.mats.skin, 0, 1.55, 0);
    add(GEO.arm, this.mats.cloth, -0.29, 1.1, -0.12).rotation.x = -0.9; add(GEO.arm, this.mats.cloth, 0.29, 1.1, -0.12).rotation.x = -0.9;
    this.gun = add(GEO.gun, this.mats.dark, 0.1, 1.15, -0.45);
    this.flash = new THREE.PointLight(0xffaa55, 0, 6); this.flash.position.set(0.1, 1.15, -0.85); this.body.add(this.flash);
    this.tag = null; scene.add(this.root); this.scene = scene;
  }
  setTeamColor(isFriend, ffa) {
    this.mats.cloth.color.set(ffa ? 0x7a4a3a : isFriend ? 0x3f6aa8 : 0xa84a3f);
  }
  setName(name, show) {
    if (this.name !== name || (!!this.tag !== show)) {
      if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag = null; }
      if (show) { this.tag = nameSprite(name); this.tag.position.y = 2.1; this.root.add(this.tag); }
      this.name = name;
    }
  }
  dispose() { this.scene.remove(this.root); }
}

export class Remotes {
  constructor(scene, effects, audio) {
    this.scene = scene; this.effects = effects; this.audio = audio; this.map = new Map();
    this.offset = 0; this.haveOffset = false; this.roster = new Map(); this.myId = null; this.myTeam = -1; this.ffa = false;
  }
  setSelf(id, team, ffa) { this.myId = id; this.myTeam = team; this.ffa = ffa; }
  clear() { this.map.forEach(r => r.dispose()); this.map.clear(); this.haveOffset = false; }

  _get(id) { let r = this.map.get(id); if (!r) { r = new RemotePlayer(id, this.scene); this.map.set(id, r); } return r; }

  onRoster(list) {
    this.roster = new Map(list.map(p => [p.id, p]));
    for (const [id, r] of this.map) {
      const info = this.roster.get(id);
      if (!info || !info.deployed) { r.dispose(); this.map.delete(id); continue; }
      r.team = info.team; r.setTeamColor(!this.ffa && info.team === this.myTeam, this.ffa);
      r.setName(info.name, !this.ffa && info.team === this.myTeam);
    }
  }

  onSnapshot(s) {
    const off = Date.now() - s.t;
    this.offset = this.haveOffset ? this.offset * 0.9 + off * 0.1 : off; this.haveOffset = true;
    const seen = new Set();
    for (const p of s.p) {
      if (p.id === this.myId) continue;
      seen.add(p.id);
      const r = this._get(p.id);
      if (!r.name) { const info = this.roster.get(p.id); if (info) { r.team = info.team; r.setTeamColor(!this.ffa && info.team === this.myTeam, this.ffa); r.setName(info.name, !this.ffa && info.team === this.myTeam); } }
      r.samples.push({ t: s.t, ...p });
      if (r.samples.length > 20) r.samples.shift();
    }
    for (const [id, r] of this.map) if (!seen.has(id) && !r.isDummy) { r.dispose(); this.map.delete(id); }
  }

  onFire(f) {
    const r = this.map.get(f.id); if (!r) return;
    r.lastFire = performance.now() / 1000;
    const o = new THREE.Vector3(f.ox, f.oy, f.oz), d = new THREE.Vector3(f.dx, f.dy, f.dz);
    const start = o.clone().addScaledVector(d, 0.8), end = o.clone().addScaledVector(d, f.t);
    this.effects.tracer(start, end); this.effects.remoteFlash(start);
    r.flash.intensity = 4; setTimeout(() => { r.flash.intensity = 0; }, 50);
    const lp = this.audio.ctx?.listener; let dist = 30;
    if (lp?.positionX) dist = Math.hypot(lp.positionX.value - f.ox, lp.positionZ.value - f.oz);
    this.audio.shot({ x: f.ox, y: f.oy, z: f.oz }, dist);
  }

  /** Statisches Ziel (Training) */
  setDummy(id, x, y, z, yaw, alive, team = 1) {
    const r = this._get(id); r.isDummy = true; r.team = team; r.setTeamColor(false, false); r.alive = !!alive;
    r.root.position.set(x, y, z); r.root.rotation.y = yaw; r.root.visible = true; r.body.rotation.x = alive ? 0 : -Math.PI / 2; r.body.position.y = alive ? 0 : 0.2;
  }

  update(dt) {
    const rt = Date.now() - this.offset - INTERP_MS;
    for (const r of this.map.values()) {
      if (r.isDummy) continue;
      const s = r.samples; if (!s.length) continue;
      while (s.length > 2 && s[1].t <= rt) s.shift();
      let a = s[0], b = s[1] || s[0];
      const k = b.t > a.t ? Math.max(0, Math.min(1.2, (rt - a.t) / (b.t - a.t))) : 1;
      const lerp = (x, y) => x + (y - x) * k;
      let dyaw = b.yaw - a.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      r.root.position.set(lerp(a.x, b.x), lerp(a.y, b.y), lerp(a.z, b.z));
      r.root.rotation.y = a.yaw + dyaw * k;
      r.alive = !!b.alive; r.root.visible = true;
      r.body.rotation.x = r.alive ? 0 : -Math.PI / 2; r.body.position.y = r.alive ? 0 : 0.2;
      const crouch = !!b.c; r.body.scale.y = crouch ? PLAYER.crouchHeight / PLAYER.height : 1;
      r.gun.rotation.x = -(b.pitch || 0) * 0.8;
    }
  }

  /** Positionen für Minimap: [{x,z,friend,recentFire}] */
  minimapList() {
    const now = performance.now() / 1000, out = [];
    for (const r of this.map.values()) {
      if (!r.alive) continue;
      const friend = !this.ffa && r.team === this.myTeam;
      const spotted = now - r.lastFire < 2.5;
      if (friend || spotted) out.push({ x: r.root.position.x, z: r.root.position.z, friend });
    }
    return out;
  }
  firstEnemyHit(ox, oy, oz, dx, dy, dz, maxT) {   // nur Training: Treffer gegen Dummies
    let best = null;
    for (const r of this.map.values()) {
      if (!r.isDummy || !r.alive) continue;
      const p = r.root.position;
      const head = rs(ox, oy, oz, dx, dy, dz, p.x, p.y + 1.62, p.z, 0.2);
      if (head !== null && head < maxT && (!best || head < best.t)) best = { r, t: head, head: true };
      const body = rs(ox, oy, oz, dx, dy, dz, p.x, p.y + 1.0, p.z, 0.42);
      if (body !== null && body < maxT && (!best || body < best.t)) best = { r, t: body, head: false };
    }
    return best;
  }
}

function rs(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz, tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null; const d2 = lx * lx + ly * ly + lz * lz - tca * tca; if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}
