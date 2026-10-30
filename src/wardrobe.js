// The Renown panel of the main menu: how much Renown there is, what comes next and how far off it is, every banner, cloak and capstone talent (the ones
// still locked say how much Renown they need), what is worn, the mastery of each hero class and the personal bests. Mouse only. The button that opens it
// is added to the menu here (next to Options and Controls), so the menu's own markup is not touched.
import { progress, trackInfo, renownTo, rankOf, BESTS, MASTERY_CLASSES } from './progress.js';
import { ITEMS, ITEM_BY_KEY, itemTitle } from './unlocks.js';
import { previewCanvas, armsBanner } from './cosmetics.js';
import { FREE_SIGILS, BANNERS, DIVISIONS, TINTS, sigilName } from './unlocks.js';
import { armsOf, armsCanvas, css } from './heraldry.js';
import { TEAM_COLORS } from './config.js';
import { CLASSES } from './classes.js';
import { clockText } from './matchlog.js';

const CSS = `
.classes button { position: relative; }
.classes button .mrk { position: absolute; top: 2px; right: 3px; min-width: 17px; padding: 0 3px; border-radius: 9px; background: #e0b44c; color: #3a1d08; font: 700 10px/16px Cinzel, serif; font-style: normal; text-align: center; box-shadow: 0 0 0 1px rgba(60,30,8,0.6); }
#renownBtn { position: relative; }
#renownBtn small { margin-left: 8px; opacity: 0.8; font-size: 12px; letter-spacing: 0; }
#renownBtn .dot { position: absolute; top: -5px; right: -5px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 9px; background: #e0b44c; color: #3a1d08; font: 700 11px/16px Cinzel, serif; text-align: center; box-shadow: 0 0 6px rgba(224,180,76,0.9); }
#wardrobe .scroll { max-width: 1040px; padding: 26px 34px 0; }
#wardrobe h1 { font-size: 38px; }
#wardrobe .sub { max-width: 720px; margin: 2px auto 14px; font-size: 15.5px; line-height: 1.35; }
.wd-top { display: grid; grid-template-columns: auto 1fr auto; gap: 8px 22px; align-items: center; padding: 10px 16px; border: 1px solid rgba(90,60,20,0.4); border-radius: 5px; background: rgba(255,248,226,0.4); }
.wd-total { text-align: center; }
.wd-total b { display: block; font: 700 34px/1.1 Cinzel, serif; color: #7a4a0a; }
.wd-total span { font-size: 14px; }
.wd-next b { font: 600 17px Cinzel, serif; color: #5a1d12; }
.wd-next p { margin: 2px 0 6px; font-size: 14.5px; }
.wd-bar { position: relative; height: 12px; background: rgba(60,40,15,0.3); border-radius: 6px; overflow: hidden; }
.wd-bar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(#e8c25a, #b8862a); border-radius: 6px; transition: width .5s; }
.wd-next small { display: block; margin-top: 3px; font-size: 14px; }
.wd-worn { display: flex; gap: 10px; align-items: flex-end; }
.wd-worn figure { margin: 0; text-align: center; font-size: 12px; }
.wd-worn canvas { display: block; border-radius: 3px; box-shadow: 0 1px 5px rgba(0,0,0,0.45); background: rgba(255,255,255,0.25); }
#wardrobe .cols { margin-top: 4px; }
#wardrobe h3.section { margin: 16px 0 8px; padding-bottom: 5px; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; text-align: left; border-bottom: 1px solid rgba(138,106,58,0.45); }
#wardrobe h3.section small { font: italic 14px 'EB Garamond', Georgia, serif; letter-spacing: 0; text-transform: none; color: #4a3a22; margin-left: 8px; }
.wd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 7px; }
.wd-card { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 4px 6px; text-align: center; background: rgba(255,255,255,0.3) !important; color: #2a1f14 !important; border: 1px solid rgba(90,60,20,0.35) !important; border-radius: 4px; letter-spacing: 0; position: relative; min-height: 128px; }
.wd-card:hover:not(:disabled) { background: rgba(255,246,210,0.7) !important; border-color: #b8862a !important; }
.wd-card canvas { width: 42px; height: 63px; border-radius: 2px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
.wd-card b { font: 600 13px/1.15 Cinzel, serif; }
.wd-card small { font: 13px/1.15 'EB Garamond', Georgia, serif; opacity: 0.85; }
.wd-card.worn { border: 2px solid #b8862a !important; background: linear-gradient(#fff6d2, #efd88f) !important; box-shadow: 0 0 10px rgba(224,180,76,0.7); }
.wd-card.worn small { color: #7a1414; font-weight: 600; opacity: 1; }
.wd-card.locked { cursor: default; }
.wd-card.locked canvas { filter: grayscale(1) brightness(0.8); opacity: 0.55; }
.wd-card.locked b, .wd-card.locked small { opacity: 0.6; }
.wd-card.next { border: 1px dashed #8c1f24 !important; }
.wd-card.next small { color: #7a1414; opacity: 1; }
.wd-card .lock { position: absolute; top: 28px; left: 50%; transform: translateX(-50%); font-size: 20px; filter: none; opacity: 0.9; }
.wd-card .nw { position: absolute; top: 3px; right: 3px; padding: 1px 4px; font: 700 9px/1.3 Cinzel, serif; letter-spacing: 0.06em; background: #8c1f24; color: #f6e8c0; border-radius: 2px; }
.wd-note { font-size: 14px; margin: 6px 2px 0; opacity: 0.85; }
.wd-alts { display: grid; gap: 6px; }
.wd-alt { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 0 10px; align-items: center; padding: 5px 8px; border: 1px solid rgba(90,60,20,0.3); border-radius: 4px; background: rgba(255,255,255,0.25); }
.wd-alt canvas { grid-row: 1 / span 3; width: 38px; height: 38px; }
.wd-alt b { font: 600 14px Cinzel, serif; }
.wd-alt span { font-size: 14px; line-height: 1.2; }
.wd-alt small { font-size: 13px; opacity: 0.8; font-style: italic; }
.wd-alt.locked { opacity: 0.62; }
.wd-alt.have small { color: #2c5a12; font-style: normal; font-weight: 600; opacity: 1; }
.wd-mrow { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 1px 10px; align-items: center; margin-bottom: 6px; }
.wd-seal { grid-row: 1 / span 2; width: 34px; height: 34px; border-radius: 50%; border: 3px solid var(--c, #8a6a3a); background: radial-gradient(#fff6d6, #e6cf94); display: grid; place-items: center; font: 700 13px Cinzel, serif; color: #3a2a12; }
.wd-mrow b { font: 600 14.5px Cinzel, serif; }
.wd-mrow em { font-style: normal; font-size: 13.5px; opacity: 0.85; }
.wd-mrow .wd-bar { grid-column: 2 / -1; height: 8px; }
.wd-mrow .wd-bar i { background: linear-gradient(#8f6bd8, #5a3aa8); }
.wd-recs { width: 100%; border-collapse: collapse; font-size: 15px; }
.wd-recs td { padding: 3px 4px; border-bottom: 1px solid rgba(90,60,20,0.2); }
.wd-recs td:last-child { text-align: right; font: 600 15px Cinzel, serif; }
.wd-acct { font-size: 14px; margin-top: 8px; opacity: 0.85; }
#wardrobe .scroll > .row:last-child { position: sticky; bottom: 0; z-index: 2; margin: 14px -34px 0; padding: 12px 34px 16px; background: linear-gradient(rgba(217,199,156,0), #d9c79c 14px); }   /* (Back stays in view) */
@media (max-width: 700px) { .wd-top { grid-template-columns: 1fr; } }
.wd-arms { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.wd-arms .pv { display: flex; gap: 14px; align-items: flex-end; justify-content: center; padding: 8px; border: 1px solid rgba(90,60,20,0.35); border-radius: 4px; background: rgba(255,255,255,0.3); }
.wd-arms .pv canvas { display: block; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.45)); }
.wd-arms h4 { margin: 0 0 4px; font: 600 12px Cinzel, serif; letter-spacing: 0.12em; text-transform: uppercase; color: #5a1d12; }
.wd-arms h4 small { font: italic 13px 'EB Garamond', Georgia, serif; letter-spacing: 0; text-transform: none; color: #4a3a22; margin-left: 6px; }
.wd-row { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 9px; }
.wd-sig { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; width: 56px; min-height: 0; padding: 4px 2px 3px; background: rgba(255,255,255,0.3) !important; color: #2a1f14 !important; border: 1px solid rgba(90,60,20,0.35) !important; border-radius: 4px; letter-spacing: 0; }
.wd-sig:hover:not(.locked) { background: rgba(255,246,210,0.75) !important; border-color: #b8862a !important; }
.wd-sig canvas { width: 34px; height: 41px; }
.wd-sig b { font: 600 10.5px/1.1 Cinzel, serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 54px; }
.wd-sig.worn { border: 2px solid #b8862a !important; background: linear-gradient(#fff6d2, #efd88f) !important; box-shadow: 0 0 8px rgba(224,180,76,0.7); }
.wd-sig.locked { cursor: default; }
.wd-sig.locked canvas { filter: grayscale(1) brightness(0.85); opacity: 0.5; }
.wd-sig.locked b { opacity: 0.6; }
.wd-sig .lock { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); font-size: 15px; }
.wd-sig .nw { position: absolute; top: 1px; right: 1px; padding: 0 3px; font: 700 8px/1.4 Cinzel, serif; background: #8c1f24; color: #f6e8c0; border-radius: 2px; }
.wd-div canvas { width: 30px; height: 36px; }
.wd-tint { width: 30px; height: 30px; padding: 0; border-radius: 50%; border: 2px solid rgba(60,40,15,0.5) !important; box-shadow: inset 0 -3px 6px rgba(0,0,0,0.25); }
.wd-tint.worn { border: 3px solid #fff6d2 !important; box-shadow: 0 0 0 2px #b8862a, 0 0 8px rgba(224,180,76,0.8); }

`;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const num = (n) => Math.round(n).toLocaleString('en-US');
const NAMES = () => Object.fromEntries(Object.entries(CLASSES).map(([id, c]) => [id, c.name]));

let panel = null, open = false;

// (the style is in the page from the start: the button of the menu and the badges of the class buttons use it before the panel is ever opened)
function injectCss() {
  if (document.getElementById('cw-wardrobe')) return;
  const st = el('style'); st.id = 'cw-wardrobe'; st.textContent = CSS; document.head.appendChild(st);
}

function build() {
  if (panel) return panel;
  panel = el('div', 'screen hidden'); panel.id = 'wardrobe';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Renown');
  document.body.appendChild(panel);
  return panel;
}

// "340 / 500 to unlock the Wolf banner"-style words for the next step
function nextLine(a) {
  const t = trackInfo(a);
  if (t.done) return 'Every unlock is yours. Renown keeps counting.';
  return `${num(t.carry)} / ${num(t.cost)} to unlock the ${itemTitle(t.next, NAMES())}`;
}

function itemCard(a, it, wornId, onWear) {
  const have = a.unlocked.includes(it.key);
  const nextKey = (trackInfo(a).next || {}).key;
  const card = el('button', 'wd-card');
  card.type = 'button';
  card.dataset.item = it.key;
  card.append(previewCanvas(it, 92, 138, 0));
  card.append(el('b', '', it.name));
  const small = el('small');
  if (have) {
    const worn = wornId === it.id;
    card.classList.toggle('worn', worn);
    small.textContent = worn ? 'Worn' : 'Click to wear';
    card.title = `${it.name}: ${it.blurb}`;
    card.addEventListener('click', () => onWear(it.id));
    if (a.unlocked.indexOf(it.key) >= a.seen) card.append(el('span', 'nw', 'NEW'));
  } else {
    card.classList.add('locked');
    card.disabled = false;
    card.setAttribute('aria-disabled', 'true');
    if (it.key === nextKey) card.classList.add('next');
    small.textContent = `${num(renownTo(a, it.key))} Renown to go`;
    card.title = `${it.name}: ${it.blurb}`;
    card.append(el('span', 'lock', '🔒'));
  }
  card.append(small);
  return card;
}

function render() {
  const a = progress.get();
  const p = build();
  p.textContent = '';
  const sc = el('div', 'scroll wide');
  sc.append(el('h1', '', 'Renown'));
  sc.append(el('div', 'sub', 'Every match earns Renown, won or lost (about 80 to 250 of it). It never runs out and nothing has to be kept up. What it unlocks is for show, or a different choice, never a stronger one.'));
  // the top: total, the next unlock, what is worn
  const top = el('div', 'wd-top');
  const tot = el('div', 'wd-total'); tot.append(el('b', '', num(a.renown)), el('span', '', 'Renown in all'));
  const t = trackInfo(a);
  const nx = el('div', 'wd-next');
  if (t.done) { nx.append(el('b', '', 'Everything is unlocked'), el('p', '', `All ${ITEMS.length} unlocks are yours. Renown keeps counting.`)); }
  else {
    nx.append(el('b', '', `Next: ${itemTitle(t.next, NAMES())}`), el('p', '', t.next.kind === 'capstone' ? t.next.def.desc : t.next.blurb));
    const bar = el('div', 'wd-bar'); const fill = el('i'); fill.style.width = `${t.frac * 100}%`; bar.append(fill);
    nx.append(bar, el('small', '', nextLine(a)));
  }
  const worn = el('div', 'wd-worn');
  const fig = (label, canvas) => { const f = el('figure'); f.append(canvas, el('figcaption', '', label)); return f; };
  const cloak = ITEM_BY_KEY[`cloak:${a.equipped.cloak}`];
  worn.append(fig(a.equipped.banner ? `${sigilName(a.equipped.banner)} banner` : 'House banner', armsBanner(armsOf(a.equipped), 56, 84, 0)));
  worn.append(fig(cloak ? cloak.name : 'No cloak', cloak ? previewCanvas(cloak, 60, 84, 0) : previewCanvas({ kind: 'cloak', id: 'none' }, 60, 84, 0)));
  top.append(tot, nx, worn);
  sc.append(top);

  const cols = el('div', 'cols');
  const left = el('div', 'col'), right = el('div', 'col');
  const wear = (kind) => (id) => { progress.equip(kind, id); progress.markSeen(); render(); };
  // the arms: sigil, field and tint (heraldry.js), with the banner and the shield they make
  left.append(armsSection(a));
  // cloaks
  const ch = el('h3', 'section', 'Cloaks'); ch.append(el('small', '', 'other players see it on your hero'));
  left.append(ch);
  const cg = el('div', 'wd-grid');
  const defC = el('button', 'wd-card' + (a.equipped.cloak ? '' : ' worn')); defC.type = 'button'; defC.dataset.item = 'cloak:';
  defC.append(previewCanvas({ kind: 'cloak', id: 'none' }, 92, 138, 0), el('b', '', 'None'), el('small', '', a.equipped.cloak ? 'Click to wear' : 'Worn'));
  defC.addEventListener('click', () => wear('cloak')(''));
  cg.append(defC);
  for (const it of ITEMS.filter((x) => x.kind === 'cloak')) cg.append(itemCard(a, it, a.equipped.cloak, wear('cloak')));
  left.append(cg);
  left.append(el('div', 'wd-note', 'In first person you cannot see your own back: a cloak shows on your hero to the other players of an online game, with your sigil on it. Your arms fly over your castle and show on your shield and your soldiers. AI lords keep the arms of their houses.'));
  // mastery
  right.append(el('h3', 'section', 'Class mastery'));
  for (const id of MASTERY_CLASSES) {
    const C = CLASSES[id]; if (!C) continue;
    const r = rankOf(a.mastery[id] || 0);
    const row = el('div', 'wd-mrow'); row.style.setProperty('--c', C.color);
    row.dataset.cls = id;
    row.append(el('div', 'wd-seal', r.roman));
    const nm = el('div'); nm.append(el('b', '', `${C.icon} ${C.name}`), ` · ${r.name}`);
    row.append(nm, el('em', '', r.max ? 'highest rank' : `${num(r.into)} / ${num(r.span)}`));
    const bar = el('div', 'wd-bar'); const fill = el('i'); fill.style.width = `${r.frac * 100}%`; bar.append(fill);
    row.append(bar);
    right.append(row);
  }
  right.append(el('div', 'wd-note', 'Each match adds mastery to the class you played. Ranks only go up; they open nothing, they are yours.'));
  // capstones
  const th = el('h3', 'section', 'Capstone talents'); th.append(el('small', '', 'a different choice for level 5, never a stronger one'));
  right.append(th);
  const alts = el('div', 'wd-alts');
  const names = NAMES();
  for (const it of ITEMS.filter((x) => x.kind === 'capstone')) {
    const have = a.unlocked.includes(it.key);
    const row = el('div', 'wd-alt ' + (have ? 'have' : 'locked'));
    row.dataset.item = it.key;
    row.append(previewCanvas(it, 38, 38, 0));
    row.append(el('b', '', `${it.name} · ${names[it.cls] || it.cls}`));
    row.append(el('span', '', it.def.desc));
    row.append(el('small', '', have ? 'Yours: choose it in the talent panel instead of the usual capstone' : `${num(renownTo(a, it.key))} Renown to go`));
    alts.append(row);
  }
  right.append(alts);

  // records
  right.append(el('h3', 'section', 'Your records'));
  const tbl = el('table', 'wd-recs');
  for (const b of BESTS) {
    const v = a.best[b.key];
    const tr = el('tr'); tr.append(el('td', '', b.label), el('td', '', v ? (b.key === 'fastWin' ? clockText(v) : num(v)) : '-'));
    tbl.append(tr);
  }
  right.append(tbl);
  right.append(el('div', 'wd-acct', `${num(a.tot.matches)} matches fought, ${num(a.tot.wins)} won · ${Math.floor(a.tot.secs / 3600)} h ${Math.floor((a.tot.secs % 3600) / 60)} min on the field · ${num(a.tot.kills)} kills`));
  cols.append(left, right);
  sc.append(cols);
  const row = el('div', 'row'); const back = el('button', '', 'Back'); back.id = 'wardrobeBack'; back.addEventListener('click', close);
  row.append(back);
  sc.append(row);
  p.append(sc);
}

// The arms: the banner and shield they make, then a row of sigils (the house's own, the free ones, then the ones Renown unlocks: locked ones say
// how far off they are), the divisions of the field and the second tints. A click wears it at once (progress.js keeps it).
function armsSection(a) {
  const box = el('div');
  const h = el('h3', 'section', 'Your arms'); h.append(el('small', '', 'on your castle, your soldiers, your shield and your cloak'));
  box.append(h);
  const arms = armsOf(a.equipped), house = TEAM_COLORS[0];
  const wrap = el('div', 'wd-arms');
  const pv = el('div', 'pv'); pv.title = 'Your banner and your shield, in the colour of your house';
  pv.append(armsBanner(arms, 64, 128, 0), armsCanvas(arms, house, 0, 84, 100));
  const ctl = el('div');
  const wear = (kind, id) => { progress.equip(kind, id); progress.markSeen(); render(); };
  const head = (text, note) => { const e = el('h4', '', text); if (note) e.append(el('small', '', note)); return e; };
  // sigils
  ctl.append(head('Sigil', 'the free ones, and more with Renown'));
  const sr = el('div', 'wd-row');
  const nextKey = (trackInfo(a).next || {}).key;
  const sig = (id, name, item) => {
    const open = !item || a.unlocked.includes(item.key);
    const b = el('button', 'wd-sig wd-card' + (arms.sig === id ? ' worn' : '') + (open ? '' : ' locked'));
    b.type = 'button';
    b.dataset.item = item ? item.key : `sigil:${id}`;
    b.append(armsCanvas({ ...arms, sig: id }, house, 0, 68, 82), el('b', '', name));
    if (open) {
      b.title = arms.sig === id ? `${name}: worn` : `${name}: click to bear it`;
      b.addEventListener('click', () => wear('banner', id));
      if (item && a.unlocked.indexOf(item.key) >= a.seen) b.append(el('span', 'nw', 'NEW'));
    } else {
      b.setAttribute('aria-disabled', 'true');
      if (item.key === nextKey) b.classList.add('next');
      b.title = `${name}: ${num(renownTo(a, item.key))} Renown to go. ${item.blurb}`;
      b.append(el('span', 'lock', '🔒'));
    }
    return b;
  };
  sr.append(sig('', 'House', null));
  for (const s of FREE_SIGILS) sr.append(sig(s.id, s.name, null));
  for (const bn of BANNERS) sr.append(sig(bn.id, bn.name, ITEM_BY_KEY[`banner:${bn.id}`]));
  ctl.append(sr);
  // the field
  ctl.append(head('Field', 'how it is divided'));
  const dr = el('div', 'wd-row');
  for (const d of DIVISIONS) {
    const b = el('button', 'wd-sig wd-div' + (arms.div === d.id ? ' worn' : ''));
    b.type = 'button'; b.dataset.div = d.id; b.title = d.name;
    b.append(armsCanvas({ ...arms, div: d.id, sig: arms.sig || '' }, house, 0, 60, 72), el('b', '', d.name));
    b.addEventListener('click', () => wear('div', d.id));
    dr.append(b);
  }
  ctl.append(dr);
  // the tint
  ctl.append(head('Tint', arms.div === 'plain' ? 'the colour of the sigil' : 'the other part of the field'));
  const tr = el('div', 'wd-row');
  for (const t of TINTS) {
    const b = el('button', 'wd-tint' + (arms.tint === t.id ? ' worn' : ''));
    b.type = 'button'; b.dataset.tint = t.id; b.title = t.name; b.setAttribute('aria-label', t.name);
    b.style.background = css(t.hex);
    b.addEventListener('click', () => wear('tint', t.id));
    tr.append(b);
  }
  ctl.append(tr);
  wrap.append(pv, ctl);
  box.append(wrap);
  return box;
}

function show() {
  render();
  panel.classList.remove('hidden');
  open = true;
  progress.markSeen();
  refreshButton();
}
function close() {
  if (!panel) return;
  panel.classList.add('hidden');
  open = false;
  refreshButton();
}

// the button in the menu: "Renown  340 / 500", with a dot while there are unlocks you have not looked at
function refreshButton() {
  const b = $('renownBtn');
  if (!b) return;
  const a = progress.get(), t = trackInfo(a);
  b.textContent = 'Renown';
  b.append(el('small', '', t.done ? 'all unlocked' : `${num(t.carry)} / ${num(t.cost)}`));
  const fresh = a.unlocked.length - a.seen;
  if (fresh > 0) b.append(el('span', 'dot', String(fresh)));
  b.title = t.done ? 'Banners, cloaks, capstone talents, class mastery and your records' : `Next unlock: ${itemTitle(t.next, NAMES())}. Banners, cloaks, capstone talents, class mastery and your records`;
}

// the little rank numerals on the class buttons (menu and lobby): the account has changed, so say it again
export function refreshBadges() {
  const m = progress.get().mastery;
  for (const b of document.querySelectorAll('.classes button[data-cls]')) {
    const C = CLASSES[b.dataset.cls];
    if (!C) continue;
    const rk = rankOf(m[b.dataset.cls] || 0);
    let i = b.querySelector('.mrk');
    if (rk.rank > 1) {
      if (!i) { i = el('i', 'mrk'); b.append(i); }
      i.textContent = rk.roman;
      i.title = `${C.name} mastery: ${rk.name} (rank ${rk.rank} of 10)`;
    } else if (i) i.remove();
  }
}

function install() {
  injectCss();
  const anchor = $('menuOptions');
  const row = anchor ? anchor.parentElement : document.querySelector('#menu .scroll');   // (beside Options, or at the end of the menu if the row is gone)
  if (!row || $('renownBtn')) return;
  const b = el('button'); b.id = 'renownBtn'; b.type = 'button';
  b.addEventListener('click', show);
  if (anchor) row.insertBefore(b, anchor); else row.append(b);
  refreshButton();
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && open) { e.stopPropagation(); close(); } }, true);
}
install();
export { refreshButton as refreshRenownButton };
