const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const H = require(S + 'v8b/herolib.js'), L = H.L;
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await H.startHero(page, { win: 'timed' });
  const r = await page.evaluate(async () => {
    const g = window.__game, h = g.hero;
    const { HERO } = await import('/src/herogame.js');
    const out = {};
    const hit = (victim, attacker) => { victim.buffs.clear(); g.damage(victim, 1e6, attacker, { melee: true }); };
    g.phaseT = 1e9;
    for (let i = 0; i < 40; i++) g.update(0.1);
    out.a = [h.clock, g.round, h.prepLeft, g.state];
    const b = h.heroes.filter((p) => p.team === 0), rd = h.heroes.filter((p) => p.team === 1);
    hit(rd[0], b[0]); hit(rd[1], b[1]); hit(rd[2], b[2]); hit(b[1], rd[0]);
    out.k = [h.sides[0].kills, h.sides[1].kills, g.state];
    g.phaseT = 0.01; g.update(0.05);
    out.b = [h.clock, g.round, g.phaseT];
    g.phaseT = 1e9;
    h.clock = HERO.timeLimit - 1;
    out.c = [h.clock, HERO.timeLimit, h.timeLimit, h.win];
    const trace = [];
    for (let i = 0; i < 40; i++) { g.update(0.05); if (i % 8 === 0) trace.push([i, h.clock, g.state, !!h.result, g.paused, g.ui.shopOpen, g.hitStop]); }
    out.t = trace;
    out.d = [h.clock, g.state, h.result];
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
