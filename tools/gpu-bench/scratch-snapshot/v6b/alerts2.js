// Alerts, part two (single player): the sounds render, tips rotate / skip what is known / persist / switch off, the death and
// game-over screens get one, the away log and the title flash work through a faked document.hidden, the background ticker
// advances an online game, and the hill's sounds. Prints failures only.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) { failed++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); } };
const J = (x) => JSON.stringify(x);
const stepIn = (page) => (secs, dt = 0.1, keepPaused = false) => page.evaluate(([secs, dt, keepPaused]) => {
  const g = window.__game;
  if (!keepPaused) g.paused = false;
  for (let i = 0, n = Math.round(secs / dt); i < n; i++) { g.update(dt); g.input.endFrame(); }
}, [secs, dt, keepPaused]);
const prep = (page) => page.evaluate(() => {
  const g = window.__game;
  g.phaseT = 9999;
  g.input.keys.add('KeyJ');                 // somebody is at the keyboard: no idle nudges
  window.__snd = [];
  const play = g.audio.play.bind(g.audio);
  g.audio.play = (n, ...a) => { window.__snd.push(n); return play(n, ...a); };
  window.__hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
});
const tipShown = (page) => page.evaluate(() => ({ on: document.getElementById('tip').classList.contains('show'), html: document.getElementById('tip').querySelector('span').innerHTML, text: window.__game.alerts.tipText }));

(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });

  // ------------------------------------------------------------------ the sounds, rendered offline
  const sounds = await page.evaluate(async () => {
    const { Audio, SOUNDS } = await import('/src/audio.js');
    const names = ['alertLow', 'alertDanger', 'tick', 'heartbeat', 'streak', 'streakBig', 'chime', 'abilReady'];
    const out = {};
    for (const n of names) {
      const sr = 22050, ctx = new OfflineAudioContext(1, sr * 3, sr);
      const au = new Audio();
      au.init(ctx);
      au.play(n);
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0, nan = 0, last = 0;
      for (let i = 0; i < d.length; i++) { const v = d[i]; if (!isFinite(v)) nan++; const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; if (a > 0.004) last = i; }
      out[n] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), secs: +(last / sr).toFixed(2), nan, registered: typeof SOUNDS[n] === 'function' };
    }
    return out;
  });
  for (const [n, s] of Object.entries(sounds)) check(`sound ${n} is registered, audible, finite and short`, s.registered && s.nan === 0 && s.peak > 0.03 && s.peak <= 1 && s.secs > 0.01 && s.secs < 2.6, J(s));
  console.log('sounds: ' + Object.entries(sounds).map(([n, s]) => `${n} peak ${s.peak} ${s.secs}s`).join(' · '));

  await L.startSingle(page);
  await prep(page);
  const step = stepIn(page);

  // ------------------------------------------------------------------ tips
  await step(20);
  let t = await tipShown(page);
  check('no tip in the first 20 s', !t.on, J(t));
  await step(7);
  t = await tipShown(page);
  check('after about 25 calm seconds the first tip appears, with its key as a key cap', t.on && /^Hold \[C\] to duck/.test(t.text) && t.html.includes('<kbd>C</kbd>'), J(t));
  await step(10);
  t = await tipShown(page);
  check('it goes away after about nine seconds', !t.on, J(t));
  await step(25);
  t = await tipShown(page);
  check('and no second one within 40 s of the first', !t.on, J(t));
  await step(8);
  t = await tipShown(page);
  check('the second one comes after the gap: the next tip in the list', t.on && /^Jump at a wall/.test(t.text), J(t));
  // things the player does are noticed (their tips are skipped from now on)
  await page.evaluate(() => { window.__game.input.keys.add('KeyC'); });
  await step(0.3, 0.05);
  await page.evaluate(() => { const g = window.__game; g.input.keys.delete('KeyC'); g.ui.toggleMap(true); });
  await step(0.2, 0.05);
  await page.evaluate(() => { const g = window.__game; g.ui.toggleMap(false); g.ui.tab = 'army'; g.ui.toggleShop(true); });
  await step(0.2, 0.05, true);
  await page.evaluate(() => { const g = window.__game; g.ui.toggleShop(false); g.player.setWeapon('bow'); g.input.pressed.add('F1'); });
  await step(0.2, 0.05);
  await page.evaluate(() => { const p = window.__game.player; p.setWeapon('sword'); });
  const learned = await page.evaluate(() => [...window.__game.alerts.learned].sort());
  for (const f of ['ducked', 'map', 'shop', 'armytab', 'bow', 'order']) check(`noticed: ${f}`, learned.includes(f), J(learned));
  let r = await page.evaluate(async () => {
    const { TIPS } = await import('/src/alerts.js');
    const a = window.__game.alerts;
    a.hideTip();
    const eligible = TIPS.filter((x) => a.eligible(x, 'play'));
    const seenBefore = new Set(a.seen);
    const picked = [];
    const left = eligible.filter((x) => !a.seen.has(x.id)).length;
    for (let i = 0; i < left; i++) picked.push(a.pickTip('play'));
    const stored = JSON.parse(localStorage.getItem('cw-tips'));
    const again = a.pickTip('play');                         // everything has been seen: the round starts again
    return {
      stored: { seen: stored.seen.length, hasDuck: stored.seen.includes('duck'), learned: stored.learned },
      ids: picked.map((x) => x.id), distinct: new Set(picked.map((x) => x.id)).size, left, eligible: eligible.length,
      knownFlag: picked.filter((x) => x.learn && a.learned.has(x.learn)).map((x) => x.id),
      otherClass: picked.filter((x) => x.cls && x.cls !== 'knight').map((x) => x.id), koth: picked.filter((x) => x.koth === true).map((x) => x.id),
      onDeath: picked.filter((x) => x.at).map((x) => x.id), repeatsOld: picked.filter((x) => seenBefore.has(x.id)).map((x) => x.id),
      again: again && again.id, firstOfRound: eligible[0].id,
    };
  });
  check('every tip that fits comes once before any repeats, none for what is already known, none for other classes, the hill, or the death screen',
    r.distinct === r.left && r.left >= 10 && r.knownFlag.length === 0 && r.otherClass.length === 0 && r.koth.length === 0 && r.onDeath.length === 0 && r.repeatsOld.length === 0, J(r));
  check('then the round starts again from the top', r.again === r.firstOfRound, J(r));
  check('the list has the knight tip in it and enough tips', r.ids.includes('knight') && r.eligible >= 15, J(r.ids));

  // persisted in this browser
  check('what was shown and what is known is kept in localStorage as it goes', r.stored.seen >= 12 && r.stored.hasDuck && r.stored.learned.includes('shop') && r.stored.learned.includes('map'), J(r.stored));
  await page.evaluate(() => { localStorage.setItem('cw-tips', JSON.stringify({ seen: ['duck', 'climb'], learned: ['ducked'] })); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await L.startSingle(page);
  await prep(page);
  r = await page.evaluate(() => { const a = window.__game.alerts; return { seen: [...a.seen], learned: [...a.learned], next: a.pickTip('play').id }; });
  check('a new page remembers: duck and climb are not shown again, the next tip is guard', r.seen.join() === 'duck,climb' && r.learned.join() === 'ducked' && r.next === 'guard', J(r));
  await page.evaluate(() => { localStorage.removeItem('cw-tips'); });
  r = await page.evaluate(() => {
    const a = window.__game.alerts, real = localStorage;
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } }); } catch (e) { return 'skipped'; }
    let ok = true;
    try { a.save(); a.pickTip('play'); } catch (e) { ok = false; }
    Object.defineProperty(window, 'localStorage', { configurable: true, value: real });
    return ok;
  });
  check('with storage blocked nothing throws', r === true || r === 'skipped', J(r));

  // calm: taking damage keeps the tips away
  await page.evaluate(() => { const a = window.__game.alerts; a.seen.clear(); a.hideTip(); a.tipAt = -99; });
  for (let i = 0; i < 50; i++) { await page.evaluate(() => { const g = window.__game; g.player.lastHurt = g.time; }); await step(1); }
  t = await tipShown(page);
  check('while something keeps hurting you there are no tips', !t.on, J(t));
  await step(32);
  t = await tipShown(page);
  check('and 32 s after the last blow still none (10 s of quiet, then 25 s of calm)', !t.on, J(t));
  await step(5);
  t = await tipShown(page);
  check('37 s after the last blow the tip comes', t.on, J(t));
  await step(10);
  // a danger alert counts as not calm too
  await page.evaluate(() => { const a = window.__game.alerts; a.tipAt = -99; a.raise('danger-test', { text: 'Careful', tone: 'warn' }); });
  await step(20);
  t = await tipShown(page);
  check('a warning keeps the tip waiting', !t.on, J(t));
  // tip() by hand, and the Options switch
  r = await page.evaluate(() => { const a = window.__game.alerts; const ok = a.tip('Press [P] to ping.'); return { ok, html: document.getElementById('tip').querySelector('span').innerHTML, on: document.getElementById('tip').classList.contains('show') }; });
  check('alerts.tip(text) shows a line at once, with key caps', r.ok && r.on && r.html === 'Press <kbd>P</kbd> to ping.', J(r));
  await step(10);
  t = await tipShown(page);
  check('...for nine seconds', !t.on, J(t));
  r = await page.evaluate(() => {
    const el = document.getElementById('optTips');
    const out = { start: el.checked };
    el.click();
    out.off = el.checked; out.saved = JSON.parse(localStorage.getItem('cw-settings') || '{}').tips; out.tip = window.__game.alerts.tip('hello');
    window.__game.alerts.tipAt = -99; window.__game.alerts.seen.clear();
    return out;
  });
  check('Options: the Tips switch turns tips off (and saves it)', r.start && !r.off && r.saved === 0 && r.tip === false, J(r));
  await step(80);
  t = await tipShown(page);
  check('with tips off nothing is ever shown', !t.on, J(t));
  await page.evaluate(() => { document.getElementById('optTips').click(); });

  // the respawn screen
  r = await page.evaluate(() => { const g = window.__game, p = g.player; g.alerts.tipAt = -99; p.takeDamage(1e6, null); return !p.alive; });
  await step(0.6);
  r = await page.evaluate(async () => {
    const { TIPS } = await import('/src/alerts.js');
    const el = document.getElementById('respawnTip'), g = window.__game;
    g.ui.hudT = 0; g.ui.update(0.2);
    return { text: el.textContent, ok: TIPS.filter((x) => x.at === 'death').some((x) => x.text.replace(/[\[\]]/g, '') === el.textContent), shown: !document.getElementById('respawn').classList.contains('hidden') };
  });
  check('dying puts a tip on the respawn screen (one of the death tips)', r.ok && r.shown, J(r));
  await page.evaluate(() => { const g = window.__game, p = g.player; p.spawn(g.castles[0].spawnPoint, g.castles[0].rot); });
  await step(0.6);
  r = await page.evaluate(() => document.getElementById('respawnTip').textContent);
  check('and it is gone when the hero rises', r === '', J(r));

  // ------------------------------------------------------------------ looking away
  await page.evaluate(() => { const g = window.__game; g.alerts.last.clear(); g.alerts.seen.clear(); document.getElementById('alerts').innerHTML = ''; window.__snd.length = 0; });
  await step(1);
  await page.evaluate(() => { document.getElementById('alerts').innerHTML = ''; window.__snd.length = 0; });
  r = await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); const g = window.__game, c = g.castles[0]; c.gate.hp -= 100; return { away: !!g.alerts.away }; });
  check('hiding the tab starts an away log', r.away === true);
  await step(0.6);
  r = await page.evaluate(() => ({ title: document.title, callouts: document.querySelectorAll('#alerts .alert').length, snd: window.__snd.slice() }));
  check('an attack while away: the title says so, with the count', r.title === '⚔ (1) Castle under attack!', J(r));
  check('...the horn still sounds (a hidden tab can be heard) but nothing piles up on screen', r.snd.includes('alertDanger') && r.callouts === 0, J(r));
  await page.evaluate(() => { const g = window.__game, c = g.castles[0]; const w = c.walls.filter((x) => x.breakable)[0]; c.damageWall(w, 1e9, null); });
  await step(0.6);
  const titles = [];
  for (let i = 0; i < 9; i++) { titles.push(await page.evaluate(() => document.title)); await page.waitForTimeout(300); }
  check('the title flashes between the news and the normal title, and the count went up', titles.includes('Castle Wars') && titles.some((x) => /^⚔ \(2\) Breach in the \w+ wall!$/.test(x)), J(titles));
  await page.evaluate(() => { const g = window.__game, p = g.player; p.kills += 4; p.deaths += 1; g.round += 2; g.localFaction.earned += 214; g.alerts.away.at -= 20000; });
  r = await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); const el = document.getElementById('away'); return { title: document.title, hidden: el.classList.contains('hidden'), head: el.querySelector('small').textContent, lines: [...el.querySelectorAll('li')].map((l) => l.textContent), away: window.__game.alerts.away }; });
  check('coming back: the title is the title again, the panel is up and counts the time away', r.title === 'Castle Wars' && !r.hidden && /^0:2\d$/.test(r.head) && r.away === null, J(r));
  check('...and it lists the attack, the breach, waves, kills, deaths and gold',
    r.lines.some((l) => /Castle under attack!$/.test(l)) && r.lines.some((l) => /Breach in the \w+ wall!$/.test(l)) && r.lines.some((l) => /2 waves marched$/.test(l)) && r.lines.some((l) => /You slew 4$/.test(l)) && r.lines.some((l) => /You fell$/.test(l)) && r.lines.some((l) => /\+\d+ gold earned$/.test(l)), J(r.lines));
  await page.waitForTimeout(8400);
  r = await page.evaluate(() => document.getElementById('away').classList.contains('hidden'));
  check('the panel goes away after about eight seconds', r === true);
  // a quick look away: no panel; window blur and focus work like hiding
  r = await page.evaluate(() => { const g = window.__game; window.dispatchEvent(new Event('blur')); const started = !!g.alerts.away; window.dispatchEvent(new Event('focus')); return { started, ended: g.alerts.away === null, hidden: document.getElementById('away').classList.contains('hidden') }; });
  check('blur then focus: an away log starts and ends, and a few seconds away shows no panel', r.started && r.ended && r.hidden, J(r));
  r = await page.evaluate(() => { const g = window.__game, a = g.alerts; window.dispatchEvent(new Event('blur')); a.away.at -= 30000; window.dispatchEvent(new Event('focus')); return document.getElementById('away').classList.contains('hidden'); });
  check('a long absence in which nothing happened shows no panel either', r === true);
  r = await page.evaluate(() => { document.getElementById('optAlerts').click(); const a = window.__game.alerts; window.dispatchEvent(new Event('blur')); const r = a.away; window.dispatchEvent(new Event('focus')); document.getElementById('optAlerts').click(); return r; });
  check('with alerts off there is no away log', r === null, J(r));

  // ------------------------------------------------------------------ the background ticker
  r = await page.evaluate(() => {
    const g = window.__game, a = g.alerts, out = {};
    g.mode = 'host'; window.__hidden = true;
    a.bgAt = 0; a.bgAcc = 0;
    const t0 = g.time;
    out.first = a.background(10000);
    out.half = a.background(10500);
    out.dt1 = +(g.time - t0).toFixed(3);
    out.capped = a.background(13500);
    out.dt2 = +(g.time - t0).toFixed(3);
    g.input.pressed.add('KeyM');
    a.background(14000);
    out.mapOnce = g.ui.mapOpen === true;
    g.ui.toggleMap(false);
    g.mode = 'single';
    out.single = a.background(20000) + a.background(21000);
    g.mode = 'host'; window.__hidden = false;
    out.visible = a.background(30000) + a.background(31000);
    g.mode = 'single';
    return out;
  });
  check('hidden online game: nothing on the first call, 1/20 s steps for the real time after that', r.first === 0 && r.half === 10 && r.dt1 === 0.5, J(r));
  check('...at most a second per call, however long since the last', r.capped === 20 && r.dt2 === 1.5, J(r));
  check('...a key hit is seen once, not once per step', r.mapOnce === true, J(r));
  check('single player does not step in the background, and neither does a visible tab', r.single === 0 && r.visible === 0, J(r));
  // the real timers (an interval and a worker) drive it while the tab is hidden
  const t0 = await page.evaluate(() => { const g = window.__game; g.mode = 'host'; g.alerts.bgAt = 0; g.alerts.bgAcc = 0; window.__hidden = true; return g.time; });
  await page.waitForTimeout(1600);
  r = await page.evaluate((t0) => { const g = window.__game; window.__hidden = false; const dt = g.time - t0; g.mode = 'single'; return dt; }, t0);
  check('the timer keeps an online game going while the tab is hidden (about real time)', r > 1.0 && r < 1.9, String(r));

  // ------------------------------------------------------------------ the hill (King of the Hill)
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await page.evaluate(() => document.querySelector('#objective button[data-o=koth]').click());
  await L.startSingle(page);
  await prep(page);
  const stepK = stepIn(page);
  await stepK(1);
  await page.evaluate(() => { document.getElementById('alerts').innerHTML = ''; window.__snd.length = 0; window.__game.alerts.recent.length = 0; });
  r = await page.evaluate(() => {
    const g = window.__game, a = g.alerts, h = g.hill, p = g.player, out = {};
    const take = () => { const r = { raised: a.recent.map((x) => x.key + (x.text ? ':' + x.text : '')), snd: window.__snd.slice() }; a.recent.length = 0; window.__snd.length = 0; return r; };
    out.koth = h.live;
    h.owner = 0; a.hillWatch(p); out.won = take();
    h.owner = 1; a.hillWatch(p); out.lost = take();
    h.owner = 2; a.hillWatch(p); out.other = take();                      // somebody else's hill changing hands: not our business
    h.owner = 0; h.contested = true; a.hillWatch(p); out.contested = take();
    h.contested = false; a.hillWatch(p);
    h.held[0] = 95; a.hillWatch(p); out.mine60 = take();                  // 55 s to go for us
    h.held[1] = 125; a.hillWatch(p); out.theirs = take();                 // 25 s to go for them: the 60 s and 30 s marks together
    h.held[1] = 141; a.hillWatch(p); out.theirs10 = take();
    a.hillWatch(p); out.nothing = take();
    return out;
  });
  check('King of the Hill is on', r.koth === true);
  check('taking the hill: the bell, no text of our own (the game toasts it)', r.won.raised.join() === 'hill:won' && r.won.snd.join() === 'chime', J(r.won));
  check('losing it: the horn', r.lost.raised.join() === 'hill:lost' && r.lost.snd.join() === 'alertDanger', J(r.lost));
  check('a third house taking it from a rival: nothing', r.other.raised.length === 0 && r.other.snd.length === 0, J(r.other));
  check('contested while we hold it: a callout', r.contested.raised.join() === 'hill:contested:The hill is contested!', J(r.contested));
  check('our win clock under a minute: the bell', r.mine60.raised.join() === 'hill:win60' && r.mine60.snd.join() === 'chime', J(r.mine60));
  check('their win clock at 60 and 30 s: horns', r.theirs.raised.some((x) => /^hill:lose1:60/.test(x)) && r.theirs.raised.some((x) => /^hill:lose1:30/.test(x)) && r.theirs.snd.every((x) => x === 'alertDanger'), J(r.theirs));
  check('...and at 10 s', r.theirs10.raised.some((x) => /^hill:lose1:10/.test(x)), J(r.theirs10));
  check('nothing repeats', r.nothing.raised.length === 0, J(r.nothing));

  // ------------------------------------------------------------------ the game-over screen
  r = await page.evaluate(() => { const g = window.__game; g.alerts.seen.clear(); g.endGame(-1, 'test'); return g.state; });
  await stepK(0.2);
  r = await page.evaluate(async () => {
    const { TIPS } = await import('/src/alerts.js');
    const el = document.getElementById('goTip');
    return { text: el.textContent, ok: TIPS.filter((x) => x.at === 'over' && x.koth !== false).some((x) => x.text.replace(/[\[\]]/g, '') === el.textContent), shown: !document.getElementById('gameover').classList.contains('hidden') };
  });
  check('the game-over screen has a tip (one of the over tips; not the King of the Hill one in that mode)', r.ok && r.shown, J(r));

  console.log(`${total} checks, ${failed} failed`);
  console.log('errors:', errors.join('\n') || 'none');
  if (errors.length) failed++;
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
