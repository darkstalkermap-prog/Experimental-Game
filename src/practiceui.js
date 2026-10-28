// The practice courtyard's panel (P) and its small readout on the HUD. Built once, then refreshed a few times a second.
//   Hero: class, level, talents (all of them, none, or the tree), a full refill.
//   Soldiers: any kind at any veteran rank and training tier, sent in to charge the dummies; what they would be, and how much damage
//             each group of them does per second.
//   Dummies: the armour tier and which stands are filled; reset the counters.
import * as THREE from 'three';
import { CLASSES, CLASS_IDS } from './classes.js';
import { UNIT_TYPES, PRACTICE } from './config.js';
import { MAX_LEVEL } from './heroes.js';
import { STAND_NAMES, STAND_HINTS } from './practice.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = (x) => (x >= 100 ? Math.round(x) : x.toFixed(1));

// soldiers by what they are: the levy, the elite they are promoted to, and the champions
const KINDS = [
  { name: 'Levy', ids: ['swordsman', 'spearman', 'archer', 'horseman'] },
  { name: 'Elite', ids: ['knight', 'longbowman', 'lancer'] },
  { name: 'Champions', ids: ['lord', 'giant'] },
];
const STANDS = Object.keys(STAND_NAMES);

export function buildPracticePanel(ui) {
  const g = ui.game, root = document.querySelector('#practice .pbody');
  root.innerHTML = '';
  const R = ui.pr = { cls: {}, lvl: [], type: {}, rank: [], tier: [], count: [], armor: [], stand: {} };
  const el = (tag, cls, html = '', parent = root) => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };
  const chip = (parent, html, title, fn) => {
    const b = el('button', '', html, parent);
    if (title) b.title = title;
    b.addEventListener('click', () => { fn(); refreshPractice(ui, true); });
    return b;
  };
  const section = (title, hint) => { el('h4', '', esc(title)); if (hint) el('p', 'note', hint); };

  // ---------------- the hero ----------------
  section('Your hero', 'Any class, any level, any talents. Changing class or level gives you full health and ready abilities.');
  const classes = el('div', 'chips');
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    R.cls[id] = chip(classes, `${esc(c.icon)} ${esc(c.name)}`, `${c.role}: ${c.q.name} and ${c.r.name}`, () => g.court.setHeroClass(id));
  }
  el('h5', '', 'Level');
  const levels = el('div', 'chips');
  for (let l = 1; l <= MAX_LEVEL; l++) R.lvl[l] = chip(levels, `${l}`, `Level ${l}: ${l - 1} talent point${l === 2 ? '' : 's'} by the rules`, () => g.court.setHeroLevel(l));
  const acts = el('div', 'acts');
  R.allTalents = chip(acts, 'All talents', 'Every talent of this class at once, whatever the level', () => g.court.setAllTalents(!g.court.allTalents));
  chip(acts, 'No talents', 'Forget every talent', () => g.court.setAllTalents(false));
  chip(acts, 'Talent tree (N)', 'Pick talents with the points your level gives', () => { ui.togglePractice(false); ui.openTalents(); });
  chip(acts, 'Heal and refill', 'Full health, stamina, arrows and potions, abilities ready', () => g.court.heal());
  R.hero = el('p', 'note nums');

  // ---------------- the soldiers ----------------
  section('Soldiers', 'They stand behind you and charge the nearest dummy. Pick a kind, its veteran rank and its training tier (Drill Sergeants).');
  for (const k of KINDS) {
    el('h5', '', k.name);
    const row = el('div', 'chips');
    for (const id of k.ids) R.type[id] = chip(row, esc(UNIT_TYPES[id].name), `${UNIT_TYPES[id].hp} health, ${UNIT_TYPES[id].dmg} damage, armour ${UNIT_TYPES[id].armor}`, () => { g.court.pick.type = id; });
  }
  el('h5', '', 'Veteran rank');
  const ranks = el('div', 'chips');
  for (let r = 1; r <= 5; r++) R.rank[r] = chip(ranks, '★'.repeat(r), `Rank ${r}: +12% health, +10% damage and +1 armour for each rank above the first`, () => { g.court.pick.rank = r; });
  el('h5', '', 'Training tier');
  const tiers = el('div', 'chips');
  for (let t = 0; t <= 5; t++) R.tier[t] = chip(tiers, `${t}`, `Tier ${t}: +${15 * t}% health and damage, and a better kit`, () => { g.court.pick.tier = t; });
  el('h5', '', 'How many');
  const counts = el('div', 'chips');
  for (const c of [1, 5, 10, 20]) R.count[c] = chip(counts, `${c}`, '', () => { g.court.pick.count = c; });
  R.preview = el('p', 'note nums');
  const sacts = el('div', 'acts');
  chip(sacts, 'Send them in', 'They charge the nearest dummy', () => { g.court.send(); });
  chip(sacts, 'Send them away', 'Remove every soldier', () => { g.court.clearCharacters(); });

  // ---------------- the dummies ----------------
  section('Dummies', 'They cannot be beaten: they only count what they take. For a fair comparison use the row of five at one armour.');
  el('h5', '', 'Armour');
  const armor = el('div', 'chips');
  PRACTICE.dummies.forEach((d, i) => { R.armor[i] = chip(armor, `${esc(d.name)}<small>armour ${d.armor}</small>`, `Tier ${i + 1}: armour ${d.armor}`, () => g.court.setArmor(i)); });
  el('h5', '', 'Where they stand');
  const stands = el('div', 'chips');
  for (const s of STANDS) R.stand[s] = chip(stands, esc(STAND_NAMES[s]), STAND_HINTS[s], () => g.court.toggleStand(s));
  const dacts = el('div', 'acts');
  chip(dacts, 'Clear dummies', '', () => g.court.clearDummies());
  chip(dacts, 'Reset counters', 'Start the damage counts again', () => g.court.resetReadout());

  // ---------------- the readout ----------------
  section('What they took');
  R.read = el('div', 'read');
}

// the numbers and the highlights; cheap enough to run a few times a second while the panel is up
export function refreshPractice(ui, force = false) {
  const g = ui.game, c = g.court, R = ui.pr;
  if (!R || !c) return;
  const p = g.player;
  for (const id in R.cls) R.cls[id].classList.toggle('active', id === p.classId);
  for (let l = 1; l <= MAX_LEVEL; l++) R.lvl[l].classList.toggle('active', l === p.level);
  R.allTalents.classList.toggle('active', c.allTalents);
  for (const id in R.type) R.type[id].classList.toggle('active', id === c.pick.type);
  const pv = c.preview(c.pick.type, c.pick.rank, c.pick.tier);
  for (let r = 1; r <= 5; r++) { R.rank[r].classList.toggle('active', r === (pv.ranked ? c.pick.rank : 1)); R.rank[r].disabled = !pv.ranked; }
  for (let t = 0; t <= 5; t++) { R.tier[t].classList.toggle('active', t === (pv.tiered ? c.pick.tier : 0)); R.tier[t].disabled = !pv.tiered; }
  for (const k in R.count) R.count[k].classList.toggle('active', Number(k) === c.pick.count);
  PRACTICE.dummies.forEach((_, i) => R.armor[i].classList.toggle('active', i === c.armor));
  for (const s in R.stand) R.stand[s].classList.toggle('active', !!c.stands[s]);

  const talents = Object.keys(p.talents).length;
  R.hero.innerHTML = `<b>${esc(p.cls.name)} level ${p.level}</b>: health ${p.maxHp} · armour ${n1(p.armor)} · sword ${n1(p.meleeDmg)} · bow ${n1(p.bowDmg)} · spells ×${p.mods.spell.toFixed(2)} · speed ${Math.round(p.speedMult * 100)}% · Q ${p.abilityCd('q').toFixed(1)} s, R ${p.abilityCd('r').toFixed(1)} s · ${talents} talent${talents === 1 ? '' : 's'}`;
  R.preview.innerHTML = `<b>${esc(pv.name)}${pv.ranked && c.pick.rank > 1 ? ' ' + '★'.repeat(c.pick.rank) : ''}${pv.tiered && c.pick.tier ? ` · tier ${c.pick.tier}` : ''}</b>: health ${pv.hp} · damage ${n1(pv.dmg)} · armour ${pv.armor} · ${pv.ranged ? 'range ' + pv.range + ' m' : pv.mounted ? 'mounted' : 'melee'} · a blow every ${pv.cd} s ≈ ${n1(pv.dps)} damage per second before armour`;

  const r = c.readout();
  const rows = [`<tr><th>Who</th><th>per second</th><th>peak</th><th>last hit</th><th>total</th></tr>`,
    `<tr class="me"><td>You</td><td>${n1(r.hero.dps)}</td><td>${n1(r.hero.peak)}</td><td>${Math.round(r.hero.last)}</td><td>${Math.round(r.hero.total)}</td></tr>`];
  for (const gr of r.groups) rows.push(`<tr><td>${esc(gr.label)} ×${gr.n}</td><td>${n1(gr.each)} each<small> (${n1(gr.dps)} in all)</small></td><td>${n1(gr.peakEach)}</td><td></td><td>${Math.round(gr.total)}</td></tr>`);
  R.read.innerHTML = `<table class="read">${rows.join('')}</table><p class="note">Damage per second is counted over the last ${PRACTICE.window} seconds, and the peak is the best of those. The dummies' own readouts hang above their heads.</p>`;
}

// the small box on the HUD, for when the panel is shut
export function updatePracticeHud(ui) {
  const g = ui.game, c = g.court, el = $('pracStats');
  if (!c || !el) return;
  const r = c.readout();
  const groups = r.groups.slice(0, 3).map((x) => `${esc(x.label)} ×${x.n}: ${n1(x.each)} each`).join(' · ');
  const html = `<b>You</b> ${n1(r.hero.dps)} dps · peak ${n1(r.hero.peak)} · last hit ${Math.round(r.hero.last)}<br>`
    + (r.groups.length ? `<b>Soldiers</b> ${n1(r.soldiersDps)} dps${groups ? ' (' + groups + ')' : ''}<br>` : '')
    + '<span>P: practice panel</span>';
  if (html !== ui.pracHtml) { ui.pracHtml = html; el.innerHTML = html; }
}

// the number that floats up from a dummy the hero has hit
export function damagePop(ui, dummy, amount) {
  const g = ui.game, box = $('dmgpops');
  if (!box || box.children.length > 24) return;
  const v = new THREE.Vector3(dummy.pos.x, dummy.pos.y + 2.3, dummy.pos.z).project(g.camera);
  if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
  const e = document.createElement('div');
  e.className = 'dmgpop' + (amount >= 60 ? ' big' : '');
  e.textContent = Math.round(amount);
  e.style.left = `${(v.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 36}px`;
  e.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  box.appendChild(e);
  setTimeout(() => e.remove(), 900);
}
