// Engine scenes with the real render loop (hero outside the castle).
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = S + 'v2/';
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', raf: true, viewport: { width: 1280, height: 720 }, quality: 'low' });
  await page.waitForTimeout(500);
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[0];
    g.factions[0].gold = 9000;
    // stand outside the gate, looking away from the castle
    const out = c.gateOut.clone().add(c.dirToWorld(0, 10));
    p.pos.set(out.x, g.physics.groundHeight(out.x, out.z, 20), out.z);
    p.yaw = Math.atan2(out.x - c.center.x, out.z - c.center.z);
    window.__yaw = p.yaw;
    const e = g.buildSiege(g.factions[0], 'ram');
    window.__e = e;
    const spot = out.clone().add(new (g.camera.position.constructor)(Math.sin(p.yaw) * 9, 0, Math.cos(p.yaw) * 9));
    e.pos.set(spot.x, g.physics.groundHeight(spot.x, spot.z, 20), spot.z);
    e.yaw = p.yaw + 2.2;
    e.autopilot = () => false;    // hold still for the picture
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + 'engine_crew.png' });
  await page.evaluate(() => {
    const g = window.__game, e = window.__e;
    for (const c of [...e.crew]) if (c) g.damage(c, 999, { team: 1 }, { melee: true });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + 'engine_abandoned.png' });
  await page.evaluate(() => { const g = window.__game, p = g.player, e = window.__e; p.pos.set(e.pos.x + 3.2, e.pos.y, e.pos.z - 1); p.yaw = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + 'engine_prompt.png' });
  await page.evaluate(() => { const g = window.__game; g.input.pressed.add('KeyE'); });
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ drive: !!window.__game.player.drive, paused: window.__game.paused }));
  console.log(JSON.stringify(st));
  await page.evaluate(() => { window.__game.input.keys.add('KeyW'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__game.input.keys.delete('KeyW'); });
  await page.screenshot({ path: OUT + 'engine_drive.png' });
  await page.evaluate(() => { const g = window.__game; g.input.pressed.add('KeyE'); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.player.useAbility('q', g.input); g.player.useAbility('r', g.input); });
  await page.waitForTimeout(450);
  await page.screenshot({ path: OUT + 'hud_cast.png' });
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
