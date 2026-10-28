// Network replication. The host simulates everything and sends compact snapshots ~10 times a second;
// clients move their own hero locally and send its pose and actions back.
import * as THREE from 'three';
import { UNIT_TYPES } from './config.js';
import { CLASS_IDS } from './classes.js';
import { Unit } from './units.js';
import { SiegeEngine } from './siege.js';
import { Player } from './player.js';
import { DIRS, DIR_IDX } from './combat.js';
import { mirrorTalents } from './talents.js';

const TYPE_NAMES = Object.keys(UNIT_TYPES);
const TYPE_IDX = Object.fromEntries(TYPE_NAMES.map((t, i) => [t, i]));
const SNAP_EVERY = 0.1;
const POSE_EVERY = 0.05;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const v3 = (p) => [r2(p.x), r2(p.y), r2(p.z)];
const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const QUIET_SOUNDS = new Set(['arrowHit', 'stomp']);

// Snapshot interpolation: keep the two latest samples and show the world slightly in the past,
// blending between them, so movement is smooth even though updates arrive ~10 times a second.
let DELAY = 0.12;
export function setInterpDelay(d) { DELAY = d; }
const now = () => performance.now() / 1000;
export class Interp {
  constructor() { this.a = null; this.b = null; }
  push(x, y, z, yaw, extra = 0) {
    const s = { t: now(), x, y, z, yaw, extra };
    if (this.b && Math.hypot(x - this.b.x, z - this.b.z) > 12) this.a = null; // teleport: don't slide
    this.a = this.b || s;
    this.b = s;
  }
  sample(out) {
    const { a, b } = this;
    if (!b) return false;
    const span = Math.max(0.03, b.t - a.t);
    const k = a === b ? 1 : Math.max(0, Math.min(1.25, (now() - DELAY - a.t) / span));
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    let dy = b.yaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    out.yaw = a.yaw + dy * Math.min(1, k);
    out.extra = b.extra;
    return true;
  }
}

export class HostSync {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.shared = [];
    this.priv = new Map();
    const net = game.net;
    net.on('data', ({ from, d }) => this.onData(from, d));
    net.on('leave', (id) => {
      const p = game.humans.find((h) => h.netId === id);
      if (p) game.dropHuman(p);
    });
    net.lock();
    this.wrap();
  }

  // Record effects, sounds and projectiles so clients can replay them.
  wrap() {
    const g = this.g;
    for (const name of ['blood', 'sparks', 'dust', 'splinters']) {
      const orig = g.fx[name].bind(g.fx);
      g.fx[name] = (p, ...a) => { orig(p, ...a); this.shared.push({ k: 'fx', f: name, p: v3(p), a }); };
    }
    const play = g.audio.play.bind(g.audio);
    g.audio.play = (n, p = null) => {
      play(n, p);
      if (p && !QUIET_SOUNDS.has(n)) this.shared.push({ k: 'snd', n, p: v3(p) });
    };
    const fire = g.projectiles.fireArrow.bind(g.projectiles);
    g.projectiles.fireArrow = (from, vel, team, dmg, owner, big = false) => {
      fire(from, vel, team, dmg, owner, big);
      const ev = { k: 'arrow', p: v3(from), v: v3(vel), t: team };
      if (big) ev.b = 1;
      this.shared.push(ev);
    };
    const spell = g.projectiles.fireSpell.bind(g.projectiles);
    g.projectiles.fireSpell = (kind, from, vel, team, dmg, owner, radius = 0) => {
      spell(kind, from, vel, team, dmg, owner, radius);
      this.shared.push({ k: 'spell', s: kind, p: v3(from), v: v3(vel), t: team, r: r2(radius) });
    };
    g.magic.onBolt = (pts, color) => this.shared.push({ k: 'bolt', pts: pts.map(v3), c: color });
    const rock = g.projectiles.throwBoulder.bind(g.projectiles);
    g.projectiles.throwBoulder = (from, to, team, dmg, owner, time = 3.2) => {
      rock(from, to, team, dmg, owner, time);
      this.shared.push({ k: 'rock', p: v3(from), to: v3(to), tm: time, t: team });
    };
  }

  privateEvent(player, ev) {
    if (player.netId === null || player.netId === undefined) return;
    if (!this.priv.has(player.netId)) this.priv.set(player.netId, []);
    this.priv.get(player.netId).push(ev);
  }

  onData(from, d) {
    const g = this.g;
    const p = g.humans.find((h) => h.netId === from);
    if (!p || !d) return;
    const f = g.factions[p.team];
    switch (d.a) {
      case 'pose': if (!p.drive) p.netPose = d; break;
      case 'swing': p.swingT = 0; if (DIRS[d.d]) { p.attackDir = DIRS[d.d]; p.atkDir = p.attackDir; } break;
      case 'feint': p.feintedAt = g.time; p.swingT = -1; break;
      case 'strike':
        if (!p.alive) break;
        p.netPose = d;
        p.pos.set(d.x, d.y, d.z);
        p.yaw = d.yaw;
        p.mounted = !!d.m && p.hasHorse;
        p.rideSpeed = d.rs;
        if (p.staggerT <= 0) p.meleeStrike(DIRS[d.d] || 'right', Math.max(0, Math.min(1, d.ch || 0)));
        break;
      case 'shoot':
        if (p.alive && p.arrows > 0) p.fireFrom(vec(d.f), vec(d.d).normalize(), Math.max(0, Math.min(1, d.draw)));
        break;
      case 'potion': p.drinkPotion(); break;
      case 'abil':
        // class ability: the client has already moved itself; the host works out the rest
        if (p.alive && p.staggerT <= 0 && (d.s === 'q' || d.s === 'r') && !p.drive) {
          p.mounted = !!d.m && p.hasHorse;
          g.abilities.use(p, d.s, vec(d.f), vec(d.d), Array.isArray(d.at) && d.at.length === 3 ? vec(d.at) : null);
        }
        break;
      case 'class': g.switchClass(p, String(d.cls)); break;
      case 'talent': g.askTalent(p, String(d.id)); break;
      case 'respec': g.askRespec(p); break;
      case 'role': g.setRoles(p.team, d); break;
      case 'recruitRole': f.recruitRole = d.role === 'army' ? 'army' : 'garrison'; break;
      case 'board': g.boardEngine(p, g.siege.find((e) => e.id === d.id)); break;
      case 'unboard': g.leaveEngine(p); break;
      case 'drive':
        if (p.drive && p.drive.driver === p) {
          p.drive.input = { f: Math.max(-1, Math.min(1, d.f || 0)), t: Math.max(-1, Math.min(1, d.t || 0)), fire: !!d.fire, cam: d.c ? vec(d.c) : null, dir: d.d ? vec(d.d).normalize() : null };
        }
        break;
      case 'formation': g.setFormation(p.team, String(d.f)); break;
      case 'gate': g.toggleGate(p.team); break;
      case 'buy': g.buyFor(p.team, String(d.id)); break;
      case 'target': f.siegeTarget = g.castles[d.team] || null; break;
      case 'order':
        if (d.target >= 0 && g.castles[d.target]) f.siegeTarget = g.castles[d.target];
        if (['follow', 'hold', 'charge', 'defend', 'assault'].includes(d.cmd) && (d.cmd !== 'hold' || d.hold)) g.order(p.team, d.cmd, d.group || 'all', d.hold);
        break;
      default: break;
    }
  }

  update(dt) {
    this.t += dt;
    if (this.t < (this.g.net.snapEvery || SNAP_EVERY)) return;
    this.t = 0;
    const g = this.g;
    const shared = {
      tm: r1(g.time), r: g.round, ph: g.phase, pt: r1(g.phaseT), ql: g.spawnQueue.length, hl: g.hill.netState(),
      u: g.units.map((u) => {
        const a = [u.id, TYPE_IDX[u.type], u.team, r1(u.pos.x), r2(u.pos.y), r1(u.pos.z), r2(u.yaw), u.alive ? 1 : 0,
          u.swingT >= 0 ? r2(u.swingT) : -1, r1(Math.hypot(u.vel.x, u.vel.z)), u.variant, Math.round((u.hp / u.maxHp) * 100),
          DIR_IDX[u.attackDir] || 0, u.staggerT > 0 ? 1 : 0, u.blockFlash > 0 || u.braced ? 1 : 0,
          u.rank | (u.lane ? 8 : 0) | (u.army ? 16 : 0), u.crewOf ? u.crewOf.id * 4 + u.crewSlot + 1 : 0];
        if (u.isHero) a.push(u.name);
        return a;
      }),
      s: g.siege.map((s) => [s.id, s.type === 'ram' ? 0 : 1, s.team, r1(s.pos.x), r2(s.pos.y), r1(s.pos.z), r2(s.yaw),
        s.alive ? 1 : 0, Math.round((s.hp / s.maxHp) * 100), r2(s.timer), s.vel.lengthSq() > 0.01 ? 1 : 0,
        (s.abandoned ? 1 : 0) | (s.driver ? 2 : 0), s.crewAlive()]),
      c: g.castles.map((c) => c.netState()),
      f: g.factions.map((f) => [Math.floor(f.gold), f.troopCap, f.training, f.eliminated ? 1 : 0, f.kills, f.heroDeaths,
        r1(f.respawnT), f.siegeTarget ? f.siegeTarget.team : -1, f.recruitRole === 'army' ? 1 : 0,
        f.earned, f.isPlayer ? 1 : 0, f.lord, f.name, f.formation, f.levies]),
      h: g.humans.map((h) => [h.team, r2(h.pos.x), r2(h.pos.y), r2(h.pos.z), r2(h.yaw), h.alive ? 1 : 0, Math.round(h.hp), h.maxHp,
        h.blocking ? 1 : 0, h.swingT >= 0 ? r2(h.swingT) : -1, h.weapon === 'bow' ? 1 : 0, h.mounted ? 1 : 0, r2(h.heading),
        r2(h.rideSpeed), h.hasHorse ? 1 : 0, r2(h.horsePos.x), r2(h.horsePos.y), r2(h.horsePos.z), r2(h.horseYaw), h.name, r2(h.pitch),
        DIR_IDX[h.attackDir] || 0, DIR_IDX[h.blockDir] || 0, h.staggerT > 0 ? 1 : 0, CLASS_IDS.indexOf(h.classId), h.drive ? 1 : 0, (h.ducking ? 1 : 0) | (h.climbing ? 2 : 0)]),
      ev: this.shared,
    };
    this.shared = [];
    for (const h of g.humans) {
      if (!h.remote) continue;
      const me = {
        hp: r1(h.hp), maxHp: h.maxHp, alive: h.alive ? 1 : 0, arrows: h.arrows, potions: h.potions, lv: h.lv,
        bf: h.buffs.list(), drv: h.drive ? h.drive.id : 0,
        hasHorse: h.hasHorse ? 1 : 0, horseHp: Math.round(h.horseHp), seq: h.spawnSeq, kills: h.kills, deaths: h.deaths,
        order: h.lastOrder || 'defend', cls: CLASS_IDS.indexOf(h.classId),
        tal: Object.keys(h.talents),   // the talents learnt (see talents.js)
      };
      g.net.toClient(h.netId, { k: 'snap', s: shared, me, pev: this.priv.get(h.netId) || [] });
    }
    this.priv.clear();
  }

  sendEnd(winner, reason = '') {
    this.g.net.toAll({ k: 'end', winner, reason });
  }
}

export class ClientSync {
  constructor(game) {
    this.g = game;
    this.units = new Map();
    this.siege = new Map();
    this.t = 0;
    game.net.on('data', ({ d }) => this.onData(d));
    game.spawnQueue = [];
  }

  onData(d) {
    if (!d) return;
    if (d.k === 'snap') this.apply(d);
    else if (d.k === 'end') this.g.finish(d.winner, d.reason || '');
  }

  apply(d) {
    const g = this.g;
    if (g.net.snapDelay) setInterpDelay(g.net.snapDelay);
    const s = d.s;
    g.round = s.r; g.phase = s.ph; g.phaseT = s.pt;
    g.spawnQueue.length = s.ql;
    g.hill.applyNet(s.hl);

    // units
    const seen = new Set();
    for (const a of s.u) {
      const [id, ti, team, x, y, z, yaw, alive, swingT, speed, variant, hpPct, dirIdx, stag, blk, flags, crewRef, name] = a;
      const rank = flags & 7;
      seen.add(id);
      let u = this.units.get(id);
      if (!u) {
        const type = TYPE_NAMES[ti];
        u = new Unit(g, type, team, new THREE.Vector3(x, y, z), { variant, name });
        u.id = id;
        u.pos.set(x, y, z);
        u.yaw = yaw;
        u.alive = !!alive;
        if (!alive) u.deathT = 20;
        this.units.set(id, u);
        g.units.push(u);
      }
      if (!u.interp) u.interp = new Interp();
      u.interp.push(x, y, z, yaw, speed);
      if (u.alive && !alive) { u.alive = false; u.deathT = 0; }
      if (swingT >= 0 && u.swingT < 0) u.swingT = swingT;
      if (swingT < 0 && u.swingT >= 0 && u.swingT < 0.3) u.swingT = -1; // interrupted or feinted
      u.attackDir = DIRS[dirIdx] || 'over';
      if (stag && u.staggerT <= 0) { u.staggerT = 0.4; u.staggerMax = 0.5; }
      if (blk) u.blockFlash = 0.2;
      if (rank !== u.rank) u.setRankVisual(rank);
      // a role you have just picked shows at once; the host's word wins again after a moment
      const pend = g.rolePending && g.rolePending.get(id);
      if (pend && g.time < pend.until) { u.lane = pend.role === 'lane'; u.army = pend.role === 'army'; }
      else { u.lane = !!(flags & 8); u.army = !!(flags & 16); if (pend) g.rolePending.delete(id); }
      u.crewRef = crewRef;   // engine id * 4 + seat + 1, or 0
      u.hp = (hpPct / 100) * u.maxHp;
    }
    for (const [id, u] of this.units) {
      if (!seen.has(id)) { u.remove(); this.units.delete(id); }
    }
    g.units = g.units.filter((u) => this.units.get(u.id) === u);

    // siege engines
    const seenS = new Set();
    for (const a of s.s) {
      const [id, ti, team, x, y, z, yaw, alive, hpPct, timer, moving, eflags, crewN] = a;
      seenS.add(id);
      let e = this.siege.get(id);
      if (!e) {
        e = new SiegeEngine(g, ti ? 'catapult' : 'ram', team, new THREE.Vector3(x, y, z), null);
        e.id = id;
        e.yaw = yaw;
        this.siege.set(id, e);
        g.siege.push(e);
      }
      if (!e.interp) e.interp = new Interp();
      e.interp.push(x, y, z, yaw, moving);
      if (e.alive && !alive) e.alive = false;
      e.team = team;
      e.abandoned = !!(eflags & 1);
      e.driven = !!(eflags & 2);
      e.crewN = crewN;
      e.hp = (hpPct / 100) * e.maxHp;
      e.timer = timer;
    }
    for (const [id, e] of this.siege) {
      if (!seenS.has(id)) { g.scene.remove(e.mesh); this.siege.delete(id); }
    }
    g.siege = g.siege.filter((e) => this.siege.get(e.id) === e);

    // AI lords are ordinary units here; link them so the HUD shows their state
    for (const f of g.factions) {
      if (f.isPlayer) continue;
      f.hero = g.units.find((u) => u.isHero && u.team === f.team && u.alive) || null;
    }

    // castles and factions
    s.c.forEach((a, i) => g.castles[i].applyNet(a));
    s.f.forEach((a, i) => {
      const f = g.factions[i];
      [f.gold, f.troopCap, f.training] = a;
      f.eliminated = !!a[3];
      f.kills = a[4]; f.heroDeaths = a[5]; f.respawnT = a[6];
      // your own pick shows at once and the host's word wins again after a moment (a late snapshot must not undo it)
      const mine = i === g.localTeam && g.time < (g.localPickUntil || 0);
      if (!mine) f.siegeTarget = a[7] >= 0 ? g.castles[a[7]] : null;
      if (i !== g.localTeam || g.time >= (g.localRolePickUntil || 0)) f.recruitRole = a[8] ? 'army' : 'garrison';
      f.earned = a[9];
      f.lord = a[11]; f.name = a[12];
      if (!mine) f.formation = a[13];
      f.levies = a[14] || 0;
      if (!a[10] && f.isPlayer && f.player !== g.player) {
        // that person left; an AI lord took over
        g.humans = g.humans.filter((h) => h !== f.player);
        f.player.removeBody();
        f.isPlayer = false; f.player = null;
      }
    });

    // other people's heroes
    for (const a of s.h) {
      const team = a[0];
      if (team === g.localTeam) continue;
      let h = g.humans.find((o) => o.team === team);
      if (!h) {
        h = new Player(g, null, { remote: true, team, name: a[19], cls: CLASS_IDS[a[24]] });
        g.humans.push(h);
        g.factions[team].player = h; g.factions[team].isPlayer = true;
      }
      if (CLASS_IDS[a[24]] && CLASS_IDS[a[24]] !== h.classId) h.adoptClass(CLASS_IDS[a[24]]);   // they changed class
      if (!h.interp) h.interp = new Interp();
      h.interp.push(a[1], a[2], a[3], a[11] ? a[12] : a[4], a[4]); // riders turn by their horse's heading
      h.netPose = { x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[20], vx: 0, vz: 0, b: a[8], w: a[10], m: a[11], h: a[12], rs: a[13], hx: a[15], hy: a[16], hz: a[17], hyaw: a[18], dk: a[26] & 1, cl: (a[26] >> 1) & 1 };
      const mv = a[11] ? a[13] : 0;
      h.netPose.vx = Math.sin(a[11] ? a[12] : a[4]) * mv;
      h.netPose.vz = Math.cos(a[11] ? a[12] : a[4]) * mv;
      if (!a[11]) {
        // infer walking speed from movement between snapshots
        const dx = a[1] - (h.lastNetX ?? a[1]), dz = a[3] - (h.lastNetZ ?? a[3]);
        h.netPose.vx = dx / SNAP_EVERY; h.netPose.vz = dz / SNAP_EVERY;
      }
      h.lastNetX = a[1]; h.lastNetZ = a[3];
      h.alive = !!a[5];
      h.hp = a[6]; h.maxHp = a[7];
      if (a[9] >= 0 && h.swingT < 0) h.swingT = a[9];
      h.attackDir = DIRS[a[21]] || 'right';
      h.blockDir = DIRS[a[22]] || 'right';
      h.staggerT = a[23] ? 0.3 : 0;
      h.drive = a[25] ? true : null;   // inside a siege engine
      if (a[14] && !h.hasHorse) { h.hasHorse = true; h.horseHp = 320; h.ensureHorseModel(); h.horseDeadT = undefined; }
      if (!a[14] && h.hasHorse) { h.hasHorse = false; h.mounted = false; h.horseDeadT = 0; }
    }

    // my hero
    const p = g.player;
    const me = d.me;
    if (me) {
      if (CLASS_IDS[me.cls] && CLASS_IDS[me.cls] !== p.classId) {   // the host confirmed a class change: not a wound
        p.adoptClass(CLASS_IDS[me.cls]);
        p.classAt = g.phase === 'prep' && g.round === 0 ? -99 : g.time;   // for the shop's "Wait 12 s"
        p.hp = me.hp;
      }
      if (me.hp < p.hp - 0.5 && p.alive) { p.hurtFlash = Math.min(1, p.hurtFlash + 0.4 + (p.hp - me.hp) / 60); g.audio.play('hurt'); p.lastHurt = g.time; }
      const lvChanged = JSON.stringify(me.lv) !== JSON.stringify(p.lv);
      p.lv = me.lv;
      if (lvChanged) p.rebuildWeapons();
      p.buffs.setList(me.bf);
      if (me.tal) mirrorTalents(p, me.tal);   // the talents the host says you have (stats follow)
      // steering a siege engine (the host decides when you board or are thrown out)
      if (me.drv && (!p.drive || p.drive.id !== me.drv)) {
        const e = this.siege.get(me.drv);
        if (e) p.beginDrive(e);
      } else if (!me.drv && p.drive) p.endDrive();
      p.maxHp = me.maxHp;
      p.hp = me.hp;
      p.arrows = me.arrows;
      p.potions = me.potions;
      p.kills = me.kills;
      p.deaths = me.deaths;
      p.lastOrder = me.order;
      if (me.hasHorse && !p.hasHorse) p.giveHorse();
      if (!me.hasHorse && p.hasHorse) p.loseHorse(true);
      p.horseHp = me.horseHp;
      if (p.alive && !me.alive) {
        p.alive = false;
        if (p.viewModel) p.viewModel.visible = false;
        if (p.mounted) { p.mounted = false; p.horsePos.copy(p.pos); p.horseYaw = p.heading; p.rideSpeed = 0; p.radius = 0.4; }
        g.audio.play('death');
      }
      if (me.alive && (me.seq !== p.spawnSeq || !p.alive)) {
        const c = g.castles[p.team];
        p.spawn(c.spawnPoint, c.rot);
        p.hp = me.hp;
        p.spawnSeq = me.seq;
      }
    }

    // replay effects and messages
    const events = s.ev.concat(d.pev || []);
    for (const ev of events) this.replay(ev);
  }

  replay(ev) {
    const g = this.g;
    switch (ev.k) {
      case 'fx': if (g.fx[ev.f]) g.fx[ev.f](vec(ev.p), ...(ev.a || [])); break;
      case 'snd': g.audio.play(ev.n, ev.p ? vec(ev.p) : null); break;
      case 'arrow': g.projectiles.fireArrow(vec(ev.p), vec(ev.v), ev.t, 0, null, !!ev.b); break;
      case 'rock': g.projectiles.throwBoulder(vec(ev.p), vec(ev.to), ev.t, 0, null, ev.tm); break;
      case 'spell': g.projectiles.fireSpell(ev.s, vec(ev.p), vec(ev.v), ev.t, 0, null, ev.r); break;
      case 'bolt': g.magic.showBolt(ev.pts.map(vec), ev.c); break;
      case 'abil': g.abilities.show(ev.id, vec(ev.p), new THREE.Vector3(ev.d[0], 0, ev.d[1]), true, ev.t ? ev.t.map(vec) : null, ev.sz || 1); break;
      default: g.applyEvent(ev); break;
    }
  }

  update(dt) {
    // engines first: their crews ride along with them
    for (const e of this.siege.values()) e.netUpdate(dt);
    for (const u of this.units.values()) u.netUpdate(dt);
    this.t += dt;
    if (this.t >= POSE_EVERY) {
      this.t = 0;
      const p = this.g.player;
      if (p.alive) this.g.net.toHost(p.drive ? { a: 'drive', ...p.driveMsg() } : { a: 'pose', ...p.poseMsg() });
    }
  }
}
