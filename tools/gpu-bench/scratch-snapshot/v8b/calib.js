// How long does a match last when nobody plays? (idle heroes; GHOST=1 makes them untouchable so only the armies decide)
// OVR='{"siegeGrowth":0.09}' overrides HERO fields for the run; RUNS=n repeats on fresh pages; STEP=2 prints every 2nd minute.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const H = require(S + 'v8b/herolib.js'), L = H.L;
(async () => {
  const { browser, page, errors } = await L.launch({ map: process.env.MAP || 'small' });
  const ends = [];
  for (let run = 0; run < (+process.env.RUNS || 1); run++) {
    if (run) await H.fresh(page);
    await H.startHero(page, { win: process.env.WIN || 'castle' });
    await page.evaluate(async ([o, ghost]) => {
      const { HERO } = await import('/src/herogame.js');
      Object.assign(HERO, o);
      if (ghost) for (const p of window.__game.hero.heroes) p.buffs.add('ghost', 1e7);
    }, [JSON.parse(process.env.OVR || '{}'), !!process.env.GHOST]);
    const t0 = Date.now();
    let last = null;
    for (let m = 1; m <= (+process.env.MINUTES || 30); m++) {
      const r = await page.evaluate(() => {
        const g = window.__game, h = g.hero;
        for (let k = 0; k < 600 && !h.result; k++) g.update(0.1);
        const lane = (t) => g.units.filter((u) => u.alive && u.team === t && u.lane).length;
        return { clock: Math.round(h.clock), round: g.round, lane: [lane(0), lane(1)], siege: g.siege.filter((s) => s.alive).length, keeps: [0, 1].map((t) => Math.round(h.keepShare(t) * 100)), kills: h.sides.map((s) => s.kills), result: h.result };
      });
      last = r;
      if (m % (+process.env.STEP || 1) === 0 || r.result) console.log(' ', m, JSON.stringify(r).slice(0, 230));
      if (r.result) break;
    }
    ends.push(last.result ? last.clock : null);
    console.log('run', run + 1, 'ended at', last.result ? last.clock + ' s: ' + last.result.reason : 'NOT in ' + last.clock + ' s', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  console.log('ENDS', JSON.stringify(ends), 'errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
