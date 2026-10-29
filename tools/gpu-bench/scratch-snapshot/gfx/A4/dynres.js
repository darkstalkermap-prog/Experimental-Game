// A4: the adaptive resolution governor on a virtual GPU (a frame costs `base` ms at full size and scales with the pixel count).
// usage: CW_PORT=8214 node dynres.js <base ms at full resolution>   (prints the scale changes over two virtual minutes)
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: 'high', viewport: { width: 320, height: 200 } });
  const out = await page.evaluate((base) => {
    const gfx = window.__gfx;
    gfx.automation = false;
    gfx.resize(true);
    const log = [];
    let t = 100000, last = gfx.scale;
    gfx.lastAt = t; gfx.lastChange = t;
    const t0 = t;
    // the load changes half way (a big battle: the frame costs half as much again) and then a stall
    for (let i = 0; i < 20000 && t - t0 < 180000; i++) {
      const load = (t - t0) > 90000 ? base * 1.5 : base;
      const ft = Math.max(16.7, load * gfx.scale * gfx.scale);
      t += ft;
      gfx.govern(t, 3);
      if (gfx.pending && gfx.pending !== gfx.scale) { gfx.scale = gfx.pending; }
      gfx.pending = 0;
      if (gfx.scale !== last) { log.push([Math.round((t - t0) / 1000), gfx.scale]); last = gfx.scale; }
    }
    // pumping: how many changes in the last minute
    return { log, final: gfx.scale, changes: log.length, min: Q_dynMin() };
    function Q_dynMin() { return window.__game && 0; }
  }, Number(process.argv[2] || 30));
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
