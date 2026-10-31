// Alerts, tips and nudges: everything that tells a player who is not looking (or not looking at the right place) that
// something needs them, and keeps them company when nothing does.
//
// All of it is worked out on the screen it is shown on, from state every screen already has (the castle parts, the
// units, the hill, the wave timer and your own hero), so it behaves the same in single player, for the host and for a
// guest. It reads the hero and the world; it never changes them.
//
// game.alerts:
//   raise(key, { text, icon, tone, sound, cooldown, away, pos })
//       key       what this is: the same key never fires twice within `cooldown` seconds of game time (default 8)
//       text      the callout on the left of the screen (leave it out for a sound alone)
//       icon      a glyph for the callout (a default by tone)
//       tone      'info' | 'good' | 'warn' | 'danger': the colour of the callout's edge and its default sound
//       sound     a name for audio.play (a default by tone; false for none)
//       away      true, or a short label: also kept for the "While you were away" panel, and it flashes the tab title when
//                 the player is looking elsewhere
//       pos       a place in the world ({ x, z }): the callout gets a pointer and the distance ("↗ 64 m")
//       Returns whether it fired (false: throttled, or alerts are off in Options).
//   tip(text)     show a line in the hint bar for a few seconds (nothing when tips are off)
//   learn(flag)   the player has done this now, so tips that teach it are skipped (see the TIPS list)
//   event(ev)     what game.applyEvent hands over: { k: 'alert', key, ...raise options }, which the host can send to one
//                 player with game.deliver(player, ev)
// Options has a switch for the alerts (callouts, sounds, the away panel, nudges) and one for the tips.
import { settings } from './settings.js';
import { allied } from './teams.js';
import { HILL, WAVES, SUMMON } from './config.js';
import { HERO } from './herogame.js';
import { mods } from './mods.js';
import './alertsounds.js';

// The hint bar. One short sentence each; [X] shows a key. Add yours anywhere in the list:
//   id     unique; what has been shown is remembered in this browser under it
//   learn  skip the tip once the player has done this (flags: ducked climbed guarded bow sprinted ability potion tab
//          mounted engine gate map shop armytab castletab classtab siegetab orderstab order group formation classswitch
//          hillorder; anything else you pass to game.alerts.learn())
//   cls    only for this hero class · koth  true / false: only in King of the Hill / only in Conquest
//   at     'death' (the respawn screen) or 'over' (the game-over screen); everything else rotates while you play
//   hero   only in the Hero Game Mode: true for any way to win, or 'kills' / 'castle' / 'timed' for that one (HERO_OFF lists the
//          war tips that make no sense there)
// They come round in this order, none twice until all of the ones that fit have been seen.
export const TIPS = [
  // Hero Game Mode (first in the list, so they come first there)
  { id: 'h-kills', hero: 'kills', get text() { return `The first side to ${HERO.killTarget} hero kills wins. A hero falls to anything: a rival hero, a soldier or an engine. Stay close to your allies.`; } },
  { id: 'h-castle', hero: 'castle', text: 'Destroy the enemy keep to win. Hero kills only count on the scoreboard, so help your own armies hold your gate too.' },
  { id: 'h-timed', hero: 'timed', get text() { return `${Math.round(HERO.timeLimit / 60)} minutes of battle: the side with more hero kills wins, then the stronger keep. A keep that falls ends it early.`; } },
  { id: 'h-armies', hero: true, text: `You command no army here: both castles send a wave every ${WAVES.interval} seconds by themselves, and every round is tougher than the last.` },
  { id: 'h-talents', hero: true, learn: 'talentstab', text: 'Press [N] to spend a talent point whenever you level up: talents are the only upgrades you can get.' },
  { id: 'h-fountain', hero: true, text: 'Near your own keep a hero mends fast: fall back to the fountain when you are low, and a fallen hero rises there after a few seconds.' },
  { id: 'h-ways', hero: true, get text() { return `Three ways to win, chosen in the menu: first to ${HERO.killTarget} hero kills, destroy the enemy keep, or the most hero kills in ${Math.round(HERO.timeLimit / 60)} minutes.`; } },   // (getters: HERO is read when the tip is shown, not when this module loads)
  { id: 'h-scores', hero: true, learn: 'tab', text: 'Hold [Tab] for the score and the level, kills and deaths of all six heroes.' },
  { id: 'h-d-rise', hero: true, at: 'death', text: 'You rise again at your keep in a few seconds. [N] spends talent points while you wait.' },
  { id: 'h-o-modes', hero: true, at: 'over', text: 'Try another way to win: the first to the hero kills, destroying the enemy keep, or the timed match.' },
  { id: 'duck', learn: 'ducked', text: 'Hold [C] to duck: arrows fly over your head and a battlement hides you completely.' },
  { id: 'climb', learn: 'climbed', text: 'Jump at one of your own castle walls ([Space]) to climb onto the wall walk, and at the battlements to stand on top of them. Enemy walls cannot be climbed.' },
  { id: 'guard', learn: 'guarded', text: 'Hold right click to block: your shield stops blows from the front. Raise it just as a blow lands to parry.' },
  { id: 'swing', text: 'Left click swings your sword; hold it to keep swinging. Strike at the side of an enemy who is blocking.' },
  { id: 'shop', learn: 'shop', text: 'Press [B] for the shop: troops, castle upgrades, siege engines and your hero class.' },
  { id: 'bow', learn: 'bow', text: 'Press [2] for the bow: hold left click to draw, release to loose, right click to zoom.' },
  { id: 'abilities', learn: 'ability', text: '[Q] and [R] are your class abilities. Their cooldowns are in the boxes above your health.' },
  { id: 'map', learn: 'map', text: 'Press [M] for the big battle map: every castle, army and siege engine, live.' },
  { id: 'army', learn: 'armytab', text: 'In [B] → Army you choose who garrisons the castle and who marches with you.' },
  { id: 'orders', learn: 'order', text: '[F1] follow · [F2] hold · [F3] charge · [F4] defend · [T] assault: your army obeys.' },
  { id: 'potion', learn: 'potion', text: 'Press [H] to drink your healing draught when you are low on health.' },
  { id: 'waves', get text() { return `A new army leaves every castle every ${Math.round(WAVES.interval * mods.mul('waveGap'))} seconds. Spend your gold in the quiet between them.`; } },   // (the gap depends on the match length)
  { id: 'castle', learn: 'castletab', text: 'Castle upgrades in [B] make the walls and gate tougher and put archers on the towers.' },
  { id: 'hill', koth: true, text: 'King of the Hill: stand on the hill alone to capture it. An enemy there makes it contested.' },
  { id: 'hillorder', koth: true, learn: 'hillorder', text: '[Y] sends your army up to hold the hill. Hold it long enough and you win outright.' },
  { id: 'group', learn: 'group', text: '[G] picks who gets your orders: everyone, infantry, archers or cavalry.' },
  { id: 'formation', learn: 'formation', text: '[F] changes the formation: a shield wall holds firm, loose ranks dodge arrows and fire.' },
  { id: 'sprint', learn: 'sprinted', text: 'Hold [Shift] to sprint. It drains stamina, so save it for getting back to the walls in time.' },
  { id: 'regen', text: 'Health creeps back when nothing has hurt you for eight seconds: fall back behind the walls to recover.' },
  { id: 'classswitch', learn: 'classswitch', text: 'At your own castle you can change hero class in [B] → Class (after wave 1, with a short wait).' },
  { id: 'gate', learn: 'gate', text: 'Stand at the lever inside your gate and press [E] to bar it: nobody gets through, not even your own troops.' },
  { id: 'engine', learn: 'engine', text: 'Press [E] beside an abandoned siege engine to take it over: rams break gates, catapults break walls.' },
  { id: 'scores', learn: 'tab', text: 'Hold [Tab] for the scoreboard: gold, kills and the state of every keep.' },
  { id: 'levels', learn: 'talents', text: 'Kills, waves and the hill earn experience: the purple bar under your health. Every level makes you stronger and gives a talent point.' },
  { id: 'talents', learn: 'talentstab', text: 'Press [N] to spend your talent points: every class has its own tree of ability upgrades.' },
  { id: 'respec', learn: 'talents', text: 'Chose badly? At your own castle [N] → Respec gives every talent point back, free.' },
  { id: 'ping', team: true, learn: 'ping', text: 'Middle-click to ping what you are looking at: red for a foe, blue to defend, gold to go there. Your allies see it.' },
  { id: 'pingwheel', team: true, learn: 'marker', text: 'Hold the middle button and flick the mouse to leave a marker: Go here, Attack, Defend, Danger or Need help.' },
  { id: 'mapping', team: true, learn: 'marker', text: 'Press [M] and click the big map to mark a spot for your team; right click removes your nearest marker.' },
  { id: 'arrows', text: 'Arrows run out. Each wave brings five more, so save them for archers and siege crews.' },
  { id: 'knight', cls: 'knight', text: 'Knight: [Q] Shield Bash stuns whatever is ahead; [R] Bulwark cuts the damage you take by 70% for five seconds.' },
  { id: 'berserker', cls: 'berserker', text: 'Berserker: hold [R] to mark a spot as far as a Fireball flies, let go and Leap there over the soldiers, slamming the ground where you land. [Q] Whirlwind finishes what the slam began.' },
  { id: 'ranger', cls: 'ranger', text: 'Ranger: aim for the head (double damage) and draw fully to shoot through a line of men. [Q] Power Shot breaks a rank, hold [R] for the Sniper Shot: the view zooms in, steadies, and one heavy arrow flies flat as far as a Fireball. Let go to loose.' },
  { id: 'mage', cls: 'mage', text: 'Mage: Fireball ([Q]) burns gates and siege engines as well as men; Frost Ward ([R]) soaks up the next blows.' },
  { id: 'cleric', cls: 'cleric', text: 'Cleric: Healing Light ([R]) heals you and every ally within 14 m. Smite ([Q]) blasts where you aim.' },
  { id: 'cavalier', cls: 'cavalier', learn: 'mounted', text: 'Cavalier: [E] mounts your warhorse, or whistles it over. Lance Charge ([Q]) flattens whoever is in your way.' },
  { id: 'rally', cls: 'cavalier', text: 'Cavalier: Rally Cry ([R]) speeds up and shields every ally near you, and you take less damage too.' },
  // the respawn screen
  { id: 'd-guard', at: 'death', text: 'Hold right click to block blows from the front, and keep enemies in front of you: a shield does not cover your back.' },
  { id: 'd-potion', at: 'death', text: 'Save your healing draught for the fight: [H] heals 130 health.' },
  { id: 'd-class', at: 'death', text: 'A new class changes how you fight: pick one in [B] → Class while you wait.' },
  { id: 'd-wall', at: 'death', text: 'Fight from the wall walk: battlements cover you and the enemy cannot climb up to you: they must come by the gate or a breach.' },
  { id: 'd-duck', at: 'death', text: 'Duck ([C]) behind a battlement when archers are shooting at you.' },
  { id: 'd-talent', at: 'death', learn: 'talents', text: 'Talent points to spend? [N] opens the Talents tab while you wait to respawn.' },
  { id: 'd-army', at: 'death', text: 'Your army fights on while you wait. [B] → Army puts more soldiers on the walls.' },
  // the game-over screen
  { id: 'o-class', at: 'over', text: 'Try another class next time: all six play differently.' },
  { id: 'o-koth', at: 'over', koth: false, text: 'Try King of the Hill: the same war, with a prize in the middle of the map.' },
  { id: 'o-online', at: 'over', text: 'Play with friends: host a game and share the invite link (up to four players).' },
  { id: 'o-army', at: 'over', text: 'Armies win sieges: spend early on barracks and elite levies.' },
];

// the war tips that say nothing true in the Hero Game Mode (no gold, shop, army, orders or class changes; allies are bots)
const HERO_OFF = new Set(['shop', 'army', 'orders', 'waves', 'castle', 'group', 'formation', 'classswitch', 'scores', 'ping', 'pingwheel', 'mapping', 'd-class', 'd-army', 'o-army']);

const $ = (id) => document.getElementById(id);
const SCAN = 0.25;                              // seconds (of game time) between the slower checks
const ARMY = { count: 5, range: 80 };           // this many foes within this many metres of your castle is an army at the door
const ENGINE_RANGE = 70;                        // an enemy siege engine this close to your castle is spotted
const LOW_HP = 0.3;                             // below this share of your health: the heartbeat
const GOLD = { amount: 250, wait: 40 };         // this much gold unspent for this long, while you are at home
const STREAK = { window: 12, names: ['Killing spree', 'Rampage', 'Unstoppable'], at: [3, 5, 8] };
const IDLE = 25;                                // seconds without input before the nudge
const TIP = { calm: 25, gap: 40, show: 9, hurt: 10 };
const LONG_CD = 14;                             // an ability that took this long to come back says so when it does
const AWAY = { min: 12, show: 8 };              // seconds away before the panel is worth showing, and how long it stays
const TONES = ['info', 'good', 'warn', 'danger'];
const ICON = { info: '🔔', good: '✔', warn: '⚠', danger: '⚔' };
const SOUND = { info: 'alertLow', good: 'chime', warn: 'alertLow', danger: 'alertDanger' };
const TAB_FLAG = { army: 'armytab', castle: 'castletab', class: 'classtab', siege: 'siegetab', orders: 'orderstab', talents: 'talentstab' };   // shop tab -> what opening it teaches
const WIND8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

// North is up on the maps (the way the minimap is drawn): -z. dx, dz: from the place you measure to the thing.
export const dir8 = (dx, dz) => WIND8[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];
export const dir4 = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// tip text to markup: [X] becomes a key cap
const fmt = (s) => esc(s).replace(/\[([^\]]{1,12})\]/g, '<kbd>$1</kbd>');
const roundWord = (g) => (g.hero ? 'Round' : 'Wave');   // (the Hero Game Mode HUD counts rounds)
const clockText = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// what has been shown and what the player already knows, kept in this browser
const STORE = 'cw-tips';
function load() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { seen: Array.isArray(o.seen) ? o.seen : [], learned: Array.isArray(o.learned) ? o.learned : [] };
  } catch (e) { return { seen: [], learned: [] }; }
}

// The Alerts of the game on screen (the game is built again when the map size changes). The window events below are
// wired once and talk to it.
let current = null;
document.addEventListener('visibilitychange', () => { if (current) { if (document.hidden) current.leave(); else current.back(); } });
addEventListener('blur', () => { if (current) current.leave(); });
addEventListener('focus', () => { if (current && !document.hidden) current.back(); });
// Browsers stop requestAnimationFrame in a hidden tab, and frame() in main.js is driven by it: an online host who looks
// at another tab would freeze the match for everybody (and a guest would stop hearing alerts). While the tab is hidden an
// online game is stepped from a timer instead (see background()). A worker's timer is not slowed down the way the
// page's own is, so it backs the plain interval up where workers are allowed.
const ticker = () => { if (current) current.background(); };
setInterval(ticker, 250);
try {
  const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 250);'], { type: 'text/javascript' })));
  w.onmessage = ticker;
  w.onerror = () => {};
} catch (e) { /* no workers here: the interval has to do */ }

export class Alerts {
  constructor(game) {
    this.g = game;
    current = this;
    const saved = load();
    this.seen = new Set(saved.seen);
    this.learned = new Set(saved.learned);
    this.last = new Map();      // alert key -> game time it last fired
    this.recent = [];           // the latest alerts: { key, t, text, tone }
    this.away = null;           // while the player is not looking: { at, round, kills, deaths, earned, level, events, n, label }
    this.begun = false;
    this.over = false;
    this.dirty = false;
    this.savedAt = -99;
    this.bgAt = 0;
    this.bgAcc = 0;
    this.bgErrors = 0;
    this.nextScan = 0;
    this.at = -1;
    this.dangerAt = -99;
    this.tipUntil = 0;
    this.tipAt = -99;
    this.tipText = '';
  }

  // ---------------------------------------------------------------- the public face
  raise(key, o = {}) {
    if (!settings.alerts) return false;
    const g = this.g, now = g.time;
    const last = this.last.get(key);
    if (last !== undefined && now - last < (o.cooldown ?? 8)) return false;
    this.last.set(key, now);
    const tone = TONES.includes(o.tone) ? o.tone : 'info';
    if (tone === 'warn' || tone === 'danger') this.dangerAt = now;
    this.recent.push({ key, t: now, text: o.text || '', tone });
    if (this.recent.length > 30) this.recent.shift();
    if (o.away) this.note(typeof o.away === 'string' ? o.away : o.text || key, tone);
    if (o.text && !document.hidden) this.callout(o.text, o.icon || ICON[tone], tone, o.pos);
    this.snd(o.sound === undefined ? SOUND[tone] : o.sound);
    return true;
  }

  tip(text, secs = TIP.show) {
    if (!settings.tips || !text) return false;
    this.showTip(text, secs);
    this.tipAt = this.g.time;
    return true;
  }

  learn(flag) {
    if (!flag || this.learned.has(flag)) return;
    this.learned.add(flag);
    this.dirty = true;
  }

  event(ev) {
    if (ev.k === 'alert') this.raise(ev.key || 'event', ev);
  }

  snd(name) {
    if (name && settings.alerts) this.g.audio.play(name);
  }

  // ---------------------------------------------------------------- every frame
  update() {
    const g = this.g;
    if (g.state === 'over') { this.finish(); return; }
    if (g.state !== 'playing' || g.practice) return;   // (nothing to warn about in the practice yard)
    if (!this.begun) this.begin();
    const p = g.player, now = g.time;
    this.watch(p);
    if (now === this.at) return;              // single player with the menu or the shop open: the world stands still
    this.at = now;
    this.countdown();
    this.streakWatch(p);
    this.abilities(p);
    this.idle(p);
    this.heart(p);
    if (now >= this.nextScan) { this.nextScan = now + SCAN; this.scan(p); }
  }

  // the first look at a match: what "before" is, for everything that works by comparison
  begin() {
    const g = this.g, p = g.player, f = g.localFaction;
    this.begun = true;
    this.last.clear();
    this.round = g.round;
    this.sec = Math.ceil(g.phaseT);
    this.kills = p.kills;
    this.kt = [];                         // when your latest kills happened
    this.tier = 0;
    this.cd = { q: p.abilCd.q, r: p.abilCd.r };
    this.cdTotal = { q: 0, r: 0 };
    this.arrows = p.arrows;
    this.arrowsLow = p.arrows <= 5;
    this.wasAlive = p.alive;
    this.low = false;
    this.nextBeat = 0;
    this.goldSince = g.time;
    this.goldLast = f.gold;
    this.parts = null;
    this.armyNear = false;
    this.heroDeaths = null;
    this.spotted = new Set();
    this.hillOwner = g.hill.owner;
    this.hillContested = false;
    this.hillWarned = new Set();
    this.lastInput = g.time;
    this.idleShown = false;
    this.calmSince = g.time;
    this.attackAt = -99;
    this.classId0 = p.classId;
    this.order0 = undefined;
    this.nextScan = g.time;
  }

  // what the player has done, for the tips (cheap enough to look at every frame)
  watch(p) {
    const g = this.g, ui = g.ui, i = g.input;
    if (p.ducking) this.learn('ducked');
    if (p.climbing) this.learn('climbed');
    if (p.blocking) this.learn('guarded');
    if (p.weapon === 'bow') this.learn('bow');
    if (p.mounted) this.learn('mounted');
    if (p.drive) this.learn('engine');
    if (p.aiming || i.hit('KeyQ') || i.hit('KeyR')) this.learn('ability');
    if (i.hit('KeyH')) this.learn('potion');
    if (i.down('ShiftLeft')) this.learn('sprinted');
    if (i.down('Tab')) this.learn('tab');
    if (i.hit('KeyY')) this.learn('hillorder');
    if (i.hit('F1') || i.hit('F2') || i.hit('F3') || i.hit('F4') || i.hit('KeyZ') || i.hit('KeyX') || i.hit('KeyV') || i.hit('KeyT')) this.learn('order');
    if (ui.mapOpen) this.learn('map');
    if (ui.shopOpen) {
      this.learn('shop');
      this.learn(TAB_FLAG[ui.tab]);
    }
    if (p.group !== undefined) this.learn('group');
    if (Object.keys(p.talents).length) this.learn('talents');
    // (a guest's last order always comes with the snapshot: only a change counts there)
    if (g.mode === 'client') { if (this.order0 === undefined) this.order0 = p.lastOrder; else if (p.lastOrder !== this.order0) this.learn('order'); }
    else if (p.lastOrder !== undefined) this.learn('order');
    const f = g.localFaction;
    if (f && f.formation && f.formation !== 'line') this.learn('formation');
    if (p.classId !== this.classId0) this.learn('classswitch');
    const c = g.castles[p.team];
    if (c && c.gateLocked) this.learn('gate');
  }

  // the wave clock: "Wave N marches in 10 s", a tick for each of the last three seconds, and the wave itself
  countdown() {
    const g = this.g;
    if (g.round > this.round) {
      this.round = g.round;
      // (the first wave and every tenth come with the game's own horn and banner)
      if (g.round !== 1 && g.round % 10 !== 0) this.raise('wave', { text: `${roundWord(g)} ${g.round} marches out`, icon: '⚔', tone: 'info', cooldown: 5 });
    }
    const s = Math.max(0, Math.ceil(g.phaseT));
    if (s === this.sec) return;
    const prev = this.sec;
    this.sec = s;
    if (s > prev) return;                     // a new countdown has begun
    if (prev > 10 && s <= 10) this.raise('wave10', { text: `${roundWord(g)} ${g.round + 1} marches in 10 s`, icon: '⏳', tone: 'info', cooldown: 5 });
    if (s >= 1 && s <= 3) this.snd('tick');
  }

  // kills in quick succession: 3, 5 and 8 within 12 seconds (your own kills are counted on every screen)
  streakWatch(p) {
    const now = this.g.time;
    if (p.kills > this.kills) for (let i = this.kills; i < p.kills && this.kt.length < 40; i++) this.kt.push(now);
    this.kills = p.kills;
    while (this.kt.length && now - this.kt[0] > STREAK.window) this.kt.shift();
    const n = this.kt.length;
    const tier = n >= STREAK.at[2] ? 3 : n >= STREAK.at[1] ? 2 : n >= STREAK.at[0] ? 1 : 0;
    if (!n) this.tier = 0;
    if (tier <= this.tier) return;
    this.tier = tier;
    if (!settings.alerts) return;
    this.recent.push({ key: 'streak', t: now, text: STREAK.names[tier - 1], tone: 'good' });
    this.snd(tier === 1 ? 'streak' : 'streakBig');
    const el = $('streak');
    if (!el || document.hidden) return;
    el.className = `t${tier}`;
    el.querySelector('b').textContent = STREAK.names[tier - 1];
    el.querySelector('span').textContent = `${n} kills in ${Math.round(now - this.kt[0])} seconds`;
    void el.offsetWidth;
    el.classList.add('show');
  }

  // an ability that took a long time to come back is back: the faintest tick
  abilities(p) {
    for (const s of ['q', 'r']) {
      const cd = p.abilCd[s], was = this.cd[s];
      if (cd > was + 0.5) this.cdTotal[s] = cd;                                   // used (or a new class waiting)
      else if (was > 0 && cd <= 0 && was < 0.15 && p.alive && this.cdTotal[s] >= LONG_CD) this.raise('ready' + s, { sound: 'abilReady', cooldown: 3 });
      this.cd[s] = cd;
    }
  }

  // no input for a while, while you are in the match: a nudge, once per spell of idleness
  idle(p) {
    const g = this.g, i = g.input, m = i.mouse, now = g.time;
    if (i.keys.size || i.pressed.size || m.dx || m.dy || m.left || m.right || m.wheel || g.paused || g.ui.shopOpen || !p.alive || document.hidden || this.away) {
      this.lastInput = now;
      this.idleShown = false;
      return;
    }
    if (this.idleShown || now - this.lastInput < IDLE) return;
    this.idleShown = true;
    const left = Math.max(0, g.phaseT);
    this.raise('idle', { text: `Still with us? ${g.round ? `${roundWord(g)} ${g.round + 1}` : `The first ${roundWord(g).toLowerCase()}`} marches in ${clockText(left)}.`, icon: '💤', tone: 'info', sound: 'chime', cooldown: 30 });
  }

  // low health: a heartbeat that quickens as the end nears
  heart(p) {
    const now = this.g.time;
    if (!p.alive || p.hp >= p.maxHp * LOW_HP || now < this.nextBeat) return;
    this.nextBeat = now + 0.55 + 0.85 * (p.hp / (p.maxHp * LOW_HP));
    this.snd('heartbeat');
  }

  // ---------------------------------------------------------------- four times a second
  scan(p) {
    const g = this.g, c = g.castles[p.team], f = g.localFaction;
    if (!c || !f) return;
    this.castle(c);
    this.enemies(c, p);
    this.vitals(p);
    this.treasury(f, p);
    this.heroWatch(p);
    this.allyWatch(p);
    this.hillWatch(p);
    this.life(p);
    this.tipWatch(p);
    if (this.dirty && g.time - this.savedAt > 5) this.save();
  }

  // the gate, the walls and the keep of your castle: losing health is an attack, losing it all is a breach
  castle(c) {
    if (!this.parts || this.parts.c !== c) {
      const list = [c.gate, c.keep, ...c.walls.filter((w) => w.breakable)];
      this.parts = { c, list, hp: list.map((x) => x.hp), alive: list.map((x) => x.alive) };
      return;
    }
    const { list, hp, alive } = this.parts, now = this.g.time;
    let worst = -1, loss = 0.5;
    for (let i = 0; i < list.length; i++) {
      const part = list[i];
      if (hp[i] - part.hp > loss) { loss = hp[i] - part.hp; worst = i; }
      if (alive[i] && !part.alive && !c.fallen) {
        const side = dir4(part.pos.x - c.center.x, part.pos.z - c.center.z), what = part.kind === 'gate' ? 'gate' : 'wall';
        this.raise('breach' + i, { text: `Breach! The ${side} ${what} has fallen`, icon: '💥', tone: 'danger', cooldown: 4, away: `Breach in the ${side} ${what}!`, pos: part.pos });
      }
      hp[i] = part.hp;
      alive[i] = part.alive;
    }
    if (worst < 0 || c.fallen || !list[worst].alive || now - this.attackAt < 6) return;   // (a part that has just broken is a breach, above; one callout at a time)
    const part = list[worst];
    const text = part.kind === 'keep' ? 'Your keep is under attack!' : `Your ${dir4(part.pos.x - c.center.x, part.pos.z - c.center.z)} ${part.kind === 'gate' ? 'gate' : 'wall'} is under attack!`;
    if (this.raise('attack' + worst, { text, icon: '🏰', tone: 'danger', cooldown: 20, away: 'Castle under attack!', pos: part.pos })) this.attackAt = now;
  }

  // foes near the castle: an army at the door (once, when it gets there) and siege engines
  enemies(c, p) {
    const g = this.g, R2 = ARMY.range ** 2, E2 = ENGINE_RANGE ** 2;
    let n = 0, sx = 0, sz = 0;
    for (const u of g.units) {
      if (!u.alive || u.isHero || u.isCrew || allied(u.team, p.team)) continue;
      const dx = u.pos.x - c.center.x, dz = u.pos.z - c.center.z;
      if (dx * dx + dz * dz > R2) continue;
      const w = u.isGiant ? 3 : 1;
      n += w; sx += dx * w; sz += dz * w;
    }
    for (const s of g.siege) {
      if (!s.alive || allied(s.team, p.team)) continue;
      const dx = s.pos.x - c.center.x, dz = s.pos.z - c.center.z, d2 = dx * dx + dz * dz;
      if (d2 <= R2) { n++; sx += dx; sz += dz; }
      if (d2 <= E2 && !this.spotted.has(s.id)) {
        this.spotted.add(s.id);
        this.raise('siege', { text: `Enemy ${s.name.toLowerCase()} spotted to the ${dir8(dx, dz)}`, icon: '⚠', tone: 'warn', cooldown: 12, away: 'Siege engine at the castle!', pos: s.pos });
      }
    }
    if (n >= ARMY.count && !this.armyNear) {
      this.armyNear = true;
      this.raise('army', { text: `Enemy army approaching from the ${dir8(sx / n, sz / n)}!`, icon: '⚔', tone: 'warn', sound: 'horn', cooldown: 25, away: 'Enemy army at the castle!' });
    } else if (n < 3) this.armyNear = false;
  }

  vitals(p) {
    if (!p.alive) { this.low = false; return; }
    const low = p.hp < p.maxHp * LOW_HP;
    // (the heartbeat is the sound)
    if (low && !this.low) this.raise('low', { text: p.potions > 0 ? 'Low health! Drink a healing draught (H)' : 'Low health! Fall back to your castle', icon: '❤', tone: 'danger', sound: false, cooldown: 20 });
    this.low = low;
    // arrows: say so on the way down to five, and again at none
    if (p.arrows > 8) this.arrowsLow = false;
    if (p.arrows < this.arrows) {
      if (p.arrows === 0) { this.arrowsLow = true; this.raise('arrows0', { text: 'Out of arrows!', icon: '🏹', tone: 'warn', cooldown: 30 }); }
      else if (p.arrows <= 5 && !this.arrowsLow) { this.arrowsLow = true; this.raise('arrows', { text: `Running low on arrows (${p.arrows} left)`, icon: '🏹', tone: 'warn', cooldown: 30 }); }
    }
    this.arrows = p.arrows;
  }

  // gold that has sat there for a while while you are at home
  treasury(f, p) {
    const g = this.g, now = g.time;
    if (g.hero) return;   // (no gold in the Hero Game Mode)
    if (f.gold < GOLD.amount || f.gold < this.goldLast - 4 || g.ui.shopOpen) this.goldSince = now;   // spent some, or not enough yet
    this.goldLast = f.gold;
    if (now - this.goldSince < GOLD.wait || !p.alive || f.castle.fallen || !p.atHome()) return;
    this.raise('gold', { text: `You have ${Math.floor(f.gold)} gold to spend (B)`, icon: '💰', tone: 'info', cooldown: 90 });
  }

  // Hero Game Mode: a hero has fallen ("Enemy hero slain: 12/25", "Your ally Mara was slain"). Every screen counts the deaths on
  // the roster, so this works the same for everyone; the first look only learns the counts. Your own fall has the respawn screen.
  heroWatch(p) {
    const h = this.g.hero;
    if (!h || typeof h.roster !== 'function') { this.heroDeaths = null; return; }
    const seen = this.heroDeaths || (this.heroDeaths = new Map());
    for (const r of h.roster()) {
      const key = r.player || r.name, was = seen.get(key);
      seen.set(key, r.deaths);
      if (was === undefined || r.deaths <= was || r.mine) continue;
      if (r.team !== p.team) {
        const n = h.sides && h.sides[p.team] ? h.sides[p.team].kills : 0;
        this.raise('hero:' + r.name, { text: `Enemy hero slain: ${n}${h.killTarget ? '/' + h.killTarget : ''}`, icon: '⚔', tone: 'good', sound: 'chime', cooldown: 1 });
      } else this.raise('hero:' + r.name, { text: `Your ally ${r.name} was slain`, icon: '☠', tone: 'warn', cooldown: 1 });
    }
  }

  // co-op Conquest: an ally who has fallen for good can be called back with U; say so now and then while they are out
  allyWatch(p) {
    const g = this.g, f = g.localFaction;
    for (const a of g.fallenAllies(p.team)) {
      if (g.summonBlock(f, a)) continue;
      const text = f.gold >= SUMMON.cost ? `${a.lord} is out of the battle. Press U to call them back (${SUMMON.cost} gold)` : `${a.lord} is out of the battle. Save ${SUMMON.cost} gold to call them back (U)`;
      this.raise('ally:' + a.team, { text, icon: '☠', tone: 'warn', cooldown: 75, away: `${a.lord} has fallen and can be called back` });
    }
  }

  // King of the Hill: the game toasts the changes; these are the sounds that go with them
  hillWatch(p) {
    const g = this.g, h = g.hill;
    if (!h.live) return;
    const mine = (t) => t >= 0 && allied(t, p.team);
    if (h.owner !== this.hillOwner) {
      const was = this.hillOwner;
      this.hillOwner = h.owner;
      if (mine(h.owner)) this.raise('hill:won', { sound: 'chime', cooldown: 3, tone: 'good', away: 'You took the hill' });
      else if (mine(was)) this.raise('hill:lost', { sound: 'alertDanger', cooldown: 3, tone: 'warn', away: 'The hill was lost!' });
    }
    if (h.contested && !this.hillContested && (mine(h.owner) || mine(h.capturer))) this.raise('hill:contested', { text: 'The hill is contested!', icon: '⛰', tone: 'warn', cooldown: 25 });
    this.hillContested = h.contested;
    // the win clock: the game says it at 60, 30 and 10 seconds to go
    for (let k = 0; k < 4; k++) {
      if (g.factions[k].eliminated || !h.held[k]) continue;
      const left = HILL.target - h.held[k];
      for (const m of [60, 30, 10]) {
        if (left > m || this.hillWarned.has(k * 100 + m)) continue;
        this.hillWarned.add(k * 100 + m);
        if (mine(k)) this.raise('hill:win' + m, { sound: 'chime', tone: 'good', cooldown: 3 });
        else this.raise(`hill:lose${k}:${m}`, { sound: 'alertDanger', tone: 'warn', cooldown: 3, away: `${g.factions[k].name} is ${m} s from winning the hill!` });
      }
    }
  }

  // falling and rising again: the respawn screen gets a tip, and a streak ends
  life(p) {
    if (p.alive === this.wasAlive) return;
    this.wasAlive = p.alive;
    const el = $('respawnTip');
    if (p.alive) { if (el) el.innerHTML = ''; return; }
    this.kt.length = 0;
    this.tier = 0;
    this.hideTip();
    const t = settings.tips ? this.pickTip('death') : null;
    if (t) this.tipAt = this.g.time;
    if (el) el.innerHTML = t ? fmt(t.text) : '';
  }

  // the game is over: one more tip, on that screen
  finish() {
    if (this.over) return;
    this.over = true;
    this.hideTip();
    const t = settings.tips ? this.pickTip('over') : null;
    const el = $('goTip');
    if (el) el.innerHTML = t ? fmt(t.text) : '';
    this.save();
  }

  // ---------------------------------------------------------------- tips
  eligible(t, at) {
    const g = this.g;
    if ((t.at || 'play') !== at) return false;
    if (t.learn && this.learned.has(t.learn)) return false;
    if (t.cls && t.cls !== g.player.classId) return false;
    if (t.koth !== undefined && t.koth !== (g.objective === 'koth')) return false;
    if (t.hero !== undefined && (!g.hero || (t.hero !== true && t.hero !== g.hero.win))) return false;   // (Hero Game Mode tips)
    if (g.hero && HERO_OFF.has(t.id)) return false;
    if (t.team && !g.humans.some((h) => h !== g.player && allied(h.team, g.player.team))) return false;   // (needs a human ally)
    return true;
  }

  // The next tip that fits and has not been shown yet; when every one that fits has been seen, the round starts again.
  pickTip(at = 'play') {
    const list = TIPS.filter((t) => this.eligible(t, at));
    if (!list.length) return null;
    let t = list.find((x) => !this.seen.has(x.id));
    if (!t) { for (const x of list) this.seen.delete(x.id); t = list[0]; }
    this.seen.add(t.id);
    this.save();
    return t;
  }

  // a quiet spell (nothing has hurt you for a while) and a long enough gap since the last one: time for a tip
  tipWatch(p) {
    const g = this.g, now = g.time;
    if (this.tipUntil && (now > this.tipUntil || now - p.lastHurt < 1.5 || !settings.tips)) this.hideTip();
    const calm = p.alive && !this.away && !document.hidden && !g.paused && !g.ui.shopOpen && now - p.lastHurt >= TIP.hurt && now - this.dangerAt >= TIP.hurt;
    if (!calm) { this.calmSince = now; return; }
    if (!settings.tips || this.tipUntil || now - this.calmSince < TIP.calm || now - this.tipAt < TIP.gap) return;
    const t = this.pickTip('play');
    if (t) { this.showTip(t.text); this.tipAt = now; }
  }

  showTip(text, secs = TIP.show) {
    this.tipText = text;
    this.tipUntil = this.g.time + secs;
    const el = $('tip');
    if (!el) return;
    el.querySelector('span').innerHTML = fmt(text);
    el.classList.add('show');
  }

  hideTip() {
    this.tipUntil = 0;
    const el = $('tip');
    if (el) el.classList.remove('show');
  }

  save() {
    this.dirty = false;
    this.savedAt = this.g.time;
    try { localStorage.setItem(STORE, JSON.stringify({ seen: [...this.seen], learned: [...this.learned] })); } catch (e) { /* storage unavailable: nothing is remembered */ }
  }

  // ---------------------------------------------------------------- callouts
  callout(text, icon, tone, pos) {
    const box = $('alerts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `alert ${tone}`;
    const i = document.createElement('i'), s = document.createElement('span');
    i.textContent = icon;
    s.textContent = text;
    el.append(i, s);
    const where = pos ? this.bearing(pos) : '';
    if (where) { const b = document.createElement('b'); b.textContent = where; el.append(b); }
    box.append(el);
    const secs = tone === 'danger' ? 7 : 5.5;
    setTimeout(() => el.classList.add('fade'), (secs - 0.7) * 1000);
    setTimeout(() => el.remove(), secs * 1000);
    while (box.children.length > 4) box.firstChild.remove();
  }

  // a pointer relative to where you are looking, and the distance: "↗ 64 m"
  bearing(pos) {
    const p = this.g.player;
    const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const a = Math.atan2(-dx * c + dz * s, dx * s + dz * c);      // 0: straight ahead, a quarter turn: to your right
    return `${ARROWS[(Math.round(a / (Math.PI / 4)) + 8) % 8]} ${Math.round(Math.hypot(dx, dz))} m`;
  }

  // ---------------------------------------------------------------- looking away
  // The player has left (the tab is hidden or the window lost focus): from here on, what happens is kept for them.
  leave() {
    const g = this.g;
    if (this.away || g.state !== 'playing' || !settings.alerts) return;
    const p = g.player, f = g.localFaction;
    this.title0 = document.title;
    this.bgAt = performance.now();
    this.away = { at: performance.now(), round: g.round, kills: p.kills, deaths: p.deaths, earned: f.earned, level: p.level, events: [], n: 0, label: '' };
  }

  // something happened while they were away: kept for the panel, and a warning also flashes in the tab title
  note(label, tone) {
    const a = this.away;
    if (!a) return;
    a.events.push({ label, tone });
    if (tone !== 'warn' && tone !== 'danger') return;
    a.n++;
    a.label = label;
    if (!this.flashTimer) {
      this.flashOn = false;
      const tick = () => {
        if (!this.away || !this.away.n) return;
        this.flashOn = !this.flashOn;
        document.title = this.flashOn ? `⚔ (${this.away.n}) ${this.away.label}` : this.title0;
      };
      tick();
      this.flashTimer = setInterval(tick, 1000);
    } else if (this.flashOn) document.title = `⚔ (${a.n}) ${a.label}`;
  }

  // The player is back: the title is the title again and, if there was time for something to happen, the panel says what.
  back() {
    const a = this.away;
    if (!a) return;
    this.away = null;
    this.bgAt = 0;
    if (this.flashTimer) { clearInterval(this.flashTimer); this.flashTimer = 0; document.title = this.title0; }
    const g = this.g;
    g.audio.resume();
    const secs = (performance.now() - a.at) / 1000;
    if (secs < AWAY.min || g.state !== 'playing' || !settings.alerts) return;
    const p = g.player, f = g.localFaction, lines = [];
    const groups = new Map();
    for (const e of a.events) { const k = groups.get(e.label) || { n: 0, tone: e.tone }; k.n++; groups.set(e.label, k); }
    for (const [label, k] of [...groups].slice(0, 4)) lines.push([ICON[k.tone] || ICON.info, k.n > 1 ? `${label} ×${k.n}` : label]);
    const waves = g.round - a.round, kills = p.kills - a.kills, deaths = p.deaths - a.deaths, gold = Math.floor(f.earned - a.earned);
    if (waves > 0) lines.push(['⚔', `${waves} wave${waves > 1 ? 's' : ''} marched`]);
    if (kills > 0) lines.push(['🗡', `You slew ${kills}`]);
    if (deaths > 0) lines.push(['☠', deaths > 1 ? `You fell ${deaths} times` : 'You fell']);
    if (gold >= 10 && !g.hero) lines.push(['●', `+${gold} gold earned`]);
    if (p.level > a.level) lines.push(['✦', `You reached level ${p.level}`]);
    const el = $('away');
    if (!lines.length || !el) return;
    el.querySelector('small').textContent = clockText(secs);
    el.querySelector('ul').innerHTML = lines.map(([i, t]) => `<li><i>${i}</i>${esc(t)}</li>`).join('');
    el.classList.remove('hidden');
    clearTimeout(this.awayHide);
    this.awayHide = setTimeout(() => el.classList.add('hidden'), AWAY.show * 1000);
  }

  // The tab is hidden, so the browser has stopped the render loop. An online game must not stop with it: step it here, in
  // 1/20 s slices, for the real time that has passed (at most a second per call, so a stalled timer cannot burst). Single
  // player simply waits for the player. Returns how many steps it took.
  background(now = performance.now()) {
    const g = this.g;
    if (!document.hidden || g.mode === 'single' || g.state !== 'playing') { this.bgAt = 0; this.bgAcc = 0; return 0; }
    const dt = this.bgAt ? Math.min(1, Math.max(0, now - this.bgAt) / 1000) : 0;
    this.bgAt = now;
    this.bgAcc += dt;
    let steps = 0;
    try {
      while (this.bgAcc >= 0.05 - 1e-9 && steps < 20) {
        g.update(0.05);
        g.input.endFrame();                   // (nobody is pressing anything: a key hit before the tab hid must not repeat)
        this.bgAcc -= 0.05;
        steps++;
      }
    } catch (e) {
      if (!this.bgErrors++) console.error('Background tick error (the game keeps running):', e);
    }
    this.bgAcc = Math.max(0, Math.min(this.bgAcc, 0.05));
    return steps;
  }
}
