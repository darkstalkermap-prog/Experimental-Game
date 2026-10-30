// The land on the screens: a row on the menu (and one in the lobby for the host) to pick the biome and the seed of the next battle, and a section of the
// end screen that shows the land the next battle will be fought on, with a button to roll another. The data and the rolling are in biomes.js; the world
// is built for the land when the battle starts (main.js `ensureMap`). Everything here is built from JS (the CSS too), so index.html is untouched.
import { BIOME_IDS, BIOMES, land, saveLand, rollLand, landName, biomeOf, SEED_MAX } from './biomes.js';
import { mulberry32 } from './noise.js';
import { registerEndSection, onMatchEnd } from './endscreen.js';

const CSS = `
.landrow { align-items: center; }
.landrow .qlabel { font-family: Cinzel, serif; font-size: 14px; margin-right: 4px; }
.landrow button { padding: 6px 12px; font-size: 13px; }
.landrow .seed { display: inline-flex; align-items: center; gap: 5px; font-family: Cinzel, serif; font-size: 13px; margin-left: 6px; }
.landrow .seed input { width: 78px; font: 600 14px 'EB Garamond', Georgia, serif; padding: 4px 6px; text-align: right; color: #3b1d10; background: rgba(255,250,235,0.7);
  border: 1px solid #8a6a3a; border-radius: 3px; }
.landrow .seed input:disabled { opacity: 0.6; }
.landrow .seed button { padding: 4px 8px; font-size: 14px; letter-spacing: 0; }
.landrow .landdesc b { font-style: normal; font-family: Cinzel, serif; font-size: 13px; color: #5a1d12; }
:where(.nb-land) { position: relative; text-align: left; padding: 10px 16px 12px; border: 1px solid #8a6a3a; border-radius: 4px; background: rgba(255,248,226,0.5); }
.nb-land .nb-landbody { display: flex; align-items: center; gap: 14px; }
.nb-land .nb-pic { flex: none; line-height: 0; }
.nb-land .nb-thumb { width: 156px; height: 78px; border: 1px solid #5a3a1c; border-radius: 3px; box-shadow: 0 1px 4px rgba(60,30,10,0.35); animation: nbIn 0.38s ease-out both; }
.nb-land .nb-text { flex: 1; min-width: 0; line-height: 1.25; }
.nb-land .nb-name { display: block; font: 700 17px Cinzel, Georgia, serif; color: #3b120b; margin-bottom: 2px; }
.nb-land .nb-desc { font-size: 16px; }
.nb-land .nb-was { margin-top: 3px; font-size: 13.5px; font-style: italic; opacity: 0.7; }
.nb-row + .nb-land .nb-title { display: none; }
.nb-row + .nb-land .nb-sub { font: 700 13px Cinzel, Georgia, serif; font-style: normal; letter-spacing: 0.14em; text-transform: uppercase; color: #5a1d12; opacity: 1; }
@media (max-width: 560px) { .nb-land .nb-landbody { flex-direction: column; text-align: center; } }
@media (prefers-reduced-motion: reduce) { .nb-land .nb-thumb { animation: none; } }
`;
function injectCss() {
  if (document.getElementById('land-style')) return;
  const el = document.createElement('style');
  el.id = 'land-style';
  el.textContent = CSS;
  document.head.append(el);
}

const rows = [];       // every land row on screen (the menu's and the lobby's): they show the same thing
let onChange = () => {};

const describe = (biome) => {
  const d = biomeOf(biome);
  return d.twist ? `${d.short} ${d.twist.name}: ${d.twist.text}` : `${d.short} No rule twist: the classic land.`;
};

function refreshRows() {
  for (const r of rows) r.refresh();
}

function change(patch) {
  Object.assign(land, patch, { touched: true });
  saveLand();
  refreshRows();
  onChange(land);
}

// A row of buttons (one per biome and Random) with the seed beside them. `id` makes the element findable by tests.
function buildRow(id) {
  const row = document.createElement('div');
  row.className = 'row landrow';
  row.id = id;
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Land');
  const label = document.createElement('span');
  label.className = 'qlabel';
  label.textContent = 'Land';
  row.append(label);
  const buttons = {};
  for (const b of [...BIOME_IDS, 'random']) {
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.biome = b;
    el.textContent = b === 'random' ? 'Random' : BIOMES[b].name;
    el.addEventListener('click', () => {
      if (b === 'random') { if (land.mode !== 'random') { land.mode = 'random'; rollLand(); } change({ mode: 'random' }); } else change({ mode: 'fixed', biome: b });
    });
    buttons[b] = el;
    row.append(el);
  }
  const seedWrap = document.createElement('span');
  seedWrap.className = 'seed';
  seedWrap.title = 'Varies the land inside a biome: where the trees, rocks and ponds are. 0 is the classic arrangement.';
  const input = document.createElement('input');
  input.type = 'number'; input.min = '0'; input.max = String(SEED_MAX); input.step = '1'; input.inputMode = 'numeric';
  input.setAttribute('aria-label', 'Land seed');
  const dice = document.createElement('button');
  dice.type = 'button'; dice.textContent = 'Roll'; dice.title = 'Roll a seed'; dice.setAttribute('aria-label', 'Roll a seed');
  seedWrap.append('Seed', input, dice);
  row.append(seedWrap);
  const desc = document.createElement('span');
  desc.className = 'mapdesc landdesc';
  row.append(desc);

  const readSeed = () => {
    const n = Math.floor(Number(input.value));
    return Number.isFinite(n) ? Math.max(0, Math.min(SEED_MAX, n)) : 0;
  };
  input.addEventListener('change', () => { if (land.mode === 'fixed') change({ seed: readSeed() }); });
  input.addEventListener('keydown', (e) => e.stopPropagation());   // (typing a number must not trigger the game's keys)
  dice.addEventListener('click', () => { if (land.mode === 'fixed') change({ seed: 1 + Math.floor(Math.random() * SEED_MAX) }); else { rollLand(); change({}); } });

  const refresh = () => {
    const random = land.mode === 'random';
    for (const [b, el] of Object.entries(buttons)) el.classList.toggle('active', b === 'random' ? random : !random && b === land.biome);
    if (document.activeElement !== input) input.value = String(land.seed);
    input.disabled = random;
    dice.title = random ? 'Roll another land' : 'Roll a seed';
    const d = biomeOf(land.biome);
    desc.textContent = '';
    const head = document.createElement('b');
    head.textContent = random ? `Next battle: ${landName(land.biome, land.seed)}. ` : `${d.name}${land.seed ? ` · seed ${land.seed}. ` : '. '}`;
    desc.append(head, describe(land.biome));
  };
  rows.push({ el: row, refresh });
  refresh();
  return row;
}

// Put the row on the menu, beside the Map row; the lobby's copy (for the host) goes above the player list. `hooks.onChange(land)` runs after every change.
export function initLandMenu(hooks = {}) {
  injectCss();
  onChange = hooks.onChange || onChange;
  const map = document.getElementById('mapsize');
  if (map && !document.getElementById('landRow')) map.insertAdjacentElement('afterend', buildRow('landRow'));
  const list = document.getElementById('lobbyList');
  if (list && !document.getElementById('lobbyLandRow')) {
    const row = buildRow('lobbyLandRow');
    row.classList.add('hidden');   // (only the host picks: a guest sees the note below)
    list.insertAdjacentElement('beforebegin', row);
    const note = document.createElement('div');
    note.className = 'note hidden';
    note.id = 'lobbyLandNote';
    list.insertAdjacentElement('beforebegin', note);
  }
}

// the lobby: the host's row and the guests' note
export function showLobbyLand(isHost, shown = land) {
  const row = document.getElementById('lobbyLandRow'), note = document.getElementById('lobbyLandNote');
  if (row) row.classList.toggle('hidden', !isHost);
  if (note) {
    note.classList.toggle('hidden', isHost);
    note.textContent = `Land: ${landName(shown.biome, shown.seed)}. ${describe(shown.biome)}`;
  }
  refreshRows();
}

// A little picture of a land: the sky and two ranges of mountains of the seed, the ground, ponds, the road and trees placed by the seed (the same land is
// always the same picture, a new seed is a new one).
function landThumb(biome, seed) {
  const T = biomeOf(biome).thumb, W = 156, H = 78, hz = 34;
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2; c.className = 'nb-thumb';
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(2, 2);
  const rng = mulberry32((Math.imul(seed + 1, 2654435761) + BIOME_IDS.indexOf(biome) * 97) >>> 0);
  let grd = g.createLinearGradient(0, 0, 0, hz);
  grd.addColorStop(0, T.sky[0]); grd.addColorStop(1, T.sky[1]);
  g.fillStyle = grd; g.fillRect(0, 0, W, hz);
  const range = (base, amp, step, col) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, hz + 1);
    let y = base + rng() * amp;
    for (let x = 0; x <= W; x += step) { y += (rng() - 0.5) * amp * 1.1; y = Math.min(base + amp, Math.max(base - amp * 0.3, y)); g.lineTo(x, hz - y); }
    g.lineTo(W, hz + 1); g.closePath(); g.fill();
  };
  range(12, 14, 6, T.far); range(5, 8, 5, T.near);
  grd = g.createLinearGradient(0, hz, 0, H);
  grd.addColorStop(0, T.ground[0]); grd.addColorStop(1, T.ground[1]);
  g.fillStyle = grd; g.fillRect(0, hz, W, H - hz);
  if (T.pond) {
    g.fillStyle = T.pond;
    for (let i = 0; i < 4; i++) { const rx = 5 + rng() * 11; g.beginPath(); g.ellipse(rng() * W, hz + 9 + rng() * (H - hz - 16), rx, rx * 0.28, 0, 0, 6.3); g.fill(); }
  }
  const rx0 = W / 2 + (rng() - 0.5) * 30;
  g.fillStyle = T.road; g.beginPath(); g.moveTo(rx0 - 1.2, hz); g.lineTo(rx0 + 1.2, hz); g.lineTo(W / 2 + 20, H); g.lineTo(W / 2 - 20, H); g.closePath(); g.fill();
  // trees, far ones first; none on the road
  const trees = [];
  for (let i = 0; i < 16; i++) trees.push([rng() * W, hz + 2 + rng() * (H - hz - 6)]);
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of trees) {
    const f = (y - hz) / (H - hz), cx = rx0 + (W / 2 - rx0) * f, half = 1.2 + 19 * f;
    if (Math.abs(x - cx) < half + 3) continue;
    const s = 5 + 11 * f;
    if (T.kind === 'cactus') {
      g.strokeStyle = T.tree; g.lineWidth = Math.max(1.6, s * 0.2); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s); g.moveTo(x, y - s * 0.45); g.lineTo(x - s * 0.28, y - s * 0.45); g.lineTo(x - s * 0.28, y - s * 0.75); g.moveTo(x, y - s * 0.6); g.lineTo(x + s * 0.26, y - s * 0.6); g.lineTo(x + s * 0.26, y - s * 0.85); g.stroke();
    } else if (T.kind === 'dead') {
      g.strokeStyle = T.tree; g.lineWidth = Math.max(1, s * 0.1); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.1, y - s); g.moveTo(x, y - s * 0.5); g.lineTo(x - s * 0.3, y - s * 0.8); g.moveTo(x + s * 0.05, y - s * 0.7); g.lineTo(x + s * 0.3, y - s * 0.95); g.stroke();
    } else {
      g.fillStyle = T.tree;
      for (const [by, w, h] of [[y - s * 0.1, s * 0.34, s * 0.55], [y - s * 0.42, s * 0.26, s * 0.5]]) {   // two stacked triangles: [base y, half width, height]
        g.beginPath(); g.moveTo(x, by - h); g.lineTo(x + w, by); g.lineTo(x - w, by); g.closePath(); g.fill();
        if (T.snow) { g.fillStyle = '#f2f6fa'; g.beginPath(); g.moveTo(x, by - h); g.lineTo(x + w * 0.5, by - h * 0.5); g.lineTo(x - w * 0.5, by - h * 0.5); g.closePath(); g.fill(); g.fillStyle = T.tree; }
      }
    }
  }
  g.strokeStyle = 'rgba(40,20,8,0.5)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  return c;
}

// ---- after a battle: the land of the next one ----
// the first battle is the classic land; from then on the choice is Random unless the player picked one on the menu
onMatchEnd(() => {
  if (!land.played) {
    land.played = true;
    if (!land.touched) land.mode = 'random';
  }
  if (land.mode === 'random') rollLand();
  saveLand();
  refreshRows();
});

// The "Next battle" panel of the end screen is the Battle Decrees' (decrees.js, order 50, class `nb-row`): the land is the second half of it, a `nb-row` placed right
// after it (order 51), and the two join into one panel (their CSS). Without the decrees (Hero Mode) the land stands alone and carries the panel's title itself.
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

registerEndSection('land', 51, (summary) => {
  injectCss();
  const guest = summary.mode === 'client';   // (online, the host decides the next land)
  const el = mk('div', 'nb-row nb-land');
  const head = mk('div', 'nb-head'), title = mk('div', 'nb-ttl'), acts = mk('div', 'nb-acts'), body = mk('div', 'nb-landbody');
  title.append(mk('span', 'nb-title', 'Next battle'), mk('span', 'nb-sub', 'The land'));
  head.append(title, acts);
  el.append(head, body);
  const fill = () => {
    body.textContent = '';
    const text = mk('div', 'nb-text');
    if (guest) text.append(mk('div', 'nb-desc', 'The host picks the next battle’s land.'));
    else {
      const pic = mk('div', 'nb-pic');
      pic.append(landThumb(land.biome, land.seed));
      body.append(pic);
      text.append(mk('b', 'nb-name', landName(land.biome, land.seed)), mk('div', 'nb-desc', describe(land.biome)));
    }
    const o = summary.options;
    if (o && typeof o.biome === 'string') text.append(mk('div', 'nb-was', 'This battle was fought on ' + landName(o.biome, o.seed) + '.'));   // (its seed is worth keeping if the land was a good one)
    body.append(text);
  };
  fill();
  if (!guest) {
    const dice = mk('span', 'nb-dice', '\u{1F3B2}');
    const btn = mk('button', '', '');
    btn.type = 'button';
    btn.append(dice, 'Reroll land');
    btn.title = land.mode === 'random' ? 'Roll another biome and seed' : 'Roll another seed of this biome';
    btn.addEventListener('click', () => {
      rollLand(land.mode === 'fixed');
      fill(); refreshRows(); onChange(land);
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
    });
    acts.append(btn);
  }
  return el;
});
