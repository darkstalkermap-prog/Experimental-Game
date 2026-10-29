# Second GPU wave: Medium and High frame cost back to the original's level, with the new look kept

S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad   (tools and notes live in $S/gfx/)
Read $S/gfx/brief.md first for the project rules (VISUALS AND PERFORMANCE ONLY: gameplay, collision geometry, ranges, timings, AI, rules and the network protocol are untouched; the `Q` object in
src/quality.js; `patchMaterial` from src/shaderhook.js for shader additions; code style; no AI or model names in the repo; no per-frame allocations). Its ownership map is REPLACED by the one below.
The graphics overhaul is merged (main = 6a392fb). It made the game much richer and the CPU side much cheaper (draw calls 1,750 -> ~150, submit 12.8 -> 2.1 ms), but the GPU side costs more than the
original at Medium and High (Low is already faster than the original). The user wants it fixed WITHOUT losing the look. You are one of four agents, each on its own area, each in its own git worktree.

## Your worktree and rules
- Your worktree is your current directory. FIRST run `git merge --ff-only main`. Never touch /home/user/experimental-game itself. Commit after every batch that passes (the account's usage limit can stop you at any time).
  No push. Commit message: a clear subject, a short body that says why, then a blank line and exactly these two lines:
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012vMGjmdremazzBEZVSfDaT
- Serve YOUR worktree on YOUR port (G1 8261, G2 8262, G3 8263, G4 8264):
  `cd <your worktree> && NODE_PATH=/home/user/experimental-game/node_modules PORT=<port> nohup node server/server.js > $S/gfx/server<port>.log 2>&1 &`
  Already running and never to be stopped: 8250 = the ORIGINAL game (1db6e51, before the overhaul), 8252 = main as it is now (6a392fb, frozen: your "before").
- Every browser run goes through the lock: `CW_PORT=<port> $S/gfx/b.sh <script.js> [args]` (headless software GL, 4 cores: browsers queue). Four of you share it, so keep runs few and purposeful: no re-runs "to see".
  Kill your own server and leftover chromium/node when you finish (`kill <pid>`; never `pkill -f` with a pattern).
- Syntax check: `for f in src/*.js server/*.js; do node --input-type=module --check < "$f" || echo FAIL $f; done`
- Ownership (edit your files freely; elsewhere only small hunks, and list them in your report so that the merge by hand is quick):
  G1 lighting      src/atmosphere.js: the environment-map builder and the IBL / light chunks in installShaderChunks (NOT the shadow lookup code, NOT the sky fragment); src/world.js lights; material lighting code in
                   materials.js / unitmat.js / siegemat.js / vmmat.js only as needed; the programs audit.
  G2 post/shadows  src/post.js, src/gfx.js, src/shadows.js, the shadow lookup code in atmosphere.js (SHADOW_PARS, atmTaps and the cascade chunk), src/main.js renderer options, the PRESETS in src/quality.js (ONLY G2 edits PRESETS;
                   the others ask for a field in their report or add one tiny line with a comment).
  G3 castles       src/materials.js (weathering / stone shader), castle.js, castlegeo.js, parts.js, castletex.js, props.js, castlefx.js, siegegeo.js / siegemat.js (look only).
  G4 world+crowd   src/terrainmat.js, terrain.js, landscape.js, terraintex.js, grass.js, foliage.js, foliagegeo.js, scenery.js, the sky fragment in atmosphere.js, crowd.js / unitmat.js / models.js (vertex side and LOD),
                   particles.js / fx*.js if they show up.

## Targets (the fixed scene, `gfx/fixed.js`, mean of its three views, software GPU, 1280x720)
                          Low    Medium    High
  original (8250)         506     568      642     <- the bar the user will compare against
  main now (8252)         347     706     1073
  TARGET after all four   <=347   <=568    <=760   (all four of you together; each of you reports what YOUR change saves, measured alone against 8252, and how much of the above you think the team gets from it)
Measure with `CW_PORT=<port> $S/gfx/b.sh $S/gfx/fixed.js <low|medium|high> [small] [WxH]`; it prints one JSON line (ms per view, mean, calls, tris, programs). Noise is about +-5%: measure before and after back to back,
and repeat a result before you build on it. `SHOT=<dir>:<tag>` also saves the three views as PNGs. Details: $S/gfx/gpu2/baseline.txt. Where the time goes (one thing switched off at a time, High / Medium): $S/gfx/gpu2/ablation.txt
(read it: castles ~420 of 900 ms, the environment map ~280, MSAA ~220, shadows ~190, terrain ~250; the rows overlap). A component-by-component script: `FF=0 EXTRA=0 CW_PORT=<port> $S/gfx/b.sh $S/gfx/gpu/cost.js <q> <ablation list>`
(`$S/gfx/gpu2/cost2.js` adds castle ablations: cBasic, cNoNormal, cNoMap, cNoRecv, cAniso1, cCount); add your own rows. The scene is FILL-bound: cost follows the pixel count (about 300 ms fixed + 835 ms per megapixel at High).

## What counts as a good trim
- It must hold on a REAL GPU, not only in the software rasterizer, which exaggerates texture fetches and MSAA and hides bandwidth. Prefer trims that cut work everywhere: fewer fetches AND fewer ALU ops AND less memory traffic
  AND less overdraw. Do not remove something cheap on a real GPU if it costs visible quality, just to move the software number. Say in the report which of your changes you expect to matter on real hardware and why.
- The look at 1:1 must not get worse. Before/after rule: take the three views before (port 8252) and after (yours) with `SHOT=$S/gfx/<id>/shots:<before|after> ... fixed.js <q>` (same seed, same cameras: the frames are comparable
  pixel for pixel), run `python3 -I $S/gfx/gpu/imgdiff.py before.png after.png diff.png`, LOOK at both pictures and at the amplified difference (banding, lost shadow, flatter material, shimmer, aliasing) with the Read tool.
  A difference you can see is a loss: fix it or drop the trim. Say which trims changed the picture at all and by how much (mean abs difference).
- Re-balancing a preset in quality.js is allowed when a feature is a poor trade at that level (say so in the report); removing a feature outright is not.
- Keep Auto, the dynamic resolution and gfx.renderFrame's behaviour. Low must stay plain and fast (347 or better). Draw calls and triangles must not rise (prof.js: `CW_PORT=<port> $S/gfx/b.sh $S/gfx/prof.js medium high 6`).
- Also check Medium and High on the late-battle frame once you have something: `CW_PORT=<port> $S/gfx/b.sh $S/gfx/gpu/cost.js high none` (a battle of ~6 minutes, 'baseline' row) before and after.

## Your area
### G1 lighting: what every lit pixel pays for the sky and the sun
Every lit surface (castles, trees, props, soldiers, engines, ground, first-person kit) is a MeshStandardMaterial. Switching the environment map off saves ~280 ms of 900 (High) and ~236 of 648 (Medium): the per-pixel
PMREM lookup (`getIBLIrradiance`: a cube-UV atlas read with face selection and manual bilinear = about four dependent fetches plus ~60 ALU ops), plus `getIBLRadiance` for smooth surfaces, plus the GGX/multi-scatter terms.
A previous trim only made rough surfaces (>0.85) reuse the diffuse lookup. Ideas, to be judged by measurement and by the look:
  1. Diffuse IBL as L2 spherical harmonics: project the same analytic sky (+ the warm ground bounce the env map is built from, see atmosphere.js around line 300-400) onto 9 SH coefficients once (and again when quality changes
     if the build depends on it), keep them in ONE shared uniform value object used by every program, and patch `getIBLIrradiance` to evaluate it (~25 ALU, no fetch). The hemisphere light in world.js adds ambient too: check whether
     the two should become one term (match the sum, then compare frames).
  2. Specular IBL only where it shows (steel, armour, shield boss, gold, water-like): a one-fetch lookup (a small baked 2D sky-reflection ramp indexed by reflection direction and roughness, plus the analytic sun glint) instead
     of the cube-UV atlas; everything else (roughness above a threshold, no metalness) gets no specular IBL or a constant.
  3. Cheaper BRDF terms for rough dielectrics (skip multi-scatter compensation and the DFG fit, simpler visibility/Fresnel) via the light chunks, keeping metals as they are. Check what `RE_Direct`, `RE_IndirectSpecular` and
     the clearcoat/sheen/iridescence paths cost in the programs actually in use (view them with `renderer.info.programs` and `material.onBeforeCompile` / `renderer.properties`).
  4. Programs audit: the original had 29 programs, High has 48 and Low 33. List every program (material class, defines, which patch keys) and merge variants that differ for no visible reason (fewer state changes, less compile
     hitching on a real GPU at first sight of an effect). Report the list before/after.
Leave the sky fragment and the shadow lookup code to G4 and G2.

### G2 post-processing, MSAA and shadows: the passes and the sampling
Scene -> multisampled RGBA16F target (4 samples at High: 48 bytes per pixel with depth) -> bloom chain -> composite (tone curve, grade, vignette, dither) -> FXAA -> canvas (see the header of post.js). Measured (High / Medium):
MSAA off saves 227 / 208 ms (2 samples cost the same as 4 in software GL; on real GPUs 2 vs 4 matters); an R11F_G11F_B10F HDR target saves 96 / 64; the post passes and the empty-scene floor cost 110 / 55; shadows (all) 194 / 136:
one cascade less 78, taps 12 -> 4: 60, -> 1: 104; terrain not receiving shadows 43. Ideas:
  1. MSAA policy: FXAA is redundant under MSAA and MSAA is the biggest single item. Compare per level: MSAA 4 / 2 / 0 with FXAA on or off, on edges that show (battlements, tree silhouettes, grass, the sword); pick the cheapest
     combination that holds the look, per level (Medium is the most important: msaa 2 there costs 208 ms for edges FXAA would handle for ~15). Note the canvas itself may be created with antialias on (main.js): check what Low and the
     direct-to-canvas path pay for it.
  2. HDR target format: R11F_G11F_B10F (check it is renderable and multisample-able where the code checks the extensions, keep a fallback; watch for banding in the sky gradient and dark shadows: the composite dithers AFTER the
     format quantises) or RGBA16F only where needed; depth format and whether a depth/stencil resolve is needed at all.
  3. Passes: start the bloom chain at half or quarter resolution, fewer levels, a cheaper first tap pattern, skip bloom's 13-tap cost where the threshold finds nothing; merge FXAA + composite into one pass; avoid copies and
     clears; `empty scene` costs 110 ms at High: find what is in it.
  4. Shadow lookups: early out where N.L <= 0 (no sun on the face, so the term is zero anyway), fade the lookup out toward the far cascade's edge instead of paying 12 taps there, blend cascades only inside the transition band,
     better sample rotation (interleaved gradient noise) so that 6-8 taps look like 12, hardware PCF (a depth texture with compare, one fetch = a 2x2 filter) if it can be plumbed cleanly into the existing cascade code,
     cheaper receivers (props, thin things). Shadow map sizes and the near/far split, the far map's refresh rate, depth-only material for the shadow pass, casters that do not matter (check `limitShadow`/`shadowProxy` use).
  5. Presets: any per-level change (taps, map sizes, msaa, post flags, pixelRatio caps, dynMin) is yours to make in quality.js; justify each.

### G3 castles: the single biggest cost
Castles hidden: -424 / -352 ms (52% of the frame at Medium) although they cover only a few percent of the pixels in the field view; 52 meshes, 88k triangles. With every castle mesh swapped for MeshBasicMaterial the frame drops by
300 ms: lit shading and shadow lookups on castle pixels cost 300, basic rasterisation of the same geometry another ~130. So castle pixels are very expensive and/or drawn many times (overdraw: outer walls, inner walls, towers,
buildings, merged meshes drawn in arbitrary order so early-z cannot reject). Find out which, by measurement, then fix. Ideas:
  1. Overdraw: count the fragments per pixel on castles (draw them with additive blending and a flat colour, or a stencil/counter trick) in the castle front view and the field view. Remove faces nobody can see (buried inside walls,
     undersides, inside of towers seen from outside) from the VISUAL mesh only (collision stays exactly as it is: fingerprint it with `CW_PORT=<port> node $S/gfx/integ/evalpage.js $S/gfx/integ/colliders.body.js small high start`
     and compare with $S/gfx/integ/coll_base.json via $S/gfx/integ/colldiff.py), backface culling where meshes are DoubleSide for no reason, draw order inside merged meshes (sort the index by distance to the castle center
     or from the likely view directions), a depth-only pre-pass for the castle group if it pays (it costs vertices, saves fragments), bigger triangles where tiny ones are drawn (fragment quads).
  2. Distance LOD for the materials: beyond ~50-60 m a castle needs no normal map, no weathering noise reads, no specular, no shadow reception (it is fogged and small): swap each castle mesh's material for a lean variant
     (Lambert-like, one map fetch, vertex-colour tint) with hysteresis; also near/far geometry detail if the castle has props and small parts that vanish with distance.
  3. The stone shader: the weathering patch reads a noise texture twice and the normal map is derivative-based (no tangents: per-pixel derivatives and a cotangent frame); bake what can be baked into vertex colours
     (damp/moss at the foot, streaks), use a cheaper normal perturbation, drop aniso where the surface is seen head-on, smaller textures where 512 is not needed.
  4. Castle fx (cloth, flames, smoke), props and banners: do they add draws or alpha overdraw near walls?
Gameplay of castles (colliders, gates, ladders, towers, upgrades, ruin state) is exactly as it is: the collider fingerprint above and $S/v7/gate.js, $S/v3/tower.js, $S/v3/upgrades.js must stay green.

### G4 world, vegetation, sky, crowd, effects
Terrain hidden: -258 / -173 ms, but the splat shader itself is only ~65 ms of it (plain vertex colours cost 836/634): the rest is the common lit path (G1/G2 cut that). Grass ~44, foliage ~30, sky ~25, siege ~28, fx ~24 (High, no battle).
In a late-battle frame the crowd is 29% of High (vertex-bound: 375k triangles in 220 calls). Ideas:
  1. Terrain: fewer fetches by distance (far chunks use one macro texture and vertex colour; normal and detail layers fade out), bake macro variation into vertex colours, avoid per-pixel procedural noise, cheaper blend weights;
     the far landscape ring: simpler shading and no shadow reception; chunk culling (frustum and behind-the-camera) and index/vertex counts for the far chunks.
  2. Grass and foliage: blade count/size at distance, alpha-tested overdraw (blades and tree cards: discard defeats early-z: cut the number of overlapping layers, use alpha-to-coverage under MSAA, or fewer bigger quads),
     wind cost in the vertex shader, instancing counts; the sky drawn at the end already: check the cloud shader cost per pixel at Medium/High (two layers) and let it run at half resolution or fewer octaves if it pays.
  3. Crowd (battle frame): triangles per soldier at each LOD (near heads ~1.7k triangles, far shape 0.9k), how many soldiers wear rich shapes, skinning/vertex work in the instanced vertex shader, culling of soldiers behind
     the camera, shadow proxies. Measure it with `cost.js` (the 'crowd' row) in a battle frame; every soldier still looks like the same soldier at the same distance.
  4. Effects: soft particles read the depth texture (is a separate depth copy made every frame? at Medium too?), particle counts and fill at close range.
  5. Program count: leave the audit to G1; just do not add variants.

## Checks before you report (through b.sh, your port)
Syntax check, then: $S/v2/smoke.js, $S/v3/basics.js, $S/v3/classswitch.js, $S/v2/abilities.js, $S/gfx/A1/crowdtest.js, $S/gfx/A4/qcycle.js and $S/gfx/A4/shimmer.js, plus `prof.js medium high 6` (draw calls and triangles must not rise)
and the fixed-scene numbers at low, medium and high before/after. No console errors; works on all map sizes and in the practice courtyard.
## Report (at most 25 lines)
Branch and last commit; a table of fixed-scene ms before/after at low/medium/high (mean and per view) for YOUR changes alone against 8252; late-battle numbers; what you changed and why it should also help a real GPU; every preset
change; before/after/diff screenshot paths and what you see in them; test results; files and rough line ranges touched outside your ownership; anything you noticed that is wrong or needs a decision. Keep usage lean: short outputs,
no re-reading files you have, no needless re-runs.
