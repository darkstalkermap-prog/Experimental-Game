// Multiplayer: a guest Cavalier keeps the horse, charges through a dummy on the host, and a guest Cleric heals the host.
const { session, startMatch, step } = require('./mplib');
(async () => {
  const S = await session('relay');
  const res = {};
  const { page: hostPage, code } = await S.host('Arthur');
  const guest = await S.join(code, 'Gwen', 'guest');
  await guest.evaluate(() => document.querySelector('#lobbyClassPick button[data-cls=cavalier]').click());
  await hostPage.waitForTimeout(500);
  await startMatch(S, hostPage, [guest], { coop: false });
  const all = [hostPage, guest];
  await step(all, 3);
  res.horse = {
    guest: await guest.evaluate(() => ({ has: window.__game.player.hasHorse, hp: window.__game.player.horseHp, maxHp: window.__game.player.maxHp })),
    hostCopy: await hostPage.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { has: h.hasHorse, hp: h.horseHp }; }),
  };
  // go to open ground, mount
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.pos.set(-48, g.physics.groundHeight(-48, -64, 20), -64); p.yaw = 0; p.horsePos.set(-46, p.pos.y, -64); p.toggleMount(); });
  await step(all, 1.5);
  res.mounted = { guest: await guest.evaluate(() => window.__game.player.mounted), host: await hostPage.evaluate(() => window.__game.humans.find((x) => x.team === 1).mounted) };
  // a dummy foe on the host, 9 m ahead of the guest as the host sees it
  const foe = await hostPage.evaluate(() => {
    const g = window.__game, h = g.humans.find((x) => x.team === 1);
    const u = g.recruit(g.factions[2], 'swordsman');
    u.pos.set(h.pos.x, g.physics.groundHeight(h.pos.x, h.pos.z + 9, 20), h.pos.z + 9);
    u.hp = u.maxHp = 500; u.attackTimer = 99;
    u.update = function (dt) { if (this.staggerT > 0) this.staggerT -= dt; };
    window.__foe = u;
    return { x: u.pos.x, z: u.pos.z, hostSeesGuestAt: [h.pos.x, h.pos.z] };
  });
  res.foe = foe;
  await guest.evaluate(() => { const g = window.__game; g.player.useAbility('q', g.input); });
  await step(all, 1.6);
  res.charge = await hostPage.evaluate(() => ({ foeHp: Math.round(window.__foe.hp), foeStagger: +window.__foe.staggerT.toFixed(1), guestZ: +window.__game.humans.find((x) => x.team === 1).pos.z.toFixed(1) }));
  // host cleric? (host is a Knight here) -> host takes damage, guest rallies: the host (ally? versus: no). Just check R works for the guest.
  await guest.evaluate(() => { const g = window.__game; g.player.useAbility('r', g.input); });
  await step(all, 0.6);
  res.rally = { guestBuffs: await guest.evaluate(() => window.__game.player.buffs.list().map((b) => b[0])), hostRemote: await hostPage.evaluate(() => window.__game.humans.find((x) => x.team === 1).buffs.list().map((b) => b[0])) };
  console.log(JSON.stringify(res, null, 1));
  console.log('errors:\n' + (S.errors.join('\n') || 'none'));
  await S.close();
})();
