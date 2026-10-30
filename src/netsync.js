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
import { stats, absorbStats } from './stats.js';
import { Interp, setInterpDelay } from './interpolation.js';
import { packFaction, unpackFaction, packHero, unpackHero } from './snapshot.js';
import { standFor, packComeback, absorbComeback } from './comeback.js';
import { placeOfSeat } from './seats.js';
import { packUnits, unpackUnits, thinEvents } from './warnet.js';
export { Interp, setInterpDelay } from './interpolation.js';

const TYPE_NAMES = Object.keys(UNIT_TYPES);
const TYPE_IDX = Object.fromEntries(TYPE_NAMES.map((t, i) => [t, i]));
const SNAP_EVERY = 0.1;
const POSE_EVERY = 0.05;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const v3 = (p) => [r2(p.x), r2(p.y), r2(p.z)];
const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const QUIET_SOUNDS = new Set(['arrowHit', 'stomp']);

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
    for (const name of ['blood', 'sparks', 'dust', 'splinters', 'levelUp']) {
      const orig = g.fx[name].bind(g.fx);
      g.fx[name] = (p, ...a) => { orig(p, ...a); this.shared.push({ k: 'fx', f: name, p: v3(p), a }); };
    }
    // (the audio object belongs to the page, not to this world: its own play is kept once, so that the sync of a rematch replaces this wrapper instead of
    // wrapping it again, and the finished world is not kept alive by a chain of them)
    if (!g.audio.rawPlay) g.audio.rawPlay = g.audio.play.bind(g.audio);
    g.audio.play = (n, p = null, when = 0) => {
      g.audio.rawPlay(n, p, when);   // (the third argument is the delay of a sound that is timed to the end screen)
      if (p && !QUIET_SOUNDS.has(n)) this.shared.push({ k: 'snd', n, p: v3(p) });
    };
    const fire = g.projectiles.fireArrow.bind(g.projectiles);
    g.projectiles.fireArrow = (from, vel, team, dmg, owner, big = false, ability = '') => {
      fire(from, vel, team, dmg, owner, big, ability);
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
      case 'ping': g.pings.fromClient(p, d); break;
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
      case 'ready': g.setReady(p.team, p); break;
      case 'buy': g.buyFor(p.team, String(d.id)); break;
      case 'stand': standFor(g, p.team); break;   // the Last Stand (comeback.js)
      case 'war': if (g.war) g.war.fromClient(p, d); break;   // War Mode's army panel (warmode.js)
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
      tm: r1(g.time), r: g.round, ph: g.phase, pt: r1(g.phaseT), ql: g.spawnQueue.length, hl: g.hill.netState(), rd: g.readyLive ? g.readyState() : 0,
      w: g.war ? g.war.netState() : 0,   // (War Mode: the phase and each army's formation and plan)
      u: g.war ? packUnits(g.units) : g.units.map((u) => {   // (War Mode's hundreds of soldiers go packed: warnet.js)
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
      f: g.factions.map((f) => packFaction({
        gold: Math.floor(f.gold),
        troopCap: f.troopCap,
        training: f.training,
        eliminated: f.eliminated ? 1 : 0,
        kills: f.kills,
        heroDeaths: f.heroDeaths,
        respawnT: r1(f.respawnT),
        siegeTarget: f.siegeTarget ? f.siegeTarget.team : -1,
        recruitRole: f.recruitRole === 'army' ? 1 : 0,
        earned: f.earned,
        isPlayer: f.isPlayer ? 1 : 0,
        lord: f.lord,
        name: f.name,
        formation: f.formation,
        levies: f.levies,
        wage: f.wage || 0,   // the underdog's wage in gold a minute, and whether the Last Stand is spent (comeback.js)
        stand: f.stand ? 1 : 0,
      })),
      // (Hero Game Mode: one score line, and every hero of the match below with its seat, score and respawn timer: herogame.js)
      hm: g.hero ? [g.hero.sides[0].kills, g.hero.sides[1].kills, g.hero.sides[0].deaths, g.hero.sides[1].deaths, r1(g.hero.clock), r1(g.hero.prepLeft)] : undefined,
      h: g.humans.map((h) => packHero({
        team: h.team,
        x: r2(h.pos.x),
        y: r2(h.pos.y),
        z: r2(h.pos.z),
        yaw: r2(h.yaw),
        alive: h.alive ? 1 : 0,
        hp: Math.round(h.hp),
        maxHp: h.maxHp,
        blocking: h.blocking ? 1 : 0,
        swingT: h.swingT >= 0 ? r2(h.swingT) : -1,
        weapon: h.weapon === 'bow' ? 1 : 0,
        mounted: h.mounted ? 1 : 0,
        heading: r2(h.heading),
        rideSpeed: r2(h.rideSpeed),
        hasHorse: h.hasHorse ? 1 : 0,
        horseX: r2(h.horsePos.x),
        horseY: r2(h.horsePos.y),
        horseZ: r2(h.horsePos.z),
        horseYaw: r2(h.horseYaw),
        name: h.name,
        pitch: r2(h.pitch),
        attackDir: DIR_IDX[h.attackDir] || 0,
        blockDir: DIR_IDX[h.blockDir] || 0,
        staggered: h.staggerT > 0 ? 1 : 0,
        classId: CLASS_IDS.indexOf(h.classId),
        driving: h.drive ? 1 : 0,
        movementFlags: (h.ducking ? 1 : 0) | (h.climbing ? 2 : 0),
        level: h.level,
        hid: g.hero ? h.hid : undefined,
        heroKills: g.hero ? h.heroKills || 0 : undefined,
        deaths: g.hero ? h.deaths || 0 : undefined,
        bot: g.hero ? (h.isBot ? 1 : 0) : undefined,
        respawnT: g.hero && !h.alive ? r1(Math.max(0, h.respawnT || 0)) : undefined,
      })),
      ev: g.war ? thinEvents(this.shared) : this.shared,   // (a War Mode battle keeps only a few blood and sound effects a snapshot)
    };
    this.shared = [];
    for (const h of g.humans) {
      if (!h.remote || h.netId === null || h.netId === undefined) continue;   // (a hero bot has nobody to send to)
      const me = {
        hp: r1(h.hp), maxHp: h.maxHp, alive: h.alive ? 1 : 0, arrows: h.arrows, potions: h.potions, lv: h.lv,
        bf: h.buffs.list(), drv: h.drive ? h.drive.id : 0,
        hasHorse: h.hasHorse ? 1 : 0, horseHp: Math.round(h.horseHp), seq: h.spawnSeq, kills: h.kills, deaths: h.deaths,
        order: h.lastOrder || 'defend', cls: CLASS_IDS.indexOf(h.classId), xp: Math.floor(h.xp), lvl: h.level,
        tal: Object.keys(h.talents),   // the talents learnt (see talents.js)
      };
      g.net.toClient(h.netId, { k: 'snap', s: shared, me, pev: this.priv.get(h.netId) || [] });
    }
    this.priv.clear();
  }

  // (each guest is also sent its own numbers for the end screen: the host is the only one that sees every blow)
  // hl: the notable moments of the match, for the guests' highlight line (highlights.js) · quick: no keep fell for this ending (the clock of a Short war ran out),
  // so the guests' screens come up at once instead of looking for a falling keep (finale.js)
  sendEnd(winner, reason = '', hl = null, quick = false) {
    const st = {};
    const cb = {};   // (and its house's part of the comeback: comeback.js packComeback)
    for (const h of this.g.humans) {
      if (h.netId === null || h.netId === undefined) continue;
      if (h.st) st[h.netId] = stats.pack(h);
      const c = packComeback(this.g, h.team);
      if (c) cb[h.netId] = c;
    }
    this.g.net.toAll({ k: 'end', winner, reason, hl, q: quick ? 1 : 0, st, cb });
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
    else if (d.k === 'end') {
      if (d.st) absorbStats(d.st[this.g.net.id]);
      if (d.cb) absorbComeback(d.cb[this.g.net.id], this.g.localTeam);
      if (this.g.hero && !this.g.hero.result) this.g.hero.result = { winner: d.winner, reason: d.reason || '', draw: !(d.winner >= 0) };   // (the hero end screen reads it)
      this.g.finish(d.winner, d.reason || '', { hl: Array.isArray(d.hl) ? d.hl : null, quick: !!d.q });
    }
    else if (d.k === 'rematch' && this.g.onRematch) this.g.onRematch();   // (the host took the room back to its lobby: main.js)
  }

  apply(d) {
    const g = this.g;
    if (g.net.snapDelay) setInterpDelay(g.net.snapDelay);
    const s = d.s;
    g.round = s.r; g.phase = s.ph; g.phaseT = s.pt;
    g.readyInfo = s.rd || null;   // [ready, of, mask]: who has pressed Ready in the first preparation
    g.spawnQueue.length = s.ql;
    g.hill.applyNet(s.hl);

    // units
    const seen = new Set();
    if (g.war && s.w) g.war.applyNet(s.w);
    const list = g.war && s.u && !Array.isArray(s.u) ? unpackUnits(s.u, this.units, (x, z) => g.physics.terrainHeight(x, z)) : s.u;
    for (const a of list) {
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
      if (swingT < 0 && u.swingT >= 0 && u.swingT < 0.3) u.swingT = -1; // interrupted
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
      const state = unpackFaction(a);
      f.gold = state.gold; f.troopCap = state.troopCap; f.training = state.training;
      f.eliminated = !!state.eliminated;
      f.kills = state.kills; f.heroDeaths = state.heroDeaths; f.respawnT = state.respawnT;
      // your own pick shows at once and the host's word wins again after a moment (a late snapshot must not undo it)
      const mine = i === g.localTeam && g.time < (g.localPickUntil || 0);
      if (!mine) f.siegeTarget = state.siegeTarget >= 0 ? g.castles[state.siegeTarget] : null;
      if (i !== g.localTeam || g.time >= (g.localRolePickUntil || 0)) f.recruitRole = state.recruitRole ? 'army' : 'garrison';
      f.earned = state.earned;
      f.lord = state.lord; f.name = state.name;
      if (!mine) f.formation = state.formation;
      f.levies = state.levies || 0;
      f.wage = state.wage || 0; f.stand = state.stand || 0;
      if (!state.isPlayer && f.isPlayer && f.player !== g.player) {
        // that person left; an AI lord took over
        g.humans = g.humans.filter((h) => h !== f.player);
        f.player.removeBody();
        f.isPlayer = false; f.player = null;
      }
    });

    // Hero Game Mode: the score and the clock
    const hm = g.hero && Array.isArray(s.hm) ? s.hm : null;
    if (hm) {
      const [k0, k1, d0, d1, clock, prep] = hm, sd = g.hero.sides;
      sd[0].kills = k0 | 0; sd[1].kills = k1 | 0; sd[0].deaths = d0 | 0; sd[1].deaths = d1 | 0;
      g.hero.clock = +clock || 0; g.hero.prepLeft = +prep || 0;
    }

    // other people's heroes (in the Hero Game Mode every hero of the match: allies too, and the bots, each known by its seat)
    for (const a of s.h) {
      const state = unpackHero(a);
      const team = state.team;
      const seat = g.hero && Number.isInteger(state.hid) ? state.hid : null;
      if (seat !== null && seat === g.player.hid) {   // (my own: the host's word on my score and my respawn)
        g.player.heroKills = state.heroKills || 0;
        g.player.respawnT = state.respawnT || 0;
        continue;
      }
      if (seat === null && team === g.localTeam) continue;
      if (seat === null && g.hero) continue;   // (a hero without a seat: an old host)
      let h = seat !== null ? g.humans.find((o) => o.hid === seat) : g.humans.find((o) => o.team === team);
      if (!h) {
        h = new Player(g, null, { remote: true, team, name: state.name, cls: CLASS_IDS[state.classId] });
        g.humans.push(h);
        if (seat !== null) { h.hid = seat; h.heroSlot = placeOfSeat(seat); g.hero.adopt(h); }
        else { g.factions[team].player = h; g.factions[team].isPlayer = true; }
      }
      if (seat !== null) {
        h.isBot = !!state.bot; h.heroKills = state.heroKills || 0; h.deaths = state.deaths || 0; h.respawnT = state.respawnT || 0;
      }
      if (CLASS_IDS[state.classId] && CLASS_IDS[state.classId] !== h.classId) h.adoptClass(CLASS_IDS[state.classId]);   // they changed class
      if (state.level && state.level !== h.level) { h.level = state.level; if (h.body) h.buildTag(); }               // or reached a new level
      if (!h.interp) h.interp = new Interp();
      h.interp.push(state.x, state.y, state.z, state.mounted ? state.heading : state.yaw, state.yaw); // riders turn by their horse's heading
      h.netPose = { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch, vx: 0, vz: 0, b: state.blocking, w: state.weapon, m: state.mounted, h: state.heading, rs: state.rideSpeed, hx: state.horseX, hy: state.horseY, hz: state.horseZ, hyaw: state.horseYaw, dk: state.movementFlags & 1, cl: (state.movementFlags >> 1) & 1 };
      const mv = state.mounted ? state.rideSpeed : 0;
      h.netPose.vx = Math.sin(state.mounted ? state.heading : state.yaw) * mv;
      h.netPose.vz = Math.cos(state.mounted ? state.heading : state.yaw) * mv;
      if (!state.mounted) {
        // infer walking speed from movement between snapshots
        const dx = state.x - (h.lastNetX ?? state.x), dz = state.z - (h.lastNetZ ?? state.z);
        h.netPose.vx = dx / SNAP_EVERY; h.netPose.vz = dz / SNAP_EVERY;
      }
      h.lastNetX = state.x; h.lastNetZ = state.z;
      h.alive = !!state.alive;
      h.hp = state.hp; h.maxHp = state.maxHp;
      if (state.swingT >= 0 && h.swingT < 0) h.swingT = state.swingT;
      h.attackDir = DIRS[state.attackDir] || 'right';
      h.blockDir = DIRS[state.blockDir] || 'right';
      h.staggerT = state.staggered ? 0.3 : 0;
      h.drive = state.driving ? true : null;   // inside a siege engine
      if (state.hasHorse && !h.hasHorse) { h.hasHorse = true; h.horseHp = 320; h.ensureHorseModel(); h.horseDeadT = undefined; }
      if (!state.hasHorse && h.hasHorse) { h.hasHorse = false; h.mounted = false; h.horseDeadT = 0; }
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
      p.xp = me.xp; p.level = me.lvl || 1;
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
        if (g.war) g.war.respawn(p);
        else p.spawn(g.hero ? g.hero.slotPos(p) : c.spawnPoint, c.rot);   // (a hero rises at their own place in the courtyard: herogame.js)
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
