// Socket.IO-Client: Join/Wiederverbindung, Ping, Zustands-Upload (20 Hz), Ereignisse an Handler.
const TOKEN_KEY = 'frontline_zero_token';

export class Net {
  constructor(h) {
    this.h = h; this.sock = null; this.status = 'offline'; this.rtt = 0; this.joined = false;
    this.lastJoin = null; this.pingTimer = null;
  }
  get available() { return typeof window.io === 'function'; }

  connect() {
    if (!this.available) return false;
    if (this.sock) return true;
    const s = this.sock = window.io({ reconnection: true, reconnectionDelay: 400, reconnectionDelayMax: 3000, transports: ['websocket', 'polling'] });
    this.status = 'connecting';
    s.on('connect', () => {
      const re = this.joined;     // war bereits in einem Match -> automatisch wieder beitreten
      this.status = 'connected'; this.h.onStatus?.(this.status);
      if (re && this.lastJoin) this.join(this.lastJoin.name, this.lastJoin.mode).then(r => this.h.onReconnected?.(r));
    });
    s.on('disconnect', () => { this.status = 'reconnecting'; this.h.onStatus?.(this.status); });
    s.on('connect_error', () => { this.status = this.joined ? 'reconnecting' : 'offline'; this.h.onStatus?.(this.status); });
    for (const ev of ['snap', 'roster', 'phase', 'fire', 'hit', 'damaged', 'kill', 'dead', 'respawn', 'ammo', 'correct']) s.on(ev, d => this.h['on_' + ev]?.(d));
    this.pingTimer = setInterval(() => {
      if (!s.connected) return; const t = performance.now();
      s.emit('ping_', null, () => { this.rtt = Math.round(performance.now() - t); });
    }, 2000);
    return true;
  }

  waitConnected(ms = 4000) {
    return new Promise(res => {
      if (this.sock?.connected) return res(true);
      const t = setTimeout(() => res(false), ms);
      this.sock.once('connect', () => { clearTimeout(t); res(true); });
    });
  }

  join(name, mode) {
    this.lastJoin = { name, mode };
    return new Promise(res => {
      let token = null; try { token = localStorage.getItem(TOKEN_KEY); } catch { /* */ }
      this.sock.emit('join', { name, mode, token }, r => {
        if (r?.ok) { this.joined = true; try { localStorage.setItem(TOKEN_KEY, r.token); } catch { /* */ } }
        res(r);
      });
    });
  }
  leave() { if (this.sock?.connected) this.sock.emit('leave'); this.joined = false; try { localStorage.removeItem(TOKEN_KEY); } catch { /* */ } }
  deploy() { this.sock?.emit('deploy'); }
  sendState(s) { if (this.sock?.connected) this.sock.volatile.emit('state', { ...s, rtt: this.rtt }); }
  shoot(dir) { this.sock?.emit('shoot', { dx: dir.x, dy: dir.y, dz: dir.z }); }
  reload() { this.sock?.emit('reload'); }
}
