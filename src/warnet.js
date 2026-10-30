// War Mode's snapshot of the soldiers. The war modes send each soldier as a JSON array of 17 numbers (about 70 bytes); a War Mode battle has up to
// WAR.totalCap of them, which would make every snapshot some 40 KB (the room transport, roomnet.js, sends a snapshot in 3.3 KB pieces over seven
// rooms: that would take three rounds of pieces and halve the update rate). Here a living soldier is 15 characters of a 64-letter alphabet that needs
// no escaping in JSON, a fallen one 4 (its id: the guest keeps the body it already has), so 600 soldiers fit in about 9 KB.
//   living   id 24 bits · type 5, team 3, variant 3 · x 12, z 12 (over the whole map) · yaw 6 · swing 3, staggered 1, blocking 1 · speed 4, attack side 2
//            · health 6 · rank 3, army 1, lane 1
// The height is not sent: a guest puts the soldier on the ground (the bowl has no walls to stand on). Names (the AI lords) go beside it.
// unpack() turns the string back into the arrays ClientSync.apply reads, in arrays it reuses.
import { UNIT_TYPES, WORLD } from './config.js';
import * as combat from './combat.js';

const DIR_IDX = combat.DIR_IDX || {};   // (the attack sides, while the game still has them)

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VAL = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) VAL[ABC.charCodeAt(i)] = i;
const TYPE_NAMES = Object.keys(UNIT_TYPES);
const TYPE_IDX = Object.fromEntries(TYPE_NAMES.map((t, i) => [t, i]));
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);

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

// -> { u: string (living), d: string (fallen ids), n: [[id, name]] (heroes) }
export function packUnits(units) {
  const live = [], dead = [], names = [];
  for (const u of units) {
    const id = u.id & 0xffffff;
    if (!u.alive) { put(dead, id, 4); continue; }
    put(live, id, 4);
    put(live, ((TYPE_IDX[u.type] & 31) << 6) | ((u.team & 7) << 3) | (u.variant & 7), 2);
    put(live, qx(u.pos.x), 2);
    put(live, qx(u.pos.z), 2);
    const yaw = ((u.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    put(live, Math.round((yaw / (Math.PI * 2)) * 64) & 63, 1);
    const sw = u.swingT >= 0 ? 1 + Math.min(6, Math.floor(u.swingT * 10)) : 0;
    put(live, (sw << 3) | (u.staggerT > 0 ? 4 : 0) | (u.blockFlash > 0 || u.braced ? 2 : 0), 1);
    put(live, (clampI(Math.round(Math.hypot(u.vel.x, u.vel.z) * 1.5), 0, 15) << 2) | ((DIR_IDX[u.attackDir] || 0) & 3), 1);
    put(live, clampI(Math.round((u.hp / u.maxHp) * 63), 0, 63), 1);
    put(live, ((u.rank & 7) << 3) | (u.army ? 4 : 0) | (u.lane ? 2 : 0), 1);
    if (u.isHero) names.push([u.id, u.name]);
  }
  return { u: live.join(''), d: dead.join(''), n: names };
}

const pool = [];
// -> the arrays of the war modes' format: [id, type, team, x, y, z, yaw, alive, swingT, speed, variant, hp %, attack side, staggered, blocking, flags, crew, name]
// `known` is the guest's map of the soldiers it has (a fallen one it never saw is skipped); `ground(x, z)` gives the height.
export function unpackUnits(w, known, ground) {
  const out = [];
  const names = new Map(Array.isArray(w.n) ? w.n : []);
  const s = typeof w.u === 'string' ? w.u : '', d = typeof w.d === 'string' ? w.d : '';
  let k = 0;
  for (let at = 0; at + 15 <= s.length; at += 15) {
    const a = pool[k] || (pool[k] = new Array(18));
    k++;
    const id = get(s, at, 4), tt = get(s, at + 4, 2);
    const x = dx(get(s, at + 6, 2)), z = dx(get(s, at + 8, 2));
    const fl = get(s, at + 11, 1), sp = get(s, at + 12, 1), rk = get(s, at + 14, 1);
    const sw = fl >> 3;
    a[0] = id; a[1] = tt >> 6; a[2] = (tt >> 3) & 7; a[3] = x; a[4] = ground(x, z); a[5] = z;
    a[6] = (get(s, at + 10, 1) / 64) * Math.PI * 2; a[7] = 1;
    a[8] = sw ? (sw - 1) / 10 : -1; a[9] = (sp >> 2) / 1.5; a[10] = tt & 7;
    a[11] = Math.round((get(s, at + 13, 1) / 63) * 100); a[12] = sp & 3; a[13] = fl & 4 ? 1 : 0; a[14] = fl & 2 ? 1 : 0;
    a[15] = (rk >> 3) | (rk & 2 ? 8 : 0) | (rk & 4 ? 16 : 0); a[16] = 0; a[17] = names.get(id);
    out.push(a);
  }
  for (let at = 0; at + 4 <= d.length; at += 4) {
    const id = get(d, at, 4), u = known.get(id);
    if (!u) continue;
    const a = pool[k] || (pool[k] = new Array(18));
    k++;
    a[0] = id; a[1] = TYPE_IDX[u.type]; a[2] = u.team; a[3] = u.pos.x; a[4] = u.pos.y; a[5] = u.pos.z; a[6] = u.yaw; a[7] = 0;
    a[8] = -1; a[9] = 0; a[10] = u.variant; a[11] = 0; a[12] = DIR_IDX[u.attackDir] || 0; a[13] = 0; a[14] = 0;
    a[15] = u.rank | (u.lane ? 8 : 0) | (u.army ? 16 : 0); a[16] = 0; a[17] = undefined;
    out.push(a);
  }
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

