// The hero: first-person movement, sword & shield, bow, class abilities, potions, and the view-model.
import * as THREE from 'three';
import { PLAYER, WORLD, TEAM_COLORS, PLAYER_TEAM, ENGINE_TURN, BODY, VOLLEY } from './config.js';
import { STEP } from './physics.js';
import { clamp } from './noise.js';
import { buildHorse, poseHorse, buildHeroBody, poseSoldier, rigSetBow, SADDLE_Y } from './models.js';
import { avoidCastles } from './nav.js';
import { dirFromAim, STRIKE, DIRS, DIR_IDX } from './combat.js';
import { allied } from './teams.js';
import { CLASSES, classOf, Buffs, SWITCH } from './classes.js';
import { heroMods, talentPointsFor, MAX_LEVEL, XP_FOR_LEVEL, LEVEL } from './heroes.js';
import { talentFx } from './talents.js';
import { HeroBot } from './herobot.js';

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
    this.isBot = !!opts.bot;       // a hero the computer plays (Hero Game Mode): `bot` steers it where the battle is run
    this.bot = null;
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
    this.height = BODY.height;
    this.eye = BODY.eye;
    this.duck = 0;             // 0 standing .. 1 fully ducked (eases in and out)
    this.ducking = false;
    this.climb = null;         // a scramble up a castle wall: { t, dur, ... }
    this.climbing = false;     // (what other screens are told)
    this.climbCd = 0;
    this.climbHint = false;    // a wall is right in front and a jump would climb it (for the on-screen prompt)
    this.climbMsgAt = -99;
    this.hintT = 0;
    this.vmDown = 0;           // how far the weapons are lowered (while climbing)
    this.aiming = null;        // holding Q to place the Ranger's volley: { slot, t, at, far }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.alive = true;
    this.lv = { sword: 0, shield: 0, bow: 0 };
    // class: stat mods and two abilities (Q attacks, R defends)
    this.classId = opts.cls || 'knight';
    this.xp = 0;               // experience, and the level it makes (1..5); one talent point per level after the first
    this.level = 1;
    this.talents = {};         // { talentId: true }: what has been learnt this life of the class
    this.talentRev = 0;        // bumped whenever the talents change, so the cached mods are rebuilt
    this.buffs = new Buffs();
    this.abilCd = { q: 0, r: 0 };
    this.classAt = -99;        // when this hero last changed class
    this.dash = null;          // { x, z, v, t }: a lunge, roll or charge that carries the hero along
    this.ghostT = 0;           // (a bot wedged against a trunk slips past trunks and stones while this runs)
    this.castFlash = 0;        // the spell hand is raised while this runs down
    this.castColor = 0xff8a2a;
    this.drive = null;         // the siege engine this hero is steering
    this.maxHp = Math.round(PLAYER.hp * this.mods.hp);
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
    this.baseFov = 75;   // field of view setting
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
    if (this.remote) {
      this.buildBody();
      if (this.cls.mods.horse) this.giveHorse();   // a Cavalier starts with a warhorse (the real hero's comes from setClass)
    }
    if (opts.bot) this.bot = opts.bot === true ? new HeroBot(game, this) : opts.bot;   // true: make the AI here; or hand one in
  }

  // Where the hero's eyes are (arrows and spells leave from here; the hero on this screen uses the camera instead).
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.mounted ? HORSE.eye : this.eye), this.pos.z); }

  // ---------- third-person body for other people's heroes ----------
  buildBody() {
    this.body = buildHeroBody(this.classId, this.team, 2);
    this.bodyClass = this.classId;
    this.game.scene.add(this.body.root);
    this.buildTag();
  }

  // (another class: a new look)
  restyleBody() {
    if (!this.body || this.bodyClass === this.classId) return;
    this.game.scene.remove(this.body.root);
    this.buildBody();
  }

  // The floating name and class above another person's hero (drawn again when they change class).
  buildTag() {
    if (this.tag) {
      this.game.scene.remove(this.tag);
      this.tag.material.map.dispose();
      this.tag.material.dispose();
    }
    const c = document.createElement('canvas');
    c.width = 256; c.height = 72;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.strokeText(this.name, 128, 32);
    ctx.fillStyle = '#' + TEAM_COLORS[this.team].toString(16).padStart(6, '0');
    ctx.fillText(this.name, 128, 32);
    ctx.font = '600 22px Georgia, serif';
    ctx.lineWidth = 4;
    const sub = `${this.cls.name} · Lv ${this.level}`;
    ctx.strokeText(sub, 128, 60);
    ctx.fillStyle = this.cls.color;
    ctx.fillText(sub, 128, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.tag.scale.set(2.4, 0.675, 1);
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
    b.root.visible = this.alive && !this.drive;
    this.tag.visible = this.alive && !this.drive;
    if (!this.alive || this.drive) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * sp * 2.1;
    b.root.position.set(this.pos.x, this.pos.y + (this.mounted ? SADDLE_Y : 0), this.pos.z);
    b.root.rotation.y = this.mounted ? this.heading : this.yaw;
    rigSetBow(b, this.weapon === 'bow');
    poseSoldier(b, { phase: this.mounted && this.horse ? this.horse.phase : this.walkPhase, speed: sp, moving: sp > 0.3, swingT: this.swingT, attackDir: this.attackDir, stagger: this.staggerT > 0 ? 1 : 0, mounted: this.mounted, blocking: this.blocking, crouch: this.duck, climb: this.climbing, time: this.game.time, idle: this.game.time + this.team * 1.7, look: 0 });
    this.tag.position.set(this.pos.x, this.pos.y + (this.mounted ? 3.6 : 2.4 - 0.7 * this.duck), this.pos.z);
  }

  // apply the latest pose received over the network (smoothed)
  remoteUpdate(dt) {
    const n = this.netPose;
    const s = INTERP_SAMPLE;
    const interpolated = n && this.interp && this.interp.sample(s);
    if (interpolated) {
      // network client: interpolated between the host's updates
      this.pos.set(s.x, s.y, s.z);
      this.yaw = n.m ? s.extra : s.yaw;
    } else if (n) {
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      const k = d > 8 ? 1 : Math.min(1, dt * 14);
      this.pos.x += (n.x - this.pos.x) * k;
      this.pos.y += (n.y - this.pos.y) * k;
      this.pos.z += (n.z - this.pos.z) * k;
      let dy = n.yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 14);
    }
    if (n) {
      this.pitch = n.pitch;
      this.vel.set(n.vx, 0, n.vz);
      if (n.b && !this.blocking) this.blockStart = this.game.time - (n.ba || 0);
      if (n.b && n.bd !== undefined && DIRS[n.bd] !== this.blockDir) { this.blockDir = DIRS[n.bd]; this.blockStart = this.game.time - (n.ba || 0); }
      this.blocking = !!n.b;
      this.weapon = n.w ? 'bow' : 'sword';
      this.mounted = !!n.m && this.hasHorse;
      this.radius = this.mounted ? 0.8 : 0.4;
      this.climbing = !!n.cl;
      this.setDuck(!!n.dk && !this.mounted, dt);
      this.heading = interpolated && n.m ? s.yaw : n.h;
      this.rideSpeed = n.rs;
      if (!this.mounted && n.hx !== undefined) { this.horsePos.set(n.hx, n.hy, n.hz); this.horseYaw = n.hyaw; }
    }
    if (this.swingT >= 0) { this.swingT += dt; if (this.swingT > 0.62) this.swingT = -1; }
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.game.mode !== 'client' && this.alive) {
      if (this.game.time - this.lastHurt > 8 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4 * (this.mods.regen || 1));
      if (this.mounted) this.trample(dt);
      this.tickAbilities(dt);
    }
    this.updateBody(dt);
  }

  // pose sent from a client to the host
  poseMsg() {
    const m = { x: r2(this.pos.x), y: r2(this.pos.y), z: r2(this.pos.z), yaw: r2(this.yaw), pitch: r2(this.pitch),
      vx: r2(this.vel.x), vz: r2(this.vel.z), b: this.blocking ? 1 : 0, w: this.weapon === 'bow' ? 1 : 0,
      bd: DIR_IDX[this.blockDir], ba: r2(Math.max(0, this.game.time - this.blockStart)),
      m: this.mounted ? 1 : 0, h: r2(this.heading), rs: r2(this.rideSpeed), dk: this.ducking ? 1 : 0, cl: this.climb ? 1 : 0 };
    if (this.hasHorse && !this.mounted) { m.hx = r2(this.horsePos.x); m.hy = r2(this.horsePos.y); m.hz = r2(this.horsePos.z); m.hyaw = r2(this.horseYaw); }
    return m;
  }

  notify(text, important = false) { this.game.deliver(this, { k: 'toast', text, team: this.team, imp: important }); }
  sound(name) { this.game.deliver(this, { k: 'snd', n: name }); }
  get isLocal() { return this === this.game.player; }
  get netClient() { return this.isLocal && this.game.mode === 'client'; }

  get cls() { return classOf(this.classId); }
  // the class numbers with the level and the talents applied (cached until one of the three changes)
  get mods() {
    if (this._mc !== this.classId || this._ml !== this.level || this._mr !== this.talentRev) {
      this._mc = this.classId; this._ml = this.level; this._mr = this.talentRev;
      this._mods = heroMods(this);
    }
    return this._mods;
  }
  get talentPoints() { return talentPointsFor(this.level) - Object.keys(this.talents).length; }
  get armor() { return PLAYER.armor + this.mods.armor; }
  get dmgMult() { return this.mods.melee * (this.buffs.get('rage') || 1) * (this.hp < this.maxHp * 0.5 ? 1 + (this.mods.bloodied || 0) : 1); }
  get blockPower() { return Math.min(0.97, this.shield.block + (this.mods.block || 0)); }
  get drawTime() { return this.bow.draw * (this.mods.draw || 1) * (this.buffs.has('focus') ? talentFx(this, 'focus', { draw: 1 }).draw : 1); }   // (Hunter's Focus: the first arrow after a roll is drawn at once)
  get sword() { return SWORDS[this.lv.sword]; }
  get shield() { return SHIELDS[this.lv.shield]; }
  get bow() { return BOWS[this.lv.bow]; }
  get meleeDmg() { return this.sword.dmg * this.dmgMult; }
  get bowDmg() { return this.bow.dmg * this.mods.bow; }
  // walking pace: the class, a rallying cry, and being caught mid-whirlwind
  get speedMult() { return this.mods.speed * (this.buffs.get('haste') || 1) * (this.buffs.has('whirl') ? 1 - 0.3 * talentFx(this, 'whirlSlow', 1) : 1); }
  // seconds an ability takes to recharge: the class passive and the talents shorten it
  abilityCd(slot) { const d = this.cls[slot]; return d.cd * (this.mods.cd || 1) * talentFx(this, 'cd_' + d.id, 1); }
  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z); }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  // Choose the hero's class before the battle: health and abilities follow from it.
  setClass(id) {
    this.classId = CLASSES[id] ? id : 'knight';
    this.clearTalents();
    this.maxHp = Math.round(PLAYER.hp * this.mods.hp);
    this.hp = this.maxHp;
    this.abilCd = { q: 0, r: 0 };
    this.buffs.clear();
    if (this.cls.mods.horse && !this.hasHorse) this.giveHorse();
  }

  // In the grounds of your own castle: inside its walls, or just outside them.
  atHome(margin = 14) {
    const c = this.game.castles[this.team];
    return !!c && c.inFootprint(this.pos, margin);
  }

  // Why this hero can't take up another class right now (null when they can). A class is taken up at your own castle
  // (a fallen hero is about to rise at their keep, so they may choose wherever they lie). Before the first wave that
  // is all; after it, not in the middle of a fight and not again straight away.
  classBlock(id) {
    const g = this.game;
    if (!CLASSES[id]) return 'No such class';
    if (g.hero) return 'Your class is chosen before the match';
    if (id === this.classId) return 'Your class';
    if (!this.alive) return null;
    if (!this.atHome()) return 'Only at your own castle';
    if (g.phase === 'prep' && g.round === 0) return null;
    if (this.drive) return 'Climb out of the siege engine first';
    if (g.time - this.lastHurt < SWITCH.combat) return 'Not in the middle of a fight';
    const wait = Math.ceil(SWITCH.cooldown - (g.time - this.classAt));
    return wait > 0 ? `Wait ${wait} s` : null;
  }

  // The class itself and what hangs off it on every screen (the abilities need a moment to ready).
  adoptClass(id) {
    this.classId = id;
    this.clearTalents();
    this.abilCd = { q: SWITCH.ready, r: SWITCH.ready };
    this.dash = null;
    this.castFlash = 0;
    this.cancelAim();
    if (this.body) { this.buildTag(); this.restyleBody(); }
  }

  // Take up another class where the battle is run: health keeps its proportion, buffs end, a Cavalier gets a horse.
  changeClass(id) {
    const g = this.game;
    const frac = this.alive ? this.hp / this.maxHp : 1;
    this.adoptClass(id);
    this.maxHp = Math.round(PLAYER.hp * this.mods.hp);
    this.hp = this.alive ? Math.max(1, Math.round(this.maxHp * frac)) : this.maxHp;
    this.buffs.clear();
    this.classAt = g.phase === 'prep' && g.round === 0 ? -99 : g.time;
    g.abilities.active = g.abilities.active.filter((e) => e.p !== this);   // a whirlwind or charge ends with the class
    if (this.cls.mods.horse && !this.hasHorse) this.giveHorse();
  }

  recalc() {
    const old = this.maxHp;
    this.maxHp = Math.round(PLAYER.hp * this.mods.hp);
    this.hp += this.maxHp - old;
    this.rebuildWeapons();
  }

  // The talents are forgotten (a new class starts a new tree); the points come back with the level.
  clearTalents() {
    if (!Object.keys(this.talents).length) return;
    this.talents = {};
    this.talentRev++;
  }

  // Health follows the level and the talents; the hero keeps the same share of it.
  refreshStats() {
    const frac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.maxHp = Math.round(PLAYER.hp * this.mods.hp);
    this.hp = this.alive ? Math.max(1, Math.round(this.maxHp * frac)) : this.maxHp;
  }

  // Jump straight to a level (the experience that goes with it), for a fresh hero or a test.
  setLevel(n) {
    this.level = Math.max(1, Math.min(MAX_LEVEL, n | 0));
    this.xp = Math.max(this.xp, XP_FOR_LEVEL[this.level]);
    this.refreshStats();
    if (this.body) this.buildTag();
  }

  // Experience, decided where the battle is run. It makes levels: stronger, tougher, and a talent point for each.
  gainXp(n, why = '') {
    const g = this.game;
    if (!g.simulating || !this.alive || !(n > 0)) return;
    if (g.hero) n *= g.hero.xpMult;   // (the Hero Game Mode is short: experience comes quicker)
    this.xp = Math.min(XP_FOR_LEVEL[MAX_LEVEL], this.xp + n);
    if (n >= 0.5) g.deliver(this, { k: 'xp', n: Math.round(n), why });
    while (this.level < MAX_LEVEL && this.xp >= XP_FOR_LEVEL[this.level + 1]) this.levelUp();
  }

  levelUp() {
    this.level++;
    this.refreshStats();
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * LEVEL.heal);
    if (this.body) this.buildTag();
    this.game.onHeroLevel(this);
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
    this.buffs.clear();
    this.abilCd = { q: 0, r: 0 };
    this.dash = null;
    this.drive = null;
    this.climb = null; this.climbing = false; this.climbCd = 0;
    this.duck = 0; this.ducking = false; this.height = BODY.height; this.eye = BODY.eye;
    this.cancelAim();
    this.spawnSeq++;
    if (this.viewModel) this.viewModel.visible = true;
    this.mounted = false;
    this.rideSpeed = 0;
    this.radius = 0.4;
    if (this.cls.mods.horse && !this.hasHorse) this.giveHorse();   // a Cavalier always rides out on a fresh horse (the shop's Items are off for now)
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
    if (!this.hasHorse) { this.notify('You have no horse.'); return; }
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
        const wp = avoidCastles(g, this.horsePos, this.pos, this.horseAvoid || (this.horseAvoid = {}));
        const dx = wp.x - this.horsePos.x, dz = wp.z - this.horsePos.z;
        const dl = Math.hypot(dx, dz) || 1;
        sp = d > 12 ? 11 : 5;
        this.horsePos.x += (dx / dl) * sp * dt;
        this.horsePos.z += (dz / dl) * sp * dt;
        g.physics.resolve(this.horsePos, 0.8, this.horsePos.y, 2.6, this.team, true, true);   // a riderless horse slips past trunks and rocks
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
    const sw = this.sword, ls = this.lv.sword;
    // every sword level is plainly better to look at: longer and wider, then a dark fuller, then gilded steel
    const gilt = new THREE.MeshStandardMaterial({ color: 0xf2e4b4, metalness: 0.95, roughness: 0.2, emissive: 0x3a2a08 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05 + 0.01 * ls, sw.len, 0.012), ls >= 2 ? gilt : steel);
    blade.position.y = 0.12 + sw.len / 2;
    if (ls >= 1) {
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.012, sw.len * 0.78, 0.016), ls >= 2 ? gold : dark);
      fuller.position.y = 0.12 + sw.len * 0.5;
      this.vmSword.add(fuller);
    }
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
    const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, this.lv.bow ? 0.026 : 0.017, 6, false), this.lv.bow ? dark : wood);
    if (this.lv.bow) {   // the war bow has gold tips and a thicker, darker stave
      for (const y of [0.62, -0.62]) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), gold);
        tip.position.set(0, y, 0);
        this.vmBow.add(tip);
      }
    }
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
    // the spell hand comes up while a spell-like ability is cast
    const casting = this.castFlash > 0;
    this.vmMagic.visible = casting;
    if (casting) {
      const k = this.castFlash;
      const reach = Math.sin(Math.min(1, (1 - k) * 3) * Math.PI / 2);   // thrust out, then hold
      this.vmOrbMat.color.setHex(this.castColor);
      this.vmOrb.scale.setScalar((0.04 + 0.05 * reach) * (1 + Math.sin(this.game.time * 30) * 0.08));
      this.vmOrbMat.opacity = 0.9 * Math.min(1, k * 3);
      this.vmMagic.position.set(0.24, -0.3 + 0.03 * reach, -0.48 - 0.12 * reach);
      if (Math.random() < dt * 40) this.game.fx.orb(this.vmOrb.getWorldPosition(new THREE.Vector3()), new THREE.Color(this.castColor), 0.05);
      this.castFlash = Math.max(0, this.castFlash - dt * 2.2);
    }
    const swordMode = this.weapon === 'sword' && !casting;
    this.vmSword.visible = swordMode;
    this.vmShield.visible = swordMode;
    this.vmBow.visible = this.weapon === 'bow' && !casting;
    this.bob += dt * (moving ? (sprint ? 13 : 9) : 2);
    const bobAmt = moving ? (sprint ? 0.03 : 0.018) : 0.004;
    vm.position.set(Math.sin(this.bob * 0.5) * bobAmt, -Math.abs(Math.sin(this.bob)) * bobAmt, 0);
    this.vmDown += ((this.climb ? 1 : 0) - this.vmDown) * Math.min(1, dt * 8);   // out of the way while both hands climb
    vm.position.y -= 0.55 * this.vmDown;

    if (swordMode) {
      const b = this.vmSwordBase;
      const S = this.vmSword;
      S.position.copy(b.pos);
      S.rotation.copy(b.rot);
      const atk = this.atk;
      if (atk) {
        const W = VM_WIND[atk.dir], E = VM_END[atk.dir];
        let from = VM_ZERO, to = W, k;
        if (atk.phase === 'wind') { k = easeOut(Math.min(1, atk.t / 0.09)); }
        else if (atk.phase === 'strike') { from = W; to = E; k = easeOut(Math.min(1, atk.t / 0.09)); }
        else { from = E; to = VM_ZERO; k = easeInOut(Math.min(1, atk.t / 0.2)); }
        applyVm(S, from, to, k);
        if (atk.phase === 'wind' && atk.t > 0.3) S.position.x += (Math.random() - 0.5) * 0.003; // straining a full wind-up
      } else if (this.blocking) {
        // raise the sword out of the way of the shield
        S.position.x += 0.1; S.position.y -= 0.08; S.rotation.z -= 0.3;
      }
      if (this.buffs.has('whirl')) {
        const w = this.game.time * 24;
        S.position.x -= 0.3 + Math.cos(w) * 0.25; S.position.y += 0.1 + Math.sin(w) * 0.1; S.rotation.z += w;
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
      const draw = this.aiming ? Math.min(1, this.aiming.t / 0.4) : Math.min(1, this.drawT / this.drawTime);
      if (this.aiming) { this.vmBow.rotation.x -= 0.3 * draw; this.vmBow.position.y += 0.05 * draw; }   // a lob: the bow tips up
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

    this.tickAbilities(dt);
    // steering a siege engine: the engine moves, the hero only looks around and gives orders
    if (this.drive) { this.updateDrive(dt, input); return; }

    // weapon switching
    if (input.hit('Digit1')) this.setWeapon('sword');
    if (input.hit('Digit2')) this.setWeapon('bow');
    if (m.wheel) this.setWeapon(this.weapon === 'sword' ? 'bow' : 'sword');
    if (input.hit('KeyH')) this.drinkPotion();
    // Q: most abilities go off at once; the Ranger's volley is aimed with a circle (hold it, let go to loose it)
    if (input.hit('KeyQ')) { if (this.cls.q.aimed) this.beginAim('q'); else this.useAbility('q', input); }
    if (input.hit('KeyR')) { this.cancelAim(); this.useAbility('r', input); }

    if (input.hit('KeyE')) {
      const engine = g.engineNear(this);
      if (g.leverNear(this)) g.localToggleGate();
      else if (engine) g.localBoard(engine);
      else this.toggleMount();
    }

    // duck: hold C
    this.setDuck(input.down('KeyC') && !this.mounted && !this.climb, dt);

    // movement (a climb carries the hero up a wall instead)
    let moving = false, sprint = false;
    if (!this.climb && input.hit('Space') && !this.mounted) this.tryClimb();
    if (this.climb) this.updateClimb(dt);
    else ({ moving, sprint } = this.move(dt, input));
    if (this.climbCd > 0) this.climbCd -= dt;
    this.climbing = !!this.climb;
    if ((this.hintT -= dt) <= 0) {
      this.hintT = 0.15;
      this.climbHint = !this.mounted && !this.climb && !this.ducking && this.climbCd <= 0 && this.onGround && this.stamina >= BODY.climbStamina &&
        !!g.physics.ledge(this.pos.x, this.pos.z, this.pos.y, this.radius, Math.sin(this.yaw), Math.cos(this.yaw), BODY.height, this.team);
    }
    if (this.aiming) this.updateAim(dt, input);

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
    } else if (this.climb) {
      this.atk = null; this.blocking = false; this.drawT = 0; this.zoomed = false;
      this.shake = Math.max(this.shake, 0.1);   // hands full: the view judders as you haul yourself up
    } else if (this.weapon === 'sword') {
      if (this.buffs.has('whirl')) { this.atk = null; this.blocking = false; }
      else this.swordInput(dt, m, aimDir);
      this.zoomed = false;
    } else {
      this.blocking = false;
      if (m.left && this.arrows > 0 && !this.aiming) this.drawT += dt;
      if (m.leftReleased && this.drawT > 0) {
        if (this.drawT > 0.15 && this.arrows > 0) this.shoot();
        this.drawT = 0;
      }
      if (!m.left && !m.leftReleased) this.drawT = 0;
      this.zoomed = m.right;
    }
    this.shake = Math.max(0, this.shake - dt);

    // regen when out of combat (the host decides this in online games)
    if (g.mode !== 'client' && g.time - this.lastHurt > 8 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4 * (this.mods.regen || 1));
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);

    // camera
    this.camera.position.set(this.pos.x, this.pos.y + (this.mounted ? HORSE.eye : this.eye), this.pos.z);
    const sk = this.shake * 0.06;
    // (hauling yourself up a wall, the view tips up toward the top of it)
    this.camera.rotation.set(this.pitch + 0.4 * this.vmDown + (Math.random() - 0.5) * sk, this.yaw + Math.PI + (Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk, 'YXZ');
    const fov = this.zoomed ? 42 : this.baseFov;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
    this.updateViewModel(dt, moving && this.onGround, sprint);
  }

  // Walking, riding, jumping and falling for this frame. Returns whether the hero is moving and sprinting (for the
  // weapon bob).
  move(dt, input) {
    const g = this.game;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let moving, sprint = false;
    if (this.mounted) {
      // the horse has momentum and turns toward where you look
      let target = 0;
      sprint = input.down('ShiftLeft') && this.stamina > 5;
      const haste = this.buffs.get('haste') || 1;
      if (input.down('KeyW')) target = (sprint ? HORSE.gallop : HORSE.walk) * haste;
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
      if (input.wish) { mx = input.wish.x; mz = input.wish.z; }   // a bot walks in any direction it likes
      const ml = Math.hypot(mx, mz);
      moving = ml > 0.01;
      sprint = input.down('ShiftLeft') && moving && this.stamina > 5 && !this.blocking && this.drawT === 0 && !this.ducking && !this.aiming;
      let speed = (sprint ? PLAYER.sprint : PLAYER.speed) * this.speedMult;
      if (this.blocking) speed *= 0.55;
      if (this.drawT > 0) speed *= 0.6;
      if (this.aiming) speed *= 0.7;
      speed *= 1 - (1 - BODY.duckSpeed) * this.duck;
      if (sprint) this.stamina = Math.max(0, this.stamina - dt * 18);
      else this.stamina = Math.min(100, this.stamina + dt * (this.blocking ? 6 : 16));
      const tx = moving ? (mx / ml) * speed : 0, tz = moving ? (mz / ml) * speed : 0;
      const acc = this.onGround ? 12 : 2.5;
      this.vel.x += (tx - this.vel.x) * Math.min(1, dt * acc);
      this.vel.z += (tz - this.vel.z) * Math.min(1, dt * acc);
    }

    if (this.dash) {
      const d = this.dash;
      d.t -= dt;
      if (d.t <= 0) this.dash = null;
      else {
        this.vel.x = d.x * d.v; this.vel.z = d.z * d.v;
        if (this.mounted) { this.heading = Math.atan2(d.x, d.z); this.rideSpeed = d.v; }
      }
    }

    if (input.hit('Space') && this.onGround && this.stamina > 8 && !this.mounted && !this.ducking) {
      this.vy = PLAYER.jump;
      this.onGround = false;
      this.stamina -= 8;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const L = WORLD.playHalf;
    this.pos.x = clamp(this.pos.x, -L, L);
    this.pos.z = clamp(this.pos.z, -L, L);
    if (g.physics.resolve(this.pos, this.radius, this.pos.y, this.mounted ? 2.8 : this.height, this.team, this.ghostT > 0, this.ghostT > 0) && this.mounted) {
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
    return { moving, sprint };
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
      if ((!m.left && atk.t >= 0.09) || atk.t > 1.4) {
        atk.charge = Math.max(0, Math.min(1, (atk.t - 0.09) / 0.5));
        atk.phase = 'strike'; atk.t = 0;
        this.struck = false;
        this.swingT = 0.25;
        g.audio.play('swing', this.isBot ? this.pos : null);
      } else this.swingT = Math.min(0.24, atk.t * 1.7);
    } else if (atk.phase === 'strike') {
      this.swingT = 0.25 + atk.t * 0.75;
      if (!this.struck && atk.t >= 0.05) { this.struck = true; this.meleeStrike(atk.dir, atk.charge); }
      if (atk.t >= 0.16) { atk.phase = 'recover'; atk.t = 0; }
    } else {
      this.swingT = 0.4 + atk.t * 0.88;
      if (atk.t >= 0.2) { this.atk = null; this.swingT = -1; }
    }
  }

  // knocked off balance (e.g. your blow was parried)
  stagger(sec) {
    if (this.buffs.has('steady')) return;
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

  setWeapon(w) {
    if (w !== 'bow') this.cancelAim();   // the volley is loosed with the bow
    if (this.weapon === w) return;
    this.weapon = w;
    this.swingT = -1;
    this.atk = null;
    this.drawT = 0;
  }

  // ---------- ducking and climbing ----------
  // Hold C to duck: the head drops, the hitbox shrinks (arrows fly over it and a merlon covers it) and you slow down.
  setDuck(on, dt) {
    this.ducking = on;
    const want = on ? 1 : 0;
    this.duck += (want - this.duck) * Math.min(1, dt * 12);
    if (Math.abs(this.duck - want) < 0.01) this.duck = want;
    this.height = BODY.height - (BODY.height - BODY.duckHeight) * this.duck;
    this.eye = BODY.eye - (BODY.eye - BODY.duckEye) * this.duck;
  }

  // Jump at a castle wall from outside and the hero scrambles up it: about a second and some stamina, and then they
  // stand on the wall walk. Returns whether a climb began (false: nothing to climb, so the jump goes ahead).
  tryClimb() {
    const g = this.game;
    if (this.mounted || this.drive || this.climb || this.climbCd > 0 || this.staggerT > 0 || this.ducking) return false;
    const ground = g.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (!this.onGround && this.pos.y - ground > 2.2) return false;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const l = g.physics.ledge(this.pos.x, this.pos.z, this.pos.y, this.radius, fx, fz, BODY.height, this.team);
    if (!l) {
      // somebody else's wall: say why the jump does nothing (not every time)
      if (g.time - this.climbMsgAt > 4) {
        const other = g.physics.ledge(this.pos.x, this.pos.z, this.pos.y, this.radius, fx, fz, BODY.height, null);
        if (other && other.owner !== this.team) { this.climbMsgAt = g.time; this.notify('You can only climb the walls of your own castle.'); }
      }
      return false;
    }
    if (this.stamina < BODY.climbStamina) { this.notify('Too tired to climb.'); this.sound('deny'); return true; }
    this.stamina -= BODY.climbStamina;
    this.climb = { t: 0, dur: 0.5 + (l.top - this.pos.y) * 0.08, x0: this.pos.x, y0: this.pos.y, z0: this.pos.z,
      hx: l.hang.x, hz: l.hang.z, lx: l.land.x, lz: l.land.z, top: l.top, puff: 0 };
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.onGround = false;
    this.dash = null;
    this.cancelAim();
    g.audio.play('thud', this.pos);
    return true;
  }

  // In to the foot of the wall, up its face, then over the edge and onto the top.
  updateClimb(dt) {
    const g = this.game, c = this.climb;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const ease = (v) => v * v * (3 - 2 * v);
    const peak = c.top + 0.35;
    const slide = ease(Math.min(1, c.t / 0.18));
    const up = ease(Math.min(1, k / 0.82));
    let x = c.x0 + (c.hx - c.x0) * slide, z = c.z0 + (c.hz - c.z0) * slide;
    let y = c.y0 + (peak - c.y0) * up;
    if (k > 0.82) {
      const o = ease((k - 0.82) / 0.18);
      x = c.hx + (c.lx - c.hx) * o; z = c.hz + (c.lz - c.hz) * o;
      y = peak + (c.top - peak) * o;
    }
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    if ((c.puff -= dt) <= 0 && k < 0.85) {   // scrabbling at the stone
      c.puff = 0.16;
      g.fx.dust(new THREE.Vector3(c.hx, y - 0.4, c.hz), 2, 0.35);
    }
    if (k >= 1) {
      this.pos.set(c.lx, c.top, c.lz);
      this.vy = 0;
      this.onGround = true;
      this.climb = null;
      this.climbCd = BODY.climbCooldown;
      g.audio.play('thud', this.pos);
    }
  }

  // ---------- placing the Ranger's volley ----------
  // Hold Q: a circle on the ground follows the crosshair. Let go and the volley is loosed at it.
  beginAim(slot) {
    const g = this.game;
    if (!this.alive || this.drive || this.climb || this.aiming) return;
    if (this.staggerT > 0 || this.abilCd[slot] > 0) { g.audio.play('deny'); return; }
    this.aiming = { slot, t: 0, at: new THREE.Vector3(), far: false };
    this.setWeapon('bow');
  }

  updateAim(dt, input) {
    const g = this.game, a = this.aiming;
    if (!this.alive || this.drive || this.climb || this.staggerT > 0 || this.abilCd[a.slot] > 0 || this.cls.q.id !== 'volley') { this.cancelAim(); return; }
    a.t += dt;
    const eyePos = new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
    const r = g.abilities.aimPoint(eyePos, this.lookDir(), VOLLEY.range, this.team);
    a.at.copy(r.pos);
    a.far = r.far;
    g.aimRing.show(a.at, VOLLEY.radius * talentFx(this, 'volleyRadius', 1), a.far, a.t);
    if (input.release('KeyQ')) {
      const at = a.at.clone();
      this.cancelAim();
      this.useAbility(a.slot, input, at);
    } else if (!input.down('KeyQ')) this.cancelAim();   // the menu opened or the window lost focus: never loose a volley by accident
  }

  cancelAim() {
    if (!this.aiming) return;
    this.aiming = null;
    if (this.isLocal && this.game.aimRing) this.game.aimRing.hide();
  }

  // ---------- class abilities ----------
  tickAbilities(dt) {
    this.abilCd.q = Math.max(0, this.abilCd.q - dt);
    this.abilCd.r = Math.max(0, this.abilCd.r - dt);
    this.buffs.update(dt);
  }

  // Press Q (attack) or R (defence). The movement part happens here on your own screen at once; the rest is
  // worked out by whoever runs the battle.
  useAbility(slot, input, at = null) {
    const g = this.game;
    const def = this.cls[slot];
    if (!def || !this.alive || this.drive) return;
    if (this.staggerT > 0) { g.audio.play('deny'); return; }
    const again = def.id === 'evade' && this.buffs.has('twin');   // Twin Roll: one more roll while the first one's window is open
    if (this.abilCd[slot] > 0 && !again) { g.audio.play('deny'); return; }
    const dir = this.lookDir();
    const fl = Math.hypot(dir.x, dir.z) || 1;
    const fx = dir.x / fl, fz = dir.z / fl;
    switch (def.id) {
      case 'bash': this.dash = { x: fx, z: fz, v: 15, t: 0.25 }; break;
      case 'lancecharge': this.dash = { x: fx, z: fz, v: this.mounted ? 20 : 13, t: 1.1 * talentFx(this, 'chargeTime', 1) }; break;
      case 'evade': {
        // the way you are moving, or straight back when standing still
        let mx = 0, mz = 0;
        const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
        if (input.down('KeyW')) { mx += sx; mz += sz; }
        if (input.down('KeyS')) { mx -= sx; mz -= sz; }
        if (input.down('KeyA')) { mx += sz; mz -= sx; }
        if (input.down('KeyD')) { mx -= sz; mz += sx; }
        const ml = Math.hypot(mx, mz);
        if (ml < 0.01) { mx = -sx; mz = -sz; } else { mx /= ml; mz /= ml; }
        this.dash = { x: mx, z: mz, v: 32, t: 0.28 };
        break;
      }
      case 'fireball': this.castFlash = 1; this.castColor = 0xff8a2a; break;
      case 'smite': this.castFlash = 1; this.castColor = 0xffe9a0; break;
      case 'heal': this.castFlash = 1; this.castColor = 0x9affa0; break;
      case 'ward': this.castFlash = 1; this.castColor = 0x9fe0ff; break;
      default: break;
    }
    const cam = this.camera ? this.camera.position.clone() : this.eyePos();
    if (this.netClient) {
      if (again) this.buffs.del('twin'); else this.abilCd[slot] = this.abilityCd(slot);
      const msg = { a: 'abil', s: slot, f: [cam.x, cam.y, cam.z].map(r2), d: [dir.x, dir.y, dir.z].map((x) => Math.round(x * 1e4) / 1e4), m: this.mounted ? 1 : 0 };
      if (at) msg.at = [at.x, at.y, at.z].map(r2);
      g.net.toHost(msg);
      return;
    }
    if (!g.abilities.use(this, slot, cam, dir, at)) { this.dash = null; this.castFlash = 0; }   // (use() starts the cooldown)
  }

  // ---------- steering a siege engine ----------
  beginDrive(e) {
    this.drive = e;
    this.atk = null; this.blocking = false; this.drawT = 0; this.dash = null; this.zoomed = false;
    this.climb = null; this.climbing = false; this.climbHint = false;
    this.cancelAim();
    this.setDuck(false, 1);
    this.swingT = -1;
    this.vel.set(0, 0, 0);
    this.driveInput = null;
    this.yaw = e.yaw;      // look the way the engine faces
    this.pitch = 0.12;
    if (this.viewModel) this.viewModel.visible = false;
  }

  // Climb out: step down behind the engine (everyone works this out for themselves, since each screen moves its own hero).
  endDrive() {
    const e = this.drive;
    this.drive = null;
    this.driveInput = null;
    if (this.viewModel) this.viewModel.visible = true;
    if (!e) return;
    const g = this.game;
    this.pos.set(e.pos.x - Math.sin(e.yaw) * 4, e.pos.y, e.pos.z - Math.cos(e.yaw) * 4);
    g.physics.resolve(this.pos, this.radius, this.pos.y, this.height, this.team);
    this.pos.y = g.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y + 2);
    this.vel.set(0, 0, 0);
  }

  // The hero looks around from behind the engine; W/S roll it, A/D turn it, the left button batters (ram) or looses
  // a boulder at the spot under the crosshair (catapult), E climbs out.
  updateDrive(dt, input) {
    const g = this.game, e = this.drive, m = input.mouse;
    if (input.hit('KeyE')) {
      g.localLeave();
      if (!this.drive) return;   // climbed out (a guest waits for the host to confirm)
    }
    const inp = { f: 0, t: 0, fire: !!m.left };
    if (input.down('KeyW')) inp.f += 1;
    if (input.down('KeyS')) inp.f -= 1;
    if (input.down('KeyA')) inp.t += 1;
    if (input.down('KeyD')) inp.t -= 1;
    this.yaw += inp.t * ENGINE_TURN * dt;   // the view turns with the engine
    const dir = this.lookDir();
    const pivot = new THREE.Vector3(e.pos.x, e.pos.y + (e.type === 'ram' ? 3.4 : 4.2), e.pos.z);
    const cam = pivot.clone().addScaledVector(dir, -9);
    cam.y = Math.max(cam.y, g.physics.terrainHeight(cam.x, cam.z) + 0.8);
    this.camera.position.copy(cam);
    this.camera.rotation.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
    if (Math.abs(this.camera.fov - this.baseFov) > 0.1) {
      this.camera.fov += (this.baseFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
    inp.cam = cam;
    inp.dir = dir;
    this.driveInput = inp;
    this.pos.set(e.pos.x, e.pos.y + 1, e.pos.z);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    if (g.simulating) e.input = inp;
  }

  driveMsg() {
    const i = this.driveInput || { f: 0, t: 0, fire: false };
    const m = { f: i.f, t: i.t, fire: i.fire ? 1 : 0 };
    if (i.cam) {
      m.c = [i.cam.x, i.cam.y, i.cam.z].map(r2);
      m.d = [i.dir.x, i.dir.y, i.dir.z].map((x) => Math.round(x * 1e4) / 1e4);
    }
    return m;
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
      if (!u.alive || allied(u.team, this.team) || u === this) return;
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
          if (allied(c.team, this.team) || c.fallen) continue;
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
    const draw = Math.min(1, this.drawT / this.drawTime);
    const dir = this.lookDir();
    const from = (this.camera ? this.camera.position.clone() : this.eyePos()).addScaledVector(dir, 0.6);
    from.y -= 0.08;
    const wobble = (1 - draw) * 0.04 + (this.zoomed ? 0 : 0.006);
    dir.x += (Math.random() - 0.5) * wobble; dir.y += (Math.random() - 0.5) * wobble; dir.z += (Math.random() - 0.5) * wobble;
    dir.normalize();
    this.game.audio.play('bow', this.isBot ? this.pos : null);
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
    const focus = this.buffs.get('focus');   // Hunter's Focus: the first arrow after a roll hits harder
    if (focus) this.buffs.del('focus');
    this.game.projectiles.fireArrow(from, dir.clone().multiplyScalar(speed), this.team, this.bowDmg * (0.4 + 0.6 * draw) * (focus || 1), this);
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
      if (!u.alive || allied(u.team, this.team) || u.isPlayer || u.mounted || this.trampled.has(u)) return;
      const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.6 || (dx * fx + dz * fz) / (d || 1) < 0.3) return;
      this.trampled.set(u, 0.8);
      g.damage(u, (6 + sp * 1.6) * (this.mods.trample || 1), this, { melee: true });
      u.vel.x += fx * 6; u.vel.z += fz * 6;
      this.rideSpeed *= 0.85;
    });
  }

  takeDamage(amount, attacker, info = {}) {
    if (!this.alive) return;
    if (this.buffs.has('ghost')) return;              // mid-roll: nothing touches you
    const reflect = this.buffs.get('reflect');        // Avenging Wall (Knight talent): part of a melee blow is dealt back
    if (reflect && info.melee && attacker && attacker !== this && attacker.alive) this.game.damage(attacker, amount * reflect, this, { magic: true, splash: true });
    const guard = this.buffs.get('guard');
    if (guard) amount *= guard;
    if (this.buffs.has('ward')) {
      amount = this.buffs.absorb(amount);
      this.game.fx.frost(this.chest(new THREE.Vector3()), 6);
      if (!this.buffs.has('ward')) this.game.abilities.shatter(this);   // the ward broke (Mage talent)
      if (amount <= 0) return;
    }
    if (info.melee && amount > this.maxHp * 0.15) this.stagger(0.25);
    if (this.mounted) {
      // the horse takes half the blows
      this.horseHp -= amount * 0.5;
      amount *= 0.5 * (this.mods.rider || 1);
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
      this.climb = null; this.climbing = false; this.climbHint = false;
      this.cancelAim();
      if (this.viewModel) this.viewModel.visible = false;
      if (this.mounted) { this.mounted = false; this.horsePos.copy(this.pos); this.horseYaw = this.heading; this.rideSpeed = 0; this.radius = 0.4; }
      this.game.onPlayerKilled(attacker, this);
    }
  }
}

const r2 = (x) => Math.round(x * 100) / 100;
const INTERP_SAMPLE = { x: 0, y: 0, z: 0, yaw: 0, extra: 0 };

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
