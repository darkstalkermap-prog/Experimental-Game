// Trees and rocks of the world, and the wind that moves them.
//   Every tree and rock is one entry (position, size, yaw, tint) with its matrix made once. Each time the camera has moved or turned a
//   little the entries are sorted into levels of detail by distance and copied into a handful of instanced meshes:
//     near   full model, casts a shadow, everything within a ring round the camera (behind it too, for the shadows)
//     mid    simplified model, only what is in view
//     far    a camera-facing card painted with the tree's silhouette, only what is in view (this is the forest on the mountains)
//   Trees that block the way have colliders (world.js adds them); the rest of the forest, on the mountains behind the play area, is
//   only to look at. Q.trees thins that scenery out, Q.lodScale stretches the distances, Q.detail picks the near model, Q.wind turns the
//   swaying on or off.
import * as THREE from 'three';
import { Q } from './quality.js';
import { patchMaterial } from './shaderhook.js';
import { shadowProxy } from './shadows.js';
import { buildSpruce, buildPine, buildOak, buildBirch, buildRock, buildBare, buildPalm, buildCactus, buildShrub } from './foliagegeo.js';
import { active, treeSlot } from './biomes.js';
import { paintSpruce, paintPine, paintOak, paintBirch, CARD_FOOT } from './treecards.js';

// shared by everything that moves in the wind (trees here, grass in grass.js)
export const WIND = { time: { value: 0 }, amp: { value: 1 } };
export const WIND_GLSL = `
uniform float uWindTime; uniform float uWindAmp;
// 0 .. 1.3: a slow wave that travels over the land, with a faster ripple on it
float windGust(vec2 p) {
  float ph = dot(p, vec2(0.82, 0.57)) * 0.05 - uWindTime * 1.2;
  return 0.55 + 0.35 * sin(ph) + 0.18 * sin(ph * 2.7 + p.x * 0.02) + 0.1 * sin(uWindTime * 2.3 + p.y * 0.3);
}
`;
const windUniforms = (shader) => { shader.uniforms.uWindTime = WIND.time; shader.uniforms.uWindAmp = WIND.amp; };

// ---- the plants of a biome (biomes.js `flora`): four tree slots and three rock shapes, each filled by a species ----
// build(lod) is the model; h and w the height and the crown width of the 1.0-scale model (for the cards and the bounding spheres); paint draws the
// species on a far card (see treeAtlas). The meadow's four are the game's old trees.
const hash01 = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

const SPRUCE = { dark: [0.02, 0.075, 0.05], lite: [0.06, 0.17, 0.08], snow: 0.95 }, PINE_S = { dark: [0.028, 0.1, 0.06], lite: [0.09, 0.2, 0.1], snow: 0.9 };
const SPECIES = {
  spruce: { build: (l) => buildSpruce(l), h: 10.2, w: 5.6, paint: (g, ox) => paintSpruce(g, ox, {}) },
  pine: { build: (l) => buildPine(l), h: 9.8, w: 5.6, paint: (g, ox) => paintPine(g, ox, {}) },
  oak: { build: (l) => buildOak(l), h: 8.6, w: 7.2, paint: (g, ox) => paintOak(g, ox, {}) },
  birch: { build: (l) => buildBirch(l), h: 8.8, w: 3.4, paint: (g, ox) => paintBirch(g, ox, {}) },
  spruceSnow: { build: (l) => buildSpruce(l, SPRUCE), h: 10.2, w: 5.6, paint: (g, ox) => paintSpruce(g, ox, { snow: true }) },
  pineSnow: { build: (l) => buildPine(l, PINE_S), h: 9.8, w: 5.6, paint: (g, ox) => paintPine(g, ox, { snow: true }) },
  oakBare: { build: (l) => buildBare(l, { snow: true, bark: [0.1, 0.08, 0.07], barkLite: [0.17, 0.14, 0.12] }), h: 8.6, w: 6.0, paint: (g, ox) => paintBare(g, ox, { bark: '#2b2420', snow: true, big: true }) },
  birchBare: { build: (l) => buildBare(l, { snow: true, birch: true, phase: 1.1 }), h: 8.8, w: 3.6, paint: (g, ox) => paintBare(g, ox, { bark: '#d6d3c8', twig: '#3a3530', snow: true }) },
  spruceDrab: { build: (l) => buildSpruce(l, { dark: [0.025, 0.06, 0.04], lite: [0.07, 0.12, 0.06] }), h: 10.2, w: 5.4, paint: (g, ox) => paintSpruce(g, ox, { lo: '#3d6038', mid: '#264a30', hi: '#16301f' }) },
  mossOak: { build: (l) => buildOak(l, { dark: [0.02, 0.05, 0.03], lite: [0.09, 0.17, 0.07] }), h: 8.6, w: 7.2, paint: (g, ox) => paintOak(g, ox, { a: '#5c7a44', b: '#233624', trunk: '#3a3326' }) },
  birchDrab: { build: (l) => buildBirch(l, { dark: [0.05, 0.1, 0.03], lite: [0.2, 0.27, 0.06] }), h: 8.8, w: 3.4, paint: (g, ox) => paintBirch(g, ox, { a: '#8a9a4c', b: '#3a4a26' }) },
  deadTree: { build: (l) => buildBare(l, { bark: [0.1, 0.09, 0.075], barkLite: [0.17, 0.15, 0.12], lean: 0.8, height: 7.6, count: 5, spread: 0.85, thick: 1.7, phase: 0.4 }), h: 8.0, w: 4.2, paint: (g, ox) => paintBare(g, ox, { bark: '#4a4338', lean: 18 }) },
  bleachedTree: { build: (l) => buildBare(l, { bark: [0.3, 0.26, 0.2], barkLite: [0.42, 0.37, 0.29], lean: -0.6, height: 6.8, count: 5, spread: 0.8, thick: 1.6, phase: 2 }), h: 7.2, w: 4.0, paint: (g, ox) => paintBare(g, ox, { bark: '#b4a68c', lean: -16 }) },
  palm: { build: (l) => buildPalm(l), h: 10.6, w: 6.6, paint: (g, ox) => paintPalm(g, ox) },
  cactus: { build: (l) => buildCactus(l), h: 5.8, w: 2.8, paint: (g, ox) => paintCactus(g, ox) },
  shrub: { build: (l) => buildShrub(l), h: 1.3, w: 2.4, paint: (g, ox) => paintShrub(g, ox) },
};
// rock colours by biome (see buildRock in foliagegeo.js)
const ROCKS = {
  stone: {},
  snow: { stone: [[0.15, 0.16, 0.18], [0.2, 0.21, 0.23], [0.12, 0.13, 0.15]], warm: [0.22, 0.22, 0.24], moss: [0.1, 0.12, 0.1], mossAmt: 0.15, snow: 0.95 },
  marsh: { stone: [[0.12, 0.13, 0.11], [0.16, 0.17, 0.14], [0.09, 0.1, 0.09]], warm: [0.19, 0.19, 0.14], moss: [0.05, 0.12, 0.05], mossAmt: 1 },
  desert: { stone: [[0.3, 0.17, 0.1], [0.38, 0.22, 0.13], [0.26, 0.15, 0.09]], warm: [0.5, 0.32, 0.18], moss: [0.3, 0.2, 0.1], mossAmt: 0 },
};
const style = () => active.def.flora;
const spec = (k) => SPECIES[style().slots[k]];

// ---- the cards of the far forest: trees painted on a canvas, four across (one atlas per biome) ----
const blobAt = (g, cx, cy, rx, ry, a, b) => {
  const grd = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 2, cx, cy, Math.max(rx, ry));
  grd.addColorStop(0, a); grd.addColorStop(1, b);
  g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
};
// a leafless tree: a tapering trunk and branches that fork twice (snow lies on the forks)
function paintBare(g, ox, c) {
  const lean = c.lean || 0;
  g.lineCap = 'round'; g.strokeStyle = c.bark;
  g.lineWidth = c.big ? 10 : 6;
  g.beginPath(); g.moveTo(ox + 64, 256); g.quadraticCurveTo(ox + 64 + lean * 0.4, 150, ox + 64 + lean, 52); g.stroke();
  const fork = (x, y, ang, len, w, depth) => {
    const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
    g.strokeStyle = depth < 2 && c.twig ? c.twig : c.bark; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (c.snow && depth === 1) { g.fillStyle = 'rgba(238,244,250,0.95)'; g.beginPath(); g.ellipse(x2, y2 - 1, 5, 2.4, 0, 0, Math.PI * 2); g.fill(); }
    if (depth > 0) { fork(x2, y2, ang - 0.55, len * 0.68, w * 0.62, depth - 1); fork(x2, y2, ang + 0.5, len * 0.64, w * 0.6, depth - 1); }
  };
  [[0.36, -0.9, 52], [0.42, 0.95, 50], [0.58, -0.75, 44], [0.64, 0.85, 42], [0.78, -0.5, 36], [0.86, 0.45, 34], [0.97, 0, 30]].forEach(([t, a, l]) => {
    fork(ox + 64 + lean * Math.pow(t, 1.3), 256 - t * 204, a, l, c.big ? 5 : 3.2, 2);
  });
}
function paintPalm(g, ox) {
  g.lineCap = 'round'; g.strokeStyle = '#6b563a'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(ox + 52, 256); g.quadraticCurveTo(ox + 58, 150, ox + 80, 70); g.stroke();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, dx = Math.cos(a), up = 0.5 + 0.5 * Math.sin(a * 2 + 1);
    g.strokeStyle = i % 2 ? '#2f6a2a' : '#4c8a34'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(ox + 80, 70);
    g.quadraticCurveTo(ox + 80 + dx * 36, 70 - 22 - up * 16, ox + 80 + dx * 58, 70 + 26 - up * 6);
    g.stroke();
  }
}
function paintCactus(g, ox) {
  const col = (x0, y0, x1, y1, r) => { g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, r); g.fill(); };
  g.fillStyle = '#2f6a38';
  col(ox + 50, 90, ox + 78, 256, 14); col(ox + 20, 128, ox + 56, 146, 8); col(ox + 14, 82, ox + 32, 142, 9); col(ox + 74, 160, ox + 108, 178, 8); col(ox + 98, 112, ox + 116, 172, 9);
  g.fillStyle = '#4c9552'; g.fillRect(ox + 58, 100, 4, 150);
}
function paintShrub(g, ox) {
  [[48, 230, 34, 22], [84, 232, 36, 20], [66, 214, 30, 20]].forEach(([x, y, rx, ry]) => blobAt(g, ox + x, y, rx, ry, '#b49a52', '#5e4e22'));
}

const atlases = new Map();
function treeAtlas() {
  let tex = atlases.get(active.def.id);
  if (tex) return tex;
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W * 4; c.height = H;
  const g = c.getContext('2d');
  for (let k = 0; k < 4; k++) spec(k).paint(g, W * k);
  // The empty texels round the trees are black on a canvas. The mip levels that a far card is read from blend them into the leaves, so the
  // trees of the far forest had dark, dirty edges and read soft. The leaf colours are spread out into the empty texels (their alpha stays
  // 0), and the strip goes to the GPU as raw data, so nothing premultiplies them back to black.
  const src = g.getImageData(0, 0, c.width, c.height).data, w = c.width, h = c.height;
  const px = new Uint8ClampedArray(src), done = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) done[i] = src[i * 4 + 3] > 8 ? 1 : 0;
  for (let pass = 0; pass < 8; pass++) {
    const next = done.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (done[i]) continue;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || ((xx >> 7) !== (x >> 7))) continue;   // (never across into the next tree's cell)
        const j = yy * w + xx;
        if (done[j]) { r += px[j * 4]; gg += px[j * 4 + 1]; b += px[j * 4 + 2]; n++; }
      }
      if (n) { px[i * 4] = r / n; px[i * 4 + 1] = gg / n; px[i * 4 + 2] = b / n; next[i] = 1; }
    }
    done.set(next);
  }
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);   // (the canvas's top row is the texture's last)
  tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  atlases.set(active.def.id, tex);
  return tex;
}

let treeMat = null, rockMat = null, cardMat = null;
function materials() {
  if (!treeMat) {
    treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    patchMaterial(treeMat, 'foliage-wind', (shader) => {
      windUniforms(shader);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aWind;\n' + WIND_GLSL)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        {
          vec3 iP = instanceMatrix[3].xyz;
          float sxz = max(length(instanceMatrix[0].xyz), 0.001), sy = max(length(instanceMatrix[1].xyz), 0.001);
          vec3 ax = instanceMatrix[0].xyz / sxz, az = instanceMatrix[2].xyz / sxz;
          float g = windGust(iP.xz) * uWindAmp;
          float sw = aWind.x * aWind.x;
          vec3 wd = vec3(0.82 * g * 0.13 * sy * sw, 0.0, 0.57 * g * 0.13 * sy * sw);
          float fl = sin(uWindTime * 4.6 + iP.x * 0.7 + position.x * 2.3 + position.z * 1.9 + position.y * 1.3) * aWind.y * 0.05 * uWindAmp * sy;
          wd += vec3(fl, fl * 0.4, fl * 0.7);
          transformed += vec3(dot(wd, ax) / sxz, wd.y / sy, dot(wd, az) / sxz);
        }
        #endif`);
    });
  }
  if (!rockMat) rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  if (!cardMat) {
    cardMat = new THREE.MeshLambertMaterial({ map: null, alphaTest: 0.45 });
    patchMaterial(cardMat, 'tree-card', (shader) => {
      windUniforms(shader);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell;\n' + WIND_GLSL)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vec2((aCell + uv.x) * 0.25, uv.y);')
        .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(normalMatrix * vec3(0.0, 0.8, 0.6));')
        .replace('#include <project_vertex>', `
          vec3 bbC = instanceMatrix[3].xyz;
          float bbW = length(instanceMatrix[0].xyz), bbH = length(instanceMatrix[1].xyz);
          vec3 toCam = cameraPosition - bbC; toCam.y = 0.0;
          vec3 bbR = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(0.0001));
          vec3 bbP = bbC + bbR * (position.x * bbW) + vec3(0.0, position.y * bbH, 0.0);
          float bbS = windGust(bbC.xz) * uWindAmp * 0.1 * bbH * position.y * position.y;
          bbP.x += 0.82 * bbS; bbP.z += 0.57 * bbS;
          vec4 mvPosition = modelViewMatrix * vec4(bbP, 1.0);
          gl_Position = projectionMatrix * mvPosition;`);
      // the alpha of a far card is read from a small mip level, where the leaves' edges have been averaged with the empty texels round them:
      // it is raised with the level (from the screen size of a texel), so a far tree keeps its outline instead of thinning to a blur
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `{
          vec2 cT = vMapUv * vec2(512.0, 256.0), cDx = dFdx(cT), cDy = dFdy(cT);
          float cLod = max(0.0, 0.5 * log2(max(dot(cDx, cDx), dot(cDy, cDy))));
          diffuseColor.a *= 1.0 + 0.22 * cLod;
          if (diffuseColor.a < alphaTest) discard;
        }`);
    });
  }
  cardMat.map = treeAtlas();
  return { treeMat, rockMat, cardMat };
}

// a unit card standing on the ground, 1 m wide and 1 m tall; its size comes from the instance matrix. The quad goes CARD_FOOT below the
// ground line (v < 0 reads the strip's bottom row: the trunk goes on into the slope)
function cardGeometry(cap) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -CARD_FOOT, 0, 0.5, -CARD_FOOT, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.8, 0.6, 0, 0.8, 0.6, 0, 0.8, 0.6, 0, 0.8, 0.6], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, -CARD_FOOT, 1, -CARD_FOOT, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

const geoCache = new Map();   // species/lod geometries are built once per page and survive a world rebuild (three.js re-uploads them)
function modelGeometry(kind, lod) {
  let name = kind < 4 ? style().slots[kind] : 'rock' + (kind - 4);
  if (lod === 1 && (name === 'pine' || name === 'pineSnow')) name = name === 'pine' ? 'spruce' : 'spruceSnow';   // (a far pine is a dark cone like a spruce: its umbrella crown reads as a mushroom from afar)
  const key = name + ':' + (kind < 4 ? lod : style().rock);
  let g = geoCache.get(key);
  if (!g) {
    g = kind < 4 ? SPECIES[name].build(lod) : buildRock(kind - 4, 1, ROCKS[style().rock]);
    geoCache.set(key, g);
  }
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const _view = new THREE.Matrix4(), _pv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sph = new THREE.Sphere(), _fwd = new THREE.Vector3();

export class Foliage {
  // trees: [{ x, y, z, s, r, c, conifer, extra }], rocks: [{ x, y, z, s, r, c, extra }]. `extra` entries are scenery that Q.trees may thin out.
  constructor(scene, trees, rocks) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.userData.owner = 'a3 foliage';
    scene.add(this.group);
    const { treeMat, rockMat, cardMat } = materials();
    // ---- entries ----
    const all = [];
    for (const t of trees) {
      all.push({ kind: treeSlot(t.x, t.z, t.conifer), ...t });
    }
    for (const r of rocks) all.push({ kind: 4 + Math.floor(hash01(r.x, r.z, 3) * 3), ...r });
    const N = this.n = all.length;
    this.mat = new Float32Array(N * 16);
    this.pos = new Float32Array(N * 3);
    this.kind = new Uint8Array(N);
    this.rad = new Float32Array(N);
    this.rank = new Float32Array(N);        // 0..1: Q.trees keeps the entries whose rank is below it (only scenery has a rank)
    this.tint = new Float32Array(N * 3);
    this.card = new Float32Array(N * 3);    // width, height, cell of the far card
    const col = new THREE.Color();
    all.forEach((t, i) => {
      const k = t.kind, tree = k < 4;
      const sv = 0.9 + 0.2 * hash01(t.x, t.z, 4), sh = 0.92 + 0.16 * hash01(t.x, t.z, 5);
      const sxz = t.s * (tree ? sh : 1.15), sy = t.s * (tree ? sv : 1.3) * (tree ? 1 : 0.92 + 0.3 * hash01(t.x, t.z, 6));
      _p.set(t.x, t.y - (tree ? 0.12 : 0.1 * t.s), t.z);
      if (tree) _q.setFromAxisAngle(UP, t.r);
      else { _e.set((hash01(t.x, t.z, 7) - 0.5) * 0.18, t.r * 6.28, (hash01(t.x, t.z, 8) - 0.5) * 0.18); _q.setFromEuler(_e); }
      _s.set(sxz, sy, sxz);
      _m.compose(_p, _q, _s);
      _m.toArray(this.mat, i * 16);
      this.pos[i * 3] = t.x; this.pos[i * 3 + 1] = t.y; this.pos[i * 3 + 2] = t.z;
      this.kind[i] = k;
      this.rad[i] = tree ? spec(k).h * sy * 0.55 + 2 : 2.2 * t.s + 1;
      this.rank[i] = t.extra ? hash01(t.x, t.z, 9) : -1;
      // tint: brightness and a little hue, applied on top of the colours painted into the model
      const b = 0.86 + 0.28 * t.c, h = hash01(t.x, t.z, 10) - 0.5;
      if (tree) col.setRGB(b * (1 + h * 0.22), b * (1 + h * 0.06), b * (1 - h * 0.28));
      else col.setRGB(b, b * 0.99, b * 0.96);
      this.tint[i * 3] = col.r; this.tint[i * 3 + 1] = col.g; this.tint[i * 3 + 2] = col.b;
      if (tree) { this.card[i * 3] = spec(k).w * sxz * 1.12; this.card[i * 3 + 1] = spec(k).h * sy * 1.04; this.card[i * 3 + 2] = k; }
    });
    // ---- meshes ----
    const count = (f) => { let c = 0; for (let i = 0; i < N; i++) if (f(i)) c++; return c; };
    this.near = []; this.mid = []; this.rocks = []; this.proxy = [];
    for (let k = 0; k < 4; k++) {
      const cnt = count((i) => this.kind[i] === k);
      const near = this.makeMesh(modelGeometry(k, 0), treeMat, Math.min(cnt, 600), true);
      this.near.push(near);
      this.mid.push(this.makeMesh(modelGeometry(k, 1), treeMat, cnt, false));
      // the shadow maps get the simple model of the same trees (it shares the near mesh's instance matrices): a crown's outline is all a shadow shows
      const proxy = new THREE.InstancedMesh(modelGeometry(k, 1), treeMat, 1);
      proxy.instanceMatrix = near.instanceMatrix;
      proxy.matrixAutoUpdate = false;
      proxy.count = 0;
      this.group.add(shadowProxy(scene, proxy, true));
      this.proxy.push(proxy);
    }
    this.rockProxy = [];
    for (let k = 0; k < 3; k++) {
      const rocks = this.makeMesh(modelGeometry(4 + k, 1), rockMat, count((i) => this.kind[i] === 4 + k), false);
      this.rocks.push(rocks);
      // only the rocks round the camera cast (they are written first, see rebuild); the proxy draws that many of the same instances
      const proxy = new THREE.InstancedMesh(modelGeometry(4 + k, 1), rockMat, 1);
      proxy.instanceMatrix = rocks.instanceMatrix;
      proxy.matrixAutoUpdate = false;
      proxy.count = 0;
      this.group.add(shadowProxy(scene, proxy, true));
      this.rockProxy.push(proxy);
    }
    const nTrees = count((i) => this.kind[i] < 4);
    this.cards = new THREE.InstancedMesh(cardGeometry(nTrees), cardMat, nTrees);
    this.cards.frustumCulled = false;
    this.cards.matrixAutoUpdate = false;
    this.cards.count = 0;
    this.cards.setColorAt(0, col.setRGB(1, 1, 1));
    this.group.add(this.cards);
    this.lastPos = new THREE.Vector3(1e9, 0, 1e9);
    this.lastFwd = new THREE.Vector3(0, 0, -1);
    this.sig = '';
    this.camera = null;
    this.wasWind = 1;
  }

  makeMesh(geo, mat, cap, shadow) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.group.add(m);
    return m;
  }

  // read the quality settings: distances, shadows, the near model
  configure() {
    const L = Q.lodScale;
    this.nearR = (Q.level === 0 ? 38 : 62) * L;
    this.midR = (Q.level === 0 ? 120 : 190) * L;
    this.farR = Math.min(Q.viewDist, 900);
    this.keep = Math.min(1, Q.trees);
    const detail = Q.detail >= 1 ? 0 : 1;
    this.useProxy = Q.shadows && detail === 0;   // (with the simple model already close up there is nothing to swap)
    for (let k = 0; k < 4; k++) {
      const g = modelGeometry(k, detail);
      if (this.near[k].geometry !== g) this.near[k].geometry = g;
      this.near[k].castShadow = Q.shadows && !this.useProxy;
      this.proxy[k].userData.on = false;
    }
    this.rockShadows = Q.shadows && Q.detail >= 1;
    for (const p of this.rockProxy) p.userData.on = false;
    this.lastPos.set(1e9, 0, 1e9);   // rebuild now
  }

  update(dt, camPos) {
    const sig = `${Q.level}|${Q.detail}|${Q.trees}|${Q.shadows}|${Q.lodScale}|${Q.viewDist}`;
    if (sig !== this.sig) { this.sig = sig; this.configure(); }
    if (!this.camera) { this.camera = this.scene.children.find((c) => c.isCamera) || null; if (!this.camera) return; }
    const cam = this.camera;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (camPos.distanceToSquared(this.lastPos) < 9 && _fwd.dot(this.lastFwd) > 0.9986) return;
    this.lastPos.copy(camPos);
    this.lastFwd.copy(_fwd);
    this.rebuild(camPos, cam);
  }

  rebuild(camPos, cam) {
    _view.compose(camPos, cam.quaternion, ONE).invert();
    _pv.multiplyMatrices(cam.projectionMatrix, _view);
    _fr.setFromProjectionMatrix(_pv);
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    const near2 = this.nearR * this.nearR, mid2 = this.midR * this.midR, far2 = this.farR * this.farR, keep = this.keep;
    const nN = [0, 0, 0, 0], nM = [0, 0, 0, 0], nR = [0, 0, 0], nC = [0];
    const card = this.cards, cellAttr = card.geometry.attributes.aCell.array;
    const N = this.n, mat = this.mat, kind = this.kind, pos = this.pos, rad = this.rad, tint = this.tint;
    for (let i = 0; i < N; i++) {
      if (this.rank[i] > keep) continue;
      const k = kind[i];
      const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz, d2 = dx * dx + dz * dz;
      if (d2 > far2) continue;
      const tree = k < 4;
      if (tree && d2 < near2) {
        const m = this.near[k];
        if (nN[k] < m.instanceMatrix.count) { put(m, nN[k]++, mat, tint, i); }
        continue;
      }
      if (!tree) continue;   // (rocks: below)
      // everything else only if it is in view
      _sph.center.set(pos[i * 3], pos[i * 3 + 1] + rad[i] * 0.8, pos[i * 3 + 2]);
      _sph.radius = rad[i] + 8;
      if (!_fr.intersectsSphere(_sph)) continue;
      if (d2 < mid2) { const m = this.mid[k]; if (nM[k] < m.instanceMatrix.count) put(m, nM[k]++, mat, tint, i, 0.8); continue; }
      // a card: the instance matrix carries only the position and the size
      if (nC[0] < card.instanceMatrix.count) {
        const j = nC[0]++, a = card.instanceMatrix.array, w = this.card[i * 3], h = this.card[i * 3 + 1];
        a[j * 16] = w; a[j * 16 + 1] = 0; a[j * 16 + 2] = 0; a[j * 16 + 3] = 0;
        a[j * 16 + 4] = 0; a[j * 16 + 5] = h; a[j * 16 + 6] = 0; a[j * 16 + 7] = 0;
        a[j * 16 + 8] = 0; a[j * 16 + 9] = 0; a[j * 16 + 10] = w; a[j * 16 + 11] = 0;
        a[j * 16 + 12] = pos[i * 3]; a[j * 16 + 13] = mat[i * 16 + 13] + 0.1; a[j * 16 + 14] = pos[i * 3 + 2]; a[j * 16 + 15] = 1;
        const ca = card.instanceColor.array;
        ca[j * 3] = tint[i * 3] * 0.72; ca[j * 3 + 1] = tint[i * 3 + 1] * 0.72; ca[j * 3 + 2] = tint[i * 3 + 2] * 0.72;
        cellAttr[j] = this.card[i * 3 + 2];
      }
    }
    // rocks: those within the shadow ring first (behind the camera too: their shadows fall into view), then the rest of what is in view
    const ring2 = near2 * 0.36, rock2 = mid2 * 0.56, nRn = [0, 0, 0];   // (a rock beyond three quarters of the mid distance is a speck)
    for (let i = 0; i < N; i++) {
      const k = kind[i];
      if (k < 4 || this.rank[i] > keep) continue;
      const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz;
      if (dx * dx + dz * dz >= ring2) continue;
      const m = this.rocks[k - 4];
      if (nR[k - 4] < m.instanceMatrix.count) put(m, nR[k - 4]++, mat, tint, i);
    }
    for (let k = 0; k < 3; k++) nRn[k] = nR[k];
    for (let i = 0; i < N; i++) {
      const k = kind[i];
      if (k < 4 || this.rank[i] > keep) continue;
      const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz, d2 = dx * dx + dz * dz;
      if (d2 < ring2 || d2 > rock2) continue;
      _sph.center.set(pos[i * 3], pos[i * 3 + 1] + rad[i] * 0.8, pos[i * 3 + 2]);
      _sph.radius = rad[i] + 8;
      if (!_fr.intersectsSphere(_sph)) continue;
      const m = this.rocks[k - 4];
      if (nR[k - 4] < m.instanceMatrix.count) put(m, nR[k - 4]++, mat, tint, i);
    }
    for (let k = 0; k < 3; k++) { this.rockProxy[k].count = nRn[k]; this.rockProxy[k].userData.on = this.rockShadows && nRn[k] > 0; }
    for (let k = 0; k < 4; k++) {
      finish(this.near[k], nN[k]); finish(this.mid[k], nM[k]);
      this.proxy[k].count = nN[k];
      this.proxy[k].userData.on = this.useProxy && nN[k] > 0;
    }
    for (let k = 0; k < 3; k++) finish(this.rocks[k], nR[k]);
    finish(card, nC[0]);
    card.geometry.attributes.aCell.needsUpdate = true;
  }
}

function put(mesh, j, mat, tint, i, f = 1) {
  mesh.instanceMatrix.array.set(mat.subarray(i * 16, i * 16 + 16), j * 16);
  const c = mesh.instanceColor.array;
  c[j * 3] = tint[i * 3] * f; c[j * 3 + 1] = tint[i * 3 + 1] * f; c[j * 3 + 2] = tint[i * 3 + 2] * f;
}
function finish(mesh, n) {
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.visible = n > 0;
}
