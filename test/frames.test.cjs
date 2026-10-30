const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = (file) => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '..', file)).toString('base64'));

// a 60 Hz screen whose callbacks run a few milliseconds late, with timers rounded to 1 ms: the world should still advance by
// exactly one refresh per refresh, and its clock should not drift from real time
test('frame steps follow the refresh, not when the callback ran', async () => {
  const { FramePacer } = await load('src/framepace.js');
  const pacer = new FramePacer();
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const P = 1000 / 60;
  let vs = 1000, sum = 0, worst = 0;
  pacer.step(vs);
  for (let i = 0; i < 600; i++) {
    const k = i % 7 === 3 ? 2 : 1;   // (a missed refresh now and then)
    vs += P * k;
    const dt = pacer.step(Math.round(vs + rnd() * 0.4));
    sum += dt;
    if (i > 60) worst = Math.max(worst, Math.abs(dt * 1000 - P * k) / (P * k));
  }
  assert.ok(worst < 0.02, `a step strayed ${(worst * 100).toFixed(1)}% from the refresh`);
  assert.ok(Math.abs(sum * 1000 - (vs - 1000)) < P, `clock drift ${(sum * 1000 - (vs - 1000)).toFixed(1)} ms`);
  // a stall is capped, and a new refresh rate is learned
  assert.equal(pacer.step(vs + 2000), 0.05);
  vs += 2000;
  for (let i = 0; i < 80; i++) { vs += 1000 / 144; pacer.step(vs); }
  assert.ok(Math.abs(pacer.step(vs + 1000 / 144) * 1000 - 1000 / 144) < 0.2, 'learned 144 Hz');
});

// snapshots every 0.1 s, shown 0.12 s late: an entity moving steadily must move steadily on screen (it used to wait, run and jump)
test('snapshot interpolation keeps a steady speed when the delay is longer than the gap', async () => {
  let T = 0;
  const real = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => T }, configurable: true, writable: true });
  try {
    const { Interp, setInterpDelay } = await load('src/interpolation.js');
    setInterpDelay(0.12);
    const it = new Interp(), out = {};
    let next = 0, x = 0, prev = null, worst = 0;
    for (let f = 0; f < 600; f++) {
      const t = f / 60;
      while (next <= t) { T = next * 1000; it.push(x, 0, 0, 0); x += 0.3; next += 0.1; }
      T = t * 1000;
      it.sample(out);
      if (prev !== null && f > 60) worst = Math.max(worst, Math.abs((out.x - prev) * 60 - 3) / 3);
      prev = out.x;
    }
    assert.ok(worst < 0.05, `speed on screen strayed ${(worst * 100).toFixed(0)}%`);
  } finally {
    Object.defineProperty(globalThis, 'performance', { value: real, configurable: true, writable: true });
  }
});
