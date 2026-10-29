// Meshes and triangles of one siege engine of each kind at every detail level. usage: CW_PORT=<port> node tris.js
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', quality: 'medium', viewport: { width: 320, height: 200 } });
  const out = await page.evaluate(async () => {
    const { buildEngine } = await import('/src/siegegeo.js');
    const { Q } = await import('/src/quality.js');
    const res = {};
    for (const d of [0, 1, 2]) {
      Q.detail = d;
      for (const type of ['ram', 'catapult']) {
        const e = buildEngine(type, 0);
        let tris = 0, meshes = 0;
        e.group.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
        res[`detail${d} ${type}`] = { meshes, tris };
      }
    }
    return res;
  });
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
