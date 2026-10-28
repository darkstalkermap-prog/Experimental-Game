// The Talents tab of the shop (B, or N for short): the hero's class tree drawn as nodes in tiers with lines between them,
// the hint on the HUD while a talent point is waiting, and the small icons of what is learnt beside the ability icons.
import { CLASSES } from './classes.js';
import { talentsOf, TALENT_BY_ID, talentLock, respecBlock, tierLevel } from './talents.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BRANCH_COL = { q: 2, r: 3 };   // the grid column of each branch (the first holds the level of each row)

// Build the tree of the hero's class into the shop grid. Afterwards only classes, texts and states change (see refresh),
// so a node is never replaced under the cursor and every click lands.
export function buildTalentTab(ui, grid) {
  const g = ui.game, p = g.player, cls = CLASSES[p.classId];
  $('shopTitle').textContent = 'Talents';
  const root = document.createElement('div');
  root.className = 'tal-wrap';
  root.style.setProperty('--cls', cls.color);
  root.innerHTML = `<div class="tal-head"><h5>${esc(cls.icon)} ${esc(cls.name)} talents</h5><span class="tal-pts"></span><button class="respec">Respec</button></div>
    <div class="tal-note">You earn a talent point at every level after the first. A talent needs the level shown beside its row and the talent above it, and four points cannot buy a whole tree: choose. <b>Respec</b> gives every point back, free, at your own castle (inside its walls or just outside them).${g.hero ? '' : ' Changing class starts a new tree.'}</div>
    <div class="tal-tree"></div>`;
  const tree = root.querySelector('.tal-tree');
  const put = (el, row, col) => { el.style.gridRow = row; el.style.gridColumn = col; tree.appendChild(el); return el; };
  for (const br of ['q', 'r']) {
    const d = cls[br], col = document.createElement('div');
    col.className = 'tal-col';
    col.innerHTML = `<span>${esc(d.icon)} ${esc(d.name)}</span><small>${br === 'q' ? 'Q · attack' : 'R · defence'}</small>`;
    put(col, 1, BRANCH_COL[br]);
  }
  for (let tier = 1; tier <= 4; tier++) {
    const lv = document.createElement('div');
    lv.className = 'tal-lv';
    lv.innerHTML = `Level<br><b>${tierLevel(tier)}</b>`;
    put(lv, tier + 1, 1);
  }
  const nodes = [];
  for (const t of talentsOf(p.classId)) {
    const el = document.createElement('button');
    el.className = 'tnode locked' + (t.needs ? ' child' : '');
    el.dataset.talent = t.id;
    el.dataset.tier = t.tier;
    el.innerHTML = `<span class="ti">${esc(t.icon)}</span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small><em class="ts"></em>`;
    el.addEventListener('click', () => {
      const ok = g.localLearnTalent(t.id);
      el.classList.remove('bought', 'nope');
      void el.offsetWidth;
      el.classList.add(ok ? 'bought' : 'nope');
      ui.refreshShop();
    });
    put(el, t.tier + 1, BRANCH_COL[t.br]);
    nodes.push({ t, el, status: el.querySelector('.ts'), last: '' });
  }
  const respec = root.querySelector('.respec');
  respec.addEventListener('click', () => { g.localRespec(); ui.refreshShop(); });
  grid.appendChild(root);
  ui.talentView = { cls: p.classId, nodes, pts: root.querySelector('.tal-pts'), respec, ptsLast: '', respecLast: null };
  refreshTalentTab(ui);
}

// States: learned (gold), available (can be learnt now, green while there is a point to spend it) and locked (greyed,
// with the reason: the level it needs, or the talent above it).
export function refreshTalentTab(ui) {
  const v = ui.talentView;
  if (!v) return;
  const p = ui.game.player;
  if (v.cls !== p.classId) { ui.renderShop(); return; }   // a new class has a tree of its own
  const left = p.talentPoints;
  const pts = `Level ${p.level} · <b>${left}</b> ${left === 1 ? 'point' : 'points'} to spend`;
  if (v.ptsLast !== pts) { v.pts.innerHTML = pts; v.ptsLast = pts; }
  for (const n of v.nodes) {
    const t = n.t, learned = !!p.talents[t.id], lock = learned ? null : talentLock(p, t.id);
    const label = learned ? '✓ Learned' : lock || (left > 0 ? 'Click to learn' : 'No talent points left');
    if (n.last !== label) { n.status.textContent = label; n.last = label; }
    n.el.classList.toggle('learned', learned);
    n.el.classList.toggle('locked', !learned && !!lock);
    n.el.classList.toggle('available', !learned && !lock);
    n.el.classList.toggle('afford', !learned && !lock && left > 0);
    n.el.classList.toggle('linked', !!t.needs && !!p.talents[t.needs]);
  }
  const why = respecBlock(p);
  const tip = why || 'Give back every talent point';
  if (v.respecLast !== tip) { v.respec.title = tip; v.respecLast = tip; }
  v.respec.classList.toggle('unavailable', !!why);
}

// The HUD: "Talent point available (N)" while points are waiting, and the icons of the talents learnt beside Q and R.
export function updateTalentHud(ui, p) {
  const n = ui.shopOpen ? 0 : p.talentPoints;
  if (n !== ui.talentHintN) {
    ui.talentHintN = n;
    $('talentHint').classList.toggle('hidden', n <= 0);
    $('talentN').textContent = n;
  }
  const pips = ui.talentPips || (ui.talentPips = { q: { el: document.querySelector('#abilQ .tpips'), key: '' }, r: { el: document.querySelector('#abilR .tpips'), key: '' } });
  for (const slot of ['q', 'r']) {
    const o = pips[slot];
    const learnt = Object.keys(p.talents).map((id) => TALENT_BY_ID[id]).filter((t) => t && t.br === slot);
    const key = learnt.map((t) => t.id).join();
    if (key === o.key) continue;
    o.key = key;
    o.el.textContent = learnt.map((t) => t.icon).join('');
    o.el.title = learnt.map((t) => `${t.name}: ${t.desc}`).join('\n');
  }
}
