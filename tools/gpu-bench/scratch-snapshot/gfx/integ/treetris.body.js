const F = await import('/src/foliagegeo.js');
const out = {};
const tri = (g) => g.index ? g.index.count / 3 : g.attributes.position.count / 3;
for (const [name, fn] of [['spruce', F.buildSpruce], ['pine', F.buildPine], ['oak', F.buildOak], ['birch', F.buildBirch]]) out[name] = [0, 1].map((l) => tri(fn(l)));
out.rock = [0, 1, 2].map((k) => tri(F.buildRock(k, 1)));
return out;
