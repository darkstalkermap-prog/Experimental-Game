// Game state and the main simulation loop.
// Modes: 'single' (you + 3 AI lords), 'host' (this browser simulates and serves up to 3 other people),
// 'client' (this browser mirrors the host's battle and controls one hero).
import * as THREE from 'three';
import {
  PLAYER_TEAM, RAIDER_TEAM, TEAM_NAMES, LORD_NAMES, ROUNDS, START_GOLD, DIFFICULTY, BOUNTY,
  UNIT_TYPES, TROOP_CAP, PLAYER, CASTLE, FORMATIONS, RANKS, PROMOTIONS, WORLD,
} from './config.js';
import { Physics, CASTLE_SITES } from './physics.js';
import { createSky, createLights, createTerrain, createForest, createCentrePiece, followShadow } from './world.js';
import { materials } from './materials.js';
import { Castle } from './castle.js';
import { Unit, makeRaiderStats } from './units.js';
import { SiegeEngine } from './siege.js';
import { Projectiles } from './projectiles.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { LordAI } from './ai.js';
import { buy, SHOP_BY_ID } from './economy.js';
import { HostSync, ClientSync } from './netsync.js';
import { incomingSide, PARRY_WINDOW } from './combat.js';
import { Grass } from './grass.js';
import { Magic } from './magic.js';
import { prewarmSoldier } from './models.js';
import { allied, alliance, setAlliance } from './teams.js';

export const GROUP_NAMES = { all: 'Everyone', infantry: 'Infantry', archers: 'Archers', cavalry: 'Cavalry' };
const GROUPS = ['all', 'infantry', 'archers', 'cavalry'];

class Grid {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return (ix + 512) * 1024 + (iz + 512); }
  clear() { for (const a of this.map.values()) a.length = 0; }
  insert(o) {
    const k = this.key(Math.floor(o.pos.x / this.cell), Math.floor(o.pos.z / this.cell));
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(o);
  }
  query(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.map.get(this.key(ix, iz));
      if (a) for (let i = 0; i < a.length; i++) fn(a[i]);
    }
  }
}

export class Game {
  constructor(renderer, ui, audio, input) {
    this.renderer = renderer;
    this.ui = ui;
    this.audio = audio;
    this.input = input;
    ui.game = this;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1600);
    this.scene.add(this.camera);
    this.time = 0;
    this.state = 'loading';
    this.mode = 'single';
    this.net = null;
    this.paused = false;
    this.diff = DIFFICULTY.normal;

    this.physics = new Physics(11);
    createSky(this.scene, renderer);
    this.lights = createLights(this.scene);
    createTerrain(this.scene, this.physics);
    createForest(this.scene, this.physics);
    createCentrePiece(this.scene, this.physics, materials().stone);
    this.grass = new Grass(this.scene, this.physics);
    this.fx = new FX(this.scene);
    this.projectiles = new Projectiles(this);
    this.magic = new Magic(this);
    this.grid = new Grid(4);
    this.castles = CASTLE_SITES.map((s, i) => new Castle(this, i, s));
    this.player = new Player(this, this.camera);
    this.humans = [this.player];
    this.units = [];
    this.siege = [];
    this.factions = [];
    this.spawnQueue = [];
    this.menuCamT = 0;
    this.round = 0;
    this.phase = 'prep';
    this.phaseT = 0;
    this.hitStop = 0;
  }

  // Graphics quality: 'low' (no shadows or grass), 'medium', 'high'
  setQuality(q) {
    const level = { low: 0, medium: 1, high: 2 }[q] ?? 1;
    this.quality = q;
    this.grass.setDensity(level);
    const sun = this.lights.sun;
    sun.castShadow = level > 0;
    const size = level === 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, [1, 1.25, 1.75][level]));
    this.renderer.setSize(innerWidth, innerHeight);
    this.fx.setScale(innerHeight * this.renderer.getPixelRatio());
  }

  get localTeam() { return this.player.team; }
  get localFaction() { return this.factions[this.player.team]; }
  get simulating() { return this.mode !== 'client'; }

  // ---------------- setup ----------------
  // setup: { mode, localTeam, players: [{ team, name, netId }] }
  start(difficulty = 'normal', setup = null) {
    setup = setup || { mode: 'single', localTeam: PLAYER_TEAM, players: [{ team: PLAYER_TEAM, name: 'You' }] };
    this.mode = setup.mode;
    // co-op: every human house fights on one side against the AI lords and the raiders
    this.coop = !!setup.coop && setup.players.length > 1;
    setAlliance(this.coop ? setup.players.map((p) => p.team) : []);
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficultyName = difficulty;
    this.state = 'playing';
    this.round = 0;
    this.phase = 'prep';
    this.phaseT = ROUNDS.firstPrep;
    this.waveT = 0;

    const lp = this.player;
    lp.team = setup.localTeam;
    lp.rebuildWeapons();
    this.humans = [lp];
    const byTeam = new Map(setup.players.map((p) => [p.team, p]));
    lp.name = byTeam.get(lp.team)?.name || 'You';
    for (const p of setup.players) {
      if (p.team === lp.team) continue;
      this.humans.push(new Player(this, null, { remote: true, team: p.team, name: p.name, netId: p.netId }));
    }

    this.factions = this.castles.map((c, i) => {
      const human = this.humans.find((h) => h.team === i) || null;
      return {
        team: i, name: TEAM_NAMES[i], lord: human ? human.name : LORD_NAMES[i], isPlayer: !!human, player: human, castle: c,
        gold: START_GOLD, spent: 0, earned: 0, troopCap: TROOP_CAP.start, training: 0,
        heroLv: { vitality: 0, strength: 0, armor: 0 }, hero: human, heroDeaths: 0, respawnT: 0,
        eliminated: false, kills: 0, siegeTarget: null, formation: 'line',
      };
    });
    if (this.mode !== 'single') {
      // in online games the human houses are named after their lords
      for (const f of this.factions) if (f.isPlayer) f.name = `House ${f.lord}`;
    }
    for (const h of this.humans) {
      const c = this.castles[h.team];
      h.spawn(c.spawnPoint, c.rot);
    }

    if (this.simulating) {
      for (const f of this.factions) {
        if (f.isPlayer) continue;
        this.spawnLord(f);
        f.ai = new LordAI(this, f);
      }
      for (const f of this.factions) {
        for (const t of ['swordsman', 'swordsman', 'spearman', 'archer', 'archer']) this.recruit(f, t);
      }
    }
    if (this.mode === 'host') this.sync = new HostSync(this);
    if (this.mode === 'client') this.sync = new ClientSync(this);
    this.localFaction.siegeTarget = this.castles[(lp.team + 2) % 4];
    this.warmup();
    // prepare every soldier look in the background (a few ms per frame) so new arrivals never stutter
    this.warmQueue = [];
    const factionTypes = ['swordsman', 'spearman', 'archer', 'knight', 'horseman', 'lancer', 'longbowman', 'giant'];
    const raiderTypes = ['raider', 'raiderArcher', 'brute', 'raiderRider', 'shaman', 'warlord', 'giant'];
    for (let v = 0; v < 6; v++) {
      for (const t of raiderTypes) this.warmQueue.push([t, RAIDER_TEAM, v]);
      for (let team = 0; team < 4; team++) for (const t of factionTypes) this.warmQueue.push([t, team, v]);
    }
    this.audio.play('horn');
    this.ui.banner('Prepare for battle', `${ROUNDS.firstPrep} seconds to recruit and upgrade. B opens the shop${this.mode === 'client' ? '' : ', Enter starts early'}.`);
  }

  // Compile the shaders for effects that appear later (spells, arrows, bolts) now, so their first
  // appearance in battle doesn't stall a frame.
  warmup() {
    const grp = new THREE.Group();
    const P = this.projectiles;
    grp.add(new THREE.Mesh(P.fireGeo, P.fireMat), new THREE.Mesh(P.iceGeo, P.iceMat), new THREE.Mesh(P.arrowGeo, P.arrowMat), new THREE.Mesh(P.rockGeo, P.rockMat));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
    grp.add(new THREE.LineSegments(lg, this.magic.boltMat));
    grp.position.copy(this.camera.position);
    this.scene.add(grp);
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* not fatal */ }
    this.scene.remove(grp);
  }

  spawnLord(f) {
    const lv = f.heroLv;
    const t = UNIT_TYPES.lord;
    const u = new Unit(this, 'lord', f.team, f.castle.spawnPoint, {
      name: f.lord,
      hp: t.hp + lv.vitality * 30,
      dmg: t.dmg * (1 + lv.strength * 0.12),
      armor: t.armor + lv.armor * 3,
    });
    u.homeCastle = f.castle;
    u.slot = 3;
    u.setOrder('defend');
    this.units.push(u);
    f.hero = u;
    return u;
  }

  refreshHero(f) {
    if (f.isPlayer) { f.player.recalc(); return; }
    const h = f.hero;
    if (!h || !h.alive) return;
    const t = UNIT_TYPES.lord;
    const lv = f.heroLv;
    const ratio = h.hp / h.maxHp;
    h.maxHp = t.hp + lv.vitality * 30;
    h.hp = h.maxHp * ratio;
    h.dmg = t.dmg * (1 + lv.strength * 0.12);
    h.armor = t.armor + lv.armor * 3;
  }

  trainMult(f) { return 1 + 0.15 * f.training; }

  recruit(f, type) {
    const c = f.castle;
    const p = c.spawnPoint.clone();
    p.x += (Math.random() - 0.5) * 6;
    p.z += (Math.random() - 0.5) * 6;
    const t = UNIT_TYPES[type];
    const k = this.trainMult(f);
    const u = new Unit(this, type, f.team, p, { hp: Math.round(t.hp * k), dmg: t.dmg * k });
    u.homeCastle = c;
    u.slot = this.units.filter((o) => o.team === f.team && !o.isHero).length;
    u.setOrder('defend');
    this.units.push(u);
    return u;
  }

  applyTraining(f) {
    const k = this.trainMult(f), prev = 1 + 0.15 * (f.training - 1);
    for (const u of this.units) {
      if (u.team !== f.team || u.isHero || !u.alive) continue;
      u.maxHp = u.maxHp / prev * k;
      u.hp = u.hp / prev * k;
      u.dmg = u.dmg / prev * k;
    }
  }

  troopCount(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team && !u.isHero && !u.isGiant) n++;
    return n;
  }
  siegeCount(team) { return this.siege.filter((s) => s.alive && s.team === team).length; }

  siegeTarget(f) {
    if (f.siegeTarget && !f.siegeTarget.fallen && !allied(f.siegeTarget.team, f.team)) return f.siegeTarget;
    let best = null, bd = Infinity;
    for (const c of this.castles) {
      if (c.fallen || allied(c.team, f.team)) continue;
      const d = c.center.distanceTo(f.castle.center);
      if (d < bd) { bd = d; best = c; }
    }
    f.siegeTarget = best;
    return best;
  }
  targetName(f) { const t = this.siegeTarget(f); return t ? this.factions[t.team].name : 'none'; }

  buildSiege(f, type) {
    const c = f.castle;
    const p = c.gateOut.clone().add(c.dirToWorld(0, 4));
    p.x += (Math.random() - 0.5) * 4;
    const s = new SiegeEngine(this, type, f.team, p, this.siegeTarget(f));
    this.siege.push(s);
    return s;
  }

  // ---------------- queries ----------------
  castleAt(p) {
    for (const c of this.castles) if (c.isInside(p)) return c;
    return null;
  }

  enemyNear(p, r, team) {
    let found = false;
    this.grid.query(p.x, p.z, r, (u) => {
      if (!found && u.alive && !allied(u.team, team) && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r) found = true;
    });
    return found;
  }

  raidersNear(castle, r) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === RAIDER_TEAM && Math.hypot(u.pos.x - castle.center.x, u.pos.z - castle.center.z) < r) n++;
    return n;
  }

  siegeAt(p, team, pad = 0.3) {
    for (const s of this.siege) {
      if (!s.alive || allied(s.team, team)) continue;
      if (Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < s.radius + pad && p.y < s.pos.y + 3.5 && p.y > s.pos.y - 0.5) return s;
    }
    return null;
  }

  // Nearest hostile character or siege engine for an AI unit.
  findEnemy(unit, radius, anchor, leash) {
    let best = null, bd = Infinity;
    const consider = (o) => {
      if (!o.alive || allied(o.team, unit.team)) return;
      const d = Math.hypot(o.pos.x - unit.pos.x, o.pos.z - unit.pos.z);
      if (d > radius) return;
      if (!unit.ranged && o.pos.y - unit.pos.y > 2.4) return; // up on a wall: unreachable
      if (anchor && leash < Infinity && Math.hypot(o.pos.x - anchor.x, o.pos.z - anchor.z) > leash) return;
      let score = d;
      if (o.isSiege) score -= 4;
      if (unit.ranged && o.post) score += 6;
      if (score < bd) { bd = score; best = o; }
    };
    if (radius <= 50) this.grid.query(unit.pos.x, unit.pos.z, radius, consider);
    else { for (const u of this.units) consider(u); for (const h of this.humans) consider(h); }
    for (const s of this.siege) consider(s);
    return best;
  }

  freePost(castle, unit) {
    for (const p of castle.posts) {
      if (p.reserved === unit && !p.occupant) return p;
    }
    for (const p of castle.posts) {
      if (p.occupant || (p.seg && !p.seg.alive)) continue;
      if (p.reserved && p.reserved !== unit && p.reserved.alive && p.reserved.order === 'defend' && !p.reserved.post) continue;
      p.reserved = unit;
      return p;
    }
    return null;
  }

  gateShouldOpen(castle) {
    if (this.state !== 'playing') return false;
    let friend = false, foe = false;
    const p = castle.gatePos;
    this.grid.query(p.x, p.z, 9, (u) => {
      if (!u.alive) return;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (allied(u.team, castle.team) && d < 7) friend = true;
      else if (!allied(u.team, castle.team) && d < 9) foe = true;
    });
    return friend && !foe;
  }

  pushOutOfWalls(castle) {
    for (const u of this.units) if (u.alive && castle.inFootprint(u.pos, 2) && !u.post) this.physics.resolve(u.pos, u.radius, u.pos.y, u.height, u.team);
    for (const h of this.humans) {
      if (castle.inFootprint(h.pos, 2)) this.physics.resolve(h.pos, h.radius, h.pos.y, h.height, h.team);
    }
  }
  pushOutOfGate(castle) { this.pushOutOfWalls(castle); }

  // ---------------- messages to people ----------------
  // Show something to one person (locally, or over the network for a remote player).
  deliver(player, ev) {
    if (!player) return;
    if (player === this.player) this.applyEvent(ev);
    else if (this.mode === 'host' && this.sync) this.sync.privateEvent(player, ev);
  }

  // A toast for every person; text may depend on whose screen it is: fn(viewerTeam) -> text or null.
  announce(text, colorTeam = -1, importantTeam = -99) {
    for (const h of this.humans) {
      if (h.remote && this.mode !== 'host') continue;
      const t = typeof text === 'function' ? text(h.team) : text;
      if (t) this.deliver(h, { k: 'toast', text: t, team: colorTeam, imp: importantTeam === h.team || importantTeam === 'all' });
    }
  }

  bannerAll(title, sub) {
    for (const h of this.humans) {
      if (h.remote && this.mode !== 'host') continue;
      this.deliver(h, { k: 'banner', title, sub });
    }
  }

  killFeed(attacker, victim) {
    const name = (o, viewer) => (!o ? 'The fall' : o === viewer ? 'You' : o.isTower ? 'Tower archers' : o.name);
    const team = (o) => (o && o.team !== undefined ? o.team : RAIDER_TEAM);
    const notable = victim.isHero || victim.isGiant || (victim.def && victim.def.boss);
    for (const h of this.humans) {
      if (h.remote && this.mode !== 'host') continue;
      if (!notable && attacker !== h && victim !== h) continue;
      this.deliver(h, { k: 'kill', a: [name(attacker, h), team(attacker)], v: [name(victim, h), team(victim)] });
    }
  }

  applyEvent(ev) {
    switch (ev.k) {
      case 'toast': this.ui.toast(ev.text, ev.team ?? -1, !!ev.imp); break;
      case 'banner': this.ui.banner(ev.title, ev.sub); break;
      case 'kill': this.ui.kill(ev.a, ev.v); break;
      case 'gold': this.ui.goldPopup(ev.g); break;
      case 'hit': this.ui.hitMarker(); this.player.onHitLanded(!!ev.heavy); break;
      case 'fb': this.ui.feedback(ev.text, !!ev.good); break;
      case 'stagger': this.player.stagger(ev.t); break;
      case 'shake': this.player.shake = Math.max(this.player.shake, ev.a); break;
      case 'snd': this.audio.play(ev.n, ev.p ? new THREE.Vector3(...ev.p) : null); break;
      case 'end': this.finish(ev.winner, ev.reason || ''); break;
      default: break;
    }
  }

  // ---------------- combat ----------------
  damage(target, amount, attacker, info = {}) {
    if (!this.simulating) return; // clients only show effects; the host decides damage
    if (!target || !target.alive) return;
    let dmg = amount;
    if (target.isStructure) {
      if (attacker && allied(target.team, attacker.team)) return;
      target.takeDamage(dmg, attacker);
      if (info.melee) this.audio.play('thud', target.pos);
      return;
    }
    // no friendly fire between houses on the same side (own troops and co-op allies)
    if (attacker && attacker !== target && attacker.team !== undefined && allied(target.team, attacker.team)) return;
    if (target.isSiege) {
      target.takeDamage(dmg, attacker);
      return;
    }
    // soldiers may block with shield or weapon
    if (!target.isPlayer && target.tryBlock && !info.splash && !info.magic && target.tryBlock(attacker, info)) {
      const toward = attacker.pos.clone().sub(target.pos).setY(0).normalize();
      this.fx.sparks(target.chest(new THREE.Vector3()).addScaledVector(toward, 0.5), 10);
      this.audio.play('block', target.pos);
      if (attacker.isPlayer) this.deliver(attacker, { k: 'fb', text: 'Blocked' });
      return;
    }
    // heroes guard with their shield; guarding the side the blow comes from stops it completely,
    // and doing so just as it lands parries, leaving the attacker reeling
    if (target.isPlayer && target.blocking && target.weapon === 'sword' && attacker && attacker.pos && !info.splash) {
      const fx = Math.sin(target.yaw), fz = Math.cos(target.yaw);
      const dx = attacker.pos.x - target.pos.x, dz = attacker.pos.z - target.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / d > 0.35) {
        const at = target.chest(new THREE.Vector3()).addScaledVector(new THREE.Vector3(fx, 0, fz), 0.6);
        if (info.melee && info.attackDir && target.blockDir === incomingSide(info.attackDir)) {
          target.stamina = Math.max(0, target.stamina - 4);
          if (this.time - target.blockStart < PARRY_WINDOW && attacker.stagger) {
            attacker.stagger(0.9, target);
            this.fx.sparks(at, 22);
            this.audio.play('parry', target.pos);
            this.deliver(target, { k: 'fb', text: 'Parry!', good: true });
          } else {
            this.fx.sparks(at, 10);
            this.audio.play('block', target.pos);
            this.deliver(target, { k: 'fb', text: 'Blocked' });
          }
          return;
        }
        dmg *= 1 - target.shield.block;
        target.stamina = Math.max(0, target.stamina - 8);
        this.fx.sparks(at, 8);
        this.audio.play('block', target.pos);
        if (dmg < 1) return;
      }
    }
    dmg = Math.max(1, dmg - (target.armor || 0) * (info.splash ? 0.5 : 1));
    const p = target.chest(new THREE.Vector3());
    this.fx.blood(p, info.ranged ? 5 : 9);
    if (info.melee) this.audio.play(target.def && (target.def.body === 'plate' || target.def.body === 'mail') ? 'clang' : 'hit', target.pos);
    if (attacker && attacker.isPlayer) this.deliver(attacker, { k: 'hit', heavy: (info.charge || 0) >= 0.8 });
    target.takeDamage(dmg, attacker, info);
    if (attacker && attacker.gainXp) attacker.gainXp(Math.min(dmg, 60) * 0.05);
  }

  credit(team, gold, at) {
    if (team < 0 || team > 3) return;
    const f = this.factions[team];
    if (!f || f.eliminated) return;
    const g = Math.round(gold * (f.isPlayer ? 1 : this.diff.aiGold));
    f.gold += g;
    f.earned += g;
    if (f.isPlayer && g > 0) {
      this.deliver(f.player, { k: 'gold', g });
      if (at && f.player === this.player) this.fx.gold(at);
    }
  }

  onUnitKilled(u, attacker) {
    const by = attacker && attacker.team !== undefined ? attacker.team : -1;
    const bounty = u.isHero && u.type === 'lord' ? BOUNTY.lord : (BOUNTY[u.type] || 10);
    if (by >= 0 && !allied(by, u.team)) this.credit(by, u.team === RAIDER_TEAM ? Math.round(bounty * (1 + this.round * 0.08)) : bounty, u.chest(new THREE.Vector3()));
    if (attacker) attacker.kills = (attacker.kills || 0) + 1;
    if (attacker && attacker.gainXp && by !== u.team) attacker.gainXp(5 + bounty * 0.8);
    if (by >= 0 && by <= 3) this.factions[by].kills++;
    if (u.isHero && u.type === 'lord') {
      const f = this.factions[u.team];
      f.heroDeaths++;
      f.respawnT = PLAYER.respawnBase + PLAYER.respawnPerDeath * (f.heroDeaths - 1);
      this.announce(`${f.lord} has been slain!${f.castle.fallen ? ' Their house is finished.' : ''}`, u.team);
    }
    this.killFeed(attacker, u);
  }

  onPlayerKilled(attacker, p = this.player) {
    const f = this.factions[p.team];
    f.heroDeaths++;
    f.respawnT = PLAYER.respawnBase + PLAYER.respawnPerDeath * (f.heroDeaths - 1);
    const by = attacker ? attacker.team : -1;
    if (by >= 0 && by <= 3 && by !== p.team) this.credit(by, BOUNTY.hero);
    this.killFeed(attacker, p);
    this.audio.play('death', p.pos);
    if (f.castle.fallen) p.notify('You have fallen, and your castle is gone.', true);
    else if (p.remote || this.mode !== 'single') this.announce((t) => (t === p.team ? null : `${p.name} has been slain!`), p.team);
  }

  onSiegeDestroyed(s, attacker) {
    const by = attacker ? attacker.team : -1;
    if (by !== s.team) this.credit(by, BOUNTY[s.type] || 100, s.chest(new THREE.Vector3()));
    const f = this.factions[s.team];
    if (f && f.isPlayer) f.player.notify(`Your ${s.name.toLowerCase()} was destroyed`, true);
  }

  onStructureDestroyed(part, attacker) {
    const owner = this.factions[part.team];
    if (part.kind === 'gate') {
      if (attacker && !allied(attacker.team, part.team)) this.credit(attacker.team, BOUNTY.gate);
      this.announce((t) => (t === part.team ? 'Your gate has been broken!' : `${owner.name}'s gate has been broken!`), part.team, part.team);
    } else if (part.kind === 'wall') {
      this.announce((t) => (t === part.team ? 'Your wall has been breached!' : `A breach opens in ${owner.name}'s wall!`), part.team, part.team);
    }
  }

  onCastleFallen(castle, attacker) {
    const f = this.factions[castle.team];
    if (attacker && !allied(attacker.team, castle.team)) this.credit(attacker.team, BOUNTY.keep);
    this.audio.play('collapse', castle.keep.pos);
    this.announce((t) => (t === castle.team ? 'YOUR KEEP HAS FALLEN! You can no longer respawn. Survive!' : `${f.name}'s keep has fallen!`), castle.team, castle.team);
    for (const u of this.units) if (u.alive && u.team === castle.team && u.order === 'defend') u.setOrder('charge');
    for (const p of castle.posts) if (p.occupant) p.occupant.leavePost();
  }

  // ---------------- rounds ----------------
  startWave() {
    this.round++;
    this.phase = 'wave';
    this.waveT = 0;
    this.audio.play('horn', this.camera.position);
    const r = this.round;
    const boss = r % 5 === 0;
    this.bannerAll(`Round ${r}`, r % 10 === 0 ? 'The raiders have brought GIANTS!' : boss ? 'A Raider Warlord leads this horde!' : r === ROUNDS.warRound ? 'The rival lords declare war!' : 'Raiders approach!');
    for (const c of this.castles) {
      if (c.fallen) continue;
      const n = Math.round(Math.min(28, 3 + r * 2.2) * this.diff.wave);
      const list = [];
      const archers = r >= 2 ? Math.floor(n * 0.25) : 0;
      const brutes = r >= 4 ? Math.floor(n * 0.12) + Math.floor((r - 4) / 3) : 0;
      const riders = r >= 5 ? Math.floor(n * 0.15) : 0;
      const shamans = r >= 6 ? 1 + Math.floor(n * 0.06) : 0;
      for (let i = 0; i < n; i++) {
        const k = i - archers - brutes - riders;
        list.push(i < archers ? 'raiderArcher' : i < archers + brutes ? 'brute' : i < archers + brutes + riders ? 'raiderRider' : k < shamans ? 'shaman' : 'raider');
      }
      if (boss) list.push('warlord');
      if (r % 10 === 0) list.push('giant');
      const ang = Math.atan2(c.center.x, c.center.z);
      list.forEach((type, i) => {
        const side = i % 2 ? 1 : -1;
        const a = ang + side * (0.55 + Math.random() * 0.15);
        const rad = WORLD.half - 34 + Math.random() * 10;
        const p = new THREE.Vector3(Math.sin(a) * rad + (Math.random() - 0.5) * 8, 0, Math.cos(a) * rad + (Math.random() - 0.5) * 8);
        this.spawnQueue.push({ t: i * 0.35 + Math.random() * 0.5, type, pos: p, castle: c });
      });
      if (r >= 4 && r % 3 === 1) this.spawnQueue.push({ t: 2, siege: 'ram', pos: this.edgePoint(ang, 0.6), castle: c });
      if (r >= 7 && r % 2 === 1) this.spawnQueue.push({ t: 3, siege: 'catapult', pos: this.edgePoint(ang, -0.6), castle: c });
    }
  }

  edgePoint(ang, off) {
    const a = ang + off;
    return new THREE.Vector3(Math.sin(a) * (WORLD.half - 40), 0, Math.cos(a) * (WORLD.half - 40));
  }

  processSpawns(dt) {
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.spawnQueue.splice(i, 1);
      if (s.castle.fallen) continue;
      if (s.siege) {
        const k = 1 + 0.1 * this.round;
        const e = new SiegeEngine(this, s.siege, RAIDER_TEAM, s.pos, s.castle, { hp: Math.round((s.siege === 'ram' ? 700 : 450) * k) });
        this.siege.push(e);
        continue;
      }
      const u = new Unit(this, s.type, RAIDER_TEAM, s.pos, makeRaiderStats(s.type, this.round, this.diff));
      u.setOrder('assault', s.castle);
      this.units.push(u);
    }
  }

  endWave() {
    this.phase = 'prep';
    this.phaseT = ROUNDS.prep;
    const bonus = ROUNDS.survivalBonus(this.round);
    for (const f of this.factions) if (!f.eliminated) this.credit(f.team, bonus);
    this.bannerAll(`Round ${this.round} survived`, `+${bonus} gold. Next wave in ${ROUNDS.prep}s`);
    for (const h of this.humans) h.arrows = Math.min(PLAYER.maxArrows, h.arrows + 10);
    // every soldier who lived through the wave learns from it
    for (const u of this.units) if (u.alive && u.team !== RAIDER_TEAM && !u.isHero) u.gainXp(10);
  }

  updateRounds(dt) {
    if (this.phase === 'prep') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.startWave();
    } else {
      this.waveT += dt;
      const raiders = this.units.some((u) => u.alive && u.team === RAIDER_TEAM) || this.siege.some((s) => s.alive && s.team === RAIDER_TEAM);
      if ((!raiders && this.spawnQueue.length === 0) || this.waveT > ROUNDS.maxWaveTime) this.endWave();
    }
  }

  // ---------------- orders ----------------
  // Give an order to a team's troops. hold = { pos: [x,y,z], yaw } for 'hold'.
  order(team, cmd, group = 'all', hold = null) {
    const f = this.factions[team];
    const p = f.player;
    const inGroup = (u) => group === 'all' || (group === 'infantry' && u.kind === 'infantry') || (group === 'archers' && u.kind === 'archer') || (group === 'cavalry' && u.kind === 'cavalry');
    const troops = this.sortForFormation(this.units.filter((u) => u.alive && u.team === team && !u.isHero && !u.isGiant && inGroup(u)));
    if (!troops.length) { p.notify('You have no troops in that group. Recruit some in the shop (B).'); return; }
    let data = null;
    let label = '';
    if (cmd === 'hold') {
      data = { pos: new THREE.Vector3(...hold.pos), yaw: hold.yaw };
      label = 'Hold this position!';
    } else if (cmd === 'assault') {
      data = this.siegeTarget(f);
      if (!data) return;
      label = `Assault ${this.factions[data.team].name}!`;
    } else label = { follow: 'Follow me!', charge: 'Charge!', defend: 'Defend the castle!' }[cmd];
    troops.forEach((u, i) => { u.slot = i; u.setOrder(cmd, data); if (cmd === 'hold') u.orderData = data; });
    p.notify(`${GROUP_NAMES[group]}: ${label}`);
    p.lastOrder = cmd;
    p.sound('order');
  }

  // infantry in front, archers behind them, cavalry at the back
  sortForFormation(list) {
    const rank = { infantry: 0, archer: 1, cavalry: 2 };
    return list.sort((a, b) => (rank[a.kind] ?? 0) - (rank[b.kind] ?? 0));
  }

  setFormation(team, formation) {
    const f = this.factions[team];
    if (!FORMATIONS[formation]) return;
    f.formation = formation;
    const troops = this.sortForFormation(this.units.filter((u) => u.alive && u.team === team && !u.isHero && !u.isGiant && (u.order === 'follow' || u.order === 'hold')));
    troops.forEach((u, i) => { u.slot = i; u.thinkTimer = 0; });
    if (f.player) {
      const tips = { line: 'balanced ranks.', shieldwall: 'tight ranks, shields locked; they hold their ground and block far more.', loose: 'spread out, harder to hit with arrows and fire.' };
      f.player.notify(`Formation: ${FORMATIONS[formation].name}, ${tips[formation]}`);
      f.player.sound('order');
    }
  }

  localFormation() {
    const f = this.localFaction;
    const keys = Object.keys(FORMATIONS);
    const next = keys[(keys.indexOf(f.formation || 'line') + 1) % keys.length];
    if (this.mode === 'client') { f.formation = next; this.net.toHost({ a: 'formation', f: next }); this.ui.toast(`Formation: ${FORMATIONS[next].name}`); return; }
    this.setFormation(this.localTeam, next);
  }

  hasGiant(team) { return this.units.some((u) => u.alive && u.isGiant && u.team === team); }

  // A castle calls up a giant, which marches on the faction's siege target.
  summonGiant(f) {
    const c = f.castle;
    const p = c.gateOut.clone().add(c.dirToWorld(0, 6));
    const k = this.trainMult(f);
    const t = UNIT_TYPES.giant;
    const u = new Unit(this, 'giant', f.team, p, { hp: Math.round(t.hp * k), dmg: t.dmg * k });
    u.homeCastle = c;
    u.yaw = c.rot;
    const target = this.siegeTarget(f);
    if (target) u.setOrder('assault', target); else u.setOrder('charge');
    this.units.push(u);
    this.audio.play('roar', p);
    const tName = target ? this.factions[target.team].name : 'the enemy';
    this.announce((v) => (v === f.team ? `Your giant rises and lumbers toward ${tName}!` : v === (target && target.team) ? `${f.name} has summoned a GIANT, and it is coming for you!` : `${f.name} has summoned a giant!`), f.team, target ? target.team : -99);
    return u;
  }

  onUnitRankUp(u) {
    const f = this.factions[u.team];
    if (!f || !f.isPlayer || u.rank < 4) return;
    // don't flood the screen when several soldiers rank up together
    if (this.time - (f.lastRankNote || -99) < 3) return;
    f.lastRankNote = this.time;
    f.player.notify(`Your ${u.name} has risen to rank ${'★'.repeat(u.rank)}`);
  }

  promotable(team) {
    return this.units.filter((u) => u.alive && u.team === team && PROMOTIONS[u.type] && u.rank >= RANKS.promoteAt);
  }

  // Swap the most experienced eligible veteran for its elite type, keeping rank and orders.
  promote(f) {
    const list = this.promotable(f.team).sort((a, b) => b.xp - a.xp);
    const old = list[0];
    if (!old) return false;
    old.leavePost();
    const type = PROMOTIONS[old.type];
    const t = UNIT_TYPES[type];
    const k = this.trainMult(f);
    const u = new Unit(this, type, f.team, old.pos, { hp: Math.round(t.hp * k), dmg: t.dmg * k, variant: old.variant });
    u.homeCastle = old.homeCastle;
    u.slot = old.slot;
    u.yaw = old.yaw;
    u.setOrder(old.order, old.orderData);
    if (old.order === 'hold') u.orderData = old.orderData;
    u.xp = old.xp;
    for (let r = 2; r <= old.rank; r++) { u.rank = r; u.applyRankBonus(); }
    old.remove();
    this.units[this.units.indexOf(old)] = u;
    this.fx.gold(u.chest(new THREE.Vector3()));
    if (f.player) f.player.notify(`A veteran ${old.name} is promoted to ${u.name}!`);
    return true;
  }

  // The local player presses an order key.
  localOrder(cmd) {
    const p = this.player;
    let hold = null;
    if (cmd === 'hold') {
      const d = p.lookDir();
      const at = p.pos.clone().addScaledVector(new THREE.Vector3(d.x, 0, d.z).normalize(), 6);
      hold = { pos: [at.x, at.y, at.z], yaw: p.yaw };
    }
    if (this.mode === 'client') {
      this.net.toHost({ a: 'order', cmd, group: p.group || 'all', hold, target: this.localFaction.siegeTarget ? this.localFaction.siegeTarget.team : -1 });
      p.lastOrder = cmd;
      return;
    }
    this.order(p.team, cmd, p.group || 'all', hold);
  }

  // Is this hero standing at their own castle's gate lever?
  leverNear(p) {
    const c = this.castles[p.team];
    if (!c || c.fallen || !c.gate.alive || !p.alive) return null;
    return Math.hypot(p.pos.x - c.leverPos.x, p.pos.z - c.leverPos.z) < 2.6 && Math.abs(p.pos.y - c.center.y) < 2 ? c : null;
  }

  toggleGate(team) {
    const c = this.castles[team];
    const f = this.factions[team];
    if (!c || c.fallen || !c.gate.alive) return;
    c.setGateLocked(!c.gateLocked);
    this.audio.play('thud', c.gatePos);
    if (f.player) f.player.notify(c.gateLocked ? 'Gate barred: nobody gets through, not even your own troops.' : 'Gate unbarred: it opens for your troops again.');
  }

  localToggleGate() {
    if (this.mode === 'client') {
      const c = this.localFaction.castle;
      c.setGateLocked(!c.gateLocked); // show it at once; the host confirms
      this.audio.play('thud', c.gatePos);
      this.net.toHost({ a: 'gate' });
      return;
    }
    this.toggleGate(this.localTeam);
  }

  setSiegeTarget(castle) {
    this.localFaction.siegeTarget = castle;
    if (this.mode === 'client') this.net.toHost({ a: 'target', team: castle.team });
  }

  handleInput() {
    const i = this.input;
    if (i.hit('KeyB')) { if (this.ui.tab === 'orders') this.ui.tab = 'army'; this.ui.toggleShop(); return; }
    if (this.ui.shopOpen) return;
    if (i.hit('F1') || i.hit('KeyZ')) this.localOrder('follow');
    if (i.hit('F2') || i.hit('KeyX')) this.localOrder('hold');
    if (i.hit('F3') || i.hit('KeyC')) this.localOrder('charge');
    if (i.hit('F4') || i.hit('KeyV')) this.localOrder('defend');
    if (i.hit('KeyT')) this.localOrder('assault');
    if (i.hit('KeyF')) this.localFormation();
    if (i.hit('KeyO')) { this.ui.openOrders(); return; }
    if (i.hit('Enter') && this.round === 0 && this.phase === 'prep' && this.simulating && this.phaseT > 3) {
      this.phaseT = 3;
      this.announce('The battle begins!');
    }
    if (i.hit('KeyG')) {
      const p = this.player;
      p.group = GROUPS[(GROUPS.indexOf(p.group || 'all') + 1) % GROUPS.length];
      this.ui.toast(`Selected group: ${GROUP_NAMES[p.group]}`);
    }
  }

  // Buy for a faction; reports the result to that faction's player.
  buyFor(team, id) {
    const f = this.factions[team];
    const r = buy(this, f, id);
    if (r === true) { if (!f.player.remote) f.player.sound('buy'); } // remote buyers already heard it
    else { f.player.sound('deny'); f.player.notify(r); }
    return r;
  }

  buyForPlayer(id) {
    if (this.mode === 'client') {
      // respond instantly: spend the gold locally, the host's next update confirms it
      const f = this.localFaction;
      const item = SHOP_BY_ID[id];
      if (item) {
        const can = item.can(this, f);
        const cost = Math.round(item.cost(this, f));
        if (can !== true || f.gold < cost) { this.audio.play('deny'); this.ui.toast(can !== true ? can : 'Not enough gold'); return can; }
        f.gold -= cost;
      }
      this.audio.play('buy');
      this.net.toHost({ a: 'buy', id });
      return true;
    }
    return this.buyFor(this.localTeam, id);
  }

  // ---------------- heroes / elimination ----------------
  updateHeroes(dt) {
    for (const f of this.factions) {
      if (f.eliminated) continue;
      const alive = f.hero && f.hero.alive;
      if (!alive) {
        if (f.castle.fallen) {
          this.eliminate(f);
          continue;
        }
        f.respawnT -= dt;
        if (f.respawnT <= 0) {
          if (f.isPlayer) {
            f.player.spawn(f.castle.spawnPoint, f.castle.rot);
            f.player.notify('You rise again at your keep.');
          } else {
            this.spawnLord(f);
          }
        }
      }
    }
    if (this.state !== 'playing') return;
    const left = this.factions.filter((f) => !f.eliminated);
    const humansLeft = left.filter((f) => f.isPlayer);
    if (this.coop) {
      const allies = this.factions.filter((f) => alliance.has(f.team));
      const rivals = this.factions.filter((f) => !alliance.has(f.team));
      if (allies.every((f) => f.eliminated)) this.endGame(-1, 'coop-lost');
      else if (rivals.length && rivals.every((f) => f.eliminated)) this.endGame('alliance');
    } else if (this.mode === 'single') {
      if (this.localFaction.eliminated) this.endGame(left.length === 1 ? left[0].team : -1);
      else if (left.length === 1) this.endGame(left[0].team);
    } else if (left.length <= 1 || humansLeft.length === 0) {
      this.endGame(left.length === 1 ? left[0].team : -1);
    }
  }

  eliminate(f) {
    if (f.eliminated) return;
    f.eliminated = true;
    this.announce((t) => (t === f.team ? 'Your house has been destroyed. You can keep watching the battle.' : `${f.name} has been destroyed!`), f.team, f.team);
    if (f.ai) f.ai.assault = null;
  }

  endGame(winner, reason = '') {
    if (this.mode === 'host' && this.sync) this.sync.sendEnd(winner, reason);
    this.finish(winner, reason);
  }

  finish(winner, reason = '') {
    if (this.state === 'over') return;
    this.state = 'over';
    if (reason === 'coop-lost') reason = `All allied castles have fallen. You held out for ${this.round} rounds together.`;
    const won = winner === this.localTeam || (winner === 'alliance' && alliance.has(this.localTeam));
    this.audio.play(won ? 'victory' : 'defeat');
    this.input.unlock();
    this.ui.gameOver(won, winner, reason);
  }

  // A remote player left an online game: their house is taken over by an AI lord.
  dropHuman(p) {
    const f = this.factions[p.team];
    this.humans = this.humans.filter((h) => h !== p);
    p.removeBody();
    f.isPlayer = false;
    f.player = null;
    f.lord = LORD_NAMES[f.team];
    f.hero = null;
    if (!f.eliminated && !f.castle.fallen) {
      this.spawnLord(f);
      f.ai = new LordAI(this, f);
    }
    this.announce(`${p.name} left. An AI lord takes over ${f.name}.`, f.team);
  }

  // ---------------- main loop ----------------
  update(dt) {
    if (this.state === 'loading' || this.state === 'menu') {
      this.menuCamera(dt);
      this.grass.update(dt, this.camera.position);
      for (const c of this.castles) c.update(dt, this.time);
      this.time += dt;
      return;
    }
    // single player pauses the world; online games keep running underneath menus
    const frozen = this.mode === 'single' && (this.paused || this.ui.shopOpen);
    if (frozen) return;
    // brief hit-stop when a blow lands (single player only)
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.12; }
    this.time += dt;
    const controlling = this.state === 'playing' && !this.paused;
    if (controlling) this.handleInput();
    if (this.mode === 'single' && this.ui.shopOpen) return;

    // spatial grid
    this.grid.clear();
    for (const u of this.units) if (u.alive) this.grid.insert(u);
    for (const h of this.humans) if (h.alive) this.grid.insert(h);

    const p = this.player;
    if (p.alive) p.update(dt, controlling && !this.ui.shopOpen ? this.input : this.input.idle);
    else this.deathCamera(dt);
    for (const h of this.humans) {
      if (h.remote) h.remoteUpdate(dt);
      h.updateHorse(dt);
    }
    this.audio.setListener(this.camera.position);

    if (this.simulating) {
      for (const u of this.units) u.update(dt);
      for (const s of this.siege) s.update(dt);
    } else {
      this.sync.update(dt);
    }
    this.projectiles.update(dt);
    for (const c of this.castles) {
      c.update(dt, this.time);
      if (this.simulating) this.updateTowers(c, dt);
    }
    this.fx.update(dt);
    this.magic.update(dt);
    this.grass.update(dt, this.camera.position);

    if (this.simulating && this.state === 'playing') {
      this.updateRounds(dt);
      this.processSpawns(dt);
      for (const f of this.factions) if (f.ai) f.ai.update(dt);
      this.updateHeroes(dt);
      // trickle income while the castle stands
      for (const f of this.factions) if (!f.eliminated && !f.castle.fallen) { f.goldFrac = (f.goldFrac || 0) + dt * 1.5; if (f.goldFrac >= 1) { f.gold += 1; f.earned += 1; f.goldFrac -= 1; } }
    }
    if (this.mode === 'host' && this.sync) this.sync.update(dt);
    if (this.simulating) this.cleanup(dt);
    this.updateLod();
    if (this.warmQueue && this.warmQueue.length) {
      const t0 = performance.now();
      while (this.warmQueue.length && performance.now() - t0 < 2) prewarmSoldier(...this.warmQueue.shift());
    }
    followShadow(this.lights.sun, this.camera.position);
  }

  // Pick each soldier's level of detail by distance to the camera (giants stay detailed further out).
  updateLod() {
    const c = this.camera.position;
    for (const u of this.units) {
      const d2 = (u.pos.x - c.x) ** 2 + (u.pos.z - c.z) ** 2;
      const s = u.isGiant ? 3 : 1;
      u.setLod(d2 < (32 * s) ** 2 ? 0 : d2 < (85 * s) ** 2 ? 1 : d2 < 260 * 260 ? 2 : 3);
    }
  }

  updateTowers(c, dt) {
    if (!c.towerLevel || c.fallen) return;
    for (let i = 0; i < c.towers.length; i++) {
      c.towerCd[i] -= dt;
      if (c.towerCd[i] > 0) continue;
      c.towerCd[i] = 2.6 / c.towerLevel;
      const top = c.towers[i].top;
      let best = null, bd = 48;
      this.grid.query(top.x, top.z, 48, (u) => {
        if (!u.alive || allied(u.team, c.team)) return;
        const d = Math.hypot(u.pos.x - top.x, u.pos.z - top.z);
        if (d < bd && d > 4) { bd = d; best = u; }
      });
      if (best) {
        this.projectiles.shootArrow(top.clone(), best, c.team, 14 + 4 * c.towerLevel, c.towerShooter, 0.03);
      }
    }
  }

  cleanup() {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (!u.alive && u.deathT > 12) { u.remove(); this.units.splice(i, 1); }
    }
    for (let i = this.siege.length - 1; i >= 0; i--) {
      const s = this.siege[i];
      if (!s.alive && s.deadT > 15) { this.scene.remove(s.mesh); this.siege.splice(i, 1); }
    }
  }

  deathCamera(dt) {
    const c = this.localFaction.castle;
    this.menuCamT += dt * 0.15;
    const t = this.menuCamT;
    this.camera.position.set(c.center.x + Math.sin(t) * 48, c.center.y + 30, c.center.z + Math.cos(t) * 48);
    this.camera.lookAt(c.center.x, c.center.y + 4, c.center.z);
    if (this.camera.fov !== 75) { this.camera.fov = 75; this.camera.updateProjectionMatrix(); }
  }

  menuCamera(dt) {
    this.menuCamT += dt * 0.05;
    const t = this.menuCamT;
    const c = this.castles[PLAYER_TEAM];
    this.camera.position.set(c.center.x + Math.sin(t) * 70, 34, c.center.z - 40 + Math.cos(t) * 30);
    this.camera.lookAt(c.center.x, 6, c.center.z);
    followShadow(this.lights.sun, c.center);
  }
}

export { CASTLE };
