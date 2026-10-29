// Follow the giants (idle untouchable heroes): where do they go, what kills them?
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const H = require(S + 'v8b/herolib.js'), L = H.L;
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await H.startHero(page, { win: 'castle' });
  await page.evaluate(() => { for (const p of window.__game.hero.heroes) p.buffs.add('ghost', 1e7); });
  const r = await page.evaluate(() => {
    const g = window.__game, h = g.hero, log = [];
    while (h.clock < 19 * 30 - 5) g.update(0.1);
    let next = h.clock;
    while (h.clock < 19 * 30 + 240 && !h.result) {
      g.update(0.1);
      if (h.clock >= next) {
        next += 10;
        const gs = g.units.filter((u) => u.isGiant).map((u) => `${u.team}${u.alive ? '' : 'x'}@${Math.round(u.pos.x)},${Math.round(u.pos.z)} hp${Math.round(u.hp)}/${Math.round(u.maxHp)} ${u.order}${u.target ? ' >' + (u.target.type || u.target.kind) : ''}`);
        const lane = (t) => g.units.filter((u) => u.alive && u.team === t && u.lane).length;
        log.push([Math.round(h.clock), g.round, lane(0), lane(1), gs.join(' | '), g.castles.map((c) => Math.round(c.gate.hp) + '/' + Math.round(c.keep.hp)).slice(0, 2).join(' ')].join('  '));
      }
    }
    return log;
  });
  console.log(r.join('\n'));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
