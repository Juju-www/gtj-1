// Partikel & Trefferfeedback: Tracer, Einschlag-Funken, Einschusslöcher, Blut, Schussrauch, entfernte Mündungsblitze.
import * as THREE from 'three';

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smokeTex = radialTexture([[0, 'rgba(210,210,210,0.55)'], [1, 'rgba(210,210,210,0)']]);
    this.flashTex = radialTexture([[0, 'rgba(255,245,200,1)'], [0.4, 'rgba(255,170,60,0.8)'], [1, 'rgba(255,120,0,0)']]);
    this.tracers = this._pool(24, () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.geometry.rotateX(Math.PI / 2); return m;
    });
    this.sparks = this._pool(64, () => new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xffc060, fog: false })));
    this.blood = this._pool(48, () => new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: 0xa01010 })));
    this.holes = this._pool(40, () => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
      return m;
    });
    this.smoke = this._pool(28, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false })));
    this.flashes = this._pool(8, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    this.active = [];
  }

  _pool(n, make) {
    const items = [];
    for (let i = 0; i < n; i++) { const o = make(); o.visible = false; this.scene.add(o); items.push(o); }
    return { items, idx: 0 };
  }
  _take(pool) { const o = pool.items[pool.idx]; pool.idx = (pool.idx + 1) % pool.items.length; o.visible = true; this.active = this.active.filter(a => a.obj !== o); return o; }

  tracer(from, to) {
    const o = this._take(this.tracers), len = from.distanceTo(to);
    if (len < 1) { o.visible = false; return; }
    o.position.copy(from).lerp(to, 0.5); o.scale.set(1, 1, len); o.lookAt(to); o.material.opacity = 0.85;
    this.active.push({ obj: o, life: 0.07, max: 0.07, kind: 'fade' });
  }

  impact(point, normal, spawnHole = true) {
    for (let i = 0; i < 6; i++) {
      const o = this._take(this.sparks); o.position.copy(point);
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).add(normal.clone().multiplyScalar(1.4)).multiplyScalar(2 + Math.random() * 2);
      this.active.push({ obj: o, life: 0.3, max: 0.3, kind: 'particle', vel: v, grav: 9 });
    }
    if (spawnHole) {
      const h = this._take(this.holes); h.position.copy(point).addScaledVector(normal, 0.01);
      h.lookAt(point.clone().add(normal)); h.material.opacity = 0.85;
      this.active.push({ obj: h, life: 25, max: 25, kind: 'hole' });
    }
  }

  bloodHit(point) {
    for (let i = 0; i < 8; i++) {
      const o = this._take(this.blood); o.position.copy(point);
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
      this.active.push({ obj: o, life: 0.45, max: 0.45, kind: 'particle', vel: v, grav: 10 });
    }
  }

  smokePuff(pos, dir) {
    const o = this._take(this.smoke); o.position.copy(pos); o.scale.setScalar(0.15); o.material.opacity = 0.5;
    this.active.push({ obj: o, life: 1.1, max: 1.1, kind: 'smoke', vel: dir.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0)) });
  }

  remoteFlash(pos) {
    const o = this._take(this.flashes); o.position.copy(pos); o.scale.setScalar(0.5 + Math.random() * 0.2); o.material.rotation = Math.random() * 6;
    this.active.push({ obj: o, life: 0.05, max: 0.05, kind: 'flash' });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i]; a.life -= dt;
      if (a.life <= 0) { a.obj.visible = false; this.active.splice(i, 1); continue; }
      const k = a.life / a.max;
      if (a.kind === 'particle') { a.vel.y -= a.grav * dt; a.obj.position.addScaledVector(a.vel, dt); }
      else if (a.kind === 'smoke') { a.obj.position.addScaledVector(a.vel, dt); a.obj.scale.setScalar(0.15 + (1 - k) * 1.2); a.obj.material.opacity = 0.45 * k; }
      else if (a.kind === 'fade') a.obj.material.opacity = 0.85 * k;
      else if (a.kind === 'hole' && a.life < 3) a.obj.material.opacity = 0.85 * (a.life / 3);
    }
  }
}
