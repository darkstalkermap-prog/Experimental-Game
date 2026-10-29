p = '/home/user/experimental-game/.claude/worktrees/agent-ac4feb3b20b5b1d48/src/physics.js'
s = open(p).read()

# ---- groundHeight ----
old = s[s.index("  // Highest walkable surface under (x,z) that is reachable from footY."):s.index("  // Bend a walking direction around tree trunks")]
new = '''  // Highest walkable surface under (x,z) that is reachable from footY.
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

'''
s = s.replace(old, new)

# ---- steerAroundTrees ----
old = s[s.index("  steerAroundTrees(x, z, dx, dz, radius, side = 1, only = null) {"):s.index("  // Does this collider let someone of `team` through?")]
new = '''  steerAroundTrees(x, z, dx, dz, radius, side = 1, only = null) {
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

'''
s = s.replace(old, new)
s = s.replace("const STEER_KINDS = new Set(['tree', 'stone']);   // obstacles soldiers walk round (trunks, rocks and the standing stones)\n",
              "const STEER = { x: 0, z: 0 };   // what steerAroundTrees returns (soldiers walk round trunks, rocks and the standing stones)\n")

# ---- resolve ----
old = s[s.index("  resolve(pos, radius, footY, height, team, ignoreTrees = false, ignoreStones = false) {"):s.index("  // Is there a deck (the wall walk's planking")]
new = '''  resolve(pos, radius, footY, height, team, ignoreTrees = false, ignoreStones = false) {
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

'''
s = s.replace(old, new)

# ---- pointHit + lineClear ----
old = s[s.index("  // Collider containing a point (for projectiles), or null."):]
new = '''  // Collider containing a point (for projectiles), or null. `skip`: a set of collider kinds to see through.
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
'''
s = s.replace(old, new)
open(p, 'w').write(s)
print('patched')
