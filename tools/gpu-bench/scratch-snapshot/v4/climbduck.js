// Wall climbing (jump at a castle wall) and ducking (hold C), against the real game, driven by hand.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 1);
  await page.evaluate(() => window.__game.input.endFrame());
  await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    window.T = {
      V3,
      key(code, down = true) { const i = g.input; if (down) { if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); } else { if (i.keys.delete(code)) i.up.add(code); } },
      step(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } },
      // stand at a spot given in castle coordinates, looking at another
      place(ci, lx, lz, fx, fz) {
        const c = g.castles[ci];
        const a = c.toWorld(lx, lz), b = c.toWorld(fx, fz);
        p.pos.set(a.x, g.physics.terrainHeight(a.x, a.z), a.z);
        p.yaw = Math.atan2(b.x - a.x, b.z - a.z);
        p.pitch = 0; p.vel.set(0, 0, 0); p.vy = 0; p.onGround = true; p.stamina = 100; p.climb = null; p.climbCd = 0; p.alive = true;
        p.hp = p.maxHp; p.staggerT = 0;
        g.update(0.001);
      },
      local(ci) { return g.castles[ci].toLocal(p.pos.x, p.pos.z); },
    };
  });
  const run = (fn, ...a) => page.evaluate(fn, ...a);

  // ---- climbing a wall from outside: your own castle (castle 0) only
  const sides = { back: [3, -21.0, 3, -10], left: [-21.0, 3, -10, 3], right: [21.0, -3, 10, -3], front: [10, 21.0, 10, 10] };
  for (const ci of [0, 1, 2, 3]) {
    for (const [name, [lx, lz, fx, fz]] of Object.entries(sides)) {
      const r = await run(([ci, lx, lz, fx, fz]) => {
        const T = window.T, g = window.__game, p = g.player, c = g.castles[ci];
        const said = [];
        const notify = p.notify.bind(p);
        p.notify = (t, i) => { said.push(t); return notify(t, i); };
        p.climbMsgAt = -99;
        T.place(ci, lx, lz, fx, fz);
        const y0 = p.pos.y;
        T.key('Space'); T.step(0.05);
        const started = !!p.climb;
        T.key('Space', false);
        T.step(1.8);
        p.notify = notify;
        const l = T.local(ci);
        return { started, done: !p.climb, rise: +(p.pos.y - y0).toFixed(2), onTop: Math.abs(p.pos.y - (c.center.y + 8)) < 0.06, onGround: p.onGround, local: [+l.x.toFixed(2), +l.z.toFixed(2)], stamina: Math.round(p.stamina), said, hint: p.climbHint };
      }, [ci, lx, lz, fx, fz]);
      if (ci === 0) {
        ok(`your castle, ${name} wall: climbed onto the wall top`, r.started && r.done && r.onTop && r.onGround, r);
        const inside = Math.max(Math.abs(r.local[0]), Math.abs(r.local[1])) < 19.6 && Math.max(Math.abs(r.local[0]), Math.abs(r.local[1])) > 16;
        ok(`your castle, ${name} wall: landed on the walk, behind the battlements`, inside, r.local);
      } else {
        ok(`castle ${ci} (not yours), ${name} wall: no climb, you are told why`, !r.started && !r.onTop && r.said.some((t) => /your own castle/.test(t)) && r.stamina === 100 - 0 || (!r.started && !r.onTop && r.said.some((t) => /your own castle/.test(t))), { started: r.started, said: r.said });
      }
    }
  }

  // ---- once up there: the walk holds, the rail keeps you from walking off the outside
  const walk = await run(() => {
    const T = window.T, g = window.__game, p = g.player, c = g.castles[0];
    T.place(0, 3, -21.0, 3, -10);
    T.key('Space'); T.step(0.05); T.key('Space', false); T.step(1.8);
    const out = { top: +p.pos.y.toFixed(2) };
    T.key('KeyW'); T.step(0.4); T.key('KeyW', false);
    out.afterForward = +p.pos.y.toFixed(2);
    p.yaw += Math.PI;                       // turn round and push outward against the battlements
    T.key('KeyW'); T.step(2); T.key('KeyW', false);
    const l = T.local(0);
    out.outward = { y: +p.pos.y.toFixed(2), z: +l.z.toFixed(2) };
    return out;
  });
  ok('on the walk you stay up there', walk.afterForward === walk.top, walk);
  ok('the battlements keep you from stepping off the outside', Math.abs(walk.outward.y - walk.top) < 0.06 && walk.outward.z > -19.5, walk.outward);

  // ---- things that must NOT climb
  const no = await run(() => {
    const T = window.T, g = window.__game, p = g.player, out = {};
    const tryAt = (label, ci, lx, lz, fx, fz, prep) => {
      T.place(ci, lx, lz, fx, fz);
      if (prep) prep();
      T.key('Space'); T.step(0.05); T.key('Space', false);
      out[label] = { climb: !!p.climb, vy: +p.vy.toFixed(2) };
      T.step(1.6);
      p.climb = null;
    };
    tryAt('courtyard, facing the wall', 0, 3, -15, 3, -25);
    tryAt('outside, facing away', 0, 3, -21.0, 3, -30);
    tryAt('outside, three metres off', 0, 3, -23.5, 3, -10);
    tryAt('outside, facing along the wall', 0, 3, -21.0, 15, -21.0);
    tryAt('too tired', 0, 3, -21.0, 3, -10, () => { p.stamina = 5; });
    tryAt('ducking', 0, 3, -21.0, 3, -10, () => { T.key('KeyC'); T.step(0.4); });
    T.key('KeyC', false); T.step(0.4);
    // a wall that has been battered down is a gap, not a ledge
    const c = g.castles[0];
    const seg = c.walls.find((w) => w.nz === -1 && w.box.x0 <= 3 && 3 <= w.box.x1);
    seg.collider.active = false; seg.alive = false;
    tryAt('a broken wall segment', 0, 3, -21.0, 3, -10);
    seg.collider.active = true; seg.alive = true;
    // a jump onto a low rock or step is still a jump
    return out;
  });
  for (const [k, v] of Object.entries(no)) ok(`no climb: ${k}`, !v.climb, v);
  ok('the courtyard jump is still a jump', no['courtyard, facing the wall'].vy > 3, no['courtyard, facing the wall']);

  // ---- stamina and cooldown
  const cost = await run(() => {
    const T = window.T, g = window.__game, p = g.player;
    T.place(0, 3, -21.0, 3, -10);
    p.stamina = 100;
    T.key('Space'); T.step(0.05); T.key('Space', false);
    const spent = 100 - p.stamina;
    const dur = p.climb.dur;
    T.step(dur + 0.05);
    return { spent: Math.round(spent), dur: +dur.toFixed(2), done: !p.climb, cd: +p.climbCd.toFixed(2) };
  });
  ok('a climb costs stamina, takes about a second, and has a short cooldown', cost.spent >= 15 && cost.dur > 0.9 && cost.dur < 1.4 && cost.done && cost.cd > 0.3 && cost.cd <= 0.7, cost);

  // ---- the stronger the walls, the wider they are: still climbable, still lands behind the rail
  for (const lv of [1, 2, 3]) {
    const r = await run(async (lv) => {
      const T = window.T, g = window.__game, p = g.player, c = g.castles[0];
      c.wallLevel = lv;
      T.step(5);
      T.place(0, 3, -(20.9 + [0, 0.5, 0.7, 1.05][lv]), 3, -10);
      T.key('Space'); T.step(0.05); T.key('Space', false);
      const started = !!p.climb;
      T.step(2);
      const l = T.local(0);
      return { started, top: Math.abs(p.pos.y - (c.center.y + 8)) < 0.06, local: [+l.x.toFixed(2), +l.z.toFixed(2)], seg: c.walls[0].collider.minZ };
    }, lv);
    ok(`wall level ${lv}: climbable, lands on the walk`, r.started && r.top && r.local[1] > -19.5 && r.local[1] < -16, r);
  }

  // ---- from the courtyard: up onto the edge of the wall walk
  const inner = { back: [3, -13.5, 3, -25], left: [-13.5, 10, -25, 10], right: [13.5, 10, 25, 10], front: [8, 13.5, 8, 25] };
  for (const ci of [0]) {
    for (const [name, [lx, lz, fx, fz]] of Object.entries(inner)) {
      const r = await run(([ci, lx, lz, fx, fz]) => {
        const T = window.T, g = window.__game, p = g.player, c = g.castles[ci];
        T.place(ci, lx, lz, fx, fz);
        const y0 = p.pos.y;
        T.key('Space'); T.step(0.05); T.key('Space', false);
        const started = !!p.climb;
        T.step(1.8);
        const l = T.local(ci);
        return { started, done: !p.climb, rise: +(p.pos.y - y0).toFixed(2), onTop: Math.abs(p.pos.y - (c.center.y + 8)) < 0.06, local: [+l.x.toFixed(2), +l.z.toFixed(2)] };
      }, [ci, lx, lz, fx, fz]);
      ok(`castle ${ci}, from the courtyard up onto the ${name} wall walk`, r.started && r.done && r.onTop, r);
    }
  }
  const foreign = await run(() => {
    const T = window.T, g = window.__game, p = g.player, out = {};
    // standing in somebody else's courtyard (castle 2) at the foot of the wall walk, or by the foot of its wall
    T.place(2, 3, -13.5, 3, -25);
    T.key('Space'); T.step(0.05); T.key('Space', false);
    out.theirCourtyard = { climb: !!p.climb, hint: p.climbHint };
    T.step(0.5);
    T.place(2, 3, -21.0, 3, -10);
    T.step(0.3);
    out.theirWall = { hint: p.climbHint };
    return out;
  });
  ok("another house's courtyard: no climbing onto its wall walk", !foreign.theirCourtyard.climb && !foreign.theirCourtyard.hint, foreign.theirCourtyard);
  ok("another house's wall: no prompt either", !foreign.theirWall.hint, foreign.theirWall);
  const under = await run(() => {
    const T = window.T, g = window.__game, p = g.player, out = {};
    T.place(0, 3, -16.5, 3, -25);              // under the planking of the wall walk, facing the wall
    T.key('Space'); T.step(0.05); T.key('Space', false);
    out.underHoarding = { climb: !!p.climb, vy: +p.vy.toFixed(2) };
    T.step(1.2);
    T.place(0, 3, -13.5, 3, -25);              // out in the open, facing the edge of the walk
    T.step(0.3);
    out.hintNear = p.climbHint;
    g.ui.updatePrompt();
    out.prompt = { text: document.getElementById('promptText').textContent, key: document.getElementById('promptKey').textContent, shown: !document.getElementById('prompt').classList.contains('hidden') };
    T.place(0, 3, -13.5, 3, 0);                // looking away
    T.step(0.3);
    out.hintAway = p.climbHint;
    g.ui.updatePrompt();
    out.promptAway = !document.getElementById('prompt').classList.contains('hidden');
    return out;
  });
  ok('no climbing from under the planking of the wall walk', !under.underHoarding.climb, under.underHoarding);
  ok('the prompt says "Space: Climb the wall" next to a wall you face', under.hintNear === true && under.prompt.shown && under.prompt.text === 'Climb the wall' && under.prompt.key === 'Space', under.prompt);
  ok('and goes away when you look elsewhere', under.hintAway === false && !under.promptAway, { hint: under.hintAway, shown: under.promptAway });

  // ---- ducking
  const duck = await run(() => {
    const T = window.T, g = window.__game, p = g.player, out = {};
    p.climb = null;
    T.place(0, 0, -5, 0, 5);
    const team = 1;
    const hitAt = (dy) => !!g.projectiles.hitCharacter(new T.V3(p.pos.x, p.pos.y + dy, p.pos.z), team, 0.15);
    g.grid.clear(); g.grid.insert(p);
    out.stand = { height: p.height, eye: p.eye, head: hitAt(1.5), chest: hitAt(0.9) };
    // speed while walking, standing and then ducked
    const dist = () => { const x0 = p.pos.x, z0 = p.pos.z; T.key('KeyW'); T.step(1); T.key('KeyW', false); T.step(0.6); return Math.hypot(p.pos.x - x0, p.pos.z - z0); };
    T.place(0, 0, -5, 0, 5);
    out.walkStanding = +dist().toFixed(2);
    T.place(0, 0, -5, 0, 5);
    T.key('KeyC'); T.step(0.5);
    g.grid.clear(); g.grid.insert(p);
    out.ducked = { duck: +p.duck.toFixed(2), height: +p.height.toFixed(2), eye: +p.eye.toFixed(2), head: hitAt(1.5), chest: hitAt(0.9), cam: +(g.camera.position.y - p.pos.y).toFixed(2) };
    const d0 = (() => { const x0 = p.pos.x, z0 = p.pos.z; T.key('KeyW'); T.step(1); T.key('KeyW', false); T.step(0.6); return Math.hypot(p.pos.x - x0, p.pos.z - z0); })();
    out.walkDucked = +d0.toFixed(2);
    // no jumping while ducked
    T.place(0, 0, -5, 0, 5);
    T.key('KeyC'); T.step(0.4);
    T.key('Space'); T.step(0.1); T.key('Space', false);
    out.jumpDucked = +p.vy.toFixed(2) + (p.onGround ? 0 : 99);
    // shift does not sprint a ducked hero
    T.key('KeyW'); T.key('ShiftLeft'); T.step(0.8);
    const sp = Math.hypot(p.vel.x, p.vel.z);
    out.sprintDucked = +sp.toFixed(2);
    T.key('KeyW', false); T.key('ShiftLeft', false);
    T.key('KeyC', false); T.step(0.5);
    out.stoodUp = { duck: +p.duck.toFixed(2), height: +p.height.toFixed(2) };
    return out;
  });
  ok('standing: tall, head and chest can be hit', duck.stand.height === 1.8 && duck.stand.head && duck.stand.chest, duck.stand);
  ok('ducked: lower head and hitbox, a shot at head height misses, a chest shot lands', duck.ducked.duck === 1 && duck.ducked.height === 1.2 && !duck.ducked.head && duck.ducked.chest && duck.ducked.cam < 1.2, duck.ducked);
  ok('ducked heroes walk at about half pace', duck.walkDucked < duck.walkStanding * 0.62 && duck.walkDucked > duck.walkStanding * 0.35, { standing: duck.walkStanding, ducked: duck.walkDucked });
  ok('no jump while ducked', duck.jumpDucked === 0, duck.jumpDucked);
  ok('shift does not sprint a ducked hero', duck.sprintDucked < 3.2, duck.sprintDucked);
  ok('releasing C stands the hero back up', duck.stoodUp.duck === 0 && duck.stoodUp.height === 1.8, duck.stoodUp);

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  await browser.close();
})();
