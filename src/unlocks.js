// What Renown unlocks. Everything here is a SIDEGRADE or decoration: a banner for your castle and shield, a cloak for your hero, or a different
// capstone talent that is no stronger than the one it stands beside (talents.js, ALT_TALENTS). Nobody who has unlocked nothing is weaker.
// The unlocks come one after another along a TRACK: each costs the Renown shown (counted from the previous unlock, and what you earn beyond it
// carries over), so there is always exactly one "next unlock" to look at, with a bar that only ever fills.
// Plain data, no browser: the progress maths and its tests import it as it is.
import { ALT_TALENTS } from './talents.js';

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
