// Hero Game Mode: the menu, the HUD, the Talents-only controls, the scoreboard, the end screen and the tips, with a hand-made
// game.hero (the rules are somebody else's job). Also: Conquest and King of the Hill are unchanged.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };

// helpers that live in the page
const INSTALL = () => {
  window.__tick = (n = 3, dt = 0.1) => { const g = window.__game; for (let i = 0; i < n; i++) { g.paused = false; g.update(dt); g.input.endFrame(); g.ui.update(dt); } };
  window.__upd = (dt = 0.05) => { const g = window.__game; g.paused = false; g.update(dt); g.input.endFrame(); };
  window.__populate = () => {
    const g = window.__game, n = (window.__n = (window.__n || 0) + 1);
    g.ui.kill(['Varr', 1], ['Mara', 0]); g.ui.kill(['You', 0], ['Sola', 1]); g.ui.kill(['Brann', 1], ['Edric', 0]);
    g.alerts.raise('a1' + n, { text: 'Enemy hero slain: 8/25', tone: 'good' }); g.alerts.raise('a2' + n, { text: 'Your ally Mara was slain', tone: 'warn' });
    g.alerts.raise('a3' + n, { text: 'Enemy army approaching from the north-east!', tone: 'warn' }); g.alerts.raise('a4' + n, { text: 'Your keep is under attack!', tone: 'danger' });
    g.alerts.showTip('Press [N] to spend a talent point whenever you level up: talents are the only upgrades you can get.');
    g.ui.toast('Next round', 0, false);
    document.getElementById('target').classList.remove('hidden'); document.getElementById('targetName').textContent = 'Varr – Red';
  };
  window.__vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; };
  window.__txt = (sel) => (document.querySelector(sel) || { textContent: null }).textContent;
  window.__fakeHero = (win = 'kills') => {
    const g = window.__game, me = g.player;
    const mk = (name, team, cls, level, kills, deaths, alive, respawnIn, isBot, mine, hp) => ({ player: mine ? me : { hp, maxHp: 100 }, name, team, cls, level, kills, deaths, alive, respawnIn, isBot, mine });
    g.hero = {
      win, killTarget: win === 'kills' ? 25 : 0, timeLimit: win === 'timed' ? 1200 : 0, remaining: win === 'timed' ? 754.3 : null,
      sides: [{ team: 0, name: 'Blue', kills: 7, deaths: 3 }, { team: 1, name: 'Red', kills: 11, deaths: 5 }],
      heroes: [], clock: 187.2, prepLeft: 0, result: null,
      rows: [
        mk('You', 0, me.classId, me.level, 3, 1, true, 0, false, true),
        mk('Mara', 0, 'mage', 2, 2, 2, false, 6.2, true, false, 40),
        mk('Edric', 0, 'cleric', 3, 1, 0, true, 0, true, false, 90),
        mk('Varr', 1, 'berserker', 4, 5, 1, true, 0, true, false, 55),
        mk('Sola', 1, 'ranger', 2, 0, 3, false, 11.5, true, false, 10),
        mk('Brann', 1, 'cavalier', 3, 3, 2, true, 0, true, false, 100),
      ],
      roster() { return this.rows; },
      // what Game calls on the real rules (the fake does nothing)
      update() {}, xpMult: 1, escalate() {}, target() { return null; }, heroDown() {}, keepFell() {}, spendTalents() {},
    };
    g.round = 3; g.phaseT = 21.4;
    return g.hero;
  };
  // rectangles of the HUD pieces that could meet, and the pairs that do
  window.__overlaps = (mineSel, otherSel) => {
    const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || getComputedStyle(el).display === 'none') return null; return { sel, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const bad = [], seen = {};
    for (const a of mineSel.map(rect)) {
      if (!a) continue;
      seen[a.sel] = [Math.round(a.l), Math.round(a.t), Math.round(a.r), Math.round(a.b)];
      for (const b of otherSel.map(rect)) {
        if (!b || b.sel === a.sel) continue;
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (w > 1 && h > 1) bad.push(`${a.sel}/${b.sel} ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    return { bad, seen, vw: innerWidth, vh: innerHeight };
  };
};

(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(INSTALL);

  // ---------------------------------------------------------------- the menu
  let r = await ev(async () => {
    const m = await import('./src/herogame.js');
    const modes = Object.entries(m.HERO.modes).map(([id, x]) => ({ id, name: x.name, short: x.short, desc: x.desc }));
    const q = (s) => [...document.querySelectorAll(s)];
    const play = document.getElementById('play').getBoundingClientRect();
    return {
      modes,
      objs: q('#objective button').map((b) => b.dataset.o),
      active: q('#objective button.active').map((b) => b.dataset.o),
      winHidden: document.getElementById('heroWin').classList.contains('hidden'),
      mpOff: document.getElementById('mpBtn').disabled,
      noteHidden: document.getElementById('heroNote').classList.contains('hidden'),
      desc0: document.getElementById('objDesc').textContent,
      playBottom: Math.round(play.bottom), vh: innerHeight,
    };
  });
  check('the Mode row has Conquest, King of the Hill and Hero Mode (data-o="hero")', r.objs.join() === 'conquest,koth,hero' && r.active.join() === 'conquest', JSON.stringify([r.objs, r.active]));
  check('the page opens on Conquest with no win-mode row and Multiplayer enabled', r.winHidden && !r.mpOff && r.noteHidden && /last castle standing/.test(r.desc0));
  const modes = r.modes, basePlayBottom = r.playBottom;

  await page.click('#objective button[data-o=hero]');
  r = await ev(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    const play = document.getElementById('play').getBoundingClientRect();
    return {
      winHidden: document.getElementById('heroWin').classList.contains('hidden'),
      btns: q('#heroWin button').map((b) => ({ w: b.dataset.w, text: b.textContent, active: b.classList.contains('active') })),
      desc: document.getElementById('heroWinDesc').textContent,
      objDesc: document.getElementById('objDesc').textContent,
      active: q('#objective button.active').map((b) => b.dataset.o),
      mpOff: document.getElementById('mpBtn').disabled, mpTitle: document.getElementById('mpBtn').title,
      noteHidden: document.getElementById('heroNote').classList.contains('hidden'), note: document.getElementById('heroNote').textContent,
      onlineHidden: document.getElementById('online').classList.contains('hidden'),
      playBottom: Math.round(play.bottom), vh: innerHeight,
    };
  });
  check('Hero Mode shows the win-mode row with one button per HERO.modes entry (name and short)', !r.winHidden && r.btns.map((b) => b.w).join() === modes.map((m) => m.id).join()
    && r.btns.every((b, i) => b.text.includes(modes[i].name) && b.text.includes(modes[i].short)), JSON.stringify(r.btns));
  check('the first way to win is chosen and its description is underneath', r.btns[0].active && r.btns.filter((b) => b.active).length === 1 && r.desc === modes[0].desc, r.desc);
  check('Hero Mode is the active mode and describes itself', r.active.join() === 'hero' && /three heroes against three/i.test(r.objDesc), r.objDesc.slice(0, 60));
  check('Multiplayer is disabled with Hero Mode and says why', r.mpOff && /single player/.test(r.mpTitle) && !r.noteHidden && /single player for now/.test(r.note) && r.onlineHidden, JSON.stringify([r.mpOff, r.mpTitle]));
  console.log(`      Play button bottom: conquest ${basePlayBottom}, hero ${r.playBottom}, window ${r.vh}`);
  check('the Single Player button stays in view when it did before', basePlayBottom > r.vh || r.playBottom <= r.vh, `${basePlayBottom} -> ${r.playBottom} of ${r.vh}`);

  // each way to win shows its own description and is remembered
  for (const m of modes) {
    await page.click(`#heroWin button[data-w=${m.id}]`);
    const d = await ev(() => ({ desc: document.getElementById('heroWinDesc').textContent, act: [...document.querySelectorAll('#heroWin button.active')].map((b) => b.dataset.w), saved: localStorage.getItem('cw-herowin') }));
    check(`win mode "${m.id}": description, single active button, remembered`, d.desc === m.desc && d.act.join() === m.id && d.saved === m.id, JSON.stringify(d.act));
  }
  // a multiplayer click does nothing; and the war modes bring it back
  await ev(() => document.getElementById('mpBtn').click());
  await page.waitForTimeout(300);
  r = await ev(() => ({ online: !document.getElementById('online').classList.contains('hidden'), off: !document.getElementById('offlineNote').classList.contains('hidden') }));
  check('clicking Multiplayer with Hero Mode selected opens nothing', !r.online && !r.off);
  await page.click('#objective button[data-o=koth]');
  r = await ev(() => ({ winHidden: document.getElementById('heroWin').classList.contains('hidden'), mpOff: document.getElementById('mpBtn').disabled, noteHidden: document.getElementById('heroNote').classList.contains('hidden'), desc: document.getElementById('objDesc').textContent, act: [...document.querySelectorAll('#objective button.active')].map((b) => b.dataset.o) }));
  check('King of the Hill: no win-mode row, Multiplayer back, its own description', r.winHidden && !r.mpOff && r.noteHidden && r.act.join() === 'koth' && /hill/i.test(r.desc), r.desc.slice(0, 50));
  await page.click('#mpBtn');
  await page.waitForFunction(() => !document.getElementById('online').classList.contains('hidden') || !document.getElementById('offlineNote').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
  r = await ev(() => ({ online: !document.getElementById('online').classList.contains('hidden'), off: !document.getElementById('offlineNote').classList.contains('hidden') }));
  check('Multiplayer opens its panel as before in the war modes', r.online || r.off, JSON.stringify(r));

  // the start calls
  await ev(() => {
    window.__starts = [];
    window.__game.start = (d, s) => { window.__starts.push([d, JSON.parse(JSON.stringify(s))]); document.getElementById('menu').classList.remove('hidden'); document.getElementById('hud').classList.add('hidden'); };
  });
  const unlock = async () => { await ev(() => document.exitPointerLock()); await page.waitForFunction(() => !document.pointerLockElement, null, { timeout: 5000 }).catch(() => {}); };   // (begin() captures the mouse)
  await page.click('#classPick button[data-cls=mage]');
  await page.click('#objective button[data-o=hero]');
  await page.click('#heroWin button[data-w=castle]');
  await page.click('#play'); await unlock();
  await page.click('#objective button[data-o=koth]');
  await page.click('#play'); await unlock();
  await page.click('#objective button[data-o=conquest]');
  await page.click('#play'); await unlock();
  const starts = await ev(() => window.__starts);
  const [hs, ks, cs] = starts;
  check('Single Player in Hero Mode starts with hero: { win }, Blue, my class, no objective', hs && hs[1].mode === 'single' && hs[1].localTeam === 0 && JSON.stringify(hs[1].hero) === '{"win":"castle"}'
    && hs[1].players.length === 1 && hs[1].players[0].team === 0 && hs[1].players[0].name === 'You' && hs[1].players[0].cls === 'mage' && hs[1].objective === undefined, JSON.stringify(hs && hs[1]));
  check('the war modes start as before (objective, no hero)', ks && ks[1].objective === 'koth' && ks[1].hero === undefined && cs && cs[1].objective === 'conquest' && cs[1].hero === undefined, JSON.stringify([ks && ks[1].objective, cs && cs[1].objective]));
  check('the difficulty is passed on', hs[0] === 'normal');

  // the last win mode is remembered over a reload
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await ev(INSTALL);
  await page.click('#objective button[data-o=hero]');
  r = await ev(() => ({ act: [...document.querySelectorAll('#heroWin button.active')].map((b) => b.dataset.w), desc: document.getElementById('heroWinDesc').textContent }));
  check('the page remembers the last win mode (castle) after a reload', r.act.join() === 'castle', JSON.stringify(r.act));

  // ---------------------------------------------------------------- a normal game first: the war HUD as before
  await ev(() => { document.querySelector('#objective button[data-o=conquest]').click(); });
  await L.startSingle(page);
  await ev(() => { const g = window.__game; g.ui.showPause(false); g.paused = false; });
  await ev(() => window.__tick(4));
  r = await ev(() => {
    const v = window.__vis;
    return { hero: document.getElementById('hud').classList.contains('hero'), cmd: v('#command'), gold: v('#goldbox'), fac: v('#factions'), top: v('#top'), army: v('#army'), heroTop: v('#heroTop'), roster: v('#heroRoster'), hint: document.getElementById('hint').textContent, clsHint: document.getElementById('clsHint').textContent };
  });
  check('Conquest HUD unchanged: orders bar, gold, castle list, top panel, army line shown; no hero panels', !r.hero && r.cmd && r.gold && r.fac && r.top && r.army && !r.heroTop && !r.roster, JSON.stringify(r));
  check('Conquest hints unchanged (B: shop, O: orders)', /B: shop/.test(r.hint) && /O: orders/.test(r.hint) && /B → Class/.test(r.clsHint));
  r = await ev(() => {
    const g = window.__game, i = g.input;
    i.pressed.add('KeyB'); window.__upd();
    const out = { shop: g.ui.shopOpen, tab: g.ui.tab, tabsShown: window.__vis('#shop .tabs'), statShown: window.__vis('#shop .stat'), tabBtns: document.querySelectorAll('#shop .tabs button').length };
    g.ui.toggleShop(false);
    i.pressed.add('KeyO'); window.__upd();
    out.orders = g.ui.shopOpen && g.ui.tab === 'orders';
    g.ui.toggleShop(false);
    return out;
  });
  check('Conquest: B opens the full shop (tabs and gold), O the orders tab', r.shop && r.tab === 'army' && r.tabsShown && r.statShown && r.tabBtns === 7 && r.orders, JSON.stringify(r));
  r = await ev(() => { const g = window.__game; g.ui.tab = 'class'; g.ui.toggleShop(true); const out = { tab: g.ui.tab, cards: g.ui.classCards ? g.ui.classCards.length : -1 }; g.ui.toggleShop(false); return out; });
  check('Conquest: the Class tab still opens with six classes', r.tab === 'class' && r.cards === 6, JSON.stringify(r));

  // ---------------------------------------------------------------- the hero HUD
  await ev(() => { window.__fakeHero('kills'); window.__tick(4); });
  r = await ev(() => {
    const v = window.__vis, t = window.__txt;
    return {
      hero: document.getElementById('hud').classList.contains('hero'),
      hidden: ['#command', '#army', '#goldbox', '#factions', '#hill', '#top'].filter(v),
      shown: ['#heroTop', '#heroRoster', '#status', '#abilities', '#xpbar', '#minimapWrap', '#hint'].filter((s) => !v(s)),
      score: [t('#heroScoreB'), t('#heroScoreR')], goal: t('#heroGoal'), clock: t('#heroClock'), round: t('#heroRound'),
      keepB: t('#heroKeepB'), hint: document.getElementById('hint').textContent, clsHint: document.getElementById('clsHint').textContent, lvl: t('#lvl'),
      shopHero: document.getElementById('shop').classList.contains('hero'), sbHero: document.getElementById('scoreboard').classList.contains('hero'), ctlHero: document.getElementById('controls').classList.contains('hero'),
    };
  });
  check('game.hero adds the class "hero" to the HUD, shop, scoreboard and controls sheet', r.hero && r.shopHero && r.sbHero && r.ctlHero);
  check('the war pieces are hidden (orders bar, army line, gold box, castle list, hill box, top panel)', r.hidden.length === 0, JSON.stringify(r.hidden));
  check('the hero pieces stay or appear (score panel, roster, health, abilities, xp bar, minimap, hints)', r.shown.length === 0, JSON.stringify(r.shown));
  check('score panel: Blue 7 : Red 11, goal, battle clock, round and next army', r.score.join() === '7,11' && r.goal === 'First to 25 hero kills' && r.clock === 'Battle 3:08' && r.round === 'Round 3 · next army in 22 s', JSON.stringify([r.score, r.goal, r.clock, r.round]));
  check('hints: talents and map, no shop or orders; the class line points to talents', /N: talents/.test(r.hint) && /M: map/.test(r.hint) && !/B: shop/.test(r.hint) && !/O: orders/.test(r.hint) && /N → Talents/.test(r.clsHint) && /Lv 1/.test(r.lvl), JSON.stringify([r.hint, r.clsHint]));

  // the other ways to win and the prep
  r = await ev(() => {
    const out = {}, h = window.__fakeHero('timed'); window.__tick(3);
    out.timed = [window.__txt('#heroGoal'), window.__txt('#heroClock'), window.__txt('#heroRound')];
    window.__fakeHero('castle'); window.__tick(3);
    out.castle = [window.__txt('#heroGoal'), window.__txt('#heroClock')];
    const c = window.__fakeHero('kills'); c.prepLeft = 12.3; window.__tick(3);
    out.prep = window.__txt('#heroRound');
    c.prepLeft = 0; window.__tick(3);
    return out;
  });
  check('timed: the time left, the goal in minutes', r.timed[0] === 'Most hero kills in 20 min' && r.timed[1] === 'Time left 12:35', JSON.stringify(r.timed));
  check('castle: the goal is the enemy keep, the clock counts up', r.castle[0] === 'Destroy the enemy keep' && /^Battle 3:08$/.test(r.castle[1]), JSON.stringify(r.castle));
  check('during the preparation: "Prepare: 13 s"', r.prep === 'Prepare: 13 s', r.prep);

  // keeps and gates
  r = await ev(() => {
    const g = window.__game, b = g.castles[0], red = g.castles[1], out = {};
    const w = (id) => document.querySelector(`#${id} i`).style.width;
    const was = { kb: b.keep.hp, gr: red.gate.hp, gra: red.gate.alive };
    b.keep.hp = b.keep.maxHp * 0.5; red.gate.hp = 0; red.gate.alive = false;
    window.__tick(3);
    out.kb = w('heroBarKB'); out.kr = w('heroBarKR'); out.gb = w('heroBarGB'); out.gr = w('heroBarGR');
    out.title = document.getElementById('heroBarGR').title; out.keepText = window.__txt('#heroKeepB');
    b.keep.hp = was.kb; red.gate.hp = was.gr; red.gate.alive = was.gra; window.__tick(3);
    return out;
  });
  check('both keeps and gates are slim bars (Blue keep 50%, Red gate broken)', r.kb === '50%' && r.kr === '100%' && r.gb === '100%' && r.gr === '0%' && /broken/.test(r.title) && r.keepText === 'Keep 50%', JSON.stringify(r));

  // the roster
  r = await ev(() => {
    const rows = [...document.querySelectorAll('#heroRoster .hr')].map((e) => ({ me: e.classList.contains('me'), down: e.classList.contains('down'), sep: e.classList.contains('sep'), name: e.querySelector('.nm').textContent, lv: e.querySelector('.lv').textContent, kd: e.querySelector('.kd').textContent, st: e.querySelector('.st').textContent, ic: e.querySelector('.ic').textContent.length > 0, bar: !!e.querySelector('.st .bar'), border: e.style.borderLeftColor }));
    return rows;
  });
  check('roster: six heroes, Blue first, a gap between the sides', r.length === 6 && r.slice(0, 3).every((x) => x.border === r[0].border) && r[3].border !== r[0].border && r[3].sep && !r[1].sep, JSON.stringify(r.map((x) => x.name)));
  check('roster: icon, name, level and K/D for each', r.every((x) => x.ic && x.name && /^Lv \d$/.test(x.lv) && /^\d+\/\d+$/.test(x.kd)) && r[0].kd === '3/1' && r[3].kd === '5/1' && r[3].lv === 'Lv 4', JSON.stringify(r[3]));
  check('roster: my hero is highlighted, the fallen show "respawn N s", the living a health bar', r[0].me && r.filter((x) => x.me).length === 1 && r[1].down && r[1].st === 'respawn 7 s' && r[4].st === 'respawn 12 s' && r[2].bar && !r[2].down && r[2].st === '', JSON.stringify([r[1].st, r[4].st]));

  // every row is one 19 px line (a health bar that grows its cell once pushed the text out of its row)
  r = await ev(() => [...document.querySelectorAll('#heroRoster .hr')].map((row) => { const b = row.getBoundingClientRect(); return [...row.children].every((c) => { const k = c.getBoundingClientRect(); return k.top >= b.top - 0.5 && k.bottom <= b.bottom + 0.5; }) && Math.round(b.height) === 19; }));
  check('roster: every row is a single line with all its cells inside it', r.length === 6 && r.every(Boolean), JSON.stringify(r));

  // the respawn overlay in hero mode
  r = await ev(() => {
    const g = window.__game, p = g.player, f = g.localFaction, h = g.hero;
    h.rows[0].alive = false; h.rows[0].respawnIn = 4.2; p.alive = false; f.respawnT = 99; window.__tick(3);
    const a = window.__txt('#respawnT');
    h.rows[0].respawnIn = 0; f.respawnT = 5.5; window.__tick(3);
    const b = window.__txt('#respawnT');
    p.alive = true; h.rows[0].alive = true; window.__tick(3);
    return [a, b, window.__vis('#respawn')];
  });
  check('respawn overlay: "Respawning in 5s" from the roster, else the faction timer; gone once risen', r[0] === 'Respawning in 5s' && r[1] === 'Respawning in 6s' && r[2] === false, JSON.stringify(r));

  // ---------------------------------------------------------------- nothing meets at three window sizes
  await ev(() => { window.__game.player.setLevel(3); window.__tick(1, 0.02); });   // talent points: the hint above the abilities shows
  const MINE = ['#heroTop', '#heroRoster', '#hint', '#alerts'];
  const ALL = ['#heroTop', '#heroRoster', '#hint', '#alerts', '#crosshair', '#minimapWrap', '#status', '#abilities', '#talentHint', '#target', '#killfeed', '#tip', '#toasts', '#fps'];
  for (const [w, h] of [[1280, 720], [1920, 1080], [1024, 600]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await ev(() => { window.__populate(); });
    r = await ev(([m, a]) => window.__overlaps(m, a), [MINE, ALL]);
    const hp = r.seen['#heroTop'], ro = r.seen['#heroRoster'];
    console.log(`      ${w}x${h}: heroTop ${JSON.stringify(hp)} roster ${JSON.stringify(ro)} hint ${JSON.stringify(r.seen['#hint'])} alerts ${JSON.stringify(r.seen['#alerts'])}`);
    check(`${w}x${h}: score panel, roster, hints and callouts overlap nothing`, r.bad.length === 0, r.bad.join('; '));
    check(`${w}x${h}: the panels are inside the window, the score panel is centred`, hp && ro && hp[0] >= 0 && hp[2] <= w && ro[0] >= 0 && ro[3] < h / 2 && Math.abs((hp[0] + hp[2]) / 2 - w / 2) <= 1 && hp[3] <= 112, JSON.stringify([hp, ro]));
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await ev(() => { document.getElementById('alerts').innerHTML = ''; document.getElementById('killfeed').innerHTML = ''; document.getElementById('tip').classList.remove('show'); window.__game.player.setLevel(1); });

  // ---------------------------------------------------------------- controls limited to the hero
  r = await ev(() => {
    const g = window.__game, i = g.input, p = g.player, f = g.localFaction, ui = g.ui, out = { calls: [] };
    const snap = () => JSON.stringify([ui.shopOpen, ui.tab, p.group, p.lastOrder, f.formation, document.querySelectorAll('#toasts .toast').length, ui.mapOpen]);
    const before = snap();
    out.moved = [];
    for (const k of ['KeyO', 'F1', 'F2', 'F3', 'F4', 'KeyZ', 'KeyX', 'KeyV', 'KeyT', 'KeyY', 'KeyG', 'KeyF']) {
      i.pressed.add(k); window.__upd();
      if (snap() !== before) out.moved.push(k);
    }
    out.same = snap() === before;
    ui.openOrders(); out.openOrders = ui.shopOpen;
    return out;
  });
  check('O, F1-F4, Z/X/V, T, Y, G, F do nothing in Hero Mode', r.moved.length === 0 && r.same && r.openOrders === false, JSON.stringify(r.moved));
  for (const key of ['KeyB', 'KeyN']) {
    r = await ev((k) => {
      const g = window.__game, i = g.input, ui = g.ui, out = {};
      i.pressed.add(k); window.__upd();
      out.open = ui.shopOpen; out.tab = ui.tab;
      out.tabsShown = window.__vis('#shop .tabs'); out.statShown = window.__vis('#shop .stat'); out.title = window.__txt('#shopTitle');
      out.tree = !!document.querySelector('#shopGrid .tal-wrap .tal-tree'); out.cards = document.querySelectorAll('#shopGrid .card').length;
      out.classCards = ui.classCards; out.nodes = document.querySelectorAll('#shopGrid .tnode').length;
      out.note = (document.querySelector('.tal-note') || {}).textContent || '';
      return out;
    }, key);
    check(`${key} opens the Talents panel only: no tabs, no gold, no cards`, r.open && r.tab === 'talents' && !r.tabsShown && !r.statShown && r.title === 'Talents' && r.tree && r.cards === 0 && r.classCards === null && r.nodes >= 6 && !/Changing class/.test(r.note), JSON.stringify(r));
    // close it with the same key through the page (the world stands still while it is open)
    await page.keyboard.press(key);
    r = await ev(() => { window.__upd(); return window.__game.ui.shopOpen; });
    check(`${key} again closes the panel and it stays closed`, r === false);
  }
  // O, B and N inside the panel; the class tab is out of reach
  await ev(() => { window.__game.input.pressed.add('KeyN'); window.__upd(); });
  await page.keyboard.press('KeyO');
  r = await ev(() => { const g = window.__game; return { open: g.ui.shopOpen, tab: g.ui.tab }; });
  check('O does not close the Talents panel', r.open && r.tab === 'talents', JSON.stringify(r));
  r = await ev(() => {
    const g = window.__game, ui = g.ui, p = g.player, out = {};
    ui.tab = 'class'; ui.renderShop(); out.forced = ui.tab; out.cards = ui.classCards;
    ui.tab = 'army'; ui.renderShop(); out.forced2 = ui.tab;
    out.cls0 = p.classId; const to = p.classId === 'cleric' ? 'knight' : 'cleric'; out.switched = g.localSwitchClass(to); out.cls1 = p.classId; out.sw2 = g.switchClass(p, to); out.cls2 = p.classId;
    out.buy = !!document.querySelector('#shopGrid .card');
    return out;
  });
  check('the class and army tabs are unreachable and class switching is refused', r.forced === 'talents' && r.cards === null && r.forced2 === 'talents' && r.switched === false && r.sw2 === false && r.cls0 === r.cls1 && r.cls0 === r.cls2 && !r.buy, JSON.stringify(r));
  // a talent can be learnt in the panel
  r = await ev(() => {
    const g = window.__game, ui = g.ui, p = g.player;
    p.setLevel(3); ui.renderShop();
    const before = Object.keys(p.talents).length, pts = p.talentPoints;
    const node = ui.talentView.nodes.find((n) => n.el.classList.contains('afford'));
    if (node) node.el.click();
    return { before, pts, after: Object.keys(p.talents).length, found: !!node, left: p.talentPoints };
  });
  check('a talent point can be spent in the panel', r.found && r.after === r.before + 1 && r.left === r.pts - 1, JSON.stringify(r));
  await page.keyboard.press('KeyB');
  r = await ev(() => { window.__upd(); window.__game.player.setLevel(1); return window.__game.ui.shopOpen; });
  check('B closes it', r === false);
  // the map and the scoreboard stay
  r = await ev(() => {
    const g = window.__game, i = g.input, out = {};
    i.pressed.add('KeyM'); window.__upd(); out.open = g.ui.mapOpen;
    i.pressed.add('KeyM'); window.__upd(); out.closed = !g.ui.mapOpen;
    return out;
  });
  check('M still opens and closes the big map', r.open && r.closed, JSON.stringify(r));

  // ---------------------------------------------------------------- the scoreboard
  r = await ev(() => {
    const g = window.__game, i = g.input;
    i.keys.add('Tab'); window.__tick(3);
    const out = {
      shown: window.__vis('#scoreboard'), oldTable: window.__vis('#scoreboard > table'), hero: window.__vis('#heroScore'),
      top: window.__txt('#heroScoreTop'), sub: window.__txt('#heroScoreSub'),
      heads: [...document.querySelectorAll('#heroScore th')].map((e) => e.textContent),
      rows: [...document.querySelectorAll('#heroScoreRows tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim())),
      me: document.querySelectorAll('#heroScoreRows tr.me').length, down: document.querySelectorAll('#heroScoreRows tr.down').length,
    };
    i.keys.delete('Tab'); window.__tick(3);
    out.gone = !window.__vis('#scoreboard');
    return out;
  });
  check('Tab: the score on top, then a table of the six heroes', r.shown && !r.oldTable && r.hero && r.top === 'Blue 7:11 Red' && /First to 25 hero kills/.test(r.sub) && /round 3/.test(r.sub), JSON.stringify([r.top, r.sub]));
  check('scoreboard columns: side, hero, class, level, kills, deaths, status', r.heads.join() === 'Side,Hero,Class,Level,Kills,Deaths,Status', r.heads.join());
  check('scoreboard rows: Blue first, class names, kills, deaths, status', r.rows.length === 6 && r.rows[0][0] === 'Blue' && r.rows[0][1] === 'You (you)' && r.rows[1][2].includes('Mage') && r.rows[3][0] === 'Red' && r.rows[3][4] === '5' && r.rows[1][6] === 'Respawn in 7 s' && r.rows[0][6] === 'Alive' && r.me === 1 && r.down === 2 && r.gone, JSON.stringify(r.rows[1]));

  // ---------------------------------------------------------------- alerts and tips
  r = await ev(() => {
    const g = window.__game, a = g.alerts, p = g.player, f = g.localFaction, out = {};
    const ids = [];
    a.seen.clear();
    for (let k = 0; k < 70; k++) { const t = a.pickTip('play'); if (t) ids.push(t.id); }
    out.first = ids[0]; out.ids = [...new Set(ids)];
    a.seen.clear();
    out.death = a.pickTip('death').id; out.over = a.pickTip('over').id;
    f.gold = 5000; a.goldSince = g.time - 500; a.recent.length = 0; a.last.clear();
    a.treasury(f, p);
    out.gold = a.recent.some((x) => x.key === 'gold');
    return out;
  });
  const OFF = ['shop', 'army', 'orders', 'waves', 'castle', 'group', 'formation', 'classswitch', 'scores', 'ping', 'pingwheel', 'mapping', 'd-class', 'd-army', 'o-army'];
  check('hero tips come first (the way to win of this mode, then armies, talents, the fountain)', r.first === 'h-kills' && ['h-armies', 'h-talents', 'h-fountain', 'h-ways'].every((x) => r.ids.includes(x)) && !r.ids.includes('h-castle') && !r.ids.includes('h-timed'), r.ids.slice(0, 8).join());
  check('no army, order, shop, castle-upgrade or gold tips in Hero Mode', OFF.every((x) => !r.ids.includes(x)) && r.ids.includes('duck'), r.ids.filter((x) => OFF.includes(x)).join());
  check('respawn and game-over screens get hero tips; no gold alert', r.death === 'h-d-rise' && r.over === 'h-o-modes' && r.gold === false, JSON.stringify([r.death, r.over, r.gold]));
  r = await ev(() => {
    const g = window.__game, a = g.alerts, p = g.player, h = window.__fakeHero('castle'), out = {};
    a.heroDeaths = null; a.recent.length = 0; a.last.clear();
    a.heroWatch(p);                                         // the first look only learns the counts
    out.quiet = a.recent.length;
    h.rows[3].deaths++; h.sides[0].kills++;                 // an enemy hero falls
    h.rows[1].deaths++; h.sides[1].kills++;                 // an ally falls
    h.rows[0].deaths++;                                     // me: the respawn screen says it
    a.heroWatch(p);
    out.recent = a.recent.map((x) => x.text + '|' + x.tone);
    const k = window.__fakeHero('kills'); a.heroDeaths = null; a.heroWatch(p); k.rows[4].deaths++; k.sides[0].kills = 12; a.last.clear(); a.recent.length = 0; a.heroWatch(p);
    out.kills = a.recent.map((x) => x.text);
    return out;
  });
  check('a fallen enemy hero calls out the count, a fallen ally is named, my own fall is left to the respawn screen', r.quiet === 0 && r.recent.length === 2 && r.recent.includes('Enemy hero slain: 8|good') && r.recent.includes('Your ally Mara was slain|warn') && r.kills[0] === 'Enemy hero slain: 12/25', JSON.stringify([r.recent, r.kills]));

  r = await ev(() => {
    const g = window.__game, a = g.alerts, out = {};
    const n0 = document.querySelectorAll('#goldpops .goldpop').length; g.ui.goldPopup(30);
    out.pops = document.querySelectorAll('#goldpops .goldpop').length - n0;
    a.last.clear(); a.recent.length = 0; a.round = 3; const was = g.round; g.round = 4; a.countdown(); g.round = was;
    out.wave = a.recent.map((x) => x.text)[0];
    return out;
  });
  check('no gold popup in Hero Mode, and the callouts count rounds', r.pops === 0 && r.wave === 'Round 4 marches out', JSON.stringify(r));

  // ---------------------------------------------------------------- the end screen
  const endCase = async (label, winner, result, expect) => {
    const d = await ev(([winner, result]) => {
      const g = window.__game, h = window.__fakeHero('kills');
      h.result = result; g.state = 'playing'; document.getElementById('gameover').classList.add('hidden');
      g.finish(winner, result.reason);
      const rows = [...document.querySelectorAll('#goHeroes tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
      return { title: window.__txt('#goTitle'), cls: document.getElementById('goTitle').className, text: window.__txt('#goText'), stats: window.__txt('#goStats'), heads: [...document.querySelectorAll('#goHeroes th')].map((e) => e.textContent), rows, tbl: window.__vis('#goHeroes'), over: window.__vis('#gameover'), hud: window.__vis('#hud') };
    }, [winner, result]);
    check(`end screen, ${label}: "${expect}", the reason, the score and six heroes`, d.over && d.title === expect && d.text === result.reason && /7/.test(d.stats) && /11/.test(d.stats) && d.tbl && d.rows.length === 6 && d.heads.join() === 'Side,Hero,Class,Level,Kills,Deaths' && d.rows[0][1] === 'You (you)' && d.rows[3][0] === 'Red' && d.rows[4][2].includes('Ranger') && d.rows[3][3] === '4' && !d.hud, JSON.stringify([d.title, d.cls, d.rows[3]]));
    return d;
  };
  const won = await endCase('win', 0, { winner: 0, reason: 'Blue reached 25 hero kills' }, 'Victory!');
  check('the victory title is styled as a win', won.cls === 'win');
  const lost = await endCase('loss', 1, { winner: 1, reason: 'The Blue keep has fallen' }, 'Defeat');
  check('the defeat title is styled as a loss', lost.cls === 'lose');
  await endCase('draw', -1, { winner: -1, reason: 'Twenty minutes are up and the sides are level' }, 'A draw');

  // the HUD goes back when the mode is gone
  r = await ev(() => {
    const g = window.__game; g.hero = null; g.state = 'playing'; document.getElementById('gameover').classList.add('hidden'); document.getElementById('hud').classList.remove('hidden'); window.__tick(3);
    const v = window.__vis, a = g.alerts, n0 = document.querySelectorAll('#goldpops .goldpop').length;
    g.ui.goldPopup(30); const pops = document.querySelectorAll('#goldpops .goldpop').length - n0;
    a.last.clear(); a.recent.length = 0; a.round = 3; const was = g.round; g.round = 4; a.countdown(); g.round = was;
    return { pops, wave: a.recent.map((x) => x.text)[0], tab: g.ui.tab, hero: document.getElementById('hud').classList.contains('hero'), cmd: v('#command'), gold: v('#goldbox'), fac: v('#factions'), heroTop: v('#heroTop'), hint: document.getElementById('hint').textContent, ctl: document.getElementById('controls').classList.contains('hero'), goHeroes: v('#goHeroes') };
  });
  check('without game.hero the war HUD, hints, wording, gold popups and controls sheet come back', r.pops === 1 && r.wave === 'Wave 4 marches out' && r.tab === 'army' && !r.hero && r.cmd && r.gold && r.fac && !r.heroTop && /B: shop/.test(r.hint) && !r.ctl && !r.goHeroes, JSON.stringify(r));

  // the Controls sheet: the Hero Game Mode group, and in a hero match the war rows are gone
  r = await ev(() => {
    const g = window.__game, out = {};
    const rows = () => [...document.querySelectorAll('#controls .controls b')].filter((b) => b.offsetParent !== null).map((b) => b.textContent);
    document.getElementById('controls').classList.remove('hidden');
    out.war = rows(); out.grp = !!document.querySelector('#controls .grp') && /Hero Game Mode/.test(document.querySelector('#controls .grp').textContent);
    window.__fakeHero('kills'); window.__tick(2);
    out.hero = rows();
    document.getElementById('controls').classList.add('hidden');
    g.hero = null; window.__tick(2);
    return out;
  });
  check('Controls sheet: Hero Game Mode group; war rows (O, F1-F4, T, Y, G, F, B shop) hidden during a hero match only', r.grp && r.war.includes('F1 / Z') && r.war.includes('O') && !r.hero.includes('F1 / Z') && !r.hero.includes('O') && !r.hero.includes('G') && r.hero.includes('B or N') && r.hero.includes('M') && r.hero.includes('Tab'), JSON.stringify([r.war.length, r.hero.join('|')]));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' || '));
  await browser.close();

  // ---------------------------------------------------------------- King of the Hill: the war HUD as before
  const k = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  await k.page.evaluate(() => { localStorage.setItem('cw-herowin', 'bogus'); });
  await k.page.reload();
  await k.page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await k.page.evaluate(INSTALL);
  await k.page.click('#objective button[data-o=hero]');
  r = await k.page.evaluate(() => [...document.querySelectorAll('#heroWin button.active')].map((b) => b.dataset.w));
  check('a stored win mode that is not one of the three is ignored (the first is chosen)', r.join() === 'kills', r.join());
  await k.page.click('#objective button[data-o=koth]');
  await L.startSingle(k.page);
  await k.page.evaluate(() => { const g = window.__game; g.ui.showPause(false); g.paused = false; window.__tick(4); });
  r = await k.page.evaluate(() => {
    const v = window.__vis, g = window.__game;
    return { obj: g.objective, hero: document.getElementById('hud').classList.contains('hero'), cmd: v('#command'), gold: v('#goldbox'), fac: v('#factions'), top: v('#top'), hill: v('#hill'), heroTop: v('#heroTop'), roster: v('#heroRoster'), hint: document.getElementById('hint').textContent };
  });
  check('King of the Hill HUD unchanged: hill box, orders bar, gold, castle list; no hero panels', r.obj === 'koth' && !r.hero && r.cmd && r.gold && r.fac && r.top && r.hill && !r.heroTop && !r.roster && /O: orders/.test(r.hint), JSON.stringify(r));
  check('no page errors (King of the Hill run)', k.errors.length === 0, k.errors.slice(0, 3).join(' || '));
  await k.browser.close();

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
