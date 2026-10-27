// Who fights whom. Every team is its own side unless it has been grouped with others (co-op).
const sideOf = new Map();   // team -> side id (only for grouped teams)

// groups: [[0, 1], [2, 3]] puts teams 0 and 1 on one side, 2 and 3 on another. Teams left out stand alone.
export function setSides(groups) {
  sideOf.clear();
  groups.forEach((g, i) => { if (g.length > 1) for (const t of g) sideOf.set(t, i); });
}

export function allied(a, b) {
  return a === b || (sideOf.has(a) && sideOf.get(a) === sideOf.get(b));
}

// Teams on the same side as `team` (including itself).
export function sideMates(team, teams) {
  return teams.filter((t) => allied(t, team));
}
