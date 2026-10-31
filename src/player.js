// The hero: first-person movement, sword & shield, bow, class abilities, potions, and the view-model.
import * as THREE from 'three';
import { PLAYER, WORLD, TEAM_COLORS, PLAYER_TEAM, ENGINE_TURN, BODY, VOLLEY } from './config.js';
import { STEP } from './physics.js';
import { clamp } from './noise.js';
import { buildHorse, poseHorse, buildHeroBody, poseSoldier, rigSetBow, SADDLE_Y } from './models.js';
import { avoidCastles } from './nav.js';
import { SWING, SWING_CYCLE, DIRS, DIR_IDX } from './combat.js';
import { allied } from './teams.js';
import { CLASSES, classOf, Buffs, SWITCH, RANGER, LEAP, RUSH, abilityOf } from './classes.js';
import { heroMods, talentPointsFor, MAX_LEVEL, XP_FOR_LEVEL, LEVEL } from './heroes.js';
import { talentFx } from './talents.js';
import { HeroBot } from './herobot.js';
import { mods as rules } from './mods.js';
import { rules as biomeRules } from './biometwist.js';
import { ViewModel } from './viewmodel.js';
import { matchlog } from './matchlog.js';
import { blankStats } from './stats.js';
import { sanitizeLoadout, noLoadout } from './progress.js';
import { CLOAKS } from './unlocks.js';

// the rule modifier `heroSpeed` (a Battle Decree), read from the rules only when they change
let walkVer = -1, walkM = 1;
const walkMul = () => { if (walkVer !== rules.version) { walkVer = rules.version; walkM = rules.mul('heroSpeed'); } return walkM; };

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
    this.climbHint = false;    // a wall is right in front and a jump would climb it: 'own' or 'foe' (for the on-screen prompt)
    this.climbTop = false;     // ...and it is the top of the battlements (a mantle from the wall walk), not the wall walk
    this.hintT = 0;
    this.vmDown = 0;           // how far the weapons are lowered (while climbing)
    this.aiming = null;        // holding a key to place an ability on the ground (the Ranger's volley, the Berserker's Leap): { slot, t, at, far }
    this.power = null;         // the Ranger's Power Shot being drawn: { t } (it looses itself when the draw is full: tickPower)
    this.scope = null;         // the Ranger's Sniper Shot: the bow at the eye while R is held, { t } (tickScope)
    this.swayX = 0; this.swayY = 0;   // ... and how far the scope has swayed off where the hero looks (radians: yaw, pitch)
    this.leap = null;          // the Berserker in the air: the plan of his Leap (Abilities.leapPlan) and its clock t
    this.arrowT = 0;           // the Ranger's quiver filling again (RANGER.arrowEvery)
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
    this.bowT = -1;            // ... and with the bow: drawing (0..0.42 as the string comes back), then the loose and its follow-through (0.55..0.9)
    this.netDraw = 0;          // how far a guest's bow is drawn (from his pose messages, on the host)
    this.struck = false;
    this.blocking = false;
    // melee: left click swings, right click guards in front (combat.js)
    this.atkDir = 'right';
    this.attackDir = 'right';   // how the current swing looks (the swings take turns; nobody chooses)
    this.swingN = 0;
    this.atk = null;            // { dir, phase: 'wind' | 'strike' | 'recover', t }
    this.blockDir = 'right';    // (kept for the network snapshot; a guard covers the front whatever this is)
    this.blockStart = -99;
    this.staggerT = 0;
    this.shake = 0;
    this.drawT = 0;
    this.lastHurt = -99;
    this.kills = 0;
    this.deaths = 0;
    this.st = blankStats();    // what the end screen counts about this hero (stats.js)
    this.bwave = null;         // the Bulwark that is storing the blows taken, for Bastion Strike (classes.js)
    this.cos = opts.cos ? sanitizeLoadout(opts.cos) : noLoadout();   // what the account behind this hero wears and has earned (progress.js)
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
    const cloak = CLOAKS.find((c) => c.id === this.cos.cloak);   // (the cloak the account behind this hero wears, if any)
    this.body = buildHeroBody(this.classId, this.team, 2, cloak ? cloak.shape : null, this.armsCell ?? -1);   // (the arms the account bears: heraldry.js)
    this.bodyClass = this.classId;
    this.bodyCloak = this.cos.cloak;
    this.game.scene.add(this.body.root);
    this.buildTag();
  }

  // (another class: a new look)
  restyleBody() {
    if (!this.body || (this.bodyClass === this.classId && this.bodyCloak === this.cos.cloak)) return;
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
    // the bow's clock (models.js drawPose): the string comes back as the hero draws; let go well drawn, the loose plays out
    const draw = this.weapon !== 'bow' ? 0 : this.drawT > 0 ? Math.min(1, this.drawT / this.drawTime) : this.netDraw;
    if (draw > 0) this.bowT = 0.42 * draw;
    else if (this.bowT >= 0) {
      if (this.bowT < 0.55) this.bowT = this.bowT > 0.25 ? 0.55 : -1;
      else if ((this.bowT += dt) > 0.9) this.bowT = -1;
    }
    if (this.weapon !== 'bow') this.bowT = -1;
    poseSoldier(b, { phase: this.mounted && this.horse ? this.horse.phase : this.walkPhase, speed: sp, moving: sp > 0.3, swingT: this.weapon === 'bow' && this.bowT >= 0 ? this.bowT : this.swingT, attackDir: this.attackDir, stagger: this.staggerT > 0 ? 1 : 0, mounted: this.mounted, blocking: this.blocking, crouch: this.duck, climb: this.climbing, time: this.game.time, idle: this.game.time + this.team * 1.7, look: 0 });
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
      this.blocking = !!n.b;
      this.weapon = n.w ? 'bow' : 'sword';
      this.netDraw = n.w ? Math.max(0, Math.min(1, +n.dr || 0)) : 0;
      this.mounted = !!n.m && this.hasHorse;
      this.radius = this.mounted ? 0.8 : 0.4;
      this.climbing = !!n.cl;
      this.setDuck(!!n.dk && !this.mounted, dt);
      this.heading = interpolated && n.m ? s.yaw : n.h;
      this.rideSpeed = n.rs;
      if (!this.mounted && n.hx !== undefined) { this.horsePos.set(n.hx, n.hy, n.hz); this.horseYaw = n.hyaw; }
    }
    if (this.swingT >= 0) { this.swingT += dt; if (this.swingT > (this.weapon === 'bow' ? 0.9 : 0.62)) this.swingT = -1; }   // (a bow's shot clock runs longer)
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.game.mode !== 'client' && this.alive) {
      if (this.game.time - this.lastHurt > 8 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4 * (this.mods.regen || 1));
      // (blocks on the shield cost stamina here, where the battle is run: it comes back as it does on the guest's own screen)
      this.stamina = Math.min(100, this.stamina + dt * (this.blocking ? 6 : 16) * biomeRules().regen);
      if (this.mounted) this.trample(dt);
      this.tickAbilities(dt);
    }
    this.updateBody(dt);
  }

  // pose sent from a client to the host
  poseMsg() {
    const m = { x: r2(this.pos.x), y: r2(this.pos.y), z: r2(this.pos.z), yaw: r2(this.yaw), pitch: r2(this.pitch),
      vx: r2(this.vel.x), vz: r2(this.vel.z), b: this.blocking ? 1 : 0, w: this.weapon === 'bow' ? 1 : 0,
      ba: r2(Math.max(0, this.game.time - this.blockStart)),
      m: this.mounted ? 1 : 0, h: r2(this.heading), rs: r2(this.rideSpeed), dk: this.ducking ? 1 : 0, cl: this.climb ? 1 : 0 };
    if (this.weapon === 'bow' && this.drawT > 0) m.dr = r2(Math.min(1, this.drawT / this.drawTime));   // (so the others see the bow drawn)
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
  get drawTime() { return this.bow.draw * (this.mods.draw || 1) * (this.zoomed ? talentFx(this, 'zoomDraw', 1) : 1); }   // (Steady Aim, a Ranger talent: quicker zoomed in)
  get sword() { return SWORDS[this.lv.sword]; }
  get shield() { return SHIELDS[this.lv.shield]; }
  get bow() { return BOWS[this.lv.bow]; }
  get meleeDmg() { return this.sword.dmg * this.dmgMult; }
  get bowDmg() { return this.bow.dmg * this.mods.bow; }
  // walking pace: the class, a rallying cry, and being caught mid-whirlwind
  get speedMult() { return walkMul() * this.mods.speed * (this.buffs.get('haste') || 1) * (this.buffs.has('whirl') ? 1 - 0.3 * talentFx(this, 'whirlSlow', 1) : 1); }
  // seconds an ability takes to recharge: the class passive and the talents shorten it
  abilityCd(slot) { const d = abilityOf(this, slot); return d.cd * (this.mods.cd || 1) * talentFx(this, 'cd_' + d.id, 1); }
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
    if (this.isLocal && id !== this.classId) matchlog.record('class', { cls: id, from: this.classId });   // (class mastery is shared by the time spent in each)
    this.classId = id;
    this.bwave = null;
    this.clearTalents();
    this.abilCd = { q: SWITCH.ready, r: SWITCH.ready };
    this.dash = null; this.leap = null;
    this.castFlash = 0;
    this.cancelAim(); this.endScope();
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
    this.dash = null; this.leap = null;
    this.drive = null;
    this.climb = null; this.climbing = false; this.climbCd = 0;
    this.duck = 0; this.ducking = false; this.height = BODY.height; this.eye = BODY.eye;
    this.cancelAim(); this.endScope();
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
  // The first-person arms, weapons and their motion live in viewmodel.js (built per class, level and house; moved by this hero's combat state).
  buildViewModel() {
    this.vm = new ViewModel(this);
    this.viewModel = this.vm.root;
  }

  rebuildWeapons() {
    if (this.vm) this.vm.dirty = true;
  }

  updateViewModel(dt, moving, sprint) {
    this.vm.update(dt, moving, sprint);
  }

  // ---------- per-frame ----------
  // moveDt: the step for walking, jumping and climbing (the game's dt without a hit-stop: see Game.update)
  update(dt, input, moveDt = dt) {
    const g = this.game;
    if (!this.alive) return;
    const m = input.mouse;

    // look
    // (zoomed in, the mouse turns the view less: through the Sniper Shot's scope, in step with how narrow the view is)
    const look = this.sensitivity * (this.scope ? Math.max(0.08, this.camera.fov / this.baseFov) : this.zoomed ? 0.5 : 1);
    this.yaw -= m.dx * look;
    this.pitch = clamp(this.pitch - m.dy * look, -1.45, 1.45);

    this.tickAbilities(dt);
    // steering a siege engine: the engine moves, the hero only looks around and gives orders
    if (this.drive) { this.updateDrive(dt, input); return; }

    // weapon switching
    // (War Mode: 1 to 4 choose a group on the command bar, warui.js; the wheel or X switch the weapon there)
    const warKeys = !!this.game.war;
    if (!warKeys && input.hit('Digit1')) this.setWeapon('sword');
    if (!warKeys && input.hit('Digit2')) this.setWeapon('bow');
    if (m.wheel || (warKeys && input.hit('KeyX'))) this.setWeapon(this.weapon === 'sword' ? 'bow' : 'sword');
    if (input.hit('KeyH')) this.drinkPotion();
    // Q and R: most abilities go off at once; the Ranger's volley and the Berserker's Leap are aimed with a circle (hold the key, let
    // go to loose it), and the Ranger's Sniper Shot is a scope held on R (let go, or click, to loose)
    if (input.hit('KeyQ')) {
      this.endScope();
      if (this.dash && this.dash.rush) { this.dash = null; if (this.mounted) this.rideSpeed = Math.min(this.rideSpeed, HORSE.walk); }   // (Q again: the Knight bashes where he is, the Cavalier reins in: Abilities.rushOver)
      else if (this.aiming) this.cancelAim();   // (Q calls off a Leap being aimed with R)
      else if (abilityOf(this, 'q').aimed) this.beginAim('q'); else this.useAbility('q', input);
    }
    if (input.hit('KeyR')) {
      const r = abilityOf(this, 'r');
      this.cancelAim();
      if (r.aimed) this.beginAim('r'); else if (r.id === 'snipe') this.beginScope(); else this.useAbility('r', input);
    }

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
    if (this.climb) this.updateClimb(moveDt);
    else ({ moving, sprint } = this.move(moveDt, input));
    if (this.climbCd > 0) this.climbCd -= dt;
    this.climbing = !!this.climb;
    if ((this.hintT -= dt) <= 0) {
      this.hintT = 0.15;
      // (the prompt: 'own' when a jump would climb one of your own side's walls now; an enemy's walls are never climbed)
      const l = !this.mounted && !this.climb && !this.ducking && this.climbCd <= 0 && this.onGround &&
        g.physics.ledge(this.pos.x, this.pos.z, this.pos.y, this.radius, Math.sin(this.yaw), Math.cos(this.yaw), BODY.height, this.team);
      this.climbHint = l && this.stamina >= this.climbCost(l) ? 'own' : false;
      this.climbTop = !!(l && l.low);   // (the prompt says where to: the wall walk, or the top of the battlements)
    }
    if (this.aiming) this.updateAim(dt, input);
    // a guest's Shield Bash run or Lance Charge has ended on its own screen (the foe, Q again, the end): the host bashes or reins in there
    const rushing = !!(this.dash && this.dash.rush);
    if (this.wasRush && !rushing && this.netClient) g.net.toHost({ a: 'rushEnd' });
    this.wasRush = rushing;

    // combat
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
      else this.swordInput(dt, m);
      this.zoomed = false;
    } else if (this.power) {
      this.blocking = false;   // (Power Shot: the bow is held at full draw until it looses itself, tickPower)
    } else if (this.scope) {
      this.blocking = false; this.zoomed = false;   // (Sniper Shot: the bow is at the eye, drawn and loosed by tickScope)
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
    this.tickPower(dt);
    if (this.scope) this.tickScope(dt, input.down('KeyR'), m.leftPressed);

    // regen when out of combat (the host decides this in online games)
    if (g.mode !== 'client' && g.time - this.lastHurt > 8 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4 * (this.mods.regen || 1));
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);

    // camera
    this.camera.position.set(this.pos.x, this.pos.y + (this.mounted ? HORSE.eye : this.eye), this.pos.z);
    const sk = this.shake * 0.06;
    // (hauling yourself up a wall, the view tips up toward the top of it)
    // (the Sniper Shot's scope sways the view: swayX, swayY, the same offsets the arrow is loosed along)
    this.camera.rotation.set(this.pitch + this.swayY + 0.4 * this.vmDown + (Math.random() - 0.5) * sk, this.yaw + this.swayX + Math.PI + (Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk, 'YXZ');
    const fov = this.scope ? this.scopeFov : this.zoomed ? 42 : this.baseFov;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * (this.scope ? 1 / RANGER.snipe.zoomT * 3 : 10));
      this.camera.updateProjectionMatrix();
    }
    this.showScope(!!this.scope && this.camera.fov < this.baseFov * 0.45);
    this.updateViewModel(dt, moving && this.onGround, sprint);
  }

  // Walking, riding, jumping and falling for this frame. Returns whether the hero is moving and sprinting (for the
  // weapon bob).
  move(dt, input) {
    const g = this.game;
    if (this.leap) { this.flyLeap(dt); return { moving: false, sprint: false }; }
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
      if (sprint && this.rideSpeed > HORSE.walk) this.stamina = Math.max(0, this.stamina - dt * 9 * biomeRules().drain);
      else this.stamina = Math.min(100, this.stamina + dt * 14 * biomeRules().regen);
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
      if (sprint) this.stamina = Math.max(0, this.stamina - dt * 18 * biomeRules().drain);   // (the heat of the desert drains it faster and slows its return: biometwist.js)
      else this.stamina = Math.min(100, this.stamina + dt * (this.blocking ? 6 : 16) * biomeRules().regen);
      const tx = moving ? (mx / ml) * speed : 0, tz = moving ? (mz / ml) * speed : 0;
      // (the same approach to the walking speed at any frame rate: per 60th of a second it closes 20% of the gap on the ground, 4% in
      // the air, as it always did at 60 fps; a fixed share per frame made a start or a stop uneven when the frames were)
      const keep = this.onGround ? 0.8 : 0.9583;
      const k = 1 - Math.pow(keep, dt * 60);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
    }

    if (this.dash && this.dash.rush === 'bash' && this.foeAhead(this.dash)) { this.dash = null; if (this.mounted) this.rideSpeed = Math.min(this.rideSpeed, HORSE.walk); }   // (the run ends against the first foe)
    if (this.dash) {
      const d = this.dash;
      d.t -= dt;
      if (d.t <= 0) { this.dash = null; if (d.rush && this.mounted) this.rideSpeed = Math.min(this.rideSpeed, HORSE.walk); }   // (the horse is reined in at the end of a run)
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

    // vertical (integrated exactly over the step, so a jump reaches the same height at any frame rate: it used to lose a few
    // centimetres at 60 fps and more at 30)
    let ny = this.pos.y + this.vy * dt - 0.5 * WORLD.gravity * dt * dt;
    this.vy -= WORLD.gravity * dt;
    const ground = g.physics.groundHeight(this.pos.x, this.pos.z, Math.max(this.pos.y, ny), this.mounted ? undefined : this.team);   // (a hero on foot may stand on their own merlons)
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

  // Left click swings (held, the hero keeps swinging); right click raises the shield in front (it drops a swing that is
  // still winding up). The swings take turns between a few looks (SWING_CYCLE): the player never picks a direction.
  swordInput(dt, m) {
    const g = this.game;
    let atk = this.atk;
    if (m.right && (!atk || atk.phase !== 'strike')) {
      if (!this.blocking) this.blockStart = g.time;   // raising the guard opens a parry window
      this.blocking = true;
      if (atk) { this.atk = atk = null; this.swingT = -1; }
    } else this.blocking = false;
    if (this.blocking) return;

    if (!atk && (m.leftPressed || m.left) && this.stamina > 4) {
      const dir = SWING_CYCLE[this.swingN++ % SWING_CYCLE.length];
      this.atk = atk = { dir, phase: 'wind', t: 0 };
      this.atkDir = dir;
      this.attackDir = dir;
      this.stamina -= 6;
      this.swingT = 0;
      if (this.netClient) g.net.toHost({ a: 'swing', d: DIR_IDX[dir] });
    }
    if (!atk) return;
    atk.t += dt;
    if (atk.phase === 'wind') {
      if (atk.t >= SWING.wind) {
        atk.phase = 'strike'; atk.t = 0;
        this.struck = false;
        this.swingT = 0.25;
        g.audio.play('swing', this.isBot ? this.pos : null);
      } else this.swingT = 0.24 * atk.t / SWING.wind;
    } else if (atk.phase === 'strike') {
      this.swingT = 0.25 + atk.t * 0.75;
      if (!this.struck && atk.t >= 0.05) { this.struck = true; this.meleeStrike(atk.dir); }
      if (atk.t >= SWING.strike) { atk.phase = 'recover'; atk.t = 0; }
    } else {
      this.swingT = 0.4 + atk.t * 0.88;
      if (atk.t >= SWING.recover) { this.atk = null; this.swingT = -1; }
    }
  }

  // knocked off balance (e.g. your blow was parried)
  stagger(sec) {
    if (this.buffs.has('steady')) return;
    if (this.climb && this.climb.t < this.climb.dur * 0.82) this.fallFromClimb();   // (a heavy blow knocks a climber off; once over the top he is safe)
    this.staggerT = Math.max(this.staggerT, sec);
    this.atk = null;
    this.swingT = -1;
    this.blocking = false;
    if (this.isLocal) this.shake = Math.max(this.shake, 0.35);
    else if (this.game.mode === 'host') this.game.deliver(this, { k: 'stagger', t: sec });
  }

  // feedback when your blow lands
  onHitLanded(heavy) {
    if (this.vm) this.vm.struck(heavy);
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

  climbCost(l) { return Math.round(BODY.climbStamina * (l.low ? BODY.mantleShare : 1)); }

  // Jump at a castle wall and the hero scrambles up it and mantles over the battlements through a crenel onto the wall walk
  // (or, from the courtyard, up onto the edge of the walk; from the walk, up onto the top of a merlon). Only your own side's
  // walls (yours, an ally's): an enemy castle is taken through its gate or a breach, never over its walls, so a jump at
  // one is just a jump (and a word that it cannot be climbed). It takes about a second and some stamina, and a heavy blow
  // knocks the climber off (see stagger). Returns whether a climb began (false: nothing to climb, so the jump goes ahead).
  tryClimb() {
    const g = this.game;
    if (this.mounted || this.drive || this.climb || this.leap || this.climbCd > 0 || this.staggerT > 0 || this.ducking) return false;
    const ground = g.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (!this.onGround && this.pos.y - ground > 2.2) return false;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const l = g.physics.ledge(this.pos.x, this.pos.z, this.pos.y, this.radius, fx, fz, BODY.height, this.team);
    if (!l) {
      // an enemy's wall right there: say why nothing happens (not every jump: once in a while)
      if (g.time > (this.noClimbAt || 0) && g.physics.ledge(this.pos.x, this.pos.z, this.pos.y, this.radius, fx, fz, BODY.height, null)) {
        this.noClimbAt = g.time + 4;
        if (this.isLocal) this.notify('Enemy walls cannot be climbed: take the gate or a breach.');
      }
      return false;
    }
    const cost = this.climbCost(l);
    if (this.stamina < cost) { this.notify('Too tired to climb.'); this.sound('deny'); return true; }
    this.stamina -= cost;
    const dur = l.low ? BODY.mantleTime : 0.5 + (l.top - this.pos.y) * 0.08;
    this.climb = { t: 0, dur, x0: this.pos.x, y0: this.pos.y, z0: this.pos.z,
      hx: l.hang.x, hz: l.hang.z, lx: l.land.x, lz: l.land.z, top: l.top, puff: 0 };
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.onGround = false;
    this.dash = null;
    this.cancelAim();
    g.audio.play('thud', this.pos);
    return true;
  }

  // Knocked off a wall half-way up: the hero drops from the face (and lands at its foot).
  fallFromClimb() {
    const c = this.climb;
    if (!c) return;
    this.climb = null;
    this.climbing = false;
    this.climbCd = BODY.climbCooldown;
    this.pos.x = c.hx; this.pos.z = c.hz;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.onGround = false;
    if (this.isLocal) this.notify('Knocked off the wall!');
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

  // ---------- abilities placed on the ground: the Ranger's volley, the Berserker's Leap ----------
  // Hold the key: a circle on the ground follows the crosshair (for the Leap, where he would really land: short of a wall in the way,
  // and in the warning colour when the leap is cut short). Let go and it goes off there.
  beginAim(slot) {
    const g = this.game, def = abilityOf(this, slot);
    if (!this.alive || this.drive || this.climb || this.aiming || this.leap) return;
    if (this.staggerT > 0 || this.abilCd[slot] > 0 || (def.id === 'leap' && this.mounted)) { g.audio.play('deny'); return; }
    this.aiming = { slot, t: 0, at: new THREE.Vector3(), far: false, plan: null, re: 0, volley: def.id === 'volley' };
    if (def.id === 'volley') this.setWeapon('bow');
  }

  updateAim(dt, input) {
    const g = this.game, a = this.aiming, def = abilityOf(this, a.slot);
    if (!this.alive || this.drive || this.climb || this.staggerT > 0 || this.abilCd[a.slot] > 0 || !def.aimed || this.leap) { this.cancelAim(); return; }
    a.t += dt;
    const eyePos = new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
    if (def.rush) {   // the long charges: the end of the run, short of whatever is in the way
      if ((a.re -= dt) <= 0) {
        a.re = 0.05;
        a.plan = g.abilities.rushPlan(this, this.pos, g.abilities.aimPoint(eyePos, this.lookDir(), RUSH.range, this.team).pos);
        if (a.plan) a.at.copy(a.plan.to);
        a.far = !a.plan;
      }
      if (a.plan) g.aimRing.show(a.at, def.id === 'bash' ? 3.4 * talentFx(this, 'bashReach', 1) : 2.6 * talentFx(this, 'chargeReach', 1), a.far, a.t); else g.aimRing.hide();
    } else if (def.id === 'leap') {
      if ((a.re -= dt) <= 0) {   // (the arc is worked out 20 times a second, not every frame)
        a.re = 0.05;
        a.plan = g.abilities.leapPlan(this, this.pos, g.abilities.aimPoint(eyePos, this.lookDir(), LEAP.range, this.team).pos);
        if (a.plan) a.at.copy(a.plan.to);
        a.far = !a.plan || a.plan.cut;
      }
      if (a.plan) g.aimRing.show(a.at, LEAP.radius * talentFx(this, 'leapRadius', 1), a.far, a.t); else g.aimRing.hide();
    } else {
      const r = g.abilities.aimPoint(eyePos, this.lookDir(), VOLLEY.range, this.team);
      a.at.copy(r.pos);
      a.far = r.far;
      g.aimRing.show(a.at, VOLLEY.radius, a.far, a.t);
    }
    const key = a.slot === 'q' ? 'KeyQ' : 'KeyR';
    if (input.release(key)) {
      const at = (def.id === 'leap' || def.rush) && !a.plan ? null : a.at.clone();
      this.cancelAim();
      if (at) this.useAbility(a.slot, input, at);
      else if (def.id === 'bash') this.useAbility(a.slot, input);   // (no room to run: the bash where he stands)
      else g.audio.play('deny');
    } else if (!input.down(key)) this.cancelAim();   // the menu opened or the window lost focus: never loose it by accident
  }

  cancelAim() {
    if (!this.aiming) return;
    this.aiming = null;
    if (this.isLocal && this.game.aimRing) this.game.aimRing.hide();
  }

  // a foe right in front of the shield on a Shield Bash run (the same test as Abilities.rushOver, on every hero's own screen)
  foeAhead(d) {
    let hit = false;
    const x = this.pos.x + d.x * 1.2, z = this.pos.z + d.z * 1.2, y = this.pos.y;
    this.game.grid.query(x, z, RUSH.reach + 2, (o) => {
      if (hit || !o.alive || o === this || allied(o.team, this.team) || o.drive || Math.abs(o.pos.y - y) > 2.5) return;
      if (Math.hypot(o.pos.x - x, o.pos.z - z) - (o.radius || 0.4) <= RUSH.reach) hit = true;
    });
    return hit;
  }

  // ---------- the Berserker in the air ----------
  // The hero's own screen (or, for a bot, where the battle is run) carries him along the planned arc: no walking, no walls to push
  // against (the plan has seen to that), and he lands on his feet where it ends.
  flyLeap(dt) {
    const L = this.leap;
    L.t += dt;
    const s = Math.min(1, L.t / L.dur), y0 = this.pos.y;
    this.pos.set(L.from.x + (L.to.x - L.from.x) * s, L.from.y + (L.to.y - L.from.y) * s + 4 * L.apex * s * (1 - s), L.from.z + (L.to.z - L.from.z) * s);
    this.vel.set((L.to.x - L.from.x) / L.dur, 0, (L.to.z - L.from.z) / L.dur);
    this.onGround = false;
    if (s < 1) { this.vy = (this.pos.y - y0) / Math.max(dt, 1e-4); return; }
    this.leap = null;
    this.pos.copy(L.to);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.onGround = true;
    if (this.isLocal) this.shake = Math.max(this.shake, 0.4);
  }

  // ---------- the Ranger's Sniper Shot ----------
  // Hold R: the bow comes up to the eye and the view narrows (the scope); the string is drawn as it comes up. The aim sways, settles
  // after a moment and, held too long, starts to waver again. Let go of R (or click) once it is drawn and the arrow is loosed where the
  // scope points; let go before that and nothing is spent. The hero's own screen runs it (a bot's, where the battle is: HeroBot.act).
  get scopeFov() { const t = talentFx(this, 'scope', null); return RANGER.snipe.fov * (t ? t.fov : 1); }

  beginScope() {
    const g = this.game;
    if (!this.alive || this.drive || this.climb || this.scope || this.power) return;
    if (this.staggerT > 0 || this.abilCd.r > 0 || this.mounted) {
      g.audio.play('deny');
      if (this.mounted && this.isLocal) this.notify('Get down from the horse to use the scope.');
      return;
    }
    this.setWeapon('bow');
    this.scope = { t: 0 };
    g.audio.play('bow', this.isBot ? this.pos : null);
  }

  // held: R is still down; fire: a click to loose now
  tickScope(dt, held, fire) {
    const sc = this.scope;
    if (!sc) return;
    if (!this.alive || this.drive || this.climb || this.staggerT > 0 || this.mounted || this.abilCd.r > 0 || this.weapon !== 'bow' || abilityOf(this, 'r').id !== 'snipe') { this.endScope(); return; }
    const S = RANGER.snipe, tal = talentFx(this, 'scope', null);
    sc.t += dt;
    this.drawT = this.drawTime * Math.min(1, sc.t / S.draw);
    // the sway: two slow waves on each axis (never quite a loop), shrinking as the aim settles and growing again when held too long
    const settle = S.settle * (tal ? tal.settle : 1), t = sc.t;
    let k = t < settle ? 1 - (1 - S.steady) * (t / settle) : S.steady * (1 + Math.max(0, t - S.tire) * 0.6);
    k *= S.sway * (tal ? tal.sway : 1);
    const w = this.game.time;
    this.swayX = k * (Math.sin(w * 1.3) + 0.5 * Math.sin(w * 2.9 + 1)) / 1.5;
    this.swayY = k * (Math.sin(w * 1.7 + 0.6) + 0.4 * Math.sin(w * 3.3)) / 1.4;
    const ready = t >= S.draw;
    if (ready && (!held || fire || t >= S.hold)) {
      const dir = this.scopeDir();
      this.endScope();
      if (this.vm) this.vm.recoil = 1;
      this.castAbility('r', dir);
    } else if (!held) this.endScope();   // let go too soon: the arrow is eased back and nothing is spent
  }

  // where the scope points: the hero's aim and the sway
  scopeDir(out = new THREE.Vector3()) {
    const p = this.pitch + this.swayY, y = this.yaw + this.swayX, cp = Math.cos(p);
    return out.set(Math.sin(y) * cp, Math.sin(p), Math.cos(y) * cp);
  }

  endScope() {
    if (!this.scope) return;
    this.scope = null;
    this.drawT = 0;
    this.swayX = this.swayY = 0;
  }

  // the scope's ring over the screen (index.html #scope): only when it changes, never a DOM write a frame
  showScope(on) {
    if (!this.isLocal || on === !!this.scopeShown) return;
    this.scopeShown = on;
    const el = typeof document !== 'undefined' && document.getElementById('scope');
    if (el) el.classList.toggle('on', on);
  }

  // ---------- class abilities ----------
  tickAbilities(dt) {
    this.abilCd.q = Math.max(0, this.abilCd.q - dt);
    this.abilCd.r = Math.max(0, this.abilCd.r - dt);
    this.buffs.update(dt);
    // the Ranger's quiver fills again, an arrow at a time (where the battle is run: a guest's count comes with the snapshot)
    if (this.mods.marksman && this.game.mode !== 'client' && this.alive) {
      if (this.arrows >= PLAYER.maxArrows) this.arrowT = 0;
      else if ((this.arrowT += dt) >= RANGER.arrowEvery * talentFx(this, 'arrowEvery', 1)) { this.arrowT = 0; this.arrows++; }
    }
  }

  // Power Shot: Q starts a full, held draw (useAbility); when it is drawn the arrow looses itself along the hero's aim. A stagger, a
  // climb or a fall drops it, and nothing is spent. The hero's own screen draws it (a bot's runs where the battle is: HeroBot.act).
  tickPower(dt) {
    const pw = this.power;
    if (!pw) return;
    if (!this.alive || this.drive || this.climb || this.staggerT > 0 || this.mounted) { this.power = null; this.drawT = 0; return; }
    if (this.weapon !== 'bow') this.setWeapon('bow');
    pw.t += dt;
    const P = RANGER.power, full = P.draw * talentFx(this, 'powerDraw', 1);
    this.drawT = this.drawTime * Math.min(1, pw.t / (full * 0.75));   // (the string comes back in three quarters of the time, and is held)
    if (pw.t < full) return;
    this.power = null;
    this.drawT = 0;
    if (this.vm) this.vm.recoil = 1;   // (the loose, in the first-person arms)
    this.castAbility('q', this.lookDir());
  }


  // Press Q (attack) or R (defence). The movement part happens here on your own screen at once; the rest is
  // worked out by whoever runs the battle.
  useAbility(slot, input, at = null) {
    const g = this.game;
    const def = abilityOf(this, slot);
    if (!def || !this.alive || this.drive) return;
    if (this.staggerT > 0) { g.audio.play('deny'); return; }
    if (this.abilCd[slot] > 0 || (this.power && slot === 'q')) { g.audio.play('deny'); return; }
    const dir = this.lookDir();
    const fl = Math.hypot(dir.x, dir.z) || 1;
    const fx = dir.x / fl, fz = dir.z / fl;
    switch (def.id) {
      case 'bash':
      case 'lancecharge': {
        // the long run: planned along the ground to where he looks (or the spot he chose), short of walls, gates and steep ground; he
        // sets off at once on his own screen and the host checks it again (Abilities.bash / lancecharge)
        if (this.climb || this.leap) { g.audio.play('deny'); return; }
        const plan = g.abilities.rushPlan(this, this.pos, at || g.abilities.aimPoint(this.eyePos(), dir, RUSH.range, this.team).pos);
        if (!plan) {
          if (def.id === 'bash') { this.dash = { x: fx, z: fz, v: 15, t: 0.25 }; break; }   // (a wall at his nose: the old short lunge and the bash)
          g.audio.play('deny'); if (this.isLocal) this.notify('No room to charge there.'); return;
        }
        const v = g.abilities.rushSpeed(this, def.id);
        this.cancelAim();
        this.dash = { x: plan.f.x, z: plan.f.z, v, t: plan.d / v, rush: def.id, plan, fresh: true };
        if (this.mounted) this.yaw = Math.atan2(plan.f.x, plan.f.z);
        at = plan.to;
        break;
      }
      case 'powershot':
        // the draw first (tickPower looses it); not on horseback or halfway up a wall
        if (this.mounted || this.climb) { g.audio.play('deny'); return; }
        this.cancelAim();
        this.setWeapon('bow');
        this.power = { t: 0 };
        g.audio.play('bow', this.isBot ? this.pos : null);
        return;
      case 'leap': {
        // the Berserker sets off at once along the arc (Abilities.leapPlan: short of walls, never onto enemy battlements); the host
        // checks it again and slams the ground where it ends
        if (this.mounted || this.climb || this.leap) { g.audio.play('deny'); return; }
        const want = at || g.abilities.aimPoint(this.eyePos(), dir, LEAP.range, this.team).pos;
        const plan = g.abilities.leapPlan(this, this.pos, want);
        if (!plan) { g.audio.play('deny'); if (this.isLocal) this.notify('No room to leap there.'); return; }
        this.cancelAim();
        this.dash = null;
        this.leap = { ...plan, t: 0 };
        at = plan.to;
        break;
      }
      case 'fireball': this.castFlash = 1; this.castColor = 0xff8a2a; break;
      case 'smite': this.castFlash = 1; this.castColor = 0xe8f0ff; break;   // (the open hand: viewmodel.js, castKind)
      case 'heal': this.castFlash = 1; this.castColor = 0x9affa0; break;
      case 'ward': this.castFlash = 1; this.castColor = 0x9fe0ff; break;
      default: break;
    }
    this.castKind = def.id;
    this.castAbility(slot, dir, at);
  }

  // the ability goes off: worked out here, or (a guest) by the host
  castAbility(slot, dir, at = null) {
    const g = this.game;
    const cam = this.camera ? this.camera.position.clone() : this.eyePos();
    if (this.netClient) {
      this.abilCd[slot] = this.abilityCd(slot);
      const msg = { a: 'abil', s: slot, f: [cam.x, cam.y, cam.z].map(r2), d: [dir.x, dir.y, dir.z].map((x) => Math.round(x * 1e4) / 1e4), m: this.mounted ? 1 : 0 };
      if (at) msg.at = [at.x, at.y, at.z].map(r2);
      g.net.toHost(msg);
      return;
    }
    if (!g.abilities.use(this, slot, cam, dir, at)) { this.dash = null; this.leap = null; this.castFlash = 0; }   // (use() starts the cooldown)
  }

  // ---------- steering a siege engine ----------
  beginDrive(e) {
    this.drive = e;
    this.leap = null; this.endScope();
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

  // One sword blow (dir is only how it looks: every swing reaches and hits the same).
  meleeStrike(dir = this.atkDir) {
    const g = this.game;
    if (this.netClient) { g.net.toHost({ a: 'strike', ...this.poseMsg(), d: DIR_IDX[dir] }); return; }
    const S = SWING;
    this.attackDir = DIRS.includes(dir) ? dir : 'right';
    const reach = this.sword.len + (this.mounted ? 2.2 : 1.6) + S.reach;
    const charge = this.mounted ? 1 + Math.max(0, Math.abs(this.rideSpeed) - 3) / 8 : 1;
    const dmg = this.sword.dmg * this.dmgMult * charge * S.mult * (0.9 + Math.random() * 0.2);
    const info = { melee: true, charge: charge > 1.6 ? 1 : 0, dir: new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)) };   // (a blow at the gallop counts as heavy)
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
    const speed = (30 + 32 * draw) * (this.zoomed ? talentFx(this, 'zoomSpeed', 1) : 1);
    // Piercing Shots (the Ranger): a full draw goes on through the first body into the ones behind it
    const pierce = this.mods.marksman && draw >= RANGER.pierceDraw ? { pierce: talentFx(this, 'pierce', RANGER.pierce) } : null;
    this.game.projectiles.fireArrow(from, dir.clone().multiplyScalar(speed), this.team, this.bowDmg * (0.4 + 0.6 * draw), this, false, '', pierce);
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
    const store = this.bwave;                         // Bastion Strike (Knight talent): the same blows are kept for the slam that ends Bulwark
    if (store && info.melee && attacker && attacker !== this && attacker.alive && store.t < store.delay) store.sum += amount * store.wave.share;
    const guard = this.buffs.get('guard');
    if (guard) amount *= guard;
    if (this.buffs.has('ward')) {
      amount = this.buffs.absorb(amount);
      this.game.fx.frost(this.chest(new THREE.Vector3()), 6);
      if (!this.buffs.has('ward')) this.game.abilities.shatter(this);   // the ward broke (Mage talent)
      if (amount <= 0) return;
    }
    if (info.melee && amount > this.maxHp * 0.15) this.stagger(0.25);
    else if (this.climbing && amount > this.maxHp * 0.08) this.stagger(0.2);   // a solid hit (an arrow too) knocks a climber off the wall
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
