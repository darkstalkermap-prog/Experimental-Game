// Who is on whose side. In versus games every house fights alone; in co-op games the human
// players form one alliance (their soldiers, castles and gates treat each other as friends).
export const alliance = new Set();

export function setAlliance(teams) {
  alliance.clear();
  for (const t of teams) alliance.add(t);
}

export function allied(a, b) {
  return a === b || (alliance.has(a) && alliance.has(b));
}
