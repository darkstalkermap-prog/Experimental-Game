// The mountains behind the battlefield. Inside the play area the ring of hills is the old smooth power curve (gameplay, nav and
// collision were tuned on it and nobody may be moved by this file); beyond the edge of the play area it carries on at the same height and
// slope, rolls over into a first ridge line with peaks, notches and spurs, falls away behind it and rises again as far ranges that you
// only see through the notches. Pure functions of the position, so the physics grid, the far mesh and the vegetation all agree.
import { WORLD } from './config.js';
import { smoothstep, clamp } from './noise.js';

const WALL_K = 0.55, WALL_P = 1.35;

// the height of the ring of hills at `edge` (the Chebyshev distance from the middle) when it is still the old curve
const oldWall = (edge) => Math.pow(Math.max(0, edge - (WORLD.half - 45)), WALL_P) * WALL_K;

// ridged multifractal: 1 along the creases of the noise, so it makes knife edges and gullies instead of blobs
function ridged(nz, x, z, oct) {
  let amp = 0.55, f = 1, sum = 0, norm = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let r = 1 - Math.abs(nz.noise(x * f + i * 17.3, z * f - i * 9.1));
    r *= r;
    sum += amp * r * w;
    norm += amp;
    w = clamp(r * 1.6, 0.25, 1);   // sharp parts of one octave carry the next one
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

// how thick the forest wants to be at a spot (0..1): the old tree placement and the ground colour both read it
export const forestDensity = (nz, x, z) => nz.fbm(x * 0.012 + 50, z * 0.012, 3) * 0.5 + 0.5;

// distance beyond the play area: the straight distance past a side, but rounded round the corners
export function outerDistance(x, z) {
  const P = WORLD.playHalf;
  const ex = Math.max(Math.abs(x) - P, 0), ez = Math.max(Math.abs(z) - P, 0);
  const inf = Math.max(ex, ez), euc = Math.hypot(ex, ez);
  return inf + (euc - inf) * smoothstep(0, 30, euc);
}

// The ring of hills, as a height that is added to the rolling ground. `nz` is the physics noise ({ noise, fbm }).
export function wallHeight(edge, x, z, nz) {
  if (edge <= WORLD.playHalf) return oldWall(edge);
  const P = WORLD.playHalf;
  const u = outerDistance(x, z);
  const WP = oldWall(P), s0 = WALL_K * WALL_P * Math.pow(P - (WORLD.half - 45), WALL_P - 1);
  // where this spot lies behind the edge of the play area: crest height and distance are sampled there, so spurs run straight back
  const bx = clamp(x, -P, P), bz = clamp(z, -P, P);
  const along = nz.fbm(bx * 0.0062 + 31.7, bz * 0.0062 - 12.9, 3);          // -1..1, one crest feature about every 160 m
  const along2 = nz.noise(bx * 0.013 - 7.4, bz * 0.013 + 3.2);
  const A = 74 + 46 * along + 14 * along2;                                   // how far the first crest stands above the play edge
  const uc = 44 + 20 * along2 + 8 * along;                                    // and how far behind it
  const t = Math.min(1, u / uc);
  // cubic: leaves the edge at the old slope, tops out flat at the crest
  const m0 = s0 * uc;
  const cube = (t * t * t - 2 * t * t + t) * m0 + (-2 * t * t * t + 3 * t * t) * A;
  let near = WP + cube;
  // relief: peaks and gullies fade in over the first metres (the edge itself stays exactly the old surface)
  const rel = smoothstep(6, 46, u);
  const pk = ridged(nz, x * 0.0115, z * 0.0115, 4);
  near += rel * (pk - 0.42) * 44;
  near += smoothstep(10, 60, u) * nz.fbm(x * 0.045 + 5, z * 0.045 - 3, 3) * 9;
  // the ranges behind: lower than the first ridge at first, then rising again towards the horizon
  const k = smoothstep(uc * 0.9, uc * 2.4, u);
  const r2 = ridged(nz, x * 0.0036 + 11, z * 0.0036 - 5, 5);
  const far = WP + 18 + 120 * r2 + 70 * smoothstep(250, 900, u) * (r2 + 0.3) + 24 * nz.fbm(x * 0.02 + 2, z * 0.02 + 8, 3);
  return near * (1 - k) + far * k;
}
