// How the siege engines look. An engine is four meshes: the frame (one merged geometry per house, because the colours of the shields and the
// flag are baked into it), the two wheel axles (they turn), and the part that works (the ram's log, the catapult's arm). All of them are
// drawn with the one material in siegemat.js; the geometry says what each piece is made of through its `aKind` attribute: dark weathered
// timber with grain, patched hides on the ram's roof, iron straps, rope, bark on the log, stone in the catapult's weight, painted cloth.
// The geometry is built once per kind, house and detail level and shared by every engine (a world rebuild keeps it, see materials().geos).
// The engine's own frame: +z is the way it faces, +y up, the origin on the ground in the middle.
import * as THREE from 'three';
import { Parts, place, rgb, mul, between } from './parts.js';
import { materials } from './materials.js';
import { KIND } from './siegemat.js';
import { TEAM_COLORS } from './config.js';
import { Q } from './quality.js';

// how each kind maps its picture (see parts.js): boards run their grain along the piece, hides and bark are projected in the piece's own frame,
// rope repeats finely (the shader twists it), iron, stone and cloth have no picture of their own
const CFG = {
  wood: { scale: 1.6, mode: 'grain' },
  hide: { scale: 1.3, mode: 'local' },
  bark: { scale: 1.2, mode: 'local' },
  rope: { scale: 0.12, mode: 'local' },
  iron: { scale: 1, mode: 'none' },
  stone: { scale: 1, mode: 'none' },
  cloth: { scale: 1, mode: 'none' },
  paint: { scale: 1.6, mode: 'local' },
};

// tints (linear): the textures carry the colour, these darken and warm it
const TIM = [0.5, 0.49, 0.45], PLK = [0.66, 0.63, 0.57], DRK = [0.3, 0.29, 0.27], HIDE = [1, 0.96, 0.9];
const IRON = rgb(0x4e5057), ROPE = rgb(0x8a7550), STONE = rgb(0x77736c), BARK = [1, 0.98, 0.94];
const QUAD = [0, 0, 1, 0, 1, 1, 0, 1];

const at = (m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().multiplyMatrices(m, place(x, y, z, ry, rx, rz));

// a cylinder lying along x or z, centred on (x, y, z)
const alongX = (P, key, r0, r1, len, x, y, z, segs, col, o = null) => P.cyl(key, r0, r1, len, segs, place(x + len / 2, y, z, 0, 0, Math.PI / 2), col, o);
const alongZ = (P, key, r0, r1, len, x, y, z, segs, col, o = null) => P.cyl(key, r0, r1, len, segs, place(x, y, z - len / 2, 0, Math.PI / 2, 0), col, o);

// a round shield on a side of the frame, its face towards `s` (+1: +x, -1: -x): a flat octagon with an iron boss
function shield(P, x, y, z, s, r, col, rim = null) {
  const m = place(x, y, z, s * Math.PI / 2);
  P.add('paint', new THREE.CircleGeometry(r, 8), m, col);
  if (rim) P.add('paint', new THREE.RingGeometry(r * 0.8, r * 0.995, 8), at(m, 0, 0, 0.004), rim);
  P.add('iron', new THREE.ConeGeometry(r * 0.25, r * 0.2, 6), place(x + s * 0.02, y, z, 0, 0, -s * Math.PI / 2), mul(IRON, 1.3));
}

// ---------------------------------------------------------------------------------------------------------------------------
// the ram: a long timber frame on two axles under a pitched roof of hides, the log lying in a cradle (it slides back and forth)
function ramFrame(team, d) {
  const P = new Parts(11, CFG);
  const J = (c, a = 0.1) => P.jitter(c, a);
  const house = rgb(TEAM_COLORS[team] ?? 0xffffff);
  // sills, cross beams and the deck of planks
  for (const s of [-1, 1]) P.box('wood', s - 0.17, s + 0.17, 0.62, 0.92, -2.9, 2.9, J(TIM));
  for (const z of [-2.3, 0, 2.3]) P.box('wood', -1.22, 1.22, 0.72, 0.9, z - 0.13, z + 0.13, J(DRK));
  const planks = d > 0 ? 7 : 2, pw = 2.2 / planks;
  for (let i = 0; i < planks; i++) P.box('wood', -1.1 + i * pw + 0.01, -1.1 + (i + 1) * pw - 0.01, 0.88, 1.0, -2.75, 2.75, J(PLK, 0.14), { skip: 'd' });
  // six posts, the plates on them, two braces a side
  for (const s of [-1, 1]) {
    for (const z of [-2.5, 0, 2.5]) P.box('wood', s * 1.1 - 0.1, s * 1.1 + 0.1, 1.0, 2.6, z - 0.1, z + 0.1, J(TIM), { skip: 'd' });
    P.box('wood', s * 1.1 - 0.14, s * 1.1 + 0.14, 2.5, 2.72, -2.75, 2.75, J(DRK));
    for (const z of [-1.25, 1.25]) { const b = between(s * 1.1, 1.0, z - 0.9 * Math.sign(z), s * 1.1, 2.4, z); P.obox('wood', b.m, 0.07, 0.05, b.half, J(DRK)); }
    // iron straps round the heads of the posts (and their feet on the richest level)
    if (d > 0) for (const z of [-2.5, 0, 2.5]) {
      P.box('iron', s * 1.1 - 0.108, s * 1.1 + 0.108, 2.18, 2.3, z - 0.108, z + 0.108, J(IRON));
      if (d > 1) P.box('iron', s * 1.1 - 0.108, s * 1.1 + 0.108, 1.1, 1.22, z - 0.108, z + 0.108, J(IRON));
    }
  }
  // the cradle under the log: an upright either side and a yoke across, twice
  for (const z of [-1.3, 1.3]) {
    for (const s of [-1, 1]) P.box('wood', s * 0.5 - 0.07, s * 0.5 + 0.07, 1.0, 1.55, z - 0.07, z + 0.07, J(DRK), { skip: 'd' });
    P.box('wood', -0.62, 0.62, 1.42, 1.5, z - 0.1, z + 0.1, J(DRK));
  }
  // the roof: boards, then sheets of hide overlapping like tiles, battens over the joints, a board along each eave, a ridge pole
  for (const s of [-1, 1]) {
    const m = place(s * 0.75, 3.0, 0, 0, 0, -s * 0.6);
    P.obox('wood', m, 0.9, 0.05, 2.98, J(PLK, 0.12));   // (light enough that the underside of the eaves, seen from the ground, is not black)
    const zs = d > 0 ? [-2.25, -0.75, 0.75, 2.25] : [-1.5, 1.5], half = d > 0 ? 0.8 : 1.6;
    zs.forEach((zc, i) => P.obox('hide', at(m, 0, 0.068 + i * 0.008, zc), 0.93, 0.02, half, J(HIDE, 0.2), { off: [P.rng(), P.rng()] }));
    if (d > 0) for (const zj of [-2.9, -1.5, 0, 1.5, 2.9]) P.obox('wood', at(m, 0, 0.1, zj), 0.95, 0.02, 0.045, J(DRK));
    P.obox('wood', at(m, s * 0.9, -0.01, 0), 0.04, 0.08, 3.0, J(DRK));
  }
  P.box('wood', -0.1, 0.1, 3.4, 3.52, -3.05, 3.05, J(DRK));
  // gable boards front and rear, each with a triangle of the house colour
  const tri = new THREE.Shape();
  tri.moveTo(-1.12, 2.7); tri.lineTo(1.12, 2.7); tri.lineTo(0, 3.5); tri.closePath();
  const gable = () => new THREE.ExtrudeGeometry(tri, { depth: 0.07, bevelEnabled: false });
  P.add('wood', gable(), place(0, 0, 2.93), J(PLK));
  P.add('wood', gable(), place(0, 0, -3.0), J(PLK));
  const TUV = [0, 0, 1, 0, 0.5, 0.35, 0.5, 0.35];
  P.quad('paint', [-0.8, 2.84, 3.012], [0.8, 2.84, 3.012], [0, 3.4, 3.012], [0, 3.4, 3.012], house, TUV);
  P.quad('paint', [0.8, 2.84, -3.012], [-0.8, 2.84, -3.012], [0, 3.4, -3.012], [0, 3.4, -3.012], house, TUV);
  // a flag on a staff at the rear
  P.box('wood', -0.04, 0.04, 3.5, 4.6, -2.8, -2.72, J(DRK));
  P.quad('cloth', [0, 4.55, -2.8], [0, 4.55, -3.9], [0, 3.85, -3.8], [0, 3.85, -2.8], house, QUAD, true);
  // the house's shields along both flanks, in two shades; the crew stand between the first two (z about -1.5)
  if (d > 0) {
    const dark = mul(house, 0.5), pale = mul(house, 0.8);
    const zl = d > 1 ? [-2.5, 0, 1.25, 2.5] : [0, 2.5];
    for (const s of [-1, 1]) zl.forEach((z, i) => ((i + (s > 0 ? 1 : 0)) % 2 ? shield(P, s * 1.235, 1.95, z, s, 0.31, dark, d > 1 ? pale : null) : shield(P, s * 1.235, 1.95, z, s, 0.31, pale, d > 1 ? dark : null)));
  }
  return P;
}

function ramLog(d) {
  const P = new Parts(13, CFG);
  // the trunk, the iron head (a collar and a blunt cone), iron straps, a lashing of rope each side of the middle
  alongZ(P, 'bark', 0.3, 0.3, 6.2, 0, 0, 0, d > 0 ? 10 : 7, BARK);
  alongZ(P, 'iron', 0.42, 0.3, 0.7, 0, 0, 3.3, d > 0 ? 8 : 6, IRON);
  P.add('iron', new THREE.ConeGeometry(0.32, 0.4, d > 0 ? 8 : 6), place(0, 0, 3.85, 0, Math.PI / 2, 0), mul(IRON, 1.25));
  for (const z of d > 0 ? [-2.6, -1.0, 1.0, 2.6] : [-1.0, 1.0]) alongZ(P, 'iron', 0.34, 0.34, 0.12, 0, 0, z, 8, IRON, { open: true });
  if (d > 0) {
    for (const z of [-1.7, 1.7]) alongZ(P, 'rope', 0.315, 0.315, 0.22, 0, 0, z, 8, ROPE, { open: true });
    alongZ(P, 'iron', 0.31, 0.31, 0.06, 0, 0, -3.13, 8, IRON);
  }
  return P;
}

// ---------------------------------------------------------------------------------------------------------------------------
// the catapult: a frame with two A-shaped sides carrying the axle, the winch behind, and an arm with a counterweight on its short end and
// the sling's dish on its long one. Cocked, the long arm points down and forward; loosed, it whips up (siege.js turns it about x).
function catapultFrame(team, d) {
  const P = new Parts(21, CFG);
  const J = (c, a = 0.1) => P.jitter(c, a);
  const house = rgb(TEAM_COLORS[team] ?? 0xffffff);
  for (const s of [-1, 1]) {
    P.box('wood', s - 0.15, s + 0.15, 0.62, 0.98, -2.3, 2.3, J(TIM));
    // the two legs of the A, meeting at the bearing on top
    const f = between(s, 0.98, 1.7, s, 2.62, 0.5), r = between(s, 0.98, -1.2, s, 2.62, 0.1);
    P.obox('wood', f.m, 0.09, 0.09, f.half, J(PLK));
    P.obox('wood', r.m, 0.09, 0.09, r.half, J(PLK));
    if (d > 0) { const b = between(s, 1.55, 0.95, s, 1.5, -0.3); P.obox('wood', b.m, 0.06, 0.05, b.half, J(DRK)); }
    P.box('iron', s - 0.2, s + 0.2, 2.6, 3.0, -0.02, 0.62, J(IRON));
  }
  for (const z of [-1.8, 1.8]) P.box('wood', -1.15, 1.15, 0.68, 0.93, z - 0.15, z + 0.15, J(PLK));
  const planks = d > 0 ? 5 : 1, pw = 2.0 / planks;
  for (let i = 0; i < planks; i++) P.box('wood', -1.0 + i * pw + 0.01, -1.0 + (i + 1) * pw - 0.01, 0.9, 1.0, -2.2, 2.2, J(PLK, 0.14), { skip: 'd' });
  alongX(P, 'iron', 0.11, 0.11, 2.6, 0, 2.8, 0.3, 8, IRON);   // the axle the arm turns on
  // the winch at the rear: two posts, a drum with a coil of rope, an iron ratchet wheel, two handles
  for (const s of [-1, 1]) P.box('wood', s * 0.95 - 0.07, s * 0.95 + 0.07, 0.98, 1.75, -2.1, -1.9, J(DRK), { skip: 'd' });
  alongX(P, 'wood', 0.22, 0.22, 1.7, 0, 1.4, -2.0, 8, J(DRK));
  alongX(P, 'rope', 0.27, 0.27, 0.9, 0.15, 1.4, -2.0, 8, ROPE);
  alongX(P, 'iron', 0.32, 0.32, 0.06, -0.8, 1.4, -2.0, 8, IRON);
  if (d > 0) for (const s of [-1, 1]) P.obox('wood', place(s * 1.05, 1.4, -2.0, 0, 0, 0.5 * s), 0.05, 0.38, 0.05, J(TIM));
  // a pennant of the house colour on the left leg, and the house's shields on the flanks
  P.box('wood', -1.04, -0.96, 3.0, 4.1, 0.2, 0.28, J(DRK));
  P.quad('cloth', [-1.0, 4.05, 0.28], [-1.0, 4.05, -0.85], [-1.0, 3.45, -0.8], [-1.0, 3.45, 0.28], house, QUAD, true);
  if (d > 0) {
    const dark = mul(house, 0.5), pale = mul(house, 0.8);
    for (const s of [-1, 1]) [-0.7, 0.7].forEach((z, i) => ((i + (s > 0 ? 1 : 0)) % 2 ? shield(P, s * 1.18, 1.33, z, s, 0.3, dark, d > 1 ? pale : null) : shield(P, s * 1.18, 1.33, z, s, 0.3, pale, d > 1 ? dark : null)));
    // a few boulders waiting on the deck
    [[0.4, 1.23, -0.95, 0.27], [-0.3, 1.2, -1.15, 0.24], [0.05, 1.5, -1.05, 0.22]].forEach(([x, y, z, rad], i) => P.add('stone', new THREE.IcosahedronGeometry(rad, 0), place(x, y, z, i * 1.7, i * 0.9), J(STONE, 0.2)));
  }
  return P;
}

function catapultArm(d) {
  const P = new Parts(24, CFG);
  const J = (c, a = 0.1) => P.jitter(c, a);
  // the beam, from the short end behind the pivot (z = -1.3) to the sling (z = 3.7); an iron collar at the pivot and two straps
  P.obox('wood', place(0, 0, 1.2), 0.12, 0.12, 2.5, J(PLK));
  P.box('iron', -0.2, 0.2, -0.2, 0.2, -0.28, 0.28, J(IRON));
  if (d > 0) for (const z of [1.4, 2.6]) P.box('iron', -0.14, 0.14, -0.14, 0.14, z - 0.04, z + 0.04, J(IRON));
  // the sling's dish, with an iron rim
  P.cyl('wood', 0.42, 0.34, 0.14, d > 0 ? 9 : 6, place(0, 0.1, 3.55), J(DRK));
  P.cyl('iron', 0.46, 0.46, 0.08, d > 0 ? 9 : 6, place(0, 0.12, 3.55), IRON, { open: true });
  // the counterweight: a block of stone between two boards, bound with iron
  P.box('stone', -0.45, 0.45, -0.95, -0.12, -1.75, -0.88, J(STONE, 0.1));
  for (const z of [-1.78, -0.85]) P.box('wood', -0.48, 0.48, -0.97, -0.1, z - 0.04, z + 0.04, J(DRK));
  if (d > 0) for (const x of [-0.25, 0.25]) P.box('iron', x - 0.04, x + 0.04, -0.99, -0.08, -1.82, -0.81, J(IRON));
  return P;
}

// a wheel pair on one axle: axle-local frame (the axle runs along x through the origin), wheels at x = +-half
function wheelPair(r, half, d) {
  const P = new Parts(31, CFG);
  const J = (c, a = 0.1) => P.jitter(c, a);
  const segs = d > 0 ? 12 : 8;
  for (const s of [-1, 1]) {
    const x = s * half;
    alongX(P, 'wood', r * 0.97, r * 0.97, 0.22, x, 0, 0, segs, J(TIM, 0.06));
    alongX(P, 'iron', r + 0.025, r + 0.025, 0.28, x, 0, 0, segs, J(IRON, 0.08), { open: true });   // the iron tyre
    alongX(P, 'wood', 0.17, 0.17, 0.36, x, 0, 0, 6, J(DRK));
    if (d > 1) {
      alongX(P, 'iron', 0.1, 0.1, 0.42, x, 0, 0, 6, IRON);
      P.obox('wood', place(x + s * 0.12, 0, 0), 0.03, r * 0.94, 0.07, J(DRK));
      P.obox('wood', place(x + s * 0.12, 0, 0), 0.03, 0.07, r * 0.94, J(DRK));
    }
  }
  alongX(P, 'wood', 0.07, 0.07, half * 2, 0, 0, 0, 6, J(DRK));
  return P;
}

// ---- merge the pieces of a Parts into one geometry: every vertex knows its kind (aKind) and where it stands in the engine's frame (aEP) ----
function assemble(P, offset = [0, 0, 0]) {
  const pos = [], nor = [], uv = [], col = [], kind = [], ep = [], idx = [];
  for (const key of P.keys()) {
    const a = P.acc[key], base = pos.length / 3, k = KIND[key];
    for (let i = 0; i < a.pos.length; i += 3) {
      pos.push(a.pos[i], a.pos[i + 1], a.pos[i + 2]);
      nor.push(a.nor[i], a.nor[i + 1], a.nor[i + 2]);
      col.push(a.col[i], a.col[i + 1], a.col[i + 2]);
      ep.push(a.pos[i] + offset[0], a.pos[i + 1] + offset[1], a.pos[i + 2] + offset[2]);
      kind.push(k);
    }
    for (let i = 0; i < a.uv.length; i++) uv.push(a.uv[i]);
    for (let i = 0; i < a.idx.length; i++) idx.push(base + a.idx[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(kind), 1));
  g.setAttribute('aEP', new THREE.BufferAttribute(new Float32Array(ep), 3));
  g.setIndex(new THREE.BufferAttribute(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// ---- the geometry cache: [name] -> geometry (a world rebuild keeps them: materials().geos is never disposed) ----
const cache = new Map();
function part(name, build, offset) {
  let g = cache.get(name);
  if (g === undefined) {
    g = assemble(build(), offset);
    materials().geos.push(g);
    cache.set(name, g);
  }
  return g;
}

const detailNow = () => Math.max(0, Math.min(2, Q.detail | 0));

// -> { group, wheels: [axle meshes: spin them about x], log, arm, flag: the mesh whose geometry carries the house colour }
export function buildEngine(type, team) {
  const M = materials();
  const d = detailNow();
  const group = new THREE.Group();
  const mk = (geo) => {
    const m = new THREE.Mesh(geo, M.engine);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const still = (m) => { m.updateMatrix(); m.matrixAutoUpdate = false; group.add(m); return m; };
  const wheels = [];
  const axle = (r, zs, y) => {
    const geo = part(`wheels:${r}:${d}`, () => wheelPair(r, 1.25, d), [0, y, 0]);
    for (const z of zs) { const w = mk(geo); w.position.set(0, y, z); group.add(w); wheels.push(w); }
  };
  const out = { group, wheels, log: null, arm: null, flag: null, type, flagTeam: team };
  if (type === 'ram') {
    out.flag = still(mk(flagGeometry('ram', team)));
    axle(0.55, [-1.9, 1.9], 0.55);
    const log = mk(part(`ram:log:${d}`, () => ramLog(d), [0, 1.7, 0]));
    log.position.y = 1.7;
    group.add(log);
    out.log = log;
  } else {
    out.flag = still(mk(flagGeometry('cat', team)));
    axle(0.6, [-1.7, 1.7], 0.6);
    const arm = mk(part(`cat:arm:${d}`, () => catapultArm(d), [0, 2.8, 0.3]));
    arm.position.set(0, 2.8, 0.3);
    arm.rotation.x = 0.55;   // cocked
    group.add(arm);
    out.arm = arm;
  }
  return out;
}

// the mesh that carries the house colours of an engine (also for one that has changed hands): the whole frame, once per house
export function flagGeometry(kind, team) {
  const d = detailNow();
  return part(`${kind}:frame:${team}:${d}`, () => (kind === 'ram' ? ramFrame(team, d) : catapultFrame(team, d)), [0, 0, 0]);
}
