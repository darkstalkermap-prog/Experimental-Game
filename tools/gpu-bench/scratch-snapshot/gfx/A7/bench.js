// Runs window.__bench from the main menu.  usage: CW_PORT=8217 node bench.js <tag> <map> [seconds=10] [ffMinutes=6] [quality=high] [render=1]
const fs = require('fs');
const L = require('./lib.js');
const TAG = process.argv[2] || 'run', MAP = process.argv[3] || 'medium', SECONDS = Number(process.argv[4] || 10), FF = Number(process.argv[5] || 6), QUALITY = process.argv[6] || 'high', RENDER = process.argv[7] !== '0';
(async () => {
  const { browser, page, errors, loadMs } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 960, height: 540 } });
  const res = await page.evaluate(([seconds, ff, render]) => window.__bench({ seconds, ffMinutes: ff, render }), [SECONDS, FF, RENDER]);
  res.loadMs = loadMs; res.errors = errors.slice(0, 3);
  fs.mkdirSync(L.S + 'gfx/A7/results', { recursive: true });
  fs.writeFileSync(L.S + `gfx/A7/results/${TAG}_${MAP}.json`, JSON.stringify(res, null, 1));
  const f = (v) => v.toFixed(2).padStart(7);
  console.log(`${TAG} ${MAP}: hash ${res.hash}  round ${res.round}  alive ${res.alive}/${res.before.alive}  siege ${res.siege}  ff ${res.ffMs} ms  load ${loadMs} ms`);
  console.log('          mean     p50     p95     max');
  console.log('frame busy', f(res.busy.mean), f(res.busy.p50), f(res.busy.p95), f(res.busy.max), '  wall/frame', res.wallMsPerFrame);
  for (const [k, v] of Object.entries(res.parts)) console.log(k.padEnd(10), f(v.mean), f(v.p50), f(v.p95), f(v.max));
  console.log('info', JSON.stringify(res.info), 'heap', JSON.stringify(res.heap));
  console.log('trace', res.trace.join(' '));
  console.log('errors', JSON.stringify(res.errors));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
