const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ viewport: { width: 1280, height: 720 }, raf: true, map: 'small' });
  await page.evaluate(() => {
    const g = window.__game;
    document.getElementById('menu').classList.add('hidden'); g.ui.showHud(); g.audio.init();
    g.net = { on() {}, lock() {}, toClient() {}, toAll() {}, toHost() {}, snapEvery: 1e9, role: 'host' };
    g.start('normal', { mode: 'host', localTeam: 0, players: [{ team: 0, name: 'Arthur', cls: 'knight' }, { team: 1, name: 'Gwen', cls: 'mage' }], coop: true, objective: 'conquest' });
    g.paused = false;
  });
  await page.waitForTimeout(2000);
  // the local hero's house falls and the hero dies; the ally pays and the hero rises in the ruined courtyard
  await page.evaluate(() => {
    const g = window.__game, foe = g.units.find((u) => u.team === 2 && u.alive);
    g.castles[0].keep.takeDamage(1e9, foe); g.player.buffs.clear(); g.damage(g.player, 1e6, foe, { melee: true });
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: S + 'v10/fallen.png' });
  await page.evaluate(() => { const g = window.__game; g.factions[1].gold = 900; g.buyFor(1, 'summon_0'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__game.player.yaw += 0; });
  await page.screenshot({ path: S + 'v10/risen.png' });
  console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game, k = g.castles[0].spawnPoint; return { alive: g.player.alive, d: Math.hypot(g.player.pos.x - k.x, g.player.pos.z - k.z), fallen: g.castles[0].fallen }; })), 'errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
