// A volley close up: arrows coming down on a pack 14 m away.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1000, height: 600 }, raf: true });
  await L.startSingle(page);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    window.__game.input.endFrame();
    const home = new V3(-48, 0, -64);
    p.setClass('ranger'); p.alive = true; p.abilCd = { q: 0, r: 0 };
    p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z);
    p.yaw = 0; p.pitch = -0.17;
    for (const [dx, dz, t] of [[0, 13, 'swordsman'], [1.5, 14, 'swordsman'], [-1.5, 12, 'spearman'], [2, 11.5, 'swordsman'], [-2.5, 14.5, 'archer'], [0.5, 16, 'swordsman']]) {
      const u = g.recruit(g.factions[1], t);
      u.pos.set(home.x + dx, g.physics.groundHeight(home.x + dx, home.z + dz, 20), home.z + dz);
      u.homeCastle = g.castles[0]; u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 }; u.attackTimer = 99;
      u.hp = u.maxHp = 400;
    }
    g.input.keys.add('KeyQ'); g.input.pressed.add('KeyQ');
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const i = window.__game.input; i.keys.delete('KeyQ'); i.up.add('KeyQ'); });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(110);
    await page.screenshot({ path: S + `v4/cd_rain_${i}.png`, timeout: 60000 });
  }
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
