const g = window.__game;
const S = await import('/src/scenery.js');
const W = await import('/src/world.js');
const wall = S.placeWallTrees(g.physics, (x, z, p) => true);
const terrain = g.scene.userData.worldSystems.find((s) => s.isTerrain);
const sc = S.placeScenery(g.physics, terrain);
return { wallTrees: wall.length, sceneryTrees: sc.trees.length, sceneryRocks: sc.rocks.length };
