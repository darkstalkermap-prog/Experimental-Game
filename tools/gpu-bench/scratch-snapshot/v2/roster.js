// The Army tab roster: garrison / army / lane, orders reach the army only.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 800 } });
  await L.startSingle(page);
  const res = {};
  await page.evaluate(() => { const g = window.__game; g.ui.tab = 'army'; g.ui.toggleShop(true); document.exitPointerLock(); });
  await page.waitForTimeout(400);
  res.initial = await page.evaluate(() => {
    const g = window.__game;
    return { counts: g.roleCounts(0), rows: document.querySelectorAll('.rrow').length, header: document.querySelector('[data-r=counts]').textContent, typeLabels: [...document.querySelectorAll('.rtype:not(.hidden) > span:first-child')].map((e) => e.textContent) };
  });
  // click the army button of the first row with a real mouse click
  const firstArmy = await page.$('.rrow .rb button:nth-child(2)');
  await firstArmy.click();
  res.afterRowClick = await page.evaluate(() => {
    const g = window.__game;
    const arm = g.units.filter((u) => u.team === 0 && u.army).map((u) => u.type);
    return { army: arm, counts: g.roleCounts(0), header: document.querySelector('[data-r=counts]').textContent, rowActive: [...document.querySelectorAll('.rrow')].map((r) => [...r.querySelectorAll('.rb button')].findIndex((b) => b.classList.contains('active'))) };
  });
  // bulk: all archers to the army (type button)
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.rtype:not(.hidden)')];
    const archer = spans.find((s) => /Archer/.test(s.firstChild.textContent));
    archer.querySelectorAll('button')[1].click();
  });
  res.afterTypeClick = await page.evaluate(() => ({ counts: window.__game.roleCounts(0), armyTypes: window.__game.units.filter((u) => u.team === 0 && u.army).map((u) => u.type) }));
  // new recruits join the army
  await page.evaluate(() => { document.querySelector('[data-r=recruit] button[data-role=army]').click(); window.__game.factions[0].gold = 5000; });
  await page.evaluate(() => { const g = window.__game; g.buyForPlayer('recruit_spearman'); });
  res.recruitToArmy = await page.evaluate(() => { const g = window.__game; const u = g.units.filter((x) => x.team === 0 && x.type === 'spearman'); return { spearmen: u.map((x) => [x.role, x.order]), counts: g.roleCounts(0) }; });
  await page.evaluate(() => { document.querySelector('[data-r=recruit] button[data-role=garrison]').click(); window.__game.buyForPlayer('recruit_spearman'); });
  res.recruitToGarrison = await page.evaluate(() => window.__game.units.filter((x) => x.team === 0 && x.type === 'spearman').map((x) => x.role));
  // everyone out with the waves, then back
  await page.evaluate(() => { document.querySelector('[data-r=all] button[data-role=lane]').click(); });
  res.allLane = await page.evaluate(() => ({ counts: window.__game.roleCounts(0), orders: [...new Set(window.__game.units.filter((u) => u.team === 0 && u.lane).map((u) => u.order))] }));
  await page.evaluate(() => { document.querySelector('[data-r=all] button[data-role=garrison]').click(); });
  res.allGarrison = await page.evaluate(() => ({ counts: window.__game.roleCounts(0), orders: [...new Set(window.__game.units.filter((u) => u.team === 0 && !u.isHero).map((u) => u.order))] }));
  // orders reach only the army
  await page.evaluate(() => {
    const g = window.__game;
    document.querySelector('[data-r=all] button[data-role=army]').click();
    g.ui.toggleShop(false);
    // 3 swordsmen back to the garrison
    const sw = g.units.filter((u) => u.team === 0 && u.type === 'swordsman');
    g.setRoles(0, { role: 'garrison', ids: sw.map((u) => u.id) });
    g.localOrder('hold');
  });
  res.holdOrder = await page.evaluate(() => { const g = window.__game; const m = {}; for (const u of g.units) if (u.team === 0 && !u.isHero && !u.isCrew) { const k = u.role + ':' + u.order; m[k] = (m[k] || 0) + 1; } return m; });
  // a soldier drafted afterwards takes the standing order
  res.draftTakesOrder = await page.evaluate(() => { const g = window.__game; const sw = g.units.find((u) => u.team === 0 && u.type === 'swordsman'); g.setRoles(0, { role: 'army', ids: [sw.id] }); return [sw.role, sw.order]; });
  // an empty army reports it
  res.emptyArmy = await page.evaluate(() => { const g = window.__game; g.setRoles(0, { role: 'garrison' }); const before = document.querySelectorAll('.toast').length; g.localOrder('follow'); return { toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent).slice(0, 2) }; });
  // army follows the hero in the field
  await page.evaluate(() => { const g = window.__game; g.setRoles(0, { role: 'army' }); g.localOrder('follow'); const p = g.player; p.pos.x += 30; });
  await L.step(page, 12);
  res.follows = await page.evaluate(() => { const g = window.__game, p = g.player; const d = g.units.filter((u) => u.team === 0 && u.army && !u.isCrew).map((u) => Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z)); return { n: d.length, maxDist: Math.round(Math.max(...d)), avg: Math.round(d.reduce((a, b) => a + b, 0) / d.length) }; });
  console.log(JSON.stringify(res, null, 1));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
