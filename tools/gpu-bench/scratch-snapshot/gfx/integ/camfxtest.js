// camfx.js: a nearby blast shakes the view, a blow kicks it away from the enemy, a charge widens the view, low health drains the colour,
// death fades to black and the respawn opens again, a level up flashes; and everything comes back to rest.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', quality: 'high' });
  await L.startSingle(page);
  const run = (secs) => page.evaluate((secs) => { const g = window.__game; g.paused = false; for (let i = 0; i < Math.round(secs / 0.02); i++) { g.update(0.02); g.input.endFrame(); } }, secs);
  await page.evaluate(() => { const g = window.__game; g.player.buffs.add('ghost', 1e6); g.player.shake = 0; });
  await run(1);
  const r0 = await page.evaluate(() => { const g = window.__game, c = g.camera, p = g.player; return { has: !!g.camfx, dx: c.rotation.x - p.pitch, dz: c.rotation.z, zoom: c.zoom, post: !!(window.__gfx.post && window.__gfx.post.cam) }; });
  check('the game has camera effects and the camera sits still at rest', r0.has && Math.abs(r0.dx) < 1e-6 && Math.abs(r0.dz) < 1e-6 && r0.zoom === 1, r0);
  // ---- a blast next to the hero and one far away
  const far = await page.evaluate(() => { const g = window.__game, p = g.player; g.camfx.boom({ x: p.pos.x + 200, y: 0, z: p.pos.z }, 1); return g.camfx.trauma; });
  check('a blast 200 m away does nothing', far === 0, far);
  const near = await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.camera; g.camfx.boom({ x: p.pos.x + 5, y: p.pos.y, z: p.pos.z }, 0.8);
    const trauma0 = g.camfx.trauma;
    let maxd = 0;
    for (let i = 0; i < 25; i++) { g.update(0.02); g.input.endFrame(); maxd = Math.max(maxd, Math.abs(c.rotation.x - p.pitch) + Math.abs(c.rotation.z)); }
    return { trauma0: +trauma0.toFixed(2), maxd: +maxd.toFixed(4) };
  });
  check('a blast 5 m away shakes the view (a fraction of a degree to a couple of degrees)', near.trauma0 > 0.4 && near.maxd > 0.002 && near.maxd < 0.08, near);
  await run(2.5);
  const rest = await page.evaluate(() => { const g = window.__game, c = g.camera, p = g.player; return { trauma: g.camfx.trauma, dx: Math.abs(c.rotation.x - p.pitch), dz: Math.abs(c.rotation.z), yaw: g.camfx.yaw.x, pitch: g.camfx.pitch.x }; });
  check('and settles to rest', rest.trauma < 0.01 && rest.dx < 1e-3 && rest.dz < 1e-3, rest);
  // ---- a blow from an enemy to the hero's left or right kicks the view away from it
  const kicks = await page.evaluate(() => {
    const g = window.__game, p = g.player, out = [];
    p.buffs.del('ghost');
    for (const side of [-1, 1]) {
      const foe = g.units.find((u) => u.alive && u.team !== p.team);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      // an enemy 3 m away to one side (-fz, fx) is the hero's right
      foe.pos.set(p.pos.x + (-fz) * 3 * side, p.pos.y, p.pos.z + fx * 3 * side);
      g.camfx.yaw.x = 0; g.camfx.yaw.v = 0; g.camfx.roll.x = 0; g.camfx.roll.v = 0;
      p.hp = p.maxHp; p.takeDamage(30, foe, { melee: true });
      let maxYaw = 0, sign = 0;
      for (let i = 0; i < 12; i++) { g.update(0.02); g.input.endFrame(); if (Math.abs(g.camfx.yaw.x) > Math.abs(maxYaw)) maxYaw = g.camfx.yaw.x; }
      out.push({ side, maxYaw: +maxYaw.toFixed(2), enemyOn: side > 0 ? 'right' : 'left' });
      for (let i = 0; i < 100; i++) { g.update(0.02); g.input.endFrame(); }
    }
    return out;
  });
  check('a blow from the right turns the view left and the other way round (away from the enemy)', kicks[0].maxYaw * kicks[1].maxYaw < 0 && Math.abs(kicks[0].maxYaw) > 0.3, kicks);
  // ---- a charge widens the view for a moment
  const ch = await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.camera;
    p.buffs.add('charging', 1.2);
    let minZoom = 1;
    for (let i = 0; i < 40; i++) { g.update(0.02); g.input.endFrame(); minZoom = Math.min(minZoom, c.zoom); }
    return { minZoom: +minZoom.toFixed(3) };
  });
  check('a charge punches the field of view wider (zoom below 1) while it gallops', ch.minZoom < 0.985 && ch.minZoom > 0.8, ch);
  await run(3);
  const back = await page.evaluate(() => ({ zoom: window.__game.camera.zoom, trauma: window.__game.camfx.trauma }));
  check('and it comes back', Math.abs(back.zoom - 1) < 0.003 && back.trauma < 0.02, back);
  // ---- low health drains the colour; death fades; the respawn opens from black
  const lowhp = await page.evaluate(() => {
    const g = window.__game, p = g.player, cc = window.__gfx.post && window.__gfx.post.cam;
    p.hp = p.maxHp * 0.15; for (let i = 0; i < 30; i++) { g.update(0.02); g.input.endFrame(); }
    const a = cc.desaturate; p.hp = p.maxHp; for (let i = 0; i < 5; i++) { g.update(0.02); g.input.endFrame(); }
    return { low: +a.toFixed(2), after: +cc.desaturate.toFixed(2), active: window.__gfx.post.active };
  });
  check('at 15 percent health the colour drains a little (and returns at full health)', lowhp.low > 0.15 && lowhp.low < 0.5 && lowhp.after === 0, lowhp);
  const die = await page.evaluate(() => {
    const g = window.__game, p = g.player, cc = window.__gfx.post.cam;
    p.takeDamage(1e9, null, {});
    for (let i = 0; i < 100; i++) { g.update(0.02); g.input.endFrame(); }
    return { alive: p.alive, desat: +cc.desaturate.toFixed(2), flash: +cc.flash.toFixed(2), col: [cc.flashColor.r, cc.flashColor.g, cc.flashColor.b] };
  });
  check('after the hero dies the picture drains and darkens', !die.alive && die.desat > 0.5 && die.flash > 0.3 && die.col.every((v) => v === 0), die);
  const live = await page.evaluate(() => {
    const g = window.__game, p = g.player, cc = window.__gfx.post.cam;
    p.alive = true; p.hp = p.maxHp;
    g.update(0.02); g.input.endFrame();
    const first = { flash: +cc.flash.toFixed(2), desat: +cc.desaturate.toFixed(2) };
    for (let i = 0; i < 80; i++) { g.update(0.02); g.input.endFrame(); }
    return { first, later: { flash: +cc.flash.toFixed(2), desat: +cc.desaturate.toFixed(2) } };
  });
  check('on the respawn the screen opens from black and settles', live.first.flash > 0.6 && live.later.flash < 0.2 && live.later.desat === 0, live);
  const lvl = await page.evaluate(() => {
    const g = window.__game, p = g.player, cc = window.__gfx.post.cam;
    p.level += 1; g.update(0.02); g.input.endFrame();
    return { flash: +cc.flash.toFixed(2), gold: cc.flashColor.r > cc.flashColor.b };
  });
  check('a level up flashes gold', lvl.flash > 0.15 && lvl.gold, lvl);
  // ---- Low has no post pass: the effects still run and nothing breaks
  await page.evaluate(() => { const g = window.__game; g.setQuality('low'); g.player.hp = g.player.maxHp * 0.1; for (let i = 0; i < 30; i++) { g.update(0.02); g.input.endFrame(); } g.camfx.boom({ x: g.player.pos.x + 3, y: 0, z: g.player.pos.z }, 1); for (let i = 0; i < 30; i++) { g.update(0.02); g.input.endFrame(); } });
  console.log('errors:', errors.join('\n') || 'none');
  check('no page errors', errors.length === 0);
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
