// Memory over a long simulated game with class switches, and across world rebuilds.
// usage: CW_PORT=8217 node leaks.js <map> <minutes> [rebuild-cycles]
const L = require('./lib.js');
const MAP = process.argv[2] || 'medium', MINUTES = Number(process.argv[3] || 12), CYCLES = Number(process.argv[4] || 0);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: 'high', viewport: { width: 640, height: 360 } });
  const snap = () => page.evaluate(() => {
    gc(); gc();
    const g = window.__game, R = g.renderer;
    let meshes = 0, objs = 0; g.scene.traverse((o) => { objs++; if (o.isMesh) meshes++; });
    return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: R.info.memory.geometries, tex: R.info.memory.textures, prog: R.info.programs.length, objs, meshes, dom: document.getElementsByTagName('*').length,
      units: g.units.length, siege: g.siege.length, proj: g.projectiles.list.length, t: Math.round(g.time) };
  });
  if (MINUTES > 0) {
    await page.evaluate(() => { window.__det = null; });
    await L.startSingle(page);
    await page.evaluate(async () => {
      const g = window.__game; g.player.buffs.add('ghost', 1e6);
      const m = await import('./src/ai.js'); const f = g.factions[0]; f.ai = new m.LordAI(g, f); g.phaseT = 5;
    });
    console.log('start', JSON.stringify(await snap()));
    const classes = ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier'];
    for (let m = 1; m <= MINUTES; m++) {
      await page.evaluate(([m, cls]) => {
        const g = window.__game;
        if (g.localSwitchClass) g.localSwitchClass(cls[m % cls.length]);
        for (let i = 0; i < 20 * 60; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
      }, [m, classes]);
      if (m % 2 === 0 || m === MINUTES) console.log('min', m, JSON.stringify(await snap()));
    }
  }
  if (CYCLES > 0) {
    // world rebuilds the way main.js does them: new Game, then dispose of the old one
    const out = await page.evaluate(async ([cycles]) => {
      const cfg = await import('./src/config.js');
      const { Game } = await import('./src/game.js');
      const res = [];
      let g = window.__game;
      const sizes = ['large', 'small', 'medium', 'large', 'small', 'medium'];
      for (let i = 0; i < cycles; i++) {
        const size = sizes[i % sizes.length];
        const R = g.renderer, ui = g.ui, audio = g.audio, input = g.input;
        const t0 = performance.now();
        g.dispose();
        cfg.setMapSize(size); cfg.setPracticeWorld(false);
        g = new Game(R, ui, audio, input, { practice: false });
        g.state = 'menu'; window.__game = g; ui.mapBg = ui.bigBg = null;
        g.setQuality('high');
        for (let k = 0; k < 5; k++) { g.update(0.05); R.render(g.scene, g.camera); }
        const ms = Math.round(performance.now() - t0);
        gc(); gc();
        res.push({ i, size, ms, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: R.info.memory.geometries, tex: R.info.memory.textures, prog: R.info.programs.length });
      }
      return res;
    }, [CYCLES]);
    for (const r of out) console.log('rebuild', JSON.stringify(r));
  }
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
