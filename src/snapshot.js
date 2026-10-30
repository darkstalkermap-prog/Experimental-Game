// Ordered fields are the wire protocol. Keep existing positions stable when extending it.
// Named values at the call sites prevent encoder/decoder indexes from drifting apart.
// Fields left unset at the end are not sent (JSON would write each as a null): fields that only some matches use go last.
function codec(fields) {
  return {
    pack: (values) => {
      const a = fields.map((name) => values[name]);
      while (a.length && a[a.length - 1] === undefined) a.pop();
      return a;
    },
    unpack: (values) => Object.fromEntries(fields.slice(0, values.length).map((name, i) => [name, values[i]])),
  };
}

export const { pack: packFaction, unpack: unpackFaction } = codec([
  'gold', 'troopCap', 'training', 'eliminated', 'kills', 'heroDeaths', 'respawnT', 'siegeTarget',
  'recruitRole', 'earned', 'isPlayer', 'lord', 'name', 'formation', 'levies', 'wage', 'stand',
]);

export const { pack: packHero, unpack: unpackHero } = codec([
  'team', 'x', 'y', 'z', 'yaw', 'alive', 'hp', 'maxHp',
  'blocking', 'swingT', 'weapon', 'mounted', 'heading', 'rideSpeed', 'hasHorse', 'horseX',
  'horseY', 'horseZ', 'horseYaw', 'name', 'pitch', 'attackDir', 'blockDir', 'staggered',
  'classId', 'driving', 'movementFlags', 'level',
  // the Hero Game Mode only (a war leaves them off the end of the list): the hero's seat, hero kills, deaths, bot or person, seconds to rising again
  'hid', 'heroKills', 'deaths', 'bot', 'respawnT',
]);

