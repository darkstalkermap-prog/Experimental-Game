// The first-person kit, modelled: hands (with open / grip / bowstring poses as morph targets), forearms and upper arms, weapons and shields.
// Every builder returns { geo, ...anchors } for viewmodel.js. Frames:
//   hand, sword: the grip is the y axis through the origin (blade up +y), blade flats face +z / -z
//   shield: origin at the middle of the face, +z toward the viewer
//   bow: origin at the grip, limbs along +y / -y, the belly bulges toward -z, the string is at +z
//   forearm: origin at the wrist, +z toward the elbow; upper arm: origin at the elbow, +z toward the shoulder
import * as THREE from 'three';
import { Mesher, paint, tone, blend, PAT, circle, framesAlong, bezier, lerp, smoothstep } from './vmgeo.js';
import { shieldFace } from './vmtex.js';
import { TEAM_COLORS } from './config.js';

// ---------------------------------------------------------------- paints
export const PAINT = {
  steel: paint(0xcdd3dc, 1, 0.27, PAT.steel),
  steelBright: paint(0xe9edf3, 1, 0.18, PAT.steel),
  steelDull: paint(0x9aa2ae, 1, 0.38, PAT.steel),
  iron: paint(0x6f747c, 0.9, 0.5, PAT.steel),
  gold: paint(0xd9b24a, 1, 0.3, PAT.steel),
  goldDark: paint(0x9a7a28, 1, 0.38, PAT.steel),
  leather: paint(0x3b2b1e, 0, 0.72, PAT.leather),
  leatherLight: paint(0x7a5634, 0, 0.7, PAT.leather),
  wood: paint(0x6b4a2c, 0, 0.7, PAT.wood),
  woodDark: paint(0x3c2a1a, 0, 0.7, PAT.wood),
  skin: paint(0xc89b7b, 0, 0.6, PAT.skin),
  cream: paint(0xe6dcc0, 0, 0.8, PAT.cloth),
  bone: paint(0xd8cfb4, 0, 0.55, 0),
};
const teamCloth = (team, k = 0.85) => tone(paint(TEAM_COLORS[team] ?? TEAM_COLORS[0], 0, 0.88, PAT.cloth), k);

export const sidesFor = (detail) => [7, 9, 12][Math.max(0, Math.min(2, detail))];
export { teamCloth };

// ---------------------------------------------------------------- hands
const FING = {
  x: [-0.027, -0.009, 0.009, 0.026],
  z: [-0.003, -0.005, -0.002, 0.004],
  len: [[0.040, 0.024, 0.020], [0.044, 0.027, 0.021], [0.041, 0.025, 0.020], [0.032, 0.019, 0.017]],
  rad: [0.0090, 0.0094, 0.0090, 0.0080],
};
// finger poses: flexion of each phalanx (radians), sideways splay, and four thumb control points (canonical right hand: palm down, fingers -z, thumb -x)
export const HAND_POSES = {
  open: { curl: [[0.12, 0.20, 0.10], [0.14, 0.22, 0.12], [0.16, 0.24, 0.12], [0.20, 0.28, 0.14]], splay: [-0.12, -0.03, 0.05, 0.14],
    thumb: [[-0.034, -0.004, 0.030], [-0.052, -0.008, 0.008], [-0.064, -0.010, -0.014], [-0.072, -0.009, -0.033]] },
  grip: { curl: [[1.30, 1.55, 0.95], [1.32, 1.60, 1.00], [1.36, 1.60, 1.00], [1.40, 1.55, 0.95]], splay: [0, 0, 0, 0],
    thumb: [[-0.034, -0.004, 0.030], [-0.047, -0.014, 0.006], [-0.040, -0.030, -0.016], [-0.020, -0.040, -0.030]] },
  string: { curl: [[0.95, 1.95, 0.90], [1.00, 2.00, 0.90], [1.00, 1.95, 0.90], [1.30, 1.60, 0.80]], splay: [0, 0, 0, 0],
    thumb: [[-0.034, -0.004, 0.030], [-0.044, -0.012, 0.008], [-0.034, -0.026, -0.010], [-0.018, -0.034, -0.022]] },
};

function fingerPath(x, z, len, curl, splay, sub) {
  const pts = [new THREE.Vector3(x, 0, z)];
  let th = 0;
  const p = pts[0].clone();
  for (let i = 0; i < len.length; i++) {
    const ds = len[i] / sub, dth = curl[i] / sub;
    for (let k = 0; k < sub; k++) {
      th += dth * 0.5;
      p.x += splay * ds; p.y -= Math.sin(th) * ds; p.z -= Math.cos(th) * ds;
      th += dth * 0.5;
      pts.push(p.clone());
    }
  }
  return pts;
}

// the centre of the circle the curled middle finger wraps (y, z), found by a least-squares fit: that is where the grip's axis runs
function fitCircle(pts) {
  let sy = 0, sz = 0, syy = 0, szz = 0, syz = 0, sr = 0, sry = 0, srz = 0;
  for (const p of pts) { const y = p.y, z = p.z, r = y * y + z * z; sy += y; sz += z; syy += y * y; szz += z * z; syz += y * z; sr += r; sry += r * y; srz += r * z; }
  const M = new THREE.Matrix3().set(syy, syz, sy, syz, szz, sz, sy, sz, pts.length).invert();
  const s = new THREE.Vector3(-sry, -srz, -sr).applyMatrix3(M);
  return { y: -s.x / 2, z: -s.y / 2 };
}
const GRIP_FIT = (() => { const p = fingerPath(FING.x[1], FING.z[1], FING.len[1], HAND_POSES.grip.curl[1], 0, 3); return fitCircle(p.slice(2)); })();

function handPose(m, pose, st, sub, sides) {
  const P = HAND_POSES[pose];
  const skin = st.hand, plate = st.plate || st.hand;
  // palm: a rounded slab from the wrist (z +0.05) to the knuckles (z -0.006)
  const zs = [0.05, 0.028, 0.006, -0.006];
  const hw = [0.027, 0.033, 0.037, 0.0375], ht = [0.0155, 0.0155, 0.0135, 0.012];
  const fr = zs.map((z) => ({ p: new THREE.Vector3(0, 0, z), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, -1, 0) }));
  m.sweep(fr, (i) => circle(sides + 4, hw[i], ht[i]), { mat: skin, capStart: true, capEnd: true });
  m.at(-0.029, -0.008, 0.022); m.sphere(0.0165, sides + 3, skin, [1, 0.8, 1.15]); m.pop();   // the ball of the thumb
  if (st.plate) { m.at(0, 0.0125, 0.012); m.chamfer(0.07, 0.007, 0.062, 0.006, st.plate); m.pop(); }   // back-of-hand plate
  for (let f = 0; f < 4; f++) {
    const pts = fingerPath(FING.x[f], FING.z[f], FING.len[f], P.curl[f], P.splay[f] * 0.35, sub);
    const r0 = FING.rad[f], n = pts.length;
    const rad = pts.map((_, i) => r0 * (1 - 0.2 * (i / (n - 1))) * (1 + (i % sub === 0 && i > 0 && st.plate ? 0.1 : 0)));
    m.tube(pts, rad, sides, { mat: st.plate ? plate : skin, cap: 'round', capSteps: 2 });
  }
  const th = new THREE.CatmullRomCurve3(P.thumb.map((a) => new THREE.Vector3(a[0], a[1], a[2]))).getPoints(sub * 2);
  m.tube(th, th.map((_, i) => 0.0112 - 0.0028 * (i / (th.length - 1))), sides, { mat: st.plate ? plate : skin, cap: 'round', capSteps: 2 });
}

// A hand in the grip frame (rod along y, through the origin; the thumb up for a right hand). styles: { hand, plate? }
// Base shape = open; morph 0 = grip, morph 1 = bowstring hook. anchors.wrist: where the forearm's wrist end joins.
export function handGeometry(side, st, detail = 1) {
  const sub = detail > 0 ? 3 : 2, sides = detail > 1 ? 7 : detail > 0 ? 6 : 5;
  const s = side === 'L' ? -1 : 1;
  const make = (pose) => {
    const m = new Mesher();
    m.at(0, 0, 0, 0, 0, -s * Math.PI / 2, [s, 1, 1]);   // palm down, thumb out -> handshake: thumb up, around a rod along y (mirrored for the left hand)
    m.at(0, -GRIP_FIT.y, -GRIP_FIT.z);
    handPose(m, pose, st, sub, sides);
    return m;
  };
  const base = make('open');
  const geo = base.build();
  Mesher.morph(geo, make('grip'), 'grip');
  Mesher.morph(geo, make('string'), 'string');
  // the wrist, in the grip frame: canonical (0, 0, 0.05) through the same two placements
  const w = new THREE.Vector3(0, 0, 0.05).add(new THREE.Vector3(0, -GRIP_FIT.y, -GRIP_FIT.z));
  w.set(w.y * s * 1 * (s === 1 ? 1 : 1), 0, 0.05 - GRIP_FIT.z);
  // (rotation by -s*90 degrees about z maps (x, y, z) to (s*y, -s*x, z) after the mirror, and the wrist has no x)
  return { geo, wrist: new THREE.Vector3(s * (-GRIP_FIT.y), 0, 0.05 - GRIP_FIT.z) };
}

// ---------------------------------------------------------------- arms
// st: { sleeve: paint|null (bare skin), cuff?: paint, vambrace?: paint, bracer?: paint, skin }
export function armGeometry(st, detail = 1) {
  const sides = sidesFor(detail) + 2;
  const L2 = 0.30, L1 = 0.32;
  const fm = new Mesher();
  const base = st.sleeve || st.skin;
  const r = (t, a, b) => lerp(a, b, t);
  const z = (n) => Array.from({ length: n }, (_, i) => [0, 0, (i / (n - 1)) * L2]);
  const bare = !st.sleeve;
  fm.tube(z(6), (t) => r(t, bare ? 0.0265 : 0.0285, bare ? 0.032 : 0.036), sides, { mat: (t) => tone(base, 1.0 - 0.14 * t), capStart: 'flat', capEnd: 'round' });
  if (st.flare) fm.tube([[0, 0, -0.004], [0, 0, 0.03], [0, 0, 0.09]], [0.046, 0.043, 0.037], sides, { mat: tone(base, 1.08), cap: 'flat' });   // a robe's wide sleeve
  if (st.cuff) fm.tube([[0, 0, -0.004], [0, 0, 0.01], [0, 0, 0.036]], [0.0315, 0.0325, 0.0365], sides, { mat: st.cuff, cap: 'flat' });
  if (st.bracer) fm.tube([[0, 0, 0.03], [0, 0, 0.045], [0, 0, 0.12], [0, 0, 0.135]], [0.0305, 0.0335, 0.0365, 0.0335], sides, { mat: st.bracer, cap: 'flat' });
  if (st.vambrace) {
    const zz = [0.1, 0.112, 0.13, 0.19, 0.23, 0.245, 0.255];
    fm.tube(zz.map((q) => [0, 0, q]), [0.0345, 0.0385, 0.0365, 0.0395, 0.0425, 0.0455, 0.041], sides, { mat: st.vambrace, cap: 'flat', smooth: true });
    for (const q of [0.102, 0.25]) fm.tube([[0, 0, q - 0.004], [0, 0, q + 0.004]], [q < 0.15 ? 0.0385 : 0.0465, q < 0.15 ? 0.0385 : 0.0465], sides, { mat: st.trim || PAINT.gold, cap: 'flat' });
    fm.at(0, 0, L2 - 0.01); fm.sphere(0.042, sides, st.vambrace, [1, 1, 0.9]); fm.pop();   // the elbow cop
  }
  const um = new Mesher();
  um.tube(Array.from({ length: 5 }, (_, i) => [0, 0, (i / 4) * L1]), (t) => r(t, bare ? 0.031 : 0.036, bare ? 0.038 : 0.043), sides, { mat: (t) => tone(base, 0.95 - 0.1 * t), cap: 'round' });
  return { fore: fm.build(), upper: um.build() };
}

// ---------------------------------------------------------------- the arming sword
// o: { len (blade), ls (level 0..2), detail }
export function swordGeometry(o) {
  const { len, ls } = o;
  const m = new Mesher();
  const sides = sidesFor(o.detail);
  const gilt = ls >= 2;
  const metal = PAINT.steel, trimP = ls >= 1 ? PAINT.gold : PAINT.steelDull;
  // grip (wrapped leather) and pommel
  const gp = [[0.0095, -0.098, 'h'], [0.0128, -0.092]];
  for (let i = 0; i <= 8; i++) gp.push([0.0128 + (i % 2 ? 0.0012 : 0), -0.092 + i * 0.0235]);
  gp.push([0.0105, 0.1, 'h']);
  m.lathe([[0, -0.098], ...gp, [0, 0.1]], sides + 2, { mat: PAINT.leather });
  m.at(0, -0.113, 0); m.lathe([[0, -0.016], [0.021, -0.014, 'h'], [0.032, -0.006], [0.034, 0.003], [0.03, 0.011], [0.016, 0.016, 'h'], [0.011, 0.02], [0, 0.021]], sides + 4, { mat: trimP }); m.pop();
  if (ls >= 2) { m.at(0, -0.113, 0.0); m.sphere(0.009, 8, paint(0xb02030, 0.2, 0.2, 0, 0.35), [1, 1, 1]); m.at(0, 0, 0); m.pop(); m.pop(); }
  // crossguard
  const gw = 0.115 + 0.012 * ls;
  m.at(0, 0.108, 0);
  m.tube([[-gw, -0.006, 0], [-gw * 0.55, 0.001, 0], [0, 0.003, 0], [gw * 0.55, 0.001, 0], [gw, -0.006, 0]], [0.0085, 0.0095, 0.011, 0.0095, 0.0085], sides, { mat: ls >= 2 ? PAINT.gold : metal, cap: 'round', up: [0, 0, 1], scale: [1, 0.8] });
  for (const sx of [-1, 1]) { m.at(sx * gw, -0.006, 0); m.sphere(0.0125, sides + 1, trimP); m.pop(); }
  m.chamfer(0.03, 0.03, 0.03, 0.006, ls >= 1 ? PAINT.gold : metal);
  m.pop();
  // blade: hexagonal section with a fuller, tapering to a point
  const y0 = 0.126, w0 = 0.027 + 0.0045 * ls, w1 = 0.0095, t0 = 0.0058, t1 = 0.0028;
  const steps = 16;
  const fr = [];
  for (let i = 0; i <= steps; i++) { const t = i / steps; fr.push({ p: new THREE.Vector3(0, y0 + t * len, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) }); }
  const edge = paint(0xeef1f6, 1, 0.2, PAT.steel), face = PAINT.steel;
  const inlay = ls >= 2 ? PAINT.gold : ls >= 1 ? paint(0x2d3039, 0.6, 0.5) : PAINT.steelDull;
  m.sweep(fr, (i, t) => {
    const taper = lerp(w0, w1, Math.pow(t, 0.9)), hw = taper * (t > 0.9 ? 1 - smoothstep(0.9, 1, t) * 0.97 : 1);
    const ht = lerp(t0, t1, t) * (t > 0.93 ? 1 - smoothstep(0.93, 1, t) : 1);
    const g = 0.0023 * smoothstep(0.02, 0.07, t) * (1 - smoothstep(0.72, 0.86, t));
    return [[hw, 0], [hw * 0.45, ht], [hw * 0.15, ht], [hw * 0.1, ht - g], [-hw * 0.1, ht - g], [-hw * 0.15, ht], [-hw * 0.45, ht],
      [-hw, 0], [-hw * 0.45, -ht], [-hw * 0.15, -ht], [-hw * 0.1, -(ht - g)], [hw * 0.1, -(ht - g)], [hw * 0.15, -ht], [hw * 0.45, -ht]];
  }, { smooth: false, capStart: true, mat: (t, i, j) => (j === 2 || j === 3 || j === 4 || j === 9 || j === 10 || j === 11 ? inlay : j === 0 || j === 7 || j === 13 || j === 6 ? edge : face) });
  return { geo: m.build(), tip: new THREE.Vector3(0, y0 + len, 0), base: new THREE.Vector3(0, y0 + len - 0.17, 0), guardY: 0.108 };
}

// ---------------------------------------------------------------- shields
const bronze = paint(0x8a6a3a, 1, 0.42, PAT.steel);
const SHIELD_STYLE = {
  knight: { rim: PAINT.steel, boss: PAINT.steel, k: 1 },
  berserker: { rim: PAINT.iron, boss: PAINT.iron, k: 0.95 },
  cavalier: { rim: PAINT.gold, boss: PAINT.steel, k: 1 },
  ranger: { rim: bronze, boss: bronze, k: 0.88 },
  mage: { rim: PAINT.gold, boss: PAINT.steelDull, k: 0.9 },
  cleric: { rim: PAINT.gold, boss: PAINT.gold, k: 0.95 },
};
// o: { cls, team, lv (0 round, 1 kite), detail }
export function shieldGeometry(o) {
  const m = new Mesher();
  const sides = sidesFor(o.detail) + 8;
  const sty = SHIELD_STYLE[o.cls] || SHIELD_STYLE.knight;
  const rimP = o.cls === 'knight' && o.lv >= 1 ? PAINT.gold : sty.rim, bossP = sty.boss, white = paint(0xffffff, 0, 0.55, 0);
  m.at(0, 0, 0, 0, 0, 0, sty.k);   // (the whole shield, a little smaller for the lighter classes)
  const back = PAINT.woodDark, strap = PAINT.leather;
  let shape, rimPts, half, bossAt = [0, 0];
  if (o.lv === 0) {
    const R = 0.21, depth = 0.04;
    shape = { kind: 'round', w: R * 2, h: R * 2 };
    const pos = (u, v) => { const a = u * Math.PI * 2; return [Math.cos(a) * v * R, Math.sin(a) * v * R, depth * (1 - v * v) - 0.004 * v]; };
    m.patch(sides * 2, 8, pos, { mat: white, flip: true, uv: (u, v) => { const a = u * Math.PI * 2; return [(0.5 + 0.5 * Math.cos(a) * v) * (480 / 512), 1 - (0.5 - 0.5 * Math.sin(a) * v) * (480 / 512)]; }, size: [R * 6, R] });
    m.patch(sides * 2, 4, (u, v) => { const p = pos(u, v); return [p[0], p[1], p[2] - 0.016 - 0.01 * (1 - v)]; }, { mat: back, size: [R * 6, R] });
    rimPts = [];
    for (let i = 0; i <= sides * 2; i++) { const a = (i / (sides * 2)) * Math.PI * 2; rimPts.push([Math.cos(a) * (R + 0.003), Math.sin(a) * (R + 0.003), -0.012 + 0.0]); }
    half = R;
    // boss
    m.at(0, 0, depth - 0.004, Math.PI / 2, 0, 0);
    m.lathe([[0, -0.004], [0.062, -0.004, 'h'], [0.062, 0.006], [0.052, 0.022], [0.03, 0.036], [0.012, 0.042], [0, 0.044]], sides + 4, { mat: bossP });
    m.pop();
  } else {
    const W = 0.175, H = 0.6, bulge = 0.04;
    shape = { kind: 'kite', w: W * 2, h: H };
    const hw = (v) => W * (v < 0.3 ? 1 : 1 - Math.pow((v - 0.3) / 0.7, 1.55));
    const pos = (u, v) => { const x = (2 * u - 1) * hw(v), c = 1 - (2 * u - 1) * (2 * u - 1); return [x, H / 2 - v * H + 0.02 * c * (1 - v) * (1 - v) * 3, bulge * c * (0.45 + 0.55 * (1 - v)) * (v > 0.97 ? 0 : 1) + 0.014 * (1 - (2 * v - 1) * (2 * v - 1))]; };
    const uvf = (x, y) => [(0.5 + 0.5 * x / W) * (480 / 512), 1 - ((H / 2 - y) / H) * (480 / 512)];
    m.patch(14, 20, pos, { mat: white, flip: true, uv: (u, v) => { const p = pos(u, v); return uvf(p[0], p[1]); }, size: [W * 2, H] });
    m.patch(14, 12, (u, v) => { const p = pos(u, v); return [p[0], p[1], p[2] - 0.022 - 0.01 * Math.sin(v * 3)]; }, { mat: back, size: [W * 2, H] });
    rimPts = [];
    for (let j = 0; j <= 18; j++) rimPts.push(pos(0, j / 18));
    for (let j = 1; j <= 18; j++) rimPts.push(pos(1, 1 - j / 18));
    for (let i = 1; i <= 14; i++) rimPts.push(pos(1 - i / 14, 0));
    rimPts = rimPts.map(([x, y, z]) => [x * 1.012, y, z - 0.012]);
    half = H / 2;
    bossAt = [0, H / 2 - 0.36 * H];
    m.at(bossAt[0], bossAt[1], pos(0.5, 0.36)[2] - 0.004, Math.PI / 2, 0, 0);
    m.lathe([[0, -0.004], [0.04, -0.004, 'h'], [0.04, 0.004], [0.033, 0.016], [0.018, 0.026], [0, 0.03]], sides + 2, { mat: bossP });
    m.pop();
  }
  m.tube(rimPts, 0.0125, 7, { mat: rimP, cap: 'round', smooth: true });
  // the strap and the grip on the back
  const gz = -0.05;
  m.at(0, o.lv === 0 ? 0 : bossAt[1], gz);
  m.tube([[-0.07, 0, 0], [0.07, 0, 0]], 0.011, 6, { mat: strap, cap: 'round' });
  m.tube([[0, 0.14, 0.012], [0, 0.12, 0], [0, -0.12, 0], [0, -0.14, 0.012]], 0.009, 5, { mat: strap, cap: 'round' });
  m.pop();
  m.pop();
  const geo = m.build();
  return { geo, map: shieldFace(o.cls, o.team, shape), half, shape };
}

// ---------------------------------------------------------------- the bow
// o: { lv (0 hunting, 1 war), detail } -> geo (relaxed; morph 0 = drawn), the nock point (relaxed) and the tips for the string
export function bowGeometry(o) {
  const sides = sidesFor(o.detail);
  const limbH = 0.62, build = (drawn) => {
    const m = new Mesher();
    const wood = o.lv ? PAINT.woodDark : PAINT.wood, lam = o.lv ? paint(0x2a2018, 0, 0.45, PAT.wood) : PAINT.leatherLight;
    for (const s of [1, -1]) {
      const pts = [];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const y = s * (0.07 + (limbH - 0.07) * t - (drawn ? 0.03 * t * t : 0));
        const z = 0.135 * Math.pow(t, 1.8) - 0.045 * smoothstep(0.86, 1, t) + (drawn ? 0.075 * Math.pow(t, 1.4) : 0);
        pts.push([0, y, z - 0.012 * (1 - t)]);
      }
      m.tube(pts, (t) => lerp(0.0165, 0.008, t), sides, { mat: (t) => (t < 0.5 ? wood : blend(wood, lam, 0.4)), cap: 'round', up: [1, 0, 0], scale: [1.35, 0.62] });
      const tip = pts[pts.length - 1];
      m.at(tip[0], tip[1], tip[2]); m.sphere(0.0105, sides, o.lv ? PAINT.gold : PAINT.bone, [1, 1.3, 1]); m.pop();
    }
    // riser and wrapped grip, arrow shelf
    m.tube([[0, -0.09, -0.012], [0, 0, -0.016], [0, 0.09, -0.012]], [0.0165, 0.0215, 0.0165], sides + 2, { mat: wood, cap: 'round', up: [1, 0, 0], scale: [1.1, 0.85] });
    m.tube([[0, -0.05, -0.016], [0, 0.05, -0.016]], 0.0245, sides + 2, { mat: PAINT.leather, cap: 'flat', up: [1, 0, 0], scale: [1.0, 0.9] });
    m.at(-0.02, 0.058, -0.016); m.chamfer(0.014, 0.012, 0.03, 0.003, PAINT.leatherLight); m.pop();
    return m;
  };
  const base = build(false);
  const geo = base.build();
  Mesher.morph(geo, build(true), 'drawn');
  return { geo, tipTop: new THREE.Vector3(0, limbH, 0.135 - 0.045), tipBottom: new THREE.Vector3(0, -limbH, 0.135 - 0.045), tipTopDrawn: new THREE.Vector3(0, limbH - 0.03, 0.135 - 0.045 + 0.075), tipBottomDrawn: new THREE.Vector3(0, -(limbH - 0.03), 0.135 - 0.045 + 0.075) };
}

// an arrow lying along -z with its nock at the origin
export function arrowGeometry(o) {
  const m = new Mesher();
  const len = 0.72, sides = 6;
  const shaft = o.lv ? paint(0x4a3a28, 0, 0.6, PAT.wood) : paint(0x9a7a4a, 0, 0.6, PAT.wood);
  m.tube([[0, 0, 0], [0, 0, -len]], 0.0036, sides, { mat: shaft, cap: 'flat' });
  m.tube([[0, 0, 0.004], [0, 0, -0.016]], 0.0052, sides, { mat: PAINT.bone, cap: 'round' });
  const feather = [paint(0xe9e2d0, 0, 0.8, 0), paint(0xe9e2d0, 0, 0.8, 0), teamCloth(o.team, 1.0)];
  for (let k = 0; k < 3; k++) {
    m.at(0, 0, 0, 0, 0, (k / 3) * Math.PI * 2);
    m.at(0, 0.0085, -0.07); m.chamfer(0.0016, 0.0125, 0.105, 0.0006, feather[k]); m.at(0, 0, 0, Math.PI / 2, 0, 0); m.pop(); m.pop();
    m.pop();
  }
  m.at(0, 0, -len, -Math.PI / 2, 0, 0);
  m.lathe([[0, -0.005], [0.0105, 0.0, 'h'], [0.0105, 0.012], [0.004, 0.044], [0, 0.056]], 6, { mat: PAINT.steel });
  m.pop();
  return { geo: m.build(), len };
}
