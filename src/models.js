// Soldiers, horses and heroes: their rigs (a hierarchy of joint Groups, no meshes), their poses and the list of shapes each wears.
// Nothing here owns a mesh: crowd.js draws every rig as instances of shared shapes (shapes.js), reading each part's joint matrix and
// the rig's per-instance look (colours and flags, see unitmat.js). A rig is the plain object built here:
//   { root, body, pelvis, torso, head, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, weapon, parts: [{ node, shape, on }], inst, ... }
// Limbs have two segments so knees and elbows bend. The weapon arm (R) is at -x and the shield arm (L) at +x, the soldier faces +z.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { UNIT_TYPES, TEAM_COLORS, RAIDER_TEAM } from './config.js';
import { Q } from './quality.js';
import { getShape, shapeGeo, SHAPES } from './shapes.js';
import { unitMaterial, unitMaterials } from './unitmat.js';
import { unitTextures } from './unittex.js';

export { unitMaterial };

const SKINS = [0xd2a07c, 0xc08a66, 0x9c6a4a, 0xe0b494];
const HAIR = [0x3b2a1a, 0x5a3c22, 0x1c1814, 0x8a6a3c, 0x6a6460];
const COATS = [0x5a3a22, 0x7a4e2c, 0x2a221c, 0x9a8a78, 0xd8d0c4, 0x8a5a30];
const RAIDER_CLOTH = [0x4d3a28, 0x3e3a30, 0x5a2e22];

export const WEAPON_TILT = { sword: -1.15, spear: -1.5, lance: -1.55, axe: -1.0, greataxe: -0.9, staff: -2.6, club: -0.9, mace: -1.0, bow: 0 };
// Drill Sergeants: every level of training puts a soldier in better kit (see shapes.js for the gates). The man stands a little taller.
export const TIER_SCALE = (tier) => 1 + 0.012 * tier;
export const SADDLE_Y = 1.0;   // how far a rider's root is raised to sit in the saddle

export function lookFor(seed) {
  const r = (n) => Math.floor(((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1 * 1000);
  return { skin: SKINS[r(1) % SKINS.length], hair: HAIR[r(2) % HAIR.length], beard: r(3) % 3 !== 0, face: r(4) % 6, style: r(5) % 3 };
}

// ---------------------------------------------------------------- what each kind wears
const BODY_PARTS = {
  mail: { chest: 'chest.mail', pelvis: 'pelvis.mail', leg: 'mail', arm: 'mail' },
  plate: { chest: 'chest.plate', pelvis: 'pelvis.plate', leg: 'plate', arm: 'plate' },
  gambeson: { chest: 'chest.gambeson', pelvis: 'pelvis.gambeson', leg: 'cloth', arm: 'cloth' },
  leather: { chest: 'chest.leather', pelvis: 'pelvis.leather', leg: 'cloth', arm: 'skin' },
  fur: { chest: 'chest.fur', pelvis: 'pelvis.fur', leg: 'skin', arm: 'skin' },
};
function descFor(type) {
  const t = UNIT_TYPES[type], bp = BODY_PARTS[t.body];
  return {
    ...bp, head: 'head.' + t.helmet, shield: t.shield || null, weapon: t.weapon, bow: t.weapon === 'bow' ? (type === 'longbowman' ? 'bow.long' : 'bow') : null,
    scale: t.scale || 1, cape: t.cape ? 'cape.long' : null, quiver: t.weapon === 'bow', giant: !!t.giant, mounted: !!t.mounted, plate: t.body === 'plate',
  };
}
// the six hero classes (the third-person bodies of other people's heroes, and bots)
const HERO_DESC = {
  knight: { ...BODY_PARTS.plate, head: 'head.great', shield: 'kite', weapon: 'sword', scale: 1.06, plate: true },
  berserker: { ...BODY_PARTS.fur, head: 'head.horned', shield: null, weapon: 'greataxe', scale: 1.08, arm: 'skin' },
  ranger: { ...BODY_PARTS.gambeson, arm: 'cloth', head: 'head.hood', shield: null, weapon: 'sword', bow: 'bow.long', quiver: true, cape: 'cape.cloak', scale: 1 },
  mage: { ...BODY_PARTS.leather, arm: 'leather', head: 'head.hood', shield: null, weapon: 'staff', scale: 1, cape: 'cape.cloak' },
  cleric: { ...BODY_PARTS.mail, head: 'head.nasal', shield: 'round', weapon: 'mace', scale: 1 },
  cavalier: { ...BODY_PARTS.plate, head: 'head.great', shield: 'kite', weapon: 'sword', scale: 1.05, plate: true, cape: 'cape.long' },
};
const PLUME_Y = { 'head.kettle': 0.3, 'head.nasal': 0.38, 'head.great': 0.34, 'head.crown': 0.28, 'head.horned': 0.3, 'head.hood': 0.3, 'head.none': 0.28 };

// ---------------------------------------------------------------- rigs
const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const bitOf = (gate) => 1 << (gate - 1);
function tierBits(t) {
  return (t >= 1 && t <= 3 ? bitOf(1) : 0) | (t >= 2 ? bitOf(2) : 0) | (t >= 3 ? bitOf(3) | bitOf(12) : 0) | (t >= 4 ? bitOf(4) : 0) | (t >= 5 ? bitOf(5) : 0);
}
const _col = new THREE.Color();
function setColor(arr, i, hex) { _col.set(hex); arr[i] = _col.r; arr[i + 1] = _col.g; arr[i + 2] = _col.b; }

// Build a posable soldier (the rig only: the crowd draws it). opts.hero: a hero class instead of a unit type's look.
export function buildSoldier(type, team, variant = Math.floor(Math.random() * 6), tier = 0, opts = null) {
  const desc = opts && opts.hero ? HERO_DESC[opts.hero] || HERO_DESC.knight : descFor(type);
  const raider = team === RAIDER_TEAM;
  const arm = raider && !desc.plate ? 'skin' : desc.arm;
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  body.scale.setScalar(desc.scale * (desc.giant ? 1 : TIER_SCALE(tier)));
  const pelvis = joint(body, 0, 0.95, 0);
  const hipL = joint(pelvis, 0.1, -0.03, 0), hipR = joint(pelvis, -0.1, -0.03, 0);
  const kneeL = joint(hipL, 0, -0.46, 0), kneeR = joint(hipR, 0, -0.46, 0);
  const torso = joint(pelvis, 0, 0.07, 0);
  const head = joint(torso, 0, 0.48, 0);
  const shL = joint(torso, 0.25, 0.41, 0), shR = joint(torso, -0.25, 0.41, 0);
  const elL = joint(shL, 0, -0.3, 0), elR = joint(shR, 0, -0.3, 0);
  const parts = [];
  const add = (node, name, on = true) => { const p = { node, shape: getShape(name), on }; parts.push(p); return p; };
  add(pelvis, desc.pelvis); add(torso, desc.chest); add(head, desc.head);
  add(hipL, 'thigh.' + desc.leg); add(hipR, 'thigh.' + desc.leg); add(kneeL, 'shin.' + desc.leg); add(kneeR, 'shin.' + desc.leg);
  const foreStyle = arm === 'leather' ? 'cloth' : arm;
  add(shL, 'arm.' + arm); add(shR, 'arm.' + arm); add(elL, 'fore.' + foreStyle); add(elR, 'fore.' + foreStyle);
  if (desc.shield) add(elL, 'shield.' + desc.shield);
  let weapon = null, weaponPart = null, bowPart = null;
  const wk = desc.weapon && desc.weapon !== 'none' && desc.weapon !== 'bow' ? desc.weapon : null;
  if (wk) {
    weapon = joint(elR, 0, -0.3, 0.02);
    weapon.rotation.x = WEAPON_TILT[wk] ?? -1;
    weaponPart = add(weapon, 'weapon.' + wk);
  }
  if (desc.bow) bowPart = add(elL, desc.bow, desc.weapon === 'bow');
  if (desc.cape) add(joint(torso, 0, 0.43, -0.19), desc.cape);
  if (desc.quiver) add(torso, 'quiver');
  const kit = add(torso, 'kit.torso', false);
  const kitArms = [add(shL, 'kit.arm', false), add(shR, 'kit.arm', false)];
  const kitShield = desc.shield ? add(elL, 'kit.shield.' + desc.shield, false) : null;
  const mount = joint(head, 0, PLUME_Y[desc.head] || 0.3, -0.02);
  const plumeC = add(mount, 'plume.cloth', false), plumeG = add(mount, 'plume.gold', false);
  const ranged = desc.weapon === 'bow';
  const look = lookFor(variant + 1);
  const m = {
    kind: 'soldier', type, team, variant, desc, raider, root, body, pelvis, torso, head, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, weapon,
    weaponTilt: WEAPON_TILT[wk] ?? -1, ranged, lance: desc.weapon === 'lance', mounted: !!desc.mounted, parts, kit, plumeC, plumeG, weaponPart, bowPart,
    kitArms, kitShield, tier: 0, rank: 1, inst: new Float32Array(16), headYaw: 0, hero: opts && opts.hero ? opts.hero : null,
  };
  m.farKey = `${m.hero || type}${raider && !desc.plate ? ':r' : ''}${m.mounted ? ':m' : ''}`;
  const face = raider ? 6 + (variant & 1) : look.face;
  setColor(m.inst, 0, raider ? (type === 'warlord' ? 0x5c1a14 : RAIDER_CLOTH[variant % 3]) : TEAM_COLORS[team] ?? 0xffffff);
  setColor(m.inst, 4, look.skin);
  setColor(m.inst, 8, look.hair);
  m.baseBits = (look.beard ? bitOf(6) : 0) | bitOf(7 + look.style);
  m.inst[3] = m.baseBits;
  m.inst[7] = (team > 4 ? 0 : team) + 8 * face;
  m.inst[12] = (variant * 0.37 + team * 0.11) % 1;
  root.userData.rig = m;
  if (tier) rigSetTier(m, tier);
  return m;
}
export function buildHeroBody(classId, team, variant = 2) { return buildSoldier('lord', team, variant, 0, { hero: classId }); }

// Better training, better kit: tier 1 steel pauldrons, 2 a cloak, 3 gold at the throat and on the shield, 4 gold pauldrons and wings on the
// helm, 5 a gilded breastplate and a long cloak.
export function rigSetTier(m, tier) {
  m.tier = tier;
  m.inst[3] = m.baseBits | tierBits(tier);
  m.kit.on = tier > 0;
  for (const p of m.kitArms) p.on = tier > 0;
  if (m.kitShield) m.kitShield.on = tier >= 3;
  m.body.scale.setScalar(m.desc.scale * (m.desc.giant ? 1 : TIER_SCALE(tier)));
}
// veterans wear a plume: team colour from rank 3, gold at rank 5
export function rigSetRank(m, rank) {
  m.rank = rank;
  m.plumeC.on = rank >= 3 && rank < 5;
  m.plumeG.on = rank >= 5;
  const s = rank >= 4 ? 1.25 : 1;
  m.plumeC.node.scale.setScalar(s);
}
// a hero swaps between melee weapon and bow
export function rigSetBow(m, bow) {
  if (!m.bowPart || !!m.bowOn === !!bow) return;
  m.bowOn = !!bow;
  m.bowPart.on = !!bow;
  if (m.weaponPart) m.weaponPart.on = !bow;
  m.ranged = !!bow;
}

// ---------------------------------------------------------------- the horse
export function buildHorse(team, variant = Math.floor(Math.random() * 6), barded = true) {
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  const neck = joint(body, 0, 1.62, 0.62), tail = joint(body, 0, 1.5, -1.0);
  const parts = [];
  const add = (node, name) => parts.push({ node, shape: getShape(name), on: true });
  add(body, barded ? 'horse.body.barded' : 'horse.body'); add(neck, barded ? 'horse.neck.barded' : 'horse.neck'); add(tail, 'horse.tail');
  const legs = [];
  for (const [x, z, kind] of [[0.2, 0.62, 'fore'], [-0.2, 0.62, 'fore'], [0.2, -0.68, 'hind'], [-0.2, -0.68, 'hind']]) {
    const up = joint(body, x, 1.22, z), low = joint(up, 0, -0.6, 0);
    add(up, 'horse.up.' + kind); add(low, 'horse.low.' + kind);
    legs.push({ up, low, kind });
  }
  const coat = COATS[variant % COATS.length];
  const h = { kind: 'horse', root, body, neck, tail, legs, parts, inst: new Float32Array(16), phase: Math.random() * 6, farKey: `horse:${barded ? 1 : 0}`, barded, headNod: 0 };
  setColor(h.inst, 0, team === RAIDER_TEAM ? 0x4d3a28 : TEAM_COLORS[team] ?? 0xffffff);
  setColor(h.inst, 4, coat);
  setColor(h.inst, 8, variant % COATS.length === 4 ? 0xb8b0a4 : 0x1e1814);
  h.inst[12] = (variant * 0.21) % 1;
  root.userData.rig = h;
  return h;
}

const GAITS = {   // phase of [foreL, foreR, hindL, hindR]
  walk: [Math.PI * 0.5, Math.PI * 1.5, 0, Math.PI],
  trot: [0, Math.PI, Math.PI, 0],
  gallop: [0, 0.5, 2.6, 3.1],
};
// Walk / trot / gallop cycle. speed in m/s.
export function poseHorse(h, speed, dt) {
  h.phase += dt * (2 + speed * 0.9);
  const f = h.phase;
  const g = speed < 0.4 ? 0 : speed < 3.4 ? 1 : speed < 6.8 ? 2 : 3;
  const offs = g === 3 ? GAITS.gallop : g === 2 ? GAITS.trot : GAITS.walk;
  const amp = g === 0 ? 0 : Math.min(0.85, 0.3 + speed * 0.07);
  const flex = g === 1 ? 0.8 : g === 2 ? 1.05 : 1.4;
  for (let i = 0; i < 4; i++) {
    const leg = h.legs[i], a = f + offs[i], hind = i > 1;
    leg.up.rotation.x = Math.sin(a) * amp * (hind ? 0.85 : 1);
    leg.low.rotation.x = g === 0 ? 0.03 : 0.05 + Math.max(0, -Math.cos(a)) * flex * Math.min(1, amp * 1.3) * (hind ? 0.9 : 1);
  }
  h.body.position.y = g === 0 ? 0 : Math.abs(Math.sin(f)) * (g === 3 ? 0.12 : g === 2 ? 0.05 : 0.02);
  h.body.rotation.x = g === 3 ? Math.sin(f + 0.6) * 0.05 : g === 2 ? Math.sin(f * 2) * 0.012 : 0;
  h.neck.rotation.x = g === 3 ? -0.05 + 0.09 * Math.sin(f + 1.2) : g === 0 ? 0.03 * Math.sin(f * 0.4) : 0.05 * Math.sin(f * 2 + 0.5);
  h.tail.rotation.x = g === 3 ? -0.55 : 0.08 + 0.06 * Math.sin(f * 0.8);
  h.tail.rotation.z = Math.sin(f * 0.7) * (g === 0 ? 0.18 : 0.08);
  h.inst[13] = Math.min(1, speed / 9);
}

// ---------------------------------------------------------------- poses
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

// Arm keyframes per attack direction, [shoulder x, elbow x, shoulder z, torso twist, weapon tilt offset] (the weapon arm is at -x, so
// outward is a negative z turn and a twist towards the weapon side is negative).
const WIND = {
  over: [-2.8, -1.3, 0, 0, 0],
  right: [-1.5, -1.3, -1.25, -0.45, -0.3],
  left: [-1.6, -1.7, 0.95, 0.5, -0.3],
  thrust: [-0.8, -2.1, -0.15, -0.3, -0.45],
};
const END = {
  over: [-0.5, -0.15, 0, 0.05, 0],
  right: [-1.4, -0.2, 0.7, 0.4, -0.3],
  left: [-1.4, -0.2, -0.8, -0.4, -0.3],
  thrust: [-1.55, 0, 0, 0.15, -0.45],
};
// How deep a crouch goes (hips back, thighs forward, knees folded, body lowered and leaning in), at full crouch.
const CROUCH = { hip: -1.45, knee: 2.0, drop: 0.5, back: 0.3, lean: 0.4, hipFwd: 0.25 };

// Pose a soldier for this frame.
// st: { phase, speed, moving, swingT, attackDir, stagger, hurt, mounted, blocking, crouch (0..1), climb, time, idle, look (head turn, rad) }
export function poseSoldier(m, st) {
  const sp = st.speed || 0, ph = st.phase || 0, idle = st.idle || 0;
  const mounted = !!st.mounted;
  const walking = !!st.moving && !mounted;
  const stride = walking ? Math.min(1, sp / 4.4) : 0, still = 1 - stride;
  const run = walking ? clamp01((sp - 3.6) / 2.6) : 0;
  const s1 = Math.sin(ph), c1 = Math.cos(ph), sway = Math.sin(idle * 0.5), breath = Math.sin(idle * 1.7);
  const cr = mounted ? 0 : st.crouch || 0, sc = m.body.scale.y;
  const P = m.pelvis, T = m.torso, H = m.head;
  let bodyY, tx, ty, tz;
  if (mounted) {
    // seated: thighs forward and splayed, shins hanging, swaying with the horse
    m.hipL.rotation.set(-1.25, 0, 0.35); m.hipR.rotation.set(-1.25, 0, -0.35);
    m.kneeL.rotation.set(1.35, 0, 0); m.kneeR.rotation.set(1.35, 0, 0);
    bodyY = st.moving ? Math.abs(Math.sin(ph)) * 0.06 : 0;
    P.rotation.set(0.04, 0, 0); P.position.x = 0;
    tx = st.moving ? 0.1 + Math.min(0.15, sp * 0.012) : 0.04 + 0.01 * breath; ty = 0; tz = 0;
  } else {
    const A = (0.34 + 0.3 * run) * stride, K = stride * (0.75 + 1.1 * run);
    m.hipL.rotation.set(A * s1, 0, 0.03); m.hipR.rotation.set(-A * s1, 0, -0.03);
    m.kneeL.rotation.set(0.06 + 0.06 * Math.max(0, sway) * still + K * Math.max(0, -c1), 0, 0);
    m.kneeR.rotation.set(0.06 + 0.06 * Math.max(0, -sway) * still + K * Math.max(0, c1), 0, 0);
    bodyY = -(0.016 + 0.034 * run) * stride * (1 - Math.cos(2 * ph)) * 0.5 + 0.004 * breath * still;
    P.rotation.set((0.04 + 0.07 * run) * stride, (0.1 + 0.1 * run) * stride * s1, 0.04 * c1 * stride + 0.03 * sway * still);
    P.position.x = 0.012 * sway * still;
    tx = 0.03 + 0.04 * stride + 0.1 * run * stride + 0.012 * breath * still;
    ty = -(0.12 + 0.12 * run) * stride * s1;
    tz = -0.03 * c1 * stride - 0.02 * sway * still;
  }
  // ducking: hips dropped and set back, thighs forward, knees folded, leaning in. Walking crouched is a shuffle.
  if (cr > 0) {
    const shuffle = st.moving ? Math.sin(ph) * Math.min(0.35, sp * 0.25) : 0;
    m.hipL.rotation.x += (CROUCH.hip + shuffle - m.hipL.rotation.x) * cr;
    m.hipR.rotation.x += (CROUCH.hip - shuffle - m.hipR.rotation.x) * cr;
    m.kneeL.rotation.x += (CROUCH.knee - m.kneeL.rotation.x) * cr;
    m.kneeR.rotation.x += (CROUCH.knee - m.kneeR.rotation.x) * cr;
    bodyY -= CROUCH.drop * cr * sc;
    tx += CROUCH.lean * cr;
  }
  m.body.position.set(0, bodyY, -CROUCH.back * cr * sc);
  m.hipL.position.z = m.hipR.position.z = CROUCH.hipFwd * cr;
  const swing = walking ? s1 * Math.min(0.55, sp * 0.1 + 0.05) : 0;
  // shield arm: the shield up in front (the bow arm relaxed)
  let lx, ly = 0, lz, le;
  if (m.ranged) { lx = -0.25 - swing * 0.4; lz = -0.1; le = -0.35; }
  else if (st.blocking) { lx = -1.25; ly = -0.3; lz = -0.2; le = -0.6; }
  else { lx = -0.45 - swing * 0.3; lz = -0.12; le = -0.75 - 0.4 * run; }
  // weapon arm: ready
  let sh = m.ranged ? -0.15 + swing * 0.5 : -0.3 + swing * 0.4, el = (m.ranged ? -0.3 : -0.55) - 0.45 * run, rz = 0;
  let twist = 0, tiltOff = 0, att = 0;
  if (m.lance && mounted) { sh = -0.5; el = -0.8; }
  const t = st.swingT;
  if (t >= 0) {
    if (m.ranged) {
      const a = Math.min(1, t / 0.35);
      lx = -1.52 * a; ly = 0; lz = -0.05; le = -0.05 * a;
      sh = -1.45 * a; el = -1.9 * a; rz = -0.15 * a;
      tx += 0.04 * a; twist = 0.25 * a;
    } else if (m.lance && mounted) {
      sh = -1.2; el = -0.3;
    } else {
      // directional swing: idle -> wind-up -> strike -> back to idle
      const W = WIND[st.attackDir] || WIND.over, E = END[st.attackDir] || END.over;
      const idleK = [sh, el, 0, 0, 0];
      let from, to, k;
      if (t < 0.25) { from = idleK; to = W; k = ease(t / 0.25); }
      else if (t < 0.4) { from = W; to = E; k = ease((t - 0.25) / 0.15); }
      else { from = E; to = idleK; k = ease(Math.min(1, (t - 0.4) / 0.22)); }
      sh = lerp(from[0], to[0], k); el = lerp(from[1], to[1], k); rz = lerp(from[2], to[2], k);
      twist = lerp(from[3], to[3], k); tiltOff = lerp(from[4], to[4], k);
      // the whole body takes the blow: a step in, a lean into the strike
      att = Math.sin(Math.min(1, t / 0.62) * Math.PI);
      if (!mounted) {
        m.hipR.rotation.x -= 0.4 * att; m.hipL.rotation.x += 0.28 * att;
        m.kneeL.rotation.x += 0.35 * att; m.kneeR.rotation.x += 0.15 * att;
        m.body.position.z += 0.09 * att; m.body.position.y -= 0.03 * att;
      }
      tx += 0.16 * att;
    }
  }
  const stag = st.stagger || 0, hurt = st.hurt || 0;
  if (stag > 0) {
    // knocked back: lean away, weapon arm flung out
    tx -= 0.4 * stag;
    sh = lerp(sh, -1.1, stag); rz = lerp(rz, -0.6, stag); el = lerp(el, -0.2, stag);
    m.kneeL.rotation.x += 0.25 * stag; m.kneeR.rotation.x += 0.25 * stag;
  }
  if (hurt > 0) { tx -= 0.2 * hurt; sh = lerp(sh, -0.9, hurt * 0.5); el = lerp(el, -0.3, hurt * 0.5); lx = lerp(lx, -0.9, hurt * 0.4); }
  const look = Math.max(-1.1, Math.min(1.1, st.look || 0));
  T.rotation.set(tx, ty + twist + look * 0.12, tz);
  P.rotation.y += twist * 0.4;
  H.rotation.set(-tx * 0.6 - 0.3 * (stag + hurt) + 0.02 * Math.sin(idle * 0.9), -(ty + P.rotation.y) * 0.5 + look * 0.85 + 0.12 * Math.sin(idle * 0.37) * Math.sin(idle * 0.11) * still, 0);
  m.shL.rotation.set(lx, ly, lz); m.elL.rotation.set(le, 0, 0);
  m.shR.rotation.set(sh, 0, rz); m.elR.rotation.set(el, 0, 0);
  if (m.weapon) m.weapon.rotation.x = m.weaponTilt + tiltOff;
  if (st.climb && !mounted) {
    // hauling up a wall: hands over each other above the head, feet scrabbling at the stone
    const w = (st.time || 0) * 9;
    m.shL.rotation.set(-2.7 + Math.sin(w) * 0.4, 0, -0.1);
    m.shR.rotation.set(-2.7 - Math.sin(w) * 0.4, 0, 0.1);
    m.elL.rotation.x = -0.3 - Math.max(0, Math.sin(w)) * 0.5;
    m.elR.rotation.x = -0.3 - Math.max(0, -Math.sin(w)) * 0.5;
    m.hipL.rotation.x = -0.5 + Math.sin(w + Math.PI) * 0.7;
    m.hipR.rotation.x = -0.5 + Math.sin(w) * 0.7;
    m.kneeL.rotation.x = 0.9 + Math.sin(w + Math.PI) * 0.6;
    m.kneeR.rotation.x = 0.9 + Math.sin(w) * 0.6;
    T.rotation.x = 0.12;
  }
  m.inst[13] = Math.min(1, sp / 7);
}

// A death: `t` seconds in. kind 0 falls backwards, 1 drops to the knees and pitches forward, 2 crumples to one side (side is +-1).
export function poseDeath(m, t, kind, side = 1) {
  const e1 = ease(clamp01(t / 0.3)), e2 = ease(clamp01((t - 0.18) / 0.6)), rest = ease(clamp01((t - 0.7) / 0.6));
  const J = (j, x, y, z) => j.rotation.set(x, y, z);
  const A = Math.PI / 2 - 0.08;
  m.pelvis.position.x = 0; m.pelvis.rotation.set(0, 0, 0);
  m.hipL.position.z = m.hipR.position.z = 0;
  m.body.rotation.set(0, 0, 0);
  m.body.position.set(0, 0, 0);
  if (kind === 0) {
    m.body.rotation.x = -A * e2; m.body.position.set(0, 0.05 * e2, 0.55 * e2);
    J(m.hipL, -0.5 * e1 + 0.5 * e2, 0, 0.15 * e2); J(m.hipR, -0.3 * e1 + 0.15 * e2, 0, -0.2 * e2);
    J(m.kneeL, 1.1 * e1 - 0.7 * e2, 0, 0); J(m.kneeR, 0.8 * e1 - 0.4 * e2, 0, 0);
    J(m.torso, -0.4 * e1 + 0.2 * e2, 0, 0.1 * e2); J(m.head, -0.5 * e1 + 0.65 * e2, 0.2 * e2, 0);
    J(m.shL, -1.5 * e1 + 1.2 * e2, 0, -0.6 * e2); J(m.elL, -0.3 * e1, 0, 0);
    J(m.shR, -1.2 * e1 + 1.0 * e2, 0, 0.8 * e2); J(m.elR, -0.5 * e1 + 0.2 * rest, 0, 0);
  } else if (kind === 1) {
    m.body.rotation.x = A * e2; m.body.position.set(0, -0.42 * e1 * (1 - e2) + 0.02 * e2, -0.45 * e2);
    J(m.hipL, -1.3 * e1 * (1 - e2) - 0.25 * e2, 0, 0.1 * e2); J(m.hipR, -1.2 * e1 * (1 - e2) - 0.1 * e2, 0, -0.12 * e2);
    J(m.kneeL, 2.1 * e1 * (1 - e2) + 0.35 * e2, 0, 0); J(m.kneeR, 2.0 * e1 * (1 - e2) + 0.2 * e2, 0, 0);
    J(m.torso, 0.5 * e1 - 0.3 * e2, 0, 0); J(m.head, -0.2 * e1 + 0.5 * e2, 0.4 * e2, 0);
    J(m.shL, -0.3 * e1 - 1.4 * e2, 0, -0.5 * e2); J(m.elL, -0.4 * e1, 0, 0);
    J(m.shR, -0.2 * e1 - 1.6 * e2, 0, 0.5 * e2); J(m.elR, -0.4 * e1, 0, 0);
  } else {
    m.body.rotation.z = side * A * e2; m.body.position.set(0.55 * side * e2, 0.04 * e2, 0);
    J(m.hipL, -0.8 * e1 + 0.3 * e2, 0, 0.1); J(m.hipR, -0.4 * e1 - 0.3 * e2, 0, -0.1);
    J(m.kneeL, 1.3 * e1 - 0.4 * e2, 0, 0); J(m.kneeR, 0.9 * e1 + 0.3 * e2, 0, 0);
    J(m.torso, 0.3 * e1, 0, -0.3 * side * e2); J(m.head, 0.3 * e1, 0.3 * side * e2, 0.2 * side * e2);
    J(m.shL, -0.6 * e1 - 0.5 * e2, 0, -0.5 * e2); J(m.elL, -0.8 * e1, 0, 0);
    J(m.shR, -0.6 * e1 - 0.2 * e2, 0, 0.5 * e2); J(m.elR, -0.9 * e1, 0, 0);
  }
  if (m.weapon) m.weapon.rotation.x = m.weaponTilt - 0.4 * e1;
}
// a fallen horse: down on its side, the legs folded
export function poseHorseDead(h, t) {
  const e = ease(clamp01(t / 0.8));
  h.root.rotation.z = 0;
  h.body.position.y = 0; h.body.rotation.set(0, 0, 0);
  h.legs.forEach((l, i) => { l.up.rotation.x = (i < 2 ? -0.7 : 0.5) * e + Math.sin(t * 9 + i) * 0.1 * (1 - ease(clamp01(t / 2.5))) * e; l.low.rotation.x = 1.1 * e; });
  h.neck.rotation.x = 0.35 * e; h.tail.rotation.x = 0.2 * e;
}

// ---------------------------------------------------------------- baked models: the far-away look, and the static meshes other modules ask for
const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _tint = new THREE.Color();
const farCache = new Map();
const bakeCache = new Map();

// the triangles of a part with the gates that are not set cut out, moved into the frame `inv` and optionally with the colour slots resolved
function bakePart(geo, M, bits, inst) {
  const g = geo.clone();
  const gate = g.attributes.aSurf, idx = g.index.array, keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    const gt = gate.getW(idx[i]);
    if (gt !== 0) {
      const on = (bits >> (Math.abs(gt) - 1)) & 1;
      if ((gt > 0) !== !!on) continue;
    }
    keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(keep);
  g.applyMatrix4(M);
  const sg = g.attributes.aSurf;
  for (let i = 0; i < sg.count; i++) sg.setW(i, 0);   // (what is left is always shown)
  if (inst) {
    const col = g.attributes.color, sf = g.attributes.aSurf;
    for (let i = 0; i < col.count; i++) {
      const slot = Math.round(sf.getZ(i));
      if (!slot) continue;
      const s = col.getX(i);
      const o = slot === 1 ? 0 : slot === 2 || slot === 6 ? 4 : slot === 3 ? 8 : 0;
      _tint.setRGB(inst[o], inst[o + 1], inst[o + 2]);
      const k = slot === 4 ? 0.5 : slot === 6 ? 0.7 : 1;
      col.setXYZ(i, _tint.r * s * k, _tint.g * s * k, _tint.b * s * k);
      sf.setZ(i, 0);
    }
  }
  return g;
}
function bakeRig(m, level, resolve, keepPose) {
  if (!keepPose) { if (m.kind === 'horse') poseHorse(m, 0, 0); else poseSoldier(m, { phase: 0, speed: 0, moving: false, swingT: -1, mounted: m.mounted }); }
  m.root.updateMatrixWorld(true);
  _inv.copy(m.body.matrixWorld).invert();
  const bits = resolve && m.kind === 'soldier' ? Math.round(m.inst[3]) : 0;
  const list = [];
  for (const p of m.parts) {
    if (!p.on) continue;
    // (far away the small things do not show: hands, tier kit, plumes, the quiver)
    if (level === 3 && /^(fore|kit|plume|quiver)/.test(p.shape.name)) continue;
    _rel.multiplyMatrices(_inv, p.node.matrixWorld);
    list.push(bakePart(shapeGeo(p.shape, level), _rel.clone(), bits, resolve ? m.inst : null));
  }
  const geo = mergeGeometries(list);
  for (const g of list) g.dispose();
  geo.computeBoundingSphere();
  return geo;
}
// the one static model that stands in for a rig far away: { name, open, geo: [..., geometry at index 3] } (see crowd.js)
export function farShapeOf(m) {
  let f = farCache.get(m.farKey);
  if (!f) {
    // (baked from a rig of its own: the one asked about may be mid-stride, or lying dead)
    const t = m.kind === 'horse' ? buildHorse(0, 0, m.barded) : buildSoldier(m.type, m.raider ? RAIDER_TEAM : 0, 0, 0, m.hero ? { hero: m.hero } : null);
    f = { name: 'far:' + m.farKey, open: true, geo: [null, null, null, bakeRig(t, 3, false)] };
    farCache.set(m.farKey, f);
  }
  return f;
}
// A static mesh of a rig's current pose, colours included (for modules that put a soldier on a wall and the like): the mesh is hidden at first.
export function bakedMesh(key, root) {
  if (!bakeCache.has(key)) {
    const m = root.userData.rig;
    if (!m) throw new Error('bakedMesh needs a rig built by buildSoldier');
    bakeCache.set(key, bakeRig(m, 2, true, true));
  }
  const mesh = new THREE.Mesh(bakeCache.get(key), unitMaterial());
  mesh.visible = false;
  return mesh;
}

// ---------------------------------------------------------------- warming and shared resources
// The shapes a kind of soldier wears are built a few at a time (one per call) so a new arrival never stalls a frame.
const warmed = new Set(), warmTasks = [];
// (the rich shapes are for soldiers close by; everyone farther away wears the plain ones, so a crowd stays cheap)
export const geoLevel = (lod) => (lod === 0 ? Math.max(0, 2 - Q.detail) : 2);
export function prewarmSoldier(type, team, variant, tier = 0) {
  const key = type + ':' + (team === RAIDER_TEAM ? 'r' : '');
  if (!warmed.has(key) && UNIT_TYPES[type]) {
    warmed.add(key);
    const m = buildSoldier(type, team, variant, tier);
    const levels = [...new Set([geoLevel(0), geoLevel(1), 3])];
    for (const p of m.parts) if (p.on || p.shape.name.startsWith('kit') || p.shape.name.startsWith('plume')) for (const l of levels) warmTasks.push([p.shape, l]);
    warmTasks.push([m, 3]);
    if (m.mounted) { const h = buildHorse(team, variant, team !== RAIDER_TEAM); for (const p of h.parts) for (const l of levels) warmTasks.push([p.shape, l]); warmTasks.push([h, 3]); }
    return;
  }
  warmStep();
}
export function warmStep() {
  const task = warmTasks.shift();
  if (!task) return false;
  if (task[0].kind) farShapeOf(task[0]); else shapeGeo(task[0], task[1]);
  return true;
}

// These resources outlive individual worlds and must survive map replacement.
export function sharedModelResources() {
  const out = [...unitMaterials(), ...unitTextures()];
  for (const s of SHAPES.values()) for (const g of s.geo) if (g) out.push(g);
  for (const f of farCache.values()) out.push(f.geo[3]);
  for (const g of bakeCache.values()) out.push(g);
  return out;
}
