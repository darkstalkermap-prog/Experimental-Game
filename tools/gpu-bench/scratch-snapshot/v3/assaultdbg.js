const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const MIX = ['swordsman', 'swordsman', 'spearman', 'spearman', 'archer', 'archer', 'archer', 'knight', 'horseman', 'horseman', 'swordsman', 'archer'];
  await page.evaluate((mix) => {
    const g = window.__game;
    g.phaseT = 1e9;
    for (const f of g.factions) f.ai = null;
    for (const u of g.units) if (u.isHero && u.team !== 0) { u.think = () => {}; u.update = function (dt) { this.animate(dt, false); }; }
    const f = g.factions[0]; f.gold = 1e6; f.troopCap = 36;
    window.__army = [];
    for (const t of mix) { const u = g.recruit(f, t); g.assignRole(f, u, 'army'); window.__army.push(u); }
    g.reslot(0);
    g.localOrder('assault');
    window.__target = g.siegeTarget(f).team;
  }, MIX);
  for (let t = 0; t < 180; t += 15) {
    await L.step(page, 15);
    const s = await page.evaluate(() => {
      const g = window.__game, T = g.castles[window.__target];
      const a = window.__army.filter((u) => u.alive);
      return { t: Math.round(g.time), alive: a.length, gate: Math.round(T.gate.hp), keep: Math.round(T.keep.hp), fallen: T.fallen, tgtNow: g.siegeTarget(g.factions[0]) && g.siegeTarget(g.factions[0]).team,
        units: a.map((u) => [u.type, Math.round(u.pos.x), Math.round(u.pos.z), Math.round(u.pos.y), u.order, u.orderData && u.orderData.team, u.target ? (u.target.kind || u.target.type) : '-', Math.round(Math.hypot(u.pos.x - T.center.x, u.pos.z - T.center.z))].join(' ')).slice(0, 6) };
    });
    console.log(JSON.stringify(s));
  }
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
