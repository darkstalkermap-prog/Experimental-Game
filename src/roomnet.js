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
const CHUNK_BYTES = 3300;
const OUTBOX_BYTES = 2600;
const len = (o) => JSON.stringify(o).length;
const roomName = (code, i) => `cw-${code.toLowerCase()}${i ? '-' + i : ''}`;

export class RoomNet {
  constructor(room) {
    this.room = room;
    this.viaRoom = true;
    this.role = null;
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
    this.pieces = [];       // client: per chunk index, Map sid -> piece
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
      this.rooms = await Promise.all(names.map((n) => this.room.join(n)));
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
      if (this.hostPeer) return;
      if (!this.id) { const me = this.rooms[0].peers().find((p) => p.sameTab); if (me) this.id = me.peer; }
      const host = this.rooms[0].peers().find((p) => p.presence && p.presence.role === 'host');
      if (host && this.id) { this.onMain({ peers: this.rooms[0].peers(), joined: [], left: [], updated: [host] }); return; }
      if (performance.now() - t0 > 8000) { this.emit('error', `No game found with code ${code}.`); this.close(); return; }
      setTimeout(wait, 250);
    };
    wait();
  }

  publish(extra = {}) {
    if (!this.rooms[0]) return;
    const p = { role: this.role, name: this.name, out: this.out, ...extra };
    if (this.role === 'host') p.locked = this.locked ? 1 : 0;
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
    if (!this.id) { const me = ch.peers.find((p) => p.sameTab); if (me) this.id = me.peer; }
    if (this.role === 'host') {
      for (const p of ch.left) {
        if (this.known.has(p.peer)) { this.known.delete(p.peer); this.emit('leave', p.peer); }
      }
      for (const p of [...ch.joined, ...ch.updated]) {
        if (p.sameTab || !p.presence || p.presence.role !== 'client') continue;
        if (!this.known.has(p.peer)) {
          if (this.locked) continue;
          this.known.set(p.peer, String(p.presence.name || 'Lord').slice(0, 16));
          this.emit('peer', { id: p.peer, name: this.known.get(p.peer) });
        }
        this.readOutbox(p.peer, p.presence);
        if (p.presence.pose) this.emit('data', { from: p.peer, d: p.presence.pose });
      }
    } else {
      if (this.hostPeer && ch.left.some((p) => p.peer === this.hostPeer)) { this.emit('hostleft'); return; }
      for (const p of [...ch.joined, ...ch.updated]) {
        if (!p.presence || p.presence.role !== 'host') continue;
        if (!this.hostPeer) {
          if (p.presence.locked) { this.emit('error', 'That game has already started.'); this.close(); return; }
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
    if (c.sid <= this.lastSid) return;
    const m = (this.pieces[c.i] = this.pieces[c.i] || new Map());
    m.set(c.sid, c);
    if (m.size > 6) m.delete(m.keys().next().value);
    for (let k = 0; k < c.n; k++) if (!this.pieces[k] || !this.pieces[k].has(c.sid)) return;
    // every piece of this snapshot is here
    const parts = [];
    for (let k = 0; k < c.n; k++) parts.push(this.pieces[k].get(c.sid));
    this.lastSid = c.sid;
    for (const pm of this.pieces) if (pm) for (const sid of [...pm.keys()]) if (sid <= c.sid) pm.delete(sid);
    const head = parts[0].h;
    const s = { ...head, u: [], s: [], ev: [] };
    for (const part of parts) { s.u.push(...(part.u || [])); s.s.push(...(part.s || [])); s.ev.push(...(part.ev || [])); }
    const me = (parts[0].me || {})[this.id];
    if (!me) return;
    const pev = this.pev;
    this.pev = [];
    this.emit('data', { from: this.hostPeer, d: { k: 'snap', s, me, pev } });
  }

  // Host: split a snapshot into pieces of at most CHUNK_BYTES each.
  sendSnapshot(s, meById) {
    const { u, s: siege, ev, ...head } = s;
    const parts = [{ h: head, me: meById, u: [], s: [], ev: [] }];
    let size = len(parts[0]);
    const add = (key, item) => {
      const l = len(item) + 1;
      if (size + l > CHUNK_BYTES) {
        if (parts.length >= MAX_CHUNKS - 1) return false;
        parts.push({ u: [], s: [], ev: [] });
        size = 40;
      }
      parts[parts.length - 1][key].push(item);
      size += l;
      return true;
    };
    for (const a of u) if (!add('u', a)) break;
    for (const a of siege) if (!add('s', a)) break;
    for (const e of ev) if (!add('ev', e)) break;  // effects are cosmetic: drop what doesn't fit
    const sid = ++this.sid;
    const n = parts.length;
    // keep under the room's send budget (~40 presence updates a second, shared by all rooms)
    this.snapEvery = Math.max(0.12, n / 26);
    this.snapDelay = this.snapEvery * 1.4;
    parts.forEach((part, i) => {
      this.rooms[i + 1].presence({ role: 'host', c: { sid, i, n, ...part } }).catch(() => {});
    });
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
    for (const r of this.rooms) r.leave().catch(() => {});
    this.rooms = [];
  }
}
