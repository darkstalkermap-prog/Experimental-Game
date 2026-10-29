// What a hero does in a match, counted for the end screen (and its personal bests): damage dealt to foes, the longest run of kills without falling, enemy
// heroes slain, gates and walls broken, siege engines destroyed, keeps brought down. A tiny hook where each thing happens (game.js) calls one of these.
// Every human hero carries its own `st`: the host keeps one for each player and sends it to that guest when the match ends (a guest never sees the blows
// itself). The hero on THIS screen also writes the match log (matchlog.js), which is where the end screen reads it. No allocation, no page work.
//   match log counters: dmg (damage dealt) · streak (longest run of kills without falling) · slain (enemy heroes killed) · breaches (gates and walls you
//   broke) · engines (siege engines you destroyed) · keeps (keeps you brought down)
import { matchlog } from './matchlog.js';

export const STAT_KEYS = ['dmg', 'streak', 'slain', 'breaches', 'engines', 'keeps'];
export const blankStats = () => ({ dmg: 0, now: 0, streak: 0, slain: 0, breaches: 0, engines: 0, keeps: 0 });

const put = (p, k, n) => { p.st[k] += n; if (p.isLocal) matchlog.add(k, n); };

export const stats = {
  dealt(p, n) { if (n > 0) put(p, 'dmg', n); },
  // a kill: the run goes on; a fall: it ends
  kill(p) {
    const s = p.st;
    if (++s.now > s.streak) { s.streak = s.now; if (p.isLocal) matchlog.max('streak', s.now); }
  },
  fell(p) { p.st.now = 0; },
  slain(p) { put(p, 'slain', 1); },
  breach(p) { put(p, 'breaches', 1); },
  engine(p) { put(p, 'engines', 1); },
  keep(p) { put(p, 'keeps', 1); },
  // what a guest is sent when the match ends
  pack(p) { const o = {}; for (const k of STAT_KEYS) o[k] = Math.round(p.st[k]); return o; },
};

// a guest, told its numbers by the host at the end: they go into the match log, where the end screen reads them
export function absorbStats(st) {
  if (!st || typeof st !== 'object') return;
  for (const k of STAT_KEYS) {
    const v = Number(st[k]);
    if (Number.isFinite(v) && v > 0) matchlog.counters[k] = Math.min(v, 1e9);
  }
}
