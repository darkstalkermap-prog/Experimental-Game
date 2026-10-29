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

const VERT_DECL = `attribute vec3 aBase; attribute vec4 aMask; attribute vec2 aAlt; attribute float aRoad;
varying vec3 vWPos; varying vec3 vWN; varying vec3 vBase; varying vec4 vMask; varying vec2 vAlt; varying float vRoad;`;
const FRAG_DECL = `uniform sampler2D uDetail; uniform sampler2D uNoise; uniform vec4 uRoads[4];
varying vec3 vWPos; varying vec3 vWN; varying vec3 vBase; varying vec4 vMask; varying vec2 vAlt; varying float vRoad;
float gBump = 0.0;
bool gBumpy = false;`;

const FRAG_COLOR = `
{
  vec2 p = vWPos.xz;
  float y = vWPos.y;
  vec3 N = normalize(vWN);
  float dist = length(vViewPosition);
  float fine = 1.0 - smoothstep(25.0, 170.0, dist);           // small detail fades out with distance
  float strokes = 1.0 - smoothstep(10.0, 60.0, dist);         // the blade strokes repeat every 2.3 m: gone before the repeat can show as a grid
  float steep = 1.0 - N.y;
  float canopy = vMask.w;

  // the roads first: worked out from their lines, so no texture is needed, and how near one is says which reads below can matter
  float rd = 1e5, rs = 0.0;
  if (vRoad < 10.0) {   // (vRoad is the distance at the vertices, which lie within a cell's diagonal (2.9 m) of the pixel: the roads and their wet verge (7 m) all fall inside this)
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
  }

  // Which texture reads can show. Every mask below is a smoothstep of a baked weight plus a wobble of bounded size, so where the
  // weight is under the bound the mask is exactly zero (and a road's edge wobbles by at most 1.2 m): those reads would be thrown away.
  bool dirt = vMask.x > 0.05 || vMask.y > 0.0 || vMask.z > 0.1 || rd < 4.7;   // earth, hill, sand, road: they all read the soil
  bool rocky = steep > 0.41 || vAlt.x > 0.0;                                   // cliffs and bare mountain
  vec4 n2 = vec4(0.5), n3 = vec4(0.5), d1 = vec4(0.5), d2 = vec4(0.5);
  float peb = 0.0;
  if (strokes < 1.0 || rocky || vAlt.y > 0.0 || canopy > 0.002) n2 = texture2D(uNoise, p * 0.021 + vec2(0.57, 0.29));
  if (strokes < 1.0 || dirt) n3 = texture2D(uNoise, p * 0.083 + vec2(0.31, 0.93));   // (close up the strokes replace the macro colour)
  if (dirt || (vAlt.x > 0.0 && steep > 0.16)) peb = texture2D(uNoise, p * 0.9).a;
  if (strokes > 0.0 || dirt) {   // (beyond 60 m the strokes are gone, and plain grass has no other use for the detail)
    d1 = texture2D(uDetail, p * 0.43);
    d2 = texture2D(uDetail, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.117 + vec2(0.37, 0.11));
  }
  bool bumpy = strokes > 0.0 || dirt || canopy > 0.002;

  // grass: the colour baked into the vertices, broken up by blade strokes at two scales
  float gv = d1.r * (0.55 + d2.r * 0.9) * 1.7;
  float macro = 0.72 + 0.56 * (n2.g * 0.55 + n3.g * 0.45);    // (the same average as the strokes, but it never repeats)
  vec3 col = vBase * mix(macro, 0.42 + 0.7 * gv, strokes);
  float bump = (d1.r - 0.5) * 0.045 * strokes;

  // the foot of the mountains: a canopy of round crowns, lit like real tree tops through the bump
  if (canopy > 0.002) {   // (only on the foot of the mountains: everywhere else the two reads below would be thrown away)
    vec4 c1 = texture2D(uDetail, p * 0.0278);
    vec4 c2 = texture2D(uDetail, mat2(0.6, 0.8, -0.8, 0.6) * p * 0.0091 + vec2(0.21, 0.67));
    float dome = c1.a * (0.5 + c2.a);
    vec3 canopyCol = mix(vec3(0.005, 0.018, 0.010), vec3(0.05, 0.12, 0.034), smoothstep(0.05, 0.8, dome)) * (0.7 + 0.6 * n2.g);
    col = mix(col, canopyCol, canopy);
    bump = mix(bump, dome * 2.6, canopy);
  }

  // trampled earth round the castles, the bare hill, the practice yard's sand, and the roads (plain grass skips all of it)
  float road = 0.0;
  if (dirt) {
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

    // the roads: an irregular edge, wheel ruts, a worn strip between them and pebbles
    float edge = rd + (n3.g - 0.5) * 1.8 + (d1.g - 0.5) * 0.6;
    road = 1.0 - smoothstep(2.0, 3.5, edge);
    float rut = (1.0 - smoothstep(0.12, 0.42, abs(abs(rs) - 0.85))) * road;
    float worn = (1.0 - smoothstep(0.1, 0.55, abs(rs))) * road;
    vec3 roadCol = mix(vec3(0.12, 0.085, 0.052), vec3(0.28, 0.20, 0.12), soil);
    roadCol = mix(roadCol, vec3(0.36, 0.33, 0.29), smoothstep(0.62, 0.92, peb) * 0.7 * fine);
    roadCol *= 1.0 - 0.45 * rut;
    roadCol = mix(roadCol, roadCol * 1.18 + 0.01, worn * 0.5);
    col = mix(col, roadCol, road * 0.95);
    bump += (peb * 0.03 - rut * 0.07) * road * fine;
  }
  // wetter, darker ground along the road
  if (rd < 7.0) col *= 1.0 - 0.22 * (1.0 - smoothstep(3.0, 7.0, rd)) * (1.0 - road);

  // rock: cliffs where it is steeper than about 60 degrees, and bare mountain above the trees; strata run in bands, cracks in plates
  float rockW = 0.0;
  if (rocky) rockW = max(smoothstep(0.56, 0.74, steep + (n2.g - 0.5) * 0.3), vAlt.x * (0.6 + 0.4 * n2.r)) * (1.0 - 0.92 * canopy);
  bumpy = bumpy || rockW > 0.003;
  if (rockW > 0.003) {   // (flat ground has none: the four reads and the strata are only for cliffs and the bare mountain)
    vec4 n1 = texture2D(uNoise, p * 0.0047 + vec2(0.13, 0.71));
    float wx = N.x * N.x / (N.x * N.x + N.z * N.z + 1e-4);
    float topW = smoothstep(0.35, 0.8, N.y);
    vec4 rS = vec4(0.5), rU = vec4(0.5);
    if (topW < 0.999) rS = mix(texture2D(uDetail, vec2(p.x, y) * 0.23), texture2D(uDetail, vec2(vWPos.z, y) * 0.23), wx);
    if (topW > 0.001) rU = texture2D(uDetail, p * 0.23);
    vec4 rk = mix(rS, rU, topW);
    float band = smoothstep(-0.6, 0.6, sin(y * 0.41 + n1.r * 11.0 + n2.g * 4.0 + dot(p, vec2(0.03, 0.02))));
    vec3 rockCol = mix(vec3(0.17, 0.155, 0.13), vec3(0.30, 0.25, 0.19), band * (0.5 + 0.5 * n2.b));
    rockCol = mix(rockCol, vec3(0.11, 0.105, 0.10), smoothstep(0.6, 0.95, rk.b) * 0.6);
    rockCol *= 0.65 + 0.7 * rk.g;
    col = mix(col, rockCol, rockW);
    bump = mix(bump, ((rk.b - 0.5) * 0.5 + (rk.g - 0.5) * 0.3) * (0.4 + 0.6 * fine), rockW);
  }
  // scree at the foot of the bare slopes
  if (vAlt.x > 0.0) {
    float scree = smoothstep(0.16, 0.3, steep) * (1.0 - rockW) * vAlt.x;
    col = mix(col, vec3(0.22, 0.20, 0.17) * (0.7 + 0.6 * peb), scree * 0.8);
  }

  // snow on the highest, flattest ground
  if (vAlt.y > 0.0) {
    float snowW = vAlt.y * smoothstep(0.40, 0.16, steep) * smoothstep(0.3, 0.6, n2.b + vAlt.y * 0.4);
    col = mix(col, vec3(0.62, 0.68, 0.74), snowW);
  }

  diffuseColor.rgb = col;
  gBump = bump;
  gBumpy = bumpy;
}
`;

const FRAG_NORMAL = `
if (gBumpy) {   // (plain grass beyond the strokes has no bump at all)
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
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWPos = position; vWN = normal; vBase = aBase; vMask = aMask; vAlt = aAlt; vRoad = aRoad;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
        .replace('#include <color_fragment>', FRAG_COLOR)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL);
    });
  }
  cache[level] = m;
  return m;
}
