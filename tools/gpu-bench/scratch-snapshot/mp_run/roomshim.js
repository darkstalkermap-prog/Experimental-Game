// Fake claude.ai `room` capability over BroadcastChannel, for tests.
(() => {
  const me = Math.random().toString(36).slice(2, 12);
  const stats = window.__roomStats = { sends: [], maxBytes: 0, rejects: 0 };
  function mkRoom(name) {
    const bc = new BroadcastChannel('room-' + name);
    const peers = new Map(); // peer -> {peer, presence, ...}
    const mine = { presence: {} };
    const handlers = [];
    let lastSent = 0, timer = null;
    const P = (peer, presence) => Object.freeze({ peer, by: null, isMe: peer === me, sameTab: peer === me, kind: 'viewer', guest: false, presence: Object.freeze(presence), updatedAt: Date.now() });
    peers.set(me, P(me, {}));
    let snap = Object.freeze([...peers.values()]);
    const deliver = (joined = [], left = [], updated = []) => {
      snap = Object.freeze([...peers.values()]);
      const ch = { peers: snap, joined, left, updated };
      setTimeout(() => handlers.forEach((h) => h(ch)), 0);
    };
    const flush = () => { timer = null; lastSent = performance.now(); stats.sends.push(lastSent); bc.postMessage({ t: 'pres', peer: me, presence: mine.presence }); };
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'hello') { bc.postMessage({ t: 'pres', peer: me, presence: mine.presence }); }
      if (m.t === 'pres') {
        const had = peers.has(m.peer);
        const p = P(m.peer, m.presence);
        peers.set(m.peer, p);
        had ? deliver([], [], [p]) : deliver([p]);
      }
      if (m.t === 'bye') { const p = peers.get(m.peer); if (p) { peers.delete(m.peer); deliver([], [p]); } }
    };
    window.addEventListener('beforeunload', () => bc.postMessage({ t: 'bye', peer: me }));
    bc.postMessage({ t: 'hello', peer: me });
    const r = {
      name,
      presence(patch) {
        const merged = { ...mine.presence };
        for (const k in patch) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
        const bytes = JSON.stringify(merged).length;
        stats.maxBytes = Math.max(stats.maxBytes, bytes);
        if (bytes > 4096) { stats.rejects++; return Promise.reject({ code: 'invalid_argument', message: 'too big ' + bytes }); }
        mine.presence = JSON.parse(JSON.stringify(merged));
        peers.set(me, P(me, mine.presence));
        snap = Object.freeze([...peers.values()]);
        if (!timer) timer = setTimeout(flush, Math.max(0, 33 - (performance.now() - lastSent)));
        return Promise.resolve();
      },
      peers: () => snap,
      onPeers(h) { handlers.push(h); setTimeout(() => h({ peers: snap, joined: snap, left: [], updated: [] }), 0); return () => {}; },
      on() { return () => {}; }, emit() { return Promise.resolve(); },
      connected: () => true, onConnection(h) { setTimeout(() => h(true), 0); return () => {}; },
      leave() { bc.postMessage({ t: 'bye', peer: me }); bc.close(); return Promise.resolve(); },
    };
    return r;
  }
  const rooms = new Map();
  const room = Object.freeze({ join: (n) => { if (!rooms.has(n)) rooms.set(n, mkRoom(n)); return Promise.resolve(rooms.get(n)); } });
  window.claude = { use: (n) => Promise.resolve(n === 'room' ? room : null) };
})();
