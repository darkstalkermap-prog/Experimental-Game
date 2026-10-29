// Online: a guest Ranger places a volley circle and looses it (the host works out the arrows), and ducks and climbs
// walls are seen on the other screens.
const { session, startMatch } = require('../v2/mplib');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
(async () => {
  const S = await session('relay');
  const { page: hostPage, code } = await S.host('Arthur');
  const guest = await S.join(code, 'Gwen', 'guest');
  await guest.evaluate(() => document.querySelector('#lobbyClassPick button[data-cls=ranger]').click());
  await hostPage.waitForTimeout(500);
  await startMatch(S, hostPage, [guest], { coop: false });
  const all = [hostPage, guest];
  // step every page, clearing the mouse movement each frame so nobody turns by itself
  const stepAll = async (secs, dt = 1 / 30) => {
    const slices = Math.ceil(secs / 0.25), n = Math.round(0.25 / dt);
    for (let i = 0; i < slices; i++) {
      for (const p of all) await p.evaluate(([n, dt]) => { const g = window.__game; g.paused = false; for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } }, [n, dt]);
      await hostPage.waitForTimeout(20);
    }
  };
  const key = (page, code, down = true) => page.evaluate(([code, down]) => { const i = window.__game.input; if (down) { if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); } else { if (i.keys.delete(code)) i.up.add(code); } }, [code, down]);
  await stepAll(3);
  const hostCopy = () => hostPage.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { cls: h.classId, abil: +h.abilCd.q.toFixed(1), rain: window.__game.abilities.active.filter((e) => e.kind === 'rain').length, height: +h.height.toFixed(2), ducking: h.ducking, climbing: h.climbing, y: +h.pos.y.toFixed(2), climbCenter: null }; });

  // ---- the volley
  await guest.evaluate(() => {
    const g = window.__game, p = g.player;
    p.pos.set(-48, g.physics.groundHeight(-48, -64, 20), -64);
    p.yaw = 0; p.pitch = 0; p.abilCd = { q: 0, r: 0 };
  });
  await stepAll(1.2);
  const foes = await hostPage.evaluate(() => {
    const g = window.__game, h = g.humans.find((x) => x.team === 1);
    window.__foes = [];
    const spots = [[0, 30], [1.5, 31], [-1.5, 29], [2, 28.5], [-2.5, 31.5], [0.5, 33]];
    for (const [dx, dz] of spots) {
      const u = g.recruit(g.factions[2], 'swordsman');
      u.pos.set(h.pos.x + dx, g.physics.groundHeight(h.pos.x + dx, h.pos.z + dz, 20), h.pos.z + dz);
      u.hp = u.maxHp = 400; u.attackTimer = 99; u.homeCastle = g.castles[0];
      u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 };
      u.update = function (dt) { if (this.staggerT > 0) this.staggerT -= dt; };
      window.__foes.push(u);
    }
    return { hostSeesGuestAt: [+h.pos.x.toFixed(1), +h.pos.z.toFixed(1)], class: h.classId };
  });
  console.log('setup', JSON.stringify(foes));
  await stepAll(0.3);
  await guest.evaluate(() => { const p = window.__game.player; p.pitch = -Math.atan2(p.eye, 30) * 0.98; });
  await key(guest, 'KeyQ');
  await stepAll(0.4);
  const aim = await guest.evaluate(() => { const g = window.__game, p = g.player; return { aiming: !!p.aiming, ring: g.aimRing.main.group.visible, at: p.aiming ? [p.aiming.at.x, p.aiming.at.z] : null, cd: p.abilCd.q }; });
  ok('the guest sees the circle while holding Q', aim.aiming && aim.ring && aim.cd === 0, aim);
  const before = await hostCopy();
  ok('nothing is cast on the host while the key is held', before.abil === 0 && before.rain === 0, before);
  await key(guest, 'KeyQ', false);
  await stepAll(0.5);
  const after = await hostCopy();
  const guestSeen = await guest.evaluate(() => { const g = window.__game; return { cd: +g.player.abilCd.q.toFixed(1), flashes: g.aimRing.flashes.length, rising: g.abilities.rising.length, arrows: g.projectiles.list.length }; });
  ok('on release the host starts the volley (cooldown and arrows queued)', after.abil > 8 && after.rain === 1, after);
  const rainAt = await hostPage.evaluate(() => { const e = window.__game.abilities.active.find((x) => x.kind === 'rain'); return e ? [e.c.x, e.c.z] : null; });
  ok('it falls where the guest put the circle', rainAt && aim.at && Math.hypot(rainAt[0] - aim.at[0], rainAt[1] - aim.at[1]) < 1.0, { circle: aim.at, rain: rainAt });
  ok('the guest sees the circle marked on the ground and arrows leaving the bow', guestSeen.cd > 8 && guestSeen.flashes === 1 && guestSeen.rising > 0, guestSeen);
  let seen = 0;
  for (let i = 0; i < 12; i++) { await stepAll(0.25); seen = Math.max(seen, await guest.evaluate(() => window.__game.projectiles.list.length)); }
  ok('the guest sees the arrows coming down', seen >= 5, seen);
  const hp = await hostPage.evaluate(() => window.__foes.map((u) => Math.round(400 - u.hp)));
  ok('the foes in the circle are hurt', hp.filter((d) => d > 0).length >= 4, hp);

  // ---- ducking is seen by the other screen, both ways
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.pos.set(-48, g.physics.groundHeight(-48, -64, 20), -64); });
  await key(guest, 'KeyC');
  await stepAll(1.0);
  const gd = await hostCopy();
  ok('the host sees the guest duck (lower hitbox)', gd.ducking === true && gd.height < 1.3, gd);
  await key(guest, 'KeyC', false);
  await stepAll(1.0);
  const gs = await hostCopy();
  ok('and stand up again', gs.ducking === false && gs.height > 1.75, gs);
  await key(hostPage, 'KeyC');
  await stepAll(1.0);
  const hd = await guest.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 0); return { ducking: h.ducking, height: +h.height.toFixed(2), duck: +h.duck.toFixed(2) }; });
  ok('the guest sees the host duck', hd.ducking && hd.height < 1.3, hd);
  await key(hostPage, 'KeyC', false);
  await stepAll(0.6);

  // ---- climbing a wall is seen by the host
  await guest.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[p.team];   // the guest climbs the walls of its own castle (nobody else's)
    const a = c.toWorld(3, -21.0), b = c.toWorld(3, -10);
    p.pos.set(a.x, g.physics.terrainHeight(a.x, a.z), a.z);
    p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = 0; p.vel.set(0, 0, 0); p.stamina = 100; p.climbCd = 0;
  });
  await stepAll(0.6);
  await key(guest, 'Space');
  await stepAll(0.25);
  await key(guest, 'Space', false);
  await stepAll(0.25);
  const mid = await hostCopy();
  const guestMid = await guest.evaluate(() => ({ climb: !!window.__game.player.climb }));
  ok('mid-climb the host sees the guest climbing', mid.climbing === true && guestMid.climb, { host: mid, guest: guestMid });
  await stepAll(1.6);
  const top = await hostCopy();
  const cy = await hostPage.evaluate(() => window.__game.castles[1].center.y);
  const guestTop = await guest.evaluate(() => { const p = window.__game.player; return { y: +p.pos.y.toFixed(2), climb: !!p.climb }; });
  ok('the guest ends on the wall top, and so does the host\'s copy of them', Math.abs(guestTop.y - (cy + 8)) < 0.1 && Math.abs(top.y - (cy + 8)) < 0.5 && !top.climbing, { guest: guestTop, host: top, wallTop: cy + 8 });
  console.log('errors:\n' + (S.errors.join('\n') || 'none'));
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  await S.close();
})();
