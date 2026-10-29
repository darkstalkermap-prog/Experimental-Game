const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  for (const vp of [{ width: 900, height: 640 }, { width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
    const { browser, page } = await L.launch({ map: 'small', viewport: vp });
    const r = await page.evaluate(() => { const s = document.querySelector('#menu .scroll'); const b = document.getElementById('menuControls').getBoundingClientRect(); return { scrollH: s.scrollHeight, clientH: s.clientHeight, optionsBottom: Math.round(b.bottom), vh: innerHeight, cols: getComputedStyle(document.querySelector('#menu .cols')).gridTemplateColumns }; });
    console.log(JSON.stringify(vp), JSON.stringify(r));
    await browser.close();
  }
})();
