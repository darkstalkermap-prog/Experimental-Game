// Calling a fallen ally back to life, for real: a host and a guest in a co-op Conquest game through the relay.
//   A: the guest's house falls and the guest dies; the HOST pays from the shop's ally bar. The guest rises in the courtyard of its own
//      (ruined) keep, on its own screen too, and the host must agree on where they stand.
//   B: the host's house falls and the host dies; the GUEST presses U (the buy goes over the wire). The host rises at its own keep.
const S0 = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { session, startMatch, step } = require(S0 + 'mp_run/mplib');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };

const INSTALL = () => {
  window.__vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; };
  window.__txt = (sel) => (document.querySelector(sel) || { textContent: null }).textContent;
  window.__toasts = () => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent);
  window.__fall = (team) => {   // (on the host) a house falls: its keep is destroyed and its hero is killed
    const g = window.__game, f = g.factions[team], foe = g.units.find((u) => u.team === 2 && u.alive);
    g.castles[team].keep.takeDamage(1e9, foe);
    f.player.buffs.clear();
    g.damage(f.player, 1e6, foe, { melee: true });
  };
  window.__where = (team) => {   // where the hero of a house stands, how far from each keep's courtyard, and whether they live
    const g = window.__game, h = g.humans.find((x) => x.team === team);
    const d = (c) => Math.round(Math.hypot(h.pos.x - c.spawnPoint.x, h.pos.z - c.spawnPoint.z) * 10) / 10;
    return { alive: h.alive, hp: Math.round(h.hp), maxHp: h.maxHp, d0: d(g.castles[0]), d1: d(g.castles[1]), x: Math.round(h.pos.x * 10) / 10, z: Math.round(h.pos.z * 10) / 10 };
  };
  window.__frame = () => { const g = window.__game; g.paused = false; g.update(0.05); g.input.endFrame(); g.ui.update(0.5); };
};

async function match(label, fn) {
  const S = await session('relay');
  try {
    const { page: host, code } = await S.host('Arthur');
    const guest = await S.join(code, 'Gwen', 'c1');
    await startMatch(S, host, [guest], { coop: true });
    for (const p of [host, guest]) await p.evaluate(INSTALL);
    await step([host, guest], 3);
    console.log(`--- ${label} (room ${code})`);
    await fn(S, host, guest);
    check(`${label}: no page errors`, S.errors.length === 0, S.errors.slice(0, 3).join(' || '));
  } finally { await S.close(); }
}

(async () => {
  // ================================================================ A: the guest falls, the host pays
  await match('A (the host pays for the guest)', async (S, host, guest) => {
    const both = [host, guest];
    let r = await Promise.all(both.map((p) => p.evaluate(() => { const g = window.__game; return { coop: g.coop, live: g.summonLive, team: g.localTeam, down: g.fallenAllies(g.localTeam).length, obj: g.objective }; })));
    check('both pages know it is co-op Conquest and nobody is down', r.every((x) => x.coop && x.live && x.down === 0 && x.obj === 'conquest'), JSON.stringify(r));
    check('host is team 0, guest is team 1', r[0].team === 0 && r[1].team === 1);

    await host.evaluate(() => window.__fall(1));
    await step(both, 2);
    r = await Promise.all(both.map((p) => p.evaluate(() => {
      const g = window.__game, f1 = g.factions[1];
      g.ui.update(0.5);   // (the harness steps the game, not the HUD)
      return { elim: f1.eliminated, fallen: g.castles[1].fallen, isPlayer: f1.isPlayer, gAlive: g.humans.find((h) => h.team === 1).alive, down: g.fallenAllies(g.localTeam).map((a) => a.team),
        overlay: window.__vis('#respawn'), overlayText: window.__txt('#respawnT') };
    })));
    check('both pages see Gwen\'s house fallen and eliminated, and her hero dead', r.every((x) => x.elim && x.fallen && x.isPlayer && !x.gAlive), JSON.stringify(r));
    check('the host lists her as a fallen ally to call back; she is not listed for herself', r[0].down.join() === '1' && r[1].down.length === 0, JSON.stringify([r[0].down, r[1].down]));
    check('Gwen\'s screen says an ally can call her back for 500 gold', r[1].overlay && /an ally can call you back for 500 gold/.test(r[1].overlayText), r[1].overlayText);

    // the host opens the shop: the ally bar is there; with too little gold the button complains
    r = await host.evaluate(() => {
      const g = window.__game; g.factions[0].gold = 300;
      g.ui.toggleShop(); g.ui.refreshShop();
      return { bar: window.__vis('#allyBar'), text: window.__txt('#allyBar .al > span'), btn: window.__txt('#allyBar .al button') };
    });
    check('the host\'s shop has the ally bar naming Gwen', r.bar && /Gwen/.test(r.text) && /500/.test(r.btn), JSON.stringify(r));
    await host.evaluate(() => { document.querySelector('#allyBar .al button').click(); });
    r = await host.evaluate(() => ({ gold: window.__game.factions[0].gold, elim: window.__game.factions[1].eliminated, toasts: window.__toasts() }));
    check('300 gold is not enough: nothing happens', r.gold === 300 && r.elim && r.toasts.some((t) => /Need 200 more gold/.test(t)), JSON.stringify(r));

    // paying
    const goldBefore = await host.evaluate(() => { const g = window.__game; g.factions[0].gold = 900; return g.factions[0].gold; });
    await host.evaluate(() => { document.querySelector('#allyBar .al button').click(); });
    await step(both, 1.5);
    const hostSees = await host.evaluate(() => ({ ...window.__where(1), gold: window.__game.factions[0].gold, elim: window.__game.factions[1].eliminated, toasts: window.__toasts() }));
    const guestSees = await guest.evaluate(() => (window.__game.ui.update(0.5), { me: window.__where(1), elim: window.__game.localFaction.eliminated, overlay: window.__vis('#respawn'), toasts: window.__toasts(), gold: window.__game.factions[0].gold }));
    check('the host paid 500 and Gwen is alive on the host', Math.abs(hostSees.gold - (goldBefore - 500)) <= 8 && hostSees.alive && !hostSees.elim && hostSees.hp === hostSees.maxHp, JSON.stringify(hostSees));
    check('Gwen rises in the courtyard of her OWN keep (a ruin) on the host', hostSees.d1 < 3 && hostSees.d0 > 40, JSON.stringify([hostSees.d0, hostSees.d1]));
    check('Gwen\'s own screen: alive, house un-eliminated, the overlay gone', guestSees.me.alive && !guestSees.elim && !guestSees.overlay, JSON.stringify(guestSees));
    check('and on her own screen she stands in the courtyard of her own keep too', guestSees.me.d1 < 3 && guestSees.me.d0 > 40, JSON.stringify([guestSees.me.d0, guestSees.me.d1]));
    check('the host and the guest agree on where Gwen stands (within 3 m)', Math.hypot(hostSees.x - guestSees.me.x, hostSees.z - guestSees.me.z) < 3, JSON.stringify([[hostSees.x, hostSees.z], [guestSees.me.x, guestSees.me.z]]));
    check('both screens heard about it', hostSees.toasts.some((t) => /Gwen rises again from the ruins of their keep/.test(t)) && guestSees.toasts.some((t) => /called you back to life/.test(t)), JSON.stringify([hostSees.toasts.slice(0, 2), guestSees.toasts.slice(0, 2)]));

    // she walks: the guest moves, the host follows (she is a normal hero again)
    await guest.evaluate(() => { const g = window.__game; g.player.buffs.clear(); g.input.keys.add('KeyW'); });
    await step(both, 2);
    const moved = await Promise.all([host.evaluate(() => window.__where(1)), guest.evaluate(() => { window.__game.input.keys.delete('KeyW'); return window.__where(1); })]);
    check('Gwen can move again and the host sees her move', Math.hypot(moved[0].x - hostSees.x, moved[0].z - hostSees.z) > 2 && Math.hypot(moved[0].x - moved[1].x, moved[0].z - moved[1].z) < 4, JSON.stringify([moved[0], moved[1]]));
  });

  // ================================================================ B: the host falls, the guest pays with U
  await match('B (the guest pays for the host)', async (S, host, guest) => {
    const both = [host, guest];
    await host.evaluate(() => { window.__fall(0); window.__game.factions[1].gold = 800; });
    await step(both, 2);
    let r = await Promise.all(both.map((p) => p.evaluate(() => {
      const g = window.__game, f0 = g.factions[0];
      return { elim: f0.eliminated, fallen: g.castles[0].fallen, state: g.state, down: g.fallenAllies(g.localTeam).map((a) => a.team), gold1: Math.floor(g.factions[1].gold) };
    })));
    check('the host is out of the battle on both pages and the game goes on', r.every((x) => x.elim && x.fallen && x.state === 'playing'), JSON.stringify(r));
    check('the guest sees the host as a fallen ally and has the gold', r[1].down.join() === '0' && r[1].gold1 >= 500, JSON.stringify(r[1]));

    // the guest's shop shows the bar, then U does it
    r = await guest.evaluate(() => { const g = window.__game; g.ui.toggleShop(); g.ui.refreshShop(); const out = { bar: window.__vis('#allyBar'), text: window.__txt('#allyBar .al > span') }; g.ui.toggleShop(); return out; });
    check('the guest\'s shop shows the ally bar naming Arthur', r.bar && /Arthur/.test(r.text), JSON.stringify(r));
    await guest.evaluate(() => { const g = window.__game; g.input.pressed.add('KeyU'); window.__frame(); });
    const predicted = await guest.evaluate(() => Math.floor(window.__game.factions[1].gold));
    check('the guest\'s gold drops at once (500 off), before the host has answered', predicted >= 285 && predicted <= 320, String(predicted));
    await step(both, 2);
    const hostSees = await host.evaluate(() => (window.__game.ui.update(0.5), { me: window.__where(0), elim: window.__game.factions[0].elim, f0: window.__game.factions[0].eliminated, overlay: window.__vis('#respawn'), gold1: Math.floor(window.__game.factions[1].gold) }));
    const guestSees = await guest.evaluate(() => ({ host: window.__where(0), elim: window.__game.factions[0].eliminated, gold: Math.floor(window.__game.localFaction.gold), down: window.__game.fallenAllies(1).length }));
    check('the host is alive again and no longer eliminated', hostSees.me.alive && !hostSees.f0 && !hostSees.overlay, JSON.stringify(hostSees));
    check('the host rose in the courtyard of its own keep', hostSees.me.d0 < 3 && hostSees.me.d1 > 40, JSON.stringify([hostSees.me.d0, hostSees.me.d1]));
    check('the guest sees the host alive at its own keep and has paid 500 in all', guestSees.host.alive && guestSees.host.d0 < 3 && guestSees.gold <= 325 && guestSees.gold >= 280 && !guestSees.elim && guestSees.down === 0, JSON.stringify(guestSees));
  });

  console.log(failed ? `FAILED ${failed}` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('RUN ERROR', e); process.exit(2); });
