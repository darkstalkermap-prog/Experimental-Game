// Alerts (single player): each situational alert fires once when its situation is forced, respects its cooldown and is
// silenced by the Options switch. The sounds are recorded by wrapping audio.play (no audio device needed).
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
const J = (x) => JSON.stringify(x);
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.phaseT = 9999;                                   // no wave until a test asks for one
    window.__snd = [];
    window.__seen = new WeakSet();
    const play = g.audio.play.bind(g.audio);
    g.audio.play = (n, ...a) => { window.__snd.push(n); return play(n, ...a); };
    // what happened since the last call: the alerts raised, the sounds played and the callouts on screen
    window.__since = () => {
      const a = g.alerts;
      const fresh = a.recent.filter((r) => !window.__seen.has(r));
      for (const r of fresh) window.__seen.add(r);
      const out = { raised: fresh.map((r) => r.key + (r.text ? ':' + r.text : '')), snd: window.__snd.slice(), dom: [...document.querySelectorAll('#alerts .alert')].map((e) => e.className.replace('alert ', '') + '|' + e.textContent) };
      window.__snd.length = 0;
      return out;
    };
    window.__clearFoes = () => {
      for (const u of g.units) if (u.team !== 0 && !u.isHero) { u.alive = false; u.mesh.visible = false; }
      for (const e of g.siege) { e.alive = false; e.mesh.visible = false; }
    };
    window.__since();
  });
  // (with the frame's end, like the real loop: keys hit are seen once)
  const step = (secs, dt = 1 / 30, keepPaused = false) => page.evaluate(([secs, dt, keepPaused]) => {
    const g = window.__game;
    if (!keepPaused) g.paused = false;
    for (let i = 0, n = Math.round(secs / dt); i < n; i++) { g.update(dt); g.input.endFrame(); }
  }, [secs, dt, keepPaused]);
  const since = () => page.evaluate(() => window.__since());
  const has = (arr, re) => arr.some((x) => re.test(x));
  const count = (arr, re) => arr.filter((x) => re.test(x)).length;

  // ------------------------------------------------------------------ the API itself
  await step(0.5);
  await since();
  let r = await page.evaluate(() => {
    const g = window.__game, a = g.alerts;
    const out = {};
    out.first = a.raise('t1', { text: 'Hello there', tone: 'good', cooldown: 10 });
    out.again = a.raise('t1', { text: 'Hello there', cooldown: 10 });
    out.other = a.raise('t2', { text: 'Other key', tone: 'danger', pos: { x: g.player.pos.x, z: g.player.pos.z - 50 } });
    g.time += 11;
    out.after = a.raise('t1', { text: 'Hello again', cooldown: 10 });
    out.soundOnly = a.raise('t3', { sound: 'chime' });
    out.silent = a.raise('t4', { text: 'quiet', sound: false });
    out.bad = a.raise('t5', { text: 'odd tone', tone: 'purple' });
    return { out, since: window.__since() };
  });
  check('raise fires once and is throttled per key; the cooldown ends', r.out.first === true && r.out.again === false && r.out.other === true && r.out.after === true, J(r.out));
  check('tone picks the default sound; a sound alone has no callout; sound:false is silent; an odd tone becomes info',
    J(r.since.snd) === J(['chime', 'alertDanger', 'alertLow', 'chime', 'alertLow']) && !has(r.since.raised, /^t3:/) && r.out.silent && r.out.bad, J(r.since));
  check('callouts show on screen with the tone as class (at most four at a time), and the pointer chip where there is a place',
    r.since.dom.length === 4 && has(r.since.dom, /^danger\|.*Other key.*↑ 50 m/) && has(r.since.dom, /^info\|.*Hello again$/) && !has(r.since.dom, /quiet.*m$/), J(r.since.dom));
  r = await page.evaluate(() => { const a = window.__game.alerts; document.getElementById('alerts').innerHTML = ''; a.raise('g1', { text: 'Good news', tone: 'good' }); a.raise('w1', { text: 'Careful', tone: 'warn' }); return window.__since(); });
  check('good and warn have their own colours', has(r.dom, /^good\|.*Good news$/) && has(r.dom, /^warn\|.*Careful$/), J(r.dom));
  await page.evaluate(() => { document.getElementById('alerts').innerHTML = ''; });

  // ------------------------------------------------------------------ your castle under attack
  await page.evaluate(() => { window.__game.input.keys.add('KeyJ'); });   // (a key nothing uses: somebody is at the keyboard, so no idle nudges get in the way)
  await page.evaluate(() => { window.__game.castles[0].gate.hp -= 150; });
  await step(0.6);
  let s = await since();
  check('gate losing health: "Your north gate is under attack!" with the danger horn', has(s.raised, /^attack0:Your north gate is under attack!$/) && s.snd.includes('alertDanger'), J(s));
  check('the callout is on screen, edged for danger, with a pointer chip', has(s.dom, /^danger\|.*Your north gate is under attack!.*\d+ m$/), J(s.dom));
  await page.evaluate(() => { window.__game.castles[0].gate.hp -= 100; });
  await step(2);
  s = await since();
  check('the same part again within 20 s: nothing', !has(s.raised, /^attack/) && !s.snd.includes('alertDanger'), J(s));
  r = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    const w = c.walls.filter((x) => x.breakable)[0];
    w.hp -= 200;
    return { side: Math.abs(w.pos.x - c.center.x) > Math.abs(w.pos.z - c.center.z) ? (w.pos.x > c.center.x ? 'east' : 'west') : (w.pos.z > c.center.z ? 'south' : 'north') };
  });
  await step(0.6);
  s = await since();
  check('a different part within 6 s of the last callout waits', !has(s.raised, /^attack/), J(s.raised));
  await step(6);
  await page.evaluate(() => { const c = window.__game.castles[0]; c.walls.filter((x) => x.breakable)[0].hp -= 50; });
  await step(0.6);
  s = await since();
  check(`a wall hit once the spacing is over: "Your ${r.side} wall is under attack!"`, has(s.raised, new RegExp(`^attack\\d+:Your ${r.side} wall is under attack!$`)), J(s.raised));
  await step(15);
  await since();
  await page.evaluate(() => { window.__game.castles[0].gate.hp -= 100; });
  await step(0.6);
  s = await since();
  check('after the 20 s cooldown the same gate alerts again', has(s.raised, /^attack0:Your north gate/) && s.snd.includes('alertDanger'), J(s));
  await page.evaluate(() => { const c = window.__game.castles[0]; c.repairGate(); c.repairWalls(); });
  await step(1);
  s = await since();
  check('repairs (health going up) raise nothing', s.raised.length === 0, J(s.raised));
  await step(6);
  await page.evaluate(() => { window.__game.castles[0].keep.hp -= 300; });
  await step(0.6);
  s = await since();
  check('the keep: "Your keep is under attack!"', has(s.raised, /^attack1:Your keep is under attack!$/), J(s.raised));

  // ------------------------------------------------------------------ a breach
  await step(8);
  await page.evaluate(() => { window.__game.castles[0].repairKeep(); document.getElementById('alerts').innerHTML = ''; });
  await step(0.5);
  await since();
  r = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    const w = c.walls.filter((x) => x.breakable)[1];
    const side = Math.abs(w.pos.x - c.center.x) > Math.abs(w.pos.z - c.center.z) ? (w.pos.x > c.center.x ? 'east' : 'west') : (w.pos.z > c.center.z ? 'south' : 'north');
    c.damageWall(w, 1e9, null);
    return { side, alive: w.alive };
  });
  await step(0.6);
  s = await since();
  check(`a wall falling: "Breach! The ${r.side} wall has fallen" with the horn, and no extra "under attack" for it`, r.alive === false && has(s.raised, new RegExp(`^breach\\d+:Breach! The ${r.side} wall has fallen$`)) && s.snd.includes('alertDanger') && !has(s.raised, /^attack/), J(s));
  await page.evaluate(() => { window.__game.castles[0].damageGate(1e9, null); });
  await step(0.6);
  s = await since();
  check('the gate breaking: "Breach! The north gate has fallen"', has(s.raised, /^breach0:Breach! The north gate has fallen$/), J(s.raised));
  await page.evaluate(() => { const c = window.__game.castles[0]; c.repairGate(); c.repairWalls(); });
  await step(1);
  await since();

  // ------------------------------------------------------------------ an army at the door, and a siege engine
  r = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0], f1 = g.factions[1];
    window.__foes = [];
    for (let i = 0; i < 4; i++) {
      const u = g.recruit(f1, 'swordsman', true);
      u.hp = u.maxHp = 1e6;
      u.update = () => {};                                       // they stand where they are put
      u.pos.set(c.center.x + 45 + i, 2, c.center.z - 45 + i);    // north-east of the castle
      window.__foes.push(u);
    }
    return g.units.length;
  });
  await step(0.6);
  s = await since();
  check('four foes near the castle are not an army', !has(s.raised, /^army/), J(s.raised));
  await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    for (let i = 0; i < 2; i++) { const u = g.recruit(g.factions[2], 'archer', true); u.hp = u.maxHp = 1e6; u.update = () => {}; u.pos.set(c.center.x + 40 + i, 2, c.center.z - 42); window.__foes.push(u); }
  });
  await step(0.6);
  s = await since();
  check('six: "Enemy army approaching from the north-east!" with the war horn', has(s.raised, /^army:Enemy army approaching from the north-east!$/) && s.snd.includes('horn'), J(s));
  await step(30);
  s = await since();
  check('edge-triggered: they stay, it does not repeat', !has(s.raised, /^army/), J(s.raised));
  await page.evaluate(() => { for (const u of window.__foes) u.pos.set(0, 2, 0); });
  await step(1);
  await page.evaluate(() => { const c = window.__game.castles[0]; for (const u of window.__foes) u.pos.set(c.center.x - 40, 2, c.center.z - 40); });
  await step(0.6);
  s = await since();
  check('they leave and come back (from the north-west now): it fires again', has(s.raised, /^army:Enemy army approaching from the north-west!$/), J(s.raised));
  await page.evaluate(() => window.__clearFoes());
  await step(1);
  await since();
  r = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    const eng = g.buildSiege(g.factions[1], 'ram');
    eng.update = () => {};
    eng.pos.set(c.center.x, 2, c.center.z - 55);
    return { n: g.siege.length };
  });
  await step(0.6);
  s = await since();
  check('an enemy ram 55 m from the castle: "Enemy battering ram spotted to the north"', has(s.raised, /^siege:Enemy battering ram spotted to the north$/) && s.snd.includes('alertLow'), J(s));
  await step(1);
  s = await since();
  check('the same engine is not spotted twice', !has(s.raised, /^siege/), J(s.raised));
  await page.evaluate(() => window.__clearFoes());

  // ------------------------------------------------------------------ health and arrows
  await page.evaluate(() => { document.getElementById('alerts').innerHTML = ''; const p = window.__game.player; p.hp = p.maxHp * 0.2; p.potions = 1; });
  await step(2.6);
  s = await since();
  check('under 30% health: "Low health! Drink a healing draught (H)" and heartbeats', has(s.raised, /^low:Low health! Drink a healing draught \(H\)$/) && count(s.snd, /^heartbeat$/) >= 2, J(s));
  await page.evaluate(() => { const p = window.__game.player; p.hp = p.maxHp * 0.8; });
  await step(2);
  s = await since();
  check('healed: the heartbeat stops', count(s.snd, /^heartbeat$/) === 0, J(s.snd));
  await page.evaluate(() => { const p = window.__game.player; p.potions = 0; p.hp = p.maxHp * 0.2; window.__game.time += 21; });
  await step(1);
  s = await since();
  check('with no potion it says to fall back instead', has(s.raised, /^low:Low health! Fall back to your castle$/), J(s.raised));
  await page.evaluate(() => { const p = window.__game.player; p.hp = p.maxHp; p.arrows = 9; });
  await step(0.5);
  await page.evaluate(() => { window.__game.player.arrows = 8; });
  await step(0.3);
  await since();
  await page.evaluate(() => { window.__game.player.arrows = 5; });
  await step(0.5);
  s = await since();
  check('arrows going down to five: "Running low on arrows (5 left)"', has(s.raised, /^arrows:Running low on arrows \(5 left\)$/), J(s.raised));
  await page.evaluate(() => { window.__game.player.arrows = 3; });
  await step(0.5);
  s = await since();
  check('further down: no repeat', !has(s.raised, /^arrows/), J(s.raised));
  await page.evaluate(() => { window.__game.player.arrows = 0; });
  await step(0.5);
  s = await since();
  check('none left: "Out of arrows!"', has(s.raised, /^arrows0:Out of arrows!$/), J(s.raised));
  await page.evaluate(() => { window.__game.player.arrows = 30; });
  await step(0.5);
  await since();

  // ------------------------------------------------------------------ abilities
  await page.evaluate(() => { const p = window.__game.player; p.abilCd.r = 18; p.abilCd.q = 9; });
  await step(0.2);
  await page.evaluate(() => { const p = window.__game.player; p.abilCd.r = 0.04; p.abilCd.q = 0.04; });
  await step(0.3);
  s = await since();
  check('the 18 s ability coming back ticks softly; the 9 s one does not', count(s.snd, /^abilReady$/) === 1 && has(s.raised, /^readyr/) && !has(s.raised, /^readyq/), J(s));
  await page.evaluate(() => { const p = window.__game.player; p.abilCd.r = 18; });
  await step(0.2);
  await page.evaluate(() => { const p = window.__game.player; p.abilCd.r = 0; });     // a respawn wipes it: reset, not run out
  await step(0.3);
  s = await since();
  check('a cooldown wiped by a respawn is not "ready"', count(s.snd, /^abilReady$/) === 0, J(s));

  // ------------------------------------------------------------------ the wave clock
  await page.evaluate(() => { const g = window.__game; g.phase = 'prep'; g.phaseT = 10.6; document.getElementById('alerts').innerHTML = ''; });
  await step(0.3);
  await since();
  await step(0.5);
  s = await since();
  r = await page.evaluate(() => window.__game.round);
  check(`"Wave ${r + 1} marches in 10 s"`, has(s.raised, new RegExp(`^wave10:Wave ${r + 1} marches in 10 s$`)), J(s.raised));
  await step(6.5, 1 / 60);
  s = await since();
  check('no ticks before the last three seconds', count(s.snd, /^tick$/) === 0, J(s.snd));
  await step(3.6, 1 / 60);
  s = await since();
  check('ticks at 3, 2 and 1', count(s.snd, /^tick$/) === 3, J(s.snd));
  r = await page.evaluate(() => ({ round: window.__game.round, phase: window.__game.phase }));
  check("wave 1 begins with the game's own horn and banner: no callout of ours", r.round === 1 && r.phase === 'wave' && !has(s.raised, /^wave:/), J({ r, raised: s.raised }));
  await page.evaluate(() => { window.__clearFoes(); window.__game.phaseT = 10.6; });
  await step(0.9);
  s = await since();
  check('the next one says wave 2', has(s.raised, /^wave10:Wave 2 marches in 10 s$/), J(s.raised));
  await step(11);
  s = await since();
  check('wave 2 marching out gets a callout, and its own three ticks', has(s.raised, /^wave:Wave 2 marches out$/) && count(s.snd, /^tick$/) === 3, J(s));
  await page.evaluate(() => { window.__clearFoes(); window.__game.phaseT = 99999; document.getElementById('alerts').innerHTML = ''; });
  await step(0.5);
  await since();

  // ------------------------------------------------------------------ kill streaks
  const kill = async (n) => { await page.evaluate((n) => { window.__game.player.kills += n; }, n); await step(0.4); };
  await kill(1); await kill(1);
  s = await since();
  check('two kills: nothing', !has(s.raised, /^streak/), J(s.raised));
  await kill(1);
  s = await since();
  let d = await page.evaluate(() => { const e = document.getElementById('streak'); return { cls: e.className, title: e.querySelector('b').textContent, sub: e.querySelector('span').textContent }; });
  check('three kills in 12 s: "Killing spree" banner with the fanfare', has(s.raised, /^streak:Killing spree$/) && s.snd.includes('streak') && d.cls.includes('t1') && d.cls.includes('show') && d.title === 'Killing spree', J({ s, d }));
  await kill(1);
  s = await since();
  check('a fourth: still the same banner (no repeat)', !has(s.raised, /^streak/), J(s.raised));
  await kill(1);
  s = await since();
  d = await page.evaluate(() => document.getElementById('streak').querySelector('b').textContent);
  check('five: "Rampage" with the bigger fanfare', has(s.raised, /^streak:Rampage$/) && s.snd.includes('streakBig') && d === 'Rampage', J({ s, d }));
  await kill(3);
  s = await since();
  check('eight: "Unstoppable"', has(s.raised, /^streak:Unstoppable$/), J(s.raised));
  await step(13);
  await since();
  await kill(1); await kill(1); await kill(1);
  s = await since();
  check('after 12 quiet seconds the count starts again: three more is a spree again', has(s.raised, /^streak:Killing spree$/), J(s.raised));
  await step(13);
  await since();
  await kill(3);
  s = await since();
  check('three kills arriving at once (one snapshot) count too', has(s.raised, /^streak:Killing spree$/), J(s.raised));
  await step(13);
  await since();
  await page.evaluate(() => { window.__game.player.kills += 2; });
  await step(0.4);
  await page.evaluate(() => { const p = window.__game.player; p.takeDamage(1e6, null); });       // dying ends the streak
  await step(0.6);
  await page.evaluate(() => { const g = window.__game, p = g.player; p.spawn(g.castles[0].spawnPoint, g.castles[0].rot); });
  await step(0.5);
  await since();
  await kill(1);
  s = await since();
  check('a death ends a streak (the kills before it no longer count)', !has(s.raised, /^streak/), J(s.raised));

  // ------------------------------------------------------------------ gold nobody spends
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    document.getElementById('alerts').innerHTML = '';
    g.alerts.last.clear();
    g.localFaction.gold = 400;
    p.hp = p.maxHp;
    p.pos.set(g.castles[0].center.x, 2, g.castles[0].center.z);
    g.input.keys.add('KeyJ');                          // (a key nothing uses: somebody is at the keyboard)
  });
  await step(2, 0.1);
  await since();
  await step(36, 0.1);
  s = await since();
  check('under 40 s of idle gold: nothing yet', !has(s.raised, /^gold/), J(s.raised));
  await step(4, 0.1);
  s = await since();
  check('400 gold unspent for 40 s at home: "You have 4xx gold to spend (B)"', has(s.raised, /^gold:You have 4\d\d gold to spend \(B\)$/), J(s));
  await step(30, 0.1);
  s = await since();
  check('and not again at once', !has(s.raised, /^gold/), J(s.raised));
  await page.evaluate(() => { const g = window.__game; g.alerts.last.delete('gold'); g.localFaction.gold -= 100; });   // bought something
  await since();
  await step(37, 0.1);
  s = await since();
  check('buying something restarts the wait', !has(s.raised, /^gold/), J(s.raised));
  await step(4, 0.1);
  s = await since();
  check('and it comes again after another 40 s', has(s.raised, /^gold:/), J(s.raised));
  await page.evaluate(() => { const g = window.__game, p = g.player; g.alerts.last.delete('gold'); p.pos.set(0, 2, 0); });
  await step(45, 0.1);
  s = await since();
  check('away from home the gold reminder keeps quiet', !has(s.raised, /^gold/), J(s.raised));
  await page.evaluate(() => { const g = window.__game; g.alerts.last.delete('gold'); g.player.pos.set(g.castles[0].center.x, 2, g.castles[0].center.z); });
  await step(1, 0.1);
  s = await since();
  check('back home it speaks up', has(s.raised, /^gold:/), J(s.raised));

  // ------------------------------------------------------------------ idle nudge
  await page.evaluate(() => { const g = window.__game; g.input.keys.clear(); g.alerts.last.clear(); g.localFaction.gold = 0; g.alerts.lastInput = g.time; g.alerts.idleShown = false; });
  await step(24, 0.1);
  s = await since();
  check('24 s without input: no nudge yet', !has(s.raised, /^idle/), J(s.raised));
  await step(2, 0.1);
  s = await since();
  check('25 s without input: "Still with us?" and a soft chime', has(s.raised, /^idle:Still with us\? Wave \d+ marches in \d+:\d\d\.$/) && s.snd.includes('chime'), J(s));
  await step(30, 0.1);
  s = await since();
  check('once per idle spell', !has(s.raised, /^idle/), J(s.raised));
  await page.evaluate(() => { window.__game.input.pressed.add('KeyW'); });
  await step(0.2, 0.1);
  await step(33, 0.1);
  s = await since();
  check('after the player does something, the next spell gets its own nudge', has(s.raised, /^idle/), J(s.raised));
  await page.evaluate(() => { const g = window.__game; g.alerts.last.clear(); g.alerts.idleShown = false; g.input.keys.add('KeyJ'); });
  await step(40, 0.1);
  s = await since();
  check('a held key is activity: no nudge', !has(s.raised, /^idle/), J(s.raised));
  await page.evaluate(() => { const g = window.__game; g.input.keys.clear(); g.alerts.last.clear(); g.alerts.lastInput = g.time; g.alerts.idleShown = false; g.paused = true; });
  const t0 = await page.evaluate(() => window.__game.time);
  await step(40, 0.1, true);
  s = await since();
  const t1 = await page.evaluate(() => { const g = window.__game; g.paused = false; return g.time; });
  check('single player with the game menu open: the world (and the idle clock) stands still', t1 === t0 && !has(s.raised, /^idle/), J({ t0, t1, raised: s.raised }));
  await step(10, 0.1);
  s = await since();
  check('...so after coming back there is still no nudge', !has(s.raised, /^idle/), J(s.raised));
  await page.evaluate(() => { const g = window.__game; g.mode = 'host'; g.alerts.lastInput = g.time; g.alerts.idleShown = false; g.paused = true; });
  await step(40, 0.1, true);
  s = await since();
  check('online, the world runs under the game menu, but somebody in the menu is not idle', !has(s.raised, /^idle/), J(s.raised));
  await page.evaluate(() => { const g = window.__game; g.mode = 'single'; g.paused = false; });

  // ------------------------------------------------------------------ the Options switch
  r = await page.evaluate(() => {
    const el = document.getElementById('optAlerts');
    const out = { start: el.checked, label: el.nextElementSibling.textContent };
    el.click();
    out.off = el.checked; out.labelOff = el.nextElementSibling.textContent;
    out.saved = JSON.parse(localStorage.getItem('cw-settings') || '{}').alerts;
    return out;
  });
  check('Options: the Alerts switch starts on, clicking turns it off and saves it', r.start === true && r.label === 'On' && r.off === false && r.labelOff === 'Off' && r.saved === 0, J(r));
  await since();
  await page.evaluate(() => { const g = window.__game; g.alerts.last.clear(); g.castles[0].gate.hp -= 200; g.player.hp = g.player.maxHp * 0.1; g.player.kills += 3; document.getElementById('alerts').innerHTML = ''; });
  await step(3);
  s = await since();
  check('with alerts off: no attack, no low-health, no streak, no heartbeat, no callouts', s.raised.length === 0 && s.snd.length === 0 && s.dom.length === 0, J(s));
  r = await page.evaluate(() => ({ ok: window.__game.alerts.raise('x', { text: 'nope' }) }));
  check('raise() says it did not fire', r.ok === false);
  await page.evaluate(() => { document.getElementById('optAlerts').click(); window.__game.player.hp = window.__game.player.maxHp; });
  r = await page.evaluate(() => ({ on: document.getElementById('optAlerts').checked, saved: JSON.parse(localStorage.getItem('cw-settings') || '{}').alerts, tips: document.getElementById('optTips').checked }));
  check('and back on', r.on === true && r.saved === 1 && r.tips === true, J(r));

  console.log('errors:', errors.join('\n') || 'none');
  if (errors.length) failed++;
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
