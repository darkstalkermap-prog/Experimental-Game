// Medieval music made on the fly with WebAudio (no audio files). A plucked lute, a recorder, a bagpipe-like drone,
// hand drums and a war horn play in the old church modes: D Dorian while things are calm, D Phrygian in battle.
//
// The tunes are composed bar by bar, but with a shape like a real dance: every eight bars the recorder plays
//   A  A'  B  A''      (a two-bar idea, the same idea a step higher and answered differently, a contrasting
//                       higher idea, and the first idea again, this time coming home to the tonic)
// over a chord progression whose chords are all consonant with the drone. The strong beats always land on chord
// tones, the notes in between walk along the scale, and long non-chord notes never rub a semitone against the chord.
// The music follows the fighting: gentle in the preparation time; drums, a quicker pulse and horn calls as the
// armies come close.

const ROOT = 50;                      // D3
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MODES = { dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };
const MINOR = 3, MAJOR = 4;           // size of the chord's third
const LO = 62, HI = 79;               // the recorder's comfortable range: D4 .. G5
const MIX_GAIN = 1.0;                 // overall level of the music before the soft limiter (calibrated by measurement)
const LIMIT_KNEE = 0.28, LIMIT_CEIL = 0.42;   // the soft limiter: linear up to the knee, never above the ceiling

// One chord per bar: [root offset from D in semitones, third]. Eight bars = four two-bar units.
// Calm:   Dm G | Dm Am | Dm F | G Dm    (every chord is diatonic to D Dorian; G has the Dorian sixth, B natural)
// Battle: Dm Gm | Dm F | Gm F | Eb Dm   (every chord is diatonic to D Phrygian; Eb to Dm is the Phrygian cadence)
// Rhythms are lists of [step, length] in eighth notes over a two-bar unit (16 steps).
export const THEMES = {
  calm: {
    mode: 'dorian', bpm: 84,
    prog: [[0, MINOR], [5, MAJOR], [0, MINOR], [7, MINOR], [0, MINOR], [3, MAJOR], [5, MAJOR], [0, MINOR]],
    lute: [[0, 1, 3, 1, 2, 1, 3, 1], [0, -1, 3, -1, 2, 3, 1, -1], [0, 1, -1, 3, 4, 3, 1, -1], [0, -1, 1, 2, 3, -1, 2, 1]],
    luteB: [[0, 3, 1, 3, 2, 3, 4, 3], [0, 1, 3, 4, 3, 1, 2, 1]],
    // the first idea: relaxed, lilting
    rhythmsA: [
      [[0, 3], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 4], [4, 2], [6, 1], [7, 1], [8, 4], [12, 2], [14, 2]],
      [[2, 2], [4, 3], [7, 1], [8, 2], [10, 2], [12, 2], [14, 2]],
    ],
    // the contrasting idea: more movement, a little higher
    rhythmsB: [
      [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 1], [9, 1], [10, 2], [12, 4]],
      [[0, 1], [1, 1], [2, 2], [4, 3], [7, 1], [8, 2], [10, 2], [12, 4]],
    ],
    hillA: 3, hillB: 4, anchorA: 67, anchorB: 72, endRest: 0.3,
  },
  battle: {
    mode: 'phrygian', bpm: 110,
    prog: [[0, MINOR], [5, MINOR], [0, MINOR], [3, MAJOR], [5, MINOR], [3, MAJOR], [1, MAJOR], [0, MINOR]],
    lute: [[0, 0, 1, 0, 0, 1, 3, 1], [0, 1, 0, 1, 3, 1, 0, 1], [0, 0, 3, 0, 1, 0, 4, 1]],
    luteB: [[0, 0, 1, 3, 0, 1, 4, 3], [0, 1, 0, 3, 0, 1, 0, 4]],
    rhythmsA: [
      [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 2], [2, 1], [3, 1], [4, 2], [6, 1], [7, 1], [8, 2], [10, 1], [11, 1], [12, 4]],
      [[0, 3], [3, 1], [4, 1], [5, 1], [6, 2], [8, 3], [11, 1], [12, 2], [14, 2]],
    ],
    rhythmsB: [
      [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2], [8, 1], [9, 1], [10, 2], [12, 2], [14, 2]],
      [[0, 2], [2, 2], [4, 1], [5, 1], [6, 1], [7, 1], [8, 2], [10, 2], [12, 4]],
    ],
    hillA: 3, hillB: 4, anchorA: 69, anchorB: 74, endRest: 0.1,
  },
};

// Drum patterns by strength (one bar of eighths): D = hand drum, T = rim tap, W = war drum, S = shaker.
// Every fourth bar the pattern ends in a short fill that marks the phrase.
const DRUMS = [
  ['D', 0, 'T', 0, 'D', 0, 'T', 0],
  ['W', 0, 'T', 'T', 'D', 0, 'T', 0],
  ['W', 'D', 'T', 'T', 'W', 'D', 'T', 'S'],
];
const FILLS = [
  ['D', 0, 'T', 0, 'D', 0, 'T', 'T'],
  ['W', 0, 'T', 'T', 'D', 0, 'D', 'D'],
  ['W', 'D', 'T', 'T', 'W', 'D', 'W', 'W'],
];

// ---------- randomness: seedable, so tests can replay a tune exactly ----------
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- composing ----------
export const chordPcs = (chord) => {
  const r = (ROOT + chord[0]) % 12;
  return [r, (r + chord[1]) % 12, (r + 7) % 12];
};
const scaleNotes = (mode) => {
  const out = [];
  for (let m = LO - 12; m <= HI + 12; m++) if (MODES[mode].includes(((m - ROOT) % 12 + 12) % 12)) out.push(m);
  return out;
};

// A melodic outline for n notes, in scale steps from the first note: a hill that rises to `apex` of the way through
// and falls back. No repeated notes, and no jump larger than a fourth.
function contour(n, rng, hill, apex) {
  const cp = [];
  for (let i = 0; i < n; i++) {
    const x = n > 1 ? i / (n - 1) : 0;
    const base = x <= apex ? hill * (x / apex) : hill * (1 - (x - apex) / (1 - apex)) * 0.75;
    cp.push(Math.round(base + (i > 0 && i < n - 1 ? (rng() - 0.5) * 1.4 : 0)));
  }
  cp[0] = 0;
  for (let i = 1; i < n; i++) {
    let d = cp[i] - cp[i - 1];
    if (d === 0) d = i > 1 && cp[i - 1] - cp[i - 2] > 0 ? -1 : 1;
    if (Math.abs(d) > 3) d = 3 * Math.sign(d);
    cp[i] = cp[i - 1] + d;
  }
  return cp;
}

// Turn a rhythm and an outline into real notes over two chords. `k0` is the scale index of the first note.
// Every note is chosen by search: strong beats must be chord tones, held notes may not rub a semitone against the chord,
// no leap is wider than a major sixth, no note repeats, and the line keeps the direction of the outline where it can.
// With opts.endOn the last note comes home to the root of the last chord, and the note before it is chosen to lead there.
function realize(S, rhythm, cp, chords, k0, opts = {}) {
  const n = rhythm.length;
  const slot = (i, k, prev) => {   // may note k be played in slot i, after note prev?
    const [s, d] = rhythm[i];
    if (S[k] < LO || S[k] > HI || k === prev) return false;
    if (prev >= 0 && Math.abs(S[k] - S[prev]) > 9) return false;
    if (chordPcs(chords[s >= 8 ? 1 : 0]).includes(S[k] % 12)) return true;
    return s % 8 !== 0 && s % 8 !== 4 && d < 2 && i < n - 1;   // only quick passing notes may leave the chord
  };
  const ks = [];
  const choose = (i, prev, want, wantDir, extra = () => true) => {
    let best = -1, bestCost = Infinity;
    for (let k = 0; k < S.length; k++) {
      if (!slot(i, k, prev) || !extra(k)) continue;
      const cost = Math.abs(k - want) + (wantDir !== 0 && prev >= 0 && Math.sign(k - prev) !== wantDir ? 2.5 : 0);
      if (cost < bestCost) { bestCost = cost; best = k; }
    }
    return best;
  };
  const free = opts.endOn ? n - 2 : n;
  for (let i = 0; i < free; i++) {
    const prev = i ? ks[i - 1] : -1;
    let k = choose(i, prev, k0 + cp[i], i ? Math.sign(cp[i] - cp[i - 1]) : 0);
    if (k < 0) for (let j = 0; j < S.length; j++) if (S[j] >= LO && S[j] <= HI && j !== prev && slot(i, j, -1) && (k < 0 || Math.abs(S[j] - S[prev]) < Math.abs(S[k] - S[prev]))) k = j;
    ks.push(k);
  }
  if (opts.endOn) {
    // the tonic: the root of the last chord (its fifth only if the root is out of reach), then a note that leads there
    const pcs = chordPcs(chords[1]);
    const ante = ks[free - 1];
    let R = -1, bestCost = Infinity;
    for (let k = 0; k < S.length; k++) {
      if (S[k] < LO || S[k] > HI || (S[k] % 12 !== pcs[0] && S[k] % 12 !== pcs[2])) continue;
      if (Math.abs(S[k] - S[ante]) > 15) continue;
      const cost = Math.abs(S[k] - S[ante]) * 0.4 + (S[k] % 12 === pcs[0] ? 0 : 6) + Math.abs(S[k] - 67) * 0.05;
      if (cost < bestCost) { bestCost = cost; R = k; }
    }
    const P = choose(n - 2, ante, k0 + cp[n - 2], 0, (k) => k !== R && Math.abs(S[k] - S[R]) <= 9 && Math.abs(S[k] - S[R]) >= 1);
    ks.push(P >= 0 ? P : choose(n - 2, ante, k0 + cp[n - 2], 0));
    ks.push(R);
  }
  return rhythm.map(([s, d], i) => ({ s, d, m: S[ks[i]] }));
}

// Compose eight bars: returns an array of 8 bars, each a list of { s (0..7), d (eighths), m (midi), v (0..1), grace? }.
export function composePhrase(themeName, rng, prevNote = 67, withOrnaments = true) {
  const th = THEMES[themeName];
  const S = scaleNotes(th.mode);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const chordsOf = (u) => [th.prog[u * 2], th.prog[u * 2 + 1]];
  const rhythmA = pick(th.rhythmsA);
  const rhythmB = pick(th.rhythmsB);
  const cpA = contour(rhythmA.length, rng, th.hillA, 0.5);
  const cpB = contour(rhythmB.length, rng, th.hillB, 0.35);
  // the chord tone of the first chord nearest to a wanted pitch, never more than a sixth from where the tune was
  const anchor = (u, want, from) => {
    const pcs = chordPcs(chordsOf(u)[0]);
    let best = -1, bestCost = Infinity;
    for (let k = 0; k < S.length; k++) {
      if (S[k] < LO || S[k] > HI || !pcs.includes(S[k] % 12)) continue;
      const cost = Math.abs(S[k] - want) + (Math.abs(S[k] - from) > 9 ? 100 + Math.abs(S[k] - from) : 0);
      if (cost < bestCost) { bestCost = cost; best = k; }
    }
    return best;
  };
  const tau = pick([-1, 1, 2]);              // A' is A moved along the scale
  const flip = pick([-1, 1]);                // ...and answered differently
  // A' has A's outline (the anchor carries it up or down the scale by tau); only its last two notes are answered differently
  const cpA2 = cpA.map((c, i) => c + (i >= cpA.length - 2 ? flip * (i === cpA.length - 1 ? 2 : 1) : 0));
  const specs = [
    { rhythm: rhythmA, cp: cpA, want: th.anchorA, v: 0.56 },
    { rhythm: rhythmA, cp: cpA2, want: th.anchorA + tau, v: 0.6 },
    { rhythm: rhythmB, cp: cpB, want: th.anchorB, v: 0.68 },
    { rhythm: rhythmA, cp: cpA, want: th.anchorA, v: 0.58, endOn: true },
  ];
  const bars = [[], [], [], [], [], [], [], []];
  let last = prevNote;
  specs.forEach((sp, u) => {
    const chords = chordsOf(u);
    const k0 = anchor(u, sp.want, last);
    const notes = realize(S, sp.rhythm, sp.cp, chords, k0, sp.endOn ? { endOn: true } : {});
    notes.forEach((n, i) => {
      const bar = u * 2 + (n.s >= 8 ? 1 : 0);
      const ev = { s: n.s % 8, d: n.d, m: n.m, v: sp.v * (n.s % 8 === 0 ? 1.1 : 0.9 + rng() * 0.15) };
      // a quick grace note from above on some long notes, the way recorders ornament
      if (withOrnaments && th.mode === 'dorian' && n.d >= 3 && i > 0 && rng() < 0.3) {
        const k = S.indexOf(n.m);
        if (k >= 0 && k + 1 < S.length && S[k + 1] <= HI + 2) ev.grace = S[k + 1];
      }
      bars[bar].push(ev);
    });
    last = notes[notes.length - 1].m;
  });
  return { bars, end: last };
}

export class Music {
  // out: node to connect to (the music bus). ctx can be a realtime or an offline context.
  constructor(ctx, out, seed = null) {
    this.ctx = ctx;
    this.out = out;
    this.intensity = 0.1;     // smoothed, 0 calm .. 1 full battle
    this.target = 0.1;
    this.battle = false;
    this.bar = 0;
    this.step = 0;
    this.running = false;     // start() was called
    this.active = false;      // actually playing: running and not muted
    this._muted = false;
    this.plucks = new Map();
    this.lastNote = 67;
    this.phrase = null;
    this.melody = [];
    this.lookahead = 1.8;     // seconds scheduled ahead: covers a stalled or throttled timer
    this.log = null;          // tests can set an array to collect every scheduled note
    this.seed(seed === null ? Math.floor(Math.random() * 4294967296) : seed);
    this.build();
  }

  seed(n) { this.rng = mulberry32(n); }
  rnd() { return this.rng(); }
  pick(a) { return a[Math.floor(this.rnd() * a.length)]; }

  get muted() { return this._muted; }
  set muted(v) {
    v = !!v;
    if (v === this._muted) return;
    this._muted = v;
    if (this.running) { if (v) this.halt(); else this.begin(); }   // muted music costs nothing: no timer, no drone
  }

  // A bus for one instrument: pan, a dry path and a send to the hall reverb.
  bus(pan, send, gain = 1) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.dry);
    const s = c.createGain();
    s.gain.value = send;
    p.connect(s);
    s.connect(this.reverb);
    return g;
  }

  build() {
    const c = this.ctx;
    // Everything is summed, then a soft limiter rounds off any peak (unity gain below the knee, a smooth ceiling above it),
    // so the drums never jump out over the sound effects. The hall reverb is a dark, decaying noise burst with a little pre-delay.
    this.mix = c.createGain();
    this.mix.gain.value = MIX_GAIN;
    this.shaper = c.createWaveShaper();
    const curve = new Float32Array(8193);
    for (let i = 0; i < curve.length; i++) {
      const x = Math.abs(i / 4096 - 1), y = x < LIMIT_KNEE ? x : LIMIT_KNEE + (LIMIT_CEIL - LIMIT_KNEE) * Math.tanh((x - LIMIT_KNEE) / (LIMIT_CEIL - LIMIT_KNEE));
      curve[i] = i < 4096 ? -y : y;
    }
    this.shaper.curve = curve;
    this.shaper.oversample = '2x';
    this.mix.connect(this.shaper);
    this.shaper.connect(this.out);
    this.comp = this.mix;
    this.dry = c.createGain();
    this.dry.connect(this.mix);
    this.reverb = c.createConvolver();
    const sr = c.sampleRate, len = Math.floor(sr * 2.4), pre = Math.floor(sr * 0.012);
    const ir = c.createBuffer(2, len, sr);
    const r = mulberry32(12345);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        lp += ((r() * 2 - 1) - lp) * (0.5 - 0.36 * t);          // brighter at first, darker as it dies away
        d[i] = lp * Math.pow(1 - t, 2.4);
      }
    }
    this.reverb.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.6;
    this.reverb.connect(wet); wet.connect(this.mix);
    // breath noise for the recorder, drums and shaker
    this.noise = c.createBuffer(1, sr, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;
    this.buses = {
      lute: this.bus(-0.15, 0.3),
      flute: this.bus(0.28, 0.5),
      drum: this.bus(-0.08, 0.16),
      shaker: this.bus(0.35, 0.1),
      horn: this.bus(0, 0.4),
      drone: this.bus(0, 0.25),
    };
  }

  // The drone: two slightly detuned reeds on D, one on A, and a low sine; it swells and brightens with the fighting.
  makeDrone(t0) {
    const c = this.ctx;
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneFilter = c.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.buses.drone);
    this.droneOsc = [[hz(ROOT - 12), 'sawtooth', 0], [hz(ROOT - 12), 'sawtooth', 6], [hz(ROOT - 5), 'sawtooth', -4], [hz(ROOT - 24), 'sine', 0]].map(([f, type, cents]) => {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = cents;
      const g = c.createGain();
      g.gain.value = type === 'sine' ? 0.3 : 0.4;
      o.connect(g); g.connect(this.droneFilter);
      o.start(t0);
      return o;
    });
  }

  droneTo(I, t) {
    this.droneGain.gain.setTargetAtTime(0.05 + 0.05 * I, t, 0.5);
    this.droneFilter.frequency.setTargetAtTime(260 + 900 * I, t, 0.5);
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this._muted) this.begin();
  }

  begin() {
    if (this.active) return;
    this.active = true;
    const c = this.ctx;
    this.makeDrone(c.currentTime);
    this.droneTo(this.intensity, c.currentTime);
    this.nextTime = c.currentTime + 0.15;
    this.lastPump = c.currentTime;
    this.timer = setInterval(() => this.pump(), 250);
    // a tab that was in the background has had its timer slowed down: catch up the moment it is shown again
    if (typeof document !== 'undefined') {
      this.onVisible = () => { if (!document.hidden) this.pump(); };
      document.addEventListener('visibilitychange', this.onVisible);
    }
    this.pump();
  }

  halt() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    if (this.onVisible) { document.removeEventListener('visibilitychange', this.onVisible); this.onVisible = null; }
    const t = this.ctx.currentTime;
    this.droneGain.gain.cancelScheduledValues(t);
    this.droneGain.gain.setTargetAtTime(0.0001, t, 0.25);
    for (const o of this.droneOsc) { try { o.stop(t + 1.5); } catch (e) { /* already stopped */ } }
    this.droneOsc = null;
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.halt();
  }

  setIntensity(x) { this.target = Math.min(1, Math.max(0, x)); }

  pump() {
    if (!this.active) return;
    const c = this.ctx;
    const now = c.currentTime;
    // ease toward the wanted intensity (quick to build, slow to calm down), by real time, however often we are called
    const dt = Math.min(2, Math.max(0, now - this.lastPump));
    this.lastPump = now;
    this.intensity += (this.target - this.intensity) * (1 - Math.exp(-dt / (this.target > this.intensity ? 0.8 : 3.5)));
    this.droneTo(this.intensity, now);
    this.warm();
    // never fall far behind (a stalled tab): skip ahead instead of playing a burst of old notes
    if (this.nextTime < now) this.nextTime = now + 0.05;
    while (this.nextTime < now + this.lookahead) {
      this.scheduleStep(this.nextTime);
      this.nextTime += this.stepDur();
    }
  }

  stepDur() { return 60 / (this.battle ? THEMES.battle.bpm : THEMES.calm.bpm) / 2; } // an eighth note

  // Build one not-yet-made lute string per call (every pitch the chords can ask for), in the quiet moments between notes.
  warm() {
    if (!this.warmList) {
      const all = new Set();
      for (const th of Object.values(THEMES)) for (const ch of th.prog) for (const m of this.chordTones(ch)) all.add(m);
      this.warmList = [...all].sort((a, b) => a - b);
    }
    while (this.warmList.length) {
      const m = this.warmList.shift();
      if (!this.plucks.has(m)) { this.pluckBuffer(m); return; }
    }
  }

  // ---------- the score ----------
  chordTones(chord) {
    const [off, third] = chord;
    const b = ROOT + off;
    // root, fifth, root+8ve, third+8ve, fifth+8ve, low third
    return [b, b + 7, b + 12, b + 12 + third, b + 19, b + third];
  }

  scheduleStep(t) {
    const I = this.intensity;
    const dur = this.stepDur();
    if (this.step === 0) {
      // a new bar. Calm and battle themes switch at the barline, with a little hysteresis, and start from their top
      if (!this.battle && I > 0.62) { this.battle = true; this.bar = 0; this.phrase = null; } else if (this.battle && I < 0.36) { this.battle = false; this.bar = 0; this.phrase = null; }
      const theme = this.battle ? THEMES.battle : THEMES.calm;
      this.theme = theme;
      const b8 = this.bar % 8;
      if (b8 === 0 || !this.phrase) this.phrase = composePhrase(this.battle ? 'battle' : 'calm', this.rng, this.lastNote);
      this.melody = this.phrase.bars[b8];
      if (b8 === 7) this.lastNote = this.phrase.end;
      this.chord = theme.prog[b8];
      this.tones = this.chordTones(this.chord);
      if (b8 % 2 === 0) this.luteRow = this.pick(b8 >= 4 && b8 < 6 ? theme.luteB : theme.lute);
      this.barStart = t;
      this.barEnd = t + 8 * dur;
      this.note('bar', b8, t, { bar: this.bar, battle: this.battle, chord: this.chord, I, end: this.barEnd });
    }
    const s = this.step;
    if (this.active && !this._muted) {
      // lute
      const idx = this.luteRow[s];
      if (idx >= 0) {
        const vel = (s === 0 ? 0.95 : s === 4 ? 0.8 : 0.55 + this.rnd() * 0.12) * (0.75 + 0.25 * I);
        this.playPluck(this.tones[idx], t + (s % 4 ? this.jit(0.008) : this.jit(0.004)), vel, this.barEnd + 0.03);
        // in battle the first beat of the bar is a hard, two-note strum
        if (this.battle && s === 0) this.playPluck(this.tones[1], t + 0.014, vel * 0.7, this.barEnd + 0.03);
      }
      // recorder
      for (const n of this.melody) {
        if (n.s !== s) continue;
        const nt = t + (s % 4 ? this.jit(0.007) : this.jit(0.004));
        if (n.grace) this.playFlute(n.grace, nt - 0.075, 0.07, n.v * 0.55, true);
        this.playFlute(n.m, nt, n.d * dur * 0.95, n.v * (this.battle ? 0.85 : 1));
      }
      // drums come in as the fighting gets close
      const power = smooth(0.2, 0.95, I);
      if (power > 0.05) {
        const kind = I > 0.8 ? 2 : I > 0.5 ? 1 : 0;
        const fill = this.bar % 4 === 3;
        const d = (fill ? FILLS : DRUMS)[kind][s];
        if (d) this.playDrum(d, t + this.jit(0.002), power);
        if (I > 0.45 && s % 2 === 1 && d !== 'S') this.playDrum('S', t, power * 0.7);
      }
      // a war horn calls every four bars in the heat of battle
      if (this.battle && I > 0.7 && s === 0 && this.bar % 4 === 0) this.playHorn(t, dur * 6, I);
    }
    if (++this.step >= 8) { this.step = 0; this.bar++; }
  }

  jit(max) { return (this.rnd() * 2 - 1) * max; }

  // ---------- instruments ----------
  note(kind, midi, t, extra) { if (this.log) this.log.push({ kind, midi, t, ...extra }); }

  pluckBuffer(midi) {
    let buf = this.plucks.get(midi);
    if (buf) return buf;
    const c = this.ctx, sr = c.sampleRate, f = hz(midi);
    const N = Math.max(2, Math.round(sr / f));
    const secs = 1.6;
    const len = Math.floor(sr * secs);
    buf = c.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    // Karplus-Strong string: a burst of softened noise circulating in a short delay line
    const ring = new Float32Array(N);
    const r = mulberry32(midi * 7919);
    let prev = 0, mean = 0;
    for (let i = 0; i < N; i++) { prev += (r() * 2 - 1 - prev) * 0.55; ring[i] = prev; mean += prev; }
    mean /= N;
    for (let i = 0; i < N; i++) ring[i] -= mean;
    const decay = Math.pow(0.12, 1 / (f * 1.5));
    let k = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const j = k + 1 === N ? 0 : k + 1;
      const v = ring[k];
      out[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
      ring[k] = (ring[k] + ring[j]) * 0.5 * decay;
      k = j;
    }
    const g = peak > 0 ? 0.9 / peak : 1;
    const fade = Math.floor(sr * 0.15);
    for (let i = 0; i < len; i++) out[i] *= g * (i > len - fade ? (len - i) / fade : 1);
    this.plucks.set(midi, buf);
    return buf;
  }

  // stopAt: the string is damped by the end of the bar, so one chord never rings into the next
  playPluck(midi, t, vel, stopAt) {
    t = Math.max(0, t);   // a little timing jitter must never schedule before the start of time
    this.note('lute', midi, t, { vel, bar: this.bar, step: this.step, battle: this.battle, chord: this.chord, I: this.intensity });
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.pluckBuffer(midi);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800 + 2400 * vel;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5 * vel, t);
    src.connect(lp); lp.connect(g); g.connect(this.buses.lute);
    src.start(t);
    if (stopAt > t + 0.2) {
      g.gain.setValueAtTime(0.5 * vel, stopAt - 0.12);
      g.gain.linearRampToValueAtTime(0.0001, stopAt);
      src.stop(stopAt + 0.02);
    }
  }

  playFlute(midi, t, dur, vel, grace = false) {
    t = Math.max(0, t);   // a little timing jitter must never schedule before the start of time
    this.note('flute', midi, t, { dur, vel, grace, bar: this.bar, step: this.step, battle: this.battle, chord: this.chord, I: this.intensity });
    const c = this.ctx, f = hz(midi);
    const end = t + Math.max(0.12, dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.07);
    g.gain.setValueAtTime(0.2 * vel, Math.max(t + 0.08, end - 0.1));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.connect(g); g.connect(this.buses.flute);
    // vibrato that grows in after the attack
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = c.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.35);
    lfo.connect(depth);
    for (const [mult, type, level] of [[1, 'sine', 1], [2, 'triangle', 0.18]]) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f * mult;
      depth.connect(o.frequency);
      const og = c.createGain();
      og.gain.value = level;
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(end + 0.2);
    }
    lfo.start(t); lfo.stop(end + 0.2);
    // a little breath
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 1.5;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.05 * vel, t + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.008, t + 0.3);
    ng.gain.setValueAtTime(0.008, end);
    ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
    n.connect(bp); bp.connect(ng); ng.connect(g);
    n.start(t, this.rnd() * 0.5); n.stop(end + 0.2);
  }

  playDrum(kind, t, power) {
    t = Math.max(0, t);   // a little timing jitter must never schedule before the start of time
    this.note('drum', kind, t, { power, bar: this.bar, step: this.step, battle: this.battle, chord: this.chord, I: this.intensity });
    const c = this.ctx;
    const g = c.createGain();
    g.connect(kind === 'S' ? this.buses.shaker : this.buses.drum);
    if (kind === 'D' || kind === 'W') {
      const big = kind === 'W';
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(big ? 130 : 190, t);
      o.frequency.exponentialRampToValueAtTime(big ? 72 : 105, t + (big ? 0.28 : 0.16));
      const amp = (big ? 0.7 : 0.55) * power;
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.6 : 0.42));
      o.connect(g); o.start(t); o.stop(t + 0.7);
      // the skin's slap
      const n = c.createBufferSource();
      n.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = big ? 260 : 520;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.4 * power, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      n.connect(f); f.connect(ng); ng.connect(this.buses.drum);
      n.start(t, this.rnd() * 0.5); n.stop(t + 0.1);
    } else {
      const n = c.createBufferSource();
      n.buffer = this.noise;
      const f = c.createBiquadFilter();
      if (kind === 'T') { f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.2; } else { f.type = 'highpass'; f.frequency.value = 6500; }
      g.gain.setValueAtTime((kind === 'T' ? 0.32 : 0.1) * power, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'T' ? 0.07 : 0.05));
      n.connect(f); f.connect(g);
      n.start(t, this.rnd() * 0.5); n.stop(t + 0.1);
    }
  }

  playHorn(t, dur, I) {
    t = Math.max(0, t);   // a little timing jitter must never schedule before the start of time
    this.note('horn', ROOT - 12, t, { dur, bar: this.bar, step: this.step, battle: this.battle, chord: this.chord, I: this.intensity });
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13 * I, t + 0.18);
    g.gain.setValueAtTime(0.13 * I, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.linearRampToValueAtTime(1300, t + 0.4);
    lp.connect(g); g.connect(this.buses.horn);
    // root and fifth, like a war horn
    for (const [m, cents] of [[ROOT - 12, 0], [ROOT - 12, 7], [ROOT - 5, -5]]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.6);
    }
  }

  // Render `seconds` of music ahead of time (for offline contexts and tests). intensityAt(t) gives the fighting at time t.
  renderAhead(seconds, intensityAt = null) {
    this.running = this.active = true;
    this.makeDrone(0);
    let t = 0;
    while (t < seconds) {
      if (intensityAt) { this.target = intensityAt(t); this.intensity = this.target; }
      if (this.step === 0) this.droneTo(this.intensity, t);
      this.scheduleStep(t);
      t += this.stepDur();
    }
  }
}
