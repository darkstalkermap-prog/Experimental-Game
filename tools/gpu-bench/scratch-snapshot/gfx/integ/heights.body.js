const g = window.__game, P = g.physics;
const { WORLD } = await import('/src/config.js');
const lim = WORLD.playHalf;
let h = 2166136261, n = 0, maxd = 0;
for (let x = -lim; x <= lim; x += 3.1) for (let z = -lim; z <= lim; z += 3.1) {
  const t = P.terrainHeight(x, z), v = Math.round(t * 1000); h ^= v; h = Math.imul(h, 16777619); n++;
  const r = P.rawHeight ? P.rawHeight(x, z) : t; maxd = Math.max(maxd, Math.abs(r - t));
}
return { size: WORLD.size, playHalf: lim, samples: n, heightsHash: (h >>> 0).toString(16) };
