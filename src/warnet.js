// War Mode's snapshot of the soldiers. The war modes send each soldier as a JSON array of 17 numbers (about 70 bytes); a War Mode battle has up to
// WAR.totalCap (2000) of them. Even at 15 characters a soldier that was 30 KB a snapshot: the room transport (roomnet.js) sends a snapshot in 3.3 KB
// pieces over seven rooms, so it took two rounds of pieces and the guests saw the battle at half the rate. So a snapshot here says three things:
//   r  the roster: every soldier the host has (alive or a body), as runs of consecutive ids (a house's soldiers are bought together: a few dozen runs)
//   a  who of the roster is alive, one bit each (2000 soldiers: 334 characters)
//   u  records of soldiers' state, but only of the soldiers whose turn it is (packUnits' `net`):
//        - every snapshot: one that moved, turned, swung or was hurt since he was last sent, within NEAR m of a guest's hero
//        - every `far`-th snapshot (1 to 4, the fewest that keep the records within BUDGET): one that changed but is further off
//        - every IDLE-th: one that did not change (a refresh, in case a piece of a snapshot was lost on the way)
//      A record is the soldier's place in the roster (the step from the last record's, 1 character), then now and then (his first few records, every
//      STATICS snapshots, and when his rank changes) what never changes (type, team, look, rank: 3 characters), then 8 characters:
//        x 12, z 12 bits (over the whole map) · yaw 6 · swing 3, staggered 1, blocking 1 · speed 4, attack side 2 · health 6
// A guest keeps every soldier of the roster (one with no record this time goes on along his last steps and stops: interpolation.js), lays down the ones
// the bits call fallen, and drops the ones the roster no longer has (a body cleared away, a soldier sold back in the build). Four armies of 500
// marching and fighting come to some 6 to 9 KB. The height is not sent: a guest puts the soldier on the ground (the bowl has no walls to stand on).
// Names (the AI lords) go beside it. unpackUnits() turns it back into the arrays ClientSync.apply reads, in arrays it reuses.
import { UNIT_TYPES, WORLD } from './config.js';
import * as combat from './combat.js';

const DIR_IDX = combat.DIR_IDX || {};   // (the attack sides, while the game still has them)

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VAL = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) VAL[ABC.charCodeAt(i)] = i;
const TYPE_NAMES = Object.keys(UNIT_TYPES);
const TYPE_IDX = Object.fromEntries(TYPE_NAMES.map((t, i) => [t, i]));
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
const NEAR = 45;        // metres (each way) from a guest's hero within which a soldier who changed goes in every snapshot
const BUDGET = 8000;    // characters of records a snapshot aims to stay under (past it the far soldiers' turn comes less often)
const IDLE = 10;        // snapshots between two records of a soldier who has not changed
const STATICS = 20;     // snapshots between two sendings of what never changes about a soldier
const REC = 9;          // characters of a record without its fixed part

// put `bits` bits of v into the output, 6 at a time (most significant first)
function put(out, v, chars) {
  for (let i = chars - 1; i >= 0; i--) out.push(ABC[(v >> (i * 6)) & 63]);
}
function get(s, at, chars) {
  let v = 0;
  for (let i = 0; i < chars; i++) v = (v << 6) | Math.max(0, VAL[s.charCodeAt(at + i)]);
  return v;
}

const qx = (x) => clampI(Math.round(((x + WORLD.half) / (2 * WORLD.half)) * 4095), 0, 4095);
const dx = (q) => (q / 4095) * 2 * WORLD.half - WORLD.half;

// what is sent of a soldier's state, quantised, into q[0..5] (x, z, yaw, swing/stagger/block, speed/side, health)
function quant(u, q) {
  q[0] = qx(u.pos.x); q[1] = qx(u.pos.z);
  const yaw = ((u.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  q[2] = Math.round((yaw / (Math.PI * 2)) * 64) & 63;
  const sw = u.swingT >= 0 ? 1 + Math.min(6, Math.floor(u.swingT * 10)) : 0;
  q[3] = (sw << 3) | (u.staggerT > 0 ? 4 : 0) | (u.blockFlash > 0 || u.braced ? 2 : 0);
  q[4] = (clampI(Math.round(Math.hypot(u.vel.x, u.vel.z) * 1.5), 0, 15) << 2) | ((DIR_IDX[u.attackDir] || 0) & 3);
  q[5] = clampI(Math.round((u.hp / u.maxHp) * 63), 0, 63);
}
const Q = new Int32Array(6);
// a soldier's memory of what was last sent of him (the host's): [0..5] as quant's, [6] the snapshot, [7] the snapshot of his fixed part, [8] its
// rank, [9] how many records of him have gone
const memo = (u) => u.netQ || (u.netQ = new Int32Array([-1, -1, -1, -1, -1, -1, -1e6, -1e6, -1, 0]));

const sorted = [];
const byId = (a, b) => a.id - b.id;
// -> { r: roster, a: alive bits, u: records, n: [[id, name]] (heroes) }.
// net: { seq (the snapshot's number), eyes: [x, z, ...] the guests' living heroes }: only the soldiers whose turn it is go. Without it every living
// soldier goes, with his fixed part (the unit tests; a measure of the whole).
export function packUnits(units, net = null) {
  sorted.length = 0;
  let inOrder = true;
  for (let i = 0; i < units.length; i++) { sorted.push(units[i]); if (i && units[i].id <= units[i - 1].id) inOrder = false; }
  if (!inOrder) sorted.sort(byId);
  const n = sorted.length;
  const roster = [], bits = [], rec = [], names = [];
  // the roster: runs of consecutive ids (the first 4 characters, how many 2)
  for (let i = 0; i < n;) {
    let j = i + 1;
    while (j < n && j - i < 4095 && (sorted[j].id & 0xffffff) === (sorted[j - 1].id & 0xffffff) + 1) j++;
    put(roster, sorted[i].id & 0xffffff, 4); put(roster, j - i, 2);
    i = j;
  }
  for (let i = 0; i < n; i += 6) {
    let v = 0;
    for (let k = 0; k < 6; k++) if (i + k < n && sorted[i + k].alive) v |= 32 >> k;
    bits.push(ABC[v]);
  }
  // whose turn it is: counted first, so that the far soldiers' turn can be spaced out to keep the snapshot within BUDGET
  const seq = net ? net.seq : 0, eyes = net ? net.eyes : null;
  let far = 1;
  if (net) {
    let near = 0, farN = 0, idle = 0;
    for (let i = 0; i < n; i++) {
      const u = sorted[i];
      if (!u.alive) continue;
      const m = memo(u);
      quant(u, Q);
      u.netWhy = 0;
      if (m[6] < 0 || Q[0] !== m[0] || Q[1] !== m[1] || Q[2] !== m[2] || Q[3] !== m[3] || Q[4] !== m[4] || Q[5] !== m[5]) {
        let close = false;
        for (let e = 0; e < eyes.length && !close; e += 2) close = Math.abs(u.pos.x - eyes[e]) < NEAR && Math.abs(u.pos.z - eyes[e + 1]) < NEAR;
        u.netWhy = close ? 1 : 2;
        if (close) near++; else farN++;
      } else idle++;
    }
    while (far < 4 && (near + farN / far + idle / IDLE) * REC > BUDGET) far++;
  }
  let last = -1;
  for (let i = 0; i < n; i++) {
    const u = sorted[i];
    if (!u.alive) continue;
    const m = memo(u);
    if (net) {
      // (his turn by the snapshot's number, a different turn for each soldier so that every snapshot carries a share, even the first one of a whole
      // army bought at once; or overdue)
      const why = u.netWhy, every = why === 2 ? far : IDLE;
      if (why !== 1 && (seq + u.id) % every !== 0 && (m[6] < 0 || seq - m[6] < every * 2)) continue;
    }
    quant(u, Q);
    const fixed = !net || m[9] < 3 || seq - m[7] >= STATICS || m[8] !== u.rank;
    const step = i - last;
    if (step < 32) rec.push(ABC[step | (fixed ? 32 : 0)]);
    else { rec.push(ABC[fixed ? 32 : 0]); put(rec, i, 3); }
    last = i;
    if (fixed) {
      put(rec, ((TYPE_IDX[u.type] & 31) << 6) | ((u.team & 7) << 3) | (u.variant & 7), 2);
      put(rec, ((u.rank & 7) << 3) | (u.army ? 4 : 0) | (u.lane ? 2 : 0), 1);
      m[7] = seq; m[8] = u.rank;
    }
    put(rec, Q[0], 2); put(rec, Q[1], 2);
    put(rec, Q[2], 1); put(rec, Q[3], 1); put(rec, Q[4], 1); put(rec, Q[5], 1);
    for (let k = 0; k < 6; k++) m[k] = Q[k];
    m[6] = seq; m[9]++;
    if (u.isHero) names.push([u.id, u.name]);
  }
  sorted.length = 0;
  return { r: roster.join(''), a: bits.join(''), u: rec.join(''), n: names };
}

const pool = [];
const ids = [];
// -> the arrays of the war modes' format: [id, type, team, x, y, z, yaw, alive, swingT, speed, variant, hp %, attack side, staggered, blocking, flags, crew, name]
// for each record (one of a soldier the guest does not have yet, whose fixed part did not come with it, is skipped: it comes within STATICS snapshots)
// and for each soldier the guest still has standing whom the bits call fallen. `known` is the guest's map of the soldiers it has; `ground(x, z)` gives
// the height. The list's `ids` (the first `count` of them) is the roster: every soldier the host still has.
export function unpackUnits(w, known, ground) {
  const out = [];
  const names = new Map(Array.isArray(w.n) ? w.n : []);
  const r = typeof w.r === 'string' ? w.r : '', al = typeof w.a === 'string' ? w.a : '', s = typeof w.u === 'string' ? w.u : '';
  let n = 0;
  for (let at = 0; at + 6 <= r.length; at += 6) {
    const id0 = get(r, at, 4), len = get(r, at + 4, 2);
    for (let k = 0; k < len && n < 8192; k++) ids[n++] = id0 + k;
  }
  let k = 0, i = -1;
  for (let at = 0; at < s.length;) {
    const h = get(s, at, 1);
    at++;
    const fixed = h & 32;
    if (h & 31) i += h & 31;
    else { i = get(s, at, 3); at += 3; }
    let tt = -1, rk = 0;
    if (fixed) { tt = get(s, at, 2); rk = get(s, at + 2, 1); at += 3; }
    if (at + 8 > s.length) break;
    const id = ids[i], u = i < n ? known.get(id) : undefined;
    if (i >= n || (!u && tt < 0)) { at += 8; continue; }
    const a = pool[k] || (pool[k] = new Array(18));
    k++;
    const x = dx(get(s, at, 2)), z = dx(get(s, at + 2, 2));
    const fl = get(s, at + 5, 1), sp = get(s, at + 6, 1), sw = fl >> 3;
    a[0] = id; a[3] = x; a[4] = ground(x, z); a[5] = z;
    a[6] = (get(s, at + 4, 1) / 64) * Math.PI * 2; a[7] = 1;
    a[8] = sw ? (sw - 1) / 10 : -1; a[9] = (sp >> 2) / 1.5;
    a[11] = Math.round((get(s, at + 7, 1) / 63) * 100); a[12] = sp & 3; a[13] = fl & 4 ? 1 : 0; a[14] = fl & 2 ? 1 : 0;
    if (tt >= 0) { a[1] = tt >> 6; a[2] = (tt >> 3) & 7; a[10] = tt & 7; a[15] = (rk >> 3) | (rk & 2 ? 8 : 0) | (rk & 4 ? 16 : 0); }
    else { a[1] = TYPE_IDX[u.type]; a[2] = u.team; a[10] = u.variant; a[15] = u.rank | (u.lane ? 8 : 0) | (u.army ? 16 : 0); }
    a[16] = 0; a[17] = names.get(id);
    out.push(a);
    at += 8;
  }
  // the fallen: only the ones still standing here need a word
  for (let j = 0; j < n; j++) {
    if ((get(al, Math.floor(j / 6), 1) >> (5 - (j % 6))) & 1) continue;
    const u = known.get(ids[j]);
    if (!u || !u.alive) continue;
    const a = pool[k] || (pool[k] = new Array(18));
    k++;
    a[0] = u.id; a[1] = TYPE_IDX[u.type]; a[2] = u.team; a[3] = u.pos.x; a[4] = u.pos.y; a[5] = u.pos.z; a[6] = u.yaw; a[7] = 0;
    a[8] = -1; a[9] = 0; a[10] = u.variant; a[11] = 0; a[12] = DIR_IDX[u.attackDir] || 0; a[13] = 0; a[14] = 0;
    a[15] = u.rank | (u.lane ? 8 : 0) | (u.army ? 16 : 0); a[16] = 0; a[17] = undefined;
    out.push(a);
  }
  out.ids = ids;
  out.count = n;
  return out;
}

// The effects that ride along in a snapshot (netsync.js `shared`): in a battle of hundreds the blood, sparks and sounds of every blow would fill it, so
// a snapshot carries at most a few of each kind (the arrows, which a guest sees fly, get more room; everything else goes as it is).
const ROOM = { fx: 16, snd: 12, arrow: 32 };
const seen = { fx: 0, snd: 0, arrow: 0 };
export function thinEvents(list) {
  seen.fx = seen.snd = seen.arrow = 0;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const ev = list[i], k = ev.k;
    if (k in ROOM && seen[k]++ >= ROOM[k]) continue;
    list[n++] = ev;
  }
  list.length = n;
  return list;
}
