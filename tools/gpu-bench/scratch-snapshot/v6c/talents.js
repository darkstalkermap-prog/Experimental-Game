// Talents, single player: the data, the learning rules, what every talent does (table-driven: each talent id is checked
// against the ability or number it changes), and the Talents tab, key N and the HUD hint.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 1);
  await page.evaluate(() => { window.__game.phaseT = 1e6; });   // no waves while we test

  // ---------------------------------------------------------------- the data
  let r = await page.evaluate(async () => {
    const T = await import('/src/talents.js');
    const C = await import('/src/classes.js');
    const out = { classes: {}, problems: [] };
    const ids = new Set();
    const MODKEYS = new Set(['hp', 'speed', 'melee', 'bow', 'spell', 'draw', 'cd', 'regen', 'rider', 'trample', 'armor', 'block', 'bloodied']);
    for (const t of T.TALENTS) {
      if (ids.has(t.id)) out.problems.push('duplicate id ' + t.id);
      ids.add(t.id);
      if (!C.CLASS_IDS.includes(t.cls)) out.problems.push(`${t.id}: unknown class ${t.cls}`);
      if (![1, 2, 3, 4].includes(t.tier)) out.problems.push(`${t.id}: tier ${t.tier}`);
      if (!t.name || !t.icon || !t.desc || /undefined|NaN/.test(t.desc)) out.problems.push(`${t.id}: name/icon/desc ${t.desc}`);
      if (!t.mods && !t.fx) out.problems.push(`${t.id}: does nothing`);
      if (!['q', 'r'].includes(t.br)) out.problems.push(`${t.id}: branch ${t.br}`);
      if (t.mods) for (const part of ['mul', 'add']) for (const k in t.mods[part] || {}) if (!MODKEYS.has(k) || !Number.isFinite(t.mods[part][k])) out.problems.push(`${t.id}: bad mod ${part}.${k}`);
      if (t.tier === 1) { if (t.needs !== null) out.problems.push(`${t.id}: tier 1 must have no parent`); }
      else {
        const par = T.TALENT_BY_ID[t.needs];
        if (!par) out.problems.push(`${t.id}: parent ${t.needs} missing`);
        else {
          if (par.cls !== t.cls) out.problems.push(`${t.id}: parent of another class`);
          if (par.tier >= t.tier) out.problems.push(`${t.id}: parent not a lower tier`);
          if (par.tier !== t.tier - 1 || par.br !== t.br) out.problems.push(`${t.id}: parent is not straight above it (the tree view draws it so)`);
        }
      }
    }
    for (const id of C.CLASS_IDS) {
      const list = T.talentsOf(id);
      const fx = list.flatMap((t) => Object.keys(t.fx || {}));
      const dupFx = fx.filter((k, i) => fx.indexOf(k) !== i);
      out.classes[id] = { n: list.length, tiers: [1, 2, 3, 4].map((k) => list.filter((t) => t.tier === k).length).join(''), dupFx, branches: list.filter((t) => t.br === 'q').length + '/' + list.filter((t) => t.br === 'r').length,
        hasMods: list.some((t) => t.mods), hasFx: list.some((t) => t.fx) };
    }
    out.total = T.TALENTS.length;
    return out;
  });
  check('talent data has no problems', r.problems.length === 0, r.problems.join('; '));
  check('every class has at least 6 talents (7 in 4 tiers: 2-2-2-1 or 2-2-1-... )', Object.values(r.classes).every((c) => c.n >= 6), JSON.stringify(r.classes));
  check('every tree has pure stat talents and ability-changing ones', Object.values(r.classes).every((c) => c.hasMods && c.hasFx));
  check('no two talents of a class set the same fx key', Object.values(r.classes).every((c) => c.dupFx.length === 0), JSON.stringify(Object.values(r.classes).map((c) => c.dupFx)));
  check('42 talents in all, one tier-4 capstone per tree', r.total === 42 && Object.values(r.classes).every((c) => c.tiers.endsWith('1')), `${r.total} ${JSON.stringify(Object.values(r.classes).map((c) => c.tiers))}`);

  // ---------------------------------------------------------------- the learning rules
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const out = {};
    const home = g.castles[0].spawnPoint.clone();
    p.pos.copy(home); p.pos.y = g.physics.groundHeight(home.x, home.z, home.y + 3);
    p.setClass('knight');
    p.setLevel(1);
    out.l1 = { points: p.talentPoints, learn: g.learnTalent(p, 'kn_boss'), hp: p.maxHp };
    p.setLevel(2);
    out.l2 = { points: p.talentPoints };
    out.t2 = g.learnTalent(p, 'kn_hold');                       // tier 2 needs level 3 (and its parent)
    out.other = g.learnTalent(p, 'mg_blast');                   // another class's talent
    out.unknown = g.learnTalent(p, 'nonsense');
    out.ok1 = g.learnTalent(p, 'kn_boss');
    out.afterOk1 = { points: p.talentPoints, talents: Object.keys(p.talents), rev: p.talentRev };
    out.again = g.learnTalent(p, 'kn_boss');                    // once only
    out.noPoints = g.learnTalent(p, 'kn_plate');                // level 2 gave one point
    p.setLevel(3);
    out.l3 = { points: p.talentPoints };
    out.noParent = g.learnTalent(p, 'kn_hold');                 // needs Tempered Plate
    out.tier3 = g.learnTalent(p, 'kn_ram');                     // tier 3 needs level 4
    out.rattle = g.learnTalent(p, 'kn_rattle');                 // tier 2, parent learnt, level 3
    out.afterRattle = { points: p.talentPoints, talents: Object.keys(p.talents) };
    p.setLevel(5);
    out.l5 = { points: p.talentPoints };
    out.cap = g.learnTalent(p, 'kn_avenge');                    // capstone: needs Phalanx
    out.ram = g.learnTalent(p, 'kn_ram');
    out.afterRam = { points: p.talentPoints, talents: Object.keys(p.talents) };
    // respec: only at home
    const hpFrac = p.hp / p.maxHp, maxBefore = p.maxHp;
    p.pos.set(0, g.physics.terrainHeight(0, 0), 0);
    out.respecAway = g.respec(p);
    out.afterAway = { talents: Object.keys(p.talents).length, points: p.talentPoints };
    p.pos.copy(home); p.pos.y = g.physics.groundHeight(home.x, home.z, home.y + 3);
    out.respecHome = g.respec(p);
    out.afterHome = { talents: Object.keys(p.talents).length, points: p.talentPoints, maxHp: p.maxHp, maxBefore, mods: p.mods.hp, rev: p.talentRev, hpFrac: +(p.hp / p.maxHp).toFixed(2), hpFracBefore: +hpFrac.toFixed(2) };
    out.respecNone = g.respec(p);
    // a class change clears the talents; so does setClass
    g.learnTalent(p, 'kn_plate');
    out.preChange = Object.keys(p.talents).length;
    p.changeClass('mage');
    out.afterChange = { talents: Object.keys(p.talents).length, points: p.talentPoints, cls: p.classId };
    // learning is for the hero's current class
    out.mageLearn = g.learnTalent(p, 'mg_blast');
    out.oldClass = g.learnTalent(p, 'kn_plate');
    return out;
  });
  check('level 1: no points, and a tier-1 talent needs level 2', r.l1.points === 0 && r.l1.learn === 'Needs level 2', JSON.stringify(r.l1));
  check('level 2: one point', r.l2.points === 1);
  check('tier 2 is refused at level 2 (the level comes first)', r.t2 === 'Needs level 3', r.t2);
  check("another class's talent and unknown ids are refused", /talent of the mage/i.test(r.other) && r.unknown === 'No such talent', JSON.stringify([r.other, r.unknown]));
  check('a tier-1 talent is learnt at level 2 and costs the point', r.ok1 === null && r.afterOk1.points === 0 && r.afterOk1.talents.join() === 'kn_boss' && r.afterOk1.rev === 1, JSON.stringify(r.afterOk1));
  check('a talent can only be learnt once', r.again === 'Already learnt', r.again);
  check('no free point, no talent', r.noPoints === 'No talent points left', r.noPoints);
  check('level 3 gives a second point', r.l3.points === 1, JSON.stringify(r.l3));
  check('the parent must be learnt first (and says which)', r.noParent === 'Needs Tempered Plate', r.noParent);
  check('tier 3 needs level 4', r.tier3 === 'Needs level 4', r.tier3);
  check('a tier-2 talent with its parent at level 3 works', r.rattle === null && r.afterRattle.points === 0 && r.afterRattle.talents.join() === 'kn_boss,kn_rattle', JSON.stringify(r.afterRattle));
  check('level 5 has four points in all', r.l5.points === 2 && r.afterRattle.talents.length === 2, JSON.stringify(r.l5));
  check('the capstone needs the talent above it', r.cap === 'Needs Phalanx', r.cap);
  check('tier 3 at level 5 once its parent is learnt', r.ram === null && r.afterRam.points === 1, JSON.stringify(r.afterRam));
  check('respec is refused away from your castle and keeps the talents', r.respecAway === 'Only at your own castle' && r.afterAway.talents === 3, JSON.stringify([r.respecAway, r.afterAway]));
  check('respec at home gives every point back and the stats follow', r.respecHome === null && r.afterHome.talents === 0 && r.afterHome.points === 4 && Math.abs(r.afterHome.mods - 1.3 * 1.28) < 1e-6 && r.afterHome.rev > 3, JSON.stringify(r.afterHome));
  check('respec with nothing to give back says so', /no talents/.test(r.respecNone), r.respecNone);
  check('a class change clears the talents (the points come back with the level)', r.preChange === 1 && r.afterChange.talents === 0 && r.afterChange.points === 4 && r.afterChange.cls === 'mage', JSON.stringify(r.afterChange));
  check('after a class change only the new class talents can be learnt', r.mageLearn === null && /talent of the knight/i.test(r.oldClass), JSON.stringify([r.mageLearn, r.oldClass]));

  // death does not take talents away
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.setClass('knight'); p.setLevel(3);
    g.learnTalent(p, 'kn_plate'); g.learnTalent(p, 'kn_hold');
    const before = Object.keys(p.talents).join();
    p.takeDamage(99999, null, {});
    return { dead: !p.alive, before };
  });
  await L.step(page, 40);
  r = await page.evaluate((prev) => {
    const p = window.__game.player;
    return { alive: p.alive, talents: Object.keys(p.talents).join(), prev: prev.before, points: p.talentPoints, maxHp: p.maxHp };
  }, r);
  check('talents survive death and respawn', r.alive && r.talents === r.prev && r.points === 0, JSON.stringify(r));

  // ---------------------------------------------------------------- what every talent does
  const fx = await page.evaluate(async () => {
    const g = window.__game, p = g.player;
    const T = await import('/src/talents.js');
    const V3 = g.camera.position.constructor;
    g.phaseT = 1e6;
    const home = new V3(-48, 0, -64);   // open ground away from the castles
    const f1 = g.factions[1];
    const dummies = [], friends = [];
    const dir0 = new V3(0, 0, 1);
    const cam = () => p.camera.position.clone();
    const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
    const refresh = () => g.update(0.001);
    const at = (dx, dz) => g.physics.groundHeight(home.x + dx, home.z + dz, 20);
    const place = (type, dx, dz) => {
      const u = g.recruit(f1, type);
      u.pos.set(home.x + dx, at(dx, dz), home.z + dz);
      u.homeCastle = g.castles[0];
      u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 };
      u.attackTimer = 99;
      u.update = function () {};      // a target dummy: stays where it is and nothing wears off
      u.hp = u.maxHp = 400;
      dummies.push(u);
      return u;
    };
    const friend = (dx, dz, hp) => {
      const a = g.recruit(g.factions[0], 'swordsman');
      a.pos.set(home.x + dx, at(dx, dz), home.z + dz);
      a.update = function () {};
      a.maxHp = 100; a.hp = hp;
      friends.push(a);
      return a;
    };
    const reset = (cls, ids) => {
      for (const u of dummies.concat(friends)) { u.alive = false; u.mesh.visible = false; }
      dummies.length = 0; friends.length = 0;
      g.units = g.units.filter((u) => u.alive || u.isHero);
      p.setClass(cls);
      p.setLevel(5);
      for (const id of ids) { const why = g.learnTalent(p, id); if (why) throw new Error(`learn ${id}: ${why}`); }
      p.alive = true; p.hp = p.maxHp;
      p.pos.set(home.x, at(0, 0), home.z);
      p.yaw = 0; p.pitch = 0;
      p.camera.position.set(p.pos.x, p.pos.y + 1.68, p.pos.z);
      p.buffs.clear(); p.abilCd = { q: 0, r: 0 }; p.staggerT = 0; p.dash = null; p.mounted = false; p.lastHurt = -99;
      g.input.endFrame(); p.aim.x = p.aim.y = 0;   // a still mouse: leftover movement would turn the hero away from the dummies
      g.projectiles.list.length = 0;
      g.abilities.active.length = 0; g.abilities.burning.length = 0;
    };
    const lost = (u) => Math.round(u.maxHp - u.hp);

    const probes = {
      stats: (cls, ids) => {
        reset(cls, ids);
        const o = { mods: { ...p.mods }, maxHp: p.maxHp, armor: p.armor, speed: p.speedMult, draw: p.drawTime };
        p.hp = p.maxHp * 0.4; o.low = p.dmgMult; p.hp = 100; p.lastHurt = -99;
        step(60); o.regen = p.hp - 100;
        if (p.hasHorse) {   // mounted: the horse takes half the blows, the rider takes his share of the rest
          p.mounted = true; p.horseHp = 320; p.hp = p.maxHp;
          p.takeDamage(100, null, {});
          o.rider = p.maxHp - p.hp;
          p.mounted = false;
        }
        return o;
      },
      bash: (cls, ids) => {
        reset(cls, ids);
        const a = place('swordsman', 0, 3), edge = place('swordsman', 0, 7);
        refresh();
        g.abilities.use(p, 'q', cam(), dir0);
        return { loss: lost(a), stun: +a.staggerT.toFixed(2), edge: lost(edge), cd: p.abilCd.q };
      },
      bulwark: (cls, ids) => {
        reset(cls, ids);
        const near = friend(5, 0, 100), mid = friend(10, 0, 100), far = friend(13, 0, 100);
        const foe = place('swordsman', 0, 3);
        refresh();
        g.abilities.use(p, 'r', cam(), dir0);
        const o = { time: p.buffs.time('guard'), near: near.guardT, nearMul: near.guardMul, mid: mid.guardT, far: far.guardT };
        const hp0 = foe.hp;
        p.takeDamage(40, foe, { melee: true });
        o.reflected = Math.round(hp0 - foe.hp);
        return o;
      },
      whirl: (cls, ids) => {
        reset(cls, ids);
        const near = place('swordsman', 2, 0), edge = place('swordsman', 4.9, 0);
        p.hp = p.maxHp * 0.6;
        refresh();
        const hp0 = p.hp;
        g.abilities.use(p, 'q', cam(), dir0);
        const o = { speed: +p.speedMult.toFixed(3), cd: p.abilCd.q };
        step(50);
        o.loss = lost(near); o.edge = lost(edge); o.healed = Math.round(p.hp - hp0);
        return o;
      },
      rage: (cls, ids) => {
        reset(cls, ids);
        const d = place('swordsman', 0, 3);
        p.hp = p.maxHp * 0.5;
        g.abilities.use(p, 'r', cam(), dir0);
        const o = { time: p.buffs.time('rage'), dmg: p.buffs.get('rage'), steal: p.buffs.get('lifesteal') };
        const h1 = p.hp;
        g.damage(d, 80, p, { melee: true });
        o.hit = +(p.hp - h1).toFixed(1);
        return o;
      },
      volley: (cls, ids) => {
        reset(cls, ids);
        const c = new V3(home.x, 0, home.z + 30); c.y = at(0, 30);
        const ring = [];
        for (let i = 0; i < 8; i++) ring.push(place('swordsman', Math.cos(i * Math.PI / 4) * 7, 30 + Math.sin(i * Math.PI / 4) * 7));
        const mid = place('swordsman', 0, 30);
        refresh();
        let launched = 0;
        const fa = g.projectiles.fireArrow.bind(g.projectiles);
        g.projectiles.fireArrow = (from, vel, team, dmg, owner, big) => { if (owner === p && big) launched++; return fa(from, vel, team, dmg, owner, big); };   // (only the volley's own arrows: the castles' archers shoot at the dummies too)
        g.abilities.use(p, 'q', cam(), dir0, c);
        const rain = g.abilities.active.filter((e) => e.kind === 'rain');
        const o = { radius: rain[0].radius, waves: rain.length };
        step(120);
        g.projectiles.fireArrow = fa;
        o.arrows = launched; o.edge = ring.reduce((s, u) => s + lost(u), 0); o.slow = mid.slowT;
        return o;
      },
      roll: (cls, ids) => {
        reset(cls, ids);
        const o = {};
        o.first = g.abilities.use(p, 'r', cam(), dir0);
        o.cd1 = p.abilCd.r; o.twin = p.buffs.has('twin'); o.focus = p.buffs.has('focus'); o.draw = p.drawTime;
        step(18);
        o.second = g.abilities.use(p, 'r', cam(), dir0);
        o.cd2 = p.abilCd.r;
        step(2);
        o.third = g.abilities.use(p, 'r', cam(), dir0);
        p.arrows = 30;
        p.fireFrom(cam(), dir0.clone(), 1);
        o.arrowDmg = +g.projectiles.list[g.projectiles.list.length - 1].dmg.toFixed(1);
        o.focusLeft = p.buffs.has('focus');
        return o;
      },
      fire: (cls, ids) => {
        reset(cls, ids);
        const front = place('swordsman', 0, 20), side = place('swordsman', 5, 20);
        refresh();
        g.abilities.use(p, 'q', cam(), dir0);
        const balls = g.projectiles.list.filter((x) => x.kind === 'fireball');
        const o = { balls: balls.length, radius: balls[0].radius, dmgs: balls.map((x) => +x.dmg.toFixed(2)) };
        step(30);
        o.front = lost(front); o.side = lost(side);
        const hp1 = front.hp;
        step(100);
        o.burn = Math.round(hp1 - front.hp);
        return o;
      },
      ward: (cls, ids) => {
        reset(cls, ids);
        const near = place('swordsman', 0, 2), mid = place('swordsman', 8, 0);
        refresh();
        g.abilities.use(p, 'r', cam(), dir0);
        const o = { absorb: p.buffs.get('ward'), time: p.buffs.time('ward'), nearStun: +near.staggerT.toFixed(2), midSlow: mid.slowT, nearSlow: near.slowT, nearLoss: lost(near) };
        p.takeDamage(p.buffs.get('ward') + 30, null, {});
        o.shatter = lost(near) - o.nearLoss;
        o.ward = p.buffs.has('ward');
        return o;
      },
      smite: (cls, ids) => {
        reset(cls, ids);
        const front = place('swordsman', 0, 15), side = place('swordsman', 4.4, 15), far = place('swordsman', 7, 15);
        refresh();
        g.abilities.use(p, 'q', cam(), dir0);
        return { front: lost(front), side: lost(side), chain: lost(far), stun: +front.staggerT.toFixed(2), cd: p.abilCd.q, bolts: g.magic.bolts.length };
      },
      heal: (cls, ids) => {
        reset(cls, ids);
        const near = friend(5, 0, 10), far = friend(16, 0, 10);
        refresh();
        p.hp = 50; p.lastHurt = g.time;
        g.abilities.use(p, 'r', cam(), dir0);
        const o = { self: Math.round(p.hp - 50), near: Math.round(near.hp - 10), far: Math.round(far.hp - 10), guard: p.buffs.get('guard'), nearGuard: near.guardMul, nearGuardT: near.guardT };
        const hp1 = p.hp;
        step(100);
        o.second = Math.round(p.hp - hp1);
        return o;
      },
      charge: (cls, ids) => {
        reset(cls, ids);
        const front = place('swordsman', 0, 2), side = place('swordsman', 2.7, 1.2);
        const near = friend(10, 0, 100), far = friend(25, 0, 100);
        refresh();
        p.useAbility('q', g.input);
        const o = { dash: p.dash ? +p.dash.t.toFixed(3) : 0, dur: +g.abilities.active.find((e) => e.kind === 'charge').dur.toFixed(3), near: near.hasteT, nearMul: near.hasteMul, far: far.hasteT };
        step(3);
        o.front = lost(front); o.side = lost(side);
        return o;
      },
      rally: (cls, ids) => {
        reset(cls, ids);
        const near = friend(10, 0, 100), far = friend(33, 0, 100);
        refresh();
        g.abilities.use(p, 'r', cam(), dir0);
        return { near: near.guardT, nearMul: near.guardMul, far: far.guardT, self: p.buffs.get('guard'), selfT: p.buffs.time('guard') };
      },
    };
    const cache = new Map();
    const run = (name, id, withIt) => {
      const anc = [];
      for (let t = T.TALENT_BY_ID[id]; t && t.needs; t = T.TALENT_BY_ID[t.needs]) anc.unshift(t.needs);
      const ids = withIt ? anc.concat(id) : anc;
      const key = `${name}|${T.TALENT_BY_ID[id].cls}|${ids.join()}`;
      if (!cache.has(key)) cache.set(key, probes[name](T.TALENT_BY_ID[id].cls, ids));
      return cache.get(key);
    };
    const near = (x, y, tol = 0.02) => Math.abs(x - y) <= tol;
    const ratio = (x, y) => (y ? x / y : Infinity);
    // id: [probe, check(a, b), what it should do]   a: without the talent (with the ones above it), b: with it
    const table = {
      kn_boss: ['bash', (a, b) => ratio(b.loss, a.loss) > 1.15 && ratio(b.loss, a.loss) < 1.4, 'Shield Bash damage +25%'],
      kn_rattle: ['bash', (a, b) => near(b.stun - a.stun, 0.8, 0.05), 'stuns 0.8 s longer'],
      kn_ram: ['bash', (a, b) => a.edge === 0 && b.edge > 0 && near(ratio(b.cd, a.cd), 0.75, 0.01), 'sweeps wider (reaches a foe the plain bash misses) and recharges 25% sooner'],
      kn_plate: ['stats', (a, b) => near(ratio(b.maxHp, a.maxHp), 1.12, 0.01) && near(b.armor - a.armor, 2, 0.001) && near(b.mods.hp / a.mods.hp, 1.12, 0.001), '+12% health, +2 armour'],
      kn_hold: ['bulwark', (a, b) => near(b.time - a.time, 2, 0.05), 'Bulwark 2 s longer'],
      kn_phalanx: ['bulwark', (a, b) => a.mid === 0 && b.mid > 0 && near(a.nearMul, 0.6, 0.001) && near(b.nearMul, 0.5, 0.001) && b.far === 0, 'allies 10 m away covered (not 13 m), allies take 50% less instead of 40%'],
      kn_avenge: ['bulwark', (a, b) => a.reflected === 0 && b.reflected > 8, 'a melee blow is dealt back while Bulwark stands'],
      bz_cyclone: ['whirl', (a, b) => a.edge === 0 && b.edge > 0, 'Whirlwind reaches a foe at 4.9 m'],
      bz_storm: ['whirl', (a, b) => ratio(b.loss, a.loss) > 1.2 && ratio(b.loss, a.loss) < 1.5, 'a fourth strike (+33% damage)'],
      bz_dervish: ['whirl', (a, b) => b.speed > a.speed * 1.3 && near(ratio(b.cd, a.cd), 0.8, 0.01), 'no slow while whirling, 20% quicker'],
      bz_reaper: ['whirl', (a, b) => b.healed - a.healed > 20, 'each foe hit heals'],
      bz_thirst: ['rage', (a, b) => b.hit > a.hit * 1.3 && b.hit < a.hit * 1.5, 'Blood Rage heals 40% more of the damage dealt'],
      bz_scars: ['stats', (a, b) => near(b.mods.bloodied - a.mods.bloodied, 0.1, 0.001) && b.low > a.low * 1.05 && near(ratio(b.maxHp, a.maxHp), 1.1, 0.01), '+10% health, +10% damage below half health'],
      bz_endless: ['rage', (a, b) => near(b.time - a.time, 3, 0.05) && near(b.dmg - a.dmg, 0.1, 0.001), 'Blood Rage 3 s longer, hits 10% harder'],
      rg_wide: ['volley', (a, b) => near(ratio(b.radius, a.radius), 1.15, 0.001) && b.edge > a.edge * 2 + 20, 'a wider circle catches the foes at its edge'],
      rg_hail: ['volley', (a, b) => b.arrows - a.arrows === 5, '5 more arrows'],
      rg_pin: ['volley', (a, b) => a.slow === 0 && b.slow > 1.5, 'foes in the circle are slowed'],
      rg_wave: ['volley', (a, b) => b.arrows - a.arrows === 8 && b.waves === 2 && a.waves === 1, 'a second wave of 8 arrows'],
      rg_light: ['stats', (a, b) => near(ratio(b.speed, a.speed), 1.06, 0.001) && near(ratio(b.draw, a.draw), 0.9, 0.001), '+6% speed, bow draws 10% faster'],
      rg_twin: ['roll', (a, b) => a.first && !a.second && b.first && b.twin && b.second && !b.third && near(b.cd2, b.cd1 - 0.6, 0.2), 'a second roll within the window (and no third), the cooldown runs on'],
      rg_focus: ['roll', (a, b) => !a.focus && b.focus && b.draw < a.draw * 0.5 && ratio(b.arrowDmg, a.arrowDmg) > 1.35 && !b.focusLeft, 'after a roll the next arrow draws at once and hits 40% harder, once'],
      mg_blast: ['fire', (a, b) => near(ratio(b.radius, a.radius), 1.2, 0.001) && a.side === 0 && b.side > 0, 'bigger explosions reach a foe 5 m away'],
      mg_sear: ['fire', (a, b) => a.burn === 0 && b.burn > 20, 'foes burn on after the blast'],
      mg_fork: ['fire', (a, b) => a.balls === 1 && b.balls === 2 && near(b.dmgs[1] / b.dmgs[0], 0.5, 0.001), 'a second fireball at half strength'],
      mg_robes: ['stats', (a, b) => near(ratio(b.maxHp, a.maxHp), 1.15, 0.01) && near(b.armor - a.armor, 1, 0.001), '+15% health, +1 armour'],
      mg_rime: ['ward', (a, b) => near(ratio(b.absorb, a.absorb), 1.25, 0.001) && near(b.time - a.time, 2, 0.05), 'the ward soaks 25% more and lasts 2 s longer'],
      mg_glacier: ['ward', (a, b) => a.midSlow === 0 && b.midSlow > 0 && near(b.nearStun - a.nearStun, 0.5, 0.05), 'the chill reaches a foe 8 m away, staggers 0.5 s longer'],
      mg_shatter: ['ward', (a, b) => a.shatter === 0 && b.shatter > 60 && !b.ward, 'a broken ward bursts and hurts the foes around'],
      cl_wrath: ['smite', (a, b) => a.side === 0 && b.side > 0, 'Smite reaches a foe 4.4 m from the impact'],
      cl_chain: ['smite', (a, b) => a.chain === 0 && b.chain > 20 && b.chain < b.front * 0.7 && b.bolts > a.bolts, 'the bolt arcs on to a foe 7 m away for about half'],
      cl_judge: ['smite', (a, b) => near(b.stun - a.stun, 0.8, 0.05) && near(ratio(b.cd, a.cd), 0.8, 0.01), 'staggers 0.8 s longer, recharges 20% sooner'],
      cl_grace: ['stats', (a, b) => near(ratio(b.maxHp, a.maxHp), 1.1, 0.01) && near(ratio(b.regen, a.regen), 1.4, 0.05), '+10% health, regeneration 40% faster'],
      cl_radiance: ['heal', (a, b) => near(ratio(b.self, a.self), 1.25, 0.01) && a.far === 0 && b.far > 0, 'heals 25% more and reaches an ally 16 m away'],
      cl_aegis: ['heal', (a, b) => a.guard === 0 && near(b.guard, 0.75, 0.001) && near(b.nearGuard, 0.75, 0.001) && b.nearGuardT > 4.5, 'the healed take 25% less damage for 5 s'],
      cl_bloom: ['heal', (a, b) => a.second < 20 && b.second > 40, 'a second, weaker pulse after 3 s'],
      cv_lance: ['charge', (a, b) => ratio(b.front, a.front) > 1.15 && ratio(b.front, a.front) < 1.3, 'Lance Charge damage +20%'],
      cv_sweep: ['charge', (a, b) => a.side === 0 && b.side > 0, 'a wider path catches a foe at its side'],
      cv_thunder: ['charge', (a, b) => near(ratio(b.dash, a.dash), 1.3, 0.001) && near(ratio(b.dur, a.dur), 1.3, 0.001), 'the charge lasts 30% longer'],
      cv_vanguard: ['charge', (a, b) => a.near === 0 && b.near === 5 && b.nearMul === 1.25 && b.far === 0, 'allies within 20 m are hasted for 5 s'],
      cv_barding: ['stats', (a, b) => near(ratio(b.mods.rider, a.mods.rider), 0.88, 0.001) && near(ratio(b.mods.trample, a.mods.trample), 1.15, 0.001) && b.rider < a.rider * 0.95, 'the horse shields better and tramples harder'],
      cv_horn: ['rally', (a, b) => a.far === 0 && b.far > 0 && near(b.near - a.near, 3, 0.05), 'Rally Cry reaches an ally 33 m away and lasts 3 s longer'],
      cv_banner: ['rally', (a, b) => near(a.nearMul, 0.7, 0.001) && near(b.nearMul, 0.6, 0.001) && near(a.self, 0.6, 0.001) && near(b.self, 0.5, 0.001), 'allies 40% less damage, you 50%'],
    };
    const results = [];
    for (const t of T.TALENTS) {
      const row = table[t.id];
      if (!row) { results.push({ id: t.id, ok: false, say: 'NO TEST', a: null, b: null }); continue; }
      let ok = false, a = null, b = null;
      try { a = run(row[0], t.id, false); b = run(row[0], t.id, true); ok = !!row[1](a, b); } catch (e) { a = String(e && e.stack || e); }
      results.push({ id: t.id, ok, say: row[2], a, b });
    }
    // leave the world as we found it
    for (const u of dummies.concat(friends)) { u.alive = false; u.mesh.visible = false; }
    g.units = g.units.filter((u) => u.alive || u.isHero);
    p.setClass('knight');
    return results;
  });
  for (const e of fx) check(`${e.id}: ${e.say}`, e.ok, e.ok ? '' : `\n      without: ${JSON.stringify(e.a)}\n      with:    ${JSON.stringify(e.b)}`);
  check('every talent id was verified', fx.length === 42 && fx.every((e) => e.say !== 'NO TEST'), String(fx.length));

  // ---------------------------------------------------------------- the Talents tab, key N, the hint
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player, ui = g.ui;
    const out = {};
    const home = g.castles[0].spawnPoint.clone();
    p.pos.copy(home); p.pos.y = g.physics.groundHeight(home.x, home.z, home.y + 3);
    p.alive = true;
    p.setClass('mage'); p.setLevel(1);
    ui.update(0.2);
    out.hint1 = document.getElementById('talentHint').classList.contains('hidden');
    p.setLevel(3);
    ui.update(0.2);
    const hint = document.getElementById('talentHint');
    out.hint3 = { hidden: hint.classList.contains('hidden'), text: hint.textContent.replace(/\s+/g, ' ').trim(), n: document.getElementById('talentN').textContent };
    out.tabBtn = [...document.querySelectorAll('#shop .tabs button')].map((b) => b.dataset.tab + (b.disabled ? '!' : '')).join();

    // N opens the shop on the Talents tab
    g.input.pressed.add('KeyN');
    g.update(0.05);
    g.input.endFrame();
    out.nOpen = { open: ui.shopOpen, tab: ui.tab };
    ui.update(0.2);
    out.hintOpen = document.getElementById('talentHint').classList.contains('hidden');   // hidden while the shop is up

    const node = (id) => document.querySelector(`.tnode[data-talent="${id}"]`);
    const state = (id) => { const n = node(id); return { c: ['learned', 'available', 'locked', 'afford', 'linked'].filter((k) => n.classList.contains(k)).join(' '), t: n.querySelector('.ts').textContent }; };
    out.title = document.getElementById('shopTitle').textContent;
    out.active = document.querySelector('#shop .tabs button.active').dataset.tab;
    out.nodes = document.querySelectorAll('.tnode').length;
    out.head = document.querySelector('.tal-head h5').textContent;
    out.cols = [...document.querySelectorAll('.tal-col')].map((e) => e.textContent.trim().replace(/\s+/g, ' '));
    out.rows = [...document.querySelectorAll('.tal-lv')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
    out.pts = document.querySelector('.tal-pts').textContent;
    out.capCol = node('mg_shatter').style.gridColumn === node('mg_glacier').style.gridColumn && node('mg_shatter').style.gridRow === '5';
    out.before = { blast: state('mg_blast'), sear: state('mg_sear'), fork: state('mg_fork'), robes: state('mg_robes'), rime: state('mg_rime'), shatter: state('mg_shatter') };
    // click learns
    node('mg_blast').click();
    out.afterBlast = { blast: state('mg_blast'), sear: state('mg_sear'), learnt: Object.keys(p.talents), pts: document.querySelector('.tal-pts').textContent, toast: document.querySelector('#toasts .toast')?.textContent };
    node('mg_sear').click();
    out.afterSear = { points: p.talentPoints, fork: state('mg_fork'), robes: state('mg_robes'), pts: document.querySelector('.tal-pts').textContent };
    // no points left: refused with the reason
    node('mg_robes').click();
    out.noPoints = { learnt: Object.keys(p.talents).join(), toast: document.querySelector('#toasts .toast')?.textContent, shaking: node('mg_robes').classList.contains('nope') };
    // locked ones refuse too
    p.setLevel(5);
    ui.refreshShop();
    node('mg_glacier').click();
    out.lockedClick = { learnt: Object.keys(p.talents).join(), toast: document.querySelector('#toasts .toast')?.textContent };
    out.lvlShown = document.querySelector('.tal-pts').textContent;
    // the learnt icons beside the ability icons
    ui.toggleShop(false);
    ui.update(0.2);
    out.pips = { q: document.querySelector('#abilQ .tpips').textContent, r: document.querySelector('#abilR .tpips').textContent, title: document.querySelector('#abilQ .tpips').title };
    out.hintAfter = document.getElementById('talentHint').classList.contains('hidden');
    return out;
  });
  check('the hint is hidden without a talent point', r.hint1 === true);
  check('"Talent point available (N)" shows with points to spend', r.hint3.hidden === false && /Talent point available \(2\)/.test(r.hint3.text) && r.hint3.n === '2', JSON.stringify(r.hint3));
  check('the Talents tab sits beside Class, Items is still greyed out', /class,talents,castle,items!,siege/.test(r.tabBtn), r.tabBtn);
  check('key N opens the shop on the Talents tab', r.nOpen.open && r.nOpen.tab === 'talents' && r.title === 'Talents' && r.active === 'talents', JSON.stringify(r.nOpen));
  check('the hint steps aside while the shop is open', r.hintOpen === true);
  check('the tab draws the class tree: 7 nodes, two branches named after the abilities, four rows', r.nodes === 7 && /Fireball/.test(r.cols[0]) && /Frost Ward/.test(r.cols[1]) && r.rows.length === 4 && /Mage/.test(r.head), JSON.stringify([r.nodes, r.cols, r.rows, r.head]));
  check('the capstone sits under its parent in the fourth row', r.capCol);
  check('points are shown', /Level 3 · 2 points to spend/.test(r.pts), r.pts);
  check('states before learning: tier 1 available (green), tier 2 locked by the parent, tier 3 by the level',
    r.before.blast.c === 'available afford' && r.before.blast.t === 'Click to learn' && r.before.sear.c === 'locked' && r.before.fork.c === 'locked', JSON.stringify(r.before));
  check('locked reasons: the talent above it, or the level', r.before.sear.t === 'Needs Greater Blast' && r.before.fork.t === 'Needs level 4' && r.before.rime.t === 'Needs Warded Robes' && r.before.shatter.t === 'Needs level 5', JSON.stringify(r.before));
  check('clicking a node learns it; the next tier unlocks and the line to it lights up', r.afterBlast.blast.c.includes('learned') && r.afterBlast.sear.c.includes('available') && r.afterBlast.sear.c.includes('afford') && r.afterBlast.sear.c.includes('linked') && r.afterBlast.learnt.join() === 'mg_blast' && /Talent learnt: Greater Blast/.test(r.afterBlast.toast) && /1 point to spend/.test(r.afterBlast.pts), JSON.stringify(r.afterBlast));
  check('the second click spends the second point; with none left the rest read "No talent points left"', r.afterSear.points === 0 && r.afterSear.robes.t === 'No talent points left' && !r.afterSear.robes.c.includes('afford') && /0 points/.test(r.afterSear.pts), JSON.stringify(r.afterSear));
  check('a click with no points is refused with a toast', r.noPoints.learnt === 'mg_blast,mg_sear' && /No talent points left/.test(r.noPoints.toast) && r.noPoints.shaking, JSON.stringify(r.noPoints));
  check('a locked node refuses (and says why)', r.lockedClick.learnt === 'mg_blast,mg_sear' && /Needs Rime Shell/.test(r.lockedClick.toast), JSON.stringify(r.lockedClick));
  check('the level shown follows the hero', /Level 5 · 2 points to spend/.test(r.lvlShown), r.lvlShown);
  check('learnt talents show beside the ability they belong to', r.pips.q === '💥🔥' && r.pips.r === '' && /Greater Blast/.test(r.pips.title), JSON.stringify(r.pips));
  check('the hint comes back when the shop closes while points are left', r.hintAfter === false);

  // key N toggles; also with the shop open on another tab (the game loop is frozen then, so the page's key handler does it)
  r = await page.evaluate(() => {
    const g = window.__game, ui = g.ui;
    const out = {};
    const press = () => {   // a key press as the page sees it, then one frame of the game loop
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', key: 'n', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyN', key: 'n', bubbles: true }));
      g.update(0.05); g.input.endFrame();
    };
    ui.tab = 'army'; ui.toggleShop(true);
    press();
    out.fromArmy = { open: ui.shopOpen, tab: ui.tab };
    press();
    out.second = { open: ui.shopOpen };
    press();
    out.third = { open: ui.shopOpen, tab: ui.tab };
    ui.toggleShop(false);
    // B still toggles, and reopens where it was
    g.input.pressed.add('KeyB'); g.update(0.05); g.input.endFrame();
    out.b = { open: ui.shopOpen, tab: ui.tab };
    ui.toggleShop(false);
    return out;
  });
  check('N on another tab switches to Talents, N again closes the shop, N opens it again', r.fromArmy.open && r.fromArmy.tab === 'talents' && r.second.open === false && r.third.open && r.third.tab === 'talents', JSON.stringify(r));
  check('B still opens the shop where it was left', r.b.open && r.b.tab === 'talents');

  // Respec from the tab
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player, ui = g.ui;
    const out = {};
    const home = g.castles[0].spawnPoint.clone();
    ui.tab = 'talents'; ui.toggleShop(true);
    const btn = () => document.querySelector('.tal-wrap .respec');
    out.homeOk = { unavailable: btn().classList.contains('unavailable'), title: btn().title, learnt: Object.keys(p.talents).join() };
    p.pos.set(0, g.physics.terrainHeight(0, 0), 0);
    ui.refreshShop();
    out.away = { unavailable: btn().classList.contains('unavailable'), title: btn().title };
    btn().click();
    out.awayClick = { learnt: Object.keys(p.talents).join(), toast: document.querySelector('#toasts .toast')?.textContent };
    p.pos.copy(home); p.pos.y = g.physics.groundHeight(home.x, home.z, home.y + 3);
    ui.refreshShop();
    btn().click();
    out.homeClick = { learnt: Object.keys(p.talents).length, points: p.talentPoints, toast: document.querySelector('#toasts .toast')?.textContent, nodes: [...document.querySelectorAll('.tnode.learned')].length, pts: document.querySelector('.tal-pts').textContent };
    ui.toggleShop(false);
    // a class change while the tab is open (or between visits) gives the new class's tree
    p.setClass('ranger');
    ui.tab = 'talents'; ui.toggleShop(true);
    out.ranger = { head: document.querySelector('.tal-head h5').textContent, ids: [...document.querySelectorAll('.tnode')].map((n) => n.dataset.talent).join() };
    p.setClass('cleric');
    ui.refreshShop();
    out.cleric = { head: document.querySelector('.tal-head h5').textContent, nodes: document.querySelectorAll('.tnode').length };
    ui.toggleShop(false);
    return out;
  });
  check('the Respec button is live at your castle and says why it is not elsewhere', r.homeOk.unavailable === false && r.away.unavailable === true && r.away.title === 'Only at your own castle', JSON.stringify([r.homeOk, r.away]));
  check('Respec away from home is refused with a toast and keeps the talents', r.awayClick.learnt === 'mg_blast,mg_sear' && /Only at your own castle/.test(r.awayClick.toast), JSON.stringify(r.awayClick));
  check('Respec at home gives everything back', r.homeClick.learnt === 0 && r.homeClick.points === 4 && r.homeClick.nodes === 0 && /Level 5 · 4 points/.test(r.homeClick.pts) && /given back/.test(r.homeClick.toast), JSON.stringify(r.homeClick));
  check('the tab follows a class change (Ranger, then Cleric while it is open)', /Ranger/.test(r.ranger.head) && r.ranger.ids.startsWith('rg_') && /Cleric/.test(r.cleric.head) && r.cleric.nodes === 7, JSON.stringify([r.ranger, r.cleric]));

  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
