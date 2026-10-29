// Hero Game Mode, the three parts together: the real menu starts the real rules (HeroMode), the bots (HeroBot) play, the real HUD follows
// the match and the end screen closes it. Three matches on fresh pages: first to 25 hero kills (a win), castle (our keep falls), timed (a draw).
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };

const INSTALL = () => {
  // what the page's frame loop does, a frame at a time
  window.__tick = (secs, dt = 0.05) => {
    const g = window.__game, n = Math.round(secs / dt);
    for (let i = 0; i < n && g.state === 'playing'; i++) { g.paused = false; g.update(dt); g.ui.update(dt); g.input.endFrame(); }
  };
  window.__vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; };
  window.__txt = (sel) => (document.querySelector(sel) || { textContent: null }).textContent;
  window.__red = (i = 0) => window.__game.hero.heroes.filter((h) => h.team === 1)[i];
  window.__blue = (i = 0) => window.__game.hero.heroes.filter((h) => h.team === 0)[i];
  window.__hit = (victim, attacker) => { victim.buffs.clear(); window.__game.damage(victim, 1e6, attacker, { melee: true }); };
  window.__keepAlive = () => { const g = window.__game; g.player.buffs.add('ghost', 1e6); };
};

// a fresh page on the menu with the real menu clicks that choose Hero Mode and a way to win
async function begin(page, win) {
  await page.click('#objective button[data-o=hero]');
  await page.click(`#heroWin button[data-w=${win}]`);
  await page.evaluate(() => document.getElementById('play').click());
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => { window.__game.paused = false; });
}
async function fresh(page) {
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await page.evaluate(INSTALL);
}

(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(INSTALL);

  // ================================================================ 1. first to 25 hero kills
  await begin(page, 'kills');
  let r = await ev(() => {
    const g = window.__game, h = g.hero, cls = (t) => h.heroes.filter((x) => x.team === t).map((x) => x.classId);
    return {
      has: !!h, win: h && h.win, n: g.humans.length, blue: cls(0), red: cls(1), mine: h.heroes[0] === g.player, team: g.player.team,
      off: g.factions[2].eliminated && g.factions[3].eliminated, mode: g.mode, objective: g.objective, round: g.round, phase: g.phase,
      bots: h.heroes.filter((x) => x.isBot && x.bot).length, hudHero: document.getElementById('hud').classList.contains('hero'),
    };
  });
  check('the menu started the Hero Game Mode with the way to win chosen', r.has && r.win === 'kills' && r.mode === 'single', JSON.stringify([r.win, r.mode]));
  check('six heroes: you and two bots for Blue, three bots for Red, all in game.humans', r.n === 6 && r.bots === 5 && r.mine && r.team === 0 && r.blue.length === 3 && r.red.length === 3, JSON.stringify([r.n, r.bots, r.blue, r.red]));
  check('each side has three different classes', new Set(r.blue).size === 3 && new Set(r.red).size === 3, JSON.stringify([r.blue, r.red]));
  check('the other two houses are switched off and the prep phase counts down', r.off && r.phase === 'prep' && r.round === 0);

  await ev(() => window.__tick(2));
  r = await ev(() => ({
    hud: window.__vis('#heroTop') && window.__vis('#heroRoster'), rows: document.querySelectorAll('#heroRoster .hr').length, me: document.querySelectorAll('#heroRoster .hr.me').length,
    banner: window.__txt('#banner h2') + ' | ' + window.__txt('#banner p'), round: window.__txt('#heroRound'), goal: window.__txt('#heroGoal'), clock: window.__txt('#heroClock'),
    gold: window.__vis('#goldbox'), orders: window.__vis('#orders'), prepBanner: /Prepare for battle/.test(window.__txt('#banner h2')),
  }));
  check('the HUD shows the score panel and a roster of six with one row marked as you', r.hud && r.rows === 6 && r.me === 1, JSON.stringify([r.rows, r.me]));
  check('the opening banner is the hero mode\'s (not "Prepare for battle") and names the goal', /Hero Game Mode/.test(r.banner) && /25 hero kills/i.test(r.banner) && !r.prepBanner, r.banner.slice(0, 90));
  check('the countdown reads "Prepare" and the goal and clock are filled in', /Prepare: \d+ s/.test(r.round) && /25/.test(r.goal) && /Battle 0:0/.test(r.clock), JSON.stringify([r.round, r.goal, r.clock]));
  check('no gold box and no orders bar', !r.gold && !r.orders);

  // the first army marches after the 30 s prep; the local hero cannot fall by accident while we look
  await ev(() => { window.__keepAlive(); window.__tick(33); });
  r = await ev(() => {
    const g = window.__game, h = g.hero, u = g.units.filter((x) => x.alive);
    return { round: g.round, prepLeft: h.prepLeft, clock: h.clock, blue: u.filter((x) => x.team === 0).length, red: u.filter((x) => x.team === 1).length,
      other: u.filter((x) => x.team > 1).length, round2: window.__txt('#heroRound'), over: g.state };
  });
  check('after the prep the first round has marched: soldiers for Blue and for Red, none for the empty houses', r.round >= 1 && r.prepLeft === 0 && r.clock > 0 && r.blue > 0 && r.red > 0 && r.other === 0, JSON.stringify(r));
  check('the HUD counts the round', /^Round \d+/.test(r.round2), r.round2);

  // bots walk to their lane
  const p0 = await ev(() => window.__game.hero.heroes.filter((x) => x.isBot).map((x) => [x.pos.x, x.pos.z]));
  await ev(() => { window.__keepAlive(); window.__tick(20); });
  const p1 = await ev(() => window.__game.hero.heroes.filter((x) => x.isBot).map((x) => [x.pos.x, x.pos.z]));
  const moved = p0.filter((a, i) => Math.hypot(a[0] - p1[i][0], a[1] - p1[i][1]) > 3).length;
  check('the bot heroes leave their keeps and walk the lane (at least 4 of 5 moved more than 3 m)', moved >= 4, `${moved}/5`);

  // a Red hero falls to our hero: Blue scores, the roster row goes down with a respawn timer, the hero rises again at their keep
  // (the bots really fight, so every count is read as a change from just before: other heroes may fall by themselves)
  r = await ev(() => {
    const g = window.__game, h = g.hero, red = window.__red(0);
    const b0 = h.sides[0].kills, r0 = h.sides[1].kills, m0 = g.player.heroKills || 0, d0 = red.deaths;
    const snap = () => h.heroes.map((x) => `${x.name}(${x.team}${x.alive ? '' : ' DOWN'}) d${x.deaths}`).join(' | ');
    const before = snap();
    window.__hit(red, g.player);
    const mid = snap();
    window.__tick(0.2);
    const row = h.roster().find((x) => x.player === red);
    const mine = [...document.querySelectorAll('#heroRoster .hr')].find((e) => e.querySelector('.nm').textContent === red.name);
    return { b: h.sides[0].kills - b0, r: h.sides[1].kills - r0, mine: (g.player.heroKills || 0) - m0, alive: red.alive, respawnIn: row.respawnIn, deaths: row.deaths, newDeaths: row.deaths - d0,
      before, mid, after: snap(), down: !!mine && mine.classList.contains('down'), st: mine ? mine.textContent.trim() : '', score: window.__txt('#heroScoreB') + ':' + window.__txt('#heroScoreR'), want: `${b0 + 1}:${h.sides[1].kills}` };   // (Red's count is read now: a Blue bot may have fallen by itself in these frames)
  });
  const want = Math.min(24, 8 + 3 * (r.deaths - 1));
  check('a Red hero falling to us is a Blue hero kill (and ours)', r.b === 1 && r.mine === 1 && r.newDeaths === 1 && !r.alive, JSON.stringify([r.b, r.r, r.mine, r.before, r.mid, r.after]));
  check('the roster shows them down with the respawn time the rules give (8 s, 3 more for each earlier death), and the score reads one more for Blue', r.down && Math.abs(r.respawnIn - want) < 0.5 && /respawn \d+ s/.test(r.st) && r.score === r.want, JSON.stringify([r.down, r.respawnIn, want, r.st, r.score, r.want]));
  r = await ev((w) => {
    const g = window.__game, red = window.__red(0);
    window.__keepAlive(); window.__tick(w + 0.6);
    const k = g.castles[1].keep.pos;
    // (another hero may have fallen in the meantime: look at this hero's own row)
    const row = [...document.querySelectorAll('#heroRoster .hr')].find((e) => e.querySelector('.nm').textContent === red.name);
    return { alive: red.alive, hp: red.hp / red.maxHp, near: Math.hypot(red.pos.x - k.x, red.pos.z - k.z), rowDown: !row || row.classList.contains('down') };
  }, want);
  check('they rise again at their own keep after the respawn time', r.alive && r.near < 25 && !r.rowDown, JSON.stringify([r.alive, r.near.toFixed(1), r.rowDown]));

  // our own hero falls: the overlay counts down the roster's timer, a Red kill is scored, we rise again
  r = await ev(() => {
    const g = window.__game, h = g.hero, red = window.__red(1), me = g.player;
    const r0 = h.sides[1].kills, d0 = h.sides[0].deaths;
    me.buffs.clear(); g.damage(me, 1e6, red, { melee: true });
    window.__tick(0.3);
    return { alive: me.alive, shown: window.__vis('#respawn'), text: window.__txt('#respawnT'), r: h.sides[1].kills - r0, deaths: h.sides[0].deaths - d0, mine: me.deaths };
  });
  const wantMe = Math.min(24, 8 + 3 * (r.mine - 1));
  check('when we fall the respawn overlay counts down from the rules\' time and Red scores a hero kill', !r.alive && r.shown && r.text === `Respawning in ${wantMe}s` && r.r === 1 && r.deaths === 1, JSON.stringify([r, wantMe]));
  r = await ev(() => {
    const g = window.__game, me = g.player;
    window.__tick(8.6);
    window.__keepAlive();
    return { alive: me.alive, shown: window.__vis('#respawn'), ghost: !!me.buffs.has && true };
  });
  check('we rise again and the overlay is gone', r.alive && !r.shown, JSON.stringify(r));

  // the fountain heals a wounded hero standing near their own keep
  r = await ev(() => {
    const g = window.__game, me = g.player, k = g.castles[0].keep.pos;
    me.hp = me.maxHp * 0.3;
    const near = Math.hypot(me.pos.x - k.x, me.pos.z - k.z);
    window.__tick(5);
    return { near, hp: me.hp / me.maxHp };
  });
  check('at the keep the fountain mends a wounded hero (30% -> above 70% in 5 s)', r.near < 16 && r.hp > 0.7, JSON.stringify(r));

  // the Tab scoreboard (hero table) and the Talents-only controls
  r = await ev(() => {
    const g = window.__game;
    g.ui.showScoreboard ? g.ui.showScoreboard(true) : null;
    return { has: typeof g.ui.renderHeroScoreboard === 'function' };
  });
  check('the hero scoreboard renderer exists', r.has);

  // finishing it: first to 25. Blue has 1 so far; give them 24 and take one more
  r = await ev(() => {
    const g = window.__game, h = g.hero;
    h.sides[0].kills = 24;
    window.__hit(h.heroes.find((x) => x.team === 1 && x.alive), g.player);   // (one that is up: the bots fight, so one may be down)
    window.__tick(0.3, 0.05);
    return { state: g.state, res: h.result, title: window.__txt('#goTitle'), text: window.__txt('#goText'), go: window.__vis('#gameover'), table: window.__vis('#goHeroes'),
      rows: document.querySelectorAll('#goHeroes tbody tr').length, cls: document.getElementById('goTitle').className };
  });
  check('25 hero kills ends the match: Blue wins, the end screen says Victory with the reason', r.state === 'over' && r.res && r.res.winner === 0 && /Victory/.test(r.title) && /25 hero kills/.test(r.text) && r.go, JSON.stringify([r.state, r.title, r.text.slice(0, 70)]));
  check('the end screen lists the six heroes', r.table && r.rows === 6, String(r.rows));
  check('no page errors in the kills match', errors.length === 0, errors.slice(0, 3).join(' || '));

  // ================================================================ 2. castle: our keep falls
  await fresh(page);
  errors.length = 0;
  await begin(page, 'castle');
  r = await ev(() => {
    const g = window.__game, h = g.hero;
    window.__keepAlive(); window.__tick(40);
    const goalTxt = window.__txt('#heroGoal');
    window.__hit(window.__blue(0), window.__red(0));   // a hero kill in a castle match is only for the scoreboard
    window.__tick(0.2);
    const sc = [h.sides[0].kills, h.sides[1].kills], still = g.state;
    g.castles[0].keep.takeDamage(1e9, window.__red(0));
    window.__tick(0.3);
    return { win: h.win, target: h.killTarget, goal: goalTxt, sc, still, state: g.state, res: h.result, title: window.__txt('#goTitle'), text: window.__txt('#goText'), cls: document.getElementById('goTitle').className };
  });
  check('castle match: no kill target, the goal says destroy the keep, a hero kill only scores', r.win === 'castle' && r.target === 0 && /keep/i.test(r.goal) && r.sc[1] === 1 && r.still === 'playing', JSON.stringify([r.goal, r.sc, r.still]));
  check('our keep falling ends it: Red wins and the screen says Defeat with the reason', r.state === 'over' && r.res && r.res.winner === 1 && /Defeat/.test(r.title) && /keep has fallen/.test(r.text) && /lose/.test(r.cls), JSON.stringify([r.state, r.title, r.text.slice(0, 70)]));
  check('no page errors in the castle match', errors.length === 0, errors.slice(0, 3).join(' || '));

  // ================================================================ 3. timed: level on kills and keeps is a draw
  await fresh(page);
  errors.length = 0;
  await begin(page, 'timed');
  r = await ev(() => {
    const g = window.__game, h = g.hero;
    window.__keepAlive(); window.__tick(32);
    const left = h.remaining, clockTxt = window.__txt('#heroClock'), goal = window.__txt('#heroGoal');
    h.clock = h.timeLimit - 0.5;
    window.__tick(1);
    return { win: h.win, left, clockTxt, goal, state: g.state, res: h.result, title: window.__txt('#goTitle'), text: window.__txt('#goText'), cls: document.getElementById('goTitle').className };
  });
  check('timed match: 20 minutes, the HUD counts the time left', r.win === 'timed' && r.left > 1160 && r.left < 1200 && /Time left 19:/.test(r.clockTxt) && /20/.test(r.goal), JSON.stringify([r.left, r.clockTxt, r.goal]));
  check('time up with kills and keeps level is a draw, and the end screen says so', r.state === 'over' && r.res && r.res.winner === -1 && r.res.draw && /draw/i.test(r.title), JSON.stringify([r.state, r.title, r.text.slice(0, 80)]));
  check('no page errors in the timed match', errors.length === 0, errors.slice(0, 3).join(' || '));

  await browser.close();
  console.log(failed ? `FAILED ${failed}` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('RUN ERROR', e); process.exit(2); });
