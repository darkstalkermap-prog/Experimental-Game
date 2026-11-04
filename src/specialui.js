// The Specialty Battles card of the main menu: under the Battle setup, one big button for each battle of specialty.js with what it is ("1 vs 3") and its
// blurb beside it. A click starts the battle at once with the hero and the difficulty chosen on the menu (main.js startSpecial); a quiet Watch button
// watches it instead. The battle Quick Play would start is marked (inked in, as the chosen buttons of the setup are). Single player only, and the tooltips say so.
// A battle that sets its armies' races (specialty.js `races`, `foes`) has a Your army row under it: only the races it offers, and whom they face.
import { SPECIALTY, specialRace } from './specialty.js';
import { RACES, raceName } from './races.js';

const $ = (id) => document.getElementById(id);

const CSS = `
#menu .cols > .col-stack { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
#specialCard { padding-bottom: 12px; }
#specialCard .sp-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 14px; align-items: center; }
#specialCard .sp-row + .sp-row { margin-top: 10px; padding-top: 10px; border-top: 1px dotted rgba(138,106,58,0.35); }
#specialCard .sp-pick { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 9px 14px 8px; text-align: left; background: var(--chip); color: var(--wine);
  border: 1px solid #8a6a3a; box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset; }
#specialCard .sp-pick:hover { background: linear-gradient(#fbf3de, #eadbb4); border-color: var(--wine); }
#specialCard .sp-pick.active { background: linear-gradient(#6a2416, #46140b); color: #f8ebc8; border-color: #2a0c06; box-shadow: inset 0 0 0 1px rgba(224,180,76,0.65); }
#specialCard .sp-name { font: 700 16px Cinzel, Georgia, serif; letter-spacing: 0.04em; white-space: nowrap; }
#specialCard .sp-name i { font-style: normal; margin-right: 6px; }
#specialCard .sp-fmt { font: 14px 'EB Garamond', Georgia, serif; letter-spacing: 0; opacity: 0.85; }
#specialCard .sp-blurb { margin: 0; font-size: 15px; line-height: 1.3; color: #3a2a16; }
#specialCard .sp-blurb button { margin-left: 6px; padding: 2px 10px; font-size: 12.5px; letter-spacing: 0.04em; vertical-align: 1px; background: rgba(255,250,235,0.5); color: var(--wine); border: 1px solid rgba(90,29,18,0.4); }
#specialCard .sp-blurb button:hover { background: var(--wine); color: #f6e8c6; }
#specialCard .sp-races { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 14px; color: #3a2a16; }
#specialCard .sp-races .sp-lbl { font: 600 13px Cinzel, Georgia, serif; letter-spacing: 0.06em; color: var(--wine); margin-right: 4px; }
#specialCard .sp-races button { font-size: 14px; padding: 5px 11px; }
#specialCard .sp-races button.active, #specialCard .sp-races button.active:hover { background: linear-gradient(#6a2416, #46140b); color: #f8ebc8; border-color: #2a0c06; }
#specialCard .sp-races .sp-vs { margin-left: 6px; font-style: italic; opacity: 0.85; }
@media (max-width: 560px) { #specialCard .sp-row { grid-template-columns: 1fr; } }
`;

// put the card in: `start(id)` plays a battle, `watch(id)` watches it, `race(id)` picks your army's race (main.js)
export function initSpecialMenu({ start, watch, race }) {
  if ($('specialCard')) return;
  const st = document.createElement('style');
  st.id = 'cw-specialui';
  st.textContent = CSS;
  document.head.append(st);
  const card = document.createElement('div');
  card.id = 'specialCard';
  card.className = 'col special card-p';
  const head = document.createElement('div');
  head.className = 'ph';
  const h = document.createElement('h3');
  h.textContent = 'Specialty Battles';
  head.append(h);
  card.append(head);
  for (const s of Object.values(SPECIALTY)) {
    const row = document.createElement('div');
    row.className = 'sp-row';
    const b = document.createElement('button');
    b.className = 'sp-pick';
    b.dataset.sp = s.id;
    b.title = `${s.how} Single player. Your hero and the difficulty are the ones chosen here.`;
    const name = document.createElement('span');
    name.className = 'sp-name';
    const ic = document.createElement('i');
    ic.textContent = s.icon;
    name.append(ic, s.name);
    const fmt = document.createElement('span');
    fmt.className = 'sp-fmt';
    fmt.textContent = `${s.format} · single player`;
    b.append(name, fmt);
    b.addEventListener('click', () => start(s.id));
    const blurb = document.createElement('p');
    blurb.className = 'sp-blurb';
    blurb.append(s.blurb);
    const w = document.createElement('button');
    w.textContent = 'Watch';
    w.title = `Watch ${s.name} played by AI lords on every side (you hold no hero).`;
    w.addEventListener('click', () => watch(s.id));
    blurb.append(w);
    row.append(b, blurb);
    if (s.races && s.foes) {
      // your army's race for this battle: only the ones it offers (the menu's Your army row has them all)
      const rr = document.createElement('div');
      rr.className = 'sp-races seg';   // (seg: the page's chip buttons, the chosen one inked in)
      rr.setAttribute('role', 'group');
      rr.setAttribute('aria-label', `${s.name}: your army`);
      const lbl = document.createElement('span');
      lbl.className = 'sp-lbl';
      lbl.textContent = 'Your army';
      rr.append(lbl);
      for (const id of s.races) {
        const r = RACES.find((x) => x.id === id);
        const rb = document.createElement('button');
        rb.dataset.race = id;
        rb.textContent = r ? r.name : id;
        rb.title = `${raceName(id)} hold ${s.name}. Only the look: every soldier fights the same.`;
        rb.addEventListener('click', () => race && race(id));
        rr.append(rb);
      }
      const vs = document.createElement('span');
      vs.className = 'sp-vs';
      vs.textContent = `against ${raceName(s.foes)}`;
      rr.append(vs);
      row.append(rr);
    }
    card.append(row);
  }
  // under the Battle setup, in the same column (the two cards stacked: the hero's card beside them)
  const setup = document.querySelector('#menu .cols > .setup');
  if (!setup) { const cols = document.querySelector('#menu .cols'); if (cols) cols.append(card); return; }
  const stack = document.createElement('div');
  stack.className = 'col-stack';
  setup.before(stack);
  stack.append(setup, card);
}

// mark the battle Quick Play would start ('' : none of them)
export function showSpecialPick(id) {
  for (const b of document.querySelectorAll('#specialCard .sp-pick')) b.classList.toggle('active', b.dataset.sp === id);
}

// mark the race each battle's army would take, from the player's own (`mine`: the menu's Your army; a race a battle does not offer falls back to its first)
export function showSpecialRace(mine) {
  for (const b of document.querySelectorAll('#specialCard .sp-races button')) {
    const id = b.closest('.sp-row').querySelector('.sp-pick').dataset.sp;
    b.classList.toggle('active', b.dataset.race === specialRace(id, mine));
  }
}
