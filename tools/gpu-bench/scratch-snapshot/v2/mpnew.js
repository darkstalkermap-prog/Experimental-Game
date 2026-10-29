// Multiplayer: classes in the lobby, abilities from a guest, roster, siege crews and driving an engine as a guest.
const { session, startMatch, step, syncCheck } = require('./mplib');
(async () => {
  const S = await session('relay');
  const res = {};
  // the host picks Cleric in the menu before hosting
  const hostPage = await S.open('host');
  await S.click(hostPage, 'mpBtn');
  await hostPage.waitForSelector('#online:not(.hidden)', { timeout: 30000 });
  await hostPage.evaluate(() => document.querySelector('#classPick button[data-cls=cleric]').click());
  await hostPage.fill('#pname', 'Arthur');
  await S.click(hostPage, 'hostBtn');
  await hostPage.waitForSelector('#lobby:not(.hidden)', { timeout: 60000 });
  const code = (await hostPage.textContent('#roomCode')).trim();
  const guest = await S.join(code, 'Gwen', 'guest');
  // the guest picks Mage in the lobby
  await guest.evaluate(() => document.querySelector('#lobbyClassPick button[data-cls=mage]').click());
  await hostPage.waitForTimeout(600);
  res.lobbyHost = (await hostPage.textContent('#lobbyList')).replace(/\s+/g, ' ').trim();
  res.lobbyGuest = (await guest.textContent('#lobbyList')).replace(/\s+/g, ' ').trim();
  await startMatch(S, hostPage, [guest], { coop: false });
  const all = [hostPage, guest];
  await step(all, 3);
  res.classes = {
    host: await hostPage.evaluate(() => ({ me: window.__game.player.classId, remote: window.__game.humans.map((h) => [h.team, h.classId, h.maxHp]) })),
    guest: await guest.evaluate(() => ({ me: window.__game.player.classId, maxHp: window.__game.player.maxHp, remote: window.__game.humans.map((h) => [h.team, h.classId, h.maxHp]) })),
  };

  // ---- guest uses Q (fireball) and R (ward)
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.pitch = 0.1; p.useAbility('q', g.input); p.useAbility('r', g.input); });
  await step(all, 0.6);
  res.abil = {
    hostProjectiles: await hostPage.evaluate(() => window.__game.projectiles.list.filter((p) => p.kind === 'fireball').length),
    hostRemoteBuffs: await hostPage.evaluate(() => window.__game.humans.find((h) => h.team === 1).buffs.list()),
    guestBuffs: await guest.evaluate(() => window.__game.player.buffs.list()),
    guestCd: await guest.evaluate(() => window.__game.player.abilCd),
    hostRemoteCd: await hostPage.evaluate(() => window.__game.humans.find((h) => h.team === 1).abilCd),
  };
  res.guestHudBuffs = await guest.evaluate(() => document.getElementById('buffs').textContent);

  // ---- the host (cleric) casts heal: the guest sees the ring event without errors
  await hostPage.evaluate(() => { const g = window.__game; g.player.useAbility('r', g.input); });
  await step(all, 0.5);

  // ---- roster from the guest
  await guest.evaluate(() => { window.__game.localRoles({ role: 'army', type: 'archer' }); window.__game.localRecruitRole('army'); });
  await step(all, 1);
  res.roster = {
    hostRoles: await hostPage.evaluate(() => ({ counts: window.__game.roleCounts(1), recruitRole: window.__game.factions[1].recruitRole })),
    guestRoles: await guest.evaluate(() => ({ counts: window.__game.roleCounts(1), recruitRole: window.__game.factions[1].recruitRole })),
  };
  await guest.evaluate(() => { window.__game.factions[1].gold += 900; window.__game.buyForPlayer('recruit_knight'); });
  await step(all, 1);
  res.recruitArmy = await hostPage.evaluate(() => window.__game.units.filter((u) => u.team === 1 && u.type === 'knight').map((u) => u.role));
  await guest.evaluate(() => { window.__game.localOrder('follow'); });
  await step(all, 1);
  res.orderReaches = await hostPage.evaluate(() => { const m = {}; for (const u of window.__game.units) if (u.team === 1 && !u.isHero && !u.isCrew) { const k = u.role + ':' + u.order; m[k] = (m[k] || 0) + 1; } return m; });

  // ---- siege crew visible on the guest
  await hostPage.evaluate(() => { const g = window.__game; g.factions[1].gold += 3000; window.__eng = g.buildSiege(g.factions[1], 'ram'); });
  await step(all, 4);
  res.crewOnGuest = await guest.evaluate(() => {
    const g = window.__game;
    const e = g.siege[0];
    const crew = g.units.filter((u) => u.crewRef);
    const V = g.camera.position.constructor;
    const seat = new V();
    return { engines: g.siege.length, engineTeam: e.team, crewUnits: crew.length, seatDist: crew.map((u) => { e.seatPos(u.crewSlot, seat); return +u.pos.distanceTo(seat).toFixed(2); }), crewN: e.crewN };
  });
  // the host kills the crew: abandoned on the guest too
  await hostPage.evaluate(() => { const e = window.__eng; for (const c of [...e.crew]) if (c) c.die ? window.__game.damage(c, 999, { team: 0 }, { melee: true }) : 0; });
  await step(all, 1);
  res.abandoned = { host: await hostPage.evaluate(() => window.__eng.abandoned), guest: await guest.evaluate(() => ({ abandoned: window.__game.siege[0].abandoned, crewN: window.__game.siege[0].crewN, deadCrew: window.__game.units.filter((u) => u.type === 'engineer' && !u.alive).length })) };

  // ---- the guest walks up and takes the controls
  await hostPage.evaluate(() => { window.__eng.pos.set(0, window.__eng.pos.y, 40); });
  await step(all, 1);
  await guest.evaluate(() => { const g = window.__game, p = g.player; const e = g.siege[0]; p.pos.set(e.pos.x + 3, e.pos.y, e.pos.z); });
  await step(all, 1);
  res.prompt = await guest.evaluate(() => ({ near: !!window.__game.engineNear(window.__game.player), prompt: document.getElementById('promptText').textContent, hidden: document.getElementById('prompt').classList.contains('hidden') }));
  await guest.evaluate(() => { const g = window.__game; g.localBoard(g.engineNear(g.player)); });
  await step(all, 1);
  res.boarded = {
    host: await hostPage.evaluate(() => ({ driver: window.__eng.driver && window.__eng.driver.name, team: window.__eng.team, abandoned: window.__eng.abandoned })),
    guest: await guest.evaluate(() => ({ drive: !!window.__game.player.drive, prompt: document.getElementById('promptText').textContent, weapon: document.getElementById('weapon').textContent })),
  };
  // drive forward with W for 3 s through the real key path
  const pos0 = await hostPage.evaluate(() => window.__eng.pos.z);
  await guest.evaluate(() => window.__game.input.keys.add('KeyW'));
  await step(all, 3);
  await guest.evaluate(() => window.__game.input.keys.delete('KeyW'));
  res.driven = { hostMoved: await hostPage.evaluate((z0) => +(window.__eng.pos.z - z0).toFixed(2), pos0), guestEngineZ: await guest.evaluate(() => +window.__game.siege[0].pos.z.toFixed(1)), hostEngineZ: await hostPage.evaluate(() => +window.__eng.pos.z.toFixed(1)), guestHeroDist: await guest.evaluate(() => { const g = window.__game; return +Math.hypot(g.player.pos.x - g.siege[0].pos.x, g.player.pos.z - g.siege[0].pos.z).toFixed(1); }) };
  res.hostSeesGuestHidden = await hostPage.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { drive: !!h.drive, bodyVisible: h.body.root.visible }; });
  // leave
  await guest.evaluate(() => window.__game.input.pressed.add('KeyE'));
  await step(all, 1);
  res.left = { host: await hostPage.evaluate(() => ({ driver: !!window.__eng.driver, abandoned: window.__eng.abandoned })), guest: await guest.evaluate(() => ({ drive: window.__game.player.drive })) };

  console.log(JSON.stringify(res, null, 1));
  console.log('errors:\n' + (S.errors.join('\n') || 'none'));
  await S.close();
})();
