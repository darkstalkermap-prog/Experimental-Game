// Online play with no game server: players' browsers connect straight to each other (WebRTC, via PeerJS).
// A free public PeerJS broker is only used to introduce them, using the 4-letter room code.
// It offers the same interface as Net (net.js), so the lobby and the sync code don't care which is used.
//   host   -> registers as "cw-CODE" and accepts up to 3 connections
//   client -> connects to "cw-CODE" and says hello with its name
const MAX_CLIENTS = 3;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const prefix = 'cw-';
const dbg = (...a) => { if (location.search.includes('dbg=1')) console.log('[peernet]', ...a); };
const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

// ?peerhost=localhost&peerport=9000 points at another broker (for testing); the default is PeerJS's free one.
function brokerConfig() {
  const q = new URLSearchParams(location.search);
  const cfg = { debug: 0 };
  if (q.get('peerhost')) {
    cfg.host = q.get('peerhost');
    cfg.port = Number(q.get('peerport')) || 9000;
    cfg.secure = q.get('peersecure') === '1';
    cfg.path = '/';
    if (q.get('peerice') === 'none') cfg.config = { iceServers: [] }; // same-machine tests, no internet needed
  }
  return cfg;
}

export class PeerNet {
  constructor() {
    this.role = null;
    this.id = null;
    this.code = null;
    this.handlers = {};
    this.peer = null;
    this.conns = new Map();   // host: client id -> connection
    this.conn = null;         // client: connection to the host
    this.locked = false;
  }

  static available() {
    return !!(window.peerjs && window.peerjs.Peer && window.RTCPeerConnection && /^https?:$/.test(location.protocol));
  }

  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, data) { if (this.handlers[ev]) this.handlers[ev](data); }
  connect() { return Promise.resolve(); }

  create(name, tries = 0) {
    this.role = 'host';
    const code = newCode();
    const peer = new window.peerjs.Peer(prefix + code, brokerConfig());
    this.peer = peer;
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened) { this.emit('error', 'Could not reach the matchmaking service. Check your connection and try again.'); this.close(); }
    }, 12000);
    peer.on('open', () => {
      opened = true;
      clearTimeout(timer);
      this.code = code;
      this.id = 0;
      this.emit('created', { code });
    });
    peer.on('connection', (conn) => this.onConnection(conn));
    peer.on('error', (e) => {
      if (!opened && e.type === 'unavailable-id' && tries < 6) { clearTimeout(timer); peer.destroy(); this.create(name, tries + 1); return; }
      if (!opened) { clearTimeout(timer); this.emit('error', 'Could not reach the matchmaking service. Check your connection and try again.'); }
    });
  }

  onConnection(conn) {
    let id = null;
    dbg('host: incoming connection');
    conn.on('open', () => dbg('host: conn open'));
    conn.on('data', (m) => {
      dbg('host: data', JSON.stringify(m).slice(0, 100));
      if (!m) return;
      if (m.t === 'hello' && id === null) {
        if (this.locked) { this.reject(conn, 'That game has already started.'); return; }
        const free = [1, 2, 3].find((i) => !this.conns.has(i));
        if (free === undefined) { this.reject(conn, 'That game is full.'); return; }
        id = free;
        this.conns.set(id, conn);
        conn.send({ t: 'joined', code: this.code, id });
        this.emit('peer', { id, name: String(m.name || 'Lord').slice(0, 16) });
      } else if (m.t === 'up' && id !== null) {
        this.emit('data', { from: id, d: m.d });
      }
    });
    const gone = () => {
      if (id !== null && this.conns.get(id) === conn) { this.conns.delete(id); this.emit('leave', id); }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  reject(conn, msg) {
    try { conn.send({ t: 'error', msg }); } catch (e) { /* ignore */ }
    setTimeout(() => conn.close(), 300);
  }

  join(code, name) {
    this.role = 'client';
    this.code = code;
    const fail = (msg) => { if (!this.done) { this.done = true; this.emit('error', msg); this.close(); } };
    const peer = new window.peerjs.Peer(undefined, brokerConfig());
    this.peer = peer;
    const timer = setTimeout(() => fail(`Could not connect to game ${code}. Check the code, or ask the host to try again.`), 25000);
    peer.on('open', () => {
      const conn = peer.connect(prefix + code, { reliable: true });
      this.conn = conn;
      conn.on('open', () => conn.send({ t: 'hello', name }));
      conn.on('data', (m) => {
        dbg('client: data', JSON.stringify(m).slice(0, 100));
        if (!m) return;
        if (m.t === 'joined') { clearTimeout(timer); this.done = true; this.id = m.id; this.emit('joined', { code: m.code, id: m.id }); }
        else if (m.t === 'error') { clearTimeout(timer); fail(m.msg); }
        else if (m.t === 'd') this.emit('data', { from: 0, d: m.d });
      });
      conn.on('close', () => { if (this.done) this.emit('hostleft'); else { clearTimeout(timer); fail(`No game found with code ${code}.`); } });
    });
    peer.on('error', (e) => {
      clearTimeout(timer);
      fail(e.type === 'peer-unavailable' ? `No game found with code ${code}.` : 'Could not reach the matchmaking service. Check your connection and try again.');
    });
  }

  lock() { this.locked = true; }
  toHost(d) { if (this.conn && this.conn.open) this.conn.send({ t: 'up', d }); }
  toClient(id, d) { const c = this.conns.get(id); if (c && c.open) c.send({ t: 'd', d }); }
  toAll(d) { for (const c of this.conns.values()) if (c.open) c.send({ t: 'd', d }); }
  close() {
    this.done = true;
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = null;
  }
}
