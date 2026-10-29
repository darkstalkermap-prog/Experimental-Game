// Online: a guest learns talents through the host. The host applies its own rules (points, level, parent, class, home),
// the guest's copy follows the snapshot (talents, stats, health), a talent really changes what the guest's abilities do on
// the host, and a class change, death and respec behave.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { session, startMatch } = require(S + 'v2/mplib');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const stepper = (all) => async (secs, dt = 1 / 30) => {
  const slices = Math.ceil(secs / 0.25), n = Math.round(0.25 / dt);
  for (let i = 0; i < slices; i++) {
    for (const p of all) await p.evaluate(([n, dt]) => { const g = window.__game; g.paused = false; for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } }, [n, dt]);
    await all[0].waitForTimeout(25);
  }
};
(async () => {
  const T = await session('relay');
  const { page: host, code } = await T.host('Arthur');
  const guest = await T.join(code, 'Gwen', 'guest');
  await host.waitForTimeout(600);
  await startMatch(T, host, [guest], { coop: false });
  const all = [host, guest];
  const step = stepper(all);
  await step(2);
  await host.evaluate(() => { window.__game.phaseT = 1e6; });   // no waves while we test

  // (the level reaches a guest as me.lvl once the level system is merged; until then both sides are told by hand)
  const setLevel = async (n) => {
    await guest.evaluate((n) => window.__game.player.setLevel(n), n);
    await host.evaluate((n) => window.__game.humans.find((h) => h.team === 1).setLevel(n), n);
  };
  const hostCopy = () => host.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { cls: h.classId, talents: Object.keys(h.talents).sort().join(), points: h.talentPoints, maxHp: h.maxHp, mods: JSON.stringify(h.mods), hp: Math.round(h.hp) }; });
  const mine = () => guest.evaluate(() => { const p = window.__game.player; return { cls: p.classId, talents: Object.keys(p.talents).sort().join(), points: p.talentPoints, maxHp: p.maxHp, mods: JSON.stringify(p.mods), hp: Math.round(p.hp), toast: document.querySelector('#toasts .toast')?.textContent || '' }; });
  const ask = (msg) => guest.evaluate((m) => window.__game.net.toHost(m), msg);   // a raw request, as a modified client could send
  const clearToasts = () => guest.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
  const toasts = () => guest.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent).join(' | '));

  let h = await hostCopy(), g = await mine();
  ok('the guest starts as a Knight with no talents on both sides', g.cls === 'knight' && h.cls === 'knight' && g.talents === '' && h.talents === '' && g.points === 0, { g, h });

  // ---- the host's rules
  await clearToasts();
  await ask({ a: 'talent', id: 'kn_boss' });
  await step(1);
  h = await hostCopy();
  ok('level 1: the host refuses, and tells the guest why', h.talents === '' && /Needs level 2/.test(await toasts()), { h: h.talents, toasts: await toasts() });

  await setLevel(2);
  await clearToasts();
  ok('the local check agrees: a locked talent is refused on the guest without a message', (await guest.evaluate(() => window.__game.localLearnTalent('kn_hold'))) === false && /Needs level 3/.test(await toasts()));
  const before = await mine();
  ok('level 2 gives the guest one point (the guest\'s copy)', before.points === 1, before);
  ok('learning through the UI path sends the request', (await guest.evaluate(() => window.__game.localLearnTalent('kn_plate'))) === true);
  await step(1);
  h = await hostCopy(); g = await mine();
  ok('the host learnt it for the guest', h.talents === 'kn_plate' && h.points === 0, h);
  ok("the guest's copy follows the snapshot: talents, points and stats", g.talents === 'kn_plate' && g.points === 0 && g.mods === h.mods && g.maxHp === h.maxHp && g.maxHp > before.maxHp, { g, h, before: before.maxHp });
  ok('health kept its share (host and guest agree)', g.hp === h.hp && g.hp === g.maxHp, { g: g.hp, h: h.hp });
  ok('the guest was told', /Talent learnt: Tempered Plate/.test(g.toast), g.toast);

  // forged and out-of-turn requests
  const tries = [
    ['kn_boss', 'no point left', /No talent points left/],
    ['mg_blast', "another class's talent", /talent of the mage/i],
    ['kn_plate', 'already learnt', /Already learnt/],
    ['nonsense', 'an unknown id', /No such talent/],
  ];
  for (const [id, what, re] of tries) {
    await clearToasts();
    await ask({ a: 'talent', id });
    await step(0.8);
    h = await hostCopy();
    ok(`the host refuses ${what} (${id})`, h.talents === 'kn_plate' && re.test(await toasts()), { talents: h.talents, toasts: await toasts() });
  }
  for (const bad of [null, 7, { x: 1 }, undefined]) {
    await ask({ a: 'talent', id: bad });
  }
  await step(0.8);
  h = await hostCopy();
  ok('garbage ids change nothing', h.talents === 'kn_plate', h);

  await setLevel(3);
  await clearToasts();
  await ask({ a: 'talent', id: 'kn_ram' });          // tier 3 at level 3, parents missing
  await step(0.6);
  ok('a tier above the level is refused', (await hostCopy()).talents === 'kn_plate' && /Needs level 4/.test(await toasts()), await toasts());
  await setLevel(4);
  await clearToasts();
  await ask({ a: 'talent', id: 'kn_rattle' });       // level and a point are there, its parent (Spiked Boss) is not
  await step(0.6);
  ok('the parent is required (the host says which)', (await hostCopy()).talents === 'kn_plate' && /Needs Spiked Boss/.test(await toasts()), await toasts());

  // ---- an effect on the host: Shield Bash stuns longer with Spiked Boss + Skull Rattler
  // put the guest on open ground, facing +z; the host's copy of the guest follows its pose
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.pos.set(-48, g.physics.groundHeight(-48, -64, 20), -64); p.yaw = 0; p.pitch = 0; p.vel.set(0, 0, 0); });
  await step(1);
  const bashOnce = async () => {
    await host.evaluate(() => {
      const g = window.__game, hh = g.humans.find((x) => x.team === 1);
      hh.abilCd = { q: 0, r: 0 }; hh.staggerT = 0;
      for (const u of g.units) if (u.dummy) { u.alive = false; u.mesh.visible = false; }
      const u = g.recruit(g.factions[0], 'swordsman');
      u.dummy = true;
      u.pos.set(hh.pos.x, g.physics.groundHeight(hh.pos.x, hh.pos.z + 3, 20), hh.pos.z + 3);
      u.homeCastle = g.castles[0]; u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 };
      u.update = function () {}; u.attackTimer = 99; u.hp = u.maxHp = 400;
      window.__dummy = u;
      g.update(0.001);   // (the spatial grid is rebuilt on update: the dummy must be in it before the guest's request arrives)
    });
    await guest.evaluate(() => { const g = window.__game, p = g.player; p.abilCd = { q: 0, r: 0 }; p.staggerT = 0; p.useAbility('q', g.input); });
    await step(0.5);
    return host.evaluate(() => ({ stun: +window.__dummy.staggerT.toFixed(2), loss: Math.round(400 - window.__dummy.hp) }));
  };
  const plain = await bashOnce();
  await guest.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
  await setLevel(5);
  await ask({ a: 'talent', id: 'kn_boss' });
  await step(0.6);
  await ask({ a: 'talent', id: 'kn_rattle' });
  await step(1);
  h = await hostCopy(); g = await mine();
  ok('level 5: four points, and the host learnt the two Bash talents', h.talents === 'kn_boss,kn_plate,kn_rattle' && g.talents === h.talents && g.points === 1, { h: h.talents, g: g.talents, points: g.points });
  const boosted = await bashOnce();
  ok("the guest's Shield Bash stuns longer and hits harder on the host with the talents", plain.stun > 1.4 && boosted.stun > plain.stun + 0.7 && boosted.loss > plain.loss * 1.15, { plain, boosted });

  // ---- respec: refused away from home (the host decides from where the guest is), allowed at home
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.pos.set(0, g.physics.terrainHeight(0, 0), 0); });
  await step(1);
  await clearToasts();
  const local = await guest.evaluate(() => window.__game.localRespec());
  await ask({ a: 'respec' });                       // bypass the local check: the host looks for itself
  await step(0.8);
  h = await hostCopy();
  ok('away from the castle a respec is refused (locally and by the host) and nothing is lost', local === false && h.talents === 'kn_boss,kn_plate,kn_rattle' && /Only at your own castle/.test(await toasts()), { local, talents: h.talents, toasts: await toasts() });
  await guest.evaluate(() => { const g = window.__game, p = g.player, c = g.castles[p.team]; const w = c.toWorld(0, 0); p.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z); });
  await step(1.2);
  await clearToasts();
  ok('at home the guest asks for a respec', (await guest.evaluate(() => window.__game.localRespec())) === true);
  await step(1);
  h = await hostCopy(); g = await mine();
  ok('the host gave every point back, and the guest follows (talents, stats, health)', h.talents === '' && g.talents === '' && g.points === 4 && g.maxHp === h.maxHp && g.mods === h.mods && g.maxHp === Math.round(220 * 1.3 * 1.28), { h, g });
  ok('the guest was told', /given back/.test(await toasts()), await toasts());

  // ---- Twin Roll across the network: the second roll is accepted by the host
  await guest.evaluate(() => window.__game.localSwitchClass('ranger'));   // (free during the preparation)
  await step(1.5);
  h = await hostCopy(); g = await mine();
  ok('switching class in the preparation keeps the level, no talents', g.cls === 'ranger' && h.cls === 'ranger' && g.talents === '' && h.talents === '' && g.points === 4, { g, h });
  await guest.evaluate(() => { const g = window.__game; g.localLearnTalent('rg_light'); });
  await step(0.5);
  await guest.evaluate(() => { const g = window.__game; g.localLearnTalent('rg_twin'); });
  await step(1);
  h = await hostCopy(); g = await mine();
  ok('Ranger talents learnt through the UI path', h.talents === 'rg_light,rg_twin' && g.talents === h.talents && g.mods === h.mods, { h: h.talents, g: g.talents });
  const speeds = await guest.evaluate(() => { const p = window.__game.player; return { speed: +p.speedMult.toFixed(3), draw: +p.drawTime.toFixed(3) }; });
  ok("the guest's own speed and draw time use the talents (client-side stats)", Math.abs(speeds.speed - 1.1 * 1.04 * 1.06) < 0.002 && Math.abs(speeds.draw - 0.85 * 0.8 * 0.9) < 0.002, speeds);
  await guest.evaluate(() => { const p = window.__game.player; p.abilCd = { q: 0, r: 0 }; });
  await host.evaluate(() => { const hh = window.__game.humans.find((x) => x.team === 1); hh.abilCd = { q: 0, r: 0 }; hh.buffs.clear(); });
  await step(0.3);
  const roll = async () => guest.evaluate(() => { const g = window.__game, p = g.player; const before = p.abilCd.r, was = !!p.dash; p.useAbility('r', g.input); return { cd: +p.abilCd.r.toFixed(2), dashed: !!p.dash, twin: p.buffs.has('twin'), before }; });
  const r1 = await roll();
  await step(0.8);
  const hostAfter1 = await host.evaluate(() => { const hh = window.__game.humans.find((x) => x.team === 1); return { twin: hh.buffs.has('twin'), cd: +hh.abilCd.r.toFixed(2) }; });
  const guestMid = await guest.evaluate(() => { const p = window.__game.player; return { twin: p.buffs.has('twin'), cd: +p.abilCd.r.toFixed(2) }; });
  const r2 = await roll();
  await step(0.3);
  const hostAfter2 = await host.evaluate(() => { const hh = window.__game.humans.find((x) => x.team === 1); return { twin: hh.buffs.has('twin'), ghost: hh.buffs.has('ghost'), cd: +hh.abilCd.r.toFixed(2) }; });
  const r3 = await roll();
  ok('the first roll starts the cooldown and opens the window on the host, and the guest sees it', r1.dashed && r1.cd > 6 && hostAfter1.twin && hostAfter1.cd > 5 && guestMid.twin, { r1, hostAfter1, guestMid });
  ok('the second roll goes through on both sides without restarting the cooldown, and the host gives the evasion again', r2.dashed && r2.twin === false && hostAfter2.ghost && hostAfter2.twin === false && hostAfter2.cd < hostAfter1.cd, { r2, hostAfter2 });
  ok('a third roll is refused by the guest', r3.dashed === false, r3);

  // ---- death: talents stay
  await guest.evaluate(() => { const g = window.__game; g.localLearnTalent('rg_focus'); });   // level 5, third point
  await step(1);
  h = await hostCopy();
  ok('a third talent (tier 3)', h.talents === 'rg_focus,rg_light,rg_twin', h);
  await host.evaluate(() => { const hh = window.__game.humans.find((x) => x.team === 1); hh.takeDamage(99999, null, {}); });
  await step(2);
  ok('the guest is dead on both sides', (await guest.evaluate(() => !window.__game.player.alive)) && (await host.evaluate(() => !window.__game.humans.find((x) => x.team === 1).alive)));
  await step(45);
  h = await hostCopy(); g = await mine();
  ok('talents survive death and respawn, on both sides', (await guest.evaluate(() => window.__game.player.alive)) && h.talents === 'rg_focus,rg_light,rg_twin' && g.talents === h.talents, { h: h.talents, g: g.talents });

  // ---- a class change clears them everywhere
  await host.evaluate(() => { const hh = window.__game.humans.find((x) => x.team === 1); hh.classAt = -99; hh.lastHurt = -99; });
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.classAt = -99; p.lastHurt = -99; const c = g.castles[p.team]; const w = c.toWorld(0, 0); p.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z); });
  await step(1);
  await guest.evaluate(() => window.__game.localSwitchClass('mage'));
  await step(1.5);
  h = await hostCopy(); g = await mine();
  ok('a class change clears the talents (and the points come back) on both sides', h.cls === 'mage' && g.cls === 'mage' && h.talents === '' && g.talents === '' && g.points === 4, { h, g });
  const tab = await guest.evaluate(() => { const ui = window.__game.ui; ui.tab = 'talents'; ui.toggleShop(true); const out = { head: document.querySelector('.tal-head h5').textContent, nodes: document.querySelectorAll('.tnode').length, learned: document.querySelectorAll('.tnode.learned').length }; ui.toggleShop(false); return out; });
  ok("the guest's Talents tab shows the new class's tree", /Mage/.test(tab.head) && tab.nodes === 7 && tab.learned === 0, tab);

  console.log('errors:\n' + (T.errors.join('\n') || 'none'));
  await T.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
