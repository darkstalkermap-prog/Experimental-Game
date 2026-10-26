// Entry point: renderer, main loop and menu wiring.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Input } from './input.js';

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

$('play').addEventListener('click', () => {
  audio.init();
  $('menu').classList.add('hidden');
  ui.showHud();
  game.start(difficulty);
  input.lock();
});

$('resume').addEventListener('click', () => { input.lock(); });
$('shopClose').addEventListener('click', () => ui.toggleShop(false));
$('again').addEventListener('click', () => location.reload());
$('sens').addEventListener('input', (e) => { game.player.sensitivity = 0.0008 + (e.target.value / 100) * 0.004; });
$('vol').addEventListener('input', (e) => { audio.volume = e.target.value / 100; if (audio.master) audio.master.gain.value = audio.volume; });

input.onLockChange = (locked) => {
  if (game.state !== 'playing') return;
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
