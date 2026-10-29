// Little pictures of what Renown unlocks, for the menus and the end screen: a banner (the same cloth the castle flies), a cloak on a hero seen from
// behind, or a capstone talent on a medallion in its class's colour.
import { TEAM_COLORS } from './config.js';
import { bannerTexture, customBanner } from './textures.js';
import { paintCloakFigure } from './emblems.js';
import { CLOAKS } from './unlocks.js';
import { CLASSES } from './classes.js';

// a canvas element of the item `it` (an entry of ITEMS) at `w` x `h` pixels; `team` colours the banner's field (the house you play)
export function previewCanvas(it, w = 64, h = 96, team = 0) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (it.kind === 'banner') {
    const col = TEAM_COLORS[team] ?? TEAM_COLORS[0];
    const tex = it.id ? customBanner(col, team, it.id) : bannerTexture(col, team);   // (the house's own cloth is drawn afresh: it is not kept)
    ctx.drawImage(tex.image, 0, 0, w, h);
  } else if (it.kind === 'cloak') {
    const cl = CLOAKS.find((x) => x.id === it.id);   // (no such cloak: the hero without one)
    paintCloakFigure(ctx, w, h, cl ? cl.ink[0] : null, cl ? cl.ink[1] : null, { fur: it.id === 'wolfpelt', none: !cl });
  } else {
    const col = (CLASSES[it.cls] || {}).color || '#c9a64a';
    const r = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#fff3c8'); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.1); ctx.strokeStyle = '#8a6a1c'; ctx.stroke();
    ctx.font = `${Math.round(r * 1.05)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2a1f14'; ctx.fillText(it.def.icon || '*', cx, cy + r * 0.06);
  }
  return c;
}
