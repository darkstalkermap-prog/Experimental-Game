// Snapshot interpolation: keep the last few samples and show the world slightly in the past (DELAY), blending between the
// two samples either side of that moment, so movement is smooth even though updates arrive ~10 times a second.
// Why a few samples and not two: the delay is longer than the time between snapshots (it has to be, to ride out a late one),
// so the moment shown usually lies between the two samples before the latest. With only the latest two kept, an entity
// waited at the older one, ran 80% of the way, and jumped the rest whenever a snapshot came in: everything a guest saw
// moved in a stop-start judder ten times a second.
// The samples are stamped on a smoothed snapshot clock rather than the moment each one happened to arrive: network jitter
// would otherwise make every leg a different length of time, and the speed on screen would wobble with it.
let DELAY = 0.12;
export function setInterpDelay(d) { DELAY = d; }
const now = () => performance.now() / 1000;
const KEEP = 4;

// one clock for every entity: all the samples of one snapshot are pushed within a moment of each other and share a stamp
let lastArrival = -1, stamp = 0, gap = 0;
function snapStamp() {
  const t = now();
  if (lastArrival >= 0 && t >= lastArrival && t - lastArrival < 0.03) return stamp;   // (the same snapshot)
  if (lastArrival < 0 || t < lastArrival || t - lastArrival > 1) { stamp = t; gap = 0; }   // (the first one, or after a long silence)
  else {
    const g = t - lastArrival;
    gap = gap ? gap + (g - gap) * 0.1 : g;
    // where the steady rhythm says this one belongs, pulled a little toward when it really came; never far from it
    const want = stamp + gap;
    stamp = want + (t - want) * 0.15;
    if (Math.abs(t - stamp) > 0.12) stamp = t;
  }
  lastArrival = t;
  return stamp;
}

export class Interp {
  constructor() {
    this.s = [];   // the samples, oldest first (the objects are reused: no allocation per snapshot)
    this.n = 0;
    // adapt: samples may come further apart than the snapshots (War Mode sends a far soldier every few snapshots: warnet.js). Shown at the usual
    // delay he would reach his latest place and stand until the next one: stop-start. So he is shown `lag` in the past instead, a little more than
    // the time between his last two samples that moved him (rising at once, easing back down as they come closer together again).
    this.adapt = false;
    this.lag = 0;
  }
  // the latest two (kept for callers and tests that look at them)
  get a() { return this.n ? this.s[Math.max(0, this.n - 2)] : null; }
  get b() { return this.n ? this.s[this.n - 1] : null; }

  push(x, y, z, yaw, extra = 0) {
    const last = this.b;
    const t = snapStamp();
    const teleported = last && Math.hypot(x - last.x, z - last.z) > 12;
    if (teleported) this.n = 0;   // (a respawn or a teleport: no blend from where it was)
    let o;
    if (this.n === KEEP) { o = this.s.shift(); this.s.push(o); } else { o = this.s[this.n] || (this.s[this.n] = {}); this.n++; }
    // (a stamp that does not move forward, two snapshots in one moment: keep the order)
    const prev = this.n > 1 ? this.s[this.n - 2] : null;
    o.t = prev && t <= prev.t ? prev.t + 0.001 : t;
    o.x = x; o.y = y; o.z = z; o.yaw = yaw; o.extra = extra;
    if (this.adapt && prev) {
      // (only two samples that both moved him say how far apart his moving ones come: one at rest is sent rarely, and a soldier who starts off
      // after a rest is shown at once)
      const pp = this.n > 2 ? this.s[this.n - 3] : null;
      const moved = Math.abs(x - prev.x) + Math.abs(z - prev.z) > 0.02 && !!pp && Math.abs(prev.x - pp.x) + Math.abs(prev.z - pp.z) > 0.02;
      const want = moved ? Math.min(0.6, o.t - prev.t + 0.04) : 0;
      this.lag = want > this.lag ? want : this.lag + (want - this.lag) * 0.25;
    }
    return this;
  }

  sample(out) {
    const n = this.n, s = this.s;
    if (!n) return false;
    const b = s[n - 1];
    if (n === 1) { out.x = b.x; out.y = b.y; out.z = b.z; out.yaw = b.yaw; out.extra = b.extra; return true; }
    const rt = now() - (this.lag > DELAY ? this.lag : DELAY);
    // the two samples either side of the moment shown (past the latest: carry on a little along the last leg)
    let i = n - 2;
    while (i > 0 && s[i].t > rt) i--;
    const a = s[i], c = s[i + 1];
    const span = Math.max(0.03, c.t - a.t);
    const k = Math.max(0, Math.min(i + 1 === n - 1 ? 1.25 : 1, (rt - a.t) / span));
    out.x = a.x + (c.x - a.x) * k;
    out.y = a.y + (c.y - a.y) * k;
    out.z = a.z + (c.z - a.z) * k;
    let dy = c.yaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    out.yaw = a.yaw + dy * Math.min(1, k);
    out.extra = b.extra;
    return true;
  }
}
