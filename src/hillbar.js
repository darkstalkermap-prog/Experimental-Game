// King of the Hill: the timer bar at the top of the HUD. One segment per side (a side's houses share one score), in the
// house colour, filling toward the win as its hold time adds up; the side that holds the hill is lit, the sides
// standing on a contested hill pulse red, and the side taking it shows how far it has got. Every screen draws it from
// the hill state the host already sends (hill.js netState), so guests and spectators see the host's numbers.
// The segments are built once per match (or when the sides change) and after that only the numbers that changed are
// written (ui.js calls update a few times a second).
import { TEAM_CSS, HILL, clock } from './config.js';
import { allied } from './teams.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const leader = (team) => [0, 1, 2, 3].find((t) => allied(t, team));
const short = (n) => n.replace(/^House /, '');

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
#hill { width: min(460px, calc(100vw - 32px)); padding: 6px 10px 8px; box-sizing: border-box; }
#hill .hh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; white-space: nowrap; margin-bottom: 5px; }
#hill .hh span { font-family: Cinzel, serif; font-size: 14px; letter-spacing: 0.03em; }
#hill .hh span small { font-family: 'EB Garamond', Georgia, serif; font-size: 14px; opacity: 0.75; letter-spacing: 0; margin-left: 6px; }
#hill .hh b { font-family: Cinzel, serif; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
#hill .hr { display: flex; gap: 6px; }
#hill .sg { flex: 1 1 0; min-width: 0; padding: 3px 5px 4px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; background: rgba(0,0,0,0.35); transition: border-color 0.2s, box-shadow 0.2s; }
#hill .sg .sn { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; font-size: 14px; line-height: 1.15; white-space: nowrap; }
#hill .sg .sn span { overflow: hidden; text-overflow: ellipsis; color: var(--c); font-weight: 600; text-shadow: 0 1px 2px #000; }
#hill .sg .sn b { font-family: Cinzel, serif; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
#hill .sg .tk { position: relative; height: 8px; margin-top: 3px; background: rgba(0,0,0,0.6); border-radius: 2px; overflow: hidden; }
#hill .sg .tk i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--c); transition: width 0.3s linear; }
#hill .sg .tk em { position: absolute; left: 0; bottom: 0; height: 3px; width: 0; background: #fff; opacity: 0.85; transition: width 0.15s linear; }
#hill .sg.own { background: rgba(255,255,255,0.07); }
#hill .sg.hold { border-color: var(--c); box-shadow: 0 0 10px var(--c), inset 0 0 6px rgba(255,255,255,0.12); }
#hill .sg.hold .sn span::before { content: '♛ '; }
#hill .sg.out { opacity: 0.45; }
#hill.contested { border-color: #ff6a4a; animation: hillclash 0.9s ease-in-out infinite alternate; }
#hill.contested .sg.on { border-color: #ff6a4a; }
@keyframes hillclash { from { box-shadow: 0 0 4px rgba(255,106,74,0.3); } to { box-shadow: 0 0 16px rgba(255,106,74,0.85); } }
@media (max-width: 760px) { #hill { width: 300px; top: 98px; } #hill .hh span small { display: none; } #hill .sg .sn { font-size: 12px; } }
`;
  document.head.appendChild(s);
}

export class HillBar {
  constructor() { this.reset(); }
  // a new match: build again on the next update
  reset() {
    this.sig = '';
    this.segs = [];
    this.head = '';
    this.headColor = '';
    this.clash = null;
    this.shown = null;
  }

  update(g) {
    const h = g.hill, el = $('hill');
    if (!h || !el) return;
    const show = g.objective === 'koth' && g.state === 'playing' && !g.hero && !g.war && !g.practice;
    if (show !== this.shown) { this.shown = show; el.classList.toggle('hidden', !show); }
    if (!show) return;
    style();
    const me = g.spectator ? -1 : g.localTeam;   // (a spectator has no side: spectate.js)
    // the sides: the first house of each stands for it; a side all of whose houses are empty seats is left out
    let sig = `${me}`;
    for (let k = 0; k < 4; k++) {
      if (leader(k) !== k) continue;
      const fs = g.factions.filter((f) => !f.empty && allied(f.team, k));
      if (fs.length) sig += `|${k}:${TEAM_CSS[k]}:${fs.map((f) => f.team).join(',')}`;
    }
    if (sig !== this.sig) this.build(g, el, sig, me);

    const hold = h.owner >= 0 && !h.contested ? leader(h.owner) : -1;
    const take = !h.contested && h.capturer >= 0 && h.progress > 0.01 ? leader(h.capturer) : -1;
    for (const s of this.segs) {
      const held = h.held[s.k] || 0;
      const sec = Math.floor(held);
      if (sec !== s.sec) {
        s.sec = sec;
        s.time.textContent = clock(sec);
        s.fill.style.width = `${Math.min(100, (held / HILL.target) * 100).toFixed(1)}%`;
        s.el.title = `${s.name}: held ${clock(sec)} · ${clock(HILL.target - held)} more to win`;
      }
      let on = false, out = true;
      for (const t of s.teams) { if (h.present[t] > 0) on = true; if (!g.factions[t].eliminated) out = false; }
      const cls = `sg${s.own ? ' own' : ''}${s.k === hold ? ' hold' : ''}${on ? ' on' : ''}${out ? ' out' : ''}`;
      if (cls !== s.cls) { s.cls = cls; s.el.className = cls; }
      const cp = s.k === take ? Math.round(h.progress * 100) : 0;
      if (cp !== s.cp) { s.cp = cp; s.cap.style.width = `${cp}%`; }
    }
    // the header: what is happening on the hill now (a house by name: 'You', 'Ally Gwen', or a rival's name)
    const nm = (t) => (t === me ? 'You' : me >= 0 && allied(t, me) ? `Ally ${short(g.factions[t].name)}` : short(g.factions[t].name));
    let head, color;
    if (h.contested) { head = 'Contested: nobody scores'; color = '#ff8a6a'; }
    else if (hold >= 0) {
      head = `${h.owner === me ? 'You hold it' : `${nm(h.owner)} holds it`} · ${clock(HILL.target - h.held[hold])} to win`;
      color = TEAM_CSS[hold];
    } else if (take >= 0) { head = `${nm(h.capturer)} taking it · ${Math.round(h.progress * 100)}%`; color = TEAM_CSS[take]; }
    else { head = 'Nobody holds it'; color = 'var(--parch)'; }
    if (head !== this.head) { this.head = head; this.headEl.textContent = head; }
    if (color !== this.headColor) { this.headColor = color; this.headEl.style.color = color; }
    if (h.contested !== this.clash) { this.clash = h.contested; el.classList.toggle('contested', h.contested); }
  }

  build(g, el, sig, me) {
    this.sig = sig;
    this.head = this.headColor = '';
    this.clash = null;
    const sides = [];
    for (let k = 0; k < 4; k++) {
      if (leader(k) !== k) continue;
      const fs = g.factions.filter((f) => !f.empty && allied(f.team, k));
      if (!fs.length) continue;
      const own = fs.some((f) => f.team === me);
      // a side of several houses is named after them all; the player's own side is 'You'
      const name = own ? (fs.length > 1 ? 'You & ' + fs.filter((f) => f.team !== me).map((f) => short(f.name)).join(' & ') : 'You') : fs.map((f) => short(f.name)).join(' & ');
      sides.push({ k, own, name, teams: fs.map((f) => f.team) });
    }
    el.innerHTML = `<div class="hh"><span>⛰ The Hill<small>hold ${clock(HILL.target)} to win</small></span><b></b></div><div class="hr">${sides.map((s) =>
      `<div class="sg" style="--c:${TEAM_CSS[s.k]}"><div class="sn"><span>${esc(s.name)}</span><b>0:00</b></div><div class="tk"><i></i><em></em></div></div>`).join('')}</div>`;
    this.headEl = el.querySelector('.hh b');
    const els = el.querySelectorAll('.sg');
    this.segs = sides.map((s, i) => ({
      ...s, el: els[i], time: els[i].querySelector('.sn b'), fill: els[i].querySelector('.tk i'), cap: els[i].querySelector('.tk em'),
      sec: -1, cls: '', cp: -1,
    }));
  }
}
