const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  await page.click('#objective button[data-o=hero]');
  await page.click('#heroWin button[data-w=kills]');
  await page.evaluate(() => document.getElementById('play').click());
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  const out = await page.evaluate(() => {
    const g = window.__game, h = g.hero;
    const tick = (secs, dt = 0.05) => { const n = Math.round(secs / dt); for (let i = 0; i < n && g.state === 'playing'; i++) { g.paused = false; g.update(dt); g.ui.update(dt); g.input.endFrame(); } };
    g.player.buffs.add('ghost', 1e6);
    tick(33); tick(20);
    const snap = () => h.heroes.map((x) => `${x.name}(${x.team}${x.alive ? '' : ' DOWN'}) d${x.deaths} k${x.heroKills || 0}`).join(' | ');
    const log = [];
    log.push('before: ' + snap() + ' sides ' + h.sides.map((s) => s.kills + '/' + s.deaths).join(' '));
    const red = h.heroes.filter((x) => x.team === 1)[0];
    const b0 = h.sides[0].kills, r0 = h.sides[1].kills;
    red.buffs.clear(); g.damage(red, 1e6, g.player, { melee: true });
    log.push('right after hit: ' + snap() + ' sides ' + h.sides.map((s) => s.kills + '/' + s.deaths).join(' '));
    for (let i = 0; i < 4; i++) { tick(0.05); log.push(`tick ${i}: ` + snap() + ' sides ' + h.sides.map((s) => s.kills + '/' + s.deaths).join(' ')); }
    return log;
  });
  console.log(out.join('\n'));
  await browser.close();
})();
