// Sun shadows: two cascades (a tight map around the player for crisp shadows close up, a wide one for the rest) made of two
// shadow-casting directional lights; atmosphere.js patches the shader chunks so the pair is looked up as one soft shadow (the first
// light is the sun itself, the second only carries the far map). Both shadow cameras are snapped to whole shadow-map texels, so the
// shadow edges stay put while the camera moves instead of shimmering, and the wide map is only redrawn when it has to be.
import * as THREE from 'three';
import { Q, onQuality } from './quality.js';
import { SUN_DIR, SUN_LIGHT_COLOR, SUN_INTENSITY, cascadesPatched } from './atmosphere.js';

const _fwd = new THREE.Vector3();
const _p = new THREE.Vector3();

// ---- who casts into which map ----
// Most casters (castles, trees) belong in both maps. Moving crowds and engines do not belong in the wide one: it is redrawn only about
// fifteen times a second and a small shadow that far away is not worth a draw call each. Those are registered as near-only and the rig
// switches their castShadow off while the wide map is drawn. A shadow proxy is a cheaper stand-in for a caster (a plainer model that
// shares its instance buffers): it is only visible while a shadow map is being drawn, never in the picture itself.
const casterList = (scene) => scene.userData.casters || (scene.userData.casters = []);
// obj keeps setting its own castShadow; `far` says whether it also casts into the wide map
export function limitShadow(scene, obj, far = false) {
  obj.userData.sh = { far, proxy: false, want: false };
  casterList(scene).push(obj);
  return obj;
}
// proxy: a mesh that casts instead of another one; its owner sets proxy.userData.on each frame to say whether it is needed
export function shadowProxy(scene, proxy, far = false) {
  proxy.castShadow = true;
  proxy.receiveShadow = false;
  proxy.visible = false;
  proxy.frustumCulled = false;
  proxy.userData.sh = { far, proxy: true, want: false };
  proxy.userData.on = false;
  casterList(scene).push(proxy);
  return proxy;
}
// three.js draws the shadow maps inside renderer.render: this brackets that so the casters can be switched per map (see ShadowRig.pass)
export function installShadowHooks(renderer) {
  const sm = renderer.shadowMap, orig = sm.render;
  if (orig.__rigHooked) return;
  const hooked = function (lights, scene, camera) {
    const rig = scene.userData.shadowRig;
    if (!rig) return orig.call(this, lights, scene, camera);
    rig.begin();
    try { return orig.call(this, lights, scene, camera); } finally { rig.end(); }
  };
  hooked.__rigHooked = true;
  sm.render = hooked;
}

export class ShadowRig {
  constructor(scene) {
    this.twoMaps = cascadesPatched;
    const sun = this.sun = new THREE.DirectionalLight(SUN_LIGHT_COLOR, SUN_INTENSITY);
    const far = this.far = new THREE.DirectionalLight(0xffffff, 0);
    sun.castShadow = true;
    far.castShadow = true;
    // one switch for both maps: tools and the quality code only ever touch lights.sun.castShadow
    Object.defineProperty(far, 'castShadow', { get: () => this.twoMaps && sun.castShadow, set: () => {}, configurable: true });
    if (!this.twoMaps) far.visible = false;
    sun.userData.rig = this;
    this.scene = scene;
    scene.userData.shadowRig = this;
    scene.add(sun, sun.target, far, far.target);
    // three.js calls updateMatrices on a light's shadow right before it draws that map: the near map comes first (the sun is added first)
    for (const [light, name] of [[sun, 'near'], [far, 'far']]) {
      const sh = light.shadow, proto = Object.getPrototypeOf(sh);
      sh.updateMatrices = (...args) => { this.pass(name); return proto.updateMatrices.apply(sh, args); };
    }
    // the shadow cameras look along the sun: their light-space axes never change, so the texel grid can be fixed in the world
    this.ax = new THREE.Vector3(0, 1, 0).cross(SUN_DIR).normalize();
    this.ay = new THREE.Vector3().crossVectors(SUN_DIR, this.ax);
    this.near = { light: sun, R: 25, map: 0, texel: 0.05 };
    this.farC = { light: far, R: 90, map: 0, texel: 0.1 };
    this.focusFar = new THREE.Vector3(1e9, 0, 1e9);
    this.farAge = 1e9;
    this.farInterval = 1 / 15;
    this.throttle = false;   // while gfx.renderFrame runs the far map is redrawn only now and then (a plain renderer.render keeps it fresh)
    this.lastFrameAt = -1e9;
    this.unsub = onQuality(() => this.apply());
  }

  // read the quality settings: map sizes, how far each map reaches, the filter, the biases
  apply() {
    const R = Math.max(30, Q.shadowDist || 90);
    const sun = this.sun, far = this.far;
    sun.castShadow = !!Q.shadows;   // (the far map follows: see the castShadow accessor above)
    this.farC.R = R;
    this.near.R = Math.max(14, Math.round(R * 0.28));
    for (const [c, size] of [[this.near, Q.shadowNearMap || Q.shadowMap], [this.farC, Q.shadowMap]]) {
      const sh = c.light.shadow;
      c.texel = (2 * c.R) / size;
      if (sh.mapSize.x !== size) {
        sh.mapSize.set(size, size);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
      }
      const dist = 120 + c.R;
      c.dist = dist;
      const cam = sh.camera;
      Object.assign(cam, { left: -c.R, right: c.R, top: c.R, bottom: -c.R, near: 5, far: dist + c.R * 1.6 + 60 });
      cam.updateProjectionMatrix();
      // the offsets are a fraction of a texel: sized to the map, so the near map can be as tight as it is sharp
      sh.bias = -(0.6 * c.texel) / (cam.far - cam.near);
      sh.normalBias = Math.min(0.12, 1.6 * c.texel);
    }
    // the filter settings travel in the per-light shadow uniforms (see atmosphere.js): taps and radius in texels
    const taps = Math.max(1, Math.min(16, Q.shadowTaps | 0 || 8));
    sun.shadow.radius = taps * 16 + Math.min(6, Math.max(1.1, 0.07 / this.near.texel));
    far.shadow.radius = Math.min(6, Math.max(1.1, 0.12 / this.farC.texel));
    this.farInterval = Q.level >= 3 ? 1 / 20 : 1 / 15;
    this.farAge = 1e9;
  }

  // centre a cascade on `focus`, rounded to whole texels along the light-space axes; returns whether the position changed
  snap(c, focus) {
    const t = c.texel, ax = this.ax, ay = this.ay;
    const cx = focus.dot(ax), cy = focus.dot(ay);
    const sx = Math.round(cx / t) * t, sy = Math.round(cy / t) * t;
    _p.copy(focus).addScaledVector(ax, sx - cx).addScaledVector(ay, sy - cy);
    const light = c.light;
    const moved = Math.abs(light.target.position.x - _p.x) + Math.abs(light.target.position.y - _p.y) + Math.abs(light.target.position.z - _p.z) > 1e-4;
    light.target.position.copy(_p);
    light.position.copy(_p).addScaledVector(SUN_DIR, c.dist);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
    return moved;
  }

  // focus: where the player is; ahead: a unit horizontal direction the player looks along (or null): the maps reach further that way
  place(focus, ahead = null) {
    const n = this.near, f = this.farC;
    _fwd.set(0, 0, 0);
    if (ahead) _fwd.copy(ahead);
    _p.copy(focus).addScaledVector(_fwd, n.R * 0.5);
    this.snap(n, _p);
    // the wide map follows with some hysteresis: it keeps its place until the ideal centre has moved a sixth of its reach
    _p.copy(focus).addScaledVector(_fwd, f.R * 0.12);
    const dx = _p.dot(this.ax) - this.focusFar.dot(this.ax), dy = _p.dot(this.ay) - this.focusFar.dot(this.ay);
    const d = Math.hypot(dx, dy);
    const sh = f.light.shadow;
    // keep the player (not just the ideal centre) well inside the wide map
    if (d > f.R * 0.15 || this.farAge > 1e8) {
      this.focusFar.copy(_p);
      this.snap(f, _p);
      sh.needsUpdate = true;
    }
  }

  // called once per rendered frame (gfx.js): places both maps for this camera and decides whether the wide one is redrawn
  update(camera, dt) {
    if (!this.sun.castShadow) return;
    camera.getWorldDirection(_fwd);
    const flat = Math.hypot(_fwd.x, _fwd.z);
    const ahead = flat > 0.2 ? new THREE.Vector3(_fwd.x / flat, 0, _fwd.z / flat) : null;
    this.focusTmp = this.focusTmp || new THREE.Vector3();
    this.focusTmp.copy(camera.position);
    this.focusTmp.y -= 1.5;
    this.place(this.focusTmp, ahead);
    const sh = this.far.shadow;
    this.throttle = true;
    this.lastFrameAt = performance.now();
    sh.autoUpdate = false;
    this.farAge += dt;
    if (this.farAge >= this.farInterval || sh.needsUpdate) { sh.needsUpdate = true; this.farAge = 0; }
  }

  // plain use (a renderer.render without gfx.js): every map redrawn each frame, centred on the focus
  follow(focus) {
    if (this.throttle && performance.now() - this.lastFrameAt > 500) { this.throttle = false; this.far.shadow.autoUpdate = true; }
    this.place(focus, null);
    if (!this.throttle) this.farAge = 0;
  }

  // a shadow phase starts: note what each registered caster wants (its owner decided that this frame)
  begin() {
    const list = this.scene.userData.casters;
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (!o.parent) { list.splice(i, 1); continue; }   // (removed from the scene: its owner built a new one)
      const sh = o.userData.sh;
      sh.want = sh.proxy ? !!o.userData.on : o.castShadow;
    }
  }

  // the map that is about to be drawn: 'near' or 'far'
  pass(name) {
    const list = this.scene.userData.casters;
    if (!list) return;
    const near = name === 'near';
    for (let i = 0; i < list.length; i++) {
      const o = list[i], sh = o.userData.sh, on = sh.want && (near || sh.far);
      if (sh.proxy) o.visible = on; else o.castShadow = on;
    }
  }

  // the shadow phase is over: the picture itself sees the casters as their owners left them
  end() {
    const list = this.scene.userData.casters;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const o = list[i], sh = o.userData.sh;
      if (sh.proxy) o.visible = false; else o.castShadow = sh.want;
    }
  }

  dispose() {
    if (this.scene.userData.shadowRig === this) delete this.scene.userData.shadowRig;
    this.unsub();
    this.sun.shadow.dispose();
    this.far.shadow.dispose();
  }
}
