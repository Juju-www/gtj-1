// Deterministische Map-Definition "Depot Zero". Wird vom Client (Rendering + Kollision)
// und vom Server (Sichtlinien, Spawns) identisch benutzt. Einheiten: Meter.
export function buildMap() {
  const boxes = [];
  const add = (x0, y0, z0, x1, y1, z1, mat = 'concrete', collide = true) => {
    boxes.push({
      minx: Math.min(x0, x1), miny: Math.min(y0, y1), minz: Math.min(z0, z1),
      maxx: Math.max(x0, x1), maxy: Math.max(y0, y1), maxz: Math.max(z0, z1), mat, collide,
    });
  };
  const box = (cx, y, cz, w, h, d, mat, collide) => add(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, mat, collide);

  // Wand entlang einer Achse mit Öffnungen (Türen/Fenster): openings = [{c,w,y0,y1}]
  function wall(axis, fixed, a, b, base, h, t, mat, openings = []) {
    const ops = openings.map(o => ({ s: o.c - o.w / 2, e: o.c + o.w / 2, y0: o.y0 ?? 0, y1: o.y1 ?? 2.8 }))
      .sort((p, q) => p.s - q.s);
    const seg = (s, e, y0, y1) => {
      if (e - s < 0.01 || y1 - y0 < 0.01) return;
      if (axis === 'x') add(s, base + y0, fixed - t / 2, e, base + y1, fixed + t / 2, mat);
      else add(fixed - t / 2, base + y0, s, fixed + t / 2, base + y1, e, mat);
    };
    let cur = a;
    for (const o of ops) { seg(cur, o.s, 0, h); seg(o.s, o.e, 0, o.y0); seg(o.s, o.e, o.y1, h); cur = o.e; }
    seg(cur, b, 0, h);
  }

  // Treppe aus massiven Blöcken (Stufenhöhe 0.4 < Step-Höhe des Spielers 0.55).
  function stairs(x, z, dir, width, rise, mat = 'concrete', base = 0, stepH = 0.4, stepD = 0.8) {
    const n = Math.round(rise / stepH);
    for (let i = 0; i < n; i++) {
      const top = base + (i + 1) * stepH, s = i * stepD, e = (i + 1) * stepD;
      if (dir === '+x') add(x + s, base, z - width / 2, x + e, top, z + width / 2, mat);
      else if (dir === '-x') add(x - e, base, z - width / 2, x - s, top, z + width / 2, mat);
      else if (dir === '+z') add(x - width / 2, base, z + s, x + width / 2, top, z + e, mat);
      else add(x - width / 2, base, z - e, x + width / 2, top, z - s, mat);
    }
  }

  // ---------- Boden & Außenmauer ----------
  add(-90, -1, -90, 90, 0, 90, 'asphalt');
  wall('x', -70, -70.5, 70.5, 0, 7, 1, 'wall');
  wall('x', 70, -70.5, 70.5, 0, 7, 1, 'wall');
  wall('z', -70, -70.5, 70.5, 0, 7, 1, 'wall');
  wall('z', 70, -70.5, 70.5, 0, 7, 1, 'wall');

  // ---------- Lagerhalle A (Zentrum-West) ----------
  const ax0 = -35, ax1 = -9, az0 = -21, az1 = -3, AH = 6.8;
  wall('x', az0, ax0, ax1, 0, AH, 0.5, 'brick', [{ c: -22, w: 3.5, y1: 3 }, { c: -30, w: 3, y0: 1.4, y1: 2.6 }, { c: -14, w: 3, y0: 1.4, y1: 2.6 }]);
  wall('x', az1, ax0, ax1, 0, AH, 0.5, 'brick', [{ c: -27, w: 3.5, y1: 3 }, { c: -16, w: 3.5, y1: 3 }]);
  wall('z', ax0, az0, az1, 0, AH, 0.5, 'brick', [{ c: -12, w: 3, y1: 2.8 }, { c: -17, w: 2.5, y0: 1.4, y1: 2.6 }]);
  wall('z', ax1, az0, az1, 0, AH, 0.5, 'brick', [{ c: -12, w: 3.5, y1: 3 }]);
  add(ax0 - 0.25, AH, az0 - 0.25, ax1 + 0.25, 7.2, az1 + 0.25, 'roof');
  // Außentreppe zum Dach (Ostseite), 18 Stufen = 7.2 m
  stairs(ax1 + 1.25, az0 + 0.5, '+z', 2, 7.2, 'concrete');
  // Dach-Brüstung (Deckung), Ostseite bleibt offen
  wall('x', az0 + 0.1, ax0, ax1, 7.2, 1, 0.3, 'wall');
  wall('x', az1 - 0.1, ax0, ax1, 7.2, 1, 0.3, 'wall');
  wall('z', ax0 + 0.1, az0, az1, 7.2, 1, 0.3, 'wall');
  wall('z', ax1 - 0.1, az0, -9, 7.2, 1, 0.3, 'wall');
  // Zwischenebene innen (Katwalk)
  add(-34.5, 2.8, -20.5, -24, 3.2, -14, 'metal');
  stairs(-23.5, -17.2, '-x', 2.4, 3.2, 'metal');
  // Innen-Deckung
  box(-20, 0, -12, 3, 1.4, 1.5, 'crate'); box(-18.5, 0, -15, 1.5, 1.4, 1.5, 'crate');
  box(-28, 0, -8, 4, 1.2, 1.2, 'crate'); box(-14, 0, -6, 1.5, 2.4, 3, 'metal');
  box(-31, 0, -11, 2, 2.4, 2, 'crate'); box(-31, 2.4, -11, 1.8, 1.2, 1.8, 'crate');

  // ---------- Bürogebäude B (Nordost), zwei Etagen ----------
  const bx0 = 15, bx1 = 31, bz0 = -30, bz1 = -14;
  wall('x', bz1, bx0, bx1, 0, 3.6, 0.5, 'wall', [{ c: 20, w: 3, y1: 2.8 }, { c: 27, w: 2.5, y0: 1.1, y1: 2.4 }]);
  wall('x', bz0, bx0, bx1, 0, 3.6, 0.5, 'wall', [{ c: 26, w: 3, y1: 2.8 }, { c: 19, w: 2.5, y0: 1.1, y1: 2.4 }]);
  wall('z', bx0, bz0, bz1, 0, 3.6, 0.5, 'wall', [{ c: -22, w: 2.5, y0: 1.1, y1: 2.4 }]);
  wall('z', bx1, bz0, bz1, 0, 3.6, 0.5, 'wall', [{ c: -22, w: 3, y1: 2.8 }]);
  // Zwischendecke mit Treppenloch (x16..24, z-28.5..-25.5)
  add(bx0, 3.6, bz0, bx1, 4.0, -28.5, 'concrete'); add(bx0, 3.6, -25.5, bx1, 4.0, bz1, 'concrete');
  add(bx0, 3.6, -28.5, 16, 4.0, -25.5, 'concrete'); add(24, 3.6, -28.5, bx1, 4.0, -25.5, 'concrete');
  stairs(16, -27, '+x', 2.5, 4.0, 'concrete');
  const op2 = [{ c: 18, w: 2.5, y0: 1.0, y1: 2.4 }, { c: 24, w: 2.5, y0: 1.0, y1: 2.4 }, { c: 29, w: 2, y0: 1.0, y1: 2.4 }];
  wall('x', bz1, bx0, bx1, 4.0, 3.6, 0.5, 'wall', op2);
  wall('x', bz0, bx0, bx1, 4.0, 3.6, 0.5, 'wall', op2);
  wall('z', bx0, bz0, bz1, 4.0, 3.6, 0.5, 'wall', [{ c: -18, w: 2.5, y0: 1.0, y1: 2.4 }, { c: -26, w: 2.5, y0: 1.0, y1: 2.4 }]);
  wall('z', bx1, bz0, bz1, 4.0, 3.6, 0.5, 'wall', [{ c: -18, w: 2.5, y0: 1.0, y1: 2.4 }, { c: -26, w: 2.5, y0: 1.0, y1: 2.4 }]);
  add(bx0 - 0.25, 7.6, bz0 - 0.25, bx1 + 0.25, 8.0, bz1 + 0.25, 'roof');
  stairs(13.5, bz0, '+z', 2, 8.0, 'concrete');       // Außentreppe West, 20 Stufen
  wall('x', bz0 + 0.1, bx0, bx1, 8.0, 1, 0.3, 'wall'); wall('x', bz1 - 0.1, bx0, bx1, 8.0, 1, 0.3, 'wall');
  wall('z', bx1 - 0.1, bz0, bz1, 8.0, 1, 0.3, 'wall');
  box(20, 4.0, -20, 2.5, 1.0, 1.2, 'crate'); box(26, 4.0, -24, 1.2, 1.0, 3, 'metal'); box(22, 0, -18, 2, 1.0, 1, 'crate');

  // ---------- Container-Hof (Süd) ----------
  const cont = (cx, y, cz, long, mat, alongX = true) =>
    alongX ? box(cx, y, cz, long, 2.4, 2.5, mat) : box(cx, y, cz, 2.5, 2.4, long, mat);
  cont(-9, 0, 30, 12, 'cont_r'); cont(9, 0, 30, 12, 'cont_b');
  cont(-9, 2.4, 30, 12, 'cont_g'); cont(0, 0, 36, 12, 'cont_y'); cont(-14, 0, 37, 10, 'cont_b', false);
  cont(14, 0, 38, 10, 'cont_r', false); cont(0, 2.4, 36, 8, 'cont_r'); cont(-2, 0, 43, 12, 'cont_g');
  stairs(-24.6, 30, '+x', 2, 4.8, 'metal');   // Aufgang auf gestapelten Container (4.8 m)
  stairs(9, 23.95, '+z', 2, 2.4, 'metal');    // Aufgang auf Container Ost
  stairs(-2, 49.05, '-z', 2, 2.4, 'metal');   // Aufgang auf Container Süd
  box(5, 0, 46, 2, 1.2, 2, 'crate'); box(8, 0, 47, 1.5, 2.4, 1.5, 'crate'); box(-8, 0, 47.5, 3, 1.2, 1.5, 'crate');

  // ---------- Überführung / Unterführung (Südrand) ----------
  add(-35, 4.4, 52, 35, 4.8, 58, 'concrete');
  for (const px of [-30, -10, 10, 30]) { box(px, 0, 52.5, 1.2, 4.4, 1, 'concrete'); box(px, 0, 57.5, 1.2, 4.4, 1, 'concrete'); }
  wall('x', 52.1, -35, 35, 4.8, 1, 0.3, 'wall'); wall('x', 57.9, -35, 35, 4.8, 1, 0.3, 'wall');
  stairs(44.6, 55, '-x', 5, 4.8, 'concrete');
  stairs(-44.6, 55, '+x', 5, 4.8, 'concrete');
  for (const jx of [-20, -5, 15, 25]) box(jx, 0, 55, 3, 0.9, 0.6, 'barrier');

  // ---------- Wachturm (Südost) ----------
  add(44, 5.6, 19, 50, 6.0, 25, 'metal');
  for (const [tx, tz] of [[44.5, 19.5], [49.5, 19.5], [44.5, 24.5], [49.5, 24.5]]) box(tx, 0, tz, 0.6, 5.6, 0.6, 'metal');
  wall('x', 19.2, 44, 50, 6.0, 1.1, 0.3, 'metal'); wall('x', 24.8, 44, 50, 6.0, 1.1, 0.3, 'metal');
  wall('z', 44.2, 19, 25, 6.0, 1.1, 0.3, 'metal');
  wall('z', 49.8, 19, 25, 6.0, 1.1, 0.3, 'metal', [{ c: 22, w: 2, y0: 0, y1: 1.1 }]);
  stairs(62, 22, '-x', 2, 6.0, 'metal');      // 15 Stufen

  // ---------- Parkplatz (Südwest) ----------
  let ci = 0;
  for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) {
    const cx = -62 + i * 6, cz = 30 + row * 11, m = ['car1', 'car2', 'car3'][(ci++) % 3];
    box(cx, 0.3, cz, 2, 0.8, 4.4, m); box(cx, 1.1, cz - 0.2, 1.8, 0.7, 2.4, m);
  }
  for (let i = 0; i < 4; i++) box(-60 + i * 8, 0, 48, 3, 0.9, 0.6, 'barrier');

  // ---------- Zentraler Platz ----------
  box(0, 0, 0, 4, 1.4, 4, 'concrete'); box(0, 1.4, 0, 2.6, 3.0, 2.6, 'concrete');   // Denkmal
  for (const [px, pz] of [[-8, -4], [8, 4], [-6, 8], [7, -8]]) box(px, 0, pz, 5, 1.1, 1.2, 'wall');
  for (let i = -3; i <= 3; i++) if (i !== 0) box(i * 5, 0, -34, 3, 0.9, 0.6, 'barrier');
  box(-45, 0, -5, 1.2, 1.1, 8, 'wall'); box(45, 0, 5, 1.2, 1.1, 8, 'wall');
  box(-50, 0, -35, 4, 1.4, 4, 'crate'); box(50, 0, -40, 4, 1.4, 4, 'crate'); box(40, 0, 45, 3, 2.4, 3, 'crate');
  box(-44, 0, 12, 6, 2.4, 2.5, 'cont_r'); box(44, 0, -8, 6, 2.4, 2.5, 'cont_b');

  // ---------- Orientierungspunkte (nicht kollidierend) ----------
  box(0, 0, 14, 0.5, 34, 0.5, 'mast', false);                 // Funkmast
  box(0, 28, 14, 3, 0.3, 0.3, 'mast', false);
  for (const [lx, lz] of [[-20, 0], [20, 0], [0, -20], [0, 22], [-45, 22], [45, -22], [-60, 0], [60, 0]]) {
    box(lx, 0, lz, 0.25, 7, 0.25, 'metal', false); box(lx, 7, lz, 1.4, 0.2, 0.5, 'metal', false);
  }

  const spawns = [];
  for (let i = -3; i <= 3; i++) {
    spawns.push({ team: 0, x: -62, y: 0, z: i * 4, yaw: -Math.PI / 2 });
    spawns.push({ team: 1, x: 62, y: 0, z: i * 4, yaw: Math.PI / 2 });
  }
  return { name: 'Depot Zero', boxes, spawns, bounds: { x0: -69, x1: 69, z0: -69, z1: 69 } };
}

export function collisionBoxes(map) { return map.boxes.filter(b => b.collide); }
