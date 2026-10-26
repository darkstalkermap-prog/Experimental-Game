// Directional melee: shared rules for attack and block directions.
//
// Attack directions are named for where the weapon is wound up: 'right' on the weapon-arm side,
// 'left' across the body, 'over' above the head, 'thrust' pulled back for a stab. Seen from the
// front, a soldier's weapon arm is on your right, so a 'right' attack arrives on your right side
// and you block it by guarding right.

export const DIRS = ['left', 'right', 'over', 'thrust'];
export const DIR_IDX = { left: 0, right: 1, over: 2, thrust: 3 };

// Side of the defender's view an attack arrives from.
export function incomingSide(attackDir) {
  return attackDir;
}

// Pick a direction from recent mouse movement (screen x right, y down).
export function dirFromAim(x, y, fallback) {
  if (Math.hypot(x, y) < 6) return fallback;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y < 0 ? 'over' : 'thrust';
}

// Per-direction strike shape for the player's sword.
export const STRIKE = {
  left: { reach: 0, cone: 0.35, targets: 3, mult: 1.0 },
  right: { reach: 0, cone: 0.35, targets: 3, mult: 1.0 },
  over: { reach: 0.1, cone: 0.6, targets: 2, mult: 1.15 },
  thrust: { reach: 0.5, cone: 0.82, targets: 1, mult: 1.1 },
};

// Directions a soldier's weapon can attack in.
export function attackDirsFor(weapon) {
  if (weapon === 'spear' || weapon === 'lance') return ['thrust'];
  if (weapon === 'greataxe') return ['over', 'left', 'right'];
  return ['right', 'over', 'left', 'thrust'];
}

export const PARRY_WINDOW = 0.35; // seconds after raising your guard in which a matching block parries
