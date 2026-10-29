// First-use hitches: times the first call of lazily built things and lists the worst simulation frames of a battle.
// usage: CW_PORT=8217 node hitches.js <map> [minutes]
const L = require('./lib.js');
const MAP = process.argv[2] || 'medium', MINUTES = Number(process.argv[3] || 4);
(async () => {
  const { browser, page, errors, loadMs } = await L.launch({ map: MAP, quality: 'high', viewport: { width: 960, height: 540 } });
  await L.startSingle(page);
  const res = await page.evaluate(async ([minutes]) => {
    const g = window.__game, R = g.renderer, ui = g.ui, P = window.__perf, out = { first: [], worst: [] };
    const T = (label, fn) => { const a = performance.now(); const p0 = R.info.programs.length; let r; try { r = fn(); } catch (e) { r = 'threw ' + e.message; } out.first.push([label, +(performance.now() - a).toFixed(1), R.info.programs.length - p0]); return r; };
    g.player.buffs.add('ghost', 1e6);
    const m = await import('./src/ai.js'); const f = g.factions[0]; f.ai = new m.LordAI(g, f); g.phaseT = 5;
    T('render #1 after start', () => R.render(g.scene, g.camera));
    T('minimap first draw', () => ui.drawMinimap());
    T('big map open (first)', () => ui.toggleMap(true));
    T('big map close', () => ui.toggleMap(false));
    T('shop open (first)', () => ui.toggleShop(true));
    T('shop close', () => ui.toggleShop(false));
    P.enable(false); P.sink = [];
    const times = [];
    for (let i = 0; i < 60 * 60 * minutes; i++) { g.update(1 / 60); g.ui.update(1 / 60); g.input.endFrame(); times.push(g.time); }
    const rows = P.sink; P.sink = null; P.disable();
    const idx = rows.map((r, i) => [r[1], i]).sort((a, b) => b[0] - a[0]).slice(0, 8);
    const names = P.names;
    for (const [busy, i] of idx) {
      const r = rows[i], parts = names.map((n, k) => (r[2 + k] >= 0.4 ? n + ' ' + r[2 + k].toFixed(1) : '')).filter(Boolean).join(' ');
      out.worst.push(`t=${times[i].toFixed(1)}s busy ${busy.toFixed(1)} ms :: ${parts}`);
    }
    const busy = rows.map((r) => r[1]).sort((a, b) => a - b);
    out.dist = { p50: +busy[Math.floor(busy.length * 0.5)].toFixed(2), p99: +busy[Math.floor(busy.length * 0.99)].toFixed(2), max: +busy[busy.length - 1].toFixed(1), frames: busy.length };
    // after the battle: the first time things open that only exist late
    T('big map draw (late)', () => ui.drawBigMap());
    T('scoreboard render', () => ui.renderScoreboard());
    return out;
  }, [MINUTES]);
  console.log('load', loadMs, 'ms');
  for (const r of res.first) console.log(String(r[1]).padStart(8), 'ms', String(r[2]).padStart(2), 'new programs ', r[0]);
  console.log('frames', JSON.stringify(res.dist));
  for (const w of res.worst) console.log(w);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
