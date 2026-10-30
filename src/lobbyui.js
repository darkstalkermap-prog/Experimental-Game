// The seats and colours of a battle, on the screen: the room's list of castles (or of hero seats) with Take, Open / AI / Empty and Switch side, the
// Hero Game Mode's rows in the room (how to win, how many a side), the colour swatches, and the same choices for one player on the main menu.
// Only drawing and clicks: who may sit where is seats.js, and the room's host decides (main.js).
import { CLASSES } from './classes.js';
import { HERO } from './herogame.js';
import { PALETTE, COLOR_IDS, assignColors } from './teams.js';
import { HERO_SIZES, sideOfSeat, placeOfSeat, colorWants } from './seats.js';
import { lookText } from './unlocks.js';
import { lobbyRivalName } from './rivalsui.js';
import { WAR_DESC } from './warui.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (id) => (PALETTE[id] || PALETTE.blue).css;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
#lobbyList li.seat { align-items: center; flex-wrap: wrap; row-gap: 4px; }
#lobbyList li.seat .who { flex: 1 1 200px; text-align: right; }
#lobbyList li.seat.me { background: rgba(255,255,255,0.6); }
#lobbyList li.seat.closed .who { opacity: 0.7; }
#lobbyList li.seat.side2 { margin-top: 8px; }
#lobbyList li.seat.watchers { margin-top: 8px; border-left-color: rgba(90,29,18,0.35); background: transparent; font-size: 14px; }
#lobbyList li.seat.watchers b { font-weight: 600; opacity: 0.8; }
#lobbyList li.seat .act { display: flex; gap: 4px; margin-left: auto; }   /* (on a narrow row the buttons take a line of their own, at the right) */
#lobbyList li.seat .who i { display: block; line-height: 1.2; }
#lobbyList li.seat .st { display: inline-block; margin-top: 3px; font-style: normal; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 3px; background: rgba(0,0,0,0.12); white-space: nowrap; }
#lobbyList li.seat .st.open { background: rgba(60,140,60,0.22); }
#lobbyList li.seat .act button { font-size: 12px; padding: 2px 8px; }
.swatches { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; }
.swatches button.sw { width: 26px; height: 26px; padding: 0; border-radius: 50%; border: 2px solid rgba(0,0,0,0.45); background: var(--c) !important; box-shadow: none; }
.swatches button.sw.active { border-color: #fff; box-shadow: 0 0 0 2px #5a1d12 !important; }
.swatches button.sw:disabled { opacity: 0.25; }
.seatrow { align-items: center; }
#lobby .seatrow .qlabel { font-family: Cinzel, serif; font-size: 14px; margin-right: 4px; }
#lobby .seatrow button { padding: 5px 12px; font-size: 13px; }
#menu .setup #warFormat, #menu .setup .seatrow { order: 2; }   /* (the setup card orders its rows: these come after the Mode row and its own rows, before the map) */
.seatrow button i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--c); margin-right: 5px; vertical-align: -1px; }
.seatrow button small { opacity: 0.75; }
`;
  document.head.appendChild(s);
}

// a row of colour swatches: `mine` is the chosen one, `taken` maps a colour to who holds it (they cannot be picked)
function swatches(el, mine, taken, onPick) {
  el.className = 'swatches';
  el.innerHTML = COLOR_IDS.map((id) => {
    const who = taken.get(id);
    return `<button class="sw${id === mine ? ' active' : ''}" data-c="${id}" style="--c:${css(id)}" title="${esc(PALETTE[id].name)}${who ? ` (${esc(who)})` : ''}" aria-label="${esc(PALETTE[id].name)}"${who ? ' disabled' : ''}></button>`;
  }).join('');
  for (const b of el.querySelectorAll('button')) b.onclick = () => onPick(b.dataset.c);
}

// a row of buttons under a label, made once in `parent` before `before` (or at the end)
function row(id, label, parent, before = null) {
  let el = $(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'row seatrow seg';   // (seg: the page's chip buttons)
    if (before && before.parentNode === parent) parent.insertBefore(el, before); else parent.appendChild(el);
  }
  el.dataset.label = label;
  return el;
}
function buttons(el, label, items, onPick, disabled = false) {
  el.innerHTML = `<span class="qlabel">${esc(label)}</span>` + items.map((it) => `<button data-v="${esc(it.v)}"${it.active ? ' class="active"' : ''}${disabled || it.off ? ' disabled' : ''}${it.title ? ` title="${esc(it.title)}"` : ''}>${it.html}</button>`).join('');
  for (const b of el.querySelectorAll('button')) b.onclick = () => onPick(b.dataset.v);
}

// ---------------- the room ----------------
// v: { players: [{ team, hs, name, netId, cls, cos, col }], me (this page's netId: null on the host), host, hero: null | { size, seats, win }, slots,
//      coop, rv (the rival lords), problem (why the battle cannot start, or null) }
// on: { take(n), state(n), move(netId), color(id), size(n), win(id), watch(on) }   (n: a castle in a war, a seat in the Hero Game Mode)
// A player with `watch` watches the battle instead of playing (spectate.js): no castle or seat, a line of their own under the list.
export function drawLobby(v, on) {
  style();
  const hero = v.hero, all = v.players || [], players = all.filter((p) => !p.watch);
  const mine = all.find((p) => p.netId === v.me) || null;
  const house = assignColors(colorWants(players, !!hero));   // (the colours the battle will fly: an AI house takes what is left)
  // the mode row: Hero Mode joins Conquest and King of the Hill
  const objRow = $('lobbyObjective');
  if (objRow && !objRow.querySelector('[data-o=hero]')) {
    const b = document.createElement('button');
    b.dataset.o = 'hero';
    b.textContent = 'Hero Mode';
    objRow.appendChild(b);
  }
  if (objRow) {
    for (const b of objRow.querySelectorAll('button')) {
      b.classList.toggle('active', hero ? b.dataset.o === 'hero' : b.dataset.o === v.obj);
      b.disabled = !v.host;
      b.onclick = v.host && on.mode ? () => on.mode(b.dataset.o) : null;
    }
  }
  const war = !hero && v.obj === 'war';   // (War Mode: warmode.js; the room's castles are its armies, the Armies row is warui.js's)
  if (hero) $('lobbyObjDesc').textContent = `Hero Mode: ${hero.size} heroes against ${hero.size}, out of castles 1 and 2. You play only your hero; the armies march by themselves. A seat nobody takes is a hero bot.`;
  else if (war) $('lobbyObjDesc').textContent = `War Mode: ${WAR_DESC}`;
  for (const id of ['lobbyModes', 'lobbyMode']) { const el = $(id); if (el) el.classList.toggle('hidden', !!hero); }
  if ($('lobbyLength')) $('lobbyLength').classList.toggle('hidden', !!hero || war);   // (both have their own clock)
  if ($('lobbyWarFormat')) {
    $('lobbyWarFormat').classList.toggle('hidden', !war);
    for (const b of $('lobbyWarFormat').querySelectorAll('button')) b.disabled = !v.host;
  }
  // the Hero Game Mode's rows: how to win and how many a side
  const parent = objRow ? objRow.parentNode : $('lobbyList').parentNode;
  const after = $('lobbyObjDesc') ? $('lobbyObjDesc').nextSibling : null;
  const win = row('lobbyHeroWin', 'Win by', parent, after), size = row('lobbyHeroSize', 'Teams', parent, win.nextSibling);
  win.classList.toggle('hidden', !hero); size.classList.toggle('hidden', !hero);
  if (hero) {
    buttons(win, 'Win by', Object.entries(HERO.modes).map(([id, m]) => ({ v: id, html: esc(m.name), active: id === hero.win, title: m.desc })), (id) => on.win(id), !v.host);
    buttons(size, 'Teams', HERO_SIZES.map((n) => ({ v: n, html: `${n} v ${n}`, active: n === hero.size, off: players.length > 2 * n })), (n) => on.size(Number(n)), !v.host);
  }

  // the list: one line per castle, or per hero seat
  const lines = [];
  const holder = (p) => `${esc(p.name)}${p === mine ? ' (you)' : ''}${p.netId === null ? ' · host' : ''}${CLASSES[p.cls] ? ` · ${esc(CLASSES[p.cls].icon)} ${esc(CLASSES[p.cls].name)}` : ''}${lookText(p.cos) ? ` · <small>${esc(lookText(p.cos))}</small>` : ''}`;
  const tag = (state) => (state === 'open' ? '<em class="st open" title="A player who joins can sit here; an AI lord holds it if nobody does">open seat</em>' : '<em class="st">closed</em>');
  const acts = (n, p, state, free) => {
    const a = [];
    if (!p && free && state === 'open' && mine) a.push(`<button data-take="${n}" title="Sit here">Take</button>`);
    if (!p && v.host) a.push(`<button data-state="${n}" title="Who sits here when nobody does: open for a player, an AI, or nobody (click to change)">Seat: ${state === 'open' ? 'Open' : state === 'ai' ? (hero ? 'Bot' : 'AI') : 'Empty'}</button>`);
    if (p && v.host && hero && p.netId !== null) a.push(`<button data-move="${esc(p.netId)}" title="Move to the other side">Switch side</button>`);
    return a.length ? ` <span class="act">${a.join(' ')}</span>` : '';   // (spaces between the parts: the row reads as words, also to a screen reader or a copy)
  };
  if (!hero) {
    const twoTeams = v.coop && players.length >= 4, warTeams = war && !v.coop && v.war && v.war.format === 'teams';   // (co-op of four: 1 + 2 against 3 + 4; War Mode's two against two: 1 + 3 against 2 + 4)
    for (let t = 0; t < 4; t++) {
      const p = players.find((q) => q.team === t) || null, state = v.slots[t];
      const c = css(house[t]);
      const who = p ? holder(p)
        : state === 'empty' ? `<i>${war ? 'No army' : 'Empty castle'}</i> ${tag('closed')}`
          : `<i>AI lord${v.coop ? ' (enemy)' : ''}${!war && lobbyRivalName(t, v.rv) ? ' · ' + esc(lobbyRivalName(t, v.rv)) : ''}</i> ${tag(state)}`;
      lines.push(`<li class="seat${p && p === mine ? ' me' : ''}${!p && state !== 'open' ? ' closed' : ''}" style="border-left-color:${c}"><b style="color:${c}">${war ? 'Army' : 'Castle'} ${t + 1} · ${esc(PALETTE[house[t]].name)}${twoTeams || warTeams ? ` <small>· team ${twoTeams ? (t < 2 ? 1 : 2) : (t % 2) + 1}</small>` : ''}</b> <span class="who">${who}</span>${acts(t, p, state, true)}</li>`);
    }
  } else {
    for (const side of [0, 1]) {
      const c = css(house[side]);
      for (let i = 0; i < hero.size; i++) {
        const s = side * 4 + i, p = players.find((q) => q.hs === s) || null, state = hero.seats[s];
        const who = p ? holder(p) : state === 'empty' ? `<i>Nobody</i> ${tag('closed')}` : `<i>Hero bot</i> ${tag(state)}`;
        lines.push(`<li class="seat${p && p === mine ? ' me' : ''}${!p && state !== 'open' ? ' closed' : ''}${side && !i ? ' side2' : ''}" style="border-left-color:${c}"><b style="color:${c}">${esc(PALETTE[house[side]].name)} · ${placeOfSeat(s) + 1}</b> <span class="who">${who}</span>${acts(s, p, state, true)}</li>`);
      }
    }
  }
  // who watches, and the switch for this page (a quiet line under the places)
  const watching = all.filter((p) => p.watch);
  const watchBtn = !mine ? '' : mine.watch ? '<button data-watch="0" title="Take a free place and play">Play instead</button>' : '<button data-watch="1" title="Hold no castle or hero: watch the battle with the spectator cameras">Watch instead</button>';
  lines.push(`<li class="seat watchers"><b>Watching</b> <span class="who">${watching.length ? watching.map((p) => `${esc(p.name)}${p === mine ? ' (you)' : ''}${p.netId === null ? ' · host' : ''}`).join(', ') : '<i>nobody</i>'}</span>${watchBtn ? ` <span class="act">${watchBtn}</span>` : ''}</li>`);
  const list = $('lobbyList');
  list.innerHTML = lines.join('');
  for (const b of list.querySelectorAll('[data-watch]')) b.onclick = () => on.watch && on.watch(b.dataset.watch === '1');
  for (const b of list.querySelectorAll('[data-take]')) b.onclick = () => on.take(Number(b.dataset.take));
  for (const b of list.querySelectorAll('[data-state]')) b.onclick = () => on.state(Number(b.dataset.state));
  for (const b of list.querySelectorAll('[data-move]')) b.onclick = () => on.move(b.dataset.move);

  // your colour: the ones other players fly cannot be picked
  let sw = $('lobbyColors');
  if (!sw) {
    const wrap = document.createElement('div');
    // (at the top of the column, above the hero cards: on a short window it must not end up below the fold)
    wrap.innerHTML = '<h3 class="section" style="margin-top:0">Your colour</h3><div id="lobbyColors"></div><div class="note" id="lobbyColorNote"></div>';
    $('lobbyClassPick').parentNode.prepend(wrap);
    sw = $('lobbyColors');
  }
  const taken = new Map(players.filter((p) => p !== mine && p.col).map((p) => [p.col, p.name]));
  swatches(sw, mine && mine.col, taken, (id) => on.color(id));
  const note = $('lobbyColorNote');
  if (note) {
    const lead = hero && mine && mine.hs >= 0 ? players.filter((p) => p.hs >= 0 && sideOfSeat(p.hs) === sideOfSeat(mine.hs)).sort((a, b) => a.hs - b.hs)[0] : null;
    note.textContent = lead && lead !== mine ? `In Hero Mode a side flies one colour: yours is ${lead.name}'s (${PALETTE[house[sideOfSeat(mine.hs)]].name}).` : '';
  }
  const pr = $('lobbyProblem') || (() => { const d = document.createElement('div'); d.id = 'lobbyProblem'; d.className = 'note'; $('lobbyHostCtl').before(d); return d; })();
  pr.textContent = v.problem || '';
  const start = $('startOnline');
  if (start) start.disabled = !!v.problem;
}

// ---------------- the main menu (one player) ----------------
// v: { hero (bool), war (bool: War Mode, the castles are armies), slot (your castle in a war), side (your side in a hero match), slots (the war's castles: 'open' | 'ai' | 'empty'), size, color }
// on: { slot(t), side(s), state(t), size(n), color(id) }
export function drawSolo(v, on) {
  style();
  const anchor = $('difficulty');
  if (!anchor) return;
  const parent = anchor.parentNode;
  const play = row('soloSeat', 'Castle', parent, anchor);
  const rivals = row('soloRivals', 'Others', parent, anchor);
  const size = row('soloSize', 'Teams', parent, anchor);
  const col = row('soloColor', 'Colour', parent, anchor);
  const wants = [null, null, null, null];
  wants[v.hero ? v.side : v.slot] = v.color;
  const house = assignColors(wants);
  const chip = (t, extra = '') => `<i style="--c:${css(house[t])}"></i>${t + 1}${extra}`;
  if (v.hero) {
    buttons(play, 'Side', [0, 1].map((s) => ({ v: s, html: chip(s, s === v.side ? '<small>you</small>' : ''), active: s === v.side, title: `Fight for castle ${s + 1}` })), (s) => on.side(Number(s)));
    buttons(size, 'Teams', HERO_SIZES.map((n) => ({ v: n, html: `${n} v ${n}`, active: n === v.size, title: `${n} heroes a side: you and ${n - 1} bot${n > 2 ? 's' : ''} against ${n}` })), (n) => on.size(Number(n)));
  } else {
    buttons(play, v.war ? 'Army' : 'Castle', [0, 1, 2, 3].map((t) => ({ v: t, html: chip(t, t === v.slot ? '<small>you</small>' : ''), active: t === v.slot, title: `Lead ${v.war ? 'army' : 'castle'} ${t + 1}` })), (t) => on.slot(Number(t)));
    buttons(rivals, 'Others', [0, 1, 2, 3].filter((t) => t !== v.slot).map((t) => ({ v: t, html: chip(t, `<small>${v.slots[t] === 'empty' ? 'empty' : 'AI lord'}</small>`), active: v.slots[t] !== 'empty', title: v.slots[t] === 'empty' ? `Castle ${t + 1} stands empty: click to give it an AI lord` : `An AI lord holds castle ${t + 1}: click to leave it empty` })), (t) => on.state(Number(t)));
  }
  rivals.classList.toggle('hidden', !!v.hero);
  size.classList.toggle('hidden', !v.hero);
  col.innerHTML = '<span class="qlabel">Colour</span><span></span>';
  swatches(col.lastChild, v.color, new Map(), (id) => on.color(id));
}
