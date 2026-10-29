const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const out = await page.evaluate(() => {
    const g = window.__game, ph = g.physics;
    const found = [];
    for (let x = -120; x <= 120; x += 8) for (let z = -120; z <= 100; z += 8) {
      let ok = true;
      for (let d = 0; d <= 60 && ok; d += 1) {
        const px = x, pz = z + d;
        const gh = ph.terrainHeight(px, pz);
        for (const h of [0.5, 1.0, 1.7, 2.4]) if (ph.pointHit(px, gh + h, pz, 0) || ph.pointHit(px + 1.5, gh + h, pz, 0) || ph.pointHit(px - 1.5, gh + h, pz, 0)) ok = false;
        if (Math.abs(gh - ph.terrainHeight(px, z)) > 1.2) ok = false;
      }
      if (ok) found.push([x, z, Math.round(ph.terrainHeight(x, z))]);
    }
    return found.slice(0, 40);
  });
  console.log(JSON.stringify(out));
  await browser.close();
})();
