// Materials for the ground, one per Q.terrain level: 0 plain vertex colours, 1 plus a detail texture, 2 the splat shader.
//   The splat shader lays the ground out from the data the geometry carries (terrain.js): the grass colour (aBase), masks for the trampled
//   earth round castles, the bare top of the hill and the practice sand (aMask.xyz), the forest canopy on the mountains' foot (aMask.w),
//   and the bare mountain above the trees and the snow (aAlt). Roads are worked out here from their lines, so they have ruts and pebbles.
//   Slopes steeper than about 60 degrees turn to rock with strata and cracks. Small detail also bumps the normal, and fades out with distance.
import * as THREE from 'three';
import { grassDetailTexture } from './textures.js';
import { detailTexture, noiseTexture } from './terraintex.js';
import { patchMaterial } from './shaderhook.js';

const cache = [];
let detail1 = null;
const U = { uDetail: { value: null }, uNoise: { value: null }, uRoads: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) } };

// the four roads from the castle gates to the middle (the ring road round the middle is built into the shader)
export function setRoads(roads) {
  for (let i = 0; i < 4; i++) {
    const r = roads[i];
    if (r) U.uRoads.value[i].set(r.ax, r.az, r.bx, r.bz); else U.uRoads.value[i].set(0, 0, 0, 1);
  }
}

const VERT_DECL = `attribute vec3 aBase; attribute vec4 aMask; attribute vec2 aAlt;
varying vec3 vWPos; varying vec3 vWN; varying vec3 vBase; varying vec4 vMask; varying vec2 vAlt;`;
const FRAG_DECL = `uniform sampler2D uDetail; uniform sampler2D uNoise; uniform vec4 uRoads[4];
varying vec3 vWPos; varying vec3 vWN; varying vec3 vBase; varying vec4 vMask; varying vec2 vAlt;
float gBump = 0.0;`;

const FRAG_COLOR = `
{
  vec2 p = vWPos.xz;
  float y = vWPos.y;
  vec3 N = normalize(vWN);
  float dist = length(vViewPosition);
  float fine = 1.0 - smoothstep(40.0, 240.0, dist);           // small detail fades out with distance
  float steep = 1.0 - N.y;
  vec4 n1 = texture2D(uNoise, p * 0.0047 + vec2(0.13, 0.71));
  vec4 n2 = texture2D(uNoise, p * 0.021 + vec2(0.57, 0.29));
  vec4 n3 = texture2D(uNoise, p * 0.083 + vec2(0.31, 0.93));
  float peb = texture2D(uNoise, p * 0.9).a;
  vec4 d1 = texture2D(uDetail, p * 0.43);
  vec4 d2 = texture2D(uDetail, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.117 + vec2(0.37, 0.11));

  // grass: the colour baked into the vertices, broken up by blade strokes at two scales
  float gv = d1.r * (0.55 + d2.r * 0.9) * 1.7;
  vec3 col = vBase * mix(1.0, 0.42 + 0.7 * gv, fine);
  float bump = (d1.r - 0.5) * 0.045 * fine;

  // the foot of the mountains: a canopy of round crowns, lit like real tree tops through the bump
  float canopy = vMask.w;
  vec4 c1 = texture2D(uDetail, p * 0.0278);
  vec4 c2 = texture2D(uDetail, mat2(0.6, 0.8, -0.8, 0.6) * p * 0.0091 + vec2(0.21, 0.67));
  float dome = c1.a * (0.5 + c2.a);
  vec3 canopyCol = mix(vec3(0.005, 0.018, 0.010), vec3(0.05, 0.12, 0.034), smoothstep(0.05, 0.8, dome)) * (0.7 + 0.6 * n2.g);
  col = mix(col, canopyCol, canopy);
  bump = mix(bump, dome * 2.6, canopy);

  // trampled earth round the castles, the bare hill, the practice yard's sand
  float soil = d1.g * (0.6 + d2.g * 0.8);
  vec3 earth = mix(vec3(0.13, 0.09, 0.055), vec3(0.30, 0.22, 0.14), soil);
  earth = mix(earth, vec3(0.34, 0.31, 0.27), smoothstep(0.55, 0.9, peb) * 0.6 * fine);
  float mc = smoothstep(0.3, 0.7, vMask.x + (n3.r - 0.5) * 0.5);
  col = mix(col, earth, mc);
  float mh = smoothstep(0.25, 0.7, vMask.y + (n3.g - 0.5) * 0.5);
  col = mix(col, mix(vec3(0.26, 0.23, 0.13), vec3(0.42, 0.37, 0.22), soil), mh);
  float ms = smoothstep(0.3, 0.7, vMask.z + (n3.b - 0.5) * 0.4);
  col = mix(col, mix(vec3(0.34, 0.26, 0.15), vec3(0.50, 0.39, 0.23), soil), ms);
  bump += (mc + mh + ms) * (soil - 0.5) * 0.05 * fine;

  // the roads: worked out from their lines, with an irregular edge, wheel ruts, a worn strip between them and pebbles
  float rd = 1e5, rs = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 a = uRoads[i].xy, ab = uRoads[i].zw - a;
    float len = max(length(ab), 0.001);
    float t = clamp(dot(p - a, ab) / (len * len), 0.0, 1.0);
    vec2 dv = p - (a + ab * t);
    float dd = length(dv);
    if (dd < rd) { rd = dd; rs = dot(dv, vec2(-ab.y, ab.x)) / len; }
  }
  float rr = length(p) - 34.0;
  if (abs(rr) < rd) { rd = abs(rr); rs = rr; }
  float edge = rd + (n3.g - 0.5) * 1.8 + (d1.g - 0.5) * 0.6;
  float road = 1.0 - smoothstep(2.0, 3.5, edge);
  float rut = (1.0 - smoothstep(0.12, 0.42, abs(abs(rs) - 0.85))) * road;
  float worn = (1.0 - smoothstep(0.1, 0.55, abs(rs))) * road;
  vec3 roadCol = mix(vec3(0.12, 0.085, 0.052), vec3(0.28, 0.20, 0.12), soil);
  roadCol = mix(roadCol, vec3(0.36, 0.33, 0.29), smoothstep(0.62, 0.92, peb) * 0.7 * fine);
  roadCol *= 1.0 - 0.45 * rut;
  roadCol = mix(roadCol, roadCol * 1.18 + 0.01, worn * 0.5);
  col = mix(col, roadCol, road * 0.95);
  bump += (peb * 0.03 - rut * 0.07) * road * fine;
  // wetter, darker ground along the road
  col *= 1.0 - 0.22 * (1.0 - smoothstep(3.0, 7.0, rd)) * (1.0 - road);

  // rock: cliffs where it is steeper than about 60 degrees, and bare mountain above the trees; strata run in bands, cracks in plates
  float rockW = max(smoothstep(0.56, 0.74, steep + (n2.g - 0.5) * 0.3), vAlt.x * (0.6 + 0.4 * n2.r)) * (1.0 - 0.92 * canopy);
  float wx = N.x * N.x / (N.x * N.x + N.z * N.z + 1e-4);
  vec4 rA = texture2D(uDetail, vec2(vWPos.z, y) * 0.23), rB = texture2D(uDetail, vec2(p.x, y) * 0.23), rT = texture2D(uDetail, p * 0.23);
  vec4 rk = mix(mix(rB, rA, wx), rT, smoothstep(0.35, 0.8, N.y));
  float band = smoothstep(-0.6, 0.6, sin(y * 0.41 + n1.r * 11.0 + n2.g * 4.0 + dot(p, vec2(0.03, 0.02))));
  vec3 rockCol = mix(vec3(0.17, 0.155, 0.13), vec3(0.30, 0.25, 0.19), band * (0.5 + 0.5 * n2.b));
  rockCol = mix(rockCol, vec3(0.11, 0.105, 0.10), smoothstep(0.6, 0.95, rk.b) * 0.6);
  rockCol *= 0.65 + 0.7 * rk.g;
  col = mix(col, rockCol, rockW);
  bump = mix(bump, ((rk.b - 0.5) * 0.5 + (rk.g - 0.5) * 0.3) * (0.4 + 0.6 * fine), rockW);
  // scree at the foot of the bare slopes
  float scree = smoothstep(0.16, 0.3, steep) * (1.0 - rockW) * vAlt.x;
  col = mix(col, vec3(0.22, 0.20, 0.17) * (0.7 + 0.6 * peb), scree * 0.8);

  // snow on the highest, flattest ground
  float snowW = vAlt.y * smoothstep(0.40, 0.16, steep) * smoothstep(0.3, 0.6, n2.b + vAlt.y * 0.4);
  col = mix(col, vec3(0.62, 0.68, 0.74), snowW);

  diffuseColor.rgb = col;
  gBump = bump;
}
`;

const FRAG_NORMAL = `
{
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(gBump), dhy = dFdy(gBump);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad * 0.8);
}
`;

export function terrainMaterial(level) {
  if (cache[level]) return cache[level];
  let m;
  if (level === 0) m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  else if (level === 1) {
    if (!detail1) detail1 = grassDetailTexture();
    m = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail1, roughness: 0.97, metalness: 0 });
  } else {
    U.uDetail.value = detailTexture();
    U.uNoise.value = noiseTexture();
    m = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0 });
    patchMaterial(m, 'terrain-splat', (shader) => {
      shader.uniforms.uDetail = U.uDetail; shader.uniforms.uNoise = U.uNoise; shader.uniforms.uRoads = U.uRoads;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWPos = position; vWN = normal; vBase = aBase; vMask = aMask; vAlt = aAlt;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
        .replace('#include <color_fragment>', FRAG_COLOR)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL);
    });
  }
  cache[level] = m;
  return m;
}
