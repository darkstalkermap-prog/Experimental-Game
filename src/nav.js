// Lightweight navigation: route around castles and through gates / wall breaches.
import * as THREE from 'three';
import { CASTLE } from './config.js';
import { allied } from './teams.js';

const H = CASTLE.H;
const TC = H + CASTLE.towerOff;        // corner tower centres
const OB = TC + CASTLE.towerR + 0.2;  // obstacle square incl. corner towers
const CORNER = OB + 3.5;

function segHitsSquare(ax, az, bx, bz, cx, cz, h) {
  // slab test of segment a->b against the square centred at c with half-size h
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const check = (p, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  return check(ax, dx, cx - h, cx + h) && check(az, dz, cz - h, cz + h);
}

function crossesTower(ax, az, bx, bz, c) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (segHitsSquare(ax, az, bx, bz, c.center.x + sx * TC, c.center.z + sz * TC, CASTLE.towerR + 0.3)) return true;
  }
  return false;
}

// (the walls reach out 1 m with the Thicken Walls upgrade, so the keep-clear square is a little wider than the wall)
function blocked(ax, az, bx, bz, c) {
  return segHitsSquare(ax, az, bx, bz, c.center.x, c.center.z, H + 1.6) || crossesTower(ax, az, bx, bz, c);
}

// Steer around any castle (walls and corner towers) lying between pos and goal. mem is the walker's own memory (an
// object it keeps): once it has picked the corner to go round by it sticks to it until it gets there, and never
// turns straight back to the corner it has just left, so nobody dithers between two corners or stalls on one.
export function avoidCastles(game, pos, goal, mem = null) {
  if (mem && mem.goal && Math.hypot(goal.x - mem.goal.x, goal.z - mem.goal.z) > 6) { mem.corner = null; mem.left = null; }
  if (mem) mem.goal = { x: goal.x, z: goal.z };
  for (const c of game.castles) {
    const cx = c.center.x, cz = c.center.z;
    const dx = pos.x - cx, dz = pos.z - cz;
    if (Math.abs(dx) < H && Math.abs(dz) < H) continue; // inside / on the walls: entries handle it
    if (Math.abs(goal.x - cx) < H - 2 && Math.abs(goal.z - cz) < H - 2) continue; // goal inside: handled by entries
    if (!blocked(pos.x, pos.z, goal.x, goal.z, c)) { if (mem && mem.castle === c) mem.corner = mem.left = null; continue; }
    if (Math.abs(dx) < OB && Math.abs(dz) < OB) {
      // hugging the walls: step away from the wall first
      if (Math.abs(dx) > Math.abs(dz)) return new THREE.Vector3(cx + Math.sign(dx) * (OB + 1.5), 0, pos.z);
      return new THREE.Vector3(pos.x, 0, cz + Math.sign(dz) * (OB + 1.5));
    }
    if (mem && mem.castle !== c) { mem.corner = mem.left = null; }
    if (mem && mem.corner) {
      // still on the way to the corner chosen earlier?
      const k = mem.corner;
      if (Math.hypot(k.x - pos.x, k.z - pos.z) > 1.5 && !blocked(pos.x, pos.z, k.x, k.z, c)) return k;
      mem.left = k;
      mem.corner = null;
    }
    // go round by a corner. One you have just left is no use, and a corner from which the goal can actually be seen
    // beats one that only looks short on the map
    let best = null, bestCost = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const kx = cx + sx * CORNER, kz = cz + sz * CORNER;
      const d1 = Math.hypot(kx - pos.x, kz - pos.z);
      if (d1 < 1.5 || blocked(pos.x, pos.z, kx, kz, c)) continue;
      if (mem && mem.left && Math.hypot(mem.left.x - kx, mem.left.z - kz) < 1) continue;
      const cost = d1 + Math.hypot(goal.x - kx, goal.z - kz) + (blocked(kx, kz, goal.x, goal.z, c) ? 1000 : 0);
      if (cost < bestCost) { bestCost = cost; best = new THREE.Vector3(kx, 0, kz); }
    }
    if (best) { if (mem) { mem.corner = best; mem.castle = c; } return best; }
  }
  return goal;
}

// Can someone of `team` go through this castle's gate? A broken gate lets everybody through; a standing one only its
// own side (and allies), when it swings open for them (Game.gateShouldOpen), and not at all while it is barred. To an
// enemy a standing gate is shut, open or not (Physics.lets): he batters it or finds a breach.
export function gatePassable(castle, team) {
  const g = castle.gate;
  if (!g.alive) return true;
  if (castle.gateLocked) return false;
  return allied(g.team, team);
}

export function entriesFor(castle, team) {
  const list = [];
  if (gatePassable(castle, team)) list.push({ out: castle.gateOut, in: castle.gateIn, gate: true });
  for (const w of castle.walls) if (!w.alive) list.push({ out: w.outPt, in: w.inPt });
  return list;
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Inside a courtyard the keep stands in the way: anyone whose straight line to where he is going crosses it (a defender
// sent to a place behind the keep, an attacker walking round to his own face of it) goes round by one of its corners,
// instead of walking into its wall and staying there. A goal on or in the keep itself (striking it) is let through.
function skirtKeep(c, pos, goal, radius) {
  const k = c.keep && c.keep.collider;
  if (!k || !k.active || !c.keep.alive) return goal;
  const cx = (k.minX + k.maxX) / 2, cz = (k.minZ + k.maxZ) / 2, hx = (k.maxX - k.minX) / 2, hz = (k.maxZ - k.minZ) / 2;
  goal = outOfKeep(c, goal, radius);
  const m = radius * 0.9;   // (a soldier sliding along a face, pressed against it, is not blocked by it)
  const hits = (ax, az, bx, bz) => segHitsRect(ax, az, bx, bz, cx, cz, hx + m, hz + m);
  if (!hits(pos.x, pos.z, goal.x, goal.z)) return goal;
  const ox = hx + radius + 1.2, oz = hz + radius + 1.2;
  let best = null, bestCost = Infinity;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const kx = cx + sx * ox, kz = cz + sz * oz;
    const d1 = Math.hypot(kx - pos.x, kz - pos.z);
    if (d1 < 1.2 || hits(pos.x, pos.z, kx, kz)) continue;
    const cost = d1 + Math.hypot(goal.x - kx, goal.z - kz) + (hits(kx, kz, goal.x, goal.z) ? 1000 : 0);
    if (cost < bestCost) { bestCost = cost; best = { x: kx, z: kz }; }
  }
  return best ? new THREE.Vector3(best.x, 0, best.z) : goal;
}

// A place to stand that falls on or inside a keep (a soldier's place in the line behind his lord, when the lord stands with
// his back to his keep) is moved out to the foot of the keep's nearest wall, where he can stand. Returns p itself when clear.
export function outOfKeep(c, p, radius) {
  const k = c && c.keep && c.keep.alive && c.keep.collider;
  if (!k || !k.active) return p;
  const m = radius + 0.3;
  const x0 = k.minX - m, x1 = k.maxX + m, z0 = k.minZ - m, z1 = k.maxZ + m;
  if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) return p;
  const e = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], i = e.indexOf(Math.min(...e));
  return new THREE.Vector3(i === 0 ? x0 : i === 1 ? x1 : p.x, p.y, i === 2 ? z0 : i === 3 ? z1 : p.z);
}

function segHitsRect(ax, az, bx, bz, cx, cz, hx, hz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const check = (p, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return p > lo && p < hi;
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    return t0 < t1;
  };
  return check(ax, dx, cx - hx, cx + hx) && check(az, dz, cz - hz, cz + hz);
}

// A place to stand and strike the keep from, just off its wall: each soldier takes his own spot along the keep's
// faces, a little way round from where he first came at it (spread by his id, and by how many have come). Kept on the unit (out) until the target changes.
export function keepSpot(keep, unit, out) {
  const k = keep.collider;
  const off = unit.radius + 0.35;
  const x0 = k.minX - off, x1 = k.maxX + off, z0 = k.minZ - off, z1 = k.maxZ + off;
  const w = x1 - x0, d = z1 - z0, per = 2 * (w + d);
  if (unit.keepAt !== keep) {
    // where he is now, as a distance round the edge (from the x0,z0 corner, along +x first)
    const px = Math.min(x1, Math.max(x0, unit.pos.x)), pz = Math.min(z1, Math.max(z0, unit.pos.z));
    const e = [pz - z0, x1 - px, z1 - pz, px - x0];   // how far from each side
    const side = e.indexOf(Math.min(...e));
    let s = side === 0 ? px - x0 : side === 1 ? w + (pz - z0) : side === 2 ? w + d + (x1 - px) : 2 * w + d + (z1 - pz);
    const h = ((unit.id * 0.6180339887) % 1) * 2 - 1;
    // How far round he may go grows with the number at this keep (about 0.9 m of wall each, two deep): a small band
    // stays together on the face it comes at and hits hard there; a big host fans out over that face and the two beside
    // it, up to a third of the way round either way, instead of piling up on the door.
    let n = 0;
    for (const o of unit.game.units) if (o.alive && o.team === unit.team && (o.target === keep || (o.order === 'assault' && o.orderData === keep.castle))) n++;
    const reach = Math.min(per / 3, Math.max(2, n * 0.45));
    s += h * reach;
    unit.keepFan = reach > 6;   // (a band that fits on one face strikes from wherever it reaches the wall: see Unit.update)
    unit.keepAt = keep; unit.keepS = ((s % per) + per) % per;
  }
  let s = unit.keepS;
  if (s < w) return out.set(x0 + s, 0, z0);
  s -= w; if (s < d) return out.set(x1, 0, z0 + s);
  s -= d; if (s < w) return out.set(x1 - s, 0, z1);
  s -= w; return out.set(x0, 0, z1 - s);
}

// Returns the point a unit should walk toward to reach `goal`.
// Sets unit.blockedBy to the gate when the target castle is sealed.
export function navigate(game, unit, goal) {
  const wp = route(game, unit, goal);
  const c = game.castleAt(unit.pos);
  return c ? skirtKeep(c, unit.pos, wp, unit.radius || 0.5) : wp;
}

function route(game, unit, goal) {
  const pos = unit.pos;
  unit.blockedBy = null;
  const nav = unit.nav;
  if (nav) {
    nav.t += 0.3;
    if (nav.phase === 'enter') {
      // (an enemy gate that was open when the walk in began may have swung shut since: think again)
      if (nav.t > 9 || nav.castle.isInside(pos, -1.5) || d2(pos, nav.entry.in) < 2 || (nav.entry.gate && !gatePassable(nav.castle, unit.team))) unit.nav = null;
      else return nav.entry.in;
    } else {
      if (nav.t > 9 || !nav.castle.inFootprint(pos, 1.5) || d2(pos, nav.entry.out) < 2) unit.nav = null;
      else return nav.entry.out;
    }
  }
  const myCastle = game.castleAt(pos);
  const goalCastle = game.castleAt(goal);
  if (myCastle && myCastle !== goalCastle) {
    const entries = entriesFor(myCastle, unit.team);
    if (!entries.length) { unit.blockedBy = myCastle.gate.alive ? myCastle.gate : null; return myCastle.gateIn; }
    let best = entries[0], bc = Infinity;
    for (const e of entries) { const c = d2(pos, e.in) + d2(e.out, goal); if (c < bc) { bc = c; best = e; } }
    if (d2(pos, best.in) < 3) { unit.nav = { phase: 'exit', castle: myCastle, entry: best, t: 0 }; return best.out; }
    return best.in;
  }
  if (goalCastle && goalCastle !== myCastle) {
    const entries = entriesFor(goalCastle, unit.team);
    if (!entries.length) {
      unit.blockedBy = goalCastle.gate;
      return avoidCastles(game, pos, goalCastle.gateOut, unit.avoid);
    }
    let best = entries[0], bc = Infinity;
    for (const e of entries) { const c = d2(pos, e.out) + d2(e.in, goal); if (c < bc) { bc = c; best = e; } }
    if (d2(pos, best.out) < 3.2 || (goalCastle.inFootprint(pos, 0.5) && d2(pos, best.in) < 10)) {
      unit.nav = { phase: 'enter', castle: goalCastle, entry: best, t: 0 };
      return best.in;
    }
    return avoidCastles(game, pos, best.out, unit.avoid);
  }
  return avoidCastles(game, pos, goal, unit.avoid);
}
