// The account: Renown that only ever accumulates, what it has unlocked, what is worn, mastery of each hero class and the personal bests. It lives in the
// browser (localStorage 'cw-progress', one versioned JSON object) and is changed once per match, when the match ends (see endprogress.js). There are no
// deadlines, nothing expires and nothing has to be kept up: a number in the account only goes up, a missing or damaged record is a fresh account (never a
// crash), and without storage the account lives in memory for the visit and play goes on.
//
// This file is the maths and the storage and nothing else (no page, no game), so that the tests can run it as it is. unlocks.js has the catalogue.
import { ITEMS, ITEM_BY_KEY, BANNERS, CLOAKS, unlockId } from './unlocks.js';

export const VERSION = 1;
export const KEY = 'cw-progress';

// How much Renown a match is worth, spelled out so that the end screen can show how it adds up. About 80 to 250 for an ordinary match; a lost one pays
// well too (it is the time you stood and the waves you saw that count most), and only a victory adds a bonus on top.
export const RENOWN = {
  fight: 30, fightSecs: 240,      // for fighting at all (in full from four minutes on)
  perMinute: 3.5, maxMinutes: 25, // for the time you held out
  perWave: 1.5, maxWaves: 30,     // for the waves you saw
  perKill: 0.6, maxKills: 100,    // for your own kills
  win: 50,                        // for winning
  difficulty: { easy: 0.8, normal: 1, hard: 1.2 },
};

// Mastery of a hero class: what a match adds to the class you played (spread over the classes, if you changed in the middle), and where the ranks begin.
export const MASTERY = { base: 20, perKill: 1, maxKills: 120, perWave: 1.2, maxWaves: 40, perMinute: 2.5, maxMinutes: 30, win: 30, minShare: 0.05 };
export const RANK_AT = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];   // mastery points at which rank 1, 2, ... 10 begin
export const RANK_NAMES = ['Squire', 'Footman', 'Veteran', 'Sergeant', 'Captain', 'Champion', 'Banneret', 'Marshal', 'Warden', 'Warlord'];
export const MASTERY_CLASSES = ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier'];
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// The records kept: [stat, label, unit, direction]. A record is only called "new" when it beats an earlier one (the first match sets them quietly).
export const BESTS = [
  { key: 'kills', label: 'Kills', unit: 'kills', better: 1 },
  { key: 'streak', label: 'Best streak', unit: 'in a row', better: 1 },
  { key: 'dmg', label: 'Damage dealt', unit: 'damage', better: 1 },
  { key: 'waves', label: 'Waves', unit: 'waves', better: 1 },
  { key: 'armyKills', label: 'Army kills', unit: 'army kills', better: 1 },
  { key: 'gold', label: 'Gold earned', unit: 'gold', better: 1 },
  { key: 'breaches', label: 'Gates and walls broken', unit: 'breaches', better: 1 },
  { key: 'fastWin', label: 'Fastest victory', unit: '', better: -1 },
];
export const BEST_BY_KEY = Object.fromEntries(BESTS.map((b) => [b.key, b]));
const FASTEST_WIN_MIN = 120;   // a victory shorter than this (seconds) does not count as a fast one

// ---------------------------------------------------------------- the account
export function freshAccount() {
  return {
    v: VERSION, renown: 0, carry: 0, unlocked: [], equipped: { banner: '', cloak: '' }, seen: 0,
    mastery: Object.fromEntries(MASTERY_CLASSES.map((c) => [c, 0])),
    best: Object.fromEntries(BESTS.map((b) => [b.key, 0])),
    tot: { matches: 0, wins: 0, secs: 0, kills: 0 },
    extra: {},   // what a newer build wrote that this one does not know: kept and written back, so that nothing is ever lost
  };
}

const KNOWN = new Set(['v', 'renown', 'carry', 'unlocked', 'equipped', 'seen', 'mastery', 'best', 'tot']);
const count = (x, max = 1e9) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.min(Math.floor(x), max) : 0);

export const nextItem = (a) => ITEMS.find((it) => !a.unlocked.includes(it.key)) || null;

// Turn anything (a parsed file, nothing, rubbish) into a sound account. A record from an older build keeps what it had and gets what it has earned: when
// the unlock list is missing it is rebuilt from the Renown, which is how many steps of the track that much Renown pays for.
export function sanitizeAccount(raw) {
  const a = freshAccount();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return a;
  a.renown = count(raw.renown);
  a.carry = count(raw.carry);
  const list = Array.isArray(raw.unlocked) ? raw.unlocked : null;
  if (list) {
    for (const k of list) if (typeof k === 'string' && ITEM_BY_KEY[k] && !a.unlocked.includes(k)) a.unlocked.push(k);
  } else if (a.renown > 0) {
    let left = a.renown;
    for (const it of ITEMS) { if (left < it.cost) break; left -= it.cost; a.unlocked.push(it.key); }
    a.carry = left;
  }
  const nx = nextItem(a);
  if (nx && a.carry >= nx.cost) a.carry = nx.cost - 1;   // (the bar never sits above its end)
  const eq = raw.equipped && typeof raw.equipped === 'object' ? raw.equipped : {};
  if (typeof eq.banner === 'string' && a.unlocked.includes(unlockId('banner', eq.banner))) a.equipped.banner = eq.banner;
  if (typeof eq.cloak === 'string' && a.unlocked.includes(unlockId('cloak', eq.cloak))) a.equipped.cloak = eq.cloak;
  a.seen = Math.min(count(raw.seen), a.unlocked.length);
  if (raw.mastery && typeof raw.mastery === 'object') for (const c of MASTERY_CLASSES) a.mastery[c] = count(raw.mastery[c]);
  if (raw.best && typeof raw.best === 'object') for (const b of BESTS) a.best[b.key] = count(raw.best[b.key]);
  if (raw.tot && typeof raw.tot === 'object') for (const k of Object.keys(a.tot)) a.tot[k] = count(raw.tot[k]);
  a.v = Math.max(VERSION, count(raw.v) || VERSION);
  for (const k of Object.keys(raw)) if (!KNOWN.has(k)) a.extra[k] = raw[k];
  return a;
}

export function serialize(a) {
  const { extra, ...rest } = a;
  return { ...(extra || {}), ...rest };
}

// ---------------------------------------------------------------- storage (never throws)
let storeOf = () => { try { return localStorage; } catch (e) { return null; } };
let mem = null;   // the account of this visit, for when the browser keeps nothing
export function useStorage(fn) { storeOf = fn; mem = null; }   // (the tests give it a store of their own)

export function loadAccount() {
  try {
    const s = storeOf();
    const text = s ? s.getItem(KEY) : null;
    if (text !== null && text !== undefined) return (mem = sanitizeAccount(JSON.parse(text)));
    return mem ? sanitizeAccount(serialize(mem)) : freshAccount();
  } catch (e) {
    return mem ? sanitizeAccount(serialize(mem)) : freshAccount();
  }
}
export function saveAccount(a) {
  mem = a;
  try { const s = storeOf(); if (!s) return false; s.setItem(KEY, JSON.stringify(serialize(a))); return true; } catch (e) { return false; }
}

// ---------------------------------------------------------------- Renown
// `m` is what the match was: { time (s), waves, kills, won, difficulty }
export function renownFor(m) {
  const t = Math.max(0, +m.time || 0), mins = Math.min(RENOWN.maxMinutes, t / 60);
  const waves = Math.min(RENOWN.maxWaves, Math.max(0, m.waves | 0)), kills = Math.min(RENOWN.maxKills, Math.max(0, m.kills | 0));
  const parts = [
    { id: 'fight', label: 'The fight', n: 0, amount: RENOWN.fight * Math.min(1, t / RENOWN.fightSecs) },
    { id: 'time', label: 'Time held', n: Math.round(mins * 10) / 10, amount: RENOWN.perMinute * mins },
    { id: 'waves', label: 'Waves', n: waves, amount: RENOWN.perWave * waves },
    { id: 'kills', label: 'Kills', n: kills, amount: RENOWN.perKill * kills },
    { id: 'win', label: 'Victory', n: 0, amount: m.won ? RENOWN.win : 0 },
  ].map((p) => ({ ...p, amount: Math.round(p.amount) })).filter((p) => p.amount > 0);
  const mult = RENOWN.difficulty[m.difficulty] ?? 1;
  const sum = parts.reduce((s, p) => s + p.amount, 0);
  return { total: Math.max(0, Math.round(sum * mult)), parts, mult };
}

// ---------------------------------------------------------------- mastery
export function rankOf(xp) {
  let rank = 1;
  while (rank < RANK_AT.length && xp >= RANK_AT[rank]) rank++;
  const max = rank >= RANK_AT.length;
  const from = RANK_AT[rank - 1], to = max ? from : RANK_AT[rank];
  return { rank, name: RANK_NAMES[rank - 1], roman: ROMAN[rank], max, xp, from, to, into: xp - from, span: max ? 0 : to - from, frac: max ? 1 : (xp - from) / (to - from) };
}

export function masteryGain(m) {
  const mins = Math.min(MASTERY.maxMinutes, Math.max(0, +m.time || 0) / 60);
  const n = MASTERY.base + MASTERY.perKill * Math.min(MASTERY.maxKills, Math.max(0, m.kills | 0)) + MASTERY.perWave * Math.min(MASTERY.maxWaves, Math.max(0, m.waves | 0))
    + MASTERY.perMinute * mins + (m.won ? MASTERY.win : 0);
  return Math.round(n);
}

// Who the match's mastery goes to: the class you played, or, if you changed class on the way, each one for its share of the time. `events` are the match
// log's, where a change is { t, type: 'class', cls (the new one), from (the old one) }.
export function classShares(events, finalCls, total) {
  const sw = (events || []).filter((e) => e && e.type === 'class' && typeof e.cls === 'string' && MASTERY_CLASSES.includes(e.cls)).sort((a, b) => a.t - b.t);
  if (!sw.length || !(total > 0)) return { [finalCls]: 1 };
  const secs = {};
  let at = 0, cur = MASTERY_CLASSES.includes(sw[0].from) ? sw[0].from : finalCls;
  for (const e of sw) {
    const t = Math.max(at, Math.min(e.t, total));
    secs[cur] = (secs[cur] || 0) + (t - at);
    at = t; cur = e.cls;
  }
  secs[cur] = (secs[cur] || 0) + (total - at);
  let keep = Object.keys(secs).filter((c) => secs[c] / total >= MASTERY.minShare);
  if (!keep.length) keep = [finalCls];
  const sum = keep.reduce((s, c) => s + (secs[c] || total), 0);
  return Object.fromEntries(keep.map((c) => [c, (secs[c] || total) / sum]));
}

// Add Renown to an account (in place): the total, and the bar towards the next unlock, which fills, unlocks and carries what is left over towards the one
// after it. Returns the unlocks it crossed, in order.
export function earn(a, amount) {
  a.renown += amount;
  a.carry += amount;
  const crossed = [];
  for (let nx = nextItem(a); nx && a.carry >= nx.cost; nx = nextItem(a)) { a.carry -= nx.cost; a.unlocked.push(nx.key); crossed.push(nx.key); }
  if (!nextItem(a)) a.carry = 0;   // (everything is earned: Renown still counts, there is only no bar left to fill)
  return crossed;
}

// ---------------------------------------------------------------- a match
// Fold one finished match into an account. `m`: { time, waves, kills, won, difficulty, cls, events, stats: { kills, streak, dmg, waves, armyKills, gold,
// breaches } }. Returns { account, result }: the new account, and everything the end screen tells (it is the account that changes, never the old one).
export function applyMatch(old, m) {
  const a = sanitizeAccount(serialize(old));
  const before = { renown: a.renown, carry: a.carry, next: (nextItem(a) || {}).key || null, unlocked: a.unlocked.length };
  const pay = renownFor(m);
  const crossed = earn(a, pay.total);
  // mastery
  const gain = masteryGain(m), shares = classShares(m.events, m.cls, m.time);
  const mastery = [];
  for (const c of Object.keys(shares)) {
    if (!MASTERY_CLASSES.includes(c)) continue;
    const add = Math.round(gain * shares[c]);
    const b = rankOf(a.mastery[c]);
    a.mastery[c] = Math.min(1e9, a.mastery[c] + add);
    const f = rankOf(a.mastery[c]);
    mastery.push({ cls: c, gained: add, share: shares[c], before: b, after: f, rankUp: f.rank > b.rank });
  }
  // records
  const st = m.stats || {}, made = {};
  made.kills = m.kills | 0; made.streak = st.streak | 0; made.dmg = Math.round(st.dmg || 0); made.waves = m.waves | 0;
  made.armyKills = st.armyKills | 0; made.gold = st.gold | 0; made.breaches = st.breaches | 0;
  made.fastWin = m.won && m.time >= FASTEST_WIN_MIN ? Math.round(m.time) : 0;
  const records = [], firsts = [];
  for (const b of BESTS) {
    const v = made[b.key] || 0, prev = a.best[b.key];
    if (!v) continue;
    const beats = prev === 0 || (b.better > 0 ? v > prev : v < prev);
    if (!beats) continue;
    (prev === 0 ? firsts : records).push({ key: b.key, label: b.label, unit: b.unit, value: v, prev });
    a.best[b.key] = v;
  }
  a.tot.matches++; if (m.won) a.tot.wins++;
  a.tot.secs += Math.round(m.time || 0); a.tot.kills += m.kills | 0;
  const after = { renown: a.renown, carry: a.carry, next: (nextItem(a) || {}).key || null, unlocked: a.unlocked.length };
  return { account: a, result: { gained: pay.total, parts: pay.parts, mult: pay.mult, before, after, crossed, mastery, records, firsts, made, best: { ...a.best } } };
}

// ---------------------------------------------------------------- reading the account
export function trackInfo(a) {
  const nx = nextItem(a);
  if (!nx) return { done: true, next: null, carry: 0, cost: 0, left: 0, frac: 1 };
  return { done: false, next: nx, carry: a.carry, cost: nx.cost, left: nx.cost - a.carry, frac: Math.min(1, a.carry / nx.cost) };
}
// Renown still to earn before `key` is unlocked (0 if it is)
export function renownTo(a, key) {
  if (a.unlocked.includes(key)) return 0;
  let n = -a.carry;
  for (const it of ITEMS) {
    if (a.unlocked.includes(it.key)) continue;
    n += it.cost;
    if (it.key === key) return Math.max(0, n);
  }
  return 0;
}

// What the hero wears and may choose: { banner, cloak, alts: [talent ids] } (ids only; this is what travels in the lobby)
export function loadout(a) {
  return { banner: a.equipped.banner, cloak: a.equipped.cloak, alts: ITEMS.filter((it) => it.kind === 'capstone' && a.unlocked.includes(it.key)).map((it) => it.id) };
}
// whatever a lobby entry says about a player's look, made safe (known ids only)
export function sanitizeLoadout(o) {
  const out = { banner: '', cloak: '', alts: [] };
  if (!o || typeof o !== 'object') return out;
  if (typeof o.banner === 'string' && BANNERS.some((b) => b.id === o.banner)) out.banner = o.banner;
  if (typeof o.cloak === 'string' && CLOAKS.some((c) => c.id === o.cloak)) out.cloak = o.cloak;
  if (Array.isArray(o.alts)) out.alts = [...new Set(o.alts.filter((id) => typeof id === 'string' && ITEM_BY_KEY[unlockId('capstone', id)]))].slice(0, 12);
  return out;
}
export const noLoadout = () => ({ banner: '', cloak: '', alts: [] });

// ---------------------------------------------------------------- the account as this page uses it
export const progress = {
  get() { return loadAccount(); },
  loadout() { return loadout(loadAccount()); },
  // put on (or take off, with '') a banner or a cloak you have unlocked
  equip(kind, id) {
    const a = loadAccount();
    if (kind !== 'banner' && kind !== 'cloak') return a;
    if (id && !a.unlocked.includes(unlockId(kind, id))) return a;
    a.equipped[kind] = id || '';
    saveAccount(a);
    return a;
  },
  markSeen() { const a = loadAccount(); if (a.seen !== a.unlocked.length) { a.seen = a.unlocked.length; saveAccount(a); } return a; },
};
