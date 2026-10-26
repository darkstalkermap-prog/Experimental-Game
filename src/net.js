// WebSocket connection to the Castle Wars server. The host's browser runs the simulation;
// clients send their hero's pose and actions, and receive snapshots of the battle.
export class Net {
  constructor() {
    this.ws = null;
    this.role = null;     // 'host' | 'client'
    this.id = null;
    this.code = null;
    this.handlers = {};   // event -> fn
  }

  // Is this page served by the Castle Wars server (which provides the WebSocket relay)?
  static async available() {
    try {
      if (!/^https?:$/.test(location.protocol)) return false;
      const r = await fetch('api/ping', { cache: 'no-store' });
      if (!r.ok) return false;
      const j = await r.json();
      return !!j.castleWars;
    } catch (e) {
      return false;
    }
  }

  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, data) { if (this.handlers[ev]) this.handlers[ev](data); }

  connect() {
    return new Promise((resolve, reject) => {
      const url = new URL('ws', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not reach the game server.'));
      ws.onclose = () => this.emit('closed');
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        switch (m.t) {
          case 'created': this.role = 'host'; this.id = 0; this.code = m.code; this.emit('created', m); break;
          case 'joined': this.role = 'client'; this.id = m.id; this.code = m.code; this.emit('joined', m); break;
          case 'error': this.emit('error', m.msg); break;
          case 'peer': this.emit('peer', m); break;
          case 'leave': this.emit('leave', m.id); break;
          case 'hostleft': this.emit('hostleft'); break;
          case 'd': this.emit('data', { from: m.from, d: m.d }); break;
          default: break;
        }
      };
    });
  }

  raw(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  create(name) { this.raw({ t: 'create', name }); }
  join(code, name) { this.raw({ t: 'join', code, name }); }
  lock() { this.raw({ t: 'lock' }); }
  toHost(d) { this.raw({ t: 'up', d }); }
  toClient(id, d) { this.raw({ t: 'relay', to: id, d }); }
  toAll(d) { this.raw({ t: 'relay', to: 'all', d }); }
  close() { if (this.ws) this.ws.close(); }
}
