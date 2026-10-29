// Pings and markers, single player: middle click, classification, the held-button wheel, marker limits, map clicks
// (big map and HUD minimap, with the mouse free), the rate limit, the maps' own transform, sounds, edge arrows.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!ok) failed++; };

(async () => {
  // a roomier window than the usual 320x200: the big map has to be big enough to click to within a metre
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1100, height: 800 } });
  await L.startSingle(page);
  await page.evaluate(() => {
    const g = window.__game;
    window.T = {
      frame(dt = 1 / 60) { g.paused = false; g.player.buffs.add('ghost', 30); g.update(dt); g.input.endFrame(); },   // (nothing touches the hero: a tower archer or a roaming foe must not end the test)
      run(secs, dt = 0.1) { const n = Math.round(secs / dt); for (let i = 0; i < n; i++) T.frame(dt); },
      // the hero stands at (x, z) and looks at the world point (tx, ty, tz)
      look(x, z, tx, ty, tz) {
        const p = g.player;
        p.pos.set(x, g.physics.terrainHeight(x, z), z); p.vel.set(0, 0, 0); p.vy = 0;
        const ey = p.pos.y + p.eye, hd = Math.hypot(tx - x, tz - z);
        p.yaw = Math.atan2(tx - x, tz - z); p.pitch = Math.atan2(ty - ey, hd);
        T.frame(1 / 60);
      },
      // a still foe/friend of a house, standing at (x, z)
      stand(team, x, z) {
        const u = g.units.find((o) => o.team === team && !o.isHero && o.alive && !o.stoodHere);
        u.update = () => {}; u.stoodHere = true;
        u.pos.set(x, g.physics.terrainHeight(x, z), z);
        return u;
      },
      mapPx(canvas, x, z) { const r = canvas.getBoundingClientRect(); return { x: r.left + ((x + __cfg.half) / (2 * __cfg.half)) * r.width, y: r.top + ((z + __cfg.half) / (2 * __cfg.half)) * r.height }; },
    };
    window.__snd = [];
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (n, p) => { __snd.push(n); return orig(n, p); };
  });
  const cfg = await page.evaluate(async () => { const c = await import('/src/config.js'); window.__cfg = { half: c.WORLD.half, playHalf: c.WORLD.playHalf }; return window.__cfg; });
  console.log('map', JSON.stringify(cfg));
  await page.evaluate(() => T.run(1));

  // ------------------------------------------------------------------ the Input twin and the fields
  let r = await page.evaluate(() => {
    const g = window.__game, m = g.input.mouse, i = g.input.idle.mouse;
    const f = ['middle', 'middlePressed', 'middleReleased'];
    return { real: f.map((k) => k in m), idle: f.map((k) => k in i) };
  });
  check('Input.mouse and its idle twin have middle / middlePressed / middleReleased', r.real.every(Boolean) && r.idle.every(Boolean), r);

  // ------------------------------------------------------------------ 1. a middle click pings the ground; data + beacon + minimap marker; it expires
  const base = await page.evaluate(() => {
    const g = window.__game;
    T.look(30, 30, 30, g.physics.terrainHeight(30, 12), 12);          // 18 m ahead (towards -z), on the ground
    g.ui.drawMinimap();
    const k = 180 / (2 * __cfg.half), px = (30 + __cfg.half) * k, pz = (12 + __cfg.half) * k;
    const c = g.ui.mini.getContext('2d');
    window.__bg = Array.from(c.getImageData(Math.round(px) - 14, Math.round(pz) - 14, 28, 28).data);
    return { aim: g.pings.aim(), px, pz };
  });
  check('the crosshair on bare ground classifies as Go here', base.aim && base.aim.type === 0 && base.aim.what === 'ground' && Math.abs(base.aim.z - 12) < 1.5, base.aim);

  // the real thing: a mouse button event from the browser, a short press
  await page.evaluate(() => { document.querySelector('#app canvas').dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true })); });
  r = await page.evaluate(() => { const m = window.__game.input.mouse; return { middle: m.middle, pressed: m.middlePressed }; });
  check('a real middle mousedown sets Input.mouse.middle / middlePressed (pointer locked)', r.middle && r.pressed, r);
  await page.evaluate(() => { T.frame(1 / 30); });
  await page.evaluate(() => { window.dispatchEvent(new MouseEvent('mouseup', { button: 1 })); });
  r = await page.evaluate(() => { const m = window.__game.input.mouse; return { middle: m.middle, released: m.middleReleased }; });
  check('mouseup sets middleReleased and clears middle', !r.middle && r.released, r);
  await page.evaluate(() => { T.frame(1 / 30); });
  await page.evaluate(() => { T.frame(1 / 30); });                        // (the beacon fades in over 0.12 s)
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, it = P.items[0];
    g.ui.drawMinimap();
    const c = g.ui.mini.getContext('2d');
    const k = 180 / (2 * __cfg.half), px = Math.round((30 + __cfg.half) * k), pz = Math.round((12 + __cfg.half) * k);
    const now = Array.from(c.getImageData(px - 14, pz - 14, 28, 28).data);
    let changed = 0;
    for (let i = 0; i < now.length; i += 4) if (Math.abs(now[i] - __bg[i]) + Math.abs(now[i + 1] - __bg[i + 1]) + Math.abs(now[i + 2] - __bg[i + 2]) > 60) changed++;
    const sprite = it && it.vis.spr;
    return {
      n: P.items.length, type: it && it.type, marker: it && it.marker, ttl: it && it.ttl, team: it && it.team, mine: it && it.mine, x: it && it.x, z: it && it.z, y: it && it.y,
      group: P.group.children.length, parts: it && it.vis.group.children.length, at: it && it.vis.group.position.toArray().map((v) => +v.toFixed(1)),
      sprite: sprite && sprite.material.opacity > 0, beam: it && it.vis.beam.material.opacity > 0, label: it && it.vis.label, changed,
      toast: document.querySelectorAll('#toasts .toast').length, snd: __snd.slice(),
    };
  });
  check('a quick middle click leaves one ping (data): Go here, 6 s, mine, at the crosshair', r.n === 1 && r.type === 0 && r.marker === false && r.ttl === 6 && r.mine && r.team === 0 && Math.abs(r.z - 12) < 1.5, r);
  check('its beacon is in the world (group, beam, rings, icon sprite at the spot)', r.group === 1 && r.parts === 4 && r.sprite && r.beam && Math.abs(r.at[0] - 30) < 0.5, r);
  check('the icon carries a distance label ("18 m")', /^1[7-9] m$/.test(r.label), r.label);
  check('the HUD minimap shows it (pixels changed round the spot)', r.changed > 25, r.changed);
  check("the sender hears it and gets no toast (that is for team mates)", r.snd.includes('pingGo') && r.toast === 0, { snd: r.snd, toast: r.toast });
  await page.evaluate(() => T.run(5.0));
  r = await page.evaluate(() => ({ n: window.__game.pings.items.length }));
  check('still there after 5 s', r.n === 1, r);
  await page.evaluate(() => T.run(1.2));
  r = await page.evaluate(() => { const P = window.__game.pings; return { n: P.items.length, group: P.group.children.length, arrows: document.querySelectorAll('#pingLayer .pg').length }; });
  check('gone after about 6 s (data, beacon and arrow element)', r.n === 0 && r.group === 0 && r.arrows === 0, r);

  // ------------------------------------------------------------------ 2. context classification
  r = await page.evaluate(() => {
    const g = window.__game, c0 = g.castles[0], c1 = g.castles[1], out = {};
    const clear = () => { g.pings.reset(); T.run(0.7); };
    // an enemy soldier, 12 m ahead
    const foe = T.stand(1, 40, 20);
    T.look(40, 32, 40, foe.pos.y + 1.0, 20);
    out.foe = g.pings.aim();
    // a friend
    const friend = T.stand(0, 50, 20);
    T.look(50, 32, 50, friend.pos.y + 1.0, 20);
    out.friend = g.pings.aim();
    // a dead enemy is not a target: the ping falls through to the ground behind
    foe.alive = false;
    T.look(40, 32, 40, foe.pos.y + 1.0, 20);
    out.dead = g.pings.aim();
    foe.alive = true;
    // enemy castle wall, from outside (in front of its gate side)
    const w1 = c1.toWorld(10, 19, 4), s1 = c1.toWorld(10, 40);
    T.look(s1.x, s1.z, w1.x, w1.y, w1.z);
    out.foeWall = g.pings.aim();
    out.foeWallDist = Math.hypot(out.foeWall.x - w1.x, out.foeWall.z - w1.z);
    // their keep, from the courtyard side... (from outside, over the wall: the wall is hit first, still theirs)
    const w0 = c0.toWorld(10, 19, 4), s0 = c0.toWorld(10, 40);
    T.look(s0.x, s0.z, w0.x, w0.y, w0.z);
    out.ownWall = g.pings.aim();
    // their gate, shut
    const gt = c1.toWorld(0, 19.5, 2), sg = c1.toWorld(0, 36);
    T.look(sg.x, sg.z, gt.x, gt.y, gt.z);
    out.foeGate = g.pings.aim();
    // a tower of theirs (no ref: found by where it stands)
    const tw = c1.toWorld(-22.5, 22.5, 6), st = c1.toWorld(-22.5, 44);
    T.look(st.x, st.z, tw.x, tw.y, tw.z);
    out.foeTower = g.pings.aim();
    // a fallen castle is only ground
    c1.fallen = true;
    T.look(s1.x, s1.z, w1.x, w1.y, w1.z);
    out.fallen = g.pings.aim();
    c1.fallen = false;
    // siege engines
    const ram = g.buildSiege(g.factions[1], 'ram'); ram.update = () => {};
    ram.pos.set(-40, g.physics.terrainHeight(-40, 20), 20);
    for (const u of g.units) if (u.crewOf === ram) u.pos.set(-300, 0, -300);       // (its crew out of the way)
    T.look(-40, 34, -40, ram.pos.y + 1.2, 20);
    out.foeRam = g.pings.aim();
    const myRam = g.buildSiege(g.factions[0], 'catapult'); myRam.update = () => {};
    myRam.pos.set(-60, g.physics.terrainHeight(-60, 20), 20);
    for (const u of g.units) if (u.crewOf === myRam) u.pos.set(-300, 0, -300);
    T.look(-60, 34, -60, myRam.pos.y + 1.2, 20);
    out.myRam = g.pings.aim();
    // the sky
    T.look(30, 30, 30, 200, -150);
    out.sky = g.pings.aim();
    // far away at the edge: the point is moved back inside the play area
    T.look(0, 20, 0, 0, -400);
    out.edge = g.pings.aim();
    return out;
  });
  const T3 = (a) => a && { type: a.type, what: a.what };
  check('an enemy soldier: Attack', r.foe && r.foe.type === 1 && r.foe.what === 'soldier', T3(r.foe));
  check('an ally (your own house): Defend', r.friend && r.friend.type === 2, T3(r.friend));
  check('a dead soldier is no target (the ping falls to the ground behind it)', r.dead && r.dead.type === 0 && r.dead.what === 'ground', T3(r.dead));
  check("an enemy castle's wall: Attack", r.foeWall && r.foeWall.type === 1 && r.foeWall.what === 'castle' && r.foeWallDist < 3, { ...T3(r.foeWall), dist: +r.foeWallDist.toFixed(1) });
  check('your own castle wall: Defend', r.ownWall && r.ownWall.type === 2 && r.ownWall.what === 'castle', T3(r.ownWall));
  check("an enemy's shut gate: Attack", r.foeGate && r.foeGate.type === 1, T3(r.foeGate));
  check("an enemy's tower: Attack", r.foeTower && r.foeTower.type === 1 && r.foeTower.what === 'castle', T3(r.foeTower));
  check('a fallen castle counts as ground', r.fallen && r.fallen.type === 0, T3(r.fallen));
  check('an enemy siege engine: Attack', r.foeRam && r.foeRam.type === 1 && r.foeRam.what === 'engine', T3(r.foeRam));
  check('your own siege engine: Defend', r.myRam && r.myRam.type === 2 && r.myRam.what === 'engine', T3(r.myRam));
  check('looking at the sky: nothing to ping', r.sky === null, r.sky);
  check('a spot beyond the play area is brought back inside it', r.edge === null || (Math.abs(r.edge.z) <= 144.01 && Math.abs(r.edge.x) <= 144.01), r.edge && { x: r.edge.x, z: r.edge.z });

  // ping an enemy through the middle button, and check what is made of it
  r = await page.evaluate(() => {
    const g = window.__game;
    g.pings.reset(); __snd.length = 0;
    const foe = g.units.find((u) => u.stoodHere && u.team === 1);
    foe.alive = true; foe.pos.set(40, g.physics.terrainHeight(40, 20), 20);
    T.look(40, 32, 40, foe.pos.y + 1.0, 20);
    T.run(0.7);
    g.input.mouse.middlePressed = g.input.mouse.middle = true; T.frame(1 / 60);
    g.input.mouse.middle = false; g.input.mouse.middleReleased = true; T.frame(1 / 60);
    const it = g.pings.items[0];
    return { n: g.pings.items.length, type: it && it.type, snd: __snd.slice(), at: it && [it.x, it.z] };
  });
  check('middle-click on an enemy leaves an Attack ping on it, with the Attack sound', r.n === 1 && r.type === 1 && r.snd.includes('pingAttack') && Math.abs(r.at[0] - 40) < 0.5, r);
  // (the still soldiers and engines have done their job: out of the way of the next tests)
  await page.evaluate(() => { for (const u of window.__game.units) if (u.stoodHere) u.pos.set(-300, 0, -300); });

  // ------------------------------------------------------------------ 3. hold: the wheel opens, mouse movement picks, release places
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    P.reset(); T.run(0.7);
    T.look(40, 32, 40, g.physics.terrainHeight(40, 14), 14);
    const yaw0 = g.player.yaw, pitch0 = g.player.pitch;
    const canvas = document.querySelector('#app canvas');
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true }));
    for (let i = 0; i < 6; i++) T.frame(1 / 30);                       // 0.2 s: not yet
    out.early = { state: P.state, hidden: document.getElementById('pingWheel').classList.contains('hidden') };
    for (let i = 0; i < 5; i++) T.frame(1 / 30);                       // past 0.3 s
    out.open = { state: P.state, hidden: document.getElementById('pingWheel').classList.contains('hidden'), grab: !!g.input.grab, slots: document.querySelectorAll('#pingWheel .pw').length };
    // real mouse movement: towards the right-and-up (Attack's slot)
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 48, movementY: -15 }));
    T.frame(1 / 30);
    out.attack = { pick: P.pick, sel: [...document.querySelectorAll('#pingWheel .pw')].findIndex((e) => e.classList.contains('sel')), hub: document.querySelector('#pingWheel .hub b').textContent };
    out.view = { dyaw: +(g.player.yaw - yaw0).toFixed(4), dpitch: +(g.player.pitch - pitch0).toFixed(4) };
    // swing round to the lower left: Danger
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: -150, movementY: 200 }));
    T.frame(1 / 30);
    out.danger = { pick: P.pick, hub: document.querySelector('#pingWheel .hub b').textContent };
    // back to Attack, with the stick pushed all the way
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 400, movementY: -150 }));
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: -50 }));
    T.frame(1 / 30);
    out.attack2 = { pick: P.pick, stick: Math.hypot(P.stick.x, P.stick.y) };
    window.dispatchEvent(new MouseEvent('mouseup', { button: 1 }));
    T.frame(1 / 30);
    const it = P.items[0];
    out.placed = { n: P.items.length, type: it && it.type, marker: it && it.marker, ttl: it && it.ttl, z: it && it.z, state: P.state, hidden: document.getElementById('pingWheel').classList.contains('hidden'), grab: g.input.grab };
    out.viewAfter = { dyaw: +(g.player.yaw - yaw0).toFixed(4) };
    return out;
  });
  check('holding the middle button < 0.3 s does not open the wheel', r.early.state === 'down' && r.early.hidden, r.early);
  check('holding it past 0.3 s opens the wheel (5 slots, mouse grabbed)', r.open.state === 'wheel' && !r.open.hidden && r.open.grab && r.open.slots === 5, r.open);
  check('moving right-and-up picks Attack (slot 1) and the hub says so', r.attack.pick === 1 && r.attack.sel === 1 && r.attack.hub === 'Attack', r.attack);
  check('the view does not turn while the wheel is up', Math.abs(r.view.dyaw) < 1e-6 && Math.abs(r.view.dpitch) < 1e-6, r.view);
  check('moving to the lower left picks Danger (slot 3)', r.danger.pick === 3 && r.danger.hub === 'Danger', r.danger);
  check('the stick is limited in reach, and a flick back picks Attack again', r.attack2.pick === 1 && r.attack2.stick <= 64.01, r.attack2);
  check('letting go places that marker: Attack, 45 s, at the crosshair, wheel closed, mouse released', r.placed.n === 1 && r.placed.type === 1 && r.placed.marker === true && r.placed.ttl === 45 && Math.abs(r.placed.z - 14) < 1.5 && r.placed.state === 'idle' && r.placed.hidden && r.placed.grab === null, r.placed);
  check('the view is still where it was after the wheel', Math.abs(r.viewAfter.dyaw) < 1e-6, r.viewAfter);

  // the same by direct delta simulation (mouse.dx / dy), and release in the middle = the ordinary ping
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, m = g.input.mouse, out = {};
    P.reset(); T.run(0.7);
    T.look(40, 32, 40, g.physics.terrainHeight(40, 14), 14);
    m.middlePressed = m.middle = true; T.frame(1 / 30);
    for (let i = 0; i < 10; i++) T.frame(1 / 30);
    out.open = P.state;
    m.dx = -40; m.dy = 30; T.frame(1 / 30);                            // lower left, shorter: Danger or Defend? (angle 143 deg from the top: Defend/Danger border)
    out.pick1 = P.pick;
    m.dx = 0; m.dy = 0;
    // push all the way to the left and up: Need help (slot 4, upper left)
    m.dx = -60; m.dy = -150; T.frame(1 / 30);
    out.pick2 = P.pick;
    // and back to the middle
    m.dx = 60; m.dy = 400; T.frame(1 / 30);
    m.dx = -100; m.dy = -400; T.frame(1 / 30);
    m.dx = 0; m.dy = 0;
    out.stick = [Math.round(P.stick.x), Math.round(P.stick.y)];
    P.stick.x = P.stick.y = 0; P.nudge(0, 0);
    out.centre = P.pick;
    m.middle = false; m.middleReleased = true; T.frame(1 / 30);
    const it = P.items[0];
    out.placed = { n: P.items.length, type: it && it.type, marker: it && it.marker, ttl: it && it.ttl };
    return out;
  });
  check('simulated deltas work as well; the middle of the wheel picks nothing', r.open === 'wheel' && r.pick2 === 4 && r.centre === -1, r);
  check('letting go in the middle is the ordinary ping (6 s, Go here on the ground)', r.placed.n === 1 && r.placed.type === 0 && r.placed.marker === false && r.placed.ttl === 6, r.placed);

  // dropping the wheel: the window loses focus, or the mouse is freed
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, m = g.input.mouse, out = {};
    P.reset(); T.run(0.7);
    T.look(40, 32, 40, g.physics.terrainHeight(40, 14), 14);
    m.middlePressed = m.middle = true; T.frame(1 / 30);
    for (let i = 0; i < 10; i++) T.frame(1 / 30);
    out.open = P.state;
    window.dispatchEvent(new Event('blur'));
    out.afterBlur = { state: P.state, hidden: document.getElementById('pingWheel').classList.contains('hidden'), grab: g.input.grab, middle: m.middle };
    T.frame(1 / 30);
    out.n = P.items.length;
    return out;
  });
  check('a lost window drops the wheel and places nothing', r.open === 'wheel' && r.afterBlur.state === 'idle' && r.afterBlur.hidden && r.afterBlur.grab === null && !r.afterBlur.middle && r.n === 0, r);

  // ------------------------------------------------------------------ 4. markers: at most 3, the oldest replaced, a renewal near one of yours
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    P.reset(); T.run(0.7);
    const put = (x, z, ty = 0) => { const it = P.place(ty, x, g.physics.terrainHeight(x, z), z, true); T.run(0.7); return it; };
    const a = put(10, 10), b = put(20, 10), c = put(30, 10);
    out.three = P.items.filter((o) => o.marker).map((o) => o.id);
    const d = put(40, 10);
    out.four = P.items.filter((o) => o.marker).map((o) => o.id);
    out.oldestGone = !P.items.includes(a) && a.vis === null;
    out.beacons = P.group.children.length;
    // within 3 m of one of mine: renewed, no new one
    const t0 = d.t0;
    const e = put(41.5, 10.5, 4);
    out.renew = { same: e === P.items.find((o) => o.id === d.id), ids: P.items.filter((o) => o.marker).map((o) => o.id), type: e.type, x: e.x, fresh: e.t0 > t0 };
    // further than 3 m: a new one (and the oldest of the three goes)
    const f = put(45.5, 10);
    out.far = P.items.filter((o) => o.marker).map((o) => o.id);
    out.other = { markersOfOthers: P.items.filter((o) => o.team !== 0).length };
    out.ids = [a.id, b.id, c.id, d.id, f.id];
    return out;
  });
  check('three markers stand', r.three.length === 3, r.three);
  check('a fourth replaces the oldest (3 left, the first gone, its beacon removed)', r.four.length === 3 && !r.four.includes(1) && r.oldestGone && r.beacons === 3, r);
  check('placing within 3 m of your own refreshes it: same one, new kind and spot, no extra marker', r.renew.same && r.renew.ids.length === 3 && r.renew.type === 4 && r.renew.fresh, r.renew);
  check('placing 4 m away adds a new one and drops the oldest', r.far.length === 3 && r.far.includes(r.ids[4]) && !r.far.includes(r.ids[1]), { far: r.far, ids: r.ids });

  // a marker lasts 45 s
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    P.reset(); T.run(0.7);
    P.place(2, 30, g.physics.terrainHeight(30, 10), 10, true);
    T.run(44);
    out.at44 = P.items.length;
    T.run(1.5);
    out.at45 = P.items.length;
    return out;
  });
  check('a marker is still up at 44 s and gone just after 45 s', r.at44 === 1 && r.at45 === 0, r);

  // ------------------------------------------------------------------ 5. the big map: palette, left click places, right click removes, the maps' own transform
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    P.reset(); T.run(0.7);
    g.input.pressed.add('KeyM'); T.frame(1 / 60);
    out.open = { mapOpen: g.ui.mapOpen, hidden: document.getElementById('bigmap').classList.contains('hidden') };
    return out;
  });
  check('M opens the big map', r.open.mapOpen && !r.open.hidden, r.open);
  await page.waitForTimeout(400);
  r = await page.evaluate(() => {
    const g = window.__game;
    return { locked: g.input.locked, paused: g.paused, pause: !document.getElementById('pause').classList.contains('hidden') };
  });
  check('the mouse is freed for the map and the game menu does not pop up', !r.locked && !r.paused && !r.pause, r);

  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    const cv = document.getElementById('bigmapCanvas');
    const rect = cv.getBoundingClientRect();
    out.rect = { w: Math.round(rect.width), h: Math.round(rect.height) };
    // the palette
    const btns = [...document.querySelectorAll('#pingPalette button')];
    out.palette = { n: btns.length, labels: btns.map((b) => b.textContent), active: btns.findIndex((b) => b.classList.contains('active')) };
    btns[3].click();
    out.afterPick = { sel: P.sel, active: [...document.querySelectorAll('#pingPalette button')].findIndex((b) => b.classList.contains('active')) };
    // a click on the map at a chosen world spot, with the map's own drawing transform: canvas px = (x + half) * 760 / (2 half)
    const wx = -52.3, wz = 61.7;
    const pt = T.mapPx(cv, wx, wz);
    cv.dispatchEvent(new MouseEvent('click', { clientX: pt.x, clientY: pt.y, bubbles: true, button: 0 }));
    const it = P.items.find((o) => o.marker);
    out.marker = it && { type: it.type, x: it.x, z: it.z, y: it.y, ttl: it.ttl, dx: +(it.x - wx).toFixed(2), dz: +(it.z - wz).toFixed(2), terrain: +g.physics.terrainHeight(it.x, it.z).toFixed(2) };
    // the pixel in the big map's own drawing, where the marker was painted: the icon disc's colour
    g.ui.drawBigMap();
    const c2 = cv.getContext('2d'), k = 760 / (2 * __cfg.half);
    const px = (wx + __cfg.half) * k, pz = (wz + __cfg.half) * k;
    const d = c2.getImageData(Math.round(px), Math.round(pz) + 7, 1, 1).data;      // (just below the glyph, inside the disc)
    out.paintedAt = [d[0], d[1], d[2]];
    return out;
  });
  check('the palette has the 5 kinds, Go here selected at first', r.palette.n === 5 && r.palette.labels.join() === 'Go here,Attack,Defend,Danger,Need help' && r.palette.active === 0, r.palette);
  check('clicking a palette button selects that kind', r.afterPick.sel === 3 && r.afterPick.active === 3, r.afterPick);
  check('a left click on the big map places the selected kind (Danger) as a 45 s marker', r.marker && r.marker.type === 3 && r.marker.ttl === 45, r.marker);
  check('map click -> world coordinates round trip within 1 m (the map\'s own transform)', r.marker && Math.abs(r.marker.dx) < 1 && Math.abs(r.marker.dz) < 1, r.marker);
  check('the marker stands on the ground there', r.marker && Math.abs(r.marker.y - r.marker.terrain) < 0.3, r.marker);
  check('and it is painted on the big map at that spot (orange disc)', r.paintedAt[0] > 200 && r.paintedAt[1] > 90 && r.paintedAt[1] < 170 && r.paintedAt[2] < 90, r.paintedAt);

  // the same with a real browser click, the mouse being free
  r = await page.evaluate(() => {
    T.run(0.7);                                                            // (game time passes: the rate limit)
    const cv = document.getElementById('bigmapCanvas');
    const pt = T.mapPx(cv, 20, -30);
    return pt;
  });
  await page.mouse.click(r.x, r.y);
  await page.waitForTimeout(150);
  r = await page.evaluate(() => {
    const P = window.__game.pings, it = P.items.find((o) => o.marker && Math.abs(o.x - 20) < 3);
    return it && { x: it.x, z: it.z, dx: +(it.x - 20).toFixed(2), dz: +(it.z + 30).toFixed(2), type: it.type };
  });
  check('a real mouse click on the big map lands within a metre too', r && Math.abs(r.dx) < 1.2 && Math.abs(r.dz) < 1.2 && r.type === 3, r);

  // right click removes your own nearest marker
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, cv = document.getElementById('bigmapCanvas');
    T.run(0.7);
    const before = P.items.filter((o) => o.marker).map((o) => [o.x, o.z]);
    const pt = T.mapPx(cv, 22, -28);                                       // 2.8 m off the marker at (20, -30)
    const ev = new MouseEvent('contextmenu', { clientX: pt.x, clientY: pt.y, bubbles: true, cancelable: true, button: 2 });
    cv.dispatchEvent(ev);
    const after = P.items.filter((o) => o.marker).map((o) => [o.x, o.z]);
    // far from any marker: nothing happens
    const pt2 = T.mapPx(cv, 100, 100);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX: pt2.x, clientY: pt2.y, bubbles: true, cancelable: true, button: 2 }));
    return { before: before.length, after: after.length, prevented: ev.defaultPrevented, afterFar: P.items.filter((o) => o.marker).length, beacons: P.group.children.length };
  });
  check('right click removes your nearest marker (and the browser menu is suppressed)', r.before === 2 && r.after === 1 && r.prevented && r.afterFar === 1 && r.beacons === 1, r);

  // a click on the corner of the map is brought inside the play area; outside the canvas is ignored
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, cv = document.getElementById('bigmapCanvas');
    T.run(0.7);
    const rect = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click', { clientX: rect.left + rect.width - 0.5, clientY: rect.top + 0.5, bubbles: true }));
    const corner = P.items.find((o) => o.marker && o.x > 100);
    T.run(0.7);
    const n0 = P.items.length;
    cv.dispatchEvent(new MouseEvent('click', { clientX: rect.left - 20, clientY: rect.top + 50, bubbles: true }));
    return { corner: corner && [corner.x, corner.z], playHalf: __cfg.playHalf, same: P.items.length === n0 };
  });
  check('a click in the very corner is clamped to the play area', r.corner && Math.abs(r.corner[0]) <= r.playHalf + 0.01 && Math.abs(r.corner[1]) <= r.playHalf + 0.01, r);
  check('a click outside the canvas does nothing', r.same, r);

  // ------------------------------------------------------------------ 6. the HUD minimap, while the mouse is free
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, mini = document.getElementById('minimap');
    P.reset(); T.run(0.7);
    const rect = mini.getBoundingClientRect();
    const cs = getComputedStyle(mini);
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const wx = 60.4, wz = -40.2;
    const pt = T.mapPx(mini, wx, wz);
    const topAt = document.elementFromPoint(pt.x, pt.y);
    mini.dispatchEvent(new MouseEvent('click', { clientX: pt.x, clientY: pt.y, bubbles: true }));
    const it = P.items.find((o) => o.marker);
    return { pe: cs.pointerEvents, cursor: cs.cursor, mapOpen: g.ui.mapOpen, topIsMini: top === mini && topAt === mini, hint: document.querySelector('#minimapWrap .mapHint').textContent,
      px: +(rect.width / 2 / (cfgHalf())).toFixed(3), marker: it && { type: it.type, dx: +(it.x - wx).toFixed(1), dz: +(it.z - wz).toFixed(1) } };
    function cfgHalf() { return __cfg.half; }
  });
  check('the HUD minimap takes clicks (pointer-events, crosshair cursor) and is above the big map\'s backdrop', r.pe === 'auto' && r.cursor === 'crosshair' && r.mapOpen && r.topIsMini, r);
  check('a click on the HUD minimap places the selected marker within a minimap pixel (2.4 m)', r.marker && Math.abs(r.marker.dx) < 3 && Math.abs(r.marker.dz) < 3, r.marker);
  check('the map frame carries the faint hint "MMB: ping"', r.hint === 'MMB: ping', r.hint);

  // closing the big map: M again hands the mouse back; Esc closes it first; the backdrop click closes it
  // (Chromium limits how often a page may ask for the pointer lock, and headless asks twice each time: space the asks out)
  r = await page.evaluate(() => { window.__game.input.pressed.add('KeyM'); T.frame(1 / 60); const g = window.__game; return { mapOpen: g.ui.mapOpen }; });
  await page.waitForTimeout(500);
  const closed = await page.evaluate(() => { const g = window.__game; return { mapOpen: g.ui.mapOpen, locked: g.input.locked, paused: g.paused, pause: !document.getElementById('pause').classList.contains('hidden') }; });
  check('M again closes the map and takes the mouse back (no menu)', !r.mapOpen && closed.locked && !closed.paused && !closed.pause, closed);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__game.input.pressed.add('KeyM'); T.frame(1 / 60); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); });
  await page.waitForTimeout(500);
  r = await page.evaluate(() => { const g = window.__game; return { mapOpen: g.ui.mapOpen, locked: g.input.locked, paused: g.paused, pause: !document.getElementById('pause').classList.contains('hidden') }; });
  check('Esc with the map up closes just the map and re-captures the mouse', !r.mapOpen && r.locked && !r.paused && !r.pause, r);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__game.input.pressed.add('KeyM'); T.frame(1 / 60); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.getElementById('bigmap').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.waitForTimeout(500);
  r = await page.evaluate(() => { const g = window.__game; return { mapOpen: g.ui.mapOpen, locked: g.input.locked, pause: !document.getElementById('pause').classList.contains('hidden') }; });
  check('a click on the dim backdrop closes the map too', !r.mapOpen && r.locked && !r.pause, r);
  // opening the shop while the map is up: the shop wins, the mouse stays free
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__game.input.pressed.add('KeyM'); T.frame(1 / 60); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.ui.toggleShop(true); });
  await page.waitForTimeout(400);
  r = await page.evaluate(() => { const g = window.__game; return { mapOpen: g.ui.mapOpen, shop: g.ui.shopOpen, locked: g.input.locked, pause: !document.getElementById('pause').classList.contains('hidden') }; });
  check('the shop opening over the map closes the map and leaves the mouse free', !r.mapOpen && r.shop && !r.locked && !r.pause, r);
  await page.evaluate(() => { window.__game.ui.toggleShop(false); window.__game.paused = false; });
  await page.waitForTimeout(2500);

  // ------------------------------------------------------------------ 7. the rate limit: 1 per 0.6 s, 8 per 10 s
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    P.reset(); T.run(1);
    const at = (i) => P.place(0, -100 + i * 12, g.physics.terrainHeight(-100 + i * 12, 100), 100, false);
    out.first = !!at(0);
    out.again = !!at(1);                              // straight away: refused
    out.feedback = document.getElementById('feedback').textContent;
    T.run(0.5);
    out.at05 = !!at(1);                               // 0.5 s: still too soon
    T.run(0.2);
    out.at07 = !!at(1);                               // 0.7 s: fine
    out.n = P.items.length;
    // up to 8 in 10 s: the 3rd..8th at 0.65 s spacing
    let ok = 0;
    for (let i = 2; i < 12; i++) { T.run(0.7); if (at(i)) ok++; }
    out.okMore = ok;
    out.window = { total: P.rate.get(0).puts.length };
    // 10 s after the first the window has room again
    T.run(10);
    out.later = !!at(0);
    return out;
  });
  check('the first call-out goes, a second straight after is refused (with a message)', r.first && !r.again && /too fast/i.test(r.feedback), r);
  check('0.5 s later is still too soon, 0.7 s later it is fine', !r.at05 && r.at07 && r.n === 2, r);
  check('no more than 8 in any 10 s', r.okMore === 6 && r.window.total === 8, r);
  check('and after the window it works again', r.later, r);

  // ------------------------------------------------------------------ 8. sounds
  r = await page.evaluate(async () => {
    const g = window.__game, A = g.audio, mod = await import('/src/audio.js'), out = {};
    out.registered = ['ping', 'pingGo', 'pingAttack', 'pingDefend', 'pingDanger', 'pingHelp'].map((n) => typeof mod.SOUNDS[n]);
    const calls = [];
    const real = { ctx: A.ctx, tone: A.tone, noise: A.noise, last: A.last };
    A.ctx = { currentTime: 0 }; A.last = {};
    A.tone = (...a) => calls.push(['tone', ...a.slice(0, 4)]); A.noise = (...a) => calls.push(['noise', a[1]]);
    const sig = {};
    for (const n of ['pingGo', 'pingAttack', 'pingDefend', 'pingDanger', 'pingHelp']) { calls.length = 0; A.last = {}; A.play(n); sig[n] = JSON.stringify(calls); }
    A.ctx = real.ctx; A.tone = real.tone; A.noise = real.noise; A.last = real.last;
    out.sig = sig;
    out.distinct = new Set(Object.values(sig)).size;
    out.counts = Object.fromEntries(Object.entries(sig).map(([k, v]) => [k, JSON.parse(v).length]));
    out.real = (() => { try { for (const n of ['pingGo', 'pingAttack', 'pingDefend', 'pingDanger', 'pingHelp']) { A.last = {}; A.play(n); } return 'ok'; } catch (e) { return String(e); } })();
    return out;
  });
  check('sounds are registered in the audio registry (ping and one per kind)', r.registered.every((t) => t === 'function'), r.registered);
  check('the five sounds are distinct, short, and run on the real audio context without error', r.distinct === 5 && r.real === 'ok', { distinct: r.distinct, counts: r.counts, real: r.real });

  // ------------------------------------------------------------------ 9. the arrow at the edge of the screen, and the distance label
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    P.reset(); T.run(1);
    const hy = (x, z) => g.physics.terrainHeight(x, z);
    T.look(0, 20, 0, hy(0, -20), -20);                                  // facing -z
    const ahead = P.place(0, 0, hy(0, -30), -30, false);                // 50 m ahead
    T.run(0.7);
    const behind = P.place(1, 0, hy(0, 60), 60, false);                 // 40 m behind
    T.frame(1 / 60);
    const el = (it) => it.vis.el;
    out.ahead = { display: el(ahead).style.display, label: ahead.vis.label };
    out.behind = { display: el(behind).style.display, transform: el(behind).style.transform, d: el(behind).lastChild.textContent, label: behind.vis.label };
    // turn to the right: the first one is now off to the side
    g.player.yaw -= Math.PI / 2; T.frame(1 / 60);
    out.turned = { display: el(ahead).style.display, transform: el(ahead).style.transform };
    out.W = innerWidth; out.H = innerHeight;
    return out;
  });
  check('an in-view ping has the icon label in the world and no edge arrow', r.ahead.display === 'none' && r.ahead.label === '50 m', r.ahead);
  check('one behind you gets an arrow at the edge of the screen with its distance', r.behind.display === 'block' && /translate/.test(r.behind.transform) && r.behind.d === '40 m', r.behind);
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(r.turned.transform || '');
  check('turning away puts the arrow on the side it is on (left edge, as you turned right)', r.turned.display === 'block' && m && Number(m[0 + 1]) < 80, r.turned);

  // ------------------------------------------------------------------ 10. the wheel's layout on the page (no screenshot: measure it)
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, m = g.input.mouse, out = {};
    P.reset(); T.run(0.7);
    m.middlePressed = m.middle = true; T.frame(1 / 30);
    for (let i = 0; i < 10; i++) T.frame(1 / 30);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    out.slots = [...document.querySelectorAll('#pingWheel .pw')].map((e) => { const b = e.getBoundingClientRect(); return Math.round(Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy)); });
    out.top = (() => { const b = document.querySelector('#pingWheel .pw').getBoundingClientRect(); return [Math.round(b.left + b.width / 2 - cx), Math.round(b.top + b.height / 2 - cy)]; })();
    const hub = document.querySelector('#pingWheel .hub').getBoundingClientRect();
    out.hub = [Math.round(hub.left + hub.width / 2 - cx), Math.round(hub.top - cy), Math.round(hub.height)];
    m.middle = false; m.middleReleased = true; T.frame(1 / 30);
    return out;
  });
  check('the wheel is laid out round the crosshair: five slots 88 px out, the first straight above, the label inside', r.slots.every((d) => Math.abs(d - 88) <= 2) && Math.abs(r.top[0]) <= 1 && r.top[1] === -88 && r.hub[1] > 0 && r.hub[1] + r.hub[2] < 60, r);

  // ------------------------------------------------------------------ 11. it draws: a real render with and without the beacons (no WebGL errors, the picture differs)
  r = await page.evaluate(() => {
    const g = window.__game, P = g.pings, out = {};
    P.reset(); T.run(1);
    T.look(30, 30, 30, g.physics.terrainHeight(30, 0), 0);
    const spot = P.place(1, 30, g.physics.terrainHeight(30, -2), -2, false);
    T.run(0.5, 0.05);
    const V = g.camera.position.constructor;
    const s = new V(30, g.physics.terrainHeight(30, -2) + 4.2, -2).project(g.camera);
    const gl = g.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const sx = Math.round((s.x * 0.5 + 0.5) * W), sy = Math.round((s.y * 0.5 + 0.5) * H);   // (readPixels counts from the bottom)
    const grab = () => { g.renderer.render(g.scene, g.camera); const px = new Uint8Array(160 * 160 * 4); gl.readPixels(Math.max(0, sx - 80), Math.max(0, sy - 80), 160, 160, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    P.group.visible = false; const a = grab();
    P.group.visible = true; const b = grab();
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) diff++;
    out.diff = diff; out.at = [sx, sy, W, H]; out.err = gl.getError();
    return out;
  });
  check('a real render shows the beacon and icon (pixels differ with the beacons on) and WebGL reports no error', r.diff > 150 && r.err === 0, r);

  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
  process.exit(failed ? 1 : 0);
})();
