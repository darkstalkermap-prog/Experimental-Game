# Graphics and performance push: shared brief (read all of it, then your own brief A1..A7)

S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad   (your tools and notes live in $S/gfx/)

## The ask (the user's words)
"Take as much time as you need and use as many agents as possible, work your hardest to increase and enhance the quality of graphics
and performance so the characters and world look good."
Seven of you work in parallel, each on one area, each in your own git worktree. Do real work, to a high standard: LOOK at your
results (you can view PNGs with the Read tool), criticise them, iterate until they look good. Quality matters more than speed.

## The game
Castle Wars: a first-person medieval castle-siege game for 1-4 players (host-authoritative multiplayer), a static ES-module Three.js
r160 page (`vendor/three.module.min.js`), no build step, NO image assets (everything is procedural: canvas textures, vertex colours,
shaders). Four castles, armies of soldiers marching in waves, siege engines, six hero classes, Conquest / King of the Hill / Hero Mode,
a practice courtyard. README.md describes it. `src/` has the code (about 17k lines); `index.html` has the HUD markup and CSS.

## What looks and runs badly today (baseline screenshots: $S/gfx/baseline/*.png, numbers: $S/gfx/baseline/base_medium_high.json)
1. The valley wall behind the battlefield is a flat beige ramp with trees stuck to it: the first thing you see in every direction.
2. The first-person sword and shield are crude blocks (a huge flat blue disc fills the lower left of the screen).
3. Soldiers are stiff faceless mannequins; every hero class shares the same third-person "lord" body.
4. Grass is sparse and spiky, the ground is flat colour, trees are flat-shaded cones and blobs, rocks are plain dodecahedra.
5. Sky/fog/lighting are dull and the shadow edge shimmers as you move; there is no post-processing at all.
6. Effects are plain round point sprites; arrows, bolts and abilities are basic.
7. Performance (medium map, high quality, 1280x720, round 11 with 146 soldiers and 12 siege engines):
   1,750 draw calls per frame (about 1,100 main pass + 650 shadow pass), 812k triangles, 2,380 meshes. Soldiers alone are about 950
   meshes (9+ each, 332k triangles); terrain 98k triangles (one 49k-vertex mesh for the whole 440 m map); grass 48k; trees 113k;
   castles 54k in 338 meshes. `renderer.render` costs 13-28 ms of JS per frame even in software GL (it tracks the draw-call count);
   the simulation costs 2.3 ms per frame.
   TARGET: at most 600 draw calls (shadow pass included) and 500k triangles in that scene, no loss of simulation speed, no console errors.

## Rules for everyone
- VISUALS AND PERFORMANCE ONLY. Gameplay is untouched: stats, hit boxes, collision and physics geometry, ranges, timings, AI, rules, UI
  behaviour. No network protocol changes: everything you draw is local to each browser and must come out the same on the host and on
  guests (they build it from replicated state). Hero/units/castle state flows exactly as before.
- Graphics settings come from the live object `Q` in `src/quality.js` (read the file: level, pixelRatio, shadows, crowdShadowDist,
  lodScale, detail, grass, grassDist, trees, viewDist, terrain, wind, particles, post, exposure). Read `Q` (and `onQuality(fn)` to react
  to a change); do not test the quality name yourself. Only A4 edits quality.js. If you want a tunable that does not exist, say so in
  your report and use `Q.detail` / `Q.level` meanwhile.
- Several of you will add shader code to built-in materials. three.js keeps ONE onBeforeCompile per material, so never assign it:
  use `patchMaterial(material, 'yourKey', (shader) => {...})` from `src/shaderhook.js` (read its header: keys name the shader code).
  Effects for every material (fog) are patched once into `THREE.ShaderChunk` instead (A4 does that).
- No new dependencies, no downloaded images or fonts. Only A4 may vendor three.js addons into `vendor/` (r160 examples are unpacked at
  $S/three160/package/examples/jsm/ ; MIT licence; list them in the README). Everyone else writes their own code.
- Robustness: no console errors; works on all three map sizes, in the practice courtyard and in Hero Mode; resources you create are
  disposed when the world is rebuilt (`Game.dispose`) or live in module-level caches that survive it (see how `sharedModelResources()`
  and `materials()` are handled); Low quality must stay fast and plain, Ultra may spend more.
- Performance discipline: every feature has a budget; measure with `prof.js` before and after; share geometries and materials; instance
  repeated things; no per-frame allocations in hot code (reuse vectors/matrices/colours); `matrixAutoUpdate = false` on static objects;
  shadow casters only where they matter. A prettier frame that costs more draw calls needs a matching saving elsewhere.
- Style: match the surrounding code (2-space indent, single quotes, semicolons, comments that say why). No AI or model names anywhere
  in the repo (code, comments, commit messages).
- FILES: edit only the files your brief says you own, plus tiny local edits elsewhere when unavoidable (no reformatting, no moving
  code, keep hunks small: the orchestrator merges seven branches by hand). Put new logic in new modules. The ownership map is below.

## Ownership map
A1 characters      models.js, units.js (visual functions only), crowd.js (new), unittex.js (new); game.js: the unit LOD loop (~line 1418) and
                   unit-render hooks; player.js: buildBody and hero body parts only.
A2 first person    player.js viewmodel functions (buildViewModel, rebuildWeapons, updateViewModel and helpers), viewmodel.js (new).
A3 world           world.js terrain/forest/rocks/centre piece, grass.js, physics.js height generation outside the play area only,
                   foliage.js / terrainmat.js / terraintex.js (new), textures.js only grassDetailTexture.
A4 atmosphere      world.js createSky/createLights/followShadow and the fog, quality.js, post.js (new), main.js renderer + render loop,
                   game.js setQuality, settings.js, index.html quality UI, vendor/ addons.
A5 castles         castle.js, siege.js (visuals), materials.js, textures.js (castle textures), upgrades.js (visual parts), props.js (new).
A6 effects         fx.js, projectiles.js, magic.js, aimring.js, classes.js (ability VISUALS only), camfx.js (new).
A7 performance     perf.js, perfutil.js (new), ui.js (HUD/minimap/DOM update costs), game.js update-loop internals, physics.js / nav.js / ai.js /
                   alerts.js / hill.js hot paths, units.js non-visual code (think, steering), netsync.js allocations only if safe.

## Environment and tools
- Your worktree is your current directory (created by the harness). FIRST run `git merge --ff-only main` (it must give you src/quality.js and
  src/shaderhook.js; main is at 1db6e51 or later). Never touch /home/user/experimental-game itself.
- Syntax check (plain `node --check` misses errors in these modules):
  `for f in src/*.js server/*.js; do node --input-type=module --check < "$f" || echo FAIL $f; done`
- Serve YOUR worktree on YOUR port (A1 8211, A2 8212, A3 8213, A4 8214, A5 8215, A6 8216, A7 8217; never 8080/8090/8101-8103):
  `cd <your worktree> && NODE_PATH=/home/user/experimental-game/node_modules PORT=<port> nohup node server/server.js > $S/gfx/server<port>.log 2>&1 &`
- Run every browser test through the shared lock: `CW_PORT=<port> $S/gfx/b.sh <script.js> [args]`. Headless Chromium renders in software
  here and the machine has 4 cores: two browsers at once make everything slow and flaky, so b.sh makes you queue. Waiting is fine.
  Kill your server and any leftover chromium/node you started when you finish (use `kill <pid>`, never `pkill -f` with a pattern).
- Harness: `$S/simlib.js` (launch / startSingle / step; the page exposes `window.__game`; `requestAnimationFrame` is stubbed unless
  `raf: true`, so tests advance time with `g.update(dt); g.input.endFrame()`); `$S/gfx/prof.js` (draw calls, triangles, who owns them,
  timing: `CW_PORT=.. b.sh $S/gfx/prof.js medium high 6`); `$S/gfx/shots.js` (a set of viewpoints: copy it into `$S/gfx/<yourid>/`,
  adapt it, write images only under your own directory; set `raf: true` for anything that must render). Baselines: $S/gfx/baseline/.
  Software GL is slow: iterate at 960x540 or less, use 1280x720 for final checks only, and take few screenshots. Teleporting the
  player (with `g.player.buffs.add('ghost', 1e6)`) is how the existing scripts place the camera.
- Test style: copy `$S/v3/classswitch.js`, `$S/v8c/herohud.js`, `$S/v10/summon.js`. Make tests deterministic (the hero can die, AI buys
  things at random). Before you finish run, each through b.sh: `v2/smoke.js`, `v3/basics.js`, `v3/classswitch.js` and your own tests.
- Usage is limited (the account has hit its limit before): grep before reading big files, read only what you need, keep tool output
  short, do not re-run passing tests, no long explorations. COMMIT EARLY AND OFTEN on your worktree branch (WIP commits are fine) so
  nothing is lost if you are interrupted. The final commit message ends with a blank line and exactly these two lines:
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012vMGjmdremazzBEZVSfDaT
  No push, no pull request, no rebase onto anything: the orchestrator merges.

## Final report (at most 25 lines, no code)
Branch + last commit; files changed and added; what you improved, with before/after numbers (prof.js) and the screenshot paths that
show it; known gaps and anything you would do next; the exact shared-file spots you touched (file + function) so merging is quick;
any `Q` field you wish existed. If you ran out of time or usage, say what is unfinished and what state the branch is in.
