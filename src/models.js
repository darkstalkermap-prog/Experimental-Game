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
import { unitTextures, emblemCell, setRigEmblem } from './unittex.js';
import { SKIRT } from './modelkit.js';
import { buildGiant, poseGiant, poseGiantDead } from './giantmodel.js';

export { unitMaterial };

const SKINS = [0xd2a07c, 0xc08a66, 0x9c6a4a, 0xe0b494];
const HAIR = [0x3b2a1a, 0x5a3c22, 0x1c1814, 0x8a6a3c, 0x6a6460];
const COATS = [0x5a3a22, 0x7a4e2c, 0x2a221c, 0x9a8a78, 0xd8d0c4, 0x8a5a30];
const RAIDER_CLOTH = [0x4d3a28, 0x3e3a30, 0x5a2e22];

export const WEAPON_TILT = { sword: -1.15, spear: -1.5, lance: -1.55, axe: -1.0, greataxe: -0.9, staff: -2.6, club: -0.9, mace: -1.0, bow: 0 };
// How each weapon is turned about its own grip in the fist: a blade is gripped with its edges in line with the knuckles (the sword
// is modelled with its edges across the hand, so it is turned a quarter); an axe's bit already faces where the knuckles do.
const WEAPON_ROLL = { sword: Math.PI / 2 };
// Drill Sergeants: every level of training puts a soldier in better kit (see shapes.js for the gates). The man stands a little taller.
export const TIER_SCALE = (tier) => 1 + 0.012 * tier;
export const SADDLE_Y = 1.03;   // how far a rider's root is raised to sit in the saddle

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
    ...bp, head: 'head.' + t.helmet, shield: t.shield === 'kite' && (type === 'knight' || type === 'lord') ? 'kiteL' : t.shield || null,   // (knights carry the tall kite) weapon: t.weapon, bow: t.weapon === 'bow' ? (type === 'longbowman' ? 'bow.long' : 'bow') : null,
    scale: t.scale || 1, cape: t.cape ? 'cape.long' : null, quiver: t.weapon === 'bow', giant: !!t.giant, mounted: !!t.mounted, plate: t.body === 'plate',
  };
}
// the six hero classes (the third-person bodies of other people's heroes, and bots)
const HERO_DESC = {
  knight: { ...BODY_PARTS.plate, head: 'head.great', shield: 'kiteL', weapon: 'sword', scale: 1.06, plate: true },
  berserker: { ...BODY_PARTS.fur, head: 'head.horned', shield: null, weapon: 'greataxe', scale: 1.08, arm: 'skin' },
  ranger: { ...BODY_PARTS.gambeson, arm: 'cloth', head: 'head.hood', shield: null, weapon: 'sword', bow: 'bow.long', quiver: true, cape: 'cape.cloak', scale: 1 },
  mage: { ...BODY_PARTS.leather, arm: 'leather', head: 'head.hood', shield: null, weapon: 'staff', scale: 1, cape: 'cape.cloak' },
  cleric: { ...BODY_PARTS.mail, head: 'head.nasal', shield: 'round', weapon: 'mace', scale: 1 },
  cavalier: { ...BODY_PARTS.plate, head: 'head.great', shield: 'kite', weapon: 'sword', scale: 1.05, plate: true, cape: 'cape.long' },
};
const PLUME_Y = { 'head.kettle': 0.31, 'head.nasal': 0.33, 'head.great': 0.33, 'head.crown': 0.3, 'head.horned': 0.31, 'head.hood': 0.31, 'head.none': 0.3 };

// ---------------------------------------------------------------- rigs
const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const bitOf = (gate) => 1 << (gate - 1);
function tierBits(t) {
  return (t >= 1 && t <= 3 ? bitOf(1) : 0) | (t >= 2 ? bitOf(2) : 0) | (t >= 3 ? bitOf(3) | bitOf(12) : 0) | (t >= 4 ? bitOf(4) : 0) | (t >= 5 ? bitOf(5) : 0);
}
const _col = new THREE.Color();
function setColor(arr, i, hex) { _col.set(hex); arr[i] = _col.r; arr[i + 1] = _col.g; arr[i + 2] = _col.b; }

// (a giant is not a man scaled up: he is broader and deeper for his height, or he looks a beanpole)
function bodyScale(body, desc, tier) {
  const s = desc.scale * (desc.giant ? 1 : TIER_SCALE(tier)), w = desc.giant ? 1.22 : 1;
  body.scale.set(s * w, s, s * w);
}
// Build a posable soldier (the rig only: the crowd draws it). opts.hero: a hero class instead of a unit type's look.
export function buildSoldier(type, team, variant = Math.floor(Math.random() * 6), tier = 0, opts = null) {
  let desc = opts && opts.hero ? HERO_DESC[opts.hero] || HERO_DESC.knight : descFor(type);
  if (opts && opts.cape && SHAPES.has(opts.cape)) desc = { ...desc, cape: opts.cape };   // a cloak the lord has earned (progress.js)
  const raider = team === RAIDER_TEAM;
  if (desc.giant && !(opts && opts.hero)) return buildGiant(type, team, variant, raider ? RAIDER_CLOTH[variant % 3] : TEAM_COLORS[team] ?? 0xffffff, desc);   // (an ettin of its own: giantmodel.js)
  const arm = raider && !desc.plate ? 'skin' : desc.arm;
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  bodyScale(body, desc, tier);
  // (a man of 1.8 m: hip joints at 0.95, knees at 0.51, the waist at 1.07, shoulder joints at 1.43, elbows at 1.12, the neck at 1.5)
  const pelvis = joint(body, 0, 0.97, 0);
  const hipL = joint(pelvis, 0.09, -0.02, 0), hipR = joint(pelvis, -0.09, -0.02, 0);
  const kneeL = joint(hipL, 0, -0.44, 0), kneeR = joint(hipR, 0, -0.44, 0);
  const torso = joint(pelvis, 0, 0.1, 0);
  const head = joint(torso, 0, 0.435, -0.012);
  const shL = joint(torso, 0.195, 0.36, -0.01), shR = joint(torso, -0.195, 0.36, -0.01);
  const elL = joint(shL, 0, -0.31, 0), elR = joint(shR, 0, -0.31, 0);
  const parts = [];
  const add = (node, name, on = true) => { const p = { node, shape: getShape(name), on }; parts.push(p); return p; };
  add(pelvis, desc.pelvis); add(torso, desc.chest); add(head, desc.head);
  add(hipL, 'thigh.' + desc.leg); add(hipR, 'thigh.' + desc.leg); add(kneeL, 'shin.' + desc.leg); add(kneeR, 'shin.' + desc.leg);
  const foreStyle = arm === 'leather' ? 'cloth' : arm;
  add(shL, 'arm.' + arm); add(shR, 'arm.' + arm); add(elL, 'fore.' + foreStyle); add(elR, 'fore.' + foreStyle);
  if (desc.shield) add(elL, 'shield.' + desc.shield);
  let weapon = null, weaponPart = null, bowPart = null, bowDrawn = null;
  const wk = desc.weapon && desc.weapon !== 'none' && desc.weapon !== 'bow' ? desc.weapon : null;
  if (wk) {
    weapon = joint(elR, 0, -0.31, 0.004);   // (in the fist)
    weapon.rotation.set(WEAPON_TILT[wk] ?? -1, WEAPON_ROLL[wk] || 0, 0);
    weaponPart = add(weapon, 'weapon.' + wk);
  }
  if (desc.bow) { bowPart = add(elL, desc.bow, desc.weapon === 'bow'); bowDrawn = add(elL, desc.bow + '.drawn', false); }
  const cape = desc.cape ? joint(torso, 0, 0.42, -0.125) : null;
  if (cape) add(cape, desc.cape);
  if (desc.quiver) add(torso, 'quiver');
  const kit = add(torso, 'kit.torso', false);
  const kitArms = [add(shL, 'kit.arm', false), add(shR, 'kit.arm', false)];
  const kitShield = desc.shield ? add(elL, 'kit.shield.' + desc.shield, false) : null;
  const mount = joint(head, 0, PLUME_Y[desc.head] || 0.3, -0.02);
  const plumeC = add(mount, 'plume.cloth', false), plumeG = add(mount, 'plume.gold', false);
  const ranged = desc.weapon === 'bow';
  const look = lookFor(variant + 1);
  const m = {
    kind: 'soldier', type, team, variant, desc, raider, root, body, pelvis, torso, head, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, weapon, cape,
    weaponTilt: WEAPON_TILT[wk] ?? -1, weaponRoll: WEAPON_ROLL[wk] || 0, ranged, lance: desc.weapon === 'lance', mounted: !!desc.mounted, parts, kit, plumeC, plumeG, weaponPart, bowPart, bowDrawn,
    kitArms, kitShield, tier: 0, rank: 1, inst: new Float32Array(16), headYaw: 0, hero: opts && opts.hero ? opts.hero : null,
  };
  m.farKey = `${m.hero || type}${raider && !desc.plate ? ':r' : ''}${m.mounted ? ':m' : ''}`;
  const face = raider ? 6 + (variant & 1) : look.face;
  setColor(m.inst, 0, raider ? (type === 'warlord' ? 0x5c1a14 : RAIDER_CLOTH[variant % 3]) : TEAM_COLORS[team] ?? 0xffffff);
  setColor(m.inst, 4, look.skin);
  setColor(m.inst, 8, look.hair);
  m.baseBits = (look.beard ? bitOf(6) : 0) | bitOf(7 + look.style);
  m.inst[3] = m.baseBits;
  m.faceIdx = face;
  setRigEmblem(m, opts && opts.cell >= 0 ? opts.cell : emblemCell(team));   // (the house's emblem, or its lord's arms: heraldry.js)
  m.inst[12] = (variant * 0.37 + team * 0.11) % 1;
  root.userData.rig = m;
  if (tier) rigSetTier(m, tier);
  return m;
}
// (`cell`: the emblem cell of the arms the hero's lord bears, heraldry.js; -1 for the house's own)
export function buildHeroBody(classId, team, variant = 2, cape = null, cell = -1) { return buildSoldier('lord', team, variant, 0, { hero: classId, cape, cell: cell >= 0 ? cell : team > 4 || team < 0 ? 0 : team }); }

// Better training, better kit: tier 1 steel pauldrons, 2 a cloak, 3 gold at the throat and on the shield, 4 gold pauldrons and wings on the
// helm, 5 a gilded breastplate and a long cloak.
export function rigSetTier(m, tier) {
  if (m.giant) return;   // (no kit to show, and the giant's build is its own)
  m.tier = tier;
  m.inst[3] = m.baseBits | tierBits(tier);
  m.kit.on = tier > 0;
  for (const p of m.kitArms) p.on = tier > 0;
  if (m.kitShield) m.kitShield.on = tier >= 3;
  bodyScale(m.body, m.desc, tier);
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
  m.bowDrawn.on = false;
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
// outward is a negative z turn and a twist towards the weapon side is negative). With the edge in line with the knuckles (WEAPON_ROLL)
// the edge leads every one of these blows, the sideways ones too (the swing carries the fist round with it).
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
// ---------------------------------------------------------------- a shot with the bow
// On the shot's clock t (seconds; the arrow flies at DRAW.loose): the archer turns side-on to the mark (the head stays on it), the bow arm
// comes up straight at it with the bow upright, and the string hand draws back along the arrow's line to the anchor under the jaw, the
// draw elbow up and behind; at the loose the string snaps home and the hand flies on back past the jaw; then the bow comes down. Both arms
// are solved in the torso's frame as two bones with a hinged elbow. ('bow.drawn' is the bow bent with an arrow on the string: its nock
// sits where this pose puts the anchor, so the two must change together.)
const DRAW = { turn: -0.95, raise: 0.2, pull: [0.1, 0.4], loose: 0.55, lower: 0.72, end: 0.9, arrow: 0.7, brace: 0.15 };
const BONE = 0.31;   // (upper arm and forearm, to the fist)
const SHOULDER_L = new THREE.Vector3(0.195, 0.36, -0.01), SHOULDER_R = new THREE.Vector3(-0.195, 0.36, -0.01);
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _anchor = new THREE.Vector3(), _grip = new THREE.Vector3(), _hand = new THREE.Vector3(), _pole = new THREE.Vector3();
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();
export const drawWeight = (t) => (t < 0 ? 0 : t < DRAW.lower ? ease(clamp01(t / DRAW.raise)) : 1 - ease(clamp01((t - DRAW.lower) / (DRAW.end - DRAW.lower))));
// put the fist of the arm (shoulder joint sh at S, elbow joint el) on tgt, the elbow bent toward pole; with `up`, the arm's frame is
// turned so its z points that way (the bow upright in the hand). w blends from the pose already set.
function reachArm(sh, el, S, tgt, pole, w, up) {
  _d.subVectors(tgt, S);
  const len = _d.length(), d = Math.min(len, BONE * 1.998);
  _d.multiplyScalar(1 / Math.max(len, 1e-4));
  const h = Math.sqrt(Math.max(BONE * BONE - d * d / 4, 0));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _e.copy(S).addScaledVector(_d, d / 2).addScaledVector(_p, h);
  _u.subVectors(_e, S).normalize();
  _f.copy(S).addScaledVector(_d, d).sub(_e).normalize();
  _y.copy(_u).negate();
  if (up) { _z.copy(up).addScaledVector(_y, -up.dot(_y)).normalize(); _x.crossVectors(_y, _z); }
  else { _x.crossVectors(_f, _u).normalize(); _z.crossVectors(_x, _y); }
  let bend = Math.atan2(-_f.dot(_z), -_f.dot(_y));
  if (bend > 0.01 && !up) { _x.negate(); _z.negate(); bend = Math.atan2(-_f.dot(_z), -_f.dot(_y)); }   // (an elbow only bends one way)
  _q.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
  sh.quaternion.slerp(_q, w);
  el.rotation.set(lerp(el.rotation.x, bend, w), 0, 0);
}
function drawPose(m, t) {
  const w = drawWeight(t);
  const drawn = m.bowPart.on || m.bowDrawn.on;
  if (w <= 0 || !drawn) { if (m.bowDrawn.on) { m.bowDrawn.on = false; m.bowPart.on = true; } return; }
  const loosed = t >= DRAW.loose, pull = loosed ? 1 : ease(clamp01((t - DRAW.pull[0]) / (DRAW.pull[1] - DRAW.pull[0])));
  const fly = loosed ? ease(clamp01((t - DRAW.loose) / 0.08)) : 0;   // (the hand flying back off the string)
  const psi = m.pelvis.rotation.y + m.torso.rotation.y;   // (the torso's turn: the mark is straight ahead of the feet)
  _dir.set(-Math.sin(psi), 0, Math.cos(psi));
  _right.set(-Math.cos(psi), 0, -Math.sin(psi));
  _anchor.set(0, 0.47, -0.012).addScaledVector(_dir, 0.1).addScaledVector(_right, 0.02);
  _grip.copy(_anchor).addScaledVector(_dir, DRAW.arrow); _grip.y -= 0.03;
  if (loosed) _hand.copy(_anchor).addScaledVector(_dir, -0.12 * fly).addScaledVector(_right, 0.06 * fly);
  else _hand.copy(_grip).addScaledVector(_dir, -lerp(DRAW.brace, DRAW.arrow, pull));
  reachArm(m.shL, m.elL, SHOULDER_L, _grip, DOWN, w, UP);
  _pole.copy(_dir).negate().addScaledVector(UP, 0.7).normalize();
  reachArm(m.shR, m.elR, SHOULDER_R, _hand, _pole, w);
  m.head.rotation.y = lerp(m.head.rotation.y, -psi, w);
  const bent = !loosed && pull > 0.55 && w > 0.5;
  m.bowDrawn.on = bent; m.bowPart.on = !bent;
}

// How deep a crouch goes (hips back, thighs forward, knees folded, body lowered and leaning in), at full crouch.
const CROUCH = { hip: -1.45, knee: 2.0, drop: 0.47, back: 0.3, lean: 0.5, hipFwd: 0.25 };

// ---------------------------------------------------------------- the motion layer
// A man's pose is worked out afresh every frame from what he is doing, but what carries him from one frame to the next is kept on the rig
// (m.anim, made at its first pose), so that nothing snaps, slides or floats:
//  - His feet are planted. Each stands where it was put down, in the world, until it is lifted for the next step; the steps are timed by a
//    gait clock whose cadence and stride come from how fast the root really travels (so a guest's view of another hero, a soldier shoved by
//    the crowd or carried by an engine steps as he goes, and a walk turns into a run with flight in it as he speeds up). The legs reach the
//    feet with two-bone IK; the hips come down where a stride is long; an ankle is lifted onto the heel or the toe as the shin tilts over the
//    foot. Standing, a foot steps only when the body has turned or been pushed off it; stopping, the last steps bring the feet together.
//    On a slope each foot finds its own ground (st.gx, st.gz: the ground's rise per metre, x and z).
//  - Every switch is blended. The gradual ones (a guard raised, a stagger, a climb, a jump) by weights that ease toward their targets; the
//    abrupt ones (a blow cut short or seen late on a guest, the bow taken out, mounting, landing, death) by carrying the jump in the joints
//    as an offset that dies away in a fraction of a second: the new pose plays at once, only the difference fades.
//  - What hangs off him lags and settles: the arms' swing, the cape and its billow, the plume. He leans into a start and back from a stop,
//    banks into turns, settles into the wind-up of a blow and follows it through, and a hit throws him the way it came.
// st (all optional): { dt, x, y, z, yaw (the root this frame, world; else the root's own), phase, speed, moving, swingT, attackDir, stagger,
//   hurt, mounted, blocking, crouch (0..1), climb, air, time, idle, look (head turn, rad), gx, gz }. Without dt the pose is a still one
//   (a far model, a preview).
// A giant keeps his own heavy layer over the old cycle (poseGiantBase, below; giantmodel.js).
const LT = 0.44, LS = 0.45;                       // thigh, and shin to the ankle (body units: the joints of buildSoldier)
const ANK = 0.063, HEEL = 0.07, TOE = 0.2175;     // the ankle over the sole, the heel behind it and the toe in front (the boot, shapes.js)
const HIP_Y = 0.95;                               // the hip joints over the soles, standing
const VSPRINT = 8.6;                              // the fastest a man's steps keep up with the ground (a hero's sprint is 8.4 m/s)
const TAU = Math.PI * 2;
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qI = new THREE.Quaternion();
const _a = new THREE.Vector3(), _fw = new THREE.Vector3(), _sh = new THREE.Vector3();
const ex = (dt, tau) => 1 - Math.exp(-dt / tau);
const smooth = (a, b, x) => ease(clamp01((x - a) / (b - a)));
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const clampA = (x, a) => (x < -a ? -a : x > a ? a : x);
// a damped spring on one number, stepped semi-implicitly (sub-steps keep it stable at any frame time): returns the new velocity, the new
// value is left in _sx
let _sx = 0;
function spring(x, v, target, w, zeta, dt) {
  const n = dt > 0.034 ? Math.ceil(dt / 0.034) : 1, h = dt / n;
  for (let i = 0; i < n; i++) { v += (w * w * (target - x) - 2 * zeta * w * v) * h; x += v * h; }
  _sx = x;
  return v;
}
// the ankle's height over the ground for a shin tilted psi over the foot (+ toes down): onto the toe behind, the heel in front
function ankleH(psi) { const c = Math.cos(psi), s = Math.sin(psi); return ANK * c + (s > 0 ? TOE * s : -HEEL * s); }

function newFoot(o) { return { o, up: false, w: 1, tilt: 0, ax: 0, ay: 0, az: 0, x: 0, y: 0, z: 0, yaw: 0, lx: 0, ly: 0, lz: 0, lyaw: 0, u0: 0, pu: 0, psi: 0, cx: 0, cy: 0, cz: 0, cyaw: 0, rx: 0, rz: 0, toe: 0, tx: 0, tz: 0 }; }
function animOf(m) {
  if (m.anim) return m.anim;
  const nodes = [m.body, m.pelvis, m.torso, m.head, m.hipL, m.hipR, m.kneeL, m.kneeR, m.shL, m.shR, m.elL, m.elR];
  if (m.weapon) nodes.push(m.weapon);
  return (m.anim = {
    init: false, nodes, prevQ: new Float32Array(nodes.length * 4), offQ: new Float32Array(nodes.length * 4), prevP: new Float32Array(3), offP: new Float32Array(3),
    inT: 1, inDur: 1, inCap: false,
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, vy: 0, acc: 0, accS: 0, turn: 0, jolt: false,
    ph: 0, gaitOn: false, gait: 0, drop: 0, hipTurn: 0, replant: true, feet: [newFoot(0), newFoot(0.5)],
    block: 0, stag: 0, climb: 0, air: 0,
    arm: 0, armV: 0, hit: 0, hitV: 0, hitX: 0, hitZ: -1, land: 0, landV: 0,
    capeX: 0, capeXV: 0, capeZ: 0, capeZV: 0, bil: 0, bilV: 0, plX: 0, plXV: 0, plZ: 0, plZV: 0,
    swing: -1, hurt: 0, stagIn: 0, wasClimb: false, wasRide: false, wasRanged: false, wasAir: false, dead: false, deadT: 0,
  });
}

// the leg (hip joint `hip` at H in the pelvis frame, knee joint `kn`) puts its ankle on tgt (pelvis frame), the knee bent toward fwd and the
// toes along it; the shin's direction is left in _f
// (soft near full stretch: the last few centimetres of reach are eased out, so a knee does not flick straight and back as a foot passes the
// edge of its reach; the foot falls a little short instead)
const SOFT = 0.018, LMAX = LT + LS;
function reachLeg(hip, kn, H, tgt, fwd) {
  _d.subVectors(tgt, H);
  const len = _d.length(), d0 = LMAX - SOFT;
  const D = Math.max(len, 0.08) > d0 ? d0 + SOFT * (1 - Math.exp(-(len - d0) / SOFT)) * 0.999 : Math.max(len, 0.08);
  _d.multiplyScalar(1 / Math.max(len, 1e-5));
  const a = (LT * LT - LS * LS + D * D) / (2 * D), h = Math.sqrt(Math.max(LT * LT - a * a, 0));
  _p.copy(fwd).addScaledVector(_d, -fwd.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1);
  _p.normalize();
  _e.copy(H).addScaledVector(_d, a).addScaledVector(_p, h);
  _u.subVectors(_e, H).normalize();
  _f.copy(H).addScaledVector(_d, D).sub(_e).normalize();
  _y.copy(_u).negate();
  _z.copy(_p).addScaledVector(_y, -_p.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  hip.quaternion.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
  kn.rotation.set(Math.atan2(-_f.dot(_z), -_f.dot(_y)), 0, 0);
}

// The root this frame: how fast it travels (smoothed), its acceleration along and across the facing, how fast it turns. A jump of more than
// a stride in one frame (a respawn, a teleport, a soldier coming back into the animated ring) starts the feet afresh.
function track(A, X, Y, Z, yaw, dt) {
  const dx = X - A.x, dz = Z - A.z;
  if (!A.init || dx * dx + dz * dz > Math.max(0.36, 900 * dt * dt) || Math.abs(Y - A.y) > 3) {
    A.x = X; A.y = Y; A.z = Z; A.yaw = yaw; A.vx = A.vz = A.vy = A.acc = A.accS = A.turn = 0; A.replant = true;
    return;
  }
  const ovx = A.vx, ovz = A.vz, k = ex(dt, 0.08);
  A.vx += (clampA(dx / dt, 25) - A.vx) * k;
  A.vz += (clampA(dz / dt, 25) - A.vz) * k;
  A.vy += ((Y - A.y) / dt - A.vy) * ex(dt, 0.04);
  A.turn += (clampA(wrap(yaw - A.yaw) / dt, 12) - A.turn) * ex(dt, 0.1);
  const ax = (A.vx - ovx) / dt, az = (A.vz - ovz) / dt, c = Math.cos(yaw), s = Math.sin(yaw);
  A.jolt = ax * ax + az * az > 70 * 70;   // (a burst: a dash starting or stopping dead, a knock: see the blends in poseSoldier)
  A.acc += (clampA(ax * s + az * c, 40) - A.acc) * ex(dt, 0.1);
  A.accS += (clampA(ax * c - az * s, 40) - A.accS) * ex(dt, 0.1);
  A.x = X; A.y = Y; A.z = Z; A.yaw = yaw;
}

// The swing of a blow on its clock t, for one number of the pose: from `a` (the guard) up into the wind-up `w`, settling a little further
// back as the blow gathers, then driven through `e` (the hit lands at 0.32, units.js) and on past it by the blow's weight, and back to `a`.
// (Cubic segments meeting at matched speeds: no stop at the top of the wind-up, the fastest moment just before the hit, a follow-through
// that runs out instead of halting at a key.)
const SW = { wind: 0.18, gather: 0.22, hit: 0.32, through: 0.43, end: 0.62, settle: 0.06, over: 0.25 };
function herm(p0, m0, p1, m1, s, T) { const s2 = s * s, s3 = s2 * s; return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * T * m0 + (3 * s2 - 2 * s3) * p1 + (s3 - s2) * T * m1; }
function swingAt(t, a, w, e) {
  const w2 = w + SW.settle * (w - a), f = e + SW.over * (e - w), T3 = SW.through - SW.hit, mh = 2.7 * (f - e) / T3;
  if (t < SW.wind) return herm(a, 0, w, 0.6 * (w2 - w) / (SW.gather - SW.wind), t / SW.wind, SW.wind);
  if (t < SW.gather) return herm(w, 0.6 * (w2 - w) / (SW.gather - SW.wind), w2, 0, (t - SW.wind) / (SW.gather - SW.wind), SW.gather - SW.wind);
  if (t < SW.hit) return herm(w2, 0, e, mh, (t - SW.gather) / (SW.hit - SW.gather), SW.hit - SW.gather);
  if (t < SW.through) return herm(e, mh, f, 0, (t - SW.hit) / T3, T3);
  return herm(f, 0, a, 0, Math.min(1, (t - SW.through) / (SW.end - SW.through)), SW.end - SW.through);
}

// Pose a soldier (or a hero's body) for this frame.
export function poseSoldier(m, st) {
  if (m.giant) { poseGiantBase(m, st); return; }
  const A = animOf(m);
  const dt = st.dt > 0 ? Math.min(st.dt, 0.1) : 0, live = dt > 0;
  const idle = st.idle || 0, sc = m.body.scale.y;
  const mounted = !!st.mounted, climbing = !!st.climb && !mounted, inAir = !!st.air && !mounted && !climbing;
  const cr = mounted ? 0 : st.crouch || 0;
  const P = m.pelvis, T = m.torso, H = m.head, B = m.body;
  const sway = Math.sin(idle * 0.5), breath = Math.sin(idle * 1.7);
  // ---- the root, and what it has done since the last frame
  const R0 = m.root;
  const X = st.x !== undefined ? st.x : R0.position.x, Y = st.y !== undefined ? st.y : R0.position.y, Z = st.z !== undefined ? st.z : R0.position.z;
  const yaw = st.yaw !== undefined ? st.yaw : R0.rotation.y, cy = Math.cos(yaw), sy = Math.sin(yaw);
  if (live) track(A, X, Y, Z, yaw, dt);
  else { A.x = X; A.y = Y; A.z = Z; A.yaw = yaw; A.vx = A.vz = A.vy = A.acc = A.accS = A.turn = 0; A.replant = true; }
  const vx = A.vx, vz = A.vz, v = Math.hypot(vx, vz);
  const lvx = vx * cy - vz * sy, lvz = vx * sy + vz * cy;   // (in the root's frame: +z ahead, +x to his left)
  // going sideways or backwards at speed the hips turn part way toward where he goes (the shoulders stay on his facing), so the legs stride
  // along their own line rather than shuffle; the stride is shorter the more sideways it still is
  const travel = v > 0.3 ? Math.atan2(lvx, lvz) : 0;
  const turnTo = clampA(Math.abs(travel) <= Math.PI / 2 ? travel : travel - Math.sign(travel) * Math.PI, 0.6) * smooth(0.3, 1.5, v);
  A.hipTurn += (turnTo - A.hipTurn) * (live ? ex(dt, 0.15) : 1);
  const rel0 = travel - A.hipTurn, fwdK = v > 0.05 ? Math.cos(rel0) : 1, latK = v > 0.05 ? Math.abs(Math.sin(rel0)) : 0;
  const gx = st.gx || 0, gz = st.gz || 0;
  // ---- weights that ease toward what he is doing, and the abrupt changes, blended by an offset that fades (see inertia below)
  const t = st.swingT;
  if (live) {
    A.block += ((st.blocking ? 1 : 0) - A.block) * ex(dt, st.blocking ? 0.06 : 0.13);
    const sT = st.stagger || 0;
    A.stag += (sT - A.stag) * ex(dt, sT > A.stag ? 0.05 : 0.16);
    A.climb += ((climbing ? 1 : 0) - A.climb) * ex(dt, 0.1);
    A.air += ((inAir ? 1 : 0) - A.air) * ex(dt, inAir ? 0.11 : 0.04);
    let ev = 0;
    const sw = t >= 0 ? t : -1, ranged = !!m.ranged;
    if (!ranged && A.swing >= 0 && (sw < 0 ? A.swing < 0.6 : sw < A.swing - 0.02 || sw > A.swing + 0.12)) ev = 0.16;   // a blow cut short, its clock jumped
    else if (!ranged && A.swing < 0 && sw > 0.06) ev = 0.12;   // a blow seen late (a guest's view: the snapshot came mid-swing)
    if (climbing !== A.wasClimb || mounted !== A.wasRide || ranged !== A.wasRanged) ev = 0.3;
    if (A.wasAir && !inAir) { ev = Math.max(ev, 0.14); A.landV -= Math.min(2.6, Math.max(0.6, -A.vy * 0.35)); }   // landing: the knees take it
    if ((!A.wasAir && inAir) || (A.jolt && A.inT > A.inDur * 0.5)) ev = Math.max(ev, 0.14);   // off the ground; a burst of speed
    if (ev && A.init) { A.inCap = true; A.inDur = ev; A.inT = 0; }
    A.swing = sw; A.wasClimb = climbing; A.wasRide = mounted; A.wasRanged = ranged; A.wasAir = inAir;
    // a hit (st.hurt jumps up) throws him away from whoever he faces (st.look); heroes' hits come as a stagger
    const hurt = st.hurt || 0;
    if (hurt > A.hurt + 0.25 || (st.stagger || 0) > A.stagIn + 0.3) { const la = st.look || 0; A.hitX = -Math.sin(la); A.hitZ = -Math.cos(la); A.hitV += hurt > A.hurt + 0.25 ? 7 : 4; }
    A.hurt = hurt; A.stagIn = st.stagger || 0;
    A.hitV = spring(A.hit, A.hitV, 0, 15, 0.85, dt); A.hit = _sx;
    A.landV = spring(A.land, A.landV, 0, 11, 0.8, dt); A.land = _sx;
  } else {
    A.block = st.blocking ? 1 : 0; A.stag = st.stagger || 0; A.climb = climbing ? 1 : 0; A.air = inAir ? 1 : 0; A.hit = A.land = 0;
    A.swing = t >= 0 ? t : -1; A.wasClimb = climbing; A.wasRide = mounted; A.wasRanged = !!m.ranged; A.wasAir = inAir;
  }

  // ---- the gait: how long a stride, how quick, how much of it each foot is down. (Past a sprint, a Shield Bash's run or a shove, no man's
  // legs keep up: the steps are a sprint's and the planted feet are carried along by the rest of the speed, unseen at that pace.)
  const vg = Math.min(v, VSPRINT), kv = v > 0 ? vg / v : 0, gvx = vx * kv, gvz = vz * kv;
  const run = smooth(1.6, 3.0, vg);
  const D = lerp(0.58, Math.max(0.2, Math.min(0.38, 0.42 - 0.033 * vg)), run);
  const Smax = lerp(0.7, 0.78, run) * sc * (1 - 0.45 * latK) * (1 - 0.25 * Math.max(0, -fwdK));
  let f = lerp(0.85 + 0.12 * vg, 1.15 + 0.07 * vg, run);
  if (vg * D / f > Smax) f = vg * D / Smax;   // (no longer a stride than the legs reach: quicker steps)
  const S = vg * D / f;
  const onFeet = !mounted && A.climb < 0.5 && !inAir;
  const moving = onFeet && v > 0.15;
  A.gait += ((moving ? Math.min(1, v / 0.9) : 0) - A.gait) * (live ? ex(dt, 0.14) : 1);
  if (live && v > vg) for (const F of A.feet) if (!F.up) { F.x += (vx - gvx) * dt; F.z += (vz - gvz) * dt; }
  const gw = A.gait;
  // where each foot stands at rest (the root's frame): apart, the left a little ahead, toes out; narrower at a run and set back under him
  // (a runner lands under his hips and pushes off far behind); stepping sideways the stance widens so the feet never cross
  const half = (0.115 - 0.035 * run) * sc + 0.5 * S * latK;
  const FL = A.feet[0], FR = A.feet[1];
  FL.rx = half; FR.rx = -half;
  FL.rz = (0.035 * (1 - gw) - 0.11 * run * gw) * sc; FR.rz = (-0.03 * (1 - gw) - 0.11 * run * gw) * sc;
  FL.toe = 0.14 - 0.08 * gw + A.hipTurn; FR.toe = -0.14 + 0.08 * gw + A.hipTurn;
  if (live && !onFeet && A.init) {
    // off his feet (in the air, climbing, riding): the feet go with the body from where they left the ground (the jump's tuck, the climb's
    // scrabble and the seat take them from there), and are put down afresh when he is on his feet again
    for (let i = 0; i < 2; i++) {
      const F = A.feet[i];
      if (!A.replant) { const wx = F.cx - X, wz = F.cz - Z; F.ax = wx * cy - wz * sy; F.az = wx * sy + wz * cy; F.ay = F.cy - Y; F.up = false; }
      F.cx = X + F.ax * cy + F.az * sy; F.cz = Z - F.ax * sy + F.az * cy; F.cy = Y + F.ay; F.cyaw = yaw + F.toe;
    }
    A.replant = true; A.gaitOn = false;
  } else if (!live || A.replant || !onFeet) {
    // feet put down afresh where they stand at rest (the first frame, after a teleport, off a horse or a wall, back from the air)
    for (const F of A.feet) {
      F.up = false; F.x = X + F.rx * cy + F.rz * sy; F.z = Z - F.rx * sy + F.rz * cy; F.y = Y + gx * (F.x - X) + gz * (F.z - Z);
      F.yaw = yaw + F.toe; F.cx = F.x; F.cy = F.y; F.cz = F.z; F.cyaw = F.yaw; F.psi = 0; F.tilt = 0;
    }
    A.replant = !onFeet; A.gaitOn = false;
  } else {
    // does a planted foot have to move (the body has walked, turned or been pushed off it)?
    let need = false, settled = true, anyUp = false, far = -1, farD = 0;
    for (let i = 0; i < 2; i++) {
      const F = A.feet[i];
      if (F.up) { anyUp = true; continue; }
      const wx = F.x - X, wz = F.z - Z, lx = wx * cy - wz * sy, lz = wx * sy + wz * cy;
      const dev = Math.hypot(lx - F.rx, lz - F.rz) / sc, dy = Math.abs(wrap(F.yaw - yaw - F.toe));
      const score = dev + dy * 0.3;
      if (dev > 0.15 || dy > 0.6) need = true;
      if (dev > 0.04 || dy > 0.2) settled = false;
      if (score > farD) { farD = score; far = i; }
    }
    const fc = moving ? f : need || anyUp || (A.gaitOn && !settled) ? 1.7 : 0;
    const Dn = moving ? D : 0.62;
    if (fc > 0 && !A.gaitOn && !anyUp) {
      // starting off: the clock is set so the foot that most wants to move lifts now (moving, the one that is behind)
      let k = far < 0 ? 0 : far;
      if (moving) { const a0 = (FL.x - X) * gvx + (FL.z - Z) * gvz, a1 = (FR.x - X) * gvx + (FR.z - Z) * gvz; k = a0 < a1 ? 0 : 1; }
      A.ph = Dn - A.feet[k].o + 1;
      FL.pu = (A.ph + FL.o) % 1; FR.pu = (A.ph + FR.o) % 1;
    }
    A.gaitOn = fc > 0;
    A.ph += fc * dt;
    if (A.ph > 64) A.ph -= 64;
    const lift = (0.08 + 0.12 * run) * sc;
    for (let i = 0; i < 2; i++) {
      const F = A.feet[i];
      const u = (A.ph + F.o) % 1, landing = F.up && (u < F.pu || fc === 0);
      // where it will come down: its place at rest, carried on by the body's travel until it lands, and half a stance on
      const tl = (landing ? 0 : F.up ? 1 - u : 1 - Dn) / Math.max(fc, 0.7) + (moving ? D / (2 * f) : 0);
      let tx = X + F.rx * cy + F.rz * sy + gvx * tl, tz = Z - F.rx * sy + F.rz * cy + gvz * tl;
      // (the mark is followed, not jumped to: it moves when he slows, stops or turns, and a foot in the air must not jump with it)
      if (landing) { tx = F.tx; tz = F.tz; } else if (F.up) { const k = ex(dt, 0.05); F.tx += (tx - F.tx) * k; F.tz += (tz - F.tz) * k; tx = F.tx; tz = F.tz; }
      const ty = Y + gx * (tx - X) + gz * (tz - Z), tyaw = yaw + F.toe;
      if (landing) {
        F.up = false; F.x = tx; F.y = ty; F.z = tz; F.yaw = tyaw;   // down
      } else if (!F.up && fc > 0 && u >= Dn && F.pu < u) {
        const wx = F.x - X, wz = F.z - Z, lx = wx * cy - wz * sy, lz = wx * sy + wz * cy;
        if (moving || Math.hypot(lx - F.rx, lz - F.rz) > 0.03 * sc || Math.abs(wrap(F.yaw - tyaw)) > 0.15) {
          F.up = true; F.u0 = u; F.lx = F.x; F.ly = F.y; F.lz = F.z; F.lyaw = F.yaw; F.tx = tx; F.tz = tz;   // up
        }
      }
      F.pu = u;
      if (F.up) {
        const w = clamp01((u - F.u0) / Math.max(1e-3, 1 - F.u0)), h = ease(w);
        const step = Math.hypot(tx - F.lx, tz - F.lz);
        // the foot comes up at once (a runner's heel high behind him, so the knee folds) and reaches forward to come down
        const wp = lerp(0.5, 0.36, run), up = w < wp ? ease(w / wp) : ease((1 - w) / (1 - wp));
        F.cx = lerp(F.lx, tx, h); F.cz = lerp(F.lz, tz, h);
        F.cy = lerp(F.ly, ty, h) + lift * Math.min(1, step / (0.4 * sc) + 0.15) * up;
        F.cyaw = F.lyaw + wrap(tyaw - F.lyaw) * h;
        F.w = w;
      } else { F.cx = F.x; F.cy = F.y; F.cz = F.z; F.cyaw = F.yaw; F.w = 1; }
    }
  }

  // ---- the body over the feet (or astride)
  let bodyY, bodyZ = 0, shiftX = 0, tx, ty, tz, px, py, pz, turnLook = 0, mountY = 0;
  if (mounted) {
    const ph = st.phase || 0;
    bodyY = mountY = st.moving ? Math.abs(Math.sin(ph)) * 0.06 : 0;
    tx = st.moving ? 0.1 + Math.min(0.15, (st.speed || 0) * 0.012) : 0.04 + 0.01 * breath; ty = 0; tz = 0;
    px = 0.04; py = 0; pz = 0;
  } else {
    // the cycle: the hips rise over each foot at a walk and sink onto it at a run, sway over the foot that is down, turn with the leg that
    // swings forward (the shoulders against them) and drop on the side of the swinging leg
    const cl = Math.cos(TAU * A.ph);                     // (1: the left foot comes down)
    const mid = TAU * (A.ph - D / 2), cm = Math.cos(mid);   // (1: the left foot is under him)
    bodyY = -gw * ((1 - run) * 0.014 * (1 - Math.cos(2 * mid)) * 0.5 + run * (0.026 * (1 + Math.cos(2 * mid)) * 0.5 + 0.01)) * sc;
    bodyY += 0.004 * breath * (1 - gw) * sc + A.land * 0.09 * sc;
    tx = 0.03 + 0.05 * gw + 0.1 * run * gw + 0.012 * breath * (1 - gw); ty = (0.12 + 0.1 * run) * gw * cl; tz = -0.02 * sway * (1 - gw);
    px = (0.04 + 0.07 * run) * gw; py = -(0.08 + 0.06 * run) * gw * cl + A.hipTurn; ty -= A.hipTurn; pz = (0.045 * (1 - run) + 0.02 * run) * gw * cm + 0.03 * sway * (1 - gw);
    shiftX = ((0.026 * (1 - run) + 0.008 * run) * gw * cm + 0.012 * sway * (1 - gw)) * sc;
    // leaning into a start, back from a stop, banking into a turn (and looking into it)
    const lean = clampA(A.acc * 0.028, 0.14);
    tx += lean; px += lean * 0.5;
    const bank = clampA(-A.turn * v * 0.026, 0.2);
    pz += bank; tz += bank * 0.35;
    turnLook = clampA(A.turn * 0.16, 0.35) * (1 - gw * 0.5);
  }
  // the arms swing against the legs, a little behind them, and settle when he stops
  const armT = -Math.cos(TAU * (A.ph + 0.07)) * Math.min(0.55, v * 0.1 + 0.05) * gw;
  if (live) { A.armV = spring(A.arm, A.armV, armT, 20, 0.6, dt); A.arm = _sx; } else A.arm = armT;
  const swing = A.arm;
  // ---- arms: the shield (or bow) arm and the weapon arm
  let lx, ly = 0, lz, le;
  // (an arm hangs a little away from the trunk, so the elbow clears the ribs: +z turns the shield arm out, -z the weapon arm.)
  // A shield is strapped to the outside of the forearm: carried, the forearm slants across the belly with the face of the shield
  // forward and a little out; in a guard the forearm is level across the body at the lower chest, the shield upright in front of it.
  const wB = A.block;
  if (m.ranged) { lx = -0.25 - swing * 0.4; lz = 0.1; le = -0.35; }
  else if (m.desc.shield) {
    lx = lerp(-0.59 - swing * 0.25, -1.0, wB); ly = lerp(-1.04, -1.19, wB); lz = lerp(-0.22, -0.71, wB); le = lerp(-0.63 - 0.25 * run, -1.42, wB);
  } else { lx = lerp(-0.45 - swing * 0.3, -1.25, wB); ly = -0.3 * wB; lz = lerp(0.08, -0.2, wB); le = lerp(-0.75 - 0.4 * run, -0.6, wB); }
  if (wB > 0) { tx += 0.06 * wB; bodyY -= 0.03 * wB * sc; }   // (braced behind the guard)
  let sh = m.ranged ? -0.15 + swing * 0.5 : -0.3 + swing * 0.4, el = (m.ranged ? -0.3 : -0.55) - 0.45 * run, rz = -0.1;
  let twist = 0, tiltOff = 0;
  if (m.lance && mounted) { sh = -0.5; el = -0.8; }
  if (t >= 0) {
    if (m.ranged) {
      const w = drawWeight(t);   // (the arms themselves are solved in drawPose, below)
      twist = DRAW.turn * w; tx += 0.03 * w;
    } else if (m.lance && mounted) {
      sh = -1.2; el = -0.3;
    } else {
      // a blow: the guard, the wind-up gathering, driven through and on, back to the guard (swingAt); the body behind it
      const W = WIND[st.attackDir] || WIND.over, E = END[st.attackDir] || END.over;
      sh = swingAt(t, sh, W[0], E[0]); el = swingAt(t, el, W[1], E[1]); rz = swingAt(t, rz, W[2], E[2]);
      twist = swingAt(t, 0, W[3], E[3]); tiltOff = swingAt(t, 0, W[4], E[4]);
      // the weight goes back onto the rear foot in the wind-up, then in behind the blow, and back (the feet stay where they stand)
      const back = t < SW.gather ? ease(t / SW.gather) : 1 - ease(clamp01((t - SW.gather) / (SW.hit - SW.gather)));
      const into = t < SW.gather ? 0 : t < 0.38 ? ease((t - SW.gather) / (0.38 - SW.gather)) : 1 - ease(clamp01((t - 0.38) / (SW.end - 0.38)));
      if (!mounted) { bodyZ += (-0.045 * back + 0.11 * into) * sc; bodyY -= (0.012 * back + 0.04 * into) * sc; tx += -0.06 * back + 0.17 * into; }
      else tx += 0.16 * Math.sin(Math.min(1, t / 0.62) * Math.PI);
    }
  }
  // knocked back: the body thrown back, the weapon arm flung out; a hit throws him the way it came
  const stag = A.stag, hk = A.hit;
  if (stag > 0) {
    tx -= 0.4 * stag;
    sh = lerp(sh, -1.1, stag); rz = lerp(rz, -0.6, stag); el = lerp(el, -0.2, stag);
    bodyZ -= 0.08 * stag * sc; bodyY -= 0.05 * stag * sc;
  }
  const hurt = st.hurt || 0;
  if (hurt > 0) { tx -= 0.12 * hurt; sh = lerp(sh, -0.9, hurt * 0.5); el = lerp(el, -0.3, hurt * 0.5); lx = lerp(lx, -0.9, hurt * 0.4); }
  if (hk !== 0) {
    tx += 0.5 * hk * A.hitZ; tz -= 0.4 * hk * A.hitX; ty += 0.25 * hk * A.hitX;
    bodyZ += 0.07 * hk * A.hitZ * sc; shiftX += 0.05 * hk * A.hitX * sc; bodyY -= 0.025 * Math.abs(hk) * sc;
  }
  // in the air: the knees come up, the arms out a little for balance
  const wa = ease(A.air);
  if (wa > 0) { lx = lerp(lx, lx - 0.25, wa); sh = lerp(sh, sh - 0.3, wa); tx += 0.08 * wa; }
  // ---- the hips and the legs
  let legsDone = false;
  if (mounted) {
    // astride: the thighs angle down along the horse's flanks, the knees bend so the feet hang by the stirrups
    m.hipL.rotation.set(-0.32, 0, 0.66); m.hipR.rotation.set(-0.32, 0, -0.66);
    m.kneeL.rotation.set(0.75, 0, 0); m.kneeR.rotation.set(0.75, 0, 0);
    bodyY = mountY; bodyZ = 0; shiftX = 0;   // (in the saddle: the blows and knocks move the trunk only)
    legsDone = true;
  }
  // ducking: hips dropped and set back (the legs are folded below)
  if (cr > 0) { bodyY -= CROUCH.drop * cr * sc; bodyZ -= CROUCH.back * cr * sc; tx += CROUCH.lean * cr; }
  P.position.x = shiftX / sc;
  P.rotation.set(px, py + twist * 0.4, pz);
  m.hipL.position.z = m.hipR.position.z = CROUCH.hipFwd * cr;
  if (!legsDone) {
    // the hips come down where a planted foot would be out of reach
    const reach = (LT + LS) * 0.985 * sc;
    // (a foot in the air counts as it nears the ground again, so the hips are already low when it lands; the drop eases back up once a foot
    // has left the ground, so they do not jump as it lifts)
    let drop = 0;
    if (wa < 0.5) for (let i = 0; i < 2; i++) {
      const F = A.feet[i], k = F.up ? smooth(0.5, 1, F.w) : 1;
      if (k <= 0) continue;
      const wx = F.cx - X, wz = F.cz - Z, lx2 = wx * cy - wz * sy, lz2 = wx * sy + wz * cy;
      const hx = shiftX + (i ? -0.09 : 0.09) * sc - lx2, hz = bodyZ - lz2, hy = HIP_Y * sc + bodyY - (F.cy - Y) - ankleH(F.tilt) * sc;
      const hz2 = hx * hx + hz * hz;
      if (hz2 + hy * hy > reach * reach) drop = Math.max(drop, k * Math.min(0.22 * sc, hy - Math.sqrt(Math.max(reach * reach - hz2, (0.6 * sc) ** 2))));
    }
    A.drop = live ? A.drop + (drop - A.drop) * ex(dt, drop > A.drop ? 0.025 : 0.09) : drop;
    bodyY -= A.drop;
    B.position.set(0, bodyY, bodyZ);
    // two-bone IK: each ankle onto its foot (in the air, the feet drawn up under him)
    _qi.copy(P.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const F = A.feet[i], hip = i ? m.hipR : m.hipL, kn = i ? m.kneeR : m.kneeL;
      let wx = F.cx - X, wz = F.cz - Z, wy = F.cy - Y;
      if (wa > 0) {
        // (tucked: one knee higher than the other, both feet under the seat)
        const tx2 = X + F.rx * cy + (F.rz + (i ? -0.1 : 0.12) * sc) * sy, tz2 = Z - F.rx * sy + (F.rz + (i ? -0.1 : 0.12) * sc) * cy;
        wx = lerp(wx, tx2 - X, wa); wz = lerp(wz, tz2 - Z, wa); wy = lerp(wy, (i ? 0.2 : 0.34) * sc + bodyY, wa);
      }
      const lx2 = wx * cy - wz * sy, lz2 = wx * sy + wz * cy;
      const rel = F.cyaw - yaw, fsx = Math.sin(rel), fsz = Math.cos(rel);
      const slope = Math.atan(gx * Math.sin(F.cyaw) + gz * Math.cos(F.cyaw));
      // how far the shin leans over the foot: mostly the lean of the leg (from the hip to the foot), a little of last frame's real lean (the
      // knee's bend): all of it would feed back (the ankle raised, the knee bent further, the shin leaning more) and put him on tiptoe
      const fo = (lx2 - shiftX - (i ? -0.09 : 0.09) * sc) * fsx + (lz2 - bodyZ) * fsz, fv = HIP_Y * sc + bodyY - wy;
      const lean = Math.atan2(-fo, Math.max(0.2, fv));
      // (a foot in the air takes more of it, most at the top of its swing, so its toes stay clear of the ground)
      F.tilt = F.up ? clampA(lean + (F.psi - lean) * (F.psi > lean ? 0.3 + 0.35 * Math.sin(Math.PI * F.w) : 0.3), 0.6) : clampA(lean + 0.3 * (F.psi - lean), 0.85);
      _a.set(lx2, wy + ankleH(F.tilt + slope) * sc, lz2).sub(B.position).multiplyScalar(1 / sc).sub(P.position).applyQuaternion(_qi);
      _fw.set(fsx, 0, fsz).applyQuaternion(_qi);
      reachLeg(hip, kn, hip.position, _a, _fw);
      // the shin's tilt over the foot (the ankle's height next frame): the shin in the root's frame
      _sh.copy(_f).applyQuaternion(P.quaternion);
      F.psi = clampA(Math.atan2(-(_sh.x * fsx + _sh.z * fsz), -_sh.y), 0.9);
    }
    if (cr > 0) {
      // ducking: thighs forward, knees folded. Walking crouched is a shuffle.
      const shuffle = st.moving ? Math.sin(st.phase || 0) * Math.min(0.35, (st.speed || 0) * 0.25) : 0;
      m.hipL.rotation.x += (CROUCH.hip + shuffle - m.hipL.rotation.x) * cr;
      m.hipR.rotation.x += (CROUCH.hip - shuffle - m.hipR.rotation.x) * cr;
      m.kneeL.rotation.x += (CROUCH.knee - m.kneeL.rotation.x) * cr;
      m.kneeR.rotation.x += (CROUCH.knee - m.kneeR.rotation.x) * cr;
    }
  } else B.position.set(0, bodyY, bodyZ);
  B.rotation.set(0, 0, 0);
  // ---- the trunk, the head and the arms
  const look = Math.max(-1.1, Math.min(1.1, st.look || 0));
  T.rotation.set(tx, ty + twist + look * 0.12 + turnLook * 0.4, tz);
  H.rotation.set(-tx * 0.6 - 0.3 * (stag + hurt) + 0.4 * hk * A.hitZ + 0.02 * Math.sin(idle * 0.9),
    -(ty + P.rotation.y) * 0.5 + look * 0.85 + turnLook + 0.12 * Math.sin(idle * 0.37) * Math.sin(idle * 0.11) * (1 - gw), -tz * 0.5);
  m.shL.rotation.set(lx, ly, lz); m.elL.rotation.set(le, 0, 0);
  m.shR.rotation.set(sh, 0, rz); m.elR.rotation.set(el, 0, 0);
  if (m.weapon) m.weapon.rotation.set(m.weaponTilt + tiltOff, m.weaponRoll, 0);
  if (m.ranged && m.bowDrawn) drawPose(m, t);
  const wc = A.climb;
  if (wc > 0.001 && !mounted) {
    // hauling up a wall: hands over each other above the head, feet scrabbling at the stone
    const w = (st.time || 0) * 9, s = Math.sin(w);
    const J = (j, x, y, z) => j.rotation.set(lerp(j.rotation.x, x, wc), lerp(j.rotation.y, y, wc), lerp(j.rotation.z, z, wc));
    J(m.shL, -2.7 + s * 0.4, 0, -0.1); J(m.shR, -2.7 - s * 0.4, 0, 0.1);
    J(m.elL, -0.3 - Math.max(0, s) * 0.5, 0, 0); J(m.elR, -0.3 - Math.max(0, -s) * 0.5, 0, 0);
    J(m.hipL, -0.5 - s * 0.7, 0, 0); J(m.hipR, -0.5 + s * 0.7, 0, 0);
    J(m.kneeL, 0.9 - s * 0.6, 0, 0); J(m.kneeR, 0.9 + s * 0.6, 0, 0);
    T.rotation.x = lerp(T.rotation.x, 0.12, wc);
  }
  if (live) inertia(A, dt); else holdPose(A);
  // ---- what hangs off him
  if (live) {
    A.capeXV = spring(A.capeX, A.capeXV, clampA(A.acc * 0.05, 0.55), 8.5, 0.3, dt); A.capeX = _sx;
    A.capeZV = spring(A.capeZ, A.capeZV, clampA(-A.accS * 0.045, 0.4), 7.5, 0.3, dt); A.capeZ = _sx;
    A.bilV = spring(A.bil, A.bilV, Math.min(1, v / 7), 5.5, 0.45, dt); A.bil = _sx;
    const plume = m.plumeC.on || m.plumeG.on;
    if (plume) {
      A.plXV = spring(A.plX, A.plXV, clampA(-A.acc * 0.04 - (bodyY / sc) * 2, 0.5), 11, 0.25, dt); A.plX = _sx;
      A.plZV = spring(A.plZ, A.plZV, clampA(A.accS * 0.04 + A.turn * v * 0.02, 0.5), 10, 0.25, dt); A.plZ = _sx;
      m.plumeC.node.rotation.set(A.plX, 0, A.plZ);
    }
  } else { A.capeX = A.capeZ = 0; A.bil = Math.min(1, v / 7); }
  m.inst[13] = clamp01(A.bil);
  settleCloth(m, A.capeX, A.capeZ);
  if (live) A.init = true;
}

// The inertial blend: when something abrupt has happened (A.inCap), the offset from the pose drawn last frame to the one worked out now is
// taken, and from then on added to each new pose, fading out over A.inDur (smoothly: no kink as it ends). The pose drawn is kept for next time.
function inertia(A, dt) {
  const N = A.nodes, n = N.length, pq = A.prevQ, oq = A.offQ, B = N[0];
  if (A.inCap) {
    A.inCap = false;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      _qb.copy(N[i].quaternion).invert();
      _qa.set(pq[o], pq[o + 1], pq[o + 2], pq[o + 3]).multiply(_qb);
      oq[o] = _qa.x; oq[o + 1] = _qa.y; oq[o + 2] = _qa.z; oq[o + 3] = _qa.w;
    }
    A.offP[0] = A.prevP[0] - B.position.x; A.offP[1] = A.prevP[1] - B.position.y; A.offP[2] = A.prevP[2] - B.position.z;
  }
  if (A.inT < A.inDur) {
    const k = 1 - ease(A.inT / A.inDur);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      _qa.set(oq[o], oq[o + 1], oq[o + 2], oq[o + 3]);
      _qa.slerp(_qI, 1 - k);
      N[i].quaternion.premultiply(_qa);
    }
    B.position.x += A.offP[0] * k; B.position.y += A.offP[1] * k; B.position.z += A.offP[2] * k;
    A.inT += dt;
  }
  holdPose(A);
}
function holdPose(A) {
  const N = A.nodes, pq = A.prevQ;
  for (let i = 0; i < N.length; i++) { const q = N[i].quaternion, o = i * 4; pq[o] = q.x; pq[o + 1] = q.y; pq[o + 2] = q.z; pq[o + 3] = q.w; }
  const p = N[0].position;
  A.prevP[0] = p.x; A.prevP[1] = p.y; A.prevP[2] = p.z;
}

// A giant's pose: the old cycle under his own heavy layer (giantmodel.js poseGiant).
function poseGiantBase(m, st) {
  const sp = st.speed || 0, ph = st.phase || 0, idle = st.idle || 0;
  const mounted = !!st.mounted;
  const walking = !!st.moving && !mounted;
  const stride = walking ? Math.min(1, sp / 4.4) : 0, still = 1 - stride;
  const run = walking ? clamp01((sp - 3.6) / 2.6) : 0;
  const s1 = Math.sin(ph), c1 = Math.cos(ph), sway = Math.sin(idle * 0.5), breath = Math.sin(idle * 1.7);
  const P = m.pelvis, T = m.torso, H = m.head;
  const A = (0.34 + 0.3 * run) * stride, K = stride * (0.75 + 1.1 * run);
  m.hipL.rotation.set(A * s1, 0, 0.03); m.hipR.rotation.set(-A * s1, 0, -0.03);
  m.kneeL.rotation.set(0.06 + 0.06 * Math.max(0, sway) * still + K * Math.max(0, -c1), 0, 0);
  m.kneeR.rotation.set(0.06 + 0.06 * Math.max(0, -sway) * still + K * Math.max(0, c1), 0, 0);
  const bodyY = -(0.016 + 0.034 * run) * stride * (1 - Math.cos(2 * ph)) * 0.5 + 0.004 * breath * still;
  P.rotation.set((0.04 + 0.07 * run) * stride, (0.1 + 0.1 * run) * stride * s1, 0.04 * c1 * stride + 0.03 * sway * still);
  P.position.x = 0.012 * sway * still;
  let tx = 0.03 + 0.04 * stride + 0.1 * run * stride + 0.012 * breath * still;
  const ty = -(0.12 + 0.12 * run) * stride * s1, tz = -0.03 * c1 * stride - 0.02 * sway * still;
  m.body.position.set(0, bodyY, 0);
  m.hipL.position.z = m.hipR.position.z = 0;
  const swing = walking ? s1 * Math.min(0.55, sp * 0.1 + 0.05) : 0;
  let lx = -0.45 - swing * 0.3, lz = 0.08, le = -0.75 - 0.4 * run;
  if (st.blocking) { lx = -1.25; lz = -0.2; le = -0.6; }
  let sh = -0.3 + swing * 0.4, el = -0.55 - 0.45 * run, rz = -0.1, twist = 0, tiltOff = 0;
  const t = st.swingT;
  if (t >= 0) {
    const W = WIND[st.attackDir] || WIND.over, E = END[st.attackDir] || END.over;
    const idleK = [sh, el, rz, 0, 0];
    let from, to, k;
    if (t < 0.25) { from = idleK; to = W; k = ease(t / 0.25); }
    else if (t < 0.4) { from = W; to = E; k = ease((t - 0.25) / 0.15); }
    else { from = E; to = idleK; k = ease(Math.min(1, (t - 0.4) / 0.22)); }
    sh = lerp(from[0], to[0], k); el = lerp(from[1], to[1], k); rz = lerp(from[2], to[2], k);
    twist = lerp(from[3], to[3], k); tiltOff = lerp(from[4], to[4], k);
    const att = Math.sin(Math.min(1, t / 0.62) * Math.PI);
    m.hipR.rotation.x -= 0.4 * att; m.hipL.rotation.x += 0.28 * att;
    m.kneeL.rotation.x += 0.35 * att; m.kneeR.rotation.x += 0.15 * att;
    m.body.position.z += 0.09 * att; m.body.position.y -= 0.03 * att;
    tx += 0.16 * att;
  }
  const stag = st.stagger || 0, hurt = st.hurt || 0;
  if (stag > 0) {
    tx -= 0.4 * stag;
    sh = lerp(sh, -1.1, stag); rz = lerp(rz, -0.6, stag); el = lerp(el, -0.2, stag);
    m.kneeL.rotation.x += 0.25 * stag; m.kneeR.rotation.x += 0.25 * stag;
  }
  if (hurt > 0) { tx -= 0.2 * hurt; sh = lerp(sh, -0.9, hurt * 0.5); el = lerp(el, -0.3, hurt * 0.5); lx = lerp(lx, -0.9, hurt * 0.4); }
  const look = Math.max(-1.1, Math.min(1.1, st.look || 0));
  T.rotation.set(tx, ty + twist + look * 0.12, tz);
  P.rotation.y += twist * 0.4;
  H.rotation.set(-tx * 0.6 - 0.3 * (stag + hurt) + 0.02 * Math.sin(idle * 0.9), -(ty + P.rotation.y) * 0.5 + look * 0.85 + 0.12 * Math.sin(idle * 0.37) * Math.sin(idle * 0.11) * still, 0);
  m.shL.rotation.set(lx, 0, lz); m.elL.rotation.set(le, 0, 0);
  m.shR.rotation.set(sh, 0, rz); m.elR.rotation.set(el, 0, 0);
  if (m.weapon) m.weapon.rotation.set(m.weaponTilt + tiltOff, m.weaponRoll, 0);
  m.inst[13] = Math.min(1, sp / 7);
  poseGiant(m, st);
  settleCloth(m);
}

// The cloth that hangs from the rig, once the joints are set: the skirt is told how far up the thighs are (unitmat.js bends it), and the
// cape hangs toward the ground, but never into the back of the hips: a man leaning or kneeling has it hang straight down behind him, one
// lying on his face has it lie along his back. (swing, side: the cape's own lag, back and out, from poseSoldier's springs)
const CAPE_SEAT = [-0.25, -0.14];   // (in the pelvis frame: where the cape passes behind the seat, y and z; standing, it hangs as built)
function settleCloth(m, swing = 0, side = 0) {
  const a = Math.min(0, (m.hipL.rotation.x + m.hipR.rotation.x) * 0.5);
  m.inst[11] = Math.max(-7.99, a) - 8 * Math.round(Math.max(0, m.hipL.position.z) * 100);
  const c = m.cape;
  if (!c) return;
  // how far back of the pelvis's down the cape points: toward the ground, not inside the line from the shoulders past the seat,
  // and not far behind the back (a man on his back lies on it)
  const t = m.torso.rotation.x, ct = Math.cos(t), st = Math.sin(t);
  const py = 0.1 + 0.42 * ct + 0.125 * st, pz = 0.42 * st - 0.125 * ct;
  const seat = Math.atan2(pz - CAPE_SEAT[1], py - CAPE_SEAT[0]);
  const down = -(m.body.rotation.x + m.pelvis.rotation.x) + swing;
  const back = Math.min(Math.max(down, seat), Math.max(seat, t) + 0.1 + Math.max(0, swing));
  c.rotation.set(back - t, 0, side);
}

// A death: `t` seconds in. kind 0 falls backwards, 1 drops to the knees and pitches forward, 2 crumples to one side (side is +-1).
// (the body turns about the feet, so it is lifted by about half its depth to lie on the ground, not in it) It starts from the pose he was
// in when he was struck (the inertial blend of poseSoldier).
export function poseDeath(m, t, kind, side = 1) {
  const e1 = ease(clamp01(t / 0.3)), e2 = ease(clamp01((t - 0.18) / 0.6)), rest = ease(clamp01((t - 0.7) / 0.6));
  const J = (j, x, y, z) => j.rotation.set(x, y, z);
  const A = animOf(m);
  if (!A.dead) { A.dead = true; A.deadT = t; if (A.init) { A.inCap = true; A.inDur = 0.24; A.inT = 0; } }
  const Ang = Math.PI / 2 - 0.08;
  m.pelvis.position.x = 0; m.pelvis.rotation.set(0, 0, 0);
  m.hipL.position.z = m.hipR.position.z = 0;
  m.body.rotation.set(0, 0, 0);
  m.body.position.set(0, 0, 0);
  if (kind === 0) {
    m.body.rotation.x = -Ang * e2; m.body.position.set(0, 0.1 * e2, 0.55 * e2);
    J(m.hipL, -0.5 * e1 + 0.5 * e2, 0, 0.15 * e2); J(m.hipR, -0.3 * e1 + 0.15 * e2, 0, -0.2 * e2);
    J(m.kneeL, 1.1 * e1 - 0.7 * e2, 0, 0); J(m.kneeR, 0.8 * e1 - 0.4 * e2, 0, 0);
    J(m.torso, -0.4 * e1 + 0.2 * e2, 0, 0.1 * e2); J(m.head, -0.5 * e1 + 0.65 * e2, 0.2 * e2, 0);
    J(m.shL, -1.5 * e1 + 1.2 * e2, 0, -0.6 * e2); J(m.elL, -0.3 * e1, 0, 0);
    J(m.shR, -1.2 * e1 + 1.0 * e2, 0, 0.8 * e2); J(m.elR, -0.5 * e1 + 0.2 * rest, 0, 0);
  } else if (kind === 1) {
    m.body.rotation.x = Ang * e2; m.body.position.set(0, -0.4 * e1 * (1 - e2) + 0.13 * e2, -0.45 * e2);
    J(m.hipL, -1.3 * e1 * (1 - e2) - 0.25 * e2, 0, 0.1 * e2); J(m.hipR, -1.2 * e1 * (1 - e2) - 0.1 * e2, 0, -0.12 * e2);
    J(m.kneeL, 2.1 * e1 * (1 - e2) + 0.35 * e2, 0, 0); J(m.kneeR, 2.0 * e1 * (1 - e2) + 0.2 * e2, 0, 0);
    J(m.torso, 0.5 * e1 - 0.3 * e2, 0, 0); J(m.head, -0.2 * e1 + 0.5 * e2, 0.4 * e2, 0);
    J(m.shL, -0.3 * e1 - 1.4 * e2, 0, -0.5 * e2); J(m.elL, -0.4 * e1, 0, 0);
    J(m.shR, -0.2 * e1 - 1.6 * e2, 0, 0.5 * e2); J(m.elR, -0.4 * e1, 0, 0);
  } else {
    m.body.rotation.z = side * Ang * e2; m.body.position.set(0.55 * side * e2, 0.15 * e2, 0);
    J(m.hipL, -0.8 * e1 + 0.3 * e2, 0, 0.1); J(m.hipR, -0.4 * e1 - 0.3 * e2, 0, -0.1);
    J(m.kneeL, 1.3 * e1 - 0.4 * e2, 0, 0); J(m.kneeR, 0.9 * e1 + 0.3 * e2, 0, 0);
    J(m.torso, 0.3 * e1, 0, -0.3 * side * e2); J(m.head, 0.3 * e1, 0.3 * side * e2, 0.2 * side * e2);
    J(m.shL, -0.6 * e1 - 0.5 * e2, 0, -0.5 * e2); J(m.elL, -0.8 * e1, 0, 0);
    J(m.shR, -0.6 * e1 - 0.2 * e2, 0, 0.5 * e2); J(m.elR, -0.9 * e1, 0, 0);
  }
  if (m.weapon) m.weapon.rotation.set(m.weaponTilt - 0.4 * e1, m.weaponRoll, 0);
  if (m.giant) poseGiantDead(m, t, kind);
  inertia(A, Math.max(0, t - A.deadT));
  A.deadT = t;
  m.inst[13] = kind === 1 ? -e2 : 0;   // (no wind of his running left in the cape; face down, it sags over his legs: unitmat.js)
  settleCloth(m);
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
  const sg = g.attributes.aSurf, fx = g.attributes.aFx;
  for (let i = 0; i < sg.count; i++) sg.setW(i, 0);   // (what is left is always shown)
  for (let i = 0; i < fx.count; i++) if (fx.getX(i) >= SKIRT) fx.setX(i, fx.getX(i) - SKIRT);   // (moved out of the pelvis frame: a skirt stays as baked)
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
    // (far away the small things do not show: tier kit, plumes, the quiver; the forearms stay, in their plainest form, to hold the weapon)
    if (level === 3 && /^(kit|plume|quiver)/.test(p.shape.name)) continue;
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
    for (const p of m.parts) if (p.on || p.shape.name.startsWith('kit') || p.shape.name.startsWith('plume') || p === m.bowDrawn) for (const l of levels) warmTasks.push([p.shape, l]);
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
