// A set of viewpoints on a running Conquest game (round ~6): the look of the world, the castle and the soldiers, as the page renders it.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');   // (usage: CW_PORT=<port> OUT=<dir> node shots.js <tag> <map> <quality>)
const TAG = process.argv[2] || 'base', MAP = process.argv[3] || 'medium', QUALITY = process.argv[4] || 'high';
const OUT = (process.env.OUT || S + 'gfx/out/').replace(/\/?$/, '/');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6);
    g.paused = false;
    // three minutes of battle so there are armies in the field
    for (let i = 0; i < 20 * 190; i++) { g.update(0.05); g.input.endFrame(); }
    document.getElementById('hud').style.display = 'none';
  });
  const spot = async (name, pos, yaw, pitch, wait = 1800) => {
    await page.evaluate(([p, yaw, pitch]) => {
      const g = window.__game, me = g.player;
      me.pos.set(p[0], p[1], p[2]); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch;
      me.pos.y = g.physics.groundHeight(p[0], p[2], p[1] + 30) + (p[3] || 0);
      me.alive = true; me.hp = me.maxHp;
    }, [pos, yaw, pitch]);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: OUT + `${TAG}_${name}.png` });
  };
  const c = await page.evaluate(() => { const g = window.__game, c0 = g.castles[0]; return { x: c0.center.x, z: c0.center.z, rot: c0.rot, gx: c0.gateOut.x, gz: c0.gateOut.z, half: window.__game.castles.length }; });
  console.log(JSON.stringify(c));
  // the player's own castle sits at +z? find the direction from the centre of the map to it
  const dirx = c.x / Math.hypot(c.x, c.z), dirz = c.z / Math.hypot(c.x, c.z);
  // (1) from the road in front of the castle, looking at it
  await spot('castle_front', [c.gx - dirx * 38, 0, c.gz - dirz * 38, 1.7], Math.atan2(dirx, dirz) + Math.PI, -0.05);
  // (2) the field in the middle of the map
  await spot('field', [0, 0, 60 * Math.sign(c.z || 1), 1.7], Math.PI, -0.04);
  // (3) soldiers close up: stand next to the first soldier of the player's army
  const sol = await page.evaluate(() => { const g = window.__game; const u = g.units.find((u) => u.alive && u.team === 0 && !u.isHero); return u ? { x: u.pos.x, z: u.pos.z } : null; });
  if (sol) await spot('soldiers', [sol.x + 3.2, 0, sol.z + 1.5, 1.7], Math.atan2(-3.2, -1.5), -0.1);
  // (4) a wide shot over the landscape from high ground (the top of the hill in the middle)
  await spot('landscape', [0, 0, 0, 2.5], 0.6, 0.02);
  await spot('landscape2', [-10, 0, 20, 2.5], 2.4, 0.05);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
