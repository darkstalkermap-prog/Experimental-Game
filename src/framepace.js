// The time step each frame is given. The world moves by dt, but what you see is shown at the screen's refresh: if dt is not
// the time between two refreshes, everything that moves across the view (the land sliding past while you strafe, the turn
// of the view) is placed a little too far one frame and too short the next, and the motion judders.
//   - dt comes from the animation frame's own timestamp (the time of the refresh it will be shown at), not from a clock read
//     inside the callback: that read lands a varying few milliseconds late (input, network messages, a collection) and
//     carried that jitter into every step.
//   - browsers that round their timers (to 1 ms or coarser, against fingerprinting) still give steps like 16, 17, 16, 18:
//     an interval within a few percent of a whole number of refreshes is taken as exactly that many refreshes, and the
//     small difference is kept and paid back slowly, so the game clock never drifts from real time.
// A screen that refreshes at a varying rate (adaptive sync) gives intervals that mostly are not near a multiple: while fewer
// than most of the recent ones are, nothing is snapped and the intervals pass through as they are. The step is capped as
// before (a stall must not throw everything across the map).
const TOL = 0.2;           // how close (share of a refresh) an interval must be to a whole number of refreshes to be snapped
const MAX_DT = 0.05;       // seconds: the longest step the world takes at once

export class FramePacer {
  constructor() {
    this.last = -1;
    this.period = 0;       // ms: the refresh interval as measured
    this.debt = 0;         // ms of real time not yet given to the world (or given ahead of time, when negative)
    this.off = 0;          // intervals in a row that matched no multiple of the period (the refresh rate changed)
    this.fit = 1;          // the share of recent intervals that were a whole number of refreshes (low: a variable-rate screen)
  }

  // ts: the requestAnimationFrame timestamp (ms). Returns the step in seconds.
  step(ts) {
    if (this.last < 0) { this.last = ts; return 0; }
    if (!(ts > this.last)) return 0;   // (two callbacks for one refresh)
    const raw = ts - this.last;
    this.last = ts;
    if (raw > 250) { this.debt = 0; return MAX_DT; }   // (a hidden tab, a breakpoint: nothing to smooth)
    let p = this.period;
    if (!p) p = this.period = raw;
    const k = Math.round(raw / p);
    let dt = raw;
    const fits = k >= 1 && k <= 4 && Math.abs(raw - k * p) < TOL * p;
    this.fit += ((fits ? 1 : 0) - this.fit) * 0.05;
    if (fits) {
      // a whole number of refreshes: learn the period from the plain ones, step by exactly k of them
      this.off = 0;
      if (k === 1) p = this.period = p + (raw - p) * 0.05;
      if (this.fit > 0.85) dt = k * p;
    } else if (++this.off > 20) {
      this.period = raw; this.off = 0;   // (a different screen, or the browser changed its rate)
    }
    // keep the clock honest: what snapping held back (or gave ahead) is paid back a little each frame, a lot when it builds up
    this.debt += raw - dt;
    const pay = Math.abs(this.debt) > p * 2 ? this.debt : this.debt * 0.05;
    dt += pay;
    this.debt -= pay;
    return Math.min(MAX_DT, Math.max(0, dt / 1000));
  }
}
