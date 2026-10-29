const L = require('./lib.js');
(async () => {
  const { browser, page, errors, loadMs } = await L.launch({ map: process.argv[2] || 'medium', quality: process.argv[3] || 'high', viewport: { width: 960, height: 540 } });
  const r = await page.evaluate(async () => {
    const out = [];
    const g0 = window.__game, R = g0.renderer;
    const prog = () => R.info.programs.length;
    const t = (label, fn) => { const a = performance.now(); fn(); out.push([label, +(performance.now() - a).toFixed(0), prog()]); };
    t('menu render #1', () => R.render(g0.scene, g0.camera));
    document.getElementById('play').click();
    const g = window.__game;
    t('after start: render #1', () => R.render(g.scene, g.camera));
    t('render #2', () => R.render(g.scene, g.camera));
    for (let i = 0; i < 20 * 120; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    t('after 2 min: render #1', () => R.render(g.scene, g.camera));
    t('render #2', () => R.render(g.scene, g.camera));
    for (let i = 0; i < 20 * 240; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    t('after 6 min: render #1', () => R.render(g.scene, g.camera));
    t('render #2', () => R.render(g.scene, g.camera));
    return out;
  });
  console.log('load', loadMs, 'ms');
  for (const r2 of r) console.log(r2.join('  '));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
