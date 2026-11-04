// A lord's arms: the sigil (the charge: emblems.js paints it), how the field is divided and the second tint. They travel with the player's look
// (`cos`: banner = the sigil, div, tint; progress.js keeps them) and show on the castle's banners and flags (textures.js), the first-person shield
// (vmtex.js), the soldiers' surcoats and shields, the hero's shield and cloak (the emblem atlas, unittex.js) and the chips of the lobby and the
// scoreboard (armsChip here). Every one of them takes its colours from armsColors, so all of them agree.
import { TINTS, DIVISIONS, DIVISION_IDS, TINT_IDS, SIGIL_IDS, sigilName, BANNER_STYLE_IDS, bannerStyleOf, raceDefaultSigil } from './unlocks.js';
import { raceOf, isRaceId } from './races.js';
import { paintEmblem, HOUSE_SIGILS } from './emblems.js';
import { TEAM_COLORS } from './config.js';
import { lordCell, setTeamCell, resetArmsCells, setRigEmblem } from './unittex.js';

// (bs: the cut of the banner, unlocks.js BANNER_STYLES; '' the race's own)
export const DEFAULT_ARMS = Object.freeze({ sig: '', div: 'plain', tint: 'argent', bs: '' });

// the arms of a look (anything: a lobby entry, nothing) made safe
export function armsOf(cos) {
  if (!cos || typeof cos !== 'object') return DEFAULT_ARMS;
  return {
    sig: SIGIL_IDS.includes(cos.banner) ? cos.banner : '',
    div: DIVISION_IDS.includes(cos.div) ? cos.div : 'plain',
    tint: TINT_IDS.includes(cos.tint) ? cos.tint : 'argent',
    bs: BANNER_STYLE_IDS.includes(cos.bs) ? cos.bs : '',
  };
}
// The arms as a lord of race `race` at castle `team` flies them: no sigil chosen is the house's emblem for the men and one of the race's own sigils
// for the other races (unlocks.js raceDefaultSigil); the banner's cut is the one chosen if the race may fly it, else the race's own.
export function flownArms(a, race, team = 0) {
  const r = isRaceId(race) ? race : 'human';
  return { sig: a.sig || raceDefaultSigil(r, team), div: a.div, tint: a.tint, bs: bannerStyleOf(a.bs, r) };
}
// the arms in words: "Lion on Per pale, Blue and Gold" (the house colour is not named)
export function armsTitle(cos) {
  const a = armsOf(cos), t = TINTS.find((x) => x.id === a.tint);
  return `${a.sig ? sigilName(a.sig) : 'House emblem'}${a.div === 'plain' ? (a.tint !== 'argent' ? ` in ${t.name}` : '') : ` on ${DIVISIONS.find((d) => d.id === a.div).name}, with ${t.name}`}`;
}
export const armsKey = (a) => `${a.sig}|${a.div}|${a.tint}|${a.bs || ''}`;
// arms that differ from the house's own (which every AI lord of the men flies)
export const isCustom = (a) => !!a && (a.sig !== '' || a.div !== 'plain' || a.tint !== 'argent' || (!!a.bs && a.bs !== 'house'));

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

// A small picture of the arms on a shield: the lobby, the scoreboard and the Wardrobe use it. Arms with no sigil show the emblem of house `team` (or,
// for a race, one of its sigils). The shield is the race's: the men's heater, the elves' long leaf, the dwarves' square with cut corners, the orcs'
// round planks with a bitten rim, the undead's tall cracked heater. Kept per (arms, colour, house, race), as a data URL for HTML.
const chips = new Map();
const SHIELDS = {
  human: [[0.06, 0.04], [0.94, 0.04], [0.94, 0.46], ['q', 0.92, 0.82, 0.5, 0.98], ['q', 0.08, 0.82, 0.06, 0.46]],
  elf: [[0.5, 0.01], ['q', 0.98, 0.2, 0.9, 0.55], ['q', 0.8, 0.86, 0.5, 0.99], ['q', 0.2, 0.86, 0.1, 0.55], ['q', 0.02, 0.2, 0.5, 0.01]],
  dwarf: [[0.16, 0.04], [0.84, 0.04], [0.96, 0.15], [0.96, 0.85], [0.84, 0.96], [0.16, 0.96], [0.04, 0.85], [0.04, 0.15]],
  orc: Array.from({ length: 22 }, (_, i) => { const a = (i / 22) * Math.PI * 2, r = 0.47 - (i % 3 === 1 ? 0.045 : 0) - (i === 7 ? 0.07 : 0); return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * 0.98]; }),
  undead: [[0.08, 0.03], [0.38, 0.03], [0.44, 0.1], [0.5, 0.03], [0.92, 0.03], [0.92, 0.5], ['q', 0.9, 0.84, 0.5, 0.98], [0.44, 0.9], [0.38, 0.95], ['q', 0.1, 0.8, 0.08, 0.5]],
};
const SIGIL_Y = { human: 0.42, elf: 0.45, dwarf: 0.48, orc: 0.5, undead: 0.42 };
export function armsCanvas(a, house, team = 0, w = 40, h = 48, race = 'human') {
  const r = SHIELDS[race] ? race : 'human', cy = SIGIL_Y[r];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // the shield's outline (traced again for its edge: the sigil leaves its own path behind)
  const outline = () => {
    ctx.beginPath();
    SHIELDS[r].forEach((p, i) => {
      if (p[0] === 'q') ctx.quadraticCurveTo(w * p[1], h * p[2], w * p[3], h * p[4]);
      else if (i) ctx.lineTo(w * p[0], h * p[1]); else ctx.moveTo(w * p[0], h * p[1]);
    });
    ctx.closePath();
  };
  outline();
  ctx.save(); ctx.clip();
  paintField(ctx, 0, 0, w, h, a, house, cy);
  ctx.translate(w / 2, h * cy);
  paintSigil(ctx, a.sig ? a : { ...a, sig: r !== 'human' ? raceDefaultSigil(r, team) : HOUSE_SIGILS[team] || HOUSE_SIGILS[0] }, house, w * 0.34);
  ctx.restore();
  outline();
  ctx.lineWidth = Math.max(1, w * 0.05);
  ctx.strokeStyle = r === 'elf' ? '#b8913a' : r === 'dwarf' ? '#8a5a2a' : r === 'undead' ? '#4a5048' : '#2a1f14';
  ctx.stroke();
  if (r === 'dwarf') {   // (the dwarves' rivets at the corners)
    ctx.fillStyle = '#c08a48';
    for (const [u, v] of [[0.14, 0.12], [0.86, 0.12], [0.14, 0.88], [0.86, 0.88]]) { ctx.beginPath(); ctx.arc(w * u, h * v, Math.max(1, w * 0.035), 0, Math.PI * 2); ctx.fill(); }
  }
  return c;
}
// (`race`: the race of the castle the arms are borne for; anything else is the men's)
export function armsChip(cos, house, team = 0, race = 'human') {
  const r = isRaceId(race) ? race : 'human', a = flownArms(armsOf(cos), r, team), key = `${armsKey(a)}:${house}:${team}:${r}`;
  if (!chips.has(key)) chips.set(key, armsCanvas(a, house, team, 40, 48, r).toDataURL());
  return chips.get(key);
}

// ---------------------------------------------------------------- the arms in the 3D world (the emblem atlas, unittex.js)
// The atlas cell of arms `a` borne by a lord of house `team` (colour `house`), painted on first use; -1 for the house's own arms (or no cell left).
export function armsCell(a, team, house) {
  if (!isCustom({ ...a, bs: '' })) return -1;   // (the cut of the banner is not on a shield or a surcoat)
  const c = armsColors(a, house);
  return lordCell(`${a.sig}|${a.div}|${a.tint}:${house}:${team}`, team, (ctx, S, mode) => {
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
// a castle gives it its arms (in the Hero Game Mode a castle has several). An AI house of the men keeps its own; one of another race flies the sigil
// its lord drew (g.aiSigils, sent by the host: races.js aiSigils) in its race's cut. Each screen does this from the same lobby list, so everyone
// sees the same arms.
export function assignArms(g) {
  resetArmsCells();
  for (const h of g.humans) {
    h.arms = flownArms(armsOf(h.cos), raceOf(h.team), h.team);
    h.armsCell = armsCell(h.arms, h.team, TEAM_COLORS[h.team] ?? TEAM_COLORS[0]);
    if (h.body) setRigEmblem(h.body, h.armsCell >= 0 ? h.armsCell : h.team > 4 || h.team < 0 ? 0 : h.team);   // (a body built before this)
  }
  for (const c of g.castles) {
    const lord = g.humans.find((h) => h.team === c.team), race = raceOf(c.team);
    const arms = lord ? lord.arms : race === 'human' ? null : flownArms({ ...DEFAULT_ARMS, sig: (g.aiSigils || [])[c.team] || '' }, race, c.team);
    const cell = lord ? lord.armsCell : arms ? armsCell(arms, c.team, TEAM_COLORS[c.team] ?? TEAM_COLORS[0]) : -1;
    c.setBanner(arms);
    setTeamCell(c.team, cell);
  }
}
