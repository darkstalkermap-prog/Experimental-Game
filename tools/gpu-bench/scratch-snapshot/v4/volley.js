// The Ranger's volley: hold Q for a circle on the ground, let go and the arrows come down on it.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 1);
  await page.evaluate(() => window.__game.input.endFrame());   // (mouse movement from the click would otherwise turn the hero)
  const out = await page.evaluate(async () => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    const T = {
      key(code, down = true) { const i = g.input; if (down) { if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); } else { if (i.keys.delete(code)) i.up.add(code); } },
      step(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } },
    };
    const res = {};
    // an open patch of ground away from the castles; dummies that stand still and cannot hit back
    const home = new V3(-48, 0, -64);
    const f1 = g.factions[1];
    const dummies = [];
    const place = (type, dx, dz) => {
      const u = g.recruit(f1, type);
      u.pos.set(home.x + dx, g.physics.groundHeight(home.x + dx, home.z + dz, 20), home.z + dz);
      u.homeCastle = g.castles[0];
      u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 };
      u.attackTimer = 99;
      u.update = function (dt) { if (this.staggerT > 0) this.staggerT -= dt; };
      u.hp = u.maxHp = 400;
      dummies.push(u);
      return u;
    };
    p.setClass('ranger');
    p.hp = p.maxHp; p.alive = true; p.abilCd = { q: 0, r: 0 }; p.stamina = 100;
    p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z);
    p.yaw = 0; p.pitch = 0;
    // a pack 30 m ahead (+z), and a second group 14 m off to the side of it
    const pack = [place('swordsman', 0, 30), place('swordsman', 1.5, 31), place('swordsman', -1.5, 29), place('spearman', 2, 28.5), place('swordsman', -2.5, 31.5), place('archer', 0.5, 33)];
    const side = [place('swordsman', 14, 30), place('swordsman', 15.5, 31)];
    g.update(0.001);

    // look at the middle of the pack: slightly down so the sight line meets the ground at about 30 m
    const eye = () => new V3(p.pos.x, p.pos.y + p.eye, p.pos.z);
    p.pitch = -Math.atan2(p.eye, 30) * 0.98;
    T.key('KeyQ');
    T.step(0.35);
    g.ui.updateAbilities(0.016);
    res.aiming = { aiming: !!p.aiming, ring: g.aimRing.main.group.visible, hint: !document.getElementById('aimhint').classList.contains('hidden'), slot: document.getElementById('abilQ').classList.contains('aiming') };
    const at = p.aiming ? p.aiming.at.clone() : null;
    res.at = at && { x: +(at.x - home.x).toFixed(1), z: +(at.z - home.z).toFixed(1), far: p.aiming.far };
    res.cdWhileHolding = p.abilCd.q;
    res.arrowsBefore = g.projectiles.list.length;
    const hp0 = [...pack, ...side].map((u) => u.hp);
    // let go
    T.key('KeyQ', false);
    T.step(0.05);
    res.afterRelease = { aiming: !!p.aiming, ringHidden: !g.aimRing.main.group.visible, cd: +p.abilCd.q.toFixed(1), rain: g.abilities.active.filter((e) => e.kind === 'rain').length, flashes: g.aimRing.flashes.length, rising: g.abilities.rising.length };
    // arrows appear after the delay, come down, and hurt
    T.step(0.4);
    res.at0_4 = { inFlight: g.projectiles.list.length };
    let maxFlight = 0;
    for (let k = 0; k < 90; k++) { T.step(1 / 30, 1 / 30); maxFlight = Math.max(maxFlight, g.projectiles.list.length); }
    res.maxFlight = maxFlight;
    res.packHp = pack.map((u, i) => Math.round(hp0[i] - u.hp));
    res.sideHp = side.map((u, i) => Math.round(hp0[pack.length + i] - u.hp));
    res.rainDone = g.abilities.active.filter((e) => e.kind === 'rain').length;
    res.risingLeft = g.abilities.rising.length;
    res.flashesLeft = g.aimRing.flashes.length;

    // a quick tap fires too (press and release in the same frame)
    p.abilCd = { q: 0, r: 0 };
    p.pitch = -Math.atan2(p.eye, 30) * 0.98;
    T.key('KeyQ'); T.key('KeyQ', false);
    T.step(0.05);
    res.tap = { cd: +p.abilCd.q.toFixed(1), rain: g.abilities.active.filter((e) => e.kind === 'rain').length };
    T.step(3);

    // letting the key go without a release (the window lost focus / a menu opened) must not loose it
    p.abilCd = { q: 0, r: 0 };
    T.key('KeyQ'); T.step(0.2);
    g.input.keys.delete('KeyQ');   // no keyup event
    T.step(0.1);
    res.noRelease = { aiming: !!p.aiming, cd: +p.abilCd.q.toFixed(1), ringHidden: !g.aimRing.main.group.visible };

    // on cooldown: Q does not start an aim
    p.abilCd = { q: 5, r: 0 };
    T.key('KeyQ'); T.step(0.1);
    res.onCooldown = { aiming: !!p.aiming };
    T.key('KeyQ', false); T.step(0.1);

    // R while aiming cancels the aim (and evades)
    p.abilCd = { q: 0, r: 0 };
    T.key('KeyQ'); T.step(0.2);
    const wasAiming = !!p.aiming;
    T.key('KeyR'); T.step(0.05); T.key('KeyR', false);
    res.rCancels = { wasAiming, aiming: !!p.aiming, qCd: +p.abilCd.q.toFixed(1), rCd: +p.abilCd.r.toFixed(1) };
    T.key('KeyQ', false); T.step(0.1);

    // ordinary abilities are untouched: the Mage still casts on a press
    p.setClass('mage'); p.abilCd = { q: 0, r: 0 };
    T.key('KeyQ'); T.step(0.05); T.key('KeyQ', false); T.step(0.05);
    res.mageQ = { aiming: !!p.aiming, cd: +p.abilCd.q.toFixed(1) };
    p.setClass('ranger'); p.abilCd = { q: 0, r: 0 };

    // aiming at the sky: the circle goes out to full range straight ahead, marked far
    p.pitch = 0.6;
    T.key('KeyQ'); T.step(0.2);
    res.sky = { far: p.aiming && p.aiming.far, dist: p.aiming ? +Math.hypot(p.aiming.at.x - p.pos.x, p.aiming.at.z - p.pos.z).toFixed(1) : null };
    T.key('KeyQ', false); T.step(0.1);
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  ok('holding Q shows the circle, the hint and lights the slot', out.aiming.aiming && out.aiming.ring && out.aiming.hint && out.aiming.slot, out.aiming);
  ok('the circle sits where the crosshair meets the ground (about 30 m ahead)', out.at && Math.abs(out.at.z - 30) < 4 && Math.abs(out.at.x) < 2 && !out.at.far, out.at);
  ok('holding Q costs nothing until you let go', out.cdWhileHolding === 0 && out.arrowsBefore === 0, { cd: out.cdWhileHolding, arrows: out.arrowsBefore });
  ok('letting go looses the volley: cooldown, circle hidden, arrows queued, circle marked on the ground', !out.afterRelease.aiming && out.afterRelease.ringHidden && out.afterRelease.cd >= 9 && out.afterRelease.rain === 1 && out.afterRelease.flashes === 1 && out.afterRelease.rising > 0, out.afterRelease);
  ok('arrows come down from the sky in a stream (many at once in flight)', out.maxFlight >= 6, out.maxFlight);
  const packHits = out.packHp.filter((d) => d > 0).length;
  ok('the foes in the circle are hit (most of them)', packHits >= 4, out.packHp);
  ok('the foes outside the circle are not hit', out.sideHp.every((d) => d === 0), out.sideHp);
  ok('the volley and its looks finish', out.rainDone === 0 && out.risingLeft === 0 && out.flashesLeft === 0, { rain: out.rainDone, rising: out.risingLeft, flashes: out.flashesLeft });
  ok('a quick tap looses the volley', out.tap.cd >= 9 && out.tap.rain === 1, out.tap);
  ok('losing the key without a release cancels the aim and keeps the volley', !out.noRelease.aiming && out.noRelease.cd === 0 && out.noRelease.ringHidden, out.noRelease);
  ok('Q on cooldown does not start an aim', !out.onCooldown.aiming, out.onCooldown);
  ok('R cancels the aim and acts as usual', out.rCancels.wasAiming && !out.rCancels.aiming && out.rCancels.qCd === 0 && out.rCancels.rCd > 0, out.rCancels);
  ok('other classes still cast Q on a press', !out.mageQ.aiming && out.mageQ.cd > 0, out.mageQ);
  ok('aiming at the sky puts the circle at full range, marked far', out.sky.far && out.sky.dist > 55, out.sky);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  await browser.close();
})();
