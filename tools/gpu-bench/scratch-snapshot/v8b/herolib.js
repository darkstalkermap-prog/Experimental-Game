// Helpers for the Hero Game Mode tests: start a match in the page, reload for a fresh world.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
exports.L = L;
// start a hero match the way the menu would (the page already built a world and sits on the menu)
exports.startHero = (page, o = {}) => page.evaluate((o) => {
  const g = window.__game;
  document.getElementById('menu').classList.add('hidden');
  g.ui.showHud();
  g.audio.init();
  g.start('normal', { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: o.cls || 'knight' }], hero: { win: o.win || 'kills', classes: o.classes } });
  g.paused = false;
}, o);
// a clean world for the next scenario (a game cannot be started twice on one page)
exports.fresh = async (page) => {
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
};
