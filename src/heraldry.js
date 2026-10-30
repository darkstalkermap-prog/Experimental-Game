// A lord's arms: the sigil (the charge: emblems.js paints it), how the field is divided and the second tint. They travel with the player's look
// (`cos`: banner = the sigil, div, tint; progress.js keeps them) and show on the castle's banners and flags (textures.js), the first-person shield
// (vmtex.js), the soldiers' surcoats and shields, the hero's shield and cloak (the emblem atlas, unittex.js) and the chips of the lobby and the
// scoreboard (armsChip here). Every one of them takes its colours from armsColors, so all of them agree.
import { TINTS, DIVISIONS, DIVISION_IDS, TINT_IDS, SIGIL_IDS, sigilName } from './unlocks.js';
import { paintEmblem, HOUSE_SIGILS } from './emblems.js';
import { TEAM_COLORS } from './config.js';
import { lordCell, setTeamCell, resetArmsCells, setRigEmblem } from './unittex.js';

export const DEFAULT_ARMS = Object.freeze({ sig: '', div: 'plain', tint: 'argent' });

// the arms of a look (anything: a lobby entry, nothing) made safe
export function armsOf(cos) {
  if (!cos || typeof cos !== 'object') return DEFAULT_ARMS;
  return {
    sig: SIGIL_IDS.includes(cos.banner) ? cos.banner : '',
    div: DIVISION_IDS.includes(cos.div) ? cos.div : 'plain',
    tint: TINT_IDS.includes(cos.tint) ? cos.tint : 'argent',
  };
}
// the arms in words: "Lion on Per pale, Blue and Gold" (the house colour is not named)
export function armsTitle(cos) {
  const a = armsOf(cos), t = TINTS.find((x) => x.id === a.tint);
  return `${a.sig ? sigilName(a.sig) : 'House emblem'}${a.div === 'plain' ? (a.tint !== 'argent' ? ` in ${t.name}` : '') : ` on ${DIVISIONS.find((d) => d.id === a.div).name}, with ${t.name}`}`;
}
export const armsKey = (a) => `${a.sig}|${a.div}|${a.tint}`;
// arms that differ from the house's own (which every AI lord flies)
export const isCustom = (a) => !!a && (a.sig !== '' || a.div !== 'plain' || a.tint !== 'argent');

export const tintHex = (id) => (TINTS.find((t) => t.id === id) || TINTS[0]).hex;
const ARGENT = 0xefe2b3, OR = 0xd9a83a, SABLE = 0x1d1813;
const lum = (n) => (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
export const css = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

// The colours of arms `a` on a house of colour `house` (hex): the field, the second tint, and the charge. On a plain field the tint colours
// the sigil (silver by default, as the house banners always were); on a divided one the sigil stands over both parts, in silver (gold when the
// tint is silver). A pale charge on a pale field turns dark, so it can still be read.
export function armsColors(a, house) {
  const tint = tintHex(a.tint);
  let charge = a.div === 'plain' ? tint : a.tint === 'argent' ? OR : ARGENT;
  if (a.div === 'plain' && Math.abs(lum(charge) - lum(house)) < 0.25) charge = lum(house) > 0.5 ? SABLE : ARGENT;
  if (a.div !== 'plain' && lum(charge) > 0.55 && lum(house) > 0.6) charge = SABLE;
  return { field: house, tint, charge };
}

// Divide the field: fill the rectangle (x, y, w, h) with the house colour and lay the tint over the part the division gives it. `cy` is the height
// (0..1) the sigil sits at, where a chevron's point goes.
export function paintField(ctx, x, y, w, h, a, house, cy = 0.45, tintCss = null) {
  const tint = tintCss || css(tintHex(a.tint));
  ctx.fillStyle = css(house);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = tint;
  const P = (pts) => { ctx.beginPath(); pts.forEach(([u, v], i) => (i ? ctx.lineTo(x + u * w, y + v * h) : ctx.moveTo(x + u * w, y + v * h))); ctx.closePath(); ctx.fill(); };
  switch (a.div) {
    case 'pale': P([[0.5, 0], [1, 0], [1, 1], [0.5, 1]]); break;
    case 'fess': P([[0, cy], [1, cy], [1, 1], [0, 1]]); break;
    case 'quarterly': P([[0.5, 0], [1, 0], [1, cy], [0.5, cy]]); P([[0, cy], [0.5, cy], [0.5, 1], [0, 1]]); break;
    case 'bend': P([[0, 0], [1, 1], [0, 1]]); break;
    case 'chevron': { const t = 0.13 * (w / h > 1 ? 1 : w / h); P([[0, cy + 0.42], [0.5, cy - 0.08], [1, cy + 0.42], [1, cy + 0.42 + t * 1.6], [0.5, cy - 0.08 + t * 1.6], [0, cy + 0.42 + t * 1.6]]); break; }
    case 'saltire': P([[0, 0], [0.5, cy], [0, 1]]); P([[1, 0], [0.5, cy], [1, 1]]); break;
    case 'bordure': { const b = Math.min(w, h) * 0.11; ctx.fillRect(x, y, w, h); ctx.fillStyle = css(house); ctx.fillRect(x + b, y + b, w - 2 * b, h - 2 * b); break; }
    default: break;
  }
}

// The sigil of arms `a` centred on (0, 0) of the current transform, radius R, in its charge colour (the cut-out details in the field colour).
// Returns false for '' (the house's own emblem: the caller draws that).
export function paintSigil(ctx, a, house, R) {
  if (!a.sig) return false;
  const c = armsColors(a, house);
  return paintEmblem(ctx, a.sig, R, css(c.charge), css(c.field));
}

// A small picture of the arms on a heater shield: the lobby, the scoreboard and the Wardrobe use it. Arms with no sigil show the emblem of
// house `team`. Kept per (arms, colour, house), as a data URL for HTML.
const chips = new Map();
export function armsCanvas(a, house, team = 0, w = 40, h = 48) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // the heater: straight top, sides down to the middle, then curving in to a point (traced again for its edge: the sigil leaves its own path behind)
  const heater = () => {
    ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.04); ctx.lineTo(w * 0.94, h * 0.04); ctx.lineTo(w * 0.94, h * 0.46);
    ctx.quadraticCurveTo(w * 0.92, h * 0.82, w * 0.5, h * 0.98); ctx.quadraticCurveTo(w * 0.08, h * 0.82, w * 0.06, h * 0.46); ctx.closePath();
  };
  heater();
  ctx.save(); ctx.clip();
  paintField(ctx, 0, 0, w, h, a, house, 0.42);
  ctx.translate(w / 2, h * 0.42);
  paintSigil(ctx, a.sig ? a : { ...a, sig: HOUSE_SIGILS[team] || HOUSE_SIGILS[0] }, house, w * 0.34);
  ctx.restore();
  heater();
  ctx.lineWidth = Math.max(1, w * 0.05); ctx.strokeStyle = '#2a1f14'; ctx.stroke();
  return c;
}
export function armsChip(cos, house, team = 0) {
  const a = armsOf(cos), key = `${armsKey(a)}:${house}:${team}`;
  if (!chips.has(key)) chips.set(key, armsCanvas(a, house, team, 40, 48).toDataURL());
  return chips.get(key);
}

// ---------------------------------------------------------------- the arms in the 3D world (the emblem atlas, unittex.js)
// The atlas cell of arms `a` borne by a lord of house `team` (colour `house`), painted on first use; -1 for the house's own arms (or no cell left).
export function armsCell(a, team, house) {
  if (!isCustom(a)) return -1;
  const c = armsColors(a, house);
  return lordCell(`${armsKey(a)}:${house}:${team}`, team, (ctx, S, mode) => {
    if (mode === 'sigil') {
      if (!a.sig) return false;
      ctx.translate(S / 2, S / 2);
      return paintEmblem(ctx, a.sig, S * 0.4, '#fff', '#000');
    }
    if (a.div === 'plain') return false;
    // (the cell is stretched past its edges on a surcoat or a shield, so a bordure is drawn inside them, as a frame round the sigil)
    if (a.div === 'bordure') { ctx.fillStyle = '#fff'; ctx.fillRect(1, 1, S - 2, S - 2); ctx.fillStyle = '#000'; ctx.fillRect(7, 7, S - 14, S - 14); return true; }
    paintField(ctx, 0, 0, S, S, a, 0, 0.5, '#fff');
    return true;
  }, c.tint, c.charge);
}

// The start of a match (game.js): every human's arms, a cell for each that bears their own, their castle's banners and soldiers. The first lord of
// a castle gives it its arms (in the Hero Game Mode a castle has several); AI houses keep theirs. Each screen does this from the same lobby list,
// so everyone sees the same arms.
export function assignArms(g) {
  resetArmsCells();
  for (const h of g.humans) {
    h.arms = armsOf(h.cos);
    h.armsCell = armsCell(h.arms, h.team, TEAM_COLORS[h.team] ?? TEAM_COLORS[0]);
    if (h.body) setRigEmblem(h.body, h.armsCell >= 0 ? h.armsCell : h.team > 4 || h.team < 0 ? 0 : h.team);   // (a body built before this)
  }
  for (const c of g.castles) {
    const lord = g.humans.find((h) => h.team === c.team);
    c.setBanner(lord ? lord.arms : null);
    setTeamCell(c.team, lord ? lord.armsCell : -1);
  }
}
