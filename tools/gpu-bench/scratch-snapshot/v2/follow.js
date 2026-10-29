// Does the army follow its lord out of the castle and across the field?
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await page.evaluate(() => { const g = window.__game; g.factions[0].gold = 3000; for (const t of ['archer', 'swordsman', 'spearman', 'knight']) g.buyForPlayer('recruit_' + t); g.setRoles(0, { role: 'army' }); g.localOrder('follow'); g.phaseT = 9999; });
  const dist = () => page.evaluate(() => { const g = window.__game, p = g.player; const d = g.units.filter((u) => u.team === 0 && u.army && !u.isCrew).map((u) => Math.round(Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z))); return { n: d.length, d: d.sort((a, b) => a - b).join(',') }; });
  console.log('start', JSON.stringify(await dist()));
  // walk the hero out of the gate and 40 m beyond, in steps
  await page.evaluate(() => { const g = window.__game, p = g.player, c = g.castles[0]; const out = c.gateOut.clone().add(c.dirToWorld(0, 40)); p.pos.set(out.x, g.physics.groundHeight(out.x, out.z, 20), out.z); });
  for (let i = 0; i < 6; i++) { await L.step(page, 8); console.log('t+' + (i + 1) * 8, JSON.stringify(await dist())); }
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
