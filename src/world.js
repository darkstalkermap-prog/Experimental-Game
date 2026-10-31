// Scenery: sky, lighting, terrain mesh, roads, forests and rocks.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { box } from './materials.js';
import { SUN_DIR, createAtmosphere } from './atmosphere.js';
import { ShadowRig } from './shadows.js';
import { Terrain, rockCover } from './terrain.js';
import { Foliage } from './foliage.js';
import { placeScenery } from './scenery.js';
import { active, treeSlot } from './biomes.js';
import { ROADS, layoutRoads, roadDist } from './roads.js';
import { scatterSolid } from './scatter.js';

export { SUN_DIR };   // (the sun and the sky live in atmosphere.js)

export { ROADS, layoutRoads, roadDist };   // (the roads live in roads.js; the modules that always imported them from here still can)

// The sky dome, the fog and the environment map (see atmosphere.js).
export function createSky(scene, renderer = null) {
  return createAtmosphere(scene, renderer);
}

// The sun (warm key light with cascaded shadows: shadows.js), and a cool sky / warm ground hemisphere as the fill. The biome sets their colours (biomes.js).
export function createLights(scene) {
  const air = active.def.air;
  const hemi = new THREE.HemisphereLight(air.hemiSky, air.hemiGround, air.hemiI);
  scene.add(hemi);
  const rig = new ShadowRig(scene);
  rig.sun.color.set(air.sun);
  rig.sun.intensity = air.sunI;
  return { hemi, sun: rig.sun, far: rig.far, rig };
}

// Keep the shadow maps centred on the camera (snapped to whole texels, so the edges do not shimmer).
export function followShadow(sun, focus) {
  if (sun.userData.rig) sun.userData.rig.follow(focus);
}

// the solid trees and rocks (scatter.js), worked out once per world: the ground under the trees (terrain.js) and the trees themselves read the same list
const scattered = new WeakMap();
function solidScatter(physics) {
  let s = scattered.get(physics);
  if (!s) scattered.set(physics, s = scatterSolid(physics));
  return s;
}

export function createTerrain(scene, physics) {
  layoutRoads();
  // the land (play area chunks and the far mountains) lives in terrain.js; world.js keeps the roads it is drawn with
  const solid = solidScatter(physics);
  const terrain = new Terrain(scene, physics, { roadDist, roads: ROADS, trees: solid.pines.concat(solid.oaks) });
  (scene.userData.worldSystems || (scene.userData.worldSystems = [])).push(terrain);
  return terrain;
}

export function createForest(scene, physics) {
  const F = active.def.flora;
  const { pines, oaks, rocks } = solidScatter(physics);

  // What is drawn lives in foliage.js; this keeps only where the solid things stand. The trees stand a little way into the slope they are on.
  const terrain = (scene.userData.worldSystems || []).find((s) => s.isTerrain);
  const sink = (t) => {
    const sl = Math.hypot(physics.terrainHeight(t.x + 1, t.z) - physics.terrainHeight(t.x - 1, t.z), physics.terrainHeight(t.x, t.z + 1) - physics.terrainHeight(t.x, t.z - 1)) / 2;
    return Math.min(1.1, sl * 0.5);
  };
  const scenery = terrain ? placeScenery(physics, terrain) : { trees: [], rocks: [] };
  const trees = [];
  // (those beyond the edge of the play area that stand on bare rock are not drawn: they have no collider, and on the mountain's grey face a lone
  // tree reads as stuck on the cliff; the ones inside are solid and stay where they are, the ground under them turns to forest floor, terrain.js)
  const P = WORLD.playHalf;
  const shown = (t) => !terrain || Math.max(Math.abs(t.x), Math.abs(t.z)) <= P + 1 ||
    rockCover(physics.noise, physics, t.x, t.z, physics.rawHeight(t.x, t.z), terrain.drawnSlope(t.x, t.z)) < 0.3;
  for (const t of pines) if (shown(t)) trees.push({ x: t.x, y: t.y - sink(t), z: t.z, s: t.s, r: t.r, c: t.c, conifer: true });
  for (const t of oaks) if (shown(t)) trees.push({ x: t.x, y: t.y - sink(t), z: t.z, s: t.s, r: t.r, c: t.c, conifer: false });
  const rockItems = rocks.map((r) => ({ x: r.x, y: r.y, z: r.z, s: r.s, r: r.r, c: r.c }));
  const foliage = new Foliage(scene, trees.concat(scenery.trees), rockItems.concat(scenery.rocks));
  (scene.userData.worldSystems || (scene.userData.worldSystems = [])).push(foliage);

  // Collision for tree trunks (only the playable area matters; a dry shrub is something to walk through)
  for (const [list, conifer] of [[pines, true], [oaks, false]]) {
    for (const t of list) {
      if (Math.max(Math.abs(t.x), Math.abs(t.z)) > WORLD.playHalf) continue;
      if (!F.solid[treeSlot(t.x, t.z, conifer)]) continue;
      const r = 0.4 * t.s;
      physics.add({ minX: t.x - r, maxX: t.x + r, minZ: t.z - r, maxZ: t.z + r, top: t.y + F.top, kind: 'tree', noWalk: true });
    }
  }
  // Rocks are solid too: nobody walks through them, and soldiers steer round them like the standing stones. Only the
  // knee-high ones are low enough to step onto.
  for (const r of rocks) {
    if (Math.max(Math.abs(r.x), Math.abs(r.z)) > WORLD.playHalf) continue;
    const h = 0.8 * r.s;
    // it stands on the highest ground around it, so someone coming up the slope behind it can't just step over
    let base = r.y;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) base = Math.max(base, physics.terrainHeight(r.x + sx * (h + 0.4), r.z + sz * (h + 0.4)));
    physics.add({ minX: r.x - h, maxX: r.x + h, minZ: r.z - h, maxZ: r.z + h, top: base + 1.1 * r.s, kind: 'stone', noWalk: r.s > 0.58 });
  }
}

// Standing stones in the middle of the battlefield.
export function createCentrePiece(scene, physics, stoneMat) {
  if (physics.war) return;   // (War Mode's bowl: an open floor)
  const g = box(1.6, 5, 1, 4);   // (the texture keeps one size per metre: courses of blocks, not one huge block per face)
  g.translate(0, 2.5, 0);        // (standing on its own origin: the weathering of the stone starts at the ground)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const x = Math.cos(a) * 14, z = Math.sin(a) * 14;
    const y = physics.terrainHeight(x, z);
    const m = new THREE.Mesh(g, stoneMat);
    m.position.set(x, y - 0.3, z);
    m.rotation.y = -a;
    m.rotation.z = (i % 3 - 1) * 0.06;
    m.castShadow = m.receiveShadow = true;
    m.updateMatrix(); m.matrixAutoUpdate = false;
    scene.add(m);
    physics.add({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9, top: y + 4.6, kind: 'stone' });
  }
}
