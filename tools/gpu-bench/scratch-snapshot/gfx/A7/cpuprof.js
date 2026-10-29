// CPU + allocation profile of a seeded late-game battle.  usage: CW_PORT=8217 node cpuprof.js <map> <frames> <render 0|1> [heap 0|1]
const L = require('./lib.js');
const MAP = process.argv[2] || 'medium', FRAMES = Number(process.argv[3] || 600), RENDER = process.argv[4] === '1', HEAP = process.argv[5] === '1';
(async () => {
  const { browser, ctx, page, errors, loadMs } = await L.launch({ map: MAP, quality: 'high', viewport: { width: 960, height: 540 } });
  await page.evaluate(L.detSource);
  const setup = await page.evaluate(async () => {
    window.__det.seed(12345);
    { const a = window.__game.audio; a.init = a.startMusic = a.play = () => {}; }
    document.getElementById('play').click();
    { const gg = window.__game; while (gg.warmQueue && gg.warmQueue.length) gg.warmQueue.shift(); }
    const g = window.__game;
    g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    const m = await import('./src/ai.js');
    const f = g.factions[0]; f.ai = new m.LordAI(g, f); g.phaseT = 5;
    const t0 = performance.now();
    for (let i = 0; i < 20 * 360; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    return { ffMs: Math.round(performance.now() - t0), round: g.round, units: g.units.filter((u) => u.alive).length, dead: g.units.length, siege: g.siege.filter((s) => s.alive).length };
  });
  console.log('setup', JSON.stringify(setup), 'loadMs', loadMs);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  if (HEAP) { await cdp.send('HeapProfiler.enable'); }
  await page.evaluate(() => gc());
  if (HEAP) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send('Profiler.start');
  const res = await page.evaluate(([frames, render]) => {
    const g = window.__game, R = g.renderer;
    const m0 = performance.memory.usedJSHeapSize;
    const t = { upd: [], hud: [], rnd: [] };
    for (let i = 0; i < frames; i++) {
      const a = performance.now();
      g.update(1 / 60);
      const b = performance.now();
      g.ui.update(1 / 60);
      const c = performance.now();
      g.input.endFrame();
      if (render) R.render(g.scene, g.camera);
      const d = performance.now();
      t.upd.push(b - a); t.hud.push(c - b); t.rnd.push(d - c);
    }
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3); };
    return { upd: [q(t.upd, 0.5), q(t.upd, 0.95), q(t.upd, 1)], hud: [q(t.hud, 0.5), q(t.hud, 0.95), q(t.hud, 1)], rnd: [q(t.rnd, 0.5), q(t.rnd, 0.95), q(t.rnd, 1)], heapDeltaKB: Math.round((performance.memory.usedJSHeapSize - m0) / 1024) };
  }, [FRAMES, RENDER]);
  const { profile } = await cdp.send('Profiler.stop');
  console.log('window (median, p95, max ms):', JSON.stringify(res));
  const cpu = L.summariseCpu(profile, 45);
  console.log('CPU self time, total', cpu.totalMs, 'ms');
  for (const r of cpu.rows) console.log(String(r.ms).padStart(8), String(r.pct).padStart(5) + '%', r.fn);
  if (HEAP) {
    const { profile: hp } = await cdp.send('HeapProfiler.stopSampling');
    const h = L.summariseHeap(hp, 40);
    console.log('allocations (sampled), total', h.totalKB, 'KB over', FRAMES, 'frames =', Math.round(h.totalKB / FRAMES), 'KB/frame');
    for (const r of h.rows) console.log(String(r.kb).padStart(8) + ' KB', String(r.pct).padStart(5) + '%', r.fn);
  }
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
