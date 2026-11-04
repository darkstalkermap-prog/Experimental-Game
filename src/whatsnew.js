// "What's new": a quiet button on the main menu and a panel that lists what has changed in the game, newest first, in a player's words.
// The list is UPDATES below, one entry per update: to add one, put a new entry at the top with the next `id`. The button carries a "new" mark until the
// player has opened the panel since the newest update came out (localStorage 'cw-whatsnew' keeps the newest id they have seen), and the panel marks the
// updates that came out since their last look.

export const UPDATES = [
  {
    id: 18,
    title: 'The Cavalier rides out',
    items: [
      'Momentum, the Cavalier\'s new passive: the faster you ride, the harder your sword, your trampling and your abilities land, up to +60% at a full gallop. A horseshoe gauge low on the screen fills as you gallop (it shows only in the saddle) and drains when you slow down or turn hard, so long runs and wide turns pay.',
      'Sweeping Strike (Q, every 6 s): for a moment your blade sweeps out to one side as you ride, cutting every soldier you pass. Glance left or right as you press it to pick the side; looking ahead, it goes where the foes are. On foot it is one wide cut in front of you.',
      'Lance Charge moves to R (hold R to aim it, R again reins in), and hits harder with Momentum behind it.',
      'The Ultimate, Call the Charge: hold Z to point, let go and blow the horn. Every ally near you is rallied (less damage taken, faster), and six armoured knights of your house ride out behind you in a wedge and charge the spot. They fight on for 15 seconds, then ride off. Bots and online games use it too.',
      'A new Cavalier talent tree to match: Keen Edge, Wide Sweep and Rider\'s Rhythm for the sweep; Couched Lance, Born to the Saddle and Thundering Hooves for the charge.',
    ],
  },
  {
    id: 15,
    title: 'Better-looking weapons',
    items: [
      'The Berserker now swings a bigger war axe: a long haft wrapped in leather for both hands, iron straps riveted up to a broad bearded head with a bright worn edge. It gets a back spike at level 1, and a second blade and gold bands at level 2.',
      'Every weapon has more detail in your hands: fullers and polished edges on the blades, riveted crossguards, grips wrapped in wire and leather, and mace flanges with bright edges. Upgrades still look different at each level.',
      'Other heroes and soldiers carry better-made weapons too, including every race: a gold-inlaid elven blade, a bright-edged dwarf axe and a worn orc cleaver. Soldiers with three or more levels of training get a gilded sword guard. Only the look changes.',
    ],
  },
  {
    id: 14,
    title: 'Ultimates',
    items: [
      'Every hero has a third ability on Z: the Ultimate. It charges as you fight (damage dealt and taken, health you restore), not on a timer; when the ring round its icon is full it glows and one press lets it go. It is kept when you fall.',
      'Mage: Meteor. Mark a spot further away than a Fireball flies and a huge burning rock falls on it, knocking soldiers flat, breaking walls and gates, and leaving the ground burning.',
      'Cleric: Sanctuary. A circle of golden light round you where no ally can die for 5 seconds.',
      'The other classes have a simple Ultimate for now, with their own on the way. Bots and the computer\'s lords use theirs too. The old Z for "follow me" is now F1 only.',
    ],
  },
  {
    id: 13,
    title: 'Armies of five races',
    items: [
      'Pick the race of your army on the main menu: Human, Elves, Dwarves, Orcs or Undead. Only the look changes: every race fights exactly the same.',
      'Elves stand tall in silver and green with leaf blades and long bows; Dwarves are short, broad and bearded, with axes and heavy plate; Orcs are hunched and tusked in crude spiked iron; the Undead are skeletons in rotted mail with a cold light in their eyes.',
      'The other armies are a random race each, the same as yours or human (More options). Online, every player picks their own army in the lobby; the practice courtyard has a Race row for its soldiers.',
    ],
  },
  {
    id: 12,
    title: 'Specialty Battles: Stonecleft Hold',
    items: [
      'A new section on the main menu, Specialty Battles: set pieces with a map and rules of their own. Click one and it starts with the hero and the difficulty you chose; Quick Play and Play Again repeat it.',
      'Stonecleft Hold: your fortress seals a mountain gorge, one long wall from cliff to cliff with four towers and a single gate, the keep on a rock shelf behind it. Three allied Orc lords march on it together; your army is Human or Elves, as you pick on the card. Break all three of their keeps, or hold your keep until the clock runs out (the HUD counts it down). Single player.',
    ],
  },
  {
    id: 11,
    title: 'A clear shot with the bow',
    items: [
      'The bow no longer hides what you aim at: it is held low and to the left, canted over the way horse archers hold it, with the arrow running in at the crosshair. The bow hand, the arms and the limbs stay clear of the crosshair at full draw, zoomed in, in a Power Shot and in a volley.',
      'Smoother bow handling: no jolt when an arrow or a volley is loosed, and a draw you call off is let down gently.',
    ],
  },
  {
    id: 10,
    title: 'Pick your hero in War Mode',
    items: [
      'War Mode: the army panel has a Your hero row: take up any of the six classes while the armies muster (online too). Your hero now faces the enemy from the start.',
    ],
  },
  {
    id: 9,
    title: 'Heroes with weight',
    items: [
      'The six heroes are rebuilt: layered plate, mail, leather and cloth with straps, buckles and rivets, sculpted faces, hair and beards, capes that hang, mud on the boots; every class has its own silhouette.',
      'Movement with weight: feet stay planted instead of sliding, poses blend instead of snapping, swings wind up and follow through, capes and plumes lag and settle, and heroes flinch when hit.',
      'The two-headed giant is sculpted anew: scowling heads with long beards, muscles that flow, rag wrappings and a chipped stone hammer; heavy footfalls and a swing that hangs before it lands.',
      'Soldiers carry their weapons again (they had been left empty-handed).',
    ],
  },
  {
    id: 8,
    title: 'Steadier and smoother',
    items: [
      'Big battles run much faster: a 2,000-soldier War Mode battle takes about 40% less work per frame, with far fewer pauses.',
      'Memory stays flat over many matches in a row (a finished match is fully let go of).',
      'Soldiers no longer climb the mountains round the map or float above slopes, and War Mode formations stay on the battlefield.',
      'Fixed a rare War Mode bug where a holding archer shot from afar could vanish and keep a battle from ending.',
      'A fallen castle\'s gate now breaks; siege engines no longer get stuck in their own castle or between rocks; small-map catapults reach the back walls.',
      'Heroes rise fresh after dying (no leftover stagger or half-drawn shots), horses can\'t be mounted through walls, and bots tire like players do.',
      'Online: a wrong join code can no longer close the game you then host, and the host shrugs off broken messages.',
      'The HUD keeps clear of itself at every screen size and UI scale; a draw now says so.',
    ],
  },
  {
    id: 7,
    title: 'Bigger wars, smarter lords',
    items: [
      'War Mode: armies of up to 500 soldiers each and 30,000 gold to build them; battles of 2,000 run smoothly, online too.',
      'War Mode: you are your hero from the first moment, standing by your army while you build it.',
      'Charge sends your soldiers at the enemy (no more crowding round you), and archers shoot from range.',
      'Send your army by colour: one button per enemy army in its colour (keys 5, 6, 7); in Conquest they send your army at that house\'s castle. Your groups have their own colours too.',
      'The AI generals fight with tactics: a line with archers behind, cavalry on the flanks, advancing together, regrouping when beaten.',
      'AI lords and generals are heroes now and use their abilities in battle (gentler on Easy).',
      'Spearmen stop riders: extra damage to anyone on horseback, and a horse charging into their spears is checked.',
      'Knight: Shield Bash is a charge: hold Q to see where it ends (as far as a Fireball flies), let go and run there behind your shield, bashing the first enemy you meet.',
      'Cleric: Smite is lightning out of your open hand, as far as a Fireball flies.',
      'Cavalier: Lance Charge gallops as far as a Fireball flies (hold Q to aim it, Q again to rein in), through everyone in the way.',
    ],
  },
  {
    id: 6,
    title: 'Armies that know their way',
    items: [
      'Late in a battle your soldiers no longer run into the walls of your keep: they go round it, and attackers spread along the enemy keep\'s faces.',
      'Your field army has its own limit of 50 soldiers, apart from the garrison\'s (shown as Army 32/50 · Garrison 18/36).',
      'War Mode: every player always starts on their own hill, in front of their own army, far from the enemy (also after Play Again and online).',
      'War Mode online with four players: free-for-all, two against two, or together against the AI.',
      'Berserker: Blood Rage is gone. His R is now Leap: hold R to mark a spot as far as a Mage\'s Fireball flies, let go and he leaps there over the soldiers and slams the ground. Walls stop him. New talents: Earthshaker and Death from Above.',
      'Ranger: her R is now Sniper Shot: hold R and the view zooms in far, steadies, and one heavy arrow flies flat as far as a Fireball (a headshot counts). The Snare Trap is gone; new talents: Hawk\'s Scope and Deadeye.',
    ],
  },
  {
    id: 5,
    title: 'A clearer, sharper world',
    items: [
      'The haze is gone: far castles, banners and mountains read clearly, in every land and in War Mode.',
      'Sharper picture: true anti-aliasing on High instead of a blur filter, a light sharpening, and glow only on bright highlights.',
      'Screens with more pixels per inch draw at their full resolution.',
      'The ground has real detail at every quality: grass tufts, soil and gravel, rock on the cliffs; War Mode\'s hills too.',
      'Castle stone has grain, far trees keep their outline, and trees on the mountains stand on forest floor instead of bare rock.',
    ],
  },
  {
    id: 4,
    title: 'Easier to start, a sharper Ranger',
    items: [
      'The main menu shows what you need to start a battle: Quick Play, Mode, Difficulty and Length. Your castle, colour, map, land and next battle wait under More options.',
      'A battle opens with "Click to fight" instead of a menu, and so does coming back from another window. Esc still opens the game menu.',
      'Bigger, clearer text on the battle screen, on darker panels, and a UI scale slider in Options (80 to 140 %).',
      'The key reminders show in your first two battles. After that press I to see them again.',
      'Headshots: any hero\'s arrow in the head deals double damage (1.5x into a hero), with a skull marker.',
      'The Ranger is reworked: stronger headshots, arrows that pierce, Power Shot (Q), arrows that come back over time and a new talent tree.',
      'War Mode: every army starts on its own hill, your army waits for your orders, the chosen group is marked over their heads, and new orders like Bannerlord: Move here (where you look), Follow me, Charge, Hold, Advance, Fall back and four formations.',
      'King of the Hill: a bar shows how long every house has held the hill.',
      'Up close, a castle shows how much its keep, gate and walls can still take.',
      'Knights carry a larger kite shield.',
      'Choose your arms: a sigil, how the field is divided and a second colour. They show on your castle, soldiers, shield and cloak, for everyone online.',
      'The archers on the castle towers can now be shot down (a tower shoots slower for each one lost, and a new archer climbs up after 30 s).',
      'This list of what is new.',
    ],
  },
  {
    id: 3,
    title: 'Hills, spectating and the giant',
    items: [
      'War Mode: each army starts on a hill and charges down to meet the others.',
      'War Mode: clear air instead of haze, talents that work, a command bar for your groups (1 to 4, then F1 to F4), Repeat last army and personal bests.',
      'Smoother movement: no more stutter when you strafe.',
      'Natural wrists on the sword, and a bow drawn the way a real archer draws it.',
      'Climb up to the battlements from the upper floor of a castle, and pull yourself onto your own walls.',
      'Spectate: watch a whole battle led by AI lords. Follow the heroes, fly free or look over the field.',
      'Gates close by themselves when enemies come near.',
      'The giant is now a two-headed brute of its own.',
    ],
  },
  {
    id: 2,
    title: 'War Mode, colours and seats',
    items: [
      'War Mode: two minutes to build an army of soldiers, archers and cavalry, then one great battle, alone or online.',
      'Hero Mode online: 2 v 2, 3 v 3 and 4 v 4 with friends.',
      'Choose which castle you lead, open or close the others, and pick your colour.',
      'Walk in through an enemy gate that stands open.',
      'Simpler fighting: click to strike, right click to block.',
      'Climb a castle wall through the gaps in its battlements.',
      'Buy a horse at the shop.',
      'Lifelike soldiers and heroes, and a shield that faces the right way.',
      'A cleaner menu and battle screen.',
    ],
  },
  {
    id: 1,
    title: 'Heroes, lands and Renown',
    items: [
      'Hero Mode: three heroes against three, with bot heroes on both sides.',
      'A talent tree for every hero class.',
      'Quick Play, instant Play Again, Ready to start early, Concede, and Short battles.',
      'Battle Decrees: one or two rule changes for the next battle, and help for a house that falls behind.',
      'Named rival lords, each with a style of their own.',
      'Lands to fight on: meadow, snow, marsh and desert.',
      'Renown, unlocks, class mastery and personal bests.',
      'Callouts, tips and pings to point your allies at a target.',
      'Big finishes: the last keep falls in slow motion.',
      'The practice courtyard, with training dummies.',
      'A new look: sky, shadows, land, trees, castles, and your own arms and weapons in view.',
    ],
  },
];

const KEY = 'cw-whatsnew';
const newest = () => UPDATES[0].id;
function seen() {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return Number(v) || 0;
    // never opened: a player who has played here before (a match started, an account) has the newest update as news; someone new starts with nothing marked
    if (localStorage.getItem('cw-last') === null && localStorage.getItem('cw-progress') === null) { markSeen(); return newest(); }
    return newest() - 1;
  } catch (e) { return newest(); }   // (no storage: nothing to point out on every visit)
}
function markSeen() {
  try { localStorage.setItem(KEY, String(newest())); } catch (e) { /* ignore */ }
}

const CSS = `
#whatsNewBtn .wn-dot { display: none; margin-left: 6px; padding: 0 6px 1px; border-radius: 8px; font: 700 10.5px Cinzel, Georgia, serif; letter-spacing: 0.06em;
  background: #8a2a18; color: #f8ebc8; vertical-align: 1px; }
#whatsNewBtn.fresh .wn-dot { display: inline-block; }
#menu .menu-actions .row.small #whatsNewBtn:hover .wn-dot { background: #f6e8c6; color: #5a1d12; }
#whatsNew .scroll { max-width: 720px; text-align: left; padding-bottom: 0; }
#whatsNew h1 { text-align: center; font-size: 44px; }
#whatsNew .wn-list { display: grid; gap: 14px; margin: 14px 0 4px; }
#whatsNew section { padding: 10px 16px 8px; border: 1px solid rgba(138,106,58,0.55); border-radius: 6px; background: rgba(255,250,235,0.32); }
#whatsNew section.fresh { border-color: #8a2a18; box-shadow: inset 4px 0 0 #8a2a18; }
#whatsNew h3 { display: flex; align-items: baseline; gap: 10px; margin: 0 0 4px; font-size: 17px; color: var(--wine); }
#whatsNew h3 small { font: 600 12px Cinzel, Georgia, serif; letter-spacing: 0.12em; text-transform: uppercase; color: #6a4a2a; }
#whatsNew h3 .wn-new { margin-left: auto; padding: 1px 8px 2px; border-radius: 9px; font: 700 11px Cinzel, Georgia, serif; letter-spacing: 0.08em; background: #8a2a18; color: #f8ebc8; }
#whatsNew ul { margin: 0; padding-left: 20px; font-size: 15.5px; line-height: 1.38; }
#whatsNew li + li { margin-top: 3px; }
#whatsNew .scroll > .row:last-child { position: sticky; bottom: 0; margin: 0 -40px; padding: 12px 0 22px; background: #d9c79c; }
`;

function build() {
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  // the button: last in the menu's quiet row (Spectate, Renown, Options, Controls)
  const row = document.querySelector('#menu .menu-actions .row.small');
  const btn = document.createElement('button');
  btn.id = 'whatsNewBtn';
  btn.title = 'What has changed in the game, newest first';
  btn.innerHTML = 'What\'s new<span class="wn-dot">New</span>';
  if (row) row.appendChild(btn);
  // the panel: a parchment screen over the menu, like Options and Controls
  const scr = document.createElement('div');
  scr.id = 'whatsNew';
  scr.className = 'screen overlay hidden';
  scr.innerHTML = '<div class="scroll"><h1>What\'s New</h1><div class="sub">The latest changes first</div><div class="wn-list"></div><div class="row"><button id="whatsNewBack">Back</button></div></div>';
  document.body.appendChild(scr);
  const paint = () => {
    const last = seen(), list = scr.querySelector('.wn-list');
    list.textContent = '';
    for (const u of UPDATES) {
      const sec = document.createElement('section');
      const fresh = u.id > last;
      sec.className = fresh ? 'fresh' : '';
      const h = document.createElement('h3');
      const tag = document.createElement('small');
      tag.textContent = `Update ${u.id}`;
      h.append(tag, u.title);
      if (fresh) { const n = document.createElement('span'); n.className = 'wn-new'; n.textContent = 'New'; h.append(n); }
      const ul = document.createElement('ul');
      for (const it of u.items) { const li = document.createElement('li'); li.textContent = it; ul.append(li); }
      sec.append(h, ul);
      list.append(sec);
    }
  };
  const mark = () => btn.classList.toggle('fresh', seen() < newest());
  const open = () => {
    paint();                    // (marked against the last look, then the look is remembered)
    markSeen();
    mark();
    scr.classList.remove('hidden');
    scr.querySelector('.scroll').scrollTop = 0;
    document.getElementById('whatsNewBack').focus();
  };
  const close = () => { scr.classList.add('hidden'); btn.focus(); };
  btn.addEventListener('click', open);
  scr.querySelector('#whatsNewBack').addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !scr.classList.contains('hidden')) close(); });
  mark();
}

if (typeof document !== 'undefined') build();
