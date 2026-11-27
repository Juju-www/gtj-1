// First-Person-Waffe: lädt die ORIGINAL-FBX (M4 + Hände + 6 Animationen), richtet sie an der eingebauten
// FPS_Camera aus und ergänzt prozedurale Bewegung (Sway, Bob, Sprint-Pose, ADS, Rückstoß).
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { S } from '../settings/settings.js';

const BASE = new URL('../../assets/weapons/m4/', import.meta.url).href;   // funktioniert auf Server UND unter GitHub-Pages-Unterpfad
// Der FBX-Export verweist auf Pfade des Erstellers (D:\...\*.tga) – hier auf die mitgelieferten PNG/JPG umgeleitet.
const TEX_REDIRECT = {
  'M4_D.tga': 'M4_D.png', 'Bullet5.56x45mm_D.tga': 'Bullet5.56x45mm_D.png',
  'T_Body_normal.png': 'Hand_N.png', 'T_Glove_normal.png': 'Glove_N.png',
};
const CAM_JOINT_FALLBACK = new THREE.Vector3(1.0927, 153.929, -10.057);   // cm, aus der Datei ausgelesen
export const ADS_OFFSET = new THREE.Vector3(-0.071, -0.002, 0.0);         // Waffe zur Bildmitte (Meter, Kamera-Raum)
export const MUZZLE_HIP = new THREE.Vector3(0.071, -0.077, -0.733);       // Mündung im Hüft-Anschlag

const loadTex = (url, srgb) => {
  const t = new THREE.TextureLoader().load(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
};

export class ViewModel {
  constructor(envMap) {
    this.scene = new THREE.Scene();
    this.scene.environment = envMap || null;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555560, 1.5));
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.2); sun.position.set(0.5, 1, 0.7); this.scene.add(sun);

    this.rig = new THREE.Group(); this.scene.add(this.rig);
    this.pivot = new THREE.Group(); this.pivot.rotation.y = Math.PI; this.rig.add(this.pivot);   // Modell zeigt +Z, Kamera blickt -Z
    this.holder = new THREE.Group(); this.holder.scale.setScalar(0.01); this.pivot.add(this.holder); // cm -> m

    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,248,210,1)'); gr.addColorStop(0.35, 'rgba(255,170,60,0.85)'); gr.addColorStop(1, 'rgba(255,110,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    this.flash.position.copy(MUZZLE_HIP); this.flash.visible = false; this.flashT = 0;
    this.flashLight = new THREE.PointLight(0xffaa55, 0, 2.5); this.flashLight.position.copy(MUZZLE_HIP);
    this.rig.add(this.flash, this.flashLight);

    this.loaded = false; this.clips = {}; this.actions = {}; this.current = null; this.mixer = null;
    this.sway = new THREE.Vector2(); this.bobT = 0; this.kickZ = 0; this.kickRot = 0; this.sprintBlend = 0; this.time = 0;
    this.onFinish = null; this.visible = true;
  }

  async load(onProgress) {
    const mgr = new THREE.LoadingManager();
    mgr.setURLModifier(url => {
      if (!url.startsWith(BASE) || url.endsWith('.fbx')) return url;
      const name = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
      return BASE + 'textures/' + (TEX_REDIRECT[name] || name);
    });
    mgr.addHandler(/\.tga$/i, new THREE.TextureLoader(mgr));   // .tga wird per URL-Modifier auf .png umgeleitet
    const fbx = await new FBXLoader(mgr).loadAsync(BASE + 'M4.fbx', e => e.total && onProgress?.(e.loaded / e.total));

    // Materialien: Original-Texturen (Diffuse + Normal) als PBR
    const T = BASE + 'textures/';
    const mats = {
      M4: new THREE.MeshStandardMaterial({ map: loadTex(T + 'M4_D.png', true), normalMap: loadTex(T + 'M4_N.png'), roughness: 0.5, metalness: 0.55, envMap: this.scene.environment, envMapIntensity: 0.8 }),
      Hand: new THREE.MeshStandardMaterial({ map: loadTex(T + 'Hand_D.jpg', true), normalMap: loadTex(T + 'Hand_N.png'), roughness: 0.75, metalness: 0 }),
      Glove: new THREE.MeshStandardMaterial({ map: loadTex(T + 'Glove_D.png', true), normalMap: loadTex(T + 'Glove_N.png'), roughness: 0.9, metalness: 0, transparent: false }),
      Bullet: new THREE.MeshStandardMaterial({ map: loadTex(T + 'Bullet5.56x45mm_D.png', true), normalMap: loadTex(T + 'Bullet5.56x45mm_N.png'), roughness: 0.35, metalness: 0.9, envMap: this.scene.environment }),
    };
    const pick = name => (/glove/i.test(name) ? mats.Glove : /hand|body/i.test(name) ? mats.Hand : /bullet/i.test(name) ? mats.Bullet : mats.M4);
    fbx.traverse(o => {
      if (!(o.isMesh || o.isSkinnedMesh)) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
      const src = Array.isArray(o.material) ? o.material : [o.material];
      const out = src.map(m => pick(m?.name || o.name));
      o.material = Array.isArray(o.material) ? out : out[0];
    });

    // Kamera-Gelenk der Datei = Augenposition -> Modell so verschieben, dass es im Ursprung liegt
    fbx.updateMatrixWorld(true);
    const joint = fbx.getObjectByName('FPS_Camera_j');
    let c = joint ? new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld) : CAM_JOINT_FALLBACK.clone();
    if (!(c.y > 100 && c.y < 200)) c = CAM_JOINT_FALLBACK.clone();
    fbx.position.sub(c);
    this.holder.add(fbx);
    this.model = fbx;

    // Animationen: Die Takes liegen im FBX hintereinander auf einer Zeitleiste -> jeden Clip auf 0 s verschieben
    this.mixer = new THREE.AnimationMixer(fbx);
    for (const clip of fbx.animations) {
      const mn = Math.min(...clip.tracks.map(t => t.times[0]));
      if (Number.isFinite(mn) && mn > 1e-4) clip.tracks.forEach(t => { t.times = t.times.map(x => x - mn); });
      clip.resetDuration();
      this.clips[clip.name.toLowerCase()] = clip;
    }
    const need = ['idle', 'fire', 'reload', 'reload_empty', 'draw', 'holster'];
    this.missing = need.filter(n => !this.clips[n]);
    if (this.missing.length) console.warn('[ViewModel] Fehlende Animationen:', this.missing, 'vorhanden:', Object.keys(this.clips));
    this.mixer.addEventListener('finished', e => {
      if (e.action !== this.current) return;
      const cb = this.onFinish; this.onFinish = null; this._toIdle(0.12); cb?.();
    });
    this._toIdle(0);
    this.loaded = true;
  }

  _action(name) {
    if (!this.actions[name] && this.clips[name]) this.actions[name] = this.mixer.clipAction(this.clips[name]);
    return this.actions[name];
  }
  _switchTo(next, fade, once) {
    if (!next) return;
    const prev = this.current;
    next.reset(); next.enabled = true; next.setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = !!once;
    if (prev && prev !== next && fade > 0) next.crossFadeFrom(prev, fade, false); else if (prev && prev !== next) prev.stop();
    next.play(); this.current = next;
  }
  _toIdle(fade) { this._switchTo(this._action('idle'), fade, false); }

  /** Einmal-Animation abspielen. scale = Abspielgeschwindigkeit. Rückgabe: Dauer in Sekunden. */
  playOnce(name, { scale = 1, fade = 0.06, onDone = null } = {}) {
    const a = this._action(name); if (!a) { onDone?.(); return 0; }
    a.setEffectiveTimeScale(scale); this.onFinish = onDone; this._switchTo(a, fade, true);
    return this.clips[name].duration / scale;
  }
  clipDuration(name) { return this.clips[name]?.duration || 0; }
  cancel() { this.onFinish = null; this._toIdle(0.1); }

  fireFlash() {
    this.flash.visible = true; this.flash.scale.setScalar(0.16 + Math.random() * 0.1); this.flash.material.rotation = Math.random() * 6.28;
    this.flashLight.intensity = 3; this.flashT = 0.045;
  }
  kick(ads) { this.kickZ += 0.018 * (1 - 0.5 * ads); this.kickRot += 0.02 * (1 - 0.5 * ads); }

  /** ctx: {speed, onGround, sprint(0/1), ads(0..1), crouch, lookX, lookY, land} */
  update(dt, ctx) {
    this.time += dt;
    this.mixer?.update(dt);
    const ads = ctx.ads, fx = S.cameraEffects ? 1 : 0.3;

    // Sway (Trägheit bei Kamerabewegung)
    this.sway.x = THREE.MathUtils.clamp(this.sway.x - ctx.lookX * 0.00055, -0.06, 0.06);
    this.sway.y = THREE.MathUtils.clamp(this.sway.y - ctx.lookY * 0.00055, -0.05, 0.05);
    const decay = Math.exp(-9 * dt); this.sway.multiplyScalar(decay);

    // Bob + Atmen
    const moving = ctx.onGround && ctx.speed > 0.4;
    this.bobT += dt * (moving ? ctx.speed * 1.55 : 0);
    const amp = (1 - 0.8 * ads) * fx * (1 + ctx.sprint * 1.4);
    const bx = moving ? Math.cos(this.bobT) * 0.0065 * amp : 0, by = moving ? Math.abs(Math.sin(this.bobT)) * 0.009 * amp : 0;
    const breathe = Math.sin(this.time * 1.4) * 0.0012 * (1 - ads * 0.7) * fx;

    // Sprint-Pose
    const sTarget = ctx.sprint; this.sprintBlend += (sTarget - this.sprintBlend) * Math.min(1, dt * 9);
    const sb = this.sprintBlend;

    this.kickZ *= Math.exp(-16 * dt); this.kickRot *= Math.exp(-14 * dt);
    const r = this.rig;
    r.position.set(
      ADS_OFFSET.x * ads + bx + 0.05 * sb,
      ADS_OFFSET.y * ads + by * -1 + breathe - 0.045 * sb - (ctx.land || 0) * 0.04 - (ctx.crouch ? 0.012 : 0),
      ADS_OFFSET.z * ads + this.kickZ + 0.02 * sb);
    r.rotation.set(this.sway.y * (1 - 0.6 * ads) - 0.22 * sb + this.kickRot, this.sway.x * (1 - 0.6 * ads) + 0.35 * sb, bx * 2 + this.sway.x * 0.4);

    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; } }
  }

  /** Mündungsposition in Weltkoordinaten (für Tracer/Rauch) */
  muzzleWorld(camera, ads) {
    return camera.localToWorld(MUZZLE_HIP.clone().addScaledVector(ADS_OFFSET, ads));
  }
  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
}
