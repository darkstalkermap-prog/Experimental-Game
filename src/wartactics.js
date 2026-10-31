// War Mode's picture of the battle and the AI generals who read it (warmode.js drives both; the battle's own simulation only: single player and the
// host). Nothing here runs per soldier per frame:
//   Picture   every WAR.tactics.look seconds one pass over the soldiers: for every house its living men and hero, and for each of its groups (infantry,
//             archers, cavalry) how many are left, where its middle is and how far it spreads, how fast it moves, how many of it are in a fight, its
//             strength. A charging soldier with nobody in reach marches on a man of the army his group was sent at (chargeFoe: a look over a few dozen of
//             that army, not the whole field), and the generals plan from it.
//   General   one per AI house (see the class below).
import { WAR, UNIT_TYPES } from './config.js';
import { allied } from './teams.js';

export const GROUP_KEYS = ['inf', 'arch', 'cav'];
const kindGroup = (u) => (u.isGiant ? 'inf' : u.kind === 'archer' ? 'arch' : u.kind === 'cavalry' ? 'cav' : 'inf');
// a soldier's worth in the fight, by his type: what the generals weigh groups with (gold is a fair measure of it: WAR.units)
const worthOf = (u) => (WAR.units[u.type] ? WAR.units[u.type].cost : UNIT_TYPES[u.type] ? 40 : 0);

function emptyGroup(k) { return { k, n: 0, start: 0, x: 0, z: 0, r: 0, vx: 0, vz: 0, hp: 0, worth: 0, fight: 0, men: [], px: 0, pz: 0, seen: false, spear: 0 }; }

export class Picture {
  constructor(w) {
    this.w = w;
    this.g = w.g;
    this.houses = new Map();   // team -> { team, n, men, hero, x, z, worth, groups: { inf, arch, cav } }
    this.t = 0;                // (when it was last drawn, in game time)
    this.ver = 0;
  }

  house(team) { return this.houses.get(team) || null; }

  // the soldiers' places now (cheap: one pass over them, and an array per group reused)
  update() {
    const g = this.g, w = this.w;
    const dt = Math.max(0.05, g.time - this.t);
    this.t = g.time; this.ver++;
    for (const t of w.houses) {
      let H = this.houses.get(t);
      if (!H) { H = { team: t, n: 0, men: [], hero: null, x: 0, z: 0, worth: 0, groups: { inf: emptyGroup('inf'), arch: emptyGroup('arch'), cav: emptyGroup('cav') } }; this.houses.set(t, H); }
      H.n = 0; H.men.length = 0; H.x = H.z = H.worth = 0;
      for (const k of GROUP_KEYS) { const G = H.groups[k]; G.px = G.x; G.pz = G.z; G.n = 0; G.x = G.z = G.hp = G.worth = G.fight = G.r = G.spear = 0; G.men.length = 0; }
      const f = g.factions[t];
      const hero = f.isPlayer ? f.player : f.hero;
      H.hero = hero && hero.alive ? hero : null;
    }
    for (const u of g.units) {
      if (!u.alive || u.isHero || u.isCrew) continue;
      const H = this.houses.get(u.team);
      if (!H) continue;
      const G = H.groups[kindGroup(u)];
      G.men.push(u); H.men.push(u);
      G.n++; G.x += u.pos.x; G.z += u.pos.z; G.hp += u.hp;
      const v = worthOf(u) * Math.max(0.25, u.hp / u.maxHp);
      G.worth += v;
      if (u.type === 'spearman') G.spear++;
      // (in a fight: his man within a few steps, or an archer loosing at someone in range)
      const T = u.target;
      if (T && T.alive && !T.isStructure && Math.abs(T.pos.x - u.pos.x) + Math.abs(T.pos.z - u.pos.z) < (u.ranged ? u.range : 5)) G.fight++;
    }
    for (const H of this.houses.values()) {
      for (const k of GROUP_KEYS) {
        const G = H.groups[k];
        H.n += G.n; H.worth += G.worth;
        if (!G.n) { G.vx = G.vz = 0; G.seen = false; continue; }
        G.x /= G.n; G.z /= G.n;
        H.x += G.x * G.n; H.z += G.z * G.n;
        let r = 0;
        for (const u of G.men) r += Math.hypot(u.pos.x - G.x, u.pos.z - G.z);
        G.r = (r / G.n) * 1.6 + 2;   // (about where its outer men stand)
        if (G.seen) { G.vx = G.vx * 0.5 + ((G.x - G.px) / dt) * 0.5; G.vz = G.vz * 0.5 + ((G.z - G.pz) / dt) * 0.5; } else { G.vx = G.vz = 0; G.seen = true; }
        if (!w.fighting || !G.start) G.start = G.n;   // (what it mustered: the share left tells a beaten group)
      }
      if (H.n) { H.x /= H.n; H.z /= H.n; } else if (H.hero) { H.x = H.hero.pos.x; H.z = H.hero.pos.z; }
    }
  }

  // drawn at least once this moment (a charge given before the first look of the battle)
  fresh() { if (this.ver === 0 || this.g.time - this.t > 1.5) this.update(); }

  // the enemy house of `team` whose nearest group (or lone hero) is nearest to (x, z), or -1 when none is left; skip: a team not to choose
  nearestFoe(team, x, z, skip = -1) {
    let best = -1, bd = Infinity;
    for (const H of this.houses.values()) {
      if (H.team === skip || allied(H.team, team) || !(H.n || H.hero)) continue;
      let d = Infinity;
      for (const k of GROUP_KEYS) { const G = H.groups[k]; if (G.n) d = Math.min(d, Math.hypot(G.x - x, G.z - z) - G.r); }
      if (!H.n) d = Math.hypot(H.hero.pos.x - x, H.hero.pos.z - z);
      if (d < bd) { bd = d; best = H.team; }
    }
    return best;
  }

  // the enemy houses of `team` still in the field, in house order (the command bar's colour buttons)
  foes(team) {
    const out = [];
    for (const t of this.w.houses) { const H = this.houses.get(t); if (!allied(t, team) && H && (H.n || H.hero)) out.push(t); }
    return out;
  }
}

// A real foe for a War Mode soldier on Charge who has nobody within reach: a man of the army his group was sent at (u.foeTeam; when it is gone or none
// was chosen, the enemy army nearest him), the nearest of a few dozen of its men (a different few for each soldier, so a charge spreads along the
// enemy's front rather than piling on one man), or its hero when he is the nearer. Null when no enemy is left anywhere.
const SAMPLE = 40;
export function chargeFoe(P, u) {
  P.fresh();
  let H = u.foeTeam >= 0 ? P.house(u.foeTeam) : null;
  if (!H || !(H.n || H.hero) || allied(H.team, u.team)) {
    const t = P.nearestFoe(u.team, u.pos.x, u.pos.z);
    u.foeTeam = t;
    H = t >= 0 ? P.house(t) : null;
    if (!H) return null;
  }
  let best = nearestOf(H, u, Math.max(1, Math.ceil(H.men.length / SAMPLE)));
  // (the picture is up to half a second old: when every man of that sample has fallen since, all of that army is looked at, then the next army)
  if (!best) best = nearestOf(H, u, 1);
  if (!best) {
    const t = P.nearestFoe(u.team, u.pos.x, u.pos.z, H.team);
    const H2 = t >= 0 ? P.house(t) : null;
    if (H2) { u.foeTeam = t; best = nearestOf(H2, u, 1); }
  }
  return best;
}

// the nearest living man of house H to u, of every step-th of its men (from u.id on), or its hero when he is the nearer
function nearestOf(H, u, step) {
  let best = null, bd = Infinity;
  const men = H.men, n = men.length;
  for (let i = n ? u.id % step : 0; i < n; i += step) {
    const o = men[i];
    if (!o.alive) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < bd) { bd = d; best = o; }
  }
  const h = H.hero;
  if (h && h.alive && Math.hypot(h.pos.x - u.pos.x, h.pos.z - u.pos.z) + 6 < bd) best = h;
  return best;
}
