// HUD, shop, minimap, menus and notifications (plain DOM).
import * as THREE from 'three';
import { TEAM_CSS, PLAYER_TEAM, WORLD, CASTLE, WAVES, PLAYER, UNIT_TYPES, FORMATIONS, OBJECTIVES, HILL, clock } from './config.js';
import { SHOP } from './economy.js';
import { dirFromAim, incomingSide } from './combat.js';
import { allied } from './teams.js';
import { CLASSES, CLASS_IDS, BUFF_NAMES, SWITCH } from './classes.js';
import { roadDist } from './world.js';
import { MAX_LEVEL, XP_FOR_LEVEL, levelProgress } from './heroes.js';
import { buildTalentTab, refreshTalentTab, updateTalentHud } from './talentui.js';
import { buildPracticePanel, refreshPractice, updatePracticeHud, damagePop } from './practiceui.js';
import { HERO } from './herogame.js';

const $ = (id) => document.getElementById(id);
const NEUTRAL_CSS = '#8a6a4a';   // for anything without a house colour
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The three jobs a soldier can have (see Game.assignRole)
const ROLES = [
  { id: 'garrison', icon: '🏰', label: 'Garrison', tip: 'Stays home and defends the castle; archers man the walls' },
  { id: 'army', icon: '⚔', label: 'Army', tip: 'Follows you and takes your orders (F1–F4, T)' },
  { id: 'lane', icon: '➤', label: 'Lane', tip: 'Marches out with the waves to attack the enemy' },
];
const ROSTER_TYPES = ['swordsman', 'spearman', 'archer', 'knight', 'longbowman', 'horseman', 'lancer'];
const pct = (x) => `${Math.round(x * 100)}%`;
// what a Hero Game Mode match is played for, in a few words (the HUD, the scoreboard, the banner)
const heroGoal = (h) => (h.win === 'castle' ? 'Destroy the enemy keep'
  : h.win === 'timed' ? `Most hero kills in ${Math.round((h.timeLimit || HERO.timeLimit) / 60)} min`
  : `First to ${h.killTarget || HERO.killTarget} hero kills`);

// Six hero-class buttons plus a panel describing the chosen class (main menu and lobby).
export function renderClassPicker(root, info, selected, onPick) {
  root.innerHTML = '';
  const buttons = {};
  const describe = (id) => {
    const c = CLASSES[id], m = c.mods;
    info.style.borderLeftColor = c.color;
    info.innerHTML = `<b>${esc(c.icon)} ${esc(c.name)}</b> · ${esc(c.role)}. ${esc(c.blurb)}
      <div class="ab"><b>Q · ${esc(c.q.icon)} ${esc(c.q.name)}</b> (${c.q.cd} s): ${esc(c.q.desc)}</div>
      <div class="ab"><b>R · ${esc(c.r.icon)} ${esc(c.r.name)}</b> (${c.r.cd} s): ${esc(c.r.desc)}</div>
      <div class="ab"><b>Passive:</b> ${esc(c.passive)}</div>
      <div class="st">Health ${Math.round(PLAYER.hp * m.hp)} · armour ${PLAYER.armor + m.armor} · speed ${pct(m.speed)} · sword ${pct(m.melee)} · bow ${pct(m.bow)}${m.spell !== 1 ? ` · spells ${pct(m.spell)}` : ''}${m.horse ? ' · starts with a warhorse' : ''}</div>`;
  };
  const pick = (id) => {
    for (const k in buttons) buttons[k].classList.toggle('active', k === id);
    describe(id);
    onPick(id);
  };
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    const b = document.createElement('button');
    b.dataset.cls = id;
    b.innerHTML = `<span class="ic">${esc(c.icon)}</span>${esc(c.name)}<small>${esc(c.role)}</small>`;
    b.addEventListener('click', () => pick(id));
    root.appendChild(b);
    buttons[id] = b;
  }
  pick(selected);
}

export class UI {
  constructor() {
    this.game = null;
    this.shopOpen = false;
    this.practiceOpen = false;   // the practice courtyard's panel (P)
    this.tab = 'army';
    this.hudT = 0;
    this.mapT = 0;
    this.mapOpen = false;
    this.bigBg = null;
    this.bigT = 0;
    this.targetT = 0;
    this.goldShown = null;
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.mapBg = null;
    this.raycaster = new THREE.Raycaster();
    document.querySelectorAll('#shop .tabs button').forEach((b) => {
      b.addEventListener('click', () => { if (b.disabled) return; this.tab = b.dataset.tab; this.renderShop(); });
    });
  }

  // ---------- notifications ----------
  toast(msg, team = -1, important = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (important ? ' important' : '');
    if (team >= 0) el.style.borderLeftColor = TEAM_CSS[team];
    el.textContent = msg;
    $('toasts').prepend(el);
    setTimeout(() => el.classList.add('fade'), 4200);
    setTimeout(() => el.remove(), 5000);
    while ($('toasts').children.length > 6) $('toasts').lastChild.remove();
  }

  banner(title, sub, tone = '') {
    const b = $('banner');
    b.querySelector('h2').textContent = title;
    b.querySelector('p').textContent = sub;
    b.classList.toggle('level', tone === 'level');
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  // a / v: [name, team] of the attacker and victim
  kill(a, v) {
    const el = document.createElement('div');
    el.className = 'kill';
    el.innerHTML = `<span style="color:${TEAM_CSS[a[1]] || NEUTRAL_CSS}">${esc(a[0])}</span> <span class="x">⚔</span> <span style="color:${TEAM_CSS[v[1]] || NEUTRAL_CSS}">${esc(v[0])}</span>`;
    $('killfeed').prepend(el);
    setTimeout(() => el.remove(), 6000);
    while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
  }

  goldPopup(g) {
    if (this.game && this.game.hero) return;   // (no gold in Hero Game Mode: no popup, no coin sound)
    const el = document.createElement('div');
    el.className = 'goldpop';
    el.textContent = `+${g}`;
    $('goldpops').appendChild(el);
    setTimeout(() => el.remove(), 1200);
    if (this.game) this.game.audio.play('coin');
  }

  // the damage the hero did to a practice dummy, floating up from it
  damagePop(dummy, amount) { damagePop(this, dummy, amount); }

  // "+8 XP" under the crosshair; gains that come close together add up in one popup
  xpPopup(n) {
    const now = performance.now();
    if (this.xpPop && now - this.xpPopAt < 1100) { this.xpPopSum += n; this.xpPop.remove(); } else this.xpPopSum = n;
    const el = document.createElement('div');
    el.className = 'xppop';
    el.textContent = `+${this.xpPopSum} XP`;
    $('xppops').appendChild(el);
    setTimeout(() => el.remove(), 1500);
    this.xpPop = el; this.xpPopAt = now;
  }

  // a new level: the story in a banner, a line in the log and a glow on the experience bar
  levelUp(n) {
    const p = this.game.player;
    this.banner(`Level ${n}`, n >= MAX_LEVEL ? 'The height of your power.' : 'Stronger and tougher.', 'level');
    this.toast(`You reached level ${n}${p.talentPoints > 0 ? ': a talent point to spend (N)' : ''}.`, p.team, true);
    const bar = $('xpbar');
    bar.classList.remove('glow'); void bar.offsetWidth; bar.classList.add('glow');
  }

  feedback(text, good = false) {
    const el = $('feedback');
    el.textContent = text;
    el.classList.toggle('good', good);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // "E" prompts for things you can interact with right now.
  updatePrompt() {
    const g = this.game;
    const p = g.player;
    let text = null, promptKey = 'E';
    if (p.alive && !this.shopOpen) {
      if (p.drive) {
        text = p.drive.type === 'ram' ? 'Climb out · W/S roll · A/D turn · hold left click to batter' : 'Climb out · W/S roll · A/D turn · left click fires where you look';
      } else {
        const c = g.leverNear(p);
        const e = g.engineNear(p);
        if (c) text = c.gateLocked ? 'Unbar the gate' : 'Bar the gate';
        else if (e) text = e.abandoned ? `Take over the abandoned ${e.name.toLowerCase()}` : `Take the controls of your ${e.name.toLowerCase()}`;
        else if (p.hasHorse && !p.mounted && Math.hypot(p.horsePos.x - p.pos.x, p.horsePos.z - p.pos.z) < 3.5) text = 'Mount your horse';
        else if (p.climbHint) { text = 'Climb the wall'; promptKey = 'Space'; }
      }
    }
    if (text !== this.lastPrompt || promptKey !== this.lastPromptKey) {
      this.lastPrompt = text;
      this.lastPromptKey = promptKey;
      $('prompt').classList.toggle('hidden', !text);
      if (text) { $('promptText').textContent = text; $('promptKey').textContent = promptKey; }
    }
    // command bar
    const grp = { all: 'Everyone', infantry: 'Infantry', archers: 'Archers', cavalry: 'Cavalry' }[p.group || 'all'];
    const form = FORMATIONS[(g.localFaction && g.localFaction.formation) || 'line'].name;
    const ord = p.lastOrder || 'defend';
    const key = grp + form + ord;
    if (key !== this.lastCmdKey) {
      this.lastCmdKey = key;
      $('cmdGroup').textContent = grp;
      $('cmdForm').textContent = form;
      document.querySelectorAll('#command .orders span').forEach((e) => e.classList.toggle('active', e.dataset.o === ord));
    }
  }

  openOrders() {
    if (this.game.hero) return;   // (no orders in Hero Game Mode)
    this.tab = 'orders';
    if (this.shopOpen) this.renderShop();
    else this.toggleShop(true);
  }

  // N: the shop on the Talents tab (and N again closes it)
  openTalents() {
    if (this.shopOpen && this.tab === 'talents') { this.toggleShop(false); return; }
    this.tab = 'talents';
    if (this.shopOpen) this.renderShop();
    else this.toggleShop(true);
  }

  // Direction chevrons: where you're aiming / winding up / guarding, and blows coming at you.
  updateDirs() {
    const g = this.game;
    const p = g.player;
    const els = this.dirEls || (this.dirEls = Object.fromEntries([...document.querySelectorAll('#dirs i')].map((e) => [e.dataset.d, e])));
    const show = p.alive && p.weapon === 'sword';
    $('dirs').style.display = show ? '' : 'none';
    if (!show) return;
    const state = { left: '', right: '', over: '', thrust: '' };
    if (p.blocking) state[p.blockDir] = 'guard';
    else if (p.atk) state[p.atk.dir] = p.atk.phase === 'wind' ? 'wind' : 'aim';
    else state[dirFromAim(p.aim.x, p.aim.y, p.atkDir)] = 'aim';
    // enemies close by, facing you and winding up
    const check = (u) => {
      if (!u.alive || allied(u.team, p.team) || u.ranged || u.weapon === 'bow' || u.swingT < 0 || u.swingT > 0.33) return;
      const dx = p.pos.x - u.pos.x, dz = p.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 4.2) return;
      const face = u.mounted ? u.heading ?? u.yaw : u.yaw;
      if ((dx * Math.sin(face) + dz * Math.cos(face)) / (d || 1) < 0.55) return;
      state[incomingSide(u.attackDir || 'over')] = 'threat';
    };
    g.grid.query(p.pos.x, p.pos.z, 5, check);
    for (const h of g.humans) if (h !== p) check(h);
    for (const d of ['left', 'right', 'over', 'thrust']) {
      if (els[d].className !== state[d]) els[d].className = state[d];
    }
  }

  hitMarker() {
    const h = $('hitmarker');
    h.classList.remove('show');
    void h.offsetWidth;
    h.classList.add('show');
  }

  setOrder(cmd) {
    this.lastOrder = cmd;
  }

  // ---------- shop ----------
  // The practice courtyard's panel: the mouse is free while it is up, and the world goes on behind it.
  togglePractice(force) {
    const g = this.game;
    if (!g || !g.practice) return;
    const open = force !== undefined ? force : !this.practiceOpen;
    if (open === !!this.practiceOpen) return;
    this.practiceOpen = open;
    $('practice').classList.toggle('hidden', !open);
    if (open) {
      if (!this.pr) {
        buildPracticePanel(this);
        $('practiceClose').addEventListener('click', () => this.togglePractice(false));
      }
      g.player.cancelAim();
      if (this.shopOpen) this.toggleShop(false);
      this.toggleMap(false);
      this.showPause(false);
      this.prT = 0;
      refreshPractice(this, true);
      g.input.unlock();
    } else if (!this.shopOpen && !this.mapOpen && $('pause').classList.contains('hidden') && g.state === 'playing') g.input.lock();
  }

  toggleShop(force) {
    const open = force !== undefined ? force : !this.shopOpen;
    const g = this.game;
    if (open === this.shopOpen) return;
    this.shopOpen = open;
    $('shop').classList.toggle('hidden', !open);
    if (open) {
      this.togglePractice(false);
      g.player.cancelAim();   // (a volley being placed is dropped, not loosed)
      this.toggleMap(false);
      this.showPause(false); // the shop always sits on top and takes the clicks
      g.paused = false;
      this.renderShop();
      g.input.unlock();
    } else {
      g.input.lock();
    }
  }

  // Build the shop cards once per tab; afterwards only their text and state change, so a button is
  // never replaced under the cursor and every click lands.
  renderShop() {
    const g = this.game;
    if (document.querySelector(`#shop .tabs button[data-tab="${this.tab}"]`)?.disabled) this.tab = 'army';   // a greyed-out tab can't be shown
    if (g.hero) this.tab = 'talents';   // Hero Game Mode: the Talents panel is the whole shop
    document.querySelectorAll('#shop .tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    const grid = $('shopGrid');
    grid.innerHTML = '';
    this.shopCards = [];
    this.targetBtns = [];
    this.orderBtns = [];
    $('shopTitle').textContent = this.tab === 'orders' ? 'Orders' : 'Quartermaster';
    this.roster = null;
    this.classCards = null;
    this.talentView = null;
    if (this.tab === 'orders') { this.buildOrders(grid); this.refreshShop(); return; }
    if (this.tab === 'army') this.buildRoster(grid);
    if (this.tab === 'class') this.buildClassTab(grid);
    if (this.tab === 'talents') buildTalentTab(this, grid);
    if (this.tab === 'siege') {
      const sel = document.createElement('div');
      sel.className = 'targets';
      sel.innerHTML = '<div class="label">Where your armies march. Auto alternates between your two neighbours so each wave meets one coming the other way. Pick a castle to send every wave and engine there (T orders your army to attack it). Engines are worked by two engineers: when both fall, the engine stands empty and any marching soldier, or you (E), can take it over.</div>';
      const auto = document.createElement('button');
      auto.addEventListener('click', () => { g.setSiegeTarget(null); g.audio.play('order'); this.refreshShop(); });
      sel.appendChild(auto);
      this.autoBtn = auto;
      for (const c of g.castles) {
        if (allied(c.team, g.localTeam)) continue;
        const b = document.createElement('button');
        b.style.borderColor = TEAM_CSS[c.team];
        b.addEventListener('click', () => { if (!c.fallen) { g.setSiegeTarget(c); g.audio.play('order'); this.refreshShop(); } });
        sel.appendChild(b);
        this.targetBtns.push({ b, c });
      }
      grid.appendChild(sel);
    }
    for (const item of SHOP) {
      if (item.tab !== this.tab) continue;
      const card = document.createElement('div');
      card.className = 'card';
      const h = document.createElement('h4');
      h.textContent = item.name;
      const p = document.createElement('p');
      const btn = document.createElement('button');
      btn.addEventListener('click', () => this.clickItem(item, card));
      card.append(h, p, btn);
      grid.appendChild(card);
      this.shopCards.push({ item, card, p, btn, last: '' });
    }
    this.refreshShop();
  }

  // Change class in the field: one card per class, the current one marked.
  buildClassTab(grid) {
    const g = this.game;
    const note = document.createElement('div');
    note.className = 'classnote';
    note.textContent = `Take up another class at your own castle (inside its walls or just outside them): your health keeps its proportion and the new abilities are ready after ${SWITCH.ready} s. You can't change in the middle of a fight, or again within ${SWITCH.cooldown} s. Before the first wave, and while you wait to respawn, the only rule is the castle.`;
    grid.appendChild(note);
    this.classCards = [];
    for (const id of CLASS_IDS) {
      const c = CLASSES[id], m = c.mods;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.borderTop = `3px solid ${c.color}`;
      const h = document.createElement('h4');
      h.innerHTML = `${esc(c.icon)} ${esc(c.name)}<small>${esc(c.role)}</small>`;
      const p = document.createElement('p');
      p.innerHTML = `${esc(c.blurb)}
        <div class="ab"><b>Q · ${esc(c.q.icon)} ${esc(c.q.name)}</b>: ${esc(c.q.desc)}</div>
        <div class="ab"><b>R · ${esc(c.r.icon)} ${esc(c.r.name)}</b>: ${esc(c.r.desc)}</div>
        <div class="st">Health ${Math.round(PLAYER.hp * m.hp)} · armour ${PLAYER.armor + m.armor} · speed ${pct(m.speed)} · sword ${pct(m.melee)} · bow ${pct(m.bow)}${m.spell !== 1 ? ` · spells ${pct(m.spell)}` : ''}</div>`;
      const btn = document.createElement('button');
      btn.addEventListener('click', () => {
        if (g.localSwitchClass(id)) { card.classList.remove('bought'); void card.offsetWidth; card.classList.add('bought'); }
        else { card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope'); }
        this.refreshShop();
      });
      card.append(h, p, btn);
      grid.appendChild(card);
      this.classCards.push({ id, card, btn, last: '' });
    }
  }

  // Who garrisons the castle, who marches with you, who goes out with the waves.
  buildRoster(grid) {
    const g = this.game;
    const box = document.createElement('div');
    box.className = 'roster';
    box.innerHTML = `<h5>Your soldiers</h5>
      <p class="help"><b>Garrison</b> soldiers stay home and defend the castle (archers man the walls). <b>Army</b> soldiers follow you and take your orders (F1–F4, T). <b>Lane</b> soldiers march out with the waves. Click to move them.</p>
      <div class="rbar" data-r="counts"></div>
      <div class="rbar"><span class="lbl">New recruits join the</span><span data-r="recruit"></span></div>
      <div class="rbar"><span class="lbl">Move everyone to</span><span data-r="all"></span></div>
      <div class="rbar" data-r="types"></div>
      <div class="rlist" data-r="list"></div>`;
    grid.appendChild(box);
    const q = (k) => box.querySelector(`[data-r="${k}"]`);
    const r = this.roster = { box, counts: q('counts'), list: q('list'), rows: new Map(), types: {}, recruitBtns: [] };
    const roleButtons = (host, act, withIcon = true) => {
      const btns = [];
      for (const role of ROLES) {
        const b = document.createElement('button');
        b.textContent = withIcon ? `${role.icon} ${role.label}` : role.icon;
        b.title = `${role.label}: ${role.tip}`;
        b.dataset.role = role.id;
        b.addEventListener('click', () => { act(role.id); g.audio.play('order'); this.refreshShop(); });
        host.appendChild(b);
        btns.push(b);
      }
      return btns;
    };
    // recruits go to the garrison or straight into the army
    for (const role of ROLES.slice(0, 2)) {
      const b = document.createElement('button');
      b.textContent = `${role.icon} ${role.label}`;
      b.title = role.tip;
      b.dataset.role = role.id;
      b.addEventListener('click', () => { g.localRecruitRole(role.id); g.audio.play('order'); this.refreshShop(); });
      q('recruit').appendChild(b);
      r.recruitBtns.push(b);
    }
    roleButtons(q('all'), (role) => g.localRoles({ role }));
    // one line per type of soldier you have
    for (const t of ROSTER_TYPES) {
      const span = document.createElement('span');
      span.className = 'rtype hidden';
      const label = document.createElement('span');
      span.appendChild(label);
      roleButtons(span, (role) => g.localRoles({ role, type: t }), false);
      q('types').appendChild(span);
      r.types[t] = { span, label };
    }
    const empty = document.createElement('div');
    empty.className = 'rempty';
    empty.textContent = 'You have no soldiers yet. Recruit some below.';
    r.empty = empty;
    r.list.appendChild(empty);
  }

  makeRosterRow(u) {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'rrow';
    el.innerHTML = '<span class="nm"></span><span class="hpbar"><b></b></span><span class="rb"></span>';
    const btns = {};
    for (const role of ROLES) {
      const b = document.createElement('button');
      b.textContent = role.icon;
      b.title = `${role.label}: ${role.tip}`;
      b.addEventListener('click', () => { g.localRoles({ role: role.id, ids: [u.id] }); g.audio.play('order'); this.refreshShop(); });
      el.querySelector('.rb').appendChild(b);
      btns[role.id] = b;
    }
    return { el, nm: el.querySelector('.nm'), hp: el.querySelector('.hpbar b'), btns, last: '' };
  }

  refreshRoster() {
    const r = this.roster;
    if (!r) return;
    const g = this.game, f = g.localFaction;
    const mine = g.units.filter((u) => u.alive && u.team === g.localTeam && !u.isHero && !u.isGiant && !u.isCrew).sort((a, b) => a.id - b.id);
    const c = g.roleCounts(g.localTeam);
    const counts = `🏰 Garrison ${c.garrison} · ⚔ Army ${c.army} · ➤ Lane ${c.lane} · barracks ${g.garrisonCount(g.localTeam)}/${f.troopCap}`;
    if (r.counts.textContent !== counts) r.counts.textContent = counts;
    for (const b of r.recruitBtns) b.classList.toggle('active', b.dataset.role === (f.recruitRole || 'garrison'));
    const perType = {};
    for (const u of mine) perType[u.type] = (perType[u.type] || 0) + 1;
    for (const t of ROSTER_TYPES) {
      const n = perType[t] || 0;
      const o = r.types[t];
      o.span.classList.toggle('hidden', !n);
      const txt = `${UNIT_TYPES[t].name} ×${n}`;
      if (o.label.textContent !== txt) o.label.textContent = txt;
    }
    const seen = new Set();
    for (const u of mine) {
      seen.add(u.id);
      let row = r.rows.get(u.id);
      if (!row) {
        row = this.makeRosterRow(u);
        r.rows.set(u.id, row);
        r.list.appendChild(row.el);
      }
      const name = `${u.name}${u.rank > 1 ? ' ' + '★'.repeat(u.rank) : ''}`;
      if (row.last !== name) { row.nm.textContent = name; row.last = name; }
      row.hp.style.width = `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`;
      for (const role of ROLES) row.btns[role.id].classList.toggle('active', u.role === role.id);
    }
    for (const [id, row] of r.rows) if (!seen.has(id)) { row.el.remove(); r.rows.delete(id); }
    r.empty.classList.toggle('hidden', mine.length > 0);
  }

  // Clickable troop commands (the same as the keys shown on the command bar).
  buildOrders(grid) {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'orders-grid';
    const section = (title, items, note) => {
      const sec = document.createElement('div');
      const h = document.createElement('h5');
      h.textContent = title;
      const row = document.createElement('div');
      row.className = 'row';
      for (const it of items) {
        const b = document.createElement('button');
        b.innerHTML = `<kbd>${it.key}</kbd> ${esc(it.label)}`;
        b.addEventListener('click', () => { it.act(); g.audio.play('order'); this.refreshShop(); });
        row.appendChild(b);
        this.orderBtns.push({ b, active: it.active });
      }
      sec.append(h, row);
      if (note) { const n = document.createElement('div'); n.className = 'note'; n.textContent = note; sec.appendChild(n); }
      wrap.appendChild(sec);
    };
    const p = g.player;
    const setGroup = (grp) => () => { p.group = grp; };
    section('Who gets the order (only soldiers in your army obey)', [
      { key: 'G', label: 'Whole army', act: setGroup('all'), active: () => (p.group || 'all') === 'all' },
      { key: 'G', label: 'Infantry', act: setGroup('infantry'), active: () => p.group === 'infantry' },
      { key: 'G', label: 'Archers', act: setGroup('archers'), active: () => p.group === 'archers' },
      { key: 'G', label: 'Cavalry', act: setGroup('cavalry'), active: () => p.group === 'cavalry' },
    ]);
    section('Orders', [
      { key: 'F1', label: 'Follow me', act: () => g.localOrder('follow'), active: () => p.lastOrder === 'follow' },
      { key: 'F2', label: 'Hold here', act: () => g.localOrder('hold'), active: () => p.lastOrder === 'hold' },
      { key: 'F3', label: 'Charge', act: () => g.localOrder('charge'), active: () => p.lastOrder === 'charge' },
      { key: 'F4', label: 'Defend castle', act: () => g.localOrder('defend'), active: () => (p.lastOrder || 'defend') === 'defend' },
      { key: 'T', label: 'Assault target', act: () => g.localOrder('assault'), active: () => p.lastOrder === 'assault' },
      ...(g.objective === 'koth' ? [{ key: 'Y', label: 'Take the hill', act: () => g.localHillOrder(), active: () => false }] : []),
    ], 'Hold here places them 6 m in front of where you are looking. Assault sends them at the target chosen in the Siege tab.' + (g.objective === 'koth' ? ' Take the hill sends them to the hill in the middle of the map to hold it.' : ''));
    const setForm = (f) => () => { if ((g.localFaction.formation || 'line') !== f) { while ((g.localFaction.formation || 'line') !== f) g.localFormation(); } };
    section('Formation', [
      { key: 'F', label: 'Line', act: setForm('line'), active: () => (g.localFaction.formation || 'line') === 'line' },
      { key: 'F', label: 'Shield Wall', act: setForm('shieldwall'), active: () => g.localFaction.formation === 'shieldwall' },
      { key: 'F', label: 'Loose', act: setForm('loose'), active: () => g.localFaction.formation === 'loose' },
    ], 'Formations shape how troops follow and hold. A held Shield Wall locks shields and stands its ground.');
    section('Gate', [
      { key: 'E', label: 'Bar / unbar the gate', act: () => g.localToggleGate(), active: () => g.localFaction.castle.gateLocked },
    ], 'You can also pull the lever just inside your gate. A barred gate stays shut, even to your own troops.');
    const sum = document.createElement('div');
    sum.className = 'note';
    sum.id = 'troopSummary';
    wrap.appendChild(sum);
    grid.appendChild(wrap);
  }

  clickItem(item, card) {
    const g = this.game;
    const f = g.localFaction;
    const can = item.can(g, f);
    const cost = Math.round(item.cost(g, f));
    let msg = null;
    if (can !== true) msg = can;
    else if (f.gold < cost) msg = `Need ${cost - Math.floor(f.gold)} more gold`;
    if (msg) {
      g.audio.play('deny');
      this.toast(msg);
      card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope');
      return;
    }
    g.buyForPlayer(item.id);
    card.classList.remove('bought'); void card.offsetWidth; card.classList.add('bought');
    this.refreshShop();
  }

  // Update gold, descriptions and button states in place.
  refreshShop() {
    const g = this.game;
    if (g.hero) { refreshTalentTab(this); return; }   // (no gold, army or class cards to refresh)
    const f = g.localFaction;
    $('shopGold').textContent = Math.floor(f.gold);
    const rc = g.roleCounts(g.localTeam);
    $('shopTroops').textContent = `garrison ${rc.garrison} · army ${rc.army} · lane ${rc.lane} (barracks ${g.garrisonCount(g.localTeam)}/${f.troopCap})`;
    this.refreshRoster();
    refreshTalentTab(this);
    if (this.autoBtn && this.tab === 'siege') {
      const now = g.siegeTarget(f);
      const txt = f.siegeTarget ? 'Auto lanes' : `✓ Auto lanes · now ${now ? g.factions[now.team].name : 'no target'}`;
      if (this.autoBtn.textContent !== txt) this.autoBtn.textContent = txt;
      this.autoBtn.classList.toggle('active', !f.siegeTarget);
    }
    for (const t of this.targetBtns || []) {
      const chosen = !!f.siegeTarget && g.siegeTarget(f) === t.c;
      const txt = (chosen ? '✓ ' : '') + g.factions[t.c.team].name + (t.c.fallen ? ' (fallen)' : '');
      if (t.b.textContent !== txt) t.b.textContent = txt;
      t.b.disabled = t.c.fallen;
      t.b.classList.toggle('active', chosen);
    }
    for (const o of this.orderBtns || []) o.b.classList.toggle('active', !!o.active());
    if ($('troopSummary')) {
      const mine = g.units.filter((u) => u.alive && u.team === g.localTeam && u.army && !u.isCrew);
      const n = (k) => mine.filter((u) => u.kind === k).length;
      $('troopSummary').textContent = mine.length
        ? `Your army: ${n('infantry')} infantry, ${n('archer')} archers, ${n('cavalry')} cavalry · ${mine.filter((u) => u.rank >= 3).length} veterans`
        : 'Your army is empty. Open the Army tab to choose who marches with you.';
    }
    for (const c of this.classCards || []) {
      const pl = g.player, why = pl.classBlock(c.id), mine = c.id === pl.classId;
      const label = mine ? '✓ Your class' : why || 'Switch to this class';
      if (c.last !== label) { c.btn.textContent = label; c.last = label; }
      c.btn.classList.toggle('unavailable', !!why);
      c.card.classList.toggle('current', mine);
    }
    for (const c of this.shopCards || []) {
      const can = c.item.can(g, f);
      const cost = Math.round(c.item.cost(g, f));
      const desc = c.item.desc(g, f);
      if (c.p.textContent !== desc) c.p.textContent = desc;
      const label = can !== true ? can : `Buy · <b>${cost}</b> <span class="coin">●</span>`;
      if (c.last !== label) { c.btn.innerHTML = can !== true ? esc(can) : label; c.last = label; }
      c.btn.classList.toggle('unavailable', can !== true);
      c.btn.classList.toggle('poor', can === true && f.gold < cost);
    }
  }

  // ---------- lobby ----------
  showLobby(code, isHost) {
    $('menu').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    // the invite link opens the game with the code filled in; inside claude.ai the page can't see its own
    // share link, so friends get the code and open the same game link
    const viaRoom = this.game.net && this.game.net.viaRoom;
    const link = viaRoom ? '' : `${location.origin}${location.pathname}?join=${code}`;
    $('inviteLink').value = viaRoom ? `Join my Castle Wars game with code ${code}` : link;
    $('inviteHelp').textContent = viaRoom
      ? 'Send friends this game\'s link and the code. They press Multiplayer, enter it and press Join.'
      : 'Send friends the invite link. It opens the game with your code filled in.';
    $('invite').classList.toggle('hidden', !isHost);
    $('lobbyHostCtl').classList.toggle('hidden', !isHost);
    $('lobbyWait').classList.toggle('hidden', isHost);
    for (const b of document.querySelectorAll('#lobbyModes button')) b.disabled = !isHost;
  }

  renderLobby(players, myTeam = -1, coop = false, objective = 'conquest') {
    const clsName = (p) => (CLASSES[p.cls] ? ` · ${CLASSES[p.cls].icon} ${CLASSES[p.cls].name}` : '');
    $('lobbyMode').textContent = coop
      ? (players.length >= 4
        ? 'Co-op: four players make two teams of two: Blue + Red against Green + Gold.'
        : 'Co-op: all players are allies against the AI lords.')
      : 'Versus: every castle for itself.';
    for (const b of document.querySelectorAll('#lobbyModes button')) b.classList.toggle('active', (b.dataset.mode === 'coop') === coop);
    const obj = OBJECTIVES[objective] ? objective : 'conquest';
    for (const b of document.querySelectorAll('#lobbyObjective button')) b.classList.toggle('active', b.dataset.o === obj);
    $('lobbyObjDesc').textContent = `${OBJECTIVES[obj].name}: ${OBJECTIVES[obj].desc}`;
    const slots = [0, 1, 2, 3].map((t) => players.find((p) => p.team === t));
    const twoTeams = coop && players.length >= 4;   // four players: Blue + Red against Green + Gold
    $('lobbyList').innerHTML = slots.map((p, t) => `<li style="border-left-color:${TEAM_CSS[t]}">
      <b style="color:${TEAM_CSS[t]}">${esc(['Blue', 'Red', 'Green', 'Gold'][t])} castle${twoTeams ? ` <small>· team ${t < 2 ? 1 : 2}</small>` : ''}</b>
      <span>${p ? esc(p.name) + (p.team === myTeam ? ' (you)' : '') + (t === 0 ? ' · host' : '') + esc(clsName(p)) : '<i>AI lord' + (coop ? ' (enemy)' : '') + '</i>'}</span></li>`).join('');
  }

  lobbyError(msg) {
    $('netMsg').textContent = msg;
  }

  // ---------- menus ----------
  showPause(show) {
    $('pause').classList.toggle('hidden', !show);
    if (show) this.toggleMap(false);
  }

  gameOver(won, winner = -1, reason = '') {
    const g = this.game;
    const f = g.localFaction;
    const wf = g.factions[winner];
    const team = won && g.coop;
    $('gameover').classList.remove('hidden');
    if (g.hero) { this.heroGameOver(won, winner, reason); return; }
    $('goHeroes').classList.add('hidden');
    $('goTitle').textContent = won ? 'Victory!' : 'Defeat';
    $('goTitle').className = won ? 'win' : 'lose';
    $('goText').textContent = reason || (team
      ? 'Every rival house has fallen. Your alliance rules the realm.'
      : won
      ? 'Yours is the last castle standing. The realm bows to you.'
      : wf ? `${wf.name} is the last castle standing.` : 'No castle is left standing.');
    $('goStats').innerHTML = `
      <div><b>${g.round}</b><span>waves</span></div>
      <div><b>${g.player.kills}</b><span>your kills</span></div>
      <div><b>${f.kills}</b><span>army kills</span></div>
      <div><b>${f.earned}</b><span>gold earned</span></div>
      <div><b>${g.player.deaths}</b><span>deaths</span></div>
      ${g.objective === 'koth' ? `<div><b>${clock(Math.floor(g.hill.held[[0, 1, 2, 3].find((t) => allied(t, f.team))]))}</b><span>on the hill</span></div>` : ''}`;
    this.hideHud();
  }

  showHud() {
    $('hud').classList.remove('hidden');
    $('hud').classList.toggle('practice', !!(this.game && this.game.practice));
  }
  hideHud() { $('hud').classList.add('hidden'); }

  // ---------- per-frame HUD ----------
  update(dt) {
    const g = this.game;
    if (!g || g.state === 'menu' || g.state === 'loading') return;
    const p = g.player;
    const f = g.localFaction;
    this.syncHero();
    if (this.shopOpen) {
      this.shopT = (this.shopT || 0) - dt;
      if (this.shopT <= 0) { this.shopT = 0.25; this.refreshShop(); }
    }

    $('vignette').style.opacity = Math.min(0.8, p.hurtFlash * 0.7 + (p.alive && p.hp < p.maxHp * 0.3 ? 0.25 : 0));
    $('hpFill').style.width = `${(p.hp / p.maxHp) * 100}%`;
    $('stFill').style.width = `${p.stamina}%`;
    this.updateAbilities(dt);
    updateTalentHud(this, p);
    $('crosshair').classList.toggle('block', p.blocking);
    this.updateDirs();
    this.updatePrompt();
    $('crosshair').classList.toggle('bow', p.weapon === 'bow');
    $('drawFill').style.width = p.weapon === 'bow' ? `${Math.min(1, p.drawT / p.drawTime) * 100}%` : '0%';

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      $('hpText').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      $('gold').textContent = Math.floor(f.gold);
      $('round').textContent = g.round ? `Wave ${g.round}` : 'Preparation';
      if (g.phase === 'prep') $('phase').textContent = `Battle begins in ${clock(g.phaseT)}`;
      else $('phase').textContent = `Next wave in ${clock(g.phaseT)}`;
      $('war').textContent = f.castle.fallen ? 'Your keep has fallen' : `Your armies march on ${g.targetName(f)}`;
      if (g.practice) { $('round').textContent = 'Practice courtyard'; $('phase').textContent = 'P: the practice panel'; $('war').textContent = 'Try heroes and soldiers on the dummies'; updatePracticeHud(this); }
      $('weapon').textContent = p.drive ? `${p.drive.name} · ${Math.ceil(p.drive.hp)}/${Math.round(p.drive.maxHp)} HP`
        : p.weapon === 'sword' ? `${p.sword.name} & ${p.shield.name}`
        : `${p.bow.name} · ${p.arrows} arrows`;
      $('potions').textContent = `Potions ${p.potions} (H)` + (p.hasHorse ? ` · Horse ${Math.ceil(p.horseHp)}/320 (E)` : '');
      const grp = { all: 'Whole army', infantry: 'Infantry', archers: 'Archers', cavalry: 'Cavalry' }[p.group || 'all'];
      const ord = { follow: 'Following', hold: 'Holding', charge: 'Charging', defend: 'Defending', assault: 'Assaulting' }[p.lastOrder || 'defend'];
      const vets = g.units.filter((u) => u.alive && u.team === g.localTeam && u.rank >= 3).length;
      const form = FORMATIONS[f.formation || 'line'].name;
      const rc = g.roleCounts(g.localTeam);
      $('army').textContent = `Garrison ${rc.garrison} · army ${rc.army} · lane ${rc.lane}/${f.troopCap}${vets ? ` · ${vets}★` : ''} · ${form} · ${grp} · ${ord}`;
      $('clsName').textContent = `${p.cls.icon} ${p.cls.name}`;
      $('clsName').style.color = p.cls.color;
      $('lvl').textContent = ` · Lv ${p.level}`;
      $('xpFill').style.width = `${(levelProgress(p.xp, p.level) * 100).toFixed(1)}%`;
      $('xpbar').classList.toggle('max', p.level >= MAX_LEVEL);
      $('xpbar').title = p.level >= MAX_LEVEL ? 'Level 5: the highest level' : `Level ${p.level}: ${Math.floor(p.xp)} / ${XP_FOR_LEVEL[p.level + 1]} experience`;
      if (g.hero) this.updateHeroHud(); else this.renderFactions();
      this.updateHill(dt);
      if (!p.alive) {
        $('respawn').classList.remove('hidden');
        $('respawnT').textContent = f.castle.fallen ? 'Your keep has fallen – no respawn' : `Respawning in ${Math.ceil(g.hero ? this.heroRespawn() : f.respawnT)}s`;
      } else $('respawn').classList.add('hidden');
      $('scoreboard').classList.toggle('hidden', !g.input.down('Tab'));
      if (g.input.down('Tab')) this.renderScoreboard();
    }
    this.targetT -= dt;
    if (this.targetT <= 0) { this.targetT = 0.15; this.updateTarget(); }
    if (this.practiceOpen) { this.prT -= dt; if (this.prT <= 0) { this.prT = 0.25; refreshPractice(this); } }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.drawMinimap(); }
    if (this.mapOpen) {
      this.bigT -= dt;
      if (this.bigT <= 0) { this.bigT = 0.1; this.drawBigMap(); }
    }
  }

  // The hill in the middle: who holds it, who is taking it, and (King of the Hill) how long each side has held it.
  updateHill(dt) {
    const g = this.game, h = g.hill, el = $('hill');
    if (!h) return;
    const koth = g.objective === 'koth';
    if (!koth) { el.classList.add('hidden'); return; }
    const me = g.localTeam;
    const nm = (t) => (t === me ? 'You' : g.factions[t].name);
    let state, color = 'var(--parch)';
    if (h.contested) { state = 'Contested'; color = '#ff8a6a'; }
    else if (h.owner >= 0) { state = allied(h.owner, me) && h.owner !== me ? `Held by ally ${g.factions[h.owner].name.replace(/^House /, '')}` : `Held by ${nm(h.owner).replace(/^House /, '')}`; color = TEAM_CSS[h.owner]; }
    else state = 'Nobody holds it';
    const taking = !h.contested && h.capturer >= 0 && h.progress > 0.01;
    const bar = taking ? h.progress : h.owner >= 0 && !h.contested ? 1 : 0;
    const barColor = taking ? TEAM_CSS[h.capturer] : h.owner >= 0 ? TEAM_CSS[h.owner] : '#888';
    let lines = '';
    if (taking) lines += `<div class="hc" style="color:${TEAM_CSS[h.capturer]}">${esc(nm(h.capturer).replace(/^House /, ''))} taking it · ${Math.round(h.progress * 100)}%</div>`;
    if (koth) {
      const seen = new Set(), parts = [];
      for (const f of g.factions) {
        const k = [0, 1, 2, 3].find((t) => allied(t, f.team));
        if (seen.has(k) || (f.eliminated && !h.held[k])) continue;
        seen.add(k);
        const mine = allied(k, me);
        parts.push(`<span style="color:${TEAM_CSS[k]}${mine ? ';font-weight:700' : ''}">${mine ? 'You' : esc(f.name.replace(/^House /, ''))} ${clock(Math.floor(h.held[k]))}</span>`);
      }
      lines += `<div class="hs">${parts.join(' · ')} · first to ${clock(HILL.target)}</div>`;
    }
    const html = `<div class="ht"><span>⛰ The Hill</span><b style="color:${color}">${esc(state)}</b></div><div class="hb"><i style="width:${(bar * 100).toFixed(0)}%;background:${barColor}"></i></div>${lines}`;
    if (html !== this.hillHtml) { this.hillHtml = html; el.innerHTML = html; }
    el.classList.toggle('hidden', g.state !== 'playing');
  }

  // Q and R: icon, name, cooldown sweep and the effects running on you
  updateAbilities(dt) {
    const p = this.game.player;
    if (!this.abilEls) {
      const mk = (id) => { const r = $(id); return { r, ic: r.querySelector('.ic'), nm: r.querySelector('.nm'), cd: r.querySelector('.cd'), sec: r.querySelector('.sec') }; };
      this.abilEls = { q: mk('abilQ'), r: mk('abilR') };
    }
    if (this.abilClass !== p.classId) {
      this.abilClass = p.classId;
      for (const slot of ['q', 'r']) {
        const d = p.cls[slot], e = this.abilEls[slot];
        e.ic.textContent = d.icon;
        e.nm.textContent = d.name;
        e.r.title = `${d.name} (${d.cd} s): ${d.desc}`;
      }
    }
    for (const slot of ['q', 'r']) {
      const e = this.abilEls[slot], d = p.cls[slot], cd = p.abilCd[slot];
      const k = cd > 0 ? Math.min(1, cd / d.cd) : 0;
      const t = `scaleY(${k.toFixed(3)})`;
      if (e.cd.style.transform !== t) e.cd.style.transform = t;
      const sec = cd > 0 ? String(Math.ceil(cd)) : '';
      if (e.sec.textContent !== sec) e.sec.textContent = sec;
      e.r.classList.toggle('ready', (cd <= 0 || (d.id === 'evade' && p.buffs.has('twin'))) && p.alive && !p.drive);
      e.r.classList.toggle('aiming', !!p.aiming && p.aiming.slot === slot);
    }
    const aim = !!p.aiming;
    if (aim !== this.aimShown) { this.aimShown = aim; $('aimhint').classList.toggle('hidden', !aim); }
    this.buffT = (this.buffT || 0) - dt;
    if (this.buffT <= 0) {
      this.buffT = 0.12;
      const html = p.buffs.list().filter(([id]) => BUFF_NAMES[id]).map(([id, t, v]) => `<span>${esc(BUFF_NAMES[id])} ${id === 'ward' ? Math.ceil(v) + ' left' : t.toFixed(1) + 's'}</span>`).join('');
      if (html !== this.buffHtml) { this.buffHtml = html; $('buffs').innerHTML = html; }
    }
  }

  renderFactions() {
    const g = this.game;
    let html = '';
    for (const f of g.factions) {
      const c = f.castle;
      const keep = Math.round((c.keep.hp / c.keep.maxHp) * 100);
      const gate = c.gate.alive ? Math.round((c.gate.hp / c.gate.maxHp) * 100) + '%' : 'BROKEN';
      const heroAlive = f.isPlayer && f.player ? f.player.alive : f.hero && f.hero.alive;
      const hero = f.eliminated ? '☠' : heroAlive ? '♚' : `⟳${Math.ceil(Math.max(0, f.respawnT))}`;
      // the 'ally' tag comes first so a long house name can't push it out of sight
      const ally = g.coop && f.team !== g.localTeam && allied(f.team, g.localTeam);
      html += `<div class="fac ${f.eliminated ? 'dead' : ''}">
        <i style="background:${TEAM_CSS[f.team]}"></i><span class="n">${ally ? '<em class="ally">ally</em>' : ''}<span class="nm">${esc(f.team === g.localTeam ? 'You' : f.name)}</span>${g.objective === 'koth' ? `<em class="hl" title="time on the hill">⛰ ${clock(Math.floor(g.hill.held[[0, 1, 2, 3].find((t) => allied(t, f.team))]))}</em>` : ''}</span>
        <span class="h" title="hero">${hero}</span>
        <span class="bar"><b style="width:${keep}%"></b></span>
        <span class="g" title="gate">${c.fallen ? 'FALLEN' : gate}</span>
        <span class="t" title="troops">${g.troopCount(f.team)}⚔</span></div>`;
    }
    $('factions').innerHTML = html;
  }

  renderScoreboard() {
    const g = this.game;
    if (g.hero) { this.renderHeroScoreboard(); return; }
    let rows = '';
    for (const f of g.factions) {
      const c = f.castle;
      const rc = g.roleCounts(f.team);
      const cls = f.isPlayer && f.player && f.player.classId ? ` (${esc(f.player.cls.name)} Lv ${f.player.level})` : '';
      rows += `<tr style="color:${TEAM_CSS[f.team]}"><td>${esc(f.name)}</td><td>${esc(f.lord)}${cls}</td><td>${Math.floor(f.gold)}</td>
        <td>${rc.garrison + rc.army}/${f.troopCap} · ${rc.army} · ${rc.lane}</td><td>${f.kills}</td><td>${f.heroDeaths}</td>
        ${g.objective === 'koth' ? `<td>${clock(Math.floor(g.hill.held[[0, 1, 2, 3].find((t) => allied(t, f.team))]))}${g.hill.owner === f.team ? ' ★' : ''}</td>` : ''}<td>${c.fallen ? 'Fallen' : Math.round(c.keep.hp) + ' / ' + c.keep.maxHp}</td><td>${f.eliminated ? 'Eliminated' : 'Alive'}</td></tr>`;
    }
    $('hillTh').style.display = g.objective === 'koth' ? '' : 'none';
    $('scoreRows').innerHTML = rows;
  }

  // ---------- Hero Game Mode ----------
  // game.hero swaps the war HUD for the hero one: the orders bar, army line, gold, castle list and hill box go (CSS, by the class
  // `hero` on the HUD), the score panel, the roster of the six heroes and the Talents-only shop come, and the key hints change.
  syncHero() {
    const g = this.game, h = g.hero || null;
    if (h === this.heroSeen) return;
    this.heroSeen = h;
    for (const id of ['hud', 'shop', 'scoreboard', 'controls']) $(id).classList.toggle('hero', !!h);
    if (this.hintHtml === undefined) { this.hintHtml = $('hint').innerHTML; this.clsHintText = $('clsHint').textContent; }
    $('hint').innerHTML = h ? 'Esc: menu · N: talents · M: map · Q / R: abilities · C:&nbsp;duck · Tab: scores' : this.hintHtml;
    $('clsHint').textContent = h ? ' · N → Talents' : this.clsHintText;
    this.heroHtml = '';
    this.heroBars = {};
    if (!h) { this.tab = 'army'; return; }
    this.tab = 'talents';
    $('heroBarKB').firstElementChild.style.background = TEAM_CSS[0];
    $('heroBarKR').firstElementChild.style.background = TEAM_CSS[1];
    $('heroTop').querySelector('.hside.b .hn b').style.color = TEAM_CSS[0];
    $('heroTop').querySelector('.hside.r .hn b').style.color = TEAM_CSS[1];
    if (g.state === 'playing') {   // (instead of the war modes' "Prepare for battle")
      const prep = h.prepLeft > 0 ? h.prepLeft : g.phaseT;
      this.banner('Hero Game Mode', `${heroGoal(h)}. The armies march in ${clock(prep)} and every ${WAVES.interval} seconds after. N: talents · M: map · Q / R: abilities.`);
    }
  }

  // seconds until the local hero rises (the faction's timer, or the roster's when that is what the rules keep)
  heroRespawn() {
    const g = this.game, h = g.hero, me = h && h.roster ? h.roster().find((r) => r.mine) : null;
    return me && me.respawnIn > 0 ? me.respawnIn : Math.max(0, g.localFaction.respawnT);
  }

  // the score panel (kills, the goal, the clock, the round), both keeps and gates, and the roster of the six heroes
  updateHeroHud() {
    const g = this.game, h = g.hero;
    const set = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
    const kills = (t) => (h.sides && h.sides[t] ? h.sides[t].kills : 0) || 0;
    set('heroScoreB', String(kills(0)));
    set('heroScoreR', String(kills(1)));
    set('heroGoal', heroGoal(h));
    set('heroClock', h.remaining != null ? `Time left ${clock(h.remaining)}` : `Battle ${clock(h.clock || 0)}`);
    set('heroRound', h.prepLeft > 0 ? `Prepare: ${Math.ceil(h.prepLeft)} s` : `Round ${g.round} · next army in ${Math.ceil(Math.max(0, g.phaseT))} s`);
    for (const [t, k, name] of [[0, 'B', 'Blue'], [1, 'R', 'Red']]) {
      const c = g.castles[t];
      if (!c) continue;
      const keep = c.fallen ? 0 : Math.max(0, Math.min(1, c.keep.hp / c.keep.maxHp));
      const gate = c.gate.alive ? Math.max(0, Math.min(1, c.gate.hp / c.gate.maxHp)) : 0;
      set(`heroKeep${k}`, `Keep ${Math.round(keep * 100)}%`);
      for (const [bar, v, title] of [[`heroBarK${k}`, keep, `${name} keep ${Math.round(keep * 100)}%`], [`heroBarG${k}`, gate, c.gate.alive ? `${name} gate ${Math.round(gate * 100)}%` : `${name} gate broken`]]) {
        const el = $(bar), w = `${(v * 100).toFixed(0)}%`;
        if (this.heroBars[bar] !== w) { this.heroBars[bar] = w; el.firstElementChild.style.width = w; }
        if (el.title !== title) el.title = title;
      }
    }
    const rows = typeof h.roster === 'function' ? h.roster() : [];
    let html = '', prev = null;
    for (const r of rows) {
      const c = CLASSES[r.cls] || { icon: '?', name: String(r.cls || ''), color: NEUTRAL_CSS };
      const p = r.player, hp = p && p.maxHp ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 1;
      html += `<div class="hr${r.mine ? ' me' : ''}${r.alive ? '' : ' down'}${prev !== null && prev !== r.team ? ' sep' : ''}" style="border-left-color:${TEAM_CSS[r.team] || NEUTRAL_CSS}">
        <span class="ic" title="${esc(c.name)}">${esc(c.icon)}</span><span class="nm" title="${esc(r.name)}${r.mine ? ' (you)' : ''}">${esc(r.name)}</span><span class="lv">Lv ${r.level}</span><span class="kd" title="hero kills / deaths">${r.kills}/${r.deaths}</span>${
  r.alive ? `<span class="st" title="alive"><span class="bar"><b style="width:${Math.round(hp * 100)}%"></b></span></span>` : `<span class="st respawn">respawn ${Math.ceil(r.respawnIn || 0)} s</span>`}</div>`;
      prev = r.team;
    }
    if (html !== this.heroHtml) { this.heroHtml = html; $('heroRoster').innerHTML = html; }
  }

  // the table of the six heroes: the scoreboard (Tab) and the end screen share it
  heroTable(rows, withStatus) {
    return rows.map((r) => {
      const c = CLASSES[r.cls] || { icon: '', name: String(r.cls || '') };
      const side = r.team === 0 ? 'Blue' : 'Red';
      return `<tr class="${r.mine ? 'me' : ''}${r.alive || !withStatus ? '' : ' down'}"><td><i class="sw" style="background:${TEAM_CSS[r.team] || NEUTRAL_CSS}"></i>${side}</td><td>${esc(r.name)}${r.mine ? ' (you)' : ''}</td><td>${esc(c.icon)} ${esc(c.name)}</td><td>${r.level}</td><td>${r.kills}</td><td>${r.deaths}</td>${withStatus ? `<td>${r.alive ? 'Alive' : `Respawn in ${Math.ceil(r.respawnIn || 0)} s`}</td>` : ''}</tr>`;
    }).join('');
  }

  // Tab: the score on top, then the six heroes
  renderHeroScoreboard() {
    const g = this.game, h = g.hero;
    const kills = (t) => (h.sides && h.sides[t] ? h.sides[t].kills : 0) || 0;
    const mode = HERO.modes[h.win] ? HERO.modes[h.win].name : '';
    $('heroScoreTop').innerHTML = `<span style="color:${TEAM_CSS[0]}">Blue ${kills(0)}</span><i>:</i><span style="color:${TEAM_CSS[1]}">${kills(1)} Red</span>`;
    $('heroScoreSub').textContent = `${mode ? mode + ': ' : ''}${heroGoal(h)} · ${h.remaining != null ? `time left ${clock(h.remaining)}` : `battle ${clock(h.clock || 0)}`} · round ${g.round}`;
    $('heroScoreRows').innerHTML = this.heroTable(typeof h.roster === 'function' ? h.roster() : [], true);
  }

  // the end of a hero match: why, the score and what each of the six heroes did
  heroGameOver(won, winner, reason) {
    const g = this.game, h = g.hero, res = h.result || {};
    const w = res.winner !== undefined ? res.winner : winner;
    const draw = w === undefined || w < 0;
    const kills = (t) => (h.sides && h.sides[t] ? h.sides[t].kills : 0) || 0;
    $('goTitle').textContent = draw ? 'A draw' : won ? 'Victory!' : 'Defeat';
    $('goTitle').className = draw ? '' : won ? 'win' : 'lose';
    $('goText').textContent = res.reason || reason || (draw ? 'Neither side won the day.' : won ? 'Blue wins the battle.' : 'Red wins the battle.');
    $('goStats').innerHTML = `
      <div><b style="color:${TEAM_CSS[0]}">${kills(0)}</b><span>Blue hero kills</span></div>
      <div><b style="color:${TEAM_CSS[1]}">${kills(1)}</b><span>Red hero kills</span></div>
      <div><b>${clock(h.clock || 0)}</b><span>of battle</span></div>
      <div><b>${g.round}</b><span>rounds</span></div>`;
    $('goHeroes').innerHTML = `<table class="herotbl"><thead><tr><th>Side</th><th>Hero</th><th>Class</th><th>Level</th><th>Kills</th><th>Deaths</th></tr></thead><tbody>${this.heroTable(typeof h.roster === 'function' ? h.roster() : [], false)}</tbody></table>`;
    $('goHeroes').classList.remove('hidden');
    this.hideHud();
  }

  updateTarget() {
    const g = this.game;
    const p = g.player;
    const el = $('target');
    if (!p.alive) { el.classList.add('hidden'); return; }
    const origin = g.camera.position;
    const dir = p.lookDir();
    let best = null, bt = 60;
    const check = (o, r, h) => {
      if (!o.alive) return;
      const cx = o.pos.x - origin.x, cy = o.pos.y + h / 2 - origin.y, cz = o.pos.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > bt) return;
      const px = cx - dir.x * t, py = cy - dir.y * t, pz = cz - dir.z * t;
      if (Math.hypot(px, pz) < r + 0.25 && Math.abs(py) < h / 2 + 0.2) { bt = t; best = o; }
    };
    for (const u of g.units) check(u, u.radius, u.height);
    for (const h of g.humans) if (h !== p) check(h, h.radius, h.mounted ? 2.8 : h.height);
    for (const s of g.siege) check(s, s.radius, 3);
    for (const c of g.castles) {
      if (c.gate.alive) check({ alive: true, pos: c.gatePos.clone().setY(c.center.y), ref: c.gate }, 3, CASTLE.gateH);
    }
    if (!best) { el.classList.add('hidden'); return; }
    const o = best.ref || best;
    const team = o.team;
    const house = (g.factions[team] || { name: 'Unknown' }).name;
    let name;
    if (o.isDummy) name = `${o.name} · armour ${o.armor}`;
    else if (o.kind === 'gate') name = `${house} – Gate`;
    else if (o.isSiege) name = `${o.name} – ${house}${o.abandoned ? ' (abandoned: E to take it)' : ''}`;
    else name = `${o.name}${!o.isHero && o.rank > 1 ? ' ' + '★'.repeat(o.rank) : ''} – ${house}${team === g.localTeam && !o.isHero && !o.isGiant && !o.isCrew ? ` · ${o.role}` : ''}`;
    el.classList.remove('hidden');
    $('targetName').textContent = name;
    $('targetName').style.color = TEAM_CSS[team] || NEUTRAL_CSS;
    $('targetFill').style.width = `${(o.hp / o.maxHp) * 100}%`;
    $('targetFill').style.background = team === g.localTeam ? '#4fa3ff' : allied(team, g.localTeam) ? '#4fd17a' : '#d33';
  }

  // ---------- maps ----------
  // The terrain picture behind a map of S pixels. The big map (M) is detailed: hill shading, roads, forests and rocks.
  buildMapBg(S, detailed = false) {
    const g = this.game, P = g.physics;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const span = WORLD.half * 2, d = span / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = (x / S) * span - WORLD.half;
      const wz = (y / S) * span - WORLD.half;
      const h = P.terrainHeight(wx, wz);
      const k = Math.min(1, Math.max(0, (h - 0) / 30));
      let r = 70 + k * 70, gr = 92 + k * 50, b = 50 + k * 50;
      if (detailed) {
        r = 66 + k * 50; gr = 90 + k * 34; b = 52 + k * 30;   // the hills round the edge fade to dry grass, not sand
        // light from the upper left, and roads worn into the grass
        const sx = (P.terrainHeight(wx + d, wz) - P.terrainHeight(wx - d, wz)) / (2 * d);
        const sz = (P.terrainHeight(wx, wz + d) - P.terrainHeight(wx, wz - d)) / (2 * d);
        const lit = Math.min(1.3, Math.max(0.7, 1 + (sx + sz) * 0.55));
        r *= lit; gr *= lit; b *= lit;
        const road = Math.max(0, 1 - roadDist(wx, wz) / 3) * 0.9;
        r += (158 - r) * road; gr += (132 - gr) * road; b += (92 - b) * road;
      }
      const i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (detailed) {
      const k = S / span;
      const seen = new Set();
      const trees = [], rocks = [];
      for (const list of P.grid.values()) {
        for (const o of list) {
          if (seen.has(o)) continue;
          seen.add(o);
          if (o.kind === 'tree') trees.push(o); else if (o.kind === 'stone') rocks.push(o);
        }
      }
      const dot = (o, rad) => {
        ctx.beginPath();
        ctx.arc(((o.minX + o.maxX) / 2 + WORLD.half) * k, ((o.minZ + o.maxZ) / 2 + WORLD.half) * k, rad, 0, Math.PI * 2);
        ctx.fill();
      };
      ctx.fillStyle = 'rgba(28,56,30,0.6)';
      for (const o of trees) dot(o, Math.max(1.6, 2.6 * k));
      ctx.fillStyle = 'rgba(128,126,118,0.95)';
      for (const o of rocks) dot(o, Math.max(1.4, (o.maxX - o.minX) * 0.7 * k));
    }
    return c;
  }

  // One painter for both maps. big: the M map, with house names, the roads armies take and bigger markers.
  paintMap(ctx, S, bg, big) {
    const g = this.game;
    const k = S / (WORLD.half * 2);
    const m = big ? S / 180 * 0.55 : 1;       // marker scale
    const X = (x) => (x + WORLD.half) * k;
    ctx.drawImage(bg, 0, 0, S, S);
    // where each house's armies are marching
    if (big) {
      ctx.save();
      for (const f of g.factions) {
        if (f.eliminated || f.castle.fallen) continue;
        const t = g.siegeTarget(f);
        if (!t) continue;
        const a = f.castle.gatePos, b = t.gatePos;
        const ax = X(a.x), az = X(a.z), bx = X(b.x), bz = X(b.z);
        const mine = f.team === g.localTeam;
        ctx.strokeStyle = ctx.fillStyle = TEAM_CSS[f.team];
        ctx.globalAlpha = mine ? 0.9 : 0.5;
        ctx.lineWidth = mine ? 3.2 : 2;
        ctx.setLineDash([9, 7]);
        ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
        ctx.setLineDash([]);
        const ang = Math.atan2(bz - az, bx - ax), hx = ax + (bx - ax) * 0.6, hz = az + (bz - az) * 0.6;
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(ang) * 9, hz + Math.sin(ang) * 9);
        ctx.lineTo(hx + Math.cos(ang + 2.5) * 8, hz + Math.sin(ang + 2.5) * 8);
        ctx.lineTo(hx + Math.cos(ang - 2.5) * 8, hz + Math.sin(ang - 2.5) * 8);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    for (const c of g.castles) {
      const s = CASTLE.H * 2 * k;
      const cx = X(c.center.x), cz = X(c.center.z);
      ctx.fillStyle = c.fallen ? '#333' : TEAM_CSS[c.team];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(cx - s / 2, cz - s / 2, s, s);
      ctx.globalAlpha = 1;
      if (big) {
        ctx.strokeStyle = '#0008'; ctx.lineWidth = 2;
        ctx.strokeRect(cx - s / 2, cz - s / 2, s, s);
        ctx.fillStyle = '#e8e2d0';
        const tc = (CASTLE.H + CASTLE.towerOff) * k, tr = CASTLE.towerR * k;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.fillRect(cx + sx * tc - tr, cz + sz * tc - tr, tr * 2, tr * 2);                                // the corner towers
          ctx.strokeRect(cx + sx * tc - tr, cz + sz * tc - tr, tr * 2, tr * 2);
        }
        const kp = c.keep.pos;
        ctx.fillStyle = c.fallen ? '#555' : '#f4efe0';
        ctx.fillRect(X(kp.x) - 5, X(kp.z) - 5, 10, 10);                                                 // the keep
      }
      ctx.strokeStyle = c.gate.alive ? '#fff' : '#f33';
      ctx.lineWidth = 2;
      const gp = c.gatePos;
      ctx.beginPath(); ctx.arc(X(gp.x), X(gp.z), 2.5 * m, 0, Math.PI * 2); ctx.stroke();
      if (big) {
        const f = g.factions[c.team];
        const label = `${f.name}${c.team === g.localTeam ? ' (you)' : ''}${c.fallen ? ' · fallen' : ''}`;
        ctx.font = '600 15px Cinzel, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(label, cx, cz - s / 2 - 9);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, cx, cz - s / 2 - 9);
      }
    }
    // King of the Hill: the hill in the middle, shaded in the colour of the house that holds it, red while it is contested
    if (g.objective === 'koth') {
      const h = g.hill, hx = X(0), hz = X(0), r = Math.max(5, HILL.radius * k);
      const col = h.contested ? '#ff6a4a' : h.owner >= 0 ? TEAM_CSS[h.owner] : '#e9dfc2';
      ctx.save();
      ctx.globalAlpha = 0.4; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(hx, hz, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = big ? 3 : 2;
      ctx.beginPath(); ctx.arc(hx, hz, r, 0, Math.PI * 2); ctx.stroke();
      if (h.capturer >= 0 && h.progress > 0) {   // the capture under way
        ctx.strokeStyle = TEAM_CSS[h.capturer]; ctx.lineWidth = big ? 5 : 3;
        ctx.beginPath(); ctx.arc(hx, hz, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, h.progress)); ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0009'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx, hz - r * 0.5); ctx.lineTo(hx + r * 0.42, hz + r * 0.32); ctx.lineTo(hx - r * 0.42, hz + r * 0.32); ctx.closePath(); ctx.fill(); ctx.stroke();   // a peak
      if (big) {
        ctx.font = '600 15px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        const label = 'The Hill';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(label, hx, hz - r - 8);
        ctx.fillStyle = '#fff'; ctx.fillText(label, hx, hz - r - 8);
      }
      ctx.restore();
    }
    for (const u of g.units) {
      if (!u.alive || u.crewOf) continue;   // an engine's crew is shown by the engine
      ctx.fillStyle = TEAM_CSS[u.team];
      const r = (u.isGiant ? 5 : u.isHero ? 3 : 1.6) * m;
      ctx.fillRect(X(u.pos.x) - r, X(u.pos.z) - r, r * 2, r * 2);
      // heroes, and the soldiers of your own army, get a white edge
      if (u.isHero || (u.army && u.team === g.localTeam)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(X(u.pos.x) - r, X(u.pos.z) - r, r * 2, r * 2); }
    }
    for (const s of g.siege) {
      if (!s.alive) continue;
      const e = 3 * m;
      ctx.fillStyle = '#000';
      ctx.fillRect(X(s.pos.x) - e, X(s.pos.z) - e, e * 2, e * 2);
      if (s.abandoned) {   // nobody's: an empty box
        ctx.strokeStyle = TEAM_CSS[s.team]; ctx.lineWidth = 1.5;
        ctx.strokeRect(X(s.pos.x) - e * 0.66, X(s.pos.z) - e * 0.66, e * 1.33, e * 1.33);
      } else {
        ctx.fillStyle = TEAM_CSS[s.team];
        ctx.fillRect(X(s.pos.x) - e * 0.66, X(s.pos.z) - e * 0.66, e * 1.33, e * 1.33);
      }
    }
    for (const h of g.humans) {
      if (h === g.player || !h.alive) continue;
      const e = 3.5 * m;
      ctx.fillStyle = TEAM_CSS[h.team];
      ctx.fillRect(X(h.pos.x) - e, X(h.pos.z) - e, e * 2, e * 2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(X(h.pos.x) - e, X(h.pos.z) - e, e * 2, e * 2);
      if (big) {
        ctx.font = '600 13px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(h.name, X(h.pos.x), X(h.pos.z) - e - 5);
        ctx.fillStyle = '#fff'; ctx.fillText(h.name, X(h.pos.x), X(h.pos.z) - e - 5);
      }
    }
    const p = g.player;
    if (p.alive) {
      const px = X(p.pos.x), pz = X(p.pos.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-p.yaw + Math.PI);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000'; ctx.lineWidth = big ? 1.5 : 0;
      ctx.beginPath(); ctx.moveTo(0, -7 * m); ctx.lineTo(4.5 * m, 5 * m); ctx.lineTo(-4.5 * m, 5 * m); ctx.closePath(); ctx.fill();
      if (big) ctx.stroke();
      ctx.restore();
    }
    g.pings.paintMap(ctx, S, big);   // pings and markers (yours and your allies') on top of everything
  }

  drawMinimap() {
    if (!this.mapBg) this.mapBg = this.buildMapBg(this.mini.width);
    this.paintMap(this.miniCtx, this.mini.width, this.mapBg, false);
  }

  // The big map (M): a live overlay over the battle. You can keep playing while it is up.
  toggleMap(force) {
    const open = force !== undefined ? force : !this.mapOpen;
    if (open === !!this.mapOpen) return;
    this.mapOpen = open;
    $('bigmap').classList.toggle('hidden', !open);
    if (open) { this.togglePractice(false); this.bigT = 0; this.drawBigMap(); }
    // the mouse is free while the map is up, so the maps can be clicked (markers); closing it hands the mouse back,
    // unless the shop or the game menu is the reason it closed
    const g = this.game;
    if (open) g.input.unlock();
    else if (!this.shopOpen && $('pause').classList.contains('hidden') && g.state === 'playing') g.input.lock();
  }

  drawBigMap() {
    const cv = $('bigmapCanvas');
    if (!this.bigBg) this.bigBg = this.buildMapBg(cv.width, true);
    this.paintMap(cv.getContext('2d'), cv.width, this.bigBg, true);
    const g = this.game;
    const key = g.factions.map((f) => `${f.name}${f.castle.fallen}`).join('|') + g.localTeam;
    if (key !== this.legendKey) {
      this.legendKey = key;
      $('bigmapLegend').innerHTML = g.factions.map((f) =>
        `<span><i style="background:${TEAM_CSS[f.team]}"></i>${esc(f.name)}${f.team === g.localTeam ? ' (you)' : ''}${f.castle.fallen ? ' · fallen' : ''}</span>`).join('')
        + '<span class="sym">▲ you · ■ heroes · ▪ soldiers (white edge: your army) · ▣ siege engines · ◯ gates · dashed line: where each house marches</span>';
    }
  }
}
