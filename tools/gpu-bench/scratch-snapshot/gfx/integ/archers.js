// The tower archers (level 3 towers) from a few metres, and the castle's upgrade dressing. usage: CW_PORT=8220 OUT=<dir> node archers.js <tag> <quality>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'a', QUALITY = process.argv[3] || 'high';
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__game; g.paused = false; g.player.buffs.add('ghost', 1e6);
    document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden');
    g.factions[0].gold = 99999;
    for (let i = 0; i < 3; i++) { g.buyForPlayer('towers'); g.buyForPlayer('fortify_walls'); g.buyForPlayer('reinforce_gate'); g.buyForPlayer('barracks'); g.buyForPlayer('levies'); }
    for (let i = 0; i < 40; i++) { g.update(0.05); g.input.endFrame(); }
  });
  const shot = async (name, f) => { await page.evaluate(f); await page.waitForTimeout(3200); await page.screenshot({ path: OUT + `${TAG}_${name}.png` }); };
  const pre = `const g = window.__game, me = g.player, c = g.castles[0];
    const put = (x, y, z) => { me.pos.set(x, y, z); me.vel.set(0, 0, 0); };
    const aim = (tx, ty, tz) => { const dx = tx - me.pos.x, dz = tz - me.pos.z, dy = ty - (me.pos.y + 1.7); me.yaw = Math.atan2(dx, dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
    const a = c.upg.archers[0]; const w = new g.camera.position.constructor(); a.getWorldPosition(w);`;
  await shot('archer1', `(() => { ${pre} put(w.x + 3.5, w.y - 0.2, w.z + 3.5); aim(w.x, w.y + 1.1, w.z); })()`);
  await shot('archer2', `(() => { ${pre} const o = c.center; put(o.x + 30, w.y + 6, o.z + 30); aim(w.x, w.y + 1, w.z); })()`);
  await shot('courtyard', `(() => { ${pre} const o = c.center; put(o.x - 9, o.y + 1.5, o.z - 8); aim(o.x + 3, o.y + 6, o.z + 14); })()`);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
