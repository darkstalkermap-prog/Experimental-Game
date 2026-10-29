// Integration QA: six standard viewpoints of a running Conquest game (about round 6), as the page renders them.
// usage: CW_PORT=8220 OUT=<dir> node shots6.js <tag> <map> <quality> [width height] [minutes] [only,names]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const TAG = process.argv[2] || 'x', MAP = process.argv[3] || 'medium', QUALITY = process.argv[4] || 'high';
const W = Number(process.argv[5] || 960), H = Number(process.argv[6] || 540), MIN = Number(process.argv[7] || 3);
const ONLY = process.argv[8] ? process.argv[8].split(',') : null;
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: W, height: H }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate((minutes) => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6);
    g.paused = false;
    for (let i = 0; i < 20 * 60 * minutes; i++) { g.update(0.05); g.input.endFrame(); }
    document.getElementById('hud').style.display = 'none';
  }, MIN);
  const spot = async (name, pos, yaw, pitch, wait = 2500) => {
    if (ONLY && !ONLY.includes(name)) return;
    await page.evaluate(([p, yaw, pitch]) => {
      const g = window.__game, me = g.player;
      me.pos.set(p[0], p[1], p[2]); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch;
      me.pos.y = g.physics.groundHeight(p[0], p[2], p[1] + 30) + (p[3] || 0);
      me.alive = true; me.hp = me.maxHp;
    }, [pos, yaw, pitch]);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: OUT + `${TAG}_${name}.png` });
  };
  const c = await page.evaluate(() => { const g = window.__game, c0 = g.castles[0]; return { x: c0.center.x, z: c0.center.z, gx: c0.gateOut.x, gz: c0.gateOut.z }; });
  const len = Math.hypot(c.x, c.z), dirx = c.x / len, dirz = c.z / len;
  // yaw that looks along (x, z): lookDir = (sin yaw, , cos yaw)
  const look = (x, z) => Math.atan2(x, z);
  await spot('castle_front', [c.gx - dirx * 38, 0, c.gz - dirz * 38, 1.7], look(dirx, dirz), -0.05);
  await spot('field', [0, 0, 60 * Math.sign(c.z || 1), 1.7], look(0, -Math.sign(c.z || 1)), -0.04);
  const sol = await page.evaluate(() => { const g = window.__game; const u = g.units.find((u) => u.alive && u.team === 0 && !u.isHero); return u ? { x: u.pos.x, z: u.pos.z } : null; });
  if (sol) await spot('soldiers', [sol.x + 3.2, 0, sol.z + 1.5, 1.7], look(-3.2, -1.5), -0.1);
  await spot('landscape', [0, 0, 0, 2.5], 0.6, 0.02);
  await spot('landscape2', [-10, 0, 20, 2.5], 2.4, 0.05);
  await spot('sunward', [0, 0, 20, 1.7], look(-0.55, 0.45), 0.28);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
