// The war horn of the ending, made of WebAudio nodes (no audio files). Two sounds register themselves with audio.js:
//   'fanfare'  victory: a pickup and a rising call in D major, then a long full chord of horns over timpani, in a hall
//   'dirge'    defeat: one low, dark horn that sags a little at its end, then a second a fifth below, over a slowing heartbeat of drums
// The voice is a brass: two sawtooth oscillators a few cents apart, scooping up to the pitch, through a low-pass filter that opens as the note
// swells and a vibrato that comes in late. Drums are a sine that falls in pitch with a puff of filtered noise. Every note has an attack, a hold
// and a release, so nothing clicks and everything has faded to silence by the time the sound is over.
// `audio.duck()` (below) lowers the music under it and lets it back up.
import { SOUNDS, Audio } from './audio.js';

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const D3 = 50, A3 = 57, D4 = 62, Fs4 = 66, A4 = 69, D5 = 74, A2 = 45, D2 = 38;

// a shared hall: a convolver fed with a decaying noise (built once per context)
function hall(a) {
  if (a.hall && a.hall.ctx === a.ctx) return a.hall;
  const c = a.ctx, len = Math.floor(c.sampleRate * 2.2);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const send = c.createGain(), conv = c.createConvolver(), back = c.createGain();
  conv.buffer = buf;
  back.gain.value = 0.55;
  send.connect(conv); conv.connect(back); back.connect(a.master);
  a.hall = { ctx: c, send };
  return a.hall;
}

// one horn note: freq in Hz, dur in seconds from t0 (relative to now), gain 0..1
//   o.dark   a duller, lower voice (the dirge)      o.sag   the pitch falls by this fraction over the last part of the note
function note(a, freq, t0, dur, gain, o = {}) {
  const c = a.ctx, t = c.currentTime + a.when + t0;
  const att = o.attack || 0.07, rel = Math.min(o.release || 0.35, dur * 0.5);
  const out = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = o.dark ? 1.2 : 2.0;
  const voices = [0, o.spread === undefined ? 9 : o.spread].map((cents) => {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.detune.value = cents;
    osc.frequency.setValueAtTime(freq * (o.dark ? 0.985 : 0.95), t);                     // (a brass note is lipped up to its pitch)
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    if (o.sag) osc.frequency.exponentialRampToValueAtTime(freq * (1 - o.sag), t + dur);
    osc.connect(lp);
    return osc;
  });
  // the vibrato comes in once the note has settled
  const lfo = c.createOscillator(), depth = c.createGain();
  lfo.frequency.value = o.dark ? 4.4 : 5.4;
  depth.gain.setValueAtTime(0, t);
  depth.gain.setValueAtTime(0, t + Math.min(0.35, dur * 0.4));
  depth.gain.linearRampToValueAtTime(freq * (o.dark ? 0.009 : 0.006), t + Math.min(1.1, dur * 0.8));
  lfo.connect(depth);
  for (const v of voices) depth.connect(v.frequency);
  // the filter opens as the note swells, then settles
  const open = Math.min(9000, freq * (o.dark ? 5 : 9)), settle = Math.min(7000, freq * (o.dark ? 3.2 : 5.5));
  lp.frequency.setValueAtTime(o.dark ? 220 : 380, t);
  lp.frequency.exponentialRampToValueAtTime(open, t + att + (o.swell || 0.12));
  lp.frequency.setTargetAtTime(settle, t + att + (o.swell || 0.12), Math.max(0.2, dur * 0.3));
  // the shape of the note
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + att);
  if (o.swellGain) out.gain.linearRampToValueAtTime(gain * o.swellGain, t + Math.max(att + 0.05, dur - rel - 0.05));
  else out.gain.setValueAtTime(gain, Math.max(t + att, t + dur - rel));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(out);
  out.connect(a.master);
  const wet = c.createGain();
  wet.gain.value = o.wet === undefined ? 0.45 : o.wet;
  out.connect(wet); wet.connect(hall(a).send);
  const end = t + dur + 0.12;
  for (const v of voices) { v.start(t); v.stop(end); }
  lfo.start(t); lfo.stop(end);
}

// a drum: a sine that falls in pitch and a puff of low-passed noise
function drum(a, t0, freq, gain, dur = 0.55, hit = 0.5) {
  const c = a.ctx, t = c.currentTime + a.when + t0;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.9, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.master);
  o.start(t); o.stop(t + dur + 0.05);
  a.noise(0.16, 260, 0.8, gain * hit, 'lowpass', t0);
}

// a roll on a side drum: n taps that grow louder (or fade) over `span` seconds
function roll(a, t0, span, n, from, to) {
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    a.noise(0.07, 2400, 1.4, from + (to - from) * u, 'bandpass', t0 + u * span);
  }
}

SOUNDS.fanfare = (a) => {
  const g = 0.17;
  drum(a, 0, hz(D3), 0.8);
  note(a, hz(D4), 0.0, 0.3, g * 0.8, { release: 0.12 });
  note(a, hz(D4), 0.34, 0.3, g * 0.85, { release: 0.12 });
  note(a, hz(A4), 0.68, 0.6, g * 0.95, { release: 0.2 });
  drum(a, 1.3, hz(D3), 0.5);
  note(a, hz(Fs4), 1.3, 0.34, g * 0.9, { release: 0.12 });
  note(a, hz(A4), 1.66, 0.34, g * 0.95, { release: 0.12 });
  roll(a, 1.5, 0.45, 9, 0.05, 0.22);
  // the long call and the chord under it
  const T = 2.05, L = 2.7;
  drum(a, T, hz(D3), 1.0, 0.9);
  drum(a, T + 0.02, hz(D2), 0.8, 1.2, 0.8);
  note(a, hz(D5), T, L, g * 1.0, { attack: 0.1, swellGain: 1.18, release: 0.9 });
  note(a, hz(A4), T, L - 0.1, g * 0.7, { attack: 0.12, swellGain: 1.15, release: 0.9 });
  note(a, hz(D4), T, L, g * 0.85, { attack: 0.12, swellGain: 1.15, release: 1.0 });
  note(a, hz(Fs4), T + 0.04, L - 0.2, g * 0.55, { attack: 0.14, release: 0.9 });
  note(a, hz(A3), T, L, g * 0.7, { attack: 0.16, swellGain: 1.1, release: 1.0, spread: 14 });
  note(a, hz(D3), T, L + 0.2, g * 0.85, { attack: 0.18, swellGain: 1.1, release: 1.1, spread: 14 });
  a.noise(1.3, 3200, 0.5, 0.12, 'highpass', T);      // (a crash of cymbals)
};

// the call of a horn when the last rival keep has fallen and the fight is still on: the pickup and one rising, held note
SOUNDS.call = (a) => {
  const g = 0.16;
  drum(a, 0, hz(D3), 0.6, 0.6);
  note(a, hz(D4), 0.0, 0.26, g * 0.8, { release: 0.1 });
  note(a, hz(D4), 0.3, 0.26, g * 0.85, { release: 0.1 });
  note(a, hz(A4), 0.6, 1.5, g, { attack: 0.1, swellGain: 1.15, release: 0.7 });
  note(a, hz(D4), 0.6, 1.5, g * 0.7, { attack: 0.12, release: 0.7 });
};

SOUNDS.dirge = (a) => {
  const g = 0.2;
  drum(a, 0, hz(D2 + 7), 0.9, 0.8, 0.6);
  note(a, hz(D3), 0.05, 2.3, g, { dark: true, attack: 0.5, swell: 0.5, swellGain: 1.2, release: 0.8, sag: 0.06, wet: 0.6 });
  note(a, hz(A2), 0.1, 2.2, g * 0.55, { dark: true, attack: 0.6, release: 0.8, sag: 0.05, wet: 0.6 });
  drum(a, 1.15, hz(D2 + 7), 0.55, 0.7, 0.5);
  note(a, hz(A2), 2.4, 2.7, g * 0.95, { dark: true, attack: 0.5, swell: 0.6, swellGain: 1.15, release: 1.2, sag: 0.04, wet: 0.65 });
  note(a, hz(D2), 2.4, 2.9, g * 0.7, { dark: true, attack: 0.7, release: 1.3, wet: 0.65 });
  drum(a, 2.45, hz(D2 + 7), 0.5, 0.8, 0.5);
  drum(a, 3.7, hz(D2 + 7), 0.34, 0.8, 0.4);
  drum(a, 5.2, hz(D2 + 7), 0.2, 0.9, 0.3);
};

// the horn that opens a battle and sounds every tenth wave: the same two calls it always was (a low note with its fifth, then the low note again), in brass
Audio.prototype.hornCall = function hornCall(k = 1) {
  note(this, hz(D3), 0, 1.6, 0.17 * k, { attack: 0.12, swellGain: 1.12, release: 0.5 });
  note(this, hz(A3), 0, 1.6, 0.09 * k, { attack: 0.14, release: 0.5, spread: 12 });
  note(this, hz(D3), 1.7, 1.25, 0.16 * k, { attack: 0.1, release: 0.6 });
};

// Lower the music under a sound and let it back up: to `level` (a fraction of its volume) in 0.2 s, held for `hold` seconds, then back over `release`.
Audio.prototype.duck = function duck(level = 0.35, hold = 3, release = 1.6) {
  if (!this.ctx || !this.musicBus) return;
  const g = this.musicBus.gain, t = this.ctx.currentTime, base = this.vol.music * 1.2;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(base * level, t + 0.2);
    g.setValueAtTime(base * level, t + 0.2 + hold);
    g.linearRampToValueAtTime(base, t + 0.2 + hold + release);
  } catch (e) { /* a context that cannot automate: the music simply keeps its level */ }
};
