// Pings and markers online. Co-op with three humans: a guest's ping reaches the host and the other guest, the host's reaches
// both, markers (limit, renewal, removal) agree on every screen, the host enforces the rate limit and drops bad values.
// Versus: only the sender sees their own call-outs. Sound and toast fire on the receivers.
const { session, startMatch } = require('../v2/mplib');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const stepper = (all) => async (secs, dt = 1 / 30) => {
  const slices = Math.ceil(secs / 0.25), n = Math.round(0.25 / dt);
  for (let i = 0; i < slices; i++) {
    for (const p of all) await p.evaluate(([n, dt]) => { const g = window.__game; g.paused = false; for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } }, [n, dt]);
    await all[0].waitForTimeout(20);
  }
};
const spy = (p) => p.evaluate(() => {
  const g = window.__game;
  window.__snd = []; const play = g.audio.play.bind(g.audio); g.audio.play = (n, pos) => { __snd.push(n); return play(n, pos); };
  window.__rx = []; const rc = g.pings.receive.bind(g.pings); g.pings.receive = (ev) => { __rx.push(ev); return rc(ev); };
  window.__put = (type, x, z, marker) => { const it = g.pings.place(type, x, g.physics.terrainHeight(x, z), z, marker); return it ? it.id : null; };
});
const view = (p) => p.evaluate(() => {
  const P = window.__game.pings;
  return { items: P.items.map((o) => ({ id: o.id, team: o.team, name: o.name, type: o.type, marker: o.marker, mine: o.mine, x: o.x, y: o.y, z: o.z })),
    toasts: [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent), snd: __snd.slice(), rx: __rx.length, arrows: document.querySelectorAll('#pingLayer .pg').length };
});
const clear = (all) => Promise.all(all.map((p) => p.evaluate(() => { __snd.length = 0; __rx.length = 0; document.getElementById('toasts').innerHTML = ''; })));
const raw = (p, d) => p.evaluate((d) => window.__game.net.toHost(d), d);   // straight to the host, past the client's own limiter

async function coop() {
  console.log('\n=== co-op, three humans (host Arthur = team 0, guests Gwen = 1 and Bors = 2)');
  const S = await session('relay');
  const { page: host, code } = await S.host('Arthur');
  const gwen = await S.join(code, 'Gwen', 'gwen');
  const bors = await S.join(code, 'Bors', 'bors');
  await startMatch(S, host, [gwen, bors], { coop: true });
  const all = [host, gwen, bors], step = stepper(all);
  await step(1.5);
  for (const p of all) await spy(p);
  const modes = await Promise.all(all.map((p) => p.evaluate(() => { const g = window.__game; return [g.mode, g.localTeam, g.coop]; })));
  ok('host and two clients are in a co-op match', modes.map((m) => m[0]).join() === 'host,client,client' && modes.every((m) => m[2]), modes);

  // 1. a guest pings an enemy-ish spot (Attack): her own screen at once, then the host's and the other guest's
  const id1 = await gwen.evaluate(() => __put(1, 30, 20, false));
  let v = await Promise.all(all.map(view));
  ok('the sender sees her ping at once (no toast, her own sound)', v[1].items.length === 1 && v[1].items[0].mine && v[1].toasts.length === 0 && v[1].snd.includes('pingAttack'), v[1]);
  ok('the other guest has to wait for the host\'s next snapshot (the host has not been stepped yet)', v[2].items.length === 0, v[2].items.length);
  await step(1.0);
  v = await Promise.all(all.map(view));
  const same = (a) => a.items.length === 1 && a.items[0].team === 1 && a.items[0].name === 'Gwen' && a.items[0].type === 1 && !a.items[0].marker && !a.items[0].mine && Math.abs(a.items[0].x - 30) < 0.01 && Math.abs(a.items[0].z - 20) < 0.01;
  ok('guest -> host: the host has the ping (her name, Attack, the same spot)', same(v[0]), v[0].items);
  ok('guest -> host -> other guest: Bors has it too', same(v[2]), v[2].items);
  ok('teammates get the toast "Gwen: Attack here!" and the Attack sound', [v[0], v[2]].every((a) => a.toasts.some((t) => t === 'Gwen: Attack here!') && a.snd.includes('pingAttack')), [v[0].toasts, v[0].snd, v[2].toasts, v[2].snd]);
  ok('the sender got no toast and nothing extra came back to her', v[1].items.length === 1 && v[1].rx === 0 && v[1].toasts.length === 0, { rx: v[1].rx, toasts: v[1].toasts });

  // 2. the host pings a marker (Danger): both guests get it
  await clear(all);
  await step(0.7);
  await host.evaluate(() => __put(3, -20, 40, true));
  await step(1.0);
  v = await Promise.all(all.map(view));
  const mk = (a) => a.items.filter((o) => o.team === 0 && o.marker);
  ok('host -> guests: both have the Danger marker from Arthur', [v[1], v[2]].every((a) => mk(a).length === 1 && mk(a)[0].type === 3 && mk(a)[0].name === 'Arthur' && Math.abs(mk(a)[0].x + 20) < 0.01), [mk(v[1]), mk(v[2])]);
  ok('they hear Danger and read "Arthur: Danger!"', [v[1], v[2]].every((a) => a.toasts.includes('Arthur: Danger!') && a.snd.includes('pingDanger')), [v[1].toasts, v[1].snd]);
  ok('the host keeps his own marker and is not told his own news', mk(v[0]).length === 1 && mk(v[0])[0].mine && v[0].rx === 0, { rx: v[0].rx });

  // 3. removing it spreads
  await host.evaluate(() => { const g = window.__game; g.pings.removeNear(-20, 40, 5); });
  await step(1.0);
  v = await Promise.all(all.map(view));
  ok('removing your marker removes it for your allies too', v.every((a) => a.items.filter((o) => o.team === 0 && o.marker).length === 0), v.map((a) => a.items.length));

  // 4. a guest's markers: the limit of three and the renewal agree on all screens
  for (let i = 0; i < 4; i++) { await step(1.1); await gwen.evaluate((i) => __put(i % 5, 10 + i * 12, -30, true), i); }
  await step(1.0);
  v = await Promise.all(all.map(view));
  const gm = (a) => a.items.filter((o) => o.team === 1 && o.marker).map((o) => o.id).sort((x, y) => x - y);
  ok('four markers from one player leave three, the oldest replaced, the same on every screen', gm(v[0]).length === 3 && gm(v[0]).join() === gm(v[1]).join() && gm(v[1]).join() === gm(v[2]).join() && gm(v[0])[0] === 3, [gm(v[0]), gm(v[1]), gm(v[2])]);
  await step(0.7);
  const ren = await gwen.evaluate(() => { const g = window.__game; const last = g.pings.items.filter((o) => o.marker).sort((a, b) => b.t0 - a.t0)[0]; const id = __put(4, last.x + 1.5, last.z + 1, true); return { last: last.id, id }; });
  await step(1.0);
  v = await Promise.all(all.map(view));
  ok('placing within 3 m of her own marker renews it (same number, new kind) everywhere', gm(v[0]).length === 3 && gm(v[2]).length === 3 && v.every((a) => a.items.find((o) => o.team === 1 && o.id === ren.last && o.type === 4)), { ren, ids: gm(v[0]) });

  // 5. the host enforces the rate limit, whatever the client does
  await step(11);                                   // (the markers above are 45 s old at most; this is about the host's window)
  await clear(all);
  const seen = async () => (await host.evaluate(() => __rx.map((e) => e.id).filter((id) => id >= 100))).join();
  for (let i = 0; i < 10; i++) {
    await raw(gwen, { a: 'ping', id: 100 + i, ty: 0, mk: 0, x: -100 + i * 8, y: 0, z: 60 });
    await host.waitForTimeout(120);                 // (the message arrives; the host works it out at its own clock)
    await stepper([host])(0.7);
  }
  ok('10 call-outs 0.7 s apart: the host passes the first 8 and drops the rest (8 per 10 s)', (await seen()) === '100,101,102,103,104,105,106,107', await seen());
  await stepper([host])(3.5);
  await raw(gwen, { a: 'ping', id: 110, ty: 0, mk: 0, x: 0, y: 0, z: -90 });
  await host.waitForTimeout(150);
  ok('once the window has room again, the next one goes through', (await seen()).endsWith('107,110'), await seen());
  await step(6.5);
  await clear(all);
  await raw(gwen, { a: 'ping', id: 120, ty: 0, mk: 0, x: 40, y: 0, z: 60 });
  await raw(gwen, { a: 'ping', id: 121, ty: 0, mk: 0, x: 60, y: 0, z: 60 });
  await host.waitForTimeout(250);
  ok('two within 0.6 s: only the first goes through', (await seen()) === '120', await seen());

  // 6. bad values are ignored; nothing breaks
  // (the host alone was stepped above, so its clock is ahead of the guests': start from a clean slate on every screen)
  await step(11);
  await Promise.all(all.map((p) => p.evaluate(() => window.__game.pings.reset())));
  await clear(all);
  const good = { a: 'ping', id: 200, ty: 1, mk: 0, x: 10, y: 3, z: 10 };
  const bad = [
    { ...good, ty: 99 }, { ...good, ty: 1.5 }, { ...good, ty: '1' }, { ...good, ty: -1 }, { ...good, ty: null },
    { ...good, x: '12' }, { ...good, x: null }, { ...good, x: 99999 }, { ...good, z: -99999 }, { ...good, x: 1e308 }, { ...good, z: {} },
    { ...good, id: 0 }, { ...good, id: -3 }, { ...good, id: '7' }, { ...good, id: 1.5 }, { ...good, id: 1e12 }, { ...good, id: null },
    { a: 'ping' }, { a: 'ping', rm: 'x' }, { a: 'ping', rm: -1 }, { a: 'ping', rm: 1.5 }, { a: 'ping', rm: null, id: 1 },
  ];
  for (const b of bad) { await raw(gwen, b); await host.waitForTimeout(40); await stepper([host])(0.7); }
  await gwen.evaluate(() => window.__game.net.toHost('ping'));            // not even an object
  await host.waitForTimeout(200);
  v = await Promise.all(all.map(view));
  ok(`${bad.length} malformed call-outs are ignored: nothing is shown, relayed, toasted or heard`, v.every((a) => a.items.length === 0 && a.toasts.length === 0 && !a.snd.some((n) => /^ping/.test(n))), v.map((a) => [a.items.length, a.toasts.length]));
  ok('and the host never even tried to deliver any of them', v[0].rx === 0 && v[2].rx === 0, [v[0].rx, v[2].rx]);
  // a bad shape costs nothing: the good one right after is not rate-limited
  await raw(gwen, good);
  await step(0.8);
  v = await Promise.all(all.map(view));
  ok('a good one straight after the bad ones goes through (bad ones do not use up the limit)', v[0].items.length === 1 && v[2].items.length === 1 && v[0].items[0].id === 200, v[0].items);
  // just outside the play area is brought in; a silly height is brought down
  await step(1);
  const lim = await host.evaluate(async () => { const c = await import('/src/config.js'); return c.WORLD.playHalf; });
  await raw(gwen, { a: 'ping', id: 201, ty: 2, mk: 1, x: lim + 0.6, y: 1e9, z: -lim - 0.4 });
  await step(0.8);
  v = await Promise.all(all.map(view));
  const edge = v[2].items.find((o) => o.id === 201);
  const ground = await bors.evaluate(([x, z]) => window.__game.physics.terrainHeight(x, z), [lim, -lim]);
  ok('a spot just past the edge is clamped to the play area; a silly height is brought down to the ground', edge && edge.x === lim && edge.z === -lim && edge.y <= ground + 40.01 && edge.y >= ground - 1.01, { edge, lim, ground });
  ok('and a forged event from a non-ally is dropped by the receiver', await bors.evaluate(() => { const g = window.__game, n = g.pings.items.length; g.pings.receive({ k: 'ping', id: 5, ty: 1, mk: 0, x: 1, y: 1, z: 1, team: 3, name: 'Evil' }); g.pings.receive({ k: 'ping', id: 6, ty: 1, mk: 0, x: 1, y: 1, z: 1, team: 2, name: 'Me' }); return g.pings.items.length === n; }), 'AI team 3 / own team 2');
  ok('no page errors', S.errors.length === 0, S.errors.slice(0, 3));
  await S.close();
}

async function versus() {
  console.log('\n=== versus, two humans (no allies: only the sender sees their own)');
  const S = await session('relay');
  const { page: host, code } = await S.host('Arthur');
  const gwen = await S.join(code, 'Gwen', 'gwen');
  await startMatch(S, host, [gwen], { coop: false });
  const all = [host, gwen], step = stepper(all);
  await step(1.5);
  for (const p of all) await spy(p);
  await gwen.evaluate(() => __put(1, 30, 20, false));
  await step(0.7);
  await host.evaluate(() => __put(3, -20, 40, true));
  await step(0.7);
  await gwen.evaluate(() => __put(2, 50, 20, true));
  await step(1.5);
  const v = await Promise.all(all.map(view));
  ok('each sees only their own call-outs (the guest: ping + marker, the host: marker)', v[1].items.length === 2 && v[1].items.every((o) => o.mine) && v[0].items.length === 1 && v[0].items[0].mine && v[0].items[0].marker, [v[0].items.length, v[1].items.length]);
  ok('the enemy human got no event, no toast and no sound', v[0].rx === 0 && v[1].rx === 0 && v[0].toasts.length === 0 && v[1].toasts.length === 0, [v[0].rx, v[1].rx]);
  ok('the senders hear their own sound only', v[1].snd.includes('pingAttack') && !v[1].snd.includes('pingDanger') && v[0].snd.includes('pingDanger') && !v[0].snd.includes('pingAttack'), [v[0].snd, v[1].snd]);
  ok('a forged event from the enemy human is ignored by the receiver', await host.evaluate(() => { const g = window.__game, n = g.pings.items.length; g.pings.receive({ k: 'ping', id: 9, ty: 1, mk: 0, x: 1, y: 1, z: 1, team: 1, name: 'Gwen' }); return g.pings.items.length === n; }), 'versus');
  ok('no page errors', S.errors.length === 0, S.errors.slice(0, 3));
  await S.close();
}

(async () => {
  await coop();
  await versus();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
