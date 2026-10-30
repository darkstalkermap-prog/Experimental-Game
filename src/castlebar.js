// The castle you are at: a small HUD panel under the top panel that shows its keep, its gate and its walls while you (or
// the spectator's camera) are near a castle, or are looking at one from a little further off. It fades in and out and
// works for every castle, yours, your allies' and your enemies'. Every screen reads the castles' own hit points (guests
// have them from the host's snapshot: Castle.netState), so nothing new is sent.
// Not in War Mode (the castles stand off the map), the Hero Game Mode (its top panel shows both keeps and gates all the
// time) or the practice courtyard. It is worked out a few times a second (ui.js), and only what changed is written.
import * as THREE from 'three';
import { TEAM_CSS } from './config.js';
import { allied } from './teams.js';

const $ = (id) => document.getElementById(id);
const NEAR = 75;          // metres from a castle's centre (its walls are 20 m out) at which the panel shows
const KEEP_ON = 85;       // ...and stays shown until this far (so it does not flicker at the edge)
const LOOK = 150;         // looking straight at a castle shows it from up to this far
const LOOK_COS = Math.cos(THREE.MathUtils.degToRad(9));
const dir = new THREE.Vector3();

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
#castleBar { position: absolute; left: 50%; top: 116px; transform: translateX(-50%); width: min(400px, calc(100vw - 32px)); box-sizing: border-box; padding: 5px 10px 7px;
  opacity: 0; visibility: hidden; transition: opacity 0.35s, visibility 0s linear 0.35s; pointer-events: none; }
#castleBar.on { opacity: 1; visibility: visible; transition: opacity 0.35s; }
#castleBar .ch { display: flex; align-items: baseline; gap: 7px; white-space: nowrap; margin-bottom: 4px; }
#castleBar .ch i { width: 10px; height: 10px; border-radius: 2px; background: var(--c); align-self: center; flex: none; }
#castleBar .ch b { font-family: Cinzel, serif; font-size: 14px; font-weight: 700; color: var(--c); text-shadow: 0 1px 2px #000; overflow: hidden; text-overflow: ellipsis; }
#castleBar .ch span { font-size: 14px; opacity: 0.75; margin-left: auto; }
#castleBar .cr { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 10px; }
#castleBar .cp .cl { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; font-size: 14px; white-space: nowrap; }
#castleBar .cp .cl span { opacity: 0.8; }
#castleBar .cp .cl b { font-weight: 700; font-variant-numeric: tabular-nums; }
#castleBar .cp .ct { height: 7px; margin-top: 2px; background: rgba(0,0,0,0.6); border-radius: 2px; overflow: hidden; }
#castleBar .cp .ct i { display: block; height: 100%; width: 0; background: #b9a46a; transition: width 0.25s; }
#castleBar .cp.k .ct i { background: var(--c); }
#castleBar .cp.low .cl b { color: #ff8a6a; }
#castleBar .cp.gone .cl b { color: #ff8a6a; }
#castleBar.fallen .cr { opacity: 0.55; }
@media (max-width: 760px) { #castleBar { width: 300px; } #castleBar .ch span { display: none; } }
`;
  document.head.appendChild(s);
}

function make() {
  let el = $('castleBar');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'castleBar';
  el.className = 'panel';
  el.innerHTML = '<div class="ch"><i></i><b></b><span></span></div><div class="cr">'
    + '<div class="cp k"><div class="cl"><span>Keep</span><b></b></div><div class="ct"><i></i></div></div>'
    + '<div class="cp g"><div class="cl"><span>Gate</span><b></b></div><div class="ct"><i></i></div></div>'
    + '<div class="cp w"><div class="cl"><span>Walls</span><b></b></div><div class="ct"><i></i></div></div></div>';
  // under the top panel's stack (flow.js places the hill bar, this panel and the aimed-at label one under the other)
  const tg = $('target');
  tg.parentElement.insertBefore(el, tg);
  return el;
}

export class CastleBar {
  constructor() { this.reset(); }
  reset() {
    this.castle = null;     // the castle shown now (kept while the panel fades out)
    this.on = false;
    this.last = {};         // what each piece shows now: written again only when it changes
  }

  // which castle the camera is at: the nearest within NEAR (KEEP_ON for the one shown), or one it looks straight at within LOOK
  pick(g) {
    const cam = g.camera;
    if (!cam) return null;
    const p = cam.position;
    cam.getWorldDirection(dir);
    const flat = Math.hypot(dir.x, dir.z) || 1;
    let best = null, bestD = Infinity;
    for (const c of g.castles) {
      const f = g.factions[c.team];
      if (!f || f.empty || !c.group.visible) continue;
      const dx = c.center.x - p.x, dz = c.center.z - p.z, d = Math.hypot(dx, dz);
      let ok = d < (c === this.castle && this.on ? KEEP_ON : NEAR);
      if (!ok && d < LOOK && d > 1) ok = (dx * dir.x + dz * dir.z) / (d * flat) > LOOK_COS;
      if (ok && d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  update(g) {
    const show = g.state === 'playing' && !g.hero && !g.war && !g.practice && g.castles && g.castles.length;
    const c = show ? this.pick(g) : null;
    if (!c && !this.on) return;   // (nothing shown and nothing to show: no DOM touched)
    style();
    const el = make();
    if (!this.els) {
      const q = (s) => el.querySelector(s);
      this.els = {
        sw: q('.ch i'), name: q('.ch b'), rel: q('.ch span'),
        k: q('.cp.k'), kv: q('.cp.k b'), kf: q('.cp.k i'),
        g: q('.cp.g'), gv: q('.cp.g b'), gf: q('.cp.g i'),
        w: q('.cp.w'), wv: q('.cp.w b'), wf: q('.cp.w i'),
      };
    }
    const on = !!c;
    if (on !== this.on) { this.on = on; el.classList.toggle('on', on); }
    if (!c) return;   // (fading out: it keeps showing the castle it showed)
    this.castle = c;
    const E = this.els, L = this.last;
    const set = (key, node, val, prop) => {
      if (L[key] === val) return;
      L[key] = val;
      if (prop === 'width') node.style.width = val; else if (prop) node[prop] = val; else node.textContent = val;
    };
    const f = g.factions[c.team];
    const me = g.spectator ? -1 : g.localTeam;
    if (L.c !== TEAM_CSS[c.team]) { L.c = TEAM_CSS[c.team]; el.style.setProperty('--c', L.c); }
    set('name', E.name, c.team === me ? 'Your castle' : `${f.name}`);
    set('rel', E.rel, c.team === me ? '' : me < 0 ? '' : allied(c.team, me) ? 'ally' : 'enemy');
    // the keep
    const keep = c.keep, kp = c.fallen ? 0 : Math.max(0, Math.round((keep.hp / keep.maxHp) * 100));
    set('kv', E.kv, c.fallen ? 'Fallen' : `${Math.ceil(keep.hp)} / ${Math.round(keep.maxHp)}`);
    set('kf', E.kf, `${kp}%`, 'width');
    const kc = `cp k${c.fallen ? ' gone' : kp <= 30 ? ' low' : ''}`;
    set('kc', E.k, kc, 'className');
    if (L.fallen !== c.fallen) { L.fallen = c.fallen; el.classList.toggle('fallen', c.fallen); }
    // the gate: how whole it is, and whether it stands open or barred, or is broken
    const gate = c.gate, gp = gate.alive ? Math.max(0, Math.round((gate.hp / gate.maxHp) * 100)) : 0;
    set('gv', E.gv, !gate.alive ? 'Broken' : gate.openAmt > 0.5 ? `Open · ${gp}%` : c.gateLocked ? `Barred · ${gp}%` : `${gp}%`);
    set('gf', E.gf, `${gp}%`, 'width');
    set('gc', E.g, `cp g${!gate.alive ? ' gone' : gp <= 30 ? ' low' : ''}`, 'className');
    // the walls that can be broken: how many stand, and their average strength
    let n = 0, up = 0, sum = 0;
    for (const w of c.walls) {
      if (!w.breakable) continue;
      n++;
      if (w.alive) { up++; sum += Math.max(0, w.hp / w.maxHp); }
    }
    const wp = n ? Math.round((sum / n) * 100) : 0;
    set('wv', E.wv, `${up} / ${n}`);
    set('wf', E.wf, `${wp}%`, 'width');
    set('wc', E.w, `cp w${up < n ? ' low' : ''}`, 'className');
    set('wt', E.w, `${up} of ${n} wall sections standing · ${wp}% of their strength in all`, 'title');
  }
}
