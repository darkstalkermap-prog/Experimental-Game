# GPU cost wave 2: benchmark tools, results and hand-off (state of 2026-10-29)

This branch only adds `tools/gpu-bench/`; the game code on it is exactly `main` (6a392fb). It holds everything needed to continue the second GPU-trimming
wave: the scripts that measure frame cost and look, the baseline and per-component numbers, the briefs the four helper agents were given, what each of them
had done when the account's weekly usage limit stopped them (resets Nov 4, 01:00 UTC), and a snapshot of the regression scripts the briefs refer to.
Nothing here has been merged into `main`, and none of the unfinished branches has been verified in the game beyond a syntax check.

## The live game
- Published page (built from `main` = 6a392fb, the state before this wave): https://claude.ai/artifact/T4V1UhjXUKz5dNhM8F7Bwm
- GitHub Pages address from the project README: https://darkstalkermap-prog.github.io/Experimental-Game/ (it serves `main` once Pages is switched on for the
  repository; it could not be opened from the sandbox that saved this, so it is not confirmed).
- None of the branches below is deployed anywhere. To try one: check it out, `npm install`, `PORT=8250 node server/server.js`, open http://localhost:8250/

## Branches (GitHub: darkstalkermap-prog/experimental-game)
| branch | commit | what it holds | state |
|---|---|---|---|
| `gpu2/g1-lighting-wip` | 38dec12 | `src/skylight.js` (new) + `src/atmosphere.js`: the filtered sky baked into a small 2D lookup table (64x64 per band, 16 roughness bands) that replaces the per-pixel PMREM cube-map walk in every lit shader; rough non-metals skip the second lookup and the multi-scattering terms | unfinished: stopped mid-edit ("no haze band, 15 roughness steps over 16 bands"); syntax check only, never timed |
| `gpu2/g2-post-shadows-wip` | 2f6821c | one line in `src/main.js`: `?noaa=1` creates the canvas without its own antialiasing (an experiment switch) | barely started: this is its only code change |
| `gpu2/g4-world-crowd-wip` | 021eb42 | terrain splat shader that skips texture reads whose result the masks would drop (new per-vertex `aRoad`, roads computed from their line segments near a road only); sky haze colours folded to constants; a fifth crowd detail level (`shapes.js`, `modelkit.js`, `models.js`, `crowd.js`); `unitmat.js` skips faded fine patterns | unfinished: stopped while updating the offline triangle counter for 5 levels; syntax check only, never timed |
| (no code branch for G3, castles) | - | the castles agent changed no code: it stopped after writing an overdraw probe. The probe and its heat maps are in `agents/G3/` here | its heat maps (`agents/G3/shots/heat_*.png`) show where castle fragments pile up; no numbers were recorded |
| `gpu2/bench-tools` | this branch | `tools/gpu-bench/` | complete |

The local branch names of the three code branches are `worktree-agent-<id>` (worktrees under `.claude/worktrees/`); they were pushed under the names above.
`main` was not touched. Do not merge the WIP branches as they are: run the checks below first.

## What the wave is for
After the graphics overhaul (7 agents, merged, `main`) the game is far richer and the CPU side is much cheaper (draw calls 1,750 -> ~150), but the GPU
side costs more than the original at Medium and High. Fixed scene = the game just started, garrisons only, three fixed cameras (castle front, field,
sunward), 1280x720, software GPU (SwiftShader), median of 5 frames per view, mean of the three, milliseconds, noise about +-5%:

| | Low | Medium | High | programs | draw calls | triangles |
|---|---|---|---|---|---|---|
| original game (1db6e51, before the overhaul) | 506 | 568 | 642 | 22 / 29 / 29 | 225 / 242 / 242 | 181k / 215k / 247k |
| `main` now (6a392fb) | 347 | 706 | 1073 | 33 / 42 / 48 | 71 / 115 / 144 | 108k / 185k / 274k |
| **target** for the four areas together | <= 347 | <= 568 | <= 760 | | not higher | not higher |

The scene is fill-bound (High: 640x360 = 492 ms, 1280x720 = 1069, 1920x1080 = 1892: about 300 ms fixed + 835 ms per megapixel).
Where the time goes at High / Medium, one thing switched off at a time (`results/ablation.txt`, raw rows in `results/cost_high.txt`, `results/cost_medium.txt`):
castles hidden -424 / -352 (castle pixels cost ~300 ms of lit shading and shadow lookups plus ~130 ms of plain rasterisation although they cover few pixels:
probably overdraw, which G3 set out to measure), environment map off -279 / -236, MSAA off -227 / -208, all shadows off -194 / -136, terrain hidden -258 / -173 (the splat shader itself is only ~65 ms),
HDR target as R11F_G11F_B10F -96 / -64, post passes + empty-scene floor 110 / 55. The software GPU exaggerates texture fetches and MSAA, so prefer trims that also
cut ALU, memory traffic and overdraw, and look at before/after frames (a visible difference is a loss).

## Tools (`scripts/`)
All run against a game server (`PORT=<p> node server/server.js` from a checkout) and need `playwright` with Chromium (`npm i playwright`).
- `fixed.js <low|medium|high|ultra> [small] [WxH]`: the fixed-scene benchmark. One JSON line (ms per view, mean, calls, tris, programs, errors). Works on any commit
  (draws through `gfx.renderFrame` when the page has it, `renderer.render` otherwise). `SHOT=<dir>:<tag>` also saves the three frames as `<dir>/<tag>_<q>_<view>.png`.
  `CW_PORT=8250 SHOT=/tmp/shots:before node fixed.js high`
- `imgdiff.py a.png b.png [diff.png]`: mean abs difference, signed mean, p99 and an amplified difference picture (Pillow).
- `cost.js <q> <ablations|all|none>` and `cost2.js` (same plus castle ablations `cBasic cNoNormal cNoMap cNoRecv cNoCast cAniso1 cCount`): per-component cost table;
  `FF=0 EXTRA=0` gives the fixed scene (no battle), the default is a ~6 minute battle. Rows are steady-frame ms, far-shadow-map frame ms, amortised ms, calls, triangles.
- `prof.js <small|medium|large> <q> <minutes>`: late-game battle profile (draw calls, triangles, who owns them); draw calls and triangles must not rise.
- `shots.js <tag> <map> <quality>`: a set of viewpoints in a running game (set `OUT` for the folder).
- `simlib.js`: the harness the scripts use (`launch`, `startSingle`, `step`); `b.sh`: runs a script under a lock so that only one browser runs at a time.
- `extract.py <transcript.jsonl>`: pulls the benchmark lines and the last messages out of an agent transcript.

## Results the agents had when they stopped (`agents/<id>/`)
- G1 (lighting): `before.txt` fixed-scene before numbers (High 1081, Medium 725, Low 361), `progs_before*.json` + `progsum.js`/`programs.js` the shader-program list at
  each level (48 / 42 / 33 programs; 48 in a battle), `lit.js`, `skyfit.js`, `shfit.js`, `ggx.js`, `dfg.js` the fits and checks behind the sky table, `cmp.sh` frame comparison.
  No "after" timing was recorded.
- G2 (post, shadows): `exp.js`, `variants.js`, `dbg.js`, `crops.py` (MSAA/post experiments and edge crops). No numbers recorded.
- G3 (castles): `probe.js` (castle pixel share and fragment overdraw per material group, draw order, ablations by material key; `CW_PORT=<p> node probe.js <q> <over|order|abl|all>`)
  and `shots/heat_*.png` (overdraw heat maps). No numbers recorded.
- G4 (world, crowd): `before_fixed.txt` (High 1064, Medium 714, Low 358), `exp1_high.txt` / `exp2_high.txt` (terrain, sky, grass, foliage ablations at High, base ~1077:
  terrain hidden 649, plain vertex colours 873, far ring hidden 934, near chunks hidden 793, grass off ~990, foliage off ~1019, sky off ~1003), `battle_before_high.txt`
  (late-battle frame at High, base 1678: crowd hidden 1243, terrain hidden 1230, grass 1556, foliage 1582, sky 1645, fx 1634; the crowd is vertex-bound: 250k triangles in 53 batches),
  `battle.js`, `exp.js`. No "after" timing was recorded.

## Plan per area (from `briefs/gpu2.md`, which has the full text)
G1 lighting: finish and time the sky table; cheaper BRDF terms for rough dielectrics; audit the 48 programs. G2: MSAA/FXAA policy per level (MSAA is ~25% of the frame
here), R11F_G11F_B10F HDR target (check banding), bloom/FXAA passes, shadow lookups (early out on N.L <= 0, tap rotation, hardware PCF, fade to the far cascade), preset
changes (only G2 edits the PRESETS in `src/quality.js`). G3: find and cut the castle overdraw and shading cost (hidden faces in the visual meshes only, draw order,
distance material LOD, the stone shader); colliders must stay identical (`scratch-snapshot/gfx/integ/colliders.body.js` + `colldiff.py` + `coll_base.json`). G4: finish the
terrain and crowd work, grass/foliage overdraw, sky cost, crowd triangles per level in a battle frame.
Rules for all: visuals and performance only (no gameplay, collision, network or rule changes), no visible loss, Low stays plain and fast, Auto and the dynamic resolution keep working.

## Checks before anything is merged
Syntax: `for f in src/*.js server/*.js; do node --input-type=module --check < "$f" || echo FAIL $f; done`. Then, through `scripts/b.sh`: the fixed-scene numbers at low/medium/high before
and after, `prof.js medium high 6`, and the regression list `scratch-snapshot/gfx/integ/list_all.txt` (+ `list_extra.txt`) with `scratch-snapshot/gfx/integ/regress.sh <port> <outfile> [list]`.
`scratch-snapshot/` is a verbatim copy of the scratch folder's test scripts (they name that folder in full): copy it somewhere and run `relocate.sh <copy>` on the copy first.
The briefs say `$S/gfx/...` for the scratch folder; here that is `scripts/` (tools), `agents/` (per-agent files) and `scratch-snapshot/` (tests).
