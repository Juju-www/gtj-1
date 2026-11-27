import { PLAYER, WEAPONS, MODES, TICK_RATE, MAX_PLAYERS_PER_MATCH, RECONNECT_GRACE_MS } from '../../../shared/constants.js';
import { buildMap, collisionBoxes } from '../../../shared/map.js';
import { rayAABB, raySphere, raycastWorld, boxOverlap } from '../../../shared/math.js';
import { createMode } from '../modes/index.js';

const MAP = buildMap();
const SOLID = collisionBoxes(MAP);
const WARMUP_MS = 5000, RESULT_MS = 12000;
const num = v => typeof v === 'number' && Number.isFinite(v);

export class Match {
  constructor(io, id, modeId) {
    this.io = io; this.id = id; this.room = 'match:' + id;
    this.modeDef = MODES[modeId]; this.mode = createMode(modeId, this);
    this.players = new Map();
    this.scores = { 0: 0, 1: 0 };
    this.phase = 'waiting'; this.phaseEndsAt = 0; this.timeEndsAt = 0; this.result = null;
    this.lastRoster = 0;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  get size() { return this.players.size; }
  get isFull() { return this.players.size >= MAX_PLAYERS_PER_MATCH; }
  get connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }

  addPlayer(p) {
    p.team = this.mode.assignTeam(p);
    this.players.set(p.id, p);
    if (this.phase === 'waiting') this.setPhase('warmup', WARMUP_MS);
    this.sendRoster(true);
  }
  removePlayer(p) { this.players.delete(p.id); this.sendRoster(true); }
  destroy() { clearInterval(this.timer); }

  setPhase(phase, durationMs = 0) {
    this.phase = phase; this.phaseEndsAt = durationMs ? Date.now() + durationMs : 0;
    if (phase === 'running') {
      this.timeEndsAt = this.modeDef.timeLimit ? Date.now() + this.modeDef.timeLimit * 1000 : 0;
      this.result = null; this.mode.onReset();
      for (const p of this.players.values()) { p.kills = p.deaths = p.score = 0; if (p.deployed) this.spawn(p); }
    }
    this.io.to(this.room).emit('phase', this.phaseInfo());
    this.sendRoster(true);
  }
  phaseInfo() {
    return { phase: this.phase, mode: this.modeDef.id, endsIn: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - Date.now()) : 0, result: this.result };
  }

  // ---------- Spawning ----------
  pickSpawn(p) {
    let cands = MAP.spawns.filter(s => this.modeDef.teams === 0 || s.team === p.team);
    if (!cands.length) cands = MAP.spawns;
    let best = cands[0], bestD = -1;
    for (const s of cands) {
      let md = Infinity;
      for (const q of this.players.values()) {
        if (q === p || !q.alive || (this.modeDef.teams && q.team === p.team)) continue;
        md = Math.min(md, Math.hypot(q.x - s.x, q.z - s.z));
      }
      const score = md === Infinity ? Math.random() * 100 : md + Math.random() * 5;
      if (score > bestD) { bestD = score; best = s; }
    }
    return best;
  }
  spawn(p) {
    const s = this.pickSpawn(p), w = WEAPONS[p.weapon];
    Object.assign(p, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: 0, crouch: false, hp: PLAYER.maxHealth, alive: true,
      mag: w.mag, reserve: w.reserve, reloadEnd: 0, respawnAt: 0, history: [], lastState: Date.now() });
    p.socket?.emit('respawn', { x: s.x, y: s.y, z: s.z, yaw: s.yaw, hp: p.hp, mag: p.mag, reserve: p.reserve });
  }
  deploy(p) {
    p.deployed = true;
    if (this.phase === 'running' || this.phase === 'warmup') this.spawn(p);
    else { p.alive = false; p.respawnAt = Date.now() + 1000; }
    this.sendRoster(true);
  }

  // ---------- Eingaben ----------
  onState(p, s) {
    if (!p.deployed || !p.alive || !s) return;
    if (![s.x, s.y, s.z, s.yaw, s.pitch].every(num)) return;
    const now = Date.now(), dt = Math.min(0.5, (now - p.lastState) / 1000); p.lastState = now;
    const crouch = !!s.c, h = crouch ? PLAYER.crouchHeight : PLAYER.height;
    const maxH = PLAYER.sprint * 1.4 * Math.max(dt, 0.05) + 0.6;
    let ok = Math.hypot(s.x - p.x, s.z - p.z) <= maxH && (s.y - p.y) <= 9 * Math.max(dt, 0.05) + 0.4;
    const b = MAP.bounds;
    ok = ok && s.x > b.x0 && s.x < b.x1 && s.z > b.z0 && s.z < b.z1 && s.y > -0.5 && s.y < 30;
    ok = ok && !SOLID.some(bx => boxOverlap(bx, s.x, s.y, s.z, PLAYER.radius - 0.02, h));
    if (!ok) { p.violations++; p.socket?.emit('correct', { x: p.x, y: p.y, z: p.z }); return; }
    p.x = s.x; p.y = s.y; p.z = s.z; p.yaw = s.yaw; p.pitch = Math.max(-1.6, Math.min(1.6, s.pitch));
    p.crouch = crouch; p.sprint = !!s.s; p.ads = !!s.a; p.reloading = p.reloadEnd > now;
    if (num(s.rtt)) p.rtt = Math.max(0, Math.min(500, s.rtt));
    p.history.push({ t: now, x: p.x, y: p.y, z: p.z, c: crouch });
    while (p.history.length && now - p.history[0].t > 1000) p.history.shift();
  }

  posAt(q, t) {
    const h = q.history;
    if (!h.length) return { x: q.x, y: q.y, z: q.z, c: q.crouch };
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= t) {
        const a = h[i - 1], b = h[i], k = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: b.c };
      }
    }
    return h[0];
  }

  onReload(p) {
    if (!p.alive || this.phase !== 'running') return;
    const w = WEAPONS[p.weapon], now = Date.now();
    if (p.reloadEnd > now || p.mag >= w.mag || p.reserve <= 0) return;
    p.reloadEnd = now + (p.mag === 0 ? w.reloadEmptyTime : w.reloadTime) * 1000;
    p.reloadDone = false;
  }

  onShoot(p, d) {
    if (!p.deployed || !p.alive || this.phase !== 'running' || !d) return;
    const w = WEAPONS[p.weapon], now = Date.now();
    if (p.reloadEnd > now || now - p.lastShot < 60000 / w.rpm * 0.8) return;
    if (p.mag <= 0) { p.socket?.emit('ammo', { mag: p.mag, reserve: p.reserve }); return; }
    let { dx, dy, dz } = d;
    if (![dx, dy, dz].every(num)) return;
    const len = Math.hypot(dx, dy, dz); if (len < 0.5) return;
    dx /= len; dy /= len; dz /= len;
    p.lastShot = now; p.mag--;
    const ox = p.x, oy = p.y + (p.crouch ? PLAYER.crouchEye : PLAYER.eye), oz = p.z;
    const wall = raycastWorld(SOLID, ox, oy, oz, dx, dy, dz, w.maxRange);
    const maxT = wall ? wall.t : w.maxRange;
    const rewindT = now - Math.min(300, p.rtt / 2) - 100;   // Lag-Kompensation + Interpolationsverzögerung der Clients
    let best = null;
    for (const q of this.players.values()) {
      if (q === p || !q.alive || !q.deployed || !this.mode.canDamage(p, q)) continue;
      const pos = this.posAt(q, rewindT), hh = pos.c ? PLAYER.crouchHeight : PLAYER.height, r = PLAYER.radius;
      const head = raySphere(ox, oy, oz, dx, dy, dz, pos.x, pos.y + hh - 0.18, pos.z, 0.2);
      if (head !== null && head <= maxT && (!best || head < best.t)) best = { q, t: head, head: true };
      const body = rayAABB(ox, oy, oz, dx, dy, dz, { minx: pos.x - r, maxx: pos.x + r, minz: pos.z - r, maxz: pos.z + r, miny: pos.y, maxy: pos.y + hh - 0.3 });
      if (body && body.t <= maxT && (!best || body.t < best.t)) best = { q, t: body.t, head: false };
    }
    this.io.to(this.room).except(p.socket?.id ?? '').emit('fire', { id: p.id, ox, oy, oz, dx, dy, dz, t: Math.min(best ? best.t : maxT, 150) });
    if (best) {
      const f = Math.max(0, Math.min(1, (best.t - w.rangeFalloffStart) / (w.rangeFalloffEnd - w.rangeFalloffStart)));
      const mult = 1 - f * (1 - w.minDamageMult);
      this.damage(p, best.q, Math.round(w.damage * mult * (best.head ? w.headshotMult : 1)), best.head);
    }
  }

  damage(att, vic, dmg, head) {
    vic.hp -= dmg;
    const killed = vic.hp <= 0;
    att.socket?.emit('hit', { id: vic.id, dmg, head, kill: killed });
    vic.socket?.emit('damaged', { hp: Math.max(0, vic.hp), dmg, fx: att.x, fz: att.z });
    if (!killed) return;
    vic.alive = false; vic.hp = 0; vic.deaths++; att.kills++;
    this.mode.onKill(att, vic);
    vic.respawnAt = this.modeDef.respawn > 0 ? Date.now() + this.modeDef.respawn * 1000 : 0;
    this.io.to(this.room).emit('kill', { killer: att.id, killerName: att.name, victim: vic.id, victimName: vic.name, head });
    vic.socket?.emit('dead', { by: att.name, respawn: this.modeDef.respawn });
    this.sendRoster(true);
  }

  // ---------- Tick ----------
  tick() {
    const now = Date.now();
    if (this.phase === 'warmup' && now >= this.phaseEndsAt) this.setPhase('running');
    if (this.phase === 'ended' && now >= this.phaseEndsAt) this.setPhase('warmup', WARMUP_MS);
    if (this.phase === 'running') {
      const timeUp = this.timeEndsAt && now >= this.timeEndsAt;
      const res = this.mode.checkEnd(!!timeUp);
      if (res) { this.result = res; this.setPhase('ended', RESULT_MS); }
    }
    for (const p of this.players.values()) {
      if (!p.connected && now - p.disconnectedAt > RECONNECT_GRACE_MS) { this.removePlayer(p); this.onPlayerExpired?.(p); continue; }
      if (p.alive && p.reloadEnd && now >= p.reloadEnd && !p.reloadDone) {
        const w = WEAPONS[p.weapon], need = w.mag - p.mag, take = Math.min(need, p.reserve);
        p.mag += take; p.reserve -= take; p.reloadDone = true; p.reloadEnd = 0;
        p.socket?.emit('ammo', { mag: p.mag, reserve: p.reserve });
      }
      if (!p.alive && p.deployed && p.respawnAt && now >= p.respawnAt && this.phase === 'running') this.spawn(p);
    }
    this.snapshot();
    if (now - this.lastRoster > 1000) this.sendRoster();
  }

  snapshot() {
    const list = [];
    for (const p of this.players.values()) {
      if (!p.deployed || !p.connected) continue;
      list.push({ id: p.id, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
        c: p.crouch ? 1 : 0, s: p.sprint ? 1 : 0, a: p.ads ? 1 : 0, r: p.reloading ? 1 : 0, alive: p.alive ? 1 : 0 });
    }
    this.io.to(this.room).emit('snap', { t: Date.now(), p: list });
  }

  sendRoster(force = false) {
    const now = Date.now(); if (!force && now - this.lastRoster < 900) return; this.lastRoster = now;
    this.io.to(this.room).emit('roster', {
      ...this.phaseInfo(), scores: this.scores, timeLeft: this.timeEndsAt ? Math.max(0, this.timeEndsAt - now) : 0,
      scoreLimit: this.modeDef.scoreLimit,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, score: p.score, ping: Math.round(p.rtt), deployed: p.deployed, connected: p.connected })),
    });
  }
}
