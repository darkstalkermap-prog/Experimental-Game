// Walk into a corner tower from the wall walk, up both flights of stairs, across the roof, and back down.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const res = await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[0];
    const W = (lx, lz) => c.toWorld(lx, lz);
    const fake = (keys) => ({ mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false, wheel: 0 }, down: (k) => keys.includes(k), hit: () => false });
    const state = () => { const l = c.toLocal(p.pos.x, p.pos.z); return [+l.x.toFixed(1), +l.z.toFixed(1), +(p.pos.y - c.center.y).toFixed(2)]; };
    const goTo = (lx, lz, maxT = 12, jump = false) => {
      const tgt = W(lx, lz);
      for (let i = 0; i < maxT * 60; i++) {
        const dx = tgt.x - p.pos.x, dz = tgt.z - p.pos.z;
        if (Math.hypot(dx, dz) < 0.3) break;
        p.yaw = Math.atan2(dx, dz);
        g.grid.clear(); g.grid.insert(p);
        p.update(1 / 60, fake(['KeyW']));
      }
      return state();
    };
    // teleport the hero onto the front-right corner of the wall walk
    const out = {};
    p.pos.copy(W(16.3, 12)); p.pos.y = c.center.y + 8; p.vel.set(0, 0, 0); p.vy = 0;
    out.onWalk = goTo(16.3, 16.3);
    out.entrance = goTo(19.4, 19.4);
    out.stairsA = goTo(22.2, 20.25);
    out.landing = goTo(25.2, 20.25);
    out.stairsB = goTo(25, 24);
    out.top = goTo(25, 25.4);
    out.deck = goTo(22, 24);
    out.deckWest = goTo(19.6, 25.2);
    // the roof edge stops you
    out.edgeEast = goTo(30, 24);
    out.edgeNorth = goTo(22, 30);
    // and back down
    goTo(25, 24); goTo(25, 22);
    out.backLanding = goTo(25.2, 20.25);
    out.backA = goTo(22.2, 20.25);
    out.backEntrance = goTo(19.4, 19.4);
    out.backWalk = goTo(16.3, 16.3);
    // jump test: from the deck over the stairwell
    return out;
  });
  console.log(JSON.stringify(res));
  const near = (a, b, t = 0.8) => Math.abs(a - b) < t;
  check('hero reaches the corner of the wall walk', near(res.onWalk[2], 8, 0.1), JSON.stringify(res.onWalk));
  check('hero walks into the tower at wall-walk level', res.entrance[0] > 18.5 && near(res.entrance[2], 8, 0.15), JSON.stringify(res.entrance));
  check('stairs A climb', res.stairsA[2] > 8.5 && res.stairsA[2] < 10.5, JSON.stringify(res.stairsA));
  check('the landing is 2.5 m up', near(res.landing[2], 10.5, 0.2), JSON.stringify(res.landing));
  check('stairs B climb on', res.stairsB[2] > 11 && res.stairsB[2] < 13, JSON.stringify(res.stairsB));
  check('stairs B climb to the roof deck level', res.top[2] > 12.4, JSON.stringify(res.top));
  check('hero walks onto the roof deck', near(res.deck[2], 13, 0.1) && res.deck[0] < 24, JSON.stringify(res.deck));
  check('hero can cross the roof deck', res.deckWest[0] < 21 && near(res.deckWest[2], 13, 0.1), JSON.stringify(res.deckWest));
  check('the east wall stops the hero', res.edgeEast[0] < 26.1, JSON.stringify(res.edgeEast));
  check('the roof edge stops the hero (north)', res.edgeNorth[1] < 26.5, JSON.stringify(res.edgeNorth));
  check('the hero can come back down the stairs', near(res.backEntrance[2], 8, 0.2), JSON.stringify([res.backLanding, res.backA, res.backEntrance]));
  check('and out onto the wall walk', near(res.backWalk[2], 8, 0.1) && res.backWalk[0] < 17.5, JSON.stringify(res.backWalk));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
