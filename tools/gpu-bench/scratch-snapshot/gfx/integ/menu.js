// The main menu with the world flying by behind it. usage: CW_PORT=8220 OUT=<dir> node menu.js <tag> <quality> [w h]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'menu', QUALITY = process.argv[3] || 'high', W = Number(process.argv[4] || 1280), H = Number(process.argv[5] || 720);
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: QUALITY, viewport: { width: W, height: H }, raf: true });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: OUT + `${TAG}_menu.png` });
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
