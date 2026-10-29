// G1: list every shader program the renderer holds (fixed scene views, or a late-battle frame), with the materials that use it.
// usage: CW_PORT=<port> OUTDIR=<dir> TAG=<tag> node programs.js <runs: comma list of high|medium|low|ultra|battle> [map=small]
// 'battle' = High quality after 60 s of simulated battle. Writes <OUTDIR>/progs_<TAG>_<run>.json and prints a line per program.
const fs = require('fs');
const { chromium } = require('playwright');
const RUNS = (process.argv[2] || 'high').split(','), MAP = process.argv[3] || 'small';
const OUTDIR = process.env.OUTDIR || '.', TAG = process.env.TAG || 'x';
async function one(browser, run) {
  const QUALITY = run === 'battle' ? 'high' : run, BATTLE = run === 'battle' ? 60 : 0;
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript(() => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = 1; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const out = await page.evaluate(async (battle) => {
    const g0 = window.__game, R = g0.renderer;
    if (g0.audio) { g0.audio.init = g0.audio.startMusic = g0.audio.play = () => {}; }
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    if (battle) {
      const { LordAI } = await import('/src/ai.js');
      const own = g.factions[g.player.team]; own.ai = new LordAI(g, own); g.phaseT = 5;
      for (let i = 0; i < battle / 0.05; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    } else { g.phaseT = 1e6; for (let i = 0; i < 120; i++) { g.update(0.05); g.input.endFrame(); } }
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    const dx = c0.center.x / (Math.hypot(c0.center.x, c0.center.z) || 1), dz = c0.center.z / (Math.hypot(c0.center.x, c0.center.z) || 1);
    const views = [[c0.gateOut.x - dx * 38, c0.gateOut.z - dz * 38, Math.atan2(dx, dz), -0.05, 1.7], [0, 60 * sz, sz > 0 ? Math.PI : 0, -0.04, 1.7], [-10, 20, 2.4, 0.05, 2.5]];
    const draw = () => window.__gfx.renderFrame(0);
    for (const [x, z, yaw, pitch, h] of views) {
      me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch; me.pos.y = g.physics.groundHeight(x, z, 30) + h - 1.7; me.alive = true; me.hp = me.maxHp;
      for (let i = 0; i < 3; i++) { g.update(1e-4); g.input.endFrame(); }
      draw(); draw();
    }
    const progs = R.info.programs.map((p) => ({ id: p.id, name: p.name, used: p.usedTimes, key: p.cacheKey, mats: [] }));
    const byId = new Map(progs.map((p) => [p.id, p]));
    const seen = new Set();
    const describe = (m, o) => ({
      cls: m.constructor.name, name: m.name || '', hooks: m.userData && m.userData.shaderHooks ? [...m.userData.shaderHooks.keys()].join('+') : '',
      map: !!m.map, nmap: !!m.normalMap, vcol: !!m.vertexColors, rough: m.roughness, metal: m.metalness, side: m.side, transp: !!m.transparent, aTest: m.alphaTest || 0,
      fog: m.fog, flat: !!m.flatShading, envI: m.envMapIntensity, depthW: m.depthWrite, obj: o.constructor.name + (o.isInstancedMesh ? '*' + o.count : ''), recv: !!o.receiveShadow, cast: !!o.castShadow,
      vis: o.visible,
    });
    g.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        const pr = R.properties.get(m), cp = pr && pr.currentProgram;
        if (!cp) continue;
        const key = cp.id + '|' + m.uuid;
        if (seen.has(key)) continue; seen.add(key);
        const p = byId.get(cp.id); if (p) p.mats.push(describe(m, o));
      }
    });
    return progs;
  }, BATTLE);
  fs.writeFileSync(`${OUTDIR}/progs_${TAG}_${run}.json`, JSON.stringify(out, null, 1));
  console.log(run, 'programs:', out.length, 'errors:', errors.length, errors.slice(0, 2).join(' | '));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const run of RUNS) await one(browser, run);
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
