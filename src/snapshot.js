// Ordered fields are the wire protocol. Keep existing positions stable when extending it.
// Named values at the call sites prevent encoder/decoder indexes from drifting apart.
function codec(fields) {
  return {
    pack: (values) => fields.map((name) => values[name]),
    unpack: (values) => Object.fromEntries(fields.map((name, i) => [name, values[i]])),
  };
}

export const { pack: packFaction, unpack: unpackFaction } = codec([
  'gold', 'troopCap', 'training', 'eliminated', 'kills', 'heroDeaths', 'respawnT', 'siegeTarget',
  'recruitRole', 'earned', 'isPlayer', 'lord', 'name', 'formation', 'levies',
]);

export const { pack: packHero, unpack: unpackHero } = codec([
  'team', 'x', 'y', 'z', 'yaw', 'alive', 'hp', 'maxHp',
  'blocking', 'swingT', 'weapon', 'mounted', 'heading', 'rideSpeed', 'hasHorse', 'horseX',
  'horseY', 'horseZ', 'horseYaw', 'name', 'pitch', 'attackDir', 'blockDir', 'staggered',
  'classId', 'driving', 'movementFlags', 'level',
]);

