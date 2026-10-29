// A running record of the match, for the end screen's highlights and statistics. The game clears it when a match starts and advances `t` while the match is
// being played (never while paused); features write what they know and read what others wrote:
//   matchlog.record('gate', { team: 2, by: 'Fireball' })   a notable thing, in order, stamped with the match clock (a gate or keep falling, a streak, ...)
//   matchlog.add('kills')  matchlog.max('bestStreak', 7)     counters by name (free-form; each feature documents its own names below)
// Events are for sentences ("Your Fireball broke the north gate at 8:42"), counters are for numbers. Keep events few (hundreds per match at most).
//
// Counter / event names in use (add yours here):
//   event   concede { kind }   a battle ended early on purpose (src/flow.js: 'concede' a defeat, 'finish' a won war, 'leave' a guest who was out leaving the room)
//   counter conceded           1 when the local lord conceded or left (not for a won war that was finished early)
//   counter prepSkipped        seconds of the first preparation that Ready skipped (what was left on the timer when the last lord pressed it)
export const matchlog = {
  t: 0,            // seconds of match played
  events: [],      // [{ t, type, ...data }]
  counters: {},
  reset() { this.t = 0; this.events.length = 0; this.counters = {}; },
  tick(dt) { this.t += dt; },
  record(type, data = {}) {
    const e = { t: this.t, type, ...data };
    this.events.push(e);
    if (this.events.length > 600) this.events.splice(0, 100);   // (a very long match keeps its latest events)
    return e;
  },
  add(name, n = 1) { this.counters[name] = (this.counters[name] || 0) + n; },
  max(name, v) { if (!(this.counters[name] >= v)) this.counters[name] = v; },
  get(name) { return this.counters[name] || 0; },
  find(type) { return this.events.filter((e) => e.type === type); },
};

// 8:42
export const clockText = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
