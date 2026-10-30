// Roads run from each castle gate to the centre of the map, with a ring road round the centre: the lines the ground is painted with (terrainmat.js) and
// the things that must stay clear of them (trees, rocks, ponds, grass) are measured from. (world.js and the modules that need them import from here.)
import { CASTLE, WAR_WORLD } from './config.js';
import { CASTLE_SITES } from './physics.js';

export const ROADS = [];
export function layoutRoads() {
  ROADS.length = 0;
  if (WAR_WORLD.on) return;   // (War Mode's bowl has no roads)
  for (const s of CASTLE_SITES) {
    const len = Math.hypot(s.x, s.z);
    const gx = s.x - (s.x / len) * (CASTLE.H + 4), gz = s.z - (s.z / len) * (CASTLE.H + 4);
    ROADS.push({ ax: gx, az: gz, bx: 0, bz: 0 });
  }
}
layoutRoads();

function distToSeg(px, pz, r) {
  const vx = r.bx - r.ax, vz = r.bz - r.az;
  const t = Math.max(0, Math.min(1, ((px - r.ax) * vx + (pz - r.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (r.ax + vx * t), pz - (r.az + vz * t));
}
export function roadDist(x, z) {
  if (WAR_WORLD.on) return 1e4;
  let d = Infinity;
  for (const r of ROADS) d = Math.min(d, distToSeg(x, z, r));
  // ring road around the centre
  d = Math.min(d, Math.abs(Math.hypot(x, z) - 34));
  return d;
}
