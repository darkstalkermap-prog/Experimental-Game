// HUD, shop, minimap, menus and notifications (plain DOM).
import * as THREE from 'three';
import { TEAM_CSS, PLAYER_TEAM, RAIDER_TEAM, WORLD, CASTLE, ROUNDS } from './config.js';
import { SHOP } from './economy.js';
import { dirFromAim, incomingSide } from './combat.js';
import { SPELLS, FORMATIONS } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this.game = null;
    this.shopOpen = false;
    this.tab = 'army';
    this.hudT = 0;
    this.mapT = 0;
    this.targetT = 0;
    this.goldShown = null;
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.mapBg = null;
    this.raycaster = new THREE.Raycaster();
    document.querySelectorAll('#shop .tabs button').forEach((b) => {
      b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderShop(); });
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

  banner(title, sub) {
    const b = $('banner');
    b.querySelector('h2').textContent = title;
    b.querySelector('p').textContent = sub;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  // a / v: [name, team] of the attacker and victim
  kill(a, v) {
    const el = document.createElement('div');
    el.className = 'kill';
    el.innerHTML = `<span style="color:${TEAM_CSS[a[1]] || TEAM_CSS[RAIDER_TEAM]}">${esc(a[0])}</span> <span class="x">⚔</span> <span style="color:${TEAM_CSS[v[1]] || TEAM_CSS[RAIDER_TEAM]}">${esc(v[0])}</span>`;
    $('killfeed').prepend(el);
    setTimeout(() => el.remove(), 6000);
    while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
  }

  goldPopup(g) {
    const el = document.createElement('div');
    el.className = 'goldpop';
    el.textContent = `+${g}`;
    $('goldpops').appendChild(el);
    setTimeout(() => el.remove(), 1200);
    if (this.game) this.game.audio.play('coin');
  }

  feedback(text, good = false) {
    const el = $('feedback');
    el.textContent = text;
    el.classList.toggle('good', good);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
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
      if (!u.alive || u.team === p.team || u.ranged || u.weapon === 'bow' || u.swingT < 0 || u.swingT > 0.33) return;
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
  toggleShop(force) {
    const open = force !== undefined ? force : !this.shopOpen;
    const g = this.game;
    if (open === this.shopOpen) return;
    this.shopOpen = open;
    $('shop').classList.toggle('hidden', !open);
    if (open) {
      this.renderShop();
      g.input.unlock();
    } else {
      g.input.lock();
    }
  }

  renderShop() {
    const g = this.game;
    const f = g.localFaction;
    document.querySelectorAll('#shop .tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    $('shopGold').textContent = Math.floor(f.gold);
    $('shopTroops').textContent = `${g.troopCount(g.localTeam)}/${f.troopCap}`;
    const grid = $('shopGrid');
    grid.innerHTML = '';
    if (this.tab === 'siege') {
      const sel = document.createElement('div');
      sel.className = 'targets';
      sel.innerHTML = '<div class="label">Siege & assault target (T orders your troops to attack it):</div>';
      for (const c of g.castles) {
        if (c.team === g.localTeam) continue;
        const b = document.createElement('button');
        const fac = g.factions[c.team];
        const chosen = g.siegeTarget(f) === c;
        b.textContent = (chosen ? '✓ ' : '') + fac.name + (c.fallen ? ' (fallen)' : '');
        b.disabled = c.fallen;
        b.style.borderColor = TEAM_CSS[c.team];
        if (chosen) b.classList.add('active');
        b.addEventListener('click', () => { g.setSiegeTarget(c); this.renderShop(); });
        sel.appendChild(b);
      }
      grid.appendChild(sel);
    }
    for (const item of SHOP) {
      if (item.tab !== this.tab) continue;
      const can = item.can(g, f);
      const cost = Math.round(item.cost(g, f));
      const card = document.createElement('div');
      card.className = 'card';
      const afford = f.gold >= cost;
      card.innerHTML = `<h4>${esc(item.name)}</h4><p>${esc(item.desc(g, f))}</p>`;
      const btn = document.createElement('button');
      if (can !== true) { btn.textContent = can; btn.disabled = true; }
      else { btn.innerHTML = `Buy · <b>${cost}</b> <span class="coin">●</span>`; btn.disabled = !afford; }
      btn.addEventListener('click', () => { g.buyForPlayer(item.id); this.renderShop(); });
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }

  // ---------- lobby ----------
  showLobby(code, isHost) {
    $('menu').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('roomUrl').textContent = location.origin;
    $('lobbyHostCtl').classList.toggle('hidden', !isHost);
    $('lobbyWait').classList.toggle('hidden', isHost);
  }

  renderLobby(players, myTeam = -1) {
    const slots = [0, 1, 2, 3].map((t) => players.find((p) => p.team === t));
    $('lobbyList').innerHTML = slots.map((p, t) => `<li style="border-left-color:${TEAM_CSS[t]}">
      <b style="color:${TEAM_CSS[t]}">${esc(['Blue', 'Red', 'Green', 'Gold'][t])} castle</b>
      <span>${p ? esc(p.name) + (p.team === myTeam ? ' (you)' : '') + (t === 0 ? ' · host' : '') : '<i>AI lord</i>'}</span></li>`).join('');
  }

  lobbyError(msg) {
    $('netMsg').textContent = msg;
  }

  // ---------- menus ----------
  showPause(show) { $('pause').classList.toggle('hidden', !show); }

  gameOver(won, winner = -1, reason = '') {
    const g = this.game;
    const f = g.localFaction;
    const wf = g.factions[winner];
    $('gameover').classList.remove('hidden');
    $('goTitle').textContent = won ? 'Victory!' : 'Defeat';
    $('goTitle').className = won ? 'win' : 'lose';
    $('goText').textContent = reason || (won
      ? 'Yours is the last castle standing. The realm bows to you.'
      : wf ? `${wf.name} is the last castle standing.` : 'No castle is left standing.');
    $('goStats').innerHTML = `
      <div><b>${g.round}</b><span>rounds</span></div>
      <div><b>${g.player.kills}</b><span>your kills</span></div>
      <div><b>${f.kills}</b><span>army kills</span></div>
      <div><b>${f.earned}</b><span>gold earned</span></div>
      <div><b>${g.player.deaths}</b><span>deaths</span></div>`;
    this.hideHud();
  }

  showHud() { $('hud').classList.remove('hidden'); }
  hideHud() { $('hud').classList.add('hidden'); }

  // ---------- per-frame HUD ----------
  update(dt) {
    const g = this.game;
    if (!g || g.state === 'menu' || g.state === 'loading') return;
    const p = g.player;
    const f = g.localFaction;
    if (this.shopOpen && g.mode === 'client') {
      this.shopT = (this.shopT || 0) - dt;
      if (this.shopT <= 0) { this.shopT = 0.3; this.renderShop(); }
    }

    $('vignette').style.opacity = Math.min(0.8, p.hurtFlash * 0.7 + (p.alive && p.hp < p.maxHp * 0.3 ? 0.25 : 0));
    $('hpFill').style.width = `${(p.hp / p.maxHp) * 100}%`;
    $('stFill').style.width = `${p.stamina}%`;
    $('mnbar').classList.toggle('hidden', !p.spells.length);
    $('mnFill').style.width = `${(p.mana / p.manaMax) * 100}%`;
    $('crosshair').classList.toggle('block', p.blocking);
    this.updateDirs();
    $('crosshair').classList.toggle('bow', p.weapon === 'bow');
    $('drawFill').style.width = p.weapon === 'bow' ? `${Math.min(1, p.drawT / p.bow.draw) * 100}%` : '0%';

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      $('hpText').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      $('gold').textContent = Math.floor(f.gold);
      $('round').textContent = g.round ? `Round ${g.round}` : 'Preparation';
      if (g.phase === 'prep' && g.round === 0) $('phase').textContent = `Battle begins in ${Math.ceil(g.phaseT)}s${g.simulating ? ' · Enter to start now' : ''}`;
      else if (g.phase === 'prep') $('phase').textContent = `Next wave in ${Math.ceil(g.phaseT)}s`;
      else {
        const left = g.units.filter((u) => u.alive && u.team === RAIDER_TEAM).length + g.spawnQueue.length;
        $('phase').textContent = `${left} raiders remain`;
      }
      $('war').textContent = g.round < ROUNDS.warRound ? `Rival lords attack from round ${ROUNDS.warRound}` : 'War: rival lords are attacking!';
      $('weapon').textContent = p.weapon === 'sword' ? `${p.sword.name} & ${p.shield.name}`
        : p.weapon === 'bow' ? `${p.bow.name} · ${p.arrows} arrows`
        : `${SPELLS[p.spell] ? SPELLS[p.spell].name : 'Magic'} · ${Math.floor(p.mana)}/${p.manaMax} mana${p.spells.length > 1 ? ' (R: next)' : ''}`;
      $('potions').textContent = `Potions ${p.potions} (Q)` + (p.hasHorse ? ` · Horse ${Math.ceil(p.horseHp)}/320 (E)` : '');
      const troops = g.troopCount(g.localTeam);
      const grp = { all: 'All troops', infantry: 'Infantry', archers: 'Archers', cavalry: 'Cavalry' }[p.group || 'all'];
      const ord = { follow: 'Following', hold: 'Holding', charge: 'Charging', defend: 'Defending', assault: 'Assaulting' }[p.lastOrder || 'defend'];
      const vets = g.units.filter((u) => u.alive && u.team === g.localTeam && u.rank >= 3).length;
      const form = FORMATIONS[f.formation || 'line'].name;
      $('army').textContent = `${troops}/${f.troopCap} troops${vets ? ` (${vets}★)` : ''} · ${form} · ${grp} · ${ord}`;
      this.renderFactions();
      if (!p.alive) {
        $('respawn').classList.remove('hidden');
        $('respawnT').textContent = f.castle.fallen ? 'Your keep has fallen – no respawn' : `Respawning in ${Math.ceil(f.respawnT)}s`;
      } else $('respawn').classList.add('hidden');
      $('scoreboard').classList.toggle('hidden', !g.input.down('Tab'));
      if (g.input.down('Tab')) this.renderScoreboard();
    }
    this.targetT -= dt;
    if (this.targetT <= 0) { this.targetT = 0.15; this.updateTarget(); }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.drawMinimap(); }
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
      html += `<div class="fac ${f.eliminated ? 'dead' : ''}">
        <i style="background:${TEAM_CSS[f.team]}"></i><span class="n">${esc(f.team === g.localTeam ? 'You' : f.name)}</span>
        <span class="h" title="hero">${hero}</span>
        <span class="bar"><b style="width:${keep}%"></b></span>
        <span class="g" title="gate">${c.fallen ? 'FALLEN' : gate}</span>
        <span class="t" title="troops">${g.troopCount(f.team)}⚔</span></div>`;
    }
    $('factions').innerHTML = html;
  }

  renderScoreboard() {
    const g = this.game;
    let rows = '';
    for (const f of g.factions) {
      const c = f.castle;
      rows += `<tr style="color:${TEAM_CSS[f.team]}"><td>${esc(f.name)}</td><td>${esc(f.lord)}</td><td>${Math.floor(f.gold)}</td>
        <td>${g.troopCount(f.team)}/${f.troopCap}</td><td>${f.kills}</td><td>${f.heroDeaths}</td>
        <td>${c.fallen ? 'Fallen' : Math.round(c.keep.hp) + ' / ' + c.keep.maxHp}</td><td>${f.eliminated ? 'Eliminated' : 'Alive'}</td></tr>`;
    }
    $('scoreRows').innerHTML = rows;
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
    const fac = g.factions[team];
    let name;
    if (o.kind === 'gate') name = `${fac.name} – Gate`;
    else if (o.isSiege) name = `${o.name}${team === RAIDER_TEAM ? ' (Raiders)' : ' – ' + fac.name}`;
    else name = o.isHero ? `${o.name} – ${fac ? fac.name : 'Raiders'}` : `${o.name}${o.rank > 1 ? ' ' + '★'.repeat(o.rank) : ''}${team === RAIDER_TEAM ? '' : ' – ' + fac.name}`;
    el.classList.remove('hidden');
    $('targetName').textContent = name;
    $('targetName').style.color = TEAM_CSS[team];
    $('targetFill').style.width = `${(o.hp / o.maxHp) * 100}%`;
    $('targetFill').style.background = team === g.localTeam ? '#4fa3ff' : '#d33';
  }

  // ---------- minimap ----------
  buildMapBg() {
    const g = this.game;
    const S = 180;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = (x / S) * 2 * WORLD.half - WORLD.half;
      const wz = (y / S) * 2 * WORLD.half - WORLD.half;
      const h = g.physics.terrainHeight(wx, wz);
      const k = Math.min(1, Math.max(0, (h - 0) / 30));
      const i = (y * S + x) * 4;
      img.data[i] = 70 + k * 70; img.data[i + 1] = 92 + k * 50; img.data[i + 2] = 50 + k * 50; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapBg = c;
  }

  drawMinimap() {
    const g = this.game;
    if (!this.mapBg) this.buildMapBg();
    const ctx = this.miniCtx;
    const S = this.mini.width;
    const k = S / (WORLD.half * 2);
    const X = (x) => (x + WORLD.half) * k;
    ctx.drawImage(this.mapBg, 0, 0, S, S);
    for (const c of g.castles) {
      const s = CASTLE.H * 2 * k;
      ctx.fillStyle = c.fallen ? '#333' : TEAM_CSS[c.team];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(X(c.center.x) - s / 2, X(c.center.z) - s / 2, s, s);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.gate.alive ? '#fff' : '#f33';
      ctx.lineWidth = 2;
      const gp = c.gatePos;
      ctx.beginPath(); ctx.arc(X(gp.x), X(gp.z), 2.5, 0, Math.PI * 2); ctx.stroke();
    }
    for (const u of g.units) {
      if (!u.alive) continue;
      ctx.fillStyle = TEAM_CSS[u.team];
      const r = u.isGiant ? 5 : u.isHero ? 3 : 1.6;
      ctx.fillRect(X(u.pos.x) - r, X(u.pos.z) - r, r * 2, r * 2);
      if (u.isHero) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(X(u.pos.x) - r, X(u.pos.z) - r, r * 2, r * 2); }
    }
    for (const s of g.siege) {
      if (!s.alive) continue;
      ctx.fillStyle = '#000';
      ctx.fillRect(X(s.pos.x) - 3, X(s.pos.z) - 3, 6, 6);
      ctx.fillStyle = TEAM_CSS[s.team];
      ctx.fillRect(X(s.pos.x) - 2, X(s.pos.z) - 2, 4, 4);
    }
    for (const h of g.humans) {
      if (h === g.player || !h.alive) continue;
      ctx.fillStyle = TEAM_CSS[h.team];
      ctx.fillRect(X(h.pos.x) - 3.5, X(h.pos.z) - 3.5, 7, 7);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(X(h.pos.x) - 3.5, X(h.pos.z) - 3.5, 7, 7);
    }
    const p = g.player;
    if (p.alive) {
      const px = X(p.pos.x), pz = X(p.pos.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-p.yaw + Math.PI);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}
