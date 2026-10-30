// What the end screen says about progress, in two sections (see endscreen.js): "Your battle" (order 30: the numbers of the match, each with the personal best
// beside it, "New best: 47 kills!" when one falls, and the mastery of the class played rising) and "Renown" (order 40: what the match earned, the bar towards
// the next unlock, and the unlock itself when it is crossed). The match is folded into the account ONCE, when it ends (onMatchEnd); the practice courtyard
// grants nothing, and a match that is left or reloaded before it ends grants nothing either. Nothing here can block the buttons: the animations are
// CSS and short, and the finished picture is what the page holds from the start.
import { registerEndSection, onMatchEnd } from './endscreen.js';
import { clockText } from './matchlog.js';
import { loadAccount, saveAccount, applyMatch, BEST_BY_KEY } from './progress.js';
import { ITEM_BY_KEY, itemTitle } from './unlocks.js';
import { CLASSES } from './classes.js';
import { STAT_KEYS, LOG_NAME } from './stats.js';
import { previewCanvas } from './cosmetics.js';
import { refreshRenownButton, refreshBadges } from './wardrobe.js';

const CSS = `
.cwe { text-align: left; padding: 7px 13px 9px; border: 1px solid rgba(90,60,20,0.4); border-radius: 5px; background: rgba(255,248,226,0.38); }
.cwe h4 { margin: 0 0 4px; font-size: 12.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #5a1d12; display: flex; justify-content: space-between; align-items: baseline; }
.cwe h4 small { font: italic 13px 'EB Garamond', Georgia, serif; letter-spacing: 0; text-transform: none; color: #4a3a22; }
.cwe-new { font-family: Cinzel, serif; font-size: 21px; font-weight: 700; color: #7a1414; text-align: center; margin: 0 0 6px; text-shadow: 0 1px 0 rgba(255,255,255,0.5); }
.cwe-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(74px, 1fr)); gap: 5px; }
.cwe-tile { position: relative; text-align: center; padding: 3px 2px 3px; border: 1px solid rgba(90,60,20,0.3); border-radius: 4px; background: rgba(255,255,255,0.3); min-width: 0; }
.cwe-tile b { display: block; font-family: Cinzel, serif; font-size: 19px; line-height: 1.15; white-space: nowrap; }
.cwe-tile span { display: block; font-size: 12.5px; line-height: 1.15; white-space: nowrap; }
.cwe-tile small { display: block; font-size: 11.5px; font-style: italic; opacity: 0.75; line-height: 1.2; white-space: nowrap; }
.cwe-tile.rec { border: 2px solid #b8862a; background: linear-gradient(#fff6d2, #efd88f); box-shadow: 0 0 12px rgba(224,180,76,0.75); }
.cwe-tile.rec small { color: #7a1414; font-style: normal; font-weight: 600; opacity: 1; }
.cwe-tile.rec::after { content: 'NEW BEST'; position: absolute; top: -8px; right: -5px; font: 700 9px/1 Cinzel, serif; letter-spacing: 0.06em; padding: 3px 4px 2px; background: #8c1f24; color: #f6e8c0; border-radius: 2px; transform: rotate(5deg); box-shadow: 0 1px 2px rgba(0,0,0,0.4); }
.cwe-mastery { margin-top: 7px; display: grid; gap: 4px; }
.cwe-mrow { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 1px 10px; align-items: center; }
.cwe-seal { position: relative; grid-row: 1 / span 2; width: 32px; height: 32px; border-radius: 50%; border: 3px solid var(--c, #8a6a3a); background: radial-gradient(#fff6d6, #e6cf94); display: grid; place-items: center; font: 700 13px Cinzel, serif; color: #3a2a12; }
.cwe-seal i { grid-area: 1 / 1; font-style: normal; }
.cwe-mrow.up .cwe-seal { box-shadow: 0 0 10px rgba(224,180,76,0.9); }
.cwe-seal i.old { opacity: 0; }
.cwe-mname { font-size: 15px; line-height: 1.2; }
.cwe-mname b { font-family: Cinzel, serif; font-weight: 600; }
.cwe-mname small { margin-left: 8px; opacity: 0.7; font-size: 13px; }
.cwe-mname.up { font-family: Cinzel, serif; font-size: 14.5px; font-weight: 700; color: #7a1414; }
.cwe-mgain { font-family: Cinzel, serif; font-size: 13px; color: #4a3a22; }
.cwe-bar { position: relative; height: 8px; background: rgba(60,40,15,0.28); border-radius: 4px; overflow: hidden; }
.cwe-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--b, 0%); background: linear-gradient(#e8c25a, #b8862a); border-radius: 4px; }
.cwe-bar.mast i { background: linear-gradient(#8f6bd8, #5a3aa8); }
.cwe-renown .cwe-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 10px; }
.cwe-renown .cwe-gain { font-family: Cinzel, serif; font-size: 25px; font-weight: 700; color: #7a4a0a; }
.cwe-renown .cwe-how { font-size: 13.5px; color: #4a3a22; }
.cwe-renown .cwe-how b { font-weight: 600; }
.cwe-unlock { display: flex; gap: 10px; align-items: center; margin: 5px 0 2px; padding: 5px 10px; border: 2px solid #b8862a; border-radius: 5px; background: linear-gradient(#fff6d2, #efd88f); box-shadow: 0 0 14px rgba(224,180,76,0.8); }
.cwe-unlock canvas { flex: none; width: 30px; height: 45px; border-radius: 2px; box-shadow: 0 1px 4px rgba(0,0,0,0.45); }
.cwe-unlock .cwe-ut { font-family: Cinzel, serif; font-size: 16px; font-weight: 700; color: #5a1d12; }
.cwe-unlock .cwe-us { font-size: 13.5px; line-height: 1.22; color: #4a3a22; }
.cwe-next { margin-top: 5px; font-size: 16px; display: flex; justify-content: space-between; gap: 10px; }
.cwe-next b { font-family: Cinzel, serif; font-weight: 600; }
.cwe-next small { font-size: 13px; opacity: 0.75; font-style: italic; }
#goStats.cwe-gone { display: none; }
/* the flourishes begin when the card is shown: while the ending show runs, finale.js keeps #gameover see-through (class finale-wait), and the page holds the finished picture */
#gameover:not(.finale-wait) .cwe-new { animation: cwe-shine 1.6s ease-in-out .6s 2 both, cwe-pop .6s .5s both; }
#gameover:not(.finale-wait) .cwe-tile.rec { animation: cwe-pop .6s .35s both; }
#gameover:not(.finale-wait) .cwe-seal i.old { opacity: 1; animation: cwe-fade 0.3s 1s forwards; }
#gameover:not(.finale-wait) .cwe-seal i.now { animation: cwe-in 0.4s 1s both; }
#gameover:not(.finale-wait) .cwe-mrow.up .cwe-seal { animation: cwe-pop .7s 1s both; }
#gameover:not(.finale-wait) .cwe-mname.up { animation: cwe-pop .6s 1.05s both; }
#gameover:not(.finale-wait) .cwe-bar i { animation: cwe-grow 1.1s .5s ease-out both; }
#gameover:not(.finale-wait) .cwe-bar.up i { animation: cwe-fill 1.9s .5s ease-out both; }
#gameover:not(.finale-wait) .cwe-unlock { animation: cwe-pop .7s .95s both; }
@keyframes cwe-grow { from { width: var(--a, 0%); } to { width: var(--b, 0%); } }
@keyframes cwe-fill { 0% { width: var(--a, 0%); } 48% { width: 100%; } 52% { width: 0%; } 100% { width: var(--b, 0%); } }
@keyframes cwe-pop { 0% { transform: scale(0.88); opacity: 0; } 55% { transform: scale(1.07); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes cwe-shine { 0%, 100% { text-shadow: 0 1px 0 rgba(255,255,255,0.5); } 50% { text-shadow: 0 0 14px rgba(255,200,60,0.95), 0 1px 0 rgba(255,255,255,0.5); } }
@keyframes cwe-fade { to { opacity: 0; } }
@keyframes cwe-in { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { #gameover .cwe *, #gameover .cwe { animation: none !important; } }
`;
function injectCss() {
  if (document.getElementById('cw-endprogress')) return;
  const st = document.createElement('style');
  st.id = 'cw-endprogress';
  st.textContent = CSS;
  document.head.appendChild(st);
}

// The ending show (finale.js) builds the end screen at once but keeps it see-through until it is over: what is meant to be SEEN come up (the count-ups,
// the sounds) waits for that, and the CSS animations above wait for it too (#gameover.finale-wait). With no show the card is shown at once.
function whenShown(fn) {
  const go = document.getElementById('gameover');
  if (!go || !go.classList.contains('finale-wait')) { fn(); return; }
  const watch = new MutationObserver(() => { if (!go.classList.contains('finale-wait')) { watch.disconnect(); fn(); } });
  watch.observe(go, { attributes: true, attributeFilter: ['class'] });
}

// the page gives this a way to play a sound (main.js); a new best chimes and an unlock sounds the brass, once, as the card comes up
export const endSound = { play: null };
const cheer = (r, name, when) => {
  if (r.cheered && r.cheered[name]) return;
  (r.cheered || (r.cheered = {}))[name] = true;
  whenShown(() => { try { if (endSound.play) endSound.play(name, when); } catch (e) { /* no sound */ } });
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const num = (n) => Math.round(n).toLocaleString('en-US');
const pct = (f) => `${Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10}%`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// a number counting up to its final value in about a second (the final value is what the page keeps if timers stop)
function countUp(node, to, fmt = num, ms = 900) {
  node.textContent = fmt(to);
  if (!(to > 4) || reduced()) return;
  whenShown(() => {
    node.textContent = fmt(0);
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      node.textContent = fmt(k >= 1 ? to : Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) setTimeout(step, 34);
    };
    setTimeout(step, 34);
  });
}

// what the hero on this screen did, from the counters of the match log (stats.js): { dmg, streak, slain, breaches, engines, keeps }
const herosCounters = (s) => {
  const c = s.counters || {}, out = {};
  for (const k of STAT_KEYS) out[k] = c[LOG_NAME[k]] || 0;
  return out;
};

// ---------------------------------------------------------------- the match is folded into the account once
onMatchEnd((s) => {
  const gone = document.getElementById('goStats');
  if (gone) gone.classList.remove('cwe-gone');
  if (s.progress || /practice/.test(s.map || '')) return;   // (counted already, or the courtyard: it grants nothing)
  const c = herosCounters(s);
  const m = {
    time: s.time, waves: s.waves, kills: s.kills, won: s.won, difficulty: s.difficulty, cls: s.cls, events: s.events,
    stats: { streak: c.streak, dmg: c.dmg, armyKills: s.hero ? 0 : s.armyKills, gold: s.hero ? 0 : s.goldEarned, breaches: c.breaches },
  };
  const { account, result } = applyMatch(loadAccount(), m);
  result.saved = saveAccount(account);
  result.total = account.renown;
  s.progress = result;
  try { refreshRenownButton(); refreshBadges(); } catch (e) { /* the menu is not on this page */ }   // (the menu behind the end screen says the new numbers)
});

// ---------------------------------------------------------------- Your battle (30)
const PRIORITY = ['kills', 'streak', 'dmg', 'waves', 'fastWin', 'time', 'armyKills', 'gold', 'breaches'];
function recordText(r, hero) {
  const v = num(r.value);
  switch (r.key) {
    case 'kills': return `New best: ${v} kills!`;
    case 'streak': return `New best streak: ${v} in a row!`;
    case 'dmg': return `New best: ${v} damage dealt!`;
    case 'waves': return `New best: ${v} ${hero ? 'rounds' : 'waves'}!`;
    case 'armyKills': return `New best: your army cut down ${v}!`;
    case 'gold': return `New best: ${v} gold earned!`;
    case 'breaches': return `New best: ${v} gates and walls broken!`;
    case 'fastWin': return `Fastest victory yet: ${clockText(r.value)}!`;
    case 'time': return `Longest battle yet: ${clockText(r.value)}!`;
    default: return `New best: ${v}!`;
  }
}

function battleSection(s) {
  const r = s.progress;
  if (!r) return null;
  const c = herosCounters(s), hero = !!s.hero;
  const box = el('div', 'cwe cwe-battle');
  const h = el('h4', '', 'Your battle');
  box.append(h);
  const cls = CLASSES[s.cls];
  const sub = el('small', '', cls ? `${cls.name}, level ${s.level}` : '');
  h.append(sub);
  // the records that fell, the biggest first
  const recs = [...r.records].sort((a, b) => PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key));
  if (recs.length) {
    cheer(r, 'chime', 0.8);
    box.append(el('div', 'cwe-new', recordText(recs[0], hero)));   // (the others are the tiles with a ribbon)
  }
  // the numbers, each with its best beside it
  const tiles = el('div', 'cwe-tiles');
  const recKeys = new Map(r.records.map((x) => [x.key, x])), firstKeys = new Set(r.firsts.map((x) => x.key));
  const add = (key, label, value, show = num, title = '') => {   // `show` says a number the way this tile reads (a clock, a count)
    const t = el('div', 'cwe-tile');
    t.dataset.stat = key || '';
    t.title = title || label;
    const b = el('b'); const sp = el('span', '', label);
    t.append(b, sp);
    countUp(b, value, show);
    if (key && BEST_BY_KEY[key]) {
      const rec = recKeys.get(key);
      const small = el('small');
      if (rec) { t.classList.add('rec'); small.textContent = `was ${show(rec.prev)}`; }
      else if (firstKeys.has(key)) small.textContent = 'First record';
      else small.textContent = `Best ${show(r.best[key])}`;
      t.append(small);
    }
    tiles.append(t);
  };
  add('kills', 'Kills', s.kills, num, 'Your kills');
  if (c.streak > 0) add('streak', 'Streak', c.streak, num, 'Most kills in a row without falling');
  add('dmg', 'Damage', Math.round(c.dmg), num, 'Damage you dealt to foes');
  add('waves', hero ? 'Rounds' : 'Waves', s.waves, num, hero ? 'Rounds fought' : 'Waves that marched');
  if (!hero) { add('armyKills', 'Army', s.armyKills, num, 'Kills by your army'); add('gold', 'Gold', Math.round(s.goldEarned), num, 'Gold earned'); }
  add('', 'Deaths', s.deaths, num, 'Times you fell');
  add('time', 'Time', Math.round(s.time), clockText, 'Time fought (your longest is the best)');
  if (c.breaches > 0) add('breaches', 'Breaches', c.breaches, num, 'Gates and walls you broke');
  if (c.slain > 0) add('', 'Heroes', c.slain, num, 'Enemy heroes you slew');
  if (c.engines > 0) add('', 'Engines', c.engines, num, 'Siege engines you destroyed');
  if (c.keeps > 0) add('', 'Keeps', c.keeps, num, 'Keeps you brought down');
  const fw = r.records.find((x) => x.key === 'fastWin') || r.firsts.find((x) => x.key === 'fastWin');
  if (fw) {
    const t = el('div', 'cwe-tile' + (fw.prev ? ' rec' : ''));
    t.dataset.stat = 'fastWin';
    t.title = 'Fastest victory';
    t.append(el('b', '', clockText(fw.value)), el('span', '', 'Fast win'), el('small', '', fw.prev ? `was ${clockText(fw.prev)}` : 'First record'));
    tiles.append(t);
  }
  // the headline row of the screen (the old five numbers) is said here, with the bests: keep what it has beyond that (the hill)
  const old = document.getElementById('goStats');
  if (old && !hero) {
    for (const d of [...old.children]) {
      if (!/on the hill/.test(d.textContent)) continue;
      const t = el('div', 'cwe-tile');
      t.title = 'Time on the hill';
      t.append(el('b', '', d.querySelector('b').textContent), el('span', '', 'On the hill'));
      tiles.append(t);
    }
    old.classList.add('cwe-gone');
  }
  box.append(tiles);
  // mastery of the class(es) played
  if (r.mastery.length) {
    const wrap = el('div', 'cwe-mastery');
    for (const m of r.mastery) {
      const C = CLASSES[m.cls] || {};
      const row = el('div', 'cwe-mrow' + (m.rankUp ? ' up' : ''));
      row.style.setProperty('--c', C.color || '#8a6a3a');
      const seal = el('div', 'cwe-seal');
      if (m.rankUp) seal.append(el('i', 'old', m.before.roman), el('i', 'now', m.after.roman));
      else seal.append(el('i', '', m.after.roman));
      seal.title = `${C.name} mastery, rank ${m.after.rank} of 10`;
      const name = el('div', 'cwe-mname' + (m.rankUp ? ' up' : ''));
      if (m.rankUp) name.textContent = `${C.name || m.cls} rank ${m.before.roman} → ${m.after.roman}: ${m.after.name}!`;
      else name.append(el('b', '', `${C.name || m.cls}`), ` · ${m.after.name}`, el('small', '', m.after.max ? 'the highest rank' : `${num(m.after.into)} / ${num(m.after.span)}`));
      const gain = el('div', 'cwe-mgain', `+${num(m.gained)} mastery`);
      const bar = el('div', 'cwe-bar mast' + (m.rankUp ? ' up' : ''));
      const fill = el('i');
      fill.style.setProperty('--a', pct(m.before.frac));
      fill.style.setProperty('--b', pct(m.after.max ? 1 : m.after.frac));
      bar.append(fill);
      row.append(seal, name, gain);
      row.append(bar);
      bar.style.gridColumn = '2 / -1';
      wrap.append(row);
    }
    box.append(wrap);
  }
  return box;
}

// ---------------------------------------------------------------- Renown (40)
function renownSection(s) {
  const r = s.progress;
  if (!r) return null;
  const box = el('div', 'cwe cwe-renown');
  const head = el('div', 'cwe-head');
  const gain = el('span', 'cwe-gain');
  countUp(gain, r.gained, (n) => `+${num(n)}`);
  head.append(gain, el('span', 'cwe-how', 'Renown'));
  const how = el('span', 'cwe-how');
  how.style.opacity = '0.9';
  how.append(...r.parts.flatMap((p, i) => [i ? ' · ' : '', `${p.label} `, el('b', '', String(p.amount))]));
  if (r.mult !== 1) how.append(` · × ${r.mult} (${s.difficulty})`);
  head.append(how);
  box.append(head);
  // the unlocks this match crossed
  if (r.crossed.length) cheer(r, 'streak', 1.1);
  for (const key of r.crossed) {
    const it = ITEM_BY_KEY[key];
    if (!it) continue;
    const card = el('div', 'cwe-unlock');
    card.dataset.unlock = key;
    card.append(previewCanvas(it, 68, 102, s.team || 0));
    const names = Object.fromEntries(Object.entries(CLASSES).map(([id, c]) => [id, c.name]));
    const t = el('div');
    t.append(el('div', 'cwe-ut', `Unlocked: ${itemTitle(it, names)}`));
    const on = r.worn.includes(key);
    t.append(el('div', 'cwe-us', it.kind === 'capstone'
      ? `${it.def.desc} Choose it in place of the old capstone in the talent panel (N, or B then Talents).`
      : `${it.blurb} ${on ? (it.kind === 'banner' ? 'It flies over your castle from the next battle.' : 'You wear it from the next battle.') : 'Wear it from the Renown button on the main menu.'}`));
    card.append(t);
    box.append(card);
  }
  // the bar towards the next one
  const next = r.after.next ? ITEM_BY_KEY[r.after.next] : null;
  const bar = el('div', 'cwe-bar' + (r.crossed.length ? ' up' : ''));
  bar.style.marginTop = '8px';
  const fill = el('i');
  const beforeNext = r.before.next ? ITEM_BY_KEY[r.before.next] : null;
  const a = r.crossed.length ? (beforeNext ? r.before.carry / beforeNext.cost : 1) : (next ? r.before.carry / next.cost : 1);
  fill.style.setProperty('--a', pct(a));
  fill.style.setProperty('--b', pct(next ? r.after.carry / next.cost : 1));
  bar.append(fill);
  box.append(bar);
  const line = el('div', 'cwe-next');
  const names = Object.fromEntries(Object.entries(CLASSES).map(([id, c]) => [id, c.name]));
  if (next) {
    const left = el('span');
    left.append(el('b', '', `${num(r.after.carry)} / ${num(next.cost)}`), ` to unlock the ${itemTitle(next, names)}`);
    line.append(left);
  } else line.append(el('span', '', 'Every unlock is yours. Renown keeps counting.'));
  line.append(el('small', '', `Renown in all: ${num(r.total)}${r.saved ? '' : '  (this browser keeps nothing)'}`));
  box.append(line);
  return box;
}

injectCss();
registerEndSection('battle', 30, battleSection);
registerEndSection('renown', 40, renownSection);
