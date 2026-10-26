// Everything gold can buy. Shared by the player's shop and the rival lords' AI.
import { UNIT_TYPES, SIEGE_TYPES, TROOP_CAP, CASTLE, PLAYER, SPELLS, MANA, PROMOTIONS, RANKS } from './config.js';
import { SWORDS, SHIELDS, BOWS } from './player.js';

const heroLv = (g, f) => (f.isPlayer ? f.player.lv : f.heroLv);

function recruit(type) {
  return {
    id: 'recruit_' + type, tab: 'army', name: UNIT_TYPES[type].name,
    desc: () => {
      const t = UNIT_TYPES[type];
      return `${t.mounted ? 'Mounted' : t.ranged ? 'Ranged' : 'Melee'} · ${t.hp} HP · ${t.dmg} dmg · armour ${t.armor}${t.mounted ? ' · charge bonus' : ''}`;
    },
    cost: () => UNIT_TYPES[type].cost,
    can: (g, f) => {
      if (f.castle.fallen) return 'Castle has fallen';
      if (g.troopCount(f.team) >= f.troopCap) return 'Barracks full';
      return true;
    },
    apply: (g, f) => g.recruit(f, type),
  };
}

export const SHOP = [
  recruit('swordsman'), recruit('spearman'), recruit('archer'), recruit('knight'), recruit('horseman'), recruit('lancer'),
  {
    id: 'barracks', tab: 'army', name: 'Expand Barracks',
    desc: (g, f) => `Troop limit ${f.troopCap} → ${Math.min(TROOP_CAP.max, f.troopCap + TROOP_CAP.step)}`,
    cost: (g, f) => 200 + 120 * ((f.troopCap - TROOP_CAP.start) / TROOP_CAP.step),
    can: (g, f) => (f.troopCap >= TROOP_CAP.max ? 'Maximum size' : true),
    apply: (g, f) => { f.troopCap = Math.min(TROOP_CAP.max, f.troopCap + TROOP_CAP.step); },
  },
  {
    id: 'training', tab: 'army', name: 'Drill Sergeants',
    desc: (g, f) => `Troop HP & damage +15% (level ${f.training} → ${f.training + 1}). Applies to all troops.`,
    cost: (g, f) => 250 * (f.training + 1),
    can: (g, f) => (f.training >= 5 ? 'Fully trained' : true),
    apply: (g, f) => { f.training++; g.applyTraining(f); },
  },

  {
    id: 'promote', tab: 'army', name: 'Promote a Veteran',
    desc: (g, f) => {
      const n = g.promotable(f.team).length;
      return `Raise a rank ${'★'.repeat(RANKS.promoteAt)} soldier to an elite (Swordsman/Spearman → Knight, Archer → Longbowman, Cavalry → Lancer), keeping their rank. ${n} ready.`;
    },
    cost: () => 70,
    can: (g, f) => (f.castle.fallen ? 'Castle has fallen' : g.promotable(f.team).length ? true : 'No veterans ready'),
    apply: (g, f) => g.promote(f),
  },
  {
    id: 'repair_gate', tab: 'castle', name: 'Repair Gate',
    desc: (g, f) => (f.castle.gate.alive ? `Gate ${Math.round(f.castle.gate.hp)}/${Math.round(f.castle.gate.maxHp)}` : 'Rebuild the destroyed gate'),
    cost: (g, f) => (f.castle.gate.alive ? 100 : 250),
    can: (g, f) => {
      const c = f.castle;
      if (c.fallen) return 'Castle has fallen';
      if (c.gate.alive && c.gate.hp >= c.gate.maxHp) return 'Gate is intact';
      if (!c.gate.alive && g.enemyNear(c.gatePos, 8, f.team)) return 'Enemies in the gateway';
      return true;
    },
    apply: (g, f) => f.castle.repairGate(),
  },
  {
    id: 'reinforce_gate', tab: 'castle', name: 'Iron-Banded Gate',
    desc: (g, f) => `Gate max HP +40% (level ${f.castle.gateLevel}/3) and full repair`,
    cost: (g, f) => 250 * (f.castle.gateLevel + 1),
    can: (g, f) => (f.castle.fallen ? 'Castle has fallen' : f.castle.gateLevel >= 3 ? 'Maximum' : (!f.castle.gate.alive ? 'Rebuild the gate first' : true)),
    apply: (g, f) => { f.castle.gateLevel++; f.castle.repairGate(); },
  },
  {
    id: 'repair_walls', tab: 'castle', name: 'Mason Crew',
    desc: (g, f) => {
      const dead = f.castle.walls.filter((w) => !w.alive).length;
      return dead ? `Rebuild ${dead} breached wall section(s) and repair all walls` : 'Repair all wall damage';
    },
    cost: () => 200,
    can: (g, f) => {
      const c = f.castle;
      if (c.fallen) return 'Castle has fallen';
      if (!c.walls.some((w) => w.breakable && w.hp < w.maxHp)) return 'Walls are intact';
      for (const w of c.walls) if (!w.alive && g.enemyNear(w.pos, 7, f.team)) return 'Enemies in the breach';
      return true;
    },
    apply: (g, f) => f.castle.repairWalls(),
  },
  {
    id: 'fortify_walls', tab: 'castle', name: 'Thicken Walls',
    desc: (g, f) => `Wall HP +35% (level ${f.castle.wallLevel}/3) and full repair`,
    cost: (g, f) => 300 * (f.castle.wallLevel + 1),
    can: (g, f) => (f.castle.fallen ? 'Castle has fallen' : f.castle.wallLevel >= 3 ? 'Maximum' : true),
    apply: (g, f) => { f.castle.wallLevel++; f.castle.repairWalls(); },
  },
  {
    id: 'repair_keep', tab: 'castle', name: 'Restore Keep',
    desc: (g, f) => `Keep ${Math.round(f.castle.keep.hp)}/${f.castle.keep.maxHp}. If the keep falls, you cannot respawn.`,
    cost: () => 250,
    can: (g, f) => (f.castle.fallen ? 'Castle has fallen' : f.castle.keep.hp >= f.castle.keep.maxHp ? 'Keep is intact' : true),
    apply: (g, f) => f.castle.repairKeep(),
  },
  {
    id: 'towers', tab: 'castle', name: 'Tower Archers',
    desc: (g, f) => `Corner towers shoot nearby enemies (level ${f.castle.towerLevel}/3)`,
    cost: (g, f) => 350 * (f.castle.towerLevel + 1),
    can: (g, f) => (f.castle.fallen ? 'Castle has fallen' : f.castle.towerLevel >= 3 ? 'Maximum' : true),
    apply: (g, f) => { f.castle.towerLevel++; },
  },

  {
    id: 'vitality', tab: 'hero', name: 'Vitality',
    desc: (g, f) => `Max HP +30 (level ${heroLv(g, f).vitality}/6)`,
    cost: (g, f) => 150 * (heroLv(g, f).vitality + 1),
    can: (g, f) => (heroLv(g, f).vitality >= 6 ? 'Maximum' : true),
    apply: (g, f) => { heroLv(g, f).vitality++; g.refreshHero(f); },
  },
  {
    id: 'strength', tab: 'hero', name: 'Strength',
    desc: (g, f) => `All damage +12% (level ${heroLv(g, f).strength}/6)`,
    cost: (g, f) => 150 * (heroLv(g, f).strength + 1),
    can: (g, f) => (heroLv(g, f).strength >= 6 ? 'Maximum' : true),
    apply: (g, f) => { heroLv(g, f).strength++; g.refreshHero(f); },
  },
  {
    id: 'armor', tab: 'hero', name: 'Heavy Armour',
    desc: (g, f) => `Armour +3 (level ${heroLv(g, f).armor}/6)`,
    cost: (g, f) => 160 * (heroLv(g, f).armor + 1),
    can: (g, f) => (heroLv(g, f).armor >= 6 ? 'Maximum' : true),
    apply: (g, f) => { heroLv(g, f).armor++; g.refreshHero(f); },
  },

  {
    id: 'sword', tab: 'items', name: 'Better Sword', playerOnly: true,
    desc: (g, f) => {
      const lv = f.player.lv.sword;
      return lv >= SWORDS.length - 1 ? `${SWORDS[lv].name} (${SWORDS[lv].dmg} dmg) – the finest blade` : `${SWORDS[lv].name} → ${SWORDS[lv + 1].name} (${SWORDS[lv + 1].dmg} dmg)`;
    },
    cost: (g, f) => [300, 800, 0][f.player.lv.sword],
    can: (g, f) => (f.player.lv.sword >= SWORDS.length - 1 ? 'Best sword owned' : true),
    apply: (g, f) => { f.player.lv.sword++; f.player.recalc(); },
  },
  {
    id: 'shield', tab: 'items', name: SHIELDS[1].name, playerOnly: true,
    desc: () => `Blocks ${Math.round(SHIELDS[1].block * 100)}% of frontal damage (round shield: ${Math.round(SHIELDS[0].block * 100)}%)`,
    cost: () => 250,
    can: (g, f) => (f.player.lv.shield >= 1 ? 'Owned' : true),
    apply: (g, f) => { f.player.lv.shield = 1; f.player.recalc(); },
  },
  {
    id: 'bow', tab: 'items', name: BOWS[1].name, playerOnly: true,
    desc: () => `${BOWS[1].dmg} dmg and faster draw (hunting bow: ${BOWS[0].dmg})`,
    cost: () => 300,
    can: (g, f) => (f.player.lv.bow >= 1 ? 'Owned' : true),
    apply: (g, f) => { f.player.lv.bow = 1; f.player.recalc(); },
  },
  {
    id: 'horse', tab: 'items', name: 'Warhorse', playerOnly: true,
    desc: () => 'A barded destrier. Press E to mount and dismount, or to whistle for it. Hold Shift to gallop; charging adds damage and tramples foes.',
    cost: () => 400,
    can: (g, f) => (f.player.hasHorse ? 'Owned' : true),
    apply: (g, f) => { f.player.giveHorse(); },
  },
  {
    id: 'arrows', tab: 'items', name: 'Quiver of Arrows', playerOnly: true,
    desc: (g, f) => `+20 arrows (${f.player.arrows}/${PLAYER.maxArrows})`,
    cost: () => 25,
    can: (g, f) => (f.player.arrows >= PLAYER.maxArrows ? 'Quiver full' : true),
    apply: (g, f) => { f.player.arrows = Math.min(PLAYER.maxArrows, f.player.arrows + 20); },
  },
  {
    id: 'potion', tab: 'items', name: 'Healing Draught', playerOnly: true,
    desc: (g, f) => `Restores 130 HP – press Q (${f.player.potions}/3)`,
    cost: () => 60,
    can: (g, f) => (f.player.potions >= 3 ? 'Carrying the maximum' : true),
    apply: (g, f) => { f.player.potions++; },
  },

  {
    id: 'spell_fireball', tab: 'magic', name: SPELLS.fireball.name, playerOnly: true,
    desc: () => `${SPELLS.fireball.desc} ${SPELLS.fireball.cost} mana.`,
    cost: () => SPELLS.fireball.price,
    can: (g, f) => (f.player.spells.includes('fireball') ? 'Learned' : true),
    apply: (g, f) => f.player.learnSpell('fireball'),
  },
  {
    id: 'spell_lightning', tab: 'magic', name: SPELLS.lightning.name, playerOnly: true,
    desc: () => `${SPELLS.lightning.desc} ${SPELLS.lightning.cost} mana.`,
    cost: () => SPELLS.lightning.price,
    can: (g, f) => (f.player.spells.includes('lightning') ? 'Learned' : true),
    apply: (g, f) => f.player.learnSpell('lightning'),
  },
  {
    id: 'spell_ice', tab: 'magic', name: SPELLS.ice.name, playerOnly: true,
    desc: () => `${SPELLS.ice.desc} ${SPELLS.ice.cost} mana.`,
    cost: () => SPELLS.ice.price,
    can: (g, f) => (f.player.spells.includes('ice') ? 'Learned' : true),
    apply: (g, f) => f.player.learnSpell('ice'),
  },
  {
    id: 'arcane', tab: 'magic', name: 'Destruction Mastery', playerOnly: true,
    desc: (g, f) => `All spells deal +25% damage (level ${f.player.lv.magic || 0}/4)`,
    cost: (g, f) => 250 * ((f.player.lv.magic || 0) + 1),
    can: (g, f) => (!f.player.spells.length ? 'Learn a spell first' : (f.player.lv.magic || 0) >= 4 ? 'Maximum' : true),
    apply: (g, f) => { f.player.lv.magic = (f.player.lv.magic || 0) + 1; },
  },
  {
    id: 'mana_pool', tab: 'magic', name: 'Deep Mana Well', playerOnly: true,
    desc: (g, f) => `Max mana ${f.player.manaMax} → ${f.player.manaMax + MANA.perLevel} (level ${f.player.lv.mana || 0}/4)`,
    cost: (g, f) => 200 * ((f.player.lv.mana || 0) + 1),
    can: (g, f) => ((f.player.lv.mana || 0) >= 4 ? 'Maximum' : true),
    apply: (g, f) => { f.player.lv.mana = (f.player.lv.mana || 0) + 1; f.player.mana += MANA.perLevel; },
  },
  {
    id: 'mana_regen', tab: 'magic', name: 'Arcane Recovery', playerOnly: true,
    desc: (g, f) => `Mana regenerates ${Math.round(MANA.regenPerLevel * 100)}% faster (level ${f.player.lv.regen || 0}/3)`,
    cost: (g, f) => 200 * ((f.player.lv.regen || 0) + 1),
    can: (g, f) => ((f.player.lv.regen || 0) >= 3 ? 'Maximum' : true),
    apply: (g, f) => { f.player.lv.regen = (f.player.lv.regen || 0) + 1; },
  },
  {
    id: 'ram', tab: 'siege', name: SIEGE_TYPES.ram.name,
    desc: (g, f) => `${SIEGE_TYPES.ram.hp} HP. Rolls to the target's gate and smashes it, then the keep. Target: ${g.targetName(f)}`,
    cost: () => SIEGE_TYPES.ram.cost,
    can: (g, f) => (f.castle.fallen ? 'Castle has fallen' : !g.siegeTarget(f) ? 'No target' : g.siegeCount(f.team) >= 4 ? 'Too many engines' : true),
    apply: (g, f) => g.buildSiege(f, 'ram'),
  },
  {
    id: 'catapult', tab: 'siege', name: SIEGE_TYPES.catapult.name,
    desc: (g, f) => `${SIEGE_TYPES.catapult.hp} HP. Bombards walls from ${SIEGE_TYPES.catapult.range}m to open breaches. Target: ${g.targetName(f)}`,
    cost: () => SIEGE_TYPES.catapult.cost,
    can: (g, f) => (f.castle.fallen ? 'Castle has fallen' : !g.siegeTarget(f) ? 'No target' : g.siegeCount(f.team) >= 4 ? 'Too many engines' : true),
    apply: (g, f) => g.buildSiege(f, 'catapult'),
  },
];

export const SHOP_BY_ID = Object.fromEntries(SHOP.map((i) => [i.id, i]));

// Returns true on success, or a string reason.
export function buy(g, f, id) {
  const item = SHOP_BY_ID[id];
  if (!item) return 'Unknown item';
  if (item.playerOnly && !f.isPlayer) return 'Not available';
  const ok = item.can(g, f);
  if (ok !== true) return ok;
  const cost = Math.round(item.cost(g, f));
  if (f.gold < cost) return 'Not enough gold';
  f.gold -= cost;
  item.apply(g, f);
  f.spent += cost;
  return true;
}

export { CASTLE };
