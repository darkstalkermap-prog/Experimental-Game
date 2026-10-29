// What are the armies doing after N minutes with idle heroes? (positions along the map axis, engines)
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const H = require(S + 'v8b/herolib.js'), L = H.L;
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await H.startHero(page, { win: 'castle' });
  await page.evaluate(() => { for (const p of window.__game.hero.heroes) p.buffs.add('ghost', 1e7); });
  for (const upto of [8, 16]) {
    const r = await page.evaluate((upto) => {
      const g = window.__game, h = g.hero;
      while (h.clock < upto * 60) g.update(0.1);
      // z is the axis between the keeps: Blue keep at z = +88, Red at -88
      const bucket = {};
      for (const u of g.units) {
        if (!u.alive || u.crewOf) continue;
        const b = Math.round(u.pos.z / 20) * 20;
        const k = u.team + ':' + b;
        bucket[k] = (bucket[k] || 0) + 1;
      }
      const eng = g.siege.filter((s) => s.alive).map((s) => ({ team: s.team, type: s.type, z: Math.round(s.pos.z), x: Math.round(s.pos.x), hp: Math.round(s.hp), crew: s.crewAlive(), ab: !!s.abandoned, tgt: s.targetCastle && s.targetCastle.team }));
      const gates = g.castles.slice(0, 2).map((c) => [c.gate.alive, Math.round(c.gate.hp), Math.round(c.keep.hp)]);
      return { clock: Math.round(h.clock), round: g.round, bucket, eng, gates };
    }, upto);
    console.log(JSON.stringify(r));
  }
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
