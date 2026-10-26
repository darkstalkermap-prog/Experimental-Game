// The hero: first-person movement, sword & shield, bow, potions, and the view-model.
import * as THREE from 'three';
import { PLAYER, WORLD, TEAM_COLORS, PLAYER_TEAM, SPELLS, MANA } from './config.js';
import { STEP } from './physics.js';
import { clamp } from './noise.js';
import { buildHorse, poseHorse, buildSoldier, poseSoldier, SADDLE_Y } from './models.js';
import { avoidCastles } from './nav.js';
import { dirFromAim, STRIKE, DIRS, DIR_IDX } from './combat.js';

export const HORSE = { hp: 320, walk: 7, gallop: 13.5, back: 2.5, accel: 5, brake: 10, turn: 2.2, eye: 2.85 };

const SWORDS = [
  { name: 'Arming Sword', dmg: 34, len: 0.95 },
  { name: 'Steel Longsword', dmg: 50, len: 1.1 },
  { name: 'Masterwork Blade', dmg: 70, len: 1.2 },
];
const SHIELDS = [
  { name: 'Round Shield', block: 0.75 },
  { name: 'Kite Shield', block: 0.9 },
];
const BOWS = [
  { name: 'Hunting Bow', dmg: 30, draw: 0.85 },
  { name: 'War Bow', dmg: 48, draw: 0.7 },
];
export { SWORDS, SHIELDS, BOWS };

export class Player {
  constructor(game, camera, opts = {}) {
    this.game = game;
    this.camera = camera;
    this.remote = !!opts.remote;   // another person's hero (driven by network updates)
    this.netId = opts.netId ?? null;
    this.isPlayer = true;
    this.isHero = true;
    this.kind = 'hero';
    this.type = 'hero';
    this.team = opts.team ?? PLAYER_TEAM;
    this.name = opts.name || 'You';
    this.spawnSeq = 0;
    this.netPose = null;
    this.walkPhase = 0;
    this.radius = 0.4;
    this.height = 1.8;
    this.eye = 1.68;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.alive = true;
    this.lv = { vitality: 0, strength: 0, armor: 0, sword: 0, shield: 0, bow: 0, magic: 0, mana: 0, regen: 0, spells: [] };
    this.mana = MANA.base;
    this.spell = null;      // selected spell
    this.castT = 0;         // how long the cast button has been held
    this.lastCast = -99;
    this.spellCd = 0;
    this.castFlash = 0;
    this.maxHp = PLAYER.hp;
    this.hp = this.maxHp;
    this.stamina = 100;
    this.arrows = PLAYER.arrows;
    this.potions = 1;
    this.weapon = 'sword';
    this.swingT = -1;          // animation clock other people see on this hero's body
    this.struck = false;
    this.blocking = false;
    // directional melee
    this.aim = { x: 0, y: 0 };  // recent mouse movement: picks attack / guard direction
    this.atkDir = 'right';
    this.attackDir = 'right';
    this.atk = null;            // { dir, phase: 'wind' | 'strike' | 'recover', t, charge }
    this.blockDir = 'right';
    this.blockStart = -99;
    this.feintedAt = undefined;
    this.staggerT = 0;
    this.shake = 0;
    this.drawT = 0;
    this.lastHurt = -99;
    this.kills = 0;
    this.deaths = 0;
    this.sensitivity = 0.0022;
    this.bob = 0;
    this.hurtFlash = 0;
    // warhorse
    this.hasHorse = false;
    this.mounted = false;
    this.horse = null;        // model
    this.horseHp = 0;
    this.horsePos = new THREE.Vector3();
    this.horseYaw = 0;
    this.horseComing = false;
    this.heading = 0;
    this.rideSpeed = 0;
    this.trampled = new Map();
    if (this.camera) this.buildViewModel();
    if (this.remote) this.buildBody();
  }

  // ---------- third-person body for other people's heroes ----------
  buildBody() {
    this.body = buildSoldier('lord', this.team, 2);
    this.game.scene.add(this.body.root);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(this.name, 128, 34);
    ctx.fillStyle = '#' + TEAM_COLORS[this.team].toString(16).padStart(6, '0');
    ctx.fillText(this.name, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.tag.scale.set(2.4, 0.45, 1);
    this.tag.renderOrder = 10;
    this.game.scene.add(this.tag);
  }

  removeBody() {
    if (this.body) this.game.scene.remove(this.body.root);
    if (this.tag) this.game.scene.remove(this.tag);
    if (this.horse) this.game.scene.remove(this.horse.root);
  }

  updateBody(dt) {
    if (!this.body) return;
    const b = this.body;
    b.root.visible = this.alive;
    this.tag.visible = this.alive;
    if (!this.alive) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * sp * 2.1;
    b.root.position.set(this.pos.x, this.pos.y + (this.mounted ? SADDLE_Y : 0), this.pos.z);
    b.root.rotation.y = this.mounted ? this.heading : this.yaw;
    poseSoldier(b, { phase: this.mounted && this.horse ? this.horse.phase : this.walkPhase, speed: sp, moving: sp > 0.3, swingT: this.swingT, attackDir: this.attackDir, stagger: this.staggerT > 0 ? 1 : 0, mounted: this.mounted, blocking: this.blocking });
    this.tag.position.set(this.pos.x, this.pos.y + (this.mounted ? 3.6 : 2.4), this.pos.z);
  }

  // apply the latest pose received over the network (smoothed)
  remoteUpdate(dt) {
    const n = this.netPose;
    if (n) {
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      const k = d > 8 ? 1 : Math.min(1, dt * 14);
      this.pos.x += (n.x - this.pos.x) * k;
      this.pos.y += (n.y - this.pos.y) * k;
      this.pos.z += (n.z - this.pos.z) * k;
      let dy = n.yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 14);
      this.pitch = n.pitch;
      this.vel.set(n.vx, 0, n.vz);
      if (n.b && !this.blocking) this.blockStart = this.game.time - (n.ba || 0);
      if (n.b && n.bd !== undefined && DIRS[n.bd] !== this.blockDir) { this.blockDir = DIRS[n.bd]; this.blockStart = this.game.time - (n.ba || 0); }
      this.blocking = !!n.b;
      this.weapon = n.w ? 'bow' : 'sword';
      this.mounted = !!n.m && this.hasHorse;
      this.radius = this.mounted ? 0.8 : 0.4;
      this.heading = n.h;
      this.rideSpeed = n.rs;
      if (!this.mounted && n.hx !== undefined) { this.horsePos.set(n.hx, n.hy, n.hz); this.horseYaw = n.hyaw; }
    }
    if (this.swingT >= 0) { this.swingT += dt; if (this.swingT > 0.62) this.swingT = -1; }
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.game.mode !== 'client' && this.alive) {
      if (this.game.time - this.lastHurt > 8 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4);
      if (this.mounted) this.trample(dt);
    }
    this.updateBody(dt);
  }

  // pose sent from a client to the host
  poseMsg() {
    const m = { x: r2(this.pos.x), y: r2(this.pos.y), z: r2(this.pos.z), yaw: r2(this.yaw), pitch: r2(this.pitch),
      vx: r2(this.vel.x), vz: r2(this.vel.z), b: this.blocking ? 1 : 0, w: this.weapon === 'bow' ? 1 : 0,
      bd: DIR_IDX[this.blockDir], ba: r2(Math.max(0, this.game.time - this.blockStart)),
      m: this.mounted ? 1 : 0, h: r2(this.heading), rs: r2(this.rideSpeed) };
    if (this.hasHorse && !this.mounted) { m.hx = r2(this.horsePos.x); m.hy = r2(this.horsePos.y); m.hz = r2(this.horsePos.z); m.hyaw = r2(this.horseYaw); }
    return m;
  }

  notify(text, important = false) { this.game.deliver(this, { k: 'toast', text, team: this.team, imp: important }); }
  sound(name) { this.game.deliver(this, { k: 'snd', n: name }); }
  get isLocal() { return this === this.game.player; }
  get netClient() { return this.isLocal && this.game.mode === 'client'; }

  get armor() { return PLAYER.armor + this.lv.armor * 3; }
  get dmgMult() { return 1 + this.lv.strength * 0.12; }
  get sword() { return SWORDS[this.lv.sword]; }
  get shield() { return SHIELDS[this.lv.shield]; }
  get bow() { return BOWS[this.lv.bow]; }
  get manaMax() { return MANA.base + MANA.perLevel * (this.lv.mana || 0); }
  get manaRegen() { return MANA.regen * (1 + MANA.regenPerLevel * (this.lv.regen || 0)); }
  get spellMult() { return 1 + 0.25 * (this.lv.magic || 0); }
  get spells() { return this.lv.spells || []; }

  learnSpell(id) {
    if (!this.lv.spells.includes(id)) this.lv.spells = [...this.lv.spells, id];
    if (!this.spell) this.spell = id;
  }
  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.25, this.pos.z); }

  recalc() {
    const old = this.maxHp;
    this.maxHp = PLAYER.hp + this.lv.vitality * 30;
    this.hp += this.maxHp - old;
    this.rebuildWeapons();
  }

  spawn(at, yaw) {
    this.pos.copy(at);
    this.pos.y = this.game.physics.groundHeight(at.x, at.z, at.y + 3);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.stamina = 100;
    this.alive = true;
    this.swingT = -1;
    this.mana = this.manaMax;
    this.spawnSeq++;
    if (this.viewModel) this.viewModel.visible = true;
    this.mounted = false;
    this.rideSpeed = 0;
    this.radius = 0.4;
    if (this.hasHorse) {
      this.horsePos.set(at.x + 2.5, 0, at.z);
      this.horsePos.y = this.game.physics.groundHeight(this.horsePos.x, this.horsePos.z, at.y + 3);
      this.horseComing = false;
    }
  }

  // ---------- warhorse ----------
  ensureHorseModel() {
    if (!this.horse) {
      this.horse = buildHorse(this.team, 1, true);
      this.game.scene.add(this.horse.root);
    }
  }

  giveHorse() {
    this.hasHorse = true;
    this.horseHp = HORSE.hp;
    this.horseDeadT = undefined;
    this.ensureHorseModel();
    this.horse.root.visible = true;
    this.horse.root.rotation.set(0, 0, 0);
    this.horsePos.copy(this.pos).add(new THREE.Vector3(Math.cos(this.yaw) * 2.5, 0, -Math.sin(this.yaw) * 2.5));
    this.horsePos.y = this.game.physics.groundHeight(this.horsePos.x, this.horsePos.z, this.pos.y + 2);
    this.horseYaw = this.yaw;
  }

  toggleMount() {
    const g = this.game;
    if (!this.hasHorse) { this.notify('You have no horse. Buy a Warhorse in the shop (B → Items).'); return; }
    if (this.mounted) {
      this.mounted = false;
      this.radius = 0.4;
      this.horsePos.copy(this.pos);
      this.horseYaw = this.heading;
      // step off to the left of the horse
      const sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
      this.pos.x -= sx * 1.3; this.pos.z -= sz * 1.3;
      g.physics.resolve(this.pos, this.radius, this.pos.y, this.height, this.team);
      this.vel.set(0, 0, 0);
      this.rideSpeed = 0;
      return;
    }
    const d = Math.hypot(this.horsePos.x - this.pos.x, this.horsePos.z - this.pos.z);
    if (d < 3.5) {
      this.mounted = true;
      this.horseComing = false;
      this.radius = 0.8;
      this.pos.x = this.horsePos.x; this.pos.z = this.horsePos.z;
      this.heading = this.horseYaw;
      this.swingT = -1;
      this.drawT = 0;
    } else {
      this.horseComing = true;
      this.notify('You whistle for your horse.');
      this.sound('order');
    }
  }

  loseHorse(silent = false) {
    const g = this.game;
    const wasMounted = this.mounted;
    if (wasMounted) {
      this.horsePos.copy(this.pos);
      this.horseYaw = this.heading;
      this.mounted = false;
      this.radius = 0.4;
      this.rideSpeed = 0;
    }
    this.hasHorse = false;
    this.horseDeadT = 0;
    g.fx.blood(this.horsePos.clone().setY(this.horsePos.y + 1.4), 20);
    g.audio.play('death', this.horsePos);
    if (!silent) this.notify('Your horse has been killed!', true);
  }

  // riderless horse: idle, or trot over when whistled; dead horse: topple and fade
  updateHorse(dt) {
    if (!this.horse) return;
    const h = this.horse;
    const g = this.game;
    if (!this.hasHorse) {
      if (this.horseDeadT === undefined) { h.root.visible = false; return; }
      this.horseDeadT += dt;
      h.root.rotation.z = Math.min(Math.PI / 2 * 0.95, this.horseDeadT * 3);
      if (this.horseDeadT > 10) { h.root.visible = false; this.horseDeadT = undefined; }
      return;
    }
    h.root.visible = true;
    if (this.mounted) {
      h.root.position.copy(this.pos);
      h.root.rotation.set(0, this.heading, 0);
      poseHorse(h, Math.abs(this.rideSpeed), dt);
      return;
    }
    let sp = 0;
    if (this.horseComing && this.alive) {
      const d = Math.hypot(this.pos.x - this.horsePos.x, this.pos.z - this.horsePos.z);
      if (d < 2.6) this.horseComing = false;
      else {
        const wp = avoidCastles(g, this.horsePos, this.pos);
        const dx = wp.x - this.horsePos.x, dz = wp.z - this.horsePos.z;
        const dl = Math.hypot(dx, dz) || 1;
        sp = d > 12 ? 11 : 5;
        this.horsePos.x += (dx / dl) * sp * dt;
        this.horsePos.z += (dz / dl) * sp * dt;
        g.physics.resolve(this.horsePos, 0.8, this.horsePos.y, 2.6, this.team);
        let dy = Math.atan2(dx, dz) - this.horseYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.horseYaw += dy * Math.min(1, dt * 4);
      }
    }
    this.horsePos.y = g.physics.groundHeight(this.horsePos.x, this.horsePos.z, this.horsePos.y + 0.5);
    h.root.position.copy(this.horsePos);
    h.root.rotation.set(0, this.horseYaw, 0);
    poseHorse(h, sp, dt);
  }

  // ---------- view model ----------
  buildViewModel() {
    const vm = new THREE.Group();
    this.viewModel = vm;
    this.camera.add(vm);
    this.vmSword = new THREE.Group();
    this.vmShield = new THREE.Group();
    this.vmBow = new THREE.Group();
    this.vmMagic = new THREE.Group();
    vm.add(this.vmSword, this.vmShield, this.vmBow, this.vmMagic);
    // spell hand: an open glove with a flame / frost / spark orb above the palm
    const glove = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.12), glove);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 8), glove);
    wrist.rotation.x = Math.PI / 2; wrist.position.z = 0.15;
    const fingers = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.08), glove);
      f.position.set(-0.035 + i * 0.023, 0.025, -0.08);
      f.rotation.x = 0.6;
      fingers.add(f);
    }
    this.vmOrbMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.vmOrb = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), this.vmOrbMat);
    this.vmOrb.position.set(0, 0.09, -0.04);
    this.vmMagic.add(palm, wrist, fingers, this.vmOrb);
    this.vmMagic.position.set(0.24, -0.3, -0.48);
    this.vmMagic.rotation.set(0.2, -0.15, 0);
    this.rebuildWeapons();
  }

  rebuildWeapons() {
    if (!this.camera) return;
    const steel = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 0.95, roughness: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.9, roughness: 0.3 });
    const team = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[this.team], roughness: 0.75 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.7 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8 });
    for (const g of [this.vmSword, this.vmShield, this.vmBow]) g.clear();

    // sword: blade points up the local +y axis from the grip
    const sw = this.sword;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, sw.len, 0.012), steel);
    blade.position.y = 0.12 + sw.len / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), steel);
    tip.position.y = 0.12 + sw.len + 0.06;
    tip.scale.z = 0.3;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.05), this.lv.sword >= 2 ? gold : dark);
    guard.position.y = 0.11;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), dark);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this.lv.sword >= 1 ? gold : steel);
    pommel.position.y = -0.11;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 }));
    hand.position.y = 0;
    this.vmSword.add(blade, tip, guard, grip, pommel, hand);
    this.vmSwordBase = { pos: new THREE.Vector3(0.32, -0.32, -0.55), rot: new THREE.Euler(-0.5, 0.15, -0.35) };

    // shield
    let sh;
    if (this.lv.shield === 0) {
      sh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), team);
      sh.rotation.x = Math.PI / 2;
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel);
      boss.rotation.x = -Math.PI / 2;
      boss.position.z = -0.02;
      sh.add(boss);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 24), steel);
      rim.rotation.x = Math.PI / 2;
      sh.add(rim);
    } else {
      sh = new THREE.Group();
      const shape = new THREE.Shape();
      shape.moveTo(-0.3, 0.35); shape.lineTo(0.3, 0.35); shape.quadraticCurveTo(0.32, -0.2, 0, -0.62); shape.quadraticCurveTo(-0.32, -0.2, -0.3, 0.35);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
      const face = new THREE.Mesh(geo, team);
      face.rotation.y = Math.PI;
      sh.add(face);
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.01), trim);
      cross1.position.set(0, -0.08, -0.05);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.01), trim);
      cross2.position.set(0, 0.14, -0.05);
      sh.add(cross1, cross2);
    }
    this.vmShield.add(sh);
    this.vmShield.scale.setScalar(0.8);
    this.vmShieldBase = { pos: new THREE.Vector3(-0.66, -0.5, -0.72), rot: new THREE.Euler(0.15, 0.85, 0.15) };

    // bow
    const bw = this.bow;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.62, 0), new THREE.Vector3(0, 0, -0.3), new THREE.Vector3(0, -0.62, 0));
    const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, this.lv.bow ? 0.022 : 0.017, 6, false), this.lv.bow ? dark : wood);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.24, 4), trim);
    this.vmString = string;
    const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.8, 4), wood);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.z = -0.25;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 4), steel);
    head.rotation.x = -Math.PI / 2;
    head.position.z = -0.68;
    const arrowGrp = new THREE.Group();
    arrowGrp.add(arrow, head);
    this.vmArrow = arrowGrp;
    this.vmBow.add(limb, string, arrowGrp);
    this.vmBowBase = { pos: new THREE.Vector3(-0.08, -0.12, -0.6), rot: new THREE.Euler(0, 0, 0.25) };
    void bw;
  }

  updateViewModel(dt, moving, sprint) {
    const vm = this.viewModel;
    const swordMode = this.weapon === 'sword';
    const magicMode = this.weapon === 'magic';
    this.vmMagic.visible = magicMode;
    if (magicMode) {
      const s = SPELLS[this.spell];
      const ready = s && this.mana >= s.cost;
      this.vmOrbMat.color.setHex(s ? s.color : 0x888888);
      const charge = this.spell === 'fireball' ? Math.min(1, Math.max(0, (this.castT - 0.15) / SPELLS.fireball.charge)) : 0;
      const pulse = 1 + Math.sin(this.game.time * 14) * 0.06;
      this.vmOrb.scale.setScalar((ready ? 0.045 + charge * 0.06 : 0.025) * pulse);
      this.vmOrbMat.opacity = ready ? 0.9 : 0.35;
      this.vmMagic.position.set(0.24 - charge * 0.05, -0.3 + charge * 0.04, -0.48 + this.castFlash * 0.12);
      if (ready && Math.random() < dt * 30) {
        const wp = this.vmOrb.getWorldPosition(new THREE.Vector3());
        if (this.spell === 'fireball') this.game.fx.orb(wp, new THREE.Color(0xff8a2a), 0.05 + charge * 0.06);
        else if (this.spell === 'ice') this.game.fx.orb(wp, new THREE.Color(0xbfe8ff), 0.04);
        else this.game.fx.orb(wp, new THREE.Color(0xcfeaff), 0.03);
      }
      this.castFlash = Math.max(0, (this.castFlash || 0) - dt * 5);
    }
    this.vmSword.visible = swordMode;
    this.vmShield.visible = swordMode;
    this.vmBow.visible = this.weapon === 'bow';
    this.bob += dt * (moving ? (sprint ? 13 : 9) : 2);
    const bobAmt = moving ? (sprint ? 0.03 : 0.018) : 0.004;
    vm.position.set(Math.sin(this.bob * 0.5) * bobAmt, -Math.abs(Math.sin(this.bob)) * bobAmt, 0);

    if (swordMode) {
      const b = this.vmSwordBase;
      const S = this.vmSword;
      S.position.copy(b.pos);
      S.rotation.copy(b.rot);
      const atk = this.atk;
      if (atk) {
        const W = VM_WIND[atk.dir], E = VM_END[atk.dir];
        let from = VM_ZERO, to = W, k;
        if (atk.phase === 'wind') { k = easeOut(Math.min(1, atk.t / 0.14)); }
        else if (atk.phase === 'strike') { from = W; to = E; k = easeOut(Math.min(1, atk.t / 0.12)); }
        else { from = E; to = VM_ZERO; k = easeInOut(Math.min(1, atk.t / 0.25)); }
        applyVm(S, from, to, k);
        if (atk.phase === 'wind' && atk.t > 0.3) S.position.x += (Math.random() - 0.5) * 0.003; // straining a full wind-up
      } else if (this.blocking) {
        // raise the sword out of the way of the shield
        S.position.x += 0.1; S.position.y -= 0.08; S.rotation.z -= 0.3;
      }
      if (this.staggerT > 0) { S.position.y -= 0.12 * Math.min(1, this.staggerT * 3); S.rotation.x -= 0.4 * Math.min(1, this.staggerT * 3); }
      const sb = this.vmShieldBase;
      const guard = { left: [-0.3, -0.2, 0.35], right: [0.02, -0.2, -0.2], over: [-0.14, -0.05, 0.05], thrust: [-0.14, -0.3, 0.05] }[this.blockDir];
      const target = this.blocking ? { x: guard[0], y: guard[1], z: -0.55, ry: guard[2] } : { x: sb.pos.x, y: sb.pos.y, z: sb.pos.z, ry: sb.rot.y };
      const k = Math.min(1, dt * 14);
      const sh = this.vmShield;
      if (!this._shInit) { sh.position.copy(sb.pos); sh.rotation.copy(sb.rot); this._shInit = true; }
      sh.position.x += (target.x - sh.position.x) * k;
      sh.position.y += (target.y - sh.position.y) * k;
      sh.position.z += (target.z - sh.position.z) * k;
      sh.rotation.y += (target.ry - sh.rotation.y) * k;
    } else {
      const b = this.vmBowBase;
      this.vmBow.position.copy(b.pos);
      this.vmBow.rotation.copy(b.rot);
      const draw = Math.min(1, this.drawT / this.bow.draw);
      this.vmArrow.visible = this.arrows > 0;
      this.vmArrow.position.z = 0.22 * draw;
      this.vmString.position.z = 0.22 * draw;
      this.vmString.scale.y = 1 - draw * 0.08;
      this.vmBow.position.x += 0.04 * draw;
      this.vmBow.position.y += 0.03 * draw;
      if (draw >= 1) this.vmBow.position.x += (Math.random() - 0.5) * 0.002;
    }
  }

  // ---------- per-frame ----------
  update(dt, input) {
    const g = this.game;
    if (!this.alive) return;
    const m = input.mouse;

    // look
    this.yaw -= m.dx * this.sensitivity * (this.zoomed ? 0.5 : 1);
    this.pitch = clamp(this.pitch - m.dy * this.sensitivity * (this.zoomed ? 0.5 : 1), -1.45, 1.45);

    // weapon switching
    if (input.hit('Digit1')) this.setWeapon('sword');
    if (input.hit('Digit2')) this.setWeapon('bow');
    if (input.hit('Digit3')) {
      if (this.weapon === 'magic') this.cycleSpell();
      else this.setWeapon('magic');
    }
    if (input.hit('KeyR') && this.weapon === 'magic') this.cycleSpell();
    if (m.wheel) {
      const order = ['sword', 'bow'].concat(this.spells.length ? ['magic'] : []);
      this.setWeapon(order[(order.indexOf(this.weapon) + (m.wheel > 0 ? 1 : order.length - 1)) % order.length]);
    }
    // mana comes back after a short pause in casting
    if (g.time - this.lastCast > MANA.delay) this.mana = Math.min(this.manaMax, this.mana + this.manaRegen * dt);
    this.spellCd = Math.max(0, this.spellCd - dt);
    if (input.hit('KeyQ')) this.drinkPotion();

    if (input.hit('KeyE')) this.toggleMount();

    // movement
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let moving, sprint = false;
    if (this.mounted) {
      // the horse has momentum and turns toward where you look
      let target = 0;
      sprint = input.down('ShiftLeft') && this.stamina > 5;
      if (input.down('KeyW')) target = sprint ? HORSE.gallop : HORSE.walk;
      if (input.down('KeyS')) target = -HORSE.back;
      const dv = target - this.rideSpeed;
      this.rideSpeed += clamp(dv, -HORSE.brake * dt, HORSE.accel * dt);
      if (sprint && this.rideSpeed > HORSE.walk) this.stamina = Math.max(0, this.stamina - dt * 9);
      else this.stamina = Math.min(100, this.stamina + dt * 14);
      let turn = 0;
      if (input.down('KeyA')) turn += 1;
      if (input.down('KeyD')) turn -= 1;
      let dy = this.yaw - this.heading;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const rate = HORSE.turn * dt * (Math.abs(this.rideSpeed) > 0.5 ? 1 : 0.6);
      this.heading += turn ? turn * rate : clamp(dy, -rate, rate);
      if (turn) this.yaw += turn * rate;
      this.vel.x = Math.sin(this.heading) * this.rideSpeed;
      this.vel.z = Math.cos(this.heading) * this.rideSpeed;
      moving = Math.abs(this.rideSpeed) > 0.3;
      this.trample(dt);
    } else {
      let mx = 0, mz = 0;
      if (input.down('KeyW')) { mx += fx; mz += fz; }
      if (input.down('KeyS')) { mx -= fx; mz -= fz; }
      if (input.down('KeyA')) { mx += fz; mz -= fx; }
      if (input.down('KeyD')) { mx -= fz; mz += fx; }
      const ml = Math.hypot(mx, mz);
      moving = ml > 0.01;
      sprint = input.down('ShiftLeft') && moving && this.stamina > 5 && !this.blocking && this.drawT === 0;
      let speed = sprint ? PLAYER.sprint : PLAYER.speed;
      if (this.blocking) speed *= 0.55;
      if (this.drawT > 0) speed *= 0.6;
      if (sprint) this.stamina = Math.max(0, this.stamina - dt * 18);
      else this.stamina = Math.min(100, this.stamina + dt * (this.blocking ? 6 : 16));
      const tx = moving ? (mx / ml) * speed : 0, tz = moving ? (mz / ml) * speed : 0;
      const acc = this.onGround ? 12 : 2.5;
      this.vel.x += (tx - this.vel.x) * Math.min(1, dt * acc);
      this.vel.z += (tz - this.vel.z) * Math.min(1, dt * acc);
    }

    if (input.hit('Space') && this.onGround && this.stamina > 8 && !this.mounted) {
      this.vy = PLAYER.jump;
      this.onGround = false;
      this.stamina -= 8;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const L = WORLD.playHalf;
    this.pos.x = clamp(this.pos.x, -L, L);
    this.pos.z = clamp(this.pos.z, -L, L);
    if (g.physics.resolve(this.pos, this.radius, this.pos.y, this.mounted ? 2.8 : this.height, this.team) && this.mounted) {
      this.rideSpeed *= 0.6; // ran into a wall
    }

    // vertical
    this.vy -= WORLD.gravity * dt;
    let ny = this.pos.y + this.vy * dt;
    const ground = g.physics.groundHeight(this.pos.x, this.pos.z, Math.max(this.pos.y, ny));
    if (ny <= ground) {
      ny = ground; this.vy = 0; this.onGround = true;
    } else if (this.onGround && this.vy <= 0 && this.pos.y - ground < STEP) {
      ny = ground; this.vy = 0; // follow ramps / slopes downward
    } else {
      this.onGround = false;
    }
    this.pos.y = ny;

    // combat
    const decay = Math.pow(0.0004, dt);
    this.aim.x = this.aim.x * decay + m.dx;
    this.aim.y = this.aim.y * decay + m.dy;
    const aimDir = dirFromAim(this.aim.x, this.aim.y, null);
    if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.atk = null;
      this.blocking = false;
      this.drawT = 0;
    } else if (this.weapon === 'sword') {
      this.swordInput(dt, m, aimDir);
      this.zoomed = false;
    } else if (this.weapon === 'magic') {
      this.blocking = false;
      this.zoomed = false;
      this.magicInput(dt, m);
    } else {
      this.blocking = false;
      if (m.left && this.arrows > 0) this.drawT += dt;
      if (m.leftReleased && this.drawT > 0) {
        if (this.drawT > 0.22 && this.arrows > 0) this.shoot();
        this.drawT = 0;
      }
      if (!m.left && !m.leftReleased) this.drawT = 0;
      this.zoomed = m.right;
    }
    this.shake = Math.max(0, this.shake - dt);

    // regen when out of combat (the host decides this in online games)
    if (g.mode !== 'client' && g.time - this.lastHurt > 8 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);

    // camera
    this.camera.position.set(this.pos.x, this.pos.y + (this.mounted ? HORSE.eye : this.eye), this.pos.z);
    const sk = this.shake * 0.06;
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * sk, this.yaw + Math.PI + (Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk, 'YXZ');
    const fov = this.zoomed ? 42 : 75;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
    this.updateViewModel(dt, moving && this.onGround, sprint);
  }

  // Hold left to wind up in the direction you last moved the mouse, release to strike.
  // Right click guards; while winding up it feints instead.
  swordInput(dt, m, aimDir) {
    const g = this.game;
    let atk = this.atk;
    if (atk && atk.phase === 'wind' && m.rightPressed) {
      this.atk = atk = null;
      this.feintedAt = g.time;
      this.stamina = Math.max(0, this.stamina - 3);
      if (this.netClient) g.net.toHost({ a: 'feint' });
    }
    const canGuard = !atk || atk.phase === 'recover';
    if (m.right && canGuard) {
      const dir = aimDir || (this.blocking ? this.blockDir : this.atkDir);
      if (!this.blocking || dir !== this.blockDir) this.blockStart = g.time; // raising or shifting the guard opens a parry window
      this.blockDir = dir;
      this.blocking = true;
      this.atk = atk = null;
    } else this.blocking = false;
    if (this.blocking) return;

    if (!atk && (m.leftPressed || m.left) && this.stamina > 4) {
      const dir = aimDir || this.atkDir;
      this.atk = atk = { dir, phase: 'wind', t: 0, charge: 0 };
      this.atkDir = dir;
      this.attackDir = dir;
      this.stamina -= 6;
      this.swingT = 0;
      if (this.netClient) g.net.toHost({ a: 'swing', d: DIR_IDX[dir] });
    }
    if (!atk) return;
    atk.t += dt;
    if (atk.phase === 'wind') {
      if ((!m.left && atk.t >= 0.14) || atk.t > 1.4) {
        atk.charge = Math.max(0, Math.min(1, (atk.t - 0.14) / 0.5));
        atk.phase = 'strike'; atk.t = 0;
        this.struck = false;
        this.swingT = 0.25;
        g.audio.play('swing');
      } else this.swingT = Math.min(0.24, atk.t * 1.7);
    } else if (atk.phase === 'strike') {
      this.swingT = 0.25 + atk.t * 0.75;
      if (!this.struck && atk.t >= 0.07) { this.struck = true; this.meleeStrike(atk.dir, atk.charge); }
      if (atk.t >= 0.2) { atk.phase = 'recover'; atk.t = 0; }
    } else {
      this.swingT = 0.4 + atk.t * 0.88;
      if (atk.t >= 0.25) { this.atk = null; this.swingT = -1; }
    }
  }

  // knocked off balance (e.g. your blow was parried)
  stagger(sec) {
    this.staggerT = Math.max(this.staggerT, sec);
    this.atk = null;
    this.swingT = -1;
    this.blocking = false;
    if (this.isLocal) this.shake = Math.max(this.shake, 0.35);
    else if (this.game.mode === 'host') this.game.deliver(this, { k: 'stagger', t: sec });
  }

  // feedback when your blow lands
  onHitLanded(heavy) {
    this.shake = Math.max(this.shake, heavy ? 0.22 : 0.1);
    if (this.game.mode === 'single') this.game.hitStop = heavy ? 0.09 : 0.05;
  }

  // Fireball: hold to charge, release to cast. Ice and lightning cast on click.
  magicInput(dt, m) {
    const s = SPELLS[this.spell];
    if (!s) return;
    if (this.spell === 'fireball') {
      if (m.left) this.castT += dt;
      if (m.leftReleased && this.castT > 0) {
        if (this.castT >= 0.15) this.castSpell(Math.min(1, (this.castT - 0.15) / s.charge));
        this.castT = 0;
      }
      if (!m.left && !m.leftReleased) this.castT = 0;
    } else if (m.leftPressed) this.castSpell(0);
  }

  castSpell(charge) {
    const g = this.game;
    const s = SPELLS[this.spell];
    if (this.mana < s.cost || this.spellCd > 0) { g.audio.play('deny'); return; }
    this.mana -= s.cost;
    this.lastCast = g.time;
    this.spellCd = s.cd || 0.35;
    this.castFlash = 1;
    const dir = this.lookDir();
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const from = this.camera.position.clone().addScaledVector(dir, 0.8).addScaledVector(right, -0.18);
    from.y -= 0.15;
    // aim from the hand at the point under the crosshair so the spell lands where you look
    const aimPt = this.camera.position.clone().addScaledVector(dir, 40);
    const d = aimPt.sub(from).normalize();
    this.attackDir = 'thrust';
    this.swingT = 0.25;
    if (this.netClient) {
      g.net.toHost({ a: 'cast', s: this.spell, f: [from.x, from.y, from.z].map(r2), d: [d.x, d.y, d.z].map((x) => Math.round(x * 1e4) / 1e4), ch: r2(charge) });
      return;
    }
    g.magic.cast(this, this.spell, from, d, charge, this.spellMult);
  }

  cycleSpell() {
    const list = this.spells;
    if (!list.length) return;
    this.spell = list[(list.indexOf(this.spell) + 1) % list.length];
    this.castT = 0;
    this.notify(`Spell: ${SPELLS[this.spell].name}`);
  }

  setWeapon(w) {
    if (w === 'magic' && !this.spells.length) { this.notify('You know no spells yet. Learn them in the shop (B → Magic).'); return; }
    if (w === 'magic' && !this.spell) this.spell = this.spells[0];
    this.castT = 0;
    if (this.weapon === w) return;
    this.weapon = w;
    this.swingT = -1;
    this.atk = null;
    this.drawT = 0;
  }

  drinkPotion() {
    if (this.netClient) { this.game.net.toHost({ a: 'potion' }); return; }
    if (this.potions <= 0 || this.hp >= this.maxHp) { this.sound('deny'); return; }
    this.potions--;
    this.hp = Math.min(this.maxHp, this.hp + 130);
    this.notify('You drink a healing draught (+130 HP)');
    this.sound('buy');
  }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  meleeStrike(dir = this.atkDir, windCharge = 0) {
    const g = this.game;
    if (this.netClient) { g.net.toHost({ a: 'strike', ...this.poseMsg(), d: DIR_IDX[dir], ch: r2(windCharge) }); return; }
    const S = STRIKE[dir] || STRIKE.right;
    this.attackDir = dir;
    const reach = this.sword.len + (this.mounted ? 2.2 : 1.6) + S.reach;
    const charge = this.mounted ? 1 + Math.max(0, Math.abs(this.rideSpeed) - 3) / 8 : 1;
    const dmg = this.sword.dmg * this.dmgMult * charge * S.mult * (1 + 0.35 * windCharge) * (0.9 + Math.random() * 0.2);
    const info = { melee: true, attackDir: dir, charge: windCharge, dir: new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)) };
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hits = [];
    g.grid.query(this.pos.x, this.pos.z, reach + 1, (u) => {
      if (!u.alive || u.team === this.team || u === this) return;
      const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - u.radius > reach) return;
      if (Math.abs(u.pos.y - this.pos.y) > (this.mounted ? 2.8 : 2.2)) return;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < S.cone) return;
      hits.push({ u, d });
    });
    hits.sort((a, b) => a.d - b.d);
    let hitSomething = false;
    for (const h of hits.slice(0, S.targets)) {
      g.damage(h.u, h === hits[0] ? dmg : dmg * 0.5, this, info);
      hitSomething = true;
    }
    if (!hitSomething) {
      // structures and siege engines in front of us
      const p = new THREE.Vector3(this.pos.x + fx * 1.6, this.pos.y + 1.2, this.pos.z + fz * 1.6);
      const s = g.siegeAt(p, this.team, 1.5);
      if (s) { g.damage(s, dmg, this, { melee: true }); hitSomething = true; }
      else {
        for (const c of g.castles) {
          if (c.team === this.team || c.fallen) continue;
          for (const st of [c.gate, c.keep]) {
            if (!st.alive) continue;
            const d = Math.hypot(st.pos.x - p.x, st.pos.z - p.z) - st.radius;
            if (d < 1.4) { g.damage(st, dmg * 0.8, this, { melee: true }); hitSomething = true; break; }
          }
        }
      }
    }
    if (!hitSomething) {
      const c = g.physics.pointHit(this.pos.x + fx * 1.4, this.pos.y + 1.2, this.pos.z + fz * 1.4);
      if (c) { g.fx.sparks(new THREE.Vector3(this.pos.x + fx * 1.2, this.pos.y + 1.3, this.pos.z + fz * 1.2), 6); g.audio.play('clang'); }
    }
  }

  shoot() {
    const draw = Math.min(1, this.drawT / this.bow.draw);
    const dir = this.lookDir();
    const from = this.camera.position.clone().addScaledVector(dir, 0.6);
    from.y -= 0.08;
    const wobble = (1 - draw) * 0.04 + (this.zoomed ? 0 : 0.006);
    dir.x += (Math.random() - 0.5) * wobble; dir.y += (Math.random() - 0.5) * wobble; dir.z += (Math.random() - 0.5) * wobble;
    dir.normalize();
    this.game.audio.play('bow');
    if (this.netClient) {
      this.game.net.toHost({ a: 'shoot', f: [from.x, from.y, from.z].map(r2), d: [dir.x, dir.y, dir.z].map((x) => Math.round(x * 1e4) / 1e4), draw: r2(draw) });
      this.arrows--;
      return;
    }
    this.fireFrom(from, dir, draw);
  }

  // spawn the arrow (host / single player)
  fireFrom(from, dir, draw) {
    if (this.arrows <= 0) return;
    const speed = 30 + 32 * draw;
    this.game.projectiles.fireArrow(from, dir.clone().multiplyScalar(speed), this.team, this.bow.dmg * this.dmgMult * (0.4 + 0.6 * draw), this);
    this.arrows--;
  }

  // galloping into enemies knocks them down
  trample(dt) {
    const g = this.game;
    const sp = Math.abs(this.rideSpeed);
    for (const [u, t] of this.trampled) { if (t - dt <= 0) this.trampled.delete(u); else this.trampled.set(u, t - dt); }
    if (sp < 6) return;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    g.grid.query(this.pos.x + fx, this.pos.z + fz, 2, (u) => {
      if (!u.alive || u.team === this.team || u.isPlayer || u.mounted || this.trampled.has(u)) return;
      const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.6 || (dx * fx + dz * fz) / (d || 1) < 0.3) return;
      this.trampled.set(u, 0.8);
      g.damage(u, 6 + sp * 1.6, this, { melee: true });
      u.vel.x += fx * 6; u.vel.z += fz * 6;
      this.rideSpeed *= 0.85;
    });
  }

  takeDamage(amount, attacker, info = {}) {
    if (!this.alive) return;
    if (info.melee && amount > this.maxHp * 0.15) this.stagger(0.25);
    if (this.mounted) {
      // the horse takes half the blows
      this.horseHp -= amount * 0.5;
      amount *= 0.5;
      if (this.horseHp <= 0) this.loseHorse();
    }
    this.hp -= amount;
    this.lastHurt = this.game.time;
    if (this.isLocal) {
      this.hurtFlash = Math.min(1, this.hurtFlash + 0.5 + amount / 60);
      this.game.audio.play('hurt');
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths++;
      if (this.viewModel) this.viewModel.visible = false;
      if (this.mounted) { this.mounted = false; this.horsePos.copy(this.pos); this.horseYaw = this.heading; this.rideSpeed = 0; this.radius = 0.4; }
      this.game.onPlayerKilled(attacker, this);
    }
  }
}

const r2 = (x) => Math.round(x * 100) / 100;

// first-person sword key poses per attack direction (offsets from the resting pose)
const VM_ZERO = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const VM_WIND = {
  right: { x: 0.18, y: 0.12, z: 0.05, rx: 0.2, ry: 0, rz: -1.3 },
  left: { x: -0.42, y: 0.12, z: 0, rx: 0.2, ry: 0.3, rz: 1.2 },
  over: { x: -0.05, y: 0.3, z: 0.1, rx: 0.9, ry: 0, rz: 0.25 },
  thrust: { x: -0.12, y: 0.02, z: 0.22, rx: -1.2, ry: 0.1, rz: 0.3 },
};
const VM_END = {
  right: { x: -0.6, y: -0.12, z: -0.1, rx: -0.4, ry: 0, rz: 1.3 },
  left: { x: 0.3, y: -0.1, z: -0.1, rx: -0.4, ry: -0.3, rz: -1.2 },
  over: { x: -0.1, y: -0.35, z: -0.15, rx: -1.4, ry: 0, rz: 0.2 },
  thrust: { x: -0.15, y: 0.06, z: -0.4, rx: -1.3, ry: 0.1, rz: 0.3 },
};
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeInOut = (k) => k * k * (3 - 2 * k);
function applyVm(obj, a, b, k) {
  obj.position.x += a.x + (b.x - a.x) * k;
  obj.position.y += a.y + (b.y - a.y) * k;
  obj.position.z += a.z + (b.z - a.z) * k;
  obj.rotation.x += a.rx + (b.rx - a.rx) * k;
  obj.rotation.y += a.ry + (b.ry - a.ry) * k;
  obj.rotation.z += a.rz + (b.rz - a.rz) * k;
}
