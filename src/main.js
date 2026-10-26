// Entry point: renderer, main loop and menu wiring.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Net } from './net.js';

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

let game;
try {
  game = new Game(renderer, ui, audio, input);
} catch (e) {
  console.error(e);
  $('loading').textContent = 'Failed to start: ' + e.message;
  throw e;
}
window.__game = game; // handy for debugging from the console
game.state = 'menu';
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

let difficulty = 'normal';
document.querySelectorAll('#difficulty button').forEach((b) => {
  b.addEventListener('click', () => {
    difficulty = b.dataset.d;
    document.querySelectorAll('#difficulty button').forEach((o) => o.classList.toggle('active', o === b));
  });
});

function begin(diff, setup = null) {
  audio.init();
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
const playerName = () => ($('pname').value.trim() || 'Lord').slice(0, 16);
try { $('pname').value = localStorage.getItem('cw-name') || ''; } catch (e) { /* storage unavailable */ }
const rememberName = () => { try { localStorage.setItem('cw-name', playerName()); } catch (e) { /* ignore */ } };

Net.available().then((ok) => {
  $('online').classList.toggle('hidden', !ok);
  $('offlineNote').classList.toggle('hidden', ok);
});

async function connect() {
  net = new Net();
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
  const broadcast = () => { ui.renderLobby(lobby, 0); net.toAll({ k: 'lobby', players: lobby }); };
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
  net.toAll({ k: 'start', diff: difficulty, players: lobby });
  begin(difficulty, { mode: 'host', localTeam: 0, players: lobby });
});

$('joinBtn').addEventListener('click', async () => {
  rememberName();
  ui.lobbyError('');
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { ui.lobbyError('Enter the 4-letter room code from the host.'); return; }
  try { await connect(); } catch (e) { ui.lobbyError(e.message); return; }
  net.on('joined', (m) => ui.showLobby(m.code, false));
  net.on('data', ({ d }) => {
    if (d.k === 'lobby') ui.renderLobby(d.players, (d.players.find((p) => p.netId === net.id) || {}).team);
    if (d.k === 'start') {
      const me = d.players.find((p) => p.netId === net.id);
      if (!me) return;
      begin(d.diff, { mode: 'client', localTeam: me.team, players: d.players.map((p) => ({ team: p.team, name: p.name })) });
    }
  });
  net.join(code, playerName());
});

$('leaveLobby').addEventListener('click', () => location.reload());

$('resume').addEventListener('click', () => { input.lock(); });
$('shopClose').addEventListener('click', () => ui.toggleShop(false));
$('again').addEventListener('click', () => location.reload());
$('sens').addEventListener('input', (e) => { game.player.sensitivity = 0.0008 + (e.target.value / 100) * 0.004; });
$('vol').addEventListener('input', (e) => { audio.volume = e.target.value / 100; if (audio.master) audio.master.gain.value = audio.volume; });

input.onLockChange = (locked) => {
  if (game.state !== 'playing') return;
  if (game.mode !== 'single' && !locked && !ui.shopOpen) { game.paused = true; ui.showPause(true); return; }
  if (locked) {
    game.paused = false;
    ui.showPause(false);
  } else if (!ui.shopOpen) {
    game.paused = true;
    ui.showPause(true);
  }
};

// Clicking the game view while playing re-captures the mouse.
renderer.domElement.addEventListener('click', () => {
  if (game.state === 'playing' && !input.locked && !ui.shopOpen) input.lock();
});

// While the shop is open, B / Escape closes it.
addEventListener('keydown', (e) => {
  if (ui.shopOpen && (e.code === 'KeyB' || e.code === 'Escape')) {
    e.preventDefault();
    input.pressed.delete('KeyB'); // don't let the game loop re-open it this frame
    ui.toggleShop(false);
  }
});

const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  game.update(dt);
  ui.update(dt);
  input.endFrame();
  renderer.render(game.scene, game.camera);
  frames++;
  fpsT += dt;
  if (fpsT > 1) { $('fps').textContent = `${frames} fps`; frames = 0; fpsT = 0; }
}
frame();
