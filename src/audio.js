// Tiny synthesized sound effects via WebAudio (no audio files needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.listener = null;
    this.volume = 0.5;
    this.last = {};
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  }

  setListener(pos) { this.listener = pos; }

  gainFor(pos) {
    if (!pos || !this.listener) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
    return Math.max(0, 1 - d / 90) ** 2;
  }

  noise(dur, freq, q, gain, type = 'bandpass', t0 = 0) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime + t0;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  tone(freq, dur, gain, type = 'sine', slide = 0, t0 = 0) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const t = c.currentTime + t0;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, pos = null) {
    if (!this.ctx) return;
    const k = this.gainFor(pos);
    if (k < 0.02) return;
    // throttle very frequent sounds
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.04) return;
    this.last[name] = now;
    switch (name) {
      case 'swing': this.noise(0.18, 900, 0.8, 0.25 * k, 'bandpass'); break;
      case 'hit': this.noise(0.12, 500, 1.5, 0.5 * k, 'lowpass'); this.tone(120, 0.1, 0.3 * k, 'triangle', 0.5); break;
      case 'clang': this.tone(1800 + Math.random() * 600, 0.25, 0.18 * k, 'square', 0.7); this.noise(0.08, 3000, 2, 0.3 * k, 'highpass'); break;
      case 'fireball': this.noise(0.5, 600, 0.6, 0.45 * k, 'lowpass'); this.tone(160, 0.4, 0.15 * k, 'sawtooth', 0.5); break;
      case 'boom': this.noise(1.0, 220, 0.7, 1.0 * k, 'lowpass'); this.tone(55, 0.8, 0.6 * k, 'sine', 0.4); break;
      case 'zap': this.noise(0.25, 3500, 0.5, 0.5 * k, 'highpass'); this.tone(900, 0.2, 0.15 * k, 'sawtooth', 0.2); break;
      case 'ice': this.tone(2600, 0.25, 0.12 * k, 'triangle', 0.6); this.noise(0.15, 5000, 2, 0.3 * k, 'highpass'); break;
      case 'stomp': this.noise(0.35, 90, 1, 0.9 * k, 'lowpass'); this.tone(38, 0.35, 0.7 * k, 'sine', 0.6); break;
      case 'roar': this.tone(90, 1.2, 0.5 * k, 'sawtooth', 0.6); this.noise(1.0, 300, 0.5, 0.5 * k, 'lowpass'); break;
      case 'parry': this.tone(2400, 0.35, 0.22 * k, 'square', 0.5); this.tone(1200, 0.4, 0.2 * k, 'triangle', 0.8); this.noise(0.15, 4000, 2, 0.4 * k, 'highpass'); break;
      case 'block': this.tone(700, 0.15, 0.2 * k, 'square', 0.6); this.noise(0.1, 1500, 1, 0.3 * k); break;
      case 'bow': this.tone(220, 0.2, 0.2 * k, 'triangle', 0.6); this.noise(0.15, 2000, 1, 0.15 * k); break;
      case 'arrowHit': this.noise(0.06, 1200, 2, 0.25 * k); break;
      case 'thud': this.noise(0.3, 160, 1, 0.8 * k, 'lowpass'); this.tone(60, 0.3, 0.5 * k, 'sine', 0.5); break;
      case 'collapse': this.noise(1.6, 120, 0.7, 1.0 * k, 'lowpass'); this.tone(45, 1.2, 0.6 * k, 'sine', 0.6); break;
      case 'catapult': this.noise(0.4, 300, 1, 0.5 * k); this.tone(90, 0.3, 0.4 * k, 'triangle', 0.4); break;
      case 'death': this.tone(200, 0.4, 0.15 * k, 'sawtooth', 0.4); break;
      case 'coin': this.tone(1320, 0.08, 0.12, 'square'); this.tone(1760, 0.12, 0.1, 'square', 1, 0.07); break;
      case 'buy': this.tone(660, 0.08, 0.15, 'triangle'); this.tone(990, 0.15, 0.15, 'triangle', 1, 0.08); break;
      case 'deny': this.tone(180, 0.2, 0.2, 'square'); break;
      case 'horn':
        this.tone(147, 1.6, 0.35, 'sawtooth', 1.0); this.tone(220, 1.6, 0.18, 'sawtooth', 1.0);
        this.tone(147, 1.2, 0.3, 'sawtooth', 1.02, 1.7); break;
      case 'order': this.tone(520, 0.12, 0.15, 'triangle'); this.tone(780, 0.12, 0.12, 'triangle', 1, 0.1); break;
      case 'hurt': this.noise(0.2, 400, 1, 0.6, 'lowpass'); this.tone(90, 0.2, 0.3, 'sine', 0.5); break;
      case 'victory': [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.6, 0.2, 'triangle', 1, i * 0.18)); break;
      case 'defeat': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.7, 0.2, 'triangle', 1, i * 0.25)); break;
      default: break;
    }
  }
}
