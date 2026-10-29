const { launch, startSingle } = require('./simlib');
(async () => {
  const { browser, page, errors } = await launch({ viewport: { width: 900, height: 640 }, raf: true, quality: 'low' });
  const state = () => page.evaluate(() => ({ paused: window.__game.paused, locked: window.__game.input.locked, shop: window.__game.ui.shopOpen, pause: !document.getElementById('pause').classList.contains('hidden'), options: !document.getElementById('options').classList.contains('hidden'), controls: !document.getElementById('controls').classList.contains('hidden'), confirm: !document.getElementById('quitConfirm').classList.contains('hidden') }));
  const vis = async (id) => page.evaluate((id) => !document.getElementById(id).classList.contains('hidden'), id);
  // wait until the page state satisfies cond (a function body returning bool)
  const until = async (cond, ms = 8000) => { try { await page.waitForFunction(cond, null, { timeout: ms, polling: 50 }); return true; } catch (e) { return false; } };
  const frames = (n = 3) => page.evaluate((n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const click = async (sel) => { await frames(); const [x, y] = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel); await page.mouse.click(x, y); };
  const key = (code) => page.evaluate((code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); }, code);
  let failures = 0;
  const ok = (name, cond) => { if (!cond) failures++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); };
  const hidden = (id) => `document.getElementById('${id}').classList.contains('hidden')`;
  const G = 'window.__game';

  // ---- main menu: options and controls panels
  await click('#menuOptions'); ok('main menu Options opens', await until(`!${hidden('options')}`));
  await key('Escape'); ok('Esc closes Options', await until(hidden('options')));
  await click('#menuControls'); ok('main menu Controls opens', await until(`!${hidden('controls')}`));
  ok('controls list is in the panel', await page.evaluate(() => document.querySelectorAll('#controls .controls b').length > 15));
  await click('#controlsBack'); ok('Controls Back closes', await until(hidden('controls')));

  // ---- start a game, with a stand-in for the browser's pointer lock
  await startSingle(page);
  // headless Chromium really grants the pointer lock, which pins the mouse at (0,0): let it go and use a stand-in instead
  await page.evaluate(() => document.exitPointerLock && document.exitPointerLock());
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const i = window.__game.input;
    i.lock = () => { if (i.locked) return; i.locked = true; setTimeout(() => i.onLockChange && i.onLockChange(true), 0); };
    i.unlock = () => { if (!i.locked) return; i.locked = false; setTimeout(() => i.onLockChange && i.onLockChange(false), 0); };
    window.__game.ui.showPause(false); window.__game.paused = false; i.locked = true;
  });
  let s = await state(); ok('in game, no menu showing', !s.pause && !s.paused);

  await key('Escape'); ok('Esc opens the game menu', await until(`${G}.paused && !${hidden('pause')} && !${G}.input.locked`));
  ok('menu offers Resume / Options / Controls / Quit', await page.evaluate(() => ['resume', 'pauseOptions', 'pauseControls', 'quitBtn'].every((id) => document.getElementById(id).offsetParent !== null)));
  await page.waitForTimeout(500);
  const t0 = await page.evaluate(() => window.__game.time); await page.evaluate(() => { for (let k = 0; k < 30; k++) window.__game.update(1 / 30); });
  ok('single player world is frozen while the menu is open', (await page.evaluate(() => window.__game.time)) === t0);
  await key('Escape'); ok('Esc again resumes and recaptures the mouse', await until(`!${G}.paused && ${hidden('pause')} && ${G}.input.locked`));

  // the browser's own Esc: it frees the mouse and the page hears the pointer-lock change; a key event may follow right behind it
  // (same moment: the release first, then the key event, as some browsers send them)
  await page.evaluate(() => { const i = window.__game.input; i.locked = false; i.onLockChange(false); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); });
  ok('browser Esc (pointer lock released) opens the menu', await until(`${G}.paused && !${hidden('pause')}`));
  await page.waitForTimeout(600);
  s = await state(); console.log('state after release+Esc:', JSON.stringify(s)); ok('an Esc key event right behind the release does not close the menu again', s.pause && s.paused);
  await page.waitForTimeout(500);
  await click('#resume');
  const resumed = await until(`!${G}.paused && ${hidden('pause')} && ${G}.input.locked`);
  if (!resumed) console.log('diag', JSON.stringify(await state()), await page.evaluate(() => { const r = document.getElementById('resume').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [r.x, r.y, r.width, r.height, e && (e.id || e.tagName), window.innerWidth, window.innerHeight]; }));
  ok('Resume button closes the menu and recaptures the mouse', resumed);

  // options inside the game menu
  await key('Escape'); await until(`!${hidden('pause')}`); await page.waitForTimeout(500);
  await click('#pauseOptions'); ok('Options opens on top of the game menu', await until(`!${hidden('options')}`) && (await vis('pause')));
  await page.evaluate(() => { const e = document.getElementById('optMusic'); e.value = 25; e.dispatchEvent(new Event('input')); const f = document.getElementById('optFov'); f.value = 90; f.dispatchEvent(new Event('input')); const m = document.getElementById('optSens'); m.value = 80; m.dispatchEvent(new Event('input')); });
  const st = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('cw-settings')), fov: window.__game.player.baseFov, sens: window.__game.player.sensitivity, music: window.__game.audio.vol.music }));
  ok('slider changes apply and are remembered: ' + JSON.stringify(st), st.stored.music === 25 && st.stored.fov === 90 && st.fov === 90 && Math.abs(st.sens - 0.004) < 0.0001 && st.music === 0.25);
  await key('Escape'); ok('Esc closes Options but keeps the game menu', await until(`${hidden('options')} && !${hidden('pause')}`));
  await click('#pauseControls'); ok('Controls opens', await until(`!${hidden('controls')}`));
  await key('Escape'); ok('Esc closes Controls but keeps the game menu', await until(`${hidden('controls')} && !${hidden('pause')}`));
  await click('#quitBtn'); ok('Quit asks to confirm', await until(`!${hidden('quitConfirm')}`));
  await click('#quitNo'); ok('Stay cancels the quit', await until(hidden('quitConfirm')) && (await vis('pause')));

  // the shop still closes with Esc and does not open the menu
  await click('#resume'); await until(`!${G}.paused && ${G}.input.locked`);
  await key('KeyB'); ok('B opens the shop', await until(`${G}.ui.shopOpen`));
  await key('Escape'); ok('Esc closes the shop without opening the menu', await until(`!${G}.ui.shopOpen`) && (await page.waitForTimeout(400), !(await vis('pause'))));

  // online-style: the world keeps running under the menu, and the menu says so
  await page.evaluate(() => { window.__game.mode = 'host'; });
  await key('Escape'); await until(`!${hidden('pause')}`);
  ok('menu note explains the battle goes on in online games', (await page.textContent('#pauseNote')).includes('goes on'));
  console.log('errors:', errors.join('\n') || 'none');
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  await browser.close();
})();
