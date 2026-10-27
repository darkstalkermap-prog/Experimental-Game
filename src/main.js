// Entry point: renderer, main loop and menu wiring.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { RoomNet } from './roomnet.js';
import { PeerNet } from './peernet.js';
import { setMapSize, WORLD, MAP_SIZES } from './config.js';
import { settings, saveSettings, sensitivityOf } from './settings.js';

const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('app').appendChild(renderer.domElement);

const ui = new UI();
const audio = new Audio();
const input = new Input(renderer.domElement);

// map size (remembered per browser); the world is rebuilt when it changes
let mapSize = 'medium';
try { mapSize = localStorage.getItem('cw-map') || 'medium'; } catch (e) { /* storage unavailable */ }
if (!MAP_SIZES[mapSize]) mapSize = 'medium';

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

function buildGame(size) {
  setMapSize(size);
  game = new Game(renderer, ui, audio, input);
  game.state = 'menu';
  game.mapBuiltFor = size;
  ui.mapBg = null;
  window.__game = game; // handy for debugging from the console
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

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  game.camera.aspect = innerWidth / innerHeight;
  game.camera.updateProjectionMatrix();
  game.fx.setScale(innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', resize);
resize();

// graphics quality (remembered per browser)
let quality = 'medium';
try { quality = localStorage.getItem('cw-quality') || 'medium'; } catch (e) { /* storage unavailable */ }
function setQuality(q) {
  quality = q;
  game.setQuality(q);
  document.querySelectorAll('.quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === q));
  try { localStorage.setItem('cw-quality', q); } catch (e) { /* ignore */ }
}
document.querySelectorAll('.quality button').forEach((b) => b.addEventListener('click', () => setQuality(b.dataset.q)));
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

// rebuild the world if the chosen map size differs from the one on screen
function ensureMap(size) {
  if (WORLD.size === size && game.mapBuiltFor === size) return;
  const net0 = game.net;
  renderer.renderLists.dispose();
  buildGame(size);
  game.net = net0;
  game.setQuality(quality);
  resize();
}

function begin(diff, setup = null, map = mapSize) {
  ensureMap(map);
  if (net) game.net = net;
  audio.init();
  audio.startMusic();
  $('menu').classList.add('hidden');
  $('lobby').classList.add('hidden');
  ui.showHud();
  game.start(diff, setup);
  input.lock();
}

$('play').addEventListener('click', () => begin(difficulty));

// ---------------- online play ----------------
let net = null;
let lobby = [];      // [{ team, name, netId }]
let coop = false;    // lobby game mode chosen by the host
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
  lobby = [{ team: 0, name: playerName(), netId: null }];
  const broadcast = () => { ui.renderLobby(lobby, 0, coop); net.toAll({ k: 'lobby', players: lobby, coop }); };
  for (const b of document.querySelectorAll('#lobbyModes button')) {
    b.onclick = () => { coop = b.dataset.mode === 'coop'; broadcast(); };
  }
  net.on('created', (m) => { ui.showLobby(m.code, true); broadcast(); });
  net.on('peer', (m) => {
    const used = new Set(lobby.map((p) => p.team));
    const team = [1, 2, 3].find((t) => !used.has(t));
    if (team === undefined) return;
    lobby.push({ team, name: m.name, netId: m.id });
    broadcast();
  });
  net.on('leave', (id) => { lobby = lobby.filter((p) => p.netId !== id); broadcast(); });
  net.create(playerName());
});

$('startOnline').addEventListener('click', () => {
  net.toAll({ k: 'start', diff: difficulty, players: lobby, map: mapSize, coop });
  begin(difficulty, { mode: 'host', localTeam: 0, players: lobby, coop });
});

$('joinBtn').addEventListener('click', async () => {
  rememberName();
  ui.lobbyError('');
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { ui.lobbyError('Enter the 4-letter room code from the host.'); return; }
  try { await connect(); } catch (e) { ui.lobbyError(e.message); return; }
  net.on('joined', (m) => ui.showLobby(m.code, false));
  net.on('data', ({ d }) => {
    if (d.k === 'lobby') ui.renderLobby(d.players, (d.players.find((p) => p.netId === net.id) || {}).team, !!d.coop);
    if (d.k === 'start') {
      const me = d.players.find((p) => p.netId === net.id);
      if (!me) return;
      begin(d.diff, { mode: 'client', localTeam: me.team, players: d.players.map((p) => ({ team: p.team, name: p.name })), coop: !!d.coop }, d.map || 'medium');
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
  if (!ui.shopOpen) openPause();   // Esc while playing: the browser frees the mouse, and the menu comes up
};

$('shopClose').addEventListener('click', () => ui.toggleShop(false));
$('again').addEventListener('click', () => location.reload());

// Clicking the game view while playing re-captures the mouse.
renderer.domElement.addEventListener('click', () => {
  if (game.state === 'playing' && !input.locked && !ui.shopOpen && !shown('pause')) input.lock();
});

// Escape: close whatever is open on top, else open or close the game menu.
// (Browsers hide Esc from the page while the mouse is captured; they release it, which opens the menu above.)
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !e.repeat) {
    if (shown('options')) { $('options').classList.add('hidden'); return; }
    if (shown('controls')) { $('controls').classList.add('hidden'); return; }
    if (ui.shopOpen) { input.pressed.delete(e.code); ui.toggleShop(false); return; }
    if (game.state !== 'playing') return;
    if (performance.now() - lastUnlockAt < 350) return;   // the release of the mouse has just opened the menu
    if (shown('pause')) closePause(); else openPause();
    return;
  }
  if (ui.shopOpen && (e.code === 'KeyB' || e.code === 'KeyO')) {
    e.preventDefault();
    input.pressed.delete(e.code); // don't let the game loop re-open it this frame
    ui.toggleShop(false);
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
let fpsT = 0, frames = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  // one bad frame must never freeze the game: report it once and keep going
  try {
    game.update(dt);
    ui.update(dt);
  } catch (e) {
    if (!frameErrors++) console.error('Frame error (the game keeps running):', e);
  }
  input.endFrame();
  renderer.render(game.scene, game.camera);
  frames++;
  fpsT += dt;
  if (fpsT > 1) { $('fps').textContent = `${frames} fps`; frames = 0; fpsT = 0; }
}
frame();
