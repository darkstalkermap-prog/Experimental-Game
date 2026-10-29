// Things on a castle that move by themselves, all of it driven by one shared clock in the vertex or fragment shader (no per-frame
// work on the CPU): cloth that waves in the wind (banners, flags, pennants) and, further down, flames, glow and smoke.
import * as THREE from 'three';
import { patchMaterial } from './shaderhook.js';
import { Q } from './quality.js';
import { F, R } from './fxtex.js';

// the wind: one clock for every cloth; `amp` is 0 when the quality setting has the wind off
export const WIND = { time: { value: 0 }, amp: { value: 1 } };
export function updateWind(time) {
  WIND.time.value = time;
  WIND.amp.value = Q.wind ? 1 : 0;
}

// ---------------------------------------------------------------- cloth
// Built from grids of vertices that know how far they are from the edge that is pinned (a pole, a rod): that edge stays put and the
// far end flutters. Per vertex: cloth = (weight 0..1, phase, tag, amplitude in metres), aDir = the way the cloth streams.
// tag 1 = pieces that burn away when the keep falls (cwFall = 1 hides them and darkens the rest).
export class Cloth {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.cl = []; this.dir = []; this.idx = []; }

  // A rectangle from corner p0 with edge vectors u and v (normal = u x v). pin: 'left' (at u = 0), 'top' (at v = 1), or 'both' (rod and hem hang free).
  // uvRect = [u0, v0, u1, v1] in the texture; amp = how far the free end swings, in metres.
  rect(p0, u, v, pin = 'left', { segU = 8, segV = 2, uvRect = [0, 0, 1, 1], amp = 0.3, tag = 0, phase = Math.random() * 6.28 } = {}) {
    const base = this.pos.length / 3;
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    const ul = Math.hypot(u[0], u[1], u[2]) || 1, vl = Math.hypot(v[0], v[1], v[2]) || 1;
    const free = pin === 'left' ? [u[0] / ul, u[1] / ul, u[2] / ul] : [-v[0] / vl, -v[1] / vl, -v[2] / vl];
    for (let j = 0; j <= segV; j++) for (let i = 0; i <= segU; i++) {
      const a = i / segU, b = j / segV;
      this.pos.push(p0[0] + u[0] * a + v[0] * b, p0[1] + u[1] * a + v[1] * b, p0[2] + u[2] * a + v[2] * b);
      this.nor.push(nx / nl, ny / nl, nz / nl);
      this.uv.push(uvRect[0] + (uvRect[2] - uvRect[0]) * a, uvRect[1] + (uvRect[3] - uvRect[1]) * b);
      const w = pin === 'left' ? a : pin === 'top' ? 1 - b : Math.sin(b * Math.PI) * 0.5;
      this.cl.push(w, phase, tag, amp);
      this.dir.push(free[0], free[1], free[2]);
    }
    for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
      const a = base + j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      this.idx.push(a, b, d, a, d, c);
    }
  }

  // a flag on a pole: from the pole at p it streams along +x, `size` high and 1.8 x as long (plain field colour from the banner texture)
  flag(p, size, tag = 0) {
    this.rect(p, [size * 1.8, 0, 0], [0, size, 0], 'left', { segU: 8, segV: 2, uvRect: [0.012, 0.35, 0.04, 0.65], amp: size * 0.32, tag });
  }

  empty() { return this.idx.length === 0; }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('cloth', new THREE.Float32BufferAttribute(this.cl, 4));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(this.dir, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    // the cloth moves a little: pad the bounds so it is never culled while still on screen
    g.boundingSphere.radius += 2;
    return g;
  }
}

// A cloth material for one castle (its own, so that a fallen keep can scorch it): the team's banner texture, waving in the wind.
// `fall` (a uniform you keep) is 0 normally and 1 once the keep has fallen.
export function clothMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.5 });
  const fall = { value: 0 };
  m.userData.cwFall = fall;
  patchMaterial(m, 'cwCloth', (shader) => {
    shader.uniforms.cwTime = WIND.time;
    shader.uniforms.cwAmp = WIND.amp;
    shader.uniforms.cwFall = fall;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 cloth;
        attribute vec3 aDir;
        uniform float cwTime;
        uniform float cwAmp;
        uniform float cwFall;
        varying float vCwFall;
        float cwWave;
        float cwSlope;
        void cwCompute() {
          float w = cloth.x, ph = cloth.y;
          float t = cwTime;
          float gust = 0.72 + 0.28 * sin(t * 0.55 + ph * 0.37);
          float a = (w * w * 0.6 + w * 0.4) * cloth.w * cwAmp * gust;
          float k1 = w * 6.0 - t * 3.3 + ph, k2 = w * 13.0 - t * 5.4 + ph * 1.9;
          cwWave = (sin(k1) * 0.62 + sin(k2) * 0.24 + 0.2) * a;
          cwSlope = (cos(k1) * 6.0 * 0.62 + cos(k2) * 13.0 * 0.24) * a * 0.5;
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        cwCompute();
        objectNormal = normalize(objectNormal - aDir * cwSlope);
        vCwFall = cwFall;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += normal * cwWave;
        if (cloth.z > 0.5 && cwFall > 0.5) transformed = vec3(0.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCwFall;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.3, vCwFall);');
  });
  return m;
}

// ---------------------------------------------------------------- fire, glow and smoke
// Torches, braziers, cooking fires and chimneys are billboards of one shared material that animates itself from the clock (flicker, the
// way smoke rises and fades): no dynamic lights and no per-frame work. Each source is [kind, x, y, z, size, phase]: kind 0 flame
// (the point is its middle), 1 a soft glow, 2 smoke (a puff that loops: x y z is where it starts).
let FIRE = null;
export function fireMaterial() {
  if (FIRE) return FIRE;
  FIRE = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  patchMaterial(FIRE, 'cwFire', (shader) => {
    shader.uniforms.cwTime = WIND.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 corner;
        attribute vec4 fx;
        uniform float cwTime;
        varying vec2 vCorner;
        varying vec3 vFire;
        varying float vDist;`)
      .replace('#include <project_vertex>', `
        float kind = fx.x, ph = fx.y, size = fx.z;
        float flick = 1.0 + 0.13 * sin(cwTime * 11.0 + ph * 6.283) + 0.08 * sin(cwTime * 23.0 + ph * 13.0 + 1.7) + 0.05 * sin(cwTime * 41.0 + ph * 5.0);
        float age = 0.0;
        vec3 centre = transformed;
        if (kind > 1.5) {
          age = fract(cwTime * fx.w + ph);
          centre += vec3(sin(ph * 40.0 + age * 2.5) * 0.5 * age * size, age * 5.5 * size, cos(ph * 33.0 + age * 2.0) * 0.4 * age * size);
          size *= 0.45 + age * 1.7;
        }
        vec4 mvPosition = modelViewMatrix * vec4(centre, 1.0);
        vDist = -mvPosition.z;
        vec2 sc = kind < 0.5 ? vec2(0.5, 0.5 + 0.12 * (flick - 1.0)) : vec2(1.0);
        mvPosition.xy += corner * size * sc;
        gl_Position = projectionMatrix * mvPosition;
        vCorner = corner;
        vFire = vec3(kind, flick, age);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float cwTime;\nvarying vec2 vCorner;\nvarying vec3 vFire;\nvarying float vDist;')
      .replace('#include <map_fragment>', `
        {
          float kind = vFire.x;
          vec3 col = vec3(0.0);
          float a = 0.0, ab = 0.0;
          vec2 p = vCorner;
          if (kind < 0.5) {
            float y = p.y * 0.5 + 0.5;
            float sway = sin(cwTime * 7.0 + y * 4.0 + vFire.y * 6.0) * 0.14 * y;
            float w = (1.0 - y) * (0.85 - 0.4 * y);
            float d = abs(p.x - sway) / max(0.07, w);
            float shape = (1.0 - smoothstep(0.45, 1.0, d)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.5, 1.0, y));
            float heat = clamp((1.0 - y) * (1.15 - d * 0.7), 0.0, 1.0);
            col = mix(vec3(0.85, 0.16, 0.03), vec3(1.0, 0.6, 0.14), smoothstep(0.0, 0.5, heat));
            col = mix(col, vec3(1.0, 0.95, 0.65), smoothstep(0.5, 0.95, heat));
            a = shape * 1.4;
          } else if (kind < 1.5) {
            a = pow(max(0.0, 1.0 - length(p)), 2.4) * 0.27 * vFire.y;
            col = vec3(1.0, 0.55, 0.2);
          } else {
            float r = length(p) + sin(atan(p.y, p.x) * 3.0 + vFire.z * 4.0 + vFire.y * 3.0) * 0.08;
            a = (1.0 - smoothstep(0.35, 1.0, r)) * 0.26 * smoothstep(0.0, 0.12, vFire.z) * pow(1.0 - vFire.z, 1.4);
            col = mix(vec3(0.34, 0.32, 0.31), vec3(0.62, 0.6, 0.58), vFire.z);
            ab = a;
          }
          float fade = 1.0 - smoothstep(110.0, 230.0, vDist);
          diffuseColor = vec4(col * a * fade, ab * fade);
        }`);
  });
  return FIRE;
}

// The fire sources of one castle, grouped by who owns them ('static' architecture, 'tower' upgrades, 'ruin'): one mesh in all.
export class FireSet {
  constructor(group, material) { this.group = group; this.material = material; this.sets = new Map(); this.mesh = null; this.dirty = false; }
  set(name, list) { if (list && list.length) this.sets.set(name, list); else this.sets.delete(name); this.dirty = true; }
  rebuild() {
    this.dirty = false;
    const pos = [], corner = [], fx = [], idx = [];
    let n = 0;
    for (const list of this.sets.values()) for (const [kind, x, y, z, size, phase = (n * 0.6180339) % 1] of list) {
      const speed = kind === 2 ? 0.14 + (n % 3) * 0.03 : 0;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(x, y, z); corner.push(cx, cy); fx.push(kind, phase, size, speed); }
      idx.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3);
      n++;
    }
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (!n) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    g.setAttribute('fx', new THREE.Float32BufferAttribute(fx, 4));
    g.setIndex(n * 4 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 10;          // (smoke rises well above where it starts)
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
  }
  update() { if (this.dirty) this.rebuild(); }
}

// ---------------------------------------------------------------- the dust of a fall
// A bank of big, slow, soft puffs thrown up round p when a keep or a tower comes down: they rise and spread for several seconds, so that the fall
// is seen through dust. (Each screen makes its own: nothing here is replicated.) r: how wide the bank starts, n: how many puffs, size: how big they grow.
export function dustBank(fx, p, r, n, size) {
  const A = fx.alpha, TAU = Math.PI * 2, k = fx.q(n);
  for (let i = 0; i < k; i++) {
    const th = Math.random() * TAU, d = Math.sqrt(Math.random()) * r, sp = 0.5 + Math.random() * 1.7;
    const s0 = size * (0.22 + Math.random() * 0.2), s1 = size * (0.8 + Math.random() * 0.7);
    const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.DUST, p.x + Math.cos(th) * d, p.y + Math.random() * 2.5, p.z + Math.sin(th) * d,
      Math.cos(th) * sp, 0.7 + Math.random() * 2.3, Math.sin(th) * sp, 3.2 + Math.random() * 2.6, s0, s1);
    const g = 0.72 + Math.random() * 0.2;
    A.tint(o, g, g * 0.98, g * 0.95, 0.5 + Math.random() * 0.3);
    A.motion(o, 0.9, -0.12, 0.7, -1.3);
    A.spin(o, Math.random() * TAU, (Math.random() - 0.5) * 0.35);
  }
}
