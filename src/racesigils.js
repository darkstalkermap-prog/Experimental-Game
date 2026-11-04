// The races' own sigils (unlocks.js RACE_SIGILS names them) and the hand each is painted in. Every design here is our own, drawn from plain
// things a smith, a forester, a raider or a grave would know (an anvil, a leaf, a cleaver, a lantern); none copies an emblem of any story.
// A painter draws centred on (0, 0) inside a circle of radius 50, in the canvas's fillStyle, with its details cut out in `ink` (the field),
// as the painters of emblems.js do. Then the race's HAND goes over it (paintHand): the orcs' daubed on by hand with rough edges and drips,
// the elves' and the dwarves' engraved and gilt (a bevel lit from above), the undead's faded and flaking. Only the look: no game rule reads it.

const TAU = Math.PI * 2, PI = Math.PI;
function path(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}
const fillPath = (ctx, pts) => { path(ctx, pts); ctx.fill(); };
const sym = (half) => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }
function stroke(ctx, pts, w) {
  ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(ctx, pts, false); ctx.stroke();
}
// a leaf from (0, y0) to its tip at (0, y1), w half-wide
function leaf(ctx, y0, y1, w) {
  const m = (y0 + y1) / 2;
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.quadraticCurveTo(w * 1.5, m, 0, y1); ctx.quadraticCurveTo(-w * 1.5, m, 0, y0); ctx.fill();
}
// a small skull, the jaw apart (the undead's and the orcs' trophies)
function skullAt(ctx, ink, x, y, k, broken = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.beginPath(); ctx.arc(0, -6, 22, PI * 0.82, PI * 0.18); ctx.lineTo(12, 16); ctx.lineTo(-12, 16); ctx.closePath(); ctx.fill();
  fillPath(ctx, [[-11, 18], [11, 18], [9, 28], [-9, 28]]);
  const f = ctx.fillStyle;
  ctx.fillStyle = ink;
  ellipse(ctx, -9, -4, 6, 7); ellipse(ctx, 9, -4, 6, 7);
  fillPath(ctx, [[0, 4], [4, 11], [-4, 11]]);
  for (const t of [-5, 0, 5]) fillPath(ctx, [[t - 1, 19], [t + 1, 19], [t + 1, 27], [t - 1, 27]]);
  if (broken) { ctx.strokeStyle = ink; stroke(ctx, [[3, -28], [-2, -18], [4, -12], [-1, -6]], 2.6); }
  ctx.fillStyle = f; ctx.strokeStyle = f;
  ctx.restore();
}

export const RACE_PAINT = {
  // ================================================================ Elves
  // a crescent moon, horns up, cradling a single long leaf standing over it
  moonleaf(ctx, ink) {
    ctx.beginPath(); ctx.arc(0, 14, 34, -0.35, PI + 0.35, false); ctx.arc(0, 2, 30, PI + 0.05, -0.05, true); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(0, 4); leaf(ctx, 2, -50, 13); ctx.restore();
    ctx.strokeStyle = ink; stroke(ctx, [[0, 4], [0, -40]], 1.8);
    for (const y of [-10, -22, -32]) { stroke(ctx, [[0, y + 4], [7, y - 3]], 1.3); stroke(ctx, [[0, y + 4], [-7, y - 3]], 1.3); }
  },
  // a swan's wing raised, the long flight feathers fanned to the fly
  swanwing(ctx, ink) {
    ctx.beginPath(); ctx.moveTo(-34, 34); ctx.bezierCurveTo(-40, 0, -26, -34, 4, -46); ctx.bezierCurveTo(-8, -30, -10, -14, -6, 0); ctx.closePath(); ctx.fill();   // the arm of the wing
    for (let i = 0; i < 6; i++) {   // the flight feathers, longest at the top
      const a = -1.05 + i * 0.27, L = 52 - i * 4;
      ctx.save(); ctx.translate(-22 + i * 2.5, 22 - i * 9); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.55, -9, L, -2); ctx.quadraticCurveTo(L * 0.55, 6, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = ink;
    for (let i = 0; i < 5; i++) { const a = -1.05 + i * 0.27 + 0.13, x = -20 + i * 2.5, y = 18 - i * 9; stroke(ctx, [[x, y], [x + Math.cos(a) * 30, y + Math.sin(a) * 30]], 1.5); }
    stroke(ctx, [[-28, 26], [-20, -18], [-2, -38]], 1.6);
  },
  // a star of nine rays, long and short by turns, in a ring of small leaves
  leafstar(ctx, ink) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      ctx.save(); ctx.rotate(a); ctx.translate(0, -42); ctx.rotate(PI / 2); leaf(ctx, -7, 7, 3.6); ctx.restore();
    }
    path(ctx, Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * TAU - PI / 2, r = i % 2 ? 10 : (i / 2) % 2 ? 24 : 32; return [Math.cos(a) * r, Math.sin(a) * r]; })); ctx.fill();
    ctx.fillStyle = ink; disc(ctx, 0, 0, 4);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 42, 0, TAU); ctx.stroke();
  },
  // an arrow flying up through a ring, its fletching below
  ringarrow(ctx, ink) {
    ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 4, 27, 0, TAU); ctx.stroke();
    ctx.save(); ctx.rotate(0.35);
    fillPath(ctx, [[-2.6, 44], [2.6, 44], [2.6, -36], [-2.6, -36]]);
    fillPath(ctx, [[0, -54], [9, -34], [0, -38], [-9, -34]]);                                                    // the leaf head
    for (const s of [-1, 1]) fillPath(ctx, [[s * 2, 26], [s * 12, 36], [s * 12, 50], [s * 2, 42]]);           // the fletching
    ctx.restore();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 4, 27, 0, TAU); ctx.stroke();
  },
  // a crown of oak leaves round a plain circlet, an acorn at its brow
  oakcrown(ctx, ink) {
    ctx.beginPath(); ctx.ellipse(0, 18, 38, 12, 0, 0, TAU); ctx.ellipse(0, 18, 30, 7, 0, 0, TAU, true); ctx.fill('evenodd');   // the circlet
    for (let i = 0; i < 7; i++) {   // the leaves rising round it, lobed (three discs and a point each)
      const t = (i - 3) / 3, x = t * 32, y = 10 - (1 - t * t) * 6, h = 24 + (1 - Math.abs(t)) * 12;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.55);
      ellipse(ctx, 0, -h * 0.55, 7, h * 0.48);
      for (const s of [-1, 1]) for (const k of [0.3, 0.62]) disc(ctx, s * 6, -h * k, 4.5);
      ctx.restore();
    }
    ellipse(ctx, 0, 30, 7, 9); fillPath(ctx, [[-8, 25], [8, 25], [6, 21], [-6, 21]]);                            // the acorn and its cup
    ctx.strokeStyle = ink; stroke(ctx, [[-30, 18], [30, 18]], 1.4); stroke(ctx, [[-8, 25], [8, 25]], 1.4);
  },
  // a hind leaping, its forelegs drawn up
  hindleap(ctx, ink) {
    ctx.beginPath(); ctx.moveTo(-34, 14); ctx.bezierCurveTo(-20, -6, 10, -8, 24, -4); ctx.bezierCurveTo(30, 6, 14, 14, -2, 14); ctx.bezierCurveTo(-14, 16, -24, 22, -34, 14); ctx.fill();   // the body
    ctx.strokeStyle = ctx.fillStyle;
    stroke(ctx, [[22, -4], [30, -22], [36, -32]], 7);                                                            // the neck
    ellipse(ctx, 40, -34, 9, 5.5, 0.4);                                                                          // the head
    fillPath(ctx, [[36, -40], [33, -52], [40, -42]]); fillPath(ctx, [[40, -40], [42, -51], [44, -40]]);         // the ears
    stroke(ctx, [[18, 6], [32, 6], [42, 16]], 4); stroke(ctx, [[14, 8], [26, 14], [32, 26]], 4);               // the forelegs, folded
    stroke(ctx, [[-28, 14], [-40, 26], [-50, 30]], 4.5); stroke(ctx, [[-22, 16], [-30, 30], [-42, 40]], 4.5);  // the hind legs, thrown out
    fillPath(ctx, [[-34, 10], [-42, 2], [-36, 14]]);                                                            // the scut
    ctx.fillStyle = ink; disc(ctx, 41, -35, 1.6);
  },

  // ================================================================ Dwarves
  // an anvil, a hammer standing on it
  anvil(ctx, ink) {
    ctx.beginPath(); ctx.moveTo(-44, -6); ctx.quadraticCurveTo(-30, -2, -22, 6); ctx.lineTo(22, 6); ctx.lineTo(34, -6); ctx.lineTo(34, -14); ctx.lineTo(-30, -14); ctx.quadraticCurveTo(-40, -12, -44, -6); ctx.fill();   // the face and the horn
    fillPath(ctx, [[-12, 6], [12, 6], [8, 26], [-8, 26]]);                                                      // the waist
    fillPath(ctx, [[-26, 26], [26, 26], [30, 38], [-30, 38]]);                                                  // the foot
    ctx.save(); ctx.rotate(0.3);
    fillPath(ctx, [[-3.5, -18], [3.5, -18], [3.5, -50], [-3.5, -50]]);                                          // the haft
    fillPath(ctx, [[-14, -54], [14, -54], [14, -42], [-14, -42]]);                                              // the head
    ctx.restore();
    ctx.fillStyle = ink; fillPath(ctx, [[-10, -10], [10, -10], [10, -8], [-10, -8]]); disc(ctx, 20, -10, 2);  // the hardy hole and the pritchel
    ctx.strokeStyle = ink; stroke(ctx, [[-24, 32], [24, 32]], 1.6);
  },
  // a mountain of three peaks, an invented rune cut in the middle one (a stave with a hooked arm and a cross-stroke)
  peakrune(ctx, ink) {
    fillPath(ctx, [[-50, 38], [-26, -6], [-16, 6], [0, -44], [16, 6], [26, -6], [50, 38]]);
    ctx.strokeStyle = ink;
    stroke(ctx, [[0, -16], [0, 26]], 3.4);
    stroke(ctx, [[0, -12], [9, -4], [9, 6]], 3);
    stroke(ctx, [[-8, 12], [8, 18]], 3);
    stroke(ctx, [[-10, -24], [0, -40], [10, -24]], 2.2);                                                        // the snow line
  },
  // a forge's flame leaping from a square-mouthed hearth
  forge(ctx, ink) {
    ctx.beginPath(); ctx.moveTo(-18, 12); ctx.bezierCurveTo(-30, -6, -12, -18, -16, -36); ctx.bezierCurveTo(-4, -28, -2, -18, 0, -10);
    ctx.bezierCurveTo(0, -30, 10, -40, 6, -54); ctx.bezierCurveTo(24, -38, 24, -18, 16, -6); ctx.bezierCurveTo(22, -14, 26, -20, 24, -28);
    ctx.bezierCurveTo(36, -12, 30, 4, 18, 12); ctx.closePath(); ctx.fill();
    fillPath(ctx, [[-34, 12], [34, 12], [34, 46], [-34, 46]]);                                                  // the hearth
    ctx.fillStyle = ink;
    fillPath(ctx, [[-18, 22], [18, 22], [18, 38], [-18, 38]]);                                                  // its mouth
    ctx.beginPath(); ctx.moveTo(-6, 10); ctx.bezierCurveTo(-10, -2, 0, -8, -2, -18); ctx.bezierCurveTo(8, -8, 10, 2, 6, 10); ctx.fill();   // the flame's heart
    for (const x of [-26, 26]) for (const y of [18, 40]) disc(ctx, x, y, 2);                                    // rivets
  },
  // two mattocks crossed, the blades out
  mattocks(ctx, ink) {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * 0.72);
      fillPath(ctx, [[-3.5, 46], [3.5, 46], [3, -36], [-3, -36]]);                                              // the haft
      ctx.beginPath(); ctx.moveTo(-6, -44); ctx.lineTo(6, -44); ctx.lineTo(6, -30); ctx.lineTo(-6, -30); ctx.closePath(); ctx.fill();   // the eye
      ctx.beginPath(); ctx.moveTo(-6, -42); ctx.quadraticCurveTo(-22, -46, -36, -38); ctx.lineTo(-34, -30); ctx.quadraticCurveTo(-20, -34, -6, -32); ctx.closePath(); ctx.fill();   // the pick
      ctx.beginPath(); ctx.moveTo(6, -42); ctx.lineTo(26, -46); ctx.lineTo(30, -28); ctx.lineTo(6, -32); ctx.closePath(); ctx.fill();   // the adze blade
      ctx.strokeStyle = ink; stroke(ctx, [[0, 40], [0, 30]], 1.6);
      ctx.restore();
    }
  },
  // a stern face on a round shield, the beard in two braids below
  beardface(ctx, ink) {
    disc(ctx, 0, -6, 34);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 4, 14); ctx.quadraticCurveTo(s * 18, 30, s * 12, 52); ctx.lineTo(s * 4, 50); ctx.quadraticCurveTo(s * 8, 32, s * 0, 20); ctx.fill();
    }
    ctx.fillStyle = ink;
    fillPath(ctx, [[-22, -14], [-4, -10], [-4, -6], [-22, -9]]); fillPath(ctx, [[22, -14], [4, -10], [4, -6], [22, -9]]);   // the brows, low and heavy
    disc(ctx, -12, -2, 2.6); disc(ctx, 12, -2, 2.6);
    fillPath(ctx, [[-3, -6], [3, -6], [5, 8], [-5, 8]]);                                                        // the nose
    ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, -6, 30, 0.4, PI - 0.4); ctx.stroke();                                           // where the beard begins
    for (const x of [-14, -7, 7, 14]) stroke(ctx, [[x, 14], [x * 0.8, 24]], 1.4);
    stroke(ctx, [[-10, 14], [10, 14]], 2.4);                                                                    // the mouth, set
    for (const s of [-1, 1]) for (const y of [34, 44]) stroke(ctx, [[s * 4, y], [s * 12, y - 2]], 1.6);           // the braids' rings
  },
  // three ingots stacked, two below and one across them
  ingot(ctx, ink) {
    const bar = (x, y) => fillPath(ctx, [[x - 22, y + 10], [x + 22, y + 10], [x + 17, y - 8], [x - 17, y - 8]]);
    bar(-22, 26); bar(22, 26); bar(0, 4);
    fillPath(ctx, [[-14, -30], [14, -30], [8, -42], [-8, -42]]);                                                 // the little one on top
    ctx.strokeStyle = ink;
    for (const [x, y] of [[-22, 26], [22, 26], [0, 4]]) stroke(ctx, [[x - 12, y - 3], [x + 12, y - 3]], 1.6);
    stroke(ctx, [[-14, -30], [14, -30]], 1.6);
  },

  // ================================================================ Orcs
  // a fanged maw: jaws gaping, long teeth up and down, the eyes slits above
  maw(ctx, ink) {
    ctx.beginPath(); ctx.moveTo(-44, -12); ctx.quadraticCurveTo(0, -46, 44, -12); ctx.lineTo(38, 2); ctx.quadraticCurveTo(0, -12, -38, 2); ctx.closePath(); ctx.fill();   // the upper jaw
    ctx.beginPath(); ctx.moveTo(-40, 14); ctx.quadraticCurveTo(0, 0, 40, 14); ctx.lineTo(30, 34); ctx.quadraticCurveTo(0, 50, -30, 34); ctx.closePath(); ctx.fill();      // the lower jaw
    for (const x of [-30, -16, 16, 30]) fillPath(ctx, [[x - 4, -2 - Math.abs(x) * 0.25], [x + 4, -2 - Math.abs(x) * 0.25], [x + 0.5, 14]]);   // the upper fangs
    for (const x of [-22, 0, 22]) fillPath(ctx, [[x - 4, 10 - (x ? 0 : 3)], [x + 4, 10 - (x ? 0 : 3)], [x, -6]]);                              // the lower
    for (const s of [-1, 1]) fillPath(ctx, [[s * 34, 18], [s * 42, 14], [s * 44, -12]]);                                                      // the tusks
    ctx.fillStyle = ink;
    for (const s of [-1, 1]) fillPath(ctx, [[s * 8, -22], [s * 26, -30], [s * 24, -24], [s * 10, -18]]);
  },
  // two cleavers crossed, the broad blades up
  cleavers(ctx, ink) {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * 0.6);
      fillPath(ctx, [[-4, 46], [4, 46], [4, 14], [-4, 14]]);                                                      // the grip
      disc(ctx, 0, 48, 5);
      fillPath(ctx, [[-6, 16], [-6, -46], [16, -50], [20, -40], [17, -32], [21, -24], [18, -14], [20, 0], [16, 16]]);   // the blade, its edge notched
      ctx.fillStyle = ink; disc(ctx, 8, -40, 3);                                                                  // the hole at its corner
      ctx.restore();
    }
  },
  // a skull split by a blow, the jaw gone, a crack running down from the crown
  brokenskull(ctx, ink) {
    ctx.beginPath(); ctx.arc(0, -4, 34, PI * 0.85, PI * 0.15); ctx.lineTo(20, 26); ctx.lineTo(10, 30); ctx.lineTo(-10, 30); ctx.lineTo(-20, 26); ctx.closePath(); ctx.fill();
    fillPath(ctx, [[-16, 34], [-4, 34], [-6, 44], [-14, 44]]);                                                    // a piece of the jaw, fallen away
    ctx.fillStyle = ink;
    fillPath(ctx, [[-22, -10], [-6, -6], [-8, 8], [-20, 6]]); fillPath(ctx, [[22, -10], [6, -6], [8, 8], [20, 6]]);   // the sockets, square and mean
    fillPath(ctx, [[0, 10], [5, 20], [-5, 20]]);
    for (const x of [-12, -6, 0, 6, 12]) fillPath(ctx, [[x - 1.3, 24], [x + 1.3, 24], [x + 1.3, 31], [x - 1.3, 31]]);
    ctx.strokeStyle = ink; stroke(ctx, [[4, -38], [-4, -26], [6, -16], [0, -6]], 3.6);                             // the crack
    fillPath(ctx, [[2, -40], [12, -40], [4, -30]]);                                                                // the notch the blow left
  },
  // a war-axe: one jagged crescent bit on a spiked haft
  waraxe(ctx, ink) {
    ctx.save(); ctx.rotate(0.22);
    fillPath(ctx, [[-3.5, 50], [3.5, 50], [3.5, -36], [-3.5, -36]]);
    fillPath(ctx, [[0, -54], [5, -36], [-5, -36]]);                                                                // the spike on top
    ctx.beginPath(); ctx.moveTo(3, -30); ctx.lineTo(18, -36); ctx.lineTo(28, -44); ctx.lineTo(30, -32); ctx.lineTo(40, -30); ctx.lineTo(36, -18); ctx.lineTo(44, -8);
    ctx.lineTo(36, 0); ctx.lineTo(40, 12); ctx.lineTo(28, 10); ctx.lineTo(24, 22); ctx.lineTo(16, 6); ctx.lineTo(3, 2); ctx.closePath(); ctx.fill();   // the bit, its edge in teeth
    fillPath(ctx, [[-3, -24], [-16, -18], [-3, -12]]);                                                             // the back spike
    for (const y of [20, 30]) fillPath(ctx, [[-6, y], [6, y], [6, y + 4], [-6, y + 4]]);                          // lashings
    ctx.fillStyle = ink; disc(ctx, 16, -12, 3.6);
    ctx.restore();
  },
  // three claw slashes torn down across the field
  clawslash(ctx) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 22;
      ctx.beginPath(); ctx.moveTo(x + 14, -48); ctx.quadraticCurveTo(x + 4, -6, x - 14, 46); ctx.quadraticCurveTo(x + 14, 0, x + 22, -44); ctx.closePath(); ctx.fill();
    }
  },
  // a single great tusk, curved, bound at its root with a thong and a bead
  tusk(ctx, ink) {
    ctx.beginPath(); ctx.moveTo(-26, 40); ctx.bezierCurveTo(-34, 0, -10, -36, 28, -48); ctx.bezierCurveTo(4, -26, -6, 6, -6, 40); ctx.closePath(); ctx.fill();
    fillPath(ctx, [[-30, 34], [-2, 34], [-2, 46], [-30, 46]]);                                                    // the binding
    disc(ctx, 6, 48, 5); disc(ctx, -36, 48, 5);
    ctx.strokeStyle = ink; stroke(ctx, [[-28, 40], [-4, 40]], 1.8); stroke(ctx, [[-16, 20], [-12, 0], [0, -20]], 1.6);
  },

  // ================================================================ Undead
  // a skull under a crown of five crooked points
  crownskull(ctx, ink) {
    fillPath(ctx, [[-28, -18], [-32, -46], [-18, -30], [-8, -50], [0, -32], [8, -50], [18, -30], [32, -46], [28, -18]]);
    skullAt(ctx, ink, 0, 12, 1.15);
    ctx.save(); ctx.fillStyle = ink; fillPath(ctx, [[-28, -22], [28, -22], [28, -18], [-28, -18]]); ctx.restore();
  },
  // an eclipse: a dark moon over the sun, only the ragged ring of its light showing
  eclipse(ctx, ink) {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU, r = 38 + (i % 3) * 5, w = 0.1;
      fillPath(ctx, [[Math.cos(a - w) * 26, Math.sin(a - w) * 26], [Math.cos(a + 0.05) * r, Math.sin(a + 0.05) * r], [Math.cos(a + w) * 26, Math.sin(a + w) * 26]]);
    }
    disc(ctx, 0, 0, 30);
    ctx.fillStyle = ink; disc(ctx, 3, -2, 26);
  },
  // a raven perched on two crossed bones, its wings half open
  ravenbones(ctx, ink) {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * 0.5);
      fillPath(ctx, [[-3.5, 22], [3.5, 22], [3.5, 46], [-3.5, 46]]);
      for (const y of [20, 48]) { disc(ctx, -4, y, 5); disc(ctx, 4, y, 5); }
      ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(-6, 22); ctx.bezierCurveTo(-24, 8, -22, -14, -4, -22); ctx.bezierCurveTo(14, -24, 22, -2, 10, 22); ctx.closePath(); ctx.fill();   // the body
    disc(ctx, -8, -28, 9);
    fillPath(ctx, [[-14, -32], [-30, -26], [-14, -24]]);                                                            // the beak
    fillPath(ctx, [[10, 6], [30, 24], [16, 26]]);                                                                   // the tail
    for (const s of [-1, 1]) fillPath(ctx, [[s * 6, -14], [s * 34, -36], [s * 40, -20], [s * 30, -16], [s * 36, -6], [s * 14, 4]]);   // the wings
    ctx.fillStyle = ink; disc(ctx, -9, -30, 2);
    ctx.strokeStyle = ink; stroke(ctx, [[-6, 22], [-10, 30]], 2); stroke(ctx, [[4, 22], [6, 30]], 2);
  },
  // a sword broken a hand below the guard, the point lying apart
  brokensword(ctx, ink) {
    fillPath(ctx, [[-4, 2], [4, 2], [5, -26], [1, -22], [-2, -30], [-4, -24]]);                                  // the stump of the blade
    fillPath(ctx, [[-22, 2], [22, 2], [22, 10], [-22, 10]]);                                                       // the guard
    fillPath(ctx, [[-3.5, 10], [3.5, 10], [3.5, 30], [-3.5, 30]]);
    disc(ctx, 0, 36, 7);
    ctx.save(); ctx.translate(18, -30); ctx.rotate(0.6);
    fillPath(ctx, [[-4, -6], [-1, -14], [2, -8], [5, -12], [4, 26], [0, 36], [-4, 26]]);                           // the point, fallen aside
    ctx.restore();
    ctx.strokeStyle = ink; stroke(ctx, [[0, -2], [0, -18]], 1.4); stroke(ctx, [[0, 14], [0, 26]], 1.4);
  },
  // a lantern with its light gone out: the cage, the ring, the hollow inside
  lantern(ctx, ink) {
    ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -42, 7, 0, TAU); ctx.stroke();
    fillPath(ctx, [[-14, -36], [14, -36], [22, -24], [-22, -24]]);                                                 // the cap
    fillPath(ctx, [[-22, -24], [22, -24], [22, 30], [-22, 30]]);                                                   // the cage
    fillPath(ctx, [[-26, 30], [26, 30], [20, 42], [-20, 42]]);                                                     // the foot
    ctx.fillStyle = ink;
    for (const x of [-14, 0, 14]) fillPath(ctx, [[x - 5, -18], [x + 5, -18], [x + 5, 24], [x - 5, 24]]);         // the dark panes
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.quadraticCurveTo(-6, 6, 0, -6); ctx.quadraticCurveTo(6, 6, 0, 18); ctx.fill();   // the dead wick's last wisp
  },
  // a coffin, a cross cut through its lid
  coffincross(ctx, ink) {
    fillPath(ctx, [[-14, -48], [14, -48], [26, -22], [16, 48], [-16, 48], [-26, -22]]);
    ctx.fillStyle = ink;
    fillPath(ctx, [[-3.5, -36], [3.5, -36], [3.5, 34], [-3.5, 34]]);
    fillPath(ctx, [[-15, -18], [15, -18], [15, -11], [-15, -11]]);
    ctx.strokeStyle = ink; stroke(ctx, [[-22, -22], [-13, 44]], 1.4); stroke(ctx, [[22, -22], [13, 44]], 1.4);
  },
};

// ---------------------------------------------------------------- the hand each race paints in
// A deterministic dice of its own (never Math.random: see quietly in modelkit.js), seeded by what is painted, so a sigil looks the same each time.
function dice(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return s / 4294967296; };
}
const strHash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
let work = null;
// Paint sigil `id` (a painter of `paint`) at radius R with `fill` and `ink` in hand `hand` ('crude', 'gilt', 'faded' or none) on ctx, centred on
// its current (0, 0). The sigil is drawn on a canvas of its own first, the hand worked into its pixels there, and the result laid on ctx.
export function paintInHand(ctx, paint, id, R, fill, ink, hand) {
  if (!hand || typeof document === 'undefined') {
    ctx.save(); ctx.scale(R / 50, R / 50); ctx.fillStyle = fill; ctx.strokeStyle = fill; paint(ctx, ink); ctx.restore();
    return;
  }
  const m = ctx.getTransform(), k = Math.hypot(m.a, m.b) || 1;   // (the pixels the sigil will cover: worked at that size)
  const N = Math.max(24, Math.min(512, Math.ceil(R * k * 2.5)));
  if (!work) work = document.createElement('canvas');
  work.width = work.height = N;
  const w = work.getContext('2d', { willReadFrequently: true });
  w.clearRect(0, 0, N, N);
  w.save(); w.translate(N / 2, N / 2); w.scale(N / 125, N / 125);
  w.fillStyle = fill; w.strokeStyle = fill; paint(w, ink);
  w.restore();
  const img = w.getImageData(0, 0, N, N), d = img.data, rnd = dice(strHash(id + hand) + N);
  const A = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : d[(y * N + x) * 4 + 3]);
  const px = N / 125;   // (pixels to one unit of the painter's 50-radius space)
  const sd = rnd() * 50;
  // smooth noise in the painter's units (so a sigil is bitten the same at any size): -1..1
  const noise = (u, v, f) => 0.6 * Math.sin(u * f + sd) * Math.sin(v * f * 0.83 - sd * 1.3) + 0.4 * Math.sin((u * 0.7 + v) * f * 1.9 + sd * 2.1);
  if (hand === 'crude') {
    // daubed on: the edges bitten where the brush ran out, the strokes of the brush showing across it, and paint dripping down from the lower edges
    const out = new Uint8ClampedArray(d), e = Math.max(1, Math.round(px * 1.6));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      if (!d[i + 3]) continue;
      const u = x / px, v = y / px;
      const edge = !A(x - e, y) || !A(x + e, y) || !A(x, y - e) || !A(x, y + e);
      if (edge && noise(u, v, 0.55) > 0.25) { out[i + 3] = 0; continue; }
      const brush = Math.sin(v * 1.6 + Math.sin(u * 0.17 + sd) * 2.4);   // (the bristles' lines, across)
      if (brush > 0.7) { out[i] *= 0.84; out[i + 1] *= 0.84; out[i + 2] *= 0.84; }
    }
    d.set(out);
    const drips = Math.round(4 + rnd() * 4);
    for (let k2 = 0; k2 < drips; k2++) {
      const x = Math.floor(N * (0.22 + rnd() * 0.56));
      let y = N - 1;
      while (y > 0 && !A(x, y)) y--;
      if (y <= 0) continue;
      const src = (y * N + x) * 4, len = Math.round(px * (5 + rnd() * 14)), wd = Math.max(1, Math.round(px * (1.2 + rnd() * 1.4)));
      for (let t = 1; t < len && y + t < N; t++) {
        const ww = t > len - wd * 2 ? wd + 1 : wd;   // (a bead at its end)
        for (let dx = -ww; dx <= ww; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= N) continue;
          const j = ((y + t) * N + xx) * 4;
          d[j] = d[src]; d[j + 1] = d[src + 1]; d[j + 2] = d[src + 2]; d[j + 3] = 255;
        }
      }
    }
  } else if (hand === 'gilt') {
    // engraved and gilt: lit along the upper-left edges, shadowed along the lower-right, and a fine line cut a little inside the outline
    const out = new Uint8ClampedArray(d), o = Math.max(1, Math.round(px * 1.2)), cut = Math.max(2, Math.round(px * 2.6));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      if (!d[i + 3]) continue;
      let f = 1;
      if (!A(x - o, y - o)) f = 1.18;
      else if (!A(x + o, y + o)) f = 0.68;
      else if ((!A(x - cut, y) || !A(x + cut, y) || !A(x, y - cut) || !A(x, y + cut)) && (A(x - cut + 1, y) && A(x + cut - 1, y) && A(x, y - cut + 1) && A(x, y + cut - 1))) f = 0.8;
      out[i] = d[i] * f; out[i + 1] = d[i + 1] * f; out[i + 2] = d[i + 2] * f;
    }
    d.set(out);
  } else if (hand === 'faded') {
    // faded and flaking: the paint thinned in blotches, flaked off in a few patches
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      if (!d[i + 3]) continue;
      const u = x / px, v = y / px, n = noise(u, v, 0.16), fl = noise(u + 40, v - 17, 0.42);
      d[i + 3] = fl > 0.72 ? 0 : Math.round(d[i + 3] * (0.72 + 0.28 * n));
    }
  }
  w.putImageData(img, 0, 0);
  ctx.save();
  ctx.scale(R / 50, R / 50);
  ctx.drawImage(work, -62.5, -62.5, 125, 125);
  ctx.restore();
}
