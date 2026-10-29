// Every console message of any kind (warnings included) over a short real run: menu, a game, a quality cycle, a practice court. usage: CW_PORT=8220 node warn.js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await ctx.newPage();
  const seen = new Map();
  page.on('console', (m) => { const k = m.type() + ': ' + m.text().slice(0, 200); seen.set(k, (seen.get(k) || 0) + 1); });
  page.on('pageerror', (e) => { const k = 'pageerror: ' + e.message.slice(0, 200); seen.set(k, (seen.get(k) || 0) + 1); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  for (const q of ['low', 'ultra', 'medium', 'high']) {
    await page.evaluate((q) => window.__game.setQuality(q), q);
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => { const g = window.__game; g.paused = false; for (let i = 0; i < 20 * 120; i++) { g.update(0.05); g.input.endFrame(); } });
  await page.waitForTimeout(3000);
  for (const [k, n] of seen) console.log(String(n).padStart(4), k);
  console.log('distinct messages:', seen.size);
  await browser.close();
})();
