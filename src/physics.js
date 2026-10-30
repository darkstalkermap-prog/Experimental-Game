// Terrain heightfield + simple box colliders (walls, towers, gates, ramps).
// Characters are vertical capsules approximated by a circle in XZ plus a foot height.
import { WORLD, CASTLE, BODY, HILL, PRACTICE, PRACTICE_WORLD, practiceSite } from './config.js';
import { makeNoise, smoothstep, clamp } from './noise.js';
import { allied } from './teams.js';
import { wallHeight } from './landscape.js';

export const STEP = 0.65; // max height a character can step up
const LEDGE_KINDS = new Set(['wall', 'walk']);   // what a hero can climb onto: curtain walls and the planking of the wall walk
const STEER = { x: 0, z: 0 };   // what steerAroundTrees returns (soldiers walk round trunks, rocks and the standing stones)
export const GATE_OPEN = 0.7;   // how far a gate must have swung open (0 shut, 1 wide) before anyone can pass it

// Castle sites: index = team. rot turns castle-local +Z (gate side) toward the map centre.
export const CASTLE_SITES = [];
export function layoutCastles() {
  const d = WORLD.castleDist;
  CASTLE_SITES.length = 0;
  CASTLE_SITES.push(
    { x: 0, z: d, rot: Math.PI },
    { x: 0, z: -d, rot: 0 },
    { x: d, z: 0, rot: -Math.PI / 2 },
    { x: -d, z: 0, rot: Math.PI / 2 },
  );
}
layoutCastles();

// Over the battlements: the middle of the gap between two standing merlons nearest `t` along a wall face (merlons are
// 1.1 m wide with 0.9 m gaps, room for a hero), or `t` itself where the face has no merlons (the inner face, or a wall
// that has lost them). null: merlons stand along it but none of the gaps is wide enough.
const SPANS = [];   // (scratch: the merlons along one face, as [start, end] pairs along it)
function crenel(list, alongX, face, t, radius) {
  let n = 0;
  for (const m of list) {
    if (!m.active) continue;
    const across = alongX ? (m.minZ + m.maxZ) / 2 : (m.minX + m.maxX) / 2;
    if (Math.abs(across - face) > 1) continue;   // (the merlons stand on the other side of the wall top)
    SPANS[n++] = alongX ? m.minX : m.minZ;
    SPANS[n++] = alongX ? m.maxX : m.maxZ;
  }
  if (!n) return t;
  let best = null, bd = Infinity;
  for (let i = 0; i < n; i += 2) {
    // the gap after merlon i: up to the nearest merlon that starts beyond its end
    let next = Infinity;
    for (let j = 0; j < n; j += 2) if (SPANS[j] > SPANS[i + 1] - 1e-6 && SPANS[j] < next) next = SPANS[j];
    const gap = next - SPANS[i + 1];
    if (gap < radius * 2 + 0.04 || gap > 3) continue;
    const mid = (SPANS[i + 1] + next) / 2;
    if (Math.abs(mid - t) < bd) { bd = Math.abs(mid - t); best = mid; }
  }
  return best;
}

// Every collider is one of these, whoever made it: the scanning loops (resolve, groundHeight, pointHit, lineClear) then see a single
// object shape. With the literals the modules pass in (a dozen different key sets) those loops were megamorphic, and every read of a
// number field allocated. Modules keep using the object that add() returns (walls flip `active`, upgrades move the bounds).
class Collider {
  constructor(c) {
    this.minX = c.minX; this.maxX = c.maxX; this.minZ = c.minZ; this.maxZ = c.maxZ;
    this.top = c.top;
    this.bottom = c.bottom === undefined ? -100 : c.bottom;
    this.active = c.active === undefined ? true : c.active;
    this.passTeam = c.passTeam === undefined ? -1 : c.passTeam;
    this.kind = c.kind; this.ref = c.ref; this.team = c.team;
    this.noWalk = c.noWalk; this.noProjectile = c.noProjectile; this.heightFn = c.heightFn;
    for (const k in c) if (!(k in this)) this[k] = c[k];   // (anything else a module hangs on its colliders)
  }
}

export class Physics {
  constructor(seed = 7) {
    layoutCastles();
    this.noise = makeNoise(seed);
    this.practice = PRACTICE_WORLD.on ? practiceSite() : null;   // the practice yard flattens the ground it stands on
    this.res = 2; // metres per terrain cell
    this.n = Math.round((WORLD.half * 2) / this.res) + 1;
    this.heights = new Float32Array(this.n * this.n);
    for (let iz = 0; iz < this.n; iz++) {
      for (let ix = 0; ix < this.n; ix++) {
        const x = -WORLD.half + ix * this.res;
        const z = -WORLD.half + iz * this.res;
        this.heights[iz * this.n + ix] = this.rawHeight(x, z);
      }
    }
    this.buckets = []; // { cx, cz, r, list }
    this.cell = 16;    // grid for small loose colliders (trees, stones)
    this.grid = new Map();
  }

  gridKey(ix, iz) { return ix * 4096 + iz; }

  rawHeight(x, z) {
    const { fbm } = this.noise;
    let h = 7 * fbm(x * 0.0075 + 3.1, z * 0.0075 - 1.7, 4) + 2.2 * fbm(x * 0.03, z * 0.03, 3) + 3;
    // ring of hills at the map edge
    const edge = Math.max(Math.abs(x), Math.abs(z));
    h += wallHeight(edge, x, z, this.noise);   // (the old curve inside the play area, the ridge lines beyond it: see landscape.js)
    // gentle battlefield in the middle
    const rc = Math.hypot(x, z);
    h = h * (0.45 + 0.55 * smoothstep(25, 90, rc)) + 1.2 * (1 - smoothstep(25, 90, rc));
    // the hill in the middle: a flat top with long, gentle slopes
    h += HILL.rise * (1 - smoothstep(HILL.plateau, HILL.foot, rc));
    // flatten castle plateaus
    for (const s of CASTLE_SITES) {
      const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      const w = 1 - smoothstep(CASTLE.H + 10, CASTLE.H + 34, d);
      h = h * (1 - w) + CASTLE.baseY * w;
    }
    if (this.practice) {
      const d = Math.max(Math.abs(x - this.practice.x) - PRACTICE.hw, Math.abs(z - this.practice.z) - PRACTICE.hd);
      const w = 1 - smoothstep(PRACTICE.wallT + 3, PRACTICE.wallT + 20, d);
      h = h * (1 - w) + this.practice.y * w;
    }
    return h;
  }

  terrainHeight(x, z) {
    const fx = clamp((x + WORLD.half) / this.res, 0, this.n - 1.001);
    const fz = clamp((z + WORLD.half) / this.res, 0, this.n - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const n = this.n, H = this.heights;
    const a = H[iz * n + ix], b = H[iz * n + ix + 1], c = H[(iz + 1) * n + ix], d = H[(iz + 1) * n + ix + 1];
    // match the PlaneGeometry triangulation (diagonal from (ix,iz+1) to (ix+1,iz))
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  addBucket(cx, cz, r) {
    const b = { cx, cz, r, list: [], shots: [] };
    this.buckets.push(b);
    return b;
  }

  // Something that only stops arrows and spells (battlement merlons): soldiers walk through it, and the side it
  // belongs to (c.team) shoots through it. Keeps the movement checks cheap.
  addShotBlocker(c, bucket) {
    c = new Collider(c);
    bucket.shots.push(c);
    return c;
  }

  // c: { minX,maxX,minZ,maxZ, top, bottom=0, heightFn?, passTeam?, active, kind, ref }
  add(c, bucket = null) {
    c = new Collider(c);
    if (bucket) { bucket.list.push(c); return c; }
    const pad = 2;
    const x0 = Math.floor((c.minX - pad) / this.cell), x1 = Math.floor((c.maxX + pad) / this.cell);
    const z0 = Math.floor((c.minZ - pad) / this.cell), z1 = Math.floor((c.maxZ + pad) / this.cell);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.gridKey(ix, iz);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
    return c;
  }

  *near(x, z, pad) {
    for (const b of this.buckets) {
      if (Math.abs(x - b.cx) < b.r + pad && Math.abs(z - b.cz) < b.r + pad) yield* b.list;
    }
    const cell = this.grid.get(this.gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (cell) yield* cell;
  }

  *nearShots(x, z, pad) {
    for (const b of this.buckets) {
      if (Math.abs(x - b.cx) < b.r + pad && Math.abs(z - b.cz) < b.r + pad) yield* b.shots;
    }
  }

  topAt(c, x, z) {
    return c.heightFn ? c.heightFn(x, z) : c.top;
  }

  // Highest walkable surface under (x,z) that is reachable from footY.
  // (The collider lists are walked directly rather than through near(): a generator per call was the largest single cost of a
  // frame. The order of the lists is the order near() yields them in: castle buckets, then the loose-collider cell.)
  groundHeight(x, z, footY) {
    let g = this.terrainHeight(x, z);
    const buckets = this.buckets;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (Math.abs(x - b.cx) < b.r + 1 && Math.abs(z - b.cz) < b.r + 1) g = this.raise(b.list, x, z, footY, g);
    }
    const cell = this.grid.get(this.gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (cell) g = this.raise(cell, x, z, footY, g);
    return g;
  }

  raise(list, x, z, footY, g) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (!c.active || c.noWalk) continue;
      const t = c.heightFn ? c.heightFn(x, z) : c.top;
      if (t > g && t <= footY + STEP) g = t;
    }
    return g;
  }

  // Bend a walking direction around tree trunks and standing stones ahead, so soldiers flow around them instead
  // of pushing into them. side (+1/-1) picks which way to go round when one is dead ahead. `only` limits it to
  // one obstacle kind (siege engines roll through trunks but must go round stones).
  steerAroundTrees(x, z, dx, dz, radius, side = 1, only = null) {
    const look = 3.5;
    let ox = 0, oz = 0;
    const g = this.grid, cs = this.cell;
    // two places are looked at: where the walker stands and 2.5 m ahead (often the same cell, then the second look adds nothing)
    const c1 = g.get(this.gridKey(Math.floor(x / cs), Math.floor(z / cs)));
    const c2 = g.get(this.gridKey(Math.floor((x + dx * 2.5) / cs), Math.floor((z + dz * 2.5) / cs)));
    for (let pass = 0; pass < 2; pass++) {
      const cell = pass ? (c2 !== c1 ? c2 : undefined) : c1;
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const c = cell[i];
        if (only ? c.kind !== only : (c.kind !== 'tree' && c.kind !== 'stone')) continue;
        if (pass && c1 && c1.includes(c)) continue;   // (a collider standing across the cell edge is in both lists: count it once)
        const cx = (c.minX + c.maxX) / 2 - x, cz = (c.minZ + c.maxZ) / 2 - z;
        const along = cx * dx + cz * dz;
        if (along < -0.2 || along > look) continue;
        const lateral = cx * -dz + cz * dx;          // + means the trunk is to our left
        const clear = (c.maxX - c.minX) / 2 + radius + 0.4;
        if (Math.abs(lateral) >= clear) continue;
        const w = ((clear - Math.abs(lateral)) / clear) * (1 - (along / look) * 0.5);
        const away = Math.abs(lateral) < 0.05 ? side : -Math.sign(lateral);
        ox += -dz * away * w * 1.6;
        oz += dx * away * w * 1.6;
      }
    }
    if (!ox && !oz) return null;
    const nx = dx + ox, nz = dz + oz;
    const l = Math.hypot(nx, nz) || 1;
    STEER.x = nx / l; STEER.z = nz / l;
    return STEER;   // (shared: every caller reads x and z straight away)
  }

  // Does this collider let someone of `team` through? A gate that stands open is an open gateway for anyone, friend or
  // foe (it swings open for its own side; an enemy who reaches it before it shuts walks in); shut or barred, it is solid
  // for everybody.
  lets(c, team) {
    if (c.kind === 'gate') return c.passTeam >= 0 && c.ref.openAmt >= GATE_OPEN;
    return c.passTeam >= 0 && allied(c.passTeam, team);
  }

  // Push a circle out of blocking colliders. Returns true if anything was hit.
  // ignoreTrees lets a stuck soldier (or a wheeled engine) slip past trunks; ignoreStones also lets a soldier that
  // has been wedged for seconds slip past a standing stone (engines never do: they steer round them).
  resolve(pos, radius, footY, height, team, ignoreTrees = false, ignoreStones = false) {
    let hit = false;
    const pad = radius + 1, buckets = this.buckets;
    for (let iter = 0; iter < 2; iter++) {
      const x = pos.x, z = pos.z;   // (what is near is decided from where the pass starts)
      let hitNow = false;
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        if (Math.abs(x - b.cx) < b.r + pad && Math.abs(z - b.cz) < b.r + pad && this.pushOut(b.list, pos, radius, footY, height, team, ignoreTrees, ignoreStones)) hitNow = true;
      }
      const cell = this.grid.get(this.gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell)));
      if (cell && this.pushOut(cell, pos, radius, footY, height, team, ignoreTrees, ignoreStones)) hitNow = true;
      if (!hitNow) break;   // nothing moved, so a second pass would see exactly the same
      hit = true;
    }
    return hit;
  }

  // one pass over a list of colliders (the distance test first: most of them are nowhere near)
  pushOut(list, pos, radius, footY, height, team, ignoreTrees, ignoreStones) {
    let hit = false;
    const rr = radius * radius;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const qx = clamp(pos.x, c.minX, c.maxX);
      const qz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - qx, dz = pos.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr) continue;
      if (!c.active || this.lets(c, team) || (ignoreTrees && c.kind === 'tree') || (ignoreStones && c.kind === 'stone')) continue;
      const top = c.heightFn ? c.heightFn(qx, qz) : c.top;
      if (footY >= top - STEP) continue;          // standing on / above it
      if (footY + height <= c.bottom) continue;   // passing underneath (e.g. gate lintel)
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = qx + (dx / d) * radius;
        pos.z = qz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the shallowest axis
        const l = pos.x - c.minX, r = c.maxX - pos.x, b = pos.z - c.minZ, f = c.maxZ - pos.z;
        const m = Math.min(l, r, b, f);
        if (m === l) pos.x = c.minX - radius;
        else if (m === r) pos.x = c.maxX + radius;
        else if (m === b) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    return hit;
  }

  // Is there a deck (the wall walk's planking, a tower roof) over this spot that a climber would go up through?
  covered(x, z, footY, height) {
    for (const c of this.near(x, z, 0.5)) {
      if (!c.active || c.kind !== 'walk') continue;
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.bottom > footY + height * 0.5) return true;
    }
    return false;
  }

  // A wall (or the edge of the wall walk) right in front of someone standing at (x,z) that they can scramble up, with
  // the spot to hang on at the foot of it and the spot to climb out onto the top. Walls are far higher than a jump,
  // so this is how a hero gets up without the stairs: from outside, up the face of a curtain wall, or from the
  // courtyard, up onto the edge of the wall walk. `team` limits it to one castle's walls (null: any castle; the caller
  // decides what an enemy's wall costs, see Player.tryClimb). From outside the hero goes over the battlements through a
  // crenel (the gap between two merlons), never through the stone. Returns null when there is nothing to climb: nothing
  // within reach, not facing it, a wall that has been broken down, a deck overhead, or no room to stand on top.
  ledge(x, z, footY, radius, fx, fz, height = 1.8, team = -99) {
    if (this.covered(x, z, footY, height)) return null;
    let best = null, bd = Infinity;
    for (const c of this.near(x, z, radius + BODY.climbReach + 1)) {
      if (!LEDGE_KINDS.has(c.kind) || !c.active) continue;
      if (team !== null && (c.team !== undefined ? c.team : c.ref && c.ref.team) !== team) continue;
      const rise = c.top - footY;
      if (rise < BODY.climbMin || rise > BODY.climbMax) continue;
      const dx = x - clamp(x, c.minX, c.maxX), dz = z - clamp(z, c.minZ, c.maxZ);
      const d = Math.hypot(dx, dz);
      if (d < 0.05 || d - radius > BODY.climbReach) continue;       // under it, or too far off
      // the face we stand against: the side we are furthest outside of, and alongside it, not off its corner
      const alongX = Math.abs(dz) >= Math.abs(dx);
      const nx = alongX ? 0 : Math.sign(dx), nz = alongX ? Math.sign(dz) : 0;
      if ((alongX ? Math.abs(dx) : Math.abs(dz)) > 0.05) continue;
      if (-(fx * nx + fz * nz) < 0.5) continue;                     // not looking at it
      if (d >= bd) continue;
      bd = d;
      best = { c, nx, nz };
    }
    if (!best) return null;
    const { c, nx, nz } = best;
    // the face, and where along it we are (kept off the very ends, where a tower stands)
    const alongX = nz !== 0;
    const face = nx > 0 ? c.maxX : nx < 0 ? c.minX : nz > 0 ? c.maxZ : c.minZ;
    const lo = alongX ? c.minX : c.minZ, hi = alongX ? c.maxX : c.maxZ;
    let t = clamp(alongX ? x : z, lo + Math.min(0.7, (hi - lo) / 2), hi - Math.min(0.7, (hi - lo) / 2));
    if (c.ref && c.ref.merlons) {
      t = crenel(c.ref.merlons, alongX, face, t, radius);
      if (t === null) return null;
    }
    const at = (off) => (alongX ? { x: t, z: face + nz * off } : { x: face + nx * off, z: t });
    // somewhere to stand on top: a little way in from the face, clear of the battlement rail and anything else
    const probe = { x: 0, z: 0 };
    for (const depth of [1.0, 1.4, 1.8, 2.2, 2.7, 3.2]) {
      const p = at(-depth);
      probe.x = p.x; probe.z = p.z;
      if (this.resolve(probe, radius, c.top, height, -99)) continue;
      if (this.groundHeight(p.x, p.z, c.top) < c.top - 0.05) continue;
      return { c, owner: c.team !== undefined ? c.team : c.ref && c.ref.team, top: c.top, nx, nz, hang: at(radius + 0.04), land: p };
    }
    return null;
  }

  // Collider containing a point (for projectiles), or null. `skip`: a set of collider kinds to see through.
  pointHit(x, y, z, ignoreTeam = -99, skip = null) {
    const buckets = this.buckets;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (Math.abs(x - b.cx) < b.r + 0.5 && Math.abs(z - b.cz) < b.r + 0.5) {
        const c = this.hitIn(b.list, x, y, z, ignoreTeam, skip);
        if (c) return c;
      }
    }
    const cell = this.grid.get(this.gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (cell) { const c = this.hitIn(cell, x, y, z, ignoreTeam, skip); if (c) return c; }
    // battlement merlons: the defenders' own arrows fly through the slots and over the stone
    if (y > 1) {
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        if (Math.abs(x - b.cx) >= b.r + 0.5 || Math.abs(z - b.cz) >= b.r + 0.5) continue;
        const list = b.shots;
        for (let k = 0; k < list.length; k++) {
          const c = list[k];
          if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
          if (!c.active || allied(c.team, ignoreTeam)) continue;
          if (y < c.top && y > c.bottom) return c;
        }
      }
    }
    return null;
  }

  hitIn(list, x, y, z, ignoreTeam, skip) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (!c.active || c.noProjectile || (skip && skip.has(c.kind))) continue;
      if (c.kind === 'gate' && this.lets(c, ignoreTeam)) continue;
      if (y < (c.heightFn ? c.heightFn(x, z) : c.top) && y > c.bottom) return c;
    }
    return null;
  }

  // Is the straight line between two points free of tall structures? (sampled)
  // The same samples, in the same places, as asking pointHit at each; but the colliders that cannot touch this line are
  // sorted out once, so each sample only looks at the few that can.
  lineClear(ax, ay, az, bx, by, bz, ignoreTeam = -99) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(Math.hypot(d, by - ay) / 0.25); // fine enough not to skip a merlon or clip a wall corner
    if (steps <= 1) return true;
    const E = 1e-6;   // (a sample can sit an ulp outside the line's own box)
    const x0 = Math.min(ax, bx) - E, x1 = Math.max(ax, bx) + E, z0 = Math.min(az, bz) - E, z1 = Math.max(az, bz) + E, y0 = Math.min(ay, by) - E, y1 = Math.max(by, ay) + E;
    const buckets = this.buckets;
    const near = this.lineNear || (this.lineNear = []);
    let n = 0;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i], rr = b.r + 0.5;
      if (x1 <= b.cx - rr || x0 >= b.cx + rr || z1 <= b.cz - rr || z0 >= b.cz + rr) continue;   // no sample can be inside this castle's square
      let w = near[n];
      if (!w) w = near[n] = { b: null, list: [], shots: [] };
      w.b = b; w.list.length = 0; w.shots.length = 0;
      for (const c of b.list) {
        if (c.maxX < x0 || c.minX > x1 || c.maxZ < z0 || c.minZ > z1 || y1 <= c.bottom || (!c.heightFn && y0 >= c.top)) continue;
        if (!c.active || c.noProjectile) continue;
        if (c.kind === 'gate' && this.lets(c, ignoreTeam)) continue;
        w.list.push(c);
      }
      for (const c of b.shots) {
        if (c.maxX < x0 || c.minX > x1 || c.maxZ < z0 || c.minZ > z1 || y1 <= c.bottom || y0 >= c.top) continue;
        if (!c.active || allied(c.team, ignoreTeam)) continue;
        w.shots.push(c);
      }
      n++;
    }
    let lastKey = -1, lastCell = null;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (let k = 0; k < n; k++) {
        const w = near[k], b = w.b;
        if (Math.abs(x - b.cx) >= b.r + 0.5 || Math.abs(z - b.cz) >= b.r + 0.5) continue;
        const list = w.list;
        for (let m = 0; m < list.length; m++) {
          const c = list[m];
          if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
          if (y < (c.heightFn ? c.heightFn(x, z) : c.top) && y > c.bottom) return false;
        }
        if (y > 1) {
          const shots = w.shots;
          for (let m = 0; m < shots.length; m++) {
            const c = shots[m];
            if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
            if (y < c.top && y > c.bottom) return false;
          }
        }
      }
      const key = this.gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell));
      if (key !== lastKey) { lastKey = key; lastCell = this.grid.get(key) || null; }
      if (lastCell && this.hitIn(lastCell, x, y, z, ignoreTeam, null)) return false;
    }
    return true;
  }
}
