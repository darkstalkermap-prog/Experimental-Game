const g = window.__game, gfx = window.__gfx;
g.player.buffs.add('ghost', 1e6);
for (let i = 0; i < 20 * 60 * 6; i++) { g.update(0.05); g.input.endFrame(); }
for (let i = 0; i < 60; i++) { g.update(0.05); g.input.endFrame(); }
for (let i = 0; i < 6; i++) gfx.renderFrame(1 / 60);
const fol = g.scene.userData.worldSystems.find((s) => s.near);
const lod = [0, 0, 0, 0];
for (const u of g.units) if (u.alive) lod[u.lod]++;
const batches = g.crowd.list.filter((b) => b.n).map((b) => ({ n: b.n, tris: Math.round(b.geo.index.count / 3), shadow: b.shadow, proxy: !!b.proxy, ptris: b.plain ? Math.round(b.plain.index.count / 3) : 0 }));
const byTris = batches.map((b) => b.n * b.tris);
return {
  units: g.units.filter((u) => u.alive).length, lod, nearK: g.nearK, crowd: g.crowd.stats,
  nearTrees: fol.near.map((m) => m.count), midTrees: fol.mid.map((m) => m.count), rocks: fol.rocks.map((m) => m.count), cards: fol.cards.count,
  batches: batches.length, crowdTrisSum: byTris.reduce((a, b) => a + b, 0),
  topBatches: batches.sort((a, b) => b.n * b.tris - a.n * a.tris).slice(0, 8),
};
