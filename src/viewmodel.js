// The first-person kit: arms, hands, weapons and how they move. player.js keeps thin calls (buildViewModel / rebuildWeapons /
// updateViewModel) and this module does the rest. Nothing here changes gameplay: it only READS the hero's combat state (atk, blocking,
// drawT, aiming, castFlash, climb, ...) and draws it. The kit hangs on the camera, uses its own field of view and squeezes its depth in the
// vertex shader (vmmat.js), so it never pokes through a wall or the ground.
import * as THREE from 'three';
import { Q, onQuality } from './quality.js';
import { TEAM_COLORS } from './config.js';
import { VMU, kitMaterial, glowMaterial, glowTexture, syncKitFov } from './vmmat.js';
import { handGeometry, armGeometry, swordGeometry, shieldGeometry, bowGeometry, arrowGeometry, PAINT } from './vmkit.js';
import { Mesher, paint, tone, PAT } from './vmgeo.js';

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
const Q2 = new THREE.Quaternion(), E1 = new THREE.Euler(0, 0, 0, 'XYZ');
const ZAXIS = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------- arm styles per class
function armStyle(cls, team) {
  const col = TEAM_COLORS[team] ?? TEAM_COLORS[0];
  const cloth = (k = 0.8, hex = col) => tone(paint(hex, 0, 0.88, PAT.cloth), k);
  switch (cls) {
    case 'berserker': return { sleeve: null, skin: PAINT.skin, bracer: PAINT.leather, hand: PAINT.skin };
    case 'ranger': return { sleeve: cloth(0.7, 0x2f5a34), cuff: PAINT.leatherLight, bracer: PAINT.leather, skin: PAINT.skin, hand: paint(0x6b4a2c, 0, 0.7, PAT.leather) };
    case 'mage': return { sleeve: cloth(0.8, 0x2b2160), cuff: PAINT.gold, skin: PAINT.skin, hand: PAINT.skin, trim: PAINT.gold };
    case 'cleric': return { sleeve: cloth(1.0, 0xe9e0c6), cuff: paint(col, 0, 0.85, PAT.cloth), skin: PAINT.skin, hand: PAINT.skin, trim: PAINT.gold };
    case 'cavalier': return { sleeve: cloth(0.85), cuff: PAINT.gold, vambrace: PAINT.steel, skin: PAINT.skin, hand: PAINT.leather, plate: PAINT.steel, trim: PAINT.gold };
    default: return { sleeve: cloth(0.8), cuff: paint(0xe6dcc0, 0, 0.85, PAT.cloth), vambrace: PAINT.steel, skin: PAINT.skin, hand: PAINT.leather, plate: PAINT.steel, trim: PAINT.gold };
  }
}

// ---------------------------------------------------------------- poses (kit space: the camera looks down -z; metres)
// the weapon hand's grip frame at rest, and where each strike winds up and ends (offsets from rest)
const REST = { x: 0.25, y: -0.22, z: -0.5, rx: -0.95, ry: 0.2, rz: -0.38 };
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
const ORDER_BEHIND = 998, ORDER_SHIELD = 999, ORDER_KIT = 1000;   // drawn after the world: the arm behind the shield, the shield, the rest
const SHIELD_REST = { x: -0.37, y: -0.3, z: -0.58, rx: -0.18, ry: 0.62, rz: 0.12 };
const GUARD = {
  left: { x: -0.24, y: -0.12, z: -0.5, rx: -0.1, ry: 0.55, rz: 0.2 },
  right: { x: 0.0, y: -0.14, z: -0.5, rx: -0.1, ry: 0.0, rz: -0.1 },
  over: { x: -0.12, y: 0.0, z: -0.52, rx: -0.55, ry: 0.15, rz: 0.05 },
  thrust: { x: -0.1, y: -0.24, z: -0.5, rx: 0.05, ry: 0.15, rz: 0.05 },
};
const BOW_REST = { x: -0.17, y: -0.09, z: -0.62, rx: 0.0, ry: 0.0, rz: 0.12 };

const SH_R = new THREE.Vector3(0.2, -0.3, 0.14), SH_L = new THREE.Vector3(-0.2, -0.3, 0.14);
const POLE_R = new THREE.Vector3(0.7, -1, 0.3).normalize(), POLE_L = new THREE.Vector3(-0.7, -1, 0.3).normalize();
const L1 = 0.32, L2 = 0.3;

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

export class ViewModel {
  constructor(player) {
    this.p = player;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    player.camera.add(this.root);
    this.kitMat = kitMaterial();
    this.handMat = kitMaterial();
    this.glowMat = glowMaterial({ map: glowTexture(), color: 0xffffff });
    this.disposables = [];
    this.key = '';
    this.dirty = true;
    this.unQ = onQuality(() => { this.dirty = true; });
    this.spring = {};
    for (const n of ['kx', 'ky', 'kz', 'krx', 'kry', 'krz', 'sx', 'sy', 'sz', 'srx', 'sry', 'wx', 'wy', 'wz', 'wrx', 'wrz']) this.spring[n] = new Spring(n[0] === 's' ? 300 : 240, n[0] === 's' ? 22 : 19);
    this.lookX = new Spring(90, 13); this.lookY = new Spring(90, 13);
    this.bobT = 0; this.bobAmt = 0; this.sprintAmt = 0; this.drawAmt = 0; this.castAmt = 0; this.zoomAmt = 0;
    this.shieldPose = { ...SHIELD_REST };
    this.swap = 0; this.shown = 'sword';
    this.prev = { yaw: 0, pitch: 0, hp: 1, arrows: 0, onGround: true, vy: 0, draw: 0, init: false };
    this.recoil = 0; this.landDip = 0; this.hurtT = 0;
    this.spread = 1;
    this.castCol = new THREE.Color();
    this.elbow = new THREE.Vector3(); this.shoulder = new THREE.Vector3();
    this.wristR = new THREE.Vector3(); this.wristL = new THREE.Vector3();
  }

  // ------------------------------------------------------------ building
  keyNow() {
    const p = this.p;
    return `${p.classId}|${p.team}|${p.lv.sword}|${p.lv.shield}|${p.lv.bow}|${Q.detail}`;
  }

  clearKit() {
    for (const c of [...this.root.children]) this.root.remove(c);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  mk(geo, mat, own = true) {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;   // (the kit has its own projection: the camera's view of it means nothing)
    m.castShadow = false;
    m.receiveShadow = false;
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
    // The shield is held with its painted face toward the viewer, so the arm behind it must not show in front of the face: the left arm
    // (and the hand on the strap) is drawn first and writes no depth, then the shield is drawn over it.
    const armLMat = kitMaterial({ depthWrite: false }), handLMat = kitMaterial({ depthWrite: false });
    this.disposables.push(armLMat, handLMat);
    const arm = armGeometry(st, detail);
    this.disposables.push(arm.fore, arm.upper);
    for (const side of [R, L]) {
      side.fore = this.mk(arm.fore, side === L ? armLMat : this.kitMat, false);
      side.upper = this.mk(arm.upper, side === L ? armLMat : this.kitMat, false);
      side.fore.renderOrder = side.upper.renderOrder = side === L ? ORDER_BEHIND : ORDER_KIT;
      this.root.add(side.fore, side.upper);
    }
    // the weapon hand and the sword: the grip frame
    const hr = handGeometry('R', st, detail), hl = handGeometry('L', st, detail);
    this.disposables.push(hr.geo, hl.geo);
    R.grp = new THREE.Group();
    R.hand = this.mk(hr.geo, this.handMat, false);
    R.hand.scale.setScalar(HAND_SCALE);
    R.wrist = hr.wrist.clone().multiplyScalar(HAND_SCALE);
    const sword = this.sword = swordGeometry({ len: p.sword.len, ls: p.lv.sword, detail });
    R.weapon = this.mk(sword.geo, this.kitMat);
    R.grp.add(R.hand, R.weapon);
    // the shield, and the hand that holds it (its rod axis lies along the shield's strap)
    const sh = shieldGeometry({ cls, team, lv: p.lv.shield, detail });
    const shMat = kitMaterial({ map: sh.map });
    this.disposables.push(shMat);
    L.grp = new THREE.Group();
    L.shield = this.mk(sh.geo, shMat);
    L.shield.renderOrder = ORDER_SHIELD;
    L.hand = this.mk(hl.geo, handLMat, false);
    L.hand.renderOrder = ORDER_BEHIND;
    L.hand.scale.setScalar(HAND_SCALE);
    L.hand.rotation.z = -Math.PI / 2;
    L.hand.position.set(0, p.lv.shield ? sh.shape.h * 0.14 : 0, -0.052);
    L.hand.updateMatrix();
    L.wrist = hl.wrist.clone().applyMatrix4(L.hand.matrix);
    L.grp.add(L.shield, L.hand);
    // the bow: the left hand holds it, the right hand draws the string
    const bow = this.bowInfo = bowGeometry({ lv: p.lv.bow, detail });
    L.bowGrp = new THREE.Group();
    L.bow = this.mk(bow.geo, this.kitMat);
    L.bowHand = this.mk(hl.geo, this.handMat, false);
    L.bowHand.scale.setScalar(HAND_SCALE);
    L.bowHand.rotation.set(0, 0.25, 0);
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
    R.strHand.rotation.set(0, -0.35, 0);
    R.strHand.updateMatrix();
    R.strWrist = hr.wrist.clone().applyMatrix4(R.strHand.matrix);
    R.strGrp.add(R.strHand);
    const strGeo = new Mesher().tube([[0, 0, 0], [0, 0, 1]], 0.0022, 4, { mat: paint(0xe3d9bd, 0, 0.8, PAT.cloth), cap: 'flat' }).build();
    this.disposables.push(strGeo);
    L.strTop = this.mk(strGeo, this.kitMat, false);
    L.strBot = this.mk(strGeo, this.kitMat, false);
    // spell light: a glow where the casting hand is
    const quad = new THREE.PlaneGeometry(1, 1);
    this.orb = new THREE.Mesh(quad, this.glowMat.clone());
    this.orb.frustumCulled = false;
    this.disposables.push(quad, this.orb.material);
    this.orb.visible = false;
    this.root.add(R.grp, L.grp, L.bowGrp, R.strGrp, L.strTop, L.strBot, this.orb);
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

  arm(side, wrist, shoulderAnchor, pole) {
    solveArm(shoulderAnchor, wrist, pole, this.elbow, this.shoulder);
    this.limb(side.fore, wrist, this.elbow);
    this.limb(side.upper, this.elbow, this.shoulder);
  }

  // a bowstring piece from a to b (both in the bow's frame), as a unit-length tube scaled to fit
  stringPiece(mesh, a, b, bowMatrix) {
    STR_A.copy(a).applyMatrix4(bowMatrix);
    STR_B.copy(b).applyMatrix4(bowMatrix);
    const len = STR_A.distanceTo(STR_B);
    mesh.position.copy(STR_A);
    STR_B.sub(STR_A).normalize();
    mesh.quaternion.setFromUnitVectors(ZAXIS, STR_B);
    mesh.scale.set(1, 1, Math.max(len, 1e-4));
    mesh.updateMatrix();
  }

  update(dt, moving, sprint, silent = false) {
    const p = this.p, cam = p.camera;
    if (this.dirty || this.key !== this.keyNow()) { this.rebuild(); return; }
    dt = clamp(dt, 0, 0.05);
    syncKitFov(cam);
    this.spread = clamp(cam.aspect / 1.7, 0.62, 1.08);
    const R = this.R, L = this.L, pv = this.prev, S = this.spring;
    const t = p.game.time;
    if (!pv.init) { pv.yaw = p.yaw; pv.pitch = p.pitch; pv.hp = p.hp; pv.arrows = p.arrows; pv.init = true; }

    // ---- what happened since the last frame
    const dYaw = ((p.yaw - pv.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, dPitch = p.pitch - pv.pitch;
    pv.yaw = p.yaw; pv.pitch = p.pitch;
    if (!silent) {
      if (p.hp < pv.hp - 0.5) this.hit(clamp((pv.hp - p.hp) / (p.maxHp * 0.25), 0.2, 1.2));
      if (p.onGround && !pv.onGround && pv.vy < -2) this.landDip = clamp(-pv.vy / 14, 0.15, 1);
      if (!p.onGround && pv.onGround && p.vy > 1) S.ky.kick(0.5);
    }
    pv.hp = p.hp; pv.onGround = p.onGround; pv.vy = p.vy;
    const drawNow = p.drawT > 0 ? Math.min(1, p.drawT / p.drawTime) : 0;
    if (pv.draw > 0.3 && p.drawT === 0 && p.arrows < pv.arrows) this.recoil = clamp(pv.draw, 0.4, 1);   // the string was let go
    pv.draw = drawNow; pv.arrows = p.arrows;
    if (p.weapon !== this.shown && this.swap <= 0) this.swap = 1;
    if (this.swap > 0) {
      this.swap = Math.max(0, this.swap - dt * 6);
      if (this.swap < 0.5) this.shown = p.weapon;
    } else this.shown = p.weapon;

    // ---- smoothed amounts
    const casting = p.castFlash > 0;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    this.bobAmt = smooth(this.bobAmt, moving ? clamp(speed / 6, 0.4, 1.4) : 0, 8, dt);
    this.sprintAmt = smooth(this.sprintAmt, sprint ? 1 : 0, 7, dt);
    this.zoomAmt = smooth(this.zoomAmt, p.zoomed ? 1 : 0, 10, dt);
    this.castAmt = smooth(this.castAmt, casting ? 1 : 0, casting ? 24 : 9, dt);
    p.vmDown += ((p.climb ? 1 : 0) - p.vmDown) * Math.min(1, dt * 8);   // (the camera tips up with this while climbing)
    const down = p.vmDown * 0.62;
    this.bobT += dt * (moving ? (sprint ? 13 : 9) : 2);
    p.bob = this.bobT;
    this.landDip = smooth(this.landDip, 0, 7, dt);

    // ---- the whole kit: walking bob, breathing, look sway, landing, knocks
    const bobA = (moving ? (sprint ? 0.026 : 0.016) : 0.0035) * (moving ? this.bobAmt : 1);
    let ox = Math.sin(this.bobT * 0.5) * bobA, oy = -Math.abs(Math.sin(this.bobT)) * bobA;
    if (!moving) { oy += Math.sin(t * 1.6) * 0.0022; ox += Math.sin(t * 0.8) * 0.0016; }
    const lx = this.lookX.step(clamp(-dYaw * 1.1, -0.1, 0.1), dt), ly = this.lookY.step(clamp(dPitch * 1.1, -0.1, 0.1), dt);
    ox += S.kx.step(0, dt) + lx; oy += S.ky.step(0, dt) - this.landDip * 0.05 + ly;
    const oz = S.kz.step(0, dt);
    const rx = S.krx.step(0, dt) + this.landDip * 0.06, ry = S.kry.step(0, dt) + lx * 1.2, rz = S.krz.step(0, dt) - lx * 1.5;
    VMU.hurt.value = smooth(VMU.hurt.value, clamp(this.hurtT, 0, 1) * 0.6 + (p.hp < p.maxHp * 0.25 ? 0.25 : 0), 6, dt);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.5);

    const swordMode = this.shown === 'sword' || casting;   // (a spell is cast with the empty hand whichever weapon was drawn)
    R.grp.visible = swordMode; L.grp.visible = swordMode;
    L.bowGrp.visible = !swordMode; R.strGrp.visible = !swordMode; L.strTop.visible = !swordMode; L.strBot.visible = !swordMode;
    const swapDip = Math.sin(Math.min(1, this.swap) * Math.PI) * 0.32;
    if (swordMode) {
      let ax = 0, ay = 0, az = 0, arx = 0, ary = 0, arz = 0;
      const atk = p.atk;
      if (atk) {
        const W = WIND[atk.dir], E = END[atk.dir];
        let from = ZERO, to = W, k;
        if (atk.phase === 'wind') k = easeOut(Math.min(1, atk.t / 0.09));
        else if (atk.phase === 'strike') { from = W; to = E; k = easeOut(Math.min(1, atk.t / 0.09)); }
        else { from = E; to = ZERO; k = easeInOut(Math.min(1, atk.t / 0.2)); }
        ax = from.x + (to.x - from.x) * k; ay = from.y + (to.y - from.y) * k; az = from.z + (to.z - from.z) * k;
        arx = from.rx + (to.rx - from.rx) * k; ary = from.ry + (to.ry - from.ry) * k; arz = from.rz + (to.rz - from.rz) * k;
        if (atk.phase === 'wind' && atk.t > 0.3) ax += Math.sin(t * 90) * 0.0025;   // straining a full wind-up
      } else if (p.blocking) { ax += 0.08; ay -= 0.06; arz -= 0.3; }
      if (p.buffs.has('whirl')) { const w = t * 24; ax -= 0.22 + Math.cos(w) * 0.19; ay += 0.08 + Math.sin(w) * 0.08; arz += w; }
      if (p.staggerT > 0) { const k = Math.min(1, p.staggerT * 3); ay -= 0.1 * k; arx -= 0.4 * k; }
      // sprinting carries the blade low across the body
      ax -= 0.05 * this.sprintAmt; ay -= 0.03 * this.sprintAmt; arx += 0.25 * this.sprintAmt; arz += 0.18 * this.sprintAmt;
      this.place(R.grp, REST, ax + ox + S.wx.step(0, dt), ay + oy + S.wy.step(0, dt) - swapDip - down, az + oz + S.wz.step(0, dt),
        arx + rx + S.wrx.step(0, dt), ary + ry, arz + rz + S.wrz.step(0, dt));
      // an empty hand for a spell: the blade is put away, the palm comes up
      const open = this.castAmt;
      R.weapon.visible = open < 0.5;
      R.hand.morphTargetInfluences[0] = 1 - open;
      R.hand.morphTargetInfluences[1] = 0;
      if (open > 0.02) this.castPose(R.grp, open);
      // the shield: rest pose, or the guard in the direction held, with a little spring
      const sp = this.shieldPose, target = p.blocking ? GUARD[p.blockDir] : SHIELD_REST, k = Math.min(1, dt * 15);
      sp.x += (target.x - sp.x) * k; sp.y += (target.y - sp.y) * k; sp.z += (target.z - sp.z) * k;
      sp.rx += (target.rx - sp.rx) * k; sp.ry += (target.ry - sp.ry) * k; sp.rz += (target.rz - sp.rz) * k;
      const shove = p.blocking ? clamp(1 - (t - p.blockStart) / 0.35, 0, 1) : 0;   // a fresh guard thrusts out a little: the parry window
      this.place(L.grp, sp, ox + S.sx.step(0, dt), oy + S.sy.step(0, dt) - swapDip - down + this.landDip * 0.02, oz + S.sz.step(0, dt) - 0.05 * shove, S.srx.step(0, dt), S.sry.step(0, dt) + lx * 0.5, 0);
      this.wristR.copy(R.wrist).applyMatrix4(R.grp.matrix);
      this.wristL.copy(L.wrist).applyMatrix4(L.grp.matrix);
    } else {
      // the bow: left hand at the grip, right hand on the string
      const draw = p.aiming ? Math.min(1, p.aiming.t / 0.4) : drawNow;
      this.drawAmt = smooth(this.drawAmt, draw, 30, dt);
      const dr = this.drawAmt, zoom = this.zoomAmt;
      let extraRx = 0, bx = 0.04 * dr, by = 0.03 * dr;
      if (p.aiming) { extraRx = -0.3 * dr; by += 0.05 * dr; }
      bx += (-0.03 - BOW_REST.x) * zoom * 0.7; by += 0.05 * zoom;
      if (dr >= 1) bx += Math.sin(t * 70) * 0.0012;
      const rec = this.recoil = Math.max(0, this.recoil - dt * 6);
      this.place(L.bowGrp, BOW_REST, ox + bx, oy + by - swapDip - down, oz + rec * 0.05, extraRx - rec * 0.06 + rx, ry, rz + rec * 0.02);
      // the string: top tip -> nock -> bottom tip; the nock (and the arrow) go back with the draw
      const info = this.bowInfo, pull = 0.2 * dr - rec * 0.05;
      V1.copy(info.tipTop).lerp(info.tipTopDrawn, dr);
      V2.copy(info.tipBottom).lerp(info.tipBottomDrawn, dr);
      V3.set(0, 0, info.tipTop.z + pull);
      L.bow.morphTargetInfluences[0] = dr;
      R.arrowGrp.position.copy(V3);
      R.arrowGrp.visible = p.arrows > 0 || drawNow > 0;
      R.arrowGrp.updateMatrix();
      this.stringPiece(L.strTop, V1, V3, L.bowGrp.matrix);
      this.stringPiece(L.strBot, V3, V2, L.bowGrp.matrix);
      // the drawing hand follows the nock
      R.strGrp.position.copy(V3).applyMatrix4(L.bowGrp.matrix);
      R.strGrp.quaternion.copy(L.bowGrp.quaternion);
      R.strGrp.updateMatrix();
      R.strHand.morphTargetInfluences[0] = 0; R.strHand.morphTargetInfluences[1] = 1;
      this.wristR.copy(R.strWrist).applyMatrix4(R.strGrp.matrix);
      this.wristL.copy(L.bowWrist).applyMatrix4(L.bowGrp.matrix);
    }
    this.arm(R, this.wristR, SH_R, POLE_R);
    this.arm(L, this.wristL, SH_L, POLE_L);

    // ---- spell light, and the flash that fades as the cast ends
    const orb = this.orb;
    orb.visible = this.castAmt > 0.05;
    if (casting) {
      const k = clamp(p.castFlash, 0, 1);
      const reach = Math.sin(Math.min(1, (1 - k) * 3) * Math.PI / 2);
      orb.position.set(-0.09, 0.02, -0.1).applyMatrix4(R.grp.matrix);
      orb.material.color.setHex(p.castColor);
      orb.material.opacity = 0.95 * Math.min(1, k * 3);
      const sz = (0.12 + 0.12 * reach) * (1 + Math.sin(t * 30) * 0.08);
      orb.scale.set(sz, sz, 1);
      orb.updateMatrix();
      if (!silent) {
        if (Math.random() < dt * 40) p.game.fx.orb(orb.getWorldPosition(V4), this.castCol.setHex(p.castColor), 0.05);
        p.castFlash = Math.max(0, p.castFlash - dt * 2.2);
      }
    }
  }

  // the casting hand: palm forward and fingers up, thrust out, blended in by `open`
  castPose(grp, open) {
    const k = clamp(this.p.castFlash, 0, 1);
    const reach = Math.sin(Math.min(1, (1 - k) * 3) * Math.PI / 2);
    E1.set(Math.PI / 2, -Math.PI / 2, 0, 'YXZ');
    Q2.setFromEuler(E1);
    grp.quaternion.slerp(Q2, open);
    grp.position.x = lerp(grp.position.x, 0.2, open);
    grp.position.y = lerp(grp.position.y, -0.17 + 0.03 * reach, open);
    grp.position.z = lerp(grp.position.z, -0.42 - 0.12 * reach, open);
    grp.updateMatrix();
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
    this.kitMat.dispose(); this.handMat.dispose(); this.glowMat.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
