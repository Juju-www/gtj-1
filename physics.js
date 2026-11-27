// Kollision & Bewegung (AABB gegen Boxen) – reines JS, ohne Three.js, damit testbar.
import { PLAYER } from '../../../shared/constants.js';
import { boxOverlap } from '../../../shared/math.js';

const EPS = 1e-3;
const heightOf = st => (st.crouch ? PLAYER.crouchHeight : PLAYER.height);

export function canStand(st, boxes) {
  return !boxes.some(b => boxOverlap(b, st.x, st.y, st.z, PLAYER.radius, PLAYER.height));
}

/** st: {x,y,z,vx,vy,vz,onGround,crouch}. Integriert Schwerkraft + Geschwindigkeit mit Kollision und Treppenstufen. */
export function movePlayer(st, dt, boxes) {
  const h = heightOf(st), r = PLAYER.radius;
  st.vy -= PLAYER.gravity * dt;

  for (const axis of ['x', 'z']) {
    const v = axis === 'x' ? st.vx : st.vz;
    if (!v) continue;
    st[axis] += v * dt;
    for (const b of boxes) {
      if (!boxOverlap(b, st.x, st.y, st.z, r, h)) continue;
      const stepH = b.maxy - st.y;
      if (st.onGround && stepH > 0 && stepH <= PLAYER.step) {
        const oldY = st.y; st.y = b.maxy;
        if (!boxes.some(o => o !== b && boxOverlap(o, st.x, st.y, st.z, r, h))) continue;
        st.y = oldY;
      }
      if (axis === 'x') { st.x = v > 0 ? b.minx - r - EPS : b.maxx + r + EPS; st.vx = 0; }
      else { st.z = v > 0 ? b.minz - r - EPS : b.maxz + r + EPS; st.vz = 0; }
    }
  }

  st.y += st.vy * dt;
  st.onGround = false;
  if (st.y <= 0) { st.y = 0; if (st.vy < 0) st.vy = 0; st.onGround = true; }
  for (const b of boxes) {
    if (!boxOverlap(b, st.x, st.y, st.z, r, h)) continue;
    if (st.vy <= 0 && b.maxy - st.y <= Math.max(0.02, -st.vy * dt + 0.02)) {
      st.y = b.maxy; st.vy = 0; st.onGround = true;
    } else if (st.vy > 0) {
      st.y = b.miny - h - EPS; st.vy = 0;
    }
  }
  return st;
}
