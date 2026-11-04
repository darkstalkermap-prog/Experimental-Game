// The Knight's part of the HUD (ui.js calls updateKnightHud every frame): the Wrath bar under the stamina bar (it fills with every blow the
// shield takes and, full, glows: the next swing releases the shockwave, knight.js), and for anyone a Knight has Challenged a red warning at
// the top of the screen with an arrow toward him. The elements are made the first time they are needed; each field is written only when it
// changes.
import * as THREE from 'three';

let wr = null, warn = null;
const V = new THREE.Vector3();

function bar() {
  if (wr) return wr;
  const st = document.getElementById('stbar');
  if (!st) return null;
  const el = document.createElement('div');
  el.className = 'bar hidden';
  el.id = 'wrbar';
  el.title = 'Wrath: every blow your shield takes fills it. Full, your next swing sends out a shockwave.';
  el.innerHTML = '<div class="fill" id="wrFill"></div><span>Wrath</span>';
  st.after(el);
  wr = { el, fill: el.querySelector('.fill'), k: -1, on: null, full: null };
  return wr;
}

function warning() {
  if (warn) return warn;
  const hud = document.getElementById('hud');
  if (!hud) return null;
  const el = document.createElement('div');
  el.id = 'chalWarn';
  el.className = 'hidden';
  el.innerHTML = '<b>Challenged!</b> <span class="who"></span><i class="arrow">▲</i>';
  hud.appendChild(el);
  warn = { el, who: el.querySelector('.who'), arrow: el.querySelector('.arrow'), on: false, text: '', rot: '' };
  return warn;
}

export function updateKnightHud(ui, p) {
  const g = ui.game;
  const b = bar();
  if (b) {
    const on = p.classId === 'knight' && p.alive;
    if (on !== b.on) { b.on = on; b.el.classList.toggle('hidden', !on); }
    if (on) {
      const k = Math.max(0, Math.min(100, Math.floor((p.wrath || 0) * 100)));
      if (k !== b.k) { b.k = k; b.fill.style.width = k + '%'; }
      const full = k >= 100;
      if (full !== b.full) { b.full = full; b.el.classList.toggle('full', full); }
    }
  }
  // Challenged: the warning while it lasts (a person's own buff list says so, also on a guest: it comes with the snapshot)
  const w = warning();
  if (!w) return;
  const A = g.abilities, mine = A && A.chalOnMe && A.chalOnMe.until > g.time ? A.chalOnMe : null;
  const on = p.alive && (p.buffs.has('challenged') || !!mine);
  if (on !== w.on) { w.on = on; w.el.classList.toggle('hidden', !on); }
  if (!on) return;
  const who = mine ? mine.who : p.chalBy;
  const t = Math.max(p.buffs.time('challenged'), mine ? mine.until - g.time : 0);
  const text = `${who && who.name ? `${who.name} calls you out` : 'A Knight calls you out'} · ${Math.ceil(t)} s`;
  if (text !== w.text) { w.text = text; w.who.textContent = text; }
  // the arrow: where he is on the screen from its middle (up: ahead of you; behind you, down)
  let rot = '';
  const cam = g.camera;
  if (who && who.pos && cam) {
    V.copy(who.pos); V.y += 1.6;
    V.project(cam);
    const behind = V.z > 1, x = behind ? -V.x : V.x, y = behind ? -Math.abs(V.y) - 1 : V.y;
    rot = `rotate(${Math.round((Math.atan2(x, y) * 180) / Math.PI)}deg)`;
  }
  if (rot !== w.rot) { w.rot = rot; w.arrow.style.transform = rot; w.arrow.style.visibility = rot ? '' : 'hidden'; }
}
