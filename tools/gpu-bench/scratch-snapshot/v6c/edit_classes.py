import sys
p = sys.argv[1]
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:70], s.count(old))
    s = s.replace(old, new)


# UP vector
rep("""const ZERO = new THREE.Vector3();
""", """const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
""")

# ---- Knight
rep("""    const dmg = p.meleeDmg * 2;
    this.eachFoe(p.team, c.x, c.z, 3.4, (o) => {
      if ((o.pos.x - p.pos.x) * f.x + (o.pos.z - p.pos.z) * f.z < -0.5) return;   // never behind you
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 1 });
      if (!o.alive) return;
      if (o.stagger) o.stagger(1.6, p);
      if (o.vel && !o.isPlayer) { o.vel.x += f.x * 10; o.vel.z += f.z * 10; }
    }, p.pos.y, 3);
    this.emit('bash', c, f);
  }

  bulwark(p) {
    p.buffs.add('guard', 5, 0.3);
    p.buffs.add('steady', 5);
    this.eachFriend(p.team, p.pos.x, p.pos.z, 8, (o) => { if (o !== p) this.guard(o, 5, 0.6); });
    this.emit('bulwark', p.pos, ZERO);
  }""", """    const dmg = p.meleeDmg * 2 * talentFx(p, 'bashDmg', 1);
    const reach = talentFx(p, 'bashReach', 1), stun = 1.6 + talentFx(p, 'bashStun', 0);
    this.eachFoe(p.team, c.x, c.z, 3.4 * reach, (o) => {
      if ((o.pos.x - p.pos.x) * f.x + (o.pos.z - p.pos.z) * f.z < -0.5) return;   // never behind you
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 1 });
      if (!o.alive) return;
      if (o.stagger) o.stagger(stun, p);
      if (o.vel && !o.isPlayer) { o.vel.x += f.x * 10; o.vel.z += f.z * 10; }
    }, p.pos.y, 3);
    this.emit('bash', c, f, null, reach);
  }

  bulwark(p) {
    const t = 5 + talentFx(p, 'bulwarkTime', 0), reach = 8 + talentFx(p, 'bulwarkRadius', 0);
    p.buffs.add('guard', t, 0.3);
    p.buffs.add('steady', t);
    const reflect = talentFx(p, 'reflect', 0);
    if (reflect) p.buffs.add('reflect', t, reflect);   // Avenging Wall (Knight talent): see Player.takeDamage
    this.eachFriend(p.team, p.pos.x, p.pos.z, reach, (o) => { if (o !== p) this.guard(o, t, 0.6 - talentFx(p, 'bulwarkAlly', 0)); });
    this.emit('bulwark', p.pos, ZERO, null, reach / 8);
  }""")

# ---- Berserker
rep("""  whirl(p) {
    p.buffs.add('whirl', 1.25);
    this.active.push({ kind: 'whirl', p, t: 0, n: 0, dur: 1.3 });
  }

  whirlTick(p, n) {
    const g = this.g;
    const dmg = p.meleeDmg * 0.85;
    this.eachFoe(p.team, p.pos.x, p.pos.z, 4.2, (o) => {
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 0.5 });
      if (o.alive && o.stagger) o.stagger(0.45, p);
    }, p.pos.y, 2.8);
    p.swingT = 0.25;
    p.attackDir = n % 2 ? 'left' : 'right';
    this.emit('whirl', p.pos, ZERO);
  }

  bloodrage(p) {
    p.buffs.add('lifesteal', 7, 0.5);
    p.buffs.add('steady', 7);
    p.buffs.add('rage', 7, 1.25);
    p.heal(p.maxHp * 0.1);
    this.emit('rage', p.pos, ZERO);
  }""", """  whirl(p) {
    p.buffs.add('whirl', 1.25);
    this.active.push({ kind: 'whirl', p, t: 0, n: 0, dur: 1.3, hits: 3 + talentFx(p, 'whirlHits', 0) });
  }

  whirlTick(p, n) {
    const g = this.g;
    const dmg = p.meleeDmg * 0.85, reach = talentFx(p, 'whirlRadius', 1);
    let foes = 0;
    this.eachFoe(p.team, p.pos.x, p.pos.z, 4.2 * reach, (o) => {
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 0.5 });
      if (o.alive && o.stagger) o.stagger(0.45, p);
      if (!o.isSiege) foes++;
    }, p.pos.y, 2.8);
    const reaper = talentFx(p, 'reaper', null);   // Reaper (Berserker talent): the blade drinks
    if (reaper && foes) p.heal(p.maxHp * reaper.heal * Math.min(foes, reaper.foes));
    p.swingT = 0.25;
    p.attackDir = n % 2 ? 'left' : 'right';
    this.emit('whirl', p.pos, ZERO, null, reach);
  }

  bloodrage(p) {
    const t = 7 + talentFx(p, 'rageTime', 0);
    p.buffs.add('lifesteal', t, 0.5 * talentFx(p, 'rageSteal', 1));
    p.buffs.add('steady', t);
    p.buffs.add('rage', t, 1.25 + talentFx(p, 'rageDmg', 0));
    p.heal(p.maxHp * 0.1);
    this.emit('rage', p.pos, ZERO);
  }""")

# ---- Ranger: volley
rep("""    const shots = [];
    for (let i = 0; i < V.arrows; i++) shots.push(V.delay + (i + Math.random()) * V.span / V.arrows);
    this.active.push({ kind: 'rain', p, t: 0, dur: V.delay + V.span + 0.2, c, f, shots, n: 0, picked: new Map(), dmg: p.bowDmg * V.dmg });
    this.emit('volley', cam, f, [c]);
  }""", """    const k = talentFx(p, 'volleyRadius', 1), slow = talentFx(p, 'volleySlow', 0), wave = talentFx(p, 'volleyWave', null);
    const flight = (arrows, t) => {
      const shots = [];
      for (let i = 0; i < arrows; i++) shots.push(V.delay + (i + Math.random()) * V.span / arrows);
      this.active.push({ kind: 'rain', p, t, dur: V.delay + V.span + 0.2, c, f, shots, n: 0, picked: new Map(), dmg: p.bowDmg * V.dmg, radius: V.radius * k, slow });
    };
    flight(V.arrows + talentFx(p, 'volleyArrows', 0), 0);
    if (wave) flight(wave.arrows, -wave.gap);   // Second Wave (Ranger talent): another flight, a moment later
    this.emit('volley', cam, f, [c], k);
  }""")

rep("""        this.eachFoe(e.p.team, e.c.x, e.c.z, V.radius, (f) => {
          const k = (e.picked.get(f) || 0) + Math.random() * 0.5;""", """        this.eachFoe(e.p.team, e.c.x, e.c.z, e.radius, (f) => {
          if (e.slow && f.slowT !== undefined) f.slowT = Math.max(f.slowT, e.slow);   // Pinning Fire (Ranger talent)
          const k = (e.picked.get(f) || 0) + Math.random() * 0.5;""")
rep("""        const a = Math.random() * Math.PI * 2, r = V.radius * Math.sqrt(Math.random());""", """        const a = Math.random() * Math.PI * 2, r = e.radius * Math.sqrt(Math.random());""")

# ---- Ranger: roll
rep("""  evade(p) {
    p.buffs.add('ghost', 0.85);
    this.emit('evade', p.pos, ZERO);
  }""", """  evade(p) {
    p.buffs.add('ghost', 0.85);
    const again = talentFx(p, 'rollAgain', 0);   // Twin Roll (Ranger talent): the first roll opens a window for a second
    if (again) { if (p.buffs.has('twin')) p.buffs.del('twin'); else p.buffs.add('twin', again); }
    const focus = talentFx(p, 'focus', null);   // Hunter's Focus: the next arrow is drawn at once and hits harder
    if (focus) p.buffs.add('focus', focus.time, focus.dmg);
    this.emit('evade', p.pos, ZERO);
  }""")

# ---- Mage
rep("""    const d = cam.clone().addScaledVector(dir, 40).sub(from).normalize();
    this.g.magic.fireball(p, from, d, s.dmg * p.mods.spell, s.radius);
    p.swingT = 0.25; p.attackDir = 'thrust';
  }

  ward(p) {
    p.buffs.add('ward', 8, 170);
    this.eachFoe(p.team, p.pos.x, p.pos.z, 6.5, (o) => {
      if (o.slowT !== undefined) o.slowT = Math.max(o.slowT, 3);
      if (o.stagger) o.stagger(0.5, p);
    }, p.pos.y, 3);
    this.emit('ward', p.pos, ZERO);
  }""", """    const d = cam.clone().addScaledVector(dir, 40).sub(from).normalize();
    const dmg = s.dmg * p.mods.spell, radius = s.radius * talentFx(p, 'fireRadius', 1);
    this.g.magic.fireball(p, from, d, dmg, radius);
    const fork = talentFx(p, 'fireFork', 0);   // Forked Flame (Mage talent): a second, weaker ball a little to the side
    if (fork) this.g.magic.fireball(p, from, d.clone().applyAxisAngle(UP, 0.12), dmg * fork, radius);
    p.swingT = 0.25; p.attackDir = 'thrust';
  }

  // Mage talent: the foes a fireball caught go on burning for a few seconds
  scorch(o, ball) {
    const burn = talentFx(ball.owner, 'burn', null);
    if (!burn || !o.alive) return;
    let b = this.burning.find((x) => x.o === o && x.p === ball.owner);
    if (!b) this.burning.push(b = { o, p: ball.owner });
    b.left = burn.time; b.every = b.tick = burn.tick;
    b.dmg = ball.dmg * burn.share * burn.tick / burn.time;   // the share of the blast that burns on, a little at a time
  }

  burn(dt) {
    const g = this.g;
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const b = this.burning[i];
      b.left -= dt; b.tick -= dt;
      if (!b.o.alive || b.left <= 0) { this.burning.splice(i, 1); continue; }
      if (b.tick > 0) continue;
      b.tick += b.every;
      const at = b.o.chest(new THREE.Vector3());
      g.fx.fireTrail(at);
      g.fx.sparks(at, 3);
      g.damage(b.o, b.dmg, b.p, { magic: true, splash: true });
    }
  }

  ward(p) {
    const reach = talentFx(p, 'wardRadius', 1), chill = 3 + talentFx(p, 'wardChill', 0), stun = 0.5 + talentFx(p, 'wardStun', 0);
    p.buffs.add('ward', 8 + talentFx(p, 'wardTime', 0), 170 * talentFx(p, 'wardAbsorb', 1));
    this.eachFoe(p.team, p.pos.x, p.pos.z, 6.5 * reach, (o) => {
      if (o.slowT !== undefined) o.slowT = Math.max(o.slowT, chill);
      if (o.stagger) o.stagger(stun, p);
    }, p.pos.y, 3);
    this.emit('ward', p.pos, ZERO, null, reach);
  }

  // Mage talent: a ward that is broken bursts, hurting, staggering and chilling the foes around the Mage
  shatter(p) {
    const s = talentFx(p, 'shatter', null);
    if (!s) return;
    const g = this.g, dmg = s.dmg * p.mods.spell;
    this.eachFoe(p.team, p.pos.x, p.pos.z, s.radius, (o) => {
      g.damage(o, dmg, p, { magic: true, splash: true });
      if (!o.alive) return;
      if (o.slowT !== undefined) o.slowT = Math.max(o.slowT, s.chill);
      if (o.stagger) o.stagger(s.stun, p);
    }, p.pos.y, 3);
    this.emit('shatter', p.pos, ZERO, null, s.radius / 6);
  }""")

# ---- Cleric
rep("""    const dmg = s.dmg * p.mods.spell;
    this.eachFoe(p.team, at.x, at.z, s.radius, (o, d) => {
      g.damage(o, dmg * (1 - 0.4 * Math.min(1, d / s.radius)), p, { magic: true, splash: true });
      if (o.alive && o.stagger) o.stagger(0.8, { pos: at });
    }, at.y, 4);""", """    const dmg = s.dmg * p.mods.spell;
    const reach = talentFx(p, 'smiteRadius', 1), radius = s.radius * reach, stun = 0.8 + talentFx(p, 'smiteStun', 0);
    const hit = new Set();
    this.eachFoe(p.team, at.x, at.z, radius, (o, d) => {
      g.damage(o, dmg * (1 - 0.4 * Math.min(1, d / radius)), p, { magic: true, splash: true });
      if (o.alive && o.stagger) o.stagger(stun, { pos: at });
      hit.add(o);
    }, at.y, 4);
    const chain = talentFx(p, 'smiteChain', null);
    if (chain) this.chainSmite(p, at, hit, dmg, chain);""")
rep("""    p.swingT = 0.25; p.attackDir = 'over';
    this.emit('smite', at, ZERO);
  }

  heal(p) {
    p.heal(p.maxHp * 0.45);
    const healed = [];
    this.eachFriend(p.team, p.pos.x, p.pos.z, 14, (o) => {
      if (o === p) return;
      const n = o.maxHp * 0.4;
      if (o.isPlayer) o.heal(n); else o.hp = Math.min(o.maxHp, o.hp + n);
      if (healed.length < 14) healed.push(o.chest(new THREE.Vector3()));
    });
    this.emit('heal', p.pos, ZERO, healed);
  }""", """    p.swingT = 0.25; p.attackDir = 'over';
    this.emit('smite', at, ZERO, null, reach);
  }

  // Cleric talent: the bolt arcs on from the blast to the nearest foes beyond it
  chainSmite(p, at, hit, dmg, chain) {
    const g = this.g, foes = [];
    this.eachFoe(p.team, at.x, at.z, chain.range, (o, d) => { if (!hit.has(o) && !o.isSiege) foes.push({ o, d }); }, at.y, 4);
    foes.sort((a, b) => a.d - b.d);
    const pts = [at.clone().setY(at.y + 1)];
    for (const { o } of foes.slice(0, chain.foes)) {
      pts.push(o.chest(new THREE.Vector3()));
      g.damage(o, dmg * chain.dmg, p, { magic: true, splash: true });
      if (o.alive && o.stagger) o.stagger(0.5, { pos: at });
    }
    if (pts.length > 1) g.magic.showBolt(pts, SPELLS.smite.color);   // (every screen sees it: Magic.onBolt)
  }

  heal(p) {
    this.healBurst(p, 1);
    const pulse = talentFx(p, 'healPulse', null);   // Second Dawn (Cleric talent): the light comes again
    if (pulse) this.active.push({ kind: 'pulse', p, t: 0, dur: 99, delay: pulse.delay, scale: pulse.scale });
  }

  healBurst(p, scale) {
    const mul = talentFx(p, 'healMul', 1) * scale, reach = 14 + talentFx(p, 'healRadius', 0);
    const aegis = talentFx(p, 'aegis', null);   // Divine Aegis (Cleric talent): the healed take less damage for a while
    p.heal(p.maxHp * 0.45 * mul);
    if (aegis) p.buffs.add('guard', aegis.time, 1 - aegis.cut);
    const healed = [];
    this.eachFriend(p.team, p.pos.x, p.pos.z, reach, (o) => {
      if (o === p) return;
      const n = o.maxHp * 0.4 * mul;
      if (o.isPlayer) o.heal(n); else o.hp = Math.min(o.maxHp, o.hp + n);
      if (aegis) this.guard(o, aegis.time, 1 - aegis.cut);
      if (healed.length < 14) healed.push(o.chest(new THREE.Vector3()));
    });
    this.emit('heal', p.pos, ZERO, healed, reach / 14);
  }""")

# ---- Cavalier
rep("""    const f = flat(dir);
    p.buffs.add('charging', 1.15);
    this.active.push({ kind: 'charge', p, t: 0, dur: 1.15, f, hit: new Set() });
    this.emit('charge', p.pos, f);
  }""", """    const f = flat(dir);
    const dur = 1.15 * talentFx(p, 'chargeTime', 1);
    p.buffs.add('charging', dur);
    this.active.push({ kind: 'charge', p, t: 0, dur, f, hit: new Set() });
    const rush = talentFx(p, 'chargeRush', null);   // Vanguard! (Cavalier talent): the army rides with the charge
    if (rush) this.eachFriend(p.team, p.pos.x, p.pos.z, rush.radius, (o) => { if (o !== p) this.haste(o, rush.time, rush.speed); });
    this.emit('charge', p.pos, f);
  }""")
rep("""    this.eachFoe(p.team, c.x, c.z, p.mounted ? 2.6 : 2, (o) => {
      if (e.hit.has(o)) return;
      e.hit.add(o);
      g.damage(o, p.meleeDmg * 2 + (p.mounted ? 25 : 0), p, { melee: true, splash: true, charge: 1 });""", """    this.eachFoe(p.team, c.x, c.z, (p.mounted ? 2.6 : 2) * talentFx(p, 'chargeReach', 1), (o) => {
      if (e.hit.has(o)) return;
      e.hit.add(o);
      g.damage(o, (p.meleeDmg * 2 + (p.mounted ? 25 : 0)) * talentFx(p, 'chargeDmg', 1), p, { melee: true, splash: true, charge: 1 });""")
rep("""  rally(p) {
    this.eachFriend(p.team, p.pos.x, p.pos.z, 28, (o) => {
      if (o === p) return;
      this.guard(o, 8, 0.7);
      this.haste(o, 8, 1.25);
    });
    p.buffs.add('guard', 8, 0.6);
    p.buffs.add('haste', 8, 1.25);
    this.emit('rally', p.pos, ZERO);
  }""", """  rally(p) {
    const t = 8 + talentFx(p, 'rallyTime', 0), reach = talentFx(p, 'rallyReach', 1);
    this.eachFriend(p.team, p.pos.x, p.pos.z, 28 * reach, (o) => {
      if (o === p) return;
      this.guard(o, t, 0.7 - talentFx(p, 'rallyAlly', 0));
      this.haste(o, t, 1.25);
    });
    p.buffs.add('guard', t, 0.6 - talentFx(p, 'rallySelf', 0));
    p.buffs.add('haste', t, 1.25);
    this.emit('rally', p.pos, ZERO, null, reach);
  }""")

# ---- emit / show: a size for the rings
rep("""  // Show the effect here and, in a hosted game, on everyone else's screen too.
  emit(id, pos, dir, targets = null) {
    this.show(id, pos, dir, false, targets);
    const g = this.g;
    if (g.mode === 'host' && g.sync) {
      g.sync.shared.push({ k: 'abil', id, p: v3(pos), d: [Math.round(dir.x * 100) / 100, Math.round(dir.z * 100) / 100], t: targets ? targets.map(v3) : undefined });
    }
  }

  // silent: the sound already arrived as its own event
  show(id, pos, dir, silent = false, targets = null) {""", """  // Show the effect here and, in a hosted game, on everyone else's screen too. sz: how much wider than usual its rings
  // are (a talent that widens an ability).
  emit(id, pos, dir, targets = null, sz = 1) {
    this.show(id, pos, dir, false, targets, sz);
    const g = this.g;
    if (g.mode === 'host' && g.sync) {
      g.sync.shared.push({ k: 'abil', id, p: v3(pos), d: [Math.round(dir.x * 100) / 100, Math.round(dir.z * 100) / 100], t: targets ? targets.map(v3) : undefined, sz: sz !== 1 ? Math.round(sz * 100) / 100 : undefined });
    }
  }

  // silent: the sound already arrived as its own event
  show(id, pos, dir, silent = false, targets = null, sz = 1) {""")

# rings in show()
rep("""        fx.ring(at, 2.8, C.guard, 22, { speed: 3 });
        snd('clang'); snd('thud');""", """        fx.ring(at, 2.8 * sz, C.guard, 22, { speed: 3 });
        snd('clang'); snd('thud');""")
rep("""        fx.ring(at, 1.1, C.guard, 20, { up: 1.5 });
        fx.ring(at, 2.4, C.guard, 28, { up: 1.0 });""", """        fx.ring(at, 1.1, C.guard, 20, { up: 1.5 });
        fx.ring(at, 2.4 * sz, C.guard, 28, { up: 1.0 });""")
rep("""        fx.ring(at, 3.6, C.spark, 26, { speed: 3, up: 0.6 });""", """        fx.ring(at, 3.6 * sz, C.spark, 26, { speed: 3, up: 0.6 });""")
rep("""        if (c) g.aimRing.flash(c, VOLLEY.radius, 1.9);""", """        if (c) g.aimRing.flash(c, VOLLEY.radius * sz, 1.9);""")
rep("""        fx.ring(at, 5.5, C.frost, 38, { speed: 4, up: 0.8 });
        fx.ring(at, 1.2, C.frost, 20, { up: 1.8 });
        snd('ice');
        break;""", """        fx.ring(at, 5.5 * sz, C.frost, 38, { speed: 4, up: 0.8 });
        fx.ring(at, 1.2, C.frost, 20, { up: 1.8 });
        snd('ice');
        break;
      case 'shatter':
        fx.frost(chest, 30);
        fx.ring(at, 6 * sz, C.frost, 44, { speed: 5, up: 0.9 });
        snd('ice');
        break;""")
rep("""        fx.ring(at, 3.2, C.holy, 30, { speed: 4, up: 0.9 });""", """        fx.ring(at, 3.2 * sz, C.holy, 30, { speed: 4, up: 0.9 });""")
rep("""        fx.ring(at, 6, C.heal ? C.holy : C.holy, 36, { speed: 2.5, up: 1.2 });""" if False else """        fx.ring(at, 6, C.holy, 36, { speed: 2.5, up: 1.2 });""", """        fx.ring(at, 6 * sz, C.holy, 36, { speed: 2.5, up: 1.2 });""")
rep("""        fx.ring(at, 9, C.rally, 44, { speed: 5, up: 0.8 });""", """        fx.ring(at, 9 * sz, C.rally, 44, { speed: 5, up: 0.8 });""")
open(p, 'w').write(s)
print('ok')
