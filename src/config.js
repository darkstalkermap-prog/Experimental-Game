// Central tuning values for Castle Wars. Everything balance-related lives here.

export const PLAYER_TEAM = 0;
export const RAIDER_TEAM = 4;

export const TEAM_COLORS = [0x2f62c8, 0xb8322a, 0x2c8a46, 0xd9a521, 0x4a3b2c];
export const TEAM_CSS = ['#3f74e0', '#d0453b', '#38a957', '#e8b52c', '#8a6a4a'];
export const TEAM_NAMES = ['Your Kingdom', 'House Varr', 'House Elden', 'House Sol', 'Raiders'];
export const LORD_NAMES = ['You', 'Lord Varr', 'Lady Elden', 'Lord Sol'];

export const WORLD = {
  half: 220,        // terrain extends to +-half
  playHalf: 204,    // characters are clamped to +-playHalf
  castleDist: 130,  // distance of each castle from the map centre
  gravity: 22,
  size: 'medium',
};

export const MAP_SIZES = {
  small: { name: 'Small', half: 160, castleDist: 88, desc: 'Castles close together: early clashes.' },
  medium: { name: 'Medium', half: 220, castleDist: 130, desc: 'Balanced distances.' },
  large: { name: 'Large', half: 300, castleDist: 190, desc: 'Wide wilds between castles: long marches, more forest.' },
};

// Switch map size. Must be called before a Game is built.
export function setMapSize(size) {
  const m = MAP_SIZES[size] || MAP_SIZES.medium;
  WORLD.size = MAP_SIZES[size] ? size : 'medium';
  WORLD.half = m.half;
  WORLD.playHalf = m.half - 16;
  WORLD.castleDist = m.castleDist;
}

export const CASTLE = {
  H: 20,          // half-size of the curtain wall square
  wallH: 8,       // wall height
  wallT: 2,       // wall thickness
  gateW: 6,
  gateH: 6,
  towerR: 4.5,    // corner towers are square: this is half their width
  towerOff: 2.5,  // a tower's centre sits this far outside the wall corner, so its inner corner meets the wall walk
  walk: 3.5,      // width of the wooden walkway along the inside of the walls
  towerH: 13,
  keepW: 11,
  keepH: 15,
  baseY: 2,       // terrain is flattened to this height around castles
  wallHp: 900,
  gateHp: 1400,
  keepHp: 3000,
};

// Army waves, MOBA style: every castle sends a fresh wave marching out on a fixed timer, for as long as it stands.
export const WAVES = {
  firstPrep: 60,      // preparation time before the first wave (buy and upgrade before the match)
  interval: 30,       // seconds between waves
  spread: 0.5,        // seconds between soldiers leaving the barracks
  wage: (wave) => Math.min(130, 30 + wave * 4),   // gold every standing house is paid with each wave
  siegeGrowth: 0.03,  // wave soldiers and engines hit gates and walls this much harder with every wave
  growth: 0.04,       // wave soldiers get this much tougher with every wave
  ramEvery: 3,        // a battering ram joins every 3rd wave (from wave 3)
  catapultEvery: 6,   // a catapult joins every 6th wave (from wave 5)
  siegeLimit: 3,      // wave engines alive at once, per house
};

// Match length (options.length, see options.js). A Short match is a TIMED war: its tempo is faster (a shorter preparation, a wave every 21 seconds instead of 30,
// soldiers and engines that grow tougher a quarter quicker: a source of rule modifiers, src/mods.js, put in by Game.start for the war modes) and after `limit`
// seconds of play the war is decided on points (castles standing, then the health of the keeps, then kills, then soldiers; Game.timeUp), so that it is over in
// about ten to twelve minutes whatever happens. Why a clock and not only a tempo: in bot-vs-bot wars (the lords play every house, Normal, medium map, six wars of each
// length) the lords hold out. With the comeback rules (comeback.js) the first castle of a Standard war fell after about 12 minutes and only two wars in six were over within 30;
// in a Short war a castle fell in two of the six, after about 6 minutes, and the clock decided all six. A faster tempo brings the early war forward but not the end of it: nobody
// takes the last keep, with or without the pace. A person does, by spending the surplus gold on a giant and engines and leading the siege, but how long that takes cannot be
// measured without people. Standard sets nothing: the war as it was.
export const LENGTHS = {
  standard: { name: 'Standard', time: 'no time limit', desc: 'The war as it always was: a new army every 30 seconds, until one castle stands.', mods: null, limit: 0 },
  short: { name: 'Short', time: 'over by 12:00', desc: 'A timed war: a shorter preparation, a wave every 21 seconds, and after 12 minutes the strongest house wins.',
    mods: { prep: 0.6, waveGap: 0.7, growth: 1.25, siegeGrowth: 1.25 }, limit: 12 * 60 },
};

// A countdown as m:ss (65 -> "1:05").
export const clock = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const START_GOLD = 500;
export const TRICKLE = 1.5;   // gold a second that every standing house earns just by holding its castle
export const GIANT_COST = 1600;
export const SUMMON = { cost: 500, protect: 2 };   // calling a fallen ally back to life (co-op Conquest): the gold it takes, and the seconds they are untouchable on rising
export const HORSE_COST = 400;   // the shop's warhorse for a hero of any class (a Cavalier starts with one)
export const GATE_REPAIR_COST = 1500;   // repairing a damaged gate or rebuilding a broken one (the Iron-Banded Gate upgrades are priced on their own)

// Comeback mechanics (src/comeback.js): what a house that is losing is given. The AI lords play by the same rules as the people.
export const COMEBACK = {
  // Underdog's wage. A house is measured by what it can fight with (see strengthOf): the health of its keep, gate and walls, the worth of its
  // soldiers and engines, and half its purse. Clearly behind the enemy houses' average (below `enter`) it is paid a bonus wage, a share of what
  // it already earns without fighting (`min` when only just behind, `max` when almost beaten), until it climbs back (above `leave`).
  wage: { from: 3, enter: 0.6, leave: 0.8, min: 0.3, max: 0.8, every: 1 },   // `from`: no wage before this wave (the opening is level); `every`: seconds between looks
  strength: { keep: 1500, gate: 300, walls: 300, purse: 0.5 },   // points for a whole keep, a whole gate, whole walls; a coin counts for `purse` points
  gateRepair: 0.5,   // rebuilding a gate that has fallen costs this share of GATE_REPAIR_COST
  // Last Stand: once a match, when the keep is below `keep` of its health. The hero is healed (and rises at once if it had fallen); for `time` seconds
  // the house's soldiers and the hero hit `dmg` times as hard and move `speed` times as fast, and the hero takes `heroGuard` of the damage for `heroTime`
  // seconds; `militia` free soldiers rise at the keep. `held`: seconds after which the log notes that the keep still stands.
  stand: { keep: 0.25, time: 20, dmg: 1.3, speed: 1.25, heroGuard: 0.6, heroTime: 10, militia: 6, held: 30 },
};

export const DIFFICULTY = {
  easy:   { wave: 0.7, enemyStat: 0.85, aiGold: 0.8, aiAggro: 0.7 },
  normal: { wave: 1.0, enemyStat: 1.0,  aiGold: 1.0, aiAggro: 1.0 },
  hard:   { wave: 1.35, enemyStat: 1.15, aiGold: 1.25, aiAggro: 1.3 },
};

// Gold rewards for kills, by victim kind.
export const BOUNTY = {
  longbowman: 30, giant: 600, horseman: 50, lancer: 65,
  swordsman: 18, spearman: 20, archer: 20, knight: 45, lord: 120, hero: 120, engineer: 14,
  ram: 120, catapult: 180,
  gate: 200,
  keep: 500,
};

// Body styles: [armour colour, metalness, roughness]
export const BODY_STYLES = {
  mail:     [0x8b9098, 0.55, 0.55],
  plate:    [0xc3c7cf, 0.75, 0.35],
  gambeson: [0x9d8862, 0.0, 0.95],
  leather:  [0x6b4a2f, 0.0, 0.85],
  fur:      [0x5a4634, 0.0, 1.0],
};

export const UNIT_TYPES = {
  swordsman: { name: 'Swordsman', hp: 100, dmg: 14, armor: 2, speed: 4.4, range: 1.9, cd: 1.1,
    weapon: 'sword', shield: 'round', helmet: 'kettle', body: 'mail', cost: 40, kind: 'infantry' },
  spearman: { name: 'Spearman', hp: 115, dmg: 16, armor: 3, speed: 4.2, range: 2.7, cd: 1.3,
    weapon: 'spear', shield: 'kite', helmet: 'nasal', body: 'mail', cost: 50, kind: 'infantry', siegeBonus: 2.5 },
  archer: { name: 'Archer', hp: 70, dmg: 13, armor: 1, speed: 4.5, range: 44, cd: 2.2,
    weapon: 'bow', helmet: 'hood', body: 'gambeson', cost: 60, kind: 'archer', ranged: true },
  knight: { name: 'Knight', hp: 240, dmg: 26, armor: 7, speed: 4.1, range: 2.1, cd: 1.2,
    weapon: 'sword', shield: 'kite', helmet: 'great', body: 'plate', cost: 130, kind: 'infantry', scale: 1.08 },
  longbowman: { name: 'Longbowman', hp: 95, dmg: 20, armor: 3, speed: 4.5, range: 54, cd: 2.0,
    weapon: 'bow', helmet: 'nasal', body: 'mail', kind: 'archer', ranged: true, promoteOnly: true },
  horseman: { name: 'Cavalry', hp: 260, dmg: 22, armor: 5, speed: 8.6, range: 2.6, cd: 1.4,
    weapon: 'sword', shield: 'kite', helmet: 'nasal', body: 'mail', cost: 160, kind: 'cavalry', mounted: true },
  lancer: { name: 'Lancer', hp: 300, dmg: 30, armor: 7, speed: 9.2, range: 3.4, cd: 2.0,
    weapon: 'lance', shield: 'kite', helmet: 'great', body: 'plate', cost: 220, kind: 'cavalry', mounted: true },
  lord: { name: 'Lord', hp: 340, dmg: 30, armor: 7, speed: 5.0, range: 2.2, cd: 1.0,
    weapon: 'sword', shield: 'kite', helmet: 'crown', body: 'plate', scale: 1.12, cape: true, kind: 'hero', structMult: 1.2 },

  // Siege crews push and load the engines. They carry no weapons, but they can be cut down like anyone else.
  engineer: { name: 'Engineer', hp: 75, dmg: 0, armor: 1, speed: 2.6, range: 1.5, cd: 9,
    weapon: 'none', helmet: 'hood', body: 'leather', cost: 0, kind: 'crew', crew: true },

  giant: { name: 'Giant', hp: 3200, dmg: 90, armor: 6, speed: 3.4, range: 4.4, cd: 2.6,
    weapon: 'club', helmet: 'none', body: 'fur', scale: 3.2, kind: 'giant', giant: true, structMult: 4, siegeBonus: 2.5 },
};

export const SIEGE_TYPES = {
  ram: { name: 'Battering Ram', hp: 700, speed: 2.6, dmg: 110, cd: 2.6, cost: 400 },
  catapult: { name: 'Catapult', hp: 450, speed: 2.0, dmg: 140, cd: 6.5, cost: 750, range: 62 },
};

export const ENGINE_TURN = 0.9;   // how fast a siege engine turns when steered (rad/s)

export const PLAYER = {
  hp: 220,
  armor: 4,
  speed: 5.2,
  sprint: 8.4,
  jump: 7.5,
  swordDmg: 34,
  bowDmg: 30,
  arrows: 30,
  maxArrows: 60,
  block: 0.75,
  respawnBase: 12,
  respawnPerDeath: 6,
};

// How a hero stands, ducks and climbs. A duck lowers the head and the hitbox (arrows fly over it, merlons cover it)
// at the cost of speed. A hero scrambles up a wall from outside by jumping at it: the walls are 8 m high, far past a
// jump, so the jump becomes a climb that takes about a second (and some stamina).
export const BODY = {
  height: 1.8, eye: 1.68,
  duckHeight: 1.2, duckEye: 1.08, duckSpeed: 0.5,
  climbMin: 2.0,      // a ledge this much higher than your feet is climbed rather than jumped (a jump gets you ~1.9 m)
  climbMax: 9.6,
  climbReach: 1.1,    // you must be this close to the wall face (from your edge)
  climbStamina: 20,
  climbCooldown: 0.7,
  enemyClimb: { stamina: 35, slow: 1.7 },   // an enemy's wall: more stamina, a slower climb (and a solid hit knocks you off any wall)
};

// The Ranger's Arrow Volley: hold Q to put a circle on the ground, let go and the arrows fall on it.
export const VOLLEY = {
  range: 62,          // how far away the circle can be put
  radius: 6.5,
  arrows: 18,
  dmg: 0.6,           // of the Ranger's bow damage, per arrow
  delay: 0.6,         // from letting go until the first arrow comes down out of the sky
  span: 0.8,          // over how many seconds the arrows keep coming
  fallH: 34, fallBack: 14,   // where the arrows start above and behind the target
  aimed: 0.7,         // share of the arrows that pick a foe inside the circle (the rest fall at random)
};

// Game modes. Conquest is the main one: break the other houses' castles, last castle standing wins. King of the Hill is
// the same war with a prize in the middle of the map: hold the hill and win outright.
export const OBJECTIVES = {
  conquest: { name: 'Conquest', desc: "Break the other houses' castles. The last castle standing wins." },
  koth: { name: 'King of the Hill', desc: 'The same war, with a hill in the middle of the map: hold it long enough and you win.' },
};

// The hill in the middle of the map (a mound ringed by the standing stones). Whoever holds it earns gold; in King of
// the Hill, holding it is also how the match is won. A house takes it by standing on it alone: a rival's soldier on
// the hill makes it contested, and nobody gains anything while it is.
export const HILL = {
  radius: 13,         // the capture zone: inside the ring of standing stones
  plateau: 11, foot: 30, rise: 3.6,   // the mound: flat top, long slopes down to the ring road
  capture: 8,         // seconds for a lone soldier to take an empty hill (more soldiers are quicker)
  perHead: 0.35,      // what each further soldier adds to that speed, up to maxHeads of them
  maxHeads: 8,
  melt: 0.5,          // a capture nobody is making fades by this much of the bar per second
  income: 2,          // gold per second to the house that holds it (and its allies)
  target: 150,        // King of the Hill: seconds of holding that win the match
  squad: 3,           // the rival lords keep this many men on the hill from the start, and more as the war goes on
  squadMax: 10,
};

export const TROOP_CAP = { start: 12, step: 6, max: 36 };

// The practice courtyard (practice mode only): a walled yard on its own flat ground between the player's castle and the
// next, with training dummies on fixed stands. Sizes are metres; the yard's centre is a share of the castle distance.
export const PRACTICE = {
  hw: 13, hd: 34,            // half the width and the depth of the inside of the yard
  wallH: 5, wallT: 1.6,
  cx: 0.5, cz: 0.7,
  start: 6,                  // the hero begins this far in from the south wall, facing the dummies
  maxCharacters: 40,         // soldiers sent in at once
  dummyHp: 1e6,              // a dummy is never knocked down: it only counts what it takes
  window: 5,                 // seconds the damage per second is measured over
  // the dummies' armour, one per tier: straw; mail like a spearman's; plate like a knight's; a rank-5 lancer's; a fortress
  dummies: [
    { name: 'Straw', armor: 0 }, { name: 'Mail', armor: 3 }, { name: 'Plate', armor: 7 }, { name: 'Champion', armor: 11 }, { name: 'Fortress', armor: 15 },
  ],
};
// Practice mode changes the world itself (the yard has flat ground and no trees round it), so it is a switch that is set
// before a Game is built, like the map size.
export const PRACTICE_WORLD = { on: false };
export const setPracticeWorld = (on) => { PRACTICE_WORLD.on = !!on; };
export const practiceSite = () => ({ x: PRACTICE.cx * WORLD.castleDist, z: PRACTICE.cz * WORLD.castleDist, y: CASTLE.baseY });

// Formations for your troops when they follow you or hold a position.
export const FORMATIONS = {
  line: { name: 'Line', cols: 8, sx: 1.7, sz: 1.9 },
  shieldwall: { name: 'Shield Wall', cols: 10, sx: 1.05, sz: 1.3 },
  loose: { name: 'Loose', cols: 6, sx: 3.4, sz: 3.4 },
};

// Troop experience: XP needed for ranks 2..5, and what each rank adds.
export const RANKS = { xp: [0, 30, 80, 160, 300], hp: 0.12, dmg: 0.1, armor: 1, promoteAt: 4 };
export const PROMOTIONS = { swordsman: 'knight', spearman: 'knight', archer: 'longbowman', horseman: 'lancer' };

// The spells behind the Mage's Fireball and the Cleric's Smite. They fly (or fall) where the caster aims and are
// stopped by walls and hills.
export const SPELLS = {
  fireball: { name: 'Fireball', dmg: 105, radius: 4.4, speed: 40, color: 0xff7a1a },
  smite: { name: 'Smite', dmg: 95, radius: 3.8, range: 60, color: 0xffe9a0 },
};

// Pings and markers (src/pings.js): call-outs between team mates. A ping is a quick middle click on whatever you
// look at and fades after a few seconds; a marker (the held middle button's wheel, or a click on a map) stays much
// longer. The host enforces the rate limit online.
export const PINGS = {
  hold: 0.3,            // seconds the middle button is held before the marker wheel opens
  life: 6,              // a ping lasts this long
  markerLife: 45,       // a marker lasts this long
  maxMarkers: 3,        // markers one player can have out at once: the oldest is replaced
  merge: 3,             // placing within this many metres of one of your own refreshes it instead of adding another
  gap: 0.6,             // least time between two call-outs from one player
  burst: 8, window: 10, // and at most this many in this many seconds
  slack: 0.2,           // a client paces itself this much slower than the host's gap, so network jitter never gets one dropped
  range: 420,           // how far the crosshair looks for something to ping
  size: 0.1,            // an icon in the world is this share of the screen's height, wherever it stands
  types: [              // the five kinds; colour tints the icon, the sender's house colour rings it
    { id: 'go', name: 'Go here', say: 'Go here!', color: '#f2c230' },
    { id: 'attack', name: 'Attack', say: 'Attack here!', color: '#e8453c' },
    { id: 'defend', name: 'Defend', say: 'Defend here!', color: '#4a9bff' },
    { id: 'danger', name: 'Danger', say: 'Danger!', color: '#ff7a1a' },
    { id: 'help', name: 'Need help', say: 'Need help!', color: '#5fe0a0' },
  ],
};

// War Mode (src/warmode.js): no castles, a bowl-shaped arena and one great battle. The "2-minute timer" is the army-building phase: every lord has
// `buildTime` seconds (Ready ends it early once everybody is ready) to spend `gold` on an army and set it out; then the armies fight to the end and the
// last army standing wins (the heroes fight too, and do not rise again). A fight still going after `fightLimit` seconds is decided on the worth of what
// is left. Each kind of soldier has a gold cost and a cap of its own that falls with its power (up to 200 footmen, far fewer knights and riders); a house
// fields at most `armyCap` soldiers, and fewer when four armies take the field (`totalCap` over all houses), so that the biggest battle keeps its frame
// rate (README, War Mode).
export const WAR = {
  buildTime: 120,
  fightLimit: 6 * 60,
  gold: 6000,
  armyCap: 200,
  totalCap: 600,
  // the soldier types for sale (keys of UNIT_TYPES): the gold each costs and how many one house may field
  units: {
    swordsman: { name: 'Footman', cost: 30, cap: 200, desc: 'Sword and shield: cheap and steady, the body of any army.' },
    spearman: { name: 'Spearman', cost: 35, cap: 150, desc: 'Long reach; holds a line and stops riders.' },
    archer: { name: 'Archer', cost: 45, cap: 100, desc: 'Shoots from 44 m. Keep them behind the infantry.' },
    longbowman: { name: 'Longbowman', cost: 70, cap: 50, desc: 'Shoots further and harder than an archer, and wears mail.' },
    knight: { name: 'Knight', cost: 100, cap: 50, desc: 'Plate armour: the strongest man on foot.' },
    horseman: { name: 'Cavalry', cost: 120, cap: 40, desc: 'Fast riders that crash through a line.' },
    lancer: { name: 'Lancer', cost: 170, cap: 20, desc: 'Armoured riders with lances: the heaviest charge.' },
    giant: { name: 'Giant', cost: 1500, cap: 1, desc: 'One to an army. Smashes whole ranks.' },
  },
  presets: {
    line: { name: 'Battle line', desc: 'A broad line: infantry in front, archers behind it, cavalry on the wings.' },
    wedge: { name: 'Wedge', desc: 'An arrowhead of infantry, knights at the tip; archers behind it, riders at the back.' },
    archers: { name: 'Archers behind', desc: 'A deep block of infantry, the archers on a long line well behind it, the riders held back.' },
  },
  // the battle plan of each group of soldiers, for when the fight begins (F1 / F2 / F3 change it in the fight)
  orders: {
    charge: { name: 'Charge', desc: 'March on the enemy and fight.' },
    hold: { name: 'Hold', desc: 'Stay in place and fight what comes close (archers shoot from where they stand).' },
    follow: { name: 'Follow me', desc: 'Follow your hero.' },
  },
  formats: {
    ffa: { name: 'Free-for-all', desc: 'Four armies, each for itself.' },
    teams: { name: 'Two against two', desc: 'Blue and Green against Red and Gold.' },
    duel: { name: 'One against one', desc: 'Two armies, face to face.' },
  },
};
// War Mode changes the world itself (a bowl instead of castles and roads), so it is a switch set before a Game is built, like the practice yard
export const WAR_WORLD = { on: false };
export const setWarWorld = (on) => { WAR_WORLD.on = !!on; };
