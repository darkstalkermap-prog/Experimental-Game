// Shared helpers for the online-play tests: several pages in one browser, a host and N clients, driven by hand.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHIM = fs.readFileSync(path.join(__dirname, 'roomshim.js'), 'utf8');
// CW_PORT: a private server (it serves the page and the relay on one port); otherwise the shared ones on 8080 / 8090
const RELAY = process.env.CW_PORT ? `http://localhost:${process.env.CW_PORT}/` : 'http://localhost:8080/';
const STATIC = process.env.CW_PORT ? `http://localhost:${process.env.CW_PORT}/` : 'http://localhost:8090/';
const PEERQ = 'peerhost=localhost&peerport=9000&peerice=none';

exports.RELAY = RELAY; exports.STATIC = STATIC; exports.PEERQ = PEERQ;

// transport: 'relay' | 'room' | 'peer'
exports.session = async function (transport, opts = {}) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const ctxs = [];
  const shared = transport === 'room' ? await browser.newContext({ viewport: { width: 320, height: 200 } }) : null;
  if (shared) {
    // pretend to be a claude.ai view: a live `room` capability (BroadcastChannel based) and no Node server
    await shared.addInitScript(SHIM);
    await shared.route('**/api/ping', (r) => r.fulfill({ status: 404, body: 'no' }));
  }
  const mkctx = async () => {
    const ctx = shared || await browser.newContext({ viewport: { width: 320, height: 200 } });
    if (!shared) ctxs.push(ctx);
    // no render loop: game.update is driven by the test
    await ctx.addInitScript(() => { let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); });
    return ctx;
  };
  const baseUrl = transport === 'relay' ? RELAY : STATIC;
  const q = transport === 'peer' ? PEERQ : '';
  const pages = [];
  const open = async (tag, join = null) => {
    const ctx = await mkctx();
    const page = await ctx.newPage();
    page.tag = tag;
    page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 3).join('\n')}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
    const url = baseUrl + '?' + [q, join ? 'join=' + join : ''].filter(Boolean).join('&');
    await page.goto(url, { timeout: 120000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000, polling: 100 });
    pages.push(page);
    return page;
  };
  const click = (page, id) => page.evaluate((id) => document.getElementById(id).click(), id);
  const host = async (name = 'Arthur') => {
    const page = await open('host');
    await click(page, 'mpBtn');
    await page.waitForSelector('#online:not(.hidden)', { timeout: 30000 });
    await page.fill('#pname', name);
    await click(page, 'hostBtn');
    await page.waitForSelector('#lobby:not(.hidden)', { timeout: 60000 });
    const code = (await page.textContent('#roomCode')).trim();
    return { page, code };
  };
  const join = async (code, name, tag) => {
    const page = await open(tag || name, code);
    await page.waitForSelector('#online:not(.hidden)', { timeout: 30000 });
    await page.fill('#pname', name);
    await click(page, 'joinBtn');
    await page.waitForSelector('#lobby:not(.hidden)', { timeout: 60000 });
    return page;
  };
  const close = async () => { try { await browser.close(); } catch (e) { /* ignore */ } };
  return { browser, errors, pages, open, host, join, click, close, transport };
};

// start the match from the host's lobby
exports.startMatch = async function (S, hostPage, clients, { coop = false, difficulty = 'normal' } = {}) {
  // the host's lobby must list everybody (and clients must have heard of it) before the start
  const want = clients.length + 1;
  await hostPage.waitForFunction((n) => [...document.querySelectorAll('#lobbyList li')].filter((li) => !/AI lord/.test(li.textContent)).length === n, want, { timeout: 120000, polling: 100 });
  if (coop) await hostPage.evaluate(() => document.querySelector('#lobbyModes button[data-mode=coop]').click());
  for (const c of clients) await c.waitForFunction((n) => [...document.querySelectorAll('#lobbyList li')].filter((li) => !/AI lord/.test(li.textContent)).length === n, want, { timeout: 120000, polling: 100 });
  await hostPage.waitForTimeout(400);
  await S.click(hostPage, 'startOnline');
  for (const c of clients) await c.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 240000, polling: 100 });
  await hostPage.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 240000, polling: 100 });
  for (const p of [hostPage, ...clients]) await p.evaluate(() => { window.__game.paused = false; });
};

// advance every page by `secs` of game time in `chunk`-second slices, host first so snapshots flow
exports.step = async function (all, secs, { dt = 1 / 30, chunk = 0.5, settle = 25 } = {}) {
  const n = Math.round(chunk / dt);
  const slices = Math.ceil(secs / chunk);
  for (let i = 0; i < slices; i++) {
    for (const p of all) {
      await p.evaluate(([n, dt]) => { const g = window.__game; g.paused = false; for (let k = 0; k < n; k++) g.update(dt); }, [n, dt]);
    }
    if (settle) await all[0].waitForTimeout(settle);
  }
};

// Freeze the host, push one last snapshot, wait for every client to apply it, and describe both sides.
exports.syncCheck = async function (host, clients) {
  await host.evaluate(() => { const g = window.__game; g.sync.t = 10; g.sync.update(0); window.__finalTime = g.time; });
  const describe = () => {
    const g = window.__game;
    const per = (fn) => [0, 1, 2, 3].map(fn);
    const alive = g.units.filter((u) => u.alive);
    const ids = g.units.map((u) => u.id).sort((a, b) => a - b);
    let h = 0; for (const id of ids) h = (h * 31 + id) % 1000003;
    return {
      round: g.round, phase: g.phase, phaseT: Math.round(g.phaseT * 10) / 10,
      units: g.units.length, alive: alive.length, idHash: h,
      aliveByTeam: per((t) => alive.filter((u) => u.team === t).length),
      laneByTeam: per((t) => g.laneCount(t)),
      garrisonByTeam: per((t) => g.garrisonCount(t)),
      ranks: per((t) => alive.filter((u) => u.team === t).reduce((s, u) => s + u.rank, 0)),
      gold: g.factions.map((f) => Math.floor(f.gold)),
      troopCap: g.factions.map((f) => f.troopCap),
      levies: g.factions.map((f) => f.levies),
      training: g.factions.map((f) => f.training),
      eliminated: g.factions.map((f) => (f.eliminated ? 1 : 0)),
      isPlayer: g.factions.map((f) => (f.isPlayer ? 1 : 0)),
      target: g.factions.map((f) => (f.siegeTarget ? f.siegeTarget.team : -1)),
      autoTarget: g.factions.map((f) => { const t = g.siegeTarget(f); return t ? t.team : -1; }),
      formation: g.factions.map((f) => f.formation),
      siege: g.siege.filter((s) => s.alive).map((s) => s.id).sort((a, b) => a - b).join(','),
      siegeCount: g.siege.length,
      castles: g.castles.map((c) => [Math.round(c.gate.hp), c.gate.alive ? 1 : 0, Math.round(c.keep.hp), c.fallen ? 1 : 0, c.towerLevel, c.wallLevel, c.gateLevel, c.gateLocked ? 1 : 0, c.walls.filter((w) => w.breakable && w.alive).length, c.walls.filter((w) => w.breakable).reduce((s, w) => s + Math.round(w.hp), 0)].join('/')),
      humans: g.humans.map((x) => x.team).sort().join(','),
    };
  };
  const hs = await host.evaluate(`(${describe.toString()})()`);
  // wait for each client to have applied the snapshot that matches the host's round/phaseT/unit count
  const out = [];
  for (const c of clients) {
    let cs = null;
    for (let i = 0; i < 60; i++) {
      cs = await c.evaluate(`(${describe.toString()})()`);
      if (cs.units === hs.units && cs.round === hs.round && Math.abs(cs.phaseT - hs.phaseT) < 0.15) break;
      await c.waitForTimeout(100);
    }
    out.push(cs);
  }
  const diffs = [];
  out.forEach((cs, ci) => {
    for (const k of Object.keys(hs)) {
      const a = JSON.stringify(hs[k]), b = JSON.stringify(cs[k]);
      if (a !== b) diffs.push(`${clients[ci].tag}.${k}: host=${a} client=${b}`);
    }
  });
  return { hs, cs: out, diffs };
};
