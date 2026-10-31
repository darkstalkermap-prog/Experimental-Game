// "What's new": a quiet button on the main menu and a panel that lists what has changed in the game, newest first, in a player's words.
// The list is UPDATES below, one entry per update: to add one, put a new entry at the top with the next `id`. The button carries a "new" mark until the
// player has opened the panel since the newest update came out (localStorage 'cw-whatsnew' keeps the newest id they have seen), and the panel marks the
// updates that came out since their last look.

export const UPDATES = [
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
      'The Ranger is reworked: stronger headshots, arrows that pierce, Power Shot (Q), Snare Trap (R), arrows that come back over time and a new talent tree.',
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
