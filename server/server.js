// Castle Wars server: serves the game files and relays messages between the host's browser
// (which runs the simulation) and up to three other players. Run with `npm start`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS = 4;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/ping') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ castleWars: true, rooms: rooms.size }));
    return;
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}server${path.sep}`) || file.includes('node_modules')) {
    res.writeHead(403); res.end(); return;
  }
  if (url.pathname === '/') file = path.join(ROOT, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// room code -> { code, host, peers: Map<id, ws>, nextId, started }
const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1 << 20 });
wss.on('connection', (ws) => {
  ws.room = null;
  ws.id = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.room;
    switch (msg.t) {
      case 'create': {
        if (room) return;
        const code = newCode();
        const r = { code, host: ws, peers: new Map(), nextId: 1, started: false };
        rooms.set(code, r);
        ws.room = r; ws.id = 0;
        send(ws, { t: 'created', code, id: 0 });
        break;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) { send(ws, { t: 'error', msg: 'No game with that code.' }); return; }
        if (r.started) { send(ws, { t: 'error', msg: 'That game has already started.' }); return; }
        if (r.peers.size + 1 >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That game is full (4 players).' }); return; }
        const id = r.nextId++;
        r.peers.set(id, ws);
        ws.room = r; ws.id = id;
        send(ws, { t: 'joined', code: r.code, id });
        send(r.host, { t: 'peer', id, name: String(msg.name || 'Player').slice(0, 20) });
        break;
      }
      case 'lock':        // host: game started, no more joins
        if (room && ws === room.host) room.started = true;
        break;
      case 'kick':
        if (room && ws === room.host) { const p = room.peers.get(msg.id); if (p) p.close(); }
        break;
      case 'relay': {     // host -> one client or everyone
        if (!room || ws !== room.host) return;
        const out = JSON.stringify({ t: 'd', d: msg.d });
        if (msg.to === 'all') for (const p of room.peers.values()) send(p, out);
        else send(room.peers.get(msg.to), out);
        break;
      }
      case 'up':          // client -> host
        if (!room || ws === room.host) return;
        send(room.host, { t: 'd', from: ws.id, d: msg.d });
        break;
      default:
        break;
    }
  });
  ws.on('close', () => {
    const r = ws.room;
    if (!r) return;
    if (ws === r.host) {
      for (const p of r.peers.values()) { send(p, { t: 'hostleft' }); p.room = null; }
      rooms.delete(r.code);
    } else {
      r.peers.delete(ws.id);
      send(r.host, { t: 'leave', id: ws.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Castle Wars running at http://localhost:${PORT}`);
  console.log('Share your address (and the room code shown in the game) with friends on your network.');
});
