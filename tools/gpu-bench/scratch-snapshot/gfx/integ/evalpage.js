// usage: CW_PORT=8220 node evalpage.js <file.js> [map] [quality] [start]   -- runs the body of <file.js> (an async function body) in the page
// at the main menu (or, with `start`, in a started single-player game) and prints what it returns as JSON.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const fs = require('fs');
(async () => {
  const body = fs.readFileSync(process.argv[2], 'utf8');
  const { browser, page, errors } = await L.launch({ map: process.argv[3] || 'small', quality: process.argv[4] || 'high', viewport: { width: 640, height: 360 } });
  if (process.argv[5]) await L.startSingle(page);
  const out = await page.evaluate(`(async () => { ${body} })()`);
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
