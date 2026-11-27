// Strahl-Tests ohne Abhängigkeiten (Server + Client).
export function rayAABB(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [b.minx, b.miny, b.minz], mx = [b.maxx, b.maxy, b.maxz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; continue; }
    let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i], s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = ny = nz = 0; if (i === 0) nx = s; else if (i === 1) ny = s; else nz = s; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return { t: tmin, nx, ny, nz };
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}

/** Nächster Treffer gegen alle Kollisionsboxen. Rückgabe {t, nx, ny, nz} oder null. */
export function raycastWorld(boxes, ox, oy, oz, dx, dy, dz, maxT = 1000) {
  let best = null;
  for (const b of boxes) {
    const h = rayAABB(ox, oy, oz, dx, dy, dz, b);
    if (h && h.t <= maxT && (!best || h.t < best.t)) best = h;
  }
  return best;
}

export function boxOverlap(b, x, y, z, r, h) {
  return b.minx < x + r && b.maxx > x - r && b.minz < z + r && b.maxz > z - r &&
         b.miny < y + h - 1e-4 && b.maxy > y + 1e-4;
}
