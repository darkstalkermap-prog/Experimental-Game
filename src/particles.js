// The GPU side of the effects: two pooled layers of camera-facing sprites and one pooled layer of ground decals. Every particle is
// written once when it is born (where, how fast, how long, how big, which picture, which colour ramp) and the vertex shader works
// out the rest from the age: position under drag and gravity, size, rotation, colour and opacity over life. So the CPU does no
// per-frame work for a particle and only the freshly written part of the buffer is uploaded. A layer is one draw call.
import * as THREE from 'three';
import { atlasTexture, rampTexture, decalTexture, RAMP_ROWS } from './fxtex.js';

// floats per particle (see the vertex shader for what each group means)
const S = 24;
const T0 = 3, LIFE = 7;

const VERT = `
uniform float uTime;
uniform sampler2D uRamp;
uniform float uRampRows;
uniform vec3 uLight;
attribute vec4 aPos;    // xyz where it was born, w when
attribute vec4 aVel;    // xyz how fast it left, w how long it lives
attribute vec4 aSize;   // size at birth, size at death, rotation at birth, spin
attribute vec4 aStyle;  // atlas layer, ramp row, streak length (seconds of travel; 0 = plain sprite), drag
attribute vec4 aTint;   // colour multiplier rgb, opacity multiplier
attribute vec4 aPhys;   // gravity (negative rises), swirl, growth easing, unused
varying vec3 vUv;
varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  float age = uTime - aPos.w;
  float life = aVel.w;
  float k = age / life;
  if (age < 0.0 || k >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec3(0.0); vCol = vec4(0.0); return; }
  float drag = aStyle.w;
  float travel = drag > 0.001 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 pos = aPos.xyz + aVel.xyz * travel;
  pos.y -= 0.5 * aPhys.x * age * age;
  if (aPhys.y != 0.0) {
    float ph = aPos.x * 12.9898 + aPos.z * 78.233 + aPos.w * 37.719;
    pos += aPhys.y * k * vec3(sin(age * 1.7 + ph), 0.35 * sin(age * 2.3 + ph * 1.3), cos(age * 1.9 + ph * 0.7));
  }
  float e = aPhys.z;
  float kk = e > 0.0 ? pow(k, 1.0 + e) : 1.0 - pow(1.0 - k, 1.0 - e);
  float size = mix(aSize.x, aSize.y, kk);
  vec4 rc = texture2D(uRamp, vec2(k, (aStyle.y + 0.5) / uRampRows));
  vec4 col = vec4(rc.rgb * aTint.rgb, rc.a * aTint.a);
  #ifndef ADDITIVE
    col.rgb *= uLight;
  #endif
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vec2 c = position.xy;
  vec2 offs;
  if (aStyle.z > 0.0) {
    // a streak: the head sits at the particle, the tail trails back along its flight on screen
    vec3 vel = aVel.xyz * exp(-drag * age);
    vel.y -= aPhys.x * age;
    vec3 vv = mat3(modelViewMatrix) * vel;
    float l2 = length(vv.xy);
    vec2 d = l2 > 1e-4 ? vv.xy / l2 : vec2(1.0, 0.0);
    float len = size + aStyle.z * l2;
    float along = (c.x + 0.5) * (len + 0.5 * size) - len;
    offs = d * along + vec2(-d.y, d.x) * (c.y * size);
  } else {
    float ang = aSize.z + aSize.w * age;
    float cs = cos(ang), sn = sin(ang);
    offs = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) * size;
  }
  mvPosition.xy += offs;
  float dz = -mvPosition.z;
  col.a *= smoothstep(0.3, 1.6, dz);   // nothing pops in front of the lens
  vUv = vec3(c + 0.5, aStyle.x);
  vCol = col;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
uniform sampler2DArray uAtlas;
varying vec3 vUv;
varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture(uAtlas, vUv);
  float a = t.r * vCol.a;
  if (a < 0.004) discard;
  vec3 rgb = vCol.rgb;
  #ifdef ADDITIVE
    rgb *= 0.65 + 0.9 * t.g * t.g;
  #else
    rgb *= 0.4 + 0.78 * t.g;
  #endif
  gl_FragColor = vec4(rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef ADDITIVE
    #ifdef USE_FOG
      vec3 keep = gl_FragColor.rgb;
      gl_FragColor.rgb = vec3(0.0);
      {
      #include <fog_fragment>
      }
      float fogBlack = gl_FragColor.g;
      gl_FragColor.rgb = vec3(1.0);
      {
      #include <fog_fragment>
      }
      gl_FragColor.rgb = keep * clamp(gl_FragColor.g - fogBlack, 0.0, 1.0);
    #endif
  #else
    #include <fog_fragment>
  #endif
}`;

function fogUniforms() { return THREE.UniformsUtils.clone(THREE.UniformsLib.fog); }

export class ParticleLayer {
  // clock: { t } shared by every layer of one FX (seconds, advanced by the game's own dt so hit-stop slows the effects too)
  constructor(scene, clock, { max, additive, order, name }) {
    this.max = max;
    this.clock = clock;
    this.data = new Float32Array(max * S);
    this.next = 0;
    this.hw = 0;                 // slots that have ever been written (the draw covers just those until the ring wraps)
    this.lo = max; this.hi = -1; // the freshly written range, still to upload
    this.liveUntil = 0;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, S, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    const attr = (n, off) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buf, 4, off));
    attr('aPos', 0); attr('aVel', 4); attr('aSize', 8); attr('aStyle', 12); attr('aTint', 16); attr('aPhys', 20);
    geo.instanceCount = 0;
    this.buf = buf;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      name: 'fx-' + name,
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: additive ? { ADDITIVE: '' } : {},
      uniforms: {
        uTime: { value: 0 }, uAtlas: { value: atlasTexture() }, uRamp: { value: rampTexture() }, uRampRows: { value: RAMP_ROWS },
        uLight: { value: new THREE.Vector3(1, 1, 1) }, ...fogUniforms(),
      },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.mesh.name = 'fx-' + name;
    scene.add(this.mesh);
  }

  // Write a particle; returns its offset in `data` for the setters below. Everything not given here starts neutral.
  spawn(frame, ramp, x, y, z, vx, vy, vz, life, s0, s1) {
    const i = this.next;
    this.next = i + 1 === this.max ? 0 : i + 1;
    if (i + 1 > this.hw) this.hw = i + 1;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    const d = this.data, o = i * S, t = this.clock.t;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = t;
    d[o + 4] = vx; d[o + 5] = vy; d[o + 6] = vz; d[o + 7] = life;
    d[o + 8] = s0; d[o + 9] = s1; d[o + 10] = 0; d[o + 11] = 0;
    d[o + 12] = frame; d[o + 13] = ramp; d[o + 14] = 0; d[o + 15] = 0;
    d[o + 16] = 1; d[o + 17] = 1; d[o + 18] = 1; d[o + 19] = 1;
    d[o + 20] = 0; d[o + 21] = 0; d[o + 22] = 0; d[o + 23] = 0;
    if (t + life > this.liveUntil) this.liveUntil = t + life;
    return o;
  }
  tint(o, r, g, b, a = 1) { const d = this.data; d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = a; }
  spin(o, rot, spin = 0) { this.data[o + 10] = rot; this.data[o + 11] = spin; }
  streak(o, stretch) { this.data[o + 14] = stretch; }
  motion(o, drag = 0, grav = 0, swirl = 0, ease = 0) { const d = this.data; d[o + 15] = drag; d[o + 20] = grav; d[o + 21] = swirl; d[o + 22] = ease; }

  // end a particle early (its slot may have been reused by now: pass the birth time you saw from `born`)
  born(o) { return this.data[o + T0]; }
  kill(o, born) {
    const d = this.data;
    if (d[o + T0] !== born) return;
    d[o + T0] = 1e30;
    const i = o / S;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  // once a frame: send what was written, hide the layer while it is empty
  update(time, light) {
    const m = this.mat.uniforms;
    m.uTime.value = time;
    if (light) m.uLight.value.copy(light);
    if (this.hi >= this.lo) {
      this.buf.clearUpdateRanges();
      this.buf.addUpdateRange(this.lo * S, (this.hi - this.lo + 1) * S);
      this.buf.needsUpdate = true;
      this.lo = this.max; this.hi = -1;
    }
    this.geo.instanceCount = this.hw;
    this.mesh.visible = time < this.liveUntil && this.hw > 0;
  }

  // keep the clock small (float precision): called when the shared clock is rebased by `by` seconds
  rebase(by) {
    const d = this.data;
    for (let o = T0; o < d.length; o += S) if (d[o] < 1e29) d[o] -= by;
    this.liveUntil -= by;
    this.lo = 0; this.hi = this.max - 1;
  }

  clear() {
    this.data.fill(0);
    for (let o = T0; o < this.data.length; o += S) this.data[o] = 1e30;
    this.next = 0; this.hw = 0; this.lo = 0; this.hi = this.max - 1; this.liveUntil = 0;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ---------- ground decals ----------
const DV = `
uniform float uTime;
uniform vec3 uLight;
attribute vec4 aPlace;   // x, z, angle, size
attribute vec4 aH;       // ground height at the four corners
attribute vec4 aLife;    // born, lives, layer, unused
attribute vec4 aCol;     // rgb, opacity
varying vec3 vUv;
varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  float age = uTime - aLife.x;
  float k = age / aLife.y;
  if (age < 0.0 || k >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec3(0.0); vCol = vec4(0.0); return; }
  float cs = cos(aPlace.z), sn = sin(aPlace.z);
  vec2 c = position.xy;
  float idx = position.z;
  float h = idx < 0.5 ? aH.x : idx < 1.5 ? aH.y : idx < 2.5 ? aH.z : aH.w;
  vec3 world = vec3(aPlace.x + (cs * c.x - sn * c.y) * aPlace.w, h + 0.03, aPlace.y + (sn * c.x + cs * c.y) * aPlace.w);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  float fade = (1.0 - smoothstep(0.72, 1.0, k)) * smoothstep(0.0, 0.015, age);
  vCol = vec4(aCol.rgb * uLight * mix(1.0, 0.62, smoothstep(0.0, 0.5, k)), aCol.a * fade);   // it dries and darkens
  vUv = vec3(c + 0.5, aLife.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const DF = `
uniform sampler2DArray uAtlas;
varying vec3 vUv;
varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture(uAtlas, vUv);
  float a = t.r * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * (0.75 + 0.5 * t.g), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const DS = 16;
export class DecalLayer {
  constructor(scene, clock, max) {
    this.max = max;
    this.cap = max;     // how many of the slots the quality allows
    this.clock = clock;
    this.data = new Float32Array(max * DS);
    this.next = 0; this.hw = 0; this.lo = max; this.hi = -1; this.liveUntil = 0;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 1, 0.5, 0.5, 2, -0.5, 0.5, 3], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, DS, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    const attr = (n, off) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buf, 4, off));
    attr('aPlace', 0); attr('aH', 4); attr('aLife', 8); attr('aCol', 12);
    geo.instanceCount = 0;
    this.buf = buf; this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      name: 'fx-decals',
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,   // (lying on the ground, the quad faces up or down by its winding)
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uTime: { value: 0 }, uAtlas: { value: decalTexture() }, uLight: { value: new THREE.Vector3(1, 1, 1) }, ...fogUniforms() },
      vertexShader: DV, fragmentShader: DF,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.mesh.name = 'fx-decals';
    scene.add(this.mesh);
  }

  // heights: ground height under the four corners, in the order (-,-) (+,-) (+,+) (-,+) of the unrotated quad
  add(x, z, angle, size, h0, h1, h2, h3, life, layer, r, g, b, a) {
    let i = this.next;
    if (i >= this.cap) i = 0;
    this.next = i + 1;
    if (i + 1 > this.hw) this.hw = i + 1;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    const d = this.data, o = i * DS, t = this.clock.t;
    d[o] = x; d[o + 1] = z; d[o + 2] = angle; d[o + 3] = size;
    d[o + 4] = h0; d[o + 5] = h1; d[o + 6] = h2; d[o + 7] = h3;
    d[o + 8] = t; d[o + 9] = life; d[o + 10] = layer; d[o + 11] = 0;
    d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = a;
    if (t + life > this.liveUntil) this.liveUntil = t + life;
  }

  update(time, light) {
    const m = this.mat.uniforms;
    m.uTime.value = time;
    if (light) m.uLight.value.copy(light);
    if (this.hi >= this.lo) {
      this.buf.clearUpdateRanges();
      this.buf.addUpdateRange(this.lo * DS, (this.hi - this.lo + 1) * DS);
      this.buf.needsUpdate = true;
      this.lo = this.max; this.hi = -1;
    }
    this.geo.instanceCount = Math.min(this.hw, this.max);
    this.mesh.visible = time < this.liveUntil && this.hw > 0;
  }

  rebase(by) {
    const d = this.data;
    for (let o = 8; o < d.length; o += DS) d[o] -= by;
    this.liveUntil -= by;
    this.lo = 0; this.hi = this.max - 1;
  }

  clear() { this.data.fill(0); for (let o = 9; o < this.data.length; o += DS) this.data[o] = 1; this.next = 0; this.hw = 0; this.liveUntil = 0; this.lo = 0; this.hi = this.max - 1; }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
