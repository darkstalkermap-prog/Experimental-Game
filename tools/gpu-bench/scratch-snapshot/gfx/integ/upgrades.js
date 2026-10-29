// Buying upgrades changes what the castle and its soldiers look like, on every screen.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';   // (integration copy: the tier check reads the crowd's rigs)
const L = require(S + 'simlib.js');
const { session, startMatch, step } = require(S + 'v2/mplib');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
const snap = () => {
  const g = window.__game, c = g.castles[0], u = c.upg;
  const meshes = (l) => l.length;
  const decor = c.gate.leaves.reduce((n, l) => n + (l.decor || []).reduce((m, d) => m + d.children.length, 0), 0);
  return {
    wall: c.wallLevel, gate: c.gateLevel, tower: c.towerLevel, barracks: c.barracksLevel, levies: c.levies,
    shown: u.shown ? JSON.stringify(u.shown) : null,
    wallMeshes: meshes(u.wallMeshes), gateDecor: decor, towerMeshes: meshes(u.towerMeshes), archers: (u.archers || []).length,
    racks: meshes(u.rackMeshes), standards: meshes(u.standardMeshes),
    wallExt: (() => { const k = c.walls.find((w) => w.breakable).collider; return +((k.maxX - k.minX) * (k.maxZ - k.minZ)).toFixed(2); })(),
  };
};
(async () => {
  // ---- single player ----
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const s0 = await page.evaluate(snap);
  check('a new castle shows no upgrades', s0.wallMeshes === 0 && s0.gateDecor === 0 && s0.archers === 0 && s0.racks === 0 && s0.standards === 0, JSON.stringify(s0));
  const res = await page.evaluate(() => {
    const g = window.__game, f = g.factions[0];
    f.gold = 99999;
    const out = [];
    const tier = () => g.units.filter((u) => u.team === 0 && u.alive && !u.isHero).map((u) => u.tier);
    const buyAll = (id, n) => { for (let i = 0; i < n; i++) { const r = g.buyForPlayer(id); out.push(`${id}:${r}`); g.update(0.1); } };
    return { buy: (id, n) => buyAll(id, n), out };
  });
  void res;
  const lvl = async (id, n) => page.evaluate(([id, n]) => { const g = window.__game; g.factions[0].gold = 99999; for (let i = 0; i < n; i++) { g.buyForPlayer(id); g.update(0.1); } }, [id, n]);
  const notes = await page.evaluate(() => { window.__notes = []; const p = window.__game.player; const o = p.notify.bind(p); p.notify = (m, ...a) => { window.__notes.push(m); return o(m, ...a); }; });
  void notes;
  await lvl('fortify_walls', 1); let s = await page.evaluate(snap);
  check('Thicken Walls level 1 adds stone and widens the wall collider', s.wall === 1 && s.wallMeshes >= 1 && s.wallExt > s0.wallExt, JSON.stringify(s));
  const w1 = s.wallMeshes;
  await lvl('fortify_walls', 1); s = await page.evaluate(snap);
  check('level 2 changes it again (iron bands)', s.wall === 2 && s.wallMeshes > w1 && s.wallExt > 21, JSON.stringify(s));
  await lvl('fortify_walls', 1); s = await page.evaluate(snap);
  check('level 3 dresses the walls in new stone', s.wall === 3 && s.wallMeshes >= 4, JSON.stringify(s));
  const dmat = await page.evaluate(() => window.__game.castles[0].upg.wallMeshes.map((m) => m.material.color.getHexString()));
  check('level 3 uses a different (paler) stone', new Set(dmat).size >= 3, dmat.join(','));
  await lvl('reinforce_gate', 1); s = await page.evaluate(snap); const g1 = s.gateDecor;
  check('Iron-Banded Gate level 1 adds bands', s.gate === 1 && g1 > 0, JSON.stringify(s));
  await lvl('reinforce_gate', 1); s = await page.evaluate(snap); const g2 = s.gateDecor;
  await lvl('reinforce_gate', 1); s = await page.evaluate(snap);
  check('gate levels 2 and 3 add straps, rivets, spikes and a crest', s.gate === 3 && g2 >= g1 && s.gateDecor > g1, JSON.stringify([g1, g2, s.gateDecor]));
  const towers = [];
  for (let i = 0; i < 3; i++) { await lvl('towers', 1); towers.push(await page.evaluate(snap)); }
  check('Tower Archers: one archer, then two, then three on every tower', towers.map((t) => t.archers).join() === '4,8,12', towers.map((t) => t.archers).join());
  check('each tower level adds more to the towers', towers[0].towerMeshes > 0 && towers[1].towerMeshes >= towers[0].towerMeshes && towers[2].towerMeshes > towers[0].towerMeshes, JSON.stringify(towers.map((t) => t.towerMeshes)));
  const racks = [];
  for (let i = 0; i < 4; i++) { await lvl('barracks', 1); racks.push(await page.evaluate(() => { const c = window.__game.castles[0]; return { lvl: c.barracksLevel, tris: c.upg.rackMeshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0) }; })); }
  check('Expand Barracks: racks of arms spread along more walls with every level', racks.map((r) => r.lvl).join() === '1,2,3,4' && racks[0].tris < racks[1].tris && racks[1].tris < racks[2].tris && racks[2].tris < racks[3].tris, JSON.stringify(racks));
  const std = [];
  for (let i = 0; i < 3; i++) { await lvl('levies', 1); std.push(await page.evaluate(() => { const c = window.__game.castles[0]; return { lvl: c.levies, tris: c.upg.standardMeshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0) }; })); }
  check('Elite Levies: more standards with each level', std.map((r) => r.lvl).join() === '1,2,3' && std[0].tris < std[1].tris && std[1].tris < std[2].tris, JSON.stringify(std));
  // drill sergeants: soldiers change their kit
  const tiers = [];
  for (let i = 0; i < 5; i++) {
    await lvl('training', 1);
    await page.evaluate(() => { for (let k = 0; k < 40; k++) window.__game.update(0.05); });
    tiers.push(await page.evaluate(() => {
      const g = window.__game;
      const mine = g.units.filter((u) => u.team === 0 && u.alive && !u.isHero && !u.isGiant && !u.isCrew);
      // (the crowd draws rigs as instances: a tier's look is the set of kit gates switched on in the rig's per-instance word, and the far model is the rig's farKey)
      const gates = (u) => u.model.inst[3] & 0x81f;
      return { n: mine.length, tier: [...new Set(mine.map((u) => u.tier))].join('/'), geo: new Set(mine.map(gates)).size, far: new Set(mine.map((u) => u.model.farKey)).size, look: [...new Set(mine.map(gates))].sort().join('/') };
    }));
  }
  check('Drill Sergeants: every soldier is in the new kit within a second or two', tiers.every((t, i) => t.tier === String(i + 1)), JSON.stringify(tiers));
  check('each tier is a different look (its own kit gates on the rig)', tiers.every((t) => t.geo >= 1 && t.far >= 1) && tiers.every((t, i) => i === 0 || t.look !== tiers[i - 1].look), JSON.stringify(tiers.map((t) => t.look)));
  const said = await page.evaluate(() => window.__notes.filter((m) => /reinforced|iron-banded|Tower archers|barracks has grown|Elite levies|Drill sergeants/.test(m)));
  check('the player is told about each upgrade', said.length >= 15, said.length + ' toasts');
  // a destroyed wall takes its new stone with it, a repaired one brings it back
  const w = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    const n0 = c.upg.wallMeshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
    const seg = c.walls.find((x) => x.breakable);
    seg.hp = 1; c.damageWall(seg, 50, null);
    g.update(0.05);
    const n1 = c.upg.wallMeshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
    c.repairWalls();
    g.update(0.05);
    const n2 = c.upg.wallMeshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
    return { n0, n1, n2 };
  });
  check('a breached wall loses its extra stone and gets it back when rebuilt', w.n1 < w.n0 && w.n2 === w.n0, JSON.stringify(w));
  console.log('errors (single):', errors.join('\n') || 'none');
  await browser.close();

  // ---- online: the guest sees the host's upgrades ----
  const T = await session('relay');
  const { page: hostPage, code } = await T.host('Arthur');
  const guest = await T.join(code, 'Gwen', 'guest');
  await hostPage.waitForTimeout(400);
  await startMatch(T, hostPage, [guest], { coop: false });
  const all = [hostPage, guest];
  await step(all, 2);
  await hostPage.evaluate(() => { const g = window.__game; g.factions[0].gold = 99999; for (const id of ['fortify_walls', 'fortify_walls', 'reinforce_gate', 'towers', 'barracks', 'levies', 'training', 'training']) g.buyForPlayer(id); });
  await guest.evaluate(() => { const g = window.__game; g.factions[1].gold = 99999; });
  await step(all, 3);
  const view = (p) => p.evaluate(() => {
    const c = window.__game.castles[0];
    return { wall: c.wallLevel, gate: c.gateLevel, tower: c.towerLevel, barracks: c.barracksLevel, levies: c.levies, wallMeshes: c.upg.wallMeshes.length, archers: c.upg.archers.length, racks: c.upg.rackMeshes.length, standards: c.upg.standardMeshes.length, tiers: [...new Set(window.__game.units.filter((u) => u.team === 0 && u.alive && !u.isHero).map((u) => u.tier))].join('/') };
  });
  const hv = await view(hostPage), gv = await view(guest);
  check("the guest's screen shows the host's upgrades", JSON.stringify(hv) === JSON.stringify(gv) && hv.wall === 2 && hv.archers === 4, JSON.stringify({ hv, gv }));
  console.log('errors (online):\n' + (T.errors.join('\n') || 'none'));
  await T.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
