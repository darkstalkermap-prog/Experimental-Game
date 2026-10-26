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
  towerR: 3.2,
  towerH: 13,
  keepW: 11,
  keepH: 15,
  baseY: 2,       // terrain is flattened to this height around castles
  wallHp: 900,
  gateHp: 1400,
  keepHp: 3000,
};

export const ROUNDS = {
  firstPrep: 60,      // preparation time before the first wave (buy and upgrade before the match)
  prep: 25,           // seconds between waves
  maxWaveTime: 210,   // a wave is force-ended after this long
  warRound: 4,        // rival lords start assaulting castles from this round
  survivalBonus: (round) => 80 + round * 25,
};

export const START_GOLD = 500;
export const GIANT_COST = 1600;

export const DIFFICULTY = {
  easy:   { wave: 0.7, enemyStat: 0.85, aiGold: 0.8, aiAggro: 0.7 },
  normal: { wave: 1.0, enemyStat: 1.0,  aiGold: 1.0, aiAggro: 1.0 },
  hard:   { wave: 1.35, enemyStat: 1.15, aiGold: 1.25, aiAggro: 1.3 },
};

// Gold rewards for kills, by victim kind.
export const BOUNTY = {
  raider: 10, raiderArcher: 12, brute: 35, warlord: 250,
  raiderRider: 30, shaman: 30, longbowman: 30, giant: 600, horseman: 50, lancer: 65,
  swordsman: 18, spearman: 20, archer: 20, knight: 45, lord: 120, hero: 120,
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

  raider: { name: 'Raider', hp: 75, dmg: 10, armor: 1, speed: 4.3, range: 1.9, cd: 1.2,
    weapon: 'axe', shield: 'round', helmet: 'none', body: 'leather', kind: 'infantry' },
  raiderArcher: { name: 'Raider Archer', hp: 55, dmg: 9, armor: 0, speed: 4.4, range: 38, cd: 2.6,
    weapon: 'bow', helmet: 'hood', body: 'leather', kind: 'archer', ranged: true },
  raiderRider: { name: 'Raider Rider', hp: 150, dmg: 15, armor: 2, speed: 8.2, range: 2.5, cd: 1.4,
    weapon: 'axe', shield: 'round', helmet: 'none', body: 'leather', kind: 'cavalry', mounted: true },
  shaman: { name: 'Raider Shaman', hp: 70, dmg: 26, armor: 0, speed: 4.2, range: 34, cd: 3.4,
    weapon: 'staff', helmet: 'hood', body: 'fur', kind: 'archer', ranged: true, spell: 'fireball' },
  giant: { name: 'Giant', hp: 3200, dmg: 90, armor: 6, speed: 3.4, range: 4.4, cd: 2.6,
    weapon: 'club', helmet: 'none', body: 'fur', scale: 3.2, kind: 'giant', giant: true, structMult: 4, siegeBonus: 2.5 },
  brute: { name: 'Brute', hp: 260, dmg: 22, armor: 4, speed: 3.8, range: 2.4, cd: 1.6,
    weapon: 'greataxe', helmet: 'horned', body: 'fur', scale: 1.25, kind: 'infantry', siegeBonus: 1.5, structMult: 1.5 },
  warlord: { name: 'Raider Warlord', hp: 1000, dmg: 36, armor: 8, speed: 4.2, range: 2.6, cd: 1.3,
    weapon: 'greataxe', helmet: 'horned', body: 'plate', scale: 1.4, cape: true, kind: 'hero', boss: true, siegeBonus: 2, structMult: 2.5 },
};

export const SIEGE_TYPES = {
  ram: { name: 'Battering Ram', hp: 700, speed: 2.6, dmg: 110, cd: 2.6, cost: 400 },
  catapult: { name: 'Catapult', hp: 450, speed: 2.0, dmg: 140, cd: 6.5, cost: 750, range: 62 },
};

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

export const TROOP_CAP = { start: 12, step: 6, max: 36 };

// Formations for your troops when they follow you or hold a position.
export const FORMATIONS = {
  line: { name: 'Line', cols: 8, sx: 1.7, sz: 1.9 },
  shieldwall: { name: 'Shield Wall', cols: 10, sx: 1.05, sz: 1.3 },
  loose: { name: 'Loose', cols: 6, sx: 3.4, sz: 3.4 },
};

// Troop experience: XP needed for ranks 2..5, and what each rank adds.
export const RANKS = { xp: [0, 30, 80, 160, 300], hp: 0.12, dmg: 0.1, armor: 1, promoteAt: 4 };
export const PROMOTIONS = { swordsman: 'knight', spearman: 'knight', archer: 'longbowman', horseman: 'lancer' };

// Skyrim-style spells: they fly straight where you aim and are blocked by walls and hills.
export const SPELLS = {
  fireball: { name: 'Fireball', cost: 30, dmg: 55, radius: 3.6, speed: 38, charge: 0.8, color: 0xff7a1a, price: 350,
    desc: 'Hold to charge, release to hurl a fireball that explodes on impact.' },
  lightning: { name: 'Chain Lightning', cost: 25, dmg: 42, range: 46, chain: 2, chainRange: 9, cd: 0.6, color: 0x9fd8ff, price: 500,
    desc: 'An instant bolt to whatever you aim at that jumps to two more enemies in sight.' },
  ice: { name: 'Ice Spike', cost: 20, dmg: 45, speed: 55, pierce: 3, slow: 3, color: 0xbfe8ff, price: 400,
    desc: 'A fast shard that pierces up to three enemies and slows them.' },
};
export const MANA = { base: 100, perLevel: 25, regen: 7, regenPerLevel: 0.4, delay: 1.4 };
