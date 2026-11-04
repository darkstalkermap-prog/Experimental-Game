// What Renown unlocks. Everything here is a SIDEGRADE or decoration: a banner for your castle and shield, a cloak for your hero, or a different
// capstone talent that is no stronger than the one it stands beside (talents.js, ALT_TALENTS). Nobody who has unlocked nothing is weaker.
// The unlocks come one after another along a TRACK: each costs the Renown shown (counted from the previous unlock, and what you earn beyond it
// carries over), so there is always exactly one "next unlock" to look at, with a bar that only ever fills.
// Plain data, no browser: the progress maths and its tests import it as it is.
import { ALT_TALENTS } from './talents.js';
import { lookRoll, sanitizeRaces } from './races.js';

// banners: the emblem painted on the cloth of your castle and on your shield (emblems.js draws them); the field stays your house colour
export const BANNERS = [
  { id: 'raven', name: 'Raven', blurb: 'A black bird with its wings spread wide.' },
  { id: 'wolf', name: 'Wolf', blurb: 'The head of the grey wolf, ears up.' },
  { id: 'stag', name: 'Stag', blurb: 'A stag\'s head under a crown of antlers.' },
  { id: 'boar', name: 'Boar', blurb: 'A tusked boar, bristling and ready to charge.' },
  { id: 'dragon', name: 'Dragon', blurb: 'A horned dragon, fangs bared.' },
  { id: 'bear', name: 'Bear', blurb: 'The paw of the great bear, claws out.' },
  { id: 'crown', name: 'Crown', blurb: 'A plain crown of gold points.' },
  { id: 'rose', name: 'Rose', blurb: 'A five-petalled rose.' },
];

// sigils every lord may bear from the first match (emblems.js draws them); the banners above are the ones Renown unlocks
export const FREE_SIGILS = [
  { id: 'lion', name: 'Lion' }, { id: 'eagle', name: 'Eagle' }, { id: 'tower', name: 'Tower' }, { id: 'swords', name: 'Crossed Swords' },
  { id: 'cross', name: 'Cross' }, { id: 'sun', name: 'Sun' }, { id: 'crescent', name: 'Crescent' }, { id: 'fleur', name: 'Fleur-de-lis' },
  { id: 'star', name: 'Star' }, { id: 'oak', name: 'Oak' },
];
// The races' own sigils (racesigils.js paints them, each race in its own hand: HANDS), free to every lord. A lord of a race bears the first of
// its set when they choose none, and an AI lord of a race picks one of its set at random (races.js aiSigils). All of them are our own designs.
export const RACE_SIGILS = {
  elf: [
    { id: 'moonleaf', name: 'Moon and Leaf', blurb: 'A crescent moon cradling a long leaf.' },
    { id: 'swanwing', name: 'Swan Wing', blurb: 'A swan\'s wing raised, its feathers fanned.' },
    { id: 'leafstar', name: 'Leaf-ringed Star', blurb: 'A star of nine rays in a ring of leaves.' },
    { id: 'ringarrow', name: 'Arrow and Ring', blurb: 'An arrow flying up through a ring.' },
    { id: 'oakcrown', name: 'Oak Crown', blurb: 'A circlet crowned with oak leaves.' },
    { id: 'hindleap', name: 'Leaping Hind', blurb: 'A hind in mid-leap.' },
  ],
  dwarf: [
    { id: 'anvil', name: 'Anvil and Hammer', blurb: 'A hammer standing on an anvil.' },
    { id: 'peakrune', name: 'Rune Peak', blurb: 'Three peaks, a rune cut in the highest.' },
    { id: 'forge', name: 'Forge Flame', blurb: 'A flame leaping from a hearth.' },
    { id: 'mattocks', name: 'Crossed Mattocks', blurb: 'Two mattocks crossed, blades out.' },
    { id: 'beardface', name: 'Bearded Face', blurb: 'A stern face, the beard in two braids.' },
    { id: 'ingot', name: 'Ingots', blurb: 'Bars of metal stacked.' },
  ],
  orc: [
    { id: 'maw', name: 'Fanged Maw', blurb: 'Gaping jaws full of teeth.' },
    { id: 'cleavers', name: 'Crossed Cleavers', blurb: 'Two broad cleavers crossed.' },
    { id: 'brokenskull', name: 'Broken Skull', blurb: 'A skull split by a blow.' },
    { id: 'waraxe', name: 'Jagged Axe', blurb: 'A war-axe with a toothed bit.' },
    { id: 'clawslash', name: 'Claw Slash', blurb: 'Three slashes torn down the field.' },
    { id: 'tusk', name: 'Great Tusk', blurb: 'A curved tusk bound with a thong.' },
  ],
  undead: [
    { id: 'crownskull', name: 'Crowned Skull', blurb: 'A skull under a crooked crown.' },
    { id: 'eclipse', name: 'Eclipse', blurb: 'A dark moon over the sun, a ring of light.' },
    { id: 'ravenbones', name: 'Raven on Bones', blurb: 'A raven perched on crossed bones.' },
    { id: 'brokensword', name: 'Broken Sword', blurb: 'A sword snapped below the guard.' },
    { id: 'lantern', name: 'Hollow Lantern', blurb: 'A lantern whose light is out.' },
    { id: 'coffincross', name: 'Coffin Cross', blurb: 'A coffin, a cross cut in its lid.' },
  ],
};
// The sigil each castle's AI lord bears: one of its race's set at random ('' for the men, who fly their house's emblem), never from Math.random. The
// host draws them once at the start and sends them with the races (main.js), so every screen flies the same arms.
export const aiSigils = (races) => sanitizeRaces(races).map((r) => (RACE_SIGILS[r] ? RACE_SIGILS[r][lookRoll(RACE_SIGILS[r].length)].id : ''));
// what a guest is sent, made safe: a sigil of the castle's race or nothing
export const sanitizeSigils = (ids, races) => sanitizeRaces(races).map((r, t) => (Array.isArray(ids) && RACE_SIGILS[r] && RACE_SIGILS[r].some((s) => s.id === ids[t]) ? ids[t] : ''));
// how each race paints its sigils (racesigils.js paintInHand): daubed by hand, engraved and gilt, or faded
export const HANDS = { elf: 'gilt', dwarf: 'gilt', orc: 'crude', undead: 'faded' };
const RACE_SIGIL_LIST = Object.entries(RACE_SIGILS).flatMap(([race, l]) => l.map((s) => ({ ...s, race })));
// the race a sigil belongs to (null: a common one)
export const sigilRace = (id) => (RACE_SIGIL_LIST.find((s) => s.id === id) || {}).race || null;
// every sigil a lord can bear ('' is the house's own emblem)
export const SIGIL_IDS = [...FREE_SIGILS.map((s) => s.id), ...BANNERS.map((b) => b.id), ...RACE_SIGIL_LIST.map((s) => s.id)];
export const sigilName = (id) => (FREE_SIGILS.find((s) => s.id === id) || BANNERS.find((b) => b.id === id) || RACE_SIGIL_LIST.find((s) => s.id === id) || { name: 'House' }).name;

// The cut of a banner and what its pole carries (textures.js paints the cloth, upgrades.js builds the standards' poles): each race has two of its
// own, and anyone may fly the classic swallowtail of the men. '' (the default) is the first of the race's own.
export const BANNER_STYLES = [
  { id: 'house', race: 'human', name: 'Swallowtail', blurb: 'The classic cloth of the realm, notched at the foot.' },
  { id: 'pennant', race: 'elf', name: 'Silk Pennant', blurb: 'Long swallow-tailed silk, edged with gilt leaves.' },
  { id: 'leaftail', race: 'elf', name: 'Leaf-tailed Silk', blurb: 'Silk drawn down to one long leaf point.' },
  { id: 'frame', race: 'dwarf', name: 'Iron-framed Square', blurb: 'A square standard held rigid in a riveted frame.' },
  { id: 'stepped', race: 'dwarf', name: 'Stepped Plate', blurb: 'Cut in steps at the foot, banded in bronze.' },
  { id: 'hide', race: 'orc', name: 'Ragged Hide', blurb: 'A stretched hide, torn and laced with thongs.' },
  { id: 'warrag', race: 'orc', name: 'War Rag', blurb: 'Cloth hacked into hanging strips.' },
  { id: 'shroud', race: 'undead', name: 'Tattered Shroud', blurb: 'A grave cloth, holed and rotting.' },
  { id: 'pall', race: 'undead', name: 'Funeral Pall', blurb: 'Five long tongues of mouldering cloth.' },
];
export const BANNER_STYLE_IDS = BANNER_STYLES.map((b) => b.id);
// the cuts open to a lord of race `race`: the race's own two, then the men's
export const stylesFor = (race) => [...BANNER_STYLES.filter((b) => b.race === race && race !== 'human'), BANNER_STYLES[0]];
// the cut a banner is flown in: the one chosen if the race may fly it, else the race's own first
export const bannerStyleOf = (id, race) => { const l = stylesFor(race); return (l.find((b) => b.id === id) || l[0]).id; };
// the sigil a lord of race `race` at castle `team` bears when they choose none: the house's own emblem for the men, one of the race's set otherwise
// (by castle, so two houses of a race differ, as the men's house emblems do)
export const raceDefaultSigil = (race, team = 0) => (RACE_SIGILS[race] ? RACE_SIGILS[race][(team >>> 0) % RACE_SIGILS[race].length].id : '');
// how the field of the arms is divided between the house colour and the second tint (all free)
export const DIVISIONS = [
  { id: 'plain', name: 'Plain' }, { id: 'pale', name: 'Per pale' }, { id: 'fess', name: 'Per fess' }, { id: 'quarterly', name: 'Quarterly' },
  { id: 'bend', name: 'Per bend' }, { id: 'chevron', name: 'Chevron' }, { id: 'saltire', name: 'Per saltire' }, { id: 'bordure', name: 'Bordure' },
];
// the second tint: on a plain field it colours the sigil, on a divided one the other part of the field (all free)
export const TINTS = [
  { id: 'argent', name: 'Silver', hex: 0xefe2b3 }, { id: 'or', name: 'Gold', hex: 0xd9a83a }, { id: 'sable', name: 'Black', hex: 0x24201c },
  { id: 'gules', name: 'Red', hex: 0xa3201f }, { id: 'vert', name: 'Green', hex: 0x2c6a32 }, { id: 'azure', name: 'Blue', hex: 0x2a4f9e },
  { id: 'purpure', name: 'Purple', hex: 0x63307e }, { id: 'tenne', name: 'Orange', hex: 0xc0661e },
];
export const DIVISION_IDS = DIVISIONS.map((d) => d.id), TINT_IDS = TINTS.map((t) => t.id);

// cloaks: seen on your hero by everybody else (in first person you cannot see your own back)
export const CLOAKS = [
  { id: 'crimson', name: 'Crimson Mantle', shape: 'cape.crimson', blurb: 'Deep red wool, edged in gold, with a gold clasp.', ink: ['#8c1f24', '#d8a83a'] },
  { id: 'greenwood', name: 'Greenwood Cloak', shape: 'cape.greenwood', blurb: 'A forest-green travelling cloak with a leather hem.', ink: ['#2f5a34', '#6a4a2a'] },
  { id: 'wolfpelt', name: 'Wolfskin Mantle', shape: 'cape.wolfpelt', blurb: 'Grey wool under a thick collar of wolf fur.', ink: ['#6a6e74', '#cfc8b8'] },
  { id: 'midnight', name: 'Midnight Cape', shape: 'cape.midnight', blurb: 'Dark blue, trimmed in silver.', ink: ['#1c2756', '#c8ced8'] },
];

// the order of the track and what each step costs (Renown from the previous unlock). kind: banner | cloak | capstone (an id of ALT_TALENTS)
export const TRACK = [
  { kind: 'banner', id: 'raven', cost: 250 },
  { kind: 'banner', id: 'wolf', cost: 500 },
  { kind: 'cloak', id: 'crimson', cost: 450 },
  { kind: 'banner', id: 'stag', cost: 500 },
  { kind: 'capstone', id: 'kn_bastion', cost: 500 },
  { kind: 'banner', id: 'boar', cost: 550 },
  { kind: 'cloak', id: 'greenwood', cost: 550 },
  { kind: 'capstone', id: 'mg_snap', cost: 600 },
  { kind: 'capstone', id: 'cl_mercy', cost: 600 },
  { kind: 'banner', id: 'dragon', cost: 650 },
  { kind: 'capstone', id: 'bz_tithe', cost: 650 },
  { kind: 'cloak', id: 'wolfpelt', cost: 700 },
  { kind: 'capstone', id: 'rg_aim', cost: 700 },
  { kind: 'banner', id: 'bear', cost: 750 },
  { kind: 'capstone', id: 'cv_aegis', cost: 750 },
  { kind: 'cloak', id: 'midnight', cost: 800 },
  { kind: 'banner', id: 'crown', cost: 850 },
  { kind: 'banner', id: 'rose', cost: 900 },
];

const BY_KIND = { banner: Object.fromEntries(BANNERS.map((b) => [b.id, b])), cloak: Object.fromEntries(CLOAKS.map((c) => [c.id, c])), capstone: ALT_TALENTS };

// every unlock under one id: 'banner:wolf', 'cloak:crimson', 'capstone:kn_bastion'
export const unlockId = (kind, id) => `${kind}:${id}`;
export const ITEMS = TRACK.map((t, i) => {
  const def = BY_KIND[t.kind][t.id];
  return { key: unlockId(t.kind, t.id), kind: t.kind, id: t.id, cost: t.cost, step: i, name: def.name, blurb: def.blurb || def.desc || '', cls: def.cls || null, def };
});
export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((it) => [it.key, it]));
export const TRACK_TOTAL = ITEMS.reduce((s, it) => s + it.cost, 0);

// the name a player reads: "Wolf banner", "Crimson Mantle", "Bastion Strike (Knight capstone)"
export function itemTitle(it, classNames = null) {
  if (it.kind === 'banner') return `${it.name} banner`;
  if (it.kind === 'cloak') return it.name;
  const cn = classNames && it.cls && classNames[it.cls] ? classNames[it.cls] : it.cls;
  return `${it.name}${cn ? ` (${cn} capstone)` : ''}`;
}

export const KIND_LABEL = { banner: 'Banner', cloak: 'Cloak', capstone: 'Capstone talent' };

// what a player wears, in words ("Wolf banner, Crimson Mantle"; '' for the plain look): the lobby says it beside their name
export function lookText(cos) {
  if (!cos) return '';
  const c = CLOAKS.find((x) => x.id === cos.cloak);
  const st = BANNER_STYLES.find((b) => b.id === cos.bs);
  return [SIGIL_IDS.includes(cos.banner) && `${sigilName(cos.banner)} banner`, st && st.name, c && c.name].filter(Boolean).join(', ');
}
