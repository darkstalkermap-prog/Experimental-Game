// The first-person kit: arms, hands, weapons and how they move. player.js keeps thin calls (buildViewModel / rebuildWeapons /
// updateViewModel) and this module does the rest. Nothing here changes gameplay: it only READS the hero's combat state (atk, blocking,
// drawT, aiming, castFlash, climb, ...) and draws it. The kit hangs on the camera, uses its own field of view and squeezes its depth in the
// vertex shader (vmmat.js), so it never pokes through a wall or the ground.
import * as THREE from 'three';
import { Q, onQuality } from './quality.js';
import { limitShadow } from './shadows.js';
import { TEAM_COLORS } from './config.js';
import { VMU, kitMaterial, glowMaterial, glowTexture, syncKitFov } from './vmmat.js';
import { handGeometry, armGeometry, shieldGeometry, bowGeometry, arrowGeometry, PAINT } from './vmkit.js';
import { weaponGeometry, lanceGeometry, flaskGeometry, quiverGeometry } from './vmweapons.js';
import { Mesher, paint, tone, PAT } from './vmgeo.js';
import { armsOf } from './heraldry.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeInOut = (k) => k * k * (3 - 2 * k);
const smooth = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

// a damped spring on one number (underdamped: a little overshoot)
class Spring {
  constructor(k = 260, c = 20) { this.x = 0; this.v = 0; this.k = k; this.c = c; }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
  kick(v) { this.v += v; }
}

// scratch objects (nothing is allocated per frame); each helper has its own so they can be nested
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const IK_A = new THREE.Vector3(), IK_B = new THREE.Vector3(), LIMB = new THREE.Vector3(), STR_A = new THREE.Vector3(), STR_B = new THREE.Vector3();
const ZAXIS = new THREE.Vector3(0, 0, 1), YAXIS = new THREE.Vector3(0, 1, 0), MINV = new THREE.Matrix4();
const QH = new THREE.Quaternion(), FA = new THREE.Vector3();

// ---------------------------------------------------------------- arm styles per class
function armStyle(cls, team) {
  const col = TEAM_COLORS[team] ?? TEAM_COLORS[0];
  const cloth = (k = 0.8, hex = col) => tone(paint(hex, 0, 0.88, PAT.cloth), k);
  switch (cls) {
    case 'berserker': return { sleeve: null, skin: PAINT.skin, bracer: PAINT.leather, hand: PAINT.skin };
    case 'ranger': return { sleeve: cloth(0.7, 0x2f5a34), cuff: PAINT.leatherLight, bracer: PAINT.leather, skin: PAINT.skin, hand: paint(0x6b4a2c, 0, 0.7, PAT.leather) };
    case 'mage': return { sleeve: cloth(0.8, 0x2b2160), cuff: PAINT.gold, flare: true, skin: PAINT.skin, hand: PAINT.skin, trim: PAINT.gold };
    case 'cleric': return { sleeve: cloth(1.0, 0xe9e0c6), cuff: paint(col, 0, 0.85, PAT.cloth), flare: true, skin: PAINT.skin, hand: PAINT.skin, trim: PAINT.gold };
    case 'cavalier': return { sleeve: cloth(0.85), cuff: PAINT.gold, vambrace: PAINT.steel, skin: PAINT.skin, hand: PAINT.leather, plate: PAINT.steel, trim: PAINT.gold };
    default: return { sleeve: cloth(0.8), cuff: PAINT.steel, vambrace: PAINT.steel, skin: PAINT.skin, hand: PAINT.leather, plate: PAINT.steel, trim: PAINT.gold };
  }
}
// the swing trail's colour per class
const TRAIL = { knight: [0.7, 0.82, 1], cavalier: [0.8, 0.85, 1], ranger: [0.75, 0.9, 0.8], berserker: [1, 0.55, 0.35], mage: [1, 0.6, 0.25], cleric: [1, 0.9, 0.5] };

// ---------------------------------------------------------------- poses (kit space: the camera looks down -z; metres)
// the weapon hand's grip frame at rest, and where each strike winds up and ends (offsets from rest)
const REST = { x: 0.25, y: -0.22, z: -0.5, rx: -0.95, ry: 0.2, rz: -0.38 };
const LANCE_REST = { x: 0.3, y: -0.3, z: -0.34, rx: -1.42, ry: 0.1, rz: -0.14 };
const ZERO = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const WIND = {
  right: { x: 0.14, y: 0.09, z: 0.04, rx: 0.2, ry: 0, rz: -1.3 },
  left: { x: -0.32, y: 0.09, z: 0, rx: 0.2, ry: 0.3, rz: 1.2 },
  over: { x: -0.04, y: 0.22, z: 0.08, rx: 0.9, ry: 0, rz: 0.25 },
  thrust: { x: -0.09, y: 0.02, z: 0.16, rx: -0.55, ry: 0.1, rz: 0.3 },
};
const END = {
  right: { x: -0.45, y: -0.09, z: -0.08, rx: -0.4, ry: 0, rz: 1.3 },
  left: { x: 0.22, y: -0.08, z: -0.08, rx: -0.4, ry: -0.3, rz: -1.2 },
  over: { x: -0.08, y: -0.26, z: -0.11, rx: -1.0, ry: 0, rz: 0.2 },
  thrust: { x: -0.11, y: 0.05, z: -0.3, rx: -0.5, ry: 0.1, rz: 0.3 },
};
const HAND_SCALE = 1.1;   // hands read better a little large when seen this close
const ORDER_KIT = 1000;   // drawn after the world
const SHIELD_REST = { x: -0.37, y: -0.3, z: -0.58, rx: -0.18, ry: 0.62, rz: 0.12 };
const GUARD = { x: -0.2, y: -0.24, z: -0.52, rx: -0.05, ry: 0.3, rz: 0.06 };   // the shield brought across the front
// the Knight's tall kite: carried lower and turned further out of the way, and on guard held with its top just under the eyes (it reaches
// a third higher above the grip than a round shield does), so the enemy stays in sight over its rim
const KITE_REST = { x: -0.45, y: -0.43, z: -0.6, rx: -0.2, ry: 0.76, rz: 0.14 };
const KITE_GUARD = { x: -0.19, y: -0.36, z: -0.55, rx: -0.08, ry: 0.3, rz: 0.06 };
// The bow. At rest it is held low across the front, an arrow on the string. Drawing, the bow arm comes up straight at the mark and the
// string hand pulls the nock back along the arrow's line to the anchor under the jaw (BOW_ANCHOR, the nock's place at full draw; the eye
// looks down the arrow from just above it, so the arrow points where the cross does); the draw elbow goes up and back behind, in line.
// The arrow lies on the shelf on the left of the riser, over the bow hand; the bow is canted a little, its top to the right.
const BOW_REST = { x: -0.13, y: -0.29, z: -0.5, rx: -0.3, ry: 0.35, rz: 0.55 };
const BOW_AIM = { rx: 0, ry: 0, rz: -0.17 };
const BOW_ANCHOR = new THREE.Vector3(0.012, -0.095, -0.025);
const NOCK_Y = 0.068, ARROW_REST = new THREE.Vector3(-0.025, NOCK_Y, -0.016), DRAW_Z = 0.685;   // (bow frame: the nocking point's height, where the arrow lies on the shelf, the nock's z at full draw)
const SH_BOW_L = new THREE.Vector3(-0.07, -0.21, 0.0), SH_BOW_R = new THREE.Vector3(0.17, -0.2, 0.26);   // the shoulders, side-on to the mark
const POLE_BOW_L = new THREE.Vector3(-1, -0.3, 0).normalize(), POLE_BOW_R = new THREE.Vector3(0.5, 0.6, 0.4).normalize();
const VOLLEY_PIVOT = new THREE.Vector3(0.02, -0.45, 0.12);   // (where the lean back for a high shot turns: low in the chest)
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Z = new THREE.Vector3(0, 0, 1), ARROW_FWD = new THREE.Vector3(0, 0, -1);
const BOW_E = new THREE.Euler(), BOW_Q = new THREE.Quaternion(), BOW_Q2 = new THREE.Quaternion(), BOW_P = new THREE.Vector3(), SH_A = new THREE.Vector3(), SH_B = new THREE.Vector3(), POLE_A = new THREE.Vector3(), POLE_B = new THREE.Vector3();
// a caster's weapon raised for a spell, the flask at the lips, and the two hands hauling up a wall
const CAST_STAFF = { x: 0.15, y: -0.15, z: -0.42, rx: -1.36, ry: 0.1, rz: -0.18 };
const CAST_MACE = { x: 0.12, y: -0.05, z: -0.5, rx: -0.35, ry: 0.1, rz: -0.1 };
const FLASK_A = { x: 0.06, y: -0.2, z: -0.34, rx: 0.9, ry: 0.0, rz: -0.1 }, FLASK_B = { x: 0.04, y: -0.15, z: -0.28, rx: 1.45, ry: 0.0, rz: -0.1 };
const CLIMB_R = { x: 0.2, y: 0.1, z: -0.44, rx: 1.45, ry: -0.5, rz: 0.0 }, CLIMB_L = { x: -0.2, y: 0.1, z: -0.44, rx: 1.45, ry: 0.5, rz: 0.0 };

const SH_R = new THREE.Vector3(0.2, -0.3, 0.14), SH_L = new THREE.Vector3(-0.2, -0.3, 0.14);
const POLE_R = new THREE.Vector3(0.7, -1, 0.3).normalize(), POLE_L = new THREE.Vector3(-0.7, -1, 0.3).normalize();
const L1 = 0.32, L2 = 0.3;
// How far a wrist bends (radians): toward the thumb (radial) and the little finger (ulnar), the palm (flexion) and the back (extension).
// A hand that grips something works in the middle of these; the forearm turns (pronation and supination happen in the forearm, not the wrist).
const WRIST = { radial: 0.35, ulnar: 0.6, flex: 0.6, ext: 0.55 };
// A fist closes on a hilt diagonally: from the root of the index finger across to the heel of the palm, so with the wrist straight the blade
// leans forward of square to the forearm by this much (the hand mesh is turned about its palm's normal by it).
const GRIP_TILT = 0.38;

// two-bone arm: the elbow, given the shoulder s, the wrist w and the side the elbow prefers (the shoulder follows when the wrist is out of reach)
function solveArm(s, w, pole, elbow, shoulder) {
  const reach = (L1 + L2) * 0.97;
  IK_A.subVectors(w, s);
  let d = IK_A.length();
  shoulder.copy(s);
  if (d > reach) { shoulder.copy(w).addScaledVector(IK_A, -reach / d); IK_A.subVectors(w, shoulder); d = reach; }
  d = Math.max(d, 0.08);
  IK_A.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
  IK_B.copy(pole).addScaledVector(IK_A, -pole.dot(IK_A));
  if (IK_B.lengthSq() < 1e-6) IK_B.set(0, -1, 0);
  IK_B.normalize();
  elbow.copy(shoulder).addScaledVector(IK_A, a).addScaledVector(IK_B, h);
}

// the string's z at the nocking point when the bow is braced (on the line between the tips)
const info0 = (info) => info.tipTop.z;

// ---------------------------------------------------------------- the weapon trail: a pooled ribbon between two points of the blade
const TRAIL_N = 20, TRAIL_LIFE = 0.17;
class Trail {
  constructor(mat) {
    this.pos = new Float32Array(TRAIL_N * 2 * 3);
    this.col = new Float32Array(TRAIL_N * 2 * 3);
    this.tx = new Float32Array(TRAIL_N * 6);   // tip xyz, base xyz per sample (newest first)
    this.age = new Float32Array(TRAIL_N).fill(99);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.live = 0;
  }
  // add a sample (tip and base in kit space)
  push(tip, base) {
    const fresh = this.age[0] > 0.06;   // (a new swing: older points start at the same place, so no streak is drawn from the last one)
    if (!fresh) this.tx.copyWithin(6, 0, (TRAIL_N - 1) * 6);
    this.age.copyWithin(1, 0, TRAIL_N - 1);
    for (let i = 0; i < (fresh ? TRAIL_N : 1); i++) {
      const o = i * 6;
      this.tx[o] = tip.x; this.tx[o + 1] = tip.y; this.tx[o + 2] = tip.z; this.tx[o + 3] = base.x; this.tx[o + 4] = base.y; this.tx[o + 5] = base.z;
    }
    this.age[0] = 0;
  }
  update(dt, rgb, alpha) {
    let live = 0;
    for (let i = 0; i < TRAIL_N; i++) this.age[i] += dt;
    for (let i = 0; i < TRAIL_N; i++) {
      const a = this.age[i] < TRAIL_LIFE ? Math.pow(1 - this.age[i] / TRAIL_LIFE, 2) * alpha : 0;
      if (a > 0.004) live++;
      const j = i * 6, o = i * 6;
      this.pos[o] = this.tx[j]; this.pos[o + 1] = this.tx[j + 1]; this.pos[o + 2] = this.tx[j + 2];
      this.pos[o + 3] = this.tx[j + 3]; this.pos[o + 4] = this.tx[j + 4]; this.pos[o + 5] = this.tx[j + 5];
      // the base end is fainter than the tip
      this.col[o] = rgb[0] * a; this.col[o + 1] = rgb[1] * a; this.col[o + 2] = rgb[2] * a;
      this.col[o + 3] = rgb[0] * a * 0.25; this.col[o + 4] = rgb[1] * a * 0.25; this.col[o + 5] = rgb[2] * a * 0.25;
    }
    this.live = live;
    this.mesh.visible = live > 1;
    if (this.mesh.visible) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
  }
  clear() { this.age.fill(99); this.mesh.visible = false; this.live = 0; }
}

export class ViewModel {
  constructor(player) {
    this.p = player;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    player.camera.add(this.root);
    this.kitMat = kitMaterial();
    this.handMat = kitMaterial();
    this.glowMat = glowMaterial({ map: glowTexture(), color: 0xffffff });
    this.trailMat = glowMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.glassMat = kitMaterial({ transparent: true, opacity: 0.38, depthWrite: false });
    this.disposables = [];
    this.key = '';
    this.dirty = true;
    this.unQ = onQuality(() => { this.dirty = true; });
    this.spring = {};
    for (const n of ['kx', 'ky', 'kz', 'krx', 'kry', 'krz', 'sx', 'sy', 'sz', 'srx', 'sry', 'wx', 'wy', 'wz', 'wrx', 'wrz']) this.spring[n] = new Spring(n[0] === 's' ? 300 : 240, n[0] === 's' ? 22 : 19);
    this.lookX = new Spring(90, 13); this.lookY = new Spring(90, 13);
    this.bobT = 0; this.bobAmt = 0; this.sprintAmt = 0; this.drawAmt = 0; this.raiseAmt = 0; this.looseZ = 0; this.castAmt = 0; this.zoomAmt = 0; this.wallAmt = 0; this.drinkT = -1; this.lanceAmt = 0; this.powerAmt = 0; this.scopeAmt = 0; this.scopeHid = false;
    this.shieldPose = { ...SHIELD_REST };
    this.swap = 0; this.shown = 'sword';
    this.prev = { yaw: 0, pitch: 0, hp: 1, arrows: 0, potions: 0, onGround: true, vy: 0, draw: 0, mounted: false, init: false };
    this.recoil = 0; this.landDip = 0; this.hurtT = 0; this.wallT = 0;
    this.spread = 1;
    this.castCol = new THREE.Color();
    this.elbow = new THREE.Vector3(); this.shoulder = new THREE.Vector3();
    this.wristR = new THREE.Vector3(); this.wristL = new THREE.Vector3();
    this.tipK = new THREE.Vector3(); this.baseK = new THREE.Vector3();
  }

  // ------------------------------------------------------------ building
  keyNow() {
    const p = this.p;
    return `${p.classId}|${p.team}|${p.lv.sword}|${p.lv.shield}|${p.lv.bow}|${Q.detail}|${Q.kitShadows ? 1 : 0}|${p.cos.banner}|${p.cos.div}|${p.cos.tint}`;
  }

  clearKit() {
    for (const c of [...this.root.children]) this.root.remove(c);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  mk(geo, mat, own = true) {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;   // (the kit has its own projection: the camera's view of it means nothing)
    m.castShadow = !!Q.kitShadows && !mat.transparent;   // (the arms and the blade lay a shadow on the ground, in the near map only)
    if (m.castShadow) limitShadow(this.p.game.scene, m);
    m.receiveShadow = false;
    m.renderOrder = ORDER_KIT;
    if (own) this.disposables.push(geo);
    return m;
  }

  rebuild() {
    const p = this.p;
    this.clearKit();
    this.dirty = false;
    this.key = this.keyNow();
    const detail = Q.detail, cls = p.classId, team = p.team;
    const st = armStyle(cls, team);
    const R = this.R = {}, L = this.L = {};
    // The shield is held the way a real one is: its painted face and boss out toward the enemy, its wooden back, the straps and the
    // fist on the grip toward the holder. The left arm runs in front of that back, so it is drawn like the other arm.
    const arm = armGeometry(st, detail);
    this.disposables.push(arm.fore, arm.upper);
    for (const side of [R, L]) {
      side.fore = this.mk(arm.fore, this.kitMat, false);
      side.upper = this.mk(arm.upper, this.kitMat, false);
      this.root.add(side.fore, side.upper);
    }
    // the weapon hand and the weapon: the grip frame
    const hr = handGeometry('R', st, detail), hl = handGeometry('L', st, detail);
    this.disposables.push(hr.geo, hl.geo);
    R.grp = new THREE.Group();
    R.hand = this.mk(hr.geo, this.handMat, false);
    R.hand.scale.setScalar(HAND_SCALE);
    R.hand.rotation.x = GRIP_TILT;
    R.hand.updateMatrix();
    R.wrist = hr.wrist.clone().applyMatrix4(R.hand.matrix);
    const wpn = this.wpn = weaponGeometry(cls, { len: p.sword.len, ls: p.lv.sword, team, detail });
    // (the weapons are built with their edges along x; a fist holds a blade with its edges in line with the knuckles, the true edge (and
    // an axe's bit) toward where the fingers point, -z in the grip frame: turned a quarter about the grip to sit that way)
    wpn.geo.rotateY(-Math.PI / 2);
    for (const k of ['tip', 'base', 'focus']) if (wpn[k]) wpn[k].applyAxisAngle(YAXIS, -Math.PI / 2);
    R.weapon = this.mk(wpn.geo, this.kitMat);
    R.grp.add(R.hand, R.weapon);
    if (cls === 'cavalier') {   // a lance for riding
      this.lance = lanceGeometry({ team, detail });
      R.lance = this.mk(this.lance.geo, this.kitMat);
      R.lance.visible = false;
      R.grp.add(R.lance);
    } else R.lance = null;
    // the flask of the healing draught, at the neck
    const fl = flaskGeometry({ detail });
    for (const g of [fl.flask, fl.liquid, fl.cork]) g.translate(0, -0.052, 0);
    R.flask = new THREE.Group();
    R.glass = this.mk(fl.flask, this.glassMat);
    R.glass.renderOrder = ORDER_KIT + 1;
    R.liquid = this.mk(fl.liquid, this.kitMat);
    R.cork = this.mk(fl.cork, this.kitMat);
    R.flask.add(R.liquid, R.cork, R.glass);
    R.flask.visible = false;
    R.flask.scale.setScalar(0.8);
    R.grp.add(R.flask);
    // the shield, and the hand that holds it (its rod axis lies along the shield's strap)
    const sh = shieldGeometry({ cls, team, lv: p.lv.shield, detail, arms: armsOf(p.cos) });
    const shMat = kitMaterial({ map: sh.map });
    this.disposables.push(shMat);
    L.grp = new THREE.Group();
    L.shield = this.mk(sh.geo, shMat);
    L.shield.rotation.y = Math.PI;   // (built face +z: turned so the face looks away from the holder and the strap is on his side)
    L.shield.updateMatrix();
    L.hand = this.mk(hl.geo, this.handMat, false);
    L.hand.scale.setScalar(HAND_SCALE);
    L.hand.morphTargetInfluences[0] = 1;   // (a fist round the grip)
    L.hand.rotation.z = -Math.PI / 2;
    L.hand.position.set(0, sh.grip, 0.052);
    L.hand.updateMatrix();
    L.wrist = hl.wrist.clone().applyMatrix4(L.hand.matrix);
    L.grp.add(L.shield, L.hand);
    // a hand of its own for hauling up a wall (open, fingers up)
    L.climb = this.mk(hl.geo, this.handMat, false);
    L.climb.scale.setScalar(HAND_SCALE);
    L.climbGrp = new THREE.Group();
    L.climbGrp.add(L.climb);
    L.climbWrist = hl.wrist.clone().multiplyScalar(HAND_SCALE);
    // the bow: the left hand holds it, the right hand draws the string
    const bow = this.bowInfo = bowGeometry({ lv: p.lv.bow, detail });
    L.bowGrp = new THREE.Group();
    L.bow = this.mk(bow.geo, this.kitMat);
    L.bowHand = this.mk(hl.geo, this.handMat, false);
    L.bowHand.scale.setScalar(HAND_SCALE);
    L.bowHand.morphTargetInfluences[0] = 0.85;   // (a bow is held, not strangled)
    L.bowHand.rotation.set(0, -0.12, 0);   // (the riser in the fork of thumb and finger, the wrist straight behind it)
    L.bowHand.position.set(0, 0, -0.012);
    L.bowHand.updateMatrix();
    L.bowWrist = hl.wrist.clone().applyMatrix4(L.bowHand.matrix);
    L.bowGrp.add(L.bow, L.bowHand);
    const arrow = arrowGeometry({ lv: p.lv.bow, team });
    R.strGrp = new THREE.Group();
    R.arrowGrp = new THREE.Group();
    R.arrow = this.mk(arrow.geo, this.kitMat);
    R.arrowGrp.add(R.arrow);
    L.bowGrp.add(R.arrowGrp);
    R.strHand = this.mk(hr.geo, this.handMat, false);
    R.strHand.scale.setScalar(HAND_SCALE);
    R.strHand.rotation.set(0, 0.2, 0);   // (three fingers hook the string, the back of the hand out to the right)
    R.strHand.updateMatrix();
    R.strWrist = hr.wrist.clone().multiplyScalar(HAND_SCALE).applyMatrix4(R.strHand.matrix);
    R.strGrp.add(R.strHand);
    const strGeo = new Mesher().tube([[0, 0, 0], [0, 0, 1]], 0.0022, 4, { mat: paint(0xe3d9bd, 0, 0.8, PAT.cloth), cap: 'flat' }).build();
    const reinGeo = new Mesher().tube([[0, 0, 0], [0, 0, 1]], 0.0035, 5, { mat: PAINT.leather, cap: 'flat' }).build();
    this.disposables.push(strGeo, reinGeo);
    L.strTop = this.mk(strGeo, this.kitMat, false);
    L.strBot = this.mk(strGeo, this.kitMat, false);
    L.reinA = this.mk(reinGeo, this.kitMat, false);
    L.reinB = this.mk(reinGeo, this.kitMat, false);
    L.reinA.visible = L.reinB.visible = false;
    // a quiver at the hip: only its feathers show, at the bottom corner (rangers)
    if (cls === 'ranger') { L.quiver = this.mk(quiverGeometry({ team, detail }), this.kitMat); L.quiver.position.set(0.34, -0.5, -0.12); L.quiver.rotation.set(0.25, 0, -0.2); this.root.add(L.quiver); } else L.quiver = null;
    // spell light, and the swing trail
    const quad = new THREE.PlaneGeometry(1, 1);
    this.orb = new THREE.Mesh(quad, glowMaterial({ map: glowTexture(), color: 0xffffff }));   // (not a clone: a clone would lose the shader patch)
    this.orb.frustumCulled = false;
    this.disposables.push(quad, this.orb.material);
    this.orb.visible = false;
    this.trail = new Trail(this.trailMat);
    this.disposables.push(this.trail.geo);
    this.root.add(R.grp, L.grp, L.climbGrp, L.bowGrp, R.strGrp, L.strTop, L.strBot, L.reinA, L.reinB, this.orb, this.trail.mesh);
    this.shown = p.weapon;
    this.update(0.016, false, false, true);
  }

  // ------------------------------------------------------------ animation
  // set a group from a pose row (x y z rx ry rz) plus offsets
  place(grp, P, ox = 0, oy = 0, oz = 0, orx = 0, ory = 0, orz = 0) {
    grp.position.set((P.x + ox) * this.spread, P.y + oy, P.z + oz);
    grp.rotation.set(P.rx + orx, P.ry + ory, P.rz + orz, 'XYZ');
    grp.updateMatrix();
  }

  // a mesh whose +z runs from point a toward point b
  limb(mesh, a, b) {
    mesh.position.copy(a);
    LIMB.subVectors(b, a).normalize();
    mesh.quaternion.setFromUnitVectors(ZAXIS, LIMB);
    mesh.updateMatrix();
  }

  // One arm: the reach places the elbow (solveArm), then the forearm is turned, if it must be, until the hand sits on it within what a
  // wrist allows (WRIST), and the upper arm runs from that elbow toward the shoulder. hand is the hand mesh inside grp (its +z is the
  // forearm's line with the wrist straight, +y the thumb's side); palm is the side its palm faces along x (-1 right hand, +1 left hand).
  arm(side, wrist, shoulderAnchor, pole, grp, hand, palm) {
    solveArm(shoulderAnchor, wrist, pole, this.elbow, this.shoulder);
    QH.copy(grp.quaternion).multiply(hand.quaternion).invert();
    FA.subVectors(this.elbow, wrist).normalize().applyQuaternion(QH);
    const dev = clamp(Math.atan2(FA.y, FA.z), -WRIST.ulnar, WRIST.radial), flex = clamp(Math.atan2(palm * FA.x, FA.z), -WRIST.ext, WRIST.flex);
    FA.set(palm * Math.tan(flex), Math.tan(dev), 1).normalize().applyQuaternion(QH.invert());
    this.elbow.copy(wrist).addScaledVector(FA, L2);
    IK_A.subVectors(this.shoulder, this.elbow);
    this.shoulder.copy(this.elbow).addScaledVector(IK_A, L1 / Math.max(IK_A.length(), 1e-4));
    this.limb(side.fore, wrist, this.elbow);
    this.limb(side.upper, this.elbow, this.shoulder);
  }

  // a thin tube from a to b (given in `matrix`'s frame), as a unit-length mesh scaled to fit
  strand(mesh, a, b, matrix) {
    STR_A.copy(a); STR_B.copy(b);
    if (matrix) { STR_A.applyMatrix4(matrix); STR_B.applyMatrix4(matrix); }
    const len = STR_A.distanceTo(STR_B);
    mesh.position.copy(STR_A);
    STR_B.sub(STR_A).normalize();
    mesh.quaternion.setFromUnitVectors(ZAXIS, STR_B);
    mesh.scale.set(1, 1, Math.max(len, 1e-4));
    mesh.updateMatrix();
  }

  // is something solid right in front of the hero? (so the kit is drawn back and low instead of reaching into a wall)
  probeWall(dt) {
    const p = this.p;
    if ((this.wallT -= dt) > 0) return;
    this.wallT = 0.1;
    let hit = 0;
    const ph = p.game.physics, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), y = p.camera.position.y - 0.35;
    for (const d of [0.55, 0.85, 1.15]) if (ph.pointHit(p.camera.position.x + fx * d, y, p.camera.position.z + fz * d, p.team)) { hit = 1 - (d - 0.55) / 0.9 * 0.55; break; }
    this.wallTarget = hit;
  }

  update(dt, moving, sprint, silent = false) {
    const p = this.p, cam = p.camera;
    if (this.dirty || this.key !== this.keyNow()) { this.rebuild(); return; }
    dt = clamp(dt, 0, 0.05);
    syncKitFov(cam);
    this.spread = clamp(cam.aspect / 1.7, 0.62, 1.08);
    const R = this.R, L = this.L, pv = this.prev, S = this.spring, cls = p.classId;
    const t = p.game.time;
    if (!pv.init) { pv.yaw = p.yaw; pv.pitch = p.pitch; pv.hp = p.hp; pv.arrows = p.arrows; pv.potions = p.potions; pv.mounted = p.mounted; pv.init = true; }

    // ---- what happened since the last frame
    const dYaw = ((p.yaw - pv.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, dPitch = p.pitch - pv.pitch;
    pv.yaw = p.yaw; pv.pitch = p.pitch;
    if (!silent) {
      if (p.hp < pv.hp - 0.5) this.hit(clamp((pv.hp - p.hp) / (p.maxHp * 0.25), 0.2, 1.2));
      if (p.onGround && !pv.onGround && pv.vy < -2) this.landDip = clamp(-pv.vy / 14, 0.15, 1);
      if (!p.onGround && pv.onGround && p.vy > 1) S.ky.kick(0.5);
      if (p.potions < pv.potions && this.drinkT < 0) this.drinkT = 0;
      if (p.mounted !== pv.mounted) { this.landDip = Math.max(this.landDip, 0.6); S.krx.kick(-1.2); S.ky.kick(-0.8); }
    }
    pv.hp = p.hp; pv.onGround = p.onGround; pv.vy = p.vy; pv.potions = p.potions; pv.mounted = p.mounted;
    const drawNow = p.drawT > 0 ? Math.min(1, p.drawT / p.drawTime) : 0;
    if (pv.draw > 0.3 && p.drawT === 0 && p.arrows < pv.arrows) this.recoil = 1;   // the string was let go
    pv.draw = drawNow; pv.arrows = p.arrows;
    if (p.weapon !== this.shown && this.swap <= 0) this.swap = 1;
    if (this.swap > 0) {
      this.swap = Math.max(0, this.swap - dt * 6);
      if (this.swap < 0.5) this.shown = p.weapon;
    } else this.shown = p.weapon;
    if (this.drinkT >= 0) { this.drinkT += dt / 1.1; if (this.drinkT >= 1) this.drinkT = -1; }

    // ---- smoothed amounts
    const casting = p.castFlash > 0;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    this.bobAmt = smooth(this.bobAmt, moving ? clamp(speed / 6, 0.4, 1.4) : 0, 8, dt);
    this.sprintAmt = smooth(this.sprintAmt, sprint ? 1 : 0, 7, dt);
    this.zoomAmt = smooth(this.zoomAmt, p.zoomed || p.scope ? 1 : 0, 10, dt);
    // the Sniper Shot: the bow comes up to the eye, and once the view is narrow the kit is out of sight behind the scope's ring
    this.scopeAmt = smooth(this.scopeAmt, p.scope ? 1 : 0, p.scope ? 9 : 14, dt);
    const hide = this.scopeAmt > 0.9 && !!p.scope;
    if (hide !== this.scopeHid) { this.scopeHid = hide; this.root.visible = !hide; }
    this.castAmt = smooth(this.castAmt, casting ? 1 : 0, casting ? 24 : 9, dt);
    p.vmDown += ((p.climb ? 1 : 0) - p.vmDown) * Math.min(1, dt * 8);   // (the camera tips up with this while climbing)
    const climbW = clamp(p.vmDown, 0, 1);
    this.bobT += dt * (moving ? (sprint ? 13 : 9) : 2);
    p.bob = this.bobT;
    this.landDip = smooth(this.landDip, 0, 7, dt);
    if (!silent) this.probeWall(dt);
    this.wallAmt = smooth(this.wallAmt, this.wallTarget || 0, 9, dt);
    const lanceMode = cls === 'cavalier' && p.mounted;
    this.lanceAmt = smooth(this.lanceAmt, lanceMode ? 1 : 0, 9, dt);
    const drinkW = this.drinkT >= 0 ? Math.sin(clamp(this.drinkT * 1.25, 0, 1) * Math.PI) ** 0.5 : 0;   // up, tip, down

    // ---- the whole kit: walking bob, breathing, look sway, landing, knocks
    const bobA = (moving ? (sprint ? 0.026 : 0.016) : 0.0035) * (moving ? this.bobAmt : 1) * (p.mounted ? 1.4 : 1);
    let ox = Math.sin(this.bobT * 0.5) * bobA, oy = -Math.abs(Math.sin(this.bobT)) * bobA;
    const weak = p.hp < p.maxHp * 0.25 ? 1 : 0;   // low health: heavier breathing, a shaking hand
    if (!moving) { oy += Math.sin(t * (1.6 + weak * 1.4)) * (0.0022 + weak * 0.002); ox += Math.sin(t * 0.8) * 0.0016; }
    if (weak) { ox += Math.sin(t * 31) * 0.0012; oy += Math.sin(t * 27) * 0.001; }
    const lx = this.lookX.step(clamp(-dYaw * 1.1, -0.1, 0.1), dt), ly = this.lookY.step(clamp(dPitch * 1.1, -0.1, 0.1), dt);
    ox += S.kx.step(0, dt) + lx; oy += S.ky.step(0, dt) - this.landDip * 0.05 + ly - 0.04 * this.wallAmt - 0.02 * weak;
    const oz = S.kz.step(0, dt) + 0.1 * this.wallAmt;
    const rx = S.krx.step(0, dt) + this.landDip * 0.06 + 0.25 * this.wallAmt, ry = S.kry.step(0, dt) + lx * 1.2, rz = S.krz.step(0, dt) - lx * 1.5;
    VMU.hurt.value = smooth(VMU.hurt.value, clamp(this.hurtT, 0, 1) * 0.6 + weak * 0.25, 6, dt);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.5);

    const swordMode = this.shown === 'sword' || casting || drinkW > 0.02 || climbW > 0.02;   // (a spell, a draught or a climb use the hands whatever was drawn)
    R.grp.visible = swordMode; L.grp.visible = swordMode && climbW < 0.5;
    L.climbGrp.visible = climbW > 0.02;
    L.bowGrp.visible = !swordMode; R.strGrp.visible = !swordMode; L.strTop.visible = !swordMode; L.strBot.visible = !swordMode;
    if (L.quiver) L.quiver.visible = !swordMode;
    const swapDip = Math.sin(Math.min(1, this.swap) * Math.PI) * 0.32;
    const wpn = this.wpn, focusWeapon = wpn.focus || wpn.tip;
    let trailing = false;
    if (swordMode) {
      let ax = 0, ay = 0, az = 0, arx = 0, ary = 0, arz = 0;
      const atk = p.atk;
      if (atk) {
        const W = WIND[atk.dir], E = END[atk.dir];
        let from = ZERO, to = W, k;
        if (atk.phase === 'wind') k = easeOut(Math.min(1, atk.t / 0.09));
        else if (atk.phase === 'strike') { from = W; to = E; const u = Math.min(1, atk.t / 0.09); k = easeOut(u) + 0.07 * Math.sin(u * Math.PI) * (atk.phase === 'strike' ? 1 : 0); }
        else { from = E; to = ZERO; k = easeInOut(Math.min(1, atk.t / 0.2)); }
        ax = from.x + (to.x - from.x) * k; ay = from.y + (to.y - from.y) * k; az = from.z + (to.z - from.z) * k;
        arx = from.rx + (to.rx - from.rx) * k; ary = from.ry + (to.ry - from.ry) * k; arz = from.rz + (to.rz - from.rz) * k;
        trailing = atk.phase === 'strike' || (atk.phase === 'recover' && atk.t < 0.12);
        if (this.lanceAmt > 0.5) {   // a lance is driven, not swung: a short jab whichever way the blow goes
          const jab = atk.phase === 'wind' ? 0.1 * k : atk.phase === 'strike' ? 0.1 - 0.34 * k : -0.24 * (1 - k);
          ax *= 0.5; ay *= 0.5; az = jab; arx *= 0.12; ary *= 0.12; arz *= 0.12;
        }
      } else if (p.blocking) { ax += 0.08; ay -= 0.06; arz -= 0.3; }
      if (p.buffs.has('whirl')) { const w = t * 24; ax -= 0.22 + Math.cos(w) * 0.19; ay += 0.08 + Math.sin(w) * 0.08; arz += w; trailing = true; }
      if (p.leap) {   // the Leap: the blade goes up over the head on the way up and is driven down into the ground as he lands
        const k = clamp(p.leap.t / p.leap.dur, 0, 1), up = easeOut(clamp(k / 0.25, 0, 1)), down = easeInOut(clamp((k - 0.72) / 0.28, 0, 1));
        ax -= 0.08 * up * (1 - down); ay += 0.16 * up - 0.28 * down; az += 0.06 * up - 0.12 * down;
        arx -= 1.15 * up - 2.1 * down; arz += 0.2 * up * (1 - down);
        trailing = down > 0.05;
      }
      if (p.staggerT > 0) { const k = Math.min(1, p.staggerT * 3); ay -= 0.1 * k; arx -= 0.4 * k; }
      // sprinting carries the blade low across the body
      ax -= 0.05 * this.sprintAmt; ay -= 0.03 * this.sprintAmt; arx += 0.25 * this.sprintAmt; arz += 0.18 * this.sprintAmt;
      const la = this.lanceAmt, base = REST;
      const bx = lerp(base.x, LANCE_REST.x, la), by = lerp(base.y, LANCE_REST.y, la), bz = lerp(base.z, LANCE_REST.z, la);
      const brx = lerp(base.rx, LANCE_REST.rx, la), bry = lerp(base.ry, LANCE_REST.ry, la), brz = lerp(base.rz, LANCE_REST.rz, la);
      // a spell raises the caster's weapon; a draught brings the flask up; climbing reaches both hands up
      const castP = cls === 'cleric' ? CAST_MACE : CAST_STAFF, cw = this.castAmt, k = clamp(p.castFlash, 0, 1);
      const reach = Math.sin(Math.min(1, (1 - k) * 3) * Math.PI / 2);
      const FA = FLASK_A, FB = FLASK_B;
      let px = bx, py = by, pz = bz, prx = brx, pry = bry, prz = brz;
      if (cw > 0.01) { px = lerp(px, castP.x, cw); py = lerp(py, castP.y + 0.03 * reach, cw); pz = lerp(pz, castP.z - 0.1 * reach, cw); prx = lerp(prx, castP.rx, cw); pry = lerp(pry, castP.ry, cw); prz = lerp(prz, castP.rz, cw); ax *= 1 - cw; ay *= 1 - cw; az *= 1 - cw; arx *= 1 - cw; ary *= 1 - cw; arz *= 1 - cw; }
      if (drinkW > 0.01) {
        const tip = easeInOut(clamp((this.drinkT - 0.25) / 0.3, 0, 1));
        px = lerp(px, lerp(FA.x, FB.x, tip), drinkW); py = lerp(py, lerp(FA.y, FB.y, tip), drinkW); pz = lerp(pz, lerp(FA.z, FB.z, tip), drinkW);
        prx = lerp(prx, lerp(FA.rx, FB.rx, tip), drinkW); pry = lerp(pry, FA.ry, drinkW); prz = lerp(prz, FA.rz, drinkW);
        ax *= 1 - drinkW; ay *= 1 - drinkW; az *= 1 - drinkW; arx *= 1 - drinkW; ary *= 1 - drinkW; arz *= 1 - drinkW;
      }
      if (climbW > 0.01) {
        const ph = p.climb ? Math.sin((p.climb.t / Math.max(0.1, p.climb.dur)) * 13) : 0;
        px = lerp(px, CLIMB_R.x, climbW); py = lerp(py, CLIMB_R.y + 0.07 * ph, climbW); pz = lerp(pz, CLIMB_R.z, climbW);
        prx = lerp(prx, CLIMB_R.rx, climbW); pry = lerp(pry, CLIMB_R.ry, climbW); prz = lerp(prz, CLIMB_R.rz, climbW);
        ax *= 1 - climbW; ay *= 1 - climbW; az *= 1 - climbW; arx *= 1 - climbW; ary *= 1 - climbW; arz *= 1 - climbW;
      }
      R.grp.position.set((px + ax + ox + S.wx.step(0, dt)) * this.spread, py + ay + oy + S.wy.step(0, dt) - swapDip, pz + az + oz + S.wz.step(0, dt));
      R.grp.rotation.set(prx + arx + rx + S.wrx.step(0, dt), pry + ary + ry, prz + arz + rz + S.wrz.step(0, dt), 'XYZ');
      R.grp.updateMatrix();
      const hasLance = !!R.lance && this.lanceAmt > 0.5;
      R.weapon.visible = !hasLance && drinkW < 0.3 && climbW < 0.5;
      if (R.lance) R.lance.visible = hasLance && drinkW < 0.3 && climbW < 0.5;
      R.flask.visible = drinkW > 0.02;
      if (R.flask.visible) { R.liquid.scale.y = lerp(1, 0.25, clamp((this.drinkT - 0.3) / 0.35, 0, 1)); R.liquid.position.y = -0.0; }
      R.hand.morphTargetInfluences[0] = climbW > 0.3 ? 0.45 : 1;
      R.hand.morphTargetInfluences[1] = 0;
      // the shield: rest pose, or raised across the front on guard, with a little spring
      const kite = cls === 'knight', sp = this.shieldPose, target = p.blocking ? (kite ? KITE_GUARD : GUARD) : kite ? KITE_REST : SHIELD_REST, kk = Math.min(1, dt * 15);
      sp.x += (target.x - sp.x) * kk; sp.y += (target.y - sp.y) * kk; sp.z += (target.z - sp.z) * kk;
      sp.rx += (target.rx - sp.rx) * kk; sp.ry += (target.ry - sp.ry) * kk; sp.rz += (target.rz - sp.rz) * kk;
      let bashZ = 0;
      if (p.dash && cls === 'knight') bashZ = -0.22 * Math.min(1, (0.25 - p.dash.t) * 12) * Math.min(1, p.dash.t * 8);   // a shield bash drives the shield out
      const shove = p.blocking ? clamp(1 - (t - p.blockStart) / 0.35, 0, 1) : 0;   // a fresh guard thrusts out a little: the parry window
      this.place(L.grp, sp, ox + S.sx.step(0, dt) + 0.1 * bashZ, oy + S.sy.step(0, dt) - swapDip + this.landDip * 0.02 + 0.5 * bashZ * 0.1, oz + S.sz.step(0, dt) - 0.05 * shove + bashZ, S.srx.step(0, dt), S.sry.step(0, dt) + lx * 0.5, 0);
      // the left hand hauling up a wall
      if (climbW > 0.02) {
        const ph = p.climb ? Math.sin((p.climb.t / Math.max(0.1, p.climb.dur)) * 13 + Math.PI) : 0;
        this.place(L.climbGrp, CLIMB_L, ox, oy + 0.07 * ph - swapDip, oz);
        L.climb.morphTargetInfluences[0] = 0.45; L.climb.morphTargetInfluences[1] = 0;
      }
      this.wristR.copy(R.wrist).applyMatrix4(R.grp.matrix);
      if (climbW > 0.5) this.wristL.copy(L.climbWrist).applyMatrix4(L.climbGrp.matrix); else this.wristL.copy(L.wrist).applyMatrix4(L.grp.matrix);
    } else {
      // the bow: left hand at the grip, right hand on the string
      const volley = !!p.aiming && p.aiming.slot === 'q';   // (holding the Volley's circle: the bow is drawn and lifted to loose high)
      const draw = volley ? Math.min(1, p.aiming.t / 0.4) : drawNow;
      // after a loose (recoil runs 1 -> 0 over half a second): the string snaps home at once; the hand flies on back along the jaw and
      // opens (ft), the bow hand lets the top of the bow fall forward; then the hand comes forward to the string with the next arrow (rt)
      const rec = this.recoil = Math.max(0, this.recoil - dt * 2), u = 1 - rec;
      // Power Shot: the draw goes on past the anchor, the string a hand further back, held hard (it trembles)
      this.powerAmt = smooth(this.powerAmt, p.power ? 1 : 0, p.power ? 5 : 30, dt);
      const pw = easeInOut(clamp(this.powerAmt, 0, 1)), sc = easeInOut(clamp(this.scopeAmt, 0, 1));
      if (rec > 0.95) { this.looseZ = lerp(info0(this.bowInfo), DRAW_Z, easeInOut(this.drawAmt)) + 0.04 * pw; this.drawAmt = 0; }
      const ft = rec > 0 ? easeInOut(clamp(u / 0.25, 0, 1)) : 0, rt = rec > 0 ? easeInOut(clamp((u - 0.55) / 0.45, 0, 1)) : 1, fol = ft * (1 - rt);
      this.drawAmt = smooth(this.drawAmt, draw, draw > this.drawAmt ? 14 : 30, dt);
      const up = draw > 0 || p.zoomed || p.scope || volley || rec > 0.3 ? 1 : 0;
      this.raiseAmt = smooth(this.raiseAmt, up, up ? 11 : 4, dt);
      const dr = easeInOut(this.drawAmt), ra = easeInOut(clamp(this.raiseAmt, 0, 1)), zoom = this.zoomAmt;
      // the bow's turn: rest -> aim (steadier and more upright zoomed in); after a loose the bow hand lets the top of the bow fall forward
      BOW_E.set(lerp(BOW_REST.rx, BOW_AIM.rx, ra) - 0.22 * fol * ra + rx, lerp(BOW_REST.ry, BOW_AIM.ry, ra) + ry, lerp(BOW_REST.rz, BOW_AIM.rz + 0.07 * zoom, ra) + rz, 'XYZ');
      BOW_Q.setFromEuler(BOW_E);
      // where the grip is: at aim, so that the nock sits at the anchor when fully drawn
      const nockZ = lerp(info0(this.bowInfo), DRAW_Z, dr) + 0.04 * pw * dr;
      BOW_P.set(0, NOCK_Y, DRAW_Z).applyQuaternion(BOW_Q);
      V4.copy(BOW_ANCHOR).sub(BOW_P);
      V4.z -= 0.012 * fol;   // (the bow arm keeps pushing at the mark through the loose)
      BOW_P.set(BOW_REST.x, BOW_REST.y, BOW_REST.z).lerp(V4, ra);
      if (volley) {   // the volley: the whole draw is lifted to loose high, the archer leaning back from the waist (so the nock drops from the eye)
        BOW_Q2.setFromAxisAngle(AXIS_X, 0.42 * ra);
        BOW_P.sub(VOLLEY_PIVOT).applyQuaternion(BOW_Q2).add(VOLLEY_PIVOT);
        BOW_Q.premultiply(BOW_Q2);
      }
      if (sc > 0) { BOW_P.x -= 0.05 * sc; BOW_P.y += 0.05 * sc; BOW_P.z += 0.06 * sc; }   // (the Sniper Shot: in to the eye, along the arrow)
      const still = 1 - 0.7 * zoom;
      BOW_P.x += ox * still; BOW_P.y += oy * still - swapDip; BOW_P.z += oz;
      if (dr > 0.98 && !zoom) BOW_P.x += Math.sin(t * 70) * (0.0008 + 0.0022 * pw);   // (a long hold at full draw trembles; a Power Shot's more)
      if (pw > 0) {   // (and canted over, round the nock at the anchor, as an archer lays a heavy bow over for a long hold)
        BOW_P.y += Math.sin(t * 53) * 0.0012 * pw; BOW_P.z += 0.012 * pw;
        BOW_Q2.setFromAxisAngle(AXIS_Z, -0.32 * pw);
        BOW_P.sub(BOW_ANCHOR).applyQuaternion(BOW_Q2).add(BOW_ANCHOR);
        BOW_Q.premultiply(BOW_Q2);
      }
      L.bowGrp.position.copy(BOW_P);
      L.bowGrp.quaternion.copy(BOW_Q);
      L.bowGrp.updateMatrix();
      // the string: top tip -> nock -> bottom tip; the nock (and the arrow) go back with the draw
      const info = this.bowInfo;
      V1.copy(info.tipTop).lerp(info.tipTopDrawn, dr);
      V2.copy(info.tipBottom).lerp(info.tipBottomDrawn, dr);
      V3.set(0, NOCK_Y, nockZ);
      L.bow.morphTargetInfluences[0] = dr;
      // the arrow: from the nock to the shelf; gone after a loose until the hand has come back with the next one
      R.arrowGrp.position.copy(V3);
      R.arrowGrp.quaternion.setFromUnitVectors(ARROW_FWD, V4.subVectors(ARROW_REST, V3).normalize());
      R.arrowGrp.visible = (p.arrows > 0 || drawNow > 0) && rec < 0.25;
      R.arrowGrp.updateMatrix();
      this.strand(L.strTop, V1, V3, L.bowGrp.matrix);
      this.strand(L.strBot, V3, V2, L.bowGrp.matrix);
      const thin = 1 - 0.6 * dr * ra;   // (drawn to the face the string passes a hand's breadth from the eye: seen thin, as the eye sees it, out of focus)
      L.strTop.scale.x = L.strTop.scale.y = L.strBot.scale.x = L.strBot.scale.y = thin;
      L.strTop.updateMatrix(); L.strBot.updateMatrix();
      // the drawing hand: on the nock; loosed, it goes on back along the jaw, then comes forward to the string again
      V4.set(0, NOCK_Y, lerp(this.looseZ + 0.09 * ft, nockZ, rt));
      R.strGrp.position.copy(V4).applyMatrix4(L.bowGrp.matrix);
      R.strGrp.position.x += 0.05 * fol;
      R.strGrp.quaternion.copy(L.bowGrp.quaternion);
      R.strGrp.updateMatrix();
      R.strHand.morphTargetInfluences[0] = 0; R.strHand.morphTargetInfluences[1] = 1 - 0.8 * fol;
      this.wristR.copy(R.strWrist).applyMatrix4(R.strGrp.matrix);
      this.wristL.copy(L.bowWrist).applyMatrix4(L.bowGrp.matrix);
    }
    if (swordMode) {
      this.arm(R, this.wristR, SH_R, POLE_R, R.grp, R.hand, -1);
      if (climbW > 0.5) this.arm(L, this.wristL, SH_L, POLE_L, L.climbGrp, L.climb, 1); else this.arm(L, this.wristL, SH_L, POLE_L, L.grp, L.hand, 1);
    } else {
      const ra = clamp(this.raiseAmt, 0, 1);   // (the shoulders turn side-on to the mark as the bow comes up)
      SH_A.copy(SH_R).lerp(SH_BOW_R, ra); POLE_A.copy(POLE_R).lerp(POLE_BOW_R, ra).normalize();
      SH_B.copy(SH_L).lerp(SH_BOW_L, ra); POLE_B.copy(POLE_L).lerp(POLE_BOW_L, ra).normalize();
      this.arm(R, this.wristR, SH_A, POLE_A, R.strGrp, R.strHand, -1);
      this.arm(L, this.wristL, SH_B, POLE_B, L.bowGrp, L.bowHand, 1);
    }

    // ---- reins while riding (the cavalier's left hand holds them; they run to the horse's bit)
    const reins = lanceMode && p.hasHorse && swordMode && L.grp.visible;
    L.reinA.visible = L.reinB.visible = reins;
    if (reins && !silent) {
      cam.updateMatrixWorld();
      MINV.copy(cam.matrixWorld).invert();
      const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
      for (const [mesh, bxl] of [[L.reinA, -0.09], [L.reinB, 0.09]]) {
        V3.set(p.pos.x + bxl * ch + 1.74 * sh, p.pos.y + 2.0, p.pos.z - bxl * sh + 1.74 * ch).applyMatrix4(MINV);
        V3.x /= VMU.fov.value; V3.y /= VMU.fov.value;   // (the world is drawn with the camera's field of view, the kit with its own)
        V4.copy(this.wristL).add(STR_A.set(bxl * 0.5, 0.05, -0.04));
        this.strand(mesh, V4, V3, null);
      }
    }

    // ---- spell light, and the flash that fades as the cast ends
    const orb = this.orb;
    const rest = !!wpn.glow && swordMode && R.weapon.visible && this.castAmt < 0.05;   // a staff's crystal glows softly all the time
    orb.visible = this.castAmt > 0.05 || rest;
    VMU.glow.value = 0.85 + 0.15 * Math.sin(t * 3) + 1.4 * this.castAmt;
    VMU.tint.value.set(0, 0, 0, 0);
    if (rest) {
      orb.position.copy(wpn.focus).applyMatrix4(R.grp.matrix);
      orb.position.z -= 0.03;
      orb.material.color.setHex(0xff9a4a);
      orb.material.opacity = 0.4 + 0.1 * Math.sin(t * 3);
      orb.scale.set(0.1, 0.1, 1);
      orb.updateMatrix();
    }
    if (casting) {
      const k = clamp(p.castFlash, 0, 1);
      const reach = Math.sin(Math.min(1, (1 - k) * 3) * Math.PI / 2);
      this.castCol.setHex(p.castColor);
      VMU.tint.value.set(this.castCol.r, this.castCol.g, this.castCol.b, this.castAmt);
      orb.position.copy(focusWeapon).applyMatrix4(R.grp.matrix);
      orb.position.z -= 0.05;
      orb.material.color.setHex(p.castColor);
      orb.material.opacity = 0.95 * Math.min(1, k * 3);
      const sz = (0.1 + 0.2 * reach) * (1 + Math.sin(t * 30) * 0.08);
      orb.scale.set(sz, sz, 1);
      orb.updateMatrix();
      if (!silent) {
        if (Math.random() < dt * 40) p.game.fx.orb(orb.getWorldPosition(V4), this.castCol, 0.05);
        p.castFlash = Math.max(0, p.castFlash - dt * 2.2);
      }
    }

    // ---- the swing trail: a ribbon between two points of the blade while it is swung
    const tr = this.trail, TQ = Q.particles;
    if (TQ > 0 && swordMode && !silent) {
      if (trailing && R.weapon.visible) {
        this.tipK.copy(wpn.tip).applyMatrix4(R.grp.matrix);
        this.baseK.copy(wpn.base).applyMatrix4(R.grp.matrix);
        tr.push(this.tipK, this.baseK);
      }
      tr.update(dt, TRAIL[cls] || TRAIL.knight, 0.3 * Math.min(1, TQ));
    } else if (tr.live) tr.clear();
  }

  // ------------------------------------------------------------ events
  hit(power = 0.5) {   // the hero was hurt: the kit is knocked down and aside
    const S = this.spring;
    S.ky.kick(-1.4 * power); S.kx.kick((Math.random() - 0.5) * 1.2 * power); S.krx.kick(0.9 * power);
    S.sy.kick(-0.8 * power); S.wy.kick(-0.6 * power);
    this.hurtT = Math.min(1, this.hurtT + power);
  }
  struck(heavy) {   // our blow landed: the weapon jolts back
    const S = this.spring;
    S.wz.kick(heavy ? 1.1 : 0.6); S.wrx.kick(heavy ? -2.2 : -1.2); S.kz.kick(heavy ? 0.5 : 0.25); S.ky.kick(heavy ? -0.5 : -0.2);
  }
  blocked(parry) {   // a blow met the shield
    const S = this.spring;
    S.sz.kick(parry ? 1.6 : 1.0); S.sx.kick((Math.random() - 0.5) * 1.4); S.sy.kick(parry ? 0.8 : -0.6); S.srx.kick(parry ? -2 : -1.2); S.sry.kick((Math.random() - 0.5) * 3);
    S.kz.kick(0.3);
  }
  // the on-screen call-outs ('Parry!', 'Blocked') tell the kit a blow met the shield (ours or theirs)
  feedback(text) {
    if (text === 'Parry!') this.blocked(true);
    else if (text === 'Blocked') { if (this.p.blocking) this.blocked(false); else this.struck(false); }
  }

  dispose() {
    if (this.unQ) this.unQ();
    this.clearKit();
    this.kitMat.dispose(); this.handMat.dispose(); this.glowMat.dispose(); this.trailMat.dispose(); this.glassMat.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
