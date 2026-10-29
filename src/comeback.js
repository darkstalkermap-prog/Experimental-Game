// Comeback mechanics: what the game gives a house that is losing, so that a bad start is a fight and not a slow defeat. The host decides all three,
// the AI lords get them exactly as the people do, and none of them does anything for a house that is not behind (the numbers are in config.js, COMEBACK).
//   Underdog's wage   a house that is clearly the weakest (see strengthOf) is paid a bonus wage while it is: f.wage gold a minute, a badge on the HUD
//   Cheaper gate      rebuilding a gate that has fallen costs half (economy.js asks gateRepairFactor, the shop says so where the price shows)
//   Last Stand        once a match, with the keep below a quarter of its health: the hero is healed (and rises at once if it had fallen), the house's
//                     soldiers hit harder and march faster for a while and militia rise at the keep. Key L or the HUD button; a guest asks the host
//                     (netsync.js 'stand'); the AI lords call it by themselves. Not in the Hero Game Mode (no gold, and a fallen keep ends it) or the yard.
// Faction fields: f.wage (gold a minute the wage pays now, 0 = none) and f.stand (1 once the Last Stand has been called). Both travel to the guests in
// the faction snapshot; everything else the HUD needs (keep health, gate) it already has.
import * as THREE from 'three';
import { COMEBACK, TRICKLE, WAVES, UNIT_TYPES, SIEGE_TYPES, GIANT_COST } from './config.js';
import { matchlog, clockText } from './matchlog.js';
import { registerEndSection } from './endscreen.js';
import { mods } from './mods.js';
import { allied } from './teams.js';
import { BUFF_NAMES } from './classes.js';

BUFF_NAMES.stand = 'Last Stand';   // (the timer of the hero's Last Stand in the buff list: it changes nothing by itself)
const FACING = new THREE.Vector3(0, 0, 1);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// per match: timers and the soldiers whose blows are strengthened (created by startComeback, read from game.cb)
export function startComeback(game) {
  game.cb = { t: 0, look: COMEBACK.wage.every, pay: 0, owed: [0, 0, 0, 0], told: [false, false, false, false], boosts: [], checks: [], asked: -99 };
  for (const f of game.factions) { f.wage = 0; f.stand = 0; f.underdog = false; }
}

// ---------------- Underdog's wage ----------------
// What a house can fight with, in gold-worth points: the health of its keep, gate and walls, its soldiers and engines (their price, by health)
// and half its purse. Heroes are left out (every house has one).
const worth = (type) => UNIT_TYPES[type].cost ?? (type === 'giant' ? GIANT_COST : type === 'longbowman' ? 100 : 0);
export function strengthOf(game, f) {
  const c = f.castle, S = COMEBACK.strength;
  let walls = 0, n = 0;
  for (const w of c.walls) if (w.breakable) { n++; if (w.alive) walls += w.hp / w.maxHp; }
  let p = S.keep * (c.keep.hp / c.keep.maxHp) + (c.gate.alive ? S.gate * (c.gate.hp / c.gate.maxHp) : 0) + (n ? S.walls * (walls / n) : 0);
  for (const u of game.units) if (u.team === f.team && u.alive && !u.isHero && !u.isCrew) p += worth(u.type) * (u.hp / u.maxHp);
  for (const s of game.siege) if (s.team === f.team && s.alive) p += (SIEGE_TYPES[s.type] ? SIEGE_TYPES[s.type].cost : 0) * (s.hp / s.maxHp);
  return p + S.purse * f.gold;
}

// what a standing house earns a minute without fighting: the trickle and the wave wage (the wage is the base the bonus is a share of)
export function passiveRate(game) {
  return (TRICKLE * 60 + (WAVES.wage(game.round) * 60) / (WAVES.interval * mods.mul('waveGap'))) * mods.mul('income');
}

// once a second: who is behind, the wage that pays them, and the AI lords' Last Stands
function look(game) {
  const W = COMEBACK.wage, cb = game.cb;
  const live = game.factions.filter((f) => !f.eliminated && !f.castle.fallen);
  const on = !game.hero && !game.practice && game.round >= W.from && live.length > 1;
  const power = on ? live.map((f) => strengthOf(game, f)) : [];
  const rate = on ? passiveRate(game) : 0;
  for (const f of game.factions) {
    const i = live.indexOf(f);
    let ratio = 1;
    if (on && i >= 0) {
      let sum = 0, n = 0;
      for (let j = 0; j < live.length; j++) if (j !== i && !allied(live[j].team, f.team)) { sum += power[j]; n++; }
      if (n) ratio = power[i] / Math.max(1, sum / n);
    }
    const was = !!f.underdog;
    f.underdog = on && i >= 0 && (ratio < W.enter || (was && ratio < W.leave));
    f.wage = f.underdog ? Math.max(5, Math.round((rate * (W.min + (W.max - W.min) * clamp01((W.enter - ratio) / W.enter))) / 5) * 5) : 0;
    if (f.underdog && !was) {
      matchlog.record('comeback', { kind: 'underdog', team: f.team, wage: f.wage, ratio: Math.round(ratio * 100) / 100 });
      if (f.isPlayer && f.player && !cb.told[f.team]) {
        cb.told[f.team] = true;
        game.deliver(f.player, { k: 'toast', text: `Underdog's wage: you are behind, so the realm pays you ${f.wage} gold a minute until you catch up.`, team: f.team, imp: false });
      }
    }
    if (!f.isPlayer && !standBlock(game, f)) useLastStand(game, f);   // (the AI lords call their Last Stand the moment they may)
  }
}

// ---------------- the gate ----------------
// the share of the price that a house pays to rebuild its gate: half while the gate lies broken (and the castle stands to hold it)
export function gateRepairFactor(game, f) {
  const c = f.castle;
  return !c.gate.alive && !c.fallen ? COMEBACK.gateRepair : 1;
}
// the shop has just rebuilt a broken gate for `saved` gold less than the full price
export function noteGateRepair(game, f, saved) {
  matchlog.record('comeback', { kind: 'gate', team: f.team, saved: Math.round(saved) });
  if (f.team === game.localTeam) matchlog.add('gateSaved', Math.round(saved));
}

// ---------------- Last Stand ----------------
// why the Last Stand cannot be called now (a few words for the toast), or null when it can
export function standBlock(game, f) {
  if (game.hero || game.practice) return 'No Last Stand in this mode';
  if (!f || game.state !== 'playing') return 'The battle is over';
  if (f.eliminated || f.castle.fallen) return 'Your keep has fallen';
  if (f.stand) return 'Your Last Stand is spent';
  const k = f.castle.keep;
  if (k.hp >= k.maxHp * COMEBACK.stand.keep) return `Last Stand: only when your keep is below ${Math.round(COMEBACK.stand.keep * 100)}%`;
  return null;
}

// The rally. Host or single player only: a guest's request arrives through standFor.
export function useLastStand(game, f) {
  if (!game.simulating || standBlock(game, f)) return false;
  const S = COMEBACK.stand, c = f.castle, cb = game.cb;
  const mine = f.team === game.localTeam;
  f.stand = 1;
  matchlog.record('comeback', { kind: 'last_stand', team: f.team, keep: Math.round((100 * c.keep.hp) / c.keep.maxHp) });
  if (mine) matchlog.add('lastStand');

  // the hero: back on its feet at the keep if it had fallen, healed, fresh, and for a while quicker, harder to hurt and harder-hitting
  const p = f.isPlayer && f.player ? f.player : null;
  if (p) {
    if (!p.alive) { f.respawnT = 0; p.spawn(c.spawnPoint, c.rot); }
    p.heal(p.maxHp);
    p.stamina = 100;
    p.abilCd = { q: 0, r: 0 };
    p.buffs.add('guard', S.heroTime, S.heroGuard);
    p.buffs.add('haste', S.time, S.speed);
    p.buffs.add('rage', S.time, S.dmg);
    p.buffs.add('stand', S.time, 1);
  } else if (!f.isPlayer) {
    if (!(f.hero && f.hero.alive)) { f.respawnT = 0; game.spawnLord(f); }
  }

  // the soldiers: harder blows and quicker feet (the blow strength goes back when the time is up: see updateComeback)
  const boost = { until: game.time + S.time, units: [] };
  const lift = (u) => { u.dmg *= S.dmg; u.addHaste(S.time, S.speed); boost.units.push(u); };
  for (const u of game.units) if (u.team === f.team && u.alive && !u.isCrew && !u.isGiant) lift(u);
  // and militia rise in the courtyard, for nothing, and hold the keep
  for (let i = 0; i < S.militia; i++) {
    const u = game.recruit(f, i % 2 ? 'spearman' : 'swordsman');
    game.assignRole(f, u, 'garrison');
    lift(u);
    game.fx.dust(u.pos, 10, 1.8);
  }
  cb.boosts.push(boost);
  cb.checks.push({ at: game.time + S.held, team: f.team });

  // the cry: the war horn and the golden rings of the Rally Cry across the castle, the tale on every screen
  game.abilities.emit('rally', c.spawnPoint, FACING, null, 1.7);
  if (p) {
    game.deliver(p, { k: 'banner', title: 'LAST STAND!', sub: 'Your keep is failing. Rally to it!' });
    game.deliver(p, { k: 'stand' });
    game.deliver(p, { k: 'shake', a: 0.7 });
  }
  game.announce((t) => (t === f.team ? null : `${f.name} makes a Last Stand!`), f.team);
  return true;
}

// a guest's request, answered like a purchase: the deny sound and the reason when it cannot be done
export function standFor(game, team) {
  const f = game.factions[team];
  const why = standBlock(game, f);
  if (why) { if (f.player) { f.player.sound('deny'); f.player.notify(why); } return why; }
  useLastStand(game, f);
  return true;
}

// L, or a click on the HUD button
export function standKey(game) {
  const f = game.localFaction, cb = game.cb;
  const why = standBlock(game, f);
  if (why) { game.audio.play('deny'); game.ui.toast(why); return; }
  if (game.mode === 'client') {
    if (game.time - cb.asked < 1.5) return;   // (the answer to the first press is on its way)
    cb.asked = game.time;
    game.net.toHost({ a: 'stand' });
    return;
  }
  useLastStand(game, f);
}

// ---------------- the running of it (host or single player) ----------------
export function updateComeback(game, dt) {
  const cb = game.cb, W = COMEBACK.wage;
  if (!cb) return;
  cb.t += dt;
  // the wage accrues second by second and is paid out in a lump every ten seconds (with the gold popup and its coin)
  for (const f of game.factions) if (f.wage > 0 && !f.eliminated && !f.castle.fallen) cb.owed[f.team] += (f.wage * dt) / 60;
  cb.pay += dt;
  if (cb.pay >= 10) {
    cb.pay = 0;
    for (const f of game.factions) {
      const n = Math.floor(cb.owed[f.team]);
      if (n < 1) continue;
      cb.owed[f.team] -= n;
      f.gold += n;
      f.earned += n;
      if (f.team === game.localTeam) matchlog.add('wageGold', n);
      if (f.isPlayer && f.player) game.deliver(f.player, { k: 'gold', g: n });
    }
  }
  cb.look -= dt;
  if (cb.look <= 0) { cb.look = W.every; look(game); }
  // the Last Stand's blows go back to normal when its time is up; later, a word if the keep still stands
  for (let i = cb.boosts.length - 1; i >= 0; i--) {
    const b = cb.boosts[i];
    if (game.time < b.until) continue;
    for (const u of b.units) u.dmg /= COMEBACK.stand.dmg;
    cb.boosts.splice(i, 1);
  }
  for (let i = cb.checks.length - 1; i >= 0; i--) {
    const k = cb.checks[i];
    if (game.time < k.at) continue;
    cb.checks.splice(i, 1);
    const f = game.factions[k.team];
    if (f.castle.fallen) continue;
    matchlog.record('comeback', { kind: 'stand_held', team: k.team });
    if (f.isPlayer && f.player) game.deliver(f.player, { k: 'toast', text: 'Your Last Stand held the keep.', team: k.team, imp: false });
  }
}

// ---------------- the HUD ----------------
const CSS = `
#wageBadge { position: absolute; right: 148px; top: 16px; padding: 4px 10px 5px; font: 600 13px Cinzel, Georgia, serif; letter-spacing: 0.03em; color: #f2d98a;
  background: linear-gradient(rgba(58,44,14,0.86), rgba(34,26,10,0.86)); border: 1px solid rgba(224,180,76,0.7); border-radius: 4px; text-shadow: 0 1px 2px #000; white-space: nowrap; }
#wageBadge b { color: #fff3cf; }
#wageBadge i { font-style: normal; margin-right: 5px; }
@media (max-width: 1150px) { #wageBadge { right: 16px; top: 60px; } }
#lastStand { position: absolute; right: 16px; bottom: 214px; display: flex; align-items: center; gap: 12px; padding: 8px 18px 8px 12px; cursor: pointer; pointer-events: auto;
  color: #fff3cf; background: linear-gradient(rgba(120,32,18,0.94), rgba(66,14,8,0.94)); border: 2px solid #f0c24e; border-radius: 6px; box-shadow: 0 0 18px rgba(240,194,78,0.65), 0 4px 14px rgba(0,0,0,0.6);
  animation: standPulse 1.1s ease-in-out infinite; }
#lastStand:hover { background: linear-gradient(rgba(150,42,24,0.96), rgba(86,18,10,0.96)); }
#lastStand kbd { margin: 0; font-size: 18px; padding: 2px 9px; border-color: #f0c24e; color: #fff3cf; }
#lastStand .ls-t { display: flex; flex-direction: column; text-align: left; line-height: 1.15; }
#lastStand b { font: 700 19px Cinzel, Georgia, serif; letter-spacing: 0.1em; text-shadow: 0 2px 4px #000; }
#lastStand small { font-size: 13px; opacity: 0.92; }
@keyframes standPulse { 0%, 100% { box-shadow: 0 0 10px rgba(240,194,78,0.4), 0 4px 14px rgba(0,0,0,0.6); } 50% { box-shadow: 0 0 28px rgba(255,214,102,0.95), 0 4px 14px rgba(0,0,0,0.6); } }
#standFlash { position: absolute; inset: 0; opacity: 0; pointer-events: none; background: radial-gradient(ellipse at center, rgba(255,226,140,0.0) 25%, rgba(255,205,90,0.55) 70%, rgba(255,170,40,0.85) 100%); }
#standFlash.go { animation: standFlash 1.3s ease-out; }
@keyframes standFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
#hud.standing::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 110px 12px rgba(255,200,80,0.4); animation: standGlow 2.2s ease-in-out infinite; }
@keyframes standGlow { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
`;
let refs = null;
function hudRefs() {
  if (refs && refs.badge.isConnected) return refs;
  if (!document.getElementById('cw-comeback-css')) {
    const st = document.createElement('style');
    st.id = 'cw-comeback-css';
    st.textContent = CSS;
    document.head.append(st);
  }
  const hud = document.getElementById('hud');
  const mk = (tag, id, html, cls = '') => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; e.innerHTML = html; hud.append(e); return e; };
  const badge = mk('div', 'wageBadge', '', 'panel hidden');
  const stand = mk('div', 'lastStand', '<kbd>L</kbd><span class="ls-t"><b>LAST STAND</b><small>Heal, rally your soldiers, call the militia</small></span>', 'hidden');
  const flash = mk('div', 'standFlash', '');
  stand.title = 'Once a battle, with your keep below a quarter of its health (key L)';
  refs = { badge, stand, flash, text: '', game: null };
  stand.addEventListener('click', () => { if (refs.game) standKey(refs.game); });
  return refs;
}

// every 0.12 s from the HUD: the wage badge, the Last Stand button and the golden glow while it lasts
export function updateComebackHud(ui, game) {
  const r = hudRefs();
  r.game = game;
  const f = game.localFaction;
  const live = game.state === 'playing' && !game.hero && !game.practice && f;
  const wage = live && f.wage > 0 && !f.eliminated ? f.wage : 0;
  const text = wage ? `<i>⚜</i>Underdog's wage <b>+${wage}</b> gold/min` : '';
  if (text !== r.text) {
    r.text = text;
    r.badge.innerHTML = text;
    r.badge.classList.toggle('hidden', !wage);
    r.badge.title = 'You are behind the other houses, so the realm pays you extra until you catch up.';
  }
  const ask = game.cb && game.time - game.cb.asked < 1.5;
  const can = live && !standBlock(game, f);
  r.stand.classList.toggle('hidden', !(can && !ask));
  if (can && game.cb && !game.cb.nudged) {   // (the first time the keep is that low: a line to say what the button is)
    game.cb.nudged = true;
    ui.toast('Your keep is falling! Press L for a Last Stand.', f.team, true);
  }
  document.getElementById('hud').classList.toggle('standing', !!(live && game.player.buffs.has('stand')));
}

// the golden flash across the screen (the 'stand' event: delivered to the hero who called the Last Stand)
export function standFlash() {
  const r = hudRefs();
  r.flash.classList.remove('go');
  void r.flash.offsetWidth;
  r.flash.classList.add('go');
}

// ---------------- the end screen ----------------
// a ribbon under the table of numbers when the comeback rules did something for your house (order 35: between your stats and the renown)
const END_CSS = `
.cb-row { display: flex; gap: 6px 14px; flex-wrap: wrap; align-items: baseline; justify-content: center; padding: 6px 12px; text-align: center; font-size: 15.5px; line-height: 1.3; color: var(--ink);
  border-top: 1px solid rgba(138,106,58,0.55); border-bottom: 1px solid rgba(138,106,58,0.55); background: rgba(224,180,76,0.14); }
.cb-row b { font: 700 13px Cinzel, Georgia, serif; letter-spacing: 0.12em; text-transform: uppercase; color: #5a1d12; }
`;
registerEndSection('comeback', 35, (s) => {
  const mine = (e) => e.team === s.team;
  const parts = [];
  const wage = s.counters.wageGold || 0;
  if (wage > 0) parts.push(`Underdog's wage paid ${wage} gold`);
  const saved = s.counters.gateSaved || 0;
  if (saved > 0) parts.push(`Gate rebuilt at half price (${saved} gold saved)`);
  const stand = s.events.find((e) => e.type === 'comeback' && e.kind === 'last_stand' && mine(e));
  if (stand) {
    const held = s.events.some((e) => e.type === 'comeback' && e.kind === 'stand_held' && mine(e));
    parts.push(`Last Stand called at ${clockText(stand.t)} with the keep at ${stand.keep}%${held ? ' and the keep held' : ''}`);
  }
  if (!parts.length) return null;
  if (!document.getElementById('cw-comeback-end-css')) {
    const st = document.createElement('style');
    st.id = 'cw-comeback-end-css';
    st.textContent = END_CSS;
    document.head.append(st);
  }
  const el = document.createElement('div');
  el.className = 'cb-row';
  const b = document.createElement('b');
  b.textContent = 'Comeback';
  el.append(b, ...parts.map((t) => { const sp = document.createElement('span'); sp.textContent = t; return sp; }));
  return el;
});
