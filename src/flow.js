// The gap between matches. Everything that gets a player from one battle into the next lives here (README: "Between matches"):
//   - what the last match was set up with, so that Quick Play and a fresh page load start it again (difficulty and mode; class, map and length are kept
//     by main.js and options.js), and the short line that says so under the Quick Play button
//   - the end screen's actions row: Play Again (the big one, instant: main.js has a fresh world waiting), "Change class" beside it, a quiet "Main menu"
//   - Ready: end the first preparation early (single player at once; online when every human is ready: see Game.readyLive and netsync.js)
//   - the offer to end a battle that is decided: "Concede / Next battle" when you are beaten, "Finish the war" when you have won (never forced)
// The rules about what counts as decided are here too, with the numbers they were tuned on. main.js hands over the things only it can do (starting a match,
// going to the menu) with flow.bind(); this file imports nothing from the UI, so ui.js can import it without a cycle.
import { registerEndSection } from './endscreen.js';
import { standBlock } from './comeback.js';
import { DIFFICULTY, OBJECTIVES, MAP_SIZES, LENGTHS } from './config.js';
import { CLASSES } from './classes.js';
import { HERO } from './herogame.js';

const $ = (id) => document.getElementById(id);

export const flow = {
  api: null,          // { playAgain(), toMenu(), setClass(id), classId(), setupLine(), renderClassPicker(...), rematch? } (main.js)
  beganAt: 0,         // performance.now() when the current match began (a key that started it must not also press Ready)
  left: false,        // this lord left the room for the next battle (an online guest who was out): there is no room to go back to
  endShownAt: 0,      // ... and when the end screen came up (keys wait a moment so that a player mashing buttons does not skip it unread)
  bind(api) { this.api = api; },
};

// ---------------------------------------------------------------- what the last match was set up with
const LAST_KEY = 'cw-last';
const MODES = ['conquest', 'koth', 'hero'];
export function loadLast() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(LAST_KEY)); } catch (e) { /* storage unavailable or garbage */ }
  o = o && typeof o === 'object' ? o : {};
  return { diff: Object.prototype.hasOwnProperty.call(DIFFICULTY, o.diff) ? o.diff : 'normal', mode: MODES.includes(o.mode) ? o.mode : 'conquest' };
}
export function saveLast(diff, mode) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ diff, mode })); } catch (e) { /* ignore */ }
}

// "Knight · Conquest · Medium · Normal": what Quick Play and Play Again will start
export function setupLine({ cls, mode, heroWin, map, diff, length }) {
  const hero = mode === 'hero';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const parts = [CLASSES[cls] ? CLASSES[cls].name : 'Knight', hero ? `Hero Mode: ${HERO.modes[heroWin] ? HERO.modes[heroWin].name : 'Hero kills'}` : (OBJECTIVES[mode] || OBJECTIVES.conquest).name,
    (MAP_SIZES[map] || MAP_SIZES.medium).name, cap(diff)];
  if (!hero && length === 'short') parts.push('Short');
  return parts.join(' · ');
}

// ---------------------------------------------------------------- Ready: ending the first preparation early
// The rules are Game.readyLive / localReady (game.js). Here: the row in the top panel (Enter, or a click while the mouse is free), the button in the shop.
export function readyView(g) {
  if (!g.readyLive) return null;
  let n = 0, of = 0, mine = false;
  if (g.mode === 'client') {
    const r = g.readyInfo;
    if (r) { n = r[0]; of = r[1]; mine = !!(r[2] & (1 << g.localTeam)); }
    mine = mine || !!g.readySent;
  } else {
    [n, of] = g.readyState();
    mine = g.readyTeams.has(g.localTeam);
  }
  return { n, of, mine, alone: of <= 1 };
}

export function pressReady(g, ui) {
  if (!g.readyLive) return false;
  const v = readyView(g);
  if (v && v.mine) return false;
  g.localReady();
  if (g.mode === 'single' && ui.shopOpen) ui.toggleShop(false);   // (the world waits under the shop: close it so the first army marches)
  g.audio.play('order');
  return true;
}

// ---------------------------------------------------------------- the offer to end a decided battle
// Three cases, for the local lord only, and never forced:
//   'out'     your keep has fallen: you cannot rise again, there is nothing left for you to defend
//   'behind'  you are one of the last two castles and the other is clearly winning
//   'ahead'   the same the other way round: you are clearly winning (the button says "Finish the war")
// "Clearly" is measured on the two castles with numbers the game keeps anyway (the keep's health as a share of its full health, the soldiers alive, the
// gold in the purse); see DECIDED below for the thresholds and the matches they were tuned on. Online a guest who is out may leave for the next battle while
// the war goes on for the others; the host never ends a battle for friends who are still in it.
export const DECIDED = {
  // behind: my keep is down to this share or less, theirs is up above that other share, and they have this many soldiers to each of mine ...
  behind: { myKeep: 0.45, theirKeep: 0.7, army: 1.6 },
  // ... or my gate is broken and my keep is under this share and they have this many soldiers to each of mine
  behindGate: { myKeep: 0.6, army: 2.5 },
  // ahead: the mirror of both
  ahead: { theirKeep: 0.4, myKeep: 0.75, army: 1.6 },
  aheadGate: { myKeep: 0.75, army: 2.5 },
};
// Where the numbers come from: bot-vs-bot wars (feat/F1/node/calib_node.mjs: the lords play every house, the player's house is led by the same AI with a head start).
// The last castle of a war falls in its final minute: its gate goes first, its soldiers dwindle to a handful while the winner's army stays at 60 to 70, and once the
// keep starts to go it is gone within half a minute. In the 7 wars that came down to two castles, "Finish the war" first fired between 18 and about 200 seconds before
// the end (63 s at the median) and was right every time (a house with a broken gate against two and a half times its soldiers never came back); the keep rule alone
// would have fired about 2 seconds before the end, which is why the gate rule is there. "Concede" is the mirror of that rule: no war in the sims put the player's house
// among the last two while it was losing, so its numbers are the same ones turned round and are cautious rather than measured. An engine counts as four soldiers.

function houseNumbers(g, f) {
  const c = f.castle;
  return { keep: c.fallen ? 0 : Math.max(0, c.keep.hp / c.keep.maxHp), gate: !!c.gate.alive, army: g.troopCount(f.team) + 4 * g.siegeCount(f.team), gold: f.gold };
}

export function offerFor(g) {
  if (g.state !== 'playing' || g.practice || g.hero || !g.factions.length) return null;
  const me = g.localFaction;
  if (!me) return null;
  if (g.mode === 'client') {
    if (me.eliminated || (me.castle.fallen && !g.player.alive)) return { kind: 'leave', text: 'You are out of the battle.', label: 'Leave · Next battle', ask: 'Leave this battle? The war goes on without you and you can start the next one.', yes: 'Leave' };
    return null;
  }
  if (g.mode === 'host' && g.humans.some((h) => h !== g.player && !h.isBot)) return null;   // (friends are still fighting: the host does not end it for them)
  if (me.castle.fallen) return { kind: 'concede', text: 'You cannot rise again.', label: 'Concede · Next battle', ask: 'Concede this battle? You will see the results and can start the next one.', yes: 'Concede' };
  if (g.coop) return null;
  const standing = g.factions.filter((f) => !f.castle.fallen);
  if (standing.length !== 2 || !standing.includes(me)) return null;
  const foe = standing.find((f) => f !== me);
  const a = houseNumbers(g, me), b = houseNumbers(g, foe);
  const D = DECIDED;
  const behind = (a.keep <= D.behind.myKeep && b.keep >= D.behind.theirKeep && b.army >= D.behind.army * Math.max(1, a.army))
    || (!a.gate && a.keep <= D.behindGate.myKeep && b.army >= D.behindGate.army * Math.max(1, a.army));
  const ahead = (b.keep <= D.ahead.theirKeep && a.keep >= D.ahead.myKeep && a.army >= D.ahead.army * Math.max(1, b.army))
    || (!b.gate && a.keep >= D.aheadGate.myKeep && a.army >= D.aheadGate.army * Math.max(1, b.army));
  // (while the Last Stand can still be called the battle is not lost: the comeback comes first, with its own button and its own toast; see comeback.js)
  if (behind && standBlock(g, me))
    return { kind: 'concede', text: `${foe.name} is winning the war.`, label: 'Concede · Next battle', ask: 'Concede this battle? You will see the results and can start the next one.', yes: 'Concede', foe };
  if (ahead)
    return { kind: 'finish', text: `${foe.name} cannot hold out any longer.`, label: 'Finish the war', ask: `Finish the war now? ${foe.name} yields and the realm is yours.`, yes: 'Finish', foe };
  return null;
}

// what ending it says on the end screen
export function offerReason(g, o) {
  if (o.kind === 'finish') return `${o.foe.name} yields. The war is won, and the realm bows to you.`;
  if (o.kind === 'leave') return 'You left the battle; it goes on without you.';
  return o.foe ? `You conceded the war to ${o.foe.name}.` : 'You conceded the battle.';
}

let armedUntil = 0;   // the first press of K only asks; the second, within a few seconds, does it
export function pressOffer(g, ui) {
  const o = offerFor(g);
  if (!o) return false;
  const now = performance.now();
  if (now < armedUntil) { armedUntil = 0; confirmOffer(g, ui); return true; }
  armedUntil = now + 4000;
  return true;
}
export function confirmOffer(g, ui) {
  const o = offerFor(g);
  if (!o) return false;
  armedUntil = 0;
  ui.showPause(false); g.paused = false;
  if (ui.shopOpen) ui.toggleShop(false);
  if (o.kind === 'leave') flow.left = true;   // (the room is left with the battle: the end screen offers the menu, not a rematch)
  g.endEarly(o.kind, offerReason(g, o));
  if (o.kind === 'leave' && flow.api) flow.api.leaveRoom();
  return true;
}

// ---------------------------------------------------------------- the HUD pieces (called a few times a second by ui.update)
const last = { ready: '', offer: '', hillY: 0, targetY: 0, told: new Set() };   // told: the kinds of offer that have been announced in a toast this match
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
// a new match starts with nothing shown (ui.reset)
export function resetHud() {
  last.ready = last.offer = '';
  last.hillY = last.targetY = 0;
  $('hill').style.top = $('target').style.top = '';
  last.told.clear();
  armedUntil = 0;
  for (const id of ['readyRow', 'offerRow']) $(id).classList.add('hidden');
  $('hud').classList.remove('prep', 'offer');
  $('shopReady').classList.add('hidden');
}
export function updateHud(g, ui) {
  const rv = readyView(g);
  const rr = $('readyRow'), or = $('offerRow');
  // the Hero Game Mode HUD has its own panel at the top; the row moves into it
  const home = g.hero ? $('heroTop') : $('top');
  for (const row of [rr, or]) if (row.parentElement !== home) home.append(row);
  const rkey = rv ? `${rv.n}/${rv.of}/${rv.mine}` : '';
  if (rkey !== last.ready) {
    last.ready = rkey;
    rr.classList.toggle('hidden', !rv);
    $('hud').classList.toggle('prep', !!rv);
    $('shopReady').classList.toggle('hidden', !rv || rv.mine);
    if (rv) {
      $('readyBtn').classList.toggle('hidden', rv.mine);
      setText($('readyNote'), rv.alone ? (rv.mine ? '' : 'Start the battle now') : rv.mine ? `You are ready · waiting for the others (${rv.n}/${rv.of})` : `${rv.n}/${rv.of} ready`);
      setText($('shopReady'), rv.alone ? 'Ready' : `Ready · ${rv.n}/${rv.of}`);
    }
  }
  const o = offerFor(g);
  const armed = performance.now() < armedUntil;
  const okey = o ? `${o.kind}/${o.text}/${armed}` : '';
  if (okey !== last.offer) {
    last.offer = okey;
    or.classList.toggle('hidden', !o);
    $('hud').classList.toggle('offer', !!o);
    if (o && !last.told.has(o.kind)) {   // (the first time: a toast, so that the key is not a secret)
      last.told.add(o.kind);
      ui.toast(`Press K twice to ${o.kind === 'finish' ? 'finish the war' : o.kind === 'leave' ? 'leave for the next battle' : 'concede and start the next battle'}.`, -1, true);
    }
    if (o) {
      setText($('offerText'), o.text);
      setText($('offerLabel'), armed ? `Press K again: ${o.yes}` : o.label);
      $('offerBtn').classList.toggle('armed', armed);
    }
  }
  // The King of the Hill panel and the label of the soldier you aim at hang under the top panel, which grows by a row for Ready, for the offer and for the decrees
  // (decrees.js): they follow its real bottom edge instead of a fixed place (measured last, after the rows above have been shown or hidden)
  if (!g.hero) {
    const top = $('top'), hill = $('hill'), tg = $('target');
    let y = top.offsetTop + top.offsetHeight + 8;
    if (y !== last.hillY) { last.hillY = y; hill.style.top = `${y}px`; }
    if (!hill.classList.contains('hidden')) y += hill.offsetHeight + 6;
    if (y !== last.targetY) { last.targetY = y; tg.style.top = `${y}px`; }
  }
}

// the keys that act in the match: Enter is Ready, K ends a decided battle (twice to confirm). They act through this one listener, not through Input, so that
// the key which started the match (Space or Enter on the end screen) cannot also be read as a press inside it.
const overlays = ['menu', 'lobby', 'pause', 'options', 'controls', 'gameover'];
export function onKey(e, g, ui) {
  if (e.repeat || (e.code !== 'Enter' && e.code !== 'KeyK')) return;
  if (g.state !== 'playing' || ui.practiceOpen || overlays.some((id) => !$(id).classList.contains('hidden'))) return;
  const t = e.target;
  if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (performance.now() - flow.beganAt < 700) return;
  const did = e.code === 'Enter' ? pressReady(g, ui) : pressOffer(g, ui);
  if (did) e.preventDefault();   // (a button that still has the focus must not also take the key)
}

// ---------------------------------------------------------------- the end screen: the actions row
registerEndSection('actions', 90, (s) => buildActions(s));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// What the end screen offers depends on where you are: alone (Play Again, at once), in a room with friends (the host takes everybody back to the room's lobby:
// Rematch; a guest waits for the host), or out of the room (you left the battle, or the host did: back to the menu).
function buildActions(s) {
  const api = flow.api;
  if (!api) return null;
  flow.endShownAt = performance.now();
  const solo = s.mode === 'single';
  const gone = !solo && (flow.left || !api.inRoom());
  const host = s.mode === 'host';
  const box = el('div', 'go-actions');
  const main = el('div', 'go-main');
  const primary = el('button', 'go-primary', solo ? 'Play Again' : gone ? 'Back to the menu' : host ? 'Rematch' : 'Waiting for the host…');
  primary.id = 'again';
  main.append(primary);
  box.append(main);
  const next = el('div', 'go-next');
  const line = () => { next.textContent = solo ? api.setupLine() : gone ? '' : host ? 'Back to the room with the same players' : 'The host starts the next battle'; };
  line();
  if (!gone && (solo || host)) next.append(el('span', 'go-key', 'Space'));
  if (!gone) {
    const change = el('button', 'go-small', 'Change class');
    change.id = 'changeClass';
    main.append(change);
    const pick = el('div', 'go-class hidden');
    const grid = el('div', 'classes'), info = el('div', 'classinfo');
    pick.append(grid, info);
    let open = false;
    change.addEventListener('click', () => {
      open = !open;
      pick.classList.toggle('hidden', !open);
      change.classList.toggle('active', open);
      if (open) api.renderClassPicker(grid, info, api.classId(), (id) => { if (id !== api.classId()) { api.setClass(id); line(); } });
      change.blur();
    });
    pick.addEventListener('click', () => { const a = document.activeElement; if (a && a.blur && a.tagName === 'BUTTON') a.blur(); });   // (Space and Enter play again, not press the class button)
    box.append(next, pick);
  } else box.append(next);
  if (solo) primary.addEventListener('click', () => api.playAgain());
  else if (gone) primary.addEventListener('click', () => api.toMenu());
  else if (host) primary.addEventListener('click', () => api.rematch());
  else primary.disabled = true;
  const menuRow = el('div', 'go-menu');
  if (!gone) {
    const menu = el('button', 'go-link', solo ? 'Main menu' : 'Leave the room');
    menu.id = 'goMenu';
    menu.addEventListener('click', () => api.toMenu());
    menuRow.append(menu);
  }
  box.append(menuRow);
  api.afterEnd(s);
  return box;
}

// the room went away while the end screen was up (the host left, or the connection broke): the button says so and takes you to the menu
export function roomGone(text) {
  const old = $('again');
  if (!old || !flow.api) return;
  const b = old.cloneNode(true);   // (a copy: the old button's click handlers must not run any more)
  old.replaceWith(b);
  b.disabled = false;
  b.textContent = 'Back to the menu';
  b.addEventListener('click', () => flow.api.toMenu());
  for (const x of [...document.querySelectorAll('#gameover .go-next')]) x.textContent = text;
  const m = $('goMenu');
  if (m) m.remove();
}

// the end screen is built when the match ends but comes into view later when the ending has a show (finale.js keeps it see-through as 'finale-wait' and the key
// that skips the show is not passed on): the keys wait from the moment it is in view, not from the moment it was built
let wasUp = false;
new MutationObserver(() => {
  const c = $('gameover').classList;
  const up = !c.contains('hidden') && !c.contains('finale-wait');
  if (up && !wasUp) flow.endShownAt = performance.now();
  wasUp = up;
}).observe($('gameover'), { attributes: true, attributeFilter: ['class'] });

// Space or Enter on the end screen plays again (a button that has the focus keeps the key for itself). While an ending show keeps the screen see-through the keys
// belong to the show (finale.js: any key skips it): they are not read here, whatever order the listeners run in.
addEventListener('keydown', (e) => {
  if (e.repeat || (e.code !== 'Space' && e.code !== 'Enter')) return;
  const go = $('gameover');
  if (!go || go.classList.contains('hidden') || go.classList.contains('finale-wait')) return;
  const again = $('again');
  if (!again || !again.isConnected || again.closest('.hidden')) return;
  if (performance.now() - flow.endShownAt < 700) return;
  const t = e.target;
  if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)) return;
  e.preventDefault();
  e.stopImmediatePropagation();   // (the key that started the match must not also reach the new match's input: the hero would jump in its first frame)
  again.click();
});

// ---------------------------------------------------------------- the look of the pieces above
const style = document.createElement('style');
style.id = 'flow-css';
style.textContent = `
.quick { text-align: center; margin: 4px 0 14px; }
.scroll #quickPlay { font-size: 29px; font-weight: 700; letter-spacing: 0.08em; padding: 11px 84px; border: 2px solid #4a2d06; border-radius: 4px; color: #2a1706;
  background: linear-gradient(#ecc15a, #c08a24 55%, #a97616); text-shadow: 0 1px 0 rgba(255,240,190,0.65);
  box-shadow: 0 2px 0 #5a3a08, 0 6px 20px rgba(110,70,10,0.5), inset 0 1px 0 rgba(255,246,208,0.8); }
.scroll #quickPlay:hover:not(:disabled) { background: linear-gradient(#f5d172, #cd972e 55%, #b58120); border-color: #2f1b02; }
.scroll #quickPlay:focus-visible { outline: 3px solid #5a1d12; outline-offset: 3px; }
.quickinfo { margin-top: 6px; font-size: 16px; font-style: italic; }
/* the menu and the lobby grow with every row the features add: their buttons stay in view at the bottom of the card, whatever the window's height */
#lobby .scroll { padding-bottom: 0; scroll-padding-bottom: 150px; }
#lobby .menu-actions { position: sticky; bottom: 0; z-index: 2; margin: 0 -40px; padding: 6px 40px 14px; background: linear-gradient(rgba(217,199,156,0), #d9c79c 14px); }
@media (max-height: 700px) {
  #lobby .menu-actions { margin: 0 -30px; padding: 2px 30px 8px; }
  .quick { margin: 0 0 6px; }
  .scroll #quickPlay { font-size: 22px; padding: 7px 56px; }
  .quickinfo { margin-top: 3px; font-size: 14px; }
}
#length { align-items: center; }
#length .qlabel, #lobbyLength .qlabel { font-family: Cinzel, serif; font-size: 14px; margin-right: 4px; }
#length button, #lobbyLength button { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 14px; font-size: 13px; }
#length button small { font-family: 'EB Garamond', Georgia, serif; font-size: 11.5px; opacity: 0.85; letter-spacing: 0; }
#length button small:empty { display: none; }
#lobbyLength { align-items: center; }
#length.off { opacity: 0.55; }
.flowrow { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px; font-size: 13px; }
.flowrow.hidden { display: none; }
.flowrow button { pointer-events: auto; padding: 3px 12px; font-size: 13px; letter-spacing: 0.02em; }
.flowrow button kbd { margin-right: 6px; }
#offerRow { flex-wrap: wrap; }
#offerBtn.armed { border-color: #ff9d8a; color: #fff; background: linear-gradient(#8a2a1c, #5a1710); }
#hud.hero #heroTop > .flowrow { grid-column: 1 / -1; }
#shopReady { background: linear-gradient(#6a8a34, #3f5a1c); border-color: #9ec25a; color: #f4ffe0; }
#shopReady:hover:not(:disabled) { background: linear-gradient(#7fa23f, #4b6b22); }
#pauseOffer { border-color: #e0b44c; }
#offerConfirm { margin-top: 10px; }

#gameover .scroll { padding-bottom: 0; }
.go-actions { position: sticky; bottom: 0; z-index: 2; margin: 6px -40px 0; padding: 14px 40px 18px; text-align: center;
  background: linear-gradient(rgba(217,199,156,0), #d9c79c 16px); }
@media (max-height: 700px) { .go-actions { margin-left: -30px; margin-right: -30px; padding: 10px 30px 12px; } .scroll .go-primary { font-size: 24px; padding: 10px 56px; } }
.go-main { display: flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap; }
.scroll .go-primary { font-size: 30px; font-weight: 700; letter-spacing: 0.07em; padding: 14px 70px; border: 2px solid #1d0804; border-radius: 4px; color: #f8ebc8;
  background: linear-gradient(#7a2a1a, #4a140b 60%, #3b100a); box-shadow: 0 2px 0 #1d0804, 0 6px 18px rgba(60,20,8,0.5), inset 0 1px 0 rgba(255,214,150,0.35); }
.scroll .go-primary:hover:not(:disabled) { background: linear-gradient(#923320, #5a190e 60%, #46130b); border-color: #e0b44c; }
.scroll .go-primary:focus-visible, .scroll .go-small:focus-visible { outline: 3px solid #e0b44c; outline-offset: 2px; }
.scroll .go-small { font-size: 13.5px; padding: 6px 14px; letter-spacing: 0.02em; background: linear-gradient(#e6d6ac, #cdb680); color: #3b120b; border: 1px solid #8a6a3a; }
.scroll .go-small:hover:not(:disabled) { background: linear-gradient(#f0e2bc, #d8c28a); border-color: #5a1d12; }
.scroll .go-small.active { box-shadow: 0 0 0 2px #5a1d12 inset; }
.go-next { margin-top: 8px; font-size: 15px; font-style: italic; }
.go-key { display: inline-block; margin-left: 10px; padding: 0 7px; font: 600 11px/1.6 'EB Garamond', Georgia, serif; font-style: normal; color: #5a1d12;
  border: 1px solid rgba(90,29,18,0.55); border-bottom-width: 2px; border-radius: 3px; vertical-align: 1px; }
.go-class { margin-top: 8px; text-align: left; }
.go-class .classes { grid-template-columns: repeat(6, 1fr); }
.go-menu { margin-top: 4px; min-height: 8px; }
.scroll .go-link { background: none; border: none; color: #5a1d12; padding: 4px 10px; font-size: 13.5px; text-decoration: underline; letter-spacing: 0.02em; }
.scroll .go-link:hover:not(:disabled) { background: none; color: #2a0c06; }
`;
document.head.append(style);
