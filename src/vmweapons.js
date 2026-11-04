// The other classes' first-person weapons, modelled like the arming sword in vmkit.js: the grip is the y axis through the origin, the
// weapon points up +y. Each builder returns { geo, tip, base, focus? } (tip and base are where the swing trail is drawn between; focus is
// where a caster's spell gathers). o: { len (the sword's blade length at this level), ls (level 0..2), team, detail }.
import * as THREE from 'three';
import { Mesher, paint, tone, blend, PAT, framesAlong, bezier, lerp, smoothstep } from './vmgeo.js';
import { PAINT, sidesFor, teamCloth, swordGeometry } from './vmkit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// a wrapped grip along y (ridges are the cord binding)
function wrappedGrip(m, y0, y1, r, mat, sides, ridges = 9) {
  const gp = [[0, y0], [r * 0.78, y0, 'h']];
  for (let i = 0; i <= ridges; i++) gp.push([r + (i % 2 ? 0.0012 : 0), y0 + 0.004 + (i / ridges) * (y1 - y0 - 0.008)]);
  gp.push([r * 0.85, y1, 'h'], [0, y1]);
  m.lathe(gp, sides + 2, { mat });
}

export function weaponGeometry(cls, o) {
  switch (cls) {
    case 'berserker': return axeGeometry(o);
    case 'cavalier': return saberGeometry(o);
    case 'ranger': return shortSwordGeometry(o);
    case 'mage': return staffGeometry(o);
    case 'cleric': return maceGeometry(o);
    default: return swordGeometry(o);
  }
}

// ---------------------------------------------------------------- cavalry sabre: curved blade, knuckle bow
function saberGeometry(o) {
  const { len, ls } = o, m = new Mesher(), sides = sidesFor(o.detail);
  const gold = PAINT.gold, metal = PAINT.steel;
  wrappedGrip(m, -0.098, 0.098, 0.0125, PAINT.leather, sides);
  m.at(0, -0.112, 0);
  m.lathe([[0, -0.02], [0.016, -0.018, 'h'], [0.026, -0.008], [0.026, 0.006], [0.018, 0.014, 'h'], [0.011, 0.02], [0, 0.022]], sides + 2, { mat: gold });
  m.pop();
  m.tube([[-0.075, 0.1, 0], [0, 0.106, 0], [0.075, 0.1, 0]], 0.0085, sides, { mat: ls >= 2 ? gold : metal, cap: 'round', up: [0, 0, 1] });
  m.tube(bezier([0.075, 0.1, 0], [0.16, 0.0, 0], [0.056, -0.108, 0], 10), 0.0072, sides, { mat: gold, cap: 'round' });
  m.at(0, 0.106, 0); m.chamfer(0.026, 0.026, 0.026, 0.005, gold); m.pop();
  const n = 14, y0 = 0.118, bend = 0.085, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-bend * t * t, y0 + t * (len * 0.98), 0]); }
  m.at(0, 0.098, 0); m.cyl(0.0145, 0.0145, -0.005, 0.004, sides + 2, gold); m.pop();   // the ferrule
  const edge = paint(0xeef1f6, 1, 0.16, PAT.steel), fuller = ls >= 2 ? PAINT.goldDark : PAINT.steelDull;
  // the section: a bevelled true edge, a broad fuller on each face, a thick rounded back
  m.sweep(framesAlong(pts, [0, 0, 1]), (i, t) => {
    const hw = lerp(0.0185 + 0.002 * ls, 0.0125, t) * (t > 0.88 ? 1 - smoothstep(0.88, 1, t) * 0.96 : 1);
    const ht = lerp(0.0036, 0.0022, t) * (t > 0.92 ? 1 - smoothstep(0.92, 1, t) : 1);
    const f = 1 - 0.3 * smoothstep(0.03, 0.1, t) * (1 - smoothstep(0.62, 0.78, t));
    return [[0, hw], [-ht, hw * 0.55], [-ht * f, hw * 0.05], [-ht * 1.3, -hw * 0.6], [-ht * 0.9, -hw * 0.95], [ht * 0.9, -hw * 0.95], [ht * 1.3, -hw * 0.6], [ht * f, hw * 0.05], [ht, hw * 0.55]];
  }, { smooth: false, capStart: true, mat: (t, i, j) => (j === 0 || j === 8 ? edge : j === 1 || j === 2 || j === 6 || j === 7 ? (t > 0.05 && t < 0.72 ? fuller : metal) : metal) });
  const tipP = pts[n];
  return { geo: m.build(), tip: V(tipP[0], tipP[1], 0), base: V(pts[12][0], pts[12][1], 0) };
}

// ---------------------------------------------------------------- ranger's short sword: broad leaf blade, plain guard
function shortSwordGeometry(o) {
  const L = o.len * 0.74, ls = o.ls, m = new Mesher(), sides = sidesFor(o.detail);
  wrappedGrip(m, -0.09, 0.09, 0.0125, PAINT.leatherLight, sides, 7);
  m.at(0, -0.102, 0); m.sphere(0.021, sides + 2, ls >= 1 ? PAINT.goldDark : PAINT.iron, [1, 0.8, 1]); m.pop();
  m.tube([[-0.05, 0.088, 0], [-0.025, 0.101, 0], [0.025, 0.101, 0], [0.05, 0.088, 0]], 0.0075, sides, { mat: ls >= 1 ? PAINT.goldDark : PAINT.iron, cap: 'round', up: [0, 0, 1] });
  const y0 = 0.108, fr = [], steps = 12;
  for (let i = 0; i <= steps; i++) fr.push({ p: V(0, y0 + (i / steps) * L, 0), u: V(1, 0, 0), v: V(0, 0, -1) });
  m.at(0, -0.124, 0); m.lathe([[0, -0.004], [0.006, -0.004, 'h'], [0.0075, 0.002], [0, 0.004]], sides, { mat: PAINT.steelDull }); m.pop();   // the peened tang
  m.at(0, 0.101, 0); m.chamfer(0.026, 0.02, 0.022, 0.005, ls >= 1 ? PAINT.goldDark : PAINT.iron); m.pop();   // the guard's block
  const edge = paint(0xeef1f6, 1, 0.18, PAT.steel), groove = ls >= 2 ? PAINT.goldDark : PAINT.steelDull;
  // a leaf blade: bevelled edges, a short fuller down the middle of each face from the guard
  m.sweep(fr, (i, t) => {
    const hw = (0.015 + 0.0125 * Math.sin(Math.PI * Math.pow(t, 0.62))) * (t > 0.9 ? 1 - smoothstep(0.9, 1, t) * 0.96 : 1);
    const ht = lerp(0.0052, 0.0028, t) * (t > 0.94 ? 1 - smoothstep(0.94, 1, t) : 1);
    const g = 0.0018 * smoothstep(0.0, 0.06, t) * (1 - smoothstep(0.45, 0.6, t));
    return [[hw, 0], [hw * 0.4, ht], [0, ht - g], [-hw * 0.4, ht], [-hw, 0], [-hw * 0.4, -ht], [0, -(ht - g)], [hw * 0.4, -ht]];
  }, { smooth: false, capStart: true, mat: (t, i, j) => (j === 0 || j === 3 || j === 4 || j === 7 ? edge : t < 0.55 ? groove : PAINT.steel) });
  return { geo: m.build(), tip: V(0, y0 + L, 0), base: V(0, y0 + L - 0.15, 0) };
}

// ---------------------------------------------------------------- berserker's war axe: a long two-hand haft, a bearded head (double by level 2)
// The haft is bound in leather where both hands go and the head is held on by iron langets riveted down the wood; the bit is dark forged
// iron with a polished, unevenly honed edge, flaring into a beard that hooks back toward the haft. Level 1 adds a longer back spike,
// level 2 a second, smaller bit behind and gilded bands.
function axeGeometry(o) {
  const ls = o.ls, m = new Mesher(), sides = sidesFor(o.detail);
  const fine = o.detail > 0;
  const top = 0.6 + 0.07 * ls, butt = -0.24;
  const band = ls >= 2 ? PAINT.gold : PAINT.iron, dark = paint(0x5a5d63, 0.45, 0.6, PAT.steel);
  const ash = paint(0x7a5634, 0, 0.66, PAT.wood);
  // the haft: ash, a little oval and swelling toward the head, as a hafted axe is
  m.tube([[0, butt, 0], [0.002, -0.06, 0], [0, 0.22, 0.003], [0, top, 0]], [0.0165, 0.0172, 0.0168, 0.0158], sides + 1, { mat: ash, cap: 'round', scale: [1.06, 0.94] });
  // grip wraps: the main hand at the origin, the other near the butt; a raised welt at each end of a wrap
  wrappedGrip(m, -0.105, 0.11, 0.0196, PAINT.leather, sides, fine ? 13 : 7);
  wrappedGrip(m, butt + 0.035, butt + 0.12, 0.0194, PAINT.leatherLight, sides, fine ? 7 : 5);
  for (const y of [-0.105, 0.11, butt + 0.035, butt + 0.12]) { m.at(0, y, 0); m.cyl(0.0215, 0.0215, -0.0035, 0.0035, sides, band); m.pop(); }
  // an iron butt cap, flared
  m.at(0, butt, 0);
  m.lathe([[0, -0.016], [0.012, -0.015, 'h'], [0.021, -0.006], [0.021, 0.004, 'h'], [0.0182, 0.022], [0, 0.022]], sides + 2, { mat: PAINT.iron });
  m.pop();
  // the head's socket, and the langets down the haft (two flat straps on the faces, riveted through)
  const hy = top - 0.085, H = 0.235 + 0.055 * ls, Lh = 0.19 + 0.035 * ls;
  m.at(0, hy, 0); m.chamfer(0.05, 0.085 + 0.01 * ls, 0.044, 0.006, dark); m.pop();
  for (const y of [hy - 0.046, hy + 0.044]) { m.at(0, y, 0); m.chamfer(0.054, 0.007, 0.048, 0.003, band); m.pop(); }
  const lanL = 0.15 + 0.02 * ls;
  for (const s of [-1, 1]) {
    m.at(0, hy - 0.045 - lanL / 2, s * 0.0165); m.chamfer(0.011, lanL, 0.004, 0.0012, PAINT.iron); m.pop();
    if (fine) for (let k = 0; k < 3; k++) { m.at(0, hy - 0.07 - k * (lanL - 0.04) / 2, s * 0.0185); m.sphere(0.0032, 6, PAINT.steelDull, [1, 1, 0.6]); m.pop(); }
  }
  // a bit swept out along x from the socket; each section runs from the top edge down to the beard, which drops and hooks back
  const bit = (dirX, len, h, beard) => {
    const fr = [], N = fine ? 11 : 7, K = fine ? 14 : 10;
    for (let i = 0; i <= N; i++) fr.push({ p: V(dirX * (0.022 + (i / N) * len), hy, 0), u: V(0, 1, 0), v: V(0, 0, dirX) });
    const edge = paint(0xe8ecf1, 1, 0.16, PAT.steel), hone = paint(0x9aa1aa, 0.8, 0.38, PAT.steel);
    m.sweep(fr, (i, t) => {
      const topY = lerp(0.03, h * 0.4, smoothstep(0.15, 1, t) * 0.8 + t * 0.2);
      const botY = -lerp(0.03, h * 0.6, Math.pow(smoothstep(0.08, 1, t), 1.4)) * (beard ? 1 : 0.8);
      const mid = (topY + botY) / 2, half = (topY - botY) / 2;
      // thickness: a thick cheek by the socket thinning to the bevel, then the bevel down to the edge
      const th = t < 0.8 ? lerp(0.024, 0.0075, Math.pow(t / 0.8, 0.8)) : lerp(0.0075, 0.0012, (t - 0.8) / 0.2);
      const pts = [];
      for (let k = 0; k < K; k++) {
        const a = (k / K) * Math.PI * 2, cy = Math.cos(a), sy = Math.sin(a);
        // the crescent: the middle of the edge bellies out; the beard's point hooks back toward the haft
        const out = 0.055 * t * t * (1 - cy * cy) - (beard && cy < 0 ? 0.05 * Math.pow(t, 3) * cy * cy : 0);
        pts.push([mid + half * Math.sign(cy) * Math.pow(Math.abs(cy), 0.7), th * Math.sign(sy) * Math.pow(Math.abs(sy), 0.8), out]);
      }
      return pts;
    }, { smooth: true, capEnd: true, mat: (t, i, j) => {
      const wave = 0.025 * Math.sin(j * 2.3 + dirX);   // (the hone line wanders: an edge worked by hand, and worn)
      return t > 0.86 + wave ? edge : t > 0.74 + wave ? hone : ls >= 2 && t > 0.1 && t < 0.15 ? PAINT.goldDark : dark;
    } });
  };
  bit(-1, Lh, H, true);
  if (ls >= 2) bit(1, Lh * 0.62, H * 0.7, false);
  else m.tube([[0.024, hy, 0], [0.07, hy, 0], [0.105 + 0.03 * ls, hy + 0.008, 0]], [0.019, 0.013, 0.003], sides, { mat: ls >= 1 ? PAINT.steelDull : PAINT.iron, cap: 'round', up: [0, 0, 1], scale: [1, 0.7] });   // the poll: a spike behind
  // the haft's end through the socket, capped
  m.at(0, hy + 0.05, 0); m.lathe([[0, 0], [0.016, 0, 'h'], [0.013, 0.012], [0, 0.018]], sides, { mat: band }); m.pop();
  return { geo: m.build(), tip: V(-0.02 - Lh, hy - H * 0.15, 0), base: V(-0.02 - Lh * 0.5, hy, 0), reachTop: top };
}

// ---------------------------------------------------------------- mage's staff with a glowing crystal
function staffGeometry(o) {
  const ls = o.ls, m = new Mesher(), sides = sidesFor(o.detail);
  const top = 0.92 + 0.12 * ls, bottom = -0.34;
  m.tube([[0, bottom, 0], [0.002, 0.2, 0], [0, top - 0.04, 0]], [0.0135, 0.0165, 0.0125], sides, { mat: (t) => (t > 0.3 && t < 0.52 ? PAINT.leather : PAINT.woodDark), cap: 'round' });
  m.at(0, bottom + 0.02, 0); m.cyl(0.0165, 0.0165, -0.03, 0.04, sides, PAINT.iron); m.pop();
  wrappedGrip(m, -0.1, 0.1, 0.0172, PAINT.leatherLight, sides, o.detail > 0 ? 11 : 7);   // (where the hand holds it, a wrap of cord)
  const rune = paint(0xffcf70, 0.6, 0.3, 0, 0.7);
  for (const y of [0.34, 0.62, top - 0.14]) { m.at(0, y, 0); m.cyl(0.0185, 0.0185, 0, 0.007, sides, rune); m.pop(); }
  const crystalY = top + 0.045;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4, c = Math.cos(a), s = Math.sin(a);
    m.tube(bezier([0, top - 0.05, 0], [c * 0.05, top + 0.02, s * 0.05], [c * 0.02, crystalY + 0.045, s * 0.02], 7), [0.008, 0.0075, 0.0055, 0.004, 0.003, 0.003, 0.0028, 0.0025], 5, { mat: PAINT.goldDark, cap: 'round' });
  }
  m.at(0, crystalY, 0);
  m.lathe([[0, -0.045], [0.026, -0.005, 'h'], [0.03, 0.012, 'h'], [0.02, 0.05, 'h'], [0, 0.085]], 6, { mat: paint(0xff9a4a, 0, 0.12, 0, 1.0), crease: -2 });
  m.pop();
  return { geo: m.build(), tip: V(0, top + 0.1, 0), base: V(0, top - 0.22, 0), focus: V(0, crystalY + 0.02, 0), glow: true };
}

// ---------------------------------------------------------------- cleric's flanged mace
function maceGeometry(o) {
  const ls = o.ls, m = new Mesher(), sides = sidesFor(o.detail);
  const top = 0.36 + 0.05 * ls, gold = ls >= 2 ? PAINT.gold : PAINT.goldDark, head = ls >= 1 ? PAINT.steel : PAINT.iron;
  m.tube([[0, -0.16, 0], [0, 0.1, 0], [0, top, 0]], [0.0155, 0.0145, 0.0135], sides, { mat: (t) => (t < 0.42 ? PAINT.leather : PAINT.wood), cap: 'round' });
  wrappedGrip(m, -0.14, 0.08, 0.0162, PAINT.leather, sides, o.detail > 0 ? 11 : 7);
  m.at(0, 0.085, 0); m.cyl(0.0175, 0.0165, -0.006, 0.006, sides, gold); m.pop();
  m.at(0, -0.16, 0); m.sphere(0.022, sides, gold); m.pop();
  const hy = top + 0.055;
  m.at(0, hy, 0); m.sphere(0.04, sides + 3, head);
  // eight flanges, each a wedge whose outline rises straight to a point a little above the middle, its edge filed bright
  const fl = [], TS = o.detail > 0 ? [0, 0.2, 0.42, 0.62, 0.76, 0.89, 1] : [0, 0.32, 0.62, 1], bright = paint(0xe2e6ec, 1, 0.2, PAT.steel);
  for (const t of TS) fl.push({ p: V(0.028, -0.052 + t * 0.108, 0), u: V(1, 0, 0), v: V(0, 0, -1) });
  for (let k = 0; k < 8; k++) {
    m.at(0, 0, 0, 0, (k / 8) * Math.PI * 2, 0);
    m.sweep(fl, (i) => {
      const t = TS[i];
      const r = t < 0.62 ? lerp(0.012, 0.05, t / 0.62) : lerp(0.05, 0.016, (t - 0.62) / 0.38), th = 0.0055 * (1 - 0.4 * t);
      return [[0, -th], [r * 0.7, -th * 0.8], [r, -th * 0.25], [r + 0.002, 0], [r, th * 0.25], [r * 0.7, th * 0.8], [0, th]];
    }, { smooth: false, capStart: true, capEnd: true, mat: (t, i, j) => (j === 2 || j === 3 ? bright : head) });
    m.pop();
  }
  m.at(0, 0.0, 0); m.cyl(0.044, 0.044, -0.01, 0.01, sides + 3, gold); m.pop();
  m.tube([[0, 0.03, 0], [0, 0.07, 0], [0, 0.115, 0]], [0.014, 0.011, 0.003], sides, { mat: gold, cap: 'round' });
  m.pop();
  m.at(0, top, 0); m.cyl(0.022, 0.022, 0, 0.012, sides, gold); m.pop();
  return { geo: m.build(), tip: V(0, hy + 0.05, 0), base: V(0, hy - 0.12, 0), focus: V(0, hy + 0.05, 0), glow: false };
}

// ---------------------------------------------------------------- the cavalier's couched lance (mounted)
export function lanceGeometry(o) {
  const m = new Mesher(), sides = sidesFor(o.detail), team = teamCloth(o.team, 1.0), cream = paint(0xe6dcc0, 0, 0.8, PAT.wood);
  const top = 2.25;
  m.tube([[0, -0.14, 0], [0, 0.6, 0], [0, top, 0]], [0.021, 0.0205, 0.0125], sides, { mat: (t) => (t > 0.33 && Math.floor(t * 14) % 2 ? team : PAINT.wood), cap: 'round' });
  m.at(0, 0.13, 0);
  m.lathe([[0.016, -0.02], [0.028, 0.0, 'h'], [0.05, 0.035], [0.056, 0.05, 'h'], [0.04, 0.07], [0.016, 0.07]], sides + 4, { mat: PAINT.steel });
  m.pop();
  m.at(0, top, 0);
  m.lathe([[0, -0.01], [0.016, 0.0, 'h'], [0.016, 0.03], [0.006, 0.12], [0, 0.17]], 6, { mat: PAINT.steel });
  m.pop();
  // a swallow-tailed pennant just under the point
  m.at(0.0, top - 0.12, 0.0);
  m.patch(4, 4, (u, v) => [-(0.03 + 0.34 * u), 0.05 - 0.1 * v * (1 - 0.5 * u) - 0.02 * u * Math.sin(u * 6) , 0.02 * Math.sin(u * 7)], { mat: team });
  m.patch(4, 4, (u, v) => [-(0.03 + 0.34 * u), 0.05 - 0.1 * v * (1 - 0.5 * u) - 0.02 * u * Math.sin(u * 6), 0.02 * Math.sin(u * 7)], { mat: team, flip: true });
  m.pop();
  void cream;
  return { geo: m.build(), tip: V(0, top + 0.17, 0), base: V(0, top - 0.8, 0) };
}

// ---------------------------------------------------------------- a ranger's quiver (origin at its mouth, hanging toward -y); only the feathers show at the screen's corner
export function quiverGeometry(o) {
  const m = new Mesher(), sides = sidesFor(o.detail) + 1;
  m.tube([[0, -0.46, 0], [0, -0.2, 0], [0, 0, 0]], [0.04, 0.052, 0.055], sides, { mat: PAINT.leather, cap: 'flat' });
  m.tube([[0, -0.012, 0], [0, 0.008, 0]], [0.062, 0.062], sides, { mat: PAINT.leatherLight, cap: 'flat' });
  const feather = [paint(0xe9e2d0, 0, 0.8, 0), teamCloth(o.team, 1.0)];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3, x = Math.cos(a) * 0.026, z = Math.sin(a) * 0.026, top = 0.17 + (k % 3) * 0.025;
    m.tube([[x, -0.1, z], [x, top, z]], 0.004, 5, { mat: PAINT.wood, cap: 'flat' });
    for (let v = 0; v < 3; v++) { m.at(x, top - 0.07, z, 0, (v / 3) * Math.PI * 2 + k, 0); m.at(0.0, 0, 0.007); m.chamfer(0.0016, 0.085, 0.014, 0.0006, feather[(k + v) % 2]); m.pop(); m.pop(); }
  }
  return m.build();
}

// ---------------------------------------------------------------- a flask for the healing draught (origin at the neck's middle, +y up)
export function flaskGeometry(o) {
  const m = new Mesher(), sides = sidesFor(o.detail) + 3;
  const glass = paint(0xcfe8e8, 0, 0.08, 0, 0);
  m.lathe([[0, -0.115], [0.03, -0.108], [0.052, -0.08], [0.058, -0.05], [0.05, -0.015], [0.024, 0.012], [0.014, 0.03], [0.014, 0.075], [0.019, 0.085, 'h'], [0.019, 0.095], [0.014, 0.096]], sides, { mat: glass });
  const flask = m.build();
  const l = new Mesher();
  l.lathe([[0, -0.108], [0.028, -0.102], [0.048, -0.076], [0.053, -0.05], [0.046, -0.02], [0.02, 0.005], [0, 0.006]], sides, { mat: paint(0x8f1018, 0, 0.25, 0, 0.12) });
  const liquid = l.build();
  const c = new Mesher();
  c.at(0, 0.093, 0); c.cyl(0.0125, 0.012, 0, 0.03, sides, paint(0x8a6a3a, 0, 0.7, PAT.wood)); c.pop();
  const cork = c.build();
  return { flask, liquid, cork };
}
