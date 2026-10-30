// The land: the play area as a grid of culled chunks that follow the physics heights exactly, and behind it a far landscape made of
// square rings of coarser and coarser cells (visual only: nobody can stand there) that carries on to the horizon.
//   chunk geometry   position, normal, uv, color (the whole baked ground colour, used by Q.terrain 0 and 1)
//                    aBase (the grass colour alone) and aMask (castle dirt, trodden hill, sand, forest) for the splat shader
//   far mesh         four meshes (one per side, so a quarter of the horizon is culled at a time); each ring has twice the cell size of the
//                    one inside it, and the odd vertices on the seam are pulled onto the coarse edge so there are no cracks
import * as THREE from 'three';
import { WORLD, CASTLE, HILL, PRACTICE } from './config.js';
import { CASTLE_SITES } from './physics.js';
import { smoothstep, clamp } from './noise.js';
import { forestDensity } from './landscape.js';
import { terrainMaterial, setRoads, setBiomeLook } from './terrainmat.js';
import { Q } from './quality.js';
import { active } from './biomes.js';
import { BOWL } from './warmap.js';

const CHUNK = 64;   // cells per chunk side (128 m)
// far rings: cell size and how wide the ring is (each ring starts where the last ended, snapped to the next cell size)
const RINGS = [
  { c: 2, w: 8 }, { c: 4, w: 40 }, { c: 8, w: 96 }, { c: 16, w: 224 }, { c: 32, w: 480 }, { c: 64, w: 1024 },
];

// The colours of the ground (see biomes.js: the meadow's are the game's old ones), made once per biome: grassA/B/Dry the ground cover, dirt the trampled
// earth, trodden the top of the hill in the middle (bare, pale, much walked on), sand the floor of the practice yard, forestFloor/forestDark under
// and on the trees, scrub above the forest, rock/rockWarm the bare stone, snow the cap on the highest ground, patch the biome's ponds or ice.
const tmp = new THREE.Color();
const colourSets = new Map();
let setFor = null, set = null;
function colours() {
  if (setFor === active.def) return set;
  let c = colourSets.get(active.def.id);
  if (!c) { c = {}; for (const k in active.def.ground) c[k] = new THREE.Color(active.def.ground[k]); colourSets.set(active.def.id, c); }
  setFor = active.def; set = c;
  return c;
}

export const TREE_LINE = 126;   // metres above the valley floor where the forest gives up (varies with the noise); the meadow's, see biomes.js for the rest
export const SNOW_LINE = 186;
export const treeLineAt = (nz, x, z) => active.def.treeLine + 12 * nz.noise(x * 0.01 + 4, z * 0.01 - 2);

// how much of a spot is a pond, a sheet of ice or a pale patch of hardpan (0 .. 1; biomes.js `patch`): a noise field, kept off the slopes, the roads,
// the castles, the middle of the map and the rim. The same field paints the ground and tells the marsh where the mud is.
export function patchAt(nz, roadDist, x, z, slope) {
  const P = active.def.patch;
  if (!P) return 0;
  const f = nz.fbm((x + active.ox) * P.scale + P.ox, (z + active.oz) * P.scale + P.oz, 3) * 0.5 + 0.5;
  let w = smoothstep(P.thr, P.thr + P.soft, f);
  if (w <= 0) return 0;
  w *= (1 - smoothstep(0.25, 0.6, slope)) * smoothstep(44, 56, Math.hypot(x, z)) * smoothstep(7, 13, roadDist(x, z));
  w *= 1 - smoothstep(WORLD.playHalf - 26, WORLD.playHalf - 8, Math.max(Math.abs(x), Math.abs(z)));
  for (const s of CASTLE_SITES) w *= smoothstep(CASTLE.H + 8, CASTLE.H + 22, Math.max(Math.abs(x - s.x), Math.abs(z - s.z)));
  return w * P.max;
}

// soft wind-blown bands across the land (dunes, drifts): a gentle light-and-dark pattern for the ground colour, 0 where the biome has none
function bands(nz, sx, sz, amp) {
  return amp * Math.sin((sx * 0.62 + sz * 0.78) * 0.3 + 5 * nz.fbm(sx * 0.011, sz * 0.011, 2));
}

// The colour of the grass at a spot (the meadow, darker under the forest and thinning out towards the treeline): what the grass blades take
export function grassBase(nz, x, z, h, base) {
  const { fbm } = nz, C = colours(), B = active.def;
  const sx = x + active.ox, sz = z + active.oz;
  const n1 = fbm(sx * 0.02, sz * 0.02, 3) * 0.5 + 0.5, n2 = fbm(sx * 0.09 + 10, sz * 0.09, 2) * 0.5 + 0.5;
  const forest = forestDensity(nz, sx, sz), tl = treeLineAt(nz, x, z);
  base.copy(C.grassA).lerp(C.grassB, n1).lerp(C.grassDry, smoothstep(0.55, 0.9, n2) * 0.6);
  base.lerp(C.forestFloor, smoothstep(0.35, 0.9, forest) * 0.38 * (0.4 + 0.6 * smoothstep(4, 22, h)));
  base.lerp(C.forestFloor, smoothstep(10, 36, h) * 0.45 * (1 - smoothstep(tl - 14, tl, h)));
  if (B.bands) base.multiplyScalar(1 + bands(nz, sx, sz, B.bands));
  return base.multiplyScalar(0.9 + n2 * 0.15);
}

// Everything the ground colour depends on, for one spot. Fills `o` ({ base, all: Color, mask: [castle, hill, sand or patch, forest] }).
// slope is the gradient |grad h|. `roadDist` comes from world.js.
export function groundSample(nz, roadDist, physics, x, z, h, slope, o) {
  const { fbm } = nz, C = colours(), B = active.def;
  const sx = x + active.ox, sz = z + active.oz;   // (where the dressing noise is read: a seed moves it, seed 0 does not)
  const n1 = fbm(sx * 0.02, sz * 0.02, 3) * 0.5 + 0.5;
  const n2 = fbm(sx * 0.09 + 10, sz * 0.09, 2) * 0.5 + 0.5;
  const forest = forestDensity(nz, sx, sz);
  const base = o.base;
  base.copy(C.grassA).lerp(C.grassB, n1).lerp(C.grassDry, smoothstep(0.55, 0.9, n2) * 0.6);
  // under the trees the grass is thin and dark; higher up the meadow gives way to forest floor and then to scrub
  base.lerp(C.forestFloor, smoothstep(0.35, 0.9, forest) * 0.38 * (0.4 + 0.6 * smoothstep(4, 22, h)));
  const tl = treeLineAt(nz, x, z);
  const forestZone = smoothstep(5, 24, h) * (1 - smoothstep(tl - 16, tl + 4, h));
  base.lerp(C.forestFloor, forestZone * (0.55 + 0.3 * n1));
  base.lerp(C.scrub, smoothstep(tl - 8, tl + 10, h) * 0.8);
  if (B.bands) base.multiplyScalar(1 + bands(nz, sx, sz, B.bands));
  const shade = 0.9 + n2 * 0.15;
  base.multiplyScalar(shade);
  // the same layers as masks, for the shader
  let castle = 0, hill = 0, sandW = 0, patchW = 0;
  if (!o.far) {   // (beyond the play area there are no castles, hill or yard)
    if (physics.war) {   // War Mode's bowl: no castles or hill; the floor is trampled bare in patches where the armies stand and fight
      castle = (1 - smoothstep(BOWL.floor * 0.6, BOWL.floor * 0.95, Math.hypot(x, z))) * smoothstep(0.45, 0.8, n2) * 0.6;
    } else {
      for (const s of CASTLE_SITES) {
        const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
        castle = Math.max(castle, (1 - smoothstep(CASTLE.H + 2, CASTLE.H + 14, d)) * (0.55 + 0.3 * n2));
      }
      hill = (1 - smoothstep(HILL.plateau - 1, HILL.plateau + 7, Math.hypot(x, z))) * 0.8;
    }
  }
  if (physics.practice && !o.far) {
    const d = Math.max(Math.abs(x - physics.practice.x) - PRACTICE.hw, Math.abs(z - physics.practice.z) - PRACTICE.hd);
    sandW = (1 - smoothstep(PRACTICE.wallT, PRACTICE.wallT + 9, d)) * 0.92;
  }
  if (B.patch && !o.far && !physics.practice) patchW = patchAt(nz, roadDist, x, z, slope);
  const mask = o.mask;
  // the forest on the foot of the mountains: the same inputs as the trees' placement (scenery.js), so the canopy is where the trees are
  const rockN = fbm(sx * 0.035 + 20, sz * 0.035 - 8, 3) * 0.5 + 0.5;
  const canopy = smoothstep(12, 34, h) * (1 - smoothstep(tl - 18, tl + 2, h)) * clamp(forest * 1.6 + 0.4, 0, 1) * (1 - smoothstep(1.5, 2.2, slope + 0.8 * (rockN - 0.5))) * B.canopy;
  mask[0] = castle; mask[1] = hill; mask[2] = sandW || patchW; mask[3] = canopy;
  o.alt[0] = smoothstep(tl - 6, tl + 14, h);
  o.alt[1] = smoothstep(B.snowLine - 14, B.snowLine + 8, h + 14 * (n1 - 0.5));
  if (!o.bake) return o;
  // the baked colour (what Q.terrain 0 and 1 show): the ground layers, then rock where it is steep, bare above the trees, snow on top
  const all = o.all;
  all.copy(base);
  all.lerp(C.dirt, castle);
  if (!o.far) all.lerp(C.dirt, (1 - smoothstep(2.2, 4.5, roadDist(x, z))) * 0.85);
  all.lerp(C.trodden, hill);
  if (sandW) all.lerp(C.sand, sandW);
  if (patchW) all.lerp(C.patch, patchW);
  tmp.copy(C.rock).lerp(C.rockWarm, n1);
  // bare rock: patches on the steep faces (the cliffs of the wall), and everything above the trees
  const rockW = Math.max(smoothstep(1.65, 2.3, slope + 0.9 * (rockN - 0.5)) * smoothstep(10, 26, h), smoothstep(tl - 6, tl + 14, h) * (0.55 + 0.4 * rockN),
    smoothstep(0.85, 1.0, rockN) * smoothstep(0.9, 1.5, slope) * smoothstep(6, 20, h));
  tmp.multiplyScalar(0.75 + 0.35 * rockN);
  all.lerp(tmp, rockW * (1 - 0.92 * canopy));
  all.lerp(C.forestDark, canopy * 0.8);   // (the splat shader paints crowns here; the baked colour is just their dark average)
  all.multiplyScalar(shade);
  const sn = smoothstep(B.snowLine - 14, B.snowLine + 8, h + 14 * (n1 - 0.5)) * (1 - smoothstep(0.8, 1.5, slope));
  if (sn > 0) all.lerp(C.snow, sn);
  return o;
}

const makeSample = (far = false, bake = false) => ({ base: new THREE.Color(), all: new THREE.Color(), mask: [0, 0, 0, 0], alt: [0, 0], far, bake });

// A chunk's geometry is built from arrays that the caller fills; `quads` is the shared index list for an nx x nz grid of cells.
const indexCache = new Map();
function gridIndex(nx, nz) {
  const key = nx + 'x' + nz;
  let a = indexCache.get(key);
  if (a) return a;
  const w = nx + 1;
  const idx = new Uint16Array(nx * nz * 6);
  let k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a0 = j * w + i, b = a0 + 1, c = a0 + w, d = c + 1;
    // the diagonal runs from (i+1, j) to (i, j+1): the same triangulation as Physics.terrainHeight
    idx[k++] = a0; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  a = new THREE.BufferAttribute(idx, 1);
  indexCache.set(key, a);
  return a;
}

function makeGeometry(nv, withIndexFor) {
  const g = new THREE.BufferGeometry();
  const arrays = {
    position: new Float32Array(nv * 3), normal: new Float32Array(nv * 3), color: new Float32Array(nv * 3), uv: new Float32Array(nv * 2),
    aBase: new Float32Array(nv * 3), aMask: new Float32Array(nv * 4), aAlt: new Float32Array(nv * 2),
  };
  g.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(arrays.uv, 2));
  g.setAttribute('aBase', new THREE.BufferAttribute(arrays.aBase, 3));
  g.setAttribute('aMask', new THREE.BufferAttribute(arrays.aMask, 4));
  g.setAttribute('aAlt', new THREE.BufferAttribute(arrays.aAlt, 2));
  g.setIndex(gridIndex(withIndexFor[0], withIndexFor[1]));
  return { g, arrays };
}

// write one vertex
function put(a, v, x, y, z, nx, ny, nz, s) {   // (the baked colour is only written when the sample has one)
  a.position[v * 3] = x; a.position[v * 3 + 1] = y; a.position[v * 3 + 2] = z;
  const l = Math.hypot(nx, ny, nz) || 1;
  a.normal[v * 3] = nx / l; a.normal[v * 3 + 1] = ny / l; a.normal[v * 3 + 2] = nz / l;
  a.uv[v * 2] = x / 6; a.uv[v * 2 + 1] = z / 6;
  if (s.bake) { a.color[v * 3] = s.all.r; a.color[v * 3 + 1] = s.all.g; a.color[v * 3 + 2] = s.all.b; }
  a.aBase[v * 3] = s.base.r; a.aBase[v * 3 + 1] = s.base.g; a.aBase[v * 3 + 2] = s.base.b;
  a.aMask[v * 4] = s.mask[0]; a.aMask[v * 4 + 1] = s.mask[1]; a.aMask[v * 4 + 2] = s.mask[2]; a.aMask[v * 4 + 3] = s.mask[3];
  a.aAlt[v * 2] = s.alt[0]; a.aAlt[v * 2 + 1] = s.alt[1];
}

export class Terrain {
  constructor(scene, physics, env) {
    this.scene = scene;
    this.physics = physics;
    this.roadDist = env.roadDist;
    setRoads(env.roads, !!physics.war);
    setBiomeLook(active.def);   // (the splat shader's palette: uniforms, so every biome shares one program)
    this.group = new THREE.Group();
    this.group.userData.owner = 'a3 terrain';
    this.chunks = [];
    this.far = [];
    this.rings = [];
    this.level = -1;
    this.isTerrain = true;
    this.colored = false;   // the baked colours (Q.terrain 0 and 1) are made the first time they are needed
    this.buildChunks();
    this.buildFar();
    scene.add(this.group);
    const placeholder = terrainMaterial(0);   // (until the first frame says which quality to draw at: see update)
    for (const m of this.chunks) m.material = placeholder;
    for (const m of this.far) m.material = placeholder;
  }

  // ---- the play area: +-playHalf in chunks of CHUNK cells, heights straight from the physics grid ----
  buildChunks() {
    const ph = this.physics, n = ph.n, H = ph.heights, res = ph.res, half = WORLD.half, P = WORLD.playHalf;
    const lo = Math.round((half - P) / res), hi = n - 1 - lo;   // node range of the play area
    const nz = ph.noise, s = makeSample();
    const hAt = (ix, iz) => H[iz * n + clamp(ix, 0, n - 1)];
    for (let z0 = lo; z0 < hi; z0 += CHUNK) {
      for (let x0 = lo; x0 < hi; x0 += CHUNK) {
        const x1 = Math.min(hi, x0 + CHUNK), z1 = Math.min(hi, z0 + CHUNK);
        const cx = x1 - x0, cz = z1 - z0;
        const { g, arrays } = makeGeometry((cx + 1) * (cz + 1), [cx, cz]);
        let v = 0;
        for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++, v++) {
          const x = -half + ix * res, z = -half + iz * res;
          const h = H[iz * n + ix];
          const dx = (hAt(ix + 1, iz) - hAt(ix - 1, iz)) / (2 * res), dz = (H[Math.min(n - 1, iz + 1) * n + ix] - H[Math.max(0, iz - 1) * n + ix]) / (2 * res);
          groundSample(nz, this.roadDist, ph, x, z, h, Math.hypot(dx, dz), s);
          put(arrays, v, x, h, z, -dx, 1, -dz, s);
        }
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const mesh = new THREE.Mesh(g, null);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.chunk = true;
        this.group.add(mesh);
        this.chunks.push(mesh);
      }
    }
  }

  // ---- the far landscape ----
  // the height of the far mesh at a lattice point of ring k (the odd points on the outer seam sit on the straight line between their neighbours)
  ringHeight(k, x, z) {
    const r = this.rings[k], c = r.c, ph = this.physics;
    const onX = Math.abs(Math.abs(x) - r.b) < 1e-6, onZ = Math.abs(Math.abs(z) - r.b) < 1e-6;
    if (k < this.rings.length - 1 && (onX || onZ)) {
      // along the seam line: odd multiples of c get the average of the two neighbours (the coarse ring has only the even ones)
      if (onZ && Math.round(x / c) % 2 !== 0) return (ph.rawHeight(x - c, z) + ph.rawHeight(x + c, z)) / 2;
      if (onX && Math.round(z / c) % 2 !== 0) return (ph.rawHeight(x, z - c) + ph.rawHeight(x, z + c)) / 2;
    }
    return ph.rawHeight(x, z);
  }

  buildFar() {
    const ph = this.physics, nz = ph.noise, s = makeSample(true);
    let a = WORLD.playHalf;
    const snap = (v, m) => Math.ceil(v / m - 1e-9) * m;
    for (let k = 0; k < RINGS.length; k++) {
      const c = RINGS[k].c;
      const b = k < RINGS.length - 1 ? snap(a + RINGS[k].w, RINGS[k + 1].c) : snap(a + RINGS[k].w, c);
      this.rings.push({ c, a, b });
      a = b;
    }
    // one mesh per side: strips of every ring
    const sides = { N: [], S: [], E: [], W: [] };
    this.rings.forEach((r, k) => {
      const { a: ia, b: ob } = r;
      sides.N.push([k, -ob, ia, ob, ob]);   // [ring, x0, z0, x1, z1]
      sides.S.push([k, -ob, -ob, ob, -ia]);
      sides.E.push([k, ia, -ia, ob, ia]);
      sides.W.push([k, -ob, -ia, -ia, ia]);
    });
    for (const [name, strips] of Object.entries(sides)) {
      // count
      let nvTotal = 0;
      for (const [k, x0, z0, x1, z1] of strips) { const c = this.rings[k].c; nvTotal += ((x1 - x0) / c + 1) * ((z1 - z0) / c + 1); }
      // one geometry per side, all strips in it: indices are built here because the strips have different sizes
      const g = new THREE.BufferGeometry();
      const arrays = {
        position: new Float32Array(nvTotal * 3), normal: new Float32Array(nvTotal * 3), color: new Float32Array(nvTotal * 3), uv: new Float32Array(nvTotal * 2),
        aBase: new Float32Array(nvTotal * 3), aMask: new Float32Array(nvTotal * 4), aAlt: new Float32Array(nvTotal * 2),
      };
      const ntri = strips.reduce((t, [k, x0, z0, x1, z1]) => { const c = this.rings[k].c; return t + ((x1 - x0) / c) * ((z1 - z0) / c) * 6; }, 0);
      const index = new Uint32Array(ntri);
      let v = 0, ii = 0;
      for (const [k, x0, z0, x1, z1] of strips) {
        const r = this.rings[k], c = r.c, last = k === this.rings.length - 1;
        const w = (x1 - x0) / c + 1, d = (z1 - z0) / c + 1;
        // the heights of the whole lattice and two rows beyond it (for the normals), each worked out once
        const B = 2, W = w + 2 * B, hh = new Float32Array(W * (d + 2 * B));
        for (let j = -B; j < d + B; j++) for (let i = -B; i < w + B; i++) hh[(j + B) * W + i + B] = ph.rawHeight(x0 + i * c, z0 + j * c);
        const H = (i, j) => hh[(j + B) * W + i + B];
        const v0 = v;
        for (let j = 0; j < d; j++) for (let i = 0; i < w; i++, v++) {
          const x = x0 + i * c, z = z0 + j * c;
          const onX = !last && Math.abs(Math.abs(x) - r.b) < 1e-6, onZ = !last && Math.abs(Math.abs(z) - r.b) < 1e-6;
          // on the seam with the next ring (which has only every other vertex) the odd ones sit on the straight line between their neighbours,
          // and the normals use that ring's coarser step so both rings light the seam the same
          let h = H(i, j);
          if (onZ && Math.round(x / c) % 2 !== 0) h = (H(i - 1, j) + H(i + 1, j)) / 2;
          else if (onX && Math.round(z / c) % 2 !== 0) h = (H(i, j - 1) + H(i, j + 1)) / 2;
          const e = onX || onZ ? 2 : 1;
          const dx = (H(i + e, j) - H(i - e, j)) / (2 * e * c), dz = (H(i, j + e) - H(i, j - e)) / (2 * e * c);
          groundSample(nz, this.roadDist, ph, x, z, h, Math.hypot(dx, dz), s);
          put(arrays, v, x, h, z, -dx, 1, -dz, s);
        }
        for (let j = 0; j < d - 1; j++) for (let i = 0; i < w - 1; i++) {
          const a0 = v0 + j * w + i, b = a0 + 1, cc = a0 + w, dd = cc + 1;
          index[ii++] = a0; index[ii++] = cc; index[ii++] = b; index[ii++] = b; index[ii++] = cc; index[ii++] = dd;
        }
      }
      g.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
      g.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(arrays.uv, 2));
      g.setAttribute('aBase', new THREE.BufferAttribute(arrays.aBase, 3));
      g.setAttribute('aMask', new THREE.BufferAttribute(arrays.aMask, 4));
      g.setAttribute('aAlt', new THREE.BufferAttribute(arrays.aAlt, 2));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, null);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.far = name;
      this.group.add(mesh);
      this.far.push(mesh);
    }
  }

  // the height of the ground as drawn (and as walked on, inside the play area) at any spot, for planting things on it
  surfaceHeight(x, z) {
    const e = Math.max(Math.abs(x), Math.abs(z));
    if (e <= WORLD.playHalf) return this.physics.terrainHeight(x, z);
    let k = 0;
    while (k < this.rings.length - 1 && e >= this.rings[k].b) k++;
    const c = this.rings[k].c;
    const x0 = Math.floor(x / c) * c, z0 = Math.floor(z / c) * c, tx = (x - x0) / c, tz = (z - z0) / c;
    const a = this.ringHeight(k, x0, z0), b = this.ringHeight(k, x0 + c, z0), d = this.ringHeight(k, x0, z0 + c), f = this.ringHeight(k, x0 + c, z0 + c);
    return tx + tz <= 1 ? a + (b - a) * tx + (d - a) * tz : f + (d - f) * (1 - tx) + (b - f) * (1 - tz);
  }

  // The whole baked colour of every vertex (for Q.terrain 0 and 1; the splat shader works from the other attributes and never needs it)
  bakeColors() {
    this.colored = true;
    const nz = this.physics.noise, ph = this.physics;
    for (const mesh of this.chunks.concat(this.far)) {
      const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal, col = g.attributes.color;
      const s = makeSample(!!mesh.userData.far, true);
      for (let i = 0; i < p.count; i++) {
        const ny = Math.max(n.getY(i), 0.05), slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / ny;
        groundSample(nz, this.roadDist, ph, p.getX(i), p.getZ(i), p.getY(i), slope, s);
        col.setXYZ(i, s.all.r, s.all.g, s.all.b);
      }
      col.needsUpdate = true;
    }
  }

  setLevel(level) {
    if (level === this.level) return;
    if (level < 2 && !this.colored) this.bakeColors();
    this.level = level;
    const mat = terrainMaterial(level);
    for (const m of this.chunks) m.material = mat;
    for (const m of this.far) m.material = mat;
  }

  update(dt, cam) {
    this.setLevel(Q.terrain);   // a quality change swaps the materials (the chunks and the far sides are culled by three.js)
  }
}
