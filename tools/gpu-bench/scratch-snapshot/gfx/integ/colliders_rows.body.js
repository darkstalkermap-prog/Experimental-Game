// A fingerprint of every collider in the world (world grid and the castle buckets), to prove the solid things did not move.
const g = window.__game, P = g.physics;
const seen = new Set(), rows = [];
const take = (c, where) => { if (seen.has(c)) return; seen.add(c); rows.push([where, c.kind || '', +c.minX.toFixed(3), +c.maxX.toFixed(3), +c.minZ.toFixed(3), +c.maxZ.toFixed(3), +(+c.top).toFixed(3), +(c.bottom === undefined ? -100 : c.bottom).toFixed(3), c.noWalk ? 1 : 0, c.noProjectile ? 1 : 0]); };
for (const list of P.grid.values()) for (const c of list) take(c, 'w');
for (const b of P.buckets) { for (const c of b.list) take(c, 'b'); for (const c of b.shots) take(c, 's'); }
rows.sort((a, b) => (a[0] + a[1] + String(a[2]).padStart(9) + String(a[4]).padStart(9) + String(a[6])).localeCompare(b[0] + b[1] + String(b[2]).padStart(9) + String(b[4]).padStart(9) + String(b[6])));
let h = 2166136261;
const s = JSON.stringify(rows);
for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
const kinds = {};
for (const r of rows) kinds[r[0] + ':' + r[1]] = (kinds[r[0] + ':' + r[1]] || 0) + 1;
// the terrain heights on a coarse grid
let th = 2166136261;
for (let x = -200; x <= 200; x += 7) for (let z = -200; z <= 200; z += 7) { const v = Math.round(P.terrainHeight(x, z) * 1000); th ^= v; th = Math.imul(th, 16777619); }
return { rows, count: rows.length, hash: (h >>> 0).toString(16), kinds, heightsHash: (th >>> 0).toString(16) };
