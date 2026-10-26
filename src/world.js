// Scenery: sky, lighting, terrain mesh, roads, forests and rocks.
import * as THREE from 'three';
import { WORLD, CASTLE } from './config.js';
import { CASTLE_SITES } from './physics.js';
import { mulberry32, smoothstep } from './noise.js';
import { grassDetailTexture } from './textures.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.45).normalize();

// Roads run from each castle gate to the centre of the map.
export const ROADS = CASTLE_SITES.map((s) => {
  const len = Math.hypot(s.x, s.z);
  const gx = s.x - (s.x / len) * (CASTLE.H + 4), gz = s.z - (s.z / len) * (CASTLE.H + 4);
  return { ax: gx, az: gz, bx: 0, bz: 0 };
});

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
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
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
  const size = WORLD.half * 2;
  const segs = physics.n - 1;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const uv = geo.attributes.uv;
  const { fbm } = physics.noise;
  const grassA = new THREE.Color(0x5d7a32), grassB = new THREE.Color(0x7d8e3e), grassDry = new THREE.Color(0x9a9050);
  const dirt = new THREE.Color(0x7b6646), rock = new THREE.Color(0x77736a), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = physics.terrainHeight(x, z);
    pos.setY(i, h);
    uv.setXY(i, x / 6, z / 6);
    // slope from neighbours
    const hx = physics.terrainHeight(x + 2, z) - physics.terrainHeight(x - 2, z);
    const hz = physics.terrainHeight(x, z + 2) - physics.terrainHeight(x, z - 2);
    const slope = Math.hypot(hx, hz) / 4;
    const n1 = fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
    const n2 = fbm(x * 0.09 + 10, z * 0.09, 2) * 0.5 + 0.5;
    tmp.copy(grassA).lerp(grassB, n1).lerp(grassDry, smoothstep(0.55, 0.9, n2) * 0.6);
    // trampled earth around castles
    for (const s of CASTLE_SITES) {
      const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      const w = (1 - smoothstep(CASTLE.H + 2, CASTLE.H + 14, d)) * (0.55 + 0.3 * n2);
      tmp.lerp(dirt, w);
    }
    const rd = roadDist(x, z);
    tmp.lerp(dirt, (1 - smoothstep(2.2, 4.5, rd)) * 0.85);
    tmp.lerp(rock, smoothstep(0.35, 0.8, slope));
    const shade = 0.9 + n2 * 0.15;
    colors[i * 3] = tmp.r * shade; colors[i * 3 + 1] = tmp.g * shade; colors[i * 3 + 2] = tmp.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassDetailTexture(), roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function okForProp(x, z, physics) {
  for (const s of CASTLE_SITES) {
    if (Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) < CASTLE.H + 30) return false;
  }
  if (roadDist(x, z) < 7) return false;
  if (Math.hypot(x, z) < 44) return false;
  return true;
}

export function createForest(scene, physics) {
  const rng = mulberry32(42);
  const pines = [], oaks = [], rocks = [];
  const { fbm } = physics.noise;
  let tries = 0;
  while ((pines.length + oaks.length) < 900 && tries++ < 20000) {
    const x = (rng() * 2 - 1) * (WORLD.half - 4);
    const z = (rng() * 2 - 1) * (WORLD.half - 4);
    if (!okForProp(x, z, physics)) continue;
    const density = fbm(x * 0.012 + 50, z * 0.012, 3) * 0.5 + 0.5;
    const edge = Math.max(Math.abs(x), Math.abs(z)) > 185 ? 0.35 : 0;
    if (rng() > density * 1.25 - 0.25 + edge) continue;
    const y = physics.terrainHeight(x, z);
    (rng() < 0.6 ? pines : oaks).push({ x, y, z, s: 0.8 + rng() * 0.6, r: rng() * Math.PI * 2, c: rng() });
  }
  tries = 0;
  while (rocks.length < 160 && tries++ < 5000) {
    const x = (rng() * 2 - 1) * (WORLD.half - 4);
    const z = (rng() * 2 - 1) * (WORLD.half - 4);
    if (!okForProp(x, z, physics)) continue;
    rocks.push({ x, y: physics.terrainHeight(x, z), z, s: 0.4 + rng() * 1.6, r: rng() * 6, c: rng() });
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  function instanced(geo, mat, items, place, color) {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      place(it);
      m4.compose(p, q, sc);
      im.setMatrixAt(i, m4);
      if (color) im.setColorAt(i, color(it));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
    return im;
  }

  const bark = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
  const needle = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const stone = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 4, 6);
  trunkGeo.translate(0, 2, 0);
  instanced(trunkGeo, bark, pines.concat(oaks), (t) => { p.set(t.x, t.y - 0.2, t.z); q.setFromAxisAngle(up, t.r); sc.set(t.s, t.s, t.s); });

  for (let layer = 0; layer < 3; layer++) {
    const g = new THREE.ConeGeometry(2.6 - layer * 0.7, 3.6 - layer * 0.5, 7);
    g.translate(0, 3.4 + layer * 2.1, 0);
    instanced(g, needle, pines, (t) => { p.set(t.x, t.y, t.z); q.setFromAxisAngle(up, t.r + layer); sc.set(t.s, t.s * 1.15, t.s); },
      (t) => col.setHSL(0.30 + t.c * 0.05, 0.42, 0.18 + t.c * 0.07));
  }
  const blob = new THREE.IcosahedronGeometry(2.6, 1);
  blob.translate(0, 5.6, 0);
  instanced(blob, leaf, oaks, (t) => { p.set(t.x, t.y, t.z); q.setFromAxisAngle(up, t.r); sc.set(t.s * 1.1, t.s * 0.9, t.s * 1.1); },
    (t) => col.setHSL(0.2 + t.c * 0.08, 0.45, 0.24 + t.c * 0.08));
  const blob2 = new THREE.IcosahedronGeometry(1.8, 1);
  blob2.translate(1.2, 4.6, 0.6);
  instanced(blob2, leaf, oaks, (t) => { p.set(t.x, t.y, t.z); q.setFromAxisAngle(up, t.r); sc.set(t.s, t.s, t.s); },
    (t) => col.setHSL(0.22 + t.c * 0.06, 0.4, 0.22 + t.c * 0.07));

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  instanced(rockGeo, stone, rocks, (r) => { p.set(r.x, r.y + r.s * 0.25, r.z); q.setFromEuler(new THREE.Euler(r.r, r.r * 2, r.r * 0.5)); sc.set(r.s * 1.3, r.s * 0.8, r.s); },
    (r) => col.setHSL(0.1, 0.05, 0.38 + r.c * 0.15));

  // Collision for tree trunks (only the playable area matters)
  for (const t of pines.concat(oaks)) {
    if (Math.max(Math.abs(t.x), Math.abs(t.z)) > WORLD.playHalf) continue;
    const r = 0.4 * t.s;
    physics.add({ minX: t.x - r, maxX: t.x + r, minZ: t.z - r, maxZ: t.z + r, top: t.y + 8, kind: 'tree', noWalk: true });
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
