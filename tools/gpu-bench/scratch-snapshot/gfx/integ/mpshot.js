// Host + guest: does the guest see the same look? Both pages render through gfx.renderFrame at 960x540 and are saved as PNGs.
// usage: CW_PORT=8220 OUT=<dir> node mpshot.js <tag>
const S0 = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { session, startMatch, step } = require(S0 + 'mp_run/mplib');
const fs = require('fs');
const OUT = (process.env.OUT || S0 + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'mp';
(async () => {
  const T = await session('relay');
  const { page: host, code } = await T.host('Arthur');
  const guest = await T.join(code, 'Gwen', 'guest');
  await startMatch(T, host, [guest], { coop: false });
  const all = [host, guest];
  await step(all, 100);
  for (const p of all) {
    await p.setViewportSize({ width: 960, height: 540 });
    await p.evaluate(() => { document.getElementById('hud').style.display = 'none'; const g = window.__game; g.player.buffs.add('ghost', 1e6); window.__gfx.resize(true); });
  }
  const snap = async (page, name) => {
    const data = await page.evaluate(() => { const g = window.__game; window.__gfx.renderFrame(1 / 60); return g.renderer.domElement.toDataURL('image/png'); });
    fs.writeFileSync(OUT + `${TAG}_${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  };
  // both stand in the middle of the field looking at the same spot (the guest's pose reaches the host the usual way)
  const go = (page, x, z, yaw) => page.evaluate(([x, z, yaw]) => { const g = window.__game, me = g.player; me.pos.set(x, 0, z); me.pos.y = g.physics.groundHeight(x, z, 40) + 1; me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = -0.05; }, [x, z, yaw]);
  await go(host, 0, 30, Math.PI); await go(guest, 4, 32, Math.PI);
  await step(all, 2);
  await go(host, 0, 30, Math.PI); await go(guest, 4, 32, Math.PI);
  await snap(host, 'host_field'); await snap(guest, 'guest_field');
  const info = await Promise.all(all.map((p) => p.evaluate(() => { const g = window.__game; return { units: g.units.filter((u) => u.alive).length, siege: g.siege.length, crowd: g.crowd.stats.instances, fx: !!g.fx, mode: g.mode, round: g.round }; })));
  console.log(JSON.stringify(info));
  console.log('errors', JSON.stringify(T.errors.slice(0, 4)));
  await T.close();
})();
