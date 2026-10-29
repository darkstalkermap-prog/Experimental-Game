// Hero Game Mode, the rules and the flow of the match (src/herogame.js + the hooks in game.js): the six heroes and their
// places, houses 2 and 3 switched off, the armies marching every 30 s and getting tougher, respawn timers and the fountain,
// kill counting (heroes, soldiers, engines), the three ways to win, the end screen, a 3-minute run, and the war modes.
// The bots are the do-nothing stub (or whatever herobot.js holds): heroes are driven by hand here.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const H = require(S + 'v8b/herolib.js'), L = H.L;
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
const J = (x) => JSON.stringify(x);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// helpers that live in the page for one scenario
const helpers = (page) => page.evaluate(() => {
  const g = window.__game;
  window.T = {
    hit: (victim, attacker) => { victim.buffs.clear(); g.damage(victim, 1e6, attacker, { melee: true }); },
    hold: () => { g.phaseT = 1e9; },                                  // no army marches: only the rules are under test
    reds: () => g.hero.heroes.filter((h) => h.team === 1),
    blues: () => g.hero.heroes.filter((h) => h.team === 0),
    toasts: () => document.getElementById('toasts').textContent,
    over: () => ({ state: g.state, title: document.getElementById('goTitle').textContent, text: document.getElementById('goText').textContent, shown: !document.getElementById('gameover').classList.contains('hidden') }),
    counters: () => { for (const p of g.hero.heroes) if (p.bot) { p.bot._n = 0; p.bot._r = 0; p.bot._t = 0; p.bot.update = function () { this._n++; }; p.bot.reset = function () { this._r++; }; p.bot.spendTalents = function () { this._t++; }; } },
  };
});
const scenario = async (page, o) => { await H.fresh(page); await H.startHero(page, o); await helpers(page); };

(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  let r;

  // ---------------------------------------------------------------- the setup
  await H.startHero(page, { win: 'kills', cls: 'mage' });
  await helpers(page);
  r = await page.evaluate(async () => {
    const g = window.__game, h = g.hero;
    const { HERO } = await import('/src/herogame.js');
    const { buy } = await import('/src/economy.js');
    const side = (t) => h.heroes.filter((p) => p.team === t);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const pair = (t) => { const s = side(t); return Math.min(dist(s[0].pos, s[1].pos), dist(s[0].pos, s[2].pos), dist(s[1].pos, s[2].pos)); };
    const facing = (p) => { const e = g.castles[1 - p.team].center; const dx = e.x - p.pos.x, dz = e.z - p.pos.z; return (Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz) / Math.hypot(dx, dz); };
    g.order(0, 'charge');
    return {
      win: h.win, killTarget: h.killTarget, timeLimit: h.timeLimit, remaining: h.remaining, n: h.heroes.length, humans: g.humans.length,
      inHumans: h.heroes.every((p) => g.humans.includes(p)), blue: side(0).map((p) => p.classId), red: side(1).map((p) => p.classId),
      local: { cls: g.player.classId, team: g.player.team, first: h.heroes[0] === g.player, name: g.player.name },
      bots: h.heroes.filter((p) => p.isBot).map((p) => ({ team: p.team, remote: p.remote, hasBot: !!p.bot, enemy: p.bot && p.bot.enemyTeam })),
      levels: h.heroes.map((p) => p.level), xp: h.heroes.map((p) => p.xp),
      near0: side(0).map((p) => dist(p.pos, g.castles[0].spawnPoint)), near1: side(1).map((p) => dist(p.pos, g.castles[1].spawnPoint)),
      pair0: pair(0), pair1: pair(1), facing: h.heroes.map(facing), names: new Set(h.heroes.map((p) => p.name)).size,
      fac: g.factions.map((f) => ({ elim: f.eliminated, ai: !!f.ai, isPlayer: f.isPlayer, gold: f.gold, hero: f.hero && f.hero.name })),
      units: g.units.length, siege: g.siege.length, queue: g.spawnQueue.length, hill: !!g.hill.live,
      phase: g.phase, phaseT: g.phaseT, prep: HERO.prep, prepLeft: h.prepLeft, round: g.round, clock: h.clock, result: h.result,
      rows: h.roster().map((x) => ({ keys: Object.keys(x).sort().join(), team: x.team, mine: x.mine, alive: x.alive, respawnIn: x.respawnIn, bot: x.isBot })),
      sides: h.sides.map((s) => [s.team, s.name, s.kills, s.deaths]),
      block: g.player.classBlock('mage'), buy: buy(g, g.factions[0], 'recruit_swordsman'), unitsAfterOrder: g.units.length,
    };
  });
  check('three heroes against three, all in game.humans', r.n === 6 && r.humans === 6 && r.inHumans && r.blue.length === 3 && r.red.length === 3, J([r.blue, r.red]));
  check('the local hero is Blue, first in the list, with the chosen class', r.local.team === 0 && r.local.first && r.local.cls === 'mage' && r.blue[0] === 'mage', J(r.local));
  check('five bots: two Blue, three Red, each with a HeroBot aimed at the other side', r.bots.length === 5 && r.bots.filter((b) => b.team === 0).length === 2 && r.bots.every((b) => b.remote && b.hasBot && b.enemy === 1 - b.team));
  check('each side has three different classes (a varied mix)', new Set(r.blue).size === 3 && new Set(r.red).size === 3, J([r.blue, r.red]));
  check('every hero starts at level 1 with no experience, with its own name', r.levels.every((l) => l === 1) && r.xp.every((x) => x === 0) && r.names === 6);
  check('heroes begin in three places at their own keep', r.near0.every((d) => d < 8) && r.near1.every((d) => d < 8) && r.pair0 > 2.5 && r.pair1 > 2.5, J([r.near0, r.near1, r.pair0, r.pair1]));
  check('heroes face the enemy keep', r.facing.every((f) => f > 0.98), J(r.facing.map((f) => +f.toFixed(3))));
  check('houses 2 and 3 are off, nobody has a lord, an AI or soldiers, no hill squads', r.fac[2].elim && r.fac[3].elim && r.fac.every((f) => !f.ai) && !r.fac[0].elim && !r.fac[1].elim && r.units === 0 && r.siege === 0 && r.queue === 0, J(r.fac));
  check('both live houses are player houses led by a hero, with no gold', r.fac[0].isPlayer && r.fac[1].isPlayer && r.fac[0].hero === 'You' && r.fac[1].hero && r.fac[0].gold === 0 && r.fac[1].gold === 0);
  check('prep: phase "prep" of HERO.prep seconds, no clock yet, no result', r.phase === 'prep' && r.phaseT === r.prep && r.prepLeft === r.prep && r.round === 0 && r.clock === 0 && r.result === null, J([r.phase, r.phaseT, r.prepLeft]));
  check('mode fields: kills mode targets 25, no time limit', r.win === 'kills' && r.killTarget === 25 && r.timeLimit === 0 && r.remaining === null);
  check('roster: six rows, Blue first, one is mine, all alive', r.rows.length === 6 && r.rows.slice(0, 3).every((x) => x.team === 0) && r.rows.slice(3).every((x) => x.team === 1) && r.rows.filter((x) => x.mine).length === 1 && r.rows[0].mine && r.rows.every((x) => x.alive && x.respawnIn === 0), r.rows[0].keys);
  check('roster rows carry player, name, team, cls, level, kills, deaths, alive, respawnIn, isBot, mine', r.rows[0].keys === 'alive,cls,deaths,isBot,kills,level,mine,name,player,respawnIn,team', r.rows[0].keys);
  check('sides start at nothing', J(r.sides) === J([[0, 'Blue', 0, 0], [1, 'Red', 0, 0]]));
  check('class changes, shop purchases and army orders are refused', typeof r.block === 'string' && typeof r.buy === 'string' && r.unitsAfterOrder === 0, J([r.block, r.buy]));

  // a varied mix whatever the local hero picks
  r = await page.evaluate(() => {
    const h = window.__game.hero, bad = [];
    const ROLE = { knight: 'front', berserker: 'front', cavalier: 'front', ranger: 'ranged', mage: 'ranged', cleric: 'support' };
    const ok = (all) => new Set(all).size === all.length && all.some((c) => ROLE[c] === 'front') && all.some((c) => ROLE[c] === 'ranged');
    for (const c of Object.keys(ROLE)) for (let i = 0; i < 40; i++) { const all = [c, ...h.mix([c], 2)]; if (!ok(all)) bad.push(all); }
    for (let i = 0; i < 100; i++) { const all = h.mix([], 3); if (!ok(all)) bad.push(all); }
    return bad.slice(0, 3);
  });
  check('the bots always make a different, front-and-ranged trio with the local pick', r.length === 0, J(r));

  // ---------------------------------------------------------------- the flow: prep, then an army every 30 s
  await L.step(page, 20);
  r = await page.evaluate(() => ({ prepLeft: window.__game.hero.prepLeft, clock: window.__game.hero.clock, round: window.__game.round, units: window.__game.units.length }));
  check('during the prep nothing marches and the clock waits', near(r.prepLeft, 10, 0.6) && r.clock === 0 && r.round === 0 && r.units === 0, J(r));
  await L.step(page, 11);
  const army = () => page.evaluate(() => {
    const g = window.__game, out = { round: g.round, phase: g.phase, clock: g.hero.clock, prepLeft: g.hero.prepLeft, n: [0, 0, 0, 0], orders: {}, targets: {}, dist: [0, 0], lane: 0, siege: g.siege.filter((s) => s.alive).map((s) => [s.team, s.type, s.targetCastle && s.targetCastle.team]) };
    for (const u of g.units) {
      if (!u.alive) continue;
      out.n[u.team]++;
      out.orders[u.order] = (out.orders[u.order] || 0) + 1;
      const tc = u.orderData && u.orderData.team !== undefined ? u.orderData.team : 'none';
      out.targets[u.team + '>' + tc] = (out.targets[u.team + '>' + tc] || 0) + 1;
      if (u.lane) out.lane++;
      if (u.team < 2) out.dist[u.team] += Math.hypot(u.pos.x - g.castles[1 - u.team].keep.pos.x, u.pos.z - g.castles[1 - u.team].keep.pos.z) / 1;
    }
    out.dist = out.dist.map((d, t) => d / Math.max(1, out.n[t]));
    out.camera = Math.hypot(g.camera.position.x - g.player.pos.x, g.camera.position.z - g.player.pos.z);
    return out;
  });
  const a1 = await army();
  check('after the prep round 1 begins, the clock runs, the first soldiers leave both castles', a1.round === 1 && a1.phase === 'wave' && a1.prepLeft === 0 && a1.clock > 0.5 && a1.clock < 3 && a1.n[0] >= 2 && a1.n[1] >= 2, J([a1.round, a1.clock, a1.n]));
  check('soldiers march on the enemy keep (assault), none on or from houses 2 and 3', a1.n[2] === 0 && a1.n[3] === 0 && J(a1.orders) === '{"assault":' + (a1.n[0] + a1.n[1]) + '}' && Object.keys(a1.targets).every((k) => k === '0>1' || k === '1>0') && a1.lane === a1.n[0] + a1.n[1], J(a1.targets));
  check('the camera still follows the local hero', a1.camera < 3, 'camera ' + a1.camera.toFixed(2));
  await L.step(page, 12);
  const a2 = await army();
  check('armies walk towards the enemy castle (both sides closer after 12 s)', a2.dist[0] < a1.dist[0] - 15 && a2.dist[1] < a1.dist[1] - 15, J([a1.dist.map(Math.round), a2.dist.map(Math.round)]));
  await L.step(page, 19);
  const a3 = await army();
  check('round 2 begins 30 s after round 1', a3.round === 2 && near(a3.clock, 32, 2), J([a3.round, a3.clock, a3.n]));
  await L.step(page, 34);
  const a4 = await army();
  check('round 3 follows 30 s later, with a battering ram from each castle', a4.round === 3 && a4.siege.some((s) => s[0] === 0 && s[1] === 'ram' && s[2] === 1) && a4.siege.some((s) => s[0] === 1 && s[1] === 'ram' && s[2] === 0), J([a4.round, a4.siege]));

  // ---------------------------------------------------------------- the rounds get harder
  await H.fresh(page);
  await H.startHero(page, { win: 'kills' });
  r = await page.evaluate(async () => {
    const g = window.__game, h = g.hero;
    const { HERO, escalationTier } = await import('/src/herogame.js');
    const step = (secs) => { for (let i = 0; i < secs * 20; i++) g.update(0.05); };
    const clear = () => { for (const u of g.units) u.remove(); g.units.length = 0; for (const s of g.siege) g.scene.remove(s.mesh); g.siege.length = 0; g.spawnQueue.length = 0; };
    const rounds = [];
    for (const R of [1, 3, 5, 10, 20, 21]) {
      clear();
      g.round = R - 1; g.phaseT = 0.001;
      g.update(0.05);
      step(14);
      const row = { R, teams: [], exp: { tr: escalationTier(HERO.escalate.training, R), lv: escalationTier(HERO.escalate.levies, R), br: escalationTier(HERO.escalate.barracks, R) } };
      for (const t of [0, 1]) {
        const us = g.units.filter((u) => u.team === t && u.lane && !u.crewOf && !u.isCrew);
        const sw = us.filter((u) => u.type === 'swordsman');
        const f = g.factions[t];
        row.teams.push({
          n: us.length, sw: sw.length ? [sw[0].maxHp, +sw[0].dmg.toFixed(2)] : null, knights: us.filter((u) => u.type === 'knight').length, riders: us.filter((u) => u.type === 'horseman').length, lancers: us.filter((u) => u.type === 'lancer').length,
          tr: f.training, lv: f.levies, cap: f.troopCap, siege: g.siege.filter((s) => s.team === t).map((s) => [s.type, s.maxHp, s.dmg]),
        });
      }
      rounds.push(row);
    }
    // soldiers already marching get tougher when the house is drilled further (round 24 -> 25: training 4 -> 5)
    clear();
    g.round = 23; g.phaseT = 0.001; g.update(0.05); step(3);
    const u = g.units.find((x) => x.team === 0 && x.type === 'swordsman' && x.lane);
    const before = [u.maxHp, u.hp, u.dmg];
    g.phaseT = 0.001; g.update(0.05);
    return { rounds, retrain: { before, after: [u.maxHp, u.hp, u.dmg] }, growth: HERO.waveGrowth };
  });
  const k = (R, tr) => (1 + 0.15 * tr) * (1 + r.growth * (R - 1));
  for (const row of r.rounds) {
    const [b, red] = row.teams;
    check(`round ${row.R}: both houses are equal (same wave, same stats, same upgrades)`, J(b.sw) === J(red.sw) && b.n === red.n && b.tr === red.tr && b.lv === red.lv && b.cap === red.cap && b.knights === red.knights, J([b.n, red.n, b.sw, red.sw]));
    check(`round ${row.R}: upgrades follow the table (training ${row.exp.tr}, levies ${row.exp.lv}, barracks ${row.exp.br})`, b.tr === row.exp.tr && b.lv === row.exp.lv && b.cap === 12 + 6 * row.exp.br, J([b.tr, b.lv, b.cap]));
    check(`round ${row.R}: a swordsman has ${Math.round(100 * k(row.R, row.exp.tr))} health and ${(14 * k(row.R, row.exp.tr)).toFixed(1)} damage`, b.sw && b.sw[0] === Math.round(100 * k(row.R, row.exp.tr)) && near(b.sw[1], 14 * k(row.R, row.exp.tr), 0.1), J(b.sw));
  }
  const main = r.rounds.slice(0, 5), sw = main.map((x) => x.teams[0].sw), size = main.map((x) => x.teams[0].n);
  console.log('      swordsman (hp, dmg) by round 1/3/5/10/20:', J(sw), ' wave sizes:', J(size));
  check('soldiers are tougher every time (rounds 1, 3, 5, 10, 20)', sw.every((s, i) => i === 0 || (s[0] > sw[i - 1][0] && s[1] > sw[i - 1][1])), J(sw));
  check('round 20 soldiers have more than three times the health of round 1', sw[4][0] > 3 * sw[0][0] && sw[4][1] > 3 * sw[0][1], J([sw[0], sw[4]]));
  check('armies grow with the rounds', size.every((n, i) => i === 0 || n >= size[i - 1]) && size[4] >= size[0] * 3, J(size));
  check('elite levies arrive: knights in round 10, riders and lancers by round 20', r.rounds[3].teams[0].knights >= 1 && r.rounds[4].teams[0].riders >= 1 && r.rounds[4].teams[0].lancers >= 1, J(r.rounds[4].teams[0]));
  check('rams from round 3, a catapult at round 5', r.rounds[1].teams[0].siege.some((s) => s[0] === 'ram') && r.rounds[2].teams[0].siege.some((s) => s[0] === 'catapult') && r.rounds[2].teams[1].siege.some((s) => s[0] === 'catapult'), J(r.rounds[2].teams[0].siege));
  check('engines built later hit harder (the ram of round 21 against round 3)', r.rounds[5].teams[0].siege.find((s) => s[0] === 'ram')[2] > r.rounds[1].teams[0].siege.find((s) => s[0] === 'ram')[2], J([r.rounds[1].teams[0].siege, r.rounds[5].teams[0].siege]));
  check('soldiers already marching grow with the next drill (round 24 to 25: x1.094)', near(r.retrain.after[0] / r.retrain.before[0], 1.75 / 1.6, 0.01) && near(r.retrain.after[2] / r.retrain.before[2], 1.75 / 1.6, 0.01), J(r.retrain));

  // ---------------------------------------------------------------- respawns and the fountain
  await scenario(page, { win: 'castle', cls: 'knight' });
  await page.evaluate(() => { window.T.hold(); window.T.counters(); });
  await page.evaluate(() => {
    const g = window.__game, bot = window.T.blues()[1];
    bot.hp = bot.maxHp * 0.4; bot.stamina = 5; bot.arrows = 3; bot.potions = 0; bot.lastHurt = g.time;
  });
  await L.step(page, 2);
  r = await page.evaluate(() => {
    const g = window.__game, T = window.T, bot = T.blues()[1], red = T.reds()[2], out = {};
    out.inside = { hp: bot.hp / bot.maxHp, st: bot.stamina, arrows: bot.arrows, potions: bot.potions };
    // a hero well outside the walls does not mend
    const w = g.castles[1].toWorld(0, 45);
    red.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z); red.hp = red.maxHp * 0.4; red.stamina = 5; red.arrows = 3; red.potions = 0; red.lastHurt = g.time;
    out.fountainAt = [g.hero.atFountain(bot), g.hero.atFountain(red)];
    return out;
  });
  check('fountain: 8% of max health a second at your own keep, with stamina and arrows refilled', near(r.inside.hp, 0.4 + 0.16, 0.04) && r.inside.st === 100 && r.inside.arrows >= 60 && r.inside.potions === 1, J(r.inside));
  check('atFountain tells inside from outside', r.fountainAt[0] === true && r.fountainAt[1] === false, J(r.fountainAt));
  await L.step(page, 2);
  r = await page.evaluate(() => { const red = window.T.reds()[2]; return { hp: red.hp / red.maxHp, st: red.stamina, arrows: red.arrows, potions: red.potions }; });
  check('fountain: nothing outside the radius', near(r.hp, 0.4, 0.01) && r.st < 100 && r.arrows === 3 && r.potions === 0, J(r));

  // the local hero falls: a timer, the overlay's clock, then a rise at the keep
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero, T = window.T, p = g.player;
    T.hit(p, T.reds()[0]);
    g.ui.update(0.2);
    return { overlay: document.getElementById('respawnT').textContent, alive: p.alive, deaths: p.deaths, sides: h.sides.map((s) => [s.kills, s.deaths]), row: h.roster()[0].respawnIn, house: g.factions[0].respawnT, hk: T.reds()[0].heroKills, pk: p.kills, upd: T.blues()[1].bot._n };
  });
  check('the local hero falls: Red gets a hero kill, Blue a death, the killer is credited', !r.alive && r.deaths === 1 && J(r.sides) === J([[0, 1], [1, 0]]) && r.hk === 1, J(r));
  check('first respawn takes HERO.respawnBase (8 s), shown in the roster and in the house timer for the overlay', near(r.row, 8, 0.1) && near(r.house, 8, 0.1), J([r.row, r.house]));
  check('the existing overlay says "Respawning in 8s"', r.overlay === 'Respawning in 8s', r.overlay);
  await L.step(page, 7);
  r = await page.evaluate(() => ({ alive: window.__game.player.alive, house: window.__game.factions[0].respawnT, row: window.__game.hero.roster()[0].respawnIn }));
  check('still down after 7 s, the overlay timer counts down', !r.alive && near(r.house, 1, 0.15) && near(r.row, 1, 0.15), J(r));
  await L.step(page, 1.2);
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player, h = g.hero, w = h.slotPos(p);
    return { alive: p.alive, hp: p.hp === p.maxHp, at: Math.hypot(p.pos.x - w.x, p.pos.z - w.z), protectedFor: p.buffs.time('ghost'), house: g.factions[0].respawnT, toast: window.T.toasts().includes('You rise again at your keep'),
      yaw: p.yaw, rot: g.castles[0].rot };
  });
  check('the hero rises at their place in the keep, whole, protected for a moment, facing out', r.alive && r.hp && r.at < 0.6 && r.protectedFor > 0.3 && r.protectedFor <= 2 && near(r.yaw, r.rot, 0.01) && r.house === 0 && r.toast, J(r));
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player, T = window.T, hp = p.hp;
    g.damage(p, 50, T.reds()[0], { melee: true });   // still protected: nothing touches the hero
    return { hp: p.hp === hp, alive: p.alive };
  });
  check('protection after rising: a blow does nothing', r.hp && r.alive);

  // the timer grows with each death and stops at the cap; every hero has their own timer
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player, T = window.T, h = g.hero, red = T.reds()[0], out = [];
    for (let i = 0; i < 3; i++) { T.hit(p, red); out.push(h.roster()[0].respawnIn); h.rise(p); }
    p.deaths = 30; T.hit(p, red); out.push(h.roster()[0].respawnIn); h.rise(p);
    return out;
  });
  check('respawn waits 8, 11, 14 ... seconds and never more than 24', J(r.map((x) => Math.round(x))) === J([11, 14, 17, 24]), J(r));
  r = await page.evaluate(() => {
    const T = window.T, g = window.__game, a = T.blues()[1], b = T.blues()[2], red = T.reds()[0];
    a.deaths = 0; b.deaths = 0; a.bot._r = 0; b.bot._r = 0; a.bot._n = 0;
    T.hit(a, red);
    return { a: a.respawnT };
  });
  await L.step(page, 3);
  r = await page.evaluate(() => {
    const T = window.T, a = T.blues()[1], b = T.blues()[2], red = T.reds()[0];
    const out = { aDown: a.respawnT, updatesWhileDown: a.bot._n };
    T.hit(b, red);
    out.bTimer = b.respawnT;
    return out;
  });
  check('each hero has their own timer (a: 8 s - 3 s, b: a fresh 8 s)', near(r.aDown, 5, 0.2) && near(r.bTimer, 8, 0.1) && r.updatesWhileDown === 0, J(r));
  await L.step(page, 5.3);
  r = await page.evaluate(() => { const T = window.T, a = T.blues()[1], b = T.blues()[2]; return { a: a.alive, b: b.alive, bRest: b.respawnT, resets: [a.bot._r, b.bot._r] }; });
  check('a rises 3 s before b; the bot is reset when it has risen', r.a && !r.b && near(r.bRest, 2.7, 0.3) && r.resets[0] === 1 && r.resets[1] === 0, J(r));
  await L.step(page, 3);
  r = await page.evaluate(() => { const T = window.T, a = T.blues()[1], b = T.blues()[2]; return { b: b.alive, resets: [a.bot._r, b.bot._r], updates: a.bot._n > 20 }; });
  check('b rises too and is reset; a live bot is updated every frame', r.b && r.resets[1] === 1 && r.updates, J(r));

  // ---------------------------------------------------------------- kill counting
  await scenario(page, { win: 'castle', cls: 'ranger', classes: { 0: ['mage', 'cleric'], 1: ['knight', 'ranger', 'cavalier'] } });
  await page.evaluate(() => { window.T.hold(); window.T.counters(); });
  r = await page.evaluate(() => { const T = window.T; return { blue: T.blues().map((p) => p.classId), red: T.reds().map((p) => p.classId), horse: T.reds().map((p) => !!p.hasHorse) }; });
  check('the bots take the classes they are told to (for tests), a Cavalier brings a horse', J(r.blue) === J(['ranger', 'mage', 'cleric']) && J(r.red) === J(['knight', 'ranger', 'cavalier']) && J(r.horse) === J([false, false, true]), J(r));
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero, T = window.T, me = g.player, bb = T.blues()[1], reds = T.reds(), out = {};
    T.hit(reds[0], me);
    out.first = { kills: h.sides[0].kills, mine: me.heroKills, all: me.kills, toast: T.toasts().includes('First blood'), feed: document.getElementById('killfeed').children.length };
    const soldier = g.recruit(g.factions[0], 'swordsman', true);
    T.hit(reds[1], soldier);
    out.soldier = { kills: h.sides[0].kills, mine: me.heroKills, bb: bb.heroKills || 0 };
    const ram = g.buildSiege(g.factions[0], 'ram');
    T.hit(reds[2], ram);
    out.engine = { kills: h.sides[0].kills, reds: h.sides[1].deaths };
    h.rise(reds[0]); h.rise(reds[1]);
    T.hit(reds[0], bb);                                   // the 4th
    h.rise(reds[2]);
    T.hit(reds[2], me);                                   // the 5th
    out.five = { kills: h.sides[0].kills, mine: me.heroKills, bb: bb.heroKills, milestone: T.toasts().includes('Blue has 5 hero kills') };
    // a fall that is nobody's doing, and a blow from a friend
    g.damage(bb, 1e6, null, { melee: true });
    out.fall = { sides: h.sides.map((s) => [s.kills, s.deaths]), bbAlive: bb.alive };
    const bb2 = T.blues()[2], hp = bb2.hp;
    g.damage(bb2, 1e6, me, { melee: true });
    out.friend = bb2.alive && bb2.hp === hp;
    out.gold = g.factions.map((f) => f.gold);
    out.state = g.state;
    return out;
  });
  check('a hero brings down a hero: side kill, own kill, first blood toast, kill feed line', r.first.kills === 1 && r.first.mine === 1 && r.first.all === 1 && r.first.toast && r.first.feed >= 1, J(r.first));
  check('a soldier of Blue bringing down a hero counts for Blue, not for a hero', r.soldier.kills === 2 && r.soldier.mine === 1 && r.soldier.bb === 0, J(r.soldier));
  check('so does a siege engine', r.engine.kills === 3 && r.engine.reds === 3, J(r.engine));
  check('every fifth kill is announced (Blue has 5 hero kills), kills are credited to the right hero', r.five.kills === 5 && r.five.mine === 2 && r.five.bb === 1 && r.five.milestone, J(r.five));
  check('an unattributed fall is a death but not a kill; a friend cannot hurt you', r.fall.sides[0][0] === 5 && r.fall.sides[0][1] === 1 && r.fall.sides[1][0] === 0 && r.fall.sides[1][1] === 5 && !r.fall.bbAlive && r.friend, J(r.fall));
  check('no gold in the Hero Game Mode, the match goes on after 5 kills in castle mode', r.gold.every((g) => g === 0) && r.state === 'playing', J(r.gold));
  // experience: quicker, and a bot that levels up chooses its talents
  r = await page.evaluate(() => {
    const T = window.T, b = T.blues()[2], out = {};
    b.xp = 0; b.level = 1; b.gainXp(10);
    out.xp = b.xp;
    b.bot._t = 0; b.gainXp(600);
    out.level = b.level; out.calls = b.bot._t;
    return out;
  });
  check('experience comes 1.5 times quicker', near(r.xp, 15, 0.01), J(r));
  check('a bot that levels up is asked to spend its talents (once per level)', r.level === 4 && r.calls === 3, J(r));   // (15 + 600 x 1.5 = 915 experience: levels 2, 3 and 4)

  // ---------------------------------------------------------------- first to 25 hero kills
  const killLoop = (attackerKind, victimTeam) => page.evaluate(([attackerKind, victimTeam]) => {
    const g = window.__game, h = g.hero, T = window.T, log = { at24: null, milestones: [] };
    const victims = victimTeam === 1 ? T.reds() : T.blues(), friends = victimTeam === 1 ? T.blues() : T.reds();
    const enemyFac = g.factions[1 - victimTeam];
    const kinds = { hero: () => friends[0], soldier: () => g.recruit(enemyFac, 'swordsman', true), engine: () => g.buildSiege(enemyFac, 'ram') };
    for (let i = 0; i < 25; i++) {
      const v = victims[i % 3];
      if (!v.alive) h.rise(v);
      const att = attackerKind === 'mixed' ? [kinds.hero, kinds.soldier, kinds.engine][i % 3]() : kinds[attackerKind]();
      T.hit(v, att);
      const s = h.sides[1 - victimTeam];
      if (i === 4 || i === 9 || i === 14 || i === 19) log.milestones.push(T.toasts().includes(`has ${s.kills} hero kills`));
      if (i === 23) log.at24 = { kills: s.kills, state: g.state, result: h.result, toast: T.toasts().includes('one hero kill from victory') };
    }
    return log;
  }, [attackerKind, victimTeam]);
  await scenario(page, { win: 'kills' });
  await page.evaluate(() => { window.T.hold(); window.T.counters(); });
  await L.step(page, 1);
  r = await killLoop('hero', 1);
  check('kills mode: 24 kills is not enough, "one hero kill from victory" is announced', r.at24 && r.at24.kills === 24 && r.at24.state === 'playing' && r.at24.result === null && r.at24.toast, J(r.at24));
  check('kills mode: milestone toasts at 5, 10, 15, 20', r.milestones.length === 4 && r.milestones.every(Boolean), J(r.milestones));
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero, T = window.T, e = T.over();
    return { result: h.result, sides: h.sides.map((s) => [s.kills, s.deaths]), over: e, bots: T.blues()[1].bot._n };
  });
  const nBefore = r.bots;
  check('bots were updated while the match ran', nBefore > 20, 'updates ' + nBefore);
  check('the 25th hero kill ends the match for Blue with a reason', r.result && r.result.winner === 0 && r.result.reason === 'Blue reached 25 hero kills first (25 to 0).' && r.result.draw === false && r.sides[0][0] === 25, J(r.result));
  check('end screen: Victory! and the reason text', r.over.state === 'over' && r.over.shown && r.over.title === 'Victory!' && r.over.text === r.result.reason, J(r.over));
  await L.step(page, 2);
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero, T = window.T, c0 = h.clock, red = T.reds()[0];
    h.rise(red); T.hit(red, T.blues()[0]); T.hit(T.blues()[2], red);
    return { kills: h.sides.map((s) => s.kills), deaths: h.sides.map((s) => s.deaths), clock: h.clock === c0, result: h.result.winner, bots: T.blues()[1].bot._n };
  });
  check('after the end nothing more is counted and the heroes are frozen', J(r.kills) === J([25, 0]) && J(r.deaths) === J([0, 25]) && r.clock && r.result === 0 && r.bots === nBefore, J(r));

  await scenario(page, { win: 'kills' });
  await page.evaluate(() => { window.T.hold(); });
  r = await killLoop('mixed', 0);
  r = await page.evaluate(() => { const g = window.__game, h = g.hero; return { result: h.result, over: window.T.over(), kills: h.sides.map((s) => s.kills) }; });
  check('Red wins with 25 kills made by heroes, soldiers and engines; the end screen says Defeat', r.result && r.result.winner === 1 && r.result.reason === 'Red reached 25 hero kills first (25 to 0).' && r.over.title === 'Defeat' && r.over.text === r.result.reason, J([r.result, r.over.title]));

  // ---------------------------------------------------------------- castle: the keep must fall
  await scenario(page, { win: 'castle' });
  await page.evaluate(() => { window.T.hold(); });
  r = await killLoop('hero', 1);
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero, T = window.T, out = { kills: h.sides[0].kills, state: g.state, result: h.result, killTarget: h.killTarget };
    const c = g.castles[1], soldier = g.recruit(g.factions[0], 'swordsman', true);
    out.share0 = h.keepShare(1);
    for (let i = 0; i < 5; i++) c.keep.takeDamage(300, soldier);
    out.share1 = h.keepShare(1); out.mid = h.result;
    for (let i = 0; i < 20 && !c.fallen; i++) c.keep.takeDamage(300, soldier);
    out.fallen = c.fallen; out.end = h.result; out.over = T.over();
    return out;
  });
  check('castle mode: 25 hero kills do not end it (no target)', r.kills === 25 && r.state === 'playing' && r.killTarget === 0);
  check('castle mode: a damaged keep does not end it, the share falls', r.share0 === 1 && near(r.share1, 0.5, 0.01) && r.mid === null, J([r.share0, r.share1]));
  check('castle mode: when the enemy keep falls Blue wins, with the reason', r.fallen && r.end && r.end.winner === 0 && r.end.reason === "Red's keep has fallen: Blue wins (hero kills 25 to 0)." && r.over.title === 'Victory!' && r.over.text === r.end.reason, J([r.end, r.over.title]));

  // a fallen keep ends the timed mode early too, and a keep of ours that falls is a defeat
  await scenario(page, { win: 'timed' });
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero, T = window.T;
    g.phaseT = 0.01; g.update(0.05);
    for (let i = 0; i < 30; i++) g.update(0.1);
    const clock = h.clock, soldier = g.recruit(g.factions[1], 'swordsman', true);
    g.castles[0].keep.takeDamage(1e9, soldier);
    return { clock, end: h.result, over: T.over(), rem: h.remaining, limit: h.timeLimit };
  });
  check('timed mode: a keep that falls ends it early and that side loses', r.clock > 2 && r.clock < 5 && r.end && r.end.winner === 1 && r.end.reason.startsWith("Blue's keep has fallen: Red wins") && r.over.title === 'Defeat', J([r.clock, r.end, r.over.title]));
  check('timed mode: 20 minutes, the remaining time runs down', r.limit === 1200 && near(r.rem, 1200 - r.clock, 0.01), J([r.limit, r.rem, r.clock]));

  // ---------------------------------------------------------------- timed: more kills, then the stronger keep, else a draw
  const timed = async (setupFn) => {
    await scenario(page, { win: 'timed' });
    return page.evaluate(async (fn) => {
      const g = window.__game, h = g.hero, T = window.T, out = {};
      const { HERO } = await import('/src/herogame.js');
      T.hold();
      for (let i = 0; i < 40; i++) g.update(0.1);   // 4 s of prep: the clock waits for the first army
      out.clockInPrep = h.clock;
      eval(fn)(g, h, T);
      g.phaseT = 0.01;
      for (let i = 0; i < 10 && g.round === 0; i++) g.update(0.05);   // the first army marches: the battle clock starts
      g.phaseT = 1e9;
      h.clock = HERO.timeLimit - 1;
      out.before = { state: g.state, result: h.result, rem: h.remaining };
      for (let i = 0; i < 40; i++) g.update(0.05);
      out.end = h.result; out.over = T.over(); out.sides = h.sides.map((s) => s.kills);
      return out;
    }, setupFn.toString());
  };
  r = await timed((g, h, T) => { const b = T.blues(), rd = T.reds(); T.hit(rd[0], b[0]); T.hit(rd[1], b[1]); T.hit(rd[2], b[2]); T.hit(b[1], rd[0]); });
  check('timed: the clock waits for the first army', r.clockInPrep === 0);
  check('timed: time runs out, more hero kills wins (3 to 1)', r.before.state === 'playing' && r.end && r.end.winner === 0 && r.end.reason === 'Time is up: Blue wins with more hero kills (3 to 1).' && r.over.title === 'Victory!' && r.over.text === r.end.reason, J([r.end, r.over]));
  r = await timed((g, h, T) => { const b = T.blues(), rd = T.reds(); T.hit(rd[0], b[0]); T.hit(rd[1], b[1]); T.hit(b[0], rd[0]); T.hit(b[1], rd[1]); g.castles[0].keep.takeDamage(900, rd[2]); });
  check('timed: level on kills, the stronger keep wins (Red hurt the Blue keep)', r.end && r.end.winner === 1 && /^Time is up: hero kills are level at 2 each, and Red's keep is stronger \(100% to 70%\)\.$/.test(r.end.reason) && r.sides[0] === 2 && r.sides[1] === 2, J(r.end));
  r = await timed((g, h, T) => { const b = T.blues(), rd = T.reds(); T.hit(rd[0], b[0]); T.hit(b[0], rd[0]); });
  check('timed: level on kills and keeps, a draw (winner -1)', r.end && r.end.winner === -1 && r.end.draw === true && r.end.reason === 'Time is up: hero kills are level at 1 each and both keeps hold equally. A draw.' && r.over.state === 'over' && r.over.text === r.end.reason, J([r.end, r.over]));

  // ---------------------------------------------------------------- no match runs for ever
  await scenario(page, { win: 'castle' });
  r = await page.evaluate(async () => {
    const g = window.__game, h = g.hero, T = window.T, out = {};
    const { HERO } = await import('/src/herogame.js');
    const b = T.blues(), rd = T.reds();
    T.hit(rd[0], b[0]); T.hit(rd[1], b[1]); T.hit(b[2], rd[0]);
    g.phaseT = 0.01;
    for (let i = 0; i < 10 && g.round === 0; i++) g.update(0.05);
    g.phaseT = 1e9;
    h.clock = HERO.hardCap - 301;
    for (let i = 0; i < 40; i++) g.update(0.05);
    out.warned = T.toasts().includes('decided on hero kills'); out.early = h.result;
    h.clock = HERO.hardCap - 1;
    for (let i = 0; i < 40; i++) g.update(0.05);
    out.end = h.result; out.over = T.over(); out.cap = HERO.hardCap; out.limit = h.timeLimit;
    return out;
  });
  check('a castle match that drags on is warned five minutes before the cap', r.warned && r.early === null);
  check('after 30 minutes of battle it is decided like the timed mode (hero kills 2 to 1)', r.cap === 1800 && r.limit === 0 && r.end && r.end.winner === 0 && r.end.reason === 'The battle has run its 30 minutes: Blue wins with more hero kills (2 to 1).' && r.over.text === r.end.reason, J(r.end));

  // ---------------------------------------------------------------- a 3-minute run
  await scenario(page, { win: 'kills', cls: 'cleric' });
  await page.evaluate(() => { window.T.counters(); window.__game.player.buffs.add('ghost', 1e6); });
  for (let i = 0; i < 6; i++) await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 600; k++) { g.update(0.05); g.ui.update(0.05); } });   // (the HUD runs too)
  await page.evaluate(() => { window.__game.ui.renderScoreboard(); window.__game.ui.toggleMap(true); window.__game.ui.update(0.2); window.__game.ui.toggleMap(false); });
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero;
    const bad = h.heroes.filter((p) => ![p.pos.x, p.pos.y, p.pos.z, p.hp].every(Number.isFinite));
    return { round: g.round, clock: h.clock, state: g.state, units: [0, 1].map((t) => g.units.filter((u) => u.alive && u.team === t).length), siege: g.siege.length, bad: bad.length,
      sides: h.sides.map((s) => [s.kills, s.deaths]), alive: h.heroes.map((p) => p.alive), updates: h.heroes.filter((p) => p.bot).map((p) => p.bot._n) };
  });
  check('3 minutes of play: six rounds, armies on both sides, nothing broken', r.round >= 5 && near(r.clock, 150, 3) && r.units[0] > 0 && r.units[1] > 0 && r.bad === 0 && r.updates.every((n) => n > 1000), J(r));
  console.log('      run:', J(r));
  check('3 minutes of play: no page errors', errors.length === 0, J(errors.slice(0, 3)));

  // heroes that stand about while the rounds get harder: they fall, rise, level up, and the match ends by itself
  await scenario(page, { win: 'kills' });
  let end = null;
  for (let m = 0; m < 33 && !end; m++) {
    end = await page.evaluate(() => { const g = window.__game, h = g.hero; for (let k = 0; k < 600 && !h.result; k++) { g.update(0.1); if (k % 5 === 0) g.ui.update(0.5); } return h.result; });
  }
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero;
    return { clock: Math.round(h.clock), round: g.round, sides: h.sides.map((s) => [s.kills, s.deaths]), levels: h.heroes.map((p) => p.level), alive: h.heroes.filter((p) => p.alive).length,
      bad: h.heroes.filter((p) => ![p.pos.x, p.pos.y, p.pos.z, p.hp].every(Number.isFinite)).length, result: h.result, over: window.T.over() };
  });
  console.log('      idle heroes:', J(r));
  check('idle heroes: they fall and rise again under the harder rounds, the match always ends by itself (a keep, 25 kills, or at the latest the 30-minute cap)', r.sides[0][1] + r.sides[1][1] > 0 && r.result && r.over.state === 'over' && r.over.text === r.result.reason && r.bad === 0, J([r.sides, r.result]));
  check('idle heroes: no errors on the page (HUD included)', errors.length === 0, J(errors.slice(0, 3)));

  // ---------------------------------------------------------------- the war modes are untouched
  await H.fresh(page);
  await L.startSingle(page);
  await L.step(page, 12);
  r = await page.evaluate(async () => {
    const g = window.__game, { buy } = await import('/src/economy.js');
    const gold = g.factions[0].gold, bought = buy(g, g.factions[0], 'recruit_swordsman');
    return { hero: g.hero, lords: g.units.filter((u) => u.isHero).length, ai: g.factions.filter((f) => f.ai).length, elim: g.factions.map((f) => f.eliminated), phaseT: g.phaseT, units: g.units.length,
      bought, switched: g.localSwitchClass('mage'), gold: g.factions[0].gold < gold, xp: (() => { const p = g.player; p.xp = 0; p.gainXp(10); return p.xp; })() };
  });
  check('war mode: no hero mode, AI lords and their houses, the prep of 60 s, the shop and class changes work', r.hero === null && r.lords === 3 && r.ai === 3 && r.elim.every((e) => !e) && r.phaseT > 40 && r.phaseT < 50 && r.bought === true && r.switched === true && r.gold && r.xp === 10, J(r));
  await L.step(page, 60);
  r = await page.evaluate(() => { const g = window.__game; return { round: g.round, houses: [0, 1, 2, 3].map((t) => g.units.filter((u) => u.alive && u.team === t && u.lane).length) }; });
  check('war mode: waves march from all four castles', r.round === 1 && r.houses.every((n) => n > 0), J(r));
  check('war mode: no page errors', errors.length === 0, J(errors.slice(0, 3)));

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
