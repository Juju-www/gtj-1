// Selbsttest ohne Abhängigkeiten: Map-Daten, Strahltests, Begehbarkeit (Treppen/Dächer).
import { buildMap, collisionBoxes } from '../shared/map.js';
import { rayAABB, boxOverlap, raycastWorld } from '../shared/math.js';
import { PLAYER } from '../shared/constants.js';
import assert from 'node:assert';

const map = buildMap(); const cb = collisionBoxes(map);
console.log(`Map "${map.name}": ${map.boxes.length} Boxen (${cb.length} kollidierend), ${map.spawns.length} Spawns`);
for (const b of map.boxes) assert(b.maxx > b.minx && b.maxy > b.miny && b.maxz > b.minz, 'degenerierte Box');
for (const s of map.spawns) assert(!cb.some(b => boxOverlap(b, s.x, 0.01, s.z, PLAYER.radius, PLAYER.height)), 'Spawn in Wand');

// Strahltest
const hit = rayAABB(0, 1, -10, 0, 0, 1, { minx: -1, miny: 0, minz: 0, maxx: 1, maxy: 2, maxz: 1 });
assert(hit && Math.abs(hit.t - 10) < 1e-9 && hit.nz === -1, 'rayAABB');
assert(raycastWorld(cb, -62, 1.6, 0, 1, 0, 0, 200), 'Sichtlinie quer über die Map trifft etwas');

// Mini-Simulation der Spielerbewegung (gleiche Logik wie client/src/player/physics.js)
import { movePlayer } from '../client/src/player/physics.js';
function walk(start, dirx, dirz, secs, jump = false) {
  const st = { x: start[0], y: start[1], z: start[2], vx: 0, vy: 0, vz: 0, onGround: true, crouch: false };
  for (let t = 0; t < secs; t += 1 / 60) {
    st.vx = dirx * PLAYER.walk; st.vz = dirz * PLAYER.walk;
    movePlayer(st, 1 / 60, cb);
  }
  return st;
}
// Treppe Halle A: Start unten, nach +z laufen -> sollte auf das Dach (7.2 m) steigen
let s = walk([-7.75, 0, -21.2], 0, 1, 3.2);
console.log('Treppe A, Endhöhe:', s.y.toFixed(2), 'z:', s.z.toFixed(2));
assert(s.y > 5.5, 'Treppe zu Dach A begehbar');
s = walk([-22, 0, -30], 0, 1, 3);
console.log('Tür Halle A, z nach 3s:', s.z.toFixed(2)); assert(s.z > -19, 'Tür begehbar');
s = walk([-33, 0, -30], 0, 1, 2.5); assert(s.z < -21.2, 'Wand blockiert'); console.log('Wand ok, z =', s.z.toFixed(2));
// Außentreppe Turm (Ost): 15 Stufen = 6 m, von x=62 nach -x
s = walk([62.5, 0, 22], -1, 0, 2.7); console.log('Turmtreppe, Höhe:', s.y.toFixed(2)); assert(s.y > 5, 'Turmtreppe begehbar');
// Container-Aufgang
s = walk([-26, 0, 30], 1, 0, 2.0); console.log('Container-Aufgang, Höhe:', s.y.toFixed(2)); assert(s.y > 2, 'Containertreppe begehbar');
console.log('ALLE CHECKS OK');

// ---------------- Server-Logik (ohne Netzwerk, mit Fake-Socket.IO) ----------------
const { Match } = await import('../server/src/matches/Match.js');
const events = [];
const fakeIo = { to: room => ({ emit: (e, d) => events.push([e, d]), except: () => ({ emit: (e, d) => events.push([e, d]) }) }) };
const mkSock = () => { const log = []; return { id: Math.random().toString(36), log, emit: (e, d) => log.push([e, d]) }; };
const mkPlayer = (id, team) => ({ id, token: id, name: id, socket: mkSock(), connected: true, disconnectedAt: 0, deployed: true, alive: true, weapon: 'm4',
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: false, hp: 100, mag: 30, reserve: 120, reloadEnd: 0, reloadDone: true, lastShot: 0, lastState: Date.now(),
  respawnAt: 0, kills: 0, deaths: 0, score: 0, rtt: 0, violations: 0, history: [], team });
const m = new Match(fakeIo, 't1', 'tdm');
const a = mkPlayer('a', 0), b = mkPlayer('b', 1), c = mkPlayer('c', 0);
for (const p of [a, b, c]) { m.players.set(p.id, p); }
m.phase = 'running'; m.timeEndsAt = Date.now() + 600000;
const place = (p, x, z) => { p.x = x; p.y = 0; p.z = z; p.history = []; };
place(a, -60, 0); place(b, -50, 0); place(c, -55, 3);
const shoot = () => { a.lastShot = 0; m.onShoot(a, { dx: 1, dy: 0, dz: 0 }); };
shoot(); assert.equal(b.hp, 59, 'Kopfschuss: round(27*1.5)=41 Schaden'); console.log('Treffer + Headshot ok, hp b =', b.hp);
shoot(); shoot(); assert(!b.alive && a.kills === 1 && b.deaths === 1, 'Kill gezählt'); assert.equal(m.scores[0], 1, 'TDM-Teampunkt');
console.log('Kill + TDM-Score ok');
// Friendly Fire aus
place(a, -60, 0); place(c, -50, 0); c.alive = true; shoot(); assert.equal(c.hp, 100, 'kein Friendly Fire');
// Wand blockiert (Hallenwestwand bei x=-35)
place(a, -50, -6); b.alive = true; b.hp = 100; place(b, -30, -6); shoot(); assert.equal(b.hp, 100, 'Wand blockiert Schuss'); console.log('Wand-Okklusion + Friendly-Fire-Schutz ok');
// Feuerrate
b.hp = 100; place(b, -45, -6); a.lastShot = 0; m.onShoot(a, { dx: 1, dy: 0, dz: 0 }); const mg = a.mag; m.onShoot(a, { dx: 1, dy: 0, dz: 0 }); assert.equal(a.mag, mg, 'Feuerraten-Limit'); console.log('Feuerraten-Limit ok');
// Nachladen
a.mag = 0; a.reloadEnd = 0; m.onReload(a); assert(a.reloadEnd > Date.now(), 'Reload gestartet'); a.reloadEnd = Date.now() - 1; m.tick(); assert.equal(a.mag, 30, 'Reload fertig'); assert.equal(a.reserve, 90);
console.log('Nachladen (Server) ok');
// Anti-Teleport
a.log = null; place(a, -60, 0); a.lastState = Date.now(); a.socket.log.length = 0; m.onState(a, { x: 10, y: 0, z: 0, yaw: 0, pitch: 0 });
assert(a.socket.log.some(([e]) => e === 'correct') && a.x === -60, 'Teleport wird zurückgesetzt'); console.log('Anti-Teleport ok');
// Lag-Kompensation: b stand vor 100ms bei z=0, ist jetzt woanders
place(a, -60, 0); b.hp = 100; b.alive = true; b.rtt = 0;
const now = Date.now(); b.history = [{ t: now - 400, x: -50, y: 0, z: 0, c: false }, { t: now - 90, x: -50, y: 0, z: 0, c: false }, { t: now, x: -50, y: 0, z: 10, c: false }]; b.x = -50; b.z = 10;
shoot(); assert(b.hp < 100, 'Lag-Kompensation trifft zurückgespulte Position'); console.log('Lag-Kompensation ok');
m.destroy();
console.log('SERVER-CHECKS OK');
