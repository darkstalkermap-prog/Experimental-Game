// Rival lord personalities: the named lords who run the AI houses, and how each one plays.
//
// A personality is a set of parameters for LordAI (src/ai.js) on top of CLASSIC, the numbers the AI always had: `CLASSIC` IS the old lord, so a house
// without a personality plays exactly as before. The match options carry one id per house (`options.rivals[team]`, see options.js): '' or 'classic' is
// the old lord, 'rusher' or 'rusher3' a personality (the digits pick the name from its pool, so the id alone is enough to show the same name on every screen).
// Everything here is plain data and small helpers, no DOM and nothing that touches the game; the AI reads `info.params`, the screens read the names and the
// one-line descriptions, and `rollRivals` decides who leads which house next battle.
//
// Keys of a parameter set (the ones CLASSIC does not need are marked "persona only"; CLASSIC never has them, so those code paths do not run for it):
//   spending   reserve [from stage 2, from stage 4] · recruitMin · recruitGuard · mix [swordsman below, spearman below, archer above] · elites [{ type, gold,
//              stage, p }] · barracks (gold) · siege { stage, gold, max, p, ram } · giant { stage, gold } or null · promote (gold) · upgradeGold · upgrades [ids]
//              · repair { gate, keep, walls } (share of health below which it repairs)
//   war        warStage, rush · cooldown [base, spread] · jitter [base, spread] · minTroops, troopStep · minAttackers · maxPush · failWait, winWait · recallKeep,
//              recallGate · sendKinds, sendShare · order · redirect · hero · pushBuy { ram, catapult, giant } · aim { ... weights of the target score }
//   persona only   goals [{ id, lv | n, from }] (what it saves up for, in order: an upgrade up to level `lv`, 'engine' (a ram, then a catapult, ...) up to `n`
//              on the road, 'giant'; nothing before stage `from`) · goalGap (seconds between two of them) · garrison (share of the barracks limit it keeps filled
//              before it saves) · giantGift (share of a giant's price its retinue pays) · tax (gold a second) · lock ('human': every army marches on a human
//              house) · defend { at, hold } (calls the army home when this many foes stand at the gate) · pounce { min, by } (only strikes a castle that is this
//              damaged, until stage `by`) · needEngines · wave { mix, elite } · verbs { push, ram, catapult, and any shop id he likes to announce when he buys it: `{house}` in the text is his house }

// What the lords have always done (src/ai.js before the personalities); every personality below starts from it.
export const CLASSIC = Object.freeze({
  reserve: [100, 150], recruitMin: 60, recruitGuard: 6,
  mix: [0.38, 0.62],
  elites: [
    { type: 'knight', gold: 450, stage: 4, p: 0.3 },
    { type: 'horseman', gold: 300, stage: 3, p: 0.22 },
    { type: 'lancer', gold: 600, stage: 6, p: 0.15 },
  ],
  barracks: 400,
  siege: { stage: 1, gold: 600, max: 2, p: 0.5, ram: 0.65 },
  giant: { stage: 3, gold: 2200 },
  promote: 220,
  upgradeGold: 400,
  upgrades: ['training', 'levies', 'training', 'levies', 'fortify_walls', 'reinforce_gate', 'towers'],
  repair: { gate: 0.45, keep: 0.55, walls: 0.4 },
  warStage: 4, rush: 1,
  cooldown: [60, 60], jitter: [0.7, 0.6],
  minTroops: 8, troopStep: 3, minAttackers: 3, maxPush: 240, failWait: 60, winWait: 20,
  recallKeep: 0.5, recallGate: true,
  sendKinds: ['infantry', 'cavalry'], sendShare: 0.5, order: 'assault', redirect: true,
  hero: 0.6,
  pushBuy: { ram: 450, catapult: [3, 800], giant: [4, 2000] },
  aim: { troops: 25, gate: 20, keep: 40, dist: 0.5, noise: 60, human: 0, damaged: 0 },
});

const knight = (gold, stage, p) => ({ type: 'knight', gold, stage, p });
const rider = (gold, stage, p) => ({ type: 'horseman', gold, stage, p });
const lancer = (gold, stage, p) => ({ type: 'lancer', gold, stage, p });

// The roster. `epithet` follows the first name ("Lord Varric the Reckless"); `names` are the first names with their title, three of each sex, and the same
// personality can lead any of the four houses (the house keeps its colour and its name: House Varr is the red one whoever leads it).
export const PERSONAS = [
  {
    id: 'rusher', kind: 'Rusher', epithet: 'the Reckless', tag: 'Reckless',
    blurb: 'Strikes early with swords and riders, guards the castle thinly.',
    plan: 'Hold the gate through the first push, then hit back at the thin walls.',
    names: ['Lord Varric', 'Lord Garrick', 'Lord Rodric', 'Lady Kestra', 'Lady Brenna', 'Lady Sigrid'],
    params: {
      reserve: [0, 40], recruitMin: 30,
      mix: [0.55, 0.7],
      elites: [rider(150, 0, 0.4), knight(400, 3, 0.2), lancer(500, 4, 0.15)],
      barracks: 500, siege: { stage: 2, gold: 700, max: 1, p: 0.25, ram: 0.8 },
      upgradeGold: 700, upgrades: ['training', 'training', 'levies'],
      repair: { gate: 0.25, keep: 0.3, walls: 0.2 },
      warStage: 2, rush: 0, cooldown: [10, 15], jitter: [0.95, 0.1],
      minTroops: 6, troopStep: 4, minAttackers: 2, maxPush: 300, failWait: 30, winWait: 10,
      recallKeep: 0.2, recallGate: false, hero: 1,
      pushBuy: { ram: 500, catapult: null, giant: null },
      wave: { mix: ['swordsman', 'swordsman', 'spearman', 'swordsman', 'archer', 'swordsman', 'spearman', 'swordsman'], elite: { from: 3, every: 2, type: 'horseman' } },
      verbs: { push: 'charges out against' },
    },
  },
  {
    id: 'turtler', kind: 'Turtler', epithet: 'the Patient', tag: 'Patient',
    blurb: 'Raises walls, gate and towers, then marches late with a huge host.',
    plan: 'Do not waste an army on the walls: break the others first, or arrive with engines.',
    names: ['Lady Morwen', 'Lady Eleanor', 'Lady Anselma', 'Lord Osric', 'Lord Aldous', 'Lord Benedict'],
    params: {
      reserve: [150, 250],
      mix: [0.2, 0.55],
      elites: [knight(350, 3, 0.35)],
      siege: { stage: 6, gold: 900, max: 2, p: 0.5, ram: 0.4 },
      giant: { stage: 5, gold: 1900 },
      repair: { gate: 0.6, keep: 0.7, walls: 0.5 },
      goals: [
        { id: 'fortify_walls', lv: 1 }, { id: 'towers', lv: 1 }, { id: 'reinforce_gate', lv: 1 }, { id: 'barracks', lv: 1 },
        { id: 'fortify_walls', lv: 2 }, { id: 'towers', lv: 2 }, { id: 'reinforce_gate', lv: 2 }, { id: 'barracks', lv: 2 },
        { id: 'fortify_walls', lv: 3 }, { id: 'towers', lv: 3 }, { id: 'reinforce_gate', lv: 3 }, { id: 'barracks', lv: 3 },
      ],
      garrison: 0.85,
      warStage: 8, rush: 1, cooldown: [200, 60], jitter: [0.95, 0.1],
      minTroops: 16, troopStep: 3, minAttackers: 4, maxPush: 300, failWait: 90,
      recallKeep: 0.8, hero: 0,
      defend: { at: 5, hold: 25 },
      wave: { mix: ['archer', 'spearman', 'archer', 'swordsman', 'archer', 'spearman', 'archer', 'swordsman'] },
      verbs: { push: 'opens the gates at last and marches on', fortify_walls: 'thickens the walls of {house}', towers: 'mans the towers of {house}', reinforce_gate: 'iron-bands the gate of {house}' },
    },
  },
  {
    id: 'breaker', kind: 'Siege-lover', epithet: 'the Breaker', tag: 'Breaker',
    blurb: 'Rams and catapults roll out first, with spearmen to guard them.',
    plan: 'Kill the engines before they reach the gate: riders and archers do it best.',
    names: ['Lord Brokk', 'Lord Ulfgar', 'Lord Thrain', 'Lady Hilda', 'Lady Gudrun', 'Lady Ragna'],
    params: {
      mix: [0.2, 0.65],
      elites: [knight(500, 5, 0.2)],
      siege: null,
      giant: { stage: 4, gold: 2000 },
      upgrades: ['training', 'levies', 'training'],
      goals: [{ id: 'engine', n: 2, from: 1 }, { id: 'engine', n: 3, from: 4 }],
      goalGap: 45, garrison: 0.7,
      warStage: 3, rush: 1, cooldown: [30, 30], jitter: [0.95, 0.1],
      minTroops: 8, troopStep: 3, needEngines: 1,
      pushBuy: { ram: 350, catapult: [2, 600], giant: [4, 2000] },
      wave: { mix: ['spearman', 'spearman', 'swordsman', 'spearman', 'archer', 'spearman', 'spearman', 'swordsman'] },
      verbs: { push: 'rolls a siege train toward', ram: 'sends a battering ram against', catapult: 'sends a catapult against' },
    },
  },
  {
    id: 'raider', kind: 'Raider', epithet: 'the Swift', tag: 'Swift',
    blurb: 'Fast riders raid the weakest house again and again.',
    plan: 'Keep archers on the wall and your own riders at hand: raiders flee from a fight they cannot win.',
    names: ['Lord Corvin', 'Lord Tarn', 'Lord Wulfric', 'Lady Sable', 'Lady Rhiannon', 'Lady Ysmay'],
    params: {
      reserve: [60, 80], recruitMin: 40, barracks: 300,
      mix: [0.5, 0.65],
      elites: [rider(120, 0, 0.7), lancer(500, 3, 0.3), knight(450, 5, 0.1)],
      siege: null, giant: null,
      upgradeGold: 600, upgrades: ['training', 'levies'],
      warStage: 1, rush: 0, cooldown: [20, 20], jitter: [0.95, 0.1],
      minTroops: 3, troopStep: 6, minAttackers: 2, maxPush: 50, failWait: 25, winWait: 15,
      recallKeep: 0.35, recallGate: false,
      sendKinds: ['cavalry'], sendShare: 0, order: 'charge', redirect: false, hero: 0,
      pushBuy: { ram: null, catapult: null, giant: null },
      aim: { troops: 25, gate: 40, keep: 80, dist: 1.2, noise: 80, human: 0, damaged: 0 },
      wave: { elite: { from: 4, every: 1, type: 'horseman' } },
      verbs: { push: 'sends riders to harry' },
    },
  },
  {
    id: 'merchant', kind: 'Merchant', epithet: 'the Gilded', tag: 'Gilded',
    blurb: 'Out-earns every house and spends it on elite levies and drills.',
    plan: 'Hit early, before the levies and drills pay off: patience favours the Gilded.',
    names: ['Lady Thessaly', 'Lady Marguerite', 'Lady Odalys', 'Lord Cosimo', 'Lord Florian', 'Lord Benno'],
    params: {
      reserve: [150, 250],
      elites: [knight(400, 4, 0.4), rider(450, 4, 0.2)],
      giant: { stage: 5, gold: 2000 },
      goals: [
        { id: 'levies', lv: 1 }, { id: 'training', lv: 1 }, { id: 'barracks', lv: 1 }, { id: 'levies', lv: 2 }, { id: 'training', lv: 2 },
        { id: 'barracks', lv: 2 }, { id: 'levies', lv: 3 }, { id: 'training', lv: 3 }, { id: 'fortify_walls', lv: 1 },
      ],
      garrison: 0.5, tax: 0.35,
      warStage: 6, rush: 1, cooldown: [100, 60], jitter: [0.95, 0.1],
      minTroops: 12, troopStep: 3, minAttackers: 4, maxPush: 260, failWait: 70,
      recallKeep: 0.6, hero: 0.2,
      verbs: { push: 'sends a bought army against', levies: 'hires elite levies for {house}', training: 'pays drill sergeants for {house}' },
    },
  },
  {
    id: 'zealot', kind: 'Zealot', epithet: 'the Vengeful', tag: 'Vengeful',
    blurb: 'Every army, engine and giant marches on you. The other houses are forgotten.',
    plan: 'Keep your gate strong: every army of this lord comes for you, and none for the other houses.',
    names: ['Lord Draven', 'Lord Aldric', 'Lord Mordain', 'Lady Isolde', 'Lady Sigrun', 'Lady Vanya'],
    params: {
      mix: [0.4, 0.62],
      elites: [knight(400, 3, 0.35), rider(300, 3, 0.2), lancer(600, 6, 0.15)],
      warStage: 3, rush: 1, cooldown: [30, 40], jitter: [0.95, 0.1],
      minTroops: 7, troopStep: 3, recallKeep: 0.3, hero: 1,
      lock: 'human',
      aim: { troops: 10, gate: 40, keep: 80, dist: 0.2, noise: 20, human: 100000, damaged: 0 },
      verbs: { push: 'swears vengeance on' },
    },
  },
  {
    id: 'warlord', kind: 'Warlord', epithet: 'the Ironclad', tag: 'Ironclad',
    blurb: 'Few soldiers, but knights and veterans, with the lord at their head.',
    plan: 'Archers and engines hurt plate best; do not meet the iron host in the open.',
    names: ['Lord Gorm', 'Lord Hadrian', 'Lord Roland', 'Lady Brunhild', 'Lady Ingrid', 'Lady Matilda'],
    params: {
      recruitMin: 120,
      mix: [0.3, 0.6],
      elites: [knight(150, 0, 0.5), lancer(550, 5, 0.2), rider(300, 3, 0.15)],
      promote: 150, upgradeGold: 300, upgrades: ['training', 'training', 'levies', 'training'],
      warStage: 5, rush: 1, cooldown: [60, 40], jitter: [0.95, 0.1],
      minTroops: 8, troopStep: 3, minAttackers: 3, hero: 1,
      wave: { elite: { from: 6, every: 3, type: 'knight' } },
      verbs: { push: 'leads the iron host against' },
    },
  },
  {
    id: 'titan', kind: 'Giant-caller', epithet: 'the Giantsworn', tag: 'Giantsworn',
    blurb: 'Saves every coin for giants: a thin guard, then a monster at your gate.',
    plan: 'Kill the giant for 600 gold, or hit the thin guard while the next one is paid for.',
    names: ['Lord Orm', 'Lord Bjorn', 'Lord Thorgest', 'Lady Skadi', 'Lady Hrolla', 'Lady Jarla'],
    params: {
      siege: null, giant: null,
      goals: [{ id: 'giant' }],
      garrison: 0.45, giantGift: 0.5,
      warStage: 5, rush: 1, cooldown: [90, 60], jitter: [0.95, 0.1],
      minTroops: 9, troopStep: 3, minAttackers: 3,
      pushBuy: { ram: 600, catapult: null, giant: null },
      verbs: { push: 'sends the host with a giant against' },
    },
  },
  {
    id: 'opportunist', kind: 'Opportunist', epithet: 'the Cunning', tag: 'Cunning',
    blurb: 'Waits until a castle is broken, then pounces on the wreck.',
    plan: 'Do not leave your gate broken or your keep burning: the Cunning sees it first.',
    names: ['Lord Ulrich', 'Lord Reynard', 'Lord Matthias', 'Lady Vesper', 'Lady Seraphine', 'Lady Morgause'],
    params: {
      reserve: [150, 300],
      elites: [rider(300, 2, 0.3), lancer(550, 4, 0.2), knight(450, 4, 0.2)],
      warStage: 3, rush: 1, cooldown: [60, 60], jitter: [0.95, 0.1],
      minTroops: 9, troopStep: 3, hero: 0.8, failWait: 40,
      pushBuy: { ram: 400, catapult: [2, 700], giant: [4, 1800] },
      pounce: { min: 0.35, by: 9 },
      aim: { troops: 12, gate: 40, keep: 80, dist: 0.3, noise: 30, human: 0, damaged: 900 },
      verbs: { push: 'swoops down on' },
    },
  },
];

export const PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));
for (const p of PERSONAS) p.params = Object.freeze({ ...CLASSIC, ...p.params });

const cache = new Map();
// Who is this? `id` is an option value ('' and 'classic' are the old lord, which has no name of its own: null). The result is shared, do not change it.
//   { id, n, persona, params, title ('Lord'), first ('Varric'), name ('Lord Varric the Reckless'), short ('Varric the Reckless'), tag, kind, blurb, plan }
export function rivalInfo(id) {
  if (typeof id !== 'string' || !id || id === 'classic') return null;
  if (cache.has(id)) return cache.get(id);
  let info = null;
  const m = /^([a-z]+)(\d{0,2})$/.exec(id);
  const persona = m && PERSONA_BY_ID[m[1]];
  if (persona) {
    const n = (Number(m[2] || 0) || 0) % persona.names.length;
    const [title, first] = persona.names[n].split(' ');
    info = {
      id: persona.id, n, persona, params: persona.params, title, first,
      name: `${title} ${first} ${persona.epithet}`, short: `${first} ${persona.epithet}`,
      tag: persona.tag, kind: persona.kind, blurb: persona.blurb, plan: persona.plan,
    };
  }
  cache.set(id, info);
  return info;
}

// a small seeded generator, so that a roll can be repeated from its seed
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Who leads the four houses next battle: four different personalities (index = team), the same four ids for the same seed. `avoid` (the ids of the last
// battle) keeps a house from drawing the personality it just had, so that every match asks for a new plan.
export function rollRivals(seed = Math.floor(Math.random() * 1e9), avoid = null) {
  const r = rng(seed);
  const ids = PERSONAS.map((p) => p.id);
  let pick = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const bag = ids.slice();
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    pick = bag.slice(0, 4);
    const last = (Array.isArray(avoid) ? avoid : []).map((x) => (typeof x === 'string' ? x.replace(/\d+$/, '') : ''));
    if (!pick.some((id, i) => id === last[i])) break;
  }
  return pick.map((id) => id + Math.floor(r() * PERSONA_BY_ID[id].names.length));
}

// The sentence for a lord's push: "Lord Varric the Reckless charges out against House Elden!" (a classic lord keeps "House Varr marches on House Elden!")
export function pushLine(info, targetName) {
  return `${info.name} ${(info.params.verbs && info.params.verbs.push) || 'marches on'} ${targetName}!`;
}

// Soldiers of a wave in a rival's style: his elite replaces a base soldier of the wave (the size of the wave does not change)
export function tuneWave(list, wave, elite) {
  if (!elite || wave < elite.from || (wave - elite.from) % elite.every) return;
  const i = list.findIndex((t) => t === 'swordsman' || t === 'spearman');
  if (i >= 0) list[i] = elite.type;
}
