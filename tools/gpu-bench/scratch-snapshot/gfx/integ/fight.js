// A big fight: the densest knot of enemies in the open after a few minutes of battle, from 6 to 25 m. usage: CW_PORT=8220 OUT=<dir> node fight.js <tag> <map> <quality> [minutes]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'f', MAP = process.argv[3] || 'medium', QUALITY = process.argv[4] || 'high', MIN = Number(process.argv[5] || 8);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  const info = await page.evaluate((minutes) => {
    const g = window.__game; g.paused = false; g.player.buffs.add('ghost', 1e6);
    document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden');
    // let the AI lords play the player's house too, so there is a war on every side
    const f = g.factions[0];
    for (let i = 0; i < 20 * 60 * minutes; i++) { g.update(0.05); g.input.endFrame(); }
    return { round: g.round, alive: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length };
  }, MIN);
  console.log(JSON.stringify(info));
  const spots = await page.evaluate(() => {
    const g = window.__game, us = g.units.filter((u) => u.alive && !u.isCrew && u.lod < 3);
    const far = (u) => g.castles.every((c) => Math.hypot(u.pos.x - c.center.x, u.pos.z - c.center.z) > 34);
    const score = (u) => { let n = 0, e = 0; for (const v of us) { const d2 = (u.pos.x - v.pos.x) ** 2 + (u.pos.z - v.pos.z) ** 2; if (d2 < 144) { n++; if (v.team !== u.team) e++; } } return Math.min(n, 2 * e); };
    let best = null, bs = 0;
    for (const u of us) { if (!far(u)) continue; const s = score(u); if (s > bs) { bs = s; best = u; } }
    return best ? { x: best.pos.x, z: best.pos.z, score: bs } : null;
  });
  console.log('spot', JSON.stringify(spots));
  if (!spots) { await browser.close(); return; }
  const view = async (name, dist, up, ang, pitch = null) => {
    await page.evaluate(([s, dist, up, ang, pitch]) => {
      const g = window.__game, me = g.player;
      me.pos.set(s.x + Math.sin(ang) * dist, 0, s.z + Math.cos(ang) * dist); me.vel.set(0, 0, 0);
      me.pos.y = g.physics.groundHeight(me.pos.x, me.pos.z, 40) + up;
      const dx = s.x - me.pos.x, dz = s.z - me.pos.z; me.yaw = Math.atan2(dx, dz); me.pitch = pitch === null ? -Math.atan2(up + 0.2, dist) * 0.9 : pitch;
    }, [spots, dist, up, ang, pitch]);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: OUT + `${TAG}_${name}.png` });
  };
  await view('fight_near', 7, 1.0, 0.6);
  await view('fight_mid', 16, 2.2, 2.4);
  await view('fight_far', 30, 4.0, 4.2);
  await view('fight_sun', 11, 1.4, 2.26, 0.12);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
