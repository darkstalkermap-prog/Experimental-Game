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

function blocked(ax, az, bx, bz, c) {
  return segHitsSquare(ax, az, bx, bz, c.center.x, c.center.z, H + 0.6) || crossesTower(ax, az, bx, bz, c);
}

// Steer around any castle (walls and corner towers) lying between pos and goal.
export function avoidCastles(game, pos, goal) {
  for (const c of game.castles) {
    const cx = c.center.x, cz = c.center.z;
    const dx = pos.x - cx, dz = pos.z - cz;
    if (Math.abs(dx) < H && Math.abs(dz) < H) continue; // inside / on the walls: entries handle it
    if (Math.abs(goal.x - cx) < H - 2 && Math.abs(goal.z - cz) < H - 2) continue; // goal inside: handled by entries
    if (!blocked(pos.x, pos.z, goal.x, goal.z, c)) continue;
    if (Math.abs(dx) < OB && Math.abs(dz) < OB) {
      // hugging the walls: step away from the wall first
      if (Math.abs(dx) > Math.abs(dz)) return new THREE.Vector3(cx + Math.sign(dx) * (OB + 1.5), 0, pos.z);
      return new THREE.Vector3(pos.x, 0, cz + Math.sign(dz) * (OB + 1.5));
    }
    let best = null, bestCost = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const kx = cx + sx * CORNER, kz = cz + sz * CORNER;
      if (blocked(pos.x, pos.z, kx, kz, c)) continue;
      const cost = Math.hypot(kx - pos.x, kz - pos.z) + Math.hypot(goal.x - kx, goal.z - kz);
      if (cost < bestCost) { bestCost = cost; best = new THREE.Vector3(kx, 0, kz); }
    }
    if (best) return best;
  }
  return goal;
}

export function entriesFor(castle, team) {
  const list = [];
  const g = castle.gate;
  if (!g.alive || (allied(g.team, team) && !castle.gateLocked)) list.push({ out: castle.gateOut, in: castle.gateIn, gate: true });
  for (const w of castle.walls) if (!w.alive) list.push({ out: w.outPt, in: w.inPt });
  return list;
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Returns the point a unit should walk toward to reach `goal`.
// Sets unit.blockedBy to the gate when the target castle is sealed.
export function navigate(game, unit, goal) {
  const pos = unit.pos;
  unit.blockedBy = null;
  const nav = unit.nav;
  if (nav) {
    nav.t += 0.3;
    if (nav.phase === 'enter') {
      if (nav.t > 9 || nav.castle.isInside(pos, -1.5) || d2(pos, nav.entry.in) < 2) unit.nav = null;
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
      return avoidCastles(game, pos, goalCastle.gateOut);
    }
    let best = entries[0], bc = Infinity;
    for (const e of entries) { const c = d2(pos, e.out) + d2(e.in, goal); if (c < bc) { bc = c; best = e; } }
    if (d2(pos, best.out) < 3.2 || (goalCastle.inFootprint(pos, 0.5) && d2(pos, best.in) < 10)) {
      unit.nav = { phase: 'enter', castle: goalCastle, entry: best, t: 0 };
      return best.in;
    }
    return avoidCastles(game, pos, best.out);
  }
  return avoidCastles(game, pos, goal);
}
