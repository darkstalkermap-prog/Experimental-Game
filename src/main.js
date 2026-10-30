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
import { setMapSize, setPracticeWorld, WORLD, MAP_SIZES, OBJECTIVES, LENGTHS } from './config.js';
import { HERO } from './herogame.js';
import { settings, saveSettings, sensitivityOf } from './settings.js';
import { initPerf } from './perf.js';
import { gfx } from './gfx.js';
import { LEVELS, applyQuality } from './quality.js';
import { loadOptions, saveOptions, sanitizeOptions } from './options.js';
import { flow, loadLast, saveLast, setupLine, onKey as flowKey, offerFor, confirmOffer, pressReady, pressOffer, roomGone } from './flow.js';
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
audio.vol.master = settings.master / 100;
audio.vol.music = settings.music / 100;
audio.vol.sfx = settings.sfx / 100;

function buildGame(size, practice = false) {
  setMapSize(size);
  setPracticeWorld(practice);   // the practice courtyard is part of the world itself: its ground is flat and free of trees
  game = new Game(renderer, ui, audio, input, { practice });
  game.state = 'menu';
  game.mapBuiltFor = size + (practice ? '+practice' : '');
  ui.mapBg = ui.bigBg = null;
  window.__game = game; // handy for debugging from the console
  window.__gfx = gfx;
  gfx.setGame(game);
  applySettings();
}
try {
  buildGame(mapSize);
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
const matchOptions = () => { options = sanitizeOptions({ ...options, decrees: pendingDecrees() }); saveOptions(options); return options; };   // (the Battle Decrees come from decrees.js: the end screen rolls them)
// Between matches the stored options are the truth: the end screen's sections roll the next battle into them (land, rivals) and save, so a rematch reads them
// afresh (the decrees are asked from decrees.js at every start, above). The menu pieces change `options` in memory and the next start saves them.
const refreshOptions = () => { options = loadOptions(); };

// match length (Standard / Short, options.length): the war modes only, the Hero Game Mode has its own length
function showLength() {
  for (const id of ['length', 'lobbyLength']) document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.l === options.length));
  document.querySelectorAll('#length button').forEach((b) => { b.querySelector('small').textContent = LENGTHS[b.dataset.l].time; b.title = LENGTHS[b.dataset.l].desc; });
  $('lengthDesc').textContent = heroOn ? 'Hero Game Mode has its own length: choose how to win above.' : LENGTHS[options.length].desc;
  $('length').classList.toggle('off', heroOn);
  document.querySelectorAll('#length button').forEach((b) => { b.disabled = heroOn; });
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
let heroWin = 'kills';
try { heroWin = localStorage.getItem('cw-herowin') || 'kills'; } catch (e) { /* storage unavailable */ }
if (!HERO.modes[heroWin]) heroWin = 'kills';
const HERO_DESC = 'Three heroes against three, out of one castle each: you and two bot heroes against three. You control only your hero and its talents; the armies march by themselves, every round tougher.';
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
  showLength();   // (the length row is for the war modes: in Hero Mode it says so)
  // online play is for the war modes this round: the lobby cannot start a hero match
  $('mpBtn').disabled = hero;
  $('mpBtn').title = hero ? 'Hero Game Mode is single player for now' : '';
  if (hero) { $('online').classList.add('hidden'); $('offlineNote').classList.add('hidden'); $('mpBtn').classList.remove('active'); }
}
document.querySelectorAll('#objective button').forEach((b) => b.addEventListener('click', () => { selectObjective(b.dataset.o); rememberLast(); }));
const rememberLast = () => saveLast(difficulty, heroOn ? 'hero' : objective);


// Rebuild the world if the chosen map size differs from the one on screen, or if a match has been played in it: a world is for ONE match (castles, units,
// engines and upgrades are all dirty afterwards), so the next one is built as soon as a match ends (freshWorldSoon) and starting it is then instant.
function ensureMap(size, practice = false) {
  if (game.state === 'menu' && WORLD.size === size && game.mapBuiltFor === size + (practice ? '+practice' : '')) return;
  const net0 = game.net;
  game.dispose();
  buildGame(size, practice);
  game.net = net0;
  game.setQuality(quality);
  resize();
}

function begin(diff, setup = null, map = mapSize) {
  clearTimeout(freshTimer);
  ensureMap(map, !!(setup && setup.practice));
  if (net) game.net = net;
  audio.init();
  audio.startMusic();
  $('menu').classList.add('hidden');
  $('lobby').classList.add('hidden');
  ui.reset();   // (a rematch: nothing of the last match's screen is left)
  ui.showHud();
  flow.beganAt = performance.now();
  flow.left = false;
  game.onRematch = guestRematch;   // (a guest follows the host back to the room's lobby, even from the middle of the ending: see ClientSync)
  game.start(diff, setup);
  input.lock();
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
    const [size, practice] = game.mapBuiltFor.split('+');
    ensureMap(size, !!practice);
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
if (!CLASSES[heroClass]) heroClass = 'knight';
const rememberClass = (id) => {
  heroClass = id;
  try { localStorage.setItem('cw-class', id); } catch (e) { /* ignore */ }
  refreshQuick();
};
renderClassPicker($('classPick'), $('classInfo'), heroClass, rememberClass);

// the line under Quick Play (and under Play Again): what a click will start
const currentSetupLine = () => setupLine({ cls: heroClass, mode: heroOn ? 'hero' : objective, heroWin, map: mapSize, diff: difficulty, length: options.length });
function refreshQuick() {
  if (quickReady) $('quickInfo').textContent = currentSetupLine();
}
// everything the line reads exists now: show the remembered difficulty and mode (the page opens on the last match's setup)
quickReady = true;
selectDifficulty(difficulty);
selectObjective(last.mode);
$('quickPlay').focus();   // (Enter or Space on the main menu is then Quick Play)

// ---------------- between matches (the end screen's actions, see flow.js) ----------------
// Play Again: no reload. The world for it was built while the end screen was up (freshWorldSoon), so this only starts the match.
function playAgain() {
  refreshOptions();   // (the end screen may have rolled the next battle into the stored options)
  startSolo();
}
function toMenu() {
  if (net) { location.reload(); return; }   // an online game is left by starting the page afresh
  clearTimeout(freshTimer);
  refreshOptions();
  ensureMap(mapSize);
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

// Single Player, Quick Play and Play Again all start this: a match of one lord against three, with what the menu says (which the last match left there)
function startSolo() {
  rememberLast();
  begin(difficulty, heroOn
    ? { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: heroClass }], hero: { win: heroWin }, options: matchOptions() }
    : { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: heroClass }], objective, options: matchOptions() });
}
$('play').addEventListener('click', startSolo);
$('quickPlay').addEventListener('click', startSolo);
// the practice courtyard: a walled yard with training dummies, on the small map (it is built into the world, so the world is rebuilt)
$('practiceBtn').addEventListener('click', () => begin(difficulty, { mode: 'single', localTeam: 0, players: [{ team: 0, name: 'You', cls: heroClass }], practice: true }, 'small'));

// ---------------- online play ----------------
let net = null;
let lobby = [];      // [{ team, name, netId, cls }]
let coop = false;    // lobby game mode chosen by the host
let lobbyBroadcast = null;
let guestData = null;   // a guest's handler of the host's messages while in the lobby (a match replaces it with the sync's; a rematch puts it back)

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
    else if (endScreenUp() && !flow.left) roomGone('The connection to the room was lost.');
  });
  net.on('hostleft', () => {
    if (game.state === 'playing') game.finish(-1, 'The host left the game.');
    else if (endScreenUp()) roomGone('The host left the game.');
    else { ui.lobbyError('The host closed the game.'); $('lobby').classList.add('hidden'); $('menu').classList.remove('hidden'); }
  });
}

$('hostBtn').addEventListener('click', async () => {
  rememberName();
  ui.lobbyError('');
  try { await connect(); } catch (e) { ui.lobbyError(e.message); return; }
  lobby = [{ team: 0, name: playerName(), netId: null, cls: heroClass }];
  const broadcast = () => { ui.renderLobby(lobby, 0, coop, objective, options.length); net.toAll({ k: 'lobby', players: lobby, coop, obj: objective, len: options.length }); };
  lobbyBroadcast = broadcast;
  // guests report the class they pick
  net.on('data', ({ from, d }) => {
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
  for (const b of document.querySelectorAll('#lobbyLength button')) {
    b.onclick = () => { selectLength(b.dataset.l); broadcast(); };
  }
  net.on('created', (m) => { ui.showLobby(m.code, true); showLobbyClassPicker(); broadcast(); });
  net.on('peer', (m) => {
    const used = new Set(lobby.map((p) => p.team));
    const team = [1, 2, 3].find((t) => !used.has(t));
    if (team === undefined) return;
    lobby.push({ team, name: m.name, netId: m.id, cls: 'knight' });
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
  net.on('joined', (m) => { ui.showLobby(m.code, false); showLobbyClassPicker(); });
  guestData = ({ d }) => {
    if (d.k === 'rematch') guestRematch();
    if (d.k === 'lobby') ui.renderLobby(d.players, (d.players.find((p) => p.netId === net.id) || {}).team, !!d.coop, d.obj, d.len);
    if (d.k === 'start') {
      const me = d.players.find((p) => p.netId === net.id);
      if (!me) return;
      begin(d.diff, { mode: 'client', localTeam: me.team, players: d.players.map((p) => ({ team: p.team, name: p.name, cls: p.cls })), coop: !!d.coop, objective: OBJECTIVES[d.obj] ? d.obj : 'conquest', options: sanitizeOptions(d.opts) }, d.map || 'medium');
    }
  };
  net.on('data', guestData);
  net.join(code, playerName());
});

$('leaveLobby').addEventListener('click', () => location.reload());

// ---------------- a rematch in the same room ----------------
// When a match ends the room goes back to lobby duty: the host's end screen has "Rematch", which takes everybody who is still here back to the room's lobby,
// where classes are picked again and the host starts the next battle. (The room stays locked: nobody new can join a game that has started.)
function endScreenUp() { return !$('gameover').classList.contains('hidden'); }
function inRoom() { return !!net && !flow.left && (net.role === 'host' || net.role === 'client'); }   // (functions, not consts: flow.bind above takes them at load)

// the match is over: put the room's handlers back (the match's sync replaced them) and see who is still here
function roomAfterMatch(s) {
  if (!net || flow.left) return;
  if (s.mode === 'client') { net.on('data', guestData); return; }
  if (s.mode !== 'host') return;
  const here = new Set(game.humans.filter((h) => !h.isBot && h !== game.player).map((h) => h.netId));
  lobby = lobby.filter((p) => p.netId === null || here.has(p.netId));
  const me = lobby.find((p) => p.netId === null);
  if (me) me.cls = heroClass;
  net.on('data', ({ from, d }) => {   // (guests may change class on their end screens)
    if (!d || d.k !== 'cls' || !CLASSES[d.cls]) return;
    const p = lobby.find((x) => x.netId === from);
    if (p && p.cls !== d.cls) { p.cls = d.cls; if (lobbyBroadcast) lobbyBroadcast(); }
  });
  net.on('leave', (id) => { lobby = lobby.filter((p) => p.netId !== id); if (lobbyBroadcast) lobbyBroadcast(); });
}

function backToLobby(isHost) {
  if (game.state === 'playing') return;
  clearTimeout(freshTimer);
  const [size, practice] = game.mapBuiltFor.split('+');
  ensureMap(size, !!practice);   // (a fresh world for the next match)
  ui.reset();
  ui.hideHud();
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
  $('pauseNote').textContent = game.mode === 'single' ? '' : 'The battle goes on while you are in the menu.';
  $('pauseHint').textContent = hint;
  $('quitConfirm').classList.add('hidden');
  const offer = offerFor(game);   // (a decided battle: the menu offers to end it)
  $('pauseOffer').classList.toggle('hidden', !offer);
  $('offerConfirm').classList.add('hidden');
  if (offer) { $('pauseOffer').textContent = offer.label; $('offerConfirmText').textContent = offer.ask; $('offerYes').textContent = offer.yes; }
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
$('quitYes').addEventListener('click', () => { if (net) location.reload(); else toMenu(); });   // (an online game is left by starting the page afresh)

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
// Ready (skip the first preparation) and the offer to end a decided battle: the keys are in flow.js, these are the buttons
$('shopReady').addEventListener('click', (e) => { pressReady(game, ui); e.currentTarget.blur(); });   // (blur: a later Space is a jump, not another press)
$('readyBtn').addEventListener('click', (e) => { pressReady(game, ui); e.currentTarget.blur(); });
$('offerBtn').addEventListener('click', (e) => { pressOffer(game, ui); e.currentTarget.blur(); });
$('pauseOffer').addEventListener('click', () => $('offerConfirm').classList.remove('hidden'));
$('offerNo').addEventListener('click', () => $('offerConfirm').classList.add('hidden'));
$('offerYes').addEventListener('click', () => confirmOffer(game, ui));

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

addEventListener('keydown', (e) => {
  flowKey(e, game, ui);
  if (e.code === 'Enter' && !e.repeat && e.target === document.body && shown('menu') && !shown('options') && !shown('controls')) { e.preventDefault(); $('quickPlay').click(); }
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
