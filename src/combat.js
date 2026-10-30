// Melee: one simple swing and a guard in front.
//
// Nobody chooses a direction. A swing is named only for how it looks ('right' from the weapon-arm side, 'left' back
// across the body, 'over' above the head, 'thrust' a stab): the hero's swings take turns between them and soldiers
// pick one that suits their weapon. A shield raised toward the blow stops it, whatever way it comes.

export const DIRS = ['left', 'right', 'over', 'thrust'];
export const DIR_IDX = { left: 0, right: 1, over: 2, thrust: 3 };   // (how a swing's look travels over the network)

// The hero's sword swing: the wind-up and strike times, reach beyond the blade, the cone in front it sweeps (cosine of
// the half-angle), how many it can catch, and its damage factor.
export const SWING = { wind: 0.16, strike: 0.16, recover: 0.2, reach: 0.15, cone: 0.4, targets: 3, mult: 1.12 };

// The hero's swings take turns between these looks (left click again and again: right, left, right, left, overhead).
export const SWING_CYCLE = ['right', 'left', 'right', 'left', 'over'];

// The looks a soldier's weapon swings with.
export function attackDirsFor(weapon) {
  if (weapon === 'spear' || weapon === 'lance') return ['thrust'];
  if (weapon === 'greataxe') return ['over', 'left', 'right'];
  return ['right', 'over', 'left', 'thrust'];
}

export const PARRY_WINDOW = 0.35;   // seconds after raising your guard in which a blow from the front is parried
export const BLOCK_STAMINA = 5;     // what stopping a blow on the shield costs; with less than this left the guard only softens it
