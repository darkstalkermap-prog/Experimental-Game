// The cloth of a banner in each cut (unlocks.js BANNER_STYLES), painted on the 128 x 256 canvas of textures.js bannerTexture: the field and the
// sigil of the arms (heraldry.js), the furniture the cut is known by (the elves' gilt leaves, the dwarves' riveted frame and runes, the orcs'
// thongs and daubed paint, the undead's rot), and the outline, cut out of the canvas (the banner materials test alpha at 0.5, so a hole or a
// tatter shows through on the castle, the standards and the levy flags alike). Visual only: its dice are its own (never Math.random).
import { mulberry32 } from './noise.js';
import { HOUSE_SIGILS } from './emblems.js';
import { paintField, paintSigil } from './heraldry.js';

const W = 128, H = 256, TAU = Math.PI * 2;
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
// keep only what lies inside the outline `pts`
function cutTo(ctx, pts) {
  ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = '#000'; poly(ctx, pts); ctx.fill(); ctx.restore();
}
// cut a ragged hole (rough circle) at x, y
function hole(ctx, rng, x, y, r) {
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
  poly(ctx, Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * TAU, k = r * (0.55 + rng() * 0.7); return [x + Math.cos(a) * k, y + Math.sin(a) * k * 1.3]; }));
  ctx.fill(); ctx.restore();
}
// an edge from (x0, y0) to (x1, y1) in n jagged steps (each point off the line by up to `amp`, across it)
function ragged(rng, x0, y0, x1, y1, n, amp) {
  const pts = [], nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= n; i++) { const t = i / n, o = i === 0 || i === n ? 0 : (rng() - 0.5) * 2 * amp; pts.push([x0 + (x1 - x0) * t + (nx / l) * o, y0 + (y1 - y0) * t + (ny / l) * o]); }
  return pts;
}
// a small leaf at x, y turned by a, s long
function leafAt(ctx, x, y, a, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.6, 0, 0, s); ctx.quadraticCurveTo(-s * 0.6, 0, 0, -s); ctx.fill();
  ctx.restore();
}
function rivet(ctx, x, y, r = 2.6) {
  ctx.fillStyle = '#d8b070'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(40,20,8,0.6)'; ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.3, r * 0.55, 0, TAU); ctx.fill();
}
// daubed paint running down from y in a few drips, in `col`
function drips(ctx, rng, x0, x1, y, col, n) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * (x1 - x0), l = 8 + rng() * 26, w = 1.5 + rng() * 2.2;
    ctx.fillRect(x - w / 2, y, w, l);
    ctx.beginPath(); ctx.arc(x, y + l, w * 0.9, 0, TAU); ctx.fill();
  }
}
// grey the cloth and stain it (the undead's): a wash over everything painted so far, and blotches
function rot(ctx, rng, n) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(120,124,112,0.32)'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {   // (stains seeping up from the foot: more and darker lower down)
    const y = H * (0.25 + 0.75 * Math.sqrt(rng()));
    ctx.fillStyle = `rgba(${rng() < 0.5 ? '40,40,30' : '74,82,60'},${0.06 + 0.14 * (y / H)})`;
    ctx.beginPath(); ctx.ellipse(rng() * W, y, 10 + rng() * 26, 6 + rng() * 14, rng() * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Paint the banner of arms `a` (its `bs` the cut; `sig` '' for house `team`'s emblem) on a house of colour `house` (hex)
export function paintBanner(ctx, a, house, team) {
  const bs = a.bs || 'house', rng = mulberry32(((team + 1) * 7919) ^ bs.length * 104729 ^ (a.sig || '').length * 31);
  const sigilY = { house: 108, pennant: 96, leaftail: 98, frame: 104, stepped: 100, hide: 110, warrag: 92, shroud: 100, pall: 92 }[bs] || 108;
  paintField(ctx, 0, 0, W, H, a, house, sigilY / H);
  const sigil = (r = 46) => {
    ctx.save(); ctx.translate(64, sigilY);
    paintSigil(ctx, a.sig ? a : { ...a, sig: HOUSE_SIGILS[team % HOUSE_SIGILS.length] }, house, r);
    ctx.restore();
  };
  switch (bs) {
    case 'pennant': {   // long silk, the sides drawn in toward a deep swallowtail; a gilt border hung with leaves
      const out = [[0, 0], [W, 0], [W, 140], [110, 256], [64, 186], [18, 256], [0, 140]];
      ctx.save(); poly(ctx, out); ctx.clip();
      ctx.strokeStyle = '#d2a446'; ctx.lineWidth = 9; poly(ctx, out); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,10,0.5)'; ctx.lineWidth = 1.2; poly(ctx, out.map(([x, y]) => [x + (64 - x) * 0.09, y * 0.97 + 4])); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#d2a446';
      for (let y = 26; y < 150; y += 22) { leafAt(ctx, 9, y, 0.5, 6); leafAt(ctx, W - 9, y + 11, -0.5, 6); }
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, 12);
      sigil(44);
      cutTo(ctx, out);
      break;
    }
    case 'leaftail': {   // the silk drawn down to a single long point, a gilt vein down its middle like a leaf's
      const out = [[0, 0], [W, 0], [W, 150]];
      for (let i = 1; i <= 8; i++) { const t = i / 8; out.push([W - 64 * t ** 0.8, 150 + 104 * t]); }
      for (let i = 7; i >= 1; i--) { const t = i / 8; out.push([64 * t ** 0.8, 150 + 104 * t]); }
      out.push([0, 150]);
      ctx.save(); poly(ctx, out); ctx.clip();
      ctx.strokeStyle = '#d2a446'; ctx.lineWidth = 8; poly(ctx, out); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#d2a446'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(64, 152); ctx.lineTo(64, 246); ctx.stroke();
      ctx.lineWidth = 2;
      for (let y = 168; y < 236; y += 16) { ctx.beginPath(); ctx.moveTo(64, y); ctx.quadraticCurveTo(80, y - 4, 92 - (y - 160) * 0.35, y - 12); ctx.moveTo(64, y); ctx.quadraticCurveTo(48, y - 4, 36 + (y - 160) * 0.35, y - 12); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, 12);
      sigil(44);
      cutTo(ctx, out);
      break;
    }
    case 'frame': {   // a square standard held rigid in an iron frame: bars riveted round it, bronze corners, a band of runes, square tabs at its foot
      const out = [[0, 0], [W, 0], [W, 222], [116, 222], [116, 246], [88, 246], [88, 222], [78, 222], [78, 246], [50, 246], [50, 222], [40, 222], [40, 246], [12, 246], [12, 222], [0, 222]];
      sigil(46);
      ctx.fillStyle = '#7a2a1c'; ctx.fillRect(14, 168, 100, 26);   // the rune band
      ctx.strokeStyle = '#d2a050'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {   // invented runes: a stave and one or two strokes each, made up here
        const x = 22 + i * 16.5, k = (i * 5 + 3) % 4;
        ctx.beginPath(); ctx.moveTo(x, 172); ctx.lineTo(x, 190);
        if (k === 0) { ctx.moveTo(x, 176); ctx.lineTo(x + 7, 182); }
        if (k === 1) { ctx.moveTo(x, 172); ctx.lineTo(x + 7, 178); ctx.lineTo(x, 184); }
        if (k === 2) { ctx.moveTo(x - 5, 180); ctx.lineTo(x + 5, 184); }
        if (k === 3) { ctx.moveTo(x, 186); ctx.lineTo(x + 7, 180); ctx.moveTo(x, 178); ctx.lineTo(x - 5, 174); }
        ctx.stroke();
      }
      ctx.fillStyle = '#3c3a38';   // the frame's bars
      ctx.fillRect(0, 0, W, 16); ctx.fillRect(0, 0, 9, 222); ctx.fillRect(W - 9, 0, 9, 222); ctx.fillRect(0, 202, W, 12);
      ctx.fillStyle = '#5c5a56'; ctx.fillRect(0, 2, W, 3); ctx.fillRect(2, 0, 2, 222); ctx.fillRect(W - 7, 0, 2, 222);
      ctx.fillStyle = '#b27c3c';   // bronze at the corners
      for (const [x, y] of [[0, 0], [W - 22, 0], [0, 192], [W - 22, 192]]) ctx.fillRect(x, y, 22, 22);
      for (let y = 30; y < 200; y += 24) { rivet(ctx, 4.5, y); rivet(ctx, W - 4.5, y); }
      for (let x = 30; x < W - 20; x += 22) { rivet(ctx, x, 8); rivet(ctx, x, 208); }
      cutTo(ctx, out);
      break;
    }
    case 'stepped': {   // cut in steps at its foot, banded in bronze along the top and every step
      const out = [[0, 0], [W, 0], [W, 196], [112, 196], [112, 216], [92, 216], [92, 236], [36, 236], [36, 216], [16, 216], [16, 196], [0, 196]];
      sigil(46);
      ctx.strokeStyle = '#b27c3c'; ctx.lineWidth = 8; poly(ctx, out); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#8a5a2a';
      poly(ctx, out.map(([x, y]) => [x + (64 - x) * 0.12, y * 0.95 + 6])); ctx.stroke();
      ctx.fillStyle = '#b27c3c'; ctx.fillRect(0, 0, W, 14);
      for (let x = 10; x < W; x += 18) rivet(ctx, x, 7, 2.2);
      cutTo(ctx, out);
      break;
    }
    case 'hide': {   // a hide stretched on its frame: a ragged outline with the legs' lobes at its corners, laced at the top, a few holes, paint daubed on
      const out = [[6, 0], [W - 6, 0], [W, 10], ...ragged(rng, W - 4, 30, W - 14, 170, 8, 5), [W - 2, 206], [W - 14, 232], ...ragged(rng, 100, 214, 72, 248, 3, 5), [64, 236], ...ragged(rng, 56, 248, 28, 214, 3, 5), [14, 232], [2, 206], ...ragged(rng, 14, 170, 4, 30, 8, 5), [0, 10]];
      ctx.save(); ctx.globalAlpha = 0.28;   // the leather's grain and wrinkles under the paint
      for (let i = 0; i < 60; i++) { ctx.fillStyle = rng() < 0.5 ? '#2a1a0e' : '#c8a878'; ctx.beginPath(); ctx.ellipse(rng() * W, rng() * H, 2 + rng() * 10, 1 + rng() * 3, rng() * 3, 0, TAU); ctx.fill(); }
      ctx.restore();
      sigil(46);
      ctx.fillStyle = '#1a120c'; ctx.fillRect(0, 0, W, 16);   // the top bound round the crossbar
      drips(ctx, rng, 8, W - 8, 14, '#1a120c', 7);
      ctx.strokeStyle = '#4a2e18'; ctx.lineWidth = 2.4;   // the thongs lacing it
      for (let x = 12; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, 22); ctx.stroke(); }
      ctx.fillStyle = '#6a1e16';   // a band of red daubed across its foot, running
      ctx.beginPath(); ctx.moveTo(6, 188); for (let x = 6; x <= W - 6; x += 8) ctx.lineTo(x, 186 + rng() * 6); for (let x = W - 6; x >= 6; x -= 8) ctx.lineTo(x, 198 + rng() * 6); ctx.fill();
      drips(ctx, rng, 10, W - 10, 200, '#6a1e16', 6);
      cutTo(ctx, out);
      for (let i = 0; i < 3; i++) hole(ctx, rng, 20 + rng() * 88, 40 + rng() * 140, 3 + rng() * 3);
      break;
    }
    case 'warrag': {   // cloth hacked into hanging strips below a daubed band
      const out = [[0, 0], [W, 0]];
      const n = 6, sw = W / n;
      for (let i = n - 1; i >= 0; i--) {
        const x0 = i * sw, x1 = x0 + sw, l = 196 + rng() * 54;
        out.push([x1, 150], [x1 - 1, l - 10], [x0 + sw * 0.7, l], [x0 + sw * 0.45, l - 12], [x0 + sw * 0.2, l - 2], [x0 + 1, l - 14], [x0 + 1, 150]);
      }
      sigil(44);
      ctx.fillStyle = '#1a120c'; ctx.fillRect(0, 0, W, 18);
      drips(ctx, rng, 6, W - 6, 16, '#1a120c', 8);
      ctx.fillStyle = '#6a1e16';
      for (let i = 0; i < n; i++) if (i % 2) ctx.fillRect(i * (W / n) + 2, 160, W / n - 4, 10 + rng() * 20);
      cutTo(ctx, out);
      break;
    }
    case 'shroud': {   // a grave cloth: greyed and stained, holed, its foot rotted away in tatters
      const out = [[0, 0], [W, 0], ...ragged(rng, W, 20, W - 4, 200, 9, 3)];
      for (let i = 0; i <= 10; i++) { const x = W - (W * i) / 10; out.push([x, 198 + (i % 2 ? 50 + rng() * 8 : 14 + rng() * 22)]); }
      out.push(...ragged(rng, 4, 200, 0, 20, 9, 3));
      sigil(44);
      rot(ctx, rng, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, 12);
      cutTo(ctx, out);
      for (let i = 0; i < 6; i++) hole(ctx, rng, 12 + rng() * 104, 24 + rng() * 170, 2.5 + rng() * 5);
      break;
    }
    case 'pall': {   // a funeral pall in five long tongues, a bone-white stitched hem, mould
      const out = [[0, 0], [W, 0], [W, 168]];
      const n = 5, sw = W / n;
      for (let i = n - 1; i >= 0; i--) { const x0 = i * sw, l = 226 + rng() * 26; out.push([x0 + sw - 1, 168], [x0 + sw * 0.62, l - 6], [x0 + sw * 0.5, l], [x0 + sw * 0.36, l - 8], [x0 + 1, 168]); }
      sigil(44);
      ctx.strokeStyle = '#d8ccae'; ctx.lineWidth = 2.2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(8, 18, W - 16, 142);
      ctx.setLineDash([]);
      rot(ctx, rng, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, 12);
      cutTo(ctx, out);
      for (let i = 0; i < 4; i++) hole(ctx, rng, 14 + rng() * 100, 30 + rng() * 120, 2 + rng() * 4);
      break;
    }
    default: {   // the men's: a cream border and a swallowtail notch at the foot
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, 128, 14);
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.moveTo(30, 256); ctx.lineTo(64, 212); ctx.lineTo(98, 256); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#e9d9a6';
      ctx.lineWidth = 5;
      ctx.strokeRect(8, 20, 112, 180);
      sigil(46);
    }
  }
}
