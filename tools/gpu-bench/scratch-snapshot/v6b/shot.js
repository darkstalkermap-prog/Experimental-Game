// Screenshots of the new HUD pieces at a window size (render loop on, so the scene is drawn).
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { chromium } = require('playwright');
const size = (process.argv[2] || '1280x720').split('x').map(Number);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('cw-map', 'small'); localStorage.setItem('cw-quality', 'low'); } catch (e) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:' + (process.env.CW_PORT || 8090) + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => { document.exitPointerLock(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { document.getElementById('pause').classList.add('hidden'); const g = window.__game; g.paused = false; g.phaseT = 9999; g.localFaction.gold = 100; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const g = window.__game, a = g.alerts;
    a.raise('a1', { text: 'Your north gate is under attack!', tone: 'danger', pos: g.castles[0].gate.pos, icon: '🏰' });
    a.raise('a2', { text: 'Enemy army approaching from the north-east!', tone: 'warn', icon: '⚔' });
    a.raise('a3', { text: 'Wave 3 marches in 10 s', tone: 'info', icon: '⏳' });
    a.raise('a4', { text: 'You have 460 gold to spend (B)', tone: 'good', icon: '💰' });
    g.player.kills += 5;
    a.tip('Hold [C] to duck: arrows fly over your head and a battlement hides you completely.');
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: S + `v6b/shot_${size[0]}x${size[1]}.png` });
  // the away panel
  await page.evaluate(() => {
    const g = window.__game, a = g.alerts;
    a.leave();
    a.away.at -= 95000; a.away.round -= 3; a.away.kills -= 12; a.away.deaths -= 1; a.away.earned -= 214;
    a.away.events.push({ label: 'Castle under attack!', tone: 'danger' }, { label: 'Castle under attack!', tone: 'danger' }, { label: 'Breach in the east wall!', tone: 'danger' });
    a.back();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: S + `v6b/shot_away_${size[0]}x${size[1]}.png` });
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
