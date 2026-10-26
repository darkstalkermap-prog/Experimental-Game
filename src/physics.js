// Terrain heightfield + simple box colliders (walls, towers, gates, ramps).
// Characters are vertical capsules approximated by a circle in XZ plus a foot height.
import { WORLD, CASTLE } from './config.js';
import { makeNoise, smoothstep, clamp } from './noise.js';

export const STEP = 0.65; // max height a character can step up

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
    const b = { cx, cz, r, list: [] };
    this.buckets.push(b);
    return b;
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

  // Push a circle out of blocking colliders. Returns true if anything was hit.
  resolve(pos, radius, footY, height, team) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.near(pos.x, pos.z, radius + 1)) {
        if (!c.active || c.passTeam === team) continue;
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
      if (c.passTeam === ignoreTeam && c.kind === 'gate') continue;
      if (y < this.topAt(c, x, z) && y > c.bottom) return c;
    }
    return null;
  }

  // Is the straight line between two points free of tall structures? (sampled)
  lineClear(ax, ay, az, bx, by, bz, ignoreTeam = -99) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 1.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (this.pointHit(x, y, z, ignoreTeam)) return false;
    }
    return true;
  }
}
