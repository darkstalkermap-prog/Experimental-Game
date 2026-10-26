// Low-poly medieval soldier models. Each body part is one merged, vertex-coloured mesh
// whose geometry is shared by every unit of the same type and team (5 draw calls per soldier).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { UNIT_TYPES, BODY_STYLES, TEAM_COLORS, RAIDER_TEAM } from './config.js';

const SKIN = 0xc99a78;
const BOOT = 0x2e2118;
const PANTS = 0x4a4038;
const WOOD = 0x6b4a2c;
const STEEL = 0xc8ccd2;
const IRON = 0x55575c;
const GOLD = 0xd8a83a;

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

function part(geo, color, [x, y, z], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  const g = geo.clone();
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
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    sphere: new THREE.SphereGeometry(0.5, 12, 9),
    hemi: new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  // the bow: a curved tube in the left hand (arm-local), bulging forward when aimed
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.6, 0.62), new THREE.Vector3(0, -1.0, 0), new THREE.Vector3(0, -0.6, -0.62));
  P.bow = new THREE.TubeGeometry(curve, 10, 0.022, 5, false);
  return P;
}

function weaponParts(kind, out) {
  const p = prims();
  // weapons hang from the right hand (arm-local y = -0.6) along -y, then tilt forward
  const parts = [];
  if (kind === 'sword') {
    parts.push(part(p.box, STEEL, [0, -0.55, 0], [0, 0, 0], [0.055, 0.85, 0.018]));
    parts.push(part(p.box, IRON, [0, -0.1, 0], [0, 0, 0], [0.24, 0.04, 0.05]));
    parts.push(part(p.cyl6, 0x3a2617, [0, 0.03, 0], [0, 0, 0], [0.045, 0.2, 0.045]));
  } else if (kind === 'spear') {
    parts.push(part(p.cyl6, WOOD, [0, -0.6, 0], [0, 0, 0], [0.045, 2.6, 0.045]));
    parts.push(part(p.cone, STEEL, [0, -2.0, 0], [Math.PI, 0, 0], [0.09, 0.32, 0.09]));
  } else if (kind === 'axe') {
    parts.push(part(p.cyl6, WOOD, [0, -0.35, 0], [0, 0, 0], [0.045, 0.9, 0.045]));
    parts.push(part(p.box, IRON, [0, -0.72, 0.1], [0, 0, 0], [0.03, 0.22, 0.22]));
  } else if (kind === 'greataxe') {
    parts.push(part(p.cyl6, WOOD, [0, -0.6, 0], [0, 0, 0], [0.055, 1.6, 0.055]));
    parts.push(part(p.box, IRON, [0, -1.25, 0.16], [0, 0, 0], [0.04, 0.42, 0.34]));
    parts.push(part(p.box, IRON, [0, -1.25, -0.1], [0, 0, 0], [0.04, 0.2, 0.18]));
  }
  out.push(...parts);
}

export const WEAPON_TILT = { sword: -1.0, spear: -1.45, axe: -0.9, greataxe: -0.8, bow: 0 };

function helmetParts(kind, metal, out) {
  const p = prims();
  const y = 1.7;
  switch (kind) {
    case 'kettle':
      out.push(part(p.hemi, metal, [0, y, 0], [0, 0, 0], [0.3, 0.3, 0.3]));
      out.push(part(p.cyl, metal, [0, y + 0.01, 0], [0, 0, 0], [0.46, 0.03, 0.46]));
      break;
    case 'nasal':
      out.push(part(p.cone, metal, [0, y + 0.13, 0], [0, 0, 0], [0.29, 0.34, 0.29]));
      out.push(part(p.box, metal, [0, y - 0.06, 0.14], [0, 0, 0], [0.03, 0.14, 0.02]));
      break;
    case 'great':
      out.push(part(p.cyl, metal, [0, y + 0.02, 0], [0, 0, 0], [0.31, 0.36, 0.31]));
      out.push(part(p.box, 0x111111, [0, y + 0.03, 0.155], [0, 0, 0], [0.2, 0.03, 0.01]));
      break;
    case 'crown':
      out.push(part(p.hemi, metal, [0, y, 0], [0, 0, 0], [0.29, 0.31, 0.29]));
      out.push(part(p.cyl, GOLD, [0, y + 0.04, 0], [0, 0, 0], [0.31, 0.07, 0.31]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        out.push(part(p.cone, GOLD, [Math.sin(a) * 0.14, y + 0.12, Math.cos(a) * 0.14], [0, 0, 0], [0.05, 0.1, 0.05]));
      }
      break;
    case 'horned':
      out.push(part(p.hemi, IRON, [0, y, 0], [0, 0, 0], [0.3, 0.3, 0.3]));
      out.push(part(p.cone, 0xe8dcc0, [-0.17, y + 0.12, 0], [0, 0, 0.9], [0.06, 0.25, 0.06]));
      out.push(part(p.cone, 0xe8dcc0, [0.17, y + 0.12, 0], [0, 0, -0.9], [0.06, 0.25, 0.06]));
      break;
    case 'hood':
      out.push(part(p.sphere, 0x5a4a33, [0, y + 0.02, -0.01], [0, 0, 0], [0.3, 0.31, 0.31]));
      break;
    default:
      out.push(part(p.hemi, 0x3b2a1a, [0, y + 0.01, -0.01], [0, 0, 0], [0.27, 0.24, 0.27]));
  }
}

const cache = new Map();

export function getModelGeos(type, team) {
  const key = type + ':' + team;
  if (cache.has(key)) return cache.get(key);
  const t = UNIT_TYPES[type];
  const p = prims();
  const [bodyCol] = BODY_STYLES[t.body];
  const raider = team === RAIDER_TEAM;
  const cloth = raider ? (type === 'warlord' ? 0x5c1a14 : 0x4d3a28) : TEAM_COLORS[team];
  const metal = t.body === 'plate' ? 0xc3c7cf : t.body === 'mail' ? 0x9aa0a8 : IRON;

  const torso = [];
  torso.push(part(p.box, bodyCol, [0, 1.27, 0], [0, 0, 0], [0.46, 0.58, 0.27]));
  if (t.body !== 'fur') torso.push(part(p.box, cloth, [0, 1.12, 0], [0, 0, 0], [0.48, 0.72, 0.29]));
  else torso.push(part(p.box, 0x7a6450, [0, 1.42, 0], [0, 0, 0], [0.58, 0.22, 0.34]));
  torso.push(part(p.box, 0x2a1d14, [0, 0.94, 0], [0, 0, 0], [0.5, 0.07, 0.31]));
  if (t.body === 'plate') {
    torso.push(part(p.sphere, metal, [-0.29, 1.5, 0], [0, 0, 0], [0.22, 0.16, 0.24]));
    torso.push(part(p.sphere, metal, [0.29, 1.5, 0], [0, 0, 0], [0.22, 0.16, 0.24]));
  }
  torso.push(part(p.cyl, SKIN, [0, 1.58, 0], [0, 0, 0], [0.12, 0.08, 0.12]));
  torso.push(part(p.sphere, SKIN, [0, 1.69, 0], [0, 0, 0], [0.24, 0.27, 0.25]));
  if (raider && t.helmet === 'none') torso.push(part(p.box, 0x3b2a1a, [0, 1.6, 0.1], [0, 0, 0], [0.18, 0.12, 0.06]));
  helmetParts(t.helmet, metal, torso);
  if (t.cape) {
    torso.push(part(p.box, cloth, [0, 1.0, -0.2], [0.08, 0, 0], [0.56, 1.05, 0.03]));
  }
  if (t.ranged) torso.push(part(p.cyl6, 0x4b3020, [0.12, 1.3, -0.18], [0, 0, 0.35], [0.12, 0.6, 0.12]));

  const leg = (side) => {
    const g = [];
    g.push(part(p.box, t.body === 'plate' ? metal : PANTS, [0, -0.38, 0], [0, 0, 0], [0.17, 0.62, 0.19]));
    g.push(part(p.box, BOOT, [0, -0.8, 0.03], [0, 0, 0], [0.18, 0.24, 0.26]));
    return mergeGeometries(g);
  };

  const armBase = () => [
    part(p.box, bodyCol, [0, -0.25, 0], [0, 0, 0], [0.13, 0.5, 0.14]),
    part(p.box, t.body === 'plate' ? metal : SKIN, [0, -0.56, 0.01], [0, 0, 0], [0.11, 0.14, 0.12]),
  ];
  const armL = armBase();
  if (t.shield === 'round') {
    armL.push(part(p.cyl, raider ? 0x5d4026 : cloth, [0, -0.42, 0.14], [Math.PI / 2, 0, 0], [0.78, 0.05, 0.78]));
    armL.push(part(p.cyl, IRON, [0, -0.42, 0.17], [Math.PI / 2, 0, 0], [0.16, 0.04, 0.16]));
  } else if (t.shield === 'kite') {
    armL.push(part(p.box, cloth, [0, -0.45, 0.14], [0, 0, 0], [0.5, 0.82, 0.05]));
    armL.push(part(p.box, 0xe9dcae, [0, -0.38, 0.17], [0, 0, 0], [0.06, 0.6, 0.02]));
    armL.push(part(p.box, 0xe9dcae, [0, -0.3, 0.17], [0, 0, 0], [0.4, 0.06, 0.02]));
  }
  if (t.weapon === 'bow') armL.push(part(p.bow, WOOD, [0, 0, 0]));

  const armR = armBase();
  const weapon = [];
  weaponParts(t.weapon, weapon);

  const res = {
    torso: mergeGeometries(torso),
    leg: leg(),
    armL: mergeGeometries(armL),
    armR: mergeGeometries(armR),
    weapon: weapon.length ? mergeGeometries(weapon) : null,
  };
  cache.set(key, res);
  return res;
}

let unitMat = null;
export function unitMaterial() {
  if (!unitMat) unitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.28 });
  return unitMat;
}

// Build a posable soldier. Returns the root group and the moving parts.
export function buildSoldier(type, team) {
  const geos = getModelGeos(type, team);
  const t = UNIT_TYPES[type];
  const mat = unitMaterial();
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(t.scale || 1);
  root.add(body);
  const mk = (g) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = false; return m; };
  body.add(mk(geos.torso));
  const legL = new THREE.Group(); legL.position.set(-0.12, 0.92, 0); legL.add(mk(geos.leg));
  const legR = new THREE.Group(); legR.position.set(0.12, 0.92, 0); legR.add(mk(geos.leg));
  const armL = new THREE.Group(); armL.position.set(-0.31, 1.5, 0); armL.add(mk(geos.armL));
  const armR = new THREE.Group(); armR.position.set(0.31, 1.5, 0); armR.add(mk(geos.armR));
  let weapon = null;
  if (geos.weapon) {
    weapon = new THREE.Group();
    weapon.position.set(0, -0.6, 0.02);
    weapon.rotation.x = WEAPON_TILT[t.weapon] ?? -1;
    weapon.add(mk(geos.weapon));
    armR.add(weapon);
  }
  body.add(legL, legR, armL, armR);
  return { root, body, legL, legR, armL, armR, weapon };
}
