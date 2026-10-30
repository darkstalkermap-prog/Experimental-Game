// The giant: a two-headed ettin, bald and bearded, bare-chested and hunched, in a shaggy fur kilt with a round iron boss on the belt, its
// forearms and shins bound in rags, swinging a stone-headed hammer. It is a rig like a soldier's (the same joints, so poseSoldier and
// poseDeath move it, and crowd.js draws it as instances of shared shapes), with its own shapes and proportions, and a few touches on top of
// the soldier's poses (poseGiant, poseGiantDead): a hunch, a heavy rolling gait, a hammer brought down with the whole body.
// Its house shows in the sash across the chest, the banner on the kilt (with the house emblem) and the rag tied under the hammer's head.
// Shapes are modelled in the joints' frames in the units of a 1.8 m man (the body joint scales the whole rig up by GIANT_SCALE).
import * as THREE from 'three';
import { PAT, SKIRT } from './modelkit.js';
import { SHAPES, getShape } from './shapes.js';

export const GIANT_SCALE = 3.2;
export const GIANT_TILT = -0.2;   // the hammer's angle in the fist, at rest (the head down by his feet)
const TAU = Math.PI * 2, PI = Math.PI;

const K = {
  fur: 0x5c4430, furLt: 0x7a5a3a, furDk: 0x3a2a1c, rag: 0x2e2822, ragLt: 0x433a30, cord: 0x8a7350, iron: 0x3c3c40, ironLt: 0x5a5a5e,
  stone: 0x8a8780, stoneDk: 0x6a6862, wood: 0x5a3e24, bone: 0xd8ccb0, nail: 0x9a8a70,
};
const skin = { s: 'skin', m: 'skin', p: PAT.skin }, skinDk = { s: 'skinDark', m: 'skin', p: PAT.skin };
const fur = { c: K.fur, m: 'fur', p: PAT.fur }, furLt = { c: K.furLt, m: 'fur', p: PAT.fur };
const rag = { c: K.rag, m: 'wool', p: PAT.weave }, cord = { c: K.cord, m: 'leather' };
const beardM = { s: 'hair', m: 'hair', p: PAT.fur };
const team = { s: 'cloth', m: 'cloth', p: PAT.weave };
const def = (name, make, open = false) => SHAPES.set(name, { name, make, open, geo: [null, null, null, null] });
const grow = (rings, d) => rings.map(([y, rx, rz, z]) => [y, rx + d, rz + d, z]);
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
const frame = (p, r, s = 1) => new THREE.Matrix4().compose(_P.fromArray(p), _Q.setFromEuler(_E.set(r[0], r[1], r[2])), _S.set(s, s, s));

// ---------------------------------------------------------------- the trunk (torso frame, the waist): a barrel chest, a wall of muscle
// across the shoulders and up behind the heads (the trapezius they sit on), pectorals, a ridged belly
const TRUNK = [[-0.1, 0.172, 0.132, 0.012], [0.0, 0.178, 0.136, 0.016], [0.1, 0.194, 0.142, 0.016], [0.2, 0.228, 0.15, 0.01], [0.28, 0.252, 0.154, 0.004],
  [0.34, 0.262, 0.15, -0.006], [0.39, 0.252, 0.136, -0.016], [0.43, 0.215, 0.122, -0.022], [0.47, 0.16, 0.104, -0.018], [0.5, 0.125, 0.09, -0.01]];
def('giant.chest', (b) => {
  const lo = b.level >= 2;
  b.loft(TRUNK, { ...skin, sq: 2.3, a: [0.74, 1], seg: b.pick(22, 16, 10) });
  // the trapezius: a hump behind and between the heads
  b.ell([0, 0.43, -0.035], [0.2, 0.1, 0.11], { ...skin, a: [0.85, 1] });
  // pectorals, heavy and a little slack
  for (const sx of [-1, 1]) b.ell([sx * 0.105, 0.27, 0.105], [0.115, 0.088, 0.062], { ...skin, a: [0.72, 1], rot: [0.12, 0, sx * 0.22] });
  if (!lo) {
    // the belly: three pairs of ridges, the obliques and the ribs under the arms (serratus)
    for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) b.ell([sx * 0.046, 0.155 - r * 0.072, 0.128 - r * 0.004], [0.042, 0.033, 0.026], { ...skin, a: [0.78, 1], seg: [b.pick(8, 6, 5), b.pick(6, 4, 3)] });
    for (const sx of [-1, 1]) {
      b.ell([sx * 0.152, 0.02, 0.07], [0.05, 0.09, 0.07], { ...skin, a: [0.8, 1], rot: [0, 0, sx * 0.2] });
      b.ell([sx * 0.19, 0.2, -0.04], [0.085, 0.14, 0.1], { ...skin, a: [0.8, 1] });                       // the lats
      b.ell([sx * 0.12, 0.32, -0.1], [0.1, 0.09, 0.06], { ...skin, a: [0.82, 1] });                         // the shoulder blades
      if (b.level < 1) for (let k = 0; k < 3; k++) b.ell([sx * (0.2 + k * 0.006), 0.19 - k * 0.045, 0.075], [0.022, 0.016, 0.03], { ...skin, a: [0.8, 1], rot: [0, 0, sx * -0.4], seg: [6, 4] });
      b.ell([sx * 0.11, 0.245, 0.165], [0.011, 0.011, 0.006], { ...skinDk, seg: [5, 3] });                 // nipples
    }
    b.ell([0, 0.0, 0.142], [0.012, 0.016, 0.008], { ...skinDk, seg: [5, 3] });                              // the navel
  }
  // the house sash, over the left shoulder and across to the right hip, and round the back
  b.sweep([[0.2, 0.47, -0.02], [0.13, 0.36, 0.165], [0.0, 0.2, 0.185], [-0.13, 0.04, 0.17], [-0.2, -0.08, 0.1]], 0.034, 0.03, { ...team, seg: b.pick(6, 5, 4), segs: b.pick(14, 10, 6), a: [0.8, 1] });
  if (!lo) b.sweep([[0.2, 0.47, -0.02], [0.17, 0.33, -0.17], [0.0, 0.16, -0.17], [-0.16, 0.0, -0.13], [-0.2, -0.08, 0.1]], 0.032, 0.03, { ...team, seg: 5, segs: b.pick(12, 8, 6), a: [0.7, 0.9] });
  // a cord of teeth and bones round the base of the necks
  if (b.level < 1) {
    b.sweep([[-0.17, 0.45, 0.04], [-0.1, 0.38, 0.13], [0, 0.35, 0.155], [0.1, 0.38, 0.13], [0.17, 0.45, 0.04]], 0.007, 0.007, { ...cord, seg: 4, segs: 10 });
    for (let k = -3; k <= 3; k++) b.cone([k * 0.042, 0.365 + Math.abs(k) * 0.01, 0.15 - Math.abs(k) * 0.008], [k * 0.046, 0.32 + Math.abs(k) * 0.012, 0.165 - Math.abs(k) * 0.008], 0.012, { c: K.bone, m: 'bone', seg: 5 });
  }
}, true);

// ---------------------------------------------------------------- the two heads (head frame, the top of the trunk between the shoulders)
// Each is bald, heavy-browed and scowling, with a long shaggy beard, on a thick neck; the two lean and look a little apart.
function oneHead(b, lo) {
  if (b.level >= 3) {
    b.ell([0, 0.17, 0.01], [0.085, 0.11, 0.1], { ...skin, seg: [5, 3] });
    b.cone([0, 0.1, 0.06], [0, -0.14, 0.11], 0.07, { ...beardM, seg: 4 });
    return;
  }
  b.loft([[-0.08, 0.085, 0.08, -0.01], [0.02, 0.075, 0.072, 0.0], [0.12, 0.066, 0.068, 0.0]], { ...skin, a: [0.6, 0.85], seg: b.pick(10, 8, 6) });   // the neck
  // the face atlas (the eyes, the mouth) is laid on the front of the skull, face and jaw
  const front = (x, y, z) => (z < 0.0 ? [-3, -3] : [x / 0.19 + 0.5, (y - 0.158) / 0.25 + 0.5]);
  const fp = { ...skin, p: PAT.face, uv: front };
  b.ell([0, 0.2, -0.012], [0.086, 0.096, 0.1], { ...skin, seg: [b.pick(14, 10, 8), b.pick(10, 7, 5)] });   // the bald skull
  b.ell([0, 0.15, 0.028], [0.074, 0.084, 0.076], { ...fp, seg: [b.pick(12, 8, 6), b.pick(8, 6, 4)] });   // the face
  b.ell([0, 0.095, 0.03], [0.068, 0.05, 0.07], { ...fp, seg: [b.pick(10, 7, 6), b.pick(7, 5, 4)] });      // a broad jaw
  // the brow: a heavy ridge, knotted down in the middle in a scowl
  b.ell([0, 0.193, 0.07], [0.074, 0.028, 0.042], { ...skin, a: [0.8, 0.95], rot: [-0.25, 0, 0], seg: [b.pick(10, 8, 6), b.pick(6, 4, 3)] });
  b.ell([0, 0.148, 0.108], [0.021, 0.038, 0.027], { ...skin, rot: [0.3, 0, 0], seg: [b.pick(8, 6, 5), b.pick(6, 4, 3)] });   // a broad nose
  // the beard: from the cheeks and chin down over the chest in shaggy locks, a moustache over a grim mouth
  b.ell([0, 0.078, 0.058], [0.08, 0.07, 0.06], { ...beardM, a: [0.65, 1], seg: [b.pick(10, 8, 6), b.pick(7, 5, 4)] });
  b.loft([[0.11, 0.08, 0.058, 0.055], [0.04, 0.094, 0.057, 0.07], [-0.04, 0.097, 0.047, 0.085], [-0.11, 0.087, 0.037, 0.094], [-0.16, 0.062, 0.027, 0.096], [-0.2, 0.026, 0.012, 0.094]], { ...beardM, sq: 2.6, seg: b.pick(12, 9, 6), a: [0.5, 1] });
  if (lo) return;
  for (const s of [-1, 1]) {
    b.ell([s * 0.03, 0.184, 0.094], [0.04, 0.019, 0.024], { ...skin, a: [0.85, 1], rot: [-0.2, 0, s * 0.45], seg: [b.pick(8, 6, 5), 4] });
    b.ell([s * 0.044, 0.15, 0.07], [0.028, 0.02, 0.026], { ...skin, seg: [6, 4] });                            // cheekbones
    b.ell([s * 0.086, 0.165, -0.012], [0.015, 0.034, 0.023], { ...skinDk, seg: [b.pick(6, 5, 4), 4] });       // the ears
  }
  b.ell([0, 0.205, 0.092], [0.012, 0.014, 0.012], { ...skinDk, seg: [5, 3] });                                   // the knot between the brows
  b.ell([0, 0.128, 0.12], [0.025, 0.017, 0.018], { ...skin, seg: [6, 4] });
  b.ell([0, 0.113, 0.106], [0.052, 0.014, 0.022], { ...beardM, a: [0.85, 1], rot: [0, 0, 0], seg: [6, 4] });
  // (the ends: locks of different lengths, hanging from the bottom of the beard and the sides of the jaw)
  const locks = b.level < 1 ? [[-0.07, -0.24], [-0.035, -0.31], [0.0, -0.27], [0.035, -0.34], [0.07, -0.25], [-0.088, -0.15], [0.09, -0.17], [0.015, -0.22]]
    : [[-0.06, -0.26], [0.0, -0.31], [0.06, -0.27], [-0.088, -0.15], [0.09, -0.16]];
  for (const [x, y] of locks) b.cone([x * 0.85, -0.05, 0.088], [x, y, 0.094 - Math.abs(x) * 0.2], 0.034, { ...beardM, a: [0.55, 1], seg: 5 });
  for (const s of [-1, 1]) b.cone([s * 0.058, 0.14, 0.065], [s * 0.078, 0.02, 0.06], 0.026, { ...beardM, seg: 5 });   // the sideburns
}
def('giant.heads', (b) => {
  const lo = b.level >= 2;
  for (const s of [-1, 1]) b.within(frame([s * 0.108, 0, 0.0], [0, s * 0.16, s * 0.07], 1.08), () => oneHead(b, lo));
}, true);

// ---------------------------------------------------------------- the pelvis (frame 2 cm above the hip joints): the fur kilt to the knees
// in shaggy panels, a thick belt, the round iron boss, and the house banner hanging down the front with the emblem on it
def('giant.pelvis', (b) => {
  const lo = b.level >= 2;
  b.loft([[0.12, 0.19, 0.14, 0.0], [0.0, 0.205, 0.15, 0.0], [-0.1, 0.19, 0.14, -0.01], [-0.16, 0.15, 0.11, -0.01]], { ...fur, sq: 2.3, a: [0.6, 0.9], seg: b.pick(14, 10, 7) });
  b.torus([0, 0.06, 0], 0.212, 0.03, { rot: [PI / 2, 0, 0], sc: [1, 0.76, 1], c: 0x4a3420, m: 'leather', p: PAT.leather, seg: b.pick(22, 14, 9) });   // the belt
  // the kilt: overlapping panels of fur, longer at the front and the back, with ragged tufts along the hems
  const panels = lo ? [[-0.95, 1.9, -0.4], [PI - 0.95, 1.9, -0.42], [0.85, 1.4, -0.34], [-2.25, 1.4, -0.34]]
    : [[-0.7, 0.85, -0.42], [0.05, 0.85, -0.39], [0.75, 0.8, -0.35], [1.45, 0.85, -0.33], [2.2, 0.85, -0.38], [2.95, 0.85, -0.42], [3.7, 0.8, -0.36], [4.45, 0.9, -0.33]];
  panels.forEach(([a0, len, hem], i) => {
    const o = i % 2 ? furLt : fur;
    b.lathe([[0.27 + (i % 2) * 0.012, hem], [0.25, hem + 0.08], [0.218, 0.04]], [0, 0, 0], { arc: [a0, len], sc: [1, 1, 0.82], ...o, w: [SKIRT + 0.85, SKIRT], a: [0.6, 1], seg: b.pick(6, 5, 4) });
    if (b.level < 1) {
      for (let k = 0; k < 3; k++) {
        const a = a0 + (len * (k + 0.5)) / 3, r = 0.27, sx = Math.sin(a), cz = Math.cos(a) * 0.82;
        b.cone([sx * r, hem + 0.05, cz * r], [sx * (r + 0.012), hem - 0.05 - (k % 2) * 0.03, cz * (r + 0.012)], 0.03, { ...o, w: [SKIRT + 0.95, SKIRT + 0.8], seg: 5 });
      }
    }
  });
  // the banner on the front of the kilt, the house's colour and emblem
  b.lathe([[0.283, -0.36], [0.262, -0.25], [0.232, 0.03]], [0, 0, 0], { arc: [-0.3, 0.6], sc: [1, 1, 0.84], ...team, p: PAT.emblem, uv: [0, -0.15, 0.17, 0.24], w: [SKIRT + 0.9, SKIRT], a: [0.75, 1], seg: b.pick(6, 4, 3) });
  // the iron boss on the belt
  b.place(new THREE.CylinderGeometry(0.09, 0.094, 0.03, b.pick(20, 14, 8)), [0, 0.06, 0.2], [PI / 2 - 0.12, 0, 0], 1, { c: K.iron, m: 'iron', a: [0.8, 1] });
  if (!lo) {
    b.torus([0, 0.06, 0.214], 0.088, 0.01, { rot: [-0.12, 0, 0], c: K.ironLt, m: 'iron', seg: b.pick(20, 14, 9) });
    b.ell([0, 0.06, 0.218], [0.032, 0.032, 0.018], { c: K.ironLt, m: 'iron', rot: [-0.12, 0, 0], seg: [8, 5] });
    if (b.level < 1) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; b.ell([Math.cos(a) * 0.064, 0.06 + Math.sin(a) * 0.064, 0.216 - Math.sin(a) * 0.008], [0.009, 0.009, 0.007], { c: K.ironLt, m: 'iron', seg: [5, 3] }); }
  }
}, true);

// ---------------------------------------------------------------- legs (hip frame, knee frame): thick bare thighs; the shins bound in rags
// tied with cord; huge bare feet. (Both legs share the shapes, so the toes are graded the same from either side.)
const THIGH = [[0.06, 0.105, 0.11, -0.01], [-0.04, 0.112, 0.118, 0.012], [-0.16, 0.104, 0.112, 0.022], [-0.28, 0.088, 0.096, 0.016], [-0.37, 0.073, 0.08, 0.008], [-0.42, 0.068, 0.072, 0.004]];
const CALF = [[0.02, 0.068, 0.07, 0.0], [-0.06, 0.074, 0.084, -0.016], [-0.15, 0.072, 0.082, -0.02], [-0.26, 0.058, 0.064, -0.01], [-0.36, 0.05, 0.054, 0.0], [-0.42, 0.05, 0.054, 0.0]];
def('giant.thigh', (b) => {
  b.loft(THIGH, { ...skin, a: [0.88, 0.97], seg: b.pick(14, 10, 7) });
  b.ell([0, 0.04, 0], [0.105, 0.07, 0.11], { ...skin, a: [0.95, 0.97] });
  if (b.level < 2) {
    b.ell([0, -0.42, 0.004], [0.066, 0.068, 0.068], { ...skin, a: [0.9, 0.9] });   // the knee
    b.ell([0, -0.4, 0.05], [0.042, 0.046, 0.028], { ...skin, a: [0.9, 1], seg: [6, 4] });
    b.ell([0.02, -0.25, 0.07], [0.06, 0.12, 0.05], { ...skin, a: [0.88, 1] });       // the quadriceps
  }
});
function foot(b) {
  const lo = b.level >= 2;
  b.ell([0, -0.43, -0.005], [0.058, 0.05, 0.06], { ...skin, a: [0.85, 0.9], seg: b.ellSeg(0.06) });   // the ankle
  b.loft([[-0.42, 0.055, 0.06, 0.0], [-0.45, 0.072, 0.1, 0.035], [-0.475, 0.082, 0.125, 0.05], [-0.495, 0.08, 0.13, 0.055]], { ...skin, sq: 2.4, a: [0.8, 1], seg: b.pick(12, 8, 6) });
  b.ell([0, -0.47, -0.05], [0.05, 0.035, 0.045], { ...skin, a: [0.8, 0.95], seg: [b.pick(8, 6, 4), 4] });   // the heel
  if (lo) { b.rbox([0, -0.48, 0.21], [0.15, 0.04, 0.06], { ...skin, e: 0.7 }); return; }
  // toes: the middle three a little bigger, nails at the tips
  const toes = [[-0.07, 0.02, 0.045], [-0.036, 0.024, 0.055], [0.0, 0.026, 0.06], [0.036, 0.024, 0.055], [0.07, 0.02, 0.045]];
  for (const [x, r, l] of toes) {
    b.ell([x, -0.478, 0.175 + l * 0.8], [r, r * 0.95, l * 0.8], { ...skin, a: [0.78, 1], seg: [b.pick(7, 5, 4), b.pick(5, 4, 3)] });
    if (b.level < 1) b.ell([x, -0.463, 0.175 + l * 1.4], [r * 0.62, r * 0.3, r * 0.45], { c: K.nail, m: 'bone', seg: [5, 3] });
  }
}
def('giant.shin', (b) => {
  b.ell([0, 0, 0.004], [0.066, 0.068, 0.068], { ...skin, a: [0.9, 0.9], seg: b.ellSeg(0.07) });
  b.loft(CALF.slice(0, 3), { ...skin, a: [0.88, 0.94], seg: b.pick(12, 9, 7) });
  // the rag wrapping, calf to ankle, with a ragged top and cords wound round it
  b.loft(grow(CALF.slice(2), 0.01), { ...rag, a: [0.75, 0.95], seg: b.pick(12, 9, 6) });
  if (b.level < 2) {
    b.loft([[-0.11, 0.08, 0.09, -0.02], [-0.155, 0.083, 0.093, -0.02]], { c: K.ragLt, m: 'wool', p: PAT.weave, seg: b.pick(12, 9, 6) });
    if (b.level < 1) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3; b.cone([Math.sin(a) * 0.082, -0.12, -0.02 + Math.cos(a) * 0.09], [Math.sin(a) * 0.085, -0.08 + (k % 2) * 0.02, -0.02 + Math.cos(a) * 0.093], 0.018, { c: K.ragLt, m: 'wool', seg: 4 }); }
    [-0.17, -0.25, -0.33, -0.4].forEach((y, k) => b.torus([0, y, -0.012], 0.07 - k * 0.004, 0.0075, { rot: [PI / 2 + (k % 2 ? 0.18 : -0.18), 0, 0], sc: [1, 1.1, 1], ...cord, sides: 4, seg: b.pick(14, 10, 8) }));
  }
  foot(b);
});

// ---------------------------------------------------------------- arms (shoulder frame, elbow frame): a huge deltoid, bulging biceps and
// triceps, forearms like hams bound in rags from the middle to the wrist, a fist
const UPPER = [[0.0, 0.09, 0.096, 0.0], [-0.08, 0.088, 0.096, 0.0], [-0.16, 0.08, 0.09, 0.01], [-0.25, 0.068, 0.074, 0.006], [-0.31, 0.06, 0.062, 0.0], [-0.34, 0.058, 0.06, 0.0]];
const FORE = [[0.02, 0.062, 0.062, 0.0], [-0.06, 0.07, 0.066, 0.006], [-0.14, 0.062, 0.058, 0.004], [-0.24, 0.05, 0.046, 0.0], [-0.29, 0.046, 0.043, 0.0]];
def('giant.arm', (b) => {
  b.ell([0, -0.035, 0], [0.118, 0.135, 0.122], { ...skin, a: [0.85, 1] });   // the deltoid
  b.loft(grow(UPPER, 0.008), { ...skin, a: [0.85, 0.97], seg: b.pick(12, 9, 7) });
  if (b.level < 2) {
    b.ell([0, -0.17, 0.045], [0.068, 0.1, 0.062], { ...skin, a: [0.85, 1] });    // the biceps
    b.ell([0, -0.14, -0.05], [0.07, 0.115, 0.056], { ...skin, a: [0.82, 1] });   // the triceps
    b.ell([0, -0.33, 0], [0.06, 0.062, 0.062], { ...skin, a: [0.88, 0.9] });     // the elbow
  }
});
function giantFist(b, o) {
  b.ell([0, -0.322, 0.006], [0.042, 0.058, 0.068], { ...o, a: [0.85, 1] });
  b.rod([0, -0.362, -0.06], [0, -0.362, 0.066], 0.044, 0.04, { ...o, a: [0.8, 1], seg: b.pick(8, 6, 5) });
  if (b.level < 2) b.ell([0, -0.338, 0.072], [0.03, 0.05, 0.028], { ...o, rot: [0.4, 0, 0], seg: [6, 4] });   // the thumb
  if (b.level < 2) for (let k = 0; k < 4; k++) b.ell([0, -0.37, -0.048 + k * 0.034], [0.04, 0.019, 0.017], { ...o, seg: [5, 3] });   // the knuckles
}
def('giant.fore', (b) => {
  if (b.level >= 3) {
    b.rod([0, 0.02, 0], [0, -0.27, 0], 0.066, 0.048, { ...rag, seg: 4 });
    b.rbox([0, -0.34, 0.004], [0.075, 0.12, 0.12], { ...skin, seg: [4, 2] });
    return;
  }
  b.loft(grow(FORE.slice(0, 3), 0.006), { ...skin, a: [0.85, 0.92], seg: b.pick(12, 9, 7) });
  b.ell([0, 0.0, 0], [0.06, 0.062, 0.062], { ...skin, a: [0.88, 0.9] });
  b.loft(grow(FORE.slice(2), 0.015), { ...rag, a: [0.75, 0.95], seg: b.pick(12, 9, 6) });
  if (b.level < 2) {
    b.loft([[-0.125, 0.082, 0.078, 0.004], [-0.15, 0.083, 0.079, 0.004]], { c: K.ragLt, m: 'wool', p: PAT.weave, seg: b.pick(12, 9, 6) });
    [-0.16, -0.205, -0.25].forEach((y, k) => b.torus([0, y, 0], 0.077 - k * 0.005, 0.0065, { rot: [PI / 2 + (k % 2 ? 0.2 : -0.2), 0, 0], ...cord, sides: 4, seg: b.pick(12, 9, 7) }));
  }
  giantFist(b, skin);
});

// ---------------------------------------------------------------- the hammer (weapon frame, at the fist: the head is down -y): a rough stone
// lashed to a stout, crooked haft with cord, the house's rag tied under the head
def('giant.hammer', (b) => {
  const lo = b.level >= 2;
  const woodM = { c: K.wood, m: 'wood', p: PAT.grain };
  b.sweep([[0, 0.3, 0], [0.008, 0.0, -0.005], [-0.01, -0.5, 0.008], [0, -1.12, 0]], 0.042, 0.054, { ...woodM, seg: b.pick(8, 6, 5), segs: b.pick(8, 5, 3) });
  // the stone: a heavy rough block across the haft, faceted
  const stone = { c: K.stone, m: 'bone', p: PAT.leather, flat: true };
  b.rbox([0, -1.12, 0.0], [0.28, 0.3, 0.54], { ...stone, e: 0.5, e2: 0.6, seg: lo ? [5, 3] : [7, 5], a: [0.75, 1] });
  if (!lo) {
    b.rbox([0.01, -1.1, 0.24], [0.25, 0.25, 0.14], { ...stone, c: K.stoneDk, e: 0.6, seg: [6, 4], rot: [0.1, 0.1, 0.05] });
    b.rbox([-0.01, -1.14, -0.24], [0.24, 0.24, 0.14], { ...stone, c: K.stoneDk, e: 0.6, seg: [6, 4], rot: [-0.1, -0.15, 0] });
    // the lashing: cord wound round the stone and the haft above it
    b.torus([0, -1.12, 0], 0.155, 0.013, { rot: [0, 0, 0], sc: [1, 1.0, 0.95], ...cord, sides: 4, seg: b.pick(14, 10, 8) });
    b.torus([0, -1.12, 0.07], 0.155, 0.013, { rot: [0, 0, 0], ...cord, sides: 4, seg: b.pick(14, 10, 8) });
    for (let k = 0; k < 4; k++) b.lathe([[0.058, -0.86 - k * 0.04], [0.06, -0.84 - k * 0.04], [0.058, -0.82 - k * 0.04]], [0, 0, 0], { ...cord, seg: b.pick(8, 6, 5) });
    // the grip: wound with leather where the fist holds it, and a knob at the butt
    b.lathe([[0.05, -0.12], [0.054, -0.08], [0.054, 0.1], [0.05, 0.14]], [0, 0, 0], { c: 0x3a2a1a, m: 'leather', p: PAT.leather, seg: b.pick(8, 6, 5) });
    b.ell([0, 0.31, 0], [0.055, 0.04, 0.055], { ...woodM, seg: [7, 4] });
  }
  // the house's rag, bound round the haft under the head, its ends hanging loose
  b.lathe([[0.062, -0.8], [0.066, -0.74], [0.062, -0.68]], [0, 0, 0], { ...team, seg: b.pick(8, 6, 4) });
  if (!lo) for (const s of [-1, 1]) b.sheet([s * 0.03, -0.66, 0.068], 0.06, 0.24, 1, 3, { ...team, rot: [0, s * 0.3, s * 0.12], w: [0.95, 0.15], dz: (x, y) => 0.02 * Math.sin(y * 20) });
}, true);

// ---------------------------------------------------------------- the rig
const SKIN = [0x8c7352, 0x7e6e4c, 0x957656, 0x86704a];   // weathered, earthy: brown to olive
const BEARD = [0x6e4a2c, 0x7a5432, 0x5c3e26, 0x84603a];
const FACE = [1, 5, 1, 6];   // (the scowling faces of the atlas; 6 has dark war paint)
const _col = new THREE.Color();
function setColor(arr, i, hex) { _col.set(hex); arr[i] = _col.r; arr[i + 1] = _col.g; arr[i + 2] = _col.b; }
const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const off = () => ({ node: new THREE.Group(), shape: null, on: false });   // (the plumes and kit of a soldier: a giant neither trains nor ranks up)

// The giant's rig, joint for joint the same as a soldier's (see buildSoldier). `cloth` is the house colour.
export function buildGiant(type, teamId, variant, cloth, desc) {
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  body.scale.setScalar(GIANT_SCALE);
  const pelvis = joint(body, 0, 0.93, 0);
  const hipL = joint(pelvis, 0.112, -0.03, 0), hipR = joint(pelvis, -0.112, -0.03, 0);
  const kneeL = joint(hipL, 0, -0.42, 0), kneeR = joint(hipR, 0, -0.42, 0);
  const torso = joint(pelvis, 0, 0.1, 0);
  const head = joint(torso, 0, 0.43, 0.055);
  const shL = joint(torso, 0.262, 0.365, -0.012), shR = joint(torso, -0.262, 0.365, -0.012);
  const elL = joint(shL, 0, -0.33, 0), elR = joint(shR, 0, -0.33, 0);
  const weapon = joint(elR, 0, -0.362, 0.004);
  weapon.rotation.x = GIANT_TILT;
  const parts = [];
  const add = (node, name) => { const p = { node, shape: getShape(name), on: true }; parts.push(p); return p; };
  add(pelvis, 'giant.pelvis'); add(torso, 'giant.chest'); add(head, 'giant.heads');
  add(hipL, 'giant.thigh'); add(hipR, 'giant.thigh'); add(kneeL, 'giant.shin'); add(kneeR, 'giant.shin');
  add(shL, 'giant.arm'); add(shR, 'giant.arm'); add(elL, 'giant.fore'); add(elR, 'giant.fore');
  const weaponPart = add(weapon, 'giant.hammer');
  const v = variant % 4;
  const m = {
    kind: 'soldier', type, team: teamId, variant, desc: { ...desc, shield: null }, raider: false, root, body, pelvis, torso, head, hipL, hipR, kneeL, kneeR,
    shL, shR, elL, elR, weapon, cape: null, weaponTilt: GIANT_TILT, weaponRoll: 0, ranged: false, lance: false, mounted: false, parts, kit: off(), plumeC: off(), plumeG: off(),
    weaponPart, bowPart: null, kitArms: [], kitShield: null, tier: 0, rank: 1, inst: new Float32Array(16), headYaw: 0, hero: null, giant: true, farKey: type,
  };
  setColor(m.inst, 0, cloth);
  setColor(m.inst, 4, SKIN[v]);
  setColor(m.inst, 8, BEARD[(variant + 1) % 4]);
  m.baseBits = 0;
  m.inst[3] = 0;
  m.inst[7] = (teamId > 4 ? 0 : teamId) + 8 * FACE[v];
  m.inst[12] = (variant * 0.37 + teamId * 0.11) % 1;
  root.userData.rig = m;
  return m;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// The hammer arm through a blow, [shoulder x, elbow x, shoulder z]: the soldier's keyframes on the giant's own clock, so the head
// lands when the blow does (units.js strikes at 0.32): up and back, down, a moment on the ground, back to rest.
const G_WIND = { over: [-2.9, -1.2, 0], right: [-1.2, -1.3, -1.25] }, G_END = { over: [-0.55, -0.15, 0], right: [-0.8, -0.2, 0.7] };
const _from = [0, 0, 0];
function giantSwing(m, t, over, armSwing) {
  const W = over ? G_WIND.over : G_WIND.right, E = over ? G_END.over : G_END.right;
  _from[0] = -0.3 + armSwing * 0.4; _from[1] = -0.55; _from[2] = -0.1;
  let a, b, k;
  if (t < 0.2) { a = _from; b = W; k = t / 0.2; }
  else if (t < 0.3) { a = W; b = E; k = (t - 0.2) / 0.1; }
  else if (t < 0.42) { a = E; b = E; k = 0; }
  else { a = E; b = _from; k = Math.min(1, (t - 0.42) / 0.2); }
  k = k * k * (3 - 2 * k);
  m.shR.rotation.x = a[0] + (b[0] - a[0]) * k; m.elR.rotation.x = a[1] + (b[1] - a[1]) * k; m.shR.rotation.z = a[2] + (b[2] - a[2]) * k;
}

// On top of the soldier's pose (poseSoldier has set every joint): the giant's bulk and weight. The body's offsets are a man's, so they
// are scaled up; he stoops, the heads come up to look ahead, the arms hang wide of the lats and forward; he rolls from foot to foot as
// he walks; a blow is brought down with the whole body, the free arm thrown out for balance.
export function poseGiant(m, st) {
  const sp = st.speed || 0, walking = !!st.moving, stride = walking ? Math.min(1, sp / 3.4) : 0;
  const ph = st.phase || 0, s1 = Math.sin(ph), idle = st.idle || 0;
  m.body.position.multiplyScalar(GIANT_SCALE);
  const t = st.swingT, swinging = t >= 0;
  const att = swinging ? Math.sin(Math.min(1, t / 0.62) * PI) : 0;
  const strike = !swinging || t < 0.2 ? 0 : t < 0.32 ? clamp01((t - 0.2) / 0.12) : 1 - clamp01((t - 0.44) / 0.14);   // (the moment the head comes down)
  const over = st.attackDir !== 'right';
  if (swinging) giantSwing(m, t, over, walking ? Math.sin(ph) * Math.min(0.55, sp * 0.1 + 0.05) : 0);
  const hunch = 0.34 + 0.04 * Math.sin(idle * 1.1) * (1 - stride);
  const lean = hunch + (over ? 0.15 : 0.1) * strike - 0.12 * att * (1 - strike);
  m.torso.rotation.x += lean;
  m.pelvis.rotation.x += 0.08;
  m.head.rotation.x -= lean * 0.85 + 0.06;
  // the knees stay soft under the weight; a step plants the foot flat (the hips swing a little less, the knee bends more)
  m.hipL.rotation.x -= 0.14; m.hipR.rotation.x -= 0.14;
  m.kneeL.rotation.x += 0.2; m.kneeR.rotation.x += 0.2;
  m.body.position.y += 0.05 * GIANT_SCALE;   // (the soft knees and the tilt of the hips would sink the feet: the soles stay on the ground)
  // the roll of the walk: the weight goes over each foot in turn
  m.body.position.x += 0.035 * GIANT_SCALE * stride * s1;
  m.pelvis.rotation.z += 0.05 * stride * s1;
  m.torso.rotation.z -= 0.07 * stride * s1;
  // arms: wide of the lats, forward of the stoop
  m.shL.rotation.z += 0.2; m.shR.rotation.z -= 0.2;
  m.shL.rotation.x -= lean * 0.6; m.elL.rotation.x -= 0.15;
  // the hammer arm: the haft hangs by his feet at rest (and the swing starts and ends there, so nothing jumps)
  const rest = 1 - att;
  m.shR.rotation.x -= lean * 0.5 * rest; m.elR.rotation.x -= 0.25 * rest; m.weapon.rotation.x -= 0.25 * rest;
  if (swinging) {
    // the free arm out for balance as the hammer comes over; the hammer held square to the blow, its head stopped at the ground
    m.shL.rotation.x += (-0.5 - m.shL.rotation.x) * att * 0.6;
    m.shL.rotation.z += 0.55 * att;
    m.elL.rotation.x -= 0.4 * att;
    m.weapon.rotation.x += (over ? -0.75 : -0.55) * att + (over ? -0.35 : 0.25) * strike;
  }
  // the hurt flinch is bigger: the heads thrown back
  if (st.hurt > 0) m.head.rotation.x -= 0.2 * st.hurt;
}

// A dead giant: the soldier's fall, scaled up (the body's offsets lift him onto the ground, not into it). The hammer slips out of his
// grip and settles flat, whichever way he fell (turned in the fist until the haft lies level).
const _w = new THREE.Matrix4(), _inv = new THREE.Matrix4();
export function poseGiantDead(m, t, kind) {
  m.body.position.multiplyScalar(GIANT_SCALE);
  m.shL.rotation.z += 0.2; m.shR.rotation.z -= 0.2;
  if (kind === 1) {
    // face down: the arms fall along his sides (a man's reach forward would put a giant's fists deep in the ground), the chest and
    // beards lift him a little
    const e1 = clamp01(t / 0.3), e2 = clamp01((t - 0.18) / 0.6), k = e2 * e2 * (3 - 2 * e2);
    m.shL.rotation.x += 1.3 * k; m.shR.rotation.x += 1.45 * k;
    m.body.position.y += 0.05 * GIANT_SCALE * k * e1;
  }
  const k = clamp01((t - 0.25) / 0.9), w = m.weapon;
  if (k <= 0) return;
  // (in the rig's own frame: the root only turns about y, so its up is the world's)
  m.elR.updateWorldMatrix(true, false);
  _w.multiplyMatrices(_inv.copy(m.root.matrixWorld).invert(), m.elR.matrixWorld);
  const e = _w.elements, a = e[5], b = e[9];   // (the up of the elbow frame's y axis, and of its z axis)
  // the haft points along (0, -cos x, -sin x) in the elbow frame: level when a cos x + b sin x = 0; of the two, the one nearer the grip
  let x = Math.atan2(-a, b);
  const cur = w.rotation.x;
  if (Math.cos(x - cur) < 0) x += PI;
  const dx = Math.atan2(Math.sin(x - cur), Math.cos(x - cur));
  w.rotation.x = cur + dx * k * k * (3 - 2 * k);
}
