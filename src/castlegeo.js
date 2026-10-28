// Everything a castle is drawn with, collected as pieces per material (see parts.js) in castle-local metres: x right, y up, z toward the
// gate. castle.js merges them into a few meshes. Nothing here touches the colliders: where a piece stands in for something solid it keeps
// to that solid's footprint, and what reaches beyond it is decoration above head height or no more than a hand's breadth.
//   detail 0 plain boxes (Low) · 1 plinths, string courses, corbels, slits, frames, roofs · 2 adds caps, stepped corbels, small fittings
import * as THREE from 'three';
import { Parts, place, between, rgb, mul } from './parts.js';
import { CASTLE } from './config.js';
import { mulberry32 } from './noise.js';

const { H, wallH, wallT: T, gateW, gateH, towerH, keepW, keepH, towerOff, towerR, walk: WALK } = CASTLE;
const GW = gateW / 2, TC = H + towerOff, IN = H - T, E = IN - WALK, F0 = IN, F1 = TC + towerR, HW = keepW / 2;
export const KEEP_Z = -6;
export const MERLON_H = 1.3;

// tints (multipliers on the textures, linear)
export const C = {
  stone: [1, 1, 1], pale: [1.16, 1.1, 0.94], dark: [0.56, 0.54, 0.5], plinth: [0.72, 0.7, 0.66], black: [0.04, 0.04, 0.045], step: [0.8, 0.78, 0.74],
  wood: [1, 1, 1], woodDark: [0.55, 0.47, 0.4], woodLight: [1.2, 1.1, 0.98], old: [0.78, 0.74, 0.7],
  iron: rgb(0x34353a), ironLight: rgb(0x5b5d66), gold: rgb(0xd8a83a), slate: [1, 1, 1],
};

// ---------------------------------------------------------------- walls
// Coordinates on a wall segment: u along it from its middle, o outward from its outer face (negative = into the stone), y up.
function frame(seg) {
  const { lx: cx, lz: cz, alongX, nx, nz, box: b } = seg;
  const face = alongX ? (nz > 0 ? b.z1 : b.z0) : (nx > 0 ? b.x1 : b.x0), s = alongX ? nz : nx;
  const box = (P, key, u0, u1, y0, y1, o0, o1, col, opt) => {
    const a = face + s * o0, c = face + s * o1;
    if (alongX) P.box(key, cx + u0, cx + u1, y0, y1, a, c, col, opt);
    else P.box(key, a, c, y0, y1, cz + u0, cz + u1, col, opt);
  };
  const at = (u, o) => (alongX ? [cx + u, face + s * o] : [face + s * o, cz + u]);
  return { box, at };
}
// the merlon positions along a segment (none on the corner squares: the towers stand there)
function atCorner(seg, t) {
  const { lx: cx, lz: cz, alongX } = seg;
  return Math.abs(alongX ? cx + t : cx) > H - T - 0.1 && Math.abs(alongX ? cz : cz + t) > H - T - 0.1;
}
export function merlonSlots(seg) {
  const out = [], n = Math.floor(seg.len / 2);
  for (let i = 0; i < n; i++) { const t = -seg.len / 2 + 1 + i * 2; if (!atCorner(seg, t)) out.push(t); }
  return out;
}

// a rough stone, half buried: `size` is its radius
function rock(P, x, z, size, rng, tint = C.old, flat = 0.6) {
  const sy = size * (flat * (0.7 + rng() * 0.5));
  P.add('masonry', new THREE.IcosahedronGeometry(1, 0), place(x, sy * 0.45, z, rng() * 6.28, rng() * 0.6, rng() * 0.6, size * (0.8 + rng() * 0.5), sy, size * (0.8 + rng() * 0.5)), P.jitter(tint, 0.18));
}

// One curtain wall segment in its three states: intact, damaged (under half its hit points: a jagged top, fallen blocks) and gone (rubble).
export function wallParts(seg, d, seed) {
  const { box: F, at } = frame(seg), h = seg.len / 2, b = seg.box, slots = merlonSlots(seg), rng = mulberry32(seed * 7 + 3);
  const full = new Parts(seed), damaged = new Parts(seed + 1), gone = new Parts(seed + 2), M = 'masonry';
  const gateEnd = (x) => seg.nz === 1 && (Math.abs(x) < GW + 2.6 || Math.abs(Math.abs(x) - 8.5) < 1.8);   // no slits by the gate or behind a banner
  // ---- intact ----
  {
    const P = full;
    P.box(M, b.x0, b.x1, 0, wallH, b.z0, b.z1, P.jitter(C.stone, 0.03), { skip: 'd' });
    if (d >= 1) {
      F(P, M, -h, h, 0, 1.1, 0, 0.22, C.plinth, { skip: 'd' });                      // footing, outside and in
      F(P, M, -h, h, 0, 0.9, -T - 0.12, -T, C.plinth, { skip: 'd' });
      F(P, M, -h, h, 4.9, 5.2, 0, 0.14, C.dark);                                     // string course
      F(P, M, -h, h, wallH - 0.5, wallH, 0, 0.42, C.stone);                          // the parapet overhangs on corbels
      for (let u = -h + 1; u < h; u += 2) {
        F(P, M, u - 0.24, u + 0.24, wallH - 1.0, wallH - 0.5, 0, 0.3, C.stone);
        if (d >= 2) F(P, M, u - 0.24, u + 0.24, wallH - 1.5, wallH - 1.0, 0, 0.15, C.stone);
      }
      const n = Math.max(1, Math.round(seg.len / 5));                                // arrow slits with dressed frames
      for (let i = 0; i < n; i++) {
        const u = -h + (i + 0.5) * seg.len / n;
        if (gateEnd(seg.lx + u)) continue;
        F(P, M, u - 0.3, u + 0.3, 4.1, 6.1, 0, 0.09, C.pale);
        F(P, M, u - 0.09, u + 0.09, 4.35, 5.85, 0, 0.12, C.black);
      }
    }
    for (const t of slots) {
      F(P, M, t - 0.55, t + 0.55, wallH, wallH + MERLON_H, -0.5, 0, P.jitter(C.stone, 0.04), { skip: 'd' });
      if (d >= 2) F(P, M, t - 0.62, t + 0.62, wallH + MERLON_H, wallH + MERLON_H + 0.13, -0.57, 0.07, C.pale, { skip: 'd' });
    }
  }
  // ---- damaged: columns of broken stone, the battlements gone ----
  {
    const P = damaged, tint = mul(C.stone, 0.8), notch = (rng() - 0.5) * seg.len * 0.5;
    let u = -h;
    while (u < h - 0.01) {
      const w = Math.min(h - u, 0.8 + rng() * 0.9), mid = u + w / 2;
      const top = wallH - 0.25 - rng() * 1.4 - 1.5 * Math.max(0, 1 - Math.abs(mid - notch) / 2.4);
      F(P, M, u, u + w, 0, top, -T, 0, P.jitter(tint, 0.07), { skip: 'd' });
      u += w;
    }
    if (d >= 1) { F(P, M, -h, h, 0, 1.1, 0, 0.22, mul(C.plinth, 0.85), { skip: 'd' }); F(P, M, -h, h, 0, 0.9, -T - 0.12, -T, mul(C.plinth, 0.85), { skip: 'd' }); }
    for (let i = 0; i < 5 + 3 * d; i++) { const [x, z] = at((rng() - 0.5) * seg.len * 0.95, 0.3 + rng() * 2.2); rock(P, x, z, 0.3 + rng() * 0.5, rng, mul(C.stone, 0.75)); }
    for (let i = 0; i < 2 + d; i++) { const [x, z] = at((rng() - 0.5) * seg.len * 0.9, -T - 0.4 - rng() * 1.4); rock(P, x, z, 0.25 + rng() * 0.4, rng, mul(C.stone, 0.75)); }
  }
  // ---- gone: a heap of rubble (low in the middle: people walk over it) ----
  {
    const P = gone, n = Math.round(seg.len * 1.9);
    for (let i = 0; i < n; i++) {
      const u = (rng() - 0.5) * seg.len * 0.98, o = -T - 1.0 + rng() * (T + 2.6), ridge = 1 - Math.abs(o + T / 2) / (T / 2 + 1.5);
      const [x, z] = at(u, o);
      rock(P, x, z, 0.28 + rng() * 0.5 * (0.5 + Math.max(0, ridge)), rng, mul(C.stone, 0.7 + rng() * 0.2), 0.55);
    }
    for (let i = 0; i < 4; i++) {                     // a few big slabs of fallen wall
      const [x, z] = at((rng() - 0.5) * seg.len * 0.8, -T / 2 + (rng() - 0.5) * 2.4);
      P.obox(M, place(x, 0.22, z, rng() * 3.1, 0, (rng() - 0.5) * 0.25), 0.6 + rng() * 0.5, 0.2, 0.4 + rng() * 0.3, P.jitter(mul(C.stone, 0.8), 0.1));
    }
  }
  return { full, damaged, gone };
}

// ---------------------------------------------------------------- gatehouse, stairs, lever
export function gatehouse(F, A, d) {
  const M = 'masonry', zi = H - T, zo = H;
  // dressed jambs: courses alternate long and short, standing a little proud of both faces
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
    const w = i % 2 ? 0.95 : 0.6, y0 = i * 0.5;
    F.box(M, s * GW, s * (GW + w), y0, y0 + 0.5, zi - 0.12, zo + 0.12, i % 2 ? C.pale : C.stone);
  }
  F.box(M, -GW - 0.1, GW + 0.1, gateH, wallH, zi, zo, C.stone);                      // the lintel
  if (d >= 1) {
    // a segmental arch of voussoirs over the opening (relief on both faces), spandrels in the top corners
    const R = 3.9, n = 11, cyc = gateH - R;                                           // arc centre height: the crown is at gateH
    for (let side = 0; side < 2; side++) for (let i = 0; i < n; i++) {
      const a0 = -Math.asin(GW / R) + (i / n) * 2 * Math.asin(GW / R), a1 = -Math.asin(GW / R) + ((i + 1) / n) * 2 * Math.asin(GW / R), am = (a0 + a1) / 2;
      const x = Math.sin(am) * (R + 0.35), y = cyc + Math.cos(am) * (R + 0.35), arc = (a1 - a0) * R * 0.5;
      const z = side ? zo + 0.06 : zi - 0.06;
      F.obox(M, place(x, y, z, 0, 0, -am), arc, 0.37, 0.1, i % 2 ? C.pale : C.stone);
    }
    for (const s of [-1, 1]) {                                                         // spandrel blocks: steps that follow the curve
      for (let k = 0; k < 4; k++) {
        const y0 = gateH - 1.5 + k * 0.4, xa = Math.sqrt(Math.max(0, R * R - (y0 - cyc) ** 2));
        if (xa < GW - 0.02) F.box(M, s * GW, s * Math.max(xa, 0), y0, y0 + 0.4, zo - 0.7, zo, C.dark);
        if (xa < GW - 0.02) F.box(M, s * GW, s * Math.max(xa, 0), y0, y0 + 0.4, zi, zi + 0.7, C.dark);
      }
    }
    // machicolation over the gate: a projecting gallery with three murder holes
    F.box(M, -GW - 0.8, GW + 0.8, wallH - 1.1, wallH - 0.5, zo, zo + 0.6, C.stone);
    F.box(M, -GW - 0.8, GW + 0.8, wallH - 0.5, wallH, zo, zo + 0.7, C.pale);
    for (const x of [-1.8, 0, 1.8]) F.box(M, x - 0.35, x + 0.35, wallH - 1.12, wallH - 1.1, zo + 0.08, zo + 0.55, C.black);
    // the raised portcullis: iron bars hanging in the arch
    for (let i = 0; i < 9; i++) {
      const x = -GW + 0.5 + i * (gateW - 1) / 8;
      A.box('metal', x - 0.04, x + 0.04, gateH - 1.1, gateH + 0.9, zi + 0.5, zi + 0.58, C.iron);
      A.add('metal', new THREE.ConeGeometry(0.07, 0.3, 4), place(x, gateH - 1.25, zi + 0.54, 0, Math.PI), C.ironLight);
    }
    for (const y of [gateH - 0.3, gateH + 0.35]) A.box('metal', -GW + 0.4, GW - 0.4, y, y + 0.08, zi + 0.46, zi + 0.62, C.iron);
  }
  // the battlements above the gate
  for (let i = 0; i < 3; i++) {
    const t = -GW + 1 + i * 2;
    F.box(M, t - 0.55, t + 0.55, wallH, wallH + MERLON_H, zo - 0.5, zo, C.stone, { skip: 'd' });
    if (d >= 2) F.box(M, t - 0.62, t + 0.62, wallH + MERLON_H, wallH + MERLON_H + 0.13, zo - 0.57, zo + 0.07, C.pale, { skip: 'd' });
  }
}

export function stairs(F, d) {
  const STAIR_W = 3, z0 = 6, z1 = -6, N = 14, dz = (z0 - z1) / N;
  for (const s of [-1, 1]) {
    const xs = s * (E - STAIR_W / 2);
    for (let i = 0; i < N; i++) {
      const h = (wallH * (i + 1)) / N;
      F.box('masonry', xs - STAIR_W / 2, xs + STAIR_W / 2, 0, h, z0 - (i + 1) * dz, z0 - i * dz, F.jitter(C.step, 0.05), { skip: 'd' });
    }
    if (d >= 1) F.box('masonry', s * (E - STAIR_W), s * (E - STAIR_W) - s * 0.15, 0, 0.6, z1, z0, C.plinth, { skip: 'd' });
  }
  F.box('masonry', 5.8 - 0.45, 5.8 + 0.45, 0, 0.9, IN - 5 - 0.3, IN - 5 + 0.3, C.dark, { skip: 'd' });   // the lever's base
}

// ---------------------------------------------------------------- the wall walk: deck, joists, posts and braces
export function deck(A, d) {
  const T_ = 'timber';
  const slabs = [[-IN, IN, E, IN], [-IN, IN, -IN, -E], [-IN, -E, -E, E], [E, IN, -E, E], [E - 3, E, -E, -6], [-E, -E + 3, -E, -6]];
  for (const [x0, x1, z0, z1] of slabs) {
    A.box(T_, x0, x1, wallH - 0.45, wallH, z0, z1, A.jitter(C.wood, 0.05), { grain: x1 - x0 > z1 - z0 ? 0 : 2 });
    if (d >= 1) {                                                               // joists under the planks, every 2.4 m, and a rim beam
      const alongX = x1 - x0 > z1 - z0;
      const len = alongX ? x1 - x0 : z1 - z0;
      for (let t = 1.2; t < len; t += 2.4) {
        if (alongX) A.box(T_, x0 + t - 0.1, x0 + t + 0.1, wallH - 0.8, wallH - 0.45, z0, z1, C.woodDark);
        else A.box(T_, x0, x1, wallH - 0.8, wallH - 0.45, z0 + t - 0.1, z0 + t + 0.1, C.woodDark);
      }
    }
  }
  const post = (x, z) => {
    A.box(T_, x - 0.19, x + 0.19, 0, wallH - 0.45, z - 0.19, z + 0.19, A.jitter(C.woodDark, 0.08), { skip: 'd', grain: 1 });
    if (d >= 1) {                                                               // a diagonal brace up toward the wall
      // outward brace: from the post up and away from the courtyard to the rim beam
      const ox = Math.abs(x) > Math.abs(z) ? Math.sign(x) : 0, oz = Math.abs(x) > Math.abs(z) ? 0 : Math.sign(z);
      const br = between(x, wallH - 2.6, z, x + ox * 1.1, wallH - 0.5, z + oz * 1.1);
      A.obox(T_, br.m, 0.07, 0.07, br.half, C.woodDark);
    }
  };
  for (let t = -E; t <= E + 0.01; t += (2 * E) / 6) {
    if (Math.abs(t) > 3.6) post(t, E);
    post(t, -E);
    if (Math.abs(t) > 6.5) { post(-E, t); post(E, t); }
  }
  for (const sx of [-1, 1]) post(sx * (E - 3), -10.2);
}

// ---------------------------------------------------------------- corner towers
export function tower(K, A, R, sx, sz, d) {
  const M = 'masonry';
  const bx = (key, P, x0, x1, z0, z1, y0, y1, col, o) => P.box(key, sx * x0, sx * x1, y0, y1, sz * z0, sz * z1, col, o);
  const m = (x0, x1, z0, z1, y0, y1, col, o) => bx(M, K, x0, x1, z0, z1, y0, y1, col, o);
  const W = 1, FLOOR = wallH, lowered = FLOOR - 0.03, RISE = 2.5, A0 = H, A1 = H + 4.5, B0 = 21.5, B1 = F1 - W, SA = [19, 21.5], SB = [F1 - W - 2, F1 - W];
  m(F0, F1 + 0.3, F0, F1 + 0.3, 0, 1.0, C.plinth, { skip: 'd' });                    // plinth
  m(F0, F1, F0, F1, 0, lowered, C.stone, { skip: 'd' });                              // the solid base
  m(F0, F1 + 0.15, F0, F1 + 0.15, lowered - 0.3, lowered + 0.05, C.dark);            // string course under the upper room
  if (d >= 1) {
    m(F0, F1 + 0.14, F0, F1 + 0.14, 1.0, 1.3, C.plinth);
    m(F0, F1 + 0.1, F0, F1 + 0.1, 4.3, 4.55, C.dark);
  }
  m(F1 - W, F1, F0, F1 - W, lowered, towerH, C.stone);                               // east wall
  m(F0, F1, F1 - W, F1, lowered, towerH, C.stone);                                   // north wall
  m(F0, F0 + W, H, F1 - W, lowered, towerH, C.stone);                                // west wall (from the wall's outer face)
  m(H, F1 - W, F0, F0 + W, lowered, towerH, C.stone);                                // south wall
  if (d >= 1) {                                                                       // the roof edge overhangs on corbels
    m(F1, F1 + 0.42, F0, F1 + 0.42, towerH - 0.5, towerH, C.stone);
    m(F0, F1, F1, F1 + 0.42, towerH - 0.5, towerH, C.stone);
    m(F0 - 0.42, F0, H, F1 + 0.42, towerH - 0.5, towerH, C.stone);
    m(H, F1, F0 - 0.42, F0, towerH - 0.5, towerH, C.stone);
    for (let t = F0 + 1.2; t < F1; t += 1.6) {
      m(F1, F1 + 0.3, t - 0.24, t + 0.24, towerH - 1.0, towerH - 0.5, C.stone);
      m(t - 0.24, t + 0.24, F1, F1 + 0.3, towerH - 1.0, towerH - 0.5, C.stone);
      if (d >= 2) { m(F1, F1 + 0.15, t - 0.24, t + 0.24, towerH - 1.5, towerH - 1.0, C.stone); m(t - 0.24, t + 0.24, F1, F1 + 0.15, towerH - 1.5, towerH - 1.0, C.stone); }
      if (t > H + 0.5) {
        m(F0 - 0.3, F0, t - 0.24, t + 0.24, towerH - 1.0, towerH - 0.5, C.stone);
        m(t - 0.24, t + 0.24, F0 - 0.3, F0, towerH - 1.0, towerH - 0.5, C.stone);
      }
    }
  }
  // merlons round the roof edge
  const mer = (cx, cz, len, alongX, outer) => {
    const n = Math.floor(len / 2);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + 1 + i * 2, lx = alongX ? cx + t : cx + outer, lz = alongX ? cz + outer : cz + t, hx = alongX ? 0.55 : 0.25, hz = alongX ? 0.25 : 0.55;
      m(lx - hx, lx + hx, lz - hz, lz + hz, towerH, towerH + MERLON_H, C.stone, { skip: 'd' });
      if (d >= 2) m(lx - hx - 0.07, lx + hx + 0.07, lz - hz - 0.07, lz + hz + 0.07, towerH + MERLON_H, towerH + MERLON_H + 0.13, C.pale, { skip: 'd' });
    }
  };
  mer(F1 - W / 2, (F0 + F1) / 2, F1 - F0, false, W / 2 - 0.25);
  mer((F0 + F1) / 2, F1 - W / 2, F1 - F0, true, W / 2 - 0.25);
  mer(F0 + W / 2, (H + F1) / 2, F1 - H, false, -(W / 2 - 0.25));
  mer((H + F1) / 2, F0 + W / 2, F1 - H, true, -(W / 2 - 0.25));
  // arrow slits with frames, on the two outer faces
  for (const k of [20.6, 22.5, 24.4]) {
    if (d >= 1) {
      m(F1, F1 + 0.08, k - 0.34, k + 0.34, lowered + 1.75, lowered + 3.5, C.pale);
      m(k - 0.34, k + 0.34, F1, F1 + 0.08, lowered + 1.75, lowered + 3.5, C.pale);
    }
    m(F1 + 0.01, F1 + 0.1, k - 0.08, k + 0.08, lowered + 2.0, lowered + 3.2, C.black);
    m(k - 0.08, k + 0.08, F1 + 0.01, F1 + 0.1, lowered + 2.0, lowered + 3.2, C.black);
  }
  // the roof deck and the stairs up to it
  bx('timber', A, F0 + W, F1 - W - 2, B0, F1 - W, towerH - 0.4, towerH, A.jitter(C.wood, 0.05), { grain: 0 });
  const N = 9;
  for (let i = 0; i < N; i++) {
    const x0 = A0 + (A1 - A0) * i / N, x1 = A0 + (A1 - A0) * (i + 1) / N;
    m(x0, x1, SA[0], SA[1], lowered, FLOOR + RISE * (i + 1) / N, C.step, { skip: 'd' });
    const z0 = B0 + (B1 - B0) * i / N, z1 = B0 + (B1 - B0) * (i + 1) / N;
    m(SB[0], SB[1], z0, z1, lowered, FLOOR + RISE + RISE * (i + 1) / N, C.step, { skip: 'd' });
  }
  m(A1, F1 - W, SA[0], SA[1], lowered, FLOOR + RISE, C.step, { skip: 'd' });          // the landing
  void R;
}

// ---------------------------------------------------------------- the keep
// A hip roof: four slopes from the eave rectangle (centre cx, cz, half sizes ax, az) at y0 up to a ridge (half length rh along x) at y0 + rise.
function hip(R, key, cx, cz, ax, az, y0, rise, rh, tint, s = 2) {
  const y1 = y0 + rise, L = Math.hypot(az, rise), Ls = Math.hypot(ax - rh, rise);
  R.quad(key, [cx - ax, y0, cz + az], [cx + ax, y0, cz + az], [cx + rh, y1, cz], [cx - rh, y1, cz], tint, [0, 0, 2 * ax / s, 0, (ax + rh) / s, L / s, (ax - rh) / s, L / s]);
  R.quad(key, [cx + ax, y0, cz - az], [cx - ax, y0, cz - az], [cx - rh, y1, cz], [cx + rh, y1, cz], tint, [0, 0, 2 * ax / s, 0, (ax + rh) / s, L / s, (ax - rh) / s, L / s]);
  R.quad(key, [cx + ax, y0, cz + az], [cx + ax, y0, cz - az], [cx + rh, y1, cz], [cx + rh, y1, cz], tint, [0, 0, 2 * az / s, 0, az / s, Ls / s, az / s, Ls / s]);
  R.quad(key, [cx - ax, y0, cz - az], [cx - ax, y0, cz + az], [cx - rh, y1, cz], [cx - rh, y1, cz], tint, [0, 0, 2 * az / s, 0, az / s, Ls / s, az / s, Ls / s]);
}

export function keep(K, A, R, d) {
  const M = 'masonry', x0 = -HW, x1 = HW, z0 = KEEP_Z - HW, z1 = KEEP_Z + HW;
  K.box(M, x0, x1, 0, keepH, z0, z1, C.stone, { skip: 'd' });
  K.box(M, x0 - 0.35, x1 + 0.35, 0, 1.2, z0 - 0.35, z1 + 0.35, C.plinth, { skip: 'd' });
  if (d >= 1) {
    K.box(M, x0 - 0.2, x1 + 0.2, 1.2, 1.5, z0 - 0.2, z1 + 0.2, C.plinth);
    for (const y of [5.2, 10.2]) K.box(M, x0 - 0.14, x1 + 0.14, y, y + 0.3, z0 - 0.14, z1 + 0.14, C.dark);
  }
  // corner buttresses (the same footprint as ever), capped
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (HW - 0.3), cz = KEEP_Z + sz * (HW - 0.3);
    K.box(M, cx - 0.7, cx + 0.7, 0, keepH - 2, cz - 0.7, cz + 0.7, C.stone, { skip: 'd' });
    if (d >= 1) K.box(M, cx - 0.85, cx + 0.85, keepH - 2, keepH - 1.65, cz - 0.85, cz + 0.85, C.pale);
    if (d >= 2) K.cyl(M, 0, 0.55, 1.1, 8, place(cx, keepH - 1.65, cz), C.pale);
  }
  // the parapet: a corbelled slab, then the merlons
  if (d >= 1) {
    K.box(M, x0 - 0.4, x1 + 0.4, keepH - 0.55, keepH, z0 - 0.4, z1 + 0.4, C.stone);
    for (let t = -HW + 0.9; t < HW; t += 1.6) {
      for (const [x, z, ax] of [[t, z0, 1], [t, z1, 1], [x0, KEEP_Z + t, 0], [x1, KEEP_Z + t, 0]]) {
        const o = 0.3;
        if (ax) K.box(M, x - 0.24, x + 0.24, keepH - 1.1, keepH - 0.55, z < KEEP_Z ? z - o : z, z < KEEP_Z ? z : z + o, C.stone);
        else K.box(M, x < 0 ? x - o : x, x < 0 ? x : x + o, keepH - 1.1, keepH - 0.55, z - 0.24, z + 0.24, C.stone);
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const t = -HW + 0.9 + i * ((keepW - 1.8) / 5);
    for (const [x, z, rx] of [[t, KEEP_Z - HW + 0.25, true], [t, KEEP_Z + HW - 0.25, true], [-HW + 0.25, KEEP_Z + t, false], [HW - 0.25, KEEP_Z + t, false]]) {
      const hx = rx ? 0.5 : 0.25, hz = rx ? 0.25 : 0.5;
      K.box(M, x - hx, x + hx, keepH, keepH + 1.2, z - hz, z + hz, C.stone, { skip: 'd' });
      if (d >= 2) K.box(M, x - hx - 0.07, x + hx + 0.07, keepH + 1.2, keepH + 1.33, z - hz - 0.07, z + hz + 0.07, C.pale, { skip: 'd' });
    }
  }
  // a tiled hip roof inside the parapet, with chimneys
  if (d >= 1) {
    hip(R, 'roof', 0, KEEP_Z, HW - 0.9, HW - 0.9, keepH, 3.2, 1.8, C.slate);
    if (d >= 2) {
      for (const [x, z] of [[-2.4, KEEP_Z + 1.2], [2.2, KEEP_Z - 1.6]]) {
        K.box(M, x - 0.5, x + 0.5, keepH + 1.5, keepH + 4.1, z - 0.5, z + 0.5, C.stone);
        K.box(M, x - 0.62, x + 0.62, keepH + 4.1, keepH + 4.3, z - 0.62, z + 0.62, C.dark);
      }
    }
  }
  // the round turret on the back right corner, with its cone roof and finial
  const tx = HW - 1, tz = KEEP_Z - HW + 1;
  K.cyl(M, 1.8, 1.8, 6, 16, place(tx, keepH, tz), C.stone, { skip: 'd' });
  if (d >= 1) {
    K.cyl(M, 2.15, 1.8, 0.55, 16, place(tx, keepH + 5.45, tz), C.pale);
    for (let i = 0; i < 4; i++) {                                                     // slit windows, round the turret
      const a = i * Math.PI / 2 + 0.4;
      K.box(M, tx + Math.sin(a) * 1.78 - 0.07, tx + Math.sin(a) * 1.78 + 0.07, keepH + 2.2, keepH + 3.6, tz + Math.cos(a) * 1.78 - 0.07, tz + Math.cos(a) * 1.78 + 0.07, C.black);
    }
  }
  R.cyl('roof', 0, 2.3, 3.5, 16, place(tx, keepH + 6, tz), C.slate);
  if (d >= 1) {
    A.cyl('metal', 0.04, 0.04, 1.2, 6, place(tx, keepH + 9.4, tz), C.ironLight);
    A.add('metal', new THREE.SphereGeometry(0.16, 8, 6), place(tx, keepH + 9.5, tz), C.gold);
  }
  // door, with its stone frame, steps and iron straps
  const zf = z1;
  K.box(M, -1.85, -1.2, 0, 4.2, zf - 0.02, zf + 0.22, C.pale);
  K.box(M, 1.2, 1.85, 0, 4.2, zf - 0.02, zf + 0.22, C.pale);
  K.box(M, -1.85, 1.85, 3.6, 4.25, zf - 0.02, zf + 0.22, C.pale);
  K.box(M, -2.2, 2.2, 0, 0.18, zf, zf + 0.9, C.step, { skip: 'd' });
  if (d >= 1) K.box(M, -2.0, 2.0, 0.18, 0.34, zf, zf + 0.5, C.step, { skip: 'd' });
  for (const s of [-1, 1]) A.box('timber', s * 0.02, s * 1.2, 0, 3.6, zf + 0.0, zf + 0.12, A.jitter(C.wood, 0.05), { grain: 1, skip: 'd' });
  if (d >= 1) for (const y of [0.7, 1.9, 3.0]) for (const s of [-1, 1]) A.box('metal', Math.min(s * 0.04, s * 1.15), Math.max(s * 0.04, s * 1.15), y, y + 0.14, zf + 0.12, zf + 0.17, C.iron);
  // windows: dark panes with stone frames and (richest) open shutters
  for (const [x, y] of [[-3, 7], [3, 7], [-3, 11], [3, 11], [0, 11]]) {
    A.box('plain', x - 0.35, x + 0.35, y - 0.7, y + 0.7, zf + 0.0, zf + 0.06, C.black);
    if (d >= 1) {
      K.box(M, x - 0.55, x + 0.55, y - 0.85, y - 0.7, zf, zf + 0.28, C.pale);
      K.box(M, x - 0.5, x + 0.5, y + 0.7, y + 0.88, zf, zf + 0.2, C.pale);
      K.box(M, x - 0.5, x - 0.35, y - 0.7, y + 0.7, zf, zf + 0.16, C.pale);
      K.box(M, x + 0.35, x + 0.5, y - 0.7, y + 0.7, zf, zf + 0.16, C.pale);
    }
    if (d >= 2) for (const s of [-1, 1]) A.obox('timber', place(x + s * 0.62, y, zf + 0.12, s * 0.9), 0.16, 0.66, 0.025, C.woodDark);
  }
}

// ---------------------------------------------------------------- the courtyard floor
const hash = (x, z) => { let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return hash(ix, iz) * (1 - ux) * (1 - uz) + hash(ix + 1, iz) * ux * (1 - uz) + hash(ix, iz + 1) * (1 - ux) * uz + hash(ix + 1, iz + 1) * ux * uz;
};
export function courtyard(A, d, seed) {
  const a = A.a('ground'), N = d >= 2 ? 24 : 12, step = (2 * IN) / N, y = 0.05;
  const col = (x, z) => {
    const mud = vnoise(x * 0.23 + seed, z * 0.23) * 0.7 + vnoise(x * 0.7, z * 0.7 + seed) * 0.3;
    const wall = Math.min(1, Math.max(Math.abs(x), Math.abs(z)) > IN - 4 ? (Math.max(Math.abs(x), Math.abs(z)) - (IN - 4)) / 4 : 0);
    const k = 0.78 + mud * 0.5 - wall * 0.12;
    return [k * (1 + (1 - mud) * 0.0), k * (0.97 - (1 - mud) * 0.05), k * (0.92 - (1 - mud) * 0.14)];
  };
  const vi = (i, j) => { const x = -IN + i * step, z = -IN + j * step; return [x, z, col(x, z)]; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = [vi(i, j), vi(i + 1, j), vi(i + 1, j + 1), vi(i, j + 1)], base = a.pos.length / 3;
    for (const [x, z, c] of v) A._vert(a, x, y, z, 0, 1, 0, x / 4, z / 4, c);
    a.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
}
