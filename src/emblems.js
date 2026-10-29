// The emblems of the banners Renown unlocks, painted on a canvas with a few paths (no image files). One painter per emblem draws it centred on (0, 0)
// inside a circle of radius R, in `fill` (cream on the banners) with the details cut out in `ink` (the colour of the field behind it). They are used
// wherever the emblem shows: the cloth of the castle, the plaque on the first-person shield, the cards of the Renown menu and the end screen.
// Also here: the little back view of a hero in a cloak that the Wardrobe shows (the cloaks themselves are 3D shapes, see shapes.js).

const TAU = Math.PI * 2;

function path(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}
// the points of a left/right symmetric outline: given the right half from the top down, mirror it to close the shape
function sym(half) {
  const left = half.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  return [...half, ...left];
}
function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }
function stroke(ctx, pts, w) {
  ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(ctx, pts, false); ctx.stroke();
}

const PAINT = {
  // the head of a wolf, ears up, a pale muzzle and dark eyes
  wolf(ctx, ink) {
    ctx.beginPath();
    path(ctx, sym([[0, -30], [11, -31], [27, -54], [37, -20], [44, -4], [38, 9], [47, 21], [31, 25], [22, 40], [9, 47], [0, 50]]));
    ctx.fill();
    ctx.fillStyle = ink;
    path(ctx, [[14, -31], [27, -47], [32, -24], [20, -20]]); ctx.fill();            // the ears' insides
    path(ctx, [[-14, -31], [-27, -47], [-32, -24], [-20, -20]]); ctx.fill();
    path(ctx, [[7, -9], [24, -16], [27, -9], [12, -1]]); ctx.fill();                 // slanting eyes
    path(ctx, [[-7, -9], [-24, -16], [-27, -9], [-12, -1]]); ctx.fill();
    path(ctx, [[-8, 33], [8, 33], [0, 46]]); ctx.fill();                              // the nose
    path(ctx, [[-1.4, -12], [1.4, -12], [2, 18], [-2, 18]]); ctx.fill();               // the bridge of the nose, a thin dark line between the eyes
    ctx.strokeStyle = ink; stroke(ctx, [[-26, 14], [-14, 12], [-7, 22], [-7, 30]], 2.6); stroke(ctx, [[26, 14], [14, 12], [7, 22], [7, 30]], 2.6);   // the muzzle
  },
  // a raven with its wings spread, head turned
  raven(ctx, ink) {
    path(ctx, [[8, -14], [22, -38], [44, -52], [43, -37], [53, -33], [46, -21], [54, -13], [44, -4], [47, 6], [34, 6], [20, 12], [9, 20]]); ctx.fill();
    path(ctx, [[-8, -14], [-22, -38], [-44, -52], [-43, -37], [-53, -33], [-46, -21], [-54, -13], [-44, -4], [-47, 6], [-34, 6], [-20, 12], [-9, 20]]); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.bezierCurveTo(16, -14, 14, 24, 0, 40); ctx.bezierCurveTo(-14, 24, -16, -14, 0, -20); ctx.fill();   // the body
    path(ctx, [[-9, 33], [-17, 54], [-6, 47], [0, 55], [6, 47], [17, 54], [9, 33]]); ctx.fill();                                                 // the tail
    disc(ctx, -2, -29, 10);                                                                                                                         // the head
    path(ctx, [[-9, -32], [-30, -24], [-9, -22]]); ctx.fill();                                                                                       // the beak
    ctx.fillStyle = ink; disc(ctx, 0, -31, 2.6);
    ctx.strokeStyle = ink; stroke(ctx, [[20, -20], [38, -34]], 2.4); stroke(ctx, [[-20, -20], [-38, -34]], 2.4); stroke(ctx, [[22, -4], [42, -14]], 2.4); stroke(ctx, [[-22, -4], [-42, -14]], 2.4);   // feathers
  },
  // the head of a stag under a crown of antlers
  stag(ctx, ink) {
    path(ctx, sym([[0, -12], [11, -8], [12, 10], [9, 30], [4, 46], [0, 50]])); ctx.fill();                         // the face
    path(ctx, [[10, -4], [34, -16], [40, -9], [28, 1], [11, 6]]); ctx.fill();                                      // the ears
    path(ctx, [[-10, -4], [-34, -16], [-40, -9], [-28, 1], [-11, 6]]); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.strokeStyle = ctx.fillStyle;
    for (const s of [-1, 1]) {   // the antlers: a main beam and its tines
      stroke(ctx, [[s * 7, -10], [s * 13, -26], [s * 22, -41], [s * 25, -54]], 6);
      stroke(ctx, [[s * 13, -26], [s * 30, -30]], 4.5);
      stroke(ctx, [[s * 18, -35], [s * 34, -45]], 4.5);
      stroke(ctx, [[s * 11, -18], [s * 4, -34]], 4);
    }
    ctx.fillStyle = ink; disc(ctx, -6, 5, 2.8); disc(ctx, 6, 5, 2.8);
    path(ctx, [[-4, 40], [4, 40], [0, 47]]); ctx.fill();
  },
  // a boar's head, bristling, with curved tusks
  boar(ctx, ink) {
    path(ctx, [[-36, -18], [-30, -26], [-24, -17], [-17, -28], [-10, -18], [-3, -29], [3, -29], [10, -18], [17, -28], [24, -17], [30, -26], [36, -18], [41, 0], [32, 22], [14, 30], [-14, 30], [-32, 22], [-41, 0]]); ctx.fill();
    path(ctx, [[-34, -20], [-46, -42], [-20, -28]]); ctx.fill();                                                  // the ears
    path(ctx, [[34, -20], [46, -42], [20, -28]]); ctx.fill();
    ellipse(ctx, 0, 20, 19, 15);                                                                                  // the snout
    for (const s of [-1, 1]) {   // the tusks: tapering curves that rise from the corners of the mouth
      ctx.beginPath(); ctx.moveTo(s * 16, 31); ctx.quadraticCurveTo(s * 37, 37, s * 34, 5); ctx.quadraticCurveTo(s * 28, 22, s * 22, 32); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = ink; ellipse(ctx, -6, 21, 3.4, 5); ellipse(ctx, 6, 21, 3.4, 5);                                // the nostrils
    path(ctx, [[-25, -6], [-12, -9], [-11, -3], [-24, 0]]); ctx.fill();                                           // the eyes
    path(ctx, [[25, -6], [12, -9], [11, -3], [24, 0]]); ctx.fill();
    ctx.strokeStyle = ink; stroke(ctx, [[-30, 12], [-22, 6]], 2.6); stroke(ctx, [[30, 12], [22, 6]], 2.6);
  },
  // a dragon's head, horned and finned, its teeth bared
  dragon(ctx, ink) {
    ctx.scale(0.86, 0.86);
    path(ctx, sym([[0, -32], [13, -26], [22, -8], [18, 14], [14, 30], [8, 44], [0, 47]])); ctx.fill();            // the skull
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 11, -26); ctx.quadraticCurveTo(s * 40, -34, s * 44, -60); ctx.quadraticCurveTo(s * 31, -35, s * 21, -12); ctx.fill();   // the horns
      path(ctx, [[s * 21, -4], [s * 47, -8], [s * 38, 3], [s * 50, 11], [s * 33, 14], [s * 24, 9]]); ctx.fill();                                              // the frills
    }
    ctx.fillStyle = ink;
    path(ctx, [[5, -11], [17, -17], [19, -11], [8, -5]]); ctx.fill();                                              // slit eyes
    path(ctx, [[-5, -11], [-17, -17], [-19, -11], [-8, -5]]); ctx.fill();
    disc(ctx, -5, 34, 2.4); disc(ctx, 5, 34, 2.4);                                                                 // nostrils
    path(ctx, [[-13, 44], [-9, 36], [-5, 44]]); ctx.fill();                                                        // the teeth
    path(ctx, [[13, 44], [9, 36], [5, 44]]); ctx.fill();
    ctx.strokeStyle = ink; stroke(ctx, [[0, -26], [0, -8]], 3); stroke(ctx, [[-10, 6], [-14, 22]], 2.4); stroke(ctx, [[10, 6], [14, 22]], 2.4);
  },
  // the paw of a bear: pad, four toes and claws
  bear(ctx, ink) {
    ctx.beginPath(); ctx.moveTo(-30, 30); ctx.bezierCurveTo(-44, 8, -22, -6, 0, -6); ctx.bezierCurveTo(22, -6, 44, 8, 30, 30); ctx.bezierCurveTo(18, 44, -18, 44, -30, 30); ctx.fill();   // the pad
    const toes = [[-33, -10, -0.5], [-12, -25, -0.15], [12, -25, 0.15], [33, -10, 0.5]];
    for (const [x, y, r] of toes) {
      ellipse(ctx, x, y, 9, 13, r);
      ctx.save(); ctx.translate(x + Math.sin(r) * 17, y - Math.cos(r) * 17); ctx.rotate(r);
      path(ctx, [[-5, 2], [0, -17], [5, 2]]); ctx.fill();                                                           // a claw
      ctx.restore();
    }
    ctx.strokeStyle = ink; stroke(ctx, [[-15, 14], [-9, 22]], 2.4); stroke(ctx, [[15, 14], [9, 22]], 2.4);          // the creases of the pad
  },
  // a crown of five points
  crown(ctx, ink) {
    path(ctx, [[-36, 28], [-38, -18], [-19, 4], [0, -32], [19, 4], [38, -18], [36, 28]]); ctx.fill();
    for (const [x, y] of [[-38, -22], [0, -37], [38, -22]]) disc(ctx, x, y, 5.5);
    ctx.fillStyle = ink;
    path(ctx, [[-36, 14], [36, 14], [36, 18], [-36, 18]]); ctx.fill();                                              // the band
    for (const x of [-22, 0, 22]) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 6, 10); ctx.lineTo(x, 16); ctx.lineTo(x - 6, 10); ctx.closePath(); ctx.fill(); }   // jewels
  },
  // a five-petalled rose
  rose(ctx, ink) {
    for (let i = 0; i < 5; i++) {   // the pointed sepals between the petals
      const a = (i / 5) * TAU + TAU / 10 - Math.PI / 2;
      path(ctx, [[Math.cos(a - 0.2) * 24, Math.sin(a - 0.2) * 24], [Math.cos(a) * 49, Math.sin(a) * 49], [Math.cos(a + 0.2) * 24, Math.sin(a + 0.2) * 24]]); ctx.fill();
    }
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; disc(ctx, Math.cos(a) * 24, Math.sin(a) * 24, 19); }
    ctx.strokeStyle = ink; ctx.lineWidth = 2.6;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2 + TAU / 10; ctx.beginPath(); ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 10.5, 0, TAU); ctx.stroke(); }   // the inner petals
    ctx.fillStyle = '#e0b44c'; disc(ctx, 0, 0, 7.5);
  },
};

export const EMBLEM_IDS = Object.keys(PAINT);

// Paint emblem `id` centred on (0, 0) in a circle of radius `R` (the painters are drawn for R = 50). Returns false when there is no such emblem.
export function paintEmblem(ctx, id, R, fill = '#efe2b3', ink = '#2a1f14') {
  const f = PAINT[id];
  if (!f) return false;
  ctx.save();
  ctx.scale(R / 50, R / 50);
  ctx.fillStyle = fill; ctx.strokeStyle = fill;
  f(ctx, ink);
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------- cloaks, as the Wardrobe shows them
// A hero seen from behind in the cloak `main` / `trim` colours (CSS colours), on a canvas of w x h.
export function paintCloakFigure(ctx, w, h, main, trim, opts = {}) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.scale(w / 100, h / 140);
  const body = opts.body || '#6a6e76', iron = '#3a3d44';
  // the legs and boots
  ctx.fillStyle = iron; ctx.fillRect(34, 104, 13, 30); ctx.fillRect(53, 104, 13, 30);
  ctx.fillStyle = '#2a2018'; ctx.fillRect(32, 126, 17, 8); ctx.fillRect(51, 126, 17, 8);
  if (!opts.none) {   // the cloak, hanging from the shoulders and flaring out toward the hem
    ctx.fillStyle = main;
    ctx.beginPath(); ctx.moveTo(28, 40); ctx.quadraticCurveTo(50, 34, 72, 40); ctx.lineTo(82, 120); ctx.quadraticCurveTo(50, 130, 18, 120); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(0, 40, 0, 125); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.4;
    for (const x of [38, 50, 62]) { ctx.beginPath(); ctx.moveTo(x, 44); ctx.quadraticCurveTo(x + (x - 50) * 0.5, 84, x + (x - 50) * 1.1, 122); ctx.stroke(); }   // folds
    // the trim along the hem and the collar, and the clasp
    ctx.strokeStyle = trim; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(18, 120); ctx.quadraticCurveTo(50, 130, 82, 120); ctx.stroke();
    if (opts.fur) {
      ctx.fillStyle = trim;
      ctx.beginPath(); ctx.moveTo(24, 42); ctx.quadraticCurveTo(50, 28, 76, 42); ctx.lineTo(73, 56); ctx.quadraticCurveTo(50, 46, 27, 56); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (let x = 30; x <= 70; x += 5) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x - 1, 54); ctx.stroke(); }
    } else {
      ctx.strokeStyle = trim; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(28, 40); ctx.quadraticCurveTo(50, 34, 72, 40); ctx.stroke();
    }
    ctx.fillStyle = trim; disc(ctx, 50, 44, 3);
  } else {   // no cloak: the plain back of the armour
    ctx.fillStyle = '#4e525a';
    ctx.beginPath(); ctx.moveTo(30, 40); ctx.quadraticCurveTo(50, 34, 70, 40); ctx.lineTo(66, 108); ctx.lineTo(34, 108); ctx.closePath(); ctx.fill();
  }
  // the shoulders and the head (a steel helm)
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(27, 44, 9, 7, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(73, 44, 9, 7, 0.2, 0, TAU); ctx.fill();
  const hg = ctx.createLinearGradient(40, 8, 60, 38); hg.addColorStop(0, '#c9ced6'); hg.addColorStop(1, '#6f747c');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(50, 24, 12, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(49, 10, 2, 28);
  // the arms
  ctx.fillStyle = body; ctx.fillRect(16, 46, 8, 36); ctx.fillRect(76, 46, 8, 36);
  ctx.restore();
}
