// Every class ability against dummy enemies.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const out = await page.evaluate(async () => {
    const g = window.__game, p = g.player;
    const V3 = g.camera.position.constructor;
    const res = {};
    const log = (k, v) => { res[k] = v; };
    // an open patch of ground away from the castles: the map centre is stones, so use a spot to the side
    const home = new V3(-48, 0, -64);
    const f1 = g.factions[1];
    const dummies = [];
    const place = (type, dx, dz) => {
      const u = g.recruit(f1, type);
      u.pos.set(home.x + dx, g.physics.groundHeight(home.x + dx, home.z + dz, 20), home.z + dz);
      u.homeCastle = g.castles[0];   // so it doesn't wander: defend order keeps it near a castle far away
      u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 };
      u.attackTimer = 99;           // can't strike back
      u.update = function (dt) { if (this.staggerT > 0) this.staggerT -= dt; };   // a target dummy: stays where it is
      u.hp = u.maxHp = 400;
      dummies.push(u);
      return u;
    };
    const reset = (cls) => {
      for (const u of dummies) { u.alive = false; u.mesh.visible = false; }
      dummies.length = 0;
      g.units = g.units.filter((u) => u.alive || u.isHero);
      p.setClass(cls);
      p.hp = p.maxHp;
      p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z);
      p.yaw = 0; p.pitch = 0; p.alive = true;
      p.camera.position.set(p.pos.x, p.pos.y + 1.68, p.pos.z);
      p.buffs.clear(); p.abilCd = { q: 0, r: 0 };
      g.projectiles.list.length = 0;
    };
    const refresh = () => { g.update(0.001); };
    const dir0 = new V3(0, 0, 1);
    const cam = () => p.camera.position.clone();
    const hpOf = (u) => Math.round(u.hp);

    // ---- Knight
    reset('knight');
    log('knight.maxHp', p.maxHp);
    const a = place('swordsman', 0, 3), b = place('swordsman', 1, 5), c = place('swordsman', 0, -3), d = place('swordsman', 0, 12);
    refresh();
    g.abilities.use(p, 'q', cam(), dir0);
    log('bash', { front: hpOf(a), front2: hpOf(b), behind: hpOf(c), far: hpOf(d), staggerFront: +a.staggerT.toFixed(2), cd: p.abilCd.q });
    p.buffs.clear();
    g.abilities.use(p, 'r', cam(), dir0);
    const hp0 = p.hp; p.takeDamage(100, null, {}); 
    log('bulwark', { guard: p.buffs.get('guard'), steady: p.buffs.has('steady'), taken: Math.round(hp0 - p.hp) });
    p.stagger(1); log('bulwark.noStagger', p.staggerT);
    log('bash.refused', g.abilities.use(p, 'q', cam(), dir0));

    // ---- Berserker
    reset('berserker');
    const w1 = place('swordsman', 2, 0), w2 = place('swordsman', -2, 2), w3 = place('swordsman', 0, -3), w4 = place('swordsman', 9, 0);
    refresh();
    g.abilities.use(p, 'q', cam(), dir0);
    for (let i = 0; i < 50; i++) g.update(1 / 30);   // 1.67 s: all three ticks
    log('whirl', { hits: [hpOf(w1), hpOf(w2), hpOf(w3)], far: hpOf(w4), ticksLeft: g.abilities.active.length });
    p.hp = 100;
    g.abilities.use(p, 'r', cam(), dir0);
    const afterRage = p.hp;
    g.damage(w1, 80, p, { melee: true });
    log('bloodrage', { healedOnCast: Math.round(afterRage - 100), healedOnHit: Math.round(p.hp - afterRage), rage: p.buffs.get('rage') });

    // ---- Ranger
    reset('ranger');
    log('ranger.maxHp', p.maxHp);
    let launched = 0;
    const fa = g.projectiles.fireArrow.bind(g.projectiles);
    g.projectiles.fireArrow = (...a) => { launched++; return fa(...a); };
    g.abilities.use(p, 'q', cam(), dir0);   // no circle placed: it falls where the crosshair meets the ground
    for (let i = 0; i < 60; i++) g.update(1 / 30);
    g.projectiles.fireArrow = fa;
    log('volley', { arrowsLaunched: launched, arrowsLeft: p.arrows, rain: g.abilities.active.filter((e) => e.kind === 'rain').length });
    g.abilities.use(p, 'r', cam(), dir0);
    const h1 = p.hp; p.takeDamage(200, null, {});
    log('evade', { ghost: p.buffs.has('ghost'), damageTaken: Math.round(h1 - p.hp) });

    // ---- Mage
    reset('mage');
    log('mage.maxHp', p.maxHp);
    const m1 = place('swordsman', 0, 20), m2 = place('swordsman', 2, 20);
    refresh();
    g.abilities.use(p, 'q', cam(), dir0);
    const balls = g.projectiles.list.filter((x) => x.kind === 'fireball').length;
    for (let i = 0; i < 90; i++) g.update(1 / 30);
    log('fireball', { launched: balls, hit: [hpOf(m1), hpOf(m2)] });
    p.buffs.clear(); 
    const m3 = place('swordsman', 3, 1); m3.slowT = 0; refresh();
    g.abilities.use(p, 'r', cam(), dir0);
    const h2 = p.hp; p.takeDamage(100, null, {});
    const after100 = p.hp; p.takeDamage(100, null, {});
    log('ward', { absorbed1: Math.round(h2 - after100), taken2: Math.round(after100 - p.hp), chilled: m3.slowT > 0 });

    // ---- Cleric
    reset('cleric');
    const c1 = place('swordsman', 0, 15), c2 = place('swordsman', 1.5, 16), c3 = place('swordsman', 12, 15);
    refresh();
    g.abilities.use(p, 'q', cam(), dir0);   // aims level: lands on whatever is first on the line, c1 or the ground
    log('smite', { hit: [hpOf(c1), hpOf(c2)], far: hpOf(c3), bolts: g.magic.bolts.length });
    p.hp = 50;
    const ally = g.recruit(g.factions[0], 'swordsman'); ally.pos.set(home.x + 3, p.pos.y, home.z); ally.hp = 10; refresh();
    g.abilities.use(p, 'r', cam(), dir0);
    log('heal', { self: Math.round(p.hp - 50), ally: Math.round(ally.hp - 10), allyMax: ally.maxHp });
    ally.alive = false;

    // ---- Cavalier
    reset('cavalier');
    log('cavalier', { horse: p.hasHorse, maxHp: p.maxHp });
    const v1 = place('swordsman', 0, 6), v2 = place('swordsman', 1, 11), v3 = place('swordsman', 0, 40);
    refresh();
    g.abilities.use(p, 'q', cam(), dir0);
    // the client would move the hero; do it here
    for (let i = 0; i < 40; i++) { p.pos.z += 14 / 30; p.pos.y = g.physics.groundHeight(p.pos.x, p.pos.z, 30); g.update(1 / 30); p.pos.z -= 0; }
    log('lancecharge', { hit: [hpOf(v1), hpOf(v2)], far: hpOf(v3), moved: Math.round(p.pos.z - home.z) });
    // rally: allies get guard + haste
    const al = g.recruit(g.factions[0], 'swordsman'); al.pos.set(p.pos.x + 5, p.pos.y, p.pos.z); refresh();
    g.abilities.use(p, 'r', cam(), dir0);
    log('rally', { guardT: +al.guardT.toFixed(1), guardMul: al.guardMul, hasteT: +al.hasteT.toFixed(1), self: p.buffs.get('guard') });
    al.alive = false;
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
