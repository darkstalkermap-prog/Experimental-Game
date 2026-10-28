const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const roomModule = import('data:text/javascript;base64,' + fs.readFileSync(path.join(root, 'src/roomnet.js')).toString('base64'));

function snapshot(count = 400) {
  return {
    u: Array.from({ length: count }, (_, i) => [i, 3, 4, 123.4, 12.34, -123.4, 3.14, 1, -1, 4.2, 2, 100, 2, 0, 0, 1]),
    s: [[1, 0, 4, 100, 3, 100, 0, 1, 100, 0, 1]],
    ev: [{ k: 'snd', n: 'horn', p: [0, 1, 0] }], c: [], f: [], h: [],
  };
}
function transport(RoomNet) {
  const host = new RoomNet(null), client = new RoomNet(null), sent = [], received = [];
  host.rooms = Array.from({ length: 8 }, () => ({ presence: async (p) => sent.push(p) }));
  client.id = 'client'; client.hostPeer = 'host';
  client.on('data', (d) => received.push(d.d));
  return { host, client, sent, received };
}
function sendAll(host, s, me) {
  host.sendSnapshot(s, me);
  while (host.transmission) host.sendSnapshot(s, me);
}

test('large snapshots retain all entities, apply atomically, and tolerate reordered duplicates', async () => {
  const { RoomNet } = await roomModule;
  const { host, client, sent, received } = transport(RoomNet);
  const s = snapshot(1000), me = { client: { hp: 100 } };
  sendAll(host, s, me);
  assert.ok(sent.length > 7);
  const shuffled = sent.slice().reverse();
  for (const p of shuffled.slice(0, -1)) { client.addPiece(p.c); client.addPiece(p.c); }
  assert.equal(received.length, 0);
  client.addPiece(shuffled.at(-1).c);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].s, s);
  assert.deepEqual(received[0].me, me.client);
  assert.equal(client.snapDelay, host.snapDelay);
  client.addPiece(shuffled[0].c);
  assert.equal(received.length, 1);
});

test('oversized Unicode headers and escaped names fit the presence byte limit', async () => {
  const { RoomNet } = await roomModule;
  const { host, client, sent, received } = transport(RoomNet);
  const s = snapshot(0);
  s.h = ['城🏰\\"'.repeat(2000)];
  sendAll(host, s, { client: { name: '🌍\\"'.repeat(1000) } });
  for (const p of sent) {
    assert.ok(Buffer.byteLength(JSON.stringify(p)) <= 3300);
    client.addPiece(p.c);
  }
  assert.deepEqual(received[0].s, s);
});

test('a lost piece never applies partial state and a later complete snapshot recovers', async () => {
  const { RoomNet } = await roomModule;
  const { host, client, sent, received } = transport(RoomNet);
  sendAll(host, snapshot(), { client: { hp: 100 } });
  for (const p of sent.slice(1)) client.addPiece(p.c);
  assert.equal(received.length, 0);
  sent.length = 0;
  const next = snapshot(10);
  sendAll(host, next, { client: { hp: 90 } });
  for (const p of sent) client.addPiece(p.c);
  assert.deepEqual(received[0].s, next);
  assert.equal(client.pieces.size, 0);
});

test('a snapshot in flight stays consistent while newer state arrives', async () => {
  const { RoomNet } = await roomModule;
  const { host, client, sent, received } = transport(RoomNet);
  const original = snapshot(1000), newer = snapshot(2);
  host.sendSnapshot(original, { client: { hp: 100 } });
  assert.ok(host.transmission);
  while (host.transmission) host.sendSnapshot(newer, { client: { hp: 50 } });
  for (const p of sent) client.addPiece(p.c);
  assert.deepEqual(received[0].s, original);
  assert.equal(received[0].me.hp, 100);
  sent.length = 0;
  sendAll(host, newer, { client: { hp: 50 } });
  for (const p of sent) client.addPiece(p.c);
  assert.deepEqual(received[1].s, newer);
  assert.equal(received[1].me.hp, 50);
});

test('shared snapshot includes each client and closing cancels queued publication', async () => {
  const { RoomNet } = await roomModule;
  const { host, client, sent, received } = transport(RoomNet);
  const s = snapshot(1);
  host.toClient('client', { k: 'snap', s, me: { hp: 100 } });
  host.toClient('other', { k: 'snap', s, me: { hp: 50 } });
  await Promise.resolve();
  const other = new RoomNet(null); other.id = 'other';
  let otherSnapshot;
  other.on('data', ({ d }) => { otherSnapshot = d; });
  for (const p of sent) { client.addPiece(p.c); other.addPiece(p.c); }
  assert.equal(received[0].me.hp, 100);
  assert.equal(otherSnapshot.me.hp, 50);
  const count = sent.length;
  for (const room of host.rooms) room.leave = async () => {};
  host.toClient('client', { k: 'snap', s: snapshot(2), me: { hp: 90 } });
  host.close();
  await Promise.resolve();
  assert.equal(sent.length, count);
});

test('failed room joins release all successful memberships', async () => {
  const { RoomNet } = await roomModule;
  let left = 0;
  const room = { join: async (name) => {
    if (name.endsWith('-3')) throw new Error('unavailable');
    return { leave: async () => { left++; } };
  } };
  const connection = new RoomNet(room);
  await assert.rejects(connection.joinRooms('ABCD'), /Could not reach/);
  assert.equal(left, 7);
  assert.equal(connection.rooms.length, 0);
});

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}
function message(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', read); reject(new Error('Missing message: ' + type)); }, 3000);
    function read(data) {
      const m = JSON.parse(data);
      if (m.t !== type) return;
      clearTimeout(timer); ws.off('message', read); resolve(m);
    }
    ws.on('message', read);
  });
}

test('server survives malformed inputs and still hosts, joins, relays and locks games', { timeout: 10000 }, async (t) => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const server = spawn(process.execPath, ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  await once(server.stdout, 'data');
  for (const pathname of ['/%ZZ', '/%00', '/%E0%A4%A']) assert.equal((await request(port, pathname)).status, 400);
  for (const pathname of ['/.git/config', '/server/server.js', '/node_modules/ws/package.json', '/%2e%2e%2fExperimental-Game-other/file']) {
    assert.equal((await request(port, pathname)).status, 403);
  }
  assert.equal((await request(port, '/')).status, 200);
  assert.equal((await request(port, '/src/main.js')).status, 200);
  const host = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => host.terminate()); await once(host, 'open');
  for (const raw of ['null', '[]', '42', '"text"', '{', '{"t":null}']) host.send(raw);
  const created = message(host, 'created'); host.send(JSON.stringify({ t: 'create' }));
  const { code } = await created;
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => client.terminate()); await once(client, 'open');
  const invalid = message(client, 'error');
  client.send(JSON.stringify({ t: 'join', code: { toString: null } })); await invalid;
  const joined = message(client, 'joined'), peer = message(host, 'peer');
  client.send(JSON.stringify({ t: 'join', code, name: { toString: null } }));
  const { id } = await joined; assert.equal((await peer).name, 'Player');
  const up = message(host, 'd'); client.send(JSON.stringify({ t: 'up', d: { a: 'pose', x: 1 } }));
  assert.deepEqual(await up, { t: 'd', from: id, d: { a: 'pose', x: 1 } });
  const down = message(client, 'd'); host.send(JSON.stringify({ t: 'relay', to: id, d: { k: 'snap' } }));
  assert.deepEqual((await down).d, { k: 'snap' });
  host.send(JSON.stringify({ t: 'lock' }));
  // A same-socket round trip ensures the lock was processed before the new join.
  const barrier = message(client, 'd'); host.send(JSON.stringify({ t: 'relay', to: id, d: { k: 'barrier' } })); await barrier;
  const late = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => late.terminate()); await once(late, 'open');
  const denied = message(late, 'error'); late.send(JSON.stringify({ t: 'join', code }));
  assert.match((await denied).msg, /already started/);
  const hostleft = message(client, 'hostleft'); host.close(); await hostleft;
  assert.equal(JSON.parse((await request(port, '/api/ping')).body).castleWars, true);
});
