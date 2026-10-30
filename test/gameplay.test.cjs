const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = (file) => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '..', file)).toString('base64'));

test('teleports snap immediately, while ordinary movement still interpolates', async () => {
  const { Interp, setInterpDelay } = await load('src/interpolation.js');
  setInterpDelay(0.12);
  const interp = new Interp(), out = {};
  interp.push(0, 2, 0, 0);
  interp.push(100, 4, 50, 1.5, 7);
  interp.sample(out);
  assert.deepEqual(out, { x: 100, y: 4, z: 50, yaw: 1.5, extra: 7 });
  interp.push(102, 4, 50, 1.6);
  const now = performance.now() / 1000;
  interp.a.t = now - 0.22;
  interp.b.t = now - 0.02;
  interp.sample(out);
  assert.ok(out.x > 100.9 && out.x < 101.1, `expected interpolation, got ${out.x}`);
});

test('live rooms reject a fifth player before joining and free slots on leave', async () => {
  const { RoomNet } = await load('src/roomnet.js');
  const host = new RoomNet(null);
  host.role = 'host'; host.id = 'host';
  let presence;
  host.rooms = [{ presence: async (p) => { presence = JSON.parse(JSON.stringify(p)); } }];
  const admitted = [];
  host.on('peer', ({ id }) => admitted.push(id));
  const change = (joined = [], left = []) => ({ peers: [], joined, updated: [], left });
  const peer = (id) => ({ peer: id, presence: { role: 'client', name: id } });
  for (const id of ['a', 'b', 'c', 'd']) host.onMain(change([peer(id)]));
  assert.deepEqual(admitted, ['a', 'b', 'c']);
  assert.equal(host.known.size, 3);
  const rejected = new RoomNet(null);
  rejected.role = 'client'; rejected.id = 'd';
  let joined = false, error, leaves = 0;
  rejected.rooms = [{ leave: async () => { leaves++; } }];
  rejected.on('joined', () => { joined = true; });
  rejected.on('error', (msg) => { error = msg; });
  rejected.onMain(change([{ peer: 'host', presence }]));
  assert.match(error, /full/);
  assert.equal(joined, false);
  assert.equal(leaves, 1);
  assert.equal(rejected.rooms.length, 0);
  host.onMain(change([], [peer('b')]));
  host.onMain(change([peer('e')]));
  assert.deepEqual(admitted, ['a', 'b', 'c', 'e']);
  const accepted = new RoomNet(null);
  accepted.role = 'client'; accepted.id = 'e';
  let joins = 0;
  accepted.on('joined', () => { joins++; });
  accepted.onMain(change([{ peer: 'host', presence }]));
  accepted.onMain(change([{ peer: 'host', presence }]));
  assert.equal(joins, 1);
});

test('clients await admission and accepted clients can receive a coalesced start', async () => {
  const { RoomNet } = await load('src/roomnet.js');
  const client = new RoomNet(null);
  client.role = 'client'; client.id = 'a';
  const events = [];
  client.on('joined', () => events.push('joined'));
  client.on('data', ({ d }) => events.push(d.k));
  const change = (presence) => ({ peers: [], joined: [], left: [], updated: [{ peer: 'host', presence: { role: 'host', ...presence } }] });
  client.onMain(change({ members: [] }));
  assert.deepEqual(events, []);
  client.onMain(change({ members: ['a'], locked: 1, out: [{ s: 1, to: 'all', d: { k: 'start' } }] }));
  assert.deepEqual(events, ['joined', 'start']);
});

test('snapshot codecs preserve the existing field order and compact wire format', async () => {
  const { packFaction, unpackFaction, packHero, unpackHero } = await load('src/snapshot.js');
  const faction = { gold: 500, troopCap: 12, training: 2, eliminated: 0, kills: 3, heroDeaths: 4,
    respawnT: 5, siegeTarget: -1, recruitRole: 1, earned: 900,
    isPlayer: 1, lord: 'Lord', name: 'Blue', formation: 'line', levies: 6, wage: 10, stand: 1 };
  assert.deepEqual(packFaction(faction), [500, 12, 2, 0, 3, 4, 5, -1, 1, 900, 1, 'Lord', 'Blue', 'line', 6, 10, 1]);   // (wage and stand were appended by the comeback rules: the older fields keep their places)
  assert.deepEqual(unpackFaction(packFaction(faction)), faction);
  const hero = { team: 2, x: 1, y: 2, z: 3, yaw: 4, alive: 1, hp: 80, maxHp: 100,
    blocking: 1, swingT: -1, weapon: 0, mounted: 1, heading: 5, rideSpeed: 6, hasHorse: 1,
    horseX: 7, horseY: 8, horseZ: 9, horseYaw: 10, name: 'Hero', pitch: 11, attackDir: 2, blockDir: 3, staggered: 0, classId: 2, driving: 1, movementFlags: 3, level: 4 };
  assert.deepEqual(packHero(hero), [2, 1, 2, 3, 4, 1, 80, 100, 1, -1, 0, 1, 5, 6, 1, 7, 8, 9, 10, 'Hero', 11, 2, 3, 0, 2, 1, 3, 4]);
  assert.deepEqual(unpackHero(packHero(hero)), hero);
  // the Hero Game Mode's fields come last (a war leaves them off): seat, hero kills, deaths, bot, respawn timer
  const seated = { ...hero, hid: 5, heroKills: 2, deaths: 1, bot: 1, respawnT: 7.5 };
  assert.deepEqual(packHero(seated).slice(28), [5, 2, 1, 1, 7.5]);
  assert.deepEqual(unpackHero(packHero(seated)), seated);
  assert.deepEqual(packHero({ ...seated, respawnT: undefined }).length, 32, 'a living hero has no timer to send');
});

test('world disposal releases owned GPU resources once and preserves shared assets', async () => {
  const THREE = await load('vendor/three.module.min.js');
  const { disposeWorld } = await load('src/resources.js');
  const scene = new THREE.Scene();
  const sharedTexture = new THREE.Texture(), ownedTexture = new THREE.Texture();
  const sharedMaterial = new THREE.MeshBasicMaterial({ map: sharedTexture });
  const sharedGeo = new THREE.BoxGeometry();
  const ownedGeo = new THREE.BoxGeometry();
  // A world-owned clone can reference a shared texture: keep the texture alive.
  const clonedMaterial = sharedMaterial.clone();
  const ownedMaterial = new THREE.MeshBasicMaterial({ map: ownedTexture });
  scene.add(new THREE.Mesh(sharedGeo, sharedMaterial));
  scene.add(new THREE.Mesh(ownedGeo, clonedMaterial));
  scene.add(new THREE.Mesh(ownedGeo, ownedMaterial));
  const instances = new THREE.InstancedMesh(ownedGeo, ownedMaterial, 2);
  scene.add(instances);
  const environment = new THREE.WebGLRenderTarget(4, 4);
  scene.environment = environment.texture;
  scene.userData.environmentTarget = environment;
  const sun = new THREE.DirectionalLight();
  sun.shadow.map = new THREE.WebGLRenderTarget(4, 4); scene.add(sun);
  const unusedGeometry = new THREE.BufferGeometry();
  const counters = new Map();
  const resources = [sharedGeo, sharedMaterial, sharedTexture, ownedGeo, clonedMaterial, ownedMaterial,
    ownedTexture, instances, environment, sun.shadow.map, unusedGeometry];
  for (const r of resources) { counters.set(r, 0); r.addEventListener('dispose', () => counters.set(r, counters.get(r) + 1)); }
  disposeWorld(scene, [sharedGeo, sharedMaterial], [unusedGeometry]);
  for (const r of [sharedGeo, sharedMaterial, sharedTexture]) assert.equal(counters.get(r), 0);
  for (const r of resources.slice(3)) assert.equal(counters.get(r), 1);
  assert.equal(scene.children.length, 0);
  assert.equal(scene.environment, null);
});
