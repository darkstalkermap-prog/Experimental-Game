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
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const g = window.__game, foe = g.units.find((u) => u.team === 2 && u.alive), f1 = g.factions[1];
    g.castles[1].keep.takeDamage(1e9, foe); f1.player.buffs.clear(); g.damage(f1.player, 1e6, foe, { melee: true });
    g.factions[0].gold = 700;
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: S + 'v10/hud.png' });
  await page.evaluate(() => { window.__game.ui.toggleShop(); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: S + 'v10/shop.png' });
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
