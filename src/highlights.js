// The best moment of the match, in one line: "Your Fireball broke the north gate at 8:42". While the match runs, the places where something notable
// happens write an EVENT into the match log (matchlog.js); at the end the most notable one that this player can be told about is picked and put in
// words, for the end screen (section 20) and the banner that closes the ending (finale.js).
//   gates, walls and keeps remember who hurt them (`part.hl`), so the line credits whoever really broke them: a hero who did a fifth of the damage or more
//   (a Fireball, a sword, a Smite) is named before the army that did the rest; otherwise whoever did the most
//   highlights.hit(part, amt, attacker, cause)   damage to a gate / wall / keep (castle.js)         highlights.down(game, part, attacker, cause)   it fell
//   highlights.kill(game, victim, attacker, info) a unit fell (game.js)                               highlights.engine(game, engine, attacker, info)  an engine fell
// Events are flat and JSON-safe because the host sends the notable ones to the guests with the end of the match (a guest's own log has no combat in it):
//   { t, type, house, by, kind, weapon, at }   house = whose gate / wall / keep / lord it was · by = the house of whoever did it (-1 unknown) ·
//   kind = 'hero' | 'army' | 'engine' | 'giant' | 'tower' · weapon = what it was done with ('Fireball', 'sword', 'catapult', 'army', ...) · at = a compass word for a gate
import { matchlog, clockText } from './matchlog.js';
import { registerEndSection, onMatchEnd } from './endscreen.js';
import { allied } from './teams.js';

// how much each kind of moment is worth before it is weighed for this player (see score)
const BASE = { keep: 85, lord: 70, laststand: 80, gate: 50, multikill: 34, wall: 28, engine: 24, held: 36, firstblood: 10 };
const KINDS = new Set(Object.keys(BASE));
const ABILITY = /^[A-Z]/;   // abilities are named with a capital ('Fireball'); plain weapons are not ('sword', 'catapult')

// a unit falls to the same hero's same ability within this long of the last one: the same sweep, counted together
const SWEEP = 0.9;
const MULTI = 3;           // this many foes in one sweep is worth a line

const state = { game: null, cur: null, first: false };

// who did it: the house, the kind of doer and what with. `cause` names an ability the caller knows about ('Fireball'); the attacker tells the rest.
const who = { team: -1, kind: 'army', weapon: 'army' };
function describe(attacker, cause) {
  who.team = attacker && attacker.team !== undefined ? attacker.team : -1;
  if (!attacker) { who.kind = 'army'; who.weapon = 'army'; } else if (attacker.isSiege) { who.kind = 'engine'; who.weapon = attacker.type === 'ram' ? 'battering ram' : attacker.type; } else if (attacker.isTower) { who.kind = 'tower'; who.weapon = 'tower archers'; } else if (attacker.isPlayer || attacker.isHero) { who.kind = 'hero'; who.weapon = cause || (attacker.weapon === 'bow' ? 'arrows' : 'sword'); } else if (attacker.isGiant) { who.kind = 'giant'; who.weapon = 'giant'; } else { who.kind = 'army'; who.weapon = 'army'; }
  if (cause && who.kind !== 'hero') who.weapon = cause;
  return who;
}

export const highlights = {
  reset(game = null) { state.game = game; state.cur = null; state.first = false; },

  // ---------------------------------------------------------------- gates, walls and keeps
  hit(part, amt, attacker, cause) {
    if (!(amt > 0)) return;
    if (part.kind === 'gate' && state.game && part.team === state.game.localTeam) matchlog.add('gateHit', amt);   // (for "your gate held")
    const w = describe(attacker, cause);
    const log = part.hl || (part.hl = []);
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (e[0] === w.team && e[1] === w.kind && e[2] === w.weapon) { e[3] += amt; return; }
    }
    if (log.length < 24) log.push([w.team, w.kind, w.weapon, amt]);
  },

  // the part fell (host / single player only): who gets the credit, then the event
  down(game, part, attacker, cause) {
    const log = part.hl;
    part.hl = null;
    let best = null, heroBest = null, total = 0;
    if (log) {
      for (const e of log) {
        total += e[3];
        if (!best || e[3] > best[3]) best = e;
        if (e[1] === 'hero' && (!heroBest || e[3] > heroBest[3])) heroBest = e;
      }
    }
    const pick = heroBest && heroBest[3] >= total * 0.2 ? heroBest : best;
    let by, kind, weapon;
    if (pick) { by = pick[0]; kind = pick[1]; weapon = pick[2]; } else { const w = describe(attacker, cause); by = w.team; kind = w.kind; weapon = w.weapon; }
    const type = part.kind === 'keep' ? 'keep' : part.kind === 'gate' ? 'gate' : 'wall';
    const data = { house: part.team, by, kind, weapon };
    if (type === 'gate') data.at = compass(part.castle.center.x, part.castle.center.z);
    matchlog.record(type, data);
    matchlog.add(type + 's');
  },

  // ---------------------------------------------------------------- soldiers and engines
  kill(game, victim, attacker, info) {
    if (!attacker || attacker.team === undefined) return;
    const ability = info && info.ability;
    // a lord slain
    if (victim.isHero && victim.type === 'lord') {
      const w = describe(attacker, ability);
      matchlog.record('lord', { house: victim.team, by: w.team, kind: w.kind, weapon: w.weapon });
    }
    // first blood of the local hero
    if (attacker === game.player && !state.first && attacker.kills === 1) {
      state.first = true;
      matchlog.record('firstblood', { house: victim.team, by: attacker.team, kind: 'hero', weapon: ability || (attacker.weapon === 'bow' ? 'arrows' : 'sword') });
    }
    // several foes to one sweep of one ability
    if (ability && (attacker.isPlayer || attacker.isHero)) {
      const t = matchlog.t, c = state.cur;
      if (c && c.by === attacker && c.ability === ability && t - c.last <= SWEEP) {
        c.n++;
        c.last = t;
        if (c.ev) c.ev.n = c.n;
        else if (c.n >= MULTI) c.ev = matchlog.record('multikill', { house: -1, by: attacker.team, kind: 'hero', weapon: ability, n: c.n });
      } else state.cur = { by: attacker, ability, last: t, n: 1, ev: null };
    }
  },

  engine(game, engine, attacker, info) {
    if (!attacker || attacker.team === undefined || attacker.team === engine.team) return;
    const w = describe(attacker, info && info.ability);
    matchlog.record('engine', { house: engine.team, by: w.team, kind: w.kind, weapon: w.weapon, what: engine.type });
  },

  // ---------------------------------------------------------------- choosing and telling
  // the notable events of a match, for a guest: its own log has no combat in it (the host fights it all)
  candidates(events = matchlog.events, limit = 40) {
    return events.filter((e) => KINDS.has(e.type)).sort((a, b) => (BASE[b.type] || 0) - (BASE[a.type] || 0) || b.t - a.t).slice(0, limit)
      .map((e) => ({ t: Math.round(e.t * 10) / 10, type: e.type, house: e.house, by: e.by, kind: e.kind, weapon: e.weapon, at: e.at, n: e.n, what: e.what }));
  },

  // The best of the moments `events` holds, for the player of house `me`. Returns { text, type, t, score } or null.
  best(game, events, me, extra = {}) {
    let top = null;
    const consider = (e) => {
      const s = score(e, me);
      if (s > 0 && (!top || s > top.score)) top = { e, score: s };
    };
    for (const e of events) if (KINDS.has(e.type)) consider(e);
    // a gate that held through the whole match (nobody broke it) is worth saying when nothing else is
    const held = extra.held;
    if (held && held.waves >= 3) consider({ t: held.t, type: 'held', house: me, by: me, kind: 'army', weapon: 'army', n: held.waves });
    if (!top) return null;
    return { text: tell(game, top.e, me), type: top.e.type, t: top.e.t, score: Math.round(top.score), by: top.e.by, weapon: top.e.weapon, house: top.e.house };
  },
};

// how notable a moment is for the player of house `me`
function score(e, me) {
  const base = BASE[e.type];
  if (!base) return 0;
  const mine = e.by === me, ally = !mine && e.by >= 0 && allied(e.by, me);
  const done = mine ? (e.kind === 'hero' ? 40 : 18) : ally ? 8 : 0;
  const named = e.kind === 'hero' && ABILITY.test(e.weapon || '') ? 12 : 0;
  // what was done TO the player: only the keep falling is the story of a match, a gate lost is a small thing
  const victim = e.house === me && e.type !== 'lord';
  let s = base + (victim ? 0 : done + named);
  if (e.type === 'multikill') s += 5 * (e.n || 0) + (mine ? 0 : -40);
  if (e.type === 'firstblood') s = mine ? base : 0;
  if (victim && e.type !== 'keep') s *= 0.5;
  if (e.type === 'lord' && e.house === me) s = 0;
  if (e.type === 'held') s = base + 4 * (e.n || 0);
  return s;
}

// 'north', 'east', 'south' or 'west': where on the map (north is up, -z) a castle stands
export function compass(x, z) { return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'east' : 'west') : z > 0 ? 'south' : 'north'; }

const pickWord = (words, e) => words[Math.floor(Math.abs(Math.sin((e.t || 0) * 12.9898 + (e.house || 0) * 78.233)) * 1e4) % words.length];
const VERBS = {
  gate: { sword: ['hacked down'], 'battering ram': ['smashed in', 'broke down', 'burst open'], catapult: ['smashed', 'blasted open'], army: ['broke', 'stormed', 'burst open'], giant: ['smashed in'], 'tower archers': ['broke'], spell: ['broke', 'burst open', 'blew open'] },
  wall: { sword: ['hacked through'], 'battering ram': ['broke through', 'smashed through'], catapult: ['breached', 'brought down'], army: ['breached', 'broke through'], giant: ['smashed through'], 'tower archers': ['breached'], spell: ['breached', 'brought down'] },
  keep: { sword: ['hacked down'], 'battering ram': ['brought down', 'broke down'], catapult: ['brought down', 'crushed'], army: ['brought down', 'felled', 'razed'], giant: ['brought down'], 'tower archers': ['brought down'], spell: ['brought down', 'felled', 'toppled'] },
};
const SWEEPS = { Whirlwind: 'cut down {n} foes in one spin', Fireball: 'caught {n} soldiers in one blast', 'Arrow Volley': 'dropped {n} foes at once', 'Shield Bash': 'bowled over {n} foes in one bash', Smite: 'blasted {n} foes with one bolt', 'Lance Charge': 'rode down {n} foes in one charge', 'Frost Ward': 'shattered {n} foes in one burst' };

// the words for a moment, as the player of house `me` is told it
export function tell(game, e, me) {
  const F = game && game.factions ? game.factions : [];
  const nameOf = (t) => (F[t] ? F[t].name : 'a rival house');
  const lordOf = (t) => (F[t] ? F[t].lord : 'a lord');
  const mine = e.by === me, ally = !mine && e.by >= 0 && allied(e.by, me);
  const at = e.t !== undefined ? ` at ${clockText(e.t)}` : '';
  const spell = e.kind === 'hero' && ABILITY.test(e.weapon || '');
  // the doer
  let subject;
  if (mine) subject = e.kind === 'hero' ? (spell ? `Your ${e.weapon}` : e.weapon === 'arrows' ? 'Your arrows' : 'You') : e.kind === 'tower' ? 'Your tower archers' : `Your ${e.weapon}`;
  else if (ally) subject = e.kind === 'hero' ? `${lordOf(e.by)}${spell ? `'s ${e.weapon}` : ''}` : `${lordOf(e.by)}'s ${e.weapon}`;
  else subject = e.kind === 'hero' ? `${lordOf(e.by)}${spell ? `'s ${e.weapon}` : ''}` : e.by >= 0 ? `${nameOf(e.by)}'s ${e.weapon}` : `The ${e.weapon}`;
  const tool = spell ? 'spell' : e.kind === 'hero' ? (e.weapon === 'arrows' ? 'army' : 'sword') : e.kind === 'giant' ? 'giant' : e.kind === 'tower' ? 'tower archers' : e.weapon;
  const verbOf = (type) => { const v = VERBS[type]; const list = v[tool] || v.army; return pickWord(list, e); };
  switch (e.type) {
    case 'gate': return `${subject} ${verbOf('gate')} ${e.house === me ? 'your gate' : `the ${e.at || 'castle'} gate`}${at}`;
    case 'wall': return `${subject} ${verbOf('wall')} ${e.house === me ? 'your wall' : `${nameOf(e.house)}'s wall`}${at}`;
    case 'keep': return `${subject} ${verbOf('keep')} ${e.house === me ? 'your keep' : `${nameOf(e.house)}'s keep`}${at}`;
    case 'lord': return `${subject} ${spell ? 'struck down' : mine && e.kind === 'hero' ? 'slew' : 'cut down'} ${lordOf(e.house)}${at}`;
    case 'engine': return `${subject} ${spell ? 'burned' : 'wrecked'} ${e.house === me ? 'your' : 'a'} ${e.what === 'ram' ? 'battering ram' : e.what || 'siege engine'}${at}`;
    case 'multikill': return `${subject} ${(SWEEPS[e.weapon] || 'felled {n} foes at once').replace('{n}', e.n)}${at}`;
    case 'firstblood': return `You drew first blood${at}`;
    case 'held': return `Your army held the gate through ${e.n} waves`;
    case 'laststand': return `Your last stand saved the keep${at}`;
    default: return '';
  }
}

// ---------------------------------------------------------------- the end screen
const CSS = `
#goSections .hl { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 9px 16px; margin: 2px 0;
  border-top: 1px solid rgba(90,29,18,0.45); border-bottom: 1px solid rgba(90,29,18,0.45);
  background: linear-gradient(90deg, rgba(224,180,76,0), rgba(224,180,76,0.28) 20%, rgba(224,180,76,0.28) 80%, rgba(224,180,76,0)); }
#goSections .hl i { font-style: normal; font-size: 24px; line-height: 1; color: #5a1d12; }
#goSections .hl span { font-family: 'EB Garamond', Georgia, serif; font-style: italic; font-size: 22px; line-height: 1.25; color: var(--ink); }
#goSections .hl small { display: block; font-family: 'Cinzel', Georgia, serif; font-style: normal; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #7a4a22; margin-bottom: 1px; }`;
function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById('hl-style')) return;
  const s = document.createElement('style');
  s.id = 'hl-style';
  s.textContent = CSS;
  document.head.append(s);
}

// What the match-end handler works out and the section shows (also read by finale.js for the banner)
export function pickHighlight(game, summary) {
  const me = game.localTeam;
  let events = summary && summary.events ? summary.events : matchlog.events;
  if (game.mode === 'client' && game.finale && game.finale.hostEvents) events = game.finale.hostEvents;
  return highlights.best(game, events, me, { held: gateHeld(game, summary) });
}

// "your gate held through N waves": it stood all match, took a real beating, and the match was long enough
function gateHeld(game, summary) {
  const c = game.localFaction && game.localFaction.castle;
  if (!c || !c.gate.alive || game.hero || game.practice) return null;
  if (matchlog.find('gate').some((e) => e.house === game.localTeam)) return null;   // it fell at some point
  if (matchlog.get('gateHit') < c.gate.maxHp * 0.4) return null;
  return { waves: game.round, t: matchlog.t };
}

onMatchEnd((summary) => {
  const g = state.game;
  summary.highlight = g ? pickHighlight(g, summary) : null;
});

export function registerHighlightSection() {
  injectStyle();
  registerEndSection('highlight', 20, (summary) => {
    const h = summary.highlight;
    if (!h || !h.text) return null;
    const el = document.createElement('div');
    el.className = 'hl';
    const icon = document.createElement('i');
    icon.textContent = h.type === 'keep' ? '♜' : h.type === 'multikill' ? '⚔' : '✦';
    const box = document.createElement('span');
    const small = document.createElement('small');
    small.textContent = 'Moment of the battle';
    box.append(small, h.text);
    el.append(icon, box);
    return el;
  });
}
registerHighlightSection();
