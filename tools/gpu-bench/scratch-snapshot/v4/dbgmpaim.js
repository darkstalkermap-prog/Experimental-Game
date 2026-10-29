const { session, startMatch } = require('../v2/mplib');
(async () => {
  const S = await session('relay');
  const { page: hostPage, code } = await S.host('Arthur');
  const guest = await S.join(code, 'Gwen', 'guest');
  await guest.evaluate(() => document.querySelector('#lobbyClassPick button[data-cls=ranger]').click());
  await hostPage.waitForTimeout(500);
  await startMatch(S, hostPage, [guest], { coop: false });
  const all = [hostPage, guest];
  const stepAll = async (secs, dt = 1 / 30) => {
    const slices = Math.ceil(secs / 0.25), n = Math.round(0.25 / dt);
    for (let i = 0; i < slices; i++) {
      for (const p of all) await p.evaluate(([n, dt]) => { const g = window.__game; g.paused = false; for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } }, [n, dt]);
      await hostPage.waitForTimeout(20);
    }
  };
  await stepAll(3);
  const r = await guest.evaluate(async () => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    p.pos.set(-48, g.physics.groundHeight(-48, -64, 20), -64);
    p.yaw = 0; p.pitch = -Math.atan2(p.eye, 30) * 0.98;
    const eye = new V3(p.pos.x, p.pos.y + p.eye, p.pos.z), dir = p.lookDir();
    const out = { eye: [eye.x, eye.y, eye.z], dir: [dir.x, dir.y, dir.z], steps: [] };
    const q = new V3();
    for (let d = 1; d <= 20; d += 0.5) {
      q.copy(eye).addScaledVector(dir, d);
      const ch = g.projectiles.hitCharacter(q, p.team, 0.35);
      const sg = g.siegeAt(q, p.team);
      const col = g.physics.pointHit(q.x, q.y, q.z, p.team);
      const terr = g.physics.terrainHeight(q.x, q.z);
      if (ch || sg || col || q.y < terr) { out.hit = { d, ch: ch && [ch.type, ch.team, ch.pos.x, ch.pos.z], sg: !!sg, col: col && col.kind, terr, y: q.y }; break; }
    }
    return out;
  });
  console.log(JSON.stringify(r));
  await S.close();
})();
