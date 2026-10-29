p = '/home/user/experimental-game/.claude/worktrees/agent-ac4feb3b20b5b1d48/src/physics.js'
s = open(p).read()

s = s.replace('''export class Physics {
  constructor(seed = 7) {''', '''// Every collider is one of these, whoever made it: the scanning loops (resolve, groundHeight, pointHit, lineClear) then see a single
// object shape. With the literals the modules pass in (a dozen different key sets) those loops were megamorphic, and every read of a
// number field allocated. Modules keep using the object that add() returns (walls flip `active`, upgrades move the bounds).
class Collider {
  constructor(c) {
    this.minX = c.minX; this.maxX = c.maxX; this.minZ = c.minZ; this.maxZ = c.maxZ;
    this.top = c.top;
    this.bottom = c.bottom === undefined ? -100 : c.bottom;
    this.active = c.active === undefined ? true : c.active;
    this.passTeam = c.passTeam === undefined ? -1 : c.passTeam;
    this.kind = c.kind; this.ref = c.ref; this.team = c.team;
    this.noWalk = c.noWalk; this.noProjectile = c.noProjectile; this.heightFn = c.heightFn;
    for (const k in c) if (!(k in this)) this[k] = c[k];   // (anything else a module hangs on its colliders)
  }
}

export class Physics {
  constructor(seed = 7) {''')

s = s.replace('''  addShotBlocker(c, bucket) {
    if (c.bottom === undefined) c.bottom = -100;
    if (c.active === undefined) c.active = true;
    bucket.shots.push(c);
    return c;
  }''', '''  addShotBlocker(c, bucket) {
    c = new Collider(c);
    bucket.shots.push(c);
    return c;
  }''')

s = s.replace('''  add(c, bucket = null) {
    if (c.bottom === undefined) c.bottom = -100;
    if (c.active === undefined) c.active = true;
    if (c.passTeam === undefined) c.passTeam = -1;
    if (bucket) { bucket.list.push(c); return c; }''', '''  add(c, bucket = null) {
    c = new Collider(c);
    if (bucket) { bucket.list.push(c); return c; }''')
open(p, 'w').write(s)
print('ok')
