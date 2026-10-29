// How engines fare over a long war: manned / abandoned / captured, with all four houses on AI.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: process.argv[2] || 'small' });
  await L.startSingle(page);
  await page.evaluate(() => {
    const g = window.__game;
    window.__stats = { built: 0, seized: 0, decayed: 0, destroyed: 0, crewKilled: 0 };
    const st = window.__stats;
    const origChange = g.siege;
    // count events by wrapping SiegeEngine prototype methods
    const proto = Object.getPrototypeOf(g.buildSiege(g.factions[0], 'ram'));
    g.siege.pop().destroy(null, true);
    const oc = proto.changeOwner; proto.changeOwner = function (t) { st.seized++; return oc.call(this, t); };
    const od = proto.destroy; proto.destroy = function (a, c) { if (c) st.decayed++; else st.destroyed++; return od.call(this, a, c); };
    const ob = g.buildSiege.bind(g); g.buildSiege = (f, t) => { st.built++; return ob(f, t); };
    const ocd = proto.crewDied; proto.crewDied = function (u) { st.crewKilled++; return ocd.call(this, u); };
    st.built = 0; st.decayed = 0;
  });
  for (let i = 0; i < 12; i++) {
    await L.step(page, 30);
    const r = await page.evaluate(() => {
      const g = window.__game;
      const alive = g.siege.filter((s) => s.alive);
      return { t: Math.round(g.time), round: g.round, engines: alive.length, manned: alive.filter((s) => s.crewAlive() > 0).length, abandoned: alive.filter((s) => s.abandoned).length, units: g.units.filter((u) => u.alive).length, crewUnits: g.units.filter((u) => u.alive && u.crewOf).length, stats: window.__stats };
    });
    console.log(JSON.stringify(r));
  }
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
