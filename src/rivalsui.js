// The rival lords on the screens: who leads the houses next battle (rolled here, remembered for the lobby, the end screen and the next start), the card that
// introduces them when a match begins, the list in the game menu, the "next battle" row of the end screen, the switch in the Options screen, and the tag next
// to a house in the HUD. The personalities themselves are in rivals.js and ai.js; this file is only what the player sees and chooses.
// The switch ("Named rival lords" in Options, remembered per browser as 'cw-rivals') decides whether the menu rolls rivals at all: off, every house has the
// classic lord. An options object that already names rivals (a test, a future menu) is taken as it is; only an empty one is rolled for.
import { TEAM_CSS, TEAM_NAMES } from './config.js';
import { rivalInfo, rollRivals } from './rivals.js';
import { registerEndSection } from './endscreen.js';
import { clockText } from './matchlog.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- the switch and the roll ----------------
const KEY = 'cw-rivals';
let on = true;
try { on = localStorage.getItem(KEY) !== 'classic'; } catch (e) { /* storage unavailable: named rivals */ }
export const rivalsOn = () => on;
export function setRivalsOn(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? 'named' : 'classic'); } catch (e) { /* ignore */ }
}

let next = null;   // the ids of the next battle, rolled once and shown wherever the next battle is previewed
let last = null;   // the ids of the battle just started, so that no house draws the lord it just had
export function upcomingRivals() {
  if (!next) next = rollRivals(undefined, last);
  return next;
}
export function rerollRivals() {
  next = rollRivals(undefined, last);
  return next;
}
// the ids the online lobby shows in its AI slots (null: named rivals are off)
export const lobbyRivals = () => (on ? upcomingRivals() : null);
// the match options for a start: when nothing is named yet and named rivals are on, the houses that are not led by a person (`humans`: their teams) get the
// rolled lords, and the next roll starts fresh. (A person who leaves an online game is replaced by the plain old lord.)
export function withRivals(o, humans = [0]) {
  if (!on || !o || !Array.isArray(o.rivals) || o.rivals.some((r) => r)) return o;
  last = upcomingRivals();
  next = null;
  return { ...o, rivals: last.map((id, t) => (humans.includes(t) ? '' : id)) };
}

// ---------------- styles ----------------
const css = document.createElement('style');
css.id = 'rivalsCss';
css.textContent = `
  #rivalsCard { position: absolute; right: 16px; top: 150px; width: 330px; padding: 10px 14px 12px; background: var(--panel); border: 1px solid var(--edge);
    border-right: 3px solid var(--gold); border-radius: 4px; opacity: 0; animation: rvcard 13s ease-out forwards; }
  #rivalsCard h3 { margin: 0 0 6px; font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); font-weight: 700; }
  #rivalsCard .rv { display: grid; grid-template-columns: 12px 1fr; gap: 0 9px; margin: 7px 0 0; }
  #rivalsCard .rv i, .rvrow i, .nb-rivals .rv i { width: 10px; height: 10px; border-radius: 2px; margin-top: 5px; display: inline-block; }
  #rivalsCard b { font-family: Cinzel, serif; font-size: 15px; font-weight: 700; color: #f4e6c4; }
  #rivalsCard span { display: block; font-size: 14px; line-height: 1.25; color: #d9c9a2; }
  #rivalsCard small { font-size: 12px; opacity: 0.75; margin-left: 5px; font-family: Cinzel, serif; letter-spacing: 0.04em; }
  @keyframes rvcard { 0% { opacity: 0; transform: translateX(14px); } 5% { opacity: 1; transform: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
  @media (min-width: 1100px) { #factions.has-rivals { width: 420px; } }
  @media (max-width: 1099px) { #factions em.rv { display: none; } #rivalsCard { width: 280px; } }
  #factions em.rv { flex: none; font-style: normal; font-size: 10px; line-height: 13px; color: #e8d9a0; border: 1px solid rgba(232,217,160,0.5); border-radius: 3px;
    padding: 0 3px; margin-left: 6px; letter-spacing: 0.03em; }
  #pauseRivals { margin: 16px auto 4px; max-width: 540px; text-align: left; }
  #pauseRivals h3, .nb-rivals h4 { margin: 0 0 6px; font-size: 15px; letter-spacing: 0.1em; text-transform: uppercase; color: #5a1d12; text-align: center; }
  .rvrow, .nb-rivals .rv { display: grid; grid-template-columns: 12px 1fr; gap: 0 10px; margin: 8px 0; }
  .rvrow b, .nb-rivals .rv b { font-family: Cinzel, serif; font-size: 16px; color: #3b120b; }
  .rvrow em, .nb-rivals .rv em { font-style: normal; font-size: 13px; opacity: 0.7; margin-left: 6px; }
  .rvrow span, .nb-rivals .rv span { display: block; font-size: 15px; line-height: 1.3; }
  .rvrow .plan { font-style: italic; opacity: 0.8; }
  .nb-rivals { background: rgba(255,255,255,0.28); border: 1px solid rgba(138,106,58,0.6); border-radius: 4px; padding: 10px 16px 12px; text-align: left; }
  .nb-rivals .fate { text-align: center; font-size: 14px; font-style: italic; opacity: 0.8; margin: 8px 0 0; }
  .nb-rivals .again { display: block; margin: 8px auto 0; padding: 5px 14px; font-size: 13px; }
  .opt-rivals-note { text-align: center; font-size: 14.5px; opacity: 0.85; margin: 8px 0; }
`;
document.head.appendChild(css);

// ---------------- who is who ----------------
// the personality leading this house, or null (the classic lord, a human house, a mode without rival lords)
export function houseRival(game, f) {
  if (!f || f.isPlayer || game.hero || game.practice) return null;
  return f.rival || rivalInfo(game.options && game.options.rivals && game.options.rivals[f.team]);
}
const rivalFactions = (game) => game.factions.filter((f) => houseRival(game, f));

// the small tag next to a house in the HUD ("House Varr  Reckless"), '' for a house without one
export function rivalTagHtml(game, f) {
  const r = houseRival(game, f);
  return r ? `<em class="rv" title="${esc(r.name)}: ${esc(r.blurb)}">${esc(r.tag)}</em>` : '';
}
// the AI slot in the online lobby: "Lord Varric the Reckless" (or the plain AI lord when no rival is named)
export function lobbyRivalName(team, ids) {
  const r = rivalInfo(ids && ids[team]);
  return r ? r.name : '';
}

// ---------------- the card at the start of a match ----------------
let current = null;   // the game the card and the menu list speak for
export function introduceRivals(game) {
  current = game;
  const old = $('rivalsCard');
  if (old) old.remove();
  const list = rivalFactions(game);
  const hud = $('hud');
  if ($('factions')) $('factions').classList.toggle('has-rivals', list.length > 0);   // (room for the tags)
  if (!list.length || !hud) return;
  const el = document.createElement('div');
  el.id = 'rivalsCard';
  el.innerHTML = '<h3>Your rivals</h3>' + list.map((f) => {
    const r = houseRival(game, f);
    return `<div class="rv"><i style="background:${TEAM_CSS[f.team]}"></i><div><b>${esc(r.name)}</b><small>${esc(TEAM_NAMES[f.team])}</small><span>${esc(r.blurb)}</span></div></div>`;
  }).join('');
  hud.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, 13500);
}

// ---------------- the game menu ----------------
function fillPauseList() {
  const game = current;
  let box = $('pauseRivals');
  const list = game && game.state === 'playing' ? rivalFactions(game) : [];
  if (!list.length) { if (box) box.classList.add('hidden'); return; }
  if (!box) {
    const hint = $('pauseHint');
    const scroll = document.querySelector('#pause .scroll');
    if (!scroll) return;
    box = document.createElement('div');
    box.id = 'pauseRivals';
    scroll.insertBefore(box, hint || null);
  }
  box.classList.remove('hidden');
  box.innerHTML = '<h3>Rival lords</h3>' + list.map((f) => {
    const r = houseRival(game, f);
    return `<div class="rvrow"><i style="background:${TEAM_CSS[f.team]}"></i><div><b>${esc(r.name)}</b><em>${esc(TEAM_NAMES[f.team])} · ${esc(r.kind)}</em>
      <span>${esc(r.blurb)}</span><span class="plan">${esc(r.plan)}</span></div></div>`;
  }).join('');
}
const pauseEl = $('pause');
if (pauseEl) new MutationObserver(() => { if (!pauseEl.classList.contains('hidden')) fillPauseList(); }).observe(pauseEl, { attributes: true, attributeFilter: ['class'] });

// ---------------- the Options screen ----------------
(function installSwitch() {
  const grid = document.querySelector('#options .opt-grid');
  if (!grid || $('optRivals')) return;
  const label = document.createElement('label');
  label.innerHTML = 'Named rival lords <input id="optRivals" type="checkbox"><output></output>';
  grid.appendChild(label);
  const box = label.querySelector('input'), out = label.querySelector('output');
  const show = () => { box.checked = on; out.textContent = on ? 'On' : 'Off'; };
  show();
  box.addEventListener('change', () => { setRivalsOn(box.checked); show(); });
  const note = document.createElement('div');
  note.className = 'opt-rivals-note';
  note.textContent = 'Named rival lords: every battle the other houses are led by lords with a name and a style of their own (a rusher, a turtler, a siege-lover, ...). Off: the old, plain lords. Takes effect at the next battle.';
  grid.after(note);
})();

// ---------------- the end screen: how the rivals fared, and who leads next battle ----------------
function section(summary) {
  if (summary.hero || !on) return null;
  const events = summary.events || [];
  const had = events.filter((e) => e.type === 'rival').map((e) => ({ team: e.team, r: rivalInfo(e.id) })).filter((x) => x.r);
  const el = document.createElement('div');
  el.className = 'nb-row nb-rivals';
  const draw = () => {
    const ids = upcomingRivals();
    // the houses that were led by AI lords this time have an AI lord next time too (the others are people)
    const houses = had.length ? had.map((x) => x.team) : [1, 2, 3];
    const fate = had.map((x) => {
      const ev = events.find((e) => e.type === 'rivalFell' && e.team === x.team);   // (only the host's AI notes the time; a guest can still see the ruin)
      const ruin = current && current.castles[x.team] && current.castles[x.team].fallen;
      return `${x.r.short} ${ev ? 'fell at ' + clockText(ev.t) : ruin ? 'fell' : 'held out'}`;
    }).join(' · ');
    el.innerHTML = `<h4>Rivals next battle</h4>
      ${houses.map((t) => {
        const r = rivalInfo(ids[t]);
        return r ? `<div class="rv"><i style="background:${TEAM_CSS[t]}"></i><div><b>${esc(r.name)}</b><em>${esc(TEAM_NAMES[t])}</em><span>${esc(r.blurb)}</span></div></div>` : '';
      }).join('')}
      <button class="again" type="button">Draw other lords</button>
      ${fate ? `<div class="fate">This battle: ${esc(fate)}.</div>` : ''}`;
    el.querySelector('.again').addEventListener('click', () => { rerollRivals(); draw(); });
  };
  draw();
  return el;
}
registerEndSection('rivals', 55, section);
