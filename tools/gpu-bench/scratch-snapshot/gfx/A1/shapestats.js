// Triangle counts of every character shape at each detail level (built in the page).
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  const rows = await page.evaluate(async () => {
    const { SHAPES, shapeGeo } = await import('/src/shapes.js');
    const out = [];
    for (const [name, s] of SHAPES) {
      const t0 = performance.now();
      const r = [0, 1, 2, 3].map((l) => shapeGeo(s, l).userData.tris);
      out.push([name, ...r, +(performance.now() - t0).toFixed(1)]);
    }
    return out;
  });
  let tot = [0, 0, 0, 0];
  for (const r of rows) { console.log(r[0].padEnd(20), r.slice(1, 5).map((x) => String(x).padStart(6)).join(''), String(r[5]).padStart(8) + ' ms'); for (let i = 0; i < 4; i++) tot[i] += r[i + 1]; }
  console.log('total'.padEnd(20), tot.map((x) => String(x).padStart(6)).join(''));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
