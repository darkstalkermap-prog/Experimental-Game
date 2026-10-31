// War Mode's picture of the battle and the AI generals who read it (warmode.js drives both; the battle's own simulation only: single player and the
// host). Nothing here runs per soldier per frame:
//   Picture   every WAR.tactics.look seconds one pass over the soldiers: for every house its living men and hero, and for each of its groups (infantry,
//             archers, cavalry) how many are left (and mustered), where its middle is and how far it spreads, how many of it are in a fight, its
//             strength. A charging soldier with nobody in reach marches on a man of the army his group was sent at (chargeFoe: a look over a few dozen of
//             that army, not the whole field), and the generals plan from it.
//   General   one per AI house: every second or so (the difficulty) it reads the picture and gives its groups their orders through warmode.js, only when
//             they change (see the class below).
import { WAR, UNIT_TYPES } from './config.js';
import { allied } from './teams.js';

export const GROUP_KEYS = ['inf', 'arch', 'cav'];
// a soldier's group (a giant marches with the infantry); a hero is in none ('hero')
export const kindGroup = (u) => (u.isGiant ? 'inf' : u.kind === 'archer' ? 'arch' : u.kind === 'cavalry' ? 'cav' : u.isHero || u.isPlayer ? 'hero' : 'inf');
// a soldier's worth in the fight, by his type: what the generals weigh groups with (gold is a fair measure of it: WAR.units)
const worthOf = (u) => (WAR.units[u.type] ? WAR.units[u.type].cost : UNIT_TYPES[u.type] ? 40 : 0);

function emptyGroup(k) { return { k, n: 0, start: 0, x: 0, z: 0, r: 0, worth: 0, fight: 0, men: [] }; }

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
    this.t = g.time; this.ver++;
    for (const t of w.houses) {
      let H = this.houses.get(t);
      if (!H) { H = { team: t, n: 0, men: [], hero: null, x: 0, z: 0, worth: 0, groups: { inf: emptyGroup('inf'), arch: emptyGroup('arch'), cav: emptyGroup('cav') } }; this.houses.set(t, H); }
      H.n = 0; H.men.length = 0; H.x = H.z = H.worth = 0;
      for (const k of GROUP_KEYS) { const G = H.groups[k]; G.n = 0; G.x = G.z = G.worth = G.fight = G.r = 0; G.men.length = 0; }
      const f = g.factions[t];
      const hero = f.isPlayer ? f.player : f.hero;
      H.hero = hero && hero.alive ? hero : null;
    }
    for (const u of g.units) {
      if (!u.alive || u.isHero || u.isCrew) continue;
      const H = this.houses.get(u.team);
      if (!H) continue;
      const G = H.groups[kindGroup(u)] || H.groups.inf;
      G.men.push(u); H.men.push(u);
      G.n++; G.x += u.pos.x; G.z += u.pos.z;
      G.worth += worthOf(u) * Math.max(0.25, u.hp / u.maxHp);
      // (in a fight: his man within a few steps, or an archer loosing at someone in range)
      const T = u.target;
      if (T && T.alive && !T.isStructure && Math.abs(T.pos.x - u.pos.x) + Math.abs(T.pos.z - u.pos.z) < (u.ranged ? u.range : 5)) G.fight++;
    }
    for (const H of this.houses.values()) {
      for (const k of GROUP_KEYS) {
        const G = H.groups[k];
        H.n += G.n; H.worth += G.worth;
        if (!w.fighting || !G.start) G.start = G.n;   // (what it mustered: the share left tells a beaten group)
        if (!G.n) continue;
        G.x /= G.n; G.z /= G.n;
        H.x += G.x * G.n; H.z += G.z * G.n;
        let r = 0;
        for (const u of G.men) r += Math.hypot(u.pos.x - G.x, u.pos.z - G.z);
        G.r = (r / G.n) * 1.6 + 2;   // (about where its outer men stand)
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
// was chosen, the enemy army nearest him; u.foeKind: of one group of it, an AI general's riders sent at its archers), the nearest of a few dozen of its
// men (a different few for each soldier, so a charge spreads along the enemy's front rather than piling on one man), or its hero when he is the nearer.
// Null when no enemy is left anywhere.
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
  // (one group of it: when that group is gone, any of its men)
  const G = u.foeKind && H.groups[u.foeKind];
  if (G && G.n) {
    const b = nearestOf(G, u, Math.max(1, Math.ceil(G.men.length / SAMPLE)), null) || nearestOf(G, u, 1, null);
    if (b) return b;
  }
  if (u.foeKind) u.foeKind = '';
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

// the nearest living man of H (a house, or one group of it) to u, of every step-th of its men (from u.id on), or the hero when he is the nearer
function nearestOf(H, u, step, hero = H.hero) {
  let best = null, bd = Infinity;
  const men = H.men, n = men.length;
  for (let i = n ? u.id % step : 0; i < n; i += step) {
    const o = men[i];
    if (!o.alive) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (hero && hero.alive && Math.hypot(hero.pos.x - u.pos.x, hero.pos.z - u.pos.z) + 6 < bd) best = hero;
  return best;
}

// ---------------- the AI generals ----------------
// How each kind of general fights: its temper follows from the army it bought (warmode.js aiBuy's style: a balanced army is steady, a host of footmen
// bold, a mass of bows an archer's general, a horde of riders a raider's). (War Mode's houses have no rival lords: Conquest's personalities lead their
// field armies in ai.js.)
//   hold    how much it leans to waiting on its own hill for the enemy to come up to it (its archers shooting all the way): 0 never, 1 when it can
//   close   metres between the two fronts at which its infantry charges (the bounds of the advance stop short of it)
//   wait    the share of its line that must stand in its place before the next bound (the rest catch up: no trickling in one by one)
//   stall   seconds it waits on its hill for an enemy who does not come, before it marches after all
export const TEMPERS = {
  steady: { hold: 0.45, close: 28, wait: 0.75, stall: 40 },
  bold: { hold: 0, close: 40, wait: 0.6, stall: 20 },
  archer: { hold: 0.9, close: 24, wait: 0.8, stall: 60 },
  raider: { hold: 0.3, close: 30, wait: 0.7, stall: 35 },
};
const STYLE_TEMPER = ['steady', 'bold', 'archer', 'raider'];   // (warmode.js STYLES, in order)
export const temperOfStyle = (i) => STYLE_TEMPER[i] || 'steady';
// what the difficulty lets a general do: how often it looks again (seconds), and whether it advances in bounds, waiting for its stragglers (march), waits
// on its hill when that serves it (posture), puts a shield wall up under arrows and riders (wall), sends its riders round to strike (flank), pulls a beaten
// band back to gather (rally) and picks the weakest army to fight (focus). Easy charges at the nearest army at once with its infantry and riders, as the
// generals always did, and its archers stay on their hill for the first `shoot` seconds of the battle (or until an enemy comes within 60 m), then come up
// behind the infantry: about as strong as the old generals, so Easy stays easy (aisim measures it against them).
export const LEVELS = {
  easy: { every: 2.5, march: false, posture: false, wall: false, flank: false, rally: false, focus: false, shoot: 22 },
  normal: { every: 1, march: true, posture: true, wall: true, flank: true, rally: true, focus: true },
  hard: { every: 0.6, march: true, posture: true, wall: true, flank: true, rally: true, focus: true },
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const BOUND_DWELL = 1.5;   // seconds a marching line stands formed at each bound before the next (General.infantry)

// One AI house's general: every LEVELS.every seconds it reads the picture (Picture) and gives its groups their orders through warmode.js (formUp: a
// group formed up and holding at a spot; charge: a group marching on an army, or on one group of it), and only when they change. It plans:
//   posture    wait on its own hill (the start: the high ground, its archers shooting at an enemy who climbs to them) or march; it waits when its bows
//              outshoot the enemy's, the enemy is the stronger, or the enemy is strong in riders and its line has spears to meet them, never when the
//              enemy's archers would shoot it to pieces where it stands, and not for longer than its temper's patience
//   infantry   the body of the army: on its hill it holds a line (a shield wall when the enemy has archers or riders) and fights there; marching, it
//              goes in bounds of about 20 m, the line formed up at each and the stragglers waited for, and charges all together from `close` metres of
//              the enemy's foot; riders coming at it are received standing, not chased; cut down to a third, it gathers at its archers
//   archers    a few steps behind the infantry, moved up behind the fight once it begins, back behind it when an enemy band comes for them
//   cavalry    beside the infantry until there is a mark worth the ride: the enemy's infantry locked in a fight with ours (struck from the side, where
//              no shield is: never head-on into a formed line), or its archers out in the open near the fight; it rides round to the mark's flank,
//              then charges it. It meets riders at grips with our line and bands that come for our archers, stays by the infantry while the enemy's
//              riders are loose, and cut down to a third rides back behind the infantry to gather.
//   the foe    the nearest army; at Normal and Hard the weakest or the one already in a fight with a third (in a free-for-all), but always the one at its
//              throat; when the enemy is broken, or the time is nearly up, everybody charges (allIn: the general has nothing more to plan)
//   the lord   with his infantry, a few steps behind its middle; he charges when it does
export class General {
  constructor(w, f, temper = 'steady', level = 'normal') {
    this.w = w;
    this.g = w.g;
    this.f = f;
    this.temper = TEMPERS[temper] ? temper : 'steady';
    this.T = TEMPERS[this.temper];
    this.L = LEVELS[level] || LEVELS.normal;
    this.t = 0;                // seconds to the next look
    this.foe = -1;             // the house it fights
    this.posture = null;       // 'hold' (on its hill) or 'advance'
    this.postureT = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;   // (the flank its riders keep to)
    this.inf = { task: null, at: null, since: 0, foe: -1 };
    this.arch = { task: null, at: null, since: 0 };
    this.cav = { task: null, at: null, since: 0, mark: null };
    this.lord = { task: null, at: null };
    this.threat = null;
  }

  // a general taking over in the battle (a lord who left: warmode.js dropHuman) carries on with what he had begun: a group he had sent charging goes on
  // charging (at the army it was sent at), the others are planned from where they stand
  adopt() {
    const w = this.w;
    for (const k of GROUP_KEYS) {
      const l = w.groupList(this.f.team, k);
      const on = l.filter((u) => u.order === 'charge');
      if (!l.length || on.length < l.length / 2) continue;
      const S = this[k];
      S.task = 'charge'; S.since = w.clock; S.foe = on[0].foeTeam;
      if (k === 'cav') S.mark = null;
      this.posture = 'advance';
    }
    if (this.inf.task === 'charge' && this.inf.foe >= 0) this.foe = this.inf.foe;
  }

  // every frame of the battle (warmode.js update); the looks come every L.every seconds
  update(dt) {
    if (this.f.war.allIn || this.f.eliminated) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = this.L.every;
    this.tick();
  }

  tick() {
    const w = this.w, P = w.picture;
    P.fresh();
    const me = P.house(this.f.team);
    if (!me) return;
    const I = me.groups.inf, A = me.groups.arch, C = me.groups.cav;
    // the body of the army: the infantry, else the riders, else the archers
    const body = I.n >= 5 ? I : C.n >= 3 ? C : A.n ? A : null;
    if (!body) { this.lordAlone(); return; }
    const E = this.pickFoe(me, body);
    if (!E) return;
    const eI = E.groups.inf, eA = E.groups.arch, eC = E.groups.cav;
    // the enemy group nearest our body, and the way to it
    const near = nearestGroup(E, body);
    const to = near ? near.G : E.hero ? { x: E.hero.pos.x, z: E.hero.pos.z, r: 1 } : null;
    if (!to) return;
    let dx = to.x - body.x, dz = to.z - body.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const c = {
      me, E, I, A, C, eI, eA, eC, dx, dz, yaw: Math.atan2(dx, dz),
      gap: (G) => (G.n ? gapTo(E, G) : Infinity),   // (between that group of ours and the enemy's nearest, front to front)
      rush: eA.worth > Math.max(A.worth * 1.4, E.worth * 0.18),   // (the enemy's archers would shoot us to pieces while we wait: go at them)
    };
    // all in: the enemy is broken, only its lord is left, or the time is nearly up: everybody charges, and there is nothing more to plan
    if (!E.n || (E.worth < me.worth * 0.25 && E.n < 40) || w.clock > WAR.fightLimit - 45) { this.allIn(me); return; }
    this.choosePosture(c);
    this.threat = this.L.flank ? this.archerThreat(c) : null;
    this.infantry(c);
    this.archers(c);
    this.cavalry(c);
    this.lordOrders(c);
  }

  // ---- the foe ----
  // the army it fights: whoever is at its throat (a group within 40 m of our body); else the nearest, or at Normal and Hard the weakest for the
  // distance, and the better one if it is already fighting a third house. It keeps its foe unless another is much the better.
  pickFoe(me, body) {
    const P = this.w.picture;
    let best = null, bs = Infinity, cur = null, cs = Infinity;
    for (const H of P.houses.values()) {
      if (allied(H.team, this.f.team) || !(H.n || H.hero)) continue;
      const near = nearestGroup(H, body);
      const d = near ? near.d - body.r : dist(H.hero.pos, body);
      let s = d;
      if (d < 40) s -= 1000;
      else if (this.L.focus) {
        s += 140 * Math.min(2, H.worth / Math.max(1, me.worth));
        let busy = 0;
        for (const k of GROUP_KEYS) busy += H.groups[k].fight;
        if (busy > H.n * 0.2 && d > 60) s -= 50;   // (a third house is already at it)
      }
      if (H.team === this.foe) { cur = H; cs = s; }
      if (s < bs) { bs = s; best = H; }
    }
    if (cur && cs < bs + 40) best = cur;
    if (best && best.team !== this.foe) this.foe = best.team;
    return best;
  }

  choosePosture(c) {
    const w = this.w;
    if (this.posture === 'hold') {
      // waited long enough for an enemy who does not come: march after all (and so does one whose archers would shoot it to pieces)
      if ((w.clock - this.postureT > this.T.stall || c.rush) && c.gap(c.I.n ? c.I : c.A) > 45) { this.posture = 'advance'; this.postureT = w.clock; }
      return;
    }
    if (this.posture) return;
    this.postureT = w.clock;
    if (!this.L.posture || c.rush) { this.posture = 'advance'; return; }
    // (an army strong in riders against a line with spears in it: the line waits for them, spears in front, rather than be caught on the march)
    let spears = 0;
    for (const u of c.I.men) if (u.def && u.def.weapon === 'spear') spears++;
    const receive = c.eC.worth > c.E.worth * 0.3 && spears >= Math.max(8, c.I.n * 0.2) ? 0.35 : 0;
    const lean = this.T.hold + (c.A.worth > c.eA.worth * 1.2 && c.A.n >= 10 ? 0.3 : 0) + (c.E.worth > c.me.worth * 1.25 ? 0.3 : 0) + receive - (c.I.n < 10 ? 1 : 0);
    this.posture = lean >= 0.6 ? 'hold' : 'advance';
  }

  // ---- orders ----
  // group k formed up and holding round (x, z) facing yaw, in formation `form` (unchanged: no new orders, so the men are not shuffled every look);
  // spears: the spearmen in the front ranks (riders coming, or an enemy strong in them)
  holdGroup(k, G, x, z, yaw, form, spears = false) {
    const S = this[k], f = this.f;
    const same = S.task === 'hold' && S.at && Math.hypot(S.at.x - x, S.at.z - z) < 1 && Math.abs(Math.atan2(Math.sin(S.at.yaw - yaw), Math.cos(S.at.yaw - yaw))) < 0.35 && f.war.form[k] === form && (!spears || S.spears);   // (riders gone: the spearmen stay where they are)
    if (same) return;
    f.war.form[k] = form;
    f.war.plan[k] = 'hold';
    this.w.formUp(f, k, G.men, x, z, yaw, spears);
    S.task = 'hold'; S.at = { x, z, yaw }; S.since = this.w.clock; S.spears = spears;
  }

  // group k charges house `foe` (kind: one group of it, or '' for any)
  chargeGroup(k, G, foe, kind = '') {
    const S = this[k];
    this.f.war.plan[k] = 'charge';
    this.w.charge(G.men, foe, kind);
    S.task = 'charge'; S.at = null; S.foe = foe; S.since = this.w.clock;
  }

  allIn(me) {
    const f = this.f;
    for (const k of GROUP_KEYS) if (me.groups[k].n) this.chargeGroup(k, me.groups[k], -1);
    if (f.hero && f.hero.alive) { f.hero.foeTeam = -1; f.hero.setOrder('charge'); }
    f.war.allIn = true;
  }

  // no soldier left: the lord fights on by himself
  lordAlone() {
    const h = this.f.hero;
    if (h && h.alive && h.order !== 'charge') h.setOrder('charge');
  }

  // a share of group k standing in its places (a bound reached)
  reached(G, share) {
    let n = 0, m = 0;
    for (const u of G.men) {
      if (!u.alive) continue;
      m++;
      const d = u.order === 'hold' && u.orderData && u.orderData.exact ? u.orderData.pos : null;
      if (d && Math.hypot(d.x - u.pos.x, d.z - u.pos.z) < 4) n++;
    }
    return m && n >= m * share;
  }

  // ---- the groups ----
  infantry(c) {
    const I = c.I, S = this.inf, w = this.w, { eI, eA, eC } = c;
    if (!I.n) return;
    // how far the enemy's foot is (its infantry; its archers when it has none; its riders when they are all it has): the charge is at men on foot
    const foot = eI.n >= 5 ? eI : eA.n >= 5 ? eA : eC;
    const gapFoot = foot.n ? Math.max(0, dist(foot, I) - foot.r - I.r) : Infinity;
    // in contact: the line is in a fight, or the enemy front is at arm's length
    const contact = I.fight >= Math.max(3, I.n * 0.12) || c.gap(I) < 6;
    if (S.task === 'charge') {
      if (S.foe !== this.foe && !contact) this.chargeGroup('inf', I, this.foe);   // (another army is the foe now)
      return;
    }
    // riders coming at the line (nearer it than their own foot, and not yet locked in a fight): the line stands to receive them, shoulder to shoulder
    // (a shield wall at Normal and Hard), its spearmen in front (a horse that charges onto a spear is stopped: config SPEAR), and fights where it
    // stands; it is not drawn out after them. Our archers shoot them, our riders hit them once they are at grips with it (cavalry, below).
    const riders = eC.n >= 6 && foot !== eC && dist(eC, I) - eC.r - I.r < 55 && dist(eC, I) < dist(foot, I) - 10;
    const spears = riders || (eC.n >= 6 && eC.worth > c.E.worth * 0.3);   // (riders coming, or an army strong in them: the spearmen form up in front)
    if (!this.L.march) { this.chargeGroup('inf', I, this.foe); return; }   // (Easy: straight at them)
    const close = this.T.close + (c.rush ? 15 : 0);
    if (this.posture === 'hold' || riders) {
      if (riders && gapFoot <= close && foot === eI) { this.chargeGroup('inf', I, this.foe); return; }   // (their foot is on us too: at it)
      if (contact) {
        // the enemy has come to the line: it fights where it stands (the line is not formed up again while it fights: its men would leave their
        // foes to walk to new places); it charges home once the enemy's infantry is spent, or the fight hangs fire
        if (!riders && (eI.n < I.n * 0.4 || (I.fight < I.n * 0.05 && w.clock - S.since > 25))) this.chargeGroup('inf', I, this.foe);
        return;
      }
      // on its hill (or where the riders found it), facing the enemy: a shield wall when there are archers or riders to face (the shields locked block
      // most arrows and blows). Once formed, it turns only for a large swing of the enemy (riders wheel about: the line would shuffle at every look).
      const form = this.L.wall && (eA.n >= 8 || riders) ? 'wall' : 'line';
      const at = S.task === 'hold' && S.at ? S.at : { x: I.x, z: I.z };
      let yaw = riders ? Math.atan2(eC.x - at.x, eC.z - at.z) : c.yaw;
      if (S.task === 'hold' && S.at && Math.abs(Math.atan2(Math.sin(S.at.yaw - yaw), Math.cos(S.at.yaw - yaw))) < 0.8) yaw = S.at.yaw;
      this.holdGroup('inf', I, at.x, at.z, yaw, form, spears);
      return;
    }
    // cut down to a third and not at grips, against a stronger foot: back to the archers to gather (they shoot over it), until the enemy comes on
    if (this.L.rally && I.n <= I.start * 0.3 && !contact && eI.worth > I.worth * 1.5 && c.A.n >= 5) {
      const x = c.A.x + c.dx * (c.A.r + 6), z = c.A.z + c.dz * (c.A.r + 6);
      if (S.task !== 'hold' || !S.at || Math.hypot(S.at.x - x, S.at.z - z) > 8) this.holdGroup('inf', I, x, z, c.yaw, this.L.wall ? 'wall' : 'line');
      return;
    }
    // marching: in bounds, the line formed up at each; the charge from `close` metres of the enemy's foot, all together
    if (gapFoot <= close || contact) { this.chargeGroup('inf', I, this.foe); return; }
    // (the next bound once the line has stood formed for a moment, BOUND_DWELL seconds after most of it reached its places, however often the general
    // looks: a general who looked more often marched on as soon as the first three quarters were there, and his stragglers never caught up)
    if (S.task === 'bound' && !S.reachedT && this.reached(I, this.T.wait)) S.reachedT = w.clock;
    if (S.task !== 'bound' || (S.reachedT && w.clock - S.reachedT >= BOUND_DWELL) || w.clock - S.since > 9) {
      const step = Math.max(6, Math.min(22, gapFoot - close + 4));
      this.holdGroup('inf', I, I.x + c.dx * step, I.z + c.dz * step, c.yaw, 'line', spears);
      S.task = 'bound'; S.reachedT = 0;
    }
  }

  archers(c) {
    const A = c.A, S = this.arch, I = c.I;
    if (!A.n || S.task === 'charge') return;
    if (this.L.shoot && this.w.clock < this.L.shoot && c.gap(A) > 60) { if (S.task !== 'hold') this.holdGroup('arch', A, A.x, A.z, c.yaw, 'line'); return; }   // (Easy)
    let x, z;
    const guard = c.eC.worth > c.E.worth * 0.22 ? 9 : 15;   // (riders about: close behind the infantry)
    if (this.threat && I.n >= 5) {
      // an enemy band coming for them: back behind the infantry
      x = I.x - c.dx * (I.r + 20); z = I.z - c.dz * (I.r + 20);
    } else if (I.n >= 5) {
      // behind the line; once it is in the fight, up close behind it, the enemy's ranks within their bows' reach
      const back = this.inf.task === 'charge' || I.fight > I.n * 0.12 ? Math.min(A.men[0] ? A.men[0].range * 0.55 : 24, 26) : I.r * 0.5 + guard;
      x = I.x - c.dx * back; z = I.z - c.dz * back;
    } else {
      // nobody to stand behind: where they are, or (marching) close enough to shoot
      const gap = c.gap(A), reach = A.men[0] ? A.men[0].range - 8 : 36;
      const step = this.posture === 'advance' && gap > reach ? Math.min(20, gap - reach) : 0;
      x = A.x + c.dx * step; z = A.z + c.dz * step;
    }
    if (S.task === 'hold' && S.at && Math.hypot(S.at.x - x, S.at.z - z) < 7) return;
    this.holdGroup('arch', A, x, z, c.yaw, 'line');
  }

  cavalry(c) {
    const C = c.C, S = this.cav, w = this.w, I = c.I;
    if (!C.n) return;
    const mark = (m) => { const H = w.picture.house(m.team); return H ? H.groups[m.k] : null; };
    // Easy: the riders go in with the infantry (beside it until it charges)
    if (!this.L.flank) {
      if (S.task === 'charge') return;
      if (this.inf.task === 'charge' || I.n < 5 || c.gap(C) < 25) { this.chargeGroup('cav', C, this.foe); return; }
      this.screen(c);
      return;
    }
    // an enemy band coming for our archers, or riders at grips with our line: the riders meet them (a band of riders locked in a fight is the best
    // mark there is: struck from the side, it cannot ride away)
    const T = this.threat || this.ridersOnUs(c);
    if (T && !(S.task === 'charge' && S.mark && S.mark.team === T.team && S.mark.k === T.k)) { S.mark = { team: T.team, k: T.k }; this.chargeGroup('cav', C, T.team, T.k); return; }
    // cut down to a third and out of the fight: back behind the infantry to gather, for a while
    if (this.L.rally && I.n >= 5 && C.n <= C.start * 0.35 && C.fight < C.n * 0.3 && S.task !== 'rally' && w.clock - S.since > 4) {
      this.holdGroup('cav', C, I.x - c.dx * (I.r + 14), I.z - c.dz * (I.r + 14), c.yaw, 'line');
      S.task = 'rally'; S.since = w.clock;
      return;
    }
    if (S.task === 'rally' && w.clock - S.since < 15) return;
    if (S.task === 'charge') {
      const M = S.mark && mark(S.mark);
      if (!S.mark || (M && M.n >= 3) || C.fight > C.n * 0.3) return;   // (still at it; or in a fight anyway)
      S.task = null;
    }
    if (S.task === 'flank') {
      const M = mark(S.mark);
      if (!M || M.n < 3) S.task = null;
      else if (this.reached(C, 0.5) || w.clock - S.since > 12 || dist(C, M) - M.r - C.r < 22) { this.chargeGroup('cav', C, S.mark.team, S.mark.k); return; }
      else return;
    }
    // a mark worth the ride: round to its flank (then the charge, above)
    const m = this.cavMark(c);
    if (m) {
      const M = c.E.groups[m.k], base = m.k === 'arch' && c.eI.n >= 8 ? c.eI : M;
      // (beside it, on our riders' side, a little past its middle: the charge comes in from the side)
      const px = c.dz * this.side, pz = -c.dx * this.side;
      const x = M.x + px * (base.r + 20) + c.dx * M.r * 0.3, z = M.z + pz * (base.r + 20) + c.dz * M.r * 0.3;
      this.holdGroup('cav', C, x, z, Math.atan2(M.x - x, M.z - z), 'line');
      S.task = 'flank'; S.mark = m; S.since = w.clock;
      return;
    }
    this.screen(c);
  }

  // the riders' place while they wait: on the flank of the infantry, a little behind its front
  screen(c) {
    const I = c.I, C = c.C, S = this.cav;
    if (I.n < 5) { if (S.task !== 'hold') this.holdGroup('cav', C, C.x, C.z, c.yaw, 'line'); return; }
    const px = c.dz * this.side, pz = -c.dx * this.side;
    const x = I.x + px * (I.r + 14) - c.dx * 4, z = I.z + pz * (I.r + 14) - c.dz * 4;
    if (S.task === 'hold' && S.at && Math.hypot(S.at.x - x, S.at.z - z) < 10) return;
    this.holdGroup('cav', C, x, z, c.yaw, 'line');
  }

  // the riders' mark: the enemy's infantry locked in a fight with ours (struck from the side, where no shield is); the enemy's archers out in the open (no
  // infantry of theirs about them, or theirs already at grips with ours) and near enough to the fight to be shooting at it (not a ride to their hill);
  // or, when it has nothing else, its riders. While the enemy's riders are still loose and strong, ours stay by the infantry.
  cavMark(c) {
    const { E, eI, eA, eC, I, A, C } = c;
    if (eI.n >= 8 && eI.fight >= eI.n * 0.2 && I.fight > 0) return { team: E.team, k: 'inf' };
    // (no infantry of ours left to wait beside: the riders go for the nearest of them, round its flank)
    if (I.n < 5) { const n = nearestGroup(E, C); if (n) return { team: E.team, k: n.G.k }; }
    if (eC.n >= 6 && eC.fight < eC.n * 0.3 && eC.worth > C.worth * 0.6) return null;
    if (eA.n >= 5) {
      const guarded = eI.n >= 8 && dist(eI, eA) < eI.r + eA.r + 10 && eI.fight < eI.n * 0.15;
      const ours = I.n ? I : A.n ? A : C;
      const nearFight = dist(eA, ours) - eA.r - ours.r < 75;
      if (!guarded && nearFight) return { team: E.team, k: 'arch' };
    }
    if (!eI.n && !eA.n && eC.n) return { team: E.team, k: 'cav' };
    return null;
  }

  // enemy riders (of any house) at grips with our infantry or archers: { team, k: 'cav' } or null
  ridersOnUs(c) {
    const { I, A } = c;
    for (const H of this.w.picture.houses.values()) {
      if (allied(H.team, this.f.team)) continue;
      const G = H.groups.cav;
      if (G.n < 4 || G.fight < Math.max(2, G.n * 0.2)) continue;
      if ((I.n && dist(G, I) < G.r + I.r + 12) || (A.n && dist(G, A) < G.r + A.r + 12)) return { team: H.team, k: 'cav' };
    }
    return null;
  }

  // an enemy band (of any house) not yet in a fight, within 40 m of our archers and nearer them than our infantry is
  archerThreat(c) {
    const A = c.A, I = c.I;
    if (A.n < 4) return null;
    let best = null, bd = 40;
    for (const H of this.w.picture.houses.values()) {
      if (allied(H.team, this.f.team)) continue;
      for (const k of ['inf', 'cav']) {
        const G = H.groups[k];
        if (G.n < 4 || G.fight > G.n * 0.4) continue;
        const d = dist(G, A) - G.r - A.r * 0.5;
        if (d >= bd) continue;
        if (I.n >= 5 && dist(G, I) - I.r < d) continue;   // (our infantry stands in its way)
        best = { team: H.team, k }; bd = d;
      }
    }
    return best;
  }

  // the lord: with his infantry, a few steps behind its middle; he charges when it does
  lordOrders(c) {
    const h = this.f.hero, S = this.lord, I = c.I;
    if (!h || !h.alive) return;
    if (this.inf.task === 'charge' || I.n < 5) { if (S.task !== 'charge') { S.task = 'charge'; h.foeTeam = this.foe; h.foeNear = 20; h.setOrder('charge'); } return; }
    const x = I.x - c.dx * (I.r * 0.4 + 4), z = I.z - c.dz * (I.r * 0.4 + 4);
    if (S.task === 'hold' && S.at && Math.hypot(S.at.x - x, S.at.z - z) < 6) return;
    this.w.holdAt(this.f, h, x, z, 0, c.yaw);
    S.task = 'hold'; S.at = { x, z };
  }
}

// the group of house H nearest the group B (its middle), and how far: { G, d } with d the distance between their middles less H's group's spread
function nearestGroup(H, B) {
  let best = null, bd = Infinity;
  for (const k of GROUP_KEYS) { const G = H.groups[k]; if (!G.n) continue; const d = dist(G, B) - G.r; if (d < bd) { bd = d; best = G; } }
  return best ? { G: best, d: bd } : null;
}
// between group B and the nearest group of house H, front to front
function gapTo(H, B) {
  const n = nearestGroup(H, B);
  return n ? Math.max(0, n.d - B.r) : Infinity;
}
