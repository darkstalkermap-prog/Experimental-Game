// Online play without a game server: when the game runs as a claude.ai artifact, players meet in the
// artifact's live "room" and talk through presence (each page's small shared state object).
// It offers the same interface as Net (net.js), so the lobby and the sync code don't care which is used.
//
// - Small messages (lobby, start, actions, private events) go in an outbox kept in the sender's presence;
//   receivers handle each sequence number once.
// - The client's pose and the host's snapshots are "latest wins". A snapshot is too big for one presence
//   object (4 KiB), so the host splits it over several named rooms, one piece per room, and clients put the
//   pieces back together.
const MAX_CHUNKS = 8;
const MAX_CLIENTS = 3;
const CHUNK_BYTES = 3300;
const OUTBOX_BYTES = 2600;
const encoder = new TextEncoder();
const len = (o) => encoder.encode(JSON.stringify(o)).length;
const roomName = (code, i) => `cw-${code.toLowerCase()}${i ? '-' + i : ''}`;

export class RoomNet {
  constructor(room) {
    this.room = room;
    this.viaRoom = true;
    this.role = null;
    this.closed = false;
    this.id = null;
    this.code = null;
    this.handlers = {};
    this.rooms = [];        // [main, chunk1..]
    this.out = [];          // outbox: [{ s, to, d }]
    this.seq = 0;
    this.seen = new Map();  // peer -> last handled seq
    this.known = new Map(); // host: peer -> name of clients announced
    this.hostPeer = null;
    this.locked = false;
    this.sid = 0;
    this.pieces = new Map(); // client: snapshot id -> collected chunks
    this.transmission = null;
    this.joinTimer = null;
    this.lastSid = -1;
    this.pev = [];          // client: private events waiting for the next snapshot
    this.snapEvery = 0.15;
    this.snapDelay = 0.2;
  }

  // Is this page inside a claude.ai view that can connect to the live room?
  static async open() {
    try {
      if (!window.claude || !window.claude.use) return null;
      const room = await window.claude.use('room');
      return room || null;
    } catch (e) {
      return null;
    }
  }

  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, data) { if (this.handlers[ev]) this.handlers[ev](data); }
  connect() { return Promise.resolve(); }

  async joinRooms(code) {
    this.code = code;
    const names = [];
    for (let i = 0; i < MAX_CHUNKS; i++) names.push(roomName(code, i));
    try {
      const results = await Promise.allSettled(names.map((n) => this.room.join(n)));
      this.rooms = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) {
        this.close();
        throw failed.reason;
      }
    } catch (e) {
      throw new Error(e && e.code === 'not_permitted'
        ? 'Live rooms are not available for your account on this page.'
        : 'Could not reach the live room. Try again in a moment.');
    }
    this.id = this.rooms[0].peers().find((p) => p.sameTab)?.peer || null;
    this.rooms[0].onPeers((ch) => this.onMain(ch), () => this.emit('closed'));
    for (let i = 1; i < MAX_CHUNKS; i++) this.rooms[i].onPeers((ch) => this.onChunk(i, ch));
  }

  async create(name) {
    this.role = 'host';
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    try { await this.joinRooms(code); } catch (e) { this.emit('error', e.message); return; }
    this.name = name;
    this.publish();
    this.emit('created', { code });
  }

  async join(code, name) {
    this.role = 'client';
    this.name = name;
    try { await this.joinRooms(code); } catch (e) { this.emit('error', e.message); return; }
    this.publish();
    // wait for the host's presence to show up
    const t0 = performance.now();
    const wait = () => {
      if (this.hostPeer || !this.rooms[0]) return;
      if (!this.id) { const me = this.rooms[0].peers().find((p) => p.sameTab); if (me) this.id = me.peer; }
      const host = this.rooms[0].peers().find((p) => p.presence && p.presence.role === 'host');
      if (host && this.id) this.onMain({ peers: this.rooms[0].peers(), joined: [], left: [], updated: [host] });
      if (this.hostPeer || this.closed) return;
      if (performance.now() - t0 > 8000) { this.emit('error', `No game found with code ${code}.`); this.close(); return; }
      this.joinTimer = setTimeout(wait, 250);
    };
    wait();
  }

  publish(extra = {}) {
    if (!this.rooms[0]) return;
    const p = { role: this.role, name: this.name, out: this.out, ...extra };
    if (this.role === 'host') {
      p.locked = this.locked ? 1 : 0;
      p.members = [...this.known.keys()];
    }
    this.rooms[0].presence(p).catch(() => {});
  }

  send(to, d) {
    this.out.push({ s: ++this.seq, to, d });
    while (this.out.length > 1 && len(this.out) > OUTBOX_BYTES) this.out.shift();
    this.publish();
  }

  readOutbox(peer, pres) {
    const out = Array.isArray(pres.out) ? pres.out : [];
    const last = this.seen.get(peer) || 0;
    let max = last;
    for (const m of out) {
      if (!m || typeof m.s !== 'number' || m.s <= last) continue;
      max = Math.max(max, m.s);
      const forMe = m.to === 'all' || m.to === this.id || (m.to === 'host' && this.role === 'host');
      if (!forMe) continue;
      if (this.role === 'client' && m.d && m.d.k === 'pev') { this.pev.push(...(m.d.pev || [])); continue; }
      this.emit('data', { from: peer, d: m.d });
    }
    this.seen.set(peer, max);
  }

  onMain(ch) {
    if (this.closed) return;
    if (!this.id) { const me = ch.peers.find((p) => p.sameTab); if (me) this.id = me.peer; }
    if (this.role === 'host') {
      for (const p of ch.left) {
        if (this.known.has(p.peer)) { this.known.delete(p.peer); this.emit('leave', p.peer); }
      }
      for (const p of [...ch.joined, ...ch.updated]) {
        if (p.sameTab || !p.presence || p.presence.role !== 'client') continue;
        if (!this.known.has(p.peer)) {
          if (this.locked || this.known.size >= MAX_CLIENTS) { this.publish(); continue; }
          this.known.set(p.peer, String(p.presence.name || 'Lord').slice(0, 16));
          this.emit('peer', { id: p.peer, name: this.known.get(p.peer) });
          this.publish();
        }
        this.readOutbox(p.peer, p.presence);
        if (p.presence.pose) this.emit('data', { from: p.peer, d: p.presence.pose });
      }
    } else {
      if (this.hostPeer && ch.left.some((p) => p.peer === this.hostPeer)) { this.emit('hostleft'); return; }
      for (const p of [...ch.joined, ...ch.updated]) {
        if (!p.presence || p.presence.role !== 'host') continue;
        if (!this.hostPeer) {
          const members = p.presence.members || [];
          if (!members.includes(this.id)) {
            const error = p.presence.locked ? 'That game has already started.'
              : members.length >= MAX_CLIENTS ? 'That game is full (4 players).' : null;
            if (error) { this.close(); this.emit('error', error); }
            return; // only report success after the host has reserved a slot
          }
          this.hostPeer = p.peer;
          this.emit('joined', { code: this.code, id: this.id });
        }
        if (p.peer === this.hostPeer) this.readOutbox(p.peer, p.presence);
      }
    }
  }

  // ---- snapshots ----
  onChunk(i, ch) {
    if (this.role !== 'client' || !this.hostPeer) return;
    const p = ch.peers.find((x) => x.peer === this.hostPeer);
    const c = p && p.presence && p.presence.c;
    if (!c || typeof c.sid !== 'number') return;
    this.addPiece(c);
  }

  addPiece(c) {
    if (!Number.isSafeInteger(c.sid) || c.sid <= this.lastSid ||
        !Number.isSafeInteger(c.n) || c.n < 1 ||
        !Number.isSafeInteger(c.i) || c.i < 0 || c.i >= c.n || typeof c.text !== 'string') return;
    let batch = this.pieces.get(c.sid);
    if (!batch) {
      batch = { n: c.n, parts: new Map() };
      this.pieces.set(c.sid, batch);
      // A lost presence update must not retain an incomplete snapshot forever.
      if (this.pieces.size > 6) this.pieces.delete(Math.min(...this.pieces.keys()));
    }
    if (batch.n !== c.n) return;
    batch.parts.set(c.i, c.text);
    if (batch.parts.size !== c.n) return;
    let decoded;
    try {
      decoded = JSON.parse(Array.from({ length: c.n }, (_, i) => batch.parts.get(i)).join(''));
    } catch { this.pieces.delete(c.sid); return; }
    const { s, me: players } = decoded;
    const me = players && players[this.id];
    if (!s || !me) return;
    this.lastSid = c.sid;
    for (const sid of this.pieces.keys()) if (sid <= c.sid) this.pieces.delete(sid);
    if (Number.isFinite(c.delay) && c.delay > 0) this.snapDelay = c.delay;
    const pev = this.pev;
    this.pev = [];
    this.emit('data', { from: this.hostPeer, d: { k: 'snap', s, me, pev } });
  }

  // Send complete snapshots, even when they need more pieces than we have rooms.
  // Large snapshots reuse the seven chunk rooms in paced batches. The receiver
  // applies nothing until it has the entire snapshot, including the entity lists.
  sendSnapshot(s, meById) {
    if (this.rooms.length !== MAX_CHUNKS) return;
    if (!this.transmission) {
      const parts = [];
      const payload = JSON.stringify({ s, me: meById });
      // Count escaped UTF-8 bytes: names can contain Unicode, quotes or backslashes.
      // Reserve space for the chunk envelope. Search whole slices instead of
      // encoding every character separately on the rendering thread.
      for (let start = 0; start < payload.length;) {
        let low = 1, high = Math.min(CHUNK_BYTES - 200, payload.length - start);
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (len(payload.slice(start, start + middle)) <= CHUNK_BYTES - 200) low = middle;
          else high = middle - 1;
        }
        parts.push(payload.slice(start, start + low));
        start += low;
      }
      this.snapEvery = Math.max(0.12, Math.min(parts.length, MAX_CHUNKS - 1) / 26);
      this.snapDelay = Math.ceil(parts.length / (MAX_CHUNKS - 1)) * this.snapEvery * 1.4;
      this.transmission = { sid: ++this.sid, parts, next: 0, delay: this.snapDelay };
    }
    const batch = this.transmission;
    for (let room = 1; room < MAX_CHUNKS && batch.next < batch.parts.length; room++) {
      const i = batch.next++;
      this.rooms[room].presence({ role: 'host', c: {
        sid: batch.sid, i, n: batch.parts.length, text: batch.parts[i], delay: batch.delay,
      } }).catch(() => {});
    }
    if (batch.next === batch.parts.length) this.transmission = null;
  }

  lock() { this.locked = true; this.publish(); }
  toHost(d) {
    if (d && d.a === 'pose') { this.publish({ pose: d }); return; }
    this.send('host', d);
  }
  toClient(id, d) {
    if (d && d.k === 'snap') {
      // the same shared part goes to everyone: send it once per snapshot with every client's own part
      this.pendingMe = this.pendingMe || {};
      this.pendingMe[id] = d.me;
      if (d.pev && d.pev.length) this.send(id, { k: 'pev', pev: d.pev });
      if (this.pendingS !== d.s) {
        this.pendingS = d.s;
        queueMicrotask(() => {
          const s = this.pendingS, me = this.pendingMe;
          this.pendingS = null; this.pendingMe = {};
          if (s) this.sendSnapshot(s, me);
        });
      }
      return;
    }
    this.send(id, d);
  }
  toAll(d) { this.send('all', d); }
  close() {
    this.closed = true;
    clearTimeout(this.joinTimer);
    this.pendingS = null;
    this.pendingMe = {};
    this.transmission = null;
    this.pieces.clear();
    for (const r of this.rooms) r.leave().catch(() => {});
    this.rooms = [];
  }
}
