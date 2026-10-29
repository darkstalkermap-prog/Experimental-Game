// A ram seen from beside and under its roof, a soldier group in shade, a tree crown from below: how dark are the shaded sides?
// usage: CW_PORT=8220 OUT=<dir> node under.js <tag> [quality]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'u', QUALITY = process.argv[3] || 'high';
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__game; g.player.buffs.add('ghost', 1e6); g.paused = false;
    for (let i = 0; i < 20 * 60 * 3; i++) { g.update(0.05); g.input.endFrame(); }
    document.getElementById('hud').style.display = 'none';
  });
  const shot = async (name, f) => {
    const ok = await page.evaluate(f);
    if (!ok) { console.log('skip', name); return; }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: OUT + `${TAG}_${name}.png` });
  };
  const pre = `
    const aim = (me, tx, ty, tz) => { const dx = tx - me.pos.x, dz = tz - me.pos.z, dy = ty - (me.pos.y + 1.7); me.yaw = Math.atan2(dx, dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
    const put = (me, g, x, z, up = 0) => { me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.pos.y = g.physics.groundHeight(x, z, 40) + up; me.alive = true; me.hp = me.maxHp; };
  `;
  await shot('ram_under', `(() => { ${pre}
    const g = window.__game, me = g.player, e = g.siege.find((s) => s.alive && s.type === 'ram');
    if (!e) return false;
    const c = Math.cos(e.yaw), s = Math.sin(e.yaw);
    put(me, g, e.pos.x + 2.6 * c, e.pos.z - 2.6 * s, 0); aim(me, e.pos.x, e.pos.y + 2.6, e.pos.z); return true; })()`);
  await shot('ram_side', `(() => { ${pre}
    const g = window.__game, me = g.player, e = g.siege.find((s) => s.alive && s.type === 'ram');
    const c = Math.cos(e.yaw), s = Math.sin(e.yaw);
    put(me, g, e.pos.x + 9 * c, e.pos.z - 9 * s, 0); aim(me, e.pos.x, e.pos.y + 1.8, e.pos.z); return true; })()`);
  await shot('shade', `(() => { ${pre}
    const g = window.__game, me = g.player, c = g.castles[0];
    put(me, g, c.center.x, c.center.z - 8, 0); aim(me, c.center.x - 10, 6, c.center.z + 14); return true; })()`);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
