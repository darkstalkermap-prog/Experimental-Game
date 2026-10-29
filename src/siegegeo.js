// How the siege engines look: a handful of meshes each (the pieces are merged by material, see parts.js) instead of fifteen. Only what
// moves is a mesh of its own: the two wheel axles, the ram's log and head, the catapult's arm. The geometry is built once per kind and
// shared by every engine of it (a world rebuild keeps it, see materials().geos); the house colours (flag, band) are the only part that
// depends on the team, and they live in one small mesh of their own.
// The engine's own frame: +z is the way it faces, +y up, the origin on the ground in the middle.
import * as THREE from 'three';
import { Parts, place, rgb, mul, between } from './parts.js';
import { materials } from './materials.js';
import { TEAM_COLORS } from './config.js';

const PLANK = rgb(0xd8c8b0), WOOD = rgb(0xc9b490), DARK = rgb(0x6c5639), HIDE = rgb(0x6e5236), IRON = rgb(0x3a3b3f), ROPE = rgb(0x8a7550), STONE = rgb(0x77736c);
const at = (m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().multiplyMatrices(m, place(x, y, z, ry, rx, rz));
const QUAD = [0, 0, 1, 0, 1, 1, 0, 1];

// a cylinder lying along x or z, centred on (x, y, z)
const alongX = (P, key, r0, r1, len, x, y, z, segs, col) => P.cyl(key, r0, r1, len, segs, place(x + len / 2, y, z, 0, 0, Math.PI / 2), col);
const alongZ = (P, key, r0, r1, len, x, y, z, segs, col) => P.cyl(key, r0, r1, len, segs, place(x, y, z - len / 2, 0, Math.PI / 2, 0), col);

// a wheel pair on one axle: axle-local frame (the axle runs along x through the origin), wheels at x = +-half
function wheelPair(r, half) {
  const P = new Parts(31);
  for (const s of [-1, 1]) {
    const x = s * half;
    alongX(P, 'timber', r, r, 0.26, x, 0, 0, 12, WOOD);
    alongX(P, 'timber', 0.15, 0.15, 0.4, x, 0, 0, 8, DARK);
    for (let i = 0; i < 3; i++) P.obox('timber', at(place(x, 0, 0), 0, 0, 0, 0, i * Math.PI / 3), 0.16, r * 0.96, 0.05, DARK);   // (planks across the disc, a little proud of it)
  }
  alongX(P, 'timber', 0.07, 0.07, half * 2, 0, 0, 0, 6, DARK);
  return { timber: P };
}

function ramParts(team) {
  const T = new Parts(11), H = new Parts(12);
  // sills, the deck and its cross beams
  for (const s of [-1, 1]) T.box('timber', s * 1.0 - 0.17, s * 1.0 + 0.17, 0.62, 0.92, -2.9, 2.9, WOOD);
  for (const z of [-2.3, 0, 2.3]) T.box('timber', -1.22, 1.22, 0.72, 0.9, z - 0.13, z + 0.13, PLANK);
  T.box('timber', -1.1, 1.1, 0.88, 1.0, -2.75, 2.75, PLANK);
  // six posts, the plates on them, two braces a side
  for (const s of [-1, 1]) {
    for (const z of [-2.5, 0, 2.5]) T.box('timber', s * 1.1 - 0.1, s * 1.1 + 0.1, 1.0, 2.6, z - 0.1, z + 0.1, WOOD);
    T.box('timber', s * 1.1 - 0.14, s * 1.1 + 0.14, 2.5, 2.72, -2.75, 2.75, DARK);
    for (const z of [-1.25, 1.25]) { const b = between(s * 1.1, 1.0, z - 0.9 * Math.sign(z), s * 1.1, 2.4, z); T.obox('timber', b.m, 0.07, 0.05, b.half, DARK); }
  }
  // a cradle under the log: two uprights with a yoke each
  for (const z of [-1.3, 1.3]) {
    for (const s of [-1, 1]) T.box('timber', s * 0.5 - 0.07, s * 0.5 + 0.07, 1.0, 1.55, z - 0.07, z + 0.07, DARK);
    T.box('timber', -0.62, 0.62, 1.42, 1.5, z - 0.1, z + 0.1, DARK);
  }
  // the roof: two slopes of planks under hides, a ridge pole, a flag on a staff at the rear
  for (const s of [-1, 1]) {
    const m = place(s * 0.75, 3.0, 0, 0, 0, -s * 0.6);
    T.obox('timber', m, 0.9, 0.06, 2.98, PLANK);
    H.obox('plain', at(m, 0, 0.085, 0), 0.94, 0.03, 3.0, mul(HIDE, s > 0 ? 1.05 : 0.95));
    for (const z of [-2.0, -0.7, 0.7, 2.0]) H.obox('plain', at(m, 0, 0.12, z), 0.95, 0.012, 0.04, mul(HIDE, 0.55));   // (the lashings)
  }
  T.box('timber', -0.09, 0.09, 3.38, 3.5, -3.0, 3.0, DARK);
  T.box('timber', -0.04, 0.04, 3.5, 4.6, -2.8, -2.72, DARK);
  const c = rgb(TEAM_COLORS[team] ?? 0xffffff);
  H.quad('plain', [0, 4.55, -2.8], [0, 4.55, -3.9], [0, 3.85, -3.8], [0, 3.85, -2.8], c, QUAD, true);
  H.box('plain', -0.5, 0.5, 2.72, 2.8, 2.92, 3.0, c);   // a band of the house colour across the front of the roof
  return { timber: T, plain: H };
}

function ramLog() {
  const T = new Parts(13), M = new Parts(14);
  alongZ(T, 'timber', 0.3, 0.3, 6.2, 0, 0, 0, 10, WOOD);
  for (const z of [-2.6, -1.0, 1.0, 2.6]) alongZ(M, 'metal', 0.34, 0.34, 0.12, 0, 0, z, 10, IRON);   // iron bands
  alongZ(M, 'metal', 0.42, 0.3, 0.7, 0, 0, 3.3, 10, IRON);
  M.add('metal', new THREE.ConeGeometry(0.32, 0.38, 10), place(0, 0, 3.86, 0, Math.PI / 2, 0), mul(IRON, 1.3));
  return { timber: T, metal: M };
}

function catapultParts(team) {
  const T = new Parts(21), M = new Parts(22), H = new Parts(23);
  for (const s of [-1, 1]) {
    T.box('timber', s * 1.0 - 0.15, s * 1.0 + 0.15, 0.62, 0.98, -2.3, 2.3, WOOD);
    // the upright, leaning back a little, and the two braces that hold it
    T.obox('timber', place(s * 1.0, 1.9, 0.4, 0, -0.2, 0), 0.16, 1.15, 0.16, PLANK);
    const b = between(s * 1.0, 0.9, 1.6, s * 1.0, 2.2, 0.6);
    T.obox('timber', b.m, 0.08, 0.07, b.half, DARK);
    const b2 = between(s * 1.0, 0.9, -1.4, s * 1.0, 2.1, 0.2);
    T.obox('timber', b2.m, 0.08, 0.07, b2.half, DARK);
    M.box('metal', s * 1.0 - 0.2, s * 1.0 + 0.2, 2.62, 3.0, -0.02, 0.62, IRON);   // the bearing on top of the upright
  }
  for (const z of [-1.8, 1.8]) T.box('timber', -1.15, 1.15, 0.68, 0.93, z - 0.15, z + 0.15, PLANK);
  T.box('timber', -1.0, 1.0, 0.9, 1.0, -2.2, 2.2, PLANK);
  // the winch drum at the rear with its handles, and the rope from it up to the arm
  alongX(T, 'timber', 0.24, 0.24, 1.8, -0.9, 1.35, -2.0, 10, DARK);
  for (const s of [-1, 1]) T.obox('timber', place(s * 1.05, 1.35, -2.0, 0, 0, 0.5 * s), 0.05, 0.38, 0.05, WOOD);
  alongX(H, 'plain', 0.27, 0.27, 0.9, -0.45, 1.35, -2.0, 8, ROPE);
  const rope = between(0, 1.35, -1.8, 0, 2.7, -3.5);
  H.obox('plain', rope.m, 0.02, 0.02, rope.half, ROPE);
  alongX(M, 'metal', 0.12, 0.12, 2.5, -1.25, 2.8, 0.3, 8, IRON);   // the axle the arm turns on
  // a pennant of the house colour on the left upright
  const c = rgb(TEAM_COLORS[team] ?? 0xffffff);
  H.box('plain', -1.04, -0.96, 3.0, 4.1, 0.2, 0.28, DARK);
  H.quad('plain', [-1.0, 4.05, 0.28], [-1.0, 4.05, -0.85], [-1.0, 3.45, -0.8], [-1.0, 3.45, 0.28], c, QUAD, true);
  return { timber: T, metal: M, plain: H };
}

function catapultArm() {
  const T = new Parts(24);
  T.box('timber', -0.13, 0.13, -0.13, 0.13, -3.8, 0.6, WOOD);
  T.box('timber', -0.2, 0.2, -0.2, 0.2, -1.5, -1.2, DARK);   // a bound collar
  T.cyl('timber', 0.46, 0.3, 0.38, 10, place(0, 0.02, -3.7), PLANK);   // the sling's bucket
  T.box('timber', -0.45, 0.45, -0.75, 0.15, 0.45, 1.35, STONE);   // the counterweight
  T.box('timber', -0.47, 0.47, -0.4, -0.3, 0.43, 1.37, mul(IRON, 1.2));
  return { timber: T };
}

// ---- the geometry cache: [name] -> geometry (a world rebuild keeps them: materials().geos is never disposed) ----
const cache = new Map();
function part(name, build, key, mat) {
  let g = cache.get(name);
  if (g === undefined) {
    g = build()[key].geometry(mat);
    if (g) materials().geos.push(g);
    cache.set(name, g);
  }
  return g;
}

// -> { group, wheels: [axle meshes: spin them about x], log, arm, flag: the mesh whose geometry carries the house colour }
export function buildEngine(type, team) {
  const M = materials();
  const group = new THREE.Group();
  const mk = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const still = (m) => { m.updateMatrix(); m.matrixAutoUpdate = false; group.add(m); return m; };
  const wheels = [];
  const axle = (r, zs, y) => {
    const geo = part(`wheels:${r}`, () => wheelPair(r, 1.25), 'timber', 'timber');
    for (const z of zs) { const w = mk(geo, M.timber); w.position.set(0, y, z); group.add(w); wheels.push(w); }
  };
  const out = { group, wheels, log: null, arm: null, flag: null, type, flagTeam: team };
  if (type === 'ram') {
    still(mk(part('ram:body', () => ramParts(team), 'timber', 'timber'), M.timber));
    out.flag = still(mk(flagGeometry('ram', team), M.plain));
    axle(0.55, [-1.9, 1.9], 0.55);
    const log = new THREE.Group();
    log.add(mk(part('ram:log', ramLog, 'timber', 'timber'), M.timber), mk(part('ram:head', ramLog, 'metal', 'metal'), M.metal));
    log.position.y = 1.7;
    group.add(log);
    out.log = log;
  } else {
    still(mk(part('cat:body', () => catapultParts(team), 'timber', 'timber'), M.timber));
    still(mk(part('cat:metal', () => catapultParts(team), 'metal', 'metal'), M.metal));
    out.flag = still(mk(flagGeometry('cat', team), M.plain));
    axle(0.6, [-1.7, 1.7], 0.6);
    const arm = new THREE.Group();
    arm.position.set(0, 2.8, 0.3);
    arm.add(mk(part('cat:arm', catapultArm, 'timber', 'timber'), M.timber));
    arm.rotation.x = 0.55;   // cocked
    group.add(arm);
    out.arm = arm;
  }
  return out;
}

// the mesh that carries the house colours of an engine (also for one that has changed hands)
export function flagGeometry(kind, team) {
  return part(`${kind}:plain:${team}`, () => (kind === 'ram' ? ramParts(team) : catapultParts(team)), 'plain', 'plain');
}
