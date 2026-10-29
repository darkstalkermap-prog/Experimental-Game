// Grass that grows around the camera: clumps of thin blades, in the colour of the ground they stand on, waving in the wind.
// One draw call for the grass and one for the wild flowers. Every clump is just a position, a turn, a size and a colour (a quarter of
// what a matrix costs), and the vertex shader does the rest: the wind bends the tips in waves that travel over the meadow, and clumps
// shrink to nothing towards the edge of the patch so it has no visible rim. The patch is rebuilt, deterministically, when the camera has
// moved far enough, a few milliseconds a frame, so walking never hitches. Q.grass is the density and Q.grassDist the radius.
import * as THREE from 'three';
import { CASTLE, PRACTICE } from './config.js';
import { CASTLE_SITES } from './physics.js';
import { roadDist } from './world.js';
import { mulberry32, smoothstep } from './noise.js';
import { Q } from './quality.js';
import { patchMaterial } from './shaderhook.js';
import { WIND, WIND_GLSL } from './foliage.js';
import { grassBase } from './terrain.js';
import { active } from './biomes.js';

function hash(x, z, s) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

// a clump: nine single-triangle blades, dark at the root and bright at the tip, leaning outwards (g: the biome's grass, see biomes.js: taller blades for the
// reeds of the marsh, frosted tips for the snow; the meadow's numbers are the game's old ones)
function clumpGeometry(g0 = active.def.grass) {
  const rng = mulberry32(5);
  const pos = [], col = [], nor = [];
  for (let b = 0; b < 9; b++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.27;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const yaw = rng() * Math.PI, cx = Math.cos(yaw), cz = Math.sin(yaw);
    const h = (0.3 + rng() * 0.4) * g0.height, w = (0.02 + rng() * 0.02) * g0.width, lean = (0.1 + rng() * 0.28) * h * g0.lean;
    const v = 0.88 + rng() * 0.24;
    pos.push(bx - cx * w, 0, bz - cz * w, bx + cx * w, 0, bz + cz * w, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    col.push(g0.root[0] * v, g0.root[1] * v, g0.root[2] * v, g0.root[0] * v, g0.root[1] * v, g0.root[2] * v, g0.tip[0] * v, g0.tip[1] * v, g0.tip[2] * v);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// a cattail clump of the marsh: three tall stems, each with a brown spike near the top (aKind 0 stem, 1 spike: its colour is the clump's tint)
function cattailGeometry() {
  const rng = mulberry32(23);
  const pos = [], col = [], nor = [], kind = [];
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) { col.push(1, 1, 1); nor.push(0, 1, 0); kind.push(k); } };
  for (let s = 0; s < 3; s++) {
    const a = rng() * Math.PI * 2, r = 0.05 + rng() * 0.15, bx = Math.cos(a) * r, bz = Math.sin(a) * r, h = 0.85 + rng() * 0.5;
    const tx = bx + Math.cos(a) * 0.08, tz = bz + Math.sin(a) * 0.08, w = 0.03, y0 = h - 0.22, y1 = h + 0.08;
    tri([bx - 0.012, 0, bz], [bx + 0.012, 0, bz], [tx, h, tz], 0);
    tri([tx - w, y0, tz], [tx + w, y0, tz], [tx + w * 0.5, y1, tz], 1); tri([tx - w, y0, tz], [tx + w * 0.5, y1, tz], [tx - w * 0.5, y1, tz], 1);
    tri([tx, y0, tz - w], [tx, y0, tz + w], [tx, y1, tz + w * 0.5], 1); tri([tx, y0, tz - w], [tx, y1, tz + w * 0.5], [tx, y1, tz - w * 0.5], 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  return g;
}

// a wild flower clump: three stems with a flat five-petal head each (aKind 0 stem, 1 petals, 2 the yellow middle)
function flowerGeometry(which = 'meadow') {
  if (which === 'cattail') return cattailGeometry();
  const rng = mulberry32(17);
  const pos = [], col = [], nor = [], kind = [];
  const tri = (a, b, c, k, n = [0, 1, 0]) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) { col.push(1, 1, 1); nor.push(...n); kind.push(k); } };
  for (let s = 0; s < 3; s++) {
    const a = rng() * Math.PI * 2, r = 0.05 + rng() * 0.13, bx = Math.cos(a) * r, bz = Math.sin(a) * r, h = 0.28 + rng() * 0.26;
    const tx = bx + Math.cos(a) * 0.07, tz = bz + Math.sin(a) * 0.07;
    tri([bx - 0.006, 0, bz], [bx + 0.006, 0, bz], [tx, h, tz], 0);
    const R = 0.042, n = 5;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + s, a1 = ((k + 1) / n) * Math.PI * 2 + s;
      tri([tx, h + 0.012, tz], [tx + Math.cos(a0) * R, h, tz + Math.sin(a0) * R], [tx + Math.cos(a1) * R, h, tz + Math.sin(a1) * R], 1);
    }
    const m = 0.014;
    tri([tx, h + 0.016, tz], [tx + m, h + 0.012, tz], [tx, h + 0.012, tz + m], 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  return g;
}

const VERT_DECL = `attribute vec4 aPos; attribute vec4 aTint; uniform float uFadeA; uniform float uFadeB;\n${WIND_GLSL}`;
// the blade in world space: turned, scaled, shrunk with distance and bent by the wind (the tips travel in waves over the meadow)
const VERT_BEGIN = `
  float cy = cos(aPos.w), sy = sin(aPos.w);
  float shrink = 1.0 - smoothstep(uFadeA, uFadeB, distance(aPos.xz, cameraPosition.xz));
  vec3 lp = position * (aTint.w * shrink);
  float hf = clamp(position.y / 0.7, 0.0, 1.0);
  float bend = (0.12 + 0.55 * gG) * hf * hf * 0.42 * shrink;
  vec3 transformed = vec3(aPos.x + cy * lp.x + sy * lp.z + 0.82 * bend, aPos.y + lp.y - bend * bend * 0.5, aPos.z - sy * lp.x + cy * lp.z + 0.57 * bend);`;

const uni = (shader, extra = {}) => {
  shader.uniforms.uWindTime = WIND.time; shader.uniforms.uWindAmp = WIND.amp;
  Object.assign(shader.uniforms, extra);
};

function grassMaterial(fade) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
  patchMaterial(m, 'grass-blades', (shader) => {
    uni(shader, fade);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  float gG = windGust(aPos.xz) * uWindAmp;\n  vColor = color.rgb * aTint.rgb * (0.9 + 0.2 * clamp(gG, 0.0, 1.3));')
      .replace('#include <begin_vertex>', VERT_BEGIN);
    // blades are seen from both sides: light them the same (the ground's own normal), not as a back face
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  });
  return m;
}

function flowerMaterial(fade) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  patchMaterial(m, 'grass-flowers', (shader) => {
    uni(shader, fade);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind;\n' + VERT_DECL)
      .replace('#include <color_vertex>', `#include <color_vertex>
  float gG = windGust(aPos.xz) * uWindAmp;
  vColor = aKind < 0.5 ? vec3(0.07, 0.17, 0.035) * (0.8 + 0.5 * position.y) : (aKind < 1.5 ? aTint.rgb : vec3(0.7, 0.45, 0.04));`)
      .replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  });
  return m;
}

const FLOWER_COLOURS = [[0.8, 0.8, 0.74], [0.8, 0.55, 0.04], [0.28, 0.1, 0.55], [0.8, 0.2, 0.3], [0.1, 0.18, 0.7], [0.85, 0.82, 0.3]];
const CATTAIL = [0.2, 0.1, 0.045];

export class Grass {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.radius = 44;
    this.max = 0;
    this.mesh = null;
    this.flowers = null;
    this.center = new THREE.Vector2(1e9, 1e9);
    this.fade = { uFadeA: { value: 30 }, uFadeB: { value: 44 } };
    this.material = grassMaterial(this.fade);
    this.flowerMat = flowerMaterial(this.fade);
    this.look = active.def.grass;
    this.geo = clumpGeometry(this.look);
    this.flowerGeo = flowerGeometry(this.look.flowers);
    this.sig = '';
    this.job = null;
    this.tint = { base: new THREE.Color() };
  }

  // (kept for the quality menu; the settings themselves come from Q)
  setDensity() { this.sig = ''; }

  configure() {
    this.radius = Q.grass > 0 ? Q.grassDist : 0;
    this.fade.uFadeA.value = this.radius * 0.7; this.fade.uFadeB.value = this.radius;
    const k = 1 / Math.sqrt(Math.max(0.35, Q.grass));
    this.spA = 0.42 * k; this.spB = 0.95 * k; this.RA = 13;
    // room for the dense inner disc and the sparser outer ring
    const cells = Math.PI * this.RA * this.RA / (this.spA * this.spA) + Math.PI * Math.max(0, this.radius * this.radius - 100) / (this.spB * this.spB);
    const max = this.radius ? Math.ceil(cells * 0.78) : 0;
    const fmax = this.radius && this.look.flowers !== 'none' ? Math.ceil(max * 0.05) : 0;
    this.center.set(1e9, 1e9);
    this.job = null;
    if (max === this.max && this.mesh) return;
    this.max = max;
    for (const key of ['mesh', 'flowers']) if (this[key]) { this.scene.remove(this[key]); this[key].geometry.dispose(); this[key] = null; }
    if (!max) return;
    this.mesh = this.build(this.geo, this.material, max);
    this.flowers = fmax ? this.build(this.flowerGeo, this.flowerMat, fmax) : null;
    this.stage = { a: new Float32Array(max * 4), t: new Float32Array(max * 4), fa: new Float32Array(fmax * 4), ft: new Float32Array(fmax * 4) };
  }

  // a mesh that draws `cap` instances of the clump geometry (its own copy of the geometry, so the instance buffers belong to it)
  build(src, mat, cap) {
    const g = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.userData.owner = 'a3 grass';
    this.scene.add(m);
    return m;
  }

  allowed(x, z) {
    for (const s of CASTLE_SITES) {
      const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      if (d < CASTLE.H + 9) return false;
    }
    if (roadDist(x, z) < 3.2) return false;
    if (Math.hypot(x, z) < 17) return false;
    const y = this.physics.practice;   // the practice yard has a bare floor
    if (y && Math.abs(x - y.x) < PRACTICE.hw + PRACTICE.wallT + 1 && Math.abs(z - y.z) < PRACTICE.hd + PRACTICE.wallT + 1) return false;
    return true;
  }

  // Rebuilding is spread over several frames (a small time budget each) into staging buffers, then swapped in.
  startRebuild(cx, cz) {
    const R = this.radius;
    const tier = (sp) => ({ sp, i: Math.floor((cx - R) / sp), i1: Math.floor((cx + R) / sp), j0: Math.floor((cz - R) / sp), j1: Math.floor((cz + R) / sp) });
    this.job = { cx, cz, n: 0, nf: 0, t: 0, tiers: [tier(this.spA), tier(this.spB)] };
  }

  work(budgetMs) {
    const job = this.job;
    if (!job) return;
    const t0 = performance.now();
    const R = this.radius, RA = this.RA, { cx, cz } = job;
    const { fbm } = this.physics.noise;
    const st = this.stage, col = this.tint.base;
    for (; job.t < 2; job.t++) {
      const T = job.tiers[job.t], sp = T.sp;
      for (; T.i <= T.i1; T.i++) {
        if (performance.now() - t0 > budgetMs) return;
        const i = T.i;
        for (let j = T.j0; j <= T.j1; j++) {
          const x = (i + hash(i, j, 1)) * sp, z = (j + hash(i, j, 2)) * sp;
          const d = Math.hypot(x - cx, z - cz);
          if (d > (job.t === 0 ? RA : R)) continue;
          // the dense inner disc thins out towards its rim while the sparser ring takes over (by a per-cell number, so nothing flickers)
          const mixv = smoothstep(RA - 5, RA + 1, d), r3 = hash(i, j, 3), r9 = hash(i, j, 9);
          if (job.t === 0 ? r9 < mixv : r9 >= mixv) continue;
          const dens = fbm(x * 0.05, z * 0.05, 2) * 0.5 + 0.62;
          if (r3 > dens * this.look.density) continue;
          if (!this.allowed(x, z)) continue;
          const y = this.physics.terrainHeight(x, z);
          // not on steep ground (the foot of the mountains is forest floor)
          const sl = Math.abs(this.physics.terrainHeight(x + 1.5, z) - this.physics.terrainHeight(x - 1.5, z)) + Math.abs(this.physics.terrainHeight(x, z + 1.5) - this.physics.terrainHeight(x, z - 1.5));
          if (sl > 2.2) continue;
          if (job.n >= this.max) continue;
          const size = (job.t === 0 ? 0.8 : 1.35) * (0.8 + hash(i, j, 4) * 0.5) * (1 - 0.5 * smoothstep(1.2, 2.2, sl));
          grassBase(this.physics.noise, x, z, y, col);
          const v = 0.82 + hash(i, j, 7) * 0.4, k = job.n * 4;
          st.a[k] = x; st.a[k + 1] = y - 0.02; st.a[k + 2] = z; st.a[k + 3] = hash(i, j, 5) * 6.2832;
          st.t[k] = col.r * v * 1.12; st.t[k + 1] = col.g * v * (0.96 + hash(i, j, 8) * 0.12) * 1.12; st.t[k + 2] = col.b * v * 0.95; st.t[k + 3] = size;
          job.n++;
          // wild flowers: in patches, and a few on their own
          const patch = fbm(x * 0.07 + 31, z * 0.07 - 17, 2) * 0.5 + 0.5;
          if (job.nf < st.fa.length / 4 && hash(i, j, 11) < (patch > 0.6 ? 0.16 : 0.012) * (job.t === 0 ? 1 : 1.6)) {
            const f = job.nf * 4, c = this.look.flowers === 'cattail' ? CATTAIL : FLOWER_COLOURS[Math.floor((patch * 7 + hash(i, j, 12) * 1.6) % FLOWER_COLOURS.length)];
            st.fa[f] = x + (hash(i, j, 13) - 0.5) * 0.3; st.fa[f + 1] = y - 0.02; st.fa[f + 2] = z + (hash(i, j, 14) - 0.5) * 0.3; st.fa[f + 3] = hash(i, j, 15) * 6.2832;
            st.ft[f] = c[0]; st.ft[f + 1] = c[1]; st.ft[f + 2] = c[2]; st.ft[f + 3] = 0.8 + hash(i, j, 16) * 0.5;
            job.nf++;
          }
        }
      }
    }
    // finished: swap the new patch in
    const set = (mesh, a, t, n) => {
      const g = mesh.geometry;
      g.attributes.aPos.array.set(a.subarray(0, n * 4)); g.attributes.aPos.needsUpdate = true;
      g.attributes.aTint.array.set(t.subarray(0, n * 4)); g.attributes.aTint.needsUpdate = true;
      g.instanceCount = n;
    };
    set(this.mesh, st.a, st.t, job.n);
    if (this.flowers) set(this.flowers, st.fa, st.ft, job.nf);
    this.job = null;
  }

  update(dt, camPos) {
    const sys = this.scene.userData.worldSystems;   // the terrain, trees and life of the world (see world.js) are driven from here
    if (sys) for (const s of sys) s.update(dt, camPos);
    WIND.time.value += dt;
    WIND.amp.value = Q.wind ? 1 : 0;
    const sig = `${Q.grass}|${Q.grassDist}`;
    if (sig !== this.sig) { this.sig = sig; this.configure(); }
    if (!this.mesh) return;
    if (!this.job && Math.hypot(camPos.x - this.center.x, camPos.z - this.center.y) > this.radius * 0.3) {
      const first = this.center.x > 1e8;
      this.center.set(camPos.x, camPos.z);
      this.startRebuild(camPos.x, camPos.z);
      if (first) this.work(Infinity); // the very first patch appears at once
    }
    this.work(1.5);
  }
}
