// Spell effects for the Mage's Fireball and the Cleric's Smite. Fireballs travel in a straight line to where the
// caster aims; walls, keeps and hills stop them. Smite is an instant bolt from the sky (see classes.js).
// Lightning is drawn as glowing ribbons that always face the camera: a jagged main path, side branches, a white core inside a
// coloured glow, and a flicker (bright, a dip, bright again, gone). All bolts share one pooled mesh built at start-up.
import * as THREE from 'three';
import { SPELLS } from './config.js';
import { FOG_ADD } from './particles.js';

const BOLTS = 8;        // bolts that can be on screen together
const SEGS = 120;       // segments per bolt: the main path and its branches
const LIFE = 0.36;

const VERT = `
uniform float uTime;
attribute vec3 aOther;   // the far end of this segment
attribute vec4 aInfo;    // side (-1 or 1), end (0 = start, 1 = finish), width in metres, birth time
attribute vec3 aCol;
varying float vSide;
varying vec3 vCol;
varying float vA;
#include <fog_pars_vertex>
void main() {
  float age = uTime - aInfo.w;
  if (age < 0.0 || age > ${LIFE.toFixed(2)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vSide = 0.0; vCol = vec3(0.0); vA = 0.0; return; }
  float f = age < 0.05 ? 1.0 : age < 0.09 ? 0.32 : age < 0.15 ? 1.0 : 1.0 - (age - 0.15) / ${(LIFE - 0.15).toFixed(2)};
  vec3 dir = normalize(aInfo.y > 0.5 ? position - aOther : aOther - position);
  vec3 view = normalize(position - cameraPosition);
  vec3 across = normalize(cross(dir, view));
  float w = aInfo.z * (0.7 + 0.5 * f) * (1.0 + length(position - cameraPosition) * 0.014);
  vec3 pos = position + across * aInfo.x * w + dir * (aInfo.y > 0.5 ? 0.5 : -0.5) * w;   // (a little overlap hides the joints)
  vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vSide = aInfo.x; vCol = aCol; vA = f;
  #include <fog_vertex>
}`;

const FRAG = `
varying float vSide;
varying vec3 vCol;
varying float vA;
#include <fog_pars_fragment>
void main() {
  float s = vSide;
  float core = exp(-s * s * 20.0);
  float glow = exp(-s * s * 3.0);
  vec3 rgb = mix(vCol * 1.5, vec3(2.2, 2.2, 2.4), core);
  float a = clamp((core + glow * 0.45) * vA, 0.0, 1.0);
  gl_FragColor = vec4(rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
${FOG_ADD}
}`;

const rr = (a, b) => a + (b - a) * Math.random();

export class Magic {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.flashColor = new THREE.Color();
    this.boltColor = new THREE.Color();
    this.bolts = [];     // the bolts still shining (their birth times; kept for the tests and for the camera shake)
    // (kept for the warm-up in Game, which compiles this material)
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xcfeaff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const n = BOLTS * SEGS * 4;
    this.pos = new Float32Array(n * 3);
    this.other = new Float32Array(n * 3);
    this.info = new Float32Array(n * 4);
    this.col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.info[i * 4 + 3] = -1e9;
    const idx = new Uint16Array(BOLTS * SEGS * 6);
    for (let s = 0; s < BOLTS * SEGS; s++) { const v = s * 4; idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], s * 6); }
    const geo = new THREE.BufferGeometry();
    const dyn = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', dyn(this.pos, 3));
    geo.setAttribute('aOther', dyn(this.other, 3));
    geo.setAttribute('aInfo', dyn(this.info, 4));
    geo.setAttribute('aCol', dyn(this.col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      name: 'lightning', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      uniforms: { uTime: { value: 0 }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'lightning';
    game.scene.add(this.mesh);
    this.next = 0;
    this.live = 0;
  }

  // caster: a Player. dir must be normalised.
  fireball(caster, from, dir, dmg, radius) {
    const s = SPELLS.fireball;
    this.game.projectiles.fireSpell('fireball', from, dir.clone().multiplyScalar(s.speed), caster.team, dmg, caster, radius);
    this.game.audio.play('fireball', from);
  }

  // one ribbon segment into slot k of bolt b
  seg(b, k, a, c, width, col) {
    const v = (b * SEGS + k) * 4;
    const born = this.t;
    const P = this.pos, O = this.other, I = this.info, C = this.col;
    for (let j = 0; j < 4; j++) {
      const end = j >> 1, own = end ? c : a, other = end ? a : c;
      const o = (v + j) * 3;
      P[o] = own.x; P[o + 1] = own.y; P[o + 2] = own.z;
      O[o] = other.x; O[o + 1] = other.y; O[o + 2] = other.z;
      C[o] = col.r; C[o + 1] = col.g; C[o + 2] = col.b;
      const q = (v + j) * 4;
      I[q] = j & 1 ? 1 : -1; I[q + 1] = end; I[q + 2] = width; I[q + 3] = born;
    }
  }

  // Jagged bolt through the given points; fades out quickly.
  showBolt(points, color = 0xcfeaff) {
    const g = this.game;
    this.boltColor.setHex(color);
    const col = this.boltColor;
    const glow = col.clone().lerp(new THREE.Color(1, 1, 1), 0.4);
    const b = this.next;
    this.next = (b + 1) % BOLTS;
    let k = 0;
    // a jagged path from a to z (each call has its own scratch vectors: a branch is a path of its own)
    const path = (a, z, width, branches) => {
      const D = new THREE.Vector3().subVectors(z, a);
      const len = D.length();
      if (len < 0.01) return;
      D.divideScalar(len);
      const U = new THREE.Vector3(D.y, -D.x, 0);
      if (U.lengthSq() < 0.01) U.set(0, D.z, -D.y);
      U.normalize();
      const V = new THREE.Vector3().crossVectors(D, U);
      const n = Math.max(2, Math.min(28, Math.ceil(len / 1.5)));
      const amp = Math.min(1.1, 0.2 + len * 0.025);
      const A = a.clone(), B = new THREE.Vector3();
      for (let i = 1; i <= n && k < SEGS; i++) {
        const env = i < n ? Math.sqrt(Math.sin(Math.PI * i / n)) : 0;
        const r1 = (Math.random() - 0.5) * 2 * amp * env, r2 = (Math.random() - 0.5) * 2 * amp * env;
        B.copy(a).addScaledVector(D, len * i / n).addScaledVector(U, r1).addScaledVector(V, r2);
        this.seg(b, k++, A, B, width, col);
        // glowing motes along the path give it body
        if (i % 2 === 0) g.fx.flash(B, glow, 0.9, 0.2, 0.35);
        // a side branch now and then: a shorter, thinner jagged path that wanders off
        if (branches && i < n - 1 && i > 1 && Math.random() < 0.2 && k < SEGS - 8) {
          const bl = rr(2, 6) * Math.min(1.6, 0.5 + len / 25);
          const dir = new THREE.Vector3(rr(-1, 1), rr(-1.1, 0.3), rr(-1, 1)).addScaledVector(D, 0.6).normalize();
          path(B.clone(), B.clone().addScaledVector(dir, bl), width * 0.5, false);
        }
        A.copy(B);
      }
    };
    for (let i = 0; i < points.length - 1; i++) {
      path(points[i], points[i + 1], 0.1, true);
      g.fx.zap(points[i + 1], 8);
    }
    // the rest of the bolt's slots are empty
    for (; k < SEGS; k++) { const v = (b * SEGS + k) * 4; for (let j = 0; j < 4; j++) this.info[(v + j) * 4 + 3] = -1e9; }
    for (const n of ['position', 'aOther', 'aInfo', 'aCol']) this.geo.attributes[n].needsUpdate = true;
    this.geo.setDrawRange(0, BOLTS * SEGS * 6);
    this.live = this.t + LIFE;
    this.bolts.push({ t: LIFE, b });
    const end = points[points.length - 1];
    this.flash(end, color, 6);
    g.fx.scorch(end, 0.8);
    if (g.camfx) g.camfx.boom(end, 0.45);
    if (this.onBolt) this.onBolt(points, color);
  }

  // A bright glow burst. (A real light would add lighting cost to every surface on screen.)
  flash(pos, color, intensity) {
    this.flashColor.setHex(color);
    this.game.fx.flash(pos, this.flashColor, intensity * 0.9, 0.22, 0.6);
  }

  update(dt) {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      if (b.t <= 0) this.bolts.splice(i, 1);
    }
    if (this.live && this.t > this.live) { this.live = 0; this.geo.setDrawRange(0, 0); }
  }
}
