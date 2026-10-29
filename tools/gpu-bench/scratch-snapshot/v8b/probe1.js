const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const H = require(S + 'v8b/herolib.js'), L = H.L;
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await H.startHero(page, { win: 'kills', cls: 'mage' });
  let r = await page.evaluate(() => {
    const g = window.__game, h = g.hero;
    return {
      state: g.state, phase: g.phase, phaseT: g.phaseT, round: g.round, win: h.win,
      heroes: h.heroes.map((p) => [p.name, p.team, p.classId, p.isBot ? 'bot' : 'me', p.pos.x.toFixed(1), p.pos.z.toFixed(1), p.yaw.toFixed(2), p.alive, p.heroSlot]),
      humans: g.humans.length,
      fac: g.factions.map((f) => [f.team, f.name, f.isPlayer, f.eliminated, f.hero && f.hero.name, f.gold]),
      units: g.units.length, siege: g.siege.length,
      castles: g.castles.map((c) => [c.center.x, c.center.z, c.rot.toFixed(2)]),
    };
  });
  console.log(JSON.stringify(r));
  await L.step(page, 31);
  r = await page.evaluate(() => {
    const g = window.__game, h = g.hero;
    const by = {}; for (const u of g.units) { const k = u.team + ':' + u.order + ':' + (u.orderData && u.orderData.team); by[k] = (by[k] || 0) + 1; }
    return { round: g.round, phase: g.phase, phaseT: +g.phaseT.toFixed(1), clock: +h.clock.toFixed(1), prepLeft: h.prepLeft, by, siege: g.siege.length, u0: g.units[0] && [g.units[0].type, g.units[0].maxHp, g.units[0].dmg] };
  });
  console.log(JSON.stringify(r));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
