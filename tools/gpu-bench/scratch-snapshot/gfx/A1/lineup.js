// A row of characters in front of the camera, to look at the models. Usage:
//   CW_PORT=8211 $S/gfx/b.sh $S/gfx/A1/lineup.js out=<png> items=swordsman,spearman:1,knight:0:3 dist=5 quality=high w=960 h=540 [yaw=0] [spacing=1.7] [cam=front|side|back]
// item = type[:team[:tier[:rank]]]   (type may be hero-<class>, e.g. hero-ranger)
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const OUT = arg.out || S + 'gfx/A1/lineup.png';
const items = (arg.items || 'swordsman,spearman,archer,knight').split(',').map((s) => s.split(':'));
const W = +(arg.w || 960), H = +(arg.h || 540);
(async () => {
  const { browser, page, errors } = await L.launch({ map: arg.map || 'medium', quality: arg.quality || 'high', viewport: { width: W, height: H }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  const info = await page.evaluate(async ([items, arg]) => {
    const g = window.__game, me = g.player;
    const { Unit } = await import('/src/units.js');
    const V = g.camera.position.constructor;
    me.buffs.add('ghost', 1e6);
    g.paused = false;
    g.phaseT = 1e9;
    for (const u of g.units) { u.alive = false; u.remove(); }
    g.units.length = 0;
    document.getElementById('hud').style.display = 'none';
    const cx = +(arg.cx || 0), cz = +(arg.cz || 60);   // somewhere flat-ish on the map
    const spacing = +(arg.spacing || 1.7), yaw = +(arg.yaw || 0);
    const made = [];
    items.forEach((it, i) => {
      const [type, team = 0, tier = 0, rank = 1] = it;
      const x = cx + (i - (items.length - 1) / 2) * spacing, z = cz;
      const u = new Unit(g, type.startsWith('hero-') ? 'lord' : type, +team, new V(x, 0, z), { variant: (i * 5 + 1) % 6 });
      u.yaw = yaw;
      u.homeCastle = g.castles[+team];
      if (+tier) { u.tier = 0; u.fixedTier = true; u.setTier(+tier); }
      if (+rank > 1) u.setRankVisual(+rank);
      u.update = function (dt) { this.vel.set(0, 0, 0); this.animate(dt, false); this.mesh.position.copy(this.pos); this.mesh.rotation.y = this.yaw; };
      u.think = () => {};
      g.units.push(u);
      made.push(u.type);
    });
    const dist = +(arg.dist || 5), cam = arg.cam || 'front';
    const ang = cam === 'side' ? Math.PI / 2 : cam === 'back' ? Math.PI : cam === '34' ? 0.7 : 0;
    me.vel.set(0, 0, 0);
    me.pos.set(cx + Math.sin(ang) * dist, 0, cz + Math.cos(ang) * dist);
    me.pos.y = g.physics.groundHeight(me.pos.x, me.pos.z, 50) + 1.2;
    me.yaw = Math.atan2(cx - me.pos.x, cz - me.pos.z);
    me.pitch = -(+(arg.pitch || 0.08));
    me.alive = true; me.hp = me.maxHp;
    g.camera.fov = +(arg.fov || 60); g.camera.updateProjectionMatrix();
    return made;
  }, [items, arg]);
  await page.waitForTimeout(+(arg.wait || 2500));
  const st = await page.evaluate(() => { const g = window.__game, R = g.renderer; R.info.autoReset = false; R.info.reset(); R.render(g.scene, g.camera); const i = R.info.render; R.info.autoReset = true; return { calls: i.calls, tris: i.triangles, crowd: g.crowd.stats }; });
  await page.screenshot({ path: OUT });
  console.log(JSON.stringify({ made: info.length, ...st }), 'errors', JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})();
