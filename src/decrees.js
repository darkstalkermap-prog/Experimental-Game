// Battle Decrees: one or two random rule changes for the next battle ("Giants cost half · Double waves"), rolled when a match ends and previewed on the
// end screen, where they can be rolled again or switched off for the next battle ("Classic battle"). A decree is a handful of rule modifiers (mods.js);
// the match puts them in at its start (startDecrees, called by Game.start) and the rules that ask for them are hooked in the places named in mods.js.
//   - The ids of the decrees in force travel in the match options (options.decrees), so a guest sets exactly the host's decrees (the host decides the rules).
//   - The next battle's roll is remembered in the saved options (cw-options), so Quick Play, Play Again and a fresh page all start with what the end screen
//     showed. main.js asks pendingDecrees() when it builds the options of a start. Nothing is rolled before the first match ends: the first battle is classic.
//   - The Options screen's "Battle Decrees" switch (settings.decrees) turns the whole thing off: no roll, no section, classic battles.
//   - Hero Game Mode and the practice courtyard have no decrees (no gold, no waves of their own to bend); the end screen says nothing there.
//   - Online, only the host rolls and rerolls; guests are sent the roll (a 'decrees' message of the room, see main.js guestData) and see it read-only.
import { mods } from './mods.js';
import { loadOptions, saveOptions } from './options.js';
import { settings, saveSettings } from './settings.js';
import { registerEndSection, onMatchEnd } from './endscreen.js';
import { matchlog } from './matchlog.js';

// tone: 'boon' (it only helps) or 'edge' (it helps and costs). tag: two decrees of one tag are never rolled together. rules: mods.js keys.
export const DECREES = [
  { id: 'giants_bargain', icon: '🗿', tone: 'boon', tag: 'siege', name: "Giants' Bargain", text: 'Giants cost half.', rules: { 'cost.giant': 0.5 } },
  { id: 'great_muster', icon: '⚔️', tone: 'edge', tag: 'pace', name: 'The Great Muster', text: 'Double waves: every house sends twice the soldiers.', rules: { waveSize: 2 } },
  { id: 'gold_rain', icon: '🪙', tone: 'boon', tag: 'gold', name: 'Gold Rain', text: 'Income +50%: the trickle and every wave\'s wage.', rules: { income: 1.5 } },
  { id: 'hard_winter', icon: '❄️', tone: 'edge', tag: 'pace', name: 'Hard Winter', text: 'Soldiers cost 25% more and the waves come 25% less often.', rules: { 'cost.recruit': 1.25, waveGap: 1.25 } },
  { id: 'swift_march', icon: '👢', tone: 'edge', tag: 'pace', name: 'Swift March', text: 'Soldiers march 20% faster: the armies meet sooner.', rules: { speed: 1.2 } },
  { id: 'blood_price', icon: '🩸', tone: 'boon', tag: 'gold', name: 'Blood Price', text: 'Every kill pays double.', rules: { bounty: 2 } },
  { id: 'siege_season', icon: '🪵', tone: 'boon', tag: 'siege', name: 'Siege Season', text: 'Battering rams and catapults cost half.', rules: { 'cost.ram': 0.5, 'cost.catapult': 0.5 } },
  { id: 'iron_discipline', icon: '🛡️', tone: 'boon', tag: 'army', name: 'Iron Discipline', text: 'Barracks, Drill Sergeants and Elite Levies cost half.', rules: { 'cost.upgrade': 0.5 } },
  { id: 'smiths_holiday', icon: '🔨', tone: 'boon', tag: 'hero', name: 'Smiths\' Holiday', text: 'Swords, shields, bows, horses, potions and arrows cost half.', rules: { 'cost.gear': 0.5 } },
  { id: 'war_chest', icon: '💰', tone: 'edge', tag: 'gold', name: 'War Chest', text: 'Start with 600 more gold, but earn 20% less.', rules: { startGold: 600, income: 0.8 } },
  { id: 'cavalry_fever', icon: '🐎', tone: 'boon', tag: 'army', name: 'Cavalry Fever', text: 'Cavalry and Lancers cost 40% less.', rules: { 'cost.horseman': 0.6, 'cost.lancer': 0.6 } },
  { id: 'heroes_return', icon: '👑', tone: 'boon', tag: 'hero', name: 'Heroes\' Return', text: 'Heroes and lords rise in half the time; heroes walk 10% faster.', rules: { respawn: 0.5, heroSpeed: 1.1 } },
  { id: 'lean_times', icon: '🍞', tone: 'edge', tag: 'gold', name: 'Lean Times', text: 'Income -30%, but every kill pays 50% more.', rules: { income: 0.7, bounty: 1.5 } },
  { id: 'long_siege', icon: '🏰', tone: 'edge', tag: 'pace', name: 'Long Siege', text: 'Waves come 40% less often and are 60% bigger.', rules: { waveGap: 1.4, waveSize: 1.6 } },
  { id: 'eager_armies', icon: '📯', tone: 'edge', tag: 'pace', name: 'Eager Armies', text: 'The armies are restless: waves come 30% faster.', rules: { waveGap: 0.7 } },
  { id: 'mercenary_fair', icon: '🗡️', tone: 'edge', tag: 'army', name: 'Mercenary Fair', text: 'Soldiers cost 30% less, but kills pay 40% less.', rules: { 'cost.recruit': 0.7, bounty: 0.6 } },
  { id: 'masons_holiday', icon: '🧱', tone: 'boon', tag: 'castle', name: 'Masons\' Holiday', text: 'Gate, wall, keep and tower works cost half.', rules: { 'cost.castle': 0.5 } },
  { id: 'archery_contest', icon: '🏹', tone: 'boon', tag: 'army', name: 'Archery Contest', text: 'Archers cost half.', rules: { 'cost.archer': 0.5 } },
];
export const DECREE_BY_ID = Object.assign(Object.create(null), Object.fromEntries(DECREES.map((d) => [d.id, d])));   // (no prototype: a made-up id like '__proto__' finds nothing)
export const decreeNames = (defs) => defs.map((d) => d.name).join(' · ');

// ---------------- rolling ----------------
const TWO_CHANCE = 0.6;   // one decree or two: two, this often
const sharesKey = (a, b) => Object.keys(a.rules).some((k) => k in b.rules);
const compatible = (a, b) => a.id !== b.id && a.tag !== b.tag && !sharesKey(a, b);

// One or two decrees that go together, none of `avoid` unless there is no other way. Returns ids.
export function rollDecrees(avoid = [], rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const pool = DECREES.filter((d) => !avoid.includes(d.id));
  const first = pick(pool.length ? pool : DECREES);
  const ids = [first.id];
  if (rng() < TWO_CHANCE) {
    const second = pick(pool.filter((d) => compatible(first, d)));
    if (second) ids.push(second.id);
  }
  return ids;
}

// ---------------- the decrees of the next battle ----------------
let next = loadOptions().decrees.filter((id) => DECREE_BY_ID[id]);   // what the next match from this browser is set up with
let heard = [];                                                       // a guest: what the host says the next battle will have (shown, never used)
let lastGame = null;

// what main.js puts in the options of a match it starts: nothing while the switch in the Options screen is off
export function pendingDecrees() { return settings.decrees ? next.slice() : []; }
export function setPendingDecrees(ids, late = false) {   // late: the roll at the end of a match, which reaches the guests a moment after the end message (see broadcast)
  next = ids.filter((id) => DECREE_BY_ID[id]).slice(0, 2);
  saveOptions({ ...loadOptions(), decrees: next });
  broadcast(late);
  paintMenuRow();
}
// online, the host tells every guest what the next battle will have: a message of the room, not a snapshot event (when the match is over the guests' snapshot
// handler is put away for the room's own, main.js roomAfterMatch, whose guestData hears this and calls hearDecrees)
let castTimer = 0;
function broadcast(late = false) {
  const g = lastGame;
  if (!(g && g.mode === 'host' && g.net)) return;
  clearTimeout(castTimer);
  if (!late) { g.net.toAll({ k: 'decrees', ids: next }); return; }
  // not in the tick of the ending: the room's outbox is small (roomnet.js), and a second message sent right after the end message pushes it out of the outbox,
  // so the guests would never see the match end
  castTimer = setTimeout(() => { if (g.net && lastGame === g) g.net.toAll({ k: 'decrees', ids: next }); }, 1200);
}
// a guest hears the host's roll
export function hearDecrees(ids) {
  heard = (Array.isArray(ids) ? ids : []).filter((id) => DECREE_BY_ID[id]).slice(0, 2);
  for (const el of document.querySelectorAll('.nb-decrees')) paint(el, el.cwSummary);
}

// ---------------- the match ----------------
// Game.start: put the decrees of the options in force (as mods sources, before the houses are built). Returns the decrees in force.
export function startDecrees(game) {
  lastGame = game;
  const defs = (game.options.decrees || []).map((id) => DECREE_BY_ID[id]).filter(Boolean);
  for (const d of defs) mods.set('decree:' + d.id, d.rules);
  game.decrees = defs;
  game.decreeSeen = false;
  if (defs.length) matchlog.record('decrees', { ids: defs.map((d) => d.id) });
  heard = [];
  return defs;
}

// ---------------- the HUD: the banner, the line under the wave timer, the pause screen ----------------
// every 0.12 s from the HUD
export function updateDecreeHud(ui, game) {
  const defs = game.decrees || [];
  let line = document.getElementById('decreeLine');
  if (!line) {
    injectCss();
    line = document.createElement('div');
    line.id = 'decreeLine';
    document.getElementById('top').append(line);
  }
  const text = defs.length && game.state === 'playing' ? 'Decrees: ' + decreeNames(defs) : '';
  if (line.textContent !== text) {
    line.textContent = text;
    line.title = defs.map((d) => `${d.name}: ${d.text}`).join('\n');
    line.classList.toggle('hidden', !text);
  }
  // once the opening banner has had its turn (the match clock runs only while the battle is played)
  if (defs.length && !game.decreeSeen && game.state === 'playing' && matchlog.t >= 4.6) {
    game.decreeSeen = true;
    ui.banner('Battle Decrees', decreeNames(defs));
    ui.toast(defs.map((d) => d.text).join(' '), -1, false);
  }
}

// the pause screen lists them in full
export function showPauseDecrees(game) {
  const defs = game.decrees || [];
  let box = document.getElementById('pauseDecrees');
  if (!box) {
    injectCss();
    box = document.createElement('div');
    box.id = 'pauseDecrees';
    const note = document.getElementById('pauseNote');
    note.parentNode.insertBefore(box, note);
  }
  box.textContent = '';
  box.classList.toggle('hidden', !defs.length);
  if (!defs.length) return;
  const h = document.createElement('div');
  h.className = 'pd-h';
  h.textContent = 'Battle Decrees in force';
  box.append(h);
  for (const d of defs) {
    const row = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = d.name;
    row.append(b, ' ' + d.text);
    box.append(row);
  }
}

// ---------------- the end screen: "Next battle" ----------------
const CSS = `
.nb-row { position: relative; text-align: left; padding: 10px 16px 12px; border: 1px solid #8a6a3a; border-radius: 4px; color: var(--ink);
  background: linear-gradient(rgba(255,248,226,0.55), rgba(236,219,176,0.45)); box-shadow: inset 0 0 0 3px rgba(224,180,76,0.16), 0 1px 0 rgba(255,255,255,0.4); }
.nb-row + .nb-row { margin-top: -10px; border-top: 1px dashed rgba(138,106,58,0.65); border-top-left-radius: 0; border-top-right-radius: 0; }
.nb-row:has(+ .nb-row) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.nb-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 8px; }
.nb-ttl { display: flex; align-items: baseline; gap: 10px; }
.nb-title { font: 700 15px Cinzel, Georgia, serif; letter-spacing: 0.14em; text-transform: uppercase; color: #5a1d12; }
.nb-sub { font-size: 13.5px; font-style: italic; opacity: 0.75; }
.nb-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 6px 8px; }
.nb-list li { display: grid; grid-template-columns: 34px minmax(0, 1fr); column-gap: 10px; align-items: center; padding: 5px 10px 5px 8px; border-left: 4px solid #8a6a3a;
  background: rgba(255,255,255,0.3); border-radius: 0 3px 3px 0; animation: nbIn 0.38s ease-out both; animation-delay: calc(var(--i, 0) * 90ms); }
.nb-list li.boon { border-left-color: #3f7a1c; }
.nb-list li.edge { border-left-color: #b8791c; }
.nb-list .ic { grid-row: 1 / 3; font-size: 24px; text-align: center; line-height: 1; }
.nb-list b { font: 700 16px Cinzel, Georgia, serif; color: #3b120b; }
.nb-list .tag { margin-left: 8px; padding: 0 6px 1px; font: 600 10px Cinzel, Georgia, serif; letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid; border-radius: 8px; vertical-align: 2px; }
.nb-list li.boon .tag { color: #2c5a12; } .nb-list li.edge .tag { color: #8a5410; }
.nb-list .tx { font-size: 16px; line-height: 1.25; }
.nb-note { font-size: 15.5px; line-height: 1.3; }
.nb-acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
#gameover .nb-acts button { padding: 6px 14px; font-size: 13.5px; }
#gameover .nb-acts button.quiet { background: none; color: #5a1d12; border: 1px solid rgba(90,29,18,0.5); }
#gameover .nb-acts button.quiet:hover { background: rgba(90,29,18,0.1); border-color: #5a1d12; }
.nb-dice { display: inline-block; margin-right: 6px; }
.nb-key { margin-left: 8px; padding: 0 5px; font: 600 11px 'EB Garamond', Georgia, serif; border: 1px solid rgba(244,230,196,0.5); border-radius: 3px; opacity: 0.8; }
.nb-dice.roll { animation: nbRoll 0.55s ease-in-out; }
@keyframes nbRoll { 0% { transform: rotate(0) scale(1); } 40% { transform: rotate(200deg) scale(1.35); } 100% { transform: rotate(360deg) scale(1); } }
@keyframes nbIn { 0% { opacity: 0; transform: translateX(-10px); } 100% { opacity: 1; transform: none; } }
#decreeLine { margin-top: 2px; font-size: 14px; color: #f2d98a; opacity: 0.95; }
#pauseDecrees { margin: 6px auto 10px; max-width: 520px; padding: 8px 14px; text-align: left; font-size: 15px; line-height: 1.3; border: 1px solid #8a6a3a; border-radius: 4px; background: rgba(255,248,226,0.4); }
#pauseDecrees .pd-h { font: 700 13px Cinzel, Georgia, serif; letter-spacing: 0.12em; text-transform: uppercase; color: #5a1d12; margin-bottom: 3px; }
@media (prefers-reduced-motion: reduce) { .nb-list li, .nb-dice.roll { animation: none; } }
#decreeRow .qlabel { font: 700 14px Cinzel, Georgia, serif; margin-right: 4px; }
#decreeRow .dr-names { font-style: normal; font-weight: 700; color: #3b120b; }
#decreeRow button.small { padding: 5px 12px; font-size: 13px; }
#menu.hero #decreeRow { display: none; }
.card button s.was { opacity: 0.65; font-size: 0.88em; margin-right: 2px; }
.card button.cut b { color: #b9f09a; }
.card button.dear b { color: #ffb48a; }
`;
function injectCss() {
  if (document.getElementById('cw-decrees-css')) return;
  const st = document.createElement('style');
  st.id = 'cw-decrees-css';
  st.textContent = CSS;
  document.head.append(st);
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const button = (label, cls, fn) => { const b = mk('button', cls, label); b.addEventListener('click', fn); return b; };
// the Options screen's switch follows the setting when the end screen changes it
function syncSwitch() {
  const sw = document.getElementById('optDecrees');
  if (!sw) return;
  sw.checked = !!settings.decrees;
  if (sw.nextElementSibling) sw.nextElementSibling.textContent = settings.decrees ? 'On' : 'Off';
}

// (re)draw the panel from the current state; `s` is the match summary. The buttons sit in the head, so the panel stays low.
function paint(el, s) {
  el.cwSummary = s;
  el.textContent = '';
  const guest = s.mode === 'client';
  const ids = guest ? heard : next;
  const used = (s.options && s.options.decrees) || [];
  const head = mk('div', 'nb-head'), title = mk('div', 'nb-ttl'), acts = mk('div', 'nb-acts');
  title.append(mk('span', 'nb-title', 'Next battle'), mk('span', 'nb-sub', 'Battle Decrees'));
  head.append(title, acts);
  el.append(head);
  const note = (text, label, fn) => {
    el.append(mk('div', 'nb-note', text));
    if (label) acts.append(button(label, '', fn));
  };
  if (guest) {
    if (!ids.length) { note('The host picks the next battle\'s Battle Decrees.'); return; }
  } else if (!settings.decrees) {
    note('Battle Decrees are off, so the next battle is a classic one.', 'Turn them on', () => { settings.decrees = 1; saveSettings(); syncSwitch(); setPendingDecrees(rollDecrees(used)); paint(el, s); });
    return;
  } else if (!ids.length) {
    note('A classic battle: no decrees.', 'Roll decrees', () => { setPendingDecrees(rollDecrees(used)); paint(el, s); });
    return;
  }
  const list = mk('ul', 'nb-list');
  ids.map((id) => DECREE_BY_ID[id]).filter(Boolean).forEach((d, i) => {
    const li = mk('li', d.tone);
    li.style.setProperty('--i', i);
    const name = mk('div');
    name.append(mk('b', '', d.name), mk('span', 'tag', d.tone === 'boon' ? 'Boon' : 'Two-edged'));
    li.append(mk('span', 'ic', d.icon), name, mk('div', 'tx', d.text));
    list.append(li);
  });
  el.append(list);
  if (guest) return;
  const roll = button('', '', () => {
    setPendingDecrees(rollDecrees([...next, ...used]));
    if (lastGame && lastGame.audio) lastGame.audio.play('order');   // (a little chime for the roll)
    paint(el, s);
    const dice = el.querySelector('.nb-dice');
    if (dice) dice.classList.add('roll');
  });
  roll.append(mk('span', 'nb-dice', '🎲'), 'Reroll', mk('small', 'nb-key', 'R'));
  roll.title = 'Roll the decrees again (R)';
  acts.append(roll, button('Classic battle', 'quiet', () => { setPendingDecrees([]); paint(el, s); }));
}

// ---------------- the main menu: the same roll, for a match started from the menu (Single Player, or hosting) ----------------
function paintMenuRow() {
  const row = document.getElementById('decreeRow');
  if (!row) return;
  row.textContent = '';
  row.append(mk('span', 'qlabel', 'Next battle'));
  const defs = settings.decrees ? next.map((id) => DECREE_BY_ID[id]).filter(Boolean) : [];
  if (!settings.decrees) { row.append(mk('span', 'mapdesc', 'Battle Decrees are switched off in the Options: every battle is a classic one.')); return; }
  if (!defs.length) {
    row.append(button('Roll decrees', 'small', () => setPendingDecrees(rollDecrees([]))));
    row.append(mk('span', 'mapdesc', 'A classic battle. After every battle one or two random rule changes are rolled for the next; you can reroll them.'));
    return;
  }
  const roll = button('', 'small', () => setPendingDecrees(rollDecrees(next)));
  roll.append(mk('span', 'nb-dice', '🎲'), 'Reroll');
  row.append(roll, button('Classic', 'small', () => setPendingDecrees([])));
  const desc = mk('span', 'mapdesc');
  desc.append(mk('b', 'dr-names', decreeNames(defs)), ' ' + defs.map((d) => d.text).join(' '));
  row.append(desc);
}
function mountMenuRow() {
  const anchor = document.getElementById('difficulty');
  if (!anchor || document.getElementById('decreeRow')) return;
  injectCss();
  const row = mk('div', 'row');
  row.id = 'decreeRow';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Battle Decrees');
  anchor.insertAdjacentElement('afterend', row);
  const sw = document.getElementById('optDecrees');
  if (sw) sw.addEventListener('change', () => setTimeout(paintMenuRow, 0));   // (after the Options screen has saved the setting)
  paintMenuRow();
}
if (typeof document !== 'undefined') mountMenuRow();

// R on the end screen rolls again (the end screen has no other use for it)
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyR' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    const over = document.getElementById('gameover');
    if (!over || over.classList.contains('hidden')) return;
    const roll = over.querySelector('.nb-decrees .nb-acts button:not(.quiet)');
    if (roll && /Reroll/.test(roll.textContent)) { e.preventDefault(); roll.click(); }
  });
}

registerEndSection('decrees', 50, (s) => {
  if (s.hero || s.practice || /\+war/.test(s.map || '')) return null;   // (War Mode has no decrees: game.js)
  injectCss();
  const el = mk('div', 'nb-row nb-decrees');
  paint(el, s);
  return el;
});

// a match is over: roll the next battle's decrees (the host or a single player; a guest is sent them)
onMatchEnd((s) => {
  if (s.hero || s.mode === 'client' || !settings.decrees) return;
  const used = (s.options && s.options.decrees) || [];
  setPendingDecrees(rollDecrees(used), true);
});
