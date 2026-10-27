// Terrain heightfield + simple box colliders (walls, towers, gates, ramps).
// Characters are vertical capsules approximated by a circle in XZ plus a foot height.
import { WORLD, CASTLE } from './config.js';
import { makeNoise, smoothstep, clamp } from './noise.js';
import { allied } from './teams.js';

export const STEP = 0.65; // max height a character can step up
const STEER_KINDS = new Set(['tree', 'stone']);   // obstacles soldiers walk round (trunks, rocks and the standing stones)
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

export class Physics {
  constructor(seed = 7) {
    layoutCastles();
    this.noise = makeNoise(seed);
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
    h += Math.pow(Math.max(0, edge - (WORLD.half - 45)), 1.35) * 0.55;
    // gentle battlefield in the middle
    const rc = Math.hypot(x, z);
    h = h * (0.45 + 0.55 * smoothstep(25, 90, rc)) + 1.2 * (1 - smoothstep(25, 90, rc));
    // flatten castle plateaus
    for (const s of CASTLE_SITES) {
      const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      const w = 1 - smoothstep(CASTLE.H + 10, CASTLE.H + 34, d);
      h = h * (1 - w) + CASTLE.baseY * w;
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
    if (c.bottom === undefined) c.bottom = -100;
    if (c.active === undefined) c.active = true;
    bucket.shots.push(c);
    return c;
  }

  // c: { minX,maxX,minZ,maxZ, top, bottom=0, heightFn?, passTeam?, active, kind, ref }
  add(c, bucket = null) {
    if (c.bottom === undefined) c.bottom = -100;
    if (c.active === undefined) c.active = true;
    if (c.passTeam === undefined) c.passTeam = -1;
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
  groundHeight(x, z, footY) {
    let g = this.terrainHeight(x, z);
    for (const c of this.near(x, z, 1)) {
      if (!c.active || c.noWalk) continue;
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      const t = this.topAt(c, x, z);
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
    const seen = new Set();
    for (const [px, pz] of [[x, z], [x + dx * 2.5, z + dz * 2.5]]) {
      const cell = this.grid.get(this.gridKey(Math.floor(px / this.cell), Math.floor(pz / this.cell)));
      if (!cell) continue;
      for (const c of cell) {
        if ((only ? c.kind !== only : !STEER_KINDS.has(c.kind)) || seen.has(c)) continue;
        seen.add(c);
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
    return { x: nx / l, z: nz / l };
  }

  // Does this collider let someone of `team` through? A gate lets its own side (and their allies) pass, but only
  // while it stands open: shut, it is solid for everybody.
  lets(c, team) {
    return c.passTeam >= 0 && allied(c.passTeam, team) && (c.kind !== 'gate' || c.ref.openAmt >= GATE_OPEN);
  }

  // Push a circle out of blocking colliders. Returns true if anything was hit.
  // ignoreTrees lets a stuck soldier (or a wheeled engine) slip past trunks; ignoreStones also lets a soldier that
  // has been wedged for seconds slip past a standing stone (engines never do: they steer round them).
  resolve(pos, radius, footY, height, team, ignoreTrees = false, ignoreStones = false) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.near(pos.x, pos.z, radius + 1)) {
        if (!c.active || this.lets(c, team) || (ignoreTrees && c.kind === 'tree') || (ignoreStones && c.kind === 'stone')) continue;
        const qx = clamp(pos.x, c.minX, c.maxX);
        const qz = clamp(pos.z, c.minZ, c.maxZ);
        const dx = pos.x - qx, dz = pos.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        const top = this.topAt(c, qx, qz);
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
    }
    return hit;
  }

  // Collider containing a point (for projectiles), or null.
  pointHit(x, y, z, ignoreTeam = -99) {
    for (const c of this.near(x, z, 0.5)) {
      if (!c.active || c.noProjectile) continue;
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (c.kind === 'gate' && this.lets(c, ignoreTeam)) continue;
      if (y < this.topAt(c, x, z) && y > c.bottom) return c;
    }
    // battlement merlons: the defenders' own arrows fly through the slots and over the stone
    if (y > 1) {
      for (const c of this.nearShots(x, z, 0.5)) {
        if (!c.active || allied(c.team, ignoreTeam)) continue;
        if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
        if (y < c.top && y > c.bottom) return c;
      }
    }
    return null;
  }

  // Is the straight line between two points free of tall structures? (sampled)
  lineClear(ax, ay, az, bx, by, bz, ignoreTeam = -99) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(Math.hypot(d, by - ay) / 0.25); // fine enough not to skip a merlon or clip a wall corner
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (this.pointHit(x, y, z, ignoreTeam)) return false;
    }
    return true;
  }
}
