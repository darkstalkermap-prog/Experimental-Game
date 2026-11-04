// Entry point: renderer, main loop and menu wiring.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI, renderClassPicker } from './ui.js';
import { CLASSES, isClassId } from './classes.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { RoomNet } from './roomnet.js';
import { PeerNet } from './peernet.js';
import { setMapSize, setPracticeWorld, setWarWorld, warPlanOf, WORLD, MAP_SIZES, OBJECTIVES, LENGTHS, DIFFICULTY } from './config.js';
import { HERO } from './herogame.js';
import { settings, saveSettings, sensitivityOf } from './settings.js';
import { initPerf } from './perf.js';
import { gfx, canvasNeedsAA } from './gfx.js';
import { LEVELS, applyQuality } from './quality.js';
import { loadOptions, saveOptions, sanitizeOptions } from './options.js';
import { setWorldLand, landKey, land, loadLand } from './biomes.js';
import { initLandMenu, showLobbyLand } from './landui.js';
import { progress, sanitizeLoadout } from './progress.js';
import { endSound } from './endprogress.js';   // (the end screen's battle and Renown sections)
import './wardrobe.js';       // (the Renown panel of the menu)
import './whatsnew.js';       // (the What's new panel of the menu)
import { flow, loadLast, saveLast, setupLine, onKey as flowKey, offerFor, confirmOffer, pressReady, pressOffer, roomGone } from './flow.js';
import { pendingDecrees, hearDecrees } from './decrees.js';
import { withRivals, lobbyRivals } from './rivalsui.js';
import { setPalette, sanitizeColors, assignColors, paletteKey, isColorId, COLOR_IDS } from './teams.js';
import { freshSlots, freshSeats, cleanSlots, cleanSeats, heroSize, HERO_SIZES, nextState, canTakeSlot, canTakeSeat, firstFreeSlot, firstFreeSeat,
  warProblem, heroProblem, emptyTeams, reseat, colorWants, sideOfSeat, seatInUse } from './seats.js';
import { drawLobby, drawSolo } from './lobbyui.js';
import { isRaceId, isOtherRaces, assignRaces, raceWants, sanitizeRaces } from './races.js';
import { aiSigils, sanitizeSigils } from './unlocks.js';
import { initWarMenu, showWarRow, warSetup, hearWar, WAR_DESC } from './warui.js';
import { sanitizeWar, warHills, menuPlan, planOf } from './warmode.js';
import { SPECIALTY, isSpecialty, setSpecialWorld, specialRaces } from './specialty.js';
import { initSpecialMenu, showSpecialPick, showSpecialRace } from './specialui.js';
import { FramePacer } from './framepace.js';

const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: canvasNeedsAA(), powerPreference: 'high-performance' });   // (samples for the canvas only where the scene is drawn straight into it: see gfx.js)
renderer.setSize(innerWidth, innerHeight);
gfx.init(renderer);   // (tone curve, shadow filter and the rest of the renderer set-up: see gfx.js)
$('app').appendChild(renderer.domElement);

const ui = new UI();
const audio = new Audio();
const input = new Input(renderer.domElement);

// map size (remembered per browser); the world is rebuilt when it changes
let mapSize = 'medium';
try { mapSize = localStorage.getItem('cw-map') || 'medium'; } catch (e) { /* storage unavailable */ }
if (!MAP_SIZES[mapSize]) mapSize = 'medium';

// graphics quality (remembered per browser), applied BEFORE the world is built so that every system (castles, terrain, crowd, trees,
// effects) is built once at the right level instead of being rebuilt on the first change
let quality = 'auto';   // 'auto' (a level picked for this machine) or a level of quality.js
try { quality = localStorage.getItem('cw-quality') || 'auto'; } catch (e) { /* storage unavailable */ }
if (quality !== 'auto' && !LEVELS.includes(quality)) quality = 'auto';
applyQuality(gfx.levelFor(quality), quality);

let game;
// push the saved sensitivity and field of view into a freshly built game
function applySettings() {
  if (!game) return;
  game.player.sensitivity = sensitivityOf(settings.sens);
  game.player.baseFov = settings.fov;
}
endSound.play = (name, when) => audio.play(name, null, when);
audio.vol.master = settings.master / 100;
audio.vol.music = settings.music / 100;
audio.vol.sfx = settings.sfx / 100;

// ---------------- one player's seat and colour (remembered per browser) ----------------
// the castle you play in a war (0..3) and what the other three are (an AI lord, or empty), your side in the Hero Game Mode, how many a side, your colour
const stored = (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } };
const store = (key, v) => { try { localStorage.setItem(key, String(v)); } catch (e) { /* ignore */ } };
let myColor = stored('cw-color', 'blue');
if (!isColorId(myColor)) myColor = 'blue';
// your army's race and the other armies' (races.js: only the look of the soldiers)
let myRace = stored('cw-race', 'human');
if (!isRaceId(myRace)) myRace = 'human';
let otherRaces = stored('cw-races', 'random');
if (!isOtherRaces(otherRaces)) otherRaces = 'random';
let soloSlot = Number(stored('cw-slot', 0));
if (!(soloSlot >= 0 && soloSlot < 4)) soloSlot = 0;
let soloSlots = cleanSlots(String(stored('cw-slots', '')).split(','));
let soloSide = Number(stored('cw-side', 0)) === 1 ? 1 : 0;
let heroCount = heroSize(Number(stored('cw-herosize', 3)));
const soloPalette = () => assignColors(heroOnSolo() ? [soloSide === 0 ? myColor : null, soloSide === 1 ? myColor : null, null, null] : [0, 1, 2, 3].map((t) => (t === soloSlot ? myColor : null)));
let heroOnSolo = () => false;   // (the Mode row below says)

// The houses' colours of the world being built (teams.js): the world is built in them, so a different set is another world. A match brings its own
// (begin); the menu shows the single player's.
let palette = soloPalette();

// the key of a world: its map size, the practice yard, War Mode's bowl and the land it is dressed as (a different land is another world, built again; so are
// other colours, kept beside it in game.paletteBuilt)
// (War Mode's key is the plan of its hills, '+war22': a bowl laid out for other sides is another world; a Specialty Battle's is its id, '+stonecleft')
const specialOf = (practice, war, special) => (!practice && !war && isSpecialty(special) ? special : '');
const worldKey = (size, practice, o, war = false, special = '') => size + (practice ? '+practice' : '') + (war && !practice ? '+war' + warPlanOf(war) : '')
  + (specialOf(practice, war, special) ? '+' + special : '') + (practice ? '' : landKey(o.biome, o.seed));

function buildGame(size, practice = false, landOpts = null, war = false, special = '') {
  const o = sanitizeOptions(landOpts);
  setMapSize(size);
  setPalette(palette);   // (before anything of the world is made: castles, banners, soldiers and heroes take their colours as they are built)
  setPracticeWorld(practice);   // the practice courtyard is part of the world itself: its ground is flat and free of trees
  setWarWorld(war && !practice ? war : 0);   // War Mode's world: a hill for each army, no castles (warmap.js; `war` is the number of hills)
  setSpecialWorld(specialOf(practice, war, special));   // a Specialty Battle's world: its own map and fortress (specialty.js; Stonecleft Hold: stonecleft.js)
  setWorldLand(practice ? 'meadow' : o.biome, practice ? 0 : o.seed);   // (the courtyard is always the meadow)
  game = new Game(renderer, ui, audio, input, { practice });
  game.state = 'menu';
  game.mapBuiltFor = worldKey(size, practice, o, war, special);
  game.paletteBuilt = paletteKey(palette);
  ui.mapBg = ui.bigBg = null;
  ui.cmdFoesOf = null; ui.heroSeen = undefined; ui.castleBar.reset();   // (the command bar's houses, the Hero Mode the HUD was set for and the castle panel's castle were the last world's: held, they kept that whole finished world alive)
  window.__game = game; // handy for debugging from the console
  window.__gfx = gfx;
  gfx.setGame(game);
  applySettings();
}
// the land for the next battle (the biome and seed chosen on the menu, or rolled after the last battle), remembered per browser
loadLand(loadOptions());
{   // ?land=snow:4321 opens the page on that land (to share a land, and for tests): the choice is not remembered unless the menu changes it
  const m = /^([a-z]+)(?::(\d{1,6}))?$/.exec(new URLSearchParams(location.search).get('land') || '');
  if (m) { const o = sanitizeOptions({ biome: m[1], seed: Number(m[2] || 0) }); land.mode = 'fixed'; land.biome = o.biome; land.seed = o.seed; }
}
// Quick Play's battle when it is a Specialty Battle (the last one played: the page opens on its world, so that Quick Play starts at once); '' when Quick Play
// starts the battle of the setup below
let quickSpecial = isSpecialty(loadLast().mode) ? loadLast().mode : '';
const menuSize = () => (quickSpecial ? SPECIALTY[quickSpecial].map : mapSize);
try {
  buildGame(menuSize(), false, land, false, quickSpecial);
} catch (e) {
  console.error(e);
  $('loading').textContent = 'Failed to start: ' + e.message;
  throw e;
}
$('loading').classList.add('hidden');
$('menu').classList.remove('hidden');
// the profiler overlay (` or ?perf) and the benchmark (window.__bench): nothing is hooked until the overlay is switched on
initPerf({ renderer, getGame: () => game, render: () => gfx.renderFrame(1 / 60), host: gfx });

function resize() { gfx.resize(); ui.fitHero(); }
addEventListener('resize', resize);
resize();

function setQuality(q) {
  quality = q;
  game.setQuality(q);
  document.querySelectorAll('.quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === q));
  try { localStorage.setItem('cw-quality', q); } catch (e) { /* ignore */ }
}
document.querySelectorAll('.quality button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.q === 'auto') gfx.resetAuto(); setQuality(b.dataset.q); }));
setQuality(quality);

// what the last match was set up with (difficulty and mode; the class, the map and the length are remembered where they are chosen): the page opens on it,
// so Quick Play and a fresh page load agree
let quickReady = false;   // (the Quick Play line is written once everything it reads has been set up: see the end of the menu wiring)
const last = loadLast();
let difficulty = last.diff;
function selectDifficulty(d) {
  difficulty = d;
  document.querySelectorAll('#difficulty button').forEach((o) => o.classList.toggle('active', o.dataset.d === d));
  refreshQuick();
}
document.querySelectorAll('#difficulty button').forEach((b) => b.addEventListener('click', () => { selectDifficulty(b.dataset.d); rememberLast(); }));
// the online room's AI difficulty: the host chooses it in the lobby (lobbyui.js), remembered apart from the menu's so that a host's online habit does not
// change their single-player battles (a host who never chose one starts from the menu's); it goes out in every lobby view and in the start message
const isDiff = (d) => Object.prototype.hasOwnProperty.call(DIFFICULTY, d);
let roomDiff = isDiff(stored('cw-mpdiff', '')) ? stored('cw-mpdiff', '') : difficulty;

function selectMap(size) {
  mapSize = size;
  document.querySelectorAll('#mapsize button').forEach((b) => b.classList.toggle('active', b.dataset.m === size));
  $('mapDesc').textContent = MAP_SIZES[size].desc;
  try { localStorage.setItem('cw-map', size); } catch (e) { /* ignore */ }
  refreshQuick();
}
document.querySelectorAll('#mapsize button').forEach((b) => b.addEventListener('click', () => selectMap(b.dataset.m)));
selectMap(mapSize);

// the match options besides map, mode, difficulty and class (length, biome, decrees, rival lords: see options.js), remembered per browser. The menu pieces
// that choose them change fields of this object; every start below sends a sanitized copy and remembers it
let options = loadOptions();
const matchOptions = (humans) => { options = sanitizeOptions({ ...options, biome: land.biome, seed: land.seed, decrees: pendingDecrees() }); saveOptions(options); return withRivals(options, humans); };   // (the land comes from biomes.js and the Battle Decrees from decrees.js: the end screen rolls both)
// Between matches the stored options are the truth: the end screen's sections roll the next battle into them (land, rivals) and save, so a rematch reads them
// afresh (the decrees are asked from decrees.js at every start, above). The menu pieces change `options` in memory and the next start saves them.
const refreshOptions = () => { options = { ...loadOptions(), length: options.length }; };   // (the length is what the menu said, also where storage is unavailable and loadOptions gives the defaults)

// match length (Standard / Short, options.length): the war modes only, the Hero Game Mode has its own length
function showLength() {
  for (const id of ['length', 'lobbyLength']) document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.l === options.length));
  document.querySelectorAll('#length button').forEach((b) => { b.querySelector('small').textContent = LENGTHS[b.dataset.l].time; b.title = LENGTHS[b.dataset.l].desc; });
  $('lengthDesc').textContent = heroOn ? 'Hero Game Mode has its own length: choose how to win above.' : warOn ? 'War Mode has its own clock: two minutes to build an army, then one battle.' : LENGTHS[options.length].desc;
  $('length').classList.toggle('off', heroOn || warOn);
  document.querySelectorAll('#length button').forEach((b) => { b.disabled = heroOn || warOn; });
  refreshQuick();
}
function selectLength(l) {
  options.length = l === 'short' ? 'short' : 'standard';
  saveOptions(options);
  showLength();
}
document.querySelectorAll('#length button').forEach((b) => b.addEventListener('click', () => selectLength(b.dataset.l)));

// game mode: Conquest is the main one (the page always opens on it), King of the Hill puts a prize in the middle of the map
let objective = 'conquest';
// Hero Mode is the third choice of the Mode row. It is not an objective of the war (OBJECTIVES, the lobby): it has its own
// setup (`hero: { win }`) and its own row of three ways to win, the last one remembered per browser.
let heroOn = false;
let warOn = false;   // War Mode (warmode.js): a mode of its own, like Hero Mode, but online too
// the War Mode world the menu shows behind it: a hill for each army of the format (begin builds the match's own)
const menuWar = () => (warOn ? menuPlan(warSetup().format) : false);
let heroWin = 'kills';
try { heroWin = localStorage.getItem('cw-herowin') || 'kills'; } catch (e) { /* storage unavailable */ }
if (!HERO.modes[heroWin]) heroWin = 'kills';
const NUM = ['', 'one', 'two', 'three', 'four'];
const heroDesc = () => `${NUM[heroCount][0].toUpperCase() + NUM[heroCount].slice(1)} heroes against ${NUM[heroCount]}, out of one castle each: you and ${NUM[heroCount - 1]} bot hero${heroCount > 2 ? 'es' : ''} against ${NUM[heroCount]}. You control only your hero and its talents; the armies march by themselves, every round tougher. Online, friends take the bots' seats.`;
function showHeroWin(id) {
  heroWin = id;
  document.querySelectorAll('#heroWin button').forEach((b) => b.classList.toggle('active', b.dataset.w === id));
  $('heroWinDesc').textContent = HERO.modes[id].desc;
  refreshQuick();
}
for (const [id, m] of Object.entries(HERO.modes)) {
  const b = document.createElement('button');
  b.dataset.w = id;
  b.append(m.name);
  if (m.short) { const s = document.createElement('small'); s.textContent = m.short; b.append(s); }
  b.addEventListener('click', () => {
    showHeroWin(id);
    try { localStorage.setItem('cw-herowin', id); } catch (e) { /* ignore */ }
  });
  $('heroWin').insertBefore(b, $('heroWinDesc'));
}
showHeroWin(heroWin);
// (keep: the page opens on the last match's setup and Quick Play stays on the Specialty Battle it played; a click on a mode makes that mode Quick Play's again)
function selectObjective(o, keep = false) {
  const hero = o === 'hero', war = o === 'war';
  if (!hero && !war && !OBJECTIVES[o]) return;
  const rebuild = (war !== warOn || (!!quickSpecial && !keep)) && game.state === 'menu';
  if (quickSpecial && !keep) { quickSpecial = ''; showSpecialPick(''); }
  heroOn = hero;
  warOn = war;
  if (!hero && !war) objective = o;
  document.querySelectorAll('#objective button').forEach((b) => b.classList.toggle('active', b.dataset.o === o));
  $('objDesc').textContent = hero ? heroDesc() : war ? WAR_DESC : OBJECTIVES[o].desc;
  $('lobbyObjDesc').textContent = war ? WAR_DESC : OBJECTIVES[objective].desc;   // (the lobby's Mode row itself is drawn by lobbyui.js)
  showWarRow(war);
  if (rebuild) { clearTimeout(previewTimer); previewTimer = setTimeout(() => { if (game.state === 'menu') { palette = soloPalette(); ensureMap(menuSize(), false, land, menuWar(), quickSpecial); } }, 350); }   // (the menu shows the bowl behind it)
  $('heroWin').classList.toggle('hidden', !hero);
  $('menu').classList.toggle('hero', hero);
  showLength();   // (the length row is for the war modes: in Hero Mode it says so)
  showSolo();
}
initWarMenu(() => {
  if (lobbyBroadcast && !$('lobby').classList.contains('hidden')) lobbyBroadcast();
  refreshQuick();
  clearTimeout(previewTimer); previewTimer = setTimeout(() => { if (game.state === 'menu') ensureMap(menuSize(), false, land, menuWar(), quickSpecial); }, 350);   // (two hills or four)
});   // (adds War Mode to the Mode rows before they are wired)
document.querySelectorAll('#objective button').forEach((b) => b.addEventListener('click', () => { selectObjective(b.dataset.o); rememberLast(); }));
const rememberLast = () => saveLast(difficulty, quickSpecial || (heroOn ? 'hero' : warOn ? 'war' : objective));


// Rebuild the world if the chosen map size or land differs from the one on screen, or if a match has been played in it: a world is for ONE match (castles, units,
// engines and upgrades are all dirty afterwards), so the next one is built as soon as a match ends (freshWorldSoon) and starting it is then instant.
function ensureMap(size, practice = false, landOpts = null, war = false, special = '') {
  const o = sanitizeOptions(landOpts);
  if (game.state === 'menu' && WORLD.size === size && game.mapBuiltFor === worldKey(size, practice, o, war, special) && game.paletteBuilt === paletteKey(palette)) return;
  const net0 = game.net;
  game.dispose();
  buildGame(size, practice, o, war, special);
  game.net = net0;
  game.setQuality(quality);
  resize();
}

// the Land row of the menu (and the lobby's): changing it rebuilds the world behind the menu a moment later, so the biome can be seen before it is picked
let previewTimer = 0;
initLandMenu({
  onChange: () => {
    if (lobbyBroadcast && !$('lobby').classList.contains('hidden')) lobbyBroadcast();   // (the guests hear of it while they wait in the lobby)
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { if (game.state === 'menu') ensureMap(menuSize(), false, land, menuWar(), quickSpecial); }, 350);
  },
});

function begin(diff, setup = null, map = mapSize) {
  clearTimeout(freshTimer);
  // each house's army's race (a match online brings the host's; otherwise your army is yours, the others as the menu says: races.js)
  const qsRaces = new URLSearchParams(location.search).get('races');   // (?races=elf,dwarf,orc,undead: every house's race, for tests and to show them off)
  if (setup && qsRaces && setup.mode === 'single') setup.races = sanitizeRaces(qsRaces.split(','));
  if (setup && !setup.races) setup.races = assignRaces(raceWants((setup.players || []).map((p) => (p.me && !p.rc ? { ...p, rc: myRace } : p)), !!setup.hero), otherRaces, myRace);
  if (setup && !setup.sigils) setup.sigils = aiSigils(setup.races);   // (the AI lords' sigils, of their races: heraldry.js)
  palette = setup && setup.colors ? sanitizeColors(setup.colors) : soloPalette();
  ensureMap(map, !!(setup && setup.practice), setup && setup.options, setup && setup.war ? warHills(setup) : false, setup && setup.special);   // (War Mode: a hill for each side; a Specialty Battle: its own world)
  if (net) game.net = net;
  audio.init();
  audio.startMusic();
  $('menu').classList.add('hidden');
  $('lobby').classList.add('hidden');
  ui.reset();   // (a rematch: nothing of the last match's screen is left)
  ui.setKeyHints(countMatch(setup));
  ui.showHud();
  flow.beganAt = performance.now();
  flow.left = false;
  game.onRematch = guestRematch;   // (a guest follows the host back to the room's lobby, even from the middle of the ending: see ClientSync)
  game.start(diff, setup);
  input.lock();
}

// The key reminders on the HUD: the full line in a player's first KEY_HINT_MATCHES matches, then a small "I keys" note (ui.setKeyHints). A match is counted
// when it starts (practice and watching are not matches); a player whose account already has finished matches (progress.js) is no beginner either.
const KEY_HINT_MATCHES = 2;
function countMatch(setup) {
  if (setup && (setup.practice || setup.spectator)) return Number(stored('cw-matches', 0)) < KEY_HINT_MATCHES;
  let before = Number(stored('cw-matches', 0)) || 0;
  try { before = Math.max(before, progress.get().tot.matches || 0); } catch (e) { /* no account: the counter alone */ }
  store('cw-matches', before + 1);
  return before < KEY_HINT_MATCHES;
}

// The end screen is up: leave the finished world behind it for a moment (the ruins, the armies), then build the next one, so that Play Again only has to start.
// (Building takes a fraction of a second; the end screen is still then.)
let freshTimer = 0;
const FRESH_DELAY = 2500;   // ms the end screen has been in view before the world behind it is replaced
function freshWorldSoon() {
  clearTimeout(freshTimer);
  let seen = 0;
  const tick = () => {
    if (game.state !== 'over') return;   // (a new match has started, or the menu is up)
    seen = endScreenUp() ? seen + 250 : 0;   // (the screen may be built before a finishing show has ended: wait until it is in view)
    if (seen < FRESH_DELAY) { freshTimer = setTimeout(tick, 250); return; }
    const size = WORLD.size, practice = !!game.practice;   // (the world's key also carries the land now: do not parse it)
    ensureMap(size, practice, practice ? null : { biome: land.biome, seed: land.seed }, game.war ? planOf(game.war.sideList) : false, game.special ? game.special.id : '');   // (the next battle's land: the end screen's row may have rolled it; War Mode: the hills of this match's sides, which a Play Again repeats; a Specialty Battle: its own world again)
    // (a disposed world takes the shader programs of its own materials with it: compile the effect shaders of the new one now, a moment after the build as a task of
    // its own, while the end screen is still, instead of in the click that starts the match)
    const fresh = game;
    freshTimer = setTimeout(() => { if (game === fresh && fresh.state === 'menu') fresh.warmup(); }, 120);
  };
  freshTimer = setTimeout(tick, 250);
}

// hero class (remembered per browser)
let heroClass = 'knight';
try { heroClass = localStorage.getItem('cw-class') || 'knight'; } catch (e) { /* storage unavailable */ }
if (!isClassId(heroClass)) heroClass = 'knight';
const rememberClass = (id) => {
  heroClass = id;
  try { localStorage.setItem('cw-class', id); } catch (e) { /* ignore */ }
  refreshQuick();
};
renderClassPicker($('classPick'), $('classInfo'), heroClass, rememberClass);

// the menu's Castle, Others, Teams and Colour rows: one player's seat (lobbyui.js draws them, seats.js says what may be)
heroOnSolo = () => heroOn;
function showSolo() {
  drawSolo({ hero: heroOn, war: warOn, slot: soloSlot, side: soloSide, slots: soloSlots, size: heroCount, color: myColor, race: myRace, others: otherRaces }, {
    slot(t) { soloSlot = t; soloSlots[t] = 'open'; store('cw-slot', t); store('cw-slots', soloSlots.join()); afterSolo(); },
    side(s) { soloSide = s ? 1 : 0; store('cw-side', soloSide); afterSolo(); },
    state(t) {   // an AI lord or nobody (a war needs two houses: the last AI lord stays)
      const next = soloSlots.slice();
      next[t] = next[t] === 'empty' ? 'open' : 'empty';
      if (warProblem(next, [{ team: soloSlot }], false)) return;
      soloSlots = next; store('cw-slots', soloSlots.join()); afterSolo();
    },
    size(n) { heroCount = heroSize(n); store('cw-herosize', heroCount); if (heroOn) $('objDesc').textContent = heroDesc(); afterSolo(); },
    color(id) { if (!isColorId(id)) return; myColor = id; store('cw-color', id); afterSolo(); },
    race(id) { if (!isRaceId(id)) return; myRace = id; store('cw-race', id); showSolo(); showSpecialRace(myRace); },   // (the soldiers are made when the battle starts: no world to rebuild)
    others(o) { if (!isOtherRaces(o)) return; otherRaces = o; store('cw-races', o); showSolo(); },
  });
  foldMoreOptions();
}
// "More options" (a fold under Mode, Difficulty and Length): the rows a new player can leave alone go into it, in the order they show. lobbyui.js and
// decrees.js build theirs beside the Difficulty row and find them again by id, so moving them once is enough.
function foldMoreOptions() {
  const body = document.querySelector('#moreOpts .more-body');
  const ids = ['soloSeat', 'soloRivals', 'soloSize', 'soloColor', 'soloOthersRace'].filter((id) => $(id) && $(id).parentNode !== body);
  body.prepend(...ids.map($));
  const decree = $('decreeRow');
  if (decree && decree.parentNode !== body) body.append(decree);
}
{
  const more = $('moreOpts');
  more.open = stored('cw-more', '0') === '1';
  more.querySelector('summary').addEventListener('click', () => { more.dataset.asked = '1'; });
  more.addEventListener('toggle', () => {
    store('cw-more', more.open ? 1 : 0);
    // (opened by a click on a short window: bring the rows into view; not when the page opens it on the remembered choice)
    if (more.open && more.dataset.asked) more.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
// the world behind the menu is repainted in the new colours a moment later (as the Land row does)
function afterSolo() {
  showSolo();
  refreshQuick();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { if (game.state === 'menu' && $('lobby').classList.contains('hidden')) { palette = soloPalette(); ensureMap(menuSize(), false, land, menuWar(), quickSpecial); } }, 350);
}

// the line under Quick Play (and under Play Again): what a click will start
const currentSetupLine = () => setupLine({ cls: heroClass, mode: quickSpecial || (heroOn ? 'hero' : warOn ? 'war' : objective), heroWin, map: menuSize(), diff: difficulty, length: options.length });
function refreshQuick() {
  if (quickReady) $('quickInfo').textContent = currentSetupLine();
}
// the Specialty Battles card (specialui.js): a battle starts at a click, with the hero and the difficulty chosen here; its Watch button watches it instead
// its Your army row picks your army's race as the setup's row does (one choice: your army), from the races the battle offers
initSpecialMenu({ start: (id) => startSpecial(id), watch: (id) => startSpecial(id, true), race: (id) => { if (!isRaceId(id)) return; myRace = id; store('cw-race', id); showSolo(); showSpecialRace(myRace); } });
showSpecialRace(myRace);
// everything the line reads exists now: show the remembered difficulty and mode (the page opens on the last match's setup)
quickReady = true;
selectDifficulty(difficulty);
selectObjective(quickSpecial ? 'conquest' : last.mode, true);
showSpecialPick(quickSpecial);
refreshQuick();
$('quickPlay').focus();   // (Enter or Space on the main menu is then Quick Play)

// ---------------- between matches (the end screen's actions, see flow.js) ----------------
// Play Again: no reload. The world for it was built while the end screen was up (freshWorldSoon), so this only starts the match.
function playAgain() {
  refreshOptions();   // (the end screen may have rolled the next battle into the stored options)
  if (game.special) startSpecial(game.special.id, !!game.spectator);   // (a Specialty Battle again, played or watched as it was)
  else if (game.spectator) startSpectate(); else startSolo();   // (a battle that was watched: watch the next one)
}
function toMenu() {
  if (net) { location.reload(); return; }   // an online game is left by starting the page afresh
  clearTimeout(freshTimer);
  refreshOptions();
  palette = soloPalette();
  ensureMap(menuSize(), false, land, menuWar(), quickSpecial);   // (the menu shows the picked land behind it, as a bowl for War Mode, in the single player's colours)
  ui.reset();
  ui.hideHud();
  showLength();
  refreshQuick();
  dispatchEvent(new Event('cw-menu'));   // (the stored options may have changed while a match was played: menu rows of other features can read them again)
  $('menu').classList.remove('hidden');
  $('quickPlay').focus();
}
flow.bind({
  playAgain, toMenu, renderClassPicker,
  setClass(id) {
    rememberClass(id);
    renderClassPicker($('classPick'), $('classInfo'), heroClass, rememberClass);   // (the menu's picker follows)
    if (!inRoom()) return;   // (online: the room's lobby hears of the new class)
    if (net.role === 'client') net.toHost({ k: 'cls', cls: id });
    else { const me = lobby.find((p) => p.netId === null); if (me) me.cls = id; }
  },
  classId: () => heroClass,
  setupLine: currentSetupLine,
  afterEnd: (s) => { freshWorldSoon(); roomAfterMatch(s); },
  inRoom, rematch: hostRematch, leaveRoom,
});

// Single Player, Quick Play and Play Again all start this: a match of one lord against the others, with what the menu says (which the last match left
// there): your castle and colour, the castles left empty, or your side and the size of the sides in the Hero Game Mode
function startSolo() {
  if (quickSpecial) { quickSpecial = ''; showSpecialPick(''); }   // (the battle of the setup below is Quick Play's again)
  rememberLast();
  if (heroOn) {
    const me = { team: soloSide, hs: soloSide * 4 + Math.floor((heroCount - 1) / 2), name: 'You', cls: heroClass, col: myColor, me: true };
    begin(difficulty, { mode: 'single', localTeam: me.team, players: [me], hero: { win: heroWin, size: heroCount, seats: freshSeats() }, colors: assignColors(colorWants([me], true)), options: matchOptions() });
    return;
  }
  const me = { team: soloSlot, name: 'You', cls: heroClass, col: myColor, me: true }, empty = emptyTeams(soloSlots, [me]);
  // (War Mode: the castles are armies, and an empty one stays off the field)
  begin(difficulty, { mode: 'single', localTeam: me.team, players: [me], objective, war: warOn ? warSetup() : undefined, empty, colors: assignColors(colorWants([me], false)), options: matchOptions([me.team, ...empty]) });
}
$('play').addEventListener('click', startSolo);
// Spectate (the quiet button under the ways to play): the battle the setup describes, watched instead of played (spectate.js). Every house is an AI lord (the
// castles left empty stay empty), War Mode's armies are AI generals', Hero Mode's seats are all bots.
function startSpectate() {
  rememberLast();
  const colors = assignColors([null, null, null, null]);
  if (heroOn) {
    begin(difficulty, { mode: 'single', spectator: true, localTeam: 0, players: [], hero: { win: heroWin, size: heroCount, seats: freshSeats() }, colors, options: matchOptions() });
    return;
  }
  const empty = emptyTeams(soloSlots.map((s, t) => (t === soloSlot ? 'open' : s)), []);
  begin(difficulty, { mode: 'single', spectator: true, localTeam: 0, players: [], objective, war: warOn ? warSetup() : undefined, empty, colors, options: matchOptions(empty) });
}
$('spectateBtn').addEventListener('click', () => { if (quickSpecial) { quickSpecial = ''; showSpecialPick(''); } startSpectate(); });
// A Specialty Battle (specialty.js): you hold castle 0 in your colour against the three other houses, each led by an AI lord, on the battle's own map and on
// the land chosen on the menu; `watch`: every house an AI lord, watched (spectate.js). Single player only. Quick Play and Play Again repeat it.
function startSpecial(id, watch = false) {
  if (!isSpecialty(id)) return;
  quickSpecial = id;
  showSpecialPick(id);
  rememberLast();
  refreshQuick();
  const me = { team: 0, name: 'You', cls: heroClass, col: myColor, me: true };
  const colors = assignColors(watch ? [null, null, null, null] : colorWants([me], false));
  // (the battle's own races: your army as you picked it if the battle offers it, else its first; the lords' as the battle says: specialty.js)
  const races = specialRaces(id, myRace) || undefined;
  begin(difficulty, { mode: 'single', special: id, spectator: watch, localTeam: 0, players: watch ? [] : [me], objective: 'conquest', empty: [], colors, races, options: matchOptions(watch ? [] : [0]) }, SPECIALTY[id].map);
}
// Quick Play: the last battle again (a Specialty Battle, or the one the setup below describes)
$('quickPlay').addEventListener('click', () => { if (quickSpecial) startSpecial(quickSpecial); else startSolo(); });
// the practice courtyard: a walled yard with training dummies, on the small map (it is built into the world, so the world is rebuilt)
$('practiceBtn').addEventListener('click', () => begin(difficulty, { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: heroClass, me: true }], practice: true, colors: assignColors([myColor, null, null, null]) }, 'small'));

// ---------------- online play ----------------
let net = null;
// [{ team, hs, name, netId, cls, cos, col, watch }]   team: the castle held in a war; hs: the seat in a hero match (seats.js); cos: the banner, cloak and capstones
// the account behind the player wears (progress.js); col: the colour they fly (teams.js: no two people the same); watch: they watch the battle instead of
// playing (spectate.js: no castle, no seat, team and hs -1)
let lobby = [];
const seated = () => lobby.filter((p) => !p.watch);   // (the people who play: the seating rules of seats.js only ever see these)
let coop = false;    // lobby game mode chosen by the host
// the host's seating of the room (seats.js): the four castles of a war, the hero seats and how many a side
const room = { slots: freshSlots(), seats: freshSeats(), size: 3 };
let lobbyBroadcast = null;
let guestData = null;   // a guest's handler of the host's messages while in the lobby (a match replaces it with the sync's; a rematch puts it back)
let guestView = null;   // a guest: the host's last word on the room (what the lobby shows)

// the class buttons in the lobby: the host updates the list itself, a guest tells the host
function showLobbyClassPicker() {
  renderClassPicker($('lobbyClassPick'), $('lobbyClassInfo'), heroClass, (id) => {
    rememberClass(id);
    if (!net) return;
    if (net.role === 'client') net.toHost({ k: 'cls', cls: id });
    else {
      const me = lobby.find((p) => p.netId === null);
      if (me && me.cls !== id) { me.cls = id; if (lobbyBroadcast) lobbyBroadcast(); }
    }
  });
}
const playerName = () => ($('pname').value.trim() || 'Lord').slice(0, 16);
try { $('pname').value = localStorage.getItem('cw-name') || ''; } catch (e) { /* storage unavailable */ }
const rememberName = () => { try { localStorage.setItem('cw-name', playerName()); } catch (e) { /* ignore */ } };

// Online play goes through the Castle Wars server when the page comes from one, otherwise through
// the claude.ai live room when the game is opened as an artifact there.
let liveRoom = null;
let direct = false;
const onlineReady = Net.available().then(async (ok) => {
  if (!ok) liveRoom = await RoomNet.open();
  // served as plain files (GitHub Pages and the like): players connect browser to browser
  if (!ok && !liveRoom) direct = PeerNet.available();
  return ok || !!liveRoom || direct;
});

// Multiplayer panel on the main menu
const showMultiplayer = async () => {
  const can = await onlineReady;
  $('online').classList.toggle('hidden', !can);
  $('offlineNote').classList.toggle('hidden', can);
  $('mpBtn').classList.add('active');
  if (can) ($('pname').value ? $('joinCode').value ? $('joinBtn') : $('hostBtn') : $('pname')).focus();
};
$('mpBtn').addEventListener('click', showMultiplayer);

// opened from an invite link (?join=CODE): open the panel with the code filled in
const invited = (new URLSearchParams(location.search).get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
if (invited.length === 4) {
  $('joinCode').value = invited;
  $('inviteBanner').textContent = `You're invited to game ${invited}. Enter your name and press Join.`;
  $('inviteBanner').classList.remove('hidden');
  showMultiplayer();
}

for (const id of ['pname', 'joinCode']) {
  $(id).addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;   // (Enter held down is one press)
    $($('joinCode').value.trim().length === 4 ? 'joinBtn' : 'hostBtn').click();
  });
}

$('copyInvite').addEventListener('click', async () => {
  const el = $('inviteLink');
  try { await navigator.clipboard.writeText(el.value); }
  catch (e) { el.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } }
  $('copyInvite').textContent = 'Copied!';
  setTimeout(() => { $('copyInvite').textContent = 'Copy Invite'; }, 1500);
});

// A try that has not answered yet (a code nobody hosts takes a live room 8 s and a direct connection up to 25 s to give up on) is dropped when the player tries
// again or hosts instead: its late "no such game" must not close the room the player is in by then. So the last connection is closed first, and each one's
// handlers act only while it is the page's connection. Resolves to the connection, or to null when another try has replaced this one meanwhile.
async function connect() {
  if (!(await onlineReady)) throw new Error('Online play is not available here.');
  if (net) { const old = net; net = null; try { old.close(); } catch (e) { /* already gone */ } }
  const n = liveRoom ? new RoomNet(liveRoom) : direct ? new PeerNet() : new Net();
  net = n;
  game.net = n;
  try { await n.connect(); } catch (e) { if (n !== net) return null; throw e; }
  if (n !== net) return null;   // (dropped meanwhile for another try: that one goes on)
  n.on('error', (msg) => { if (n !== net) return; asking = null; ui.lobbyError(msg); n.close(); $('lobby').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  n.on('closed', () => {
    if (n !== net) return;
    if (game.state === 'playing' && game.mode === 'client') { game.finish(-1, 'Lost connection to the server.'); roomGone('The connection to the room was lost.'); }   // (the end screen is up now: its button must not wait for a room that is gone)
    else if (endScreenBuilt() && !flow.left) roomGone('The connection to the room was lost.');
  });
  n.on('hostleft', () => {
    if (n !== net) return;
    if (game.state === 'playing') { game.finish(-1, 'The host left the game.'); roomGone('The host left the game.'); }
    else if (endScreenBuilt()) roomGone('The host left the game.');
    else { ui.lobbyError('The host closed the game.'); $('lobby').classList.add('hidden'); $('menu').classList.remove('hidden'); }
  });
  return n;
}
// The Host or the Join that has not been answered yet: 'host', or the code asked for. A second click on it (a double click, Enter and a click) is the same
// click; the other button, or another code, drops it and asks anew.
let asking = null;

// ---------------- the room's seating (the host decides; seats.js has the rules) ----------------
const heroRoom = () => (heroOn ? { win: heroWin, size: room.size, seats: room.seats } : null);
// why the host cannot start the battle yet (null: it can)
const startProblem = () => (heroOn ? heroProblem(room.seats, room.size, seated()) : warProblem(room.slots, seated(), coop));
// what everybody's lobby shows (the host sends it as it is; a guest draws what it is sent)
const roomView = () => ({ players: lobby, coop, diff: roomDiff, obj: warOn ? 'war' : objective, war: warOn ? warSetup() : null, len: options.length, land: { biome: land.biome, seed: land.seed }, rv: lobbyRivals(), slots: room.slots, hero: heroRoom() });
// the first colour nobody in the room flies (`wish` when it is free)
const freeColor = (wish, who = null) => {
  const taken = new Set(lobby.filter((p) => p !== who).map((p) => p.col));
  return isColorId(wish) && !taken.has(wish) ? wish : COLOR_IDS.find((c) => !taken.has(c));
};

// the host moves `p` to castle / seat n (its own click, or a guest's ask, checked here)
function hostTake(p, n) {
  if (!p || !Number.isInteger(n)) return false;
  if (heroOn) { if (!canTakeSeat(room.seats, room.size, seated(), p, n)) return false; p.hs = n; }
  else { if (!canTakeSlot(room.slots, seated(), p, n)) return false; p.team = n; }
  if (p.watch) { p.watch = false; reseat(seated(), room.slots, room.seats, room.size); }   // (a watcher who takes a place plays: a place in the other mode too)
  return true;
}
// `p` watches the battle instead of playing (on), or comes back to play (off: only to a free place)
function hostWatch(p, on) {
  if (!p || !!p.watch === on) return false;
  if (on) { p.watch = true; p.team = -1; p.hs = -1; return true; }
  const team = firstFreeSlot(room.slots, seated()), hs = firstFreeSeat(room.seats, room.size, seated());
  if (heroOn ? hs < 0 : team < 0) return false;
  p.watch = false; p.team = team; p.hs = hs;
  reseat(seated(), room.slots, room.seats, room.size);
  return true;
}
function hostColor(p, id) {
  if (!p || !isColorId(id) || freeColor(id, p) !== id || p.col === id) return false;
  p.col = id;
  return true;
}
// the host's own clicks on the room's rows
const hostActions = {
  take(n) { if (hostTake(lobby.find((p) => p.netId === null), n)) lobbyBroadcast(); },
  state(n) {   // a free castle or seat: open -> an AI (a bot) -> nobody -> open
    if (heroOn) { if (seatInUse(n, room.size) && !lobby.some((p) => p.hs === n)) room.seats[n] = nextState(room.seats[n]); }
    else if (n >= 0 && n < 4 && !lobby.some((p) => p.team === n)) room.slots[n] = nextState(room.slots[n]);
    lobbyBroadcast();
  },
  move(netId) {   // Hero Mode: a guest to the other side (a free seat there, opened for them if it was closed)
    const p = lobby.find((x) => x.netId !== null && String(x.netId) === String(netId));
    if (!p || !heroOn) return;
    const other = 1 - sideOfSeat(p.hs);
    let s = firstFreeSeat(room.seats, room.size, lobby, other);
    if (s < 0 || sideOfSeat(s) !== other) {
      s = [0, 1, 2, 3].map((i) => other * 4 + i).find((x) => seatInUse(x, room.size) && !lobby.some((q) => q.hs === x)) ?? -1;
      if (s < 0) return;   // (the other side is full of people)
      room.seats[s] = 'open';
    }
    p.hs = s;
    lobbyBroadcast();
  },
  color(id) { const me = lobby.find((p) => p.netId === null); if (hostColor(me, id)) { myColor = id; store('cw-color', id); lobbyBroadcast(); } },
  race(id) { const me = lobby.find((p) => p.netId === null); if (me && isRaceId(id)) { me.rc = myRace = id; store('cw-race', id); lobbyBroadcast(); } },
  size(n) { if (!HERO_SIZES.includes(n) || seated().length > 2 * n) return; room.size = n; heroCount = n; store('cw-herosize', n); reseat(seated(), room.slots, room.seats, room.size); lobbyBroadcast(); },
  win(id) { if (HERO.modes[id]) { showHeroWin(id); try { localStorage.setItem('cw-herowin', id); } catch (e) { /* ignore */ } lobbyBroadcast(); } },
  mode(o) { selectObjective(o); reseat(seated(), room.slots, room.seats, room.size); lobbyBroadcast(); },
  watch(on) { if (hostWatch(lobby.find((p) => p.netId === null), on)) lobbyBroadcast(); },
  diff(d) { if (!isDiff(d) || d === roomDiff) return; roomDiff = d; store('cw-mpdiff', d); lobbyBroadcast(); },
};
// a guest's clicks: asks for the host
const guestActions = {
  take(n) { net.toHost({ k: guestView && guestView.hero ? 'hseat' : 'seat', n }); },
  color(id) { if (isColorId(id)) { myColor = id; store('cw-color', id); net.toHost({ k: 'col', col: id }); } },
  race(id) { if (isRaceId(id)) { myRace = id; store('cw-race', id); net.toHost({ k: 'race', rc: id }); } },
  watch(on) { net.toHost({ k: 'watch', on: !!on }); },
  state() {}, move() {}, size() {}, win() {}, mode() {}, diff() {},
};
function showRoom(v, isHost) {
  ui.renderLobby(v.players.filter((p) => !p.watch), v.coop, v.obj, v.len);
  drawLobby({ ...v, me: isHost ? null : net.id, host: isHost, problem: isHost ? startProblem() : null }, isHost ? hostActions : guestActions);
}

// What a guest says in the room (in the lobby, and on the end screen before a rematch): its class, what it wears, its castle or seat, its colour.
// `looks`: what guests said they wear and which colour they want before the host had seated them.
const looks = new Map(), wishes = new Map(), raceWishes = new Map();
function hostHears({ from, d }) {
  if (!d) return;
  const p = lobby.find((x) => x.netId === from);
  if (d.k === 'cos') {   // a guest's banner, cloak and capstones
    const look = sanitizeLoadout(d.cos), same = JSON.stringify(look) === JSON.stringify(looks.get(from));
    looks.set(from, look);
    if (p && !(same && JSON.stringify(p.cos) === JSON.stringify(look))) { p.cos = look; lobbyBroadcast(); }   // (a guest repeating itself does not make the host redraw the room)
    return;
  }
  if (d.k === 'col') {
    if (isColorId(d.col)) wishes.set(from, d.col);
    if (hostColor(p, d.col)) lobbyBroadcast();
    return;
  }
  if (d.k === 'race') {   // a guest's army's race (races.js; anything else is ignored)
    if (!isRaceId(d.rc)) return;
    raceWishes.set(from, d.rc);
    if (p && p.rc !== d.rc) { p.rc = d.rc; lobbyBroadcast(); }
    return;
  }
  if (d.k === 'watch') { if (hostWatch(p, !!d.on)) lobbyBroadcast(); return; }   // (to watch instead of play, or back)
  if (d.k === 'seat' || d.k === 'hseat') {   // (asked in the other mode than the room's now: the host has switched meanwhile, and the ask is dropped)
    if ((d.k === 'hseat') === heroOn && hostTake(p, Number(d.n))) lobbyBroadcast();
    return;
  }
  if (d.k !== 'cls' || !isClassId(d.cls)) return;
  if (p && p.cls !== d.cls) { p.cls = d.cls; lobbyBroadcast(); }
}

$('hostBtn').addEventListener('click', async () => {
  if (asking === 'host') return;
  asking = 'host';
  rememberName();
  ui.lobbyError('');
  try { if (!(await connect())) return; } catch (e) { asking = null; ui.lobbyError(e.message); return; }
  room.size = heroCount;
  lobby = [{ team: 0, hs: 0, name: playerName(), netId: null, cls: heroClass, cos: progress.loadout(), col: myColor, rc: myRace }];
  reseat(seated(), room.slots, room.seats, room.size);
  lobbyBroadcast = () => { const v = roomView(); showRoom(v, true); net.toAll({ k: 'lobby', ...v }); };
  net.on('data', hostHears);
  for (const b of document.querySelectorAll('#lobbyModes button')) {
    b.onclick = () => { coop = b.dataset.mode === 'coop'; lobbyBroadcast(); };
  }
  for (const b of document.querySelectorAll('#lobbyLength button')) {
    b.onclick = () => { selectLength(b.dataset.l); lobbyBroadcast(); };
  }
  net.on('created', (m) => { asking = null; ui.showLobby(m.code, true); showLobbyClassPicker(); showLobbyLand(true); lobbyBroadcast(); });
  net.on('peer', (m) => {
    if (lobby.some((p) => p.netId === m.id)) return;
    const team = firstFreeSlot(room.slots, seated()), hs = firstFreeSeat(room.seats, room.size, seated());
    const watch = heroOn ? hs < 0 : team < 0;   // (the host has closed every free place: the newcomer can still watch, spectate.js)
    lobby.push({ team: watch ? -1 : team, hs: watch ? -1 : hs, watch, name: m.name, netId: m.id, cls: 'knight', cos: looks.get(m.id) || sanitizeLoadout(null), col: freeColor(wishes.get(m.id)), rc: raceWishes.get(m.id) || 'human' });
    lobbyBroadcast();
  });
  net.on('leave', (id) => { lobby = lobby.filter((p) => p.netId !== id); lobbyBroadcast(); });
  net.create(playerName());
});

$('startOnline').addEventListener('click', () => {
  if (startProblem()) return;
  const hero = heroOn ? { win: heroWin, size: room.size, seats: room.seats.slice() } : null;
  const war = warOn ? warSetup() : null;   // (War Mode: warmode.js; its armies are the castles of the room's list)
  reseat(seated(), room.slots, room.seats, room.size);   // (nobody without a place)
  const players = seated().map((p) => ({ ...p, team: hero ? sideOfSeat(p.hs) : p.team }));   // (in a hero match a player's house is their side's)
  const watchers = lobby.filter((p) => p.watch).map((p) => ({ netId: p.netId, name: p.name }));   // (they get the battle's snapshots and news: spectate.js)
  const colors = assignColors(colorWants(players, !!hero));
  const races = assignRaces(raceWants(players, !!hero), otherRaces, myRace);   // (each house's army's race: the guests build the same looks)
  const empty = hero ? [] : emptyTeams(room.slots, players);
  const sigils = aiSigils(races);   // (the AI lords' sigils: drawn here once, so every screen flies the same)
  const opts = matchOptions(hero ? [] : players.map((p) => p.team).concat(empty));   // (no rival lord for a castle a person holds, or nobody)
  net.toAll({ k: 'start', diff: roomDiff, players, watch: watchers.map((w) => w.netId), map: mapSize, coop, obj: war ? 'war' : objective, war, opts, hero, empty, colors, races, sigils });
  const me = players.find((p) => p.netId === null);   // (none: the host watches, and simulates the battle without a hero of its own)
  begin(roomDiff, { mode: 'host', spectator: !me, localTeam: me ? me.team : 0, players: players.map((p) => ({ ...p, me: p === me })), watchers: watchers.filter((w) => w.netId !== null),
    coop: !hero && coop, objective, hero, war, empty, colors, races, sigils, options: opts });
});

$('joinBtn').addEventListener('click', async () => {
  rememberName();
  ui.lobbyError('');
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { ui.lobbyError('Enter the 4-letter room code from the host.'); return; }
  if (asking === code) return;
  asking = code;
  try { if (!(await connect())) return; } catch (e) { asking = null; ui.lobbyError(e.message); return; }
  net.on('joined', (m) => { asking = null; ui.showLobby(m.code, false); showLobbyClassPicker(); showLobbyLand(false, { biome: 'meadow', seed: 0 }); net.toHost({ k: 'cos', cos: progress.loadout() }); net.toHost({ k: 'col', col: myColor }); net.toHost({ k: 'race', rc: myRace }); });
  guestData = ({ d }) => {
    if (!d) return;
    if (d.k === 'rematch') guestRematch();
    if (d.k === 'decrees') hearDecrees(d.ids);   // (the host's roll for the next battle: it comes after the match, when this handler is back: see roomAfterMatch)
    if (d.k === 'full') {   // (every free place of the room is closed)
      ui.lobbyError('That game has no free place: the host has closed them.');
      try { net.close(); } catch (e) { /* already gone */ }
      $('lobby').classList.add('hidden'); $('menu').classList.remove('hidden');
      return;
    }
    if (d.k === 'lobby' && Array.isArray(d.players)) {
      hearWar(d.war);   // (War Mode's Armies row)
      guestView = { players: d.players, coop: !!d.coop, diff: isDiff(d.diff) ? d.diff : 'normal', obj: OBJECTIVES[d.obj] || d.obj === 'war' ? d.obj : 'conquest', len: d.len, rv: d.rv, slots: cleanSlots(d.slots),
        hero: d.hero ? { win: HERO.modes[d.hero.win] ? d.hero.win : 'kills', size: heroSize(d.hero.size), seats: cleanSeats(d.hero.seats) } : null };
      showRoom(guestView, false);
      const l = sanitizeOptions(d.land);   // (the land the host has picked; the guest builds it when the battle starts)
      showLobbyLand(false, { biome: l.biome, seed: l.seed });
    }
    if (d.k === 'start' && Array.isArray(d.players)) {
      const me = d.players.find((p) => p.netId === net.id);
      const watching = !me && Array.isArray(d.watch) && d.watch.includes(net.id);   // (this guest watches: spectate.js)
      if (!me && !watching) return;
      const hero = d.hero ? { win: HERO.modes[d.hero.win] ? d.hero.win : 'kills', size: heroSize(d.hero.size), seats: cleanSeats(d.hero.seats) } : null;
      const players = d.players.map((p) => ({ team: p.team, hs: p.hs, name: p.name, cls: p.cls, cos: sanitizeLoadout(p.cos), me: p === me }));
      const empty = Array.isArray(d.empty) ? d.empty.filter((t) => Number.isInteger(t) && t >= 0 && t < 4) : [];
      begin(isDiff(d.diff) ? d.diff : 'normal', { mode: 'client', spectator: watching, localTeam: me ? me.team : 0, players, coop: !!d.coop && !hero, objective: OBJECTIVES[d.obj] ? d.obj : 'conquest', hero, war: d.obj === 'war' && !hero ? sanitizeWar(d.war) : null, empty, colors: sanitizeColors(d.colors), races: sanitizeRaces(d.races), sigils: sanitizeSigils(d.sigils, d.races), options: sanitizeOptions(d.opts) }, d.map || 'medium');
    }
  };
  net.on('data', guestData);
  net.join(code, playerName());
});

$('leaveLobby').addEventListener('click', () => location.reload());

// ---------------- a rematch in the same room ----------------
// When a match ends the room goes back to lobby duty: the host's end screen has "Rematch", which takes everybody who is still here back to the room's lobby,
// where classes are picked again and the host starts the next battle. (The room stays locked: nobody new can join a game that has started.)
function endScreenBuilt() { return !$('gameover').classList.contains('hidden'); }   // (built: it may still be see-through behind the show of an ending, finale.js)
function endScreenUp() {   // (in view: built, and no longer kept see-through behind the show, which needs the finished world under it)
  const c = $('gameover').classList;
  return !c.contains('hidden') && !c.contains('finale-wait');
}
function inRoom() { return !!net && !flow.left && (net.role === 'host' || net.role === 'client'); }   // (functions, not consts: flow.bind above takes them at load)

// the match is over: put the room's handlers back (the match's sync replaced them) and see who is still here
function roomAfterMatch(s) {
  if (!net || flow.left) return;
  if (s.mode === 'client') { net.on('data', guestData); net.toHost({ k: 'cos', cos: progress.loadout() }); return; }   // (what the match earned: the host may not be listening yet, so backToLobby says it again)
  if (s.mode !== 'host') return;
  const here = new Set(game.humans.filter((h) => !h.isBot && h !== game.player).map((h) => h.netId).concat(game.watchers.map((w) => w.netId)));   // (and the guests who watched)
  lobby = lobby.filter((p) => p.netId === null || here.has(p.netId));
  const me = lobby.find((p) => p.netId === null);
  if (me) { me.cls = heroClass; me.cos = progress.loadout(); }   // (the match may have earned a banner, a cloak or a capstone)
  net.on('data', hostHears);   // (guests may change class on their end screens, and tell what they wear now)
  net.on('leave', (id) => { lobby = lobby.filter((p) => p.netId !== id); if (lobbyBroadcast) lobbyBroadcast(); });
}

function backToLobby(isHost) {
  if (game.state === 'playing') return;
  clearTimeout(freshTimer);
  const practice = !!game.practice;   // (the world's key also carries the land: it is not parsed; this asks for what freshWorldSoon builds)
  ensureMap(WORLD.size, practice, practice ? null : { biome: land.biome, seed: land.seed }, game.war ? planOf(game.war.sideList) : false);   // (a fresh world for the next match, on the land the end screen rolled; War Mode: this match's hills)
  ui.reset();
  ui.hideHud();
  if (!isHost && net) net.toHost({ k: 'cos', cos: progress.loadout() });   // (the host is back in its lobby now: what this match earned is for the next battle)
  ui.showLobby($('roomCode').textContent, isHost);
  $('invite').classList.add('hidden');   // (nobody new can join a game that has started)
  $('inviteHelp').textContent = 'The same room, the same lords: pick your class, and the host starts the next battle.';
  showLobbyClassPicker();
}
function hostRematch() {
  if (!inRoom() || net.role !== 'host') return;
  net.toAll({ k: 'rematch' });
  backToLobby(true);
  if (lobbyBroadcast) lobbyBroadcast();
}
function guestRematch() { backToLobby(false); }
function leaveRoom() { if (net) { try { net.close(); } catch (e) { /* already gone */ } } }

// ---------------- game menu (Esc), options and controls ----------------
const shown = (id) => !$(id).classList.contains('hidden');
let lastUnlockAt = -1e9;

function openPause(hint = '') {
  if (game.state !== 'playing') return;
  game.paused = true;
  pauseFromUnlock = false;
  $('pauseNote').textContent = game.mode === 'single' ? '' : 'The battle goes on while you are in the menu.';
  $('pauseHint').textContent = hint;
  $('quitConfirm').classList.add('hidden');
  const offer = offerFor(game);   // (a decided battle: the menu offers to end it)
  $('pauseOffer').classList.toggle('hidden', !offer);
  $('offerConfirm').classList.add('hidden');
  if (offer) { $('pauseOffer').textContent = offer.label; $('offerConfirmText').textContent = offer.ask; $('offerYes').textContent = offer.yes; }
  ui.showPause(true);
  input.unlock();
  syncClickFight();   // (Esc on "Click to fight": the menu replaces it)
}
function closePause() {
  $('options').classList.add('hidden');
  $('controls').classList.add('hidden');
  $('pauseHint').textContent = '';
  ui.showPause(false);
  game.paused = false;
  input.lock();
}

$('resume').addEventListener('click', closePause);
$('pauseOptions').addEventListener('click', () => $('options').classList.remove('hidden'));
$('pauseControls').addEventListener('click', () => $('controls').classList.remove('hidden'));
$('menuOptions').addEventListener('click', () => $('options').classList.remove('hidden'));
$('menuControls').addEventListener('click', () => $('controls').classList.remove('hidden'));
$('optionsBack').addEventListener('click', () => $('options').classList.add('hidden'));
$('controlsBack').addEventListener('click', () => $('controls').classList.add('hidden'));
$('quitBtn').addEventListener('click', () => $('quitConfirm').classList.remove('hidden'));
$('quitNo').addEventListener('click', () => $('quitConfirm').classList.add('hidden'));
$('quitYes').addEventListener('click', () => { if (net) location.reload(); else toMenu(); });   // (an online game is left by starting the page afresh)

// the UI scale (Options): one number the HUD's CSS multiplies its screen-size base by (index.html, --hud-zoom)
function applyUiScale(v) {
  const s = Math.min(140, Math.max(80, Number(v) || 100));
  document.documentElement.style.setProperty('--ui-scale', String(s / 100));
  ui.fitHero();   // (the Hero Mode panels may no longer fit side by side)
}
applyUiScale(settings.uiscale);

// sliders in the options panel
const SLIDERS = [
  ['optMaster', 'master', (v) => audio.setVolume('master', v / 100), '%'],
  ['optMusic', 'music', (v) => audio.setVolume('music', v / 100), '%'],
  ['optSfx', 'sfx', (v) => audio.setVolume('sfx', v / 100), '%'],
  ['optSens', 'sens', (v) => { game.player.sensitivity = sensitivityOf(v); }, '%'],
  ['optFov', 'fov', (v) => { game.player.baseFov = v; }, '°'],
  ['optUiScale', 'uiscale', (v) => applyUiScale(v), '%'],
];
for (const [id, key, apply, unit] of SLIDERS) {
  const el = $(id), out = el.nextElementSibling;
  el.value = settings[key];
  out.textContent = settings[key] + unit;
  el.addEventListener('input', () => {
    settings[key] = Number(el.value);
    out.textContent = settings[key] + unit;
    apply(settings[key]);
    saveSettings();
  });
}

// switches in the options panel (alerts.js looks at the settings as it goes)
for (const [id, key] of [['optAlerts', 'alerts'], ['optTips', 'tips'], ['optDynres', 'dynres'], ['optFinale', 'finale'], ['optDecrees', 'decrees']]) {
  const el = $(id), out = el.nextElementSibling;
  const show = () => { el.checked = !!settings[key]; out.textContent = settings[key] ? 'On' : 'Off'; };
  show();
  el.addEventListener('change', () => { settings[key] = el.checked ? 1 : 0; show(); saveSettings(); });
}

// "Click to fight": the browser gives the game the mouse only from a click. When it refuses (the start of a match, Resume too soon after Esc) or takes the
// mouse away without Esc (another window, alt-tab), the whole screen asks for that click instead of a menu. A single player's battle waits meanwhile.
// It is shown while the game still wants the mouse (input.wantLock) and nothing else is open; any panel that frees the mouse (input.unlock) puts it away.
let needClick = false, cfShown = false, cfPaused = false;
function askClick() {
  if (game.state !== 'playing') return;
  needClick = true;
  input.wantLock = true;   // (the next click captures the mouse; a grant that comes late is kept)
  ui.showPause(false);
  if (game.mode === 'single') { game.paused = true; cfPaused = true; }
  syncClickFight();
}
// every frame, but only booleans unless the overlay is wanted or up
function syncClickFight() {
  if (!needClick && !cfShown) return;
  const busy = ui.shopOpen || ui.mapOpen || ui.practiceOpen || (game.war && game.war.panelOpen) || shown('pause') || shown('gameover');
  if (needClick && (game.state !== 'playing' || input.locked || !input.wantLock)) needClick = false;
  const want = needClick && !busy;
  if (want === cfShown) return;
  cfShown = want;
  if (want) {
    $('clickFightTitle').textContent = game.spectator ? 'Click to watch' : 'Click to fight';
    $('clickFightNote').textContent = game.mode === 'single' ? 'The battle waits for you' : 'The battle goes on';
  } else if (cfPaused) {   // (put away by a panel or the capture: the pause was the overlay's own)
    cfPaused = false;
    if (!shown('pause') && game.state === 'playing') game.paused = false;
  }
  $('clickFight').classList.toggle('hidden', !want);
}
$('clickFight').addEventListener('mousedown', (e) => { if (e.button === 0) input.lock(); });   // (mousedown: the capture starts on the press, as on the field)
addEventListener('blur', () => {
  // the mouse was freed and the window lost focus at once: that was alt-tab, not Esc (whichever of the two events came first): ask for a click, not the menu
  if (game.state === 'playing' && shown('pause') && pauseFromUnlock && performance.now() - lastUnlockAt < 500) askClick();
});
let pauseFromUnlock = false;

input.onLockFail = () => {
  if (game.state !== 'playing' || ui.shopOpen) return;
  askClick();
};
input.onLockChange = (locked) => {
  if (game.state !== 'playing') return;
  if (locked) {
    $('options').classList.add('hidden');
    $('controls').classList.add('hidden');
    game.paused = false;
    cfPaused = false;
    ui.showPause(false);
    syncClickFight();
    return;
  }
  lastUnlockAt = performance.now();
  game.player.cancelAim();   // a volley being placed is dropped when the menu comes up
  if (ui.shopOpen || ui.mapOpen || ui.practiceOpen || (game.war && game.war.panelOpen)) return;   // (those panels free the mouse themselves)
  if (input.wantLock && (document.hidden || !document.hasFocus())) { askClick(); return; }   // another window took the focus (alt-tab): a click brings you back
  openPause();   // Esc while playing: the browser frees the mouse, and the menu comes up
  pauseFromUnlock = true;
};

$('shopClose').addEventListener('click', () => ui.toggleShop(false));
// Ready (skip the first preparation) and the offer to end a decided battle: the keys are in flow.js, these are the buttons
$('shopReady').addEventListener('click', (e) => { pressReady(game, ui); e.currentTarget.blur(); });   // (blur: a later Space is a jump, not another press)
$('readyBtn').addEventListener('click', (e) => { pressReady(game, ui); e.currentTarget.blur(); });
$('offerBtn').addEventListener('click', (e) => { pressOffer(game, ui); e.currentTarget.blur(); });
$('pauseOffer').addEventListener('click', () => $('offerConfirm').classList.remove('hidden'));
$('offerNo').addEventListener('click', () => $('offerConfirm').classList.add('hidden'));
$('offerYes').addEventListener('click', () => confirmOffer(game, ui));

// Clicking the game view while playing re-captures the mouse.
renderer.domElement.addEventListener('click', () => {
  if (game.state === 'playing' && !input.locked && !ui.shopOpen && !ui.mapOpen && !ui.practiceOpen && !shown('pause') && !(game.war && game.war.panelOpen)) input.lock();
});

// Escape: close whatever is open on top, else open or close the game menu.
// (Browsers hide Esc from the page while the mouse is captured; they release it, which opens the menu above.)
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !e.repeat) {
    if (shown('options')) { $('options').classList.add('hidden'); return; }
    if (shown('controls')) { $('controls').classList.add('hidden'); return; }
    if (ui.shopOpen) { input.pressed.delete(e.code); ui.toggleShop(false); return; }
    if (ui.mapOpen) { ui.toggleMap(false); return; }
    if (ui.practiceOpen) { ui.togglePractice(false); return; }
    if (game.war && game.war.panelOpen) {   // (War Mode's army panel)
      // (a browser never captures the mouse from Esc, and the refusal would bring up the pause menu: the next click on the field takes it instead)
      game.war.ui.setPanel(false, false);
      ui.toast('Click to look around (B brings the army panel back)');
      return;
    }
    if (game.state !== 'playing') return;
    if (performance.now() - lastUnlockAt < 350) return;   // the release of the mouse has just opened the menu
    if (shown('pause')) closePause(); else openPause();
    return;
  }
  if (ui.shopOpen && (e.code === 'KeyB' || (e.code === 'KeyO' && !game.hero))) {   // (O does nothing in Hero Game Mode)
    e.preventDefault();
    input.pressed.delete(e.code); // don't let the game loop re-open it this frame
    ui.toggleShop(false);
    if (e.code === 'KeyB' && game.war && !game.war.fighting) game.war.ui.setPanel(true);   // (War Mode's build: B goes from the Talents panel back to the army panel)
  }
  if (ui.shopOpen && e.code === 'KeyN') {   // N: the Talents tab (and closes the shop when it is already there)
    e.preventDefault();
    input.pressed.delete(e.code);
    if (!e.repeat) ui.openTalents();
  }
});

addEventListener('keydown', (e) => {
  flowKey(e, game, ui);
  // I: the full key line on the HUD, or back to the small note (not F1: in a war F1 is "follow me", in War Mode an order)
  if (e.code === 'KeyI' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && game.state === 'playing' && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) ui.toggleKeys();
  if (e.code === 'Enter' && !e.repeat && e.target === document.body && shown('menu') && !shown('options') && !shown('controls') && !($('wardrobe') && shown('wardrobe')) && !($('whatsNew') && shown('whatsNew'))) { e.preventDefault(); $('quickPlay').click(); }
});

// Browsers only allow sound after a click or key press: the music starts with the first one.
function wakeAudio() {
  audio.init();
  audio.startMusic();
  removeEventListener('pointerdown', wakeAudio);
  removeEventListener('keydown', wakeAudio);
}
addEventListener('pointerdown', wakeAudio);
addEventListener('keydown', wakeAudio);

const pacer = new FramePacer();   // (the step of each frame, from the refresh it is shown at: see framepace.js)
let frameErrors = 0;
let fpsT0 = performance.now(), frames = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const dt = pacer.step(ts === undefined ? t0 : ts);
  // one bad frame must never freeze the game: report it once and keep going
  try {
    game.update(dt);
    ui.update(dt);
    syncClickFight();
  } catch (e) {
    if (!frameErrors++) console.error('Frame error (the game keeps running):', e);
  }
  input.endFrame();
  gfx.renderFrame(dt, t0);
  frames++;
  if (t0 - fpsT0 > 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (t0 - fpsT0))} fps${gfx.scaleLabel()}`; frames = 0; fpsT0 = t0; }
}
frame();
