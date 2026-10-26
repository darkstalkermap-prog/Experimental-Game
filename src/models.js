// Medieval soldier and horse models. Every body part is one merged, vertex-coloured mesh whose
// geometry is shared by all units of the same type, team and look, so a soldier costs 9 draw calls.
// Limbs have two segments (thigh/shin, upper arm/forearm) so knees and elbows bend.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { UNIT_TYPES, BODY_STYLES, TEAM_COLORS, RAIDER_TEAM } from './config.js';

const SKINS = [0xd2a07c, 0xc08a66, 0x9c6a4a, 0xe0b494];
const HAIR = [0x3b2a1a, 0x5a3c22, 0x1c1814, 0x8a6a3c, 0x6a6460];
const BOOT = 0x3a2a1c;
const BOOT_CUFF = 0x4d3826;
const PANTS = 0x4c4237;
const WOOD = 0x6b4a2c;
const STEEL = 0xc9ced6;
const IRON = 0x5a5c62;
const GOLD = 0xd8a83a;
const LEATHER = 0x5a3a22;
const TRIM = 0xe7d8a8;

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

function part(geo, color, [x, y, z], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  // non-indexed so primitives and extrusions (which have no index) can be merged together
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  m4.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz));
  g.applyMatrix4(m4);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

let P = null;
function prims() {
  if (P) return P;
  P = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    taper: new THREE.CylinderGeometry(0.5, 0.4, 1, 10),       // limb that narrows downward
    cone: new THREE.ConeGeometry(0.5, 1, 12),
    sphere: new THREE.SphereGeometry(0.5, 14, 10),
    lowSphere: new THREE.SphereGeometry(0.5, 8, 6),
    hemi: new THREE.SphereGeometry(0.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    skirt: new THREE.CylinderGeometry(0.5, 0.62, 1, 12, 1, true),
  };
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.27, 0.64), new THREE.Vector3(0, -0.68, 0), new THREE.Vector3(0, -0.27, -0.64));
  P.bow = new THREE.TubeGeometry(curve, 12, 0.022, 5, false);
  P.string = new THREE.CylinderGeometry(0.004, 0.004, 1.28, 3);
  // kite shield outline, extruded
  const k = new THREE.Shape();
  k.moveTo(-0.27, 0.32); k.lineTo(0.27, 0.32); k.quadraticCurveTo(0.29, -0.15, 0, -0.55); k.quadraticCurveTo(-0.29, -0.15, -0.27, 0.32);
  P.kite = new THREE.ExtrudeGeometry(k, { depth: 0.04, bevelEnabled: false, curveSegments: 6 });
  P.kite.translate(0, 0, -0.02);
  return P;
}

// ---------------------------------------------------------------- weapons / shields
function weaponGeo(kind) {
  const p = prims();
  const parts = [];
  // weapons extend from the hand (origin) along -y; the joint tilts them forward
  if (kind === 'sword') {
    parts.push(part(p.box, STEEL, [0, -0.58, 0], [0, 0, 0], [0.05, 0.86, 0.014]));
    parts.push(part(p.box, 0xa8adb6, [0, -0.58, 0], [0, 0, 0], [0.012, 0.86, 0.018]));
    parts.push(part(p.cone, STEEL, [0, -1.04, 0], [Math.PI, 0, 0], [0.05, 0.08, 0.014]));
    parts.push(part(p.box, IRON, [0, -0.12, 0], [0, 0, 0], [0.24, 0.035, 0.045]));
    parts.push(part(p.cyl8, 0x3a2617, [0, 0.02, 0], [0, 0, 0], [0.04, 0.2, 0.04]));
    parts.push(part(p.lowSphere, IRON, [0, 0.13, 0], [0, 0, 0], [0.06, 0.06, 0.06]));
  } else if (kind === 'spear') {
    parts.push(part(p.cyl8, WOOD, [0, -0.6, 0], [0, 0, 0], [0.045, 2.6, 0.045]));
    parts.push(part(p.cone, STEEL, [0, -2.05, 0], [Math.PI, 0, 0], [0.085, 0.36, 0.03]));
    parts.push(part(p.cyl8, IRON, [0, -1.86, 0], [0, 0, 0], [0.055, 0.06, 0.055]));
  } else if (kind === 'lance') {
    parts.push(part(p.cyl8, 0xd9cfb8, [0, -1.1, 0], [0, 0, 0], [0.06, 3.4, 0.06]));
    parts.push(part(p.cone, STEEL, [0, -2.95, 0], [Math.PI, 0, 0], [0.07, 0.3, 0.07]));
    parts.push(part(p.cone, 0x6a6a6a, [0, -0.1, 0], [0, 0, 0], [0.16, 0.3, 0.16]));
  } else if (kind === 'axe') {
    parts.push(part(p.cyl8, WOOD, [0, -0.36, 0], [0, 0, 0], [0.045, 0.92, 0.045]));
    parts.push(part(p.box, IRON, [0, -0.74, 0.1], [0, 0, 0], [0.03, 0.22, 0.22]));
    parts.push(part(p.box, STEEL, [0, -0.74, 0.215], [0, 0, 0], [0.034, 0.26, 0.02]));
  } else if (kind === 'staff') {
    parts.push(part(p.cyl8, 0x4a3420, [0, -0.45, 0], [0, 0, 0], [0.05, 1.7, 0.05]));
    parts.push(part(p.sphere, 0xff9a3a, [0, -1.36, 0], [0, 0, 0], [0.16, 0.16, 0.16]));
    parts.push(part(p.cone, 0xe8dcc0, [0.06, -1.25, 0], [0, 0, 2.6], [0.04, 0.2, 0.04]));
    parts.push(part(p.cone, 0xe8dcc0, [-0.06, -1.25, 0], [0, 0, -2.6], [0.04, 0.2, 0.04]));
  } else if (kind === 'greataxe') {
    parts.push(part(p.cyl8, WOOD, [0, -0.6, 0], [0, 0, 0], [0.055, 1.6, 0.055]));
    parts.push(part(p.box, IRON, [0, -1.25, 0.16], [0, 0, 0], [0.04, 0.42, 0.34]));
    parts.push(part(p.box, STEEL, [0, -1.25, 0.34], [0, 0, 0], [0.044, 0.46, 0.03]));
    parts.push(part(p.box, IRON, [0, -1.25, -0.1], [0, 0, 0], [0.04, 0.2, 0.18]));
  }
  return parts.length ? mergeGeometries(parts) : null;
}

export const WEAPON_TILT = { sword: -1.15, spear: -1.5, lance: -1.55, axe: -1.0, greataxe: -0.9, staff: -2.6, bow: 0 };

function shieldParts(kind, cloth, raider, out) {
  const p = prims();
  // shields sit on the outside of the left forearm, facing forward
  if (kind === 'round') {
    const face = raider ? 0x6a4a2a : cloth;
    out.push(part(p.cyl, face, [-0.02, -0.15, 0.13], [Math.PI / 2, 0, 0], [0.78, 0.04, 0.78]));
    out.push(part(p.cyl, raider ? 0x4a3420 : 0xd8c9a0, [-0.02, -0.15, 0.15], [Math.PI / 2, 0, 0], [0.52, 0.02, 0.52]));
    out.push(part(p.cyl, face, [-0.02, -0.15, 0.156], [Math.PI / 2, 0, 0], [0.42, 0.02, 0.42]));
    out.push(part(p.hemi, IRON, [-0.02, -0.15, 0.16], [Math.PI / 2, 0, 0], [0.16, 0.08, 0.16]));
    // rim
    const rim = new THREE.TorusGeometry(0.39, 0.018, 4, 20);
    out.push(part(rim, IRON, [-0.02, -0.15, 0.13], [0, 0, 0]));
  } else if (kind === 'kite') {
    out.push(part(p.kite, cloth, [-0.02, -0.12, 0.14]));
    out.push(part(p.box, TRIM, [-0.02, -0.16, 0.165], [0, 0, 0], [0.06, 0.74, 0.01]));
    out.push(part(p.box, TRIM, [-0.02, 0.0, 0.165], [0, 0, 0], [0.46, 0.06, 0.01]));
    out.push(part(p.hemi, GOLD, [-0.02, 0.0, 0.17], [Math.PI / 2, 0, 0], [0.08, 0.04, 0.08]));
  }
}

// ---------------------------------------------------------------- heads / helmets
function headParts(t, look, metal, mailCol, out) {
  const p = prims();
  const y = 1.66;
  const skin = look.skin, hair = look.hair;
  out.push(part(p.cyl8, skin, [0, 1.535, 0], [0, 0, 0], [0.11, 0.1, 0.11]));                 // neck
  out.push(part(p.sphere, skin, [0, y, 0.005], [0, 0, 0], [0.2, 0.25, 0.22]));                // skull
  out.push(part(p.box, skin, [0, y - 0.01, 0.105], [0.25, 0, 0], [0.035, 0.06, 0.04]));      // nose
  out.push(part(p.box, 0x1a1410, [-0.045, y + 0.03, 0.098], [0, 0, 0], [0.03, 0.016, 0.01])); // eyes
  out.push(part(p.box, 0x1a1410, [0.045, y + 0.03, 0.098], [0, 0, 0], [0.03, 0.016, 0.01]));
  out.push(part(p.box, hair, [-0.045, y + 0.06, 0.1], [0, 0, 0.1], [0.05, 0.012, 0.012]));    // brows
  out.push(part(p.box, hair, [0.045, y + 0.06, 0.1], [0, 0, -0.1], [0.05, 0.012, 0.012]));
  if (look.beard) {
    out.push(part(p.sphere, hair, [0, y - 0.085, 0.05], [0, 0, 0], [0.17, 0.14, 0.14]));
  }
  const coif = () => out.push(part(p.sphere, mailCol, [0, y - 0.03, -0.01], [0, 0, 0], [0.235, 0.29, 0.245]));
  switch (t.helmet) {
    case 'kettle':
      coif();
      out.push(part(p.hemi, metal, [0, y + 0.03, 0], [0, 0, 0], [0.26, 0.24, 0.27]));
      out.push(part(p.cyl, metal, [0, y + 0.035, 0], [0, 0, 0], [0.44, 0.025, 0.44]));
      break;
    case 'nasal':
      coif();
      out.push(part(p.cone, metal, [0, y + 0.15, 0], [0, 0, 0], [0.255, 0.3, 0.26]));
      out.push(part(p.cyl, metal, [0, y + 0.03, 0], [0, 0, 0], [0.26, 0.05, 0.27]));
      out.push(part(p.box, metal, [0, y - 0.01, 0.125], [0, 0, 0], [0.03, 0.13, 0.015]));
      break;
    case 'great':
      out.push(part(p.cyl, metal, [0, y + 0.02, 0], [0, 0, 0], [0.28, 0.34, 0.3]));
      out.push(part(p.hemi, metal, [0, y + 0.19, 0], [0, 0, 0], [0.28, 0.08, 0.3]));
      out.push(part(p.box, 0x111111, [0, y + 0.04, 0.148], [0, 0, 0], [0.2, 0.022, 0.01]));
      out.push(part(p.box, GOLD, [0, y - 0.03, 0.15], [0, 0, 0], [0.025, 0.2, 0.012]));
      break;
    case 'crown':
      coif();
      out.push(part(p.hemi, metal, [0, y + 0.03, 0], [0, 0, 0], [0.255, 0.27, 0.265]));
      out.push(part(p.cyl, GOLD, [0, y + 0.07, 0], [0, 0, 0], [0.275, 0.06, 0.285]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        out.push(part(p.cone, GOLD, [Math.sin(a) * 0.13, y + 0.14, Math.cos(a) * 0.135], [0, 0, 0], [0.045, 0.09, 0.045]));
      }
      out.push(part(p.box, 0xc0392b, [0, y + 0.07, 0.142], [0, 0, 0], [0.035, 0.035, 0.01]));
      break;
    case 'horned':
      out.push(part(p.hemi, IRON, [0, y + 0.03, 0], [0, 0, 0], [0.26, 0.26, 0.27]));
      out.push(part(p.cone, 0xe8dcc0, [-0.16, y + 0.13, 0], [0, 0, 0.95], [0.055, 0.24, 0.055]));
      out.push(part(p.cone, 0xe8dcc0, [0.16, y + 0.13, 0], [0, 0, -0.95], [0.055, 0.24, 0.055]));
      out.push(part(p.box, IRON, [0, y + 0.0, 0.125], [0, 0, 0], [0.03, 0.1, 0.012]));
      break;
    case 'hood':
      out.push(part(p.sphere, 0x5e4c34, [0, y + 0.02, -0.015], [0, 0, 0], [0.26, 0.29, 0.27]));
      out.push(part(p.cone, 0x5e4c34, [0, y + 0.1, -0.12], [-0.9, 0, 0], [0.12, 0.2, 0.12]));
      out.push(part(p.cyl, 0x5e4c34, [0, 1.47, -0.01], [0, 0, 0], [0.42, 0.12, 0.36]));
      break;
    default:
      out.push(part(p.hemi, hair, [0, y + 0.03, -0.01], [0, 0, 0], [0.215, 0.2, 0.235]));
      out.push(part(p.box, hair, [0, y - 0.02, -0.09], [0, 0, 0], [0.18, 0.14, 0.06]));
  }
}

// ---------------------------------------------------------------- soldier
const cache = new Map();

export function lookFor(seed) {
  const r = (n) => Math.floor(((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1 * 1000);
  return { skin: SKINS[r(1) % SKINS.length], hair: HAIR[r(2) % HAIR.length], beard: r(3) % 3 !== 0 };
}

export function getModelGeos(type, team, variant = 0) {
  const key = `${type}:${team}:${variant}`;
  if (cache.has(key)) return cache.get(key);
  const t = UNIT_TYPES[type];
  const p = prims();
  const look = lookFor(variant + 1);
  const [bodyCol] = BODY_STYLES[t.body];
  const raider = team === RAIDER_TEAM;
  const cloth = raider ? (type === 'warlord' ? 0x5c1a14 : [0x4d3a28, 0x3e3a30, 0x5a2e22][variant % 3]) : TEAM_COLORS[team];
  const metal = t.body === 'plate' ? 0xc6cad2 : t.body === 'mail' ? 0x9aa0a8 : IRON;
  const mailCol = 0x7d828a;
  const armSkin = raider && t.body !== 'plate';

  // torso: hips, chest, tabard, belt, neck, head
  const torso = [];
  torso.push(part(p.taper, bodyCol, [0, 1.25, 0], [0, 0, 0], [0.42, 0.52, 0.25]));          // chest
  torso.push(part(p.sphere, bodyCol, [0, 1.42, 0], [0, 0, 0], [0.48, 0.2, 0.27]));          // shoulders
  torso.push(part(p.box, t.body === 'plate' ? metal : PANTS, [0, 0.96, 0], [0, 0, 0], [0.34, 0.18, 0.22]));
  if (t.body === 'mail' || t.body === 'plate') {
    torso.push(part(p.skirt, mailCol, [0, 0.85, 0], [0, 0, 0], [0.38, 0.32, 0.27]));        // mail skirt
  }
  if (t.body !== 'fur' && !(raider && t.body === 'leather')) {
    // tabard (front + back panels with trim)
    torso.push(part(p.box, cloth, [0, 1.12, 0.128], [0, 0, 0], [0.38, 0.78, 0.02]));
    torso.push(part(p.box, cloth, [0, 1.12, -0.128], [0, 0, 0], [0.38, 0.78, 0.02]));
    torso.push(part(p.box, TRIM, [0, 0.74, 0.13], [0, 0, 0], [0.38, 0.03, 0.022]));
    torso.push(part(p.box, TRIM, [0, 0.74, -0.13], [0, 0, 0], [0.38, 0.03, 0.022]));
    if (!raider) torso.push(part(p.box, TRIM, [0, 1.25, 0.14], [0, 0, 0], [0.06, 0.26, 0.01]));
    if (!raider) torso.push(part(p.box, TRIM, [0, 1.3, 0.14], [0, 0, 0], [0.2, 0.05, 0.01]));
  } else if (t.body === 'fur') {
    torso.push(part(p.sphere, 0x7a6450, [0, 1.42, -0.02], [0, 0, 0], [0.62, 0.26, 0.38]));
    torso.push(part(p.skirt, 0x5a4634, [0, 0.86, 0], [0, 0, 0], [0.36, 0.34, 0.26]));
  } else {
    torso.push(part(p.box, cloth, [0.0, 1.05, 0], [0, 0, 0.12], [0.44, 0.08, 0.27]));
    torso.push(part(p.skirt, cloth, [0, 0.86, 0], [0, 0, 0], [0.34, 0.3, 0.24]));
  }
  torso.push(part(p.box, LEATHER, [0, 0.98, 0], [0, 0, 0], [0.43, 0.06, 0.27]));          // belt
  torso.push(part(p.box, GOLD, [0, 0.98, 0.138], [0, 0, 0], [0.06, 0.05, 0.01]));          // buckle
  torso.push(part(p.box, LEATHER, [0.17, 0.92, 0.08], [0, 0, 0], [0.08, 0.1, 0.05]));       // pouch
  if (t.body === 'plate') {
    torso.push(part(p.sphere, metal, [-0.25, 1.45, 0], [0, 0, 0.3], [0.2, 0.15, 0.22]));    // pauldrons
    torso.push(part(p.sphere, metal, [0.25, 1.45, 0], [0, 0, -0.3], [0.2, 0.15, 0.22]));
    torso.push(part(p.box, metal, [0, 1.3, 0.12], [0.15, 0, 0], [0.34, 0.28, 0.04]));       // breastplate
  }
  if (t.body === 'gambeson') {
    for (let i = 0; i < 4; i++) torso.push(part(p.box, 0x7d6a4a, [0, 1.08 + i * 0.1, 0.129], [0, 0, 0], [0.37, 0.012, 0.02]));
  }
  headParts(t, look, metal, mailCol, torso);
  if (t.cape) {
    torso.push(part(p.box, cloth, [0, 1.0, -0.17], [0.1, 0, 0], [0.5, 1.0, 0.025]));
    torso.push(part(p.box, GOLD, [0, 1.47, -0.15], [0, 0, 0], [0.5, 0.04, 0.03]));
  }
  if (t.weapon === 'bow') {
    torso.push(part(p.cyl8, LEATHER, [0.13, 1.25, -0.17], [0, 0, 0.35], [0.12, 0.55, 0.12]));
    for (let i = 0; i < 4; i++) torso.push(part(p.box, 0xe8e0d0, [0.21 + i * 0.012, 1.55, -0.17 + (i % 2) * 0.03], [0, 0, 0.35], [0.02, 0.1, 0.005]));
  }
  if (t.weapon === 'sword' || t.weapon === 'lance') torso.push(part(p.box, LEATHER, [-0.2, 0.82, 0.02], [0.15, 0, 0.12], [0.05, 0.42, 0.05])); // scabbard

  const legs = t.body === 'plate' ? metal : t.body === 'mail' ? mailCol : PANTS;
  const thigh = mergeGeometries([
    part(p.taper, legs, [0, -0.22, 0], [0, 0, 0], [0.17, 0.46, 0.18]),
    part(p.lowSphere, legs, [0, 0, 0], [0, 0, 0], [0.16, 0.14, 0.17]),
  ]);
  const shin = mergeGeometries([
    part(p.lowSphere, t.body === 'plate' ? metal : legs, [0, 0, 0], [0, 0, 0], [0.14, 0.12, 0.15]),
    part(p.taper, BOOT, [0, -0.24, 0], [0, 0, 0], [0.135, 0.42, 0.14]),
    part(p.cyl, BOOT_CUFF, [0, -0.06, 0], [0, 0, 0], [0.155, 0.08, 0.16]),
    part(p.box, BOOT, [0, -0.43, 0.06], [0, 0, 0], [0.12, 0.08, 0.26]),
  ]);

  const sleeve = armSkin ? look.skin : bodyCol;
  const upperArm = mergeGeometries([
    part(p.lowSphere, sleeve, [0, 0, 0], [0, 0, 0], [0.14, 0.14, 0.14]),
    part(p.taper, sleeve, [0, -0.15, 0], [0, 0, 0], [0.12, 0.3, 0.12]),
  ]);
  const glove = t.body === 'plate' ? metal : LEATHER;
  const foreParts = () => [
    part(p.lowSphere, sleeve, [0, 0, 0], [0, 0, 0], [0.11, 0.1, 0.11]),
    part(p.taper, sleeve, [0, -0.13, 0], [0, 0, 0], [0.1, 0.26, 0.1]),
    part(p.cyl8, glove, [0, -0.2, 0], [0, 0, 0], [0.115, 0.1, 0.115]),
    part(p.box, armSkin ? look.skin : glove, [0, -0.3, 0.01], [0, 0, 0], [0.085, 0.1, 0.1]),
  ];
  const foreL = foreParts();
  shieldParts(t.shield, cloth, raider, foreL);
  if (t.weapon === 'bow') {
    foreL.push(part(p.bow, WOOD, [0, 0, 0]));
    foreL.push(part(p.string, 0xddd5c0, [0, -0.27, 0], [Math.PI / 2, 0, 0]));
  }
  const res = {
    torso: mergeGeometries(torso),
    thigh, shin, upperArm,
    foreL: mergeGeometries(foreL),
    foreR: mergeGeometries(foreParts()),
    weapon: weaponGeo(t.weapon),
  };
  cache.set(key, res);
  return res;
}

let unitMat = null;
function weaveTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 900; i++) {
    const g = 170 + Math.random() * 85;
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 1, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function unitMaterial() {
  if (!unitMat) unitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3, map: weaveTexture(), side: THREE.DoubleSide });
  return unitMat;
}

const mk = (g) => { const m = new THREE.Mesh(g, unitMaterial()); m.castShadow = true; return m; };
function joint(x, y, z, geo) { const j = new THREE.Group(); j.position.set(x, y, z); if (geo) j.add(mk(geo)); return j; }

// Build a posable soldier. Returns the root group and its joints.
export function buildSoldier(type, team, variant = Math.floor(Math.random() * 6)) {
  const geos = getModelGeos(type, team, variant);
  const t = UNIT_TYPES[type];
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(t.scale || 1);
  root.add(body);
  const torso = new THREE.Group();
  torso.add(mk(geos.torso));
  body.add(torso);

  const hipL = joint(-0.1, 0.92, 0, geos.thigh), hipR = joint(0.1, 0.92, 0, geos.thigh);
  const kneeL = joint(0, -0.46, 0, geos.shin), kneeR = joint(0, -0.46, 0, geos.shin);
  hipL.add(kneeL); hipR.add(kneeR);
  const shL = joint(-0.25, 1.43, 0, geos.upperArm), shR = joint(0.25, 1.43, 0, geos.upperArm);
  const elL = joint(0, -0.3, 0, geos.foreL), elR = joint(0, -0.3, 0, geos.foreR);
  shL.add(elL); shR.add(elR);
  torso.add(shL, shR);
  body.add(hipL, hipR);
  let weapon = null;
  if (geos.weapon) {
    weapon = new THREE.Group();
    weapon.position.set(0, -0.3, 0.02);
    weapon.rotation.x = WEAPON_TILT[t.weapon] ?? -1;
    weapon.add(mk(geos.weapon));
    elR.add(weapon);
  }
  return { weaponTilt: WEAPON_TILT[t.weapon] ?? -1, root, body, torso, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, weapon, ranged: t.weapon === 'bow', lance: t.weapon === 'lance' };
}

// Arm keyframes per attack direction: [shoulder x, elbow x, shoulder z, torso twist, weapon tilt offset]
const WIND = {
  over: [-2.8, -1.3, 0, 0, 0],
  right: [-1.5, -1.3, 1.25, 0.45, -0.3],
  left: [-1.6, -1.7, -0.95, -0.5, -0.3],
  thrust: [-0.8, -2.1, 0.15, 0.3, -0.45],
};
const END = {
  over: [-0.5, -0.15, 0, -0.05, 0],
  right: [-1.4, -0.2, -0.7, -0.4, -0.3],
  left: [-1.4, -0.2, 0.8, 0.4, -0.3],
  thrust: [-1.55, 0, 0, -0.15, -0.45],
};
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

// Pose a soldier for this frame.
// st: { phase, speed, moving, swingT, attackDir, stagger, mounted, blocking }
export function poseSoldier(m, st) {
  const sp = st.speed || 0;
  if (st.mounted) {
    // seated: thighs forward and splayed, shins hanging
    m.hipL.rotation.set(-1.25, 0, -0.35); m.hipR.rotation.set(-1.25, 0, 0.35);
    m.kneeL.rotation.x = m.kneeR.rotation.x = 1.35;
    m.body.position.y = st.moving ? Math.abs(Math.sin(st.phase)) * 0.06 : 0;
    m.torso.rotation.x = st.moving ? 0.12 + Math.min(0.15, sp * 0.012) : 0.05;
  } else {
    const swing = st.moving ? Math.sin(st.phase) * Math.min(0.8, sp * 0.17) : 0;
    m.hipL.rotation.set(swing, 0, 0);
    m.hipR.rotation.set(-swing, 0, 0);
    // bend the trailing knee
    m.kneeL.rotation.x = st.moving ? Math.max(0, Math.sin(st.phase - 1.2)) * Math.min(1.1, sp * 0.22) : 0.05;
    m.kneeR.rotation.x = st.moving ? Math.max(0, Math.sin(st.phase + Math.PI - 1.2)) * Math.min(1.1, sp * 0.22) : 0.05;
    m.body.position.y = st.moving ? -Math.abs(Math.sin(st.phase)) * 0.04 : Math.sin((st.idle || 0) * 1.6) * 0.006;
    m.torso.rotation.x = st.moving ? Math.min(0.12, sp * 0.015) : 0;
  }
  const armSwing = st.moving && !st.mounted ? Math.sin(st.phase) * Math.min(0.5, sp * 0.1) : 0;
  // left arm: shield up in front, bow arm relaxed
  if (m.ranged) { m.shL.rotation.set(-0.25 + armSwing * 0.4, 0, 0.1); m.elL.rotation.x = -0.35; }
  else if (st.blocking) { m.shL.rotation.set(-1.25, 0.3, 0.2); m.elL.rotation.x = -0.6; }
  else { m.shL.rotation.set(-0.45 - armSwing * 0.3, 0, 0.12); m.elL.rotation.x = -0.75; }
  // right arm: weapon ready
  let sh = m.ranged ? -0.15 - armSwing * 0.5 : -0.3 + armSwing * 0.4, el = m.ranged ? -0.3 : -0.55, rz = 0;
  let twist = 0, tiltOff = 0;
  if (m.lance && st.mounted) { sh = -0.5; el = -0.8; }
  const t = st.swingT;
  if (t >= 0) {
    if (m.ranged) {
      const a = Math.min(1, t / 0.35);
      m.shL.rotation.set(-1.52 * a, 0, 0.05);
      m.elL.rotation.x = -0.05 * a;
      sh = -1.45 * a;
      el = -1.9 * a;
      rz = 0.15 * a;
    } else if (m.lance && st.mounted) {
      sh = -1.2; el = -0.3;
    } else {
      // directional swing: idle -> wind-up -> strike -> back to idle
      const W = WIND[st.attackDir] || WIND.over, E = END[st.attackDir] || END.over;
      const idle = [sh, el, 0, 0, 0];
      let from, to, k;
      if (t < 0.25) { from = idle; to = W; k = ease(t / 0.25); }
      else if (t < 0.4) { from = W; to = E; k = ease((t - 0.25) / 0.15); }
      else { from = E; to = idle; k = ease(Math.min(1, (t - 0.4) / 0.22)); }
      sh = lerp(from[0], to[0], k); el = lerp(from[1], to[1], k); rz = lerp(from[2], to[2], k);
      twist = lerp(from[3], to[3], k); tiltOff = lerp(from[4], to[4], k);
    }
  }
  if (st.stagger > 0) {
    // knocked back: lean away, weapon arm flung out
    m.torso.rotation.x -= 0.4 * st.stagger;
    sh = lerp(sh, -1.1, st.stagger); rz = lerp(rz, 0.6, st.stagger); el = lerp(el, -0.2, st.stagger);
  }
  m.torso.rotation.y = twist;
  if (m.weapon) m.weapon.rotation.x = m.weaponTilt + tiltOff;
  m.shR.rotation.set(sh, 0, rz);
  m.elR.rotation.x = el;
}

// ---------------------------------------------------------------- horse
const COATS = [0x5a3a22, 0x7a4e2c, 0x2a221c, 0x9a8a78, 0xd8d0c4, 0x8a5a30];
const horseCache = new Map();

function horseGeos(team, variant, barded) {
  const key = `${team}:${variant}:${barded}`;
  if (horseCache.has(key)) return horseCache.get(key);
  const p = prims();
  const coat = COATS[variant % COATS.length];
  const mane = variant % COATS.length === 4 ? 0xb8b0a4 : 0x1e1814;
  const cloth = team === RAIDER_TEAM ? 0x4d3a28 : TEAM_COLORS[team];
  const body = [];
  body.push(part(p.sphere, coat, [0, 1.38, 0], [Math.PI / 2, 0, 0], [0.62, 1.75, 0.72]));     // barrel
  body.push(part(p.sphere, coat, [0, 1.42, 0.62], [0, 0, 0], [0.6, 0.72, 0.62]));             // chest
  body.push(part(p.sphere, coat, [0, 1.45, -0.62], [0, 0, 0], [0.62, 0.66, 0.66]));           // rump
  body.push(part(p.taper, coat, [0, 1.85, 0.95], [0.75, 0, 0], [0.34, 0.95, 0.42]));          // neck
  body.push(part(p.box, mane, [0, 2.0, 0.85], [0.75, 0, 0], [0.07, 0.95, 0.12]));             // mane
  body.push(part(p.taper, coat, [0, 2.15, 1.45], [1.75, 0, 0], [0.24, 0.62, 0.3]));           // head
  body.push(part(p.sphere, coat, [0, 2.2, 1.25], [0, 0, 0], [0.26, 0.3, 0.32]));
  body.push(part(p.box, 0x1a1410, [-0.12, 2.24, 1.35], [0, 0, 0], [0.02, 0.04, 0.05]));       // eyes
  body.push(part(p.box, 0x1a1410, [0.12, 2.24, 1.35], [0, 0, 0], [0.02, 0.04, 0.05]));
  body.push(part(p.cone, coat, [-0.08, 2.42, 1.22], [-0.2, 0, -0.2], [0.07, 0.16, 0.05]));    // ears
  body.push(part(p.cone, coat, [0.08, 2.42, 1.22], [-0.2, 0, 0.2], [0.07, 0.16, 0.05]));
  body.push(part(p.taper, mane, [0, 1.35, -1.12], [-0.5, 0, 0], [0.12, 0.8, 0.12]));         // tail
  // tack: saddle, blanket, bridle
  body.push(part(p.box, LEATHER, [0, 1.78, -0.05], [0, 0, 0], [0.5, 0.12, 0.62]));
  body.push(part(p.box, LEATHER, [0, 1.86, -0.32], [0, 0, 0], [0.42, 0.14, 0.08]));
  body.push(part(p.box, cloth, [0, 1.72, -0.05], [0, 0, 0], [0.74, 0.04, 0.78]));
  body.push(part(p.box, LEATHER, [0, 2.15, 1.45], [1.75, 0, 0], [0.27, 0.05, 0.33]));
  if (barded) {
    // caparison: cloth skirt in the team's colour
    body.push(part(p.skirt, cloth, [0, 1.25, 0], [0, 0, 0], [0.72, 0.8, 2.05]));
    body.push(part(p.skirt, TRIM, [0, 0.83, 0], [0, 0, 0], [0.9, 0.05, 2.55]));
    body.push(part(p.taper, cloth, [0, 1.87, 0.92], [0.75, 0, 0], [0.37, 0.7, 0.45]));
  }
  const leg = mergeGeometries([
    part(p.taper, coat, [0, -0.32, 0], [0, 0, 0], [0.2, 0.66, 0.24]),
    part(p.taper, coat, [0, -0.85, 0], [0, 0, 0], [0.11, 0.48, 0.12]),
    part(p.cyl, 0x2a2420, [0, -1.13, 0.02], [0, 0, 0], [0.14, 0.1, 0.16]),
  ]);
  const res = { body: mergeGeometries(body), leg };
  horseCache.set(key, res);
  return res;
}

export function buildHorse(team, variant = Math.floor(Math.random() * 6), barded = true) {
  const g = horseGeos(team, variant, barded);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mk(g.body));
  const legs = [];
  for (const [x, z] of [[-0.22, 0.65], [0.22, 0.65], [-0.22, -0.7], [0.22, -0.7]]) {
    const l = joint(x, 1.2, z, g.leg);
    body.add(l);
    legs.push(l);
  }
  return { root, body, legs, phase: Math.random() * 6 };
}

// Gallop / trot / idle cycle. speed in m/s.
export function poseHorse(h, speed, dt) {
  h.phase += dt * (2 + speed * 0.9);
  const f = h.phase;
  const amp = Math.min(0.75, speed * 0.075);
  const gallop = speed > 8;
  const offs = gallop ? [0, 0.5, 2.6, 3.1] : [0, Math.PI, Math.PI, 0];
  h.legs.forEach((l, i) => { l.rotation.x = Math.sin(f + offs[i]) * amp; });
  h.body.position.y = speed > 0.5 ? Math.abs(Math.sin(f)) * Math.min(0.12, speed * 0.012) : 0;
  h.body.rotation.x = gallop ? Math.sin(f) * 0.05 : 0;
}

export const SADDLE_Y = 1.0; // how far a rider's root is raised to sit in the saddle
