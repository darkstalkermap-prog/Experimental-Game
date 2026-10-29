// The end-of-match screen is a column of SECTIONS. ui.gameOver() builds a `summary` of the match, lets the match-end handlers run (they may add fields to it)
// and then asks every registered section to draw itself into #goSections; every feature that has something to say registers its own section and nothing else
// edits the screen. Register at import time:
//   registerEndSection('highlight', 20, (summary) => { const el = document.createElement('div'); ...; return el; });   // return null to show nothing
//   onMatchEnd((summary) => { ...persist stats, grant renown...; summary.renown = { gained: 120, ... }; });
// Orders in use (lower = higher up): 10 headline and the table of numbers (ui.js), 20 the highlight line, 30 your stats and personal bests, 40 renown and
// the next unlock, 50 next-battle decrees (preview and reroll), 90 the actions row (Play Again, Change class). Leave gaps so that others can slot in.
const sections = [];
const endHandlers = [];

export function registerEndSection(id, order, build) {
  const i = sections.findIndex((s) => s.id === id);
  if (i >= 0) sections.splice(i, 1);
  sections.push({ id, order, build });
  sections.sort((a, b) => a.order - b.order);
}

export function onMatchEnd(fn) { endHandlers.push(fn); }

// what the end screen (and the sections) know about the match: plain data, nothing live
export function buildSummary(game, won, winner, reason, log) {
  const p = game.player, f = game.localFaction;
  return {
    won, winner, reason,
    coop: !!game.coop, mode: game.mode, hero: !!game.hero, objective: game.objective, difficulty: game.difficultyName,
    options: game.options, map: game.mapBuiltFor || '', team: game.localTeam,
    time: log.t, waves: game.round,
    cls: p.classId, name: p.name, level: p.level || 1,
    kills: p.kills, deaths: p.deaths, armyKills: f.kills, goldEarned: f.earned, goldSpent: f.spent,
    events: log.events, counters: log.counters,
  };
}

// run the match-end handlers once, then draw the sections into `root`
export function renderEndScreen(summary, root) {
  for (const fn of endHandlers) {
    try { fn(summary); } catch (e) { console.error('end handler', e); }
  }
  root.textContent = '';
  for (const s of sections) {
    try {
      const el = s.build(summary);
      if (el) { el.dataset.section = s.id; root.append(el); }
    } catch (e) { console.error('end section ' + s.id, e); }
  }
}
