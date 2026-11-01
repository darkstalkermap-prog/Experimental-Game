// The catalogue of character parts. A shape is built once per detail level (0 richest .. 2 plainest, 3 the baked far-away model) into a
// geometry shared by every soldier that wears it; colours that differ between soldiers (house cloth, skin, hair, a horse's coat) are
// colour SLOTS filled per instance by the shader, so a shape does not depend on the team. Every shape is modelled in the frame of the
// joint it hangs from (see models.js): +y up, +z forward, the weapon arm at -x, the shield arm at +x. `open` shapes carry thin cloth or
// hollow shells and are drawn double-sided. Gates (see modelkit.js) used here: 1 steel pauldrons (tier 1-3), 2 cloak (tier 2+),
// 3 gold gorget and band (tier 3+), 4 gold pauldrons and helm wings (tier 4+), 5 long cloak and gilded plate (tier 5), 6 beard,
// 7 8 9 hair cuts, 12 gilded shield rim (tier 3+).
// Kit is built in layers, as it is worn: cloth or a quilted coat next to the body, mail or leather over it, plates over that held on by
// straps and buckles, a surcoat or tabard on top; every piece is its own surface with its own edge (a rolled rim on a plate, a hem on cloth),
// and dust and mud climb from the feet (modelkit.js `dirt`). The richest level carries the small things (rivets, buckles, lacing, stitched
// hems); the plain levels keep the layers and the silhouette, so a crowd stays cheap.
import * as THREE from 'three';
import { Builder, PAT, SKIRT } from './modelkit.js';
import { sculptHead, sculptHair, sculptBeard } from './heads.js';

export const SHAPES = new Map();
function def(name, make, open = false) { SHAPES.set(name, { name, make, open, geo: [null, null, null, null] }); }
export function getShape(name) {
  const s = SHAPES.get(name);
  if (!s) throw new Error('no character shape ' + name);
  return s;
}
export function shapeGeo(shape, level) {
  if (!shape.geo[level]) { const b = new Builder(level); shape.make(b); shape.geo[level] = b.geometry(); }
  return shape.geo[level];
}

const K = {
  steel: 0xa2a7ae, steelLt: 0xbcc0c6, iron: 0x55575c, ironDk: 0x2e2f33, gold: 0xc9973a, brass: 0xa77a2c, leather: 0x5a3a22, leatherLt: 0x7a5330, leatherDk: 0x3a2617,
  boot: 0x3b2a1c, bootDk: 0x2a1d13, cuff: 0x4d3826, pants: 0x4c4237, trim: 0xd9c89a, wood: 0x6b4a2c, woodDk: 0x4a3420, bone: 0xe0d4b8, mail: 0x7a7f86, gamb: 0x9a8560,
  fur: 0x5a4634, furLt: 0x7a6450, linen: 0xd2c9b0, hoof: 0x2a2420, dark: 0x0a0a0c, red: 0xc0392b, quiver: 0x6a4a2a, sole: 0x1e1712,
  robe: 0x2b2160, robeDk: 0x1d1640, cream: 0xb3a685, green: 0x2f5a34, greenDk: 0x22422a, rope: 0xb09a6c,
};
const TAU = Math.PI * 2, PI = Math.PI;
const steel = { c: K.steel, m: 'steel' }, plate = { c: K.steel, m: 'plate' }, iron = { c: K.iron, m: 'iron' }, gold = { c: K.gold, m: 'gold' }, brass = { c: K.brass, m: 'brass' };
const leather = { c: K.leather, m: 'leather', p: PAT.leather }, leatherDk = { c: K.leatherDk, m: 'leather', p: PAT.leather }, leatherLt = { c: K.leatherLt, m: 'leather', p: PAT.leather };
const wood = { c: K.wood, m: 'wood', p: PAT.grain }, skin = { s: 'skin', m: 'skin', p: PAT.skin };
const cloth = { s: 'cloth', m: 'cloth', p: PAT.weave }, clothDk = { s: 'clothDark', m: 'cloth', p: PAT.weave }, clothLt = { s: 'clothLight', m: 'cloth', p: PAT.weave };
const mailM = { c: K.mail, m: 'mail', p: PAT.mail }, linen = { c: K.linen, m: 'cloth', p: PAT.weave }, trim = { c: K.trim, m: 'cloth', p: PAT.weave };
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// dirt in a frame: none above y1, all of k at y0 and below (mud splashed up from the feet, dust on a hem)
const mud = (y0, y1, k = 1) => (x, y) => k * sat((y1 - y) / (y1 - y0));
// an outward direction for a band lying on something round about the point c
const from = (c) => (x, y, z) => [x - c[0], y - c[1], z - c[2]];
// a rim: a thin ring (a rolled plate edge, a hem, a belt) round the y axis at height y, radii rx and rz, centred at z0
const rim = (b, y, rx, rz, z0, r, o, arc) => {
  if (arc) return b.lathe([[rx - r, y - r], [rx + r * 0.6, y - r * 0.2], [rx - r, y + r]], [0, 0, z0], { arc, sc: [1, 1, rz / rx], seg: b.pick(18, 10, 6), ...o });
  return b.torus([0, y, z0], rx, r, { rot: [PI / 2, 0, 0], sc: [1, rz / rx, 1], seg: b.pick(20, 12, 8), sides: b.pick(4, 3, 3), ...o });
};
// rivets: little domes at the points given (the richest level only)
const rivets = (b, pts, r, o = steel) => { if (b.level < 1) for (const p of pts) b.ell(p, r, { ...o, seg: [5, 3] }); };
// a buckle: a square frame and its tongue, the face toward `n` (the richest level only)
function buckle(b, c, n, s = 1, o = brass) {
  if (b.level >= 1) return;
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const ry = Math.atan2(n[0], n[2]), rx = -Math.asin(Math.max(-1, Math.min(1, n[1] / l)));
  b.torus(c, 0.0105 * s, 0.0024 * s, { ...o, rot: [rx, ry, PI / 4], sc: [1, 1, 1], seg: 4, sides: 4 });
  b.rod([c[0], c[1] + 0.008 * s, c[2]], [c[0], c[1] - 0.008 * s, c[2]], 0.0015 * s, 0.0015 * s, { ...o, seg: 4 });
}

// ---------------------------------------------------------------- the body plan (see models.js for the joints)
// A man 1.8 m tall, about 7.5 heads: hip joints at 0.95, knees at 0.51, ankles at 0.08, the waist at 1.07, shoulder joints at 1.43 and
// 0.39 apart, elbows at 1.12, wrists at 0.87 and the fist at mid-thigh, the base of the neck at 1.5, the chin at 1.55, the eyes at 1.68.
// Limbs and the trunk are lofts of rings (a superellipse each), so they swell where the muscles are (calf, thigh, biceps, forearm, chest)
// and taper at the joints; a ball at each joint keeps a bent knee or elbow closed.

// ---------------------------------------------------------------- legs (hip frame, knee frame)
const LEG = { cloth: { c: K.pants, m: 'cloth', p: PAT.weave }, mail: mailM, plate, skin, robe: { c: K.pants, m: 'cloth', p: PAT.weave } };
const THIGH = [[0.05, 0.08, 0.085, -0.01], [-0.04, 0.084, 0.088, 0.004], [-0.16, 0.074, 0.08, 0.014], [-0.3, 0.06, 0.066, 0.01], [-0.4, 0.05, 0.054, 0.006], [-0.45, 0.048, 0.05, 0.004]];
const CALF = [[0.03, 0.048, 0.05, 0.0], [-0.05, 0.05, 0.058, -0.01], [-0.13, 0.05, 0.06, -0.016], [-0.24, 0.04, 0.046, -0.008], [-0.34, 0.032, 0.035, 0.0], [-0.43, 0.03, 0.033, 0.0]];
const grow = (rings, d, dz = d) => rings.map(([y, rx, rz, z]) => [y, rx + d, rz + dz, z]);
// a loft along +z instead of +y (a foot): rings [z, half width, half height, -y of the centre]
const ALONG_Z = new THREE.Matrix4().makeRotationX(PI / 2);
// The boot: a shaft to below the knee with its top turned down, the ankle, a foot with a heel and a rounded toe on a sole, a strap and
// buckle over the instep. `kind`: 'leather', 'fur' (wrapped in pelt and thongs) or 'plate' (a sabaton of lames over a mail foot).
function boot(b, kind) {
  const bc = kind === 'fur' ? { c: K.fur, m: 'fur', p: PAT.fur } : { c: K.boot, m: 'leather', p: PAT.leather };
  const fc = kind === 'plate' ? { c: K.steel, m: 'plate' } : bc;   // (a sabaton is plate over the foot)
  b.dirt = mud(-0.5, -0.22);
  b.loft([[-0.135, 0.051, 0.057, -0.012], [-0.24, 0.047, 0.053, -0.008], [-0.34, 0.04, 0.043, 0.0], [-0.415, 0.039, 0.043, 0.004], [-0.45, 0.043, 0.05, 0.012]], { ...bc, a: [0.78, 1], seg: b.pick(18, 8, 6) });
  const foot = [[-0.085, 0.006, 0.006, 0.474], [-0.078, 0.03, 0.026, 0.472], [-0.05, 0.041, 0.04, 0.466], [-0.01, 0.045, 0.048, 0.458], [0.04, 0.047, 0.038, 0.468],
    [0.09, 0.048, 0.03, 0.477], [0.14, 0.046, 0.024, 0.483], [0.18, 0.039, 0.019, 0.488], [0.207, 0.024, 0.013, 0.492], [0.218, 0.006, 0.006, 0.494]];
  b.within(ALONG_Z, () => b.loft(foot, { ...fc, a: [0.8, 1], seg: b.pick(16, 8, 6), sq: 2.4 }));
  if (b.level < 2) {
    // the sole and the heel, darker and worn
    b.within(ALONG_Z, () => b.loft([[-0.082, 0.026, 0.006, 0.503], [-0.07, 0.04, 0.008, 0.503], [0.0, 0.046, 0.007, 0.504], [0.1, 0.05, 0.007, 0.504], [0.18, 0.042, 0.006, 0.503], [0.215, 0.022, 0.006, 0.501], [0.222, 0.004, 0.004, 0.5]], { c: K.sole, m: 'rubber', seg: b.pick(10, 6, 4), sq: 3, smooth: false }));
    b.rbox([0, -0.493, -0.055], [0.068, 0.022, 0.05], { c: K.sole, m: 'rubber', e: 0.3 });
    if (kind === 'leather') {
      b.loft([[-0.118, 0.056, 0.062, -0.012], [-0.135, 0.059, 0.065, -0.012], [-0.175, 0.058, 0.064, -0.012], [-0.185, 0.053, 0.059, -0.011]], { c: K.cuff, m: 'leather', p: PAT.leather, a: [0.85, 1], seg: b.pick(18, 8, 6), smooth: false });   // the turned-down top
      b.band([[-0.046, -0.452, 0.025], [0, -0.438, 0.06], [0.046, -0.452, 0.025]], 0.016, 0.004, { ...leatherDk, out: from([0, -0.5, 0.0]), segs: b.pick(8, 4, 2) });   // the instep strap
      buckle(b, [0.044, -0.452, 0.034], [0.8, 0, 0.6], 0.8);
    } else if (kind === 'fur') {
      for (const y of [-0.2, -0.29, -0.38]) b.band([[0.05, y, 0.015], [0, y - 0.015, 0.06], [-0.05, y - 0.03, 0.015], [-0.01, y - 0.045, -0.05], [0.05, y - 0.06, -0.02]], 0.008, 0.004, { ...leatherDk, out: from([0, y, -0.005]), segs: b.pick(12, 5, 3) });   // thongs wound round
    }
  }
  if (kind === 'plate' && b.level < 1) {
    // the sabaton's lames: the edge of each across the instep
    for (const [z, y] of [[0.035, -0.428], [0.085, -0.444], [0.135, -0.457]]) b.band([[-0.048, y - 0.03, z], [0, y, z], [0.048, y - 0.03, z]], 0.006, 0.003, { c: K.steelLt, m: 'plate', out: from([0, -0.5, z]), segs: 6 });
  }
  b.dirt = null;
}
for (const st of Object.keys(LEG)) {
  def('thigh.' + st, (b) => {
    // (the joints are balls a little inside the limb, so a straight leg shows no knob and a bent one no gap; they are shaded flat, like
    // the limb where they sit)
    const o = { ...LEG[st], a: [0.92, 0.97] }, j = { ...o, a: [0.92, 0.92] }, pad = st === 'cloth' || st === 'robe' ? 0.006 : st === 'mail' ? 0.004 : 0;
    b.dirt = mud(-0.6, -0.3, 0.35);
    b.loft(grow(THIGH, pad), { ...o, seg: b.pick(20, 8, 6) });
    b.ell([0, 0.04, -0.005], [0.08, 0.05, 0.085], { ...o, a: [0.97, 0.97] });
    if (b.level < 2) b.ell([0, -0.44, 0.004], [0.045 + pad, 0.048, 0.048 + pad], j);   // the knee
    if (b.level < 2 && st !== 'plate') b.ell([0, -0.425, 0.03 + pad], [0.03, 0.034, 0.02], { ...j, seg: [8, 6] });   // the kneecap
    if (st === 'plate' && b.level < 2) {
      // the cuisse over the front of the thigh in two lames with rolled edges, strapped round the back; the poleyn (knee cop) with its
      // fan on each side
      b.loft(grow(THIGH.slice(1, 4), 0.02), { ...plate, arc: [-1.45, 2.9], a: [0.85, 1], seg: b.pick(16, 8, 6) });
      b.loft(grow(THIGH.slice(3, 5), 0.022), { ...plate, arc: [-1.4, 2.8], a: [0.85, 1], seg: b.pick(14, 8, 6) });
      if (b.level < 1) {
        rim(b, -0.04, 0.106, 0.11, 0.004, 0.005, { c: K.steelLt, m: 'plate' }, [-1.45, 2.9]);
        rim(b, -0.3, 0.084, 0.09, 0.01, 0.004, { c: K.steelLt, m: 'plate' }, [-1.4, 2.8]);
        b.band([[0.07, -0.2, 0.03], [0.05, -0.2, -0.06], [0, -0.2, -0.085], [-0.05, -0.2, -0.06], [-0.07, -0.2, 0.03]], 0.018, 0.004, { ...leatherDk, out: from([0, -0.2, 0.01]), segs: 10 });
        rivets(b, [[0.075, -0.1, 0.06], [-0.075, -0.1, 0.06], [0.06, -0.33, 0.05], [-0.06, -0.33, 0.05]], 0.006);
      }
      b.ell([0, -0.44, 0.032], [0.064, 0.062, 0.05], { ...plate, a: [1, 1] });
      b.ell([0, -0.445, 0.056], [0.034, 0.052, 0.03], { ...plate, a: [1, 1], seg: [8, 6] });
      for (const s of [-1, 1]) b.ell([s * 0.056, -0.44, 0.012], [0.014, 0.05, 0.046], { ...plate, a: [0.9, 1], seg: [8, 6] });   // the fans
    }
    if (st === 'mail' && b.level < 2) b.loft([[-0.36, 0.058, 0.064, 0.008], [-0.4, 0.06, 0.066, 0.007]], { ...leatherDk, seg: b.pick(16, 8, 6), smooth: false });   // the garter
    if (st === 'robe') robeLeg(b);
    b.dirt = null;
  });
  def('shin.' + st, (b) => {
    const o = { ...LEG[st], a: [0.88, 0.92] }, pad = st === 'cloth' || st === 'robe' ? 0.006 : st === 'mail' ? 0.004 : 0;
    b.dirt = mud(-0.5, -0.1, 0.8);
    b.ell([0, 0, 0.004], [0.044 + pad, 0.046, 0.046 + pad], { ...o, a: [0.92, 0.92], seg: b.ellSeg(0.05) });
    b.loft(pad ? grow(CALF.slice(0, 3), pad) : CALF.slice(0, 4), { ...o, seg: b.pick(20, 8, 6) });
    if (st === 'plate' && b.level < 2) {
      // the greave, front and back halves, with a rolled top edge and a hinge of rivets
      b.loft(grow(CALF.slice(0, 5), 0.019), { ...plate, arc: [-1.55, 3.1], a: [0.9, 1], seg: b.pick(16, 8, 6) });
      b.loft(grow(CALF.slice(1, 5), 0.016), { ...plate, arc: [PI - 1.5, 3.0], a: [0.8, 0.95], seg: b.pick(14, 8, 6) });
      if (b.level < 1) {
        rim(b, -0.04, 0.07, 0.078, -0.01, 0.004, { c: K.steelLt, m: 'plate' }, [-1.55, 3.1]);
        rivets(b, [[0.06, -0.09, -0.01], [-0.06, -0.09, -0.01], [0.05, -0.27, -0.005], [-0.05, -0.27, -0.005]], 0.0055);
      }
    }
    boot(b, st === 'skin' ? 'fur' : st === 'plate' ? 'plate' : 'leather');
    if (st === 'robe') robeLeg(b, true);
    b.dirt = null;
  });
}
// A robe's skirt worn on the legs: the half on each side, from the hip to the knee on the thigh (the hip frame) and from the knee to the
// calf on the shin (lower: the knee frame), so it swings and folds with the leg and never cuts through it; the halves meet between the legs
function robeLeg(b, lower = false) {
  const o = { c: K.robe, m: 'wool', p: PAT.weave };
  if (lower) {
    b.dirt = mud(-0.36, -0.1, 0.7);
    b.loft([[0.03, 0.152, 0.124, 0.0], [-0.12, 0.16, 0.134, 0.004], [-0.3, 0.17, 0.144, 0.008], [-0.34, 0.172, 0.147, 0.01]], { ...o, a: [0.65, 0.95], seg: b.pick(20, 10, 6), sq: 2.2 });
    if (b.level < 2) rim(b, -0.335, 0.172, 0.147, 0.01, 0.007, { ...gold });
  } else {
    // (wide enough that the two halves meet between the legs: a skirt, not breeches; both legs wear it, so it is symmetric)
    b.loft([[0.04, 0.1, 0.11, 0.0], [-0.2, 0.13, 0.12, 0.0], [-0.42, 0.152, 0.128, 0.004], [-0.48, 0.155, 0.13, 0.004]], { ...o, a: [0.7, 1], seg: b.pick(20, 10, 6), sq: 2.2 });
  }
  b.dirt = null;
}

// ---------------------------------------------------------------- arms (shoulder frame, elbow frame)
const ARM = { cloth: { c: K.gamb, m: 'cloth', p: PAT.quilt }, mail: mailM, plate, skin, leather: { c: K.leather, m: 'leather', p: PAT.leather }, robe: { c: K.robe, m: 'wool', p: PAT.weave }, green: { c: K.green, m: 'wool', p: PAT.weave }, cream: { c: K.cream, m: 'cloth', p: PAT.weave }, house: cloth };
const UPPER = [[0.0, 0.05, 0.054, 0.0], [-0.08, 0.05, 0.054, 0.0], [-0.16, 0.044, 0.052, 0.008], [-0.25, 0.04, 0.044, 0.004], [-0.32, 0.037, 0.04, 0.0]];
const FOREARM = [[0.02, 0.04, 0.041, 0.0], [-0.06, 0.044, 0.043, 0.004], [-0.15, 0.037, 0.035, 0.002], [-0.235, 0.028, 0.026, 0.0], [-0.26, 0.027, 0.025, 0.0]];
// The pauldron of a plate arm: a dome over the shoulder and three lames below it stepping out and down, each with a rolled lower edge,
// rivets front and back, and the strap round the arm that holds it. (Both arms wear the same shape, so it is the same on either side.)
function pauldron(b, k = 1, o = plate) {
  const edge = { c: K.steelLt, m: o.m || 'plate' };
  b.shell([0, 0.018 * k, 0], [0.094 * k, 0.07 * k, 0.092 * k], 0, TAU, 0, PI * 0.56, { ...o, a: [0.85, 1] });
  const n = b.level < 2 ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const y = (-0.012 - i * 0.04) * k, r0 = (0.094 + i * 0.004) * k, r1 = (0.088 + i * 0.004) * k;
    b.lathe([[r0 - 0.012, y + 0.02], [r0, y + 0.012], [r1 + 0.004, y - 0.026]], [0, 0, 0], { ...o, sc: [1, 1, 0.98], a: [0.8, 1] });
    if (b.level < 2) rim(b, y - 0.026, r1 + 0.004, (r1 + 0.004) * 0.98, 0, 0.0035, edge);
    rivets(b, [[0, y - 0.004, r1 + 0.004], [0, y - 0.004, -r1 - 0.004]], 0.006);
  }
  if (b.level < 1) {
    b.band([[0.05, -0.15, 0.03], [0.0, -0.15, 0.055], [-0.05, -0.15, 0.03], [-0.03, -0.15, -0.045], [0.03, -0.15, -0.045], [0.05, -0.15, 0.03]], 0.016, 0.004, { ...leatherDk, out: from([0, -0.15, 0.004]), segs: 14 });
    buckle(b, [0, -0.15, 0.058], [0, 0, 1], 0.8);
  }
}
for (const st of Object.keys(ARM)) {
  def('arm.' + st, (b) => {
    const o = { ...ARM[st], a: [0.9, 1] };
    const pad = st === 'cloth' || st === 'leather' || st === 'green' || st === 'cream' || st === 'house' ? 0.008 : st === 'mail' ? 0.004 : 0;
    if (st === 'robe') { robeSleeve(b); return; }
    b.ell([0, -0.035, 0.0], [0.056 + pad, 0.085, 0.062 + pad], { ...o, a: [0.9, 1] });   // the deltoid, which rounds the shoulder into the trunk
    b.loft(grow(UPPER, pad), { ...o, seg: b.pick(20, 8, 6) });
    if (b.level < 2) b.ell([0, -0.31, 0], [0.034 + pad, 0.036, 0.036 + pad], { ...o, a: [0.9, 0.9] });       // the elbow
    if (st === 'skin' && b.level < 2) {
      b.ell([0, -0.14, 0.022], [0.034, 0.07, 0.034], { ...skin, a: [0.85, 1] });   // the biceps
      b.ell([0, -0.13, -0.02], [0.036, 0.075, 0.034], { ...skin, a: [0.8, 0.95] });   // the triceps
      if (b.level < 1) for (const y of [-0.06, -0.075]) b.lathe([[0.058, y], [0.06, y - 0.006], [0.058, y - 0.012]], [0, 0, 0], { ...brass, sc: [1, 1, 1.05], seg: 18 });   // arm rings
    }
    if (st === 'mail' && b.level < 2) b.lathe([[0.046, -0.24], [0.05, -0.26], [0.047, -0.29]], [0, 0, 0.002], { ...mailM, seg: b.pick(16, 8, 6) });   // the sleeve's end
    if (st === 'plate') {
      if (b.level < 2) {
        pauldron(b);
        b.loft(grow(UPPER.slice(2), 0.014), { ...plate, a: [0.85, 1], seg: b.pick(16, 8, 6) });   // the rerebrace
        if (b.level < 1) rim(b, -0.16, 0.058, 0.066, 0.008, 0.003, { c: K.steelLt, m: 'plate' });
      } else b.ell([0, 0.01, 0], [0.088, 0.072, 0.086], plate);
    }
  });
}
// a robe's wide sleeve, hanging open below the elbow (the mage)
function robeSleeve(b) {
  const o = { c: K.robe, m: 'wool', p: PAT.weave, a: [0.8, 1] };
  b.ell([0, -0.035, 0.0], [0.066, 0.088, 0.07], o);
  b.loft([[0.0, 0.06, 0.064, 0.0], [-0.1, 0.058, 0.062, 0.0], [-0.2, 0.054, 0.058, 0.006], [-0.3, 0.052, 0.054, 0.004], [-0.33, 0.05, 0.052, 0.0]], { ...o, seg: b.pick(20, 8, 6) });
  if (b.level < 2) b.ell([0, -0.31, 0], [0.048, 0.044, 0.048], o);
}
// the pauldrons of a trained soldier (gates 1 steel, 4 gold)
def('kit.arm', (b) => {
  b.ell([0, 0.025, 0], [0.09, 0.062, 0.088], { ...steel, g: 1, a: [0.8, 1] });
  b.ell([0, 0.03, 0], [0.096, 0.066, 0.094], { ...gold, g: 4 });
});
// A fist (the hands always hold something: a weapon, a shield's grip, a bow, a rope): the back of the hand, the fingers rolled round
// the grip, the thumb over them. Shared by both arms, so it is the same seen from either side.
function fist(b, o, gaunt = false) {
  b.rbox([0, -0.284, 0.004], [0.044, 0.07, 0.08], { ...o, e: 0.55, a: [0.9, 1] });
  b.rod([0, -0.318, -0.038], [0, -0.318, 0.042], 0.029, 0.026, { ...o, a: [0.85, 1], seg: b.pick(12, 6, 5) });
  if (b.level < 2) b.ell([0, -0.296, 0.046], [0.02, 0.032, 0.018], { ...o, rot: [0.4, 0, 0], seg: [8, 6] });
  if (b.level < 1) for (let k = 0; k < 4; k++) b.ell([0, -0.302, -0.028 + k * 0.022], [0.026, 0.012, 0.011], { ...o, seg: [7, 4] });   // the knuckles
  if (gaunt && b.level < 2) {
    // the gauntlet's plates: over the back of the hand, a ridge across the knuckles, lames over the fingers
    b.shell([0, -0.272, 0.004], [0.031, 0.05, 0.05], 0, TAU, 0, PI * 0.5, { ...plate, rot: [0, 0, PI / 2], a: [0.9, 1] });
    for (let k = 0; k < (b.level < 1 ? 2 : 1); k++) b.rod([0.026, -0.304 - k * 0.016, -0.036], [0.026, -0.304 - k * 0.016, 0.04], 0.008, 0.008, { ...plate, seg: 6 });
  }
}
const FORE = {
  cloth: { arm: { c: K.gamb, m: 'cloth', p: PAT.quilt }, hand: skin, bracer: true },
  mail: { arm: mailM, hand: leather },
  plate: { arm: plate, hand: { ...plate }, gaunt: true },
  skin: { arm: skin, hand: skin, bracer: true },
  green: { arm: { c: K.green, m: 'wool', p: PAT.weave }, hand: leatherLt, bracer: true },
  cream: { arm: { c: K.cream, m: 'cloth', p: PAT.weave }, hand: skin, cuff: cloth },
  house: { arm: cloth, hand: leather, vambrace: true },
  robe: { arm: { c: K.robe, m: 'wool', p: PAT.weave }, hand: skin, sleeve: true },
};
for (const st of Object.keys(FORE)) {
  def('fore.' + st, (b) => {
    const f = FORE[st];
    if (b.level >= 3) {   // (far away: a tapered forearm and a fist, so the weapon still has a hand to hold it)
      b.rod([0, 0.02, 0], [0, -0.25, 0], 0.04, 0.028, { ...f.arm, seg: 4 });
      b.rbox([0, -0.3, 0.004], [0.046, 0.09, 0.08], { ...f.hand, seg: [4, 2] });
      return;
    }
    const pad = st === 'cloth' || st === 'green' || st === 'cream' || st === 'house' ? 0.007 : st === 'mail' ? 0.004 : 0;
    if (f.sleeve) {
      // the wide sleeve flares open to below the wrist, a gold border at its mouth; the forearm inside it is bare
      b.loft(grow(FOREARM.slice(1), 0.0), { ...skin, seg: b.pick(14, 8, 6) });
      b.lathe([[0.05, 0.03], [0.056, -0.06], [0.07, -0.16], [0.086, -0.215]], [0, 0, -0.008], { ...f.arm, sc: [1, 1, 1.1], a: [0.75, 1], seg: b.pick(22, 10, 6) });
      if (b.level < 2) b.lathe([[0.082, -0.2], [0.09, -0.218], [0.087, -0.226]], [0, 0, -0.008], { ...gold, sc: [1, 1, 1.1], seg: b.pick(22, 10, 6) });
      b.ell([0, 0.0, 0], [0.048, 0.044, 0.048], f.arm);
    } else {
      b.loft(grow(FOREARM, pad), { ...f.arm, a: [0.88, 0.9], seg: b.pick(20, 8, 6) });
      b.ell([0, 0.0, 0], [0.034 + pad, 0.036, 0.036 + pad], { ...f.arm, a: [0.9, 0.9] });   // (the elbow, again: it closes a bent arm)
    }
    if (b.level < 2) {
      if (st === 'plate' || f.vambrace) {
        // the couter, cupped round the point of the elbow (behind: the forearm folds forward) with a fan to each side; the vambrace in
        // two halves; the gauntlet's flared cuff
        if (st === 'plate') {
          b.ell([0, 0.0, -0.024], [0.05, 0.05, 0.048], { ...plate, a: [1, 1] });
          for (const s of [-1, 1]) b.ell([s * 0.04, -0.005, -0.004], [0.012, 0.04, 0.036], { ...plate, a: [0.9, 1], seg: [8, 6] });
        }
        b.loft(grow(FOREARM.slice(1, 4), 0.012), { ...plate, a: [0.85, 1], seg: b.pick(16, 8, 6) });
        if (b.level < 1) {
          rim(b, -0.065, 0.057, 0.056, 0.004, 0.003, { c: K.steelLt, m: 'plate' });
          b.band([[0, -0.12, 0.05], [0.045, -0.12, 0.0], [0, -0.12, -0.048], [-0.045, -0.12, 0.0], [0, -0.12, 0.05]], 0.012, 0.003, { ...leatherDk, out: from([0, -0.12, 0.002]), segs: 12 });
        }
        b.lathe([[0.034, -0.2], [0.046, -0.258], [0.052, -0.266], [0.05, -0.272]], [0, 0, 0], { ...(f.gaunt ? plate : leather), sc: [1, 1, 1.05], seg: b.pick(20, 8, 6) });
      } else if (f.bracer) {
        // a laced leather bracer
        b.loft(grow(FOREARM.slice(1, 4), 0.008), { ...leather, a: [0.9, 1], seg: b.pick(16, 8, 6) });
        if (b.level < 1) for (let k = 0; k < 4; k++) b.band([[-0.012, -0.08 - k * 0.035, 0.05 - k * 0.003], [0.012, -0.095 - k * 0.035, 0.05 - k * 0.003]], 0.004, 0.002, { c: K.linen, m: 'cloth', out: () => [0, 0, 1], segs: 2 });
      } else if (f.cuff) b.lathe([[0.034, -0.17], [0.046, -0.2], [0.05, -0.235], [0.046, -0.245]], [0, 0, 0], { ...f.cuff, seg: b.pick(20, 8, 6) });
      else if (!f.sleeve) b.lathe([[0.032, -0.19], [0.042, -0.26], [0.045, -0.265]], [0, 0, 0], { ...leather, seg: b.pick(16, 8, 6) });   // a glove's cuff
    }
    fist(b, { ...f.hand }, !!f.gaunt);
  }, st === 'robe');   // (the sleeve's mouth is seen from inside)
}

// ---------------------------------------------------------------- pelvis (frame 2 cm above the hip joints) and chest (frame at the waist)
// The trunk's rings, waist to the base of the neck: wide and flat across the chest, the ribs and shoulder blades, the trapezius sloping
// gently from the neck to the shoulders. ringAt(y) gives the trunk's [half width, half depth, z offset] at a height, for what sits on it.
const TRUNK = [[-0.1, 0.15, 0.105, 0.0], [0.0, 0.148, 0.1, 0.0], [0.1, 0.152, 0.106, 0.004], [0.2, 0.164, 0.116, 0.01], [0.28, 0.172, 0.118, 0.01],
  [0.345, 0.176, 0.11, 0.0], [0.39, 0.164, 0.094, -0.008], [0.42, 0.13, 0.076, -0.013], [0.44, 0.085, 0.06, -0.014], [0.46, 0.056, 0.05, -0.014]];
const ringAt = (y) => {
  if (y <= TRUNK[0][0]) return TRUNK[0].slice(1);
  for (let i = 1; i < TRUNK.length; i++) {
    if (y <= TRUNK[i][0]) {
      const a = TRUNK[i - 1], c = TRUNK[i], k = (y - a[0]) / (c[0] - a[0]);
      return [a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k, a[3] + (c[3] - a[3]) * k];
    }
  }
  return TRUNK[TRUNK.length - 1].slice(1);
};
// rings of the trunk from y0 to y1, `d` outside it (for armour and cloth over it)
const over = (y0, y1, d, dz = d) => {
  const ys = [y0, ...TRUNK.map((r) => r[0]).filter((y) => y > y0 + 0.01 && y < y1 - 0.01), y1];
  return ys.map((y) => { const r = ringAt(y); return [y, r[0] + d, r[1] + dz, r[2]]; });
};
const SQ = 2.6;   // how square the trunk's sections are
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
// the point on the trunk at height y, angle t round it (0 the front, a quarter turn +x), d outside it
const onTrunk = (y, t, d = 0) => { const r = ringAt(y), e = 2 / SQ; return [(r[0] + d) * spow(Math.sin(t), e), y, r[2] + (r[1] + d) * spow(Math.cos(t), e)]; };
const trunkOut = (x, y, z) => { const r = ringAt(y); return [x / (r[0] * r[0]), 0, (z - r[2]) / (r[1] * r[1])]; };
// the same round the pelvis (the hips and the belt: an ellipse 0.17 by 0.122)
const onHips = (y, t, d = 0) => [(0.172 + d) * Math.sin(t), y, (0.124 + d * 0.72) * Math.cos(t)];

// The belt: a leather band with a buckle and the tongue's end hanging from it, the purse and the pouches it carries (extras).
function belt(b, extras, o = leather) {
  b.lathe([[0.164, 0.02], [0.173, 0.025], [0.173, 0.08], [0.164, 0.085]], [0, 0, 0], { sc: [1, 1, 0.72], ...o, seg: b.pick(36, 14, 9) });
  if (b.level < 2) {
    b.torus([0, 0.052, 0.128], 0.026, 0.0055, { ...brass, sc: [1.15, 1, 1], seg: b.pick(16, 8, 6), sides: b.pick(6, 4, 3) });
    if (b.level < 1) {
      b.rod([0, 0.074, 0.132], [0, 0.03, 0.132], 0.003, 0.003, { ...brass, seg: 5 });
      b.band([[0.02, 0.06, 0.128], [0.05, 0.035, 0.124], [0.058, -0.04, 0.118]], 0.034, 0.004, { ...o, out: () => [0, 0, 1], segs: 8 });   // the tongue's end
      rivets(b, [[0.09, 0.052, 0.104], [-0.09, 0.052, 0.104], [0.15, 0.052, 0.06], [-0.15, 0.052, 0.06]], 0.006, brass);
    }
  } else b.rbox([0, 0.052, 0.124], [0.052, 0.05, 0.014], { ...brass, sharp: true });
  if (extras && b.level < 2) {
    // a purse at the left hip and a pouch at the right, each with its flap and a toggle
    for (const [x, z, w, h, d] of [[0.168, 0.05, 0.075, 0.1, 0.055], [-0.152, 0.08, 0.062, 0.08, 0.05]]) {
      const ry = Math.atan2(x, z);
      b.rbox([x, -0.004, z], [w, h, d], { ...leatherLt, e: 0.45, rot: [0, ry, 0], d: 0.15 });
      b.rbox([x * 1.04, 0.03, z * 1.04], [w * 1.05, h * 0.42, d * 0.5], { ...leatherDk, e: 0.4, rot: [0.1, ry, 0] });
      if (b.level < 1) b.ell([x * 1.15, 0.005, z * 1.15], 0.008, { ...bone(), seg: [6, 4] });
    }
  }
}
function bone() { return { c: K.bone, m: 'bone' }; }
// cloth hanging from the belt, front and back, swaying; the sides stay open (o: the cloth; trimmed along the hem)
function tabardSkirt(b, hem, w, o = cloth, wide = 1.24) {
  const prof = [[0.252, hem], [0.2, 0.06]];
  const dirt = mud(hem - 0.02, hem + 0.25, 0.45);
  for (const arc of [[-wide / 2, wide], [PI - wide / 2, wide]]) {
    b.lathe(prof, [0, 0, 0], { arc, sc: [1, 1, 0.78], ...o, w: [SKIRT + w, SKIRT], a: [0.8, 1], seg: b.pick(12, 6, 4), d: dirt });
    if (b.level < 2) b.lathe([[0.256, hem], [0.25, hem + 0.04]], [0, 0, 0], { arc, sc: [1, 1, 0.78], ...trim, w: [SKIRT + w, SKIRT + w * 0.9], seg: b.pick(12, 6, 4), d: dirt });
  }
}
// the sword's scabbard, hung from the belt at the left hip by two straps: a leather sheath with an iron locket at its mouth and a chape
function scabbard(b) {
  b.rod([0.17, -0.03, 0.0], [0.21, -0.43, -0.09], 0.024, 0.02, { ...leather, a: [0.85, 1], seg: 8 });
  b.rod([0.168, -0.01, 0.004], [0.175, -0.07, -0.01], 0.028, 0.027, { ...iron, seg: 8 });
  b.rod([0.205, -0.4, -0.085], [0.212, -0.46, -0.1], 0.022, 0.026, { ...iron, seg: 6 });
  b.band([[0.15, 0.05, 0.06], [0.175, 0.0, 0.03], [0.178, -0.05, 0.0]], 0.012, 0.003, { ...leatherDk, out: () => [1, 0, 0.2], segs: 5 });
}
// the hips and seat: wide at the hip bones, the buttocks behind, closing between the legs
const hips = (b, o) => {
  b.loft([[0.14, 0.148, 0.1, 0.0], [0.05, 0.16, 0.108, 0.0], [-0.03, 0.17, 0.114, -0.004], [-0.09, 0.162, 0.108, -0.01], [-0.13, 0.13, 0.088, -0.01]], { a: [0.7, 1], sq: 2.4, seg: b.pick(22, 10, 7), ...o });
  b.ell([0, -0.13, -0.01], [0.13, 0.05, 0.088], { a: [0.6, 0.8], ...o });
  if (b.level < 2) for (const s of [-1, 1]) b.ell([s * 0.068, -0.07, -0.05], [0.08, 0.085, 0.07], { a: [0.7, 0.95], ...o });
};
// a mail skirt from the waist to y (a hauberk's hem, under everything else)
const mailSkirt = (b, y) => b.lathe([[0.255, y], [0.2, 0.05]], [0, 0, 0], { sc: [1, 1, 0.78], ...mailM, w: SKIRT, a: [0.62, 1], seg: b.pick(28, 12, 8), d: mud(y - 0.02, y + 0.2, 0.4) });

def('pelvis.mail', (b) => {
  hips(b, LEG.cloth);
  mailSkirt(b, -0.3);
  belt(b, true);
  tabardSkirt(b, -0.34, 0.9);
  if (b.level < 1) scabbard(b);
}, true);
def('pelvis.plate', (b) => {
  hips(b, LEG.cloth);
  if (b.level < 2) mailSkirt(b, -0.24);
  belt(b, true);
  // the fauld: hoops of plate round the belly and hips, each with a rolled edge; the tassets hanging over the thighs on straps
  const ys = b.level < 2 ? [0.0, -0.06, -0.12] : [-0.04];
  ys.forEach((y, i) => {
    b.lathe([[0.21 + i * 0.014, y - 0.075], [0.19 + i * 0.012, y + 0.04]], [0, 0, 0], { sc: [1, 1, 0.8], ...plate, w: SKIRT, a: [0.7, 1], seg: b.pick(28, 12, 8), arc: [-2.2, 4.4] });
    if (b.level < 1) rim(b, y - 0.074, 0.212 + i * 0.014, (0.212 + i * 0.014) * 0.8, 0, 0.003, { c: K.steelLt, m: 'plate', w: SKIRT }, [-2.2, 4.4]);
  });
  if (b.level < 2) {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const y = -0.2 - k * 0.075;
        b.rbox([sx * 0.088, y, 0.156 - k * 0.006], [0.15, 0.1, 0.034], { ...plate, w: SKIRT, e: 0.3, rot: [0.1, 0, sx * 0.08], a: [0.8, 1] });
        if (b.level < 1) b.rbox([sx * 0.088, y - 0.048, 0.166 - k * 0.006], [0.148, 0.01, 0.012], { c: K.steelLt, m: 'plate', w: SKIRT, e: 0.5, rot: [0.1, 0, sx * 0.08] });
      }
      rivets(b, [[sx * 0.04, -0.17, 0.176], [sx * 0.13, -0.165, 0.168]], 0.006);
      if (b.level < 1) b.band([[sx * 0.088, -0.12, 0.155], [sx * 0.088, -0.17, 0.17]], 0.02, 0.004, { ...leatherDk, out: () => [0, 0, 1], segs: 3 });
    }
  }
  tabardSkirt(b, -0.4, 0.9, cloth, 1.1);
  if (b.level < 1) scabbard(b);
}, true);
def('pelvis.gambeson', (b) => {
  hips(b, LEG.cloth);
  b.lathe([[0.24, -0.24], [0.2, 0.05]], [0, 0, 0], { sc: [1, 1, 0.78], c: K.gamb, m: 'cloth', p: PAT.quilt, w: SKIRT, a: [0.7, 1], seg: b.pick(28, 12, 8), d: mud(-0.26, -0.05, 0.4) });
  belt(b, true);
  if (b.level < 2) {
    // a knife at the right hip, the hilt forward
    b.rod([-0.14, 0.02, 0.105], [-0.165, -0.15, 0.11], 0.015, 0.012, { ...leatherDk, seg: 6 });
    b.rod([-0.135, 0.02, 0.106], [-0.13, 0.09, 0.104], 0.009, 0.009, { ...wood, seg: 6 });
    b.ell([-0.13, 0.095, 0.104], 0.012, { ...iron, seg: [6, 5] });
  }
  if (b.level < 1) scabbard(b);
}, true);
def('pelvis.leather', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  b.lathe([[0.235, -0.4], [0.2, 0.06]], [0, 0, 0], { arc: [-0.8, 1.6], sc: [1, 1, 0.78], c: K.leatherLt, m: 'leather', p: PAT.leather, w: SKIRT, a: [0.7, 1], seg: b.pick(14, 8, 5), d: mud(-0.42, -0.1, 0.5) });
  if (b.level < 2) {
    b.rod([0.17, 0.0, 0.05], [0.2, -0.34, 0.05], 0.022, 0.022, { ...wood });
    b.rbox([0.205, -0.38, 0.05], [0.12, 0.07, 0.07], { ...iron, e: 0.3 });
  }
}, true);
def('pelvis.fur', (b) => {
  // a berserker: a kilt of pelt under a fringe of studded leather strips, a broad belt with a big round buckle, the house's sash
  hips(b, { c: K.fur, m: 'fur', p: PAT.fur });
  for (const arc of [[-0.9, 1.8], [PI - 0.9, 1.8]]) b.lathe([[0.235, -0.3], [0.2, 0.06]], [0, 0, 0], { arc, sc: [1, 1, 0.8], c: K.fur, m: 'fur', p: PAT.fur, w: [SKIRT + 0.8, SKIRT], a: [0.6, 1], seg: b.pick(12, 6, 4), d: mud(-0.32, -0.1, 0.5) });
  b.lathe([[0.17, 0.0], [0.18, 0.01], [0.18, 0.095], [0.17, 0.105]], [0, 0, 0], { sc: [1, 1, 0.74], ...leatherDk, seg: b.pick(36, 14, 9) });
  if (b.level < 2) {
    const n = b.level < 1 ? 11 : 7;
    for (let i = 0; i < n; i++) {
      const t = -1.25 + (i / (n - 1)) * 2.5 + (i % 2) * 0.04;
      const p0 = onHips(0.01, t, 0.024), p1 = onHips(-0.27 - (i % 3) * 0.03, t, 0.085);
      b.band([p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], p1], 0.04, 0.005, { ...leather, w: [SKIRT + 0.5, SKIRT], out: () => [Math.sin(t), 0, Math.cos(t)], segs: 3, d: 0.25 });
      if (b.level < 1) for (const k of [0.45, 0.8]) b.ell([p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k], 0.0075, { ...iron, w: SKIRT, seg: [5, 4] });
    }
    b.ell([0, 0.052, 0.13], [0.044, 0.044, 0.016], { ...iron, a: [0.9, 1] });   // the buckle's round plate
    if (b.level < 1) b.torus([0, 0.052, 0.144], 0.03, 0.006, { ...brass, seg: 16, sides: 5 });
  }
}, true);
// The mage's robe below the waist: the skirt's upper part, front and back to mid-thigh (the thighs carry the rest, robeLeg), the house's
// sash knotted at the hip with its ends hanging, a rope girdle with a purse and a book on a chain
def('pelvis.robe', (b) => {
  const o = { c: K.robe, m: 'wool', p: PAT.weave };
  hips(b, o);
  for (const arc of [[-0.95, 1.9], [PI - 0.95, 1.9]]) b.lathe([[0.25, -0.3], [0.2, 0.06]], [0, 0, 0], { arc, sc: [1, 1, 0.8], ...o, w: [SKIRT + 0.6, SKIRT], a: [0.7, 1], seg: b.pick(14, 8, 4) });
  b.lathe([[0.168, 0.015], [0.178, 0.025], [0.178, 0.095], [0.168, 0.105]], [0, 0, 0], { sc: [1, 1, 0.74], ...cloth, seg: b.pick(36, 14, 9) });
  if (b.level < 2) {
    b.ell([-0.12, 0.06, 0.1], [0.035, 0.03, 0.025], { ...cloth });   // the knot
    for (const [dx, len] of [[-0.11, 0.36], [-0.14, 0.3]]) b.band([[dx, 0.05, 0.11], [dx - 0.01, -0.1, 0.13], [dx - 0.015, 0.05 - len, 0.13]], 0.05, 0.005, { ...cloth, w: [0.6, 0], out: () => [-0.3, 0, 1], segs: b.pick(8, 4, 2) });
    b.torus([0, 0.0, 0], 0.18, 0.007, { rot: [PI / 2 + 0.06, 0, 0], sc: [1, 0.76, 1], c: K.rope, m: 'cloth', seg: b.pick(28, 12, 8), sides: 4 });   // the girdle
    b.rbox([0.17, -0.06, 0.04], [0.04, 0.11, 0.08], { ...leatherDk, e: 0.25, rot: [0, 0.3, 0.05] });   // the book
    if (b.level < 1) {
      b.rbox([0.174, -0.06, 0.04], [0.032, 0.1, 0.072], { c: 0xd8cca8, m: 'cloth', e: 0.2, rot: [0, 0.3, 0.05] });
      b.ell([0.15, -0.08, 0.1], [0.03, 0.04, 0.025], { ...leatherLt });
    }
  }
}, true);
// the Cleric below the waist: a long undertunic in cream to the knee, the mail's hem over it, the house tabard, a rope cincture with its
// tasselled end
def('pelvis.cleric', (b) => {
  hips(b, LEG.cloth);
  for (const arc of [[-1.2, 2.4], [PI - 1.2, 2.4]]) b.lathe([[0.262, -0.46], [0.2, 0.0]], [0, 0, 0], { arc, sc: [1, 1, 0.8], c: K.cream, m: 'cloth', p: PAT.weave, w: [SKIRT + 0.8, SKIRT], a: [0.7, 1], seg: b.pick(14, 8, 4), d: mud(-0.48, -0.2, 0.55) });
  mailSkirt(b, -0.28);
  belt(b, true);
  tabardSkirt(b, -0.36, 0.9);
  if (b.level < 2) {
    b.torus([0, -0.005, 0], 0.192, 0.008, { rot: [PI / 2 + 0.08, 0, 0], sc: [1, 0.78, 1], c: K.rope, m: 'cloth', seg: b.pick(28, 12, 8), sides: 4 });
    b.sweep([[0.1, -0.02, 0.15], [0.115, -0.15, 0.16], [0.11, -0.3, 0.15]], 0.008, 0.008, { c: K.rope, m: 'cloth', w: [0.0, 0.7], seg: 4, segs: b.pick(8, 4, 3) });
    b.ell([0.11, -0.32, 0.15], [0.014, 0.03, 0.014], { c: K.rope, m: 'cloth', w: 0.7, seg: [6, 5] });
  }
}, true);

// the surcoat over a torso: front and back panels (the front with the house's arms), its neck and armholes trimmed
function tabardTop(b, top, bottom, d = 0.012, o = cloth, wide = 0.7) {
  const rings = over(bottom, top, d, d + 0.004);
  const q = { sq: SQ, seg: b.pick(16, 8, 5) };
  b.loft(rings, { ...q, arc: [-wide, wide * 2], ...o, p: PAT.emblem, uv: [0, 0.2, 0.3, 0.3], a: [0.85, 1] });
  b.loft(rings, { ...q, arc: [PI - wide, wide * 2], ...o, p: PAT.emblem, uv: (x, y) => [-x / 0.3 + 0.5, (y - 0.2) / 0.3 + 0.5], a: [0.85, 1] });   // (the arms on the back too, read from behind)
  if (b.level < 2) {
    b.loft(over(top - 0.03, top, d + 0.002, d + 0.006), { ...q, arc: [-wide - 0.02, wide * 2 + 0.04], ...trim });
    b.loft(over(top - 0.03, top, d + 0.002, d + 0.006), { ...q, arc: [PI - wide - 0.02, wide * 2 + 0.04], ...trim });
  }
  if (b.level < 1) for (const s of [-1, 1]) for (const back of [0, PI]) {
    // the trimmed side edges of each panel
    const t = back + s * wide;
    b.band([onTrunk(bottom + 0.01, t, d + 0.004), onTrunk((bottom + top) / 2, t, d + 0.004), onTrunk(top - 0.02, t, d + 0.004)], 0.012, 0.003, { ...trim, out: trunkOut, segs: 6 });
  }
}
const trunk = (b, o) => b.loft(TRUNK, { sq: SQ, seg: b.pick(28, 12, 9), ...o });
// a high collar round the base of the neck (a scarf, the top of a gambeson, a gorget)
const neckband = (b, o, k = 1) => b.lathe([[0.1 * k, 0.4], [0.105 * k, 0.43], [0.072 * k, 0.48]], [0, 0, -0.012], { sc: [1, 1, 0.85], ...o });
// the strap over each shoulder that holds a breastplate to its back
function shoulderStraps(b, d = 0.03) {
  if (b.level >= 1) return;
  for (const s of [-1, 1]) {
    b.band([onTrunk(0.33, s * 0.62, d), [s * 0.115, 0.43, 0.035], [s * 0.12, 0.445, -0.02], onTrunk(0.33, s * (PI - 0.62), d)], 0.026, 0.004, { ...leatherDk, out: from([s * 0.08, 0.3, -0.01]), segs: 10 });
    buckle(b, onTrunk(0.34, s * 0.62, d + 0.004), trunkOut(...onTrunk(0.34, s * 0.62, d)).map((v) => v * 0.05), 0.9);
  }
}
// the gorget: two lames of plate round the base of the neck, rolled at the top
function gorget(b, o = plate) {
  b.lathe([[0.126, 0.36], [0.128, 0.4], [0.098, 0.445]], [0, 0, -0.012], { sc: [1, 1, 0.86], ...o, a: [0.85, 1] });
  if (b.level < 2) {
    b.lathe([[0.1, 0.43], [0.098, 0.46], [0.078, 0.49]], [0, 0, -0.012], { sc: [1, 1, 0.86], ...o, a: [0.9, 1] });
    if (b.level < 1) rim(b, 0.49, 0.078, 0.067, -0.012, 0.004, { c: K.steelLt, m: 'plate' });
  }
}

def('chest.mail', (b) => {
  trunk(b, { ...mailM, a: [0.75, 1] });
  tabardTop(b, 0.36, -0.03);
  if (b.level < 2) {
    neckband(b, mailM);
    b.lathe([[0.116, 0.37], [0.12, 0.4], [0.104, 0.425]], [0, 0, -0.01], { sc: [1, 1, 0.86], ...{ c: K.gamb, m: 'cloth', p: PAT.quilt } });   // the padded collar under it
  }
}, true);
def('chest.plate', (b) => {
  trunk(b, { c: K.ironDk, m: 'iron', a: [0.7, 1], seg: b.pick(16, 10, 9), smooth: false });   // (the arming coat: mostly under plate)
  // breastplate and backplate, the breast with a keel down the middle and rolled edges at the neck and armholes; the surcoat over them
  b.loft(over(-0.05, 0.37, 0.022, 0.026), { sq: SQ, arc: [-1.2, 2.4], ...plate, a: [0.85, 1], seg: b.pick(20, 10, 6) });
  b.loft(over(-0.05, 0.4, 0.02), { sq: SQ, arc: [PI - 1.05, 2.1], ...plate, a: [0.85, 1], seg: b.pick(16, 8, 5) });
  if (b.level < 2) {
    b.rbox([0, 0.3, 0.145], [0.026, 0.12, 0.024], { ...plate, e: 0.4, rot: [-0.1, 0, 0] });
    if (b.level < 1) for (const s of [-1, 1]) b.band([onTrunk(0.37, s * 0.2, 0.028), onTrunk(0.33, s * 0.75, 0.028), onTrunk(0.25, s * 1.15, 0.026)], 0.008, 0.005, { c: K.steelLt, m: 'plate', out: trunkOut, segs: 8 });
    gorget(b);
  }
  tabardTop(b, 0.31, -0.03, 0.034, cloth, 0.75);
  shoulderStraps(b, 0.03);
  rivets(b, [onTrunk(0.15, 1.15, 0.03), onTrunk(0.15, -1.15, 0.03), onTrunk(0.05, 1.15, 0.03), onTrunk(0.05, -1.15, 0.03)], 0.007);
}, true);
// The Cavalier's brigandine: a coat of the house's cloth riveted over steel plates (rows of brass heads), closed at the front with straps
// and buckles, over mail; the house's arms on the breast; a gorget at the throat
def('chest.brigandine', (b) => {
  trunk(b, { ...mailM, a: [0.75, 1], seg: b.pick(16, 10, 9), smooth: false });
  const rings = over(-0.06, 0.37, 0.026, 0.03);
  b.loft(rings, { sq: SQ, ...cloth, p: PAT.emblem, uv: [0, 0.18, 0.26, 0.26], a: [0.8, 1], seg: b.pick(28, 12, 7) });
  if (b.level < 2) {
    b.loft(over(0.34, 0.39, 0.03, 0.034), { sq: SQ, ...trim, seg: b.pick(28, 12, 7) });
    b.loft(over(-0.07, -0.03, 0.03, 0.034), { sq: SQ, ...trim, seg: b.pick(28, 12, 7) });
    gorget(b);
  }
  if (b.level < 1) {
    // the rivet heads in rows round the coat (not over the arms on the breast), and the front's straps
    const pts = [];
    for (let r = 0; r < 5; r++) {
      const y = -0.02 + r * 0.075;
      for (let k = 0; k < 14; k++) {
        const t = -PI + (k + 0.5) * (TAU / 14);
        if (Math.abs(t) < 0.55 && y > 0.06) continue;
        pts.push(onTrunk(y, t, 0.033));
      }
    }
    rivets(b, pts, 0.0055, brass);
    for (const y of [0.04, 0.16]) {
      b.band([onTrunk(y, -0.42, 0.033), onTrunk(y, 0, 0.036), onTrunk(y, 0.42, 0.033)], 0.018, 0.004, { ...leatherDk, out: trunkOut, segs: 6 });
      buckle(b, onTrunk(y, 0.42, 0.04), [0.4, 0, 1], 0.9);
    }
  }
  shoulderStraps(b, 0.034);
}, true);
def('chest.gambeson', (b) => {
  trunk(b, { c: K.gamb, m: 'cloth', p: PAT.quilt, a: [0.78, 1] });
  if (b.level < 2) {
    neckband(b, clothDk, 1.08);            // a scarf
    b.band([[0.15, 0.4, -0.02], [0.13, 0.36, 0.085], [0.05, 0.25, 0.13], [-0.04, 0.12, 0.128], [-0.14, 0.0, 0.106]], 0.034, 0.005, { ...leather, out: trunkOut, segs: b.pick(14, 6, 3) });
    b.rbox([0.165, -0.0, 0.04], [0.06, 0.08, 0.05], { ...leather, e: 0.35 });
  }
}, true);
// The Ranger: a laced leather jerkin over the quilted coat, a short mantle of the house's colour over the shoulders (its hood is the
// head's), the quiver's baldric across the chest
def('chest.ranger', (b) => {
  trunk(b, { c: K.gamb, m: 'cloth', p: PAT.quilt, a: [0.78, 1] });
  // the jerkin, open a little at the front over its lacing
  b.loft(over(-0.08, 0.34, 0.014, 0.018), { sq: SQ, arc: [0.1, TAU - 0.2], ...leather, a: [0.8, 1], seg: b.pick(28, 12, 7) });
  if (b.level < 2) {
    b.loft(over(-0.09, -0.05, 0.018, 0.022), { sq: SQ, arc: [0.1, TAU - 0.2], ...leatherDk, seg: b.pick(28, 12, 7) });
    if (b.level < 1) for (let k = 0; k < 6; k++) {
      const y = -0.02 + k * 0.055;
      b.band([onTrunk(y, -0.11, 0.02), onTrunk(y + 0.03, 0.11, 0.02)], 0.0045, 0.002, { c: K.linen, m: 'cloth', out: trunkOut, segs: 2 });
      b.band([onTrunk(y, 0.11, 0.02), onTrunk(y + 0.03, -0.11, 0.02)], 0.0045, 0.002, { c: K.linen, m: 'cloth', out: trunkOut, segs: 2 });
    }
  }
  // the mantle: from the neck over the shoulders, down to the chest, its edge cut in points
  const mo = { ...clothDk };
  b.lathe([[0.3, 0.2], [0.296, 0.28], [0.284, 0.35], [0.252, 0.41], [0.165, 0.455], [0.08, 0.482]], [0, 0, -0.012], { sc: [1, 1, 0.56], ...mo, a: [0.65, 1], w: [0.25, 0], seg: b.pick(32, 14, 8) });
  if (b.level < 2) {
    rim(b, 0.205, 0.3, 0.168, -0.012, 0.006, { ...leatherDk });   // a leather hem
    b.band([[-0.15, 0.19, 0.135], [-0.06, 0.12, 0.14], [0.04, 0.05, 0.133], [0.14, -0.01, 0.105]], 0.036, 0.005, { ...leatherDk, out: trunkOut, segs: b.pick(10, 5, 3) });   // the baldric, from under the mantle
    buckle(b, [-0.03, 0.1, 0.146], [0, 0, 1], 1.1);
  }
}, true);
def('chest.leather', (b) => {
  trunk(b, { c: K.leather, m: 'leather', p: PAT.leather, a: [0.78, 1] });
  if (b.level < 2) {
    b.band([[0.15, 0.4, -0.02], [0.13, 0.36, 0.085], [0.05, 0.25, 0.13], [-0.04, 0.12, 0.128], [-0.14, 0.0, 0.106]], 0.03, 0.005, { ...leatherDk, out: trunkOut, segs: b.pick(14, 6, 3) });
    neckband(b, clothDk, 1.08);
  }
  b.loft(over(-0.04, 0.3, 0.008), { sq: SQ, arc: [-0.72, 1.44], c: K.linen, m: 'cloth', p: PAT.weave, a: [0.8, 1], seg: b.pick(12, 6, 4) });   // an apron bib
}, true);
// The Mage's robe: deep blue wool to the throat, a high collar, the front's opening edged in gold, the house's stole hanging from the neck
// down the front, an amulet
def('chest.robe', (b) => {
  const o = { c: K.robe, m: 'wool', p: PAT.weave };
  trunk(b, { ...o, a: [0.75, 1] });
  b.lathe([[0.118, 0.37], [0.114, 0.42], [0.096, 0.47], [0.1, 0.49]], [0, 0, -0.016], { arc: [PI - 1.9, 3.8], sc: [1, 1, 0.88], ...o, a: [0.8, 1] });   // the collar, standing behind the neck
  if (b.level < 2) {
    b.band([onTrunk(-0.1, 0, 0.004), onTrunk(0.15, 0, 0.004), onTrunk(0.37, 0, 0.004)], 0.03, 0.003, { ...gold, out: trunkOut, segs: b.pick(10, 4, 2) });
    rim(b, 0.49, 0.1, 0.088, -0.016, 0.005, gold, [PI - 1.9, 3.8]);
    for (const s of [-1, 1]) {
      // the stole: over the shoulder from behind the neck, down the front to the waist, its end weighted with a fringe of gold
      b.band([onTrunk(0.4, s * 2.3, 0.01), [s * 0.1, 0.45, -0.01], [s * 0.09, 0.42, 0.06], onTrunk(0.3, s * 0.32, 0.012), onTrunk(0.05, s * 0.3, 0.014), onTrunk(-0.12, s * 0.3, 0.016)], 0.055, 0.004, { ...cloth, out: from([s * 0.02, 0.2, -0.02]), segs: b.pick(14, 6, 3) });
      if (b.level < 1) b.band([onTrunk(-0.1, s * 0.22, 0.02), onTrunk(-0.1, s * 0.38, 0.02)], 0.016, 0.004, { ...gold, out: trunkOut, segs: 3 });
    }
    b.ell([0, 0.25, 0.135], [0.022, 0.026, 0.01], { ...gold });   // the amulet
    if (b.level < 1) b.ell([0, 0.25, 0.144], [0.011, 0.013, 0.006], { c: 0xff9a3a, m: 'gem', p: PAT.glow });
  }
}, true);
// The Berserker: bare to the waist, a heavy chest, a mantle of pelt over the shoulders, leather straps crossed over the chest with a round
// iron boss where they meet, the house's colour in a sash
def('chest.fur', (b) => {
  trunk(b, { ...skin, a: [0.72, 1] });
  for (const sx of [-1, 1]) b.ell([sx * 0.08, 0.27, 0.075], [0.085, 0.07, 0.055], { ...skin, a: [0.8, 1], rot: [0, 0, sx * 0.15] });   // the pectorals
  if (b.level < 2) {
    b.ell([0, 0.11, 0.075], [0.085, 0.11, 0.04], { ...skin, a: [0.85, 1] });   // the belly
    if (b.level < 1) for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) b.ell([sx * 0.03, 0.045 + r * 0.05, 0.1], [0.032, 0.028, 0.012], { ...skin, a: [0.92, 1], seg: [10, 7] });   // the muscles of the belly
    for (const sx of [-1, 1]) b.ell([sx * 0.15, 0.2, -0.01], [0.04, 0.12, 0.09], { ...skin, a: [0.8, 1], rot: [0, 0, sx * -0.12] });   // the lats
    for (const sx of [-1, 1]) b.ell([sx * 0.11, 0.33, -0.06], [0.08, 0.08, 0.06], { ...skin, a: [0.8, 1] });   // the shoulder blades
    for (const sx of [-1, 1]) b.band([onTrunk(0.4, sx * 2.6, 0.012), [sx * 0.13, 0.44, 0.02], onTrunk(0.3, sx * 0.55, 0.014), onTrunk(0.17, 0, 0.026), onTrunk(0.0, -sx * 0.75, 0.01)], 0.032, 0.005, { ...leatherDk, out: from([0, 0.2, -0.01]), segs: b.pick(14, 6, 3) });
    b.ell([0, 0.17, 0.142], [0.034, 0.034, 0.014], { ...iron, a: [0.9, 1] });
    if (b.level < 1) rivets(b, [[0, 0.17, 0.156]], 0.009, brass);
  }
  // the pelt: a thick ruff from the neck over the shoulders and down the back, its edge in ragged locks that hang
  const fo = { c: K.furLt, m: 'fur', p: PAT.fur };
  b.loft([[0.27, 0.2, 0.135, -0.004], [0.33, 0.228, 0.15, -0.006], [0.39, 0.214, 0.134, -0.01], [0.44, 0.15, 0.1, -0.013], [0.48, 0.075, 0.068, -0.014]], { ...fo, a: [0.65, 1], seg: b.pick(28, 10, 7) });
  if (b.level < 2) {
    const n = b.level < 1 ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU + 0.13 * Math.sin(i * 2.7);
      const len = 0.05 + 0.04 * ((i * 7) % 5) / 4 + (Math.cos(t) < -0.3 ? 0.06 : 0);   // (longer down the back)
      const r0 = 0.21, p0 = [Math.sin(t) * r0, 0.3, Math.cos(t) * r0 * 0.68 - 0.006], p1 = [Math.sin(t) * (r0 + 0.025), 0.3 - len, Math.cos(t) * (r0 + 0.025) * 0.68 - 0.006];
      b.cone(p0, p1, 0.055, { ...fo, seg: 6, a: [0.8, 1], w: [0.2, 0] });
    }
  }
  // the house's sash, slung from the right shoulder to the left hip, knotted there
  b.band([[-0.18, 0.43, -0.02], [-0.14, 0.38, 0.1], [-0.03, 0.24, 0.142], [0.09, 0.08, 0.128], [0.16, -0.05, 0.1]], 0.075, 0.006, { ...cloth, out: from([0, 0.2, -0.02]), segs: b.pick(14, 6, 3) });
  if (b.level < 2) b.band([[0.15, -0.04, 0.11], [0.17, -0.12, 0.12], [0.16, -0.24, 0.11]], 0.06, 0.005, { ...cloth, w: [0.6, 0], out: () => [0.4, 0, 1], segs: b.pick(6, 3, 2) });
}, true);
// The Cleric: mail, the house's tabard with its arms, and over it a cream stole edged in gold that hangs to the belt, a holy sun on a chain
def('chest.cleric', (b) => {
  trunk(b, { ...mailM, a: [0.75, 1] });
  tabardTop(b, 0.36, -0.03, 0.012, cloth, 0.62);
  if (b.level < 2) {
    neckband(b, mailM);
    for (const s of [-1, 1]) {
      b.band([onTrunk(0.4, s * 2.4, 0.02), [s * 0.11, 0.45, -0.01], [s * 0.1, 0.42, 0.06], onTrunk(0.3, s * 0.36, 0.022), onTrunk(0.05, s * 0.34, 0.024), onTrunk(-0.08, s * 0.34, 0.026)], 0.05, 0.004, { c: K.cream, m: 'cloth', p: PAT.weave, out: from([s * 0.02, 0.2, -0.02]), segs: b.pick(14, 6, 3) });
      if (b.level < 1) for (const y of [0.25, 0.0]) b.rbox(onTrunk(y, s * 0.35, 0.03), [0.03, 0.012, 0.004], { ...gold, rot: [0, s * 0.35, 0] });
    }
    b.ell([0, 0.25, 0.155], [0.028, 0.028, 0.008], { ...gold, a: [0.9, 1] });   // the sun
    if (b.level < 1) for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.cone([Math.cos(a) * 0.026, 0.25 + Math.sin(a) * 0.026, 0.155], [Math.cos(a) * 0.045, 0.25 + Math.sin(a) * 0.045, 0.153], 0.007, { ...gold, seg: 4 }); }
  }
}, true);

// ---------------------------------------------------------------- heads (frame at the base of the neck)
// The neck rises a little forward to the skull; the head itself is one smooth surface (heads.js: the skull, the brow, the cheekbones, a
// nose, lips and a jaw blended together) with the face atlas laid on the front: the eyes at y 0.18, the chin at 0.065, the crown at 0.3.
// Hair and beards are grown from the same surface. Helmets are built round that skull (HELM: the shell of a helmet, padding included).
const HC = [0, 0.205, -0.006], HELM = [0.088, 0.106, 0.108];
// the faces of the classes (heads.js faceField): the plain soldier's, a heavy-browed warrior's, an old man's
const FACE = { man: {}, brute: { brow: 1.35, jaw: 1.12, nose: 1.15, cheek: 1.1 }, sage: { age: 1, nose: 1.1, brow: 1.05 }, lean: { jaw: 0.94, cheek: 1.1 } };
function headBase(b, face = FACE.man, neck = true, shade = null) {
  if (b.level >= 3) { b.ell([0, 0.19, 0.0], [0.08, 0.115, 0.1], { ...skin, seg: [5, 3] }); return; }
  if (neck) b.loft([[-0.04, 0.058, 0.056, -0.004], [0.04, 0.054, 0.053, 0.004], [0.11, 0.052, 0.054, 0.0]], { ...skin, a: [0.55, 0.8], seg: b.pick(16, 7, 5) });
  sculptHead(b, face, shade);
  if (b.level < 2) for (const s of [-1, 1]) {   // the ears
    b.ell([s * 0.077, 0.172, -0.008], [0.012, 0.03, 0.02], { s: 'skinDark', m: 'skin', seg: [b.pick(8, 5, 4), b.pick(6, 3, 3)] });
    if (b.level < 1) b.ell([s * 0.084, 0.174, -0.006], [0.006, 0.022, 0.014], { s: 'skin', m: 'skin', seg: [6, 4] });
  }
}
const hairM = { s: 'hair', m: 'hair', p: PAT.hair };
// The faces, hair cuts and beards the catalogue wears, as separate small jobs (each a few tens of ms at the richest level), so the warm-up can
// make them one per frame before the heads that need them (heads.js keeps each surface once made).
export function headJobs(level) {
  const jobs = [];
  const job = (fn) => jobs.push(() => fn(new Builder(level)));
  for (const f of [FACE.man, FACE.brute, FACE.sage, FACE.lean]) job((b) => sculptHead(b, f));
  for (const cut of [0, 1, 2]) job((b) => sculptHair(b, FACE.man, cut));
  for (const cut of [0, 1, 2]) job((b) => sculptHair(b, FACE.brute, cut));
  job((b) => sculptHair(b, FACE.brute, 1, { wild: 1 }));
  job((b) => sculptBeard(b, FACE.man, 1, 1));
  job((b) => sculptBeard(b, FACE.brute, 1.15, 1));
  job((b) => sculptBeard(b, FACE.brute, 1.25, 3));
  job((b) => sculptBeard(b, FACE.sage, 1.15, 2));
  job((b) => sculptBeard(b, FACE.lean, 0.8, 0));
  return level >= 2 ? [] : jobs;   // (the plain levels have no hair or beard and a cheap head)
}
// the three cuts a soldier may wear (gates 7 8 9): cropped, long behind, thinning on the crown
function hairSet(b, face = FACE.man) {
  if (b.level >= 2) return;
  sculptHair(b, face, 0, { opt: { g: 7 } });
  sculptHair(b, face, 1, { opt: { g: 8 } });
  sculptHair(b, face, 2, { opt: { g: 9 } });
}
function beard(b, face = FACE.man, big = 1, shape = 1) {
  if (b.level >= 2) return;
  sculptBeard(b, face, big, shape, { opt: { g: 6 } });
}
function coif(b) {
  if (b.level >= 3) return;
  b.shell([0, 0.2, -0.008], [0.09, 0.112, 0.108], PI * 0.5 + 0.95, TAU - 1.9, 0, PI * 0.86, { ...mailM, a: [0.7, 1], seg: [b.pick(18, 9, 7), b.pick(12, 6, 4)] });
  b.lathe([[0.185, -0.1], [0.14, -0.03], [0.072, 0.07]], [0, 0, -0.008], { sc: [1, 1, 0.74], ...mailM, a: [0.7, 1] });
  if (b.level < 1) b.torus([0, 0.2, 0.025], 0.084, 0.004, { ...leatherDk, rot: [0.25, 0, 0], sc: [1, 1.15, 1], seg: 24, sides: 4 });   // the band at its face opening
}
function wings(b, y) {
  if (b.level > 0) return;
  for (const s of [-1, 1]) b.cone([s * 0.09, y, 0], [s * 0.2, y + 0.18, 0], 0.026, { ...gold, g: 4, seg: 5 });
}
const helm = (r = 1) => [HELM[0] * r, HELM[1] * r, HELM[2] * r];
// a band of rivets round a helmet at height y (radii rx, rz, centre z0)
const helmRivets = (b, y, rx, rz, z0, n = 10) => {
  if (b.level >= 1) return;
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([Math.sin(a) * rx, y, z0 + Math.cos(a) * rz]); }
  rivets(b, pts, 0.0045, iron);
};

def('head.kettle', (b) => {
  headBase(b); hairSet(b); beard(b); coif(b);
  b.shell(HC, helm(1.02), 0, TAU, 0, PI * 0.53, { ...steel, a: [0.8, 1] });
  b.lathe([[0.088, 0.196], [0.19, 0.18], [0.193, 0.188], [0.088, 0.208]], [0, 0, -0.006], { sc: [1, 1, 1.12], ...steel, a: [0.8, 1], seg: b.pick(32, 16, 10) });
  if (b.level < 2) {
    rim(b, 0.182, 0.193, 0.216, -0.006, 0.0045, { c: K.steelLt, m: 'steel' });
    b.lathe([[0.09, 0.205], [0.093, 0.21], [0.093, 0.232], [0.09, 0.237]], [0, 0, -0.006], { sc: [1, 1, 1.1], ...iron });
    helmRivets(b, 0.222, 0.094, 0.103, -0.006, 12);
    if (b.level < 1) b.band([[0.075, 0.2, -0.01], [0.06, 0.1, 0.03], [0, 0.06, 0.07], [-0.06, 0.1, 0.03], [-0.075, 0.2, -0.01]], 0.01, 0.003, { ...leatherDk, out: from([0, 0.16, 0.0]), segs: 10 });   // the chin strap
  }
  wings(b, 0.28);
}, true);
def('head.nasal', (b) => {
  headBase(b); beard(b); coif(b);
  b.lathe([[0.092, 0.192], [0.093, 0.25], [0.07, 0.296], [0.02, 0.33], [0.0, 0.334]], [0, 0, -0.006], { sc: [1, 1, 1.17], ...steel, a: [0.8, 1], seg: b.pick(28, 12, 8) });
  b.lathe([[0.091, 0.19], [0.097, 0.19], [0.097, 0.225], [0.091, 0.225]], [0, 0, -0.006], { sc: [1, 1, 1.17], ...iron, seg: b.pick(28, 12, 8) });
  b.rbox([0, 0.16, 0.108], [0.02, 0.085, 0.01], { ...steel, e: 0.3, rot: [-0.12, 0, 0] });
  if (b.level < 2) {
    for (const t of [0, PI / 2, PI, -PI / 2]) b.band([[Math.sin(t) * 0.094, 0.225, Math.cos(t) * 0.11 - 0.006], [Math.sin(t) * 0.08, 0.28, Math.cos(t) * 0.094 - 0.006], [0, 0.333, -0.006]], 0.014, 0.003, { ...iron, out: from([0, 0.2, -0.006]), segs: b.pick(8, 4, 2) });   // the frame's bands
    helmRivets(b, 0.207, 0.098, 0.115, -0.006, 12);
  }
  wings(b, 0.27);
}, true);
// The great helm: a flat-topped drum of plate over the whole head, the sight a slot under a brow plate, breaths pierced in the cheeks,
// a cross of brass to stiffen the face, rivets round the crown
def('head.great', (b) => {
  if (b.level < 3) b.loft([[-0.04, 0.06, 0.058, -0.004], [0.06, 0.056, 0.056, 0.0]], { ...skin, seg: b.pick(14, 7, 5) });
  b.lathe([[0.09, 0.03], [0.1, 0.08], [0.103, 0.2], [0.098, 0.265], [0.077, 0.31], [0.032, 0.328], [0.0, 0.33]], [0, 0, 0.0], { sc: [1, 1, 1.16], ...plate, a: [0.75, 1], seg: b.pick(32, 14, 9) });
  b.rbox([0, 0.19, 0.116], [0.15, 0.018, 0.02], { c: K.dark, m: 'iron', e: 0.2 });
  if (b.level < 2) {
    b.lathe([[0.104, 0.205], [0.108, 0.212], [0.108, 0.235], [0.103, 0.242]], [0, 0, 0], { arc: [-1.25, 2.5], sc: [1, 1, 1.16], ...plate, seg: b.pick(20, 10, 6) });   // the brow plate
    rim(b, 0.032, 0.092, 0.107, 0, 0.005, { c: K.steelLt, m: 'plate' });
    helmRivets(b, 0.262, 0.1, 0.116, 0, 14);
  }
  b.rbox([0, 0.135, 0.121], [0.02, 0.16, 0.012], { ...brass, e: 0.4 });
  if (b.level < 2) b.rbox([0, 0.155, 0.12], [0.11, 0.016, 0.012], { ...brass, e: 0.4, rot: [0, 0, 0] });
  if (b.level < 1) for (const s of [-1, 1]) for (let i = 0; i < 6; i++) b.rbox([s * (0.04 + (i % 3) * 0.013), 0.09 + Math.floor(i / 3) * 0.022, 0.11 - (i % 3) * 0.006], [0.008, 0.008, 0.012], { c: K.dark, m: 'iron', sharp: true, rot: [0, s * 0.3, 0] });
  wings(b, 0.27);
}, true);
// The Cavalier's sallet: a rounded bowl drawn out into a tail over the nape, its visor raised onto the brow so the eyes show, a bevor guarding
// the mouth, chin and throat, and a crest of the house's colour that streams back
def('head.sallet', (b) => {
  headBase(b, FACE.lean);
  b.loft([[0.215, 0.099, 0.121, -0.01], [0.25, 0.095, 0.115, -0.008], [0.28, 0.082, 0.099, -0.008], [0.305, 0.062, 0.076, -0.009], [0.326, 0.03, 0.04, -0.01], [0.333, 0.006, 0.008, -0.01]], { ...plate, a: [0.8, 1], seg: b.pick(32, 14, 9) });
  b.loft([[0.12, 0.096, 0.112, -0.03], [0.17, 0.1, 0.122, -0.016], [0.215, 0.099, 0.121, -0.01]], { ...plate, arc: [1.0, TAU - 2.0], a: [0.75, 0.95], seg: b.pick(22, 10, 7) });   // the sides and back of the bowl, open round the face
  b.shell([0, 0.155, -0.04], [0.1, 0.05, 0.13], PI * 0.5 + 0.9, TAU - 1.8, PI * 0.5, PI * 0.3, { ...plate, a: [0.75, 0.9] });   // the tail
  b.shell([0, 0.205, 0.012], [0.108, 0.06, 0.12], PI * 0.5 - 1.1, 2.2, PI * 0.2, PI * 0.28, { ...plate, a: [0.85, 1] });   // the visor, raised
  b.lathe([[0.072, 0.0], [0.086, 0.06], [0.096, 0.12], [0.094, 0.142]], [0, 0, 0.014], { arc: [-1.35, 2.7], sc: [1, 1, 1.12], ...plate, a: [0.8, 1], seg: b.pick(22, 10, 6) });   // the bevor
  if (b.level < 2) {
    b.rbox([0, 0.258, 0.088], [0.014, 0.1, 0.012], { ...plate, rot: [1.0, 0, 0], e: 0.4 });
    rim(b, 0.142, 0.094, 0.105, 0.014, 0.004, { c: K.steelLt, m: 'plate' }, [-1.35, 2.7]);
    for (const s of [-1, 1]) rivets(b, [[s * 0.104, 0.205, 0.0]], 0.008, brass);   // the visor's pivots
    helmRivets(b, 0.2, 0.099, 0.123, -0.012, 12);
    // the crest: a fan of the house's cloth that rises from the crown and streams back over the tail
    b.sweep([[0, 0.32, 0.03], [0, 0.37, -0.02], [0, 0.36, -0.12], [0, 0.29, -0.22]], 0.04, 0.012, { ...cloth, w: [0.2, 0.95], seg: b.pick(8, 5, 4), segs: b.pick(12, 6, 4), sc: 1 });
    b.ell([0, 0.33, 0.0], [0.016, 0.02, 0.03], { ...brass });
  }
}, true);
def('head.crown', (b) => {
  headBase(b); hairSet(b); beard(b); coif(b);
  b.shell(HC, helm(1), 0, TAU, 0, PI * 0.5, { ...steel, a: [0.8, 1] });
  b.lathe([[0.091, 0.215], [0.098, 0.215], [0.098, 0.252], [0.091, 0.252]], [0, 0, -0.006], { sc: [1, 1, 1.15], ...gold, seg: b.pick(28, 14, 9) });
  const n = b.pick(7, 6, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    b.cone([Math.sin(a) * 0.095, 0.248, Math.cos(a) * 0.109 - 0.006], [Math.sin(a) * 0.1, 0.32, Math.cos(a) * 0.115 - 0.006], 0.022, { ...gold, seg: 5 });
  }
  if (b.level < 2) b.ell([0, 0.234, 0.108], [0.014, 0.017, 0.009], { c: K.red, m: 'gem', seg: [6, 5] });
}, true);
// The Berserker: a heavy brow and jaw, an iron cap with a fur brim and a nasal, two great horns, a wild mane and a beard plaited in two
def('head.horned', (b) => {
  headBase(b, FACE.brute);
  if (b.level < 2) { sculptHair(b, FACE.brute, 1, { wild: 1 }); sculptBeard(b, FACE.brute, 1.25, 3); }
  b.shell(HC, helm(1), 0, TAU, 0, PI * 0.5, { c: K.iron, m: 'iron', a: [0.8, 1] });
  b.lathe([[0.09, 0.185], [0.1, 0.188], [0.102, 0.205], [0.1, 0.222], [0.09, 0.226]], [0, 0, -0.006], { sc: [1, 1, 1.15], c: K.fur, m: 'fur', p: PAT.fur });
  for (const s of [-1, 1]) {
    b.sweep([[s * 0.08, 0.245, 0.0], [s * 0.16, 0.27, 0.0], [s * 0.23, 0.35, 0.02], [s * 0.23, 0.45, 0.04]], 0.032, 0.006, { c: K.bone, m: 'bone', seg: b.pick(10, 6, 5), segs: b.pick(14, 8, 5) });
  }
  b.rbox([0, 0.165, 0.108], [0.02, 0.09, 0.01], { c: K.iron, m: 'iron', e: 0.3, rot: [-0.12, 0, 0] });
  if (b.level < 2) {
    b.band([[0, 0.3, 0.09], [0, 0.31, 0.0], [0, 0.29, -0.09]], 0.018, 0.003, { c: K.iron, m: 'iron', out: from(HC), segs: 6 });
    helmRivets(b, 0.232, 0.09, 0.106, -0.006, 10);
    // the plaits of the beard, bound with iron rings
    for (const s of [-1, 1]) {
      b.sweep([[s * 0.02, 0.05, 0.085], [s * 0.024, 0.0, 0.09], [s * 0.022, -0.06, 0.085]], 0.014, 0.008, { ...hairM, seg: 6, segs: b.pick(8, 4, 3) });
      if (b.level < 1) b.torus([s * 0.022, -0.05, 0.086], 0.011, 0.003, { ...iron, rot: [PI / 2, 0, 0], seg: 10, sides: 4 });
    }
  }
}, true);
// the plain hood (archers, engineers): a cowl over the head with a short tail behind, its cape over the shoulders
def('head.hood', (b) => {
  headBase(b); beard(b);
  b.shell([0, 0.195, -0.014], [0.1, 0.125, 0.115], PI * 0.5 + 0.8, TAU - 1.6, 0, PI * 0.9, { ...clothDk, a: [0.7, 1] });
  b.cone([0, 0.3, -0.05], [0, 0.33, -0.2], 0.065, { ...clothDk, seg: 6 });
  b.lathe([[0.2, -0.1], [0.15, -0.03], [0.08, 0.06]], [0, 0, -0.01], { sc: [1, 1, 0.76], ...clothDk, w: [0.2, 0], a: [0.65, 1] });
  if (b.level < 2) b.torus([0, 0.2, 0.06], 0.088, 0.008, { ...clothDk, rot: [0.18, 0, 0], sc: [1, 1.25, 1], seg: b.pick(24, 10, 6) });   // the rolled edge round the face
}, true);
// The Ranger's hood: the house's colour, pulled forward over the brow so the face is in its shadow, the edge rolled; a green scarf round
// the neck; a short beard
def('head.ranger', (b) => {
  headBase(b, FACE.lean, true, [0.55, 0.78]); beard(b, FACE.lean, 0.8, 0);   // (the face in the hood's shadow)
  const g = { ...clothDk };
  // a roomy hood rising to a soft point, its edge drawn forward round the face, the point falling behind
  b.shell([0, 0.21, -0.03], [0.132, 0.165, 0.15], PI * 0.5 + 0.55, TAU - 1.1, 0, PI * 0.9, { ...g, a: [0.55, 1] });
  b.ell([0, 0.33, -0.07], [0.07, 0.06, 0.09], { ...g, rot: [0.5, 0, 0], a: [0.75, 1] });
  b.torus([0, 0.195, 0.088], 0.086, 0.009, { ...g, rot: [0.4, 0, 0], sc: [1, 1.38, 1], seg: b.pick(24, 10, 6), a: [0.7, 1] });
  b.sweep([[0, 0.3, -0.11], [0, 0.25, -0.165], [0, 0.16, -0.18], [0, 0.07, -0.17]], 0.048, 0.012, { ...g, seg: b.pick(8, 5, 4), segs: b.pick(8, 5, 3), w: [0, 0.4] });   // (the point lies down the back)
  b.lathe([[0.16, -0.03], [0.13, 0.02], [0.085, 0.075]], [0, 0, -0.016], { sc: [1, 1, 0.82], ...g, a: [0.6, 1] });
  const sc = { c: K.green, m: 'wool', p: PAT.weave };
  b.lathe([[0.08, 0.0], [0.082, 0.04], [0.068, 0.09]], [0, 0, 0.004], { sc: [1, 1, 0.95], ...sc, a: [0.75, 1] });   // the scarf
  if (b.level < 2) b.band([[0.03, 0.04, 0.075], [0.04, -0.02, 0.09], [0.035, -0.1, 0.085]], 0.04, 0.004, { ...sc, w: [0, 0.5], out: () => [0, 0, 1], segs: b.pick(6, 3, 2) });
}, true);
// The Mage's cowl: a deep hood of the robe's blue, edged in gold round the face, the face beneath it lined and old, a long beard
def('head.cowl', (b) => {
  headBase(b, FACE.sage, true, [0.6, 0.82]);
  if (b.level < 2) sculptBeard(b, FACE.sage, 1.15, 2);
  const o = { c: K.robe, m: 'wool', p: PAT.weave };
  b.shell([0, 0.21, -0.03], [0.13, 0.163, 0.15], PI * 0.5 + 0.55, TAU - 1.1, 0, PI * 0.92, { ...o, a: [0.55, 1] });
  b.ell([0, 0.335, -0.075], [0.07, 0.065, 0.09], { ...o, rot: [0.55, 0, 0], a: [0.75, 1] });
  b.sweep([[0, 0.32, -0.1], [0, 0.26, -0.17], [0, 0.17, -0.19], [0, 0.08, -0.18]], 0.05, 0.012, { ...o, seg: b.pick(8, 5, 4), segs: b.pick(8, 5, 3) });
  b.torus([0, 0.195, 0.088], 0.088, 0.008, { ...gold, rot: [0.4, 0, 0], sc: [1, 1.38, 1], seg: b.pick(28, 12, 6) });
  b.lathe([[0.16, -0.03], [0.13, 0.01], [0.08, 0.07]], [0, 0, -0.012], { sc: [1, 1, 0.8], ...o, a: [0.65, 1] });
}, true);
def('head.none', (b) => {
  headBase(b, FACE.brute); hairSet(b, FACE.brute); beard(b, FACE.brute, 1.15);
  if (b.level < 2) for (const s of [-1, 1]) b.cone([s * 0.03, 0.1, 0.085], [s * 0.04, 0.165, 0.112], 0.012, { c: K.bone, m: 'bone', seg: 5 });
}, true);

// ---------------------------------------------------------------- things worn on the back and head (attached to their own joints)
def('quiver', (b) => {
  b.rod([0.07, 0.02, -0.17], [0.15, 0.46, -0.2], 0.052, 0.058, { c: K.quiver, m: 'leather', p: PAT.leather, a: [0.7, 1] });
  b.rod([0.075, 0.0, -0.17], [0.078, 0.03, -0.17], 0.056, 0.056, { c: K.leatherDk, m: 'leather' });
  if (b.level < 2) for (const t of [0.25, 0.7]) b.rod([0.07 + 0.08 * t, 0.02 + 0.44 * t, -0.17 - 0.03 * t], [0.07 + 0.08 * (t + 0.05), 0.02 + 0.44 * (t + 0.05), -0.17 - 0.03 * (t + 0.05)], 0.061, 0.061, { ...leatherDk, seg: b.pick(14, 8, 6) });
  const n = b.pick(7, 4, 3);
  for (let i = 0; i < n; i++) {
    const dx = (i - n / 2) * 0.014, dz = ((i * 7) % 3 - 1) * 0.012;
    b.rod([0.13 + dx, 0.44, -0.2 + dz], [0.15 + dx, 0.6 + (i % 2) * 0.03, -0.205 + dz], 0.006, 0.006, { c: K.wood, m: 'wood', seg: 4 });
    b.cone([0.15 + dx, 0.58 + (i % 2) * 0.03, -0.205 + dz], [0.152 + dx, 0.65 + (i % 2) * 0.03, -0.206 + dz], 0.022, { c: i % 3 ? K.linen : 0x8a2a20, m: 'cloth', seg: 4 });
  }
}, true);
// a longbow slung across the back when it is not in the hand: the string over the chest, the stave from the right hip to over the left shoulder
def('bow.back', (b) => {
  const pts = [[-0.24, -0.14, -0.15], [-0.1, 0.08, -0.17], [0.02, 0.3, -0.175], [0.13, 0.52, -0.165], [0.24, 0.74, -0.14]];
  b.sweep(pts, 0.016, 0.014, { c: 0x8a6a3c, m: 'wood', p: PAT.grain, seg: 5, segs: b.pick(14, 8, 5) });
  if (b.level < 2) {
    b.rod([-0.23, -0.12, -0.13], [0.23, 0.72, -0.12], 0.003, 0.003, { c: K.linen, m: 'cloth', seg: 3 });
    b.rod([-0.012, 0.25, -0.18], [0.03, 0.33, -0.18], 0.02, 0.02, { ...leather, seg: 6 });
  }
}, true);
def('plume.cloth', (b) => {
  b.sweep([[0, 0, 0], [0, 0.09, -0.07], [0, 0.1, -0.2], [0, -0.02, -0.3]], 0.045, 0.012, { ...cloth, w: [0.9, 0], seg: 6, segs: b.pick(10, 6, 4) });
}, true);
def('plume.gold', (b) => {
  b.sweep([[0, 0, 0], [0, 0.1, -0.07], [0, 0.12, -0.21], [0, -0.01, -0.32]], 0.05, 0.012, { c: 0xe8b830, m: 'silk', w: [0.9, 0], seg: 6, segs: b.pick(10, 6, 4) });
}, true);
// the cloak and fittings of a trained soldier (gates: see the top of the file)
def('kit.torso', (b) => {
  b.sheet([0, -0.02, -0.135], 0.5, 0.9, 5, b.pick(8, 5, 3), { rot: [0.05, 0, 0], ...cloth, g: 2, w: [1.9, 1.0], dz: (x) => -0.03 * (x / 0.25) ** 2, d: mud(-0.47, -0.2, 0.4) });
  b.sheet([0, -0.72, -0.135], 0.5, 0.5, 5, b.pick(5, 3, 2), { rot: [0.05, 0, 0], ...cloth, g: 5, w: [1.95, 1.8], dz: (x) => -0.03 * (x / 0.25) ** 2, d: mud(-0.97, -0.6, 0.55) });
  b.sheet([0, 0.42, -0.13], 0.52, 0.045, 5, 1, { ...trim, g: 2 });
  b.lathe([[0.112, 0.39], [0.118, 0.42], [0.08, 0.475]], [0, 0, -0.012], { sc: [1, 1, 0.86], ...gold, g: 3 });
  b.loft(over(-0.005, 0.03, 0.016), { sq: SQ, arc: [-0.7, 1.4], ...gold, g: 3 });
  if (b.level < 2) b.loft(over(0.02, 0.33, 0.03, 0.034), { sq: SQ, arc: [-0.95, 1.9], c: 0xe0b040, m: 'gold', g: 5, a: [0.8, 1] });
}, true);

// ---------------------------------------------------------------- shields (elbow frame, strapped to the outside of the forearm)
// A shield is drawn face to +z and then turned so its face looks out from the forearm (+x of the elbow frame) with the forearm running
// across its back, its top along +z; a kite's point is then along -z, so it hangs point down when the forearm is held across the body (see models.js).
const KITE_ON = new THREE.Matrix4().makeTranslation(-0.003, -0.18, 0.12).multiply(new THREE.Matrix4().makeRotationY(PI / 2)).multiply(new THREE.Matrix4().makeRotationZ(PI / 2));
const ROUND_ON = new THREE.Matrix4().makeTranslation(-0.008, -0.18, 0.14).multiply(new THREE.Matrix4().makeRotationY(PI / 2)).multiply(new THREE.Matrix4().makeRotationZ(PI / 2));
const KITE = [[-0.27, 0.29], [-0.14, 0.335], [0.14, 0.335], [0.27, 0.29], [0.275, 0.1], [0.22, -0.15], [0.12, -0.38], [0, -0.55], [-0.12, -0.38], [-0.22, -0.15], [-0.275, 0.1]];
def('shield.kite', (b) => {
  b.within(KITE_ON, () => {
    const c = [0.03, -0.12, 0.078];
    const sc = (k) => KITE.map(([x, y]) => [x * k, y * k + (k < 1 ? 0.012 : 0)]);
    if (b.level < 2) {
      b.extrude(sc(1), 0.034, 0.006, c, { ...iron, a: [0.7, 1] });
      b.extrude(sc(0.9), 0.036, 0.004, [c[0], c[1], c[2] + 0.004], { ...cloth, p: PAT.emblem, uv: [c[0], c[1] + 0.1, 0.46, 0.46], a: [0.8, 1] });
      b.rbox([c[0], c[1] - 0.1, c[2] + 0.025], [0.034, 0.7, 0.02], { c: K.trim, m: 'cloth', e: 0.4 });
      b.ell([c[0], c[1] + 0.1, c[2] + 0.034], [0.06, 0.06, 0.03], { ...steel });
    } else {
      b.extrude(sc(1), 0.04, 0, c, { ...cloth, p: PAT.emblem, uv: [c[0], c[1] + 0.1, 0.5, 0.5] });
    }
  });
}, true);
def('shield.round', (b) => {
  b.within(ROUND_ON, () => {
    const c = [0.03, -0.14, 0.088];
    b.lathe([[0.0, -0.034], [0.2, -0.026], [0.37, -0.01], [0.39, 0.0], [0.38, 0.02], [0.2, 0.034], [0.0, 0.04]], c, { rot: [PI / 2, 0, 0], ...cloth, p: PAT.emblem, uv: [c[0], c[1], 0.62, 0.62], a: [0.85, 1], seg: b.pick(22, 14, 9) });
    if (b.level < 2) {
      b.torus([c[0], c[1], c[2] - 0.004], 0.385, 0.02, { ...iron, sc: [1, 1, 1.4] });
      b.ell([c[0], c[1], c[2] + 0.034], [0.075, 0.075, 0.04], { ...steel });
      b.torus([c[0], c[1], c[2] + 0.01], 0.25, 0.008, { c: K.trim, m: 'cloth', sides: 3 });
      b.rbox([c[0], c[1], c[2] - 0.04], [0.06, 0.22, 0.03], { ...leather });
    }
  });
}, true);
// The knights' tall kite (knights, lords and the Knight hero): a rounded top, sides that belly out and taper to a point, the whole of it curved
// round the forearm. A grid, so the curve is in the surface and not only at its edge: the painted face (the house's arms), a darker back and the
// edge between them. KITE_L: half-width, top, where the round top meets the sides, the point; the curve (metres back per metre out squared).
const KITE_L = { W: 0.3, top: 0.4, sh: 0.2, pt: -0.7, bend: 0.32 };
const kiteHalf = (y, k) => {
  const { W, top, sh, pt } = KITE_L;
  if (y >= sh) { const q = (y - sh) / (top - sh); return W * k * Math.sqrt(Math.max(0, 1 - q * q)); }
  const s = (sh - y) / (sh - pt);
  return W * k * Math.pow(Math.max(0, 1 - s * s), 0.8);
};
// the shield's surface at (x, y), scaled by k about its middle: how far forward it stands
const kiteZ = (x, y) => -KITE_L.bend * x * x + 0.02 * (1 - Math.min(1, Math.abs(y + 0.05) / 0.6));
function kiteGeo(b, k, thick) {
  const { top, pt } = KITE_L, nx = b.pick(8, 6, 4), ny = b.pick(16, 10, 7);
  const P = [], I = [];
  const yAt = (j) => { const s = j / ny; return top * k + (pt * k - top * k) * (s < 0.35 ? s * s / 0.35 * 0.5 + s * 0.5 : s); };   // (rows closer together round the top)
  const ring = (j, i, zOff) => { const y = yAt(j), hw = kiteHalf(y / k, k), x = (2 * i / nx - 1) * hw; return [x, y, kiteZ(x, y) + zOff]; };
  const grid = (zOff, flip) => {
    const base = P.length / 3;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) P.push(...ring(j, i, zOff));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i, c = a + nx + 1;
      if (flip) I.push(a, a + 1, c, a + 1, c + 1, c); else I.push(a, c, a + 1, a + 1, c, c + 1);
    }
  };
  grid(0, false);
  if (thick > 0) {
    grid(-thick, true);
    // the edge: down the right side and back up the left, front to back
    const edge = [];
    for (let j = 0; j <= ny; j++) edge.push(ring(j, nx, 0));
    for (let j = ny - 1; j >= 1; j--) edge.push(ring(j, 0, 0));
    edge.push(edge[0]);
    const base = P.length / 3;
    for (const [x, y, z] of edge) P.push(x, y, z, x, y, z - thick);
    for (let e = 0; e < edge.length - 1; e++) { const a = base + e * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
def('shield.kiteL', (b) => {
  b.within(KITE_ON, () => {
    const c = [0.03, -0.12, 0.074];
    // the face (the house's arms: the emblem atlas, centred on the upper part, as wide as the shield) and, round it, the iron-shod edge
    b.place(kiteGeo(b, 0.93, 0), [c[0], c[1] - 0.012, c[2] + 0.006], [0, 0, 0], 1, { ...cloth, p: PAT.emblem, uv: [0.03, -0.11, 0.56, 0.56], a: [0.8, 1] });
    b.place(kiteGeo(b, 1, 0.03), c, [0, 0, 0], 1, { ...(b.level < 2 ? iron : clothDk), a: [0.7, 1] });
    if (b.level < 2) {
      b.ell([c[0], c[1] + 0.06, c[2] + 0.03], [0.055, 0.055, 0.03], { ...steel });                                          // the boss
      for (const [x, y] of [[-0.22, 0.24], [0.22, 0.24], [-0.24, -0.02], [0.24, -0.02], [0, 0.39]]) b.ell([c[0] + x, c[1] + y, c[2] + kiteZ(x, y) + 0.012], 0.013, { ...steel, seg: [5, 4] });   // rivets round the rim
      for (const y of [0.12, -0.08]) b.rbox([c[0], c[1] + y, c[2] - 0.045], [0.34, 0.035, 0.012], { ...leather });             // the straps on the back
    }
  });
}, true);
// the gilding of a trained soldier's shield (tier 3 and up)
def('kit.shield.round', (b) => {
  b.within(ROUND_ON, () => {
    b.torus([0.03, -0.14, 0.088], 0.39, 0.03, { ...gold, sc: [1, 1, 1.1] });
    b.ell([0.03, -0.14, 0.128], [0.082, 0.082, 0.044], { ...gold });
  });
});
def('kit.shield.kiteL', (b) => {
  b.within(KITE_ON, () => {
    b.rod([0.03, 0.26, 0.106], [0.03, -0.76, 0.1], 0.012, 0.012, { ...gold, seg: 5 });
    b.ell([0.03, -0.06, 0.118], [0.062, 0.062, 0.032], { ...gold });
  });
});
def('kit.shield.kite', (b) => {
  b.within(KITE_ON, () => {
    b.rbox([0.03, -0.0, 0.113], [0.034, 0.7, 0.014], { ...gold, e: 0.4 });
    b.rbox([0.03, -0.24, 0.113], [0.5, 0.034, 0.014], { ...gold, e: 0.4 });
    b.ell([0.03, -0.02, 0.118], [0.062, 0.062, 0.03], { ...gold });
  });
});

// ---------------------------------------------------------------- weapons (hand frame: the weapon extends along -y)
// The arming sword: a blade of lozenge section that narrows to its point, a fuller down the first half of each face, a crossguard whose
// arms turn down at the ends, a leather grip bound with wire and a wheel pommel. (Modelled with its edges across the hand: models.js turns it.)
def('weapon.sword', (b) => {
  const bl = [[-0.122, 0.026, 0.0058], [-0.3, 0.0245, 0.0054], [-0.6, 0.0215, 0.0048], [-0.84, 0.0175, 0.0042], [-0.95, 0.012, 0.0036], [-1.005, 0.0055, 0.0024], [-1.03, 0.001, 0.001]];
  b.loft(b.level >= 2 ? [bl[0], bl[3], bl[6]] : bl, { ...steel, sq: 1.35, seg: b.pick(12, 8, 4), a: [1, 1] });
  if (b.level < 2) for (const s of [-1, 1]) b.rbox([0, -0.4, s * 0.0052], [0.009, 0.52, 0.0016], { c: K.iron, m: 'steel', e: 0.5 });
  if (b.level < 2) b.sweep([[-0.12, -0.098, 0], [-0.07, -0.114, 0], [0, -0.118, 0], [0.07, -0.114, 0], [0.12, -0.098, 0]], 0.011, 0.011, { ...iron, seg: 6, segs: b.pick(10, 6, 4) });
  else b.rbox([0, -0.115, 0], [0.25, 0.026, 0.03], { ...iron, e: 0.4 });
  b.rbox([0, -0.116, 0], [0.04, 0.03, 0.03], { ...iron, e: 0.45 });
  b.rod([0, 0.07, 0], [0, -0.105, 0], 0.017, 0.019, { c: K.leatherDk, m: 'leather', p: PAT.leather, seg: b.pick(10, 7, 5) });
  if (b.level < 1) for (const y of [0.06, -0.095]) b.torus([0, y, 0], 0.019, 0.003, { ...brass, rot: [PI / 2, 0, 0], seg: 12, sides: 4 });
  b.rod([0, 0.085, -0.012], [0, 0.085, 0.012], 0.03, 0.03, { ...brass, seg: b.pick(14, 8, 6) });
  if (b.level < 2) for (const s of [-1, 1]) b.ell([0, 0.085, s * 0.013], [0.014, 0.014, 0.006], { ...brass, seg: [8, 6] });
  if (b.level < 2) for (const s of [-1, 1]) b.ell([s * 0.12, -0.096, 0], [0.014, 0.014, 0.014], { ...iron, seg: [7, 5] });
});
def('weapon.spear', (b) => {
  b.rod([0, 0.55, 0], [0, -1.86, 0], 0.021, 0.019, { ...wood, seg: b.pick(10, 6, 4) });
  b.loft([[-1.86, 0.016, 0.01], [-1.9, 0.045, 0.012], [-2.02, 0.04, 0.01], [-2.14, 0.018, 0.006], [-2.22, 0.001, 0.001]], { ...steel, sq: 1.4, seg: b.pick(10, 8, 4) });
  b.rod([0, -1.8, 0], [0, -1.9, 0], 0.03, 0.022, { ...iron });
  b.cone([0, 0.55, 0], [0, 0.63, 0], 0.024, { ...iron, seg: 5 });
  if (b.level < 2) for (const y of [-1.2, -0.9]) b.rod([0, y, 0], [0, y - 0.03, 0], 0.027, 0.027, { ...leather });
});
def('weapon.lance', (b) => {
  b.rod([0, 0.35, 0], [0, -2.95, 0], 0.034, 0.018, { c: 0xd9cfb8, m: 'wood', p: PAT.grain, seg: b.pick(10, 6, 4) });
  b.cone([0, -2.92, 0], [0, -3.2, 0], 0.024, { ...steel, seg: 6 });
  b.lathe([[0.03, -0.3], [0.12, -0.2], [0.1, -0.12], [0.03, -0.1]], [0, 0, 0], { ...iron, seg: b.pick(16, 10, 6) });
  b.place(new THREE.PlaneGeometry(0.2, 0.55, 3, 3), [0.3, -2.65, 0], [0, 0, PI / 2], 1, { ...cloth, w: [0.95, 0] });
}, true);
def('weapon.axe', (b) => {
  b.rod([0, 0.1, 0], [0, -0.95, 0], 0.024, 0.022, { ...wood, seg: 7 });
  b.extrude([[0, 0.12], [0.1, 0.18], [0.2, 0.15], [0.2, -0.17], [0.1, -0.2], [0, -0.14]], 0.02, 0.004, [0, -0.78, 0], { ...steel, rot: [0, -PI / 2, 0] });
});
// The Berserker's great axe: a long haft bound in leather where the hands go, iron langets up to the head, a broad bearded crescent of a
// blade with a spike behind it
def('weapon.greataxe', (b) => {
  b.rod([0, 0.3, 0], [0, -1.5, 0], 0.027, 0.025, { ...wood, seg: b.pick(10, 6, 5) });
  if (b.level < 2) {
    b.rod([0, 0.14, 0], [0, -0.24, 0], 0.031, 0.031, { ...leatherDk, seg: b.pick(10, 6, 5) });
    for (const s of [-1, 1]) b.rbox([s * 0.026, -1.08, 0], [0.006, 0.26, 0.022], { ...iron, e: 0.5 });
    if (b.level < 1) for (const y of [0.14, -0.24]) b.torus([0, y, 0], 0.031, 0.004, { ...iron, rot: [PI / 2, 0, 0], seg: 12, sides: 4 });
  }
  const bit = [[0, 0.13], [0.06, 0.15], [0.14, 0.21], [0.22, 0.21], [0.27, 0.11], [0.285, -0.02], [0.27, -0.15], [0.21, -0.26], [0.12, -0.27], [0.06, -0.16], [0, -0.12]];
  b.extrude(bit, 0.024, b.level < 2 ? 0.007 : 0, [0, -1.25, 0], { ...steel, rot: [0, -PI / 2, 0] });
  b.extrude([[0, 0.06], [-0.12, 0.025], [-0.2, 0], [-0.12, -0.025], [0, -0.06]], 0.024, b.level < 2 ? 0.005 : 0, [0, -1.25, 0], { ...steel, rot: [0, -PI / 2, 0] });
  b.rbox([0, -1.25, 0], [0.07, 0.15, 0.07], { ...iron, e: 0.4 });
  b.cone([0, -1.5, 0], [0, -1.58, 0], 0.03, { ...iron, seg: 5 });
});
def('weapon.club', (b) => {
  b.rod([0, 0.35, 0], [0, -1.5, 0], 0.05, 0.15, { c: 0x5a3e24, m: 'wood', p: PAT.grain, seg: b.pick(12, 8, 6) });
  b.ell([0, -1.5, 0], [0.15, 0.1, 0.15], { c: 0x4a321c, m: 'wood', p: PAT.grain });
  const n = b.pick(10, 7, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, y = -1.15 - (i % 3) * 0.12, r = 0.13 + (y < -1.25 ? 0.015 : 0);
    b.cone([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a) * (r + 0.1), y, Math.sin(a) * (r + 0.1)], 0.035, { ...iron, seg: 5 });
  }
  if (b.level < 2) b.rod([0, -0.1, 0], [0, -0.3, 0], 0.057, 0.058, { ...leather });
});
// The Mage's staff: a crooked shaft of dark wood with bands of gold, its head three tines of bone curled round a glowing stone
def('weapon.staff', (b) => {
  const shaft = [[0, 0.6, 0], [0.008, 0.3, -0.006], [-0.006, 0.0, 0.004], [0.006, -0.4, 0.008], [-0.008, -0.8, -0.004], [0.004, -1.15, 0.006], [0, -1.35, 0]];
  b.sweep(shaft, 0.029, 0.023, { c: K.woodDk, m: 'wood', p: PAT.grain, seg: b.pick(8, 6, 5), segs: b.pick(16, 8, 5) });
  b.ell([0, -1.5, 0], 0.085, { c: 0xff9a3a, m: 'gem', p: PAT.glow, seg: [b.pick(16, 8, 6), b.pick(12, 6, 4)] });
  if (b.level < 2) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.sweep([[0, -1.33, 0], [Math.cos(a) * 0.09, -1.42, Math.sin(a) * 0.09], [Math.cos(a) * 0.11, -1.58, Math.sin(a) * 0.11], [Math.cos(a) * 0.05, -1.68, Math.sin(a) * 0.05]], 0.018, 0.006, { c: K.bone, m: 'bone', seg: 6 });
    }
    for (const y of [-1.3, -0.95, 0.05]) b.lathe([[0.027, y - 0.02], [0.031, y - 0.01], [0.031, y + 0.01], [0.027, y + 0.02]], [0, 0, 0], { ...gold, seg: b.pick(14, 8, 6) });
    if (b.level < 1) b.ell([0, -1.5, 0], 0.05, { c: 0xfff0c0, m: 'gem', p: PAT.glow, seg: [10, 8] });
  }
});
// The Cleric's flanged mace: an iron head of seven flanges on a collar, a haft bound in leather, a knob at its end
def('weapon.mace', (b) => {
  b.rod([0, 0.1, 0], [0, -0.8, 0], 0.024, 0.022, { ...wood, seg: b.pick(10, 7, 5) });
  if (b.level < 2) {
    b.rod([0, 0.09, 0], [0, -0.13, 0], 0.027, 0.027, { ...leatherDk, seg: b.pick(10, 7, 5) });
    b.ell([0, 0.11, 0], 0.03, { ...iron, seg: [8, 6] });
    b.lathe([[0.028, -0.86], [0.036, -0.82], [0.036, -0.79], [0.026, -0.76]], [0, 0, 0], { ...iron, seg: b.pick(14, 8, 6) });
  }
  b.ell([0, -0.9, 0], [0.06, 0.08, 0.06], { ...iron, seg: [b.pick(12, 10, 6), b.pick(10, 8, 5)] });
  const n = b.pick(7, 6, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    b.extrude([[0, 0.08], [0.035, 0.05], [0.05, -0.02], [0.03, -0.075], [0, -0.09]], 0.01, b.level < 1 ? 0.002 : 0, [Math.cos(a) * 0.045, -0.9, Math.sin(a) * 0.045], { ...steel, rot: [0, -a, 0] });
  }
  b.cone([0, -0.97, 0], [0, -1.04, 0], 0.03, { ...steel, seg: 5 });
});
const GRIP = new THREE.Matrix4().makeTranslation(0, 0.05, 0);   // (the grip sits in the fist)
// held in the shield hand (elbow frame): the grip is at the hand and the limbs run along the frame's z axis
def('bow', (b) => {
  b.within(GRIP, () => {
    const pts = [-0.64, -0.4, -0.2, 0, 0.2, 0.4, 0.64].map((z) => [0, -0.36 + 0.17 * (z / 0.64) ** 2, z]);
    b.sweep(pts, 0.022, 0.012, { c: K.wood, m: 'wood', p: PAT.grain, seg: 5, segs: b.pick(14, 10, 6) });
    b.rod([0, -0.19, -0.64], [0, -0.19, 0.64], 0.004, 0.004, { c: K.linen, m: 'cloth', seg: 3 });
    b.rod([0, -0.4, 0.07], [0, -0.3, -0.07], 0.026, 0.026, { ...leather });
  });
}, true);
def('bow.long', (b) => {
  b.within(GRIP, () => {
    const pts = [-0.85, -0.55, -0.27, 0, 0.27, 0.55, 0.85].map((z) => [0, -0.36 + 0.2 * (z / 0.85) ** 2, z]);
    b.sweep(pts, 0.024, 0.012, { c: 0x8a6a3c, m: 'wood', p: PAT.grain, seg: 5, segs: b.pick(14, 10, 6) });
    b.rod([0, -0.16, -0.85], [0, -0.16, 0.85], 0.004, 0.004, { c: K.linen, m: 'cloth', seg: 3 });
    b.rod([0, -0.4, 0.07], [0, -0.3, -0.07], 0.026, 0.026, { ...leather });
  });
}, true);

// the same bows at full draw, an arrow on the string: the limbs bent back toward the archer, the string drawn to the nock. The nock is where
// models.js (drawPose) puts the anchor under the jaw, in this frame; the arrow lies over the bow hand and its head stands past the bow.
const NOCK = [-0.074, 0.317, 0.163], REST = [-0.014, -0.36, 0.045];
def('bow.drawn', (b) => drawnBow(b, 0.58, 0.27, K.wood), true);
def('bow.long.drawn', (b) => drawnBow(b, 0.79, 0.31, 0x8a6a3c), true);
function drawnBow(b, half, bend, wood) {
  b.within(GRIP, () => {
    const pts = [-half, -0.55 * half, -0.27 * half, 0, 0.27 * half, 0.55 * half, half].map((z) => [0, -0.36 + bend * (z / half) ** 2, z]);
    b.sweep(pts, 0.022, 0.012, { c: wood, m: 'wood', p: PAT.grain, seg: 5, segs: b.pick(14, 10, 6) });
    for (const s of [-1, 1]) b.rod([0, -0.36 + bend, s * half], NOCK, 0.004, 0.004, { c: K.linen, m: 'cloth', seg: 3 });
    b.rod([0, -0.4, 0.07], [0, -0.3, -0.07], 0.026, 0.026, { ...leather });
    const d = REST.map((v, i) => v - NOCK[i]), n = Math.hypot(...d), tip = REST.map((v, i) => v + (d[i] / n) * 0.07);
    b.rod(NOCK, tip, 0.006, 0.006, { c: K.wood, m: 'wood', seg: 4 });
    b.cone(tip, tip.map((v, i) => v + (d[i] / n) * 0.06), 0.012, { ...steel, seg: 4 });
    if (b.level < 2) b.rod(NOCK.map((v, i) => v + (d[i] / n) * 0.02), NOCK.map((v, i) => v + (d[i] / n) * 0.13), 0.016, 0.016, { c: K.linen, m: 'cloth', seg: 3 });
  });
}

// ---------------------------------------------------------------- horses (frame at the ground below the middle of the animal)
// (a horse's coat takes the skin colour slot, its mane and tail the hair slot, its caparison the house cloth)
const hide = { s: 'skin', m: 'skin' };
function saddle(b) {
  b.rbox([0, 1.78, -0.04], [0.42, 0.1, 0.56], { ...leather, e: 0.35 });
  b.rbox([0, 1.86, -0.3], [0.4, 0.14, 0.08], { ...leather, e: 0.35 });
  b.rbox([0, 1.86, 0.22], [0.1, 0.1, 0.06], { ...leather, e: 0.35 });
  b.rbox([0, 1.715, -0.05], [0.7, 0.06, 0.82], { ...cloth, e: 0.3 });
  if (b.level < 2) for (const s of [-1, 1]) b.rod([s * 0.3, 1.74, 0.0], [s * 0.42, 1.3, 0.04], 0.013, 0.013, { ...iron, seg: 4 });
}
function horseBody(b, barded) {
  const coat = { ...hide, a: [0.55, 1] };
  b.ell([0, 1.36, 0.0], [0.31, 0.4, 0.84], coat);
  b.ell([0, 1.4, 0.56], [0.32, 0.4, 0.36], coat);
  b.ell([0, 1.43, -0.58], [0.33, 0.38, 0.38], coat);
  if (b.level < 2) b.ell([0, 1.2, 0.15], [0.3, 0.2, 0.55], { ...hide, a: [0.35, 0.8] });
  saddle(b);
  if (barded) {
    for (const s of [-1, 1]) {
      const o = { rot: [0, s * PI / 2, 0], dz: (x, y) => 0.09 * ((0.375 - y) / 0.75), w: [0.8, 0] };
      b.sheet([s * 0.36, 1.27, -0.05], 1.5, 0.75, b.pick(6, 4, 2), b.pick(5, 3, 2), { ...cloth, ...o });
      if (b.level < 2) b.sheet([s * 0.36, 0.915, -0.05], 1.5, 0.05, b.pick(6, 4, 2), 1, { c: K.trim, m: 'cloth', rot: [0, s * PI / 2, 0], dz: () => 0.09, w: [0.8, 0.7] });
    }
    b.ell([0, 1.4, 0.6], [0.345, 0.42, 0.38], { ...cloth, a: [0.7, 1] });
  }
}
def('horse.body', (b) => horseBody(b, false), true);
def('horse.body.barded', (b) => horseBody(b, true), true);
function horseNeck(b, barded) {
  const coat = { ...hide, a: [0.7, 1] };
  b.rod([0, 0, 0], [0, 0.46, 0.4], 0.2, 0.12, { ...coat, seg: b.pick(12, 8, 6) });
  b.ell([0, 0.58, 0.55], [0.115, 0.16, 0.18], { ...coat, rot: [0.45, 0, 0] });
  b.rod([0, 0.52, 0.62], [0, 0.34, 0.93], 0.1, 0.072, { ...coat, seg: b.pick(10, 8, 6) });
  b.ell([0, 0.325, 0.95], [0.07, 0.065, 0.06], { s: 'skinDark', m: 'skin', seg: [8, 6] });
  for (const s of [-1, 1]) {
    b.cone([s * 0.065, 0.68, 0.46], [s * 0.075, 0.82, 0.42], 0.032, { ...coat, seg: 5 });
    if (b.level < 2) b.ell([s * 0.108, 0.6, 0.6], 0.024, { c: K.dark, m: 'gem', seg: [6, 5] });
  }
  b.ell([0, 0.3, 0.17], [0.032, 0.38, 0.1], { s: 'hair', m: 'hair', rot: [0.7, 0, 0], w: [0.5, 0] });
  if (b.level < 2) {
    b.torus([0, 0.43, 0.75], 0.078, 0.008, { ...leather, rot: [-0.55, 0, 0] });
    b.rod([0, 0.62, 0.4], [0, 0.48, 0.62], 0.012, 0.012, { ...leather });
  }
  if (barded) {
    b.rod([0, -0.02, -0.02], [0, 0.42, 0.37], 0.235, 0.15, { ...cloth, a: [0.8, 1], seg: b.pick(12, 8, 6) });
    if (b.level < 1) b.rbox([0, 0.62, 0.6], [0.17, 0.25, 0.04], { ...plate, e: 0.3, rot: [0.5, 0, 0] });
  }
}
def('horse.neck', (b) => horseNeck(b, false), true);
def('horse.neck.barded', (b) => horseNeck(b, true), true);
def('horse.tail', (b) => {
  b.sweep([[0, 0, 0], [0, -0.1, -0.12], [0, -0.38, -0.2], [0, -0.78, -0.2]], 0.055, 0.02, { s: 'hair', m: 'hair', w: [0.9, 0], seg: 6, segs: b.pick(10, 6, 4) });
}, true);
for (const kind of ['fore', 'hind']) {
  const thick = kind === 'fore' ? 0.12 : 0.155;
  def('horse.up.' + kind, (b) => {
    const coat = { ...hide, a: [0.8, 1] };
    b.rod([0, 0, 0], [0, -0.6, 0], thick, 0.07, { ...coat, seg: b.pick(10, 8, 6) });
    b.ell([0, 0, 0], thick, { ...coat, seg: [10, 8] });
    b.ell([0, -0.6, 0], 0.07, { ...coat, seg: [8, 6] });
  });
  def('horse.low.' + kind, (b) => {
    const coat = { ...hide, a: [0.85, 1] };
    b.rod([0, 0, 0], [0, -0.44, 0], 0.056, 0.042, { ...coat, seg: b.pick(8, 6, 5) });
    b.ell([0, -0.46, 0.01], 0.055, { ...coat, seg: [8, 6] });
    b.rod([0, -0.46, 0.01], [0, -0.54, 0.035], 0.042, 0.047, { ...coat, seg: 6 });
    b.rod([0, -0.53, 0.03], [0, -0.61, 0.05], 0.05, 0.064, { c: K.hoof, m: 'bone', seg: b.pick(10, 8, 6) });
  });
}

// ---------------------------------------------------------------- capes (frame at the shoulders, a little behind the back)
// A cloak is cut as cloth hangs: it comes forward round the shoulders at the top, lies on the back, falls in folds that deepen toward the
// hem and flares as it goes; the hem is a little uneven and carries the dust of the road. `w` is its width at the neck, h its length.
// (Every cloak, the earned ones too, is draped by this, so all of them hang alike and the sigil sits between the shoulder blades.)
const FLARE = 0.3;
function drapeGeo(b, w, h, k = {}) {
  const flare = k.flare ?? FLARE, folds = k.folds ?? 1, phase = k.phase ?? 0.6;
  const g = new THREE.PlaneGeometry(w, h, b.pick(16, 7, 3), b.pick(18, 9, 4));
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x0 = pa.getX(i), y0 = pa.getY(i);
    const down = (h / 2 - y0) / h, u = x0 / (w / 2), top = Math.max(0, 1 - down / 0.18);
    const kx = 1 + flare * down;
    // forward round the shoulders at the top, gently round the back below it, pleats that open toward the hem
    let z = 0.16 * top * top * u * u + 0.05 * (1 - top) * u * u - 0.085 * Math.min(1, Math.max(0, (down - 0.3) / 0.4)) * (1 - 0.3 * u * u);   // (out over the seat and skirts)
    z += folds * (0.012 + 0.03 * down) * Math.sin(u * 7.2 + phase) * Math.min(1, down * 3);
    const y = y0 + 0.012 * Math.sin(u * 9.1 + 1.3) * down * down;
    pa.setXYZ(i, x0 * kx * (1 - 0.22 * top), y, z);
  }
  g.computeVertexNormals();
  return g;
}
const capeDirt = (h) => mud(-h, -h + 0.35, 0.5);
const hang = (b, w, h, o, k) => b.place(drapeGeo(b, w, h, k), [0, -h / 2, -0.03], [0, 0, 0], 1, { ...o, w: [1.95, 1.0], a: [0.7, 1], d: capeDirt(h) });
// a band along the hem (swaying with the cloth) or the collar (still)
const hem = (b, w, h, y, o) => {
  const g = drapeGeo(b, w, h);
  // (the bottom row of the drape, as a band a little outside it)
  const pa = g.attributes.position, nx = b.pick(16, 7, 3), row = [];
  for (let i = 0; i <= nx; i++) { const j = pa.count - 1 - nx + i; row.push([pa.getX(j), pa.getY(j) - h / 2 + 0.02, pa.getZ(j) - 0.03 - 0.004]); }
  g.dispose();
  b.band(row, 0.05, 0.004, { ...o, w: [1.95, 1.9], out: () => [0, 0, -1], segs: nx * 2, d: capeDirt(h) });
};
// (the collar: a roll round the back of the neck, along the cloak's top edge)
const collar = (b, w, hgt, o) => {
  const hw = w * 0.39;
  b.sweep([[-hw, 0.0, 0.11], [-hw * 0.55, 0.012, 0.0], [0, 0.018, -0.03], [hw * 0.55, 0.012, 0.0], [hw, 0.0, 0.11]], hgt * 0.45, hgt * 0.45, { ...o, seg: b.pick(8, 5, 4), segs: b.pick(12, 6, 4) });
};
const clasp = (b, o = gold) => { if (b.level < 2) { b.rbox([0, 0.0, 0.1], [0.06, 0.05, 0.02], { ...o, e: 0.4 }); if (b.level < 1) b.rod([-0.12, 0.005, 0.07], [0.12, 0.005, 0.07], 0.004, 0.004, { ...o, seg: 4 }); } };
def('cape.long', (b) => {
  hang(b, 0.58, 1.0, { ...cloth });
  if (b.level < 2) hem(b, 0.58, 1.0, -0.99, trim);
  collar(b, 0.66, 0.08, { c: K.furLt, m: 'fur', p: PAT.fur });
  clasp(b);
}, true);
def('cape.cloak', (b) => {
  hang(b, 0.54, 0.8, { ...clothDk }, { folds: 0.8, phase: 1.4 });
  collar(b, 0.6, 0.06, { ...clothDk });
  clasp(b, brass);
}, true);

// ---- the cloaks a lord can earn with Renown (unlocks.js): the colours are fixed, so they never take the house colour. They hang where the others do.
// the lord's sigil on the back, between the shoulder blades (the uv runs right to left: the badge is seen from behind)
const BADGE = { p: PAT.badge, uv: [0, -0.3, -0.3, 0.3] };
def('cape.crimson', (b) => {   // deep red wool, a gold hem and collar, a gold clasp
  hang(b, 0.58, 1.0, { c: 0x8c1f24, m: 'wool', ...BADGE });
  if (b.level < 2) hem(b, 0.58, 1.0, -0.99, { ...gold });
  collar(b, 0.62, 0.075, { ...gold });
  clasp(b);
}, true);
def('cape.greenwood', (b) => {   // a shorter travelling cloak, a leather hem, a rolled hood at the neck
  hang(b, 0.56, 0.86, { c: 0x2f5a34, m: 'wool', ...BADGE }, { folds: 0.9, phase: 1.1 });
  if (b.level < 2) hem(b, 0.56, 0.86, -0.85, { c: K.leather, m: 'leather', p: PAT.leather });
  collar(b, 0.6, 0.11, { c: 0x25472a, m: 'wool', p: PAT.weave });
  clasp(b, brass);
}, true);
def('cape.wolfpelt', (b) => {   // grey wool under a deep collar and shoulders of wolf fur
  const fur = { c: 0xcfc8b8, m: 'fur', p: PAT.fur };
  hang(b, 0.6, 0.9, { c: 0x6a6e74, m: 'wool', ...BADGE }, { folds: 0.9 });
  if (b.level < 2) hem(b, 0.6, 0.9, -0.89, fur);
  collar(b, 0.7, 0.17, fur);
  for (const s of [-1, 1]) b.ell([s * 0.2, 0.0, 0.0], [0.11, 0.06, 0.09], { ...fur, seg: [b.pick(10, 6, 4), b.pick(8, 4, 3)] });
}, true);
def('cape.midnight', (b) => {   // dark blue silk edged in silver
  const silver = { c: 0xc8ced8, m: 'steel' };
  hang(b, 0.58, 1.0, { c: 0x1c2756, m: 'silk', ...BADGE }, { folds: 1.2, phase: 0.2 });
  if (b.level < 2) hem(b, 0.58, 1.0, -0.99, silver);
  collar(b, 0.62, 0.06, silver);
  clasp(b, silver);
}, true);
