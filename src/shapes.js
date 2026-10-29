// The catalogue of character parts. A shape is built once per detail level (0 richest .. 2 plainest, 3 the baked far-away model) into a
// geometry shared by every soldier that wears it; colours that differ between soldiers (house cloth, skin, hair, a horse's coat) are
// colour SLOTS filled per instance by the shader, so a shape does not depend on the team. Every shape is modelled in the frame of the
// joint it hangs from (see models.js): +y up, +z forward, the weapon arm at -x, the shield arm at +x. `open` shapes carry thin cloth or
// hollow shells and are drawn double-sided. Gates (see modelkit.js) used here: 1 steel pauldrons (tier 1-3), 2 cloak (tier 2+),
// 3 gold gorget and band (tier 3+), 4 gold pauldrons and helm wings (tier 4+), 5 long cloak and gilded plate (tier 5), 6 beard,
// 7 8 9 hair cuts, 12 gilded shield rim (tier 3+).
import * as THREE from 'three';
import { Builder, PAT } from './modelkit.js';

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
const leather = { c: K.leather, m: 'leather', p: PAT.leather }, wood = { c: K.wood, m: 'wood', p: PAT.grain }, skin = { s: 'skin', m: 'skin' };
const cloth = { s: 'cloth', m: 'cloth', p: PAT.weave }, clothDk = { s: 'clothDark', m: 'cloth', p: PAT.weave };
const mailM = { c: K.mail, m: 'mail', p: PAT.mail };

// ---------------------------------------------------------------- legs (hip frame, knee frame)
const LEG = { cloth: { c: K.pants, m: 'cloth', p: PAT.weave }, mail: mailM, plate, skin };
function boot(b, fur) {
  const bc = fur ? { c: K.fur, m: 'fur', p: PAT.fur } : { c: K.boot, m: 'leather', p: PAT.leather };
  b.rod([0, -0.13, 0], [0, -0.41, 0], 0.057, 0.05, { ...bc, a: [0.8, 1], seg: b.pick(10, 8, 6) });
  b.rbox([0, -0.438, 0.06], [0.105, 0.075, 0.25], { ...bc, e: 0.35, seg: [b.pick(8, 6, 5), b.pick(5, 4, 3)] });
  if (b.level < 2) {
    b.rod([0, -0.165, 0], [0, -0.1, 0], 0.07, 0.07, { c: K.cuff, m: 'leather', seg: b.pick(10, 7, 6) });
    b.ell([0, -0.43, 0.15], [0.052, 0.036, 0.06], { ...bc, seg: [6, 4] });
    b.rbox([0, -0.474, 0.065], [0.108, 0.018, 0.26], { c: K.ironDk, m: 'rubber', sharp: true });
  }
}
for (const st of Object.keys(LEG)) {
  def('thigh.' + st, (b) => {
    const o = { ...LEG[st], a: [0.88, 0.95] };
    b.rod([0, 0, 0], [0, -0.46, 0], 0.09, 0.066, o);
    b.ell([0, 0, 0], 0.09, o);
    b.ell([0, -0.46, 0], 0.067, o);
    if (st === 'plate' && b.level < 2) {
      b.rbox([0, -0.2, 0.025], [0.17, 0.3, 0.16], { ...plate, e: 0.3 });
      b.ell([0, -0.46, 0.035], [0.062, 0.058, 0.05], { ...plate, a: [1, 1] });
    }
  });
  def('shin.' + st, (b) => {
    const o = { ...LEG[st], a: [0.85, 1] };
    b.ell([0, 0, 0], 0.066, o);
    b.rod([0, 0, 0], [0, -0.38, 0], 0.064, 0.046, o);
    if (st === 'plate' && b.level < 2) b.rod([0, -0.02, 0.01], [0, -0.22, 0.01], 0.07, 0.058, { ...plate, a: [0.9, 1] });
    boot(b, st === 'skin');
  });
}

// ---------------------------------------------------------------- arms (shoulder frame, elbow frame)
const ARM = { cloth: { c: K.gamb, m: 'cloth', p: PAT.quilt }, mail: mailM, plate, skin, leather: { c: K.leather, m: 'leather', p: PAT.leather } };
for (const st of Object.keys(ARM)) {
  def('arm.' + st, (b) => {
    const o = { ...ARM[st], a: [0.88, 1] };
    b.ell([0, 0, 0], 0.07, o);
    b.rod([0, 0, 0], [0, -0.3, 0], 0.062, 0.05, o);
    b.ell([0, -0.3, 0], 0.05, o);
    if (st === 'plate') {
      if (b.level < 2) {
        b.ell([0, 0.03, 0], [0.115, 0.07, 0.11], { ...plate, a: [0.85, 1] });
        b.ell([0, -0.04, 0], [0.105, 0.05, 0.1], { ...plate, a: [0.8, 0.95] });
      } else b.ell([0, 0.02, 0], [0.112, 0.08, 0.108], plate);
    }
  });
}
// the pauldrons of a trained soldier (gates 1 steel, 4 gold)
def('kit.arm', (b) => {
  b.ell([0, 0.03, 0], [0.115, 0.07, 0.11], { ...steel, g: 1, a: [0.8, 1] });
  b.ell([0, 0.035, 0], [0.122, 0.074, 0.117], { ...gold, g: 4 });
});
const FORE = {
  cloth: { arm: { c: K.gamb, m: 'cloth', p: PAT.quilt }, hand: leather },
  mail: { arm: mailM, hand: leather },
  plate: { arm: plate, hand: { ...plate } },
  skin: { arm: skin, hand: skin },
};
for (const st of Object.keys(FORE)) {
  def('fore.' + st, (b) => {
    const f = FORE[st];
    b.ell([0, 0, 0], 0.05, { ...f.arm, a: [1, 1] });
    b.rod([0, 0, 0], [0, -0.26, 0], 0.05, 0.04, { ...f.arm, a: [0.9, 1] });
    if (b.level < 2) {
      if (st === 'plate') b.ell([0, 0.0, 0.02], [0.058, 0.05, 0.05], { ...plate, a: [1, 1] });
      else b.rod([0, -0.1, 0], [0, -0.25, 0], 0.052, 0.046, { ...leather, a: [0.9, 1] });
    }
    b.rbox([0, -0.325, 0.012], [0.085, 0.1, 0.1], { ...f.hand, e: 0.4, a: [0.9, 1] });
    if (b.level < 1) b.ell([0.045, -0.31, 0.03], [0.02, 0.04, 0.025], { ...f.hand, seg: [6, 5] });
  });
}

// ---------------------------------------------------------------- pelvis (frame at the hip line) and chest (frame at the waist)
const TORSO = [[0.16, -0.06], [0.175, 0.0], [0.19, 0.1], [0.205, 0.22], [0.213, 0.33], [0.2, 0.4], [0.14, 0.445], [0.07, 0.47]];
const torsoR = (y) => {
  for (let i = 1; i < TORSO.length; i++) {
    if (y <= TORSO[i][1]) { const a = TORSO[i - 1], c = TORSO[i], k = (y - a[1]) / (c[1] - a[1]); return a[0] + (c[0] - a[0]) * k; }
  }
  return 0.07;
};
function belt(b, extras) {
  b.lathe([[0.171, 0.02], [0.18, 0.02], [0.18, 0.085], [0.171, 0.085]], [0, 0, 0], { sc: [1, 1, 0.68], ...leather, seg: b.pick(20, 14, 9) });
  b.rbox([0, 0.052, 0.126], [0.052, 0.05, 0.014], { ...gold, sharp: true });
  if (extras && b.level < 2) {
    b.rbox([0.165, 0.0, 0.05], [0.07, 0.1, 0.055], { ...leather, sharp: true });
    b.rbox([-0.15, 0.005, 0.085], [0.06, 0.08, 0.05], { ...leather, sharp: true });
  }
}
// cloth hanging from the belt, front and back, swaying; the sides stay open
function tabardSkirt(b, hem, w) {
  const prof = [[0.252, hem], [0.2, 0.06]];
  for (const arc of [[-0.62, 1.24], [PI - 0.62, 1.24]]) {
    b.lathe(prof, [0, 0, 0], { arc, sc: [1, 1, 0.78], ...cloth, w: [w, 0], a: [0.8, 1], seg: b.pick(8, 6, 4) });
    if (b.level < 2) b.lathe([[0.256, hem], [0.25, hem + 0.04]], [0, 0, 0], { arc, sc: [1, 1, 0.78], c: K.trim, m: 'cloth', w: [w, w * 0.9], seg: b.pick(8, 6, 4) });
  }
}
function scabbard(b) {
  b.rod([0.17, -0.03, 0.0], [0.21, -0.43, -0.09], 0.024, 0.02, { ...leather, a: [0.85, 1], seg: 6 });
  b.rod([0.205, -0.4, -0.085], [0.212, -0.46, -0.1], 0.022, 0.026, { ...iron, seg: 5 });
}
const hips = (b, o) => b.ell([0, -0.03, 0], [0.172, 0.1, 0.125], { a: [0.7, 1], ...o });

def('pelvis.mail', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  b.lathe([[0.255, -0.3], [0.2, 0.05]], [0, 0, 0], { sc: [1, 1, 0.78], ...mailM, a: [0.65, 1], seg: b.pick(20, 12, 8) });
  tabardSkirt(b, -0.34, 0.9);
  if (b.level < 1) scabbard(b);
}, true);
def('pelvis.plate', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  const ys = b.level < 2 ? [0.0, -0.09, -0.18] : [-0.05];
  ys.forEach((y, i) => b.lathe([[0.215 + i * 0.016, y - 0.1], [0.19 + i * 0.012, y + 0.05]], [0, 0, 0], { sc: [1, 1, 0.8], ...plate, a: [0.7, 1], seg: b.pick(20, 12, 8) }));
  if (b.level < 2) for (const sx of [-1, 1]) b.rbox([sx * 0.085, -0.17, 0.155], [0.14, 0.22, 0.04], { ...plate, e: 0.3, rot: [0.12, 0, sx * 0.08] });
  tabardSkirt(b, -0.38, 0.9);
  if (b.level < 1) scabbard(b);
}, true);
def('pelvis.gambeson', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  b.lathe([[0.24, -0.24], [0.2, 0.05]], [0, 0, 0], { sc: [1, 1, 0.78], c: K.gamb, m: 'cloth', p: PAT.quilt, a: [0.7, 1], seg: b.pick(18, 12, 8) });
  if (b.level < 2) b.rod([-0.13, 0.0, 0.1], [-0.15, -0.14, 0.12], 0.015, 0.012, { c: K.steel, m: 'steel' });
}, true);
def('pelvis.leather', (b) => {
  hips(b, LEG.cloth);
  belt(b, true);
  b.lathe([[0.235, -0.4], [0.2, 0.06]], [0, 0, 0], { arc: [-0.8, 1.6], sc: [1, 1, 0.78], c: K.leatherLt, m: 'leather', p: PAT.leather, a: [0.7, 1], seg: b.pick(10, 8, 5) });
  if (b.level < 2) {
    b.rod([0.17, 0.0, 0.05], [0.2, -0.34, 0.05], 0.022, 0.022, { ...wood });
    b.rbox([0.205, -0.38, 0.05], [0.12, 0.07, 0.07], { ...iron, e: 0.3 });
  }
}, true);
def('pelvis.fur', (b) => {
  b.ell([0, -0.02, 0], [0.19, 0.11, 0.14], { c: K.fur, m: 'fur', p: PAT.fur, a: [0.7, 1] });
  b.torus([0, 0.05, 0], 0.19, 0.022, { rot: [PI / 2, 0, 0], sc: [1, 0.75, 1], c: K.leatherLt, m: 'leather', seg: b.pick(18, 12, 8) });
  for (const arc of [[-0.8, 1.6], [PI - 0.8, 1.6]]) b.lathe([[0.25, -0.34], [0.2, 0.06]], [0, 0, 0], { arc, sc: [1, 1, 0.8], c: K.furLt, m: 'fur', p: PAT.fur, w: [0.8, 0], a: [0.7, 1], seg: b.pick(8, 6, 4) });
}, true);

// the surcoat over a torso: front and back panels, the front carrying the house emblem
function tabardTop(b, top, bottom) {
  const ys = [bottom, 0.1, 0.22, 0.33, top].filter((y) => y >= bottom && y <= top);
  const prof = ys.map((y) => [torsoR(y) + 0.011, y]);
  const o = { sc: [1, 1, 0.6], seg: b.pick(10, 8, 5) };
  b.lathe(prof, [0, 0, 0], { ...o, arc: [-0.68, 1.36], ...cloth, p: PAT.emblem, uv: [0, 0.2, 0.3, 0.3], a: [0.85, 1] });
  b.lathe(prof, [0, 0, 0], { ...o, arc: [PI - 0.68, 1.36], ...cloth, a: [0.85, 1] });
  if (b.level < 2) b.lathe([[torsoR(top - 0.03) + 0.012, top - 0.03], [torsoR(top) + 0.011, top]], [0, 0, 0], { ...o, c: K.trim, m: 'cloth' });
}
const torsoLathe = (b, o) => b.lathe(TORSO, [0, 0, 0], { sc: [1, 1, 0.6], seg: b.pick(22, 14, 9), ...o });

def('chest.mail', (b) => {
  torsoLathe(b, { ...mailM, a: [0.75, 1] });
  tabardTop(b, 0.42, -0.03);
  if (b.level < 2) b.ell([0, 0.46, 0], [0.12, 0.05, 0.1], { ...mailM });
}, true);
def('chest.plate', (b) => {
  torsoLathe(b, { c: K.ironDk, m: 'iron', a: [0.7, 1] });
  // breastplate and backplate with a ridge down the middle, a gorget at the neck
  const pf = [[0.168, -0.05], [0.19, 0.05], [0.222, 0.2], [0.234, 0.3], [0.218, 0.405]];
  b.lathe(pf, [0, 0, 0], { arc: [-1.15, 2.3], sc: [1, 1, 0.62], ...plate, a: [0.85, 1], seg: b.pick(14, 10, 6) });
  b.lathe(pf, [0, 0, 0], { arc: [PI - 1.0, 2.0], sc: [1, 1, 0.6], ...plate, a: [0.85, 1], seg: b.pick(12, 8, 5) });
  if (b.level < 2) {
    b.rbox([0, 0.2, 0.147], [0.03, 0.3, 0.03], { ...plate, e: 0.4, rot: [0.08, 0, 0] });
    b.lathe([[0.125, 0.4], [0.13, 0.44], [0.095, 0.5]], [0, 0, 0], { sc: [1, 1, 0.9], ...plate });
  }
  tabardTop(b, 0.33, -0.03);
}, true);
def('chest.gambeson', (b) => {
  torsoLathe(b, { c: K.gamb, m: 'cloth', p: PAT.quilt, a: [0.78, 1] });
  if (b.level < 2) {
    b.lathe([[0.1, 0.4], [0.118, 0.435], [0.1, 0.48]], [0, 0, 0], { sc: [1, 1, 0.9], ...clothDk });            // a scarf
    b.sweep([[0.13, 0.38, 0.09], [0.05, 0.25, 0.122], [-0.04, 0.12, 0.126], [-0.14, 0.0, 0.1]], 0.016, 0.016, { ...leather });
    b.rbox([0.165, -0.0, 0.04], [0.06, 0.08, 0.05], { ...leather, e: 0.35 });
  }
}, true);
def('chest.leather', (b) => {
  torsoLathe(b, { c: K.leather, m: 'leather', p: PAT.leather, a: [0.78, 1] });
  if (b.level < 2) {
    b.sweep([[0.13, 0.38, 0.09], [0.05, 0.25, 0.122], [-0.04, 0.12, 0.126], [-0.14, 0.0, 0.1]], 0.016, 0.016, { c: K.leatherDk, m: 'leather' });
    b.lathe([[0.1, 0.4], [0.118, 0.435], [0.1, 0.48]], [0, 0, 0], { sc: [1, 1, 0.9], ...clothDk });
  }
  b.lathe([[0.2, -0.04], [0.214, 0.3]], [0, 0, 0], { arc: [-0.7, 1.4], sc: [1, 1, 0.6], c: K.linen, m: 'cloth', p: PAT.weave, a: [0.8, 1] });   // an apron bib
}, true);
def('chest.fur', (b) => {
  // a giant: bare skin, a heavy chest, a fur mantle, the house sash
  torsoLathe(b, { ...skin, a: [0.72, 1] });
  b.ell([0, 0.34, 0.07], [0.19, 0.12, 0.1], { ...skin, a: [0.8, 1] });
  if (b.level < 2) for (const sx of [-1, 1]) b.ell([sx * 0.085, 0.27, 0.095], [0.1, 0.09, 0.06], { ...skin, a: [0.8, 1] });
  b.ell([0, 0.43, -0.02], [0.3, 0.12, 0.2], { c: K.furLt, m: 'fur', p: PAT.fur, a: [0.7, 1] });
  b.sweep([[-0.2, 0.46, 0.0], [-0.1, 0.3, 0.14], [0.05, 0.1, 0.16], [0.17, -0.05, 0.12]], 0.05, 0.05, { ...cloth, seg: 6 });
}, true);

// ---------------------------------------------------------------- heads (frame at the base of the neck; the face is at y 0.165)
function headBase(b, brow = 1) {
  if (b.level >= 3) { b.ell([0, 0.16, 0], [0.097, 0.12, 0.108], { ...skin, seg: [5, 3] }); return; }
  b.rod([0, -0.04, 0], [0, 0.09, 0], 0.056, 0.05, { ...skin, a: [0.55, 0.8], seg: b.pick(10, 7, 5) });
  const front = (x, y, z) => (z < 0.0 ? [-3, -3] : [x / 0.21 + 0.5, (y - 0.16) / 0.25 + 0.5]);
  const fp = { ...skin, p: PAT.face, uv: front };
  b.ell([0, 0.165, 0.0], [0.097, 0.12, 0.108], { ...fp, seg: [b.pick(14, 10, 8), b.pick(10, 7, 5)] });
  b.ell([0, 0.1, 0.03], [0.078, 0.075, 0.08], { ...fp, seg: [b.pick(10, 8, 6), b.pick(7, 5, 4)] });
  if (b.level < 2) {
    b.ell([0, 0.135, 0.105], [0.019, 0.032, 0.03], { ...skin, rot: [0.3, 0, 0], seg: [b.pick(8, 6, 5), b.pick(6, 4, 3)] });
    b.ell([0, 0.205, 0.075], [0.09 * brow, 0.02 * brow, 0.04 * brow], { ...skin, a: [0.8, 0.8], seg: [b.pick(10, 7, 5), b.pick(5, 4, 3)] });
    if (b.level < 1) for (const s of [-1, 1]) b.ell([s * 0.097, 0.15, -0.005], [0.014, 0.03, 0.02], { s: 'skinDark', m: 'skin', seg: [6, 4] });
  }
}
const hairM = { s: 'hair', m: 'hair' };
function hairSet(b) {
  if (b.level >= 2) return;
  const sg = [b.pick(8, 7, 5), b.pick(5, 4, 3)];
  b.shell([0, 0.18, -0.01], [0.103, 0.125, 0.112], 0, TAU, 0, PI * 0.56, { ...hairM, g: 7, rot: [-0.25, 0, 0], seg: sg });
  b.shell([0, 0.18, -0.012], [0.106, 0.128, 0.115], 0, TAU, 0, PI * 0.6, { ...hairM, g: 8, rot: [-0.3, 0, 0], seg: sg });
  b.ell([0, 0.09, -0.075], [0.095, 0.15, 0.06], { ...hairM, g: 8, a: [0.6, 1], seg: [b.pick(8, 6, 5), b.pick(6, 4, 3)] });
  b.shell([0, 0.15, -0.01], [0.1, 0.12, 0.108], 0, TAU, PI * 0.5, PI * 0.2, { ...hairM, g: 9, seg: sg });
}
function beard(b, big = 1) {
  if (b.level >= 2) return;
  b.ell([0, 0.07, 0.06], [0.082 * big, 0.085 * big, 0.07], { ...hairM, g: 6, a: [0.6, 1] });
  if (b.level < 1) b.ell([0, 0.115, 0.098], [0.055, 0.014, 0.025], { ...hairM, g: 6 });
}
function coif(b) {
  if (b.level >= 3) return;
  b.shell([0, 0.16, -0.006], [0.108, 0.135, 0.116], PI * 0.5 + 0.95, TAU - 1.9, 0, PI * 0.86, { ...mailM, a: [0.7, 1], seg: [b.pick(12, 9, 7), b.pick(8, 6, 4)] });
  b.lathe([[0.2, -0.13], [0.17, -0.04], [0.1, 0.04]], [0, 0, 0], { sc: [1, 1, 0.75], ...mailM, a: [0.7, 1] });
}
function wings(b, y) {
  if (b.level > 0) return;
  for (const s of [-1, 1]) b.cone([s * 0.12, y, 0], [s * 0.24, y + 0.2, 0], 0.03, { ...gold, g: 4, seg: 5 });
}

def('head.kettle', (b) => {
  headBase(b); hairSet(b); beard(b); coif(b);
  b.shell([0, 0.2, 0], [0.128, 0.1, 0.135], 0, TAU, 0, PI * 0.52, { ...steel, a: [0.8, 1] });
  b.lathe([[0.124, 0.19], [0.238, 0.176], [0.241, 0.184], [0.124, 0.202]], [0, 0, 0], { ...steel, a: [0.8, 1], seg: b.pick(24, 16, 10) });
  wings(b, 0.28);
}, true);
def('head.nasal', (b) => {
  headBase(b); beard(b); coif(b);
  b.lathe([[0.122, 0.165], [0.124, 0.25], [0.09, 0.325], [0.02, 0.385], [0.0, 0.39]], [0, 0, 0], { sc: [1, 1, 1.06], ...steel, a: [0.8, 1], seg: b.pick(18, 12, 8) });
  b.lathe([[0.121, 0.165], [0.128, 0.165], [0.128, 0.21], [0.121, 0.21]], [0, 0, 0], { sc: [1, 1, 1.06], ...iron, seg: b.pick(18, 12, 8) });
  b.rbox([0, 0.135, 0.128], [0.026, 0.135, 0.012], { ...steel, e: 0.3 });
  wings(b, 0.27);
}, true);
def('head.great', (b) => {
  b.rod([0, -0.04, 0], [0, 0.05, 0], 0.058, 0.058, { ...skin });
  b.lathe([[0.12, 0.0], [0.13, 0.06], [0.133, 0.2], [0.126, 0.28], [0.095, 0.335], [0.04, 0.355], [0.0, 0.358]], [0, 0, 0], { sc: [1, 1, 1.1], ...plate, a: [0.8, 1], seg: b.pick(22, 14, 9) });
  b.rbox([0, 0.19, 0.143], [0.19, 0.022, 0.02], { c: K.dark, m: 'iron', e: 0.2 });
  b.rbox([0, 0.14, 0.147], [0.024, 0.2, 0.014], { ...gold, e: 0.4 });
  if (b.level < 1) for (let i = 0; i < 4; i++) b.rbox([0.06 + i * 0.012, 0.1 + (i % 2) * 0.025, 0.126], [0.01, 0.01, 0.012], { c: K.dark, m: 'iron', sharp: true });
  wings(b, 0.28);
}, true);
def('head.crown', (b) => {
  headBase(b); hairSet(b); beard(b); coif(b);
  b.shell([0, 0.2, 0], [0.126, 0.1, 0.132], 0, TAU, 0, PI * 0.5, { ...steel, a: [0.8, 1] });
  b.lathe([[0.129, 0.222], [0.137, 0.222], [0.137, 0.266], [0.129, 0.266]], [0, 0, 0], { sc: [1, 1, 1.05], ...gold, seg: b.pick(20, 14, 9) });
  const n = b.pick(7, 6, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    b.cone([Math.sin(a) * 0.133, 0.262, Math.cos(a) * 0.139], [Math.sin(a) * 0.14, 0.35, Math.cos(a) * 0.146], 0.026, { ...gold, seg: 5 });
  }
  if (b.level < 2) b.ell([0, 0.245, 0.147], [0.016, 0.02, 0.01], { c: K.red, m: 'gem', seg: [6, 5] });
}, true);
def('head.horned', (b) => {
  headBase(b, 1.25); hairSet(b); beard(b, 1.2);
  b.shell([0, 0.2, 0], [0.126, 0.1, 0.132], 0, TAU, 0, PI * 0.5, { c: K.iron, m: 'iron', a: [0.8, 1] });
  b.lathe([[0.127, 0.19], [0.134, 0.19], [0.134, 0.225], [0.127, 0.225]], [0, 0, 0], { sc: [1, 1, 1.05], c: K.fur, m: 'fur', p: PAT.fur });
  for (const s of [-1, 1]) b.sweep([[s * 0.11, 0.25, 0.0], [s * 0.2, 0.28, 0.0], [s * 0.27, 0.36, 0.02], [s * 0.27, 0.47, 0.04]], 0.035, 0.006, { c: K.bone, m: 'bone', seg: 6 });
  b.rbox([0, 0.17, 0.128], [0.026, 0.1, 0.012], { c: K.iron, m: 'iron', e: 0.3 });
}, true);
def('head.hood', (b) => {
  headBase(b); beard(b);
  b.shell([0, 0.17, -0.012], [0.118, 0.142, 0.125], PI * 0.5 + 0.8, TAU - 1.6, 0, PI * 0.9, { ...clothDk, a: [0.7, 1] });
  b.cone([0, 0.3, -0.04], [0, 0.34, -0.2], 0.075, { ...clothDk, seg: 6 });
  b.lathe([[0.22, -0.13], [0.19, -0.04], [0.1, 0.05]], [0, 0, 0], { sc: [1, 1, 0.8], ...clothDk, w: [0.2, 0], a: [0.65, 1] });
}, true);
def('head.none', (b) => {
  headBase(b, 1.5); hairSet(b); beard(b, 1.15);
  if (b.level < 2) for (const s of [-1, 1]) b.cone([s * 0.04, 0.085, 0.1], [s * 0.05, 0.16, 0.13], 0.014, { c: K.bone, m: 'bone', seg: 5 });
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
  b.sheet([0, 0.0, -0.17], 0.5, 0.9, 5, b.pick(8, 5, 3), { rot: [0.05, 0, 0], ...cloth, g: 2, w: [1.9, 1.0], dz: (x) => -0.03 * (x / 0.25) ** 2 });
  b.sheet([0, -0.7, -0.17], 0.5, 0.5, 5, b.pick(5, 3, 2), { rot: [0.05, 0, 0], ...cloth, g: 5, w: [1.95, 1.8], dz: (x) => -0.03 * (x / 0.25) ** 2 });
  b.sheet([0, 0.44, -0.165], 0.52, 0.045, 5, 1, { c: K.trim, m: 'cloth', g: 2 });
  b.lathe([[0.125, 0.4], [0.13, 0.43], [0.1, 0.48]], [0, 0, 0], { sc: [1, 1, 0.9], ...gold, g: 3 });
  b.lathe([[torsoR(0.0) + 0.016, -0.005], [torsoR(0.03) + 0.016, 0.03]], [0, 0, 0], { arc: [-0.68, 1.36], sc: [1, 1, 0.6], ...gold, g: 3 });
  if (b.level < 2) b.lathe([[0.18, 0.02], [0.204, 0.12], [0.22, 0.25], [0.222, 0.32]], [0, 0, 0], { arc: [-0.9, 1.8], sc: [1, 1, 0.64], c: 0xe0b040, m: 'gold', g: 5, a: [0.8, 1] });
}, true);

// ---------------------------------------------------------------- shields (elbow frame, on the outside of the forearm)
const KITE = [[-0.27, 0.29], [-0.14, 0.335], [0.14, 0.335], [0.27, 0.29], [0.275, 0.1], [0.22, -0.15], [0.12, -0.38], [0, -0.55], [-0.12, -0.38], [-0.22, -0.15], [-0.275, 0.1]];
def('shield.kite', (b) => {
  const c = [0.03, -0.12, 0.125];
  const sc = (k) => KITE.map(([x, y]) => [x * k, y * k + (k < 1 ? 0.012 : 0)]);
  if (b.level < 2) {
    b.extrude(sc(1), 0.034, 0.006, c, { ...iron, a: [0.7, 1] });
    b.extrude(sc(0.9), 0.036, 0.004, [c[0], c[1], c[2] + 0.004], { ...cloth, p: PAT.emblem, uv: [c[0], c[1] + 0.1, 0.46, 0.46], a: [0.8, 1] });
    b.rbox([c[0], c[1] - 0.1, c[2] + 0.025], [0.034, 0.7, 0.02], { c: K.trim, m: 'cloth', e: 0.4 });
    b.ell([c[0], c[1] + 0.1, c[2] + 0.034], [0.06, 0.06, 0.03], { ...steel });
  } else {
    b.extrude(sc(1), 0.04, 0, c, { ...cloth, p: PAT.emblem, uv: [c[0], c[1] + 0.1, 0.5, 0.5] });
  }
}, true);
def('shield.round', (b) => {
  const c = [0.03, -0.14, 0.13];
  b.lathe([[0.0, -0.034], [0.2, -0.026], [0.37, -0.01], [0.39, 0.0], [0.38, 0.02], [0.2, 0.034], [0.0, 0.04]], c, { rot: [PI / 2, 0, 0], ...cloth, p: PAT.emblem, uv: [c[0], c[1], 0.62, 0.62], a: [0.85, 1], seg: b.pick(22, 14, 9) });
  if (b.level < 2) {
    b.torus([c[0], c[1], c[2] - 0.004], 0.385, 0.02, { ...iron, sc: [1, 1, 1.4] });
    b.ell([c[0], c[1], c[2] + 0.034], [0.075, 0.075, 0.04], { ...steel });
    b.torus([c[0], c[1], c[2] + 0.01], 0.25, 0.008, { c: K.trim, m: 'cloth', sides: 3 });
    b.rbox([c[0], c[1], c[2] - 0.04], [0.06, 0.22, 0.03], { ...leather });
  }
}, true);
// the gilding of a trained soldier's shield (tier 3 and up)
def('kit.shield.round', (b) => {
  b.torus([0.03, -0.14, 0.13], 0.39, 0.03, { ...gold, sc: [1, 1, 1.1] });
  b.ell([0.03, -0.14, 0.17], [0.082, 0.082, 0.044], { ...gold });
});
def('kit.shield.kite', (b) => {
  b.rbox([0.03, -0.0, 0.16], [0.034, 0.7, 0.014], { ...gold, e: 0.4 });
  b.rbox([0.03, -0.24, 0.16], [0.5, 0.034, 0.014], { ...gold, e: 0.4 });
  b.ell([0.03, -0.02, 0.165], [0.062, 0.062, 0.03], { ...gold });
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
  b.rod([0, 0.35, 0], [0, -1.5, 0], 0.05, 0.15, { c: 0x5a3e24, m: 'wood', p: PAT.grain, seg: b.pick(12, 9, 6) });
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
// held in the shield hand (elbow frame): the grip is at the hand and the limbs run along the frame's z axis
def('bow', (b) => {
  const pts = [-0.64, -0.4, -0.2, 0, 0.2, 0.4, 0.64].map((z) => [0, -0.36 + 0.17 * (z / 0.64) ** 2, z]);
  b.sweep(pts, 0.022, 0.012, { c: K.wood, m: 'wood', p: PAT.grain, seg: 5, segs: b.pick(14, 10, 6) });
  b.rod([0, -0.19, -0.64], [0, -0.19, 0.64], 0.004, 0.004, { c: K.linen, m: 'cloth', seg: 3 });
  b.rod([0, -0.4, 0.07], [0, -0.3, -0.07], 0.026, 0.026, { ...leather });
}, true);
def('bow.long', (b) => {
  const pts = [-0.85, -0.55, -0.27, 0, 0.27, 0.55, 0.85].map((z) => [0, -0.36 + 0.2 * (z / 0.85) ** 2, z]);
  b.sweep(pts, 0.024, 0.012, { c: 0x8a6a3c, m: 'wood', p: PAT.grain, seg: 5, segs: b.pick(14, 10, 6) });
  b.rod([0, -0.16, -0.85], [0, -0.16, 0.85], 0.004, 0.004, { c: K.linen, m: 'cloth', seg: 3 });
  b.rod([0, -0.4, 0.07], [0, -0.3, -0.07], 0.026, 0.026, { ...leather });
}, true);

// ---------------------------------------------------------------- horses (frame at the ground below the middle of the animal)
// (a horse's coat takes the skin colour slot, its mane and tail the hair slot, its caparison the house cloth)
function saddle(b) {
  b.rbox([0, 1.78, -0.04], [0.42, 0.1, 0.56], { ...leather, e: 0.35 });
  b.rbox([0, 1.86, -0.3], [0.4, 0.14, 0.08], { ...leather, e: 0.35 });
  b.rbox([0, 1.86, 0.22], [0.1, 0.1, 0.06], { ...leather, e: 0.35 });
  b.rbox([0, 1.715, -0.05], [0.76, 0.06, 0.82], { ...cloth, e: 0.3 });
  if (b.level < 2) for (const s of [-1, 1]) b.rod([s * 0.28, 1.74, -0.04], [s * 0.33, 1.32, -0.04], 0.013, 0.013, { ...iron, seg: 4 });
}
function horseBody(b, barded) {
  const coat = { ...skin, a: [0.55, 1] };
  b.ell([0, 1.36, 0.0], [0.34, 0.4, 0.84], coat);
  b.ell([0, 1.4, 0.56], [0.32, 0.4, 0.36], coat);
  b.ell([0, 1.43, -0.58], [0.33, 0.38, 0.38], coat);
  if (b.level < 2) b.ell([0, 1.2, 0.15], [0.3, 0.2, 0.55], { ...skin, a: [0.35, 0.8] });
  saddle(b);
  if (barded) {
    for (const s of [-1, 1]) {
      const o = { rot: [0, s * PI / 2, 0], dz: (x, y) => 0.09 * ((0.375 - y) / 0.75), w: [0.8, 0] };
      b.sheet([s * 0.4, 1.27, -0.05], 1.5, 0.75, b.pick(6, 4, 2), b.pick(5, 3, 2), { ...cloth, ...o });
      if (b.level < 2) b.sheet([s * 0.4 + s * 0.0, 0.915, -0.05], 1.5, 0.05, b.pick(6, 4, 2), 1, { c: K.trim, m: 'cloth', rot: [0, s * PI / 2, 0], dz: () => 0.09, w: [0.8, 0.7] });
    }
    b.ell([0, 1.4, 0.6], [0.345, 0.42, 0.38], { ...cloth, a: [0.7, 1] });
  }
}
def('horse.body', (b) => horseBody(b, false), true);
def('horse.body.barded', (b) => horseBody(b, true), true);
function horseNeck(b, barded) {
  const coat = { ...skin, a: [0.7, 1] };
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
    const coat = { ...skin, a: [0.8, 1] };
    b.rod([0, 0, 0], [0, -0.6, 0], thick, 0.07, { ...coat, seg: b.pick(10, 8, 6) });
    b.ell([0, 0, 0], thick, { ...coat, seg: [10, 8] });
    b.ell([0, -0.6, 0], 0.07, { ...coat, seg: [8, 6] });
  });
  def('horse.low.' + kind, (b) => {
    const coat = { ...skin, a: [0.85, 1] };
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
const hang = (b, w, h, o, bend = 0.08) => b.sheet([0, -h / 2, -0.03], w, h, b.pick(8, 5, 3), b.pick(12, 8, 4), { ...o, w: [1.95, 1.0], dz: (x) => -bend * (x / (w / 2)) ** 2, a: [0.7, 1] });
// a band along the hem (swaying with the cloth) or the collar (still)
const hem = (b, w, h, y, o, bend = 0.08) => b.sheet([0, y, -0.034], w, 0.05, b.pick(8, 5, 3), 1, { ...o, w: [1.95, 1.9], dz: (x) => -bend * (x / (w / 2)) ** 2 });
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
  for (const s of [-1, 1]) b.ell([s * 0.2, 0.0, -0.045], [0.11, 0.06, 0.09], { ...fur, seg: [8, 6] });
}, true);
def('cape.midnight', (b) => {   // dark blue silk edged in silver
  const silver = { c: 0xc8ced8, m: 'steel' };
  hang(b, 0.58, 1.0, { c: 0x1c2756, m: 'silk', p: PAT.weave });
  hem(b, 0.58, 1.0, -0.99, silver);
  collar(b, 0.62, 0.06, silver);
  if (b.level < 2) b.rbox([0, 0.0, 0.1], [0.05, 0.05, 0.02], { ...silver, e: 0.4 });
}, true);
