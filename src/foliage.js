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
import { buildSpruce, buildPine, buildOak, buildBirch, buildRock } from './foliagegeo.js';

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

const SPECIES = ['spruce', 'pine', 'oak', 'birch'];
const BUILD = [buildSpruce, buildPine, buildOak, buildBirch];
const HEIGHT = [10.2, 9.8, 8.6, 8.8];       // metres of the 1.0-scale model (for the cards and the bounding spheres)
const CROWN_W = [5.6, 4.6, 6.2, 3.4];
const hash01 = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

// ---- the cards of the far forest: trees painted on a canvas, four across ----
let atlas = null;
function treeAtlas() {
  if (atlas) return atlas;
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W * 4; c.height = H;
  const g = c.getContext('2d');
  const blob = (cx, cy, rx, ry, a, b) => {
    const grd = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 2, cx, cy, Math.max(rx, ry));
    grd.addColorStop(0, a); grd.addColorStop(1, b);
    g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  };
  // 0 spruce: stacked ragged tiers
  let ox = 0;
  g.fillStyle = '#3a2a1c'; g.fillRect(ox + 60, 205, 8, 51);
  for (let i = 0; i < 7; i++) {
    const t = i / 6, y = 214 - i * 28, w = 52 - 44 * Math.pow(t, 0.85);
    const grd = g.createLinearGradient(ox + 64 - w, 0, ox + 64 + w, 0);
    grd.addColorStop(0, '#46803f'); grd.addColorStop(0.45, '#2c5e38'); grd.addColorStop(1, '#173d2a');
    g.fillStyle = grd; g.beginPath(); g.moveTo(ox + 64, y - 46);
    for (let k = 0; k <= 6; k++) g.lineTo(ox + 64 + w - (k / 6) * 2 * w, y + (k % 2 ? 0 : 7));
    g.closePath(); g.fill();
  }
  // 1 pine: bare trunk, a few cloud-like clumps on top
  ox = W;
  g.fillStyle = '#6b4a30'; g.fillRect(ox + 60, 96, 7, 160);
  [[64, 58, 38, 22], [92, 96, 30, 18], [38, 108, 30, 17], [66, 132, 26, 14]].forEach(([x, y, rx, ry]) => blob(ox + x, y, rx, ry, '#4f8a4a', '#1f4a30'));
  // 2 oak: a short trunk under a lumpy round crown
  ox = W * 2;
  g.fillStyle = '#4a3322'; g.fillRect(ox + 59, 150, 10, 106);
  [[64, 96, 52, 46], [32, 124, 30, 26], [98, 124, 30, 26], [64, 60, 34, 28], [86, 78, 26, 24]].forEach(([x, y, rx, ry]) => blob(ox + x, y, rx, ry, '#7aa63c', '#2d5a22'));
  // 3 birch: white trunk, a narrow light crown
  ox = W * 3;
  g.fillStyle = '#d8d4c6'; g.fillRect(ox + 61, 70, 5, 186);
  g.fillStyle = '#35332c'; for (let y = 90; y < 250; y += 17) g.fillRect(ox + 61, y, 5, 3);
  [[64, 70, 30, 40], [50, 118, 22, 26], [80, 110, 22, 28], [64, 36, 20, 24]].forEach(([x, y, rx, ry]) => blob(ox + x, y, rx, ry, '#9cc650', '#3f7a2a'));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  atlas = tex;
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
    });
  }
  cardMat.map = treeAtlas();
  return { treeMat, rockMat, cardMat };
}

// a unit card standing on the ground, 1 m wide and 1 m tall; its size comes from the instance matrix
function cardGeometry(cap) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.8, 0.6, 0, 0.8, 0.6, 0, 0.8, 0.6, 0, 0.8, 0.6], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

const geoCache = new Map();   // species/lod geometries are built once per page and survive a world rebuild (three.js re-uploads them)
function modelGeometry(kind, lod) {
  if (kind === 1 && lod === 1) kind = 0;   // (a far pine is a dark cone like a spruce: its umbrella crown reads as a mushroom from afar)
  const key = kind + ':' + lod;
  let g = geoCache.get(key);
  if (!g) {
    g = kind < 4 ? BUILD[kind](lod) : buildRock(kind - 4, 1);
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
      const k = t.conifer ? (hash01(t.x, t.z, 1) < 0.66 ? 0 : 1) : (hash01(t.x, t.z, 2) < 0.62 ? 2 : 3);
      all.push({ kind: k, ...t });
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
      this.rad[i] = tree ? HEIGHT[k] * sy * 0.55 + 2 : 2.2 * t.s + 1;
      this.rank[i] = t.extra ? hash01(t.x, t.z, 9) : -1;
      // tint: brightness and a little hue, applied on top of the colours painted into the model
      const b = 0.86 + 0.28 * t.c, h = hash01(t.x, t.z, 10) - 0.5;
      if (tree) col.setRGB(b * (1 + h * 0.22), b * (1 + h * 0.06), b * (1 - h * 0.28));
      else col.setRGB(b, b * 0.99, b * 0.96);
      this.tint[i * 3] = col.r; this.tint[i * 3 + 1] = col.g; this.tint[i * 3 + 2] = col.b;
      if (tree) { this.card[i * 3] = CROWN_W[k] * sxz * 1.12; this.card[i * 3 + 1] = HEIGHT[k] * sy * 1.04; this.card[i * 3 + 2] = k; }
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
