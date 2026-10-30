// War Mode on screen: the menu and lobby rows, the army panel of the build phase (the War Mode shop, Repeat last army, the formation, the battle plan,
// Ready), the bar across the top (the countdown, then every side's soldiers), the command bar of the fight (1 / 2 / 3 / 4 choose a group, F1 to F4, T
// and G or a click give it an order, F or a click its formation; the chosen soldiers are marked in the world: warmarks.js), the cameras (the view over your army while the panel is open; the view over the battle once your hero has fallen) and the
// end screen's section. N opens the Talents panel (the shop with only its Talents tab, as in Hero Mode). The rules are in warmode.js; this file only
// shows them and passes on clicks.
import { WAR, TEAM_CSS, UNIT_TYPES, clock } from './config.js';
import { pressReady, readyView, offerFor } from './flow.js';
import { registerEndSection, onMatchEnd } from './endscreen.js';
import { warMarks, aimGround } from './warmarks.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPES = Object.keys(WAR.units);
const GROUPS = [['inf', 'Infantry'], ['arch', 'Archers'], ['cav', 'Cavalry']];
// the command bar: the groups (key, id, name) and the orders (key, id); the order names are WAR.orders'
const BAR_GROUPS = [['1', 'inf', 'Infantry'], ['2', 'arch', 'Archers'], ['3', 'cav', 'Cavalry'], ['4', 'all', 'Everyone']];
// (Bannerlord's order: F1 move here, F2 follow me, F3 charge, F4 hold; a step forward or back on T and G, above and below each other)
const BAR_ORDERS = [['F1', 'move', 'F1'], ['F2', 'follow', 'F2'], ['F3', 'charge', 'F3'], ['F4', 'hold', 'F4'], ['T', 'forward', 'KeyT'], ['G', 'back', 'KeyG']];
const FORMS = Object.keys(WAR.formations);
const PLAN_ORDERS = Object.keys(WAR.orders).filter((k) => WAR.orders[k].plan);
const GROUP_NAME = { inf: 'Infantry', arch: 'Archers', cav: 'Cavalry', all: 'Everyone' };
const groupOfUnit = (u) => (u.isGiant ? 'inf' : UNIT_TYPES[u.type].kind === 'archer' ? 'arch' : UNIT_TYPES[u.type].kind === 'cavalry' ? 'cav' : 'inf');
// the army each lord led last time, per format (Repeat last army): { counts: { type: n }, preset, plan }
const lastKey = (fmt) => 'cw-warlast-' + fmt;
function loadLast(fmt) {
  try {
    const o = JSON.parse(localStorage.getItem(lastKey(fmt)) || 'null');
    return o && typeof o === 'object' && o.counts && typeof o.counts === 'object' ? o : null;
  } catch (e) { return null; }
}
// "120 footmen", "1 giant", "12 cavalry"
const plural = (n, name) => `${n} ${(n === 1 || name === 'Cavalry' ? name : name.endsWith('man') ? name.slice(0, -3) + 'men' : name + 's').toLowerCase()}`;
function saveLast(fmt, o) {
  try { localStorage.setItem(lastKey(fmt), JSON.stringify(o)); } catch (e) { /* storage unavailable */ }
}
const COLOR_NAMES = ['Blue', 'Red', 'Green', 'Gold'];

export const WAR_DESC = `No castles: each army musters on a hill of its own, and the battle is fought in the field between. You have ${clock(WAR.buildTime)} (the timer) to buy an army with ${WAR.gold} gold and set it out (Ready starts the battle sooner), then the armies fight to the last man. Your hero fights too.`;

// ---------------- styles (once) ----------------
const CSS = `
#hud.war #factions, #hud.war #top, #hud.war #goldbox, #hud.war #army, #hud.war #clsHint, #hud.war #hill, #hud.war #hint, #hud.war #command, #hud.war #respawn { display: none !important; }
body.war-on #scoreboard { display: none !important; }
body.war-on #toasts { bottom: 196px; }   /* (above the command bar) */
#warTop { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; pointer-events: none; text-align: center; min-width: 340px; max-width: calc(100% - 420px); }
#warTop .wt-main { display: inline-flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap; }
#warTop .wt-clock { font-family: Cinzel, Georgia, serif; font-size: 22px; color: var(--gold); letter-spacing: 0.05em; }
#warTop .wt-clock small { font-size: 14px; color: var(--parch); opacity: 0.8; display: block; letter-spacing: 0.08em; text-transform: uppercase; }
#warTop .wt-side { display: inline-flex; flex-direction: column; align-items: stretch; min-width: 92px; font-size: 14px; }
#warTop .wt-side b { font-family: Cinzel, Georgia, serif; font-size: 14px; white-space: nowrap; }
#warTop .wt-side.out { opacity: 0.4; text-decoration: line-through; }
#warTop .wt-bar { height: 5px; background: rgba(255,255,255,0.12); border-radius: 3px; margin-top: 3px; overflow: hidden; }
#warTop .wt-bar i { display: block; height: 100%; }
#warTop .wt-line { margin-top: 5px; font-size: 14px; }
#warTop .wt-line kbd, #warPanel kbd { font-family: inherit; font-size: 14px; border: 1px solid var(--edge); border-radius: 3px; padding: 0 4px; background: rgba(0,0,0,0.35); }
#warTop .wt-fallen { color: #ff9a80; font-family: Cinzel, Georgia, serif; }
#warPanel { position: fixed; top: 10px; right: 10px; bottom: 10px; width: 400px; max-width: calc(100% - 20px); z-index: 7; display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--edge); border-radius: 6px; box-shadow: 0 8px 40px rgba(0,0,0,0.55); color: var(--parch); font-size: 14px; }
#warPanel header { padding: 12px 14px 8px; border-bottom: 1px solid var(--edge); }
#warPanel h3 { margin: 0; font-size: 19px; letter-spacing: 0.06em; color: var(--gold); display: flex; justify-content: space-between; align-items: baseline; }
#warPanel h3 span { font-size: 24px; color: var(--parch); }
#warPanel .wp-sub { margin-top: 3px; font-size: 13px; opacity: 0.85; line-height: 1.3; }
#warPanel .wp-stat { display: flex; justify-content: space-between; margin-top: 7px; font-family: Cinzel, Georgia, serif; font-size: 15px; }
#warPanel .wp-stat .coin { color: var(--gold); }
#warPanel .wp-body { flex: 1; overflow-y: auto; padding: 6px 14px 10px; }
#warPanel h4 { margin: 10px 0 5px; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); opacity: 0.9; }
#warPanel .wp-unit { display: grid; grid-template-columns: 1fr auto auto; gap: 2px 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(224,180,76,0.15); }
#warPanel .wp-unit .nm { font-family: Cinzel, Georgia, serif; font-size: 14px; }
#warPanel .wp-unit .nm small { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; opacity: 0.7; margin-left: 4px; }
#warPanel .wp-unit .ct { font-variant-numeric: tabular-nums; min-width: 62px; text-align: right; }
#warPanel .wp-unit .ct.full { color: var(--gold); }
#warPanel .wp-unit .bt { display: flex; gap: 3px; }
#warPanel .wp-unit .ds { grid-column: 1 / -1; font-size: 12px; opacity: 0.65; line-height: 1.2; }
#warPanel button { padding: 3px 7px; font-size: 12px; min-width: 32px; }
#warPanel .wp-row { display: flex; gap: 5px; flex-wrap: wrap; }
#warPanel .wp-row button { flex: 1; padding: 6px 6px; }
#warPanel .wp-plan { display: grid; grid-template-columns: 66px repeat(4, 1fr); gap: 4px; align-items: center; margin-bottom: 4px; }
#warPanel .wp-plan button { padding: 5px 4px; }
#warPanel .wp-note { font-size: 12.5px; opacity: 0.8; margin-top: 5px; line-height: 1.3; }
#warPanel footer { padding: 10px 14px 12px; border-top: 1px solid var(--edge); display: flex; gap: 8px; align-items: center; }
#warPanel footer button { padding: 9px 12px; font-size: 14px; }
#warPanel footer #wpReady { flex: 1; font-size: 16px; }
#warPanel footer .rd { font-size: 12px; opacity: 0.8; }
#warFormat, #lobbyWarFormat { align-items: center; gap: 6px; }
#warFormat button, #lobbyWarFormat button { padding: 6px 10px; font-size: 13px; }
#hud.warpanel #crosshair, #hud.warpanel #dirs, #hud.warpanel #minimapWrap, #hud.warpanel #drawbar, #hud.warpanel #talentHint { display: none !important; }
#shop.waronly .tabs, #shop.waronly .stat { display: none; }
#warPanel h4 .wp-rep { float: right; text-transform: none; letter-spacing: 0.02em; font-size: 12px; padding: 2px 8px; margin-top: -3px; min-width: 0; }
/* (the bar sits centred in the gap between the hero panel, 16 + 324 px, and the minimap, 16 + 188 px, all in the HUD's zoomed pixels, and its rows wrap
   when the window is too narrow for them at this UI scale: it never covers either) */
#warCmd { position: fixed; left: 348px; right: 214px; bottom: 14px; width: fit-content; margin: 0 auto; z-index: 6; display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 7px 9px; background: var(--panel); border: 1px solid var(--edge); border-radius: 6px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); color: var(--parch); }
#warCmd .wc-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; align-items: stretch; }
#warCmd button { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 96px; padding: 4px 9px 5px; font-size: 14px; line-height: 1.15;
  font-family: Cinzel, Georgia, serif; letter-spacing: 0.03em; }
#warCmd button kbd { font-family: inherit; font-size: 14px; border: 1px solid var(--edge); border-radius: 3px; padding: 0 4px; background: rgba(0,0,0,0.35); margin-right: 5px; }
#warCmd button small { font-family: 'EB Garamond', Georgia, serif; font-size: 14px; opacity: 0.85; letter-spacing: 0; }
#warCmd button.sel { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset, 0 0 12px rgba(224,180,76,0.35); color: #fff; }
#warCmd button.on { background: linear-gradient(rgba(224,180,76,0.34), rgba(224,180,76,0.12)); border-color: var(--gold); color: #fff; }
#warCmd button.none { opacity: 0.45; }
#warCmd .wc-orders, #warCmd .wc-forms { border-top: 1px solid rgba(224,180,76,0.25); padding-top: 5px; }
#warCmd .wc-orders button { min-width: 0; padding: 4px 7px 5px; font-size: 14px; white-space: nowrap; }
#warCmd .wc-forms button { min-width: 0; padding: 3px 10px; font-size: 14px; white-space: nowrap; }
#warCmd .wc-label kbd { font-family: inherit; font-size: 14px; border: 1px solid var(--edge); border-radius: 3px; padding: 0 4px; background: rgba(0,0,0,0.35); }
#warCmd .wc-label { align-self: center; font-family: Cinzel, Georgia, serif; font-size: 14px; color: var(--gold); text-align: right; padding-right: 4px; white-space: nowrap; }
#warCmd .wc-hint { font-size: 14px; opacity: 0.8; text-align: center; }
#warCmd .wc-hint kbd { font-family: inherit; font-size: 14px; border: 1px solid var(--edge); border-radius: 3px; padding: 0 4px; background: rgba(0,0,0,0.35); }
@media (max-width: 760px) { #warCmd button { min-width: 64px; font-size: 12px; padding: 3px 5px; } #warCmd .wc-label { display: none; } }
.go-war { margin: 10px auto 4px; max-width: 620px; }
.go-war table { width: 100%; border-collapse: collapse; font-size: 15px; }
.go-war th { font-family: Cinzel, Georgia, serif; font-size: 12px; text-align: left; opacity: 0.75; padding: 3px 6px; }
.go-war td { padding: 4px 6px; border-top: 1px solid rgba(120,80,30,0.3); }
.go-war tr.mine td { font-weight: 600; }
.go-war .note { text-align: center; font-size: 13px; opacity: 0.8; margin-top: 6px; }
`;
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.append(s);
}

// ---------------- the menu and the lobby ----------------
let format = 'ffa';
try { const f = localStorage.getItem('cw-warformat'); if (f && Object.prototype.hasOwnProperty.call(WAR.formats, f)) format = f; } catch (e) { /* storage unavailable */ }
export const warSetup = () => ({ format });

function formatRow(id, host) {
  const row = document.createElement('div');
  row.className = 'row hidden';
  row.id = id;
  row.setAttribute('role', 'group');
  row.innerHTML = `<span class="qlabel">Armies</span>${Object.entries(WAR.formats).map(([k, f]) => `<button data-wf="${k}" title="${esc(f.desc)}">${esc(f.name)}</button>`).join('')}`;
  row.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-wf]');
    if (!b || !host()) return;
    format = b.dataset.wf;
    try { localStorage.setItem('cw-warformat', format); } catch (err) { /* ignore */ }
    showFormat();
    if (onFormat) onFormat();
  });
  return row;
}
let onFormat = null;
function showFormat() {
  document.querySelectorAll('#warFormat button, #lobbyWarFormat button').forEach((b) => b.classList.toggle('active', b.dataset.wf === format));
}

// The War Mode button of the menu's Mode row and of the lobby's, and the row that chooses how the armies are set against each other. Called by main.js before
// it wires the Mode buttons (so the new one is wired with them).
// changed(): the host's lobby is sent again when the row changes.
export function initWarMenu(changed) {
  style();
  onFormat = changed;
  const mk = (rowId) => {
    const row = $(rowId);
    if (!row || row.querySelector('[data-o="war"]')) return;
    const b = document.createElement('button');
    b.dataset.o = 'war';
    b.textContent = 'War Mode';
    b.title = WAR_DESC;
    const desc = row.querySelector('.mapdesc');
    row.insertBefore(b, desc || null);
  };
  mk('objective');
  mk('lobbyObjective');
  const amHost = () => !$('lobby') || $('lobby').classList.contains('hidden') || !$('lobbyHostCtl').classList.contains('hidden');
  $('objective').after(formatRow('warFormat', () => true));
  $('lobbyObjective').after(formatRow('lobbyWarFormat', amHost));
  showFormat();
  // (the room's list, its Mode row and the Armies row's state in the lobby are drawn by lobbyui.js: in War Mode the castles there are armies)
  addEventListener('cw-menu', () => leaveHud());
}

// the Mode row shows (or hides) the format row
export function showWarRow(on) { $('warFormat').classList.toggle('hidden', !on); }

// a guest hears the host's format in the lobby message
export function hearWar(w) {
  if (w && typeof w === 'object' && Object.prototype.hasOwnProperty.call(WAR.formats, w.format)) { format = w.format; showFormat(); }
}

function leaveHud() {
  $('hud').classList.remove('war', 'warpanel');
  $('shop').classList.remove('waronly');
  document.body.classList.remove('war-on');
  for (const id of ['warPanel', 'warTop', 'warCmd']) { const el = $(id); if (el) el.classList.add('hidden'); }
}

// ---------------- the match ----------------
let liveWar = null;   // the War Mode of the match on screen (the end screen's section reads it)

export class WarUI {
  constructor(w) {
    this.w = w;
    this.g = w.g;
    this.t = 0;
    this.shown = {};
    this.centre = { x: 0, z: 0, t: 0 };
    this.cam = null;
    this.opened = false;
  }

  begin() {
    style();
    liveWar = this.w;
    const g = this.g;
    $('hud').classList.add('war');
    $('shop').classList.add('waronly');   // (N: the shop is the Talents panel and nothing else, as in Hero Mode: ui.js)
    document.body.classList.add('war-on');
    this.sel = null;   // the command bar's group: none until one is chosen
    this.build();
    this.opened = false;
    g.ui.banner('War Mode', `Build your army: ${clock(WAR.buildTime)} on the clock (Ready, or Enter, starts the battle sooner). Then the armies fight to the last man; your hero fights too and does not rise again. B: the army panel.`);
  }

  // ---- the DOM (made once per page, refilled per match) ----
  build() {
    let top = $('warTop');
    if (!top) {
      top = document.createElement('div');
      top.id = 'warTop';
      top.className = 'panel';
      document.body.append(top);
    }
    top.classList.remove('hidden');
    top.innerHTML = '<div class="wt-main"></div><div class="wt-line"></div>';
    this.topMain = top.firstElementChild;
    this.topLine = top.lastElementChild;
    let p = $('warPanel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'warPanel';
      document.body.append(p);
      p.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && liveWar) { b.blur(); liveWar.ui.click(b); } });   // (blur: Enter is Ready, not another click)
    }
    p.classList.add('hidden');
    const units = TYPES.map((t) => {
      const d = WAR.units[t], T = UNIT_TYPES[t];
      return `<div class="wp-unit" data-t="${t}"><span class="nm">${esc(d.name)}<small>${d.cost} gold</small></span><span class="ct"></span>
        <span class="bt"><button data-sell="${t}" data-n="10" title="Dismiss 10">−10</button><button data-sell="${t}" data-n="1" title="Dismiss 1">−1</button><button data-buy="${t}" data-n="1" title="Buy 1">+1</button><button data-buy="${t}" data-n="10" title="Buy 10">+10</button></span>
        <span class="ds">${esc(d.desc)} ${T.hp} health${T.ranged ? `, ${T.range} m` : ''}.</span></div>`;
    }).join('');
    const presets = Object.entries(WAR.presets).map(([k, v]) => `<button data-preset="${k}" title="${esc(v.desc)}">${esc(v.name)}</button>`).join('');
    const plans = GROUPS.map(([k, n]) => `<div class="wp-plan"><span>${n}</span>${PLAN_ORDERS.map((o) => `<button data-plan="${k}" data-o="${o}" title="${esc(WAR.orders[o].desc)}">${esc(WAR.orders[o].name)}</button>`).join('')}</div>`).join('');
    p.innerHTML = `<header><h3>Muster your army <span id="wpClock"></span></h3>
        <div class="wp-sub">When the timer runs out, or everybody is Ready, the armies fight to the last man.</div>
        <div class="wp-stat"><span><span class="coin">●</span> <span id="wpGold"></span> gold</span><span>⚔ <span id="wpArmy"></span></span></div></header>
      <div class="wp-body">
        <h4>Soldiers <button class="wp-rep" data-act="repeat" title="Buy the army you led in your last War Mode battle of this kind, as much as the gold and the caps allow">↻ Repeat last army</button></h4>${units}
        <h4>Formation</h4><div class="wp-row">${presets}</div><div class="wp-note" id="wpPresetDesc"></div>
        <h4>Battle plan</h4>${plans}
        <div class="wp-note">What each group does when the battle begins. Hold: they stay where they stand until you give an order, and you are free to walk the field.</div>
        <div class="wp-note">In the battle: <kbd>1</kbd> infantry · <kbd>2</kbd> archers · <kbd>3</kbd> cavalry · <kbd>4</kbd> everyone, then <kbd>F1</kbd> move here (where you look) · <kbd>F2</kbd> follow me · <kbd>F3</kbd> charge · <kbd>F4</kbd> hold · <kbd>T</kbd> advance · <kbd>G</kbd> fall back · <kbd>F</kbd> formation. The mouse wheel or <kbd>X</kbd> switches sword and bow; <kbd>N</kbd> talents.</div>
      </div>
      <footer><button id="wpClose" data-act="close" title="Walk among your soldiers (B brings the panel back)">Look around <kbd>B</kbd></button>
        <button id="wpReady" data-act="ready">Ready <kbd>Enter</kbd></button><span class="rd" id="wpReadyN"></span></footer>`;
    this.el = {
      panel: p, clock: $('wpClock'), gold: $('wpGold'), army: $('wpArmy'), ready: $('wpReady'), readyN: $('wpReadyN'), presetDesc: $('wpPresetDesc'),
      rows: TYPES.map((t) => { const r = p.querySelector(`.wp-unit[data-t="${t}"]`); return { t, ct: r.querySelector('.ct'), sell: r.querySelectorAll('[data-sell]'), buy: r.querySelectorAll('[data-buy]') }; }),
      presets: [...p.querySelectorAll('[data-preset]')], plans: [...p.querySelectorAll('[data-plan]')],
    };
    // the command bar of the fight
    let bar = $('warCmd');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'warCmd';
      document.body.append(bar);
      bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && liveWar) { b.blur(); liveWar.ui.clickBar(b); } });
    }
    bar.classList.add('hidden');
    bar.innerHTML = `<div class="wc-row wc-groups">${BAR_GROUPS.map(([k, id, n]) => `<button data-g="${id}" title="Choose ${id === 'all' ? 'the whole army' : n.toLowerCase()} (${k}): gold arrows mark them"><span><kbd>${k}</kbd>${n}</span><small></small></button>`).join('')}</div>
      <div class="wc-row wc-orders hidden">${BAR_ORDERS.map(([k, id]) => `<button data-c="${id}" title="${esc(WAR.orders[id].desc)}"><span><kbd>${k}</kbd>${esc(WAR.orders[id].name)}</span></button>`).join('')}</div>
      <div class="wc-row wc-forms hidden"><span class="wc-label">Formation <kbd>F</kbd></span>${FORMS.map((id) => `<button data-f="${id}" title="${esc(WAR.formations[id].desc)}"><span>${esc(WAR.formations[id].name)}</span></button>`).join('')}</div>
      <div class="wc-hint"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> choose a group, then <kbd>F1</kbd> move here · <kbd>F2</kbd> follow · <kbd>F3</kbd> charge · <kbd>F4</kbd> hold · <kbd>T</kbd> / <kbd>G</kbd> advance / fall back · <kbd>F</kbd> formation</div>`;
    this.el.bar = bar;
    this.el.barGroups = [...bar.querySelectorAll('[data-g]')].map((b) => ({ b, id: b.dataset.g, small: b.querySelector('small'), txt: '' }));
    this.el.barOrders = [...bar.querySelectorAll('[data-c]')];
    this.el.barForms = [...bar.querySelectorAll('[data-f]')];
    this.el.barOrderRow = bar.querySelector('.wc-orders');
    this.el.barFormRow = bar.querySelector('.wc-forms');
    this.el.barHint = bar.querySelector('.wc-hint');
    this.shown = {};
  }

  // ---- the command bar ----
  select(id) {
    this.sel = this.sel === id && id !== 'all' ? 'all' : id;   // (the same key twice: everyone)
    this.t = 0;
  }
  order(cmd) {
    if (!this.sel) this.sel = 'all';   // (an order before any group was chosen goes to everyone)
    const at = cmd === 'move' ? aimGround(this.g) : null;
    if (!this.w.localCommand(this.sel, cmd, at && [at[0], at[2]])) return;
    const say = { move: 'move there and hold!', charge: 'charge!', hold: 'hold where you stand!', forward: `advance ${WAR.forward} m and hold!`, back: `fall back ${WAR.forward} m and hold!`, follow: 'follow me!' }[cmd];
    this.g.ui.toast(`${GROUP_NAME[this.sel]}: ${say}`);
    this.t = 0;
  }
  // a formation for the chosen group (F: the next one after its own; everyone: after the infantry's)
  form(id) {
    if (!this.sel) this.sel = 'all';
    const f = this.g.localFaction;
    if (!f || !f.war) return;
    if (!id) id = FORMS[(FORMS.indexOf(f.war.form[this.sel === 'all' ? 'inf' : this.sel]) + 1) % FORMS.length];
    if (!this.w.localFormation(this.sel, id)) return;
    this.g.ui.toast(`${GROUP_NAME[this.sel]}: ${WAR.formations[id].name.toLowerCase()}`);
    this.t = 0;
  }
  clickBar(b) {
    if (this.g.state !== 'playing' || !this.w.fighting) return;
    if (b.dataset.g) this.select(b.dataset.g);
    else if (b.dataset.c) this.order(b.dataset.c);
    else if (b.dataset.f) this.form(b.dataset.f);
  }
  refreshBar() {
    const g = this.g, w = this.w, f = g.localFaction, el = this.el;
    const show = w.fighting && g.state === 'playing' && !g.spectator && !!f && !!f.war && !f.eliminated;
    if (this.shown.bar !== show) { this.shown.bar = show; el.bar.classList.toggle('hidden', !show); }
    if (!show) return;
    const n = this.barN || (this.barN = { inf: 0, arch: 0, cav: 0, all: 0 });
    n.inf = n.arch = n.cav = 0;
    for (const u of g.units) if (u.alive && u.team === f.team && !u.isHero && !u.isCrew) n[groupOfUnit(u)]++;
    n.all = n.inf + n.arch + n.cav;
    const plan = f.war.plan, fm = f.war.form;
    const same = plan.inf === plan.arch && plan.arch === plan.cav ? plan.inf : null;
    const sameF = fm.inf === fm.arch && fm.arch === fm.cav ? fm.inf : null;
    for (const o of el.barGroups) {
      const cur = o.id === 'all' ? same : plan[o.id], cf = o.id === 'all' ? sameF : fm[o.id];
      const txt = `${n[o.id]} · ${cur ? WAR.orders[cur].name : 'mixed orders'}${o.id === 'all' && !cf ? '' : ' · ' + WAR.formations[cf].name}`;
      if (o.txt !== txt) { o.txt = txt; o.small.textContent = txt; }
      o.b.classList.toggle('sel', this.sel === o.id);
      o.b.classList.toggle('none', !n[o.id]);
    }
    const on = !!this.sel;
    if (this.shown.barOn !== on) { this.shown.barOn = on; el.barOrderRow.classList.toggle('hidden', !on); el.barFormRow.classList.toggle('hidden', !on); el.barHint.classList.toggle('hidden', on); }
    if (!on) return;
    const cur = this.sel === 'all' ? same : plan[this.sel], curF = this.sel === 'all' ? sameF : fm[this.sel];
    for (const b of el.barOrders) b.classList.toggle('on', b.dataset.c === cur);
    for (const b of el.barForms) b.classList.toggle('on', b.dataset.f === curF);
  }

  // ---- Repeat last army ----
  // the local lord's army as the battle begins is remembered for the next battle of the same format (every screen: a guest's own browser keeps its own)
  remember() {
    const g = this.g, w = this.w, f = g.localFaction;
    if (!f || !f.war) return;
    const c = w.counts(f.team), counts = {};
    for (const t of TYPES) if (c[t]) counts[t] = c[t];
    if (c.total) saveLast(w.format, { counts, preset: f.war.preset, plan: { ...f.war.plan } });
  }
  // buy it again, as much as the gold and the caps allow (worked out here, so a guest can say at once what could not be bought; the host checks every
  // buy again), then the formation and the plan
  repeat() {
    const g = this.g, w = this.w, f = g.localFaction;
    if (!f || !f.war || w.fighting) return;
    const last = loadLast(w.format);
    if (!last) { g.audio.play('deny'); g.ui.toast(`No ${WAR.formats[w.format].name} army to repeat yet: fight a battle first`); return; }
    const c = w.counts(f.team);
    let gold = Math.floor(f.gold), total = c.total;
    const bought = [], short = [];
    // (the giant first: one soldier the whole army was planned round; then the others in the shop's order)
    for (const t of ['giant', ...TYPES.filter((x) => x !== 'giant')]) {
      const want = Math.max(0, Math.min(WAR.armyCap, Math.floor(Number(last.counts[t]) || 0)) - c[t]);
      if (!want) continue;
      const d = WAR.units[t];
      const n = Math.max(0, Math.min(want, d.cap - c[t], w.cap - total, Math.floor(gold / d.cost)));
      for (let left = n; left > 0; left -= 50) w.local('buy', t, Math.min(50, left), true);
      gold -= n * d.cost; total += n;
      if (n) bought.push(plural(n, d.name));
      if (n < want) short.push(plural(want - n, d.name));
    }
    if (Object.prototype.hasOwnProperty.call(WAR.presets, last.preset)) w.local('preset', last.preset, undefined, true);
    for (const [k] of GROUPS) if (last.plan && Object.prototype.hasOwnProperty.call(WAR.orders, last.plan[k])) w.local('plan', k, last.plan[k], true);
    g.audio.play(bought.length ? 'buy' : 'deny');
    g.ui.toast(bought.length || !short.length
      ? `Your last army: ${bought.length ? bought.join(', ') : 'already bought'}${short.length ? `. Could not buy ${short.join(', ')} (gold or caps)` : ''}`
      : `Could not buy ${short.join(', ')}: not enough gold or room`);
    this.t = 0;
  }

  click(b) {
    const w = this.w, g = this.g;
    if (g.state !== 'playing') return;
    if (b.dataset.act === 'close') { this.setPanel(false); return; }
    if (b.dataset.act === 'ready') { pressReady(g, g.ui); return; }
    if (b.dataset.act === 'repeat') { this.repeat(); return; }
    if (b.dataset.buy) w.local('buy', b.dataset.buy, Number(b.dataset.n));
    else if (b.dataset.sell) w.local('sell', b.dataset.sell, Number(b.dataset.n));
    else if (b.dataset.preset) w.local('preset', b.dataset.preset);
    else if (b.dataset.plan) w.local('plan', b.dataset.plan, b.dataset.o);
    this.t = 0;   // (show the change at once)
  }

  // relock: take the mouse back for the hero (only from a click or a key: a browser refuses it otherwise)
  setPanel(open, relock = true) {
    const g = this.g, w = this.w;
    open = !!open && !w.fighting && g.state === 'playing';
    if (open && g.ui.shopOpen) g.ui.toggleShop(false);   // (the army panel and the Talents panel take turns)
    w.panelOpen = open;
    this.el.panel.classList.toggle('hidden', !open);
    $('hud').classList.toggle('warpanel', open);
    if (open) g.input.unlock();
    else if (g.state === 'playing' && relock) g.input.lock();
    const vm = g.player.viewModel;
    if (vm) vm.visible = !open && g.player.alive;
    this.t = 0;
  }

  fightBegan() {
    if (this.w.panelOpen) this.setPanel(false, false);   // (the timer ran out: the next click on the field takes the mouse back)
    this.remember();
    this.t = 0;
  }

  handleInput(i) {
    const g = this.g, w = this.w;
    // N: the Talents panel (the shop with only its Talents tab: ui.js), in the build and in the fight; it closes the army panel, and B brings that back
    if (i.hit('KeyN')) {
      if (w.panelOpen) this.setPanel(false, false);
      g.ui.openTalents();
      return;
    }
    if (i.hit('KeyB')) {
      if (g.ui.shopOpen) { g.ui.toggleShop(false); if (!w.fighting) this.setPanel(true); return; }
      if (w.fighting) g.ui.toast('The armies are set: 1 / 2 / 3 / 4 choose a group, then F1 move here · F2 follow · F3 charge · F4 hold · T / G advance / fall back · F formation');
      else this.setPanel(!w.panelOpen);
      return;
    }
    if (w.panelOpen || g.ui.shopOpen) return;
    if (i.hit('KeyM')) g.ui.toggleMap();
    if (g.ui.mapOpen || !w.fighting) return;
    // the command bar (the hero's weapon is on the wheel or X in War Mode: player.js)
    for (const [k, id] of BAR_GROUPS) if (i.hit('Digit' + k)) this.select(id);
    for (const [, id, code] of BAR_ORDERS) if (i.hit(code)) this.order(id);
    if (i.hit('KeyF')) this.form(null);
  }

  // ---- every frame ----
  frame(dt) {
    const g = this.g, w = this.w;
    if (g.state !== 'playing') {
      if (this.mk) this.mk.hide();
      if (w.panelOpen) { w.panelOpen = false; this.el.panel.classList.add('hidden'); $('hud').classList.remove('warpanel'); }
      if (this.shown.bar) this.refreshBar();
      if (g.state === 'over' && !this.left) { this.left = true; leaveHud(); }
      return;
    }
    if (!this.opened && !w.fighting && !g.spectator) { this.opened = true; this.setPanel(true); }   // (a spectator has no army to build: spectate.js)
    if (w.panelOpen && g.input.locked) g.input.unlock();
    this.marks(dt);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    if (w.panelOpen) this.refreshPanel();
    this.refreshTop();
    this.refreshBar();
  }

  // the marks in the world (warmarks.js): over the chosen soldiers, where the crosshair would send them, and where each group was sent
  marks(dt) {
    const g = this.g, w = this.w, f = g.localFaction;
    const on = w.fighting && !g.spectator && !!f && !!f.war && !f.eliminated && !w.panelOpen;
    if (!on) { if (this.mk) this.mk.hide(); return; }
    if (!this.mk) this.mk = warMarks(g.scene);
    this.markT = (this.markT || 0) + dt;
    const n = this.barN || { inf: 1, arch: 1, cav: 1 };
    // (the aim ring only while a group is chosen and the hero looks out over the field: Move here goes there)
    const aim = this.sel && g.player.alive && !g.ui.shopOpen && !g.ui.mapOpen ? aimGround(g) : null;
    this.mk.update(g, f, this.sel, aim, this.markT, n);
  }

  refreshPanel() {
    const g = this.g, w = this.w, f = g.localFaction, el = this.el;
    if (!f || !f.war) return;
    const c = w.counts(f.team);
    const set = (k, node, v) => { if (this.shown[k] !== v) { this.shown[k] = v; node.textContent = v; } };
    set('clock', el.clock, clock(Math.max(0, g.phaseT)));
    set('gold', el.gold, String(Math.floor(f.gold)));
    set('army', el.army, `${c.total} / ${w.cap}`);
    for (const r of el.rows) {
      const d = WAR.units[r.t], cap = Math.min(d.cap, w.cap);
      set('ct' + r.t, r.ct, `${c[r.t]} / ${cap}`);
      const full = c[r.t] >= cap;
      if (this.shown['f' + r.t] !== full) { this.shown['f' + r.t] = full; r.ct.classList.toggle('full', full); }
      const canBuy = !w.buyBlock(f, r.t, c), canSell = c[r.t] > 0;
      for (const b of r.buy) if (b.disabled === canBuy) b.disabled = !canBuy;
      for (const b of r.sell) if (b.disabled === canSell) b.disabled = !canSell;
    }
    for (const b of el.presets) b.classList.toggle('active', b.dataset.preset === f.war.preset);
    set('pd', el.presetDesc, WAR.presets[f.war.preset].desc);
    for (const b of el.plans) b.classList.toggle('active', f.war.plan[b.dataset.plan] === b.dataset.o);
    const rv = readyView(g);
    const mine = !!(rv && rv.mine);
    if (el.ready.disabled !== (mine || !rv)) el.ready.disabled = mine || !rv;
    set('rn', el.readyN, rv && !rv.alone ? `${rv.n} / ${rv.of} ready` : '');
  }

  refreshTop() {
    const g = this.g, w = this.w;
    let main, line;
    if (!w.fighting) {
      const rv = readyView(g);
      main = `<span class="wt-clock"><small>${g.spectator ? 'The armies form' : 'Build your army'}</small>${clock(Math.max(0, g.phaseT))}</span>`;
      line = w.panelOpen ? 'Buy soldiers, choose a formation and a battle plan.' : `<kbd>B</kbd> army panel · <kbd>Enter</kbd> ready${rv && !rv.alone ? ` (${rv.n} / ${rv.of})` : ''} · <kbd>N</kbd> talents · <kbd>M</kbd> map`;
    } else {
      const sides = w.sideList.map((side) => {
        let n = 0, start = 0;
        for (const t of side) { n += w.standing(t).n; start += g.factions[t].war.start || 0; }
        const out = side.every((t) => g.factions[t].eliminated);
        const name = side.length > 1 ? side.map((t) => COLOR_NAMES[t]).join(' + ') : side[0] === g.localTeam && !g.spectator ? 'You' : g.factions[side[0]].name.replace(/^House /, '');
        const k = start ? Math.max(0, Math.min(1, n / start)) : 0;
        return `<span class="wt-side${out ? ' out' : ''}"><b style="color:${TEAM_CSS[side[0]]}">${esc(name)}</b><span>${n} / ${start}</span><span class="wt-bar"><i style="width:${(k * 100).toFixed(0)}%;background:${TEAM_CSS[side[0]]}"></i></span></span>`;
      });
      const mid = Math.ceil(sides.length / 2);
      const clk = `<span class="wt-clock"><small>Battle</small>${clock(w.clock)}<small>${clock(Math.max(0, WAR.fightLimit - w.clock))} left</small></span>`;
      main = sides.slice(0, mid).join('') + clk + sides.slice(mid).join('');
      const p = g.player;
      line = p.alive
        ? `${g.input.locked ? '' : '<b>Click to take the field</b> · '}Wheel or <kbd>X</kbd>: sword / bow · <kbd>N</kbd> talents · <kbd>M</kbd> map`
        : `<span class="wt-fallen">${g.localFaction.eliminated ? 'Your army has fallen.' : 'You have fallen. Your army fights on without you.'}</span>${offerFor(g) ? ' · <kbd>K</kbd> twice: leave the battle' : ''}`;
    }
    if (this.shown.main !== main) { this.shown.main = main; this.topMain.innerHTML = main; }
    if (g.spectate && g.spectate.on) line = '';   // (the spectator's bar has the keys: spectate.js)
    if (this.shown.line !== line) { this.shown.line = line; this.topLine.innerHTML = line; }
  }

  // ---- cameras (after the hero has placed the camera, before anything looks through it) ----
  camera(dt) {
    const g = this.g, w = this.w, cam = g.camera, f = g.localFaction;
    if (g.state !== 'playing' || !f || !f.war) return;
    const p = g.player;
    let want = null, look = null;
    if (w.panelOpen) {
      // over your army: behind it and above, looking over the front rank down your hill to the field
      const s = f.war.spot;
      want = [s.x - s.fx * 42, 22, s.z - s.fz * 42];
      look = [s.x + s.fx * 26, 0, s.z + s.fz * 26];
      if (p.viewModel && p.viewModel.visible) p.viewModel.visible = false;
    } else if (!p.alive) {
      // the battle: circling slowly over where the soldiers are
      const c = this.centre;
      c.t -= dt;
      if (c.t <= 0) {
        c.t = 0.5;
        let sx = 0, sz = 0, n = 0;
        for (const u of g.units) if (u.alive) { sx += u.pos.x; sz += u.pos.z; n++; }
        if (n) { c.x = sx / n; c.z = sz / n; }
      }
      this.orbit = (this.orbit || 0) + dt * 0.08;
      want = [c.x + Math.sin(this.orbit) * 60, 34, c.z + Math.cos(this.orbit) * 60];
      look = [c.x, 0, c.z];
      if (p.viewModel && p.viewModel.visible) p.viewModel.visible = false;
    } else { this.cam = null; return; }
    for (const a of [want, look]) a[1] += g.physics.terrainHeight(a[0], a[2]);
    if (!this.cam) this.cam = { p: want.slice(), l: look.slice() };
    const k = Math.min(1, dt * 2.5);
    for (let i = 0; i < 3; i++) { this.cam.p[i] += (want[i] - this.cam.p[i]) * k; this.cam.l[i] += (look[i] - this.cam.l[i]) * k; }
    cam.position.set(this.cam.p[0], this.cam.p[1], this.cam.p[2]);
    cam.lookAt(this.cam.l[0], this.cam.l[1], this.cam.l[2]);
  }
}

// ---------------- the end screen ----------------
onMatchEnd((summary) => {
  const w = liveWar;
  summary.war = w && !w.g.disposed && w.g.state === 'over' ? { rows: w.table(), format: w.format, clock: w.clock } : null;
});

registerEndSection('war', 12, (summary) => {
  const stats = $('goStats');
  if (stats) stats.classList.toggle('hidden', !!summary.war);
  const W = summary.war;
  if (!W) return null;
  const el = document.createElement('div');
  el.className = 'go-war';
  const rows = W.rows.slice().sort((a, b) => a.side - b.side || a.team - b.team).map((r) => {
    const won = summary.winner >= 0 && (r.team === summary.winner || (W.rows.find((o) => o.team === summary.winner) || {}).side === r.side);
    return `<tr class="${r.mine ? 'mine' : ''}"><td><b style="color:${TEAM_CSS[r.team]}">${esc(r.mine ? 'You' : r.name)}</b>${won ? ' ♛' : ''}</td><td>${r.start}</td><td>${r.left}</td><td>${r.start - r.left}</td><td>${r.kills}</td><td>${r.hero ? 'standing' : 'fallen'}</td></tr>`;
  }).join('');
  el.innerHTML = `<table><thead><tr><th>Army</th><th>Mustered</th><th>Standing</th><th>Lost</th><th>Kills</th><th>Lord</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="note">War Mode · ${esc(WAR.formats[W.format] ? WAR.formats[W.format].name : '')} · ${clock(W.clock)} of battle · your hero's kills: ${summary.kills}</div>`;
  return el;
});
