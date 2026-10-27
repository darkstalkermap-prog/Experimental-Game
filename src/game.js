// Game state and the main simulation loop.
// Modes: 'single' (you + 3 AI lords), 'host' (this browser simulates and serves up to 3 other people),
// 'client' (this browser mirrors the host's battle and controls one hero).
import * as THREE from 'three';
import {
  PLAYER_TEAM, RAIDER_TEAM, TEAM_NAMES, LORD_NAMES, WAVES, START_GOLD, DIFFICULTY, BOUNTY, clock,
  UNIT_TYPES, SIEGE_TYPES, TROOP_CAP, PLAYER, CASTLE, FORMATIONS, RANKS, PROMOTIONS, WORLD, OBJECTIVES, HILL,
} from './config.js';
import { Physics, CASTLE_SITES } from './physics.js';
import { createSky, createLights, createTerrain, createForest, createCentrePiece, followShadow } from './world.js';
import { materials } from './materials.js';
import { Castle } from './castle.js';
import { Unit } from './units.js';
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
import { Abilities } from './classes.js';
import { AimRing } from './aimring.js';
import { Hill } from './hill.js';
import { prewarmSoldier } from './models.js';
import { allied, setSides } from './teams.js';
import { XP, killXp, MAX_LEVEL } from './heroes.js';

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
    this.abilities = new Abilities(this);
    this.aimRing = new AimRing(this);
    this.hill = new Hill(this);
    this.objective = 'conquest';   // 'conquest' (the main mode) or 'koth' (King of the Hill)
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
    this.objective = OBJECTIVES[setup.objective] ? setup.objective : 'conquest';
    this.hill.reset();
    // co-op: the human houses fight on one side against the AI lords. With four humans there are no AI lords,
    // so the game becomes two teams of two: Blue + Red against Green + Gold.
    this.coop = !!setup.coop && setup.players.length > 1;
    const humanTeams = setup.players.map((p) => p.team);
    this.sides = !this.coop ? [] : humanTeams.length >= 4 ? [[0, 1], [2, 3]] : [humanTeams];
    setSides(this.sides);
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficultyName = difficulty;
    this.state = 'playing';
    this.round = 0;
    this.phase = 'prep';
    this.phaseT = WAVES.firstPrep;
    this.spawnQueue = [];

    const lp = this.player;
    lp.team = setup.localTeam;
    this.humans = [lp];
    const byTeam = new Map(setup.players.map((p) => [p.team, p]));
    lp.name = byTeam.get(lp.team)?.name || 'You';
    lp.setClass(byTeam.get(lp.team)?.cls || 'knight');
    lp.rebuildWeapons();
    for (const p of setup.players) {
      if (p.team === lp.team) continue;
      this.humans.push(new Player(this, null, { remote: true, team: p.team, name: p.name, netId: p.netId, cls: p.cls }));
    }

    this.factions = this.castles.map((c, i) => {
      const human = this.humans.find((h) => h.team === i) || null;
      return {
        team: i, name: TEAM_NAMES[i], lord: human ? human.name : LORD_NAMES[i], isPlayer: !!human, player: human, castle: c,
        gold: START_GOLD, spent: 0, earned: 0, troopCap: TROOP_CAP.start, training: 0,
        hero: human, heroDeaths: 0, respawnT: 0,
        eliminated: false, kills: 0, siegeTarget: null, formation: 'line', levies: 0,
        recruitRole: 'garrison', armyOrder: null,
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
      // King of the Hill: the rival lords send a few of their first men up to the hill at once, so nobody can camp on it unopposed
      if (this.hill.live) {
        for (const f of this.factions) {
          if (f.isPlayer) continue;
          this.units.filter((u) => u.team === f.team && !u.isHero).slice(0, HILL.squad).forEach((u) => this.hill.sendSquad(u));
        }
      }
    }
    if (this.mode === 'host') this.sync = new HostSync(this);
    if (this.mode === 'client') this.sync = new ClientSync(this);
    this.warmup();
    // prepare every soldier look in the background (a few ms per frame) so new arrivals never stutter
    this.warmQueue = [];
    const factionTypes = ['swordsman', 'spearman', 'archer', 'knight', 'horseman', 'lancer', 'longbowman', 'engineer', 'giant'];
    for (let v = 0; v < 6; v++) {
      for (let team = 0; team < 4; team++) for (const t of factionTypes) this.warmQueue.push([t, team, v]);
    }
    this.audio.play('horn');
    const hillLine = this.objective === 'koth' ? ` Hold the hill in the middle of the map for ${clock(HILL.target)} and you win outright (Y: send your army up there).` : '';
    this.ui.banner(this.objective === 'koth' ? 'King of the Hill' : 'Prepare for battle', `The first armies march in ${clock(WAVES.firstPrep)}, so buy and upgrade now. After that a new army leaves every castle every ${WAVES.interval} seconds.${hillLine} B: shop and roster · M: map · Q / R: your abilities.`);
  }

  // Compile the shaders for effects that appear later (spells, arrows, bolts) now, so their first
  // appearance in battle doesn't stall a frame.
  warmup() {
    const grp = new THREE.Group();
    const P = this.projectiles;
    grp.add(new THREE.Mesh(P.fireGeo, P.fireMat), new THREE.Mesh(P.arrowGeo, P.arrowMat), new THREE.Mesh(P.rockGeo, P.rockMat));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
    grp.add(new THREE.LineSegments(lg, this.magic.boltMat));
    grp.position.copy(this.camera.position);
    this.scene.add(grp);
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* not fatal */ }
    this.scene.remove(grp);
  }

  // The rival lords grow tougher as the war goes on (a lord who falls comes back stronger).
  spawnLord(f) {
    const t = UNIT_TYPES.lord;
    const k = (1 + 0.03 * Math.max(0, this.round - 1)) * this.diff.enemyStat;
    const u = new Unit(this, 'lord', f.team, f.castle.spawnPoint, {
      name: f.lord,
      hp: Math.round(t.hp * k),
      dmg: t.dmg * k,
      armor: t.armor + Math.floor(this.round / 8),
    });
    u.homeCastle = f.castle;
    u.slot = 3;
    u.setOrder('defend');
    this.units.push(u);
    f.hero = u;
    return u;
  }

  trainMult(f) { return 1 + 0.15 * f.training; }

  // Bought troops join the castle garrison (they defend and man the walls). Wave soldiers (lane = true) march out.
  recruit(f, type, lane = null) {
    const c = f.castle;
    const p = c.spawnPoint.clone();
    p.x += (Math.random() - 0.5) * 6;
    p.z += (Math.random() - 0.5) * 6;
    const t = UNIT_TYPES[type];
    const k = lane ? this.waveScale(f) : this.trainMult(f);
    const u = new Unit(this, type, f.team, p, { hp: Math.round(t.hp * k), dmg: t.dmg * k });
    u.homeCastle = c;
    u.lane = !!lane;
    if (lane) u.structMult *= 1 + WAVES.siegeGrowth * Math.max(0, this.round - 1);   // later armies break gates faster
    u.slot = this.units.filter((o) => o.team === f.team && !o.isHero).length;
    u.setOrder('defend');
    this.units.push(u);
    // a lord who has chosen to take new recruits into the army sends them straight to the colours
    if (!lane && f.isPlayer && f.recruitRole === 'army') { this.assignRole(f, u, 'army'); this.reslot(f.team); }
    return u;
  }

  // ---------------- the roster ----------------
  // Every bought soldier is in the garrison (stays home and defends), the army (follows its lord and takes orders) or
  // the lane (marches out with the waves). The lord can move anyone between the three.
  assignRole(f, u, role) {
    if (role === 'garrison') {
      u.lane = false; u.army = false;
      u.setOrder('defend');
    } else if (role === 'army') {
      u.lane = false; u.army = true;
      const o = f.armyOrder || { cmd: 'follow', data: null };
      u.setOrder(o.cmd, o.data);
      if (o.cmd === 'hold') u.orderData = o.data;
    } else {
      u.lane = true; u.army = false;
      const t = this.siegeTarget(f);
      if (t) u.setOrder('assault', t); else u.setOrder('charge');
    }
  }

  // d: { role, ids?: [unit ids], type?: 'archer' }; with neither ids nor type everybody changes
  setRoles(team, d) {
    const f = this.factions[team];
    if (!f || !['garrison', 'army', 'lane'].includes(d.role)) return 0;
    const ids = Array.isArray(d.ids) ? new Set(d.ids) : null;
    const list = this.units.filter((u) => u.alive && u.team === team && !u.isHero && !u.isGiant && !u.isCrew && !u.crewOf
      && u.role !== d.role && (ids ? ids.has(u.id) : d.type ? u.type === d.type : true));
    for (const u of list) this.assignRole(f, u, d.role);
    this.reslot(team);
    if (list.length > 1 && f.player) {
      const label = { garrison: 'to the garrison', army: 'into your army', lane: 'out with the waves' }[d.role];
      f.player.notify(`${list.length} soldiers ${d.role === 'army' ? 'join' : 'go'} ${label}`);
      f.player.sound('order');
    }
    return list.length;
  }

  // formation places for everyone who follows or holds a position
  reslot(team) {
    const troops = this.sortForFormation(this.units.filter((u) => u.alive && u.team === team && u.army && (u.order === 'follow' || u.order === 'hold')));
    troops.forEach((u, i) => { u.slot = i; u.thinkTimer = 0; });
  }

  // the local player's choice in the Army tab
  localRoles(d) {
    if (this.mode === 'client') {
      this.net.toHost({ a: 'role', ...d });
      // show the change at once; the host's next snapshot confirms it
      this.rolePending = this.rolePending || new Map();
      for (const u of this.units) {
        if (!u.alive || u.team !== this.localTeam || u.isHero || u.isGiant || u.isCrew) continue;
        if (d.ids ? !d.ids.includes(u.id) : d.type ? u.type !== d.type : false) continue;
        u.lane = d.role === 'lane'; u.army = d.role === 'army';
        this.rolePending.set(u.id, { role: d.role, until: this.time + 1.5 });
      }
      return;
    }
    this.setRoles(this.localTeam, d);
  }

  localRecruitRole(role) {
    const f = this.localFaction;
    f.recruitRole = role;
    if (this.mode === 'client') { this.localRolePickUntil = this.time + 2; this.net.toHost({ a: 'recruitRole', role }); }
  }

  applyTraining(f) {
    const k = this.trainMult(f), prev = 1 + 0.15 * (f.training - 1);
    for (const u of this.units) {
      if (u.team !== f.team || u.isHero || u.isCrew || !u.alive) continue;
      u.maxHp = u.maxHp / prev * k;
      u.hp = u.hp / prev * k;
      u.dmg = u.dmg / prev * k;
    }
  }

  troopCount(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team && !u.isHero && !u.isGiant && !u.isCrew) n++;
    return n;
  }
  // soldiers marching out with the waves, and bought troops staying home
  laneCount(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team && u.lane) n++;
    return n;
  }
  // bought troops at the barracks: the garrison and the army that follows its lord (this is what the limit counts)
  garrisonCount(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team && !u.isHero && !u.isGiant && !u.isCrew && !u.lane) n++;
    return n;
  }
  // how many soldiers hold each role: staying home, marching with the lord, or sent out with the waves
  roleCounts(team) {
    const c = { garrison: 0, army: 0, lane: 0 };
    for (const u of this.units) {
      if (!u.alive || u.team !== team || u.isHero || u.isGiant || u.isCrew) continue;
      c[u.lane ? 'lane' : u.army ? 'army' : 'garrison']++;
    }
    return c;
  }
  siegeCount(team) { return this.siege.filter((s) => s.alive && !s.abandoned && s.team === team).length; }

  // The castle a house's army is marching on: the one it was told to attack, otherwise its lane partner.
  // Odd waves pair Blue-Green and Red-Gold, even waves Blue-Gold and Red-Green, so every wave meets one
  // coming the other way and the fronts rotate round the map. Fallen or allied partners are skipped.
  lanePartner(f) {
    const pairs = (this.round || 1) % 2 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
    return this.castles[pairs.find((pr) => pr.includes(f.team)).find((t) => t !== f.team)];
  }
  siegeTarget(f) {
    if (f.siegeTarget && !f.siegeTarget.fallen && !allied(f.siegeTarget.team, f.team)) return f.siegeTarget;
    f.siegeTarget = null;
    const open = (c) => c && !c.fallen && !allied(c.team, f.team);
    const partner = this.lanePartner(f);
    if (open(partner)) return partner;
    let best = null, bd = Infinity;
    for (const c of this.castles) {
      if (!open(c)) continue;
      const d = c.center.distanceTo(f.castle.center);
      if (d < bd - 0.01) { bd = d; best = c; }
    }
    return best;
  }
  targetName(f) {
    const t = this.siegeTarget(f);
    return t ? this.factions[t.team].name + (f.siegeTarget ? '' : ' (auto)') : 'none';
  }

  buildSiege(f, type) {
    const c = f.castle;
    const p = c.gateOut.clone().add(c.dirToWorld(0, 4));
    p.x += (Math.random() - 0.5) * 4;
    const grow = 1 + WAVES.siegeGrowth * Math.max(0, this.round - 3);   // engines built later hit harder
    const d = SIEGE_TYPES[type];
    const s = new SiegeEngine(this, type, f.team, p, this.siegeTarget(f), { dmg: Math.round(d.dmg * grow), hp: Math.round(d.hp * Math.min(2, 1 + 0.015 * this.round)) });
    this.siege.push(s);
    s.spawnCrew();
    return s;
  }

  // The engine this hero could climb aboard: any empty one, or an engine of their own side.
  engineNear(p) {
    if (!p.alive || p.drive || p.mounted) return null;
    let best = null, bd = 5.5;
    for (const e of this.siege) {
      if (!e.alive || e.driver || e.driven || !(e.abandoned || allied(e.team, p.team))) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bd && Math.abs(e.pos.y - p.pos.y) < 3) { bd = d; best = e; }
    }
    return best;
  }

  localBoard(e) {
    if (this.mode === 'client') { this.net.toHost({ a: 'board', id: e.id }); return; }
    this.boardEngine(this.player, e);
  }
  localLeave() {
    if (this.mode === 'client') { this.net.toHost({ a: 'unboard' }); return; }
    this.leaveEngine(this.player);
  }

  boardEngine(p, e) {
    if (!e || !p.alive || p.drive || p.mounted) return false;
    if (!e.alive || e.driver || !(e.abandoned || allied(e.team, p.team)) || Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 8) {
      p.notify('You cannot take that engine.');
      return false;
    }
    e.setDriver(p);
    p.beginDrive(e);
    p.notify(e.type === 'ram' ? 'You take the ram: W/S roll, A/D turn, hold the left button to batter, E to climb out.' : 'You take the catapult: W/S roll, A/D turn, left button looses a boulder where you look, E to climb out.');
    return true;
  }

  leaveEngine(p, forced = false) {
    const e = p.drive;
    if (!e) return;
    p.endDrive();   // steps out behind the engine
    if (e.driver === p) e.clearDriver();
    if (forced) {
      p.hp = Math.max(1, p.hp - p.maxHp * 0.15);
      p.notify('Your engine is wrecked! You are thrown clear.', true);
    }
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

  siegeAt(p, team, pad = 0.3) {
    for (const s of this.siege) {
      if (!s.alive || allied(s.team, team)) continue;
      if (Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < s.radius + pad && p.y < s.pos.y + 3.5 && p.y > s.pos.y - 0.5) return s;
    }
    return null;
  }

  // Nearest hostile character or siege engine for an AI unit.
  findEnemy(unit, radius, anchor, leash, skip = null) {
    let best = null, bd = Infinity;
    const consider = (o) => {
      if (o === skip || !o.alive || allied(o.team, unit.team) || o.drive) return;
      if (o.isSiege && o.abandoned && !o.driver) return;   // nobody smashes an empty engine: they take it over
      const d = Math.hypot(o.pos.x - unit.pos.x, o.pos.z - unit.pos.z);
      if (d > radius) return;
      if (!unit.ranged && o.pos.y - unit.pos.y > 2.4) return; // up on a wall: unreachable
      if (anchor && leash < Infinity && Math.hypot(o.pos.x - anchor.x, o.pos.z - anchor.z) > leash) return;
      let score = d;
      if (o.isSiege) score -= 1;
      if (o.crewOf) score -= 3;   // cut down the crew
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

  // The gate swings open for friends and shuts when an enemy is at it. Shut, it is solid for everybody (Physics.resolve),
  // so nobody walks through a closed gate. It never shuts on a friend standing in the gateway, the lord (a hero)
  // standing near it can always call it open to lead a sally, and so can soldiers who have been ordered out (charge or
  // assault) and have reached it: a command to march out is obeyed, besieged or not.
  gateShouldOpen(castle) {
    if (this.state !== 'playing') return false;
    let friend = false, foe = false, hold = false;
    const p = castle.gatePos;
    this.grid.query(p.x, p.z, 9, (u) => {
      if (!u.alive) return;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (allied(u.team, castle.team)) {
        if (u.pos.y - castle.center.y > 3.5) return;   // archers up on the wall walk don't work the gate
        if (d < 8) friend = true;
        if (u.isHero && d < 6) hold = true;
        else if (!u.isPlayer && d < 4.5 && (u.order === 'assault' || u.order === 'charge')) hold = true;   // ordered out: the gate yields
        else if (d < 3) {
          const l = castle.toLocal(u.pos.x, u.pos.z);   // standing in the gateway itself
          if (Math.abs(l.x) < CASTLE.gateW / 2 + 0.5 && l.z > CASTLE.H - CASTLE.wallT - 0.1 && l.z < CASTLE.H + 0.1) hold = true;
        }
      } else if (d < 5.5) foe = true;
    });
    return friend && (hold || !foe);
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

  // ---------------- hero experience ----------------
  // Pay experience for something brought down: in full to the hero who did it, a share to every hero (and ally hero)
  // fighting close by. who: whoever struck the blow (a hero, a soldier, a tower, an engine); at: where it happened.
  heroXp(who, amount, at) {
    if (!this.simulating || !(amount > 0)) return;
    for (const h of this.humans) {
      if (!h.alive) continue;
      if (who === h) h.gainXp(amount, 'kill');
      else if (who && who.team !== undefined && allied(who.team, h.team) && at && h.pos.distanceTo(at) < XP.shareRange) h.gainXp(amount * XP.share, 'share');
    }
  }

  // A hero has reached a new level: a flare for everyone nearby, and the full story for its owner.
  onHeroLevel(p) {
    this.fx.levelUp(p.pos);
    this.audio.play('levelup', p.pos);
    this.deliver(p, { k: 'lvl', n: p.level });
    if (p.level === MAX_LEVEL) this.announce((t) => (t === p.team ? null : `${p.name} has reached level ${MAX_LEVEL}!`), p.team);
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
      case 'xp': this.ui.xpPopup(ev.n); break;
      case 'lvl': this.ui.levelUp(ev.n); break;
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
        dmg *= 1 - target.blockPower;
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
    if (attacker && attacker.gainXp && !attacker.isPlayer) attacker.gainXp(Math.min(dmg, 60) * 0.05);
    if (attacker && attacker.isPlayer && !info.ranged) {
      const steal = attacker.buffs.get('lifesteal');
      if (steal) attacker.heal(dmg * steal);
    }
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
    if (by >= 0 && !allied(by, u.team)) this.credit(by, bounty, u.chest(new THREE.Vector3()));
    if (attacker) attacker.kills = (attacker.kills || 0) + 1;
    if (attacker && attacker.gainXp && !attacker.isPlayer && by !== u.team) attacker.gainXp(5 + bounty * 0.8);
    if (by >= 0 && !allied(by, u.team)) this.heroXp(attacker, killXp(u), u.pos);
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
    if (by >= 0 && !allied(by, p.team)) this.heroXp(attacker, killXp(p), p.pos);
    this.killFeed(attacker, p);
    this.audio.play('death', p.pos);
    if (f.castle.fallen) p.notify('You have fallen, and your castle is gone.', true);
    else if (p.remote || this.mode !== 'single') this.announce((t) => (t === p.team ? null : `${p.name} has been slain!`), p.team);
  }

  onSiegeDestroyed(s, attacker) {
    const by = attacker ? attacker.team : -1;
    if (by !== s.team) this.credit(by, BOUNTY[s.type] || 100, s.chest(new THREE.Vector3()));
    if (by >= 0 && !allied(by, s.team)) this.heroXp(attacker, killXp(s), s.pos);
    const f = this.factions[s.team];
    if (f && f.isPlayer) f.player.notify(`Your ${s.name.toLowerCase()} was destroyed`, true);
  }

  onStructureDestroyed(part, attacker) {
    const owner = this.factions[part.team];
    if (attacker && attacker.team !== undefined && !allied(attacker.team, part.team)) this.heroXp(attacker, part.kind === 'gate' ? XP.gate : XP.wall, part.pos || part.castle.center);
    if (part.kind === 'gate') {
      if (attacker && !allied(attacker.team, part.team)) this.credit(attacker.team, BOUNTY.gate);
      this.announce((t) => (t === part.team ? 'Your gate has been broken!' : `${owner.name}'s gate has been broken!`), part.team, part.team);
    } else if (part.kind === 'wall') {
      this.announce((t) => (t === part.team ? 'Your wall has been breached!' : `A breach opens in ${owner.name}'s wall!`), part.team, part.team);
    }
  }

  onCastleFallen(castle, attacker) {
    const f = this.factions[castle.team];
    if (attacker && !allied(attacker.team, castle.team)) { this.credit(attacker.team, BOUNTY.keep); this.heroXp(attacker, XP.keep, castle.keep.pos); }
    this.audio.play('collapse', castle.keep.pos);
    this.announce((t) => (t === castle.team ? 'YOUR KEEP HAS FALLEN! You can no longer respawn. Survive!' : `${f.name}'s keep has fallen!`), castle.team, castle.team);
    for (const u of this.units) if (u.alive && u.team === castle.team && u.order === 'defend') u.setOrder('charge');
    for (const p of castle.posts) if (p.occupant) p.occupant.leavePost();
    // the armies that were besieging it roll on by themselves: waves, engines and anyone on assault orders pick the
    // house's next target (see Unit.assaultThink and SiegeEngine.pickTarget)
    for (const o of this.factions) {
      if (!o.isPlayer || o.eliminated || o.castle.fallen || allied(o.team, castle.team)) continue;
      const wasMarching = o.siegeTarget ? o.siegeTarget === castle : this.lanePartner(o) === castle;
      if (!wasMarching) continue;
      const next = this.siegeTarget(o);
      o.player.notify(next ? `${f.name} is finished. Your armies march on ${this.factions[next.team].name}.` : `${f.name} is finished.`);
    }
  }

  // ---------------- army waves ----------------
  // Like the creep waves of a MOBA: once the preparation time is over, every castle that still stands sends a new
  // wave of soldiers marching out on a fixed timer, for the rest of the game.

  // how tough this house's wave soldiers are: drill upgrades, and a little more with every wave
  waveScale(f) {
    return this.trainMult(f) * (1 + WAVES.growth * Math.max(0, this.round - 1)) * (f.isPlayer ? 1 : this.diff.enemyStat);
  }

  waveList(f) {
    const w = this.round;
    // four soldiers at first, one more every two waves, in a steady mix of swordsmen, spearmen and archers
    const mix = ['swordsman', 'swordsman', 'spearman', 'archer', 'archer', 'swordsman', 'spearman', 'archer'];
    const n = Math.min(14, 4 + Math.floor((w - 1) / 2));
    const list = [];
    for (let i = 0; i < n; i++) list.push(mix[i % mix.length]);
    if (w >= 7 && w % 2 === 1) list.push('horseman');
    if (w >= 12 && w % 2 === 0) list.push('knight');
    // upgrades: bigger barracks send more men, elite levies add knights and riders
    const barracks = Math.round((f.troopCap - TROOP_CAP.start) / TROOP_CAP.step);
    for (let i = 0; i < barracks; i++) list.push(i % 2 ? 'archer' : 'swordsman');
    if (f.levies >= 1) list.push('knight');
    if (f.levies >= 2) list.push('horseman');
    if (f.levies >= 3) list.push('lancer');
    if (!f.isPlayer) {
      // difficulty decides how big the rival lords' waves are
      const m = Math.max(3, Math.round(list.length * this.diff.wave));
      while (list.length > m) list.pop();
      while (list.length < m) list.push(list[Math.floor(Math.random() * 4)]);
    }
    return list;
  }

  queueWave(f) {
    const free = Math.max(0, f.troopCap - this.laneCount(f.team) - this.spawnQueue.filter((q) => q.lane && q.team === f.team).length);
    this.waveList(f).slice(0, free).forEach((type, i) => {
      this.spawnQueue.push({ t: i * WAVES.spread + Math.random() * 0.25, lane: true, type, team: f.team });
    });
    // battering rams and catapults roll out with some of the waves
    const r = this.round;
    if (r >= WAVES.ramEvery && r % WAVES.ramEvery === 0) this.spawnQueue.push({ t: 2, engine: 'ram', team: f.team });
    if (r >= 5 && r % WAVES.catapultEvery === 5 % WAVES.catapultEvery) this.spawnQueue.push({ t: 3, engine: 'catapult', team: f.team });
  }

  startWave() {
    this.round++;
    this.phase = 'wave';
    this.phaseT = WAVES.interval;
    const r = this.round;
    for (const f of this.factions) {
      if (f.eliminated || f.castle.fallen) continue;
      this.credit(f.team, WAVES.wage(r));
      this.queueWave(f);
    }
    // soldiers who are still alive learn from every wave they live through
    for (const u of this.units) if (u.alive && !u.isHero && !u.isGiant) u.gainXp(3);
    for (const h of this.humans) { h.arrows = Math.min(PLAYER.maxArrows, h.arrows + 5); h.gainXp(XP.wave, 'wave'); }
    if (r === 1) {
      this.audio.play('horn', this.camera.position);
      this.bannerAll('The battle begins!', `A new army marches from every castle every ${WAVES.interval} seconds.`);
    } else if (r % 10 === 0) {
      this.audio.play('horn', this.camera.position);
      this.bannerAll(`Wave ${r}`, 'The armies grow stronger. Hold your castle, break theirs.');
    } else if (r % WAVES.ramEvery === 0) {
      this.announce('Battering rams roll out with the armies.');
    }
  }

  processSpawns(dt) {
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.spawnQueue.splice(i, 1);
      const f = this.factions[s.team];
      if (f.castle.fallen || f.eliminated) continue;
      if (s.engine) {
        if (this.siegeCount(f.team) < WAVES.siegeLimit && this.siegeTarget(f)) this.buildSiege(f, s.engine);
        continue;
      }
      const u = this.recruit(f, s.type, true);
      const target = this.siegeTarget(f);
      if (this.hill.live && !f.isPlayer && this.hill.wantsSquad(f)) this.hill.sendSquad(u);   // a few of the rival lords' men always go for the hill (King of the Hill)
      else if (target) u.setOrder('assault', target);
    }
  }

  updateWaves(dt) {
    this.phaseT -= dt;
    if (this.phaseT <= 0) this.startWave();
  }

  // ---------------- orders ----------------
  // Give an order to a team's troops. hold = { pos: [x,y,z], yaw } for 'hold'.
  order(team, cmd, group = 'all', hold = null) {
    const f = this.factions[team];
    const p = f.player;
    const inGroup = (u) => group === 'all' || (group === 'infantry' && u.kind === 'infantry') || (group === 'archers' && u.kind === 'archer') || (group === 'cavalry' && u.kind === 'cavalry');
    const troops = this.sortForFormation(this.units.filter((u) => u.alive && u.team === team && u.army && !u.crewOf && inGroup(u)));
    if (!troops.length) {
      p.notify(this.roleCounts(team).army ? 'Nobody in that group is in your army.' : 'Your army is empty. Press B → Army to choose who marches with you.');
      return;
    }
    let data = null;
    let label = '';
    if (cmd === 'hold') {
      data = { pos: new THREE.Vector3(...hold.pos), yaw: hold.yaw };
      label = hold.hill ? 'Take the hill!' : 'Hold this position!';
    } else if (cmd === 'assault') {
      data = this.siegeTarget(f);
      if (!data) return;
      label = `Assault ${this.factions[data.team].name}!`;
    } else label = { follow: 'Follow me!', charge: 'Charge!', defend: 'Defend the castle!' }[cmd];
    troops.forEach((u, i) => { u.slot = i; u.setOrder(cmd, data); if (cmd === 'hold') u.orderData = data; });
    // soldiers drafted into the army later take up the standing order
    if (group === 'all') f.armyOrder = { cmd, data: cmd === 'hold' || cmd === 'assault' ? data : null };
    p.notify(`${group === 'all' ? 'Army' : GROUP_NAMES[group]}: ${label}`);
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
    this.reslot(team);
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
    if (this.mode === 'client') { f.formation = next; this.localPickUntil = this.time + 2; this.net.toHost({ a: 'formation', f: next }); this.ui.toast(`Formation: ${FORMATIONS[next].name}`); return; }
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
    return this.units.filter((u) => u.alive && u.team === team && !u.crewOf && PROMOTIONS[u.type] && u.rank >= RANKS.promoteAt);
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
    u.lane = old.lane;
    u.army = old.army;
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
  localOrder(cmd, holdAt = null) {
    const p = this.player;
    let hold = holdAt;
    if (cmd === 'hold' && !hold) {
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

  // Army: go up to the hill in the middle and hold it (standing on your own house's side of it)
  localHillOrder() {
    if (!this.hill.live) { this.player.notify('There is no fight for the hill in Conquest. Choose King of the Hill to play for it.'); return; }
    const h = this.hill.pos, c = this.localFaction.castle.center;
    const dx = c.x - h.x, dz = c.z - h.z, l = Math.hypot(dx, dz) || 1;
    this.localOrder('hold', { pos: [h.x + (dx / l) * 4, h.y, h.z + (dz / l) * 4], yaw: Math.atan2(-dx, -dz), hill: 1 });
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

  // A hero takes up another class (their own choice, or a guest's request), if the rules allow it (Player.classBlock).
  switchClass(p, id) {
    const why = p.classBlock(id);
    if (why) { p.notify(why); p.sound('deny'); return false; }
    p.changeClass(id);
    p.notify(p.alive ? `You are now a ${p.cls.name}. Your abilities are ready in a few seconds.` : `You will respawn as a ${p.cls.name}.`);
    p.sound('order');
    if (this.mode !== 'single') this.announce((t) => (t === p.team ? null : `${p.name} is now a ${p.cls.name}.`), p.team);
    return true;
  }

  localSwitchClass(id) {
    const p = this.player;
    if (this.mode !== 'client') return this.switchClass(p, id);
    const why = p.classBlock(id);
    if (why) { this.audio.play('deny'); this.ui.toast(why); return false; }
    this.net.toHost({ a: 'class', cls: id });   // the host's next update confirms it
    return true;
  }

  setSiegeTarget(castle) {
    this.localFaction.siegeTarget = castle;   // null = let the lanes decide
    if (this.mode === 'client') { this.localPickUntil = this.time + 2; this.net.toHost({ a: 'target', team: castle ? castle.team : -1 }); }
  }

  handleInput() {
    const i = this.input;
    if (i.hit('KeyB')) { if (this.ui.tab === 'orders') this.ui.tab = 'army'; this.ui.toggleShop(); return; }
    if (this.ui.shopOpen) return;
    if (i.hit('KeyM')) this.ui.toggleMap();
    if (i.hit('F1') || i.hit('KeyZ')) this.localOrder('follow');
    if (i.hit('F2') || i.hit('KeyX')) this.localOrder('hold');
    if (i.hit('F3')) this.localOrder('charge');
    if (i.hit('F4') || i.hit('KeyV')) this.localOrder('defend');
    if (i.hit('KeyT')) this.localOrder('assault');
    if (i.hit('KeyY')) this.localHillOrder();
    if (i.hit('KeyF')) this.localFormation();
    if (i.hit('KeyO')) { this.ui.openOrders(); return; }
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
    if (!left.length) this.endGame(-1);
    else if (left.every((f) => allied(f.team, left[0].team))) this.endGame(left[0].team); // one side is left standing
    else if (this.coop && !humansLeft.length) this.endGame(-1, `Your alliance has fallen. You held out for ${this.round} waves together.`);
    else if (this.mode === 'single' ? this.localFaction.eliminated : !humansLeft.length) this.endGame(-1);
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
    const won = winner >= 0 && allied(winner, this.localTeam);
    this.audio.play(won ? 'victory' : 'defeat');
    this.input.unlock();
    this.ui.gameOver(won, winner, reason);
  }

  // A remote player left an online game: their house is taken over by an AI lord.
  dropHuman(p) {
    const f = this.factions[p.team];
    if (p.drive) this.leaveEngine(p);
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

  // How tense the music should be: calm while preparing, building as enemies come close.
  musicMood() {
    if (this.state === 'menu' || this.state === 'loading') return 0.12;
    if (this.state === 'over') return 0.05;
    const p = this.player;
    let mood = this.phase === 'prep' ? 0.1 : 0.3;
    if (p.alive) {
      let enemies = 0;
      this.grid.query(p.pos.x, p.pos.z, 45, (u) => { if (u.alive && !allied(u.team, p.team)) enemies++; });
      mood += Math.min(0.5, enemies * 0.07);
      if (this.time - p.lastHurt < 5) mood += 0.2;
    }
    if (this.enemyNear(this.localFaction.castle.gatePos, 25, this.localTeam)) mood += 0.2;   // an army at your gate
    return Math.min(1, mood);
  }

  // ---------------- main loop ----------------
  update(dt) {
    this.moodT = (this.moodT || 0) - dt;
    if (this.moodT <= 0) { this.moodT = 0.4; this.audio.setMusicIntensity(this.musicMood()); }
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
    for (const h of this.humans) if (h.alive && !h.drive) this.grid.insert(h);

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
      this.abilities.update(dt);
    } else {
      this.sync.update(dt);
    }
    this.projectiles.update(dt);
    for (const c of this.castles) {
      c.update(dt, this.time);
      if (this.simulating) this.updateTowers(c, dt);
    }
    this.fx.update(dt);
    this.abilities.updateFx(dt);
    this.aimRing.update(dt);
    this.hill.visual(dt);
    this.magic.update(dt);
    this.grass.update(dt, this.camera.position);
    for (const c of this.castles) if (this.factions[c.team]) c.syncUpgrades(this.factions[c.team]);

    if (this.simulating && this.state === 'playing') {
      this.updateWaves(dt);
      this.processSpawns(dt);
      this.hill.update(dt);
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
    let retier = 4;   // soldiers whose house has trained them further change into their new kit a few at a time
    for (const u of this.units) {
      const f = this.factions[u.team];
      if (f && retier > 0 && u.alive && u.tier !== Math.min(5, f.training || 0) && !u.isHero && !u.isGiant && !u.isCrew) { u.setTier(Math.min(5, f.training || 0)); retier--; }
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
    if (this.camera.fov !== this.player.baseFov) { this.camera.fov = this.player.baseFov; this.camera.updateProjectionMatrix(); }
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
