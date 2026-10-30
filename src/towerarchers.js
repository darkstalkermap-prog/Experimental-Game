// The archers on a castle's corner towers (the Tower Archers upgrade: one to three on each tower). They are drawn as one baked mesh
// (upgrades.js) and shoot from the tower (Game.updateTowers), but they are men like any other: an arrow, a spell or a blade that reaches
// one hurts him, and a fallen archer leaves his tower shooting slower until another climbs up to take his place. The battle is run
// where the world is (single player or host); a guest gets which of them are down with the castle (Castle.netState).
import * as THREE from 'three';
import { CASTLE } from './config.js';
import { allied } from './teams.js';

// where they stand on the (+,+) tower roof (castle-local metres, mirrored for the other three), and whether they face east
export const ARCHER_SPOTS = [[22, 26.2, 0], [26.2, 22, 1], [26.2, 24, 1]];
export const TOWER_ARCHER = {
  hp: 70, armor: 2,
  respawn: 30,        // seconds before another archer takes a fallen one's place
  radius: 0.42, height: 1.85,
};
const PER = ARCHER_SPOTS.length;

class TowerArcher {
  constructor(c, tower, i) {
    const t = c.towers[tower], [ax, az] = ARCHER_SPOTS[i];
    this.castle = c;
    this.tower = tower;
    this.slot = i;
    this.team = c.team;
    this.isTowerArcher = true;
    this.name = 'Tower archer';
    this.pos = c.toWorld(t.sx * ax, t.sz * az, CASTLE.towerH);
    this.radius = TOWER_ARCHER.radius;
    this.height = TOWER_ARCHER.height;
    this.maxHp = TOWER_ARCHER.hp;
    this.hp = this.maxHp;
    this.armor = TOWER_ARCHER.armor;
    this.on = false;     // the upgrade has put him there
    this.down = false;   // fallen, waiting for the next man
    this.downT = 0;
    this.alive = false;  // on and not down (what everyone that hurts things looks at)
  }

  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z); }
  aimPoint(out) { return out.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z); }

  takeDamage(amount, attacker) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp > 0) return;
    const g = this.castle.game;
    this.hp = 0;
    this.down = true;
    this.downT = 0;
    this.alive = false;
    this.castle.archersDirty = true;
    g.fx.blood(this.chest(new THREE.Vector3()), 14);
    g.audio.play('death', this.pos);
    if (attacker && attacker.isPlayer) g.deliver(attacker, { k: 'fb', text: 'Tower archer down', good: true });
  }
}

// the castle's archers (twelve places, made the first time they are asked for), brought up to date with its tower level
export function archersOf(c) {
  if (!c.archers) {
    c.archers = [];
    for (let t = 0; t < c.towers.length; t++) for (let i = 0; i < PER; i++) c.archers.push(new TowerArcher(c, t, i));
  }
  const L = c.fallen ? 0 : Math.min(PER, c.towerLevel || 0);
  for (const a of c.archers) {
    const on = a.slot < L;
    if (on !== a.on) { a.on = on; a.down = false; a.hp = a.maxHp; c.archersDirty = true; }
    a.alive = a.on && !a.down;
  }
  return c.archers;
}

// the living archers on one tower
export function livingOn(c, tower) {
  let n = 0;
  for (const a of archersOf(c)) if (a.tower === tower && a.alive) n++;
  return n;
}

// where the battle is run: a fallen archer's place is taken again after a while
export function tickArchers(c, dt) {
  for (const a of archersOf(c)) {
    if (!a.on || !a.down) continue;
    if ((a.downT += dt) >= TOWER_ARCHER.respawn) { a.down = false; a.hp = a.maxHp; a.alive = true; c.archersDirty = true; }
  }
}

// is there an archer of another side than `team` whose body this point is in? (pad widens him; skip: the ones to look past)
export function archerAt(g, pt, team, pad, skip = null) {
  const top = CASTLE.baseY + CASTLE.towerH;
  if (pt.y < top - 0.1 || pt.y > top + TOWER_ARCHER.height + 0.1) return null;   // (nowhere near a tower roof: the usual answer)
  for (const c of g.castles) {
    if (!c || !c.towerLevel || allied(c.team, team)) continue;
    if (Math.abs(pt.y - c.center.y - CASTLE.towerH) > TOWER_ARCHER.height + 0.2) continue;
    if (Math.abs(pt.x - c.center.x) > CASTLE.H + 12 || Math.abs(pt.z - c.center.z) > CASTLE.H + 12) continue;
    for (const a of archersOf(c)) {
      if (!a.alive || (skip && skip.has(a))) continue;
      const dx = pt.x - a.pos.x, dz = pt.z - a.pos.z, r = a.radius + pad;
      if (dx * dx + dz * dz > r * r || pt.y < a.pos.y || pt.y > a.pos.y + a.height) continue;
      return a;
    }
  }
  return null;
}

// every archer of another side within r metres of (x, z) and dy of height y
export function eachArcher(g, team, x, z, r, y, dy, fn) {
  for (const c of g.castles) {
    if (!c || !c.towerLevel || allied(c.team, team)) continue;
    if (Math.abs(x - c.center.x) > CASTLE.H + 12 + r || Math.abs(z - c.center.z) > CASTLE.H + 12 + r) continue;
    for (const a of archersOf(c)) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      if (d - a.radius > r || (y !== null && Math.abs(a.pos.y - y) > dy)) continue;
      fn(a, d);
    }
  }
}

// for the guests: which of the archers are down, as bits
export function downMask(c) {
  let m = 0;
  if (c.archers) c.archers.forEach((a, i) => { if (a.down) m |= 1 << i; });
  return m;
}
export function applyDownMask(c, m) {
  const list = archersOf(c);
  list.forEach((a, i) => {
    const down = !!(m & (1 << i)) && a.on;
    if (down !== a.down) { a.down = down; a.alive = a.on && !down; c.archersDirty = true; }
  });
}
