// The painted faces of the first-person shields: one canvas per class, house colour and shape (round or kite), drawn once and kept in a
// module-level cache (a texture that was disposed with an old world is simply uploaded again when it is next used).
// The canvas is an atlas: the face fills the top-left 480 px, and the rest stays white, so the rim, back and straps of the same mesh
// can point at the white margin and take only their vertex colour.
import * as THREE from 'three';
import { TEAM_COLORS } from './config.js';
import { paintEmblem, HOUSE_SIGILS } from './emblems.js';
import { armsColors, armsKey, isCustom, paintField, paintSigil, css } from './heraldry.js';

export const FACE_PX = 480, ATLAS_PX = 512;
const cache = new Map();

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function shade(n, k) {
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- helpers (all in metres from the top-left corner of the shield's bounding box) ----
function field(ctx, w, h, col) {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, shade(col, 1.18)); g.addColorStop(1, shade(col, 0.82));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function ring(ctx, x, y, r, width, col) { ctx.strokeStyle = col; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
function disc(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function star(ctx, x, y, r0, r1, n, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? r1 : r0; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return pts;
}
const GOLD = '#d9b24a', GOLD_D = '#8a6a1c', CREAM = '#efe6cc', INK = 'rgba(20,14,8,0.85)';

// ---- one design per class ----
const DESIGN = {
  knight(ctx, w, h, team, kind) {
    field(ctx, w, h, team);
    const cx = w / 2, cy = kind === 'round' ? h / 2 : h * 0.36, s = kind === 'round' ? w * 0.86 : w * 0.9, t = s * 0.15;
    // a cross with flared ends, edged in gold
    const arm = (len) => [[-t / 2, -len / 2], [t / 2, -len / 2], [t / 2, -t / 2], [len / 2, -t / 2], [len / 2, t / 2], [t / 2, t / 2], [t / 2, len / 2 + (kind === 'kite' ? h * 0.18 : 0)], [-t / 2, len / 2 + (kind === 'kite' ? h * 0.18 : 0)], [-t / 2, t / 2], [-len / 2, t / 2], [-len / 2, -t / 2], [-t / 2, -t / 2]];
    ctx.save(); ctx.translate(cx, cy);
    poly(ctx, arm(s * 0.92), CREAM, GOLD, s * 0.028);
    ctx.restore();
    if (kind === 'round') { ring(ctx, w / 2, h / 2, w * 0.455, w * 0.03, GOLD); ring(ctx, w / 2, h / 2, w * 0.37, w * 0.008, GOLD_D); }
    else { ctx.strokeStyle = GOLD; ctx.lineWidth = w * 0.03; ctx.strokeRect(w * 0.05, h * 0.03, w * 0.9, h * 0.94); }
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) disc(ctx, cx + dx * s * 0.3, cy + dy * s * 0.3, s * 0.022, GOLD);
  },
  berserker(ctx, w, h, team, kind) {
    // bare planks, scarred, with three claw slashes in the house colour
    ctx.fillStyle = '#6d4c2d'; ctx.fillRect(0, 0, w, h);
    const r = rng(7);
    const n = 6;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade(0x6d4c2d, 0.82 + r() * 0.4); ctx.fillRect((i / n) * w, 0, w / n, h);
      ctx.fillStyle = 'rgba(25,14,6,0.7)'; ctx.fillRect((i / n) * w - w * 0.004, 0, w * 0.008, h);
      for (let k = 0; k < 14; k++) { ctx.strokeStyle = `rgba(30,18,8,${0.08 + r() * 0.12})`; ctx.lineWidth = w * 0.004; const x = (i / n) * w + r() * (w / n); ctx.beginPath(); ctx.moveTo(x, r() * h * 0.2); ctx.lineTo(x + (r() - 0.5) * w * 0.02, h * (0.6 + r() * 0.4)); ctx.stroke(); }
    }
    const cx = w / 2, cy = kind === 'round' ? h / 2 : h * 0.4, s = kind === 'round' ? w : w * 1.2;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const ox = i * s * 0.17;
      ctx.strokeStyle = INK; ctx.lineWidth = s * 0.085;
      ctx.beginPath(); ctx.moveTo(cx + ox - s * 0.2, cy - s * 0.34); ctx.quadraticCurveTo(cx + ox + s * 0.02, cy, cx + ox + s * 0.14, cy + s * 0.36); ctx.stroke();
      ctx.strokeStyle = hex(team); ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.moveTo(cx + ox - s * 0.2, cy - s * 0.34); ctx.quadraticCurveTo(cx + ox + s * 0.02, cy, cx + ox + s * 0.14, cy + s * 0.36); ctx.stroke();
    }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; disc(ctx, cx + Math.cos(a) * s * 0.44, cy + Math.sin(a) * s * 0.44 * (kind === 'round' ? 1 : 0.9), s * 0.014, '#9a9a96'); }
  },
  cavalier(ctx, w, h, team, kind) {
    // per pale: house colour and cream, a gold bend with three roundels
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(team); ctx.fillRect(0, 0, w / 2, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = kind === 'round' ? h / 2 : h * 0.4, s = kind === 'round' ? w : w * 1.15;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.7);
    ctx.fillStyle = GOLD; ctx.fillRect(-s * 0.7, -s * 0.07, s * 1.4, s * 0.14);
    ctx.strokeStyle = GOLD_D; ctx.lineWidth = s * 0.012; ctx.strokeRect(-s * 0.7, -s * 0.07, s * 1.4, s * 0.14);
    for (const x of [-0.2, 0, 0.2]) { disc(ctx, x * s, 0, s * 0.045, '#2a1c0c'); disc(ctx, x * s, 0, s * 0.033, hex(team)); }
    ctx.restore();
    if (kind === 'round') ring(ctx, w / 2, h / 2, w * 0.46, w * 0.03, GOLD); else { ctx.strokeStyle = GOLD; ctx.lineWidth = w * 0.03; ctx.strokeRect(w * 0.05, h * 0.03, w * 0.9, h * 0.94); }
  },
  ranger(ctx, w, h, team, kind) {
    ctx.fillStyle = '#2f5a34'; ctx.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '10,30,12' : '90,140,80'},${0.05 + r() * 0.08})`; ctx.beginPath(); ctx.arc(r() * w, r() * h, w * (0.004 + r() * 0.01), 0, 6.3); ctx.fill(); }
    const cx = w / 2, cy = kind === 'round' ? h / 2 : h * 0.38, s = kind === 'round' ? w : w * 1.15;
    // a house-colour chevron, a cream arrow across a bow
    ctx.fillStyle = hex(team);
    poly(ctx, [[cx - s * 0.46, cy - s * 0.1], [cx, cy - s * 0.46], [cx + s * 0.46, cy - s * 0.1], [cx + s * 0.46, cy + s * 0.04], [cx, cy - s * 0.3], [cx - s * 0.46, cy + s * 0.04]], hex(team), INK, s * 0.012);
    ctx.strokeStyle = CREAM; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx - s * 0.2, cy + s * 0.18, s * 0.3, -1.1, 1.1); ctx.stroke();
    ctx.lineWidth = s * 0.018;
    ctx.beginPath(); ctx.moveTo(cx - s * 0.32, cy + s * 0.02); ctx.lineTo(cx + s * 0.36, cy + s * 0.34); ctx.stroke();
    poly(ctx, [[cx + s * 0.4, cy + s * 0.36], [cx + s * 0.29, cy + s * 0.27], [cx + s * 0.31, cy + s * 0.4]], CREAM, null, 0);
    if (kind === 'round') ring(ctx, w / 2, h / 2, w * 0.46, w * 0.025, '#b79a58');
  },
  mage(ctx, w, h, team, kind) {
    field(ctx, w, h, 0x251c54);
    const r = rng(23);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(220,220,255,${0.2 + r() * 0.5})`; ctx.fillRect(r() * w, r() * h, w * 0.006, w * 0.006); }
    const cx = w / 2, cy = kind === 'round' ? h / 2 : h * 0.36, s = kind === 'round' ? w : w * 1.1;
    ring(ctx, cx, cy, s * 0.4, s * 0.02, GOLD); ring(ctx, cx, cy, s * 0.33, s * 0.008, GOLD_D);
    poly(ctx, star(ctx, cx, cy, s * 0.32, s * 0.13, 8), hex(team), GOLD, s * 0.014);
    poly(ctx, star(ctx, cx, cy, s * 0.16, s * 0.07, 8, -Math.PI / 2 + Math.PI / 8), GOLD, null, 0);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; disc(ctx, cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.4, s * 0.016, '#ffe9a0'); }
  },
  cleric(ctx, w, h, team, kind) {
    field(ctx, w, h, 0xe9e0c6);
    const cx = w / 2, cy = kind === 'round' ? h / 2 : h * 0.36, s = kind === 'round' ? w : w * 1.1;
    ctx.save(); ctx.translate(cx, cy);
    for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); poly(ctx, [[-s * 0.025, -s * 0.2], [0, -s * (i % 2 ? 0.34 : 0.42)], [s * 0.025, -s * 0.2]], GOLD, GOLD_D, s * 0.006); }
    ctx.restore();
    disc(ctx, cx, cy, s * 0.2, GOLD); ring(ctx, cx, cy, s * 0.2, s * 0.012, GOLD_D);
    const t = s * 0.07; poly(ctx, [[cx - t / 2, cy - s * 0.15], [cx + t / 2, cy - s * 0.15], [cx + t / 2, cy - t / 2], [cx + s * 0.15, cy - t / 2], [cx + s * 0.15, cy + t / 2], [cx + t / 2, cy + t / 2], [cx + t / 2, cy + s * 0.15], [cx - t / 2, cy + s * 0.15], [cx - t / 2, cy + t / 2], [cx - s * 0.15, cy + t / 2], [cx - s * 0.15, cy - t / 2], [cx - t / 2, cy - t / 2]], hex(team), GOLD_D, s * 0.008);
    ctx.strokeStyle = hex(team); ctx.lineWidth = w * 0.045;
    if (kind === 'round') ring(ctx, w / 2, h / 2, w * 0.455, w * 0.045, hex(team)); else ctx.strokeRect(w * 0.04, h * 0.025, w * 0.92, h * 0.95);
  },
};

// battle wear over the paint: scuffs, scratches, dirt and darker edges
function wear(ctx, w, h, kind, seed) {
  const r = rng(seed);
  for (let i = 0; i < 520; i++) { ctx.fillStyle = `rgba(20,12,6,${0.04 + r() * 0.09})`; ctx.beginPath(); ctx.arc(r() * w, r() * h, w * (0.002 + r() * 0.007), 0, 6.3); ctx.fill(); }
  ctx.lineCap = 'round';
  for (let i = 0; i < 38; i++) {
    const x = r() * w, y = r() * h, a = r() * 3.14, l = w * (0.04 + r() * 0.14);
    ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(10,8,6,0.3)'; ctx.lineWidth = w * (0.0015 + r() * 0.003);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  const g = kind === 'round' ? ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.56) : ctx.createLinearGradient(0, h * 0.5, 0, h);
  if (kind === 'round') { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)'); } else { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// The sigil of the lord's arms (heraldry.js) as a small plaque near the top of the face: a dark roundel in a gold ring
function plaque(ctx, shape, arms, house) {
  const r = shape.w * 0.16, x = shape.w / 2, y = shape.h * (shape.kind === 'round' ? 0.2 : 0.14);
  ctx.save();
  ctx.translate(x, y);
  disc(ctx, 0, 0, r, '#17110a');
  ring(ctx, 0, 0, r * 0.95, r * 0.12, GOLD);
  ring(ctx, 0, 0, r * 0.8, r * 0.025, GOLD_D);
  const ch = armsColors(arms, house).charge, dark = ((ch >> 16) & 255) + ((ch >> 8) & 255) + (ch & 255) < 240;
  paintEmblem(ctx, arms.sig, r * 0.7, dark ? '#efe2b3' : css(ch), '#17110a');   // (a dark sigil would vanish on the dark roundel)
  ctx.restore();
}
// The Knight's kite painted with the whole of the lord's arms: the field divided as they say, the sigil large on the upper part, a gold edge
function knightArms(ctx, shape, arms, house, team) {
  const { w, h } = shape, cy = 0.36;
  paintField(ctx, 0, 0, w, h, arms, house, cy);
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.translate(w / 2, h * cy);
  paintSigil(ctx, arms.sig ? arms : { ...arms, sig: HOUSE_SIGILS[team] || HOUSE_SIGILS[0] }, house, w * 0.36);
  ctx.restore();
  ctx.strokeStyle = GOLD; ctx.lineWidth = w * 0.03; ctx.strokeRect(w * 0.05, h * 0.03, w * 0.9, h * 0.94);
}

// The atlas texture of a class's shield in a house colour. shape: { kind: 'round' | 'kite', w, h } in metres (bounding box of the face).
// `arms`: the arms the account bears (heraldry.js; null or the house's own for none). The Knight's kite is painted with them whole; the other
// classes keep their own design and show the sigil on a plaque.
export function shieldFace(cls, team, shape, arms = null) {
  const own = arms && isCustom(arms) ? arms : null;
  const key = `${cls}:${team}:${TEAM_COLORS[team] ?? 0}:${shape.kind}:${shape.h}${own ? ':' + armsKey(own) : ''}`;   // (the colour too: a match may paint the house another one, teams.js)
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS_PX;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ATLAS_PX, ATLAS_PX);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, FACE_PX, FACE_PX); ctx.clip();
  ctx.scale(FACE_PX / shape.w, FACE_PX / shape.h);
  const house = TEAM_COLORS[team] ?? TEAM_COLORS[0];
  if (own && cls === 'knight' && shape.kind === 'kite') knightArms(ctx, shape, own, house, team);
  else {
    (DESIGN[cls] || DESIGN.knight)(ctx, shape.w, shape.h, house, shape.kind);
    if (own && own.sig) plaque(ctx, shape, own, house);
  }
  wear(ctx, shape.w, shape.h, shape.kind, key.length * 131 + team);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
