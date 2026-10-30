// Entry point: renderer, main loop and menu wiring.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI, renderClassPicker } from './ui.js';
import { CLASSES } from './classes.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { RoomNet } from './roomnet.js';
import { PeerNet } from './peernet.js';
import { setMapSize, setPracticeWorld, WORLD, MAP_SIZES, OBJECTIVES } from './config.js';
import { HERO } from './herogame.js';
import { settings, saveSettings, sensitivityOf } from './settings.js';
import { initPerf } from './perf.js';
import { gfx } from './gfx.js';
import { LEVELS, applyQuality } from './quality.js';
import { loadOptions, saveOptions, sanitizeOptions } from './options.js';
import { setWorldLand, landKey, land, loadLand } from './biomes.js';
import { initLandMenu, showLobbyLand } from './landui.js';
import { progress, sanitizeLoadout } from './progress.js';
import { endSound } from './endprogress.js';   // (the end screen's battle and Renown sections)
import './wardrobe.js';       // (the Renown panel of the menu)
import { pendingDecrees } from './decrees.js';

const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

// the key of a world: its map size, the practice yard and the land it is dressed as (a different land is another world, built again)
const worldKey = (size, practice, o) => size + (practice ? '+practice' : '') + (practice ? '' : landKey(o.biome, o.seed));

function buildGame(size, practice = false, landOpts = null) {
  const o = sanitizeOptions(landOpts);
  setMapSize(size);
  setPracticeWorld(practice);   // the practice courtyard is part of the world itself: its ground is flat and free of trees
  setWorldLand(practice ? 'meadow' : o.biome, practice ? 0 : o.seed);   // (the courtyard is always the meadow)
  game = new Game(renderer, ui, audio, input, { practice });
  game.state = 'menu';
  game.mapBuiltFor = worldKey(size, practice, o);
  ui.mapBg = ui.bigBg = null;
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
try {
  buildGame(mapSize, false, land);
} catch (e) {
  console.error(e);
  $('loading').textContent = 'Failed to start: ' + e.message;
  throw e;
}
$('loading').classList.add('hidden');
$('menu').classList.remove('hidden');
// the profiler overlay (` or ?perf) and the benchmark (window.__bench): nothing is hooked until the overlay is switched on
initPerf({ renderer, getGame: () => game, render: () => gfx.renderFrame(1 / 60), host: gfx });

function resize() { gfx.resize(); }
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

let difficulty = 'normal';
document.querySelectorAll('#difficulty button').forEach((b) => {
  b.addEventListener('click', () => {
    difficulty = b.dataset.d;
    document.querySelectorAll('#difficulty button').forEach((o) => o.classList.toggle('active', o === b));
  });
});

function selectMap(size) {
  mapSize = size;
  document.querySelectorAll('#mapsize button').forEach((b) => b.classList.toggle('active', b.dataset.m === size));
  $('mapDesc').textContent = MAP_SIZES[size].desc;
  try { localStorage.setItem('cw-map', size); } catch (e) { /* ignore */ }
}
document.querySelectorAll('#mapsize button').forEach((b) => b.addEventListener('click', () => selectMap(b.dataset.m)));
selectMap(mapSize);

// the match options besides map, mode, difficulty and class (length, biome, decrees, rival lords: see options.js), remembered per browser. The menu pieces
// that choose them change fields of this object; every start below sends a sanitized copy and remembers it
let options = loadOptions();
const matchOptions = () => { options = sanitizeOptions({ ...options, biome: land.biome, seed: land.seed, decrees: pendingDecrees() }); saveOptions(options); return options; };   // (the land comes from biomes.js and the Battle Decrees from decrees.js: the end screen rolls both)

// game mode: Conquest is the main one (the page always opens on it), King of the Hill puts a prize in the middle of the map
let objective = 'conquest';
// Hero Mode is the third choice of the Mode row. It is not an objective of the war (OBJECTIVES, the lobby): it has its own
// setup (`hero: { win }`) and its own row of three ways to win, the last one remembered per browser.
let heroOn = false;
let heroWin = 'kills';
try { heroWin = localStorage.getItem('cw-herowin') || 'kills'; } catch (e) { /* storage unavailable */ }
if (!HERO.modes[heroWin]) heroWin = 'kills';
const HERO_DESC = 'Three heroes against three, out of one castle each: you and two bot heroes against three. You control only your hero and its talents; the armies march by themselves, every round tougher.';
function showHeroWin(id) {
  heroWin = id;
  document.querySelectorAll('#heroWin button').forEach((b) => b.classList.toggle('active', b.dataset.w === id));
  $('heroWinDesc').textContent = HERO.modes[id].desc;
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
function selectObjective(o) {
  const hero = o === 'hero';
  if (!hero && !OBJECTIVES[o]) return;
  heroOn = hero;
  if (!hero) objective = o;
  document.querySelectorAll('#objective button').forEach((b) => b.classList.toggle('active', b.dataset.o === o));
  document.querySelectorAll('#lobbyObjective button').forEach((b) => b.classList.toggle('active', b.dataset.o === objective));
  $('objDesc').textContent = hero ? HERO_DESC : OBJECTIVES[o].desc;
  $('lobbyObjDesc').textContent = OBJECTIVES[objective].desc;
  $('heroWin').classList.toggle('hidden', !hero);
  $('heroNote').classList.toggle('hidden', !hero);
  $('menu').classList.toggle('hero', hero);
  // online play is for the war modes this round: the lobby cannot start a hero match
  $('mpBtn').disabled = hero;
  $('mpBtn').title = hero ? 'Hero Game Mode is single player for now' : '';
  if (hero) { $('online').classList.add('hidden'); $('offlineNote').classList.add('hidden'); $('mpBtn').classList.remove('active'); }
}
document.querySelectorAll('#objective button').forEach((b) => b.addEventListener('click', () => selectObjective(b.dataset.o)));
selectObjective(objective);

// rebuild the world if the chosen map size differs from the one on screen
function ensureMap(size, practice = false, landOpts = null) {
  const o = sanitizeOptions(landOpts);
  if (WORLD.size === size && game.mapBuiltFor === worldKey(size, practice, o)) return;
  const net0 = game.net;
  game.dispose();
  buildGame(size, practice, o);
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
    previewTimer = setTimeout(() => { if (game.state === 'menu') ensureMap(mapSize, false, land); }, 350);
  },
});

function begin(diff, setup = null, map = mapSize) {
  ensureMap(map, !!(setup && setup.practice), setup && setup.options);
  if (net) game.net = net;
  audio.init();
  audio.startMusic();
  $('menu').classList.add('hidden');
  $('lobby').classList.add('hidden');
  ui.showHud();
  game.start(diff, setup);
  input.lock();
}

// hero class (remembered per browser)
let heroClass = 'knight';
try { heroClass = localStorage.getItem('cw-class') || 'knight'; } catch (e) { /* storage unavailable */ }
if (!CLASSES[heroClass]) heroClass = 'knight';
const rememberClass = (id) => {
  heroClass = id;
  try { localStorage.setItem('cw-class', id); } catch (e) { /* ignore */ }
};
renderClassPicker($('classPick'), $('classInfo'), heroClass, rememberClass);

$('play').addEventListener('click', () => begin(difficulty, heroOn
  ? { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: heroClass }], hero: { win: heroWin }, options: matchOptions() }
  : { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: heroClass }], objective, options: matchOptions() }));
// the practice courtyard: a walled yard with training dummies, on the small map (it is built into the world, so the world is rebuilt)
$('practiceBtn').addEventListener('click', () => begin(difficulty, { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: heroClass }], practice: true }, 'small'));

// ---------------- online play ----------------
let net = null;
let lobby = [];      // [{ team, name, netId, cls, cos }]   (cos: the banner, cloak and capstones the account behind the player wears: progress.js)
let coop = false;    // lobby game mode chosen by the host
let lobbyBroadcast = null;

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

async function connect() {
  if (!(await onlineReady)) throw new Error('Online play is not available here.');
  net = liveRoom ? new RoomNet(liveRoom) : direct ? new PeerNet() : new Net();
  game.net = net;
  await net.connect();
  net.on('error', (msg) => { ui.lobbyError(msg); net.close(); $('lobby').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  net.on('closed', () => {
    if (game.state === 'playing' && game.mode === 'client') game.finish(-1, 'Lost connection to the server.');
  });
  net.on('hostleft', () => {
    if (game.state === 'playing') game.finish(-1, 'The host left the game.');
    else { ui.lobbyError('The host closed the game.'); $('lobby').classList.add('hidden'); $('menu').classList.remove('hidden'); }
  });
}

$('hostBtn').addEventListener('click', async () => {
  rememberName();
  ui.lobbyError('');
  try { await connect(); } catch (e) { ui.lobbyError(e.message); return; }
  lobby = [{ team: 0, name: playerName(), netId: null, cls: heroClass, cos: progress.loadout() }];
  const broadcast = () => { ui.renderLobby(lobby, 0, coop, objective); net.toAll({ k: 'lobby', players: lobby, coop, obj: objective, land: { biome: land.biome, seed: land.seed } }); };
  lobbyBroadcast = broadcast;
  // guests report the class they pick
  const looks = new Map();   // what guests said they wear (a guest may speak before the host has seated it)
  net.on('data', ({ from, d }) => {
    if (d && d.k === 'cos') {   // a guest's banner, cloak and capstones
      looks.set(from, sanitizeLoadout(d.cos));
      const q = lobby.find((x) => x.netId === from);
      if (q) { q.cos = looks.get(from); broadcast(); }
      return;
    }
    if (!d || d.k !== 'cls' || !CLASSES[d.cls]) return;
    const p = lobby.find((x) => x.netId === from);
    if (p && p.cls !== d.cls) { p.cls = d.cls; broadcast(); }
  });
  for (const b of document.querySelectorAll('#lobbyModes button')) {
    b.onclick = () => { coop = b.dataset.mode === 'coop'; broadcast(); };
  }
  for (const b of document.querySelectorAll('#lobbyObjective button')) {
    b.onclick = () => { selectObjective(b.dataset.o); broadcast(); };
  }
  net.on('created', (m) => { ui.showLobby(m.code, true); showLobbyClassPicker(); showLobbyLand(true); broadcast(); });
  net.on('peer', (m) => {
    const used = new Set(lobby.map((p) => p.team));
    const team = [1, 2, 3].find((t) => !used.has(t));
    if (team === undefined) return;
    lobby.push({ team, name: m.name, netId: m.id, cls: 'knight', cos: looks.get(m.id) || sanitizeLoadout(null) });
    broadcast();
  });
  net.on('leave', (id) => { lobby = lobby.filter((p) => p.netId !== id); broadcast(); });
  net.create(playerName());
});

$('startOnline').addEventListener('click', () => {
  const opts = matchOptions();
  net.toAll({ k: 'start', diff: difficulty, players: lobby, map: mapSize, coop, obj: objective, opts });
  begin(difficulty, { mode: 'host', localTeam: 0, players: lobby, coop, objective, options: opts });
});

$('joinBtn').addEventListener('click', async () => {
  rememberName();
  ui.lobbyError('');
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { ui.lobbyError('Enter the 4-letter room code from the host.'); return; }
  try { await connect(); } catch (e) { ui.lobbyError(e.message); return; }
  net.on('joined', (m) => { ui.showLobby(m.code, false); showLobbyClassPicker(); showLobbyLand(false, { biome: 'meadow', seed: 0 }); net.toHost({ k: 'cos', cos: progress.loadout() }); });
  net.on('data', ({ d }) => {
    if (d.k === 'lobby') {
      ui.renderLobby(d.players, (d.players.find((p) => p.netId === net.id) || {}).team, !!d.coop, d.obj);
      const l = sanitizeOptions(d.land);   // (the land the host has picked; the guest builds it when the battle starts)
      showLobbyLand(false, { biome: l.biome, seed: l.seed });
    }
    if (d.k === 'start') {
      const me = d.players.find((p) => p.netId === net.id);
      if (!me) return;
      begin(d.diff, { mode: 'client', localTeam: me.team, players: d.players.map((p) => ({ team: p.team, name: p.name, cls: p.cls, cos: sanitizeLoadout(p.cos) })), coop: !!d.coop, objective: OBJECTIVES[d.obj] ? d.obj : 'conquest', options: sanitizeOptions(d.opts) }, d.map || 'medium');
    }
  });
  net.join(code, playerName());
});

$('leaveLobby').addEventListener('click', () => location.reload());

// ---------------- game menu (Esc), options and controls ----------------
const shown = (id) => !$(id).classList.contains('hidden');
let lastUnlockAt = -1e9;

function openPause(hint = '') {
  if (game.state !== 'playing') return;
  game.paused = true;
  $('pauseNote').textContent = game.mode === 'single' ? '' : 'The battle goes on while you are in the menu.';
  $('pauseHint').textContent = hint;
  $('quitConfirm').classList.add('hidden');
  ui.showPause(true);
  input.unlock();
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
$('quitYes').addEventListener('click', () => location.reload());

// sliders in the options panel
const SLIDERS = [
  ['optMaster', 'master', (v) => audio.setVolume('master', v / 100), '%'],
  ['optMusic', 'music', (v) => audio.setVolume('music', v / 100), '%'],
  ['optSfx', 'sfx', (v) => audio.setVolume('sfx', v / 100), '%'],
  ['optSens', 'sens', (v) => { game.player.sensitivity = sensitivityOf(v); }, '%'],
  ['optFov', 'fov', (v) => { game.player.baseFov = v; }, '°'],
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

input.onLockFail = () => {
  if (game.state !== 'playing' || ui.shopOpen) return;
  openPause('Your browser needs one more click to capture the mouse. Press Resume.');
};
input.onLockChange = (locked) => {
  if (game.state !== 'playing') return;
  if (locked) {
    $('options').classList.add('hidden');
    $('controls').classList.add('hidden');
    game.paused = false;
    ui.showPause(false);
    return;
  }
  lastUnlockAt = performance.now();
  game.player.cancelAim();   // a volley being placed is dropped when the menu comes up
  if (!ui.shopOpen && !ui.mapOpen && !ui.practiceOpen) openPause();   // Esc while playing: the browser frees the mouse, and the menu comes up
};

$('shopClose').addEventListener('click', () => ui.toggleShop(false));
$('again').addEventListener('click', () => location.reload());

// Clicking the game view while playing re-captures the mouse.
renderer.domElement.addEventListener('click', () => {
  if (game.state === 'playing' && !input.locked && !ui.shopOpen && !ui.mapOpen && !ui.practiceOpen && !shown('pause')) input.lock();
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
    if (game.state !== 'playing') return;
    if (performance.now() - lastUnlockAt < 350) return;   // the release of the mouse has just opened the menu
    if (shown('pause')) closePause(); else openPause();
    return;
  }
  if (ui.shopOpen && (e.code === 'KeyB' || (e.code === 'KeyO' && !game.hero))) {   // (O does nothing in Hero Game Mode)
    e.preventDefault();
    input.pressed.delete(e.code); // don't let the game loop re-open it this frame
    ui.toggleShop(false);
  }
  if (ui.shopOpen && e.code === 'KeyN') {   // N: the Talents tab (and closes the shop when it is already there)
    e.preventDefault();
    input.pressed.delete(e.code);
    if (!e.repeat) ui.openTalents();
  }
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

const clock = new THREE.Clock();
let frameErrors = 0;
let fpsT0 = performance.now(), frames = 0;
function frame() {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const dt = Math.min(0.05, clock.getDelta());
  // one bad frame must never freeze the game: report it once and keep going
  try {
    game.update(dt);
    ui.update(dt);
  } catch (e) {
    if (!frameErrors++) console.error('Frame error (the game keeps running):', e);
  }
  input.endFrame();
  gfx.renderFrame(dt, t0);
  frames++;
  if (t0 - fpsT0 > 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (t0 - fpsT0))} fps${gfx.scaleLabel()}`; frames = 0; fpsT0 = t0; }
}
frame();
