import crypto from 'node:crypto';
import { MODES, WEAPONS } from '../../../shared/constants.js';
import { Match } from './Match.js';

const cleanName = s => String(s ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || 'Operator';

export class MatchManager {
  constructor(io) { this.io = io; this.matches = new Map(); this.sessions = new Map(); this.nextId = 1; }

  /** Matchmaking-Grundlage: erstes nicht volles Match des gewünschten Modus, sonst neues. */
  findOrCreate(modeId) {
    for (const m of this.matches.values()) if (m.modeDef.id === modeId && !m.isFull) return m;
    const m = new Match(this.io, String(this.nextId++), modeId);
    m.onPlayerExpired = p => this.sessions.delete(p.token);
    this.matches.set(m.id, m); return m;
  }

  onConnection(socket) {
    socket.on('ping_', (_, cb) => typeof cb === 'function' && cb());

    socket.on('join', (data, cb) => {
      if (typeof cb !== 'function') return;
      data = data || {};
      const modeId = MODES[data.mode]?.implemented ? data.mode : 'tdm';
      let p = null, match = null;
      const sess = typeof data.token === 'string' ? this.sessions.get(data.token) : null;
      if (sess && this.matches.get(sess.matchId)?.players.has(sess.playerId)) {      // Wiederverbindung
        match = this.matches.get(sess.matchId); p = match.players.get(sess.playerId);
        p.socket = socket; p.connected = true; p.deployed = false; p.alive = false;
      } else {
        match = this.findOrCreate(modeId);
        p = { id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(16).toString('hex'), name: cleanName(data.name),
          socket, connected: true, disconnectedAt: 0, deployed: false, alive: false, weapon: 'm4',
          x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: false, sprint: false, ads: false, reloading: false,
          hp: 100, mag: WEAPONS.m4.mag, reserve: WEAPONS.m4.reserve, reloadEnd: 0, reloadDone: true, lastShot: 0, lastState: 0,
          respawnAt: 0, kills: 0, deaths: 0, score: 0, rtt: 0, violations: 0, history: [], team: -1 };
        match.addPlayer(p);
        this.sessions.set(p.token, { matchId: match.id, playerId: p.id });
      }
      p.name = cleanName(data.name || p.name);
      socket.data.player = p; socket.data.match = match;
      socket.join(match.room);
      cb({ ok: true, id: p.id, token: p.token, team: p.team, mode: match.modeDef.id, phase: match.phaseInfo(), reconnected: !!sess });
      match.sendRoster(true);
    });

    const withPlayer = fn => (...a) => { const { player, match } = socket.data; if (player && match) fn(player, match, ...a); };
    socket.on('deploy', withPlayer((p, m) => m.deploy(p)));
    socket.on('state', withPlayer((p, m, s) => m.onState(p, s)));
    socket.on('shoot', withPlayer((p, m, d) => m.onShoot(p, d)));
    socket.on('reload', withPlayer((p, m) => m.onReload(p)));
    socket.on('leave', withPlayer((p, m) => {
      socket.leave(m.room); m.removePlayer(p); this.sessions.delete(p.token);
      socket.data.player = null; socket.data.match = null;
      if (m.size === 0) { m.destroy(); this.matches.delete(m.id); }
    }));
    socket.on('disconnect', withPlayer((p, m) => {
      if (p.socket !== socket) return;
      p.connected = false; p.disconnectedAt = Date.now(); p.deployed = false; p.alive = false;
      m.sendRoster(true);
    }));
  }
}
