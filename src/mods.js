// Rule modifiers: a few named numbers that the rules read where they used to read a constant. A Battle Decree, a biome, a comeback rule or the match length
// each puts a SOURCE of modifiers in (`mods.set('decree:double_waves', { waveSize: 2 })`) and takes it out again (`mods.remove(id)`, or `mods.reset()` when a
// match starts); a rule asks for what is in force: `count = Math.round(base * mods.mul('waveSize'))`. Nothing is set unless a feature sets it, so in a classic
// match every `mul` is 1, every `sum` 0 and every `flag` false, and the game is exactly what it was.
// The host decides the rules; a guest sets the same sources from the match options it was sent (it only uses them for what it shows). The rules are
// read at the moment they matter (a wave spawning, a purchase), not every frame: for a hot path cache the answer against `mods.version`.
//
// Keys in use (add yours here when you hook one into the rules; `mul` keys multiply across sources, `sum` keys add up, `flag` keys are on if any source says so):
//   mul  waveSize      units in every wave                        mul  waveGap       seconds between waves
//   mul  income        passive gold income                        mul  bounty        gold for a kill
//   mul  cost.<item>   shop price of an item (cost.giant, cost.gateRepair, cost.ram, ...; cost.all for every item; cost.recruit, cost.siege,
//                      cost.upgrade, cost.gear, cost.castle for a group of them: the lists are in economy.js)
//   mul  speed         march speed of soldiers                    mul  heroSpeed     walking speed of heroes
//   mul  respawn       seconds until a fallen hero or lord rises  sum  startGold     gold at the start of the match
//   mul  offroadSpeed  march speed of soldiers away from the roads (snow)          mul  mudSpeed      march speed of soldiers wading through a pond (marsh)
//   mul  archerRange   range of archers (the marsh's mist)                          mul  staminaDrain / staminaRegen   a hero's sprint stamina: how fast it drains and returns (desert)
//   mul  prep          seconds of preparation before the first wave        mul  growth       how much tougher every wave's soldiers get (WAVES.growth)
//   mul  siegeGrowth   how much harder later waves and engines hit gates and walls (WAVES.siegeGrowth)    [source 'length:short': the Short match, see config.js LENGTHS]
export const mods = {
  version: 0,
  sources: new Map(),
  reset() { this.sources.clear(); this.version++; },
  set(id, values) { this.sources.set(id, { ...values }); this.version++; },
  remove(id) { if (this.sources.delete(id)) this.version++; },
  mul(key) { let v = 1; for (const s of this.sources.values()) if (typeof s[key] === 'number') v *= s[key]; return v; },
  sum(key) { let v = 0; for (const s of this.sources.values()) if (typeof s[key] === 'number') v += s[key]; return v; },
  flag(key) { for (const s of this.sources.values()) if (s[key]) return true; return false; },
  list() { return [...this.sources.keys()]; },
};
