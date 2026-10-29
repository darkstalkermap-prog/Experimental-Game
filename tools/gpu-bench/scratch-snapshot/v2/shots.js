// Screenshots of the new UI with the real render loop.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = S + 'v2/';
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', raf: true, viewport: { width: 1280, height: 720 }, quality: 'low' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + 'menu.png' });
  await page.evaluate(() => document.querySelector('#classPick button[data-cls=cavalier]').click());
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => { document.exitPointerLock(); document.getElementById('pause').classList.add('hidden'); window.__game.paused = false; });
  await page.waitForTimeout(1500);
  // an engine with its crew, in front of the player
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    g.factions[0].gold = 5000;
    const e = g.buildSiege(g.factions[0], 'ram');
    window.__e = e;
    // park it in front of the hero and keep it still
    e.pos.set(p.pos.x + 0, p.pos.y, p.pos.z + 9);
    e.targetCastle = null; e.pickTarget = () => {};
    p.yaw = 0;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + 'engine_crew.png' });
  // kill the crew, step next to it
  await page.evaluate(() => {
    const g = window.__game, p = g.player, e = window.__e;
    for (const c of [...e.crew]) if (c) g.damage(c, 999, { team: 1 }, { melee: true });
    p.pos.set(e.pos.x - 3.5, e.pos.y, e.pos.z - 1);
    p.yaw = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    document.getElementById('pause').classList.add('hidden');
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + 'engine_abandoned.png' });
  await page.evaluate(() => { const g = window.__game; g.input.pressed.add('KeyE'); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + 'engine_drive.png' });
  await page.evaluate(() => { const g = window.__game; g.input.pressed.add('KeyE'); });
  await page.waitForTimeout(400);
  // abilities
  await page.evaluate(() => { const g = window.__game; g.player.useAbility('q', g.input); g.player.useAbility('r', g.input); document.getElementById('pause').classList.add('hidden'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + 'hud_cast.png' });
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
