// War Mode on screen: the menu and lobby rows, the army panel of the build phase (the War Mode shop, the formation, the battle plan, Ready), the bar
// across the top (the countdown, then every side's soldiers), the cameras (the view over your army while the panel is open; the view over the
// battle once your hero has fallen) and the end screen's section. The rules are in warmode.js; this file only shows them and passes on clicks.
import { WAR, TEAM_CSS, UNIT_TYPES, clock } from './config.js';
import { pressReady, readyView, offerFor } from './flow.js';
import { registerEndSection, onMatchEnd } from './endscreen.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPES = Object.keys(WAR.units);
const GROUPS = [['inf', 'Infantry'], ['arch', 'Archers'], ['cav', 'Cavalry']];
const COLOR_NAMES = ['Blue', 'Red', 'Green', 'Gold'];

export const WAR_DESC = `No castles: one battle in a great bowl. You have ${clock(WAR.buildTime)} (the timer) to buy an army with ${WAR.gold} gold and set it out (Ready starts the battle sooner), then the armies fight to the last man. Your hero fights too.`;

// ---------------- styles (once) ----------------
const CSS = `
#hud.war #factions, #hud.war #top, #hud.war #goldbox, #hud.war #army, #hud.war #clsHint, #hud.war #hill, #hud.war #hint, #hud.war #command, #hud.war #respawn { display: none !important; }
body.war-on #scoreboard { display: none !important; }
#warTop { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; pointer-events: none; text-align: center; min-width: 340px; max-width: calc(100% - 420px); }
#warTop .wt-main { display: inline-flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap; }
#warTop .wt-clock { font-family: Cinzel, Georgia, serif; font-size: 22px; color: var(--gold); letter-spacing: 0.05em; }
#warTop .wt-clock small { font-size: 12px; color: var(--parch); opacity: 0.8; display: block; letter-spacing: 0.08em; text-transform: uppercase; }
#warTop .wt-side { display: inline-flex; flex-direction: column; align-items: stretch; min-width: 92px; font-size: 13px; }
#warTop .wt-side b { font-family: Cinzel, Georgia, serif; font-size: 13px; white-space: nowrap; }
#warTop .wt-side.out { opacity: 0.4; text-decoration: line-through; }
#warTop .wt-bar { height: 5px; background: rgba(255,255,255,0.12); border-radius: 3px; margin-top: 3px; overflow: hidden; }
#warTop .wt-bar i { display: block; height: 100%; }
#warTop .wt-line { margin-top: 5px; font-size: 14px; }
#warTop .wt-line kbd, #warPanel kbd { font-family: inherit; font-size: 11px; border: 1px solid var(--edge); border-radius: 3px; padding: 0 4px; background: rgba(0,0,0,0.35); }
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
#warPanel .wp-plan { display: grid; grid-template-columns: 78px 1fr 1fr 1fr; gap: 4px; align-items: center; margin-bottom: 4px; }
#warPanel .wp-plan button { padding: 5px 4px; }
#warPanel .wp-note { font-size: 12.5px; opacity: 0.8; margin-top: 5px; line-height: 1.3; }
#warPanel footer { padding: 10px 14px 12px; border-top: 1px solid var(--edge); display: flex; gap: 8px; align-items: center; }
#warPanel footer button { padding: 9px 12px; font-size: 14px; }
#warPanel footer #wpReady { flex: 1; font-size: 16px; }
#warPanel footer .rd { font-size: 12px; opacity: 0.8; }
#warFormat, #lobbyWarFormat { align-items: center; gap: 6px; }
#warFormat button, #lobbyWarFormat button { padding: 6px 10px; font-size: 13px; }
#hud.warpanel #crosshair, #hud.warpanel #dirs, #hud.warpanel #minimapWrap, #hud.warpanel #drawbar { display: none !important; }
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
// it wires the Mode buttons (so the new one is wired with them). ui: the page's UI (its lobby list is told when the room plays War Mode).
// changed(): the host's lobby is sent again when the row changes.
export function initWarMenu(ui, changed) {
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
  // the room's list: in War Mode the slots are armies, not castles
  const orig = ui.renderLobby.bind(ui);
  ui.renderLobby = (players, myTeam, coop, obj, ...rest) => {
    orig(players, myTeam, coop, obj === 'war' ? 'conquest' : obj, ...rest);
    showWarLobby(obj === 'war');
  };
  addEventListener('cw-menu', () => leaveHud());
}

// the Mode row shows (or hides) the format row
export function showWarRow(on) { $('warFormat').classList.toggle('hidden', !on); }

function showWarLobby(on) {
  $('lobbyWarFormat').classList.toggle('hidden', !on);
  document.querySelectorAll('#lobbyObjective button').forEach((b) => { if (on) b.classList.toggle('active', b.dataset.o === 'war'); else if (b.dataset.o === 'war') b.classList.remove('active'); });
  if (on) $('lobbyObjDesc').textContent = `War Mode: ${WAR_DESC}`;
  const guest = $('lobbyHostCtl').classList.contains('hidden');
  document.querySelectorAll('#lobbyWarFormat button').forEach((b) => { b.disabled = guest; });
}

// a guest hears the host's format in the lobby message
export function hearWar(w) {
  if (w && typeof w === 'object' && Object.prototype.hasOwnProperty.call(WAR.formats, w.format)) { format = w.format; showFormat(); }
}

function leaveHud() {
  $('hud').classList.remove('war', 'warpanel');
  document.body.classList.remove('war-on');
  for (const id of ['warPanel', 'warTop']) { const el = $(id); if (el) el.classList.add('hidden'); }
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
    document.body.classList.add('war-on');
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
    const plans = GROUPS.map(([k, n]) => `<div class="wp-plan"><span>${n}</span>${Object.entries(WAR.orders).map(([o, v]) => `<button data-plan="${k}" data-o="${o}" title="${esc(v.desc)}">${esc(v.name)}</button>`).join('')}</div>`).join('');
    p.innerHTML = `<header><h3>Muster your army <span id="wpClock"></span></h3>
        <div class="wp-sub">When the timer runs out, or everybody is Ready, the armies fight to the last man.</div>
        <div class="wp-stat"><span><span class="coin">●</span> <span id="wpGold"></span> gold</span><span>⚔ <span id="wpArmy"></span></span></div></header>
      <div class="wp-body">
        <h4>Soldiers</h4>${units}
        <h4>Formation</h4><div class="wp-row">${presets}</div><div class="wp-note" id="wpPresetDesc"></div>
        <h4>Battle plan</h4>${plans}
        <div class="wp-note">In the battle: <kbd>F1</kbd> follow me · <kbd>F2</kbd> hold here · <kbd>F3</kbd> charge · <kbd>G</kbd> choose the group.</div>
      </div>
      <footer><button id="wpClose" data-act="close" title="Walk among your soldiers (B brings the panel back)">Look around <kbd>B</kbd></button>
        <button id="wpReady" data-act="ready">Ready <kbd>Enter</kbd></button><span class="rd" id="wpReadyN"></span></footer>`;
    this.el = {
      panel: p, clock: $('wpClock'), gold: $('wpGold'), army: $('wpArmy'), ready: $('wpReady'), readyN: $('wpReadyN'), presetDesc: $('wpPresetDesc'),
      rows: TYPES.map((t) => { const r = p.querySelector(`.wp-unit[data-t="${t}"]`); return { t, ct: r.querySelector('.ct'), sell: r.querySelectorAll('[data-sell]'), buy: r.querySelectorAll('[data-buy]') }; }),
      presets: [...p.querySelectorAll('[data-preset]')], plans: [...p.querySelectorAll('[data-plan]')],
    };
    this.shown = {};
  }

  click(b) {
    const w = this.w, g = this.g;
    if (g.state !== 'playing') return;
    if (b.dataset.act === 'close') { this.setPanel(false); return; }
    if (b.dataset.act === 'ready') { pressReady(g, g.ui); return; }
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
    this.t = 0;
  }

  handleInput(i) {
    const g = this.g, w = this.w;
    if (i.hit('KeyB')) {
      if (w.fighting) g.ui.toast('The armies are set: give orders with F1 / F2 / F3');
      else this.setPanel(!w.panelOpen);
      return;
    }
    if (w.panelOpen) return;
    if (i.hit('KeyM')) g.ui.toggleMap();
    if (g.ui.mapOpen || !w.fighting) return;
    if (i.hit('F1') || i.hit('KeyZ')) g.localOrder('follow');
    if (i.hit('F2') || i.hit('KeyX')) g.localOrder('hold');
    if (i.hit('F3') || i.hit('KeyV')) g.localOrder('charge');
    if (i.hit('KeyG')) {
      const p = g.player, order = ['all', 'infantry', 'archers', 'cavalry'];
      p.group = order[(order.indexOf(p.group || 'all') + 1) % order.length];
      g.ui.toast(`Orders go to: ${{ all: 'everyone', infantry: 'the infantry', archers: 'the archers', cavalry: 'the cavalry' }[p.group]}`);
    }
  }

  // ---- every frame ----
  frame(dt) {
    const g = this.g, w = this.w;
    if (g.state !== 'playing') {
      if (w.panelOpen) { w.panelOpen = false; this.el.panel.classList.add('hidden'); $('hud').classList.remove('warpanel'); }
      if (g.state === 'over' && !this.left) { this.left = true; leaveHud(); }
      return;
    }
    if (!this.opened && !w.fighting) { this.opened = true; this.setPanel(true); }
    if (w.panelOpen && g.input.locked) g.input.unlock();
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    if (w.panelOpen) this.refreshPanel();
    this.refreshTop();
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
      main = `<span class="wt-clock"><small>Build your army</small>${clock(Math.max(0, g.phaseT))}</span>`;
      line = w.panelOpen ? 'Buy soldiers, choose a formation and a battle plan.' : `<kbd>B</kbd> army panel · <kbd>Enter</kbd> ready${rv && !rv.alone ? ` (${rv.n} / ${rv.of})` : ''} · <kbd>M</kbd> map`;
    } else {
      const sides = w.sideList.map((side) => {
        let n = 0, start = 0;
        for (const t of side) { n += w.standing(t).n; start += g.factions[t].war.start || 0; }
        const out = side.every((t) => g.factions[t].eliminated);
        const name = side.length > 1 ? side.map((t) => COLOR_NAMES[t]).join(' + ') : side[0] === g.localTeam ? 'You' : g.factions[side[0]].name.replace(/^House /, '');
        const k = start ? Math.max(0, Math.min(1, n / start)) : 0;
        return `<span class="wt-side${out ? ' out' : ''}"><b style="color:${TEAM_CSS[side[0]]}">${esc(name)}</b><span>${n} / ${start}</span><span class="wt-bar"><i style="width:${(k * 100).toFixed(0)}%;background:${TEAM_CSS[side[0]]}"></i></span></span>`;
      });
      const mid = Math.ceil(sides.length / 2);
      const clk = `<span class="wt-clock"><small>Battle</small>${clock(w.clock)}<small>${clock(Math.max(0, WAR.fightLimit - w.clock))} left</small></span>`;
      main = sides.slice(0, mid).join('') + clk + sides.slice(mid).join('');
      const p = g.player;
      line = p.alive
        ? `${g.input.locked ? '' : '<b>Click to take the field</b> · '}<kbd>F1</kbd> follow · <kbd>F2</kbd> hold here · <kbd>F3</kbd> charge · <kbd>G</kbd> ${{ all: 'everyone', infantry: 'infantry', archers: 'archers', cavalry: 'cavalry' }[p.group || 'all']} · <kbd>M</kbd> map`
        : `<span class="wt-fallen">${g.localFaction.eliminated ? 'Your army has fallen.' : 'You have fallen. Your army fights on without you.'}</span>${offerFor(g) ? ' · <kbd>K</kbd> twice: leave the battle' : ''}`;
    }
    if (this.shown.main !== main) { this.shown.main = main; this.topMain.innerHTML = main; }
    if (this.shown.line !== line) { this.shown.line = line; this.topLine.innerHTML = line; }
  }

  // ---- cameras (after the hero has placed the camera, before anything looks through it) ----
  camera(dt) {
    const g = this.g, w = this.w, cam = g.camera, f = g.localFaction;
    if (g.state !== 'playing' || !f || !f.war) return;
    const p = g.player;
    let want = null, look = null;
    if (w.panelOpen) {
      // over your army: behind it and above, looking at the front rank
      const s = f.war.spot;
      want = [s.x - s.fx * 40, 24, s.z - s.fz * 40];
      look = [s.x + s.fx * 8, 0, s.z + s.fz * 8];
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
