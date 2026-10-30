// The catalogue of character parts. A shape is built once per detail level (0 richest .. 2 plainest, 3 the baked far-away model) into a
// geometry shared by every soldier that wears it; colours that differ between soldiers (house cloth, skin, hair, a horse's coat) are
// colour SLOTS filled per instance by the shader, so a shape does not depend on the team. Every shape is modelled in the frame of the
// joint it hangs from (see models.js): +y up, +z forward, the weapon arm at -x, the shield arm at +x. `open` shapes carry thin cloth or
// hollow shells and are drawn double-sided. Gates (see modelkit.js) used here: 1 steel pauldrons (tier 1-3), 2 cloak (tier 2+),
// 3 gold gorget and band (tier 3+), 4 gold pauldrons and helm wings (tier 4+), 5 long cloak and gilded plate (tier 5), 6 beard,
// 7 8 9 hair cuts, 12 gilded shield rim (tier 3+).
import * as THREE from 'three';
import { Builder, PAT, SKIRT } from './modelkit.js';

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
  steel: 0xc9ced6, iron: 0x5a5c62, ironDk: 0x2e2f33, gold: 0xd8a83a, brass: 0xb8862a, leather: 0x5a3a22, leatherLt: 0x7a5330, leatherDk: 0x3a2617,
  boot: 0x3a2a1c, cuff: 0x4d3826, pants: 0x4c4237, trim: 0xe7d8a8, wood: 0x6b4a2c, woodDk: 0x4a3420, bone: 0xe8dcc0, mail: 0x7d828a, gamb: 0x9d8862,
  fur: 0x5a4634, furLt: 0x7a6450, linen: 0xd8d0b8, hoof: 0x2a2420, dark: 0x0a0a0c, red: 0xc0392b, quiver: 0x6a4a2a,
};
const TAU = Math.PI * 2, PI = Math.PI;
const steel = { c: K.steel, m: 'steel' }, plate = { c: K.steel, m: 'plate' }, iron = { c: K.iron, m: 'iron' }, gold = { c: K.gold, m: 'gold' };
const leather = { c: K.leather, m: 'leather', p: PAT.leather }, wood = { c: K.wood, m: 'wood', p: PAT.grain }, skin = { s: 'skin', m: 'skin', p: PAT.skin };
const cloth = { s: 'cloth', m: 'cloth', p: PAT.weave }, clothDk = { s: 'clothDark', m: 'cloth', p: PAT.weave };
const mailM = { c: K.mail, m: 'mail', p: PAT.mail };

// ---------------------------------------------------------------- the body plan (see models.js for the joints)
// A man 1.8 m tall, about 7.5 heads: hip joints at 0.95, knees at 0.51, ankles at 0.08, the waist at 1.07, shoulder joints at 1.43 and
// 0.39 apart, elbows at 1.12, wrists at 0.87 and the fist at mid-thigh, the base of the neck at 1.5, the chin at 1.55, the eyes at 1.68.
// Limbs and the trunk are lofts of rings (a superellipse each), so they swell where the muscles are (calf, thigh, biceps, forearm, chest)
// and taper at the joints; a ball at each joint keeps a bent knee or elbow closed.

// ---------------------------------------------------------------- legs (hip frame, knee frame)
const LEG = { cloth: { c: K.pants, m: 'cloth', p: PAT.weave }, mail: mailM, plate, skin };
const THIGH = [[0.05, 0.08, 0.085, -0.01], [-0.04, 0.084, 0.088, 0.004], [-0.16, 0.074, 0.08, 0.014], [-0.3, 0.06, 0.066, 0.01], [-0.4, 0.05, 0.054, 0.006], [-0.45, 0.048, 0.05, 0.004]];
const CALF = [[0.03, 0.048, 0.05, 0.0], [-0.05, 0.05, 0.058, -0.01], [-0.13, 0.05, 0.06, -0.016], [-0.24, 0.04, 0.046, -0.008], [-0.34, 0.032, 0.035, 0.0], [-0.43, 0.03, 0.033, 0.0]];
const grow = (rings, d, dz = d) => rings.map(([y, rx, rz, z]) => [y, rx + d, rz + dz, z]);
function boot(b, fur) {
  const bc = fur ? { c: K.fur, m: 'fur', p: PAT.fur } : { c: K.boot, m: 'leather', p: PAT.leather };
  // the shaft to below the calf, the ankle, the foot (heel behind the ankle, toes well forward) and its sole
  b.loft([[-0.14, 0.05, 0.056, -0.012], [-0.24, 0.046, 0.052, -0.008], [-0.34, 0.039, 0.042, 0.0], [-0.43, 0.04, 0.044, 0.0], [-0.47, 0.044, 0.05, 0.01]], { ...bc, a: [0.78, 1], seg: b.pick(12, 8, 6) });
  b.loft([[-0.425, 0.04, 0.05, 0.02], [-0.45, 0.047, 0.085, 0.045], [-0.48, 0.05, 0.13, 0.07], [-0.505, 0.05, 0.135, 0.075]], { ...bc, a: [0.8, 1], seg: b.pick(12, 8, 6), sq: 2.6 });
  if (b.level < 2) {
    b.ell([0, -0.49, 0.18], [0.045, 0.026, 0.035], { ...bc, seg: [b.pick(8, 6, 4), b.pick(5, 4, 3)] });
    b.loft([[-0.125, 0.056, 0.062, -0.012], [-0.165, 0.058, 0.064, -0.012]], { c: K.cuff, m: 'leather', seg: b.pick(12, 8, 6) });
    b.rbox([0, -0.506, 0.075], [0.104, 0.014, 0.285], { c: K.ironDk, m: 'rubber', e: 0.2 });
  }
}
for (const st of Object.keys(LEG)) {
  def('thigh.' + st, (b) => {
    // (the joints are balls a little inside the limb, so a straight leg shows no knob and a bent one no gap; they are shaded flat, like
    // the limb where they sit)
    const o = { ...LEG[st], a: [0.92, 0.97] }, j = { ...o, a: [0.92, 0.92] }, pad = st === 'cloth' ? 0.006 : st === 'mail' ? 0.004 : 0;
    b.loft(grow(THIGH, pad), { ...o, seg: b.pick(12, 8, 6) });
    b.ell([0, 0.04, -0.005], [0.08, 0.05, 0.085], { ...o, a: [0.97, 0.97] });
    if (b.level < 2) b.ell([0, -0.44, 0.004], [0.045 + pad, 0.048, 0.048 + pad], j);   // the knee
    if (b.level < 2 && st !== 'plate') b.ell([0, -0.425, 0.03 + pad], [0.03, 0.034, 0.02], { ...j, seg: [6, 4] });   // the kneecap
    if (st === 'plate' && b.level < 2) {
      // cuisse over the front of the thigh and a poleyn (knee cop) with its wing
      b.loft(grow(THIGH.slice(1, 5), 0.014), { ...plate, arc: [-1.35, 2.7], a: [0.85, 1], seg: b.pick(10, 8, 6) });
      b.ell([0, -0.44, 0.03], [0.058, 0.058, 0.045], { ...plate, a: [1, 1] });
      b.ell([0, -0.445, 0.05], [0.032, 0.05, 0.03], { ...plate, a: [1, 1], seg: [6, 5] });
    }
  });
  def('shin.' + st, (b) => {
    const o = { ...LEG[st], a: [0.88, 0.92] }, pad = st === 'cloth' ? 0.006 : st === 'mail' ? 0.004 : 0;
    b.ell([0, 0, 0.004], [0.044 + pad, 0.046, 0.046 + pad], { ...o, a: [0.92, 0.92], seg: b.ellSeg(0.05) });
    b.loft(pad ? grow(CALF.slice(0, 3), pad) : CALF.slice(0, 4), { ...o, seg: b.pick(12, 8, 6) });
    if (st === 'plate' && b.level < 2) b.loft(grow(CALF.slice(0, 4), 0.013), { ...plate, arc: [-1.5, 3.0], a: [0.9, 1], seg: b.pick(10, 8, 6) });   // the greave
    boot(b, st === 'skin');
  });
}

// ---------------------------------------------------------------- arms (shoulder frame, elbow frame)
const ARM = { cloth: { c: K.gamb, m: 'cloth', p: PAT.quilt }, mail: mailM, plate, skin, leather: { c: K.leather, m: 'leather', p: PAT.leather } };
const UPPER = [[0.0, 0.05, 0.054, 0.0], [-0.08, 0.05, 0.054, 0.0], [-0.16, 0.044, 0.052, 0.008], [-0.25, 0.04, 0.044, 0.004], [-0.32, 0.037, 0.04, 0.0]];
const FOREARM = [[0.02, 0.04, 0.041, 0.0], [-0.06, 0.044, 0.043, 0.004], [-0.15, 0.037, 0.035, 0.002], [-0.235, 0.028, 0.026, 0.0], [-0.26, 0.027, 0.025, 0.0]];
for (const st of Object.keys(ARM)) {
  def('arm.' + st, (b) => {
    const o = { ...ARM[st], a: [0.9, 1] };
    const pad = st === 'cloth' || st === 'leather' ? 0.008 : st === 'mail' ? 0.004 : 0;
    b.ell([0, -0.035, 0.0], [0.056 + pad, 0.085, 0.062 + pad], { ...o, a: [0.9, 1] });   // the deltoid, which rounds the shoulder into the trunk
    b.loft(grow(UPPER, pad), { ...o, seg: b.pick(12, 8, 6) });
    if (b.level < 2) b.ell([0, -0.31, 0], [0.034 + pad, 0.036, 0.036 + pad], { ...o, a: [0.9, 0.9] });       // the elbow
    if (st === 'plate') {
      if (b.level < 2) {
        b.ell([0, 0.02, 0], [0.09, 0.062, 0.088], { ...plate, a: [0.85, 1] });
        b.ell([0, -0.04, 0], [0.084, 0.05, 0.082], { ...plate, a: [0.8, 0.95] });
        b.loft(grow(UPPER.slice(2), 0.01), { ...plate, a: [0.85, 1], seg: b.pick(10, 8, 6) });
      } else b.ell([0, 0.01, 0], [0.088, 0.072, 0.086], plate);
    }
  });
}
// the pauldrons of a trained soldier (gates 1 steel, 4 gold)
def('kit.arm', (b) => {
  b.ell([0, 0.025, 0], [0.09, 0.062, 0.088], { ...steel, g: 1, a: [0.8, 1] });
  b.ell([0, 0.03, 0], [0.096, 0.066, 0.094], { ...gold, g: 4 });
});
// A fist (the hands always hold something: a weapon, a shield's grip, a bow, a rope): the back of the hand, the fingers rolled round
// the grip, the thumb over them. Shared by both arms, so it is the same seen from either side.
function fist(b, o) {
  b.rbox([0, -0.284, 0.004], [0.044, 0.07, 0.08], { ...o, e: 0.55, a: [0.9, 1] });
  b.rod([0, -0.318, -0.038], [0, -0.318, 0.042], 0.029, 0.026, { ...o, a: [0.85, 1], seg: b.pick(8, 6, 5) });
  if (b.level < 2) b.ell([0, -0.296, 0.046], [0.02, 0.032, 0.018], { ...o, rot: [0.4, 0, 0], seg: [6, 4] });
  if (b.level < 1) for (let k = 0; k < 4; k++) b.ell([0, -0.302, -0.028 + k * 0.022], [0.026, 0.012, 0.011], { ...o, seg: [5, 3] });   // the knuckles
}
const FORE = {
  cloth: { arm: { c: K.gamb, m: 'cloth', p: PAT.quilt }, hand: skin, bracer: true },
  mail: { arm: mailM, hand: leather },
  plate: { arm: plate, hand: { ...plate } },
  skin: { arm: skin, hand: skin, bracer: true },
};
for (const st of Object.keys(FORE)) {
  def('fore.' + st, (b) => {
    const f = FORE[st];
    if (b.level >= 3) {   // (far away: a tapered forearm and a fist, so the weapon still has a hand to hold it)
      b.rod([0, 0.02, 0], [0, -0.25, 0], 0.04, 0.028, { ...f.arm, seg: 4 });
      b.rbox([0, -0.3, 0.004], [0.046, 0.09, 0.08], { ...f.hand, seg: [4, 2] });
      return;
    }
    const pad = st === 'cloth' ? 0.007 : st === 'mail' ? 0.004 : 0;
    b.loft(grow(FOREARM, pad), { ...f.arm, a: [0.88, 0.9], seg: b.pick(12, 8, 6) });
    b.ell([0, 0.0, 0], [0.034 + pad, 0.036, 0.036 + pad], { ...f.arm, a: [0.9, 0.9] });   // (the elbow, again: it closes a bent arm)
    if (b.level < 2) {
      if (st === 'plate') {
        b.ell([0, 0.0, 0.02], [0.05, 0.05, 0.05], { ...plate, a: [1, 1] });   // the couter
        b.lathe([[0.034, -0.2], [0.046, -0.265], [0.05, -0.27]], [0, 0, 0], { ...plate, sc: [1, 1, 1.05], seg: b.pick(12, 8, 6) });   // the gauntlet's cuff
      } else if (f.bracer) b.loft(grow(FOREARM.slice(2, 4), 0.008), { ...leather, a: [0.9, 1], seg: b.pick(10, 8, 6) });
      else b.lathe([[0.032, -0.19], [0.042, -0.26], [0.045, -0.265]], [0, 0, 0], { ...leather, seg: b.pick(10, 8, 6) });   // a glove's cuff
    }
    fist(b, { ...f.hand });
  });
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
function belt(b, extras) {
  b.lathe([[0.164, 0.02], [0.172, 0.02], [0.172, 0.085], [0.164, 0.085]], [0, 0, 0], { sc: [1, 1, 0.72], ...leather, seg: b.pick(20, 14, 9) });
  b.rbox([0, 0.052, 0.124], [0.052, 0.05, 0.014], { ...gold, sharp: true });
  if (extras && b.level < 2) {
    b.rbox([0.165, 0.0, 0.05], [0.07, 0.1, 0.055], { ...leather, sharp: true });
    b.rbox([-0.15, 0.005, 0.085], [0.06, 0.08, 0.05], { ...leather, sharp: true });
  }
}
// cloth hanging from the belt, front and back, swaying; the sides stay open
function tabardSkirt(b, hem, w) {
  const prof = [[0.252, hem], [0.2, 0.06]];
  for (const arc of [[-0.62, 1.24], [PI - 0.62, 1.24]]) {
    b.lathe(prof, [0, 0, 0], { arc, sc: [1, 1, 0.78], ...cloth, w: [SKIRT + w, SKIRT], a: [0.8, 1], seg: b.pick(8, 6, 4) });
    if (b.level < 2) b.lathe([[0.256, hem], [0.25, hem + 0.04]], [0, 0, 0], { arc, sc: [1, 1, 0.78], c: K.trim, m: 'cloth', w: [SKIRT + w, SKIRT + w * 0.9], seg: b.pick(8, 6, 4) });
  }
}
function scabbard(b) {
  b.rod([0.17, -0.03, 0.0], [0.21, -0.43, -0.09], 0.024, 0.02, { ...leather, a: [0.85, 1], seg: 6 });
  b.rod([0.205, -0.4, -0.085], [0.212, -0.46, -0.1], 0.022, 0.026, { ...iron, seg: 5 });
}
// the hips and seat: wide at the hip bones, the buttocks behind, closing between the legs
const hips = (b, o) => {
  b.loft([[0.14, 0.148, 0.1, 0.0], [0.05, 0.16, 0.108, 0.0], [-0.03, 0.17, 0.114, -0.004], [-0.09, 0.162, 0.108, -0.01], [-0.13, 0.13, 0.088, -0.01]], { a: [0.7, 1], sq: 2.4, seg: b.pick(14, 10, 7), ...o });
  b.ell([0, -0.13, -0.01], [0.13, 0.05, 0.088], { a: [0.6, 0.8], ...o });
  if (b.level < 2) for (const s of [-1, 1]) b.ell([s * 0.068, -0.07, -0.05], [0.08, 0.085, 0.07], { a: [0.7, 0.95], ...o });
};

def('pelvis.mail', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  b.lathe([[0.255, -0.3], [0.2, 0.05]], [0, 0, 0], { sc: [1, 1, 0.78], ...mailM, w: SKIRT, a: [0.65, 1], seg: b.pick(20, 12, 8) });
  tabardSkirt(b, -0.34, 0.9);
  if (b.level < 1) scabbard(b);
}, true);
def('pelvis.plate', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  const ys = b.level < 2 ? [0.0, -0.09, -0.18] : [-0.05];
  ys.forEach((y, i) => b.lathe([[0.215 + i * 0.016, y - 0.1], [0.19 + i * 0.012, y + 0.05]], [0, 0, 0], { sc: [1, 1, 0.8], ...plate, w: SKIRT, a: [0.7, 1], seg: b.pick(20, 12, 8) }));
  if (b.level < 2) for (const sx of [-1, 1]) b.rbox([sx * 0.085, -0.17, 0.155], [0.14, 0.22, 0.04], { ...plate, w: SKIRT, e: 0.3, rot: [0.12, 0, sx * 0.08] });
  tabardSkirt(b, -0.38, 0.9);
  if (b.level < 1) scabbard(b);
}, true);
def('pelvis.gambeson', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  b.lathe([[0.24, -0.24], [0.2, 0.05]], [0, 0, 0], { sc: [1, 1, 0.78], c: K.gamb, m: 'cloth', p: PAT.quilt, w: SKIRT, a: [0.7, 1], seg: b.pick(18, 12, 8) });
  if (b.level < 2) b.rod([-0.13, 0.0, 0.1], [-0.15, -0.14, 0.12], 0.015, 0.012, { c: K.steel, m: 'steel' });
}, true);
def('pelvis.leather', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  b.lathe([[0.235, -0.4], [0.2, 0.06]], [0, 0, 0], { arc: [-0.8, 1.6], sc: [1, 1, 0.78], c: K.leatherLt, m: 'leather', p: PAT.leather, w: SKIRT, a: [0.7, 1], seg: b.pick(10, 8, 5) });
  if (b.level < 2) {
    b.rod([0.17, 0.0, 0.05], [0.2, -0.34, 0.05], 0.022, 0.022, { ...wood });
    b.rbox([0.205, -0.38, 0.05], [0.12, 0.07, 0.07], { ...iron, e: 0.3 });
  }
}, true);
def('pelvis.fur', (b) => {
  hips(b, { c: K.fur, m: 'fur', p: PAT.fur });
  b.torus([0, 0.05, 0], 0.18, 0.022, { rot: [PI / 2, 0, 0], sc: [1, 0.72, 1], c: K.leatherLt, m: 'leather', seg: b.pick(18, 12, 8) });
  for (const arc of [[-0.8, 1.6], [PI - 0.8, 1.6]]) b.lathe([[0.25, -0.34], [0.2, 0.06]], [0, 0, 0], { arc, sc: [1, 1, 0.8], c: K.furLt, m: 'fur', p: PAT.fur, w: [SKIRT + 0.8, SKIRT], a: [0.7, 1], seg: b.pick(8, 6, 4) });
}, true);

// the surcoat over a torso: front and back panels, the front carrying the house emblem
function tabardTop(b, top, bottom) {
  const rings = over(bottom, top, 0.012);
  const o = { sq: SQ, seg: b.pick(10, 8, 5) };
  b.loft(rings, { ...o, arc: [-0.7, 1.4], ...cloth, p: PAT.emblem, uv: [0, 0.2, 0.3, 0.3], a: [0.85, 1] });
  b.loft(rings, { ...o, arc: [PI - 0.7, 1.4], ...cloth, a: [0.85, 1] });
  if (b.level < 2) b.loft(over(top - 0.03, top, 0.014), { ...o, arc: [-0.72, 1.44], c: K.trim, m: 'cloth' });
}
const trunk = (b, o) => b.loft(TRUNK, { sq: SQ, seg: b.pick(20, 14, 9), ...o });
// a high collar round the base of the neck (a scarf, the top of a gambeson, a gorget)
const neckband = (b, o, k = 1) => b.lathe([[0.1 * k, 0.4], [0.105 * k, 0.43], [0.072 * k, 0.48]], [0, 0, -0.012], { sc: [1, 1, 0.85], ...o });

def('chest.mail', (b) => {
  trunk(b, { ...mailM, a: [0.75, 1] });
  tabardTop(b, 0.36, -0.03);
  if (b.level < 2) neckband(b, mailM);
}, true);
def('chest.plate', (b) => {
  trunk(b, { c: K.ironDk, m: 'iron', a: [0.7, 1] });
  // breastplate and backplate with a ridge down the middle, a gorget at the neck
  b.loft(over(-0.05, 0.37, 0.022, 0.026), { sq: SQ, arc: [-1.2, 2.4], ...plate, a: [0.85, 1], seg: b.pick(14, 10, 6) });
  b.loft(over(-0.05, 0.4, 0.02), { sq: SQ, arc: [PI - 1.05, 2.1], ...plate, a: [0.85, 1], seg: b.pick(12, 8, 5) });
  if (b.level < 2) {
    b.rbox([0, 0.19, 0.146], [0.026, 0.28, 0.024], { ...plate, e: 0.4, rot: [0.06, 0, 0] });
    b.lathe([[0.122, 0.37], [0.124, 0.42], [0.078, 0.48]], [0, 0, -0.012], { sc: [1, 1, 0.86], ...plate });
  }
  tabardTop(b, 0.3, -0.03);
}, true);
def('chest.gambeson', (b) => {
  trunk(b, { c: K.gamb, m: 'cloth', p: PAT.quilt, a: [0.78, 1] });
  if (b.level < 2) {
    neckband(b, clothDk, 1.08);            // a scarf
    b.sweep([[0.13, 0.36, 0.085], [0.05, 0.25, 0.13], [-0.04, 0.12, 0.124], [-0.14, 0.0, 0.1]], 0.016, 0.016, { ...leather });
    b.rbox([0.165, -0.0, 0.04], [0.06, 0.08, 0.05], { ...leather, e: 0.35 });
  }
}, true);
def('chest.leather', (b) => {
  trunk(b, { c: K.leather, m: 'leather', p: PAT.leather, a: [0.78, 1] });
  if (b.level < 2) {
    b.sweep([[0.13, 0.36, 0.085], [0.05, 0.25, 0.13], [-0.04, 0.12, 0.124], [-0.14, 0.0, 0.1]], 0.016, 0.016, { c: K.leatherDk, m: 'leather' });
    neckband(b, clothDk, 1.08);
  }
  b.loft(over(-0.04, 0.3, 0.008), { sq: SQ, arc: [-0.72, 1.44], c: K.linen, m: 'cloth', p: PAT.weave, a: [0.8, 1], seg: b.pick(8, 6, 4) });   // an apron bib
}, true);
def('chest.fur', (b) => {
  // a giant: bare skin, a heavy chest, a fur mantle, the house sash
  trunk(b, { ...skin, a: [0.72, 1] });
  for (const sx of [-1, 1]) b.ell([sx * 0.08, 0.27, 0.075], [0.085, 0.07, 0.055], { ...skin, a: [0.8, 1], rot: [0, 0, sx * 0.15] });   // the pectorals
  if (b.level < 2) {
    b.ell([0, 0.11, 0.075], [0.085, 0.11, 0.04], { ...skin, a: [0.85, 1] });   // the belly
    for (const sx of [-1, 1]) b.ell([sx * 0.11, 0.33, -0.06], [0.08, 0.08, 0.06], { ...skin, a: [0.8, 1] });   // the shoulder blades
  }
  b.loft([[0.29, 0.188, 0.128, 0.0], [0.35, 0.212, 0.138, -0.004], [0.405, 0.198, 0.122, -0.01], [0.445, 0.13, 0.092, -0.013], [0.48, 0.068, 0.064, -0.014]], { c: K.furLt, m: 'fur', p: PAT.fur, a: [0.7, 1], seg: b.pick(14, 10, 7) });
  b.sweep([[-0.2, 0.4, 0.0], [-0.1, 0.3, 0.13], [0.05, 0.12, 0.135], [0.16, -0.04, 0.11]], 0.04, 0.04, { ...cloth, seg: 6 });
}, true);

// ---------------------------------------------------------------- heads (frame at the base of the neck)
// The neck rises a little forward to the skull; the skull is longer than it is wide, the face is narrower than the skull with a brow
// ridge, cheekbones, a nose and a jaw; the eyes are at y 0.18 (the face atlas is laid on the front of it), the chin at 0.055, the crown at
// 0.3. Helmets are built round that skull (HELM: the shell of a helmet, padding included).
const HC = [0, 0.205, -0.006], HELM = [0.088, 0.106, 0.108];
function headBase(b, brow = 1, neck = true) {
  if (b.level >= 3) { b.ell([0, 0.19, 0.0], [0.08, 0.115, 0.1], { ...skin, seg: [5, 3] }); return; }
  if (neck) b.loft([[-0.04, 0.058, 0.056, -0.004], [0.04, 0.054, 0.053, 0.004], [0.11, 0.052, 0.054, 0.0]], { ...skin, a: [0.55, 0.8], seg: b.pick(10, 7, 5) });
  const front = (x, y, z) => (z < 0.0 ? [-3, -3] : [x / 0.175 + 0.5, (y - 0.167) / 0.234 + 0.5]);
  const fp = { ...skin, p: PAT.face, uv: front };
  b.ell([0, 0.205, -0.006], [0.079, 0.098, 0.098], { ...fp, seg: [b.pick(14, 10, 8), b.pick(10, 7, 5)] });   // the skull
  b.ell([0, 0.15, 0.025], [0.069, 0.085, 0.072], { ...fp, seg: [b.pick(12, 8, 6), b.pick(8, 6, 4)] });       // the face
  b.ell([0, 0.098, 0.03], [0.057, 0.046, 0.062], { ...fp, seg: [b.pick(10, 7, 6), b.pick(7, 5, 4)] });       // the jaw
  if (b.level < 2) {
    if (b.level < 1) b.ell([0, 0.078, 0.068], [0.026, 0.02, 0.02], { ...fp, seg: [6, 4] });                  // the chin
    b.ell([0, 0.16, 0.102], [0.013, 0.03, 0.02], { ...skin, rot: [0.35, 0, 0], seg: [b.pick(8, 6, 5), b.pick(6, 4, 3)] });   // the nose
    if (b.level < 1) b.ell([0, 0.139, 0.107], [0.014, 0.011, 0.011], { ...skin, seg: [6, 4] });
    b.ell([0, 0.2, 0.083], [0.066 * brow, 0.014 * brow, 0.024], { ...skin, a: [0.85, 0.85], seg: [b.pick(10, 7, 5), b.pick(5, 4, 3)] });   // the brow
    if (b.level < 1) for (const s of [-1, 1]) b.ell([s * 0.042, 0.158, 0.058], [0.026, 0.018, 0.026], { ...fp, seg: [6, 4] });           // cheekbones
    for (const s of [-1, 1]) b.ell([s * 0.078, 0.172, -0.008], [0.012, 0.03, 0.02], { s: 'skinDark', m: 'skin', seg: [b.pick(6, 5, 4), b.pick(4, 3, 3)] });   // the ears
  }
}
const hairM = { s: 'hair', m: 'hair' };
function hairSet(b) {
  if (b.level >= 2) return;
  const sg = [b.pick(8, 7, 5), b.pick(5, 4, 3)];
  b.shell([0, 0.212, -0.012], [0.084, 0.101, 0.104], 0, TAU, 0, PI * 0.56, { ...hairM, g: 7, rot: [-0.25, 0, 0], seg: sg });
  b.shell([0, 0.212, -0.014], [0.086, 0.104, 0.107], 0, TAU, 0, PI * 0.6, { ...hairM, g: 8, rot: [-0.3, 0, 0], seg: sg });
  b.ell([0, 0.14, -0.075], [0.074, 0.12, 0.05], { ...hairM, g: 8, a: [0.6, 1], seg: [b.pick(8, 6, 5), b.pick(6, 4, 3)] });
  b.shell([0, 0.195, -0.008], [0.083, 0.1, 0.103], 0, TAU, PI * 0.5, PI * 0.2, { ...hairM, g: 9, seg: sg });
}
function beard(b, big = 1) {
  if (b.level >= 2) return;
  b.ell([0, 0.098, 0.048], [0.062 * big, 0.062 * big, 0.058], { ...hairM, g: 6, a: [0.6, 1] });
  if (b.level < 1) b.ell([0, 0.121, 0.1], [0.04, 0.011, 0.018], { ...hairM, g: 6 });
}
function coif(b) {
  if (b.level >= 3) return;
  b.shell([0, 0.2, -0.008], [0.09, 0.112, 0.108], PI * 0.5 + 0.95, TAU - 1.9, 0, PI * 0.86, { ...mailM, a: [0.7, 1], seg: [b.pick(12, 9, 7), b.pick(8, 6, 4)] });
  b.lathe([[0.185, -0.1], [0.14, -0.03], [0.072, 0.07]], [0, 0, -0.008], { sc: [1, 1, 0.74], ...mailM, a: [0.7, 1] });
}
function wings(b, y) {
  if (b.level > 0) return;
  for (const s of [-1, 1]) b.cone([s * 0.09, y, 0], [s * 0.2, y + 0.18, 0], 0.026, { ...gold, g: 4, seg: 5 });
}
const helm = (r = 1) => [HELM[0] * r, HELM[1] * r, HELM[2] * r];

def('head.kettle', (b) => {
  headBase(b); hairSet(b); beard(b); coif(b);
  b.shell(HC, helm(1.02), 0, TAU, 0, PI * 0.53, { ...steel, a: [0.8, 1] });
  b.lathe([[0.088, 0.196], [0.19, 0.18], [0.193, 0.188], [0.088, 0.208]], [0, 0, -0.006], { sc: [1, 1, 1.12], ...steel, a: [0.8, 1], seg: b.pick(24, 16, 10) });
  wings(b, 0.28);
}, true);
def('head.nasal', (b) => {
  headBase(b); beard(b); coif(b);
  b.lathe([[0.092, 0.192], [0.093, 0.25], [0.07, 0.296], [0.02, 0.33], [0.0, 0.334]], [0, 0, -0.006], { sc: [1, 1, 1.17], ...steel, a: [0.8, 1], seg: b.pick(18, 12, 8) });
  b.lathe([[0.091, 0.19], [0.097, 0.19], [0.097, 0.225], [0.091, 0.225]], [0, 0, -0.006], { sc: [1, 1, 1.17], ...iron, seg: b.pick(18, 12, 8) });
  b.rbox([0, 0.16, 0.108], [0.02, 0.085, 0.01], { ...steel, e: 0.3, rot: [-0.12, 0, 0] });
  wings(b, 0.27);
}, true);
def('head.great', (b) => {
  if (b.level < 3) b.loft([[-0.04, 0.06, 0.058, -0.004], [0.06, 0.056, 0.056, 0.0]], { ...skin, seg: b.pick(10, 7, 5) });
  b.lathe([[0.09, 0.03], [0.1, 0.08], [0.103, 0.2], [0.098, 0.265], [0.077, 0.31], [0.032, 0.328], [0.0, 0.33]], [0, 0, 0.0], { sc: [1, 1, 1.16], ...plate, a: [0.8, 1], seg: b.pick(22, 14, 9) });
  b.rbox([0, 0.19, 0.116], [0.15, 0.018, 0.02], { c: K.dark, m: 'iron', e: 0.2 });
  b.rbox([0, 0.14, 0.12], [0.02, 0.17, 0.012], { ...gold, e: 0.4 });
  if (b.level < 1) for (let i = 0; i < 4; i++) b.rbox([0.045 + i * 0.011, 0.1 + (i % 2) * 0.022, 0.104], [0.009, 0.009, 0.012], { c: K.dark, m: 'iron', sharp: true });
  wings(b, 0.27);
}, true);
def('head.crown', (b) => {
  headBase(b); hairSet(b); beard(b); coif(b);
  b.shell(HC, helm(1), 0, TAU, 0, PI * 0.5, { ...steel, a: [0.8, 1] });
  b.lathe([[0.091, 0.215], [0.098, 0.215], [0.098, 0.252], [0.091, 0.252]], [0, 0, -0.006], { sc: [1, 1, 1.15], ...gold, seg: b.pick(20, 14, 9) });
  const n = b.pick(7, 6, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    b.cone([Math.sin(a) * 0.095, 0.248, Math.cos(a) * 0.109 - 0.006], [Math.sin(a) * 0.1, 0.32, Math.cos(a) * 0.115 - 0.006], 0.022, { ...gold, seg: 5 });
  }
  if (b.level < 2) b.ell([0, 0.234, 0.108], [0.014, 0.017, 0.009], { c: K.red, m: 'gem', seg: [6, 5] });
}, true);
def('head.horned', (b) => {
  headBase(b, 1.2); hairSet(b); beard(b, 1.2);
  b.shell(HC, helm(1), 0, TAU, 0, PI * 0.5, { c: K.iron, m: 'iron', a: [0.8, 1] });
  b.lathe([[0.09, 0.19], [0.097, 0.19], [0.097, 0.222], [0.09, 0.222]], [0, 0, -0.006], { sc: [1, 1, 1.15], c: K.fur, m: 'fur', p: PAT.fur });
  for (const s of [-1, 1]) b.sweep([[s * 0.08, 0.245, 0.0], [s * 0.16, 0.27, 0.0], [s * 0.23, 0.35, 0.02], [s * 0.23, 0.45, 0.04]], 0.032, 0.006, { c: K.bone, m: 'bone', seg: 6 });
  b.rbox([0, 0.165, 0.108], [0.02, 0.09, 0.01], { c: K.iron, m: 'iron', e: 0.3, rot: [-0.12, 0, 0] });
}, true);
def('head.hood', (b) => {
  headBase(b); beard(b);
  b.shell([0, 0.195, -0.014], [0.1, 0.125, 0.115], PI * 0.5 + 0.8, TAU - 1.6, 0, PI * 0.9, { ...clothDk, a: [0.7, 1] });
  b.cone([0, 0.3, -0.05], [0, 0.33, -0.2], 0.065, { ...clothDk, seg: 6 });
  b.lathe([[0.2, -0.1], [0.15, -0.03], [0.08, 0.06]], [0, 0, -0.01], { sc: [1, 1, 0.76], ...clothDk, w: [0.2, 0], a: [0.65, 1] });
}, true);
def('head.none', (b) => {
  headBase(b, 1.45); hairSet(b); beard(b, 1.15);
  if (b.level < 2) for (const s of [-1, 1]) b.cone([s * 0.03, 0.1, 0.085], [s * 0.04, 0.165, 0.112], 0.012, { c: K.bone, m: 'bone', seg: 5 });
}, true);

// ---------------------------------------------------------------- things worn on the back and head (attached to their own joints)
def('quiver', (b) => {
  b.rod([0.07, 0.02, -0.17], [0.15, 0.46, -0.2], 0.052, 0.058, { c: K.quiver, m: 'leather', p: PAT.leather, a: [0.7, 1] });
  b.rod([0.075, 0.0, -0.17], [0.078, 0.03, -0.17], 0.056, 0.056, { c: K.leatherDk, m: 'leather' });
  const n = b.pick(5, 4, 3);
  for (let i = 0; i < n; i++) {
    const dx = (i - n / 2) * 0.016;
    b.rod([0.13 + dx, 0.44, -0.2], [0.15 + dx, 0.6 + (i % 2) * 0.03, -0.205], 0.006, 0.006, { c: K.wood, m: 'wood', seg: 4 });
    b.cone([0.15 + dx, 0.58 + (i % 2) * 0.03, -0.205], [0.152 + dx, 0.65 + (i % 2) * 0.03, -0.206], 0.022, { c: K.linen, m: 'cloth', seg: 4 });
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
  b.sheet([0, -0.02, -0.135], 0.5, 0.9, 5, b.pick(8, 5, 3), { rot: [0.05, 0, 0], ...cloth, g: 2, w: [1.9, 1.0], dz: (x) => -0.03 * (x / 0.25) ** 2 });
  b.sheet([0, -0.72, -0.135], 0.5, 0.5, 5, b.pick(5, 3, 2), { rot: [0.05, 0, 0], ...cloth, g: 5, w: [1.95, 1.8], dz: (x) => -0.03 * (x / 0.25) ** 2 });
  b.sheet([0, 0.42, -0.13], 0.52, 0.045, 5, 1, { c: K.trim, m: 'cloth', g: 2 });
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
// the gilding of a trained soldier's shield (tier 3 and up)
def('kit.shield.round', (b) => {
  b.within(ROUND_ON, () => {
    b.torus([0.03, -0.14, 0.088], 0.39, 0.03, { ...gold, sc: [1, 1, 1.1] });
    b.ell([0.03, -0.14, 0.128], [0.082, 0.082, 0.044], { ...gold });
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
def('weapon.sword', (b) => {
  b.place(new THREE.CylinderGeometry(0.004, 0.03, 0.9, 4, 1), [0, -0.57, 0], [0, PI / 4, 0], [1, 1, 0.3], { ...steel, a: [1, 1] });
  b.rbox([0, -0.115, 0], [0.27, 0.032, 0.042], { ...iron, e: 0.4 });
  b.rod([0, 0.07, 0], [0, -0.11, 0], 0.019, 0.019, { c: K.leatherDk, m: 'leather' });
  b.ell([0, 0.075, 0], 0.036, { c: K.brass, m: 'brass', seg: [8, 6] });
  if (b.level < 2) for (const s of [-1, 1]) b.ell([s * 0.135, -0.115, 0], [0.02, 0.02, 0.022], { ...iron, seg: [6, 5] });
});
def('weapon.spear', (b) => {
  b.rod([0, 0.55, 0], [0, -1.86, 0], 0.021, 0.019, { ...wood, seg: b.pick(8, 6, 4) });
  b.ell([0, -2.03, 0], [0.047, 0.19, 0.015], { ...steel, seg: [8, 8] });
  b.rod([0, -1.86, 0], [0, -1.95, 0], 0.03, 0.026, { ...iron });
  b.cone([0, 0.55, 0], [0, 0.63, 0], 0.024, { ...iron, seg: 5 });
  if (b.level < 2) for (const y of [-1.2, -0.9]) b.rod([0, y, 0], [0, y - 0.03, 0], 0.027, 0.027, { ...leather });
});
def('weapon.lance', (b) => {
  b.rod([0, 0.35, 0], [0, -2.95, 0], 0.034, 0.018, { c: 0xd9cfb8, m: 'wood', p: PAT.grain, seg: b.pick(8, 6, 4) });
  b.cone([0, -2.92, 0], [0, -3.2, 0], 0.024, { ...steel, seg: 6 });
  b.lathe([[0.03, -0.3], [0.12, -0.2], [0.1, -0.12], [0.03, -0.1]], [0, 0, 0], { ...iron, seg: 10 });
  b.place(new THREE.PlaneGeometry(0.2, 0.55, 3, 3), [0.3, -2.65, 0], [0, 0, PI / 2], 1, { ...cloth, w: [0.95, 0] });
}, true);
def('weapon.axe', (b) => {
  b.rod([0, 0.1, 0], [0, -0.95, 0], 0.024, 0.022, { ...wood, seg: 7 });
  b.extrude([[0, 0.12], [0.1, 0.18], [0.2, 0.15], [0.2, -0.17], [0.1, -0.2], [0, -0.14]], 0.02, 0.004, [0, -0.78, 0], { ...steel, rot: [0, -PI / 2, 0] });
});
def('weapon.greataxe', (b) => {
  b.rod([0, 0.3, 0], [0, -1.5, 0], 0.027, 0.025, { ...wood, seg: b.pick(8, 6, 5) });
  b.extrude([[0, 0.22], [0.12, 0.3], [0.27, 0.25], [0.31, 0.1], [0.31, -0.1], [0.27, -0.25], [0.12, -0.3], [0, -0.22]], 0.026, 0.005, [0, -1.25, 0], { ...steel, rot: [0, -PI / 2, 0] });
  b.extrude([[0, 0.2], [-0.1, 0.24], [-0.22, 0.2], [-0.25, 0.08], [-0.25, -0.08], [-0.22, -0.2], [-0.1, -0.24], [0, -0.2]], 0.026, 0.005, [0, -1.25, 0], { ...steel, rot: [0, -PI / 2, 0] });
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
def('weapon.staff', (b) => {
  b.rod([0, 0.6, 0], [0, -1.35, 0], 0.027, 0.024, { c: K.woodDk, m: 'wood', p: PAT.grain, seg: b.pick(8, 6, 5) });
  b.ell([0, -1.5, 0], 0.085, { c: 0xff9a3a, m: 'gem', p: PAT.glow, seg: [b.pick(12, 8, 6), b.pick(8, 6, 4)] });
  if (b.level < 2) for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.sweep([[0, -1.33, 0], [Math.cos(a) * 0.09, -1.42, Math.sin(a) * 0.09], [Math.cos(a) * 0.11, -1.58, Math.sin(a) * 0.11], [Math.cos(a) * 0.05, -1.68, Math.sin(a) * 0.05]], 0.018, 0.006, { c: K.bone, m: 'bone', seg: 5 });
  }
});
def('weapon.mace', (b) => {
  b.rod([0, 0.1, 0], [0, -0.8, 0], 0.024, 0.022, { ...wood, seg: 7 });
  b.ell([0, -0.9, 0], [0.07, 0.08, 0.07], { ...iron, seg: [10, 8] });
  const n = b.pick(7, 6, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    b.rbox([Math.cos(a) * 0.07, -0.9, Math.sin(a) * 0.07], [0.05, 0.14, 0.012], { ...steel, e: 0.3, rot: [0, -a, 0] });
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
def('cape.long', (b) => {
  b.sheet([0, -0.5, -0.03], 0.58, 1.0, b.pick(8, 5, 3), b.pick(12, 8, 4), { ...cloth, w: [1.95, 1.0], dz: (x) => -0.08 * (x / 0.29) ** 2, a: [0.7, 1] });
  b.sheet([0, 0.015, -0.015], 0.62, 0.075, b.pick(8, 5, 3), 1, { c: K.furLt, m: 'fur', p: PAT.fur, dz: (x) => -0.07 * (x / 0.31) ** 2 });
  if (b.level < 2) b.rbox([0, 0.0, 0.1], [0.06, 0.05, 0.02], { ...gold, e: 0.4 });
}, true);
def('cape.cloak', (b) => {
  b.sheet([0, -0.38, -0.03], 0.54, 0.78, b.pick(8, 5, 3), b.pick(10, 6, 3), { ...clothDk, w: [1.95, 1.0], dz: (x) => -0.07 * (x / 0.27) ** 2, a: [0.7, 1] });
}, true);

// ---- the cloaks a lord can earn with Renown (unlocks.js): the colours are fixed, so they never take the house colour. They hang where the others do.
// (a cloak hangs from the shoulders and flares toward the hem: `w` is its width at the neck, the hem is `flare` wider)
const FLARE = 0.3;
const hang = (b, w, h, o, bend = 0.08) => {
  const g = new THREE.PlaneGeometry(w, h, b.pick(8, 5, 3), b.pick(12, 8, 4));
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), k = 1 + FLARE * (h / 2 - pa.getY(i)) / h;   // 1 at the neck, 1 + FLARE at the hem
    pa.setX(i, x * k);
    pa.setZ(i, -bend * (x / (w / 2)) ** 2 * k);
  }
  g.computeVertexNormals();
  return b.place(g, [0, -h / 2, -0.03], [0, 0, 0], 1, { ...o, w: [1.95, 1.0], a: [0.7, 1] });
};
// a band along the hem (swaying with the cloth) or the collar (still)
const hem = (b, w, h, y, o, bend = 0.08) => b.sheet([0, y, -0.034], w * (1 + FLARE), 0.05, b.pick(8, 5, 3), 1, { ...o, w: [1.95, 1.9], dz: (x) => -bend * (x / (w * (1 + FLARE) / 2)) ** 2 * (1 + FLARE) });
const collar = (b, w, hgt, o, bend = 0.07) => b.sheet([0, 0.015, -0.015], w, hgt, b.pick(8, 5, 3), 1, { ...o, dz: (x) => -bend * (x / (w / 2)) ** 2 });
def('cape.crimson', (b) => {   // deep red wool, a gold hem and collar, a gold clasp
  hang(b, 0.58, 1.0, { c: 0x8c1f24, m: 'wool', p: PAT.weave });
  hem(b, 0.58, 1.0, -0.99, { ...gold });
  collar(b, 0.62, 0.075, { ...gold });
  if (b.level < 2) b.rbox([0, 0.0, 0.1], [0.06, 0.05, 0.02], { ...gold, e: 0.4 });
}, true);
def('cape.greenwood', (b) => {   // a shorter travelling cloak, a leather hem, a rolled hood at the neck
  hang(b, 0.56, 0.86, { c: 0x2f5a34, m: 'wool', p: PAT.weave }, 0.07);
  hem(b, 0.56, 0.86, -0.85, { c: K.leather, m: 'leather', p: PAT.leather }, 0.07);
  collar(b, 0.6, 0.11, { c: 0x25472a, m: 'wool', p: PAT.weave });
  if (b.level < 2) b.rbox([0, 0.0, 0.1], [0.05, 0.04, 0.02], { c: K.brass, m: 'brass', e: 0.4 });
}, true);
def('cape.wolfpelt', (b) => {   // grey wool under a deep collar and shoulders of wolf fur
  const fur = { c: 0xcfc8b8, m: 'fur', p: PAT.fur };
  hang(b, 0.6, 0.9, { c: 0x6a6e74, m: 'wool', p: PAT.weave }, 0.07);
  hem(b, 0.6, 0.9, -0.89, fur, 0.07);
  collar(b, 0.7, 0.17, fur, 0.07);
  for (const s of [-1, 1]) b.ell([s * 0.2, 0.0, -0.045], [0.11, 0.06, 0.09], { ...fur, seg: [b.pick(8, 6, 4), b.pick(6, 4, 3)] });
}, true);
def('cape.midnight', (b) => {   // dark blue silk edged in silver
  const silver = { c: 0xc8ced8, m: 'steel' };
  hang(b, 0.58, 1.0, { c: 0x1c2756, m: 'silk', p: PAT.weave });
  hem(b, 0.58, 1.0, -0.99, silver);
  collar(b, 0.62, 0.06, silver);
  if (b.level < 2) b.rbox([0, 0.0, 0.1], [0.05, 0.05, 0.02], { ...silver, e: 0.4 });
}, true);
