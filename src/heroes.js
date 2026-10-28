// What a hero is made of: the class, the level (experience) and the talents chosen. Everything that changes how strong a
// hero is goes through heroMods(), so the three can grow on their own: the class numbers live in classes.js, the
// level numbers here, and the talent numbers in the talent tree.
import { classOf } from './classes.js';
import { treeMods } from './talents.js';

export const MAX_LEVEL = 5;
// total experience needed to reach each level (the index is the level)
export const XP_FOR_LEVEL = [0, 0, 100, 260, 480, 800];

export function levelFor(xp) {
  let l = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) if (xp >= XP_FOR_LEVEL[i]) l = i;
  return l;
}

// One talent point for every level after the first.
export const talentPointsFor = (level) => Math.max(0, Math.min(MAX_LEVEL, level) - 1);

// What the hero's level adds, on top of the class: { mul: { key: factor }, add: { key: amount } }.
export function levelMods(level) {
  return { mul: {}, add: {} };
}

// What the hero's talents add (same shape). p.talents is { talentId: true }; the trees are in talents.js.
export function talentMods(p) {
  return treeMods(p);
}

// The class mods with the level and the talents applied. The keys are those of CLASSES[id].mods: hp, speed, melee, bow,
// spell, draw, cd, regen, rider and trample are multipliers (cd and draw: lower is quicker; rider: lower takes less
// damage), armor, block and bloodied are added, horse is a flag.
export function heroMods(p) {
  const m = { ...classOf(p.classId).mods };
  for (const d of [levelMods(p.level), talentMods(p)]) {
    for (const k in d.mul) m[k] = (m[k] ?? 1) * d.mul[k];
    for (const k in d.add) m[k] = (m[k] ?? 0) + d.add[k];
  }
  return m;
}
