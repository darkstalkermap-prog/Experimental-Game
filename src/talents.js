// Talent trees: a small tree for every hero class, bought with the points that come with each level after the first.
//
// A talent costs one point. Its tier t needs hero level t + 1, and `needs` (the talent above it, null for the two at the
// top of a tree) must be learnt first. Every tree has two branches, one for each ability (br: 'q' or 'r'), three tiers
// deep, and a capstone at tier 4 under one of them. Four points (level 5) cannot buy a tree, so the choices matter.
//
// A talent changes the hero in one of two ways, or both:
//   mods  the numbers every hero has (the keys of CLASSES[id].mods): { mul: { key: factor }, add: { key: amount } }.
//         heroes.js adds them to the class numbers.
//   fx    a change to one ability or rule, read by the ability code with talentFx(p, key, default). A number is either a
//         multiplier (default 1) or an amount to add (default 0), as its comment says. Each key belongs to one talent.
// Every number is in TUNE, and the descriptions are built from it, so the text always matches the game.

export const TUNE = {
  knight: {
    tossDmg: 0.25,         // Spiked Boss: more Shield Throw damage
    tossStun: 0.6,         // Skull Rattler: seconds added to the stun
    tossHits: 1,           // Ricochet: foes added to the bounce ...
    tossReach: 4,          //   ... metres added to the bounce's reach ...
    tossCd: 0.2,           //   ... and a quicker recharge
    hp: 0.12, armor: 2,    // Tempered Plate
    dareTime: 1,           // Hold the Line: seconds added to Challenge ...
    dareWrath: 1.5,        //   ... and blows blocked while it lasts fill Wrath this much faster
    dareRadius: 4,         // Phalanx: metres added to Challenge's reach ...
    dareAlly: { radius: 8, cut: 0.25 },   //   ... and the allies this near take this much less damage while it lasts
    reflect: 0.4,          // Avenging Wall: the share of a melee blow dealt back to the attacker while Challenge lasts
    bastion: { share: 0.3, radius: 5, stun: 0.5 },   // Bastion Strike (alternative to Avenging Wall): this share of every melee blow taken under Challenge is stored, and when it ends the shield slams down: the store strikes the foes within this reach (shared between them) and staggers them. Avenging Wall hands back 40% at once, to the one who struck; the slam comes to about the same in all
  },
  berserker: {
    execBelow: 0.07,       // Headsman: Execute finishes foes below this much more of their health (on top of 25%)
    rageGain: 0.25,        // Seething Blood: Rage fills this much faster ...
    rageEbb: 0.5,          //   ... and ebbs this much slower once the fighting stops
    spinCost: 0.25,        // Dervish: Whirlwind drains this much less Rage a second ...
    whirlRadius: 0.2,      //   ... reaches this much further, and no longer slows you
    reaper: 0.006,         // Reaper: the share of your health each cut of a Whirlwind heals per foe it hits ...
    reaperFoes: 4,         //   ... for up to this many foes a cut (about three cuts a second)
    leapRadius: 0.3,       // Earthshaker: a wider slam when a Leap lands ...
    leapStun: 0.4,         //   ... that staggers for this many seconds longer
    bloodied: 0.1,         // Battle Scars: the damage bonus below half health ...
    hp: 0.1,               //   ... and health
    leapDmg: 0.3,          // Death from Above: a harder slam ...
    leapCd: 0.25,          //   ... and a quicker recharge
    tithe: 0.08,           // Blood Tithe (alternative to Reaper): the share of your health each kill of an Execute gives back
  },
  ranger: {
    headshot: 0.5,         // Eagle Eye: added to the headshot's double damage ...
    headshotHero: 0.35,    //   ... and to its 1.5x into a hero
    pierce: [0.85, 0.7, 0.5],   // Bodkin Points: what a fully drawn arrow deals to the second, third and fourth body it goes into (70% and 50% without it, and no fourth)
    qDmg: 0.25, qCd: 0.25, // Heavy Draw: Power Shot (or the Volley) hits harder and recharges sooner
    speed: 0.06, draw: 0.1,        // Fleet-Footed: faster on foot, and the bow draws quicker
    scope: { fov: 0.65, settle: 0.5, sway: 0.6 },   // Hawk's Scope: Sniper Shot zooms in to this share of the field of view, steadies in this share of the time and sways this much
    snipeDmg: 0.3, snipeCd: 0.25,  // Deadeye: Sniper Shot hits harder and recharges sooner ...
    snipePierce: [0.7],    //   ... and goes on through the first body into one more, for this share of the damage
    aim: { draw: 0.75, speed: 1.25 },   // Steady Aim (alternative to Arrow Volley): zoomed in (right mouse), the bow draws in this share of the time and the arrow flies this much faster
  },
  mage: {
    fireRadius: 0.2,       // Greater Blast: wider explosions
    burn: { share: 0.4, time: 3, tick: 0.5 },   // Searing Flames: the share of a blast's damage that burns on over this many seconds
    fork: 0.5,             // Forked Flame: the second fireball's share of the first one's damage
    hp: 0.15, armor: 1,    // Warded Robes
    wardAbsorb: 0.25,      // Rime Shell: more damage soaked ...
    wardTime: 2,           //   ... for longer
    wardRadius: 0.4,       // Glacial Burst: a wider chill ...
    wardChill: 2,          //   ... that slows for longer ...
    wardStun: 0.5,         //   ... and staggers for longer
    shatter: { dmg: 90, radius: 6, stun: 1, chill: 3 },   // Shatter: when the ward breaks, a frost burst (damage, reach, stagger, chill)
    snap: { time: 6, dmg: 1.5 },   // Cold Snap (alternative to Shatter): when the ward breaks, the next Fireball within this many seconds hits this much harder
  },
  cleric: {
    smiteRadius: 0.2,      // Holy Wrath: a wider blast
    chain: { foes: 2, dmg: 0.5, range: 8 },   // Chain Smite: the bolt arcs on to this many foes within this many metres, for this share of the damage
    smiteStun: 0.8,        // Judgement: seconds added to the stagger ...
    smiteCd: 0.2,          //   ... and a quicker recharge
    hp: 0.1, regen: 0.4,   // Gentle Grace
    healMul: 0.25,         // Radiance: more healing ...
    healRadius: 4,         //   ... reaching metres further
    aegis: { cut: 0.25, time: 5 },     // Divine Aegis: those healed take this much less damage for this long
    pulse: { delay: 3, scale: 0.6 },   // Second Dawn: a second heal after this many seconds, at this share of the first
    mercy: { below: 0.4, more: 0.6 },  // Mercy (alternative to Second Dawn): allies below this share of their health are healed this much more
  },
  cavalier: {
    sweepDmg: 0.25,        // Keen Edge: Sweeping Strike cuts harder
    sweepReach: 0.8,       // Wide Sweep: metres added to its reach ...
    sweepTime: 0.4,        //   ... and seconds to how long it lasts
    rhythm: { per: 0.5, max: 3 },   // Rider's Rhythm: seconds off Lance Charge's recharge for every foe a Sweeping Strike cuts, at most this much a strike
    chargeDmg: 0.2,        // Couched Lance: harder charges
    momentum: 0.15, momRise: 0.5,   // Born to the Saddle: Momentum's top bonus is this much higher, and it builds this much faster
    chargeSpeed: 0.2,      // Thundering Hooves: a faster charge
    rush: { radius: 20, time: 5, speed: 1.25 },   // Vanguard!: allies this near ride with you, this much faster, for this long
    shieldwall: { radius: 20, time: 5, cut: 0.2 },   // Shieldwall Charge (alternative to Vanguard!): allies this near, and you, take this much less damage for this long
  },
};

const pc = (x) => `${Math.round(x * 100)}%`;
const K = TUNE.knight, Z = TUNE.berserker, R = TUNE.ranger, M = TUNE.mage, C = TUNE.cleric, V = TUNE.cavalier;

export const TALENTS = [
  // ---------- Knight: Shield Throw | Challenge (the capstone is under Phalanx) ----------
  { id: 'kn_boss', cls: 'knight', br: 'q', tier: 1, needs: null, icon: '🔩', name: 'Spiked Boss',
    desc: `Shield Throw hits ${pc(K.tossDmg)} harder.`, fx: { tossDmg: 1 + K.tossDmg } },
  { id: 'kn_rattle', cls: 'knight', br: 'q', tier: 2, needs: 'kn_boss', icon: '💫', name: 'Skull Rattler',
    desc: `Shield Throw stuns for ${K.tossStun} s longer.`, fx: { tossStun: K.tossStun } },
  { id: 'kn_ricochet', cls: 'knight', br: 'q', tier: 3, needs: 'kn_rattle', icon: '↯', name: 'Ricochet',
    desc: `Shield Throw bounces to ${K.tossHits === 1 ? 'one more enemy' : `${K.tossHits} more enemies`}, ${K.tossReach} m further, and recharges ${pc(K.tossCd)} sooner.`,
    fx: { tossHits: K.tossHits, tossReach: K.tossReach, cd_shieldthrow: 1 - K.tossCd } },
  { id: 'kn_plate', cls: 'knight', br: 'r', tier: 1, needs: null, icon: '⛓', name: 'Tempered Plate',
    desc: `+${pc(K.hp)} health and +${K.armor} armour.`, mods: { mul: { hp: 1 + K.hp }, add: { armor: K.armor } } },
  { id: 'kn_hold', cls: 'knight', br: 'r', tier: 2, needs: 'kn_plate', icon: '🏰', name: 'Hold the Line',
    desc: `Challenge lasts ${K.dareTime} s longer, and blows you block while it lasts fill your Wrath ${pc(K.dareWrath - 1)} faster.`, fx: { dareTime: K.dareTime, dareWrath: K.dareWrath } },
  { id: 'kn_phalanx', cls: 'knight', br: 'r', tier: 3, needs: 'kn_hold', icon: '🛡', name: 'Phalanx',
    desc: `Challenge reaches ${K.dareRadius} m further, and allies within ${K.dareAlly.radius} m of you take ${pc(K.dareAlly.cut)} less damage while it lasts.`,
    fx: { dareRadius: K.dareRadius, dareAlly: K.dareAlly } },
  { id: 'kn_avenge', cls: 'knight', br: 'r', tier: 4, needs: 'kn_phalanx', icon: '⚔', name: 'Avenging Wall',
    desc: `While Challenge lasts, a melee attacker takes ${pc(K.reflect)} of the blow back.`, fx: { reflect: K.reflect } },

  // ---------- Berserker: Execute and Rage | Leap (the capstone is under Dervish) ----------
  { id: 'bz_headsman', cls: 'berserker', br: 'q', tier: 1, needs: null, icon: '🪓', name: 'Headsman',
    desc: `Execute finishes foes below ${pc(0.25 + Z.execBelow)} health instead of 25%.`, fx: { execBelow: Z.execBelow } },
  { id: 'bz_seethe', cls: 'berserker', br: 'q', tier: 2, needs: 'bz_headsman', icon: '🔥', name: 'Seething Blood',
    desc: `Rage fills ${pc(Z.rageGain)} faster and ebbs ${pc(Z.rageEbb)} slower once you stop fighting.`, fx: { rageGain: 1 + Z.rageGain, rageEbb: 1 - Z.rageEbb } },
  { id: 'bz_dervish', cls: 'berserker', br: 'q', tier: 3, needs: 'bz_seethe', icon: '🌀', name: 'Dervish',
    desc: `Whirlwind drains ${pc(Z.spinCost)} less Rage, reaches ${pc(Z.whirlRadius)} further and no longer slows you.`, fx: { spinCost: 1 - Z.spinCost, whirlRadius: 1 + Z.whirlRadius, whirlSlow: 0 } },
  { id: 'bz_reaper', cls: 'berserker', br: 'q', tier: 4, needs: 'bz_dervish', icon: '☠', name: 'Reaper',
    desc: `Every cut of a Whirlwind heals you for ${Math.round(Z.reaper * 1000) / 10}% of your health for each foe it hits (up to ${Z.reaperFoes} a cut).`,
    fx: { reaper: { heal: Z.reaper, foes: Z.reaperFoes } } },
  { id: 'bz_quake', cls: 'berserker', br: 'r', tier: 1, needs: null, icon: '💥', name: 'Earthshaker',
    desc: `A Leap's landing slams ${pc(Z.leapRadius)} wider and staggers ${Z.leapStun} s longer.`, fx: { leapRadius: 1 + Z.leapRadius, leapStun: Z.leapStun } },
  { id: 'bz_scars', cls: 'berserker', br: 'r', tier: 2, needs: 'bz_quake', icon: '💢', name: 'Battle Scars',
    desc: `+${pc(Z.hp)} health, and below half health you hit ${pc(Z.bloodied)} harder still.`,
    mods: { mul: { hp: 1 + Z.hp }, add: { bloodied: Z.bloodied } } },
  { id: 'bz_meteor', cls: 'berserker', br: 'r', tier: 3, needs: 'bz_scars', icon: '☄', name: 'Death from Above',
    desc: `A Leap's slam hits ${pc(Z.leapDmg)} harder, and Leap recharges ${pc(Z.leapCd)} sooner.`, fx: { leapDmg: 1 + Z.leapDmg, cd_leap: 1 - Z.leapCd } },

  // ---------- Ranger: headshots, piercing and Power Shot | Sniper Shot (the capstone, Arrow Volley in Power Shot's place, is under Heavy Draw) ----------
  { id: 'rg_eagle', cls: 'ranger', br: 'q', tier: 1, needs: null, icon: '👁', name: 'Eagle Eye',
    desc: `Headshots deal ${R.headshot + 2}x damage instead of 2x (${R.headshotHero + 1.5}x into a hero instead of 1.5x).`, fx: { headshot: R.headshot, headshotHero: R.headshotHero } },
  { id: 'rg_bodkin', cls: 'ranger', br: 'q', tier: 2, needs: 'rg_eagle', icon: '🗡', name: 'Bodkin Points',
    desc: `A fully drawn arrow goes on into ${R.pierce.length} bodies behind the first instead of two, at ${R.pierce.map(pc).join(', ')} of its damage.`, fx: { pierce: R.pierce } },
  { id: 'rg_heavy', cls: 'ranger', br: 'q', tier: 3, needs: 'rg_bodkin', icon: '💪', name: 'Heavy Draw',
    desc: `Power Shot (or Arrow Volley) hits ${pc(R.qDmg)} harder and recharges ${pc(R.qCd)} sooner.`,
    fx: { powerDmg: 1 + R.qDmg, volleyDmg: 1 + R.qDmg, cd_powershot: 1 - R.qCd, cd_volley: 1 - R.qCd } },
  { id: 'rg_volley', cls: 'ranger', br: 'q', tier: 4, needs: 'rg_heavy', icon: '🌧', name: 'Arrow Volley',
    desc: 'Q becomes Arrow Volley instead of Power Shot: hold Q to put a circle on the ground, let go and a volley of arrows rains down on it.', fx: { volleyQ: true } },
  { id: 'rg_light', cls: 'ranger', br: 'r', tier: 1, needs: null, icon: '👢', name: 'Fleet-Footed',
    desc: `+${pc(R.speed)} speed, and the bow draws ${pc(R.draw)} faster.`, mods: { mul: { speed: 1 + R.speed, draw: 1 - R.draw } } },
  { id: 'rg_hawk', cls: 'ranger', br: 'r', tier: 2, needs: 'rg_light', icon: '🦅', name: "Hawk's Scope",
    desc: `Sniper Shot zooms in ${pc(1 - R.scope.fov)} further, steadies ${pc(1 - R.scope.settle)} sooner and sways ${pc(1 - R.scope.sway)} less.`, fx: { scope: R.scope } },
  { id: 'rg_deadeye', cls: 'ranger', br: 'r', tier: 3, needs: 'rg_hawk', icon: '🎯', name: 'Deadeye',
    desc: `Sniper Shot hits ${pc(R.snipeDmg)} harder, recharges ${pc(R.snipeCd)} sooner and goes on through the first body into one more (${pc(R.snipePierce[0])}).`,
    fx: { snipeDmg: 1 + R.snipeDmg, cd_snipe: 1 - R.snipeCd, snipePierce: R.snipePierce } },

  // ---------- Mage: Fireball | Frost Ward (the capstone is under Glacial Burst) ----------
  { id: 'mg_blast', cls: 'mage', br: 'q', tier: 1, needs: null, icon: '💥', name: 'Greater Blast',
    desc: `Fireballs burst ${pc(M.fireRadius)} wider.`, fx: { fireRadius: 1 + M.fireRadius } },
  { id: 'mg_sear', cls: 'mage', br: 'q', tier: 2, needs: 'mg_blast', icon: '🔥', name: 'Searing Flames',
    desc: `Foes caught in a blast burn for ${pc(M.burn.share)} more of its damage over ${M.burn.time} s.`, fx: { burn: M.burn } },
  { id: 'mg_fork', cls: 'mage', br: 'q', tier: 3, needs: 'mg_sear', icon: '🔱', name: 'Forked Flame',
    desc: `Every Fireball is followed by a second at ${pc(M.fork)} strength.`, fx: { fireFork: M.fork } },
  { id: 'mg_robes', cls: 'mage', br: 'r', tier: 1, needs: null, icon: '🧥', name: 'Warded Robes',
    desc: `+${pc(M.hp)} health and +${M.armor} armour.`, mods: { mul: { hp: 1 + M.hp }, add: { armor: M.armor } } },
  { id: 'mg_rime', cls: 'mage', br: 'r', tier: 2, needs: 'mg_robes', icon: '❄', name: 'Rime Shell',
    desc: `Frost Ward soaks ${pc(M.wardAbsorb)} more damage and lasts ${M.wardTime} s longer.`, fx: { wardAbsorb: 1 + M.wardAbsorb, wardTime: M.wardTime } },
  { id: 'mg_glacier', cls: 'mage', br: 'r', tier: 3, needs: 'mg_rime', icon: '🌨', name: 'Glacial Burst',
    desc: `Frost Ward chills ${pc(M.wardRadius)} further, for ${M.wardChill} s longer, and staggers for ${M.wardStun} s more.`,
    fx: { wardRadius: 1 + M.wardRadius, wardChill: M.wardChill, wardStun: M.wardStun } },
  { id: 'mg_shatter', cls: 'mage', br: 'r', tier: 4, needs: 'mg_glacier', icon: '💎', name: 'Shatter',
    desc: `When the ward breaks it bursts: ${M.shatter.dmg} damage, a stagger and a chill on the foes around you.`, fx: { shatter: M.shatter } },

  // ---------- Cleric: Smite | Healing Light (the capstone is under Divine Aegis) ----------
  { id: 'cl_wrath', cls: 'cleric', br: 'q', tier: 1, needs: null, icon: '⚡', name: 'Holy Wrath',
    desc: `Smite strikes a ${pc(C.smiteRadius)} wider area.`, fx: { smiteRadius: 1 + C.smiteRadius } },
  { id: 'cl_chain', cls: 'cleric', br: 'q', tier: 2, needs: 'cl_wrath', icon: '🔗', name: 'Chain Smite',
    desc: `The bolt arcs on to ${C.chain.foes} more foes near the blast, for ${pc(C.chain.dmg)} of the damage.`, fx: { smiteChain: C.chain } },
  { id: 'cl_judge', cls: 'cleric', br: 'q', tier: 3, needs: 'cl_chain', icon: '⚖', name: 'Judgement',
    desc: `Smite staggers for ${C.smiteStun} s longer and recharges ${pc(C.smiteCd)} sooner.`, fx: { smiteStun: C.smiteStun, cd_smite: 1 - C.smiteCd } },
  { id: 'cl_grace', cls: 'cleric', br: 'r', tier: 1, needs: null, icon: '🌿', name: 'Gentle Grace',
    desc: `+${pc(C.hp)} health and ${pc(C.regen)} faster regeneration.`, mods: { mul: { hp: 1 + C.hp, regen: 1 + C.regen } } },
  { id: 'cl_radiance', cls: 'cleric', br: 'r', tier: 2, needs: 'cl_grace', icon: '☀', name: 'Radiance',
    desc: `Healing Light heals ${pc(C.healMul)} more and reaches ${C.healRadius} m further.`, fx: { healMul: 1 + C.healMul, healRadius: C.healRadius } },
  { id: 'cl_aegis', cls: 'cleric', br: 'r', tier: 3, needs: 'cl_radiance', icon: '🔰', name: 'Divine Aegis',
    desc: `Everyone Healing Light heals takes ${pc(C.aegis.cut)} less damage for ${C.aegis.time} s.`, fx: { aegis: C.aegis } },
  { id: 'cl_bloom', cls: 'cleric', br: 'r', tier: 4, needs: 'cl_aegis', icon: '🌅', name: 'Second Dawn',
    desc: `Healing Light pulses again ${C.pulse.delay} s later at ${pc(C.pulse.scale)} strength.`, fx: { healPulse: C.pulse } },

  // ---------- Cavalier: Sweeping Strike | Lance Charge (the capstone is under Thundering Hooves) ----------
  { id: 'cv_edge', cls: 'cavalier', br: 'q', tier: 1, needs: null, icon: '🗡', name: 'Keen Edge',
    desc: `Sweeping Strike cuts ${pc(V.sweepDmg)} harder.`, fx: { sweepDmg: 1 + V.sweepDmg } },
  { id: 'cv_sweep', cls: 'cavalier', br: 'q', tier: 2, needs: 'cv_edge', icon: '🌊', name: 'Wide Sweep',
    desc: `Sweeping Strike reaches ${V.sweepReach} m further and lasts ${V.sweepTime} s longer.`, fx: { sweepReach: V.sweepReach, sweepTime: V.sweepTime } },
  { id: 'cv_rhythm', cls: 'cavalier', br: 'q', tier: 3, needs: 'cv_sweep', icon: '🥁', name: "Rider's Rhythm",
    desc: `Every foe a Sweeping Strike cuts takes ${V.rhythm.per} s off Lance Charge's recharge (up to ${V.rhythm.max} s a strike).`, fx: { sweepRhythm: V.rhythm } },
  { id: 'cv_lance', cls: 'cavalier', br: 'r', tier: 1, needs: null, icon: '🔱', name: 'Couched Lance',
    desc: `Lance Charge hits ${pc(V.chargeDmg)} harder.`, fx: { chargeDmg: 1 + V.chargeDmg } },
  { id: 'cv_saddle', cls: 'cavalier', br: 'r', tier: 2, needs: 'cv_lance', icon: '🐴', name: 'Born to the Saddle',
    desc: `Momentum builds ${pc(V.momRise)} faster and its bonus at a full gallop is ${pc(V.momentum)} higher.`, fx: { momRise: 1 + V.momRise }, mods: { add: { momentum: V.momentum } } },
  { id: 'cv_thunder', cls: 'cavalier', br: 'r', tier: 3, needs: 'cv_saddle', icon: '🐎', name: 'Thundering Hooves',
    desc: `Lance Charge goes ${pc(V.chargeSpeed)} faster.`, fx: { chargeSpeed: 1 + V.chargeSpeed } },
  { id: 'cv_vanguard', cls: 'cavalier', br: 'r', tier: 4, needs: 'cv_thunder', icon: '🚩', name: 'Vanguard!',
    desc: `Allies within ${V.rush.radius} m ride with you: ${pc(V.rush.speed - 1)} faster for ${V.rush.time} s when you charge.`, fx: { chargeRush: V.rush } },
];

// Alternate capstones: Renown unlocks (unlocks.js), one for each class. Each stands in the capstone's own place in the tree (same level, same talent above
// it, `alt` names the capstone it replaces), costs the same one point and is a sidegrade: a different effect that is no bigger than the original's, so
// choosing it is a matter of taste and never of power. A hero has one or the other (they cannot be learnt together), and Respec lets them change their mind.
// They are kept out of TALENTS (and talentsOf) on purpose: everything that walks "the tree" (bots, the practice yard's All talents) stays as it was.
export const ALT_TALENTS = {
  kn_bastion: { id: 'kn_bastion', cls: 'knight', br: 'r', tier: 4, needs: 'kn_phalanx', alt: 'kn_avenge', icon: '🔨', name: 'Bastion Strike',
    desc: `While Challenge lasts ${pc(K.bastion.share)} of every melee blow you take is stored. When it ends the shield slams down and the store strikes the foes within ${K.bastion.radius} m, staggering them for ${K.bastion.stun} s.`, fx: { bulwarkWave: K.bastion } },
  bz_tithe: { id: 'bz_tithe', cls: 'berserker', br: 'q', tier: 4, needs: 'bz_dervish', alt: 'bz_reaper', icon: '🍷', name: 'Blood Tithe',
    desc: `Every foe your Execute kills heals you for ${pc(Z.tithe)} of your health.`, fx: { tithe: Z.tithe } },
  rg_aim: { id: 'rg_aim', cls: 'ranger', br: 'q', tier: 4, needs: 'rg_heavy', alt: 'rg_volley', icon: '🔭', name: 'Steady Aim',
    desc: `Zoomed in (right mouse), your bow draws ${pc(1 - R.aim.draw)} faster and your arrows fly ${pc(R.aim.speed - 1)} faster. Power Shot stays your Q.`, fx: { zoomDraw: R.aim.draw, zoomSpeed: R.aim.speed } },
  mg_snap: { id: 'mg_snap', cls: 'mage', br: 'r', tier: 4, needs: 'mg_glacier', alt: 'mg_shatter', icon: '💠', name: 'Cold Snap',
    desc: `When the ward breaks, your next Fireball within ${M.snap.time} s hits ${pc(M.snap.dmg - 1)} harder.`, fx: { snap: M.snap } },
  cl_mercy: { id: 'cl_mercy', cls: 'cleric', br: 'r', tier: 4, needs: 'cl_aegis', alt: 'cl_bloom', icon: '🙏', name: 'Mercy',
    desc: `Healing Light heals those below ${pc(C.mercy.below)} health ${pc(C.mercy.more)} more.`, fx: { mercy: C.mercy } },
  cv_aegis: { id: 'cv_aegis', cls: 'cavalier', br: 'r', tier: 4, needs: 'cv_thunder', alt: 'cv_vanguard', icon: '🐴', name: 'Shieldwall Charge',
    desc: `Allies within ${V.shieldwall.radius} m, and you, take ${pc(V.shieldwall.cut)} less damage for ${V.shieldwall.time} s when you charge.`, fx: { chargeGuard: V.shieldwall } },
};
export const altsOf = (cls) => Object.values(ALT_TALENTS).filter((t) => t.cls === cls);
const ALT_OF = {};   // capstone id -> the ids of its alternates
for (const a of Object.values(ALT_TALENTS)) (ALT_OF[a.alt] || (ALT_OF[a.alt] = [])).push(a.id);

export const TALENT_BY_ID = Object.fromEntries([...TALENTS, ...Object.values(ALT_TALENTS)].map((t) => [t.id, t]));
export const talentsOf = (cls) => TALENTS.filter((t) => t.cls === cls);
export const tierLevel = (tier) => tier + 1;   // the hero level a tier needs

export const hasTalent = (p, id) => !!(p.talents && p.talents[id]);

// What a learnt talent changes about an ability or a rule: the value its fx gives for `key`, else `def` (1 for a
// multiplier, 0 for an amount to add).
export function talentFx(p, key, def) {
  const have = p && p.talents;
  if (have) for (const id in have) { const f = TALENT_BY_ID[id]?.fx; if (f && key in f) return f[key]; }
  return def;
}

// The numbers the hero's talents add to the class: { mul: { key: factor }, add: { key: amount } } (see heroes.js)
export function treeMods(p) {
  const out = { mul: {}, add: {} };
  for (const id in p.talents || {}) {
    const m = TALENT_BY_ID[id]?.mods;
    if (!m) continue;
    for (const k in m.mul) out.mul[k] = (out.mul[k] ?? 1) * m.mul[k];
    for (const k in m.add) out.add[k] = (out.add[k] ?? 0) + m.add[k];
  }
  return out;
}

// Why a talent cannot be learnt yet because of the hero's level or the talent above it (null when neither stops it).
export function talentLock(p, id) {
  const t = TALENT_BY_ID[id];
  if (!t) return 'No such talent';
  if (t.cls !== p.classId) return `A talent of the ${t.cls}`;
  if (p.level < tierLevel(t.tier)) return `Needs level ${tierLevel(t.tier)}`;
  if (t.needs && !hasTalent(p, t.needs)) return `Needs ${TALENT_BY_ID[t.needs].name}`;
  if (t.alt && !altEarned(p, id)) return 'Unlocked with Renown';
  const rival = t.alt ? t.alt : (ALT_OF[id] || []).find((a) => hasTalent(p, a));   // the capstone and its alternates share one place
  if (rival && hasTalent(p, rival)) return `Instead of ${TALENT_BY_ID[rival].name}`;
  return null;
}

// Has this hero earned the alternate capstone? Their account says so (p.cos.alts: ours from the browser, another player's from the lobby); the practice
// yard lets anyone try them.
export function altEarned(p, id) {
  if (p.game && p.game.practice) return true;
  return !!(p.cos && p.cos.alts && p.cos.alts.includes(id));
}

// Why the hero cannot learn this talent now (null when they can): everything the rules ask for.
export function talentBlock(p, id) {
  if (hasTalent(p, id)) return 'Already learnt';
  return talentLock(p, id) || (p.talentPoints > 0 ? null : 'No talent points left');
}

// Why the hero cannot give their talents back now (null when they can): free, but only in the grounds of their own castle.
export function respecBlock(p) {
  if (!Object.keys(p.talents).length) return 'You have no talents to give back';
  if (p.game.war) return p.game.war.fighting ? 'Not once the battle has begun' : null;   // (War Mode: no castle to go home to; free while the armies muster)
  return p.atHome() ? null : 'Only at your own castle';
}

// A guest's own copy of its talents follows the host's list (me.tal in the snapshot). Returns whether anything changed.
export function mirrorTalents(p, ids) {
  const want = ids.filter((id) => TALENT_BY_ID[id] && TALENT_BY_ID[id].cls === p.classId);
  if (want.length === Object.keys(p.talents).length && want.every((id) => p.talents[id])) return false;
  p.talents = Object.fromEntries(want.map((id) => [id, true]));
  p.talentRev++;
  p.refreshStats();
  return true;
}
