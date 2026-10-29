// Frames for before/after comparisons: the same viewpoints on any server, drawn by hand through gfx.renderFrame and saved from the canvas.
// usage: CW_PORT=<port> node shots.js <tag> <quality> [views comma list|all] [WxH=960x540] [secs of battle=6] [mode=single|practice]
// views: castle field land land2 sun away soldiers sky     (practice: one view from where the player starts)
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { chromium } = require('playwright');
const fs = require('fs');
const TAG = process.argv[2] || 's', QUALITY = process.argv[3] || 'high';
const WANT = (process.argv[4] || 'all').split(',');
const [W, H] = (process.argv[5] || '960x540').split('x').map(Number);
const SECS = Number(process.argv[6] || 6), MODE = process.argv[7] || 'single';
const OUT = (process.env.OUT || S + 'gfx/gpu/out/').replace(/\/?$/, '/');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = 12345;   // a seeded Math.random: the same world and the same particles every run
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, [process.env.MAP || 'medium', QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  if (MODE === 'practice') await page.click('#practiceBtn'); else await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate((secs) => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6); g.paused = false;
    for (let i = 0; i < secs * 20; i++) { g.update(0.05); g.input.endFrame(); }
    document.getElementById('hud').style.display = 'none';
  }, SECS);
  const save = async (name, url) => { fs.writeFileSync(OUT + `${TAG}_${QUALITY}_${name}.png`, Buffer.from(url.split(',')[1], 'base64')); };
  if (MODE === 'practice') {
    const url = await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__gfx.renderFrame(0.016); return window.__game.renderer.domElement.toDataURL('image/png'); });
    await save('court', url);
  } else {
    const c = await page.evaluate(() => { const g = window.__game, c0 = g.castles[0]; return { x: c0.center.x, z: c0.center.z, gx: c0.gateOut.x, gz: c0.gateOut.z }; });
    const dx = c.x / Math.hypot(c.x, c.z), dz = c.z / Math.hypot(c.x, c.z);
    const sol = await page.evaluate(() => { const g = window.__game; const u = g.units.find((u) => u.alive && u.team === 0 && !u.isHero); return u ? { x: u.pos.x, z: u.pos.z } : { x: 0, z: 50 }; });
    const VIEWS = {
      soldiers: { p: [sol.x + 3.2, sol.z + 1.5, 1.7], yaw: Math.atan2(-3.2, -1.5) + Math.PI, pitch: -0.1 },
      castle: { p: [c.gx - dx * 38, c.gz - dz * 38, 1.7], yaw: Math.atan2(dx, dz) + Math.PI, pitch: -0.05 },
      field: { p: [0, 60 * Math.sign(c.z || 1), 1.7], yaw: Math.PI, pitch: -0.04 },
      land: { p: [0, 0, 2.5], yaw: 0.6, pitch: 0.02 },
      land2: { p: [-10, 20, 2.5], yaw: 2.4, pitch: 0.05 },
      sky: { p: [0, 0, 2.5], yaw: 0.6, pitch: 1.0 },
      sun: { p: [0, 0, 2.5], yaw: -0.886, pitch: 0.45 },
      away: { p: [0, 0, 2.5], yaw: 2.255, pitch: 0.12 },
    };
    const names = WANT[0] === 'all' ? ['castle', 'field', 'land', 'land2', 'sun', 'away', 'soldiers'] : WANT;
    for (const name of names) {
      const v = VIEWS[name];
      const url = await page.evaluate(([v, SETTLE]) => {
        const g = window.__game, me = g.player;
        me.pos.set(v.p[0], 0, v.p[1]); me.vel.set(0, 0, 0); me.yaw = v.yaw; me.pitch = v.pitch;
        me.pos.y = g.physics.groundHeight(v.p[0], v.p[1], 40) + v.p[2];
        me.alive = true; me.hp = me.maxHp;
        for (let i = 0; i < SETTLE; i++) { g.update(0.05); g.input.endFrame(); }   // (the grass patch is rebuilt a little each update: let it finish)
        for (let i = 0; i < 3; i++) window.__gfx.renderFrame(0.016);
        return window.__game.renderer.domElement.toDataURL('image/png');
      }, [v, Number(process.env.SETTLE === undefined ? 60 : process.env.SETTLE)]);
      await save(name, url);
      console.log('saved', name);
    }
  }
  console.log('errors', JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})();
