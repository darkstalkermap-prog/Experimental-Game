import re
p='/home/user/experimental-game/src/physics.js'
s=open(p).read()
a=s.index("  // A castle wall right in front of someone standing at (x,z)")
b=s.index("  // Collider containing a point (for projectiles), or null.")
new='''  // Is there a deck (the wall walk's planking, a tower roof) over this spot that a climber would go up through?
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
  // courtyard, up onto the edge of the wall walk. Returns null when there is nothing to climb: nothing within reach,
  // not facing it, a wall that has been broken down, a deck overhead, or no room to stand on top.
  ledge(x, z, footY, radius, fx, fz, height = 1.8) {
    if (this.covered(x, z, footY, height)) return null;
    let best = null, bd = Infinity;
    for (const c of this.near(x, z, radius + BODY.climbReach + 1)) {
      if (!LEDGE_KINDS.has(c.kind) || !c.active) continue;
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
    const t = clamp(alongX ? x : z, lo + Math.min(0.7, (hi - lo) / 2), hi - Math.min(0.7, (hi - lo) / 2));
    const at = (off) => (alongX ? { x: t, z: face + nz * off } : { x: face + nx * off, z: t });
    // somewhere to stand on top: a little way in from the face, clear of the battlement rail and anything else
    const probe = { x: 0, z: 0 };
    for (const depth of [1.0, 1.4, 1.8, 2.2, 2.7, 3.2]) {
      const p = at(-depth);
      probe.x = p.x; probe.z = p.z;
      if (this.resolve(probe, radius, c.top, height, -99)) continue;
      if (this.groundHeight(p.x, p.z, c.top) < c.top - 0.05) continue;
      return { c, top: c.top, nx, nz, hang: at(radius + 0.04), land: p };
    }
    return null;
  }

'''
s=s[:a]+new+s[b:]
s=s.replace("const STEER_KINDS = new Set(['tree', 'stone']);","const LEDGE_KINDS = new Set(['wall', 'walk']);   // what a hero can climb onto: curtain walls and the planking of the wall walk\nconst STEER_KINDS = new Set(['tree', 'stone']);",1)
open(p,'w').write(s)
print('patched')
