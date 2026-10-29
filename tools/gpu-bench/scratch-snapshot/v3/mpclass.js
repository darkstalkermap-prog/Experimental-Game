// Multiplayer: a guest changes class in the field; the host applies it, the guest's and the host's copies agree.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { session, startMatch, step } = require(S + 'v2/mplib');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
(async () => {
  const T = await session('relay');
  const { page: hostPage, code } = await T.host('Arthur');
  const guest = await T.join(code, 'Gwen', 'guest');
  await hostPage.waitForTimeout(400);
  await startMatch(T, hostPage, [guest], { coop: false });
  const all = [hostPage, guest];
  await step(all, 2);

  const gstate = () => guest.evaluate(() => { const p = window.__game.player; return { cls: p.classId, hp: Math.round(p.hp), max: p.maxHp, q: +p.abilCd.q.toFixed(1), horse: p.hasHorse }; });
  const hcopy = () => hostPage.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { cls: h.classId, hp: Math.round(h.hp), max: h.maxHp, q: +h.abilCd.q.toFixed(1), horse: h.hasHorse, tag: !!h.tag }; });

  let g0 = await gstate();
  check('guest starts as a knight', g0.cls === 'knight', JSON.stringify(g0));

  // in the preparation: free
  let ok = await guest.evaluate(() => window.__game.localSwitchClass('cavalier'));
  await step(all, 1);
  let g1 = await gstate(), h1 = await hcopy();
  check('guest switches to Cavalier during the preparation', ok && g1.cls === 'cavalier' && h1.cls === 'cavalier', JSON.stringify({ g1, h1 }));
  check('health follows the class on both sides', g1.max === h1.max && g1.hp === h1.hp, JSON.stringify({ g1, h1 }));
  check('the Cavalier has a horse on both sides', g1.horse && h1.horse);
  check('abilities are on a short cooldown on both sides', g1.q > 3 && h1.q > 3, JSON.stringify({ g1, h1 }));

  // the host sees the guest's name tag change
  const tag1 = await hostPage.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return h.tag.material.map.image.toDataURL().length; });

  // wave 1 begins
  await hostPage.evaluate(() => { window.__game.phaseT = 0.1; });
  await step(all, 2);
  // the rules apply now: cooldown after a switch
  await guest.evaluate(() => { const p = window.__game.player; p.classAt = -99; p.lastHurt = -99; });
  await hostPage.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); h.classAt = -99; h.lastHurt = -99; });
  ok = await guest.evaluate(() => window.__game.localSwitchClass('mage'));
  await step(all, 1);
  const g2 = await gstate(), h2 = await hcopy();
  check('guest switches to Mage in the field', ok && g2.cls === 'mage' && h2.cls === 'mage', JSON.stringify({ g2, h2 }));
  const tag2 = await hostPage.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return h.tag.material.map.image.toDataURL().length; });
  check("the host's name tag over the guest was redrawn", tag1 !== tag2, `${tag1} vs ${tag2}`);
  // too soon after: refused locally, and the host refuses a forced request too
  ok = await guest.evaluate(() => window.__game.localSwitchClass('ranger'));
  await guest.evaluate(() => window.__game.net.toHost({ a: 'class', cls: 'ranger' }));   // bypass the local check
  await step(all, 1);
  const g3 = await gstate(), h3 = await hcopy();
  check('an early change is refused', ok === false && g3.cls === 'mage' && h3.cls === 'mage', JSON.stringify({ ok, g3, h3 }));
  // while being hit: the host's own rule
  await guest.evaluate(() => { const p = window.__game.player; p.classAt = -99; });
  await hostPage.evaluate(() => { const g = window.__game, h = g.humans.find((x) => x.team === 1); h.classAt = -99; h.lastHurt = g.time; });
  await guest.evaluate(() => window.__game.net.toHost({ a: 'class', cls: 'ranger' }));
  await step(all, 0.6);
  const h4 = await hcopy();
  check('the host refuses a change in the middle of a fight', h4.cls === 'mage', JSON.stringify(h4));
  // the guest's ability works with the new class (the host accepts Fireball after the 6 s)
  await hostPage.evaluate(() => { const g = window.__game, h = g.humans.find((x) => x.team === 1); h.lastHurt = -99; });
  await step(all, 6);
  const fb = await guest.evaluate(() => { const g = window.__game, p = g.player; const before = p.abilCd.q; g.player.useAbility('q', g.input); return { before, after: p.abilCd.q }; });
  await step(all, 0.5);
  const hq = await hcopy();
  check('the new class abilities work for the guest on the host', fb.before === 0 && fb.after > 3 && hq.q > 3, JSON.stringify({ fb, hq }));

  // other heroes (the host as seen by the guest): host switches, guest sees it
  await hostPage.evaluate(() => { const g = window.__game, p = g.player; p.classAt = -99; p.lastHurt = -99; g.localSwitchClass('berserker'); });
  await step(all, 1);
  const seen = await guest.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 0); return { cls: h.classId, tag: !!h.tag }; });
  check("a host's change shows on the guest's screen", seen.cls === 'berserker', JSON.stringify(seen));

  console.log('errors:\n' + (T.errors.join('\n') || 'none'));
  await T.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
