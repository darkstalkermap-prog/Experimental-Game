// How often can a page lock and unlock the pointer before Chromium says "Too many pointer lock requests"?
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  for (const gap of [1500, 1000, 600, 300, 100]) {
    const res = await page.evaluate(async (gap) => {
      const cv = document.querySelector('#app canvas');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = { gap, ok: 0, fail: 0, reasons: [] };
      document.exitPointerLock(); await sleep(150);
      for (let i = 0; i < 12; i++) {
        try { await cv.requestPointerLock(); out.ok++; } catch (e) { out.fail++; if (out.reasons.length < 2) out.reasons.push(e.message.slice(0, 60)); }
        await sleep(gap / 2);
        document.exitPointerLock();
        await sleep(gap / 2);
      }
      return out;
    }, gap);
    console.log(JSON.stringify(res));
    await page.waitForTimeout(6000);   // let any window empty
  }
  await browser.close();
})();
