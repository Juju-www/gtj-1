// Baut die 3D-Welt aus den gemeinsamen Map-Daten: PBR-Materialien mit prozeduralen Texturen,
// pro Material zu EINEM Mesh zusammengeführt (wenige Draw-Calls), Sonne mit mitlaufender Schattenkarte, Nebel, Himmel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildMap, collisionBoxes } from '../../../shared/map.js';
import { S, SHADOW_SIZE, ANISO } from '../settings/settings.js';

const MATS = {
  asphalt: { c: '#42454a', kind: 'noise', tile: 5, rough: 0.95 },
  concrete: { c: '#8e9091', kind: 'noise', tile: 3, rough: 0.9 },
  wall: { c: '#b9b5a8', kind: 'noise', tile: 3, rough: 0.9 },
  brick: { c: '#94503d', kind: 'brick', tile: 3, rough: 0.9 },
  roof: { c: '#5a5d60', kind: 'noise', tile: 4, rough: 0.85 },
  metal: { c: '#58616b', kind: 'panel', tile: 2, rough: 0.45, metal: 0.65 },
  crate: { c: '#98733f', kind: 'planks', tile: 1.5, rough: 0.8 },
  cont_r: { c: '#a3352a', kind: 'ribs', tile: 2.4, rough: 0.6, metal: 0.35 },
  cont_b: { c: '#2b5a86', kind: 'ribs', tile: 2.4, rough: 0.6, metal: 0.35 },
  cont_g: { c: '#34734b', kind: 'ribs', tile: 2.4, rough: 0.6, metal: 0.35 },
  cont_y: { c: '#c9a232', kind: 'ribs', tile: 2.4, rough: 0.6, metal: 0.35 },
  car1: { c: '#1d2024', kind: 'flat', tile: 4, rough: 0.3, metal: 0.7 },
  car2: { c: '#74211f', kind: 'flat', tile: 4, rough: 0.3, metal: 0.7 },
  car3: { c: '#b4b8bb', kind: 'flat', tile: 4, rough: 0.3, metal: 0.7 },
  barrier: { c: '#bdbdb4', kind: 'noise', tile: 2, rough: 0.9 },
  mast: { c: '#d04b3a', kind: 'flat', tile: 4, rough: 0.6 },
};

function makeTexture(def) {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'); g.fillStyle = def.c; g.fillRect(0, 0, N, N);
  const speckle = (amt, a) => {
    const id = g.getImageData(0, 0, N, N), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
  };
  const dark = a => `rgba(0,0,0,${a})`;
  switch (def.kind) {
    case 'brick':
      g.strokeStyle = dark(0.45); g.lineWidth = 3;
      for (let y = 0; y < N; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(N, y); g.stroke();
        for (let x = ((y / 32) % 2) * 32; x < N; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
      speckle(34); break;
    case 'planks':
      g.strokeStyle = dark(0.5); g.lineWidth = 3;
      for (let x = 0; x < N; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, N); g.stroke(); }
      g.strokeRect(2, 2, N - 4, N - 4); g.beginPath(); g.moveTo(0, 0); g.lineTo(N, N); g.stroke(); speckle(40); break;
    case 'ribs':
      for (let x = 0; x < N; x += 16) { g.fillStyle = dark(0.18); g.fillRect(x, 0, 6, N); }
      g.fillStyle = dark(0.3); g.fillRect(0, 0, N, 6); g.fillRect(0, N - 6, N, 6); speckle(22); break;
    case 'panel':
      g.strokeStyle = dark(0.5); g.lineWidth = 2; g.strokeRect(3, 3, N - 6, N - 6);
      g.beginPath(); g.moveTo(N / 2, 0); g.lineTo(N / 2, N); g.stroke(); speckle(24); break;
    case 'noise': speckle(42); break;
    default: speckle(10);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// BoxGeometry: UVs an die Weltgröße anpassen, damit Texturen nicht verzerren
function boxGeo(b, tile) {
  const w = b.maxx - b.minx, h = b.maxy - b.miny, d = b.maxz - b.minz;
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const [us, vs] = f < 2 ? [d, h] : f < 4 ? [w, d] : [w, h];
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * us / tile, uv.getY(k) * vs / tile); }
  }
  g.translate(b.minx + w / 2, b.miny + h / 2, b.minz + d / 2);
  return g;
}

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.map = buildMap();
    this.solid = collisionBoxes(this.map);
    this.scene = new THREE.Scene();
    this.materials = [];
    this.textures = [];
    this.horizon = new THREE.Color('#bcd2e4');
    this.scene.fog = new THREE.Fog(this.horizon, 60, 260);
    this._buildSky(); this._buildGeometry(); this._buildLights();
    this.applyQuality();
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(500, 24, 14);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#3f79c0') }, hor: { value: this.horizon }, gnd: { value: new THREE.Color('#6d7378') } },
      vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 gnd; varying float vy; void main(){ vec3 c = vy>0.0 ? mix(hor, top, pow(vy,0.55)) : mix(hor, gnd, min(1.0,-vy*4.0)); gl_FragColor = vec4(c,1.0); }',
    });
    this.sky = new THREE.Mesh(geo, mat); this.sky.renderOrder = -10; this.scene.add(this.sky);
    // Umgebungs-Reflexionen (PBR) aus dem Himmel
    const pm = new THREE.PMREMGenerator(this.renderer), es = new THREE.Scene(); es.add(new THREE.Mesh(geo, mat));
    this.envMap = pm.fromScene(es, 0, 1, 1000).texture; pm.dispose();
  }

  _buildGeometry() {
    const groups = new Map();
    for (const b of this.map.boxes) {
      const def = MATS[b.mat] || MATS.concrete;
      if (!groups.has(b.mat)) groups.set(b.mat, []);
      groups.get(b.mat).push(boxGeo(b, def.tile));
    }
    for (const [key, geos] of groups) {
      const def = MATS[key] || MATS.concrete, tex = makeTexture(def);
      this.textures.push(tex);
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: def.rough ?? 0.8, metalness: def.metal ?? 0, envMap: this.envMap, envMapIntensity: 0.7 });
      this.materials.push(m);
      const mesh = new THREE.Mesh(mergeGeometries(geos), m);
      mesh.castShadow = key !== 'asphalt'; mesh.receiveShadow = true; this.scene.add(mesh);
      geos.forEach(g => g.dispose());
    }
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x55524a, 1.0));
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
    this.sunOffset = new THREE.Vector3(55, 85, 35);
    const c = this.sun.shadow.camera; c.left = -48; c.right = 48; c.top = 48; c.bottom = -48; c.near = 1; c.far = 260;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
  }

  /** Schatten-/Textur-Einstellungen anwenden (auch zur Laufzeit). */
  applyQuality() {
    const size = SHADOW_SIZE[S.shadows] ?? 0, r = this.renderer;
    r.shadowMap.enabled = size > 0; r.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.sun.castShadow !== size > 0 || this.sun.shadow.mapSize.x !== size) {
      this.sun.castShadow = size > 0;
      if (size > 0) this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.materials.forEach(m => { m.needsUpdate = true; });
    }
    const an = Math.min(ANISO[S.textures] ?? 4, r.capabilities.getMaxAnisotropy());
    this.textures.forEach(t => { t.anisotropy = an; t.needsUpdate = true; });
  }

  update(focus) {
    // Schattenkarte folgt dem Spieler (auf 1 m gerastert gegen Flimmern)
    const sx = Math.round(focus.x), sz = Math.round(focus.z);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + this.sunOffset.x, this.sunOffset.y, sz + this.sunOffset.z);
    this.sun.target.updateMatrixWorld(); this.sky.position.copy(focus);
  }
}
