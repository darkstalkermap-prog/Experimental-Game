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
import { previewCanvas } from './cosmetics.js';
import { refreshRenownButton, refreshBadges } from './wardrobe.js';

const CSS = `
.cwe { text-align: left; padding: 8px 13px 10px; border: 1px solid rgba(90,60,20,0.4); border-radius: 5px; background: rgba(255,248,226,0.38); }
.cwe h4 { margin: 0 0 5px; font-size: 12.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #5a1d12; display: flex; justify-content: space-between; align-items: baseline; }
.cwe h4 small { font: italic 13px 'EB Garamond', Georgia, serif; letter-spacing: 0; text-transform: none; color: #4a3a22; }
.cwe-new { font-family: Cinzel, serif; font-size: 22px; font-weight: 700; color: #7a1414; text-align: center; margin: 0 0 7px; animation: cwe-shine 1.6s ease-in-out .6s 2 both, cwe-pop .6s .5s both; text-shadow: 0 1px 0 rgba(255,255,255,0.5); }
.cwe-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 6px; }
.cwe-tile { position: relative; text-align: center; padding: 4px 3px 4px; border: 1px solid rgba(90,60,20,0.3); border-radius: 4px; background: rgba(255,255,255,0.3); }
.cwe-tile b { display: block; font-family: Cinzel, serif; font-size: 22px; line-height: 1.15; }
.cwe-tile span { display: block; font-size: 13px; line-height: 1.15; }
.cwe-tile small { display: block; font-size: 12px; font-style: italic; opacity: 0.75; line-height: 1.2; }
.cwe-tile.rec { border: 2px solid #b8862a; background: linear-gradient(#fff6d2, #efd88f); box-shadow: 0 0 12px rgba(224,180,76,0.75); animation: cwe-pop .6s .35s both; }
.cwe-tile.rec small { color: #7a1414; font-style: normal; font-weight: 600; opacity: 1; }
.cwe-tile.rec::after { content: 'NEW BEST'; position: absolute; top: -8px; right: -5px; font: 700 9.5px/1 Cinzel, serif; letter-spacing: 0.08em; padding: 3px 5px 2px; background: #8c1f24; color: #f6e8c0; border-radius: 2px; transform: rotate(5deg); box-shadow: 0 1px 2px rgba(0,0,0,0.4); }
.cwe-mastery { margin-top: 8px; display: grid; gap: 5px; }
.cwe-mrow { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 1px 10px; align-items: center; }
.cwe-seal { position: relative; grid-row: 1 / span 2; width: 34px; height: 34px; border-radius: 50%; border: 3px solid var(--c, #8a6a3a); background: radial-gradient(#fff6d6, #e6cf94); display: grid; place-items: center; font: 700 14px Cinzel, serif; color: #3a2a12; }
.cwe-seal i { grid-area: 1 / 1; font-style: normal; }
.cwe-seal i.old { animation: cwe-fade 0.3s 1s forwards; }
.cwe-seal i.now { animation: cwe-in 0.4s 1s both; }
.cwe-mrow.up .cwe-seal { animation: cwe-pop .7s 1s both; box-shadow: 0 0 10px rgba(224,180,76,0.9); }
.cwe-mname { font-size: 15px; line-height: 1.2; }
.cwe-mname b { font-family: Cinzel, serif; font-weight: 600; }
.cwe-mname small { margin-left: 8px; opacity: 0.7; font-size: 13px; }
.cwe-mname.up { font-family: Cinzel, serif; font-size: 14.5px; font-weight: 700; color: #7a1414; animation: cwe-pop .6s 1.05s both; }
.cwe-mgain { font-family: Cinzel, serif; font-size: 13px; color: #4a3a22; }
.cwe-bar { position: relative; height: 8px; background: rgba(60,40,15,0.28); border-radius: 4px; overflow: hidden; }
.cwe-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--b, 0%); background: linear-gradient(#e8c25a, #b8862a); border-radius: 4px; animation: cwe-grow 1.1s .5s ease-out both; }
.cwe-bar.up i { animation-name: cwe-fill; animation-duration: 1.9s; }
.cwe-bar.mast i { background: linear-gradient(#8f6bd8, #5a3aa8); }
.cwe-renown .cwe-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 10px; }
.cwe-renown .cwe-gain { font-family: Cinzel, serif; font-size: 26px; font-weight: 700; color: #7a4a0a; }
.cwe-renown .cwe-how { font-size: 13.5px; color: #4a3a22; }
.cwe-renown .cwe-how b { font-weight: 600; }
.cwe-unlock { display: flex; gap: 10px; align-items: center; margin: 6px 0 2px; padding: 6px 10px; border: 2px solid #b8862a; border-radius: 5px; background: linear-gradient(#fff6d2, #efd88f); box-shadow: 0 0 14px rgba(224,180,76,0.8); animation: cwe-pop .7s .95s both; }
.cwe-unlock canvas { flex: none; width: 34px; height: 51px; border-radius: 2px; box-shadow: 0 1px 4px rgba(0,0,0,0.45); }
.cwe-unlock .cwe-ut { font-family: Cinzel, serif; font-size: 16.5px; font-weight: 700; color: #5a1d12; }
.cwe-unlock .cwe-us { font-size: 13.5px; line-height: 1.25; color: #4a3a22; }
.cwe-next { margin-top: 6px; font-size: 16px; display: flex; justify-content: space-between; gap: 10px; }
.cwe-next b { font-family: Cinzel, serif; font-weight: 600; }
.cwe-next small { font-size: 13px; opacity: 0.75; font-style: italic; }
#goStats.cwe-gone { display: none; }
@keyframes cwe-grow { from { width: var(--a, 0%); } to { width: var(--b, 0%); } }
@keyframes cwe-fill { 0% { width: var(--a, 0%); } 48% { width: 100%; } 52% { width: 0%; } 100% { width: var(--b, 0%); } }
@keyframes cwe-pop { 0% { transform: scale(0.88); opacity: 0; } 55% { transform: scale(1.07); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes cwe-shine { 0%, 100% { text-shadow: 0 1px 0 rgba(255,255,255,0.5); } 50% { text-shadow: 0 0 14px rgba(255,200,60,0.95), 0 1px 0 rgba(255,255,255,0.5); } }
@keyframes cwe-fade { to { opacity: 0; } }
@keyframes cwe-in { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .cwe *, .cwe { animation: none !important; } }
`;
function injectCss() {
  if (document.getElementById('cw-endprogress')) return;
  const st = document.createElement('style');
  st.id = 'cw-endprogress';
  st.textContent = CSS;
  document.head.appendChild(st);
}

// the page gives this a way to play a sound (main.js); a new best chimes and an unlock sounds the brass, once, as the news comes up
export const endSound = { play: null };
const cheer = (r, name, when) => { if (!r.cheered || !r.cheered[name]) { (r.cheered || (r.cheered = {}))[name] = true; try { if (endSound.play) endSound.play(name, when); } catch (e) { /* no sound */ } } };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const num = (n) => Math.round(n).toLocaleString('en-US');
const pct = (f) => `${Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10}%`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// a number counting up to its final value in about a second (the final value is what the page keeps if timers stop)
function countUp(node, to, fmt = num, ms = 900) {
  node.textContent = fmt(to);
  if (!(to > 4) || reduced()) return;
  node.textContent = fmt(0);
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    node.textContent = fmt(k >= 1 ? to : Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) setTimeout(step, 34);
  };
  setTimeout(step, 34);
}

// ---------------------------------------------------------------- the match is folded into the account once
onMatchEnd((s) => {
  const gone = document.getElementById('goStats');
  if (gone) gone.classList.remove('cwe-gone');
  if (s.progress || /practice/.test(s.map || '')) return;   // (counted already, or the courtyard: it grants nothing)
  const c = s.counters || {};
  const m = {
    time: s.time, waves: s.waves, kills: s.kills, won: s.won, difficulty: s.difficulty, cls: s.cls, events: s.events,
    stats: { streak: c.streak || 0, dmg: c.dmg || 0, armyKills: s.hero ? 0 : s.armyKills, gold: s.hero ? 0 : s.goldEarned, breaches: c.breaches || 0 },
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
  const c = s.counters || {}, hero = !!s.hero;
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
  const add = (key, label, value, show = num) => {   // `show` says a number the way this tile reads (a clock, a count)
    const t = el('div', 'cwe-tile');
    t.dataset.stat = key || '';
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
  add('kills', 'Kills', s.kills);
  if (c.streak > 0) add('streak', 'Kills in a row', c.streak);
  add('dmg', 'Damage dealt', Math.round(c.dmg || 0));
  add('waves', hero ? 'Rounds' : 'Waves', s.waves);
  if (!hero) { add('armyKills', 'Army kills', s.armyKills); add('gold', 'Gold earned', Math.round(s.goldEarned)); }
  add('', 'Deaths', s.deaths);
  add('time', 'Time', Math.round(s.time), clockText);
  if (c.breaches > 0) add('breaches', 'Gates and walls broken', c.breaches);
  if (c.slain > 0) add('', 'Heroes slain', c.slain);
  if (c.engines > 0) add('', 'Engines destroyed', c.engines);
  if (c.keeps > 0) add('', 'Keeps brought down', c.keeps);
  const fw = r.records.find((x) => x.key === 'fastWin') || r.firsts.find((x) => x.key === 'fastWin');
  if (fw) {
    const t = el('div', 'cwe-tile' + (fw.prev ? ' rec' : ''));
    t.dataset.stat = 'fastWin';
    t.append(el('b', '', clockText(fw.value)), el('span', '', 'Fastest victory'), el('small', '', fw.prev ? `was ${clockText(fw.prev)}` : 'First record'));
    tiles.append(t);
  }
  // the headline row of the screen (the old five numbers) is said here, with the bests: keep what it has beyond that (the hill)
  const old = document.getElementById('goStats');
  if (old && !hero) {
    for (const d of [...old.children]) {
      if (!/on the hill/.test(d.textContent)) continue;
      const t = el('div', 'cwe-tile');
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
