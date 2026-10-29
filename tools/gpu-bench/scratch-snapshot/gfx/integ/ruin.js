// The castle ruin (a fallen keep) from outside and from the courtyard, with damaged walls and a breached gate. usage: CW_PORT=8220 OUT=<dir> node ruin.js <tag> <quality>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'r', QUALITY = process.argv[3] || 'high';
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  const ok = await page.evaluate(() => {
    const g = window.__game; g.paused = false; g.player.buffs.add('ghost', 1e6);
    document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden');
    const c = g.castles[2];                    // an enemy castle
    for (const w of c.walls) if (w.breakable) { w.hp = Math.max(1, w.maxHp * 0.15); }
    // knock a wall down and the gate, then the keep
    const seg = c.walls.find((x) => x.breakable);
    if (seg) { seg.hp = 1; c.damageWall(seg, 999, null); }
    c.gate.hp = 0; if (c.damageGate) c.damageGate(9999, null);
    c.fall(null);
    for (let i = 0; i < 200; i++) { g.update(0.05); g.input.endFrame(); }
    return { fallen: c.fallen, center: [c.center.x, c.center.z] };
  });
  console.log(JSON.stringify(ok));
  const shot = async (name, f) => { await page.evaluate(f); await page.waitForTimeout(3500); await page.screenshot({ path: OUT + `${TAG}_${name}.png` }); };
  const pre = `const c = window.__game.castles[2], g = window.__game, me = g.player;
    const put = (x, z, up) => { me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.pos.y = g.physics.groundHeight(x, z, 40) + up; };
    const aim = (tx, ty, tz) => { const dx = tx - me.pos.x, dz = tz - me.pos.z, dy = ty - (me.pos.y + 1.7); me.yaw = Math.atan2(dx, dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };`;
  await shot('ruin_out', `(() => { ${pre} const ux = c.center.x, uz = c.center.z, l = Math.hypot(ux, uz); put(ux - ux / l * 60, uz - uz / l * 60, 3); aim(ux, 8, uz); })()`);
  await shot('ruin_close', `(() => { ${pre} const ux = c.center.x, uz = c.center.z, l = Math.hypot(ux, uz); put(ux - ux / l * 36, uz - uz / l * 36, 1.5); aim(ux, 6, uz); })()`);
  await shot('ruin_high', `(() => { ${pre} const ux = c.center.x, uz = c.center.z, l = Math.hypot(ux, uz); put(ux - ux / l * 46, uz - uz / l * 46, 17); aim(ux, 4, uz); })()`);
  await shot('ruin_side', `(() => { ${pre} const ux = c.center.x, uz = c.center.z; put(ux + 8, uz - 52, 12); aim(ux, 5, uz); })()`);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
