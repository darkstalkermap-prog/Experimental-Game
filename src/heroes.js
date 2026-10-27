// What a hero is made of: the class, the level (experience) and the talents chosen. Everything that changes how strong a
// hero is goes through heroMods(), so the three can grow on their own: the class numbers live in classes.js, the
// level numbers here, and the talent numbers in the talent tree.
import { classOf } from './classes.js';
import { SOUNDS } from './audio.js';
import { PLAYER } from './config.js';

export const MAX_LEVEL = 5;
// total experience needed to reach each level (the index is the level)
export const XP_FOR_LEVEL = [0, 0, 120, 320, 640, 1100];

export function levelFor(xp) {
  let l = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) if (xp >= XP_FOR_LEVEL[i]) l = i;
  return l;
}

// One talent point for every level after the first.
export const talentPointsFor = (level) => Math.max(0, Math.min(MAX_LEVEL, level) - 1);

// What the levels add to the class. The growth is gradual, and its aim is that at level 5 a hero's best weapon hits a
// little harder than the strongest veteran soldier (a rank-5 Lancer, 42): a Knight's sword goes from 34 to about 46. A
// class that already hits harder than that (the Berserker, the Ranger) grows less in damage, and gets the same
// toughness as everyone else.
export const LEVEL = {
  hit: 46,          // what the best weapon of a hero should do at level 5, if its class has room to grow
  dmg: 0.34,        // the most that sword, bow and spell damage grow by at level 5 (+34%) ...
  dmgMin: 0.12,     // ... and the least (+12%)
  hp: 0.28,         // health at level 5 (+28%)
  armor: 3,         // armour points at level 5
  speed: 0.04,      // walking pace (+4%)
  regen: 0.4,       // healing out of combat (+40%)
  cd: -0.08,        // abilities recharge sooner (-8%)
  heal: 0.3,        // the share of full health a level-up mends
};

// How much a class's damage grows by level 5: enough to bring its best weapon up to LEVEL.hit, within limits.
export function damageGrowth(classId) {
  const m = classOf(classId).mods;
  const best = Math.max(PLAYER.swordDmg * m.melee, PLAYER.bowDmg * m.bow);
  return Math.max(LEVEL.dmgMin, Math.min(LEVEL.dmg, LEVEL.hit / best - 1));
}

// What the hero's level adds, on top of the class: { mul: { key: factor }, add: { key: amount } }.
export function levelMods(level, classId) {
  const t = (Math.max(1, Math.min(MAX_LEVEL, level)) - 1) / (MAX_LEVEL - 1);   // 0 at level 1, 1 at level 5
  if (!t) return { mul: {}, add: {} };
  const dmg = 1 + damageGrowth(classId) * t;
  return {
    mul: { hp: 1 + LEVEL.hp * t, melee: dmg, bow: dmg, spell: dmg, speed: 1 + LEVEL.speed * t, regen: 1 + LEVEL.regen * t, cd: 1 + LEVEL.cd * t },
    add: { armor: LEVEL.armor * t },
  };
}

// What a hero is paid in experience for. A kill is worth its base by the victim's kind, a little more for each rank a
// veteran has earned (and for every level of a rival hero); the men fighting beside a hero earn him a share.
export const XP = {
  kill: { swordsman: 8, spearman: 8, archer: 8, engineer: 4, longbowman: 14, knight: 18, horseman: 18, lancer: 26, lord: 70, giant: 150, ram: 30, catapult: 40 },
  hero: 80,           // a rival hero
  perRank: 0.12,      // more per rank above the first
  perLevel: 0.15,     // more per level above the first, for a rival hero
  share: 0.4,         // what a hero earns when an ally within shareRange brings someone down
  shareRange: 28,
  wave: 10,           // every wave a hero lives through
  gate: 40,           // breaking an enemy gate
  wall: 15,           // opening a breach
  keep: 250,          // breaking a keep
  hill: 25,           // taking the hill (heroes on it)
};

// The experience a victim is worth: a soldier, a rival hero, an engine.
export function killXp(v) {
  if (v.isPlayer) return XP.hero * (1 + XP.perLevel * ((v.level || 1) - 1));
  const base = XP.kill[v.type] ?? 6;
  return base * (1 + XP.perRank * ((v.rank || 1) - 1));
}

// How far through the current level the hero is, 0..1 (1 at the top level).
export function levelProgress(xp, level) {
  if (level >= MAX_LEVEL) return 1;
  const a = XP_FOR_LEVEL[level], b = XP_FOR_LEVEL[level + 1];
  return Math.max(0, Math.min(1, (xp - a) / (b - a)));
}

// What the hero's talents add (same shape as levelMods). p.talents is { talentId: true }.
export function talentMods(p) {
  return { mul: {}, add: {} };
}

// The class mods with the level and the talents applied. The keys are those of CLASSES[id].mods: hp, speed, melee, bow,
// spell, draw, cd, regen, rider and trample are multipliers (cd and draw: lower is quicker; rider: lower takes less
// damage), armor, block and bloodied are added, horse is a flag.
export function heroMods(p) {
  const m = { ...classOf(p.classId).mods };
  for (const d of [levelMods(p.level, p.classId), talentMods(p)]) {
    for (const k in d.mul) m[k] = (m[k] ?? 1) * d.mul[k];
    for (const k in d.add) m[k] = (m[k] ?? 0) + d.add[k];
  }
  return m;
}

// A rising fanfare for a new level.
SOUNDS.levelup = (a, k) => {
  [523, 659, 784, 1047].forEach((f, i) => a.tone(f, 0.5, 0.17 * k, 'triangle', 1, i * 0.1));
  a.tone(1568, 0.9, 0.1 * k, 'sine', 1, 0.42);
  a.noise(0.5, 6000, 1.5, 0.1 * k, 'highpass', 0.4);
};
