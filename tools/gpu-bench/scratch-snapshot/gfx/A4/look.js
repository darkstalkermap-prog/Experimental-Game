// A4: look at the atmosphere. usage: CW_PORT=8214 node look.js <tag> <levels comma list> <views comma list|all> [WxH] [secs of battle]
// Draws frames by hand (the page's own loop is stubbed) and saves the canvas, so the picture is exactly what the renderer made.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const fs = require('fs');
const TAG = process.argv[2] || 'a', LEVELS = (process.argv[3] || 'high').split(','), WANT = (process.argv[4] || 'all').split(',');
const [W, H] = (process.argv[5] || '960x540').split('x').map(Number), SECS = Number(process.argv[6] || 20);
const OUT = S + 'gfx/A4/out/';
(async () => {
  const { browser, page, errors } = await L.launch({ map: process.env.MAP || 'medium', quality: LEVELS[0], viewport: { width: W, height: H } });
  await L.startSingle(page);
  await page.evaluate((secs) => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6); g.paused = false;
    for (let i = 0; i < secs * 20; i++) { g.update(0.05); g.input.endFrame(); }
    document.getElementById('hud').style.display = 'none';
  }, SECS);
  const c = await page.evaluate(() => { const g = window.__game, c0 = g.castles[0]; return { x: c0.center.x, z: c0.center.z, gx: c0.gateOut.x, gz: c0.gateOut.z }; });
  const dx = c.x / Math.hypot(c.x, c.z), dz = c.z / Math.hypot(c.x, c.z);
  const sol = await page.evaluate(() => { const g = window.__game; const u = g.units.find((u) => u.alive && u.team === 0 && !u.isHero); return u ? { x: u.pos.x, z: u.pos.z } : { x: 0, z: 50 }; });
  const VIEWS = {
    soldiers: { p: [sol.x + 3.2, sol.z + 1.5, 1.7], yaw: Math.atan2(-3.2, -1.5) + Math.PI, pitch: -0.1 },
    castle_front: { p: [c.gx - dx * 38, c.gz - dz * 38, 1.7], yaw: Math.atan2(dx, dz) + Math.PI, pitch: -0.05 },
    field: { p: [0, 60 * Math.sign(c.z || 1), 1.7], yaw: Math.PI, pitch: -0.04 },
    landscape: { p: [0, 0, 2.5], yaw: 0.6, pitch: 0.02 },
    landscape2: { p: [-10, 20, 2.5], yaw: 2.4, pitch: 0.05 },
    sky_up: { p: [0, 0, 2.5], yaw: 0.6, pitch: 1.0 },
    sun: { p: [0, 0, 2.5], yaw: -0.886, pitch: 0.45 },
    away: { p: [0, 0, 2.5], yaw: 2.255, pitch: 0.12 },
  };
  const names = WANT[0] === 'all' ? Object.keys(VIEWS) : WANT;
  for (const level of LEVELS) {
    await page.evaluate((lv) => { window.__game.setQuality(lv); }, level);
    for (const name of names) {
      const v = VIEWS[name];
      const t0 = Date.now();
      const url = await page.evaluate(([v]) => {
        const g = window.__game, me = g.player;
        me.pos.set(v.p[0], 0, v.p[1]); me.vel.set(0, 0, 0); me.yaw = v.yaw; me.pitch = v.pitch;
        me.pos.y = g.physics.groundHeight(v.p[0], v.p[1], 40) + v.p[2];
        me.alive = true; me.hp = me.maxHp;
        g.update(0.016); g.input.endFrame();
        for (let i = 0; i < 2; i++) window.__gfx.renderFrame(0.016);
        return window.__game.renderer.domElement.toDataURL('image/png');
      }, [v]);
      fs.writeFileSync(OUT + `${TAG}_${level}_${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
      console.log(level, name, Date.now() - t0, 'ms');
    }
  }
  console.log('errors', JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})();
