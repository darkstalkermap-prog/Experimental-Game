// Things on a castle that move by themselves, all of it driven by one shared clock in the vertex or fragment shader (no per-frame
// work on the CPU): cloth that waves in the wind (banners, flags, pennants) and, further down, flames, glow and smoke.
import * as THREE from 'three';
import { patchMaterial } from './shaderhook.js';
import { Q } from './quality.js';

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
