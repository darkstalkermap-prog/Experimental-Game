// Who fights whom, and in which colours. Every team is its own side unless it has been grouped with others (co-op).
import { TEAM_COLORS, TEAM_CSS } from './config.js';
import { materials } from './materials.js';
import { bannerTexture } from './textures.js';

const sideOf = new Map();   // team -> side id (only for grouped teams)

// groups: [[0, 1], [2, 3]] puts teams 0 and 1 on one side, 2 and 3 on another. Teams left out stand alone.
export function setSides(groups) {
  sideOf.clear();
  groups.forEach((g, i) => { if (g.length > 1) for (const t of g) sideOf.set(t, i); });
}

export function allied(a, b) {
  return a === b || (sideOf.has(a) && sideOf.get(a) === sideOf.get(b));
}

// Teams on the same side as `team` (including itself).
export function sideMates(team, teams) {
  return teams.filter((t) => allied(t, team));
}

// ---------------- house colours ----------------
// The colours a lord can fly. hex: the cloth, banners and soldiers in the world; css: the same colour as the HUD writes it (a little lighter, so it reads
// on the dark panels). None is close to white (the banners carry a cream emblem) or to the raiders' brown.
export const PALETTE = {
  blue: { name: 'Blue', hex: 0x2f62c8, css: '#3f74e0' },
  red: { name: 'Red', hex: 0xb8322a, css: '#d0453b' },
  green: { name: 'Green', hex: 0x2c8a46, css: '#38a957' },
  gold: { name: 'Gold', hex: 0xd9a521, css: '#e8b52c' },
  purple: { name: 'Purple', hex: 0x6b3fb0, css: '#a275e8' },
  orange: { name: 'Orange', hex: 0xd0661c, css: '#f08a3c' },
  teal: { name: 'Teal', hex: 0x1d8f8c, css: '#34c4bf' },
  rose: { name: 'Rose', hex: 0xb83a7c, css: '#e866aa' },
};
export const COLOR_IDS = Object.keys(PALETTE);
export const DEFAULT_COLORS = ['blue', 'red', 'green', 'gold'];   // castle 1..4 when nobody chooses
export const isColorId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PALETTE, id);

// The four houses' colours: `wants` is, per castle, the colour its lord asked for (null for an AI lord or nobody). The first castle to ask for a colour
// gets it (the lobby has already kept two people from the same one); the others keep their usual colour when it is free, otherwise the first free one.
export function assignColors(wants) {
  const out = [null, null, null, null], used = new Set();
  for (let t = 0; t < 4; t++) {
    const w = wants && wants[t];
    if (isColorId(w) && !used.has(w)) { out[t] = w; used.add(w); }
  }
  for (let t = 0; t < 4; t++) {
    if (out[t]) continue;
    const c = !used.has(DEFAULT_COLORS[t]) ? DEFAULT_COLORS[t] : COLOR_IDS.find((id) => !used.has(id));
    out[t] = c; used.add(c);
  }
  return out;
}
export const sanitizeColors = (ids) => assignColors(Array.isArray(ids) ? ids.slice(0, 4) : null);

let current = DEFAULT_COLORS.slice();
export const paletteKey = (ids = current) => ids.join(',');
export const colorIdOf = (team) => current[team] || null;
export const colorName = (team) => (current[team] ? PALETTE[current[team]].name : 'Raiders');

// Paint the houses: TEAM_COLORS and TEAM_CSS (config.js) are what every part of the game reads, so they are changed in place. Called while no world is
// built (main.js buildGame), so castles, soldiers, engines and heroes are made in the new colours; the banners and house cloth are shared by every world
// (materials.js), so they are repainted here.
export function setPalette(ids) {
  const next = sanitizeColors(ids);
  if (paletteKey(next) === paletteKey()) return;
  current = next;
  for (let t = 0; t < 4; t++) { TEAM_COLORS[t] = PALETTE[next[t]].hex; TEAM_CSS[t] = PALETTE[next[t]].css; }
  const M = materials();
  for (let t = 0; t < 4; t++) {
    const b = M.banners[t];
    if (b.map) b.map.dispose();
    b.map = bannerTexture(TEAM_COLORS[t], t);
    M.team[t].color.setHex(TEAM_COLORS[t]);
  }
}
