// The sounds of the alerts and tips (see alerts.js), added to the registry in audio.js. Each one is short, soft
// enough to sit over the music and the battle, and a different shape from the others, so a player who is not looking
// can tell what happened by ear: a falling pair of bells for news, brass for danger, a click for a countdown.
import { SOUNDS } from './audio.js';

// A brass note: two saws a hair apart through a filter that opens as the note speaks.
function brass(a, f, t0, dur, gain, open = 4) {
  const c = a.ctx, t = c.currentTime + a.when + t0;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(f * 1.5, t);
  lp.frequency.linearRampToValueAtTime(f * open, t + Math.min(0.1, dur * 0.5));
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  g.gain.setValueAtTime(gain, t + Math.max(0.03, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g);
  g.connect(a.master);
  for (const det of [1, 1.006]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f * det;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// something to look at: two soft falling notes (G5, D5) with a little shimmer above
SOUNDS.alertLow = (a) => {
  a.tone(784, 0.3, 0.13, 'sine'); a.tone(1568, 0.18, 0.03, 'sine');
  a.tone(587, 0.45, 0.13, 'sine', 1, 0.17); a.tone(1175, 0.25, 0.03, 'sine', 1, 0.17);
};
// something is going wrong: a short brass blast twice, then a lower one that holds
SOUNDS.alertDanger = (a) => {
  brass(a, 233, 0, 0.22, 0.17); brass(a, 233, 0.3, 0.22, 0.17); brass(a, 175, 0.6, 0.55, 0.2, 3.5);
  a.noise(0.1, 700, 0.8, 0.1, 'bandpass');
};
// the last seconds before a wave
SOUNDS.tick = (a) => { a.tone(1480, 0.05, 0.16, 'square', 0.9); a.noise(0.025, 5000, 1, 0.1, 'highpass'); };
// low health: lub-dub
SOUNDS.heartbeat = (a) => {
  a.tone(60, 0.18, 0.5, 'sine', 0.6); a.tone(120, 0.1, 0.1, 'triangle', 0.6); a.noise(0.08, 150, 1, 0.2, 'lowpass');
  a.tone(50, 0.22, 0.4, 'sine', 0.6, 0.2); a.noise(0.08, 130, 1, 0.14, 'lowpass', 0.2);
};
// a kill streak: a rising brass fanfare (the bigger one for a rampage and beyond)
SOUNDS.streak = (a) => {
  [262, 330, 392, 523].forEach((f, i) => brass(a, f, i * 0.09, i === 3 ? 0.55 : 0.12, 0.13, 3));
  a.tone(1047, 0.5, 0.05, 'sine', 1, 0.27);
};
SOUNDS.streakBig = (a) => {
  [262, 330, 392, 523, 659, 784].forEach((f, i) => brass(a, f, i * 0.08, i === 5 ? 0.9 : 0.11, 0.13, 3));
  a.tone(1568, 0.8, 0.05, 'sine', 1, 0.4); a.noise(0.5, 6000, 0.7, 0.08, 'highpass', 0.4);
};
// a gentle bell: "still with us?", good news from the hill
SOUNDS.chime = (a) => { a.tone(1047, 1, 0.1, 'sine'); a.tone(1568, 0.7, 0.045, 'sine'); a.tone(2093, 0.4, 0.02, 'sine', 1, 0.02); };
// an ability that took a long time is ready again: the faintest tick
SOUNDS.abilReady = (a) => { a.tone(1760, 0.07, 0.1, 'sine'); a.tone(2349, 0.1, 0.08, 'sine', 1, 0.06); };
