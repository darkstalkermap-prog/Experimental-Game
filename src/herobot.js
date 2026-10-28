// The AI that plays a hero nobody is playing (Hero Game Mode). One HeroBot drives one hero: a Player of some class with a
// level, talents and abilities, simulated where the battle is run. (A stand-in until the real thing is written: it does nothing.)
export class HeroBot {
  constructor(game, player, opts = {}) {
    this.g = game;
    this.p = player;
    this.enemyTeam = opts.enemyTeam ?? (player.team === 0 ? 1 : 0);
  }
  // every frame the hero is alive
  update(dt) {}
  // the hero has just risen at their keep
  reset() {}
  // spend any free talent points (called when the hero has reached a new level)
  spendTalents() {}
}
