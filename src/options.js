// What a match is set up with besides difficulty, map, mode and the players: chosen on the menu (or remembered from the last match), sent to the guests
// in the start message of an online game, and read by the rules. One plain object with one field per feature. Every default means "as it always was", so a
// missing field, an old client or a corrupt saved value plays the classic match.
//   length    'standard' | 'short'                        how long a match runs: wave growth and the pace of the war
//   biome     'meadow' | 'snow' | 'marsh' | 'desert'      how the land looks, and its small rule twists (the world is built for it)
//   seed      0..999999                                   varies the land inside a biome; 0 is the classic layout
//   decrees   string[] (at most 4)                        ids of the Battle Decrees in force this match
//   rivals    string[4]                                   the personality id of the rival lord of each house (index = team); '' or 'classic' = the classic lord; ids are
//                                                         those of rivals.js ('rusher', or 'rusher3' for the fourth name of its pool); the menu rolls them when all four are empty
// Each feature validates its own field below; the shape stays flat and JSON-safe because it travels in a network message and in localStorage.
export const OPTION_DEFAULTS = Object.freeze({ length: 'standard', biome: 'meadow', seed: 0, decrees: [], rivals: ['', '', '', ''] });

export function defaultOptions() {
  return { length: 'standard', biome: 'meadow', seed: 0, decrees: [], rivals: ['', '', '', ''] };
}

// a clean copy of `o` with only the known fields and valid values (anything else falls back to the default)
export function sanitizeOptions(o) {
  const src = o && typeof o === 'object' ? o : {};
  const out = defaultOptions();
  if (src.length === 'short') out.length = 'short';
  if (typeof src.biome === 'string' && /^[a-z]{1,16}$/.test(src.biome)) out.biome = src.biome;
  const seed = Number(src.seed);
  if (Number.isInteger(seed) && seed >= 0 && seed <= 999999) out.seed = seed;
  if (Array.isArray(src.decrees)) out.decrees = src.decrees.filter((d) => typeof d === 'string' && /^[a-z0-9_]{1,24}$/.test(d)).slice(0, 4);
  if (Array.isArray(src.rivals)) out.rivals = [0, 1, 2, 3].map((i) => (typeof src.rivals[i] === 'string' && /^[a-z0-9_]{1,24}$/.test(src.rivals[i]) ? src.rivals[i] : ''));
  return out;
}

const KEY = 'cw-options';
// the options of the last match this browser played (what Quick Play and Play Again start with)
export function loadOptions() {
  try { return sanitizeOptions(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return defaultOptions(); }
}
export function saveOptions(o) {
  try { localStorage.setItem(KEY, JSON.stringify(sanitizeOptions(o))); } catch (e) { /* storage unavailable */ }
}
