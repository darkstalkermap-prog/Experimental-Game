// Scenery: sky, lighting, terrain mesh, roads, forests and rocks.
import * as THREE from 'three';
import { WORLD, CASTLE, HILL, PRACTICE } from './config.js';
import { CASTLE_SITES } from './physics.js';
import { mulberry32, smoothstep } from './noise.js';
import { Terrain } from './terrain.js';
import { Foliage } from './foliage.js';
import { placeScenery, placeWallTrees } from './scenery.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.45).normalize();

// Roads run from each castle gate to the centre of the map.
export const ROADS = [];
export function layoutRoads() {
  ROADS.length = 0;
  for (const s of CASTLE_SITES) {
    const len = Math.hypot(s.x, s.z);
    const gx = s.x - (s.x / len) * (CASTLE.H + 4), gz = s.z - (s.z / len) * (CASTLE.H + 4);
    ROADS.push({ ax: gx, az: gz, bx: 0, bz: 0 });
  }
}
layoutRoads();

function distToSeg(px, pz, r) {
  const vx = r.bx - r.ax, vz = r.bz - r.az;
  const t = Math.max(0, Math.min(1, ((px - r.ax) * vx + (pz - r.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (r.ax + vx * t), pz - (r.az + vz * t));
}
export function roadDist(x, z) {
  let d = Infinity;
  for (const r of ROADS) d = Math.min(d, distToSeg(x, z, r));
  // ring road around the centre
  d = Math.min(d, Math.abs(Math.hypot(x, z) - 34));
  return d;
}

export function createSky(scene, renderer = null) {
  const geo = new THREE.SphereGeometry(1500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x4472b0) },
      horizon: { value: new THREE.Color(0xe2d8c4) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 col = mix(horizon, top, pow(max(h,0.0), 0.55));
        float s = max(dot(vDir, sunDir), 0.0);
        col += vec3(1.0,0.85,0.6) * pow(s, 9.0) * 0.35 + vec3(1.0,0.95,0.85) * pow(s, 900.0) * 4.0;
        // soft clouds
        if (vDir.y > 0.02) {
          vec2 uv = vDir.xz / (vDir.y + 0.15) * 2.0;
          float c = noise(uv*1.3) * 0.6 + noise(uv*3.1) * 0.3 + noise(uv*7.0) * 0.1;
          c = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.25, vDir.y);
          col = mix(col, vec3(1.0,0.98,0.96), c * 0.75);
        }
        if (h < 0.0) col = mix(horizon, vec3(0.35,0.38,0.33), clamp(-h*6.0,0.0,1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  // image-based lighting so metal (swords, armour) reflects the sky instead of rendering black
  if (renderer) {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(geo, mat));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16), new THREE.MeshBasicMaterial({ color: 0x4f5a36 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -40;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.userData.environmentTarget = pmrem.fromScene(envScene, 0.02);
    scene.environment = scene.userData.environmentTarget.texture;
    ground.geometry.dispose();
    ground.material.dispose();
    pmrem.dispose();
  }
  scene.fog = new THREE.FogExp2(0xd6d2c4, 0.0032);
  scene.background = new THREE.Color(0xd6d2c4);
  return sky;
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xc8d8f0, 0x5a5230, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdcae, 2.9);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 70;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 320 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

// Keep the shadow frustum centred on the camera.
export function followShadow(sun, focus) {
  sun.target.position.set(focus.x, focus.y, focus.z);
  sun.position.set(focus.x + SUN_DIR.x * 150, focus.y + SUN_DIR.y * 150, focus.z + SUN_DIR.z * 150);
}

export function createTerrain(scene, physics) {
  layoutRoads();
  // the land (play area chunks and the far mountains) lives in terrain.js; world.js keeps the roads it is drawn with
  const terrain = new Terrain(scene, physics, { roadDist, roads: ROADS });
  (scene.userData.worldSystems || (scene.userData.worldSystems = [])).push(terrain);
  return terrain;
}

function okForProp(x, z, physics) {
  for (const s of CASTLE_SITES) {
    if (Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) < CASTLE.H + 30) return false;
  }
  if (roadDist(x, z) < 7) return false;
  if (Math.hypot(x, z) < 44) return false;
  if (physics.practice && Math.abs(x - physics.practice.x) < PRACTICE.hw + 16 && Math.abs(z - physics.practice.z) < PRACTICE.hd + 16) return false;   // the practice yard
  return true;
}

export function createForest(scene, physics) {
  const rng = mulberry32(42);
  const pines = [], oaks = [], rocks = [];
  const { fbm } = physics.noise;
  let tries = 0;
  const area = (WORLD.half / 220) ** 2;
  while ((pines.length + oaks.length) < 900 * area && tries++ < 20000 * area) {
    const x = (rng() * 2 - 1) * (WORLD.half - 4);
    const z = (rng() * 2 - 1) * (WORLD.half - 4);
    if (!okForProp(x, z, physics)) continue;
    const density = fbm(x * 0.012 + 50, z * 0.012, 3) * 0.5 + 0.5;
    const edge = Math.max(Math.abs(x), Math.abs(z)) > WORLD.half - 35 ? 0.35 : 0;
    if (rng() > density * 1.25 - 0.25 + edge) continue;
    const y = physics.terrainHeight(x, z);
    (rng() < 0.6 ? pines : oaks).push({ x, y, z, s: 0.8 + rng() * 0.6, r: rng() * Math.PI * 2, c: rng() });
  }
  tries = 0;
  while (rocks.length < 160 * area && tries++ < 5000 * area) {
    const x = (rng() * 2 - 1) * (WORLD.half - 4);
    const z = (rng() * 2 - 1) * (WORLD.half - 4);
    if (!okForProp(x, z, physics)) continue;
    rocks.push({ x, y: physics.terrainHeight(x, z), z, s: 0.4 + rng() * 1.6, r: rng() * 6, c: rng() });
  }

  // What is drawn lives in foliage.js; this keeps only where the solid things stand. The trees stand a little way into the slope they are on.
  const terrain = (scene.userData.worldSystems || []).find((s) => s.isTerrain);
  const sink = (t) => {
    const sl = Math.hypot(physics.terrainHeight(t.x + 1, t.z) - physics.terrainHeight(t.x - 1, t.z), physics.terrainHeight(t.x, t.z + 1) - physics.terrainHeight(t.x, t.z - 1)) / 2;
    return Math.min(1.1, sl * 0.5);
  };
  const scenery = terrain ? placeScenery(physics, terrain) : { trees: [], rocks: [] };
  const wall = placeWallTrees(physics, okForProp);   // the forest on the steep foot of the mountains: solid, like the others
  const trees = [];
  for (const t of pines) trees.push({ x: t.x, y: t.y - sink(t), z: t.z, s: t.s, r: t.r, c: t.c, conifer: true });
  for (const t of oaks) trees.push({ x: t.x, y: t.y - sink(t), z: t.z, s: t.s, r: t.r, c: t.c, conifer: false });
  for (const t of wall) trees.push({ x: t.x, y: t.y - sink(t), z: t.z, s: t.s, r: t.r, c: t.c, conifer: t.conifer });
  const rockItems = rocks.map((r) => ({ x: r.x, y: r.y, z: r.z, s: r.s, r: r.r, c: r.c }));
  const foliage = new Foliage(scene, trees.concat(scenery.trees), rockItems.concat(scenery.rocks));
  (scene.userData.worldSystems || (scene.userData.worldSystems = [])).push(foliage);

  // Collision for tree trunks (only the playable area matters)
  for (const t of pines.concat(oaks, wall)) {
    if (Math.max(Math.abs(t.x), Math.abs(t.z)) > WORLD.playHalf) continue;
    const r = 0.4 * t.s;
    physics.add({ minX: t.x - r, maxX: t.x + r, minZ: t.z - r, maxZ: t.z + r, top: t.y + 8, kind: 'tree', noWalk: true });
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
  const g = new THREE.BoxGeometry(1.6, 5, 1);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const x = Math.cos(a) * 14, z = Math.sin(a) * 14;
    const y = physics.terrainHeight(x, z);
    const m = new THREE.Mesh(g, stoneMat);
    m.position.set(x, y + 2.2, z);
    m.rotation.y = -a;
    m.rotation.z = (i % 3 - 1) * 0.06;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    physics.add({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9, top: y + 4.6, kind: 'stone' });
  }
}
