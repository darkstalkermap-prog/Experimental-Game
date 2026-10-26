# Castle Wars

A first-person medieval castle-siege game that runs in the browser. It's inspired by the look and feel of
Mount & Blade II: Bannerlord. Four lords each hold a castle. Waves of raiders attack every castle, and each
round is harder than the last. The rival lords also go to war with each other. **The last castle and hero
standing wins.**

## Play

### Single player

The game is plain static files with no build step. Serve the folder with any static web server and open it
in a desktop browser (Chrome, Edge or Firefox):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

### Online (up to 4 players)

Online play needs the small Castle Wars server, which serves the game and relays messages between players.
It requires Node.js 18 or newer:

```bash
npm install
npm start
# Castle Wars running at http://localhost:8080
```

1. The host opens the game from the server's address, types a name and clicks **Host Online Game**. A
   4-letter room code appears.
2. Friends open the same address, type the code and click **Join**. Each player gets a castle. Any empty
   castles are taken by AI lords.
3. The host clicks **Start the Battle**.

Friends on the same Wi-Fi can use the host's local IP address, for example `http://192.168.1.20:8080`.

### Put it online so anyone can join with a link

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/darkstalkermap-prog/experimental-game)

1. Click the button above, sign in to Render (free) and connect your GitHub account. If this repository is
   private, Render will ask for permission to read it.
2. Render reads `render.yaml`, builds the server and gives you an address like
   `https://castle-wars-xxxx.onrender.com`.
3. Send that address to your friends. One of you hosts, the others join with the room code.

Render's free plan sleeps after about 15 minutes without visitors, so the first load after a break takes
around a minute. The included `Dockerfile` also works on Fly.io, Railway or any Docker host.

The host's browser runs the whole battle. Other players control their own hero and receive about 10 updates
a second. If the host leaves, the game ends. If someone else leaves, an AI lord takes over their castle.

## How it works

- **You are the hero** of your castle, in first person, with a sword and shield or a bow, and optionally a warhorse.
- **Preparation**: every match opens with 60 seconds and 500 gold to recruit, upgrade and learn spells before
  the first wave. Press **Enter** to start early (the host decides online). In single player, time stops while
  the shop is open.
- **Map size**: choose Small, Medium or Large in the menu. Small puts castles close for early clashes, and
  Large leaves long marches through more forest. Online, the host's choice applies to everyone.
- **Rounds**: after preparation, a raider wave hits every castle. Later waves bring archers,
  brutes, battering rams and catapults, and every 5th round a Raider Warlord leads the horde.
- **Gold** comes from kills, surviving rounds, breaking gates and destroying keeps. Spend it in the shop (**B**):
  - **Army**: swordsmen, spearmen, archers, knights, cavalry and lancers, plus a larger barracks and troop training.
  - **Castle**: repair or reinforce the gate, repair or thicken the walls, restore the keep, and add tower archers.
  - **Hero**: vitality, strength and armour.
  - **Items**: better swords, a kite shield, a war bow, a warhorse, arrows and healing draughts.
  - **Siege**: battering rams and catapults, sent against the castle you choose.
- **Directional combat** (Bannerlord style):
  - Flick the mouse to choose a direction: left, right, up for an overhead, or down for a thrust. Then hold
    left-click to wind up and release to strike. A longer wind-up hits harder.
  - Overheads and thrusts reach further and hit hard but catch one or two enemies. Side swings can hit three.
  - Right-click raises your shield. It always softens blows from the front, and guarding the side the blow
    comes from stops it completely.
  - Guard just as a blow lands (or switch to that side at the last moment) to **parry**. The attacker
    staggers and is open.
  - Red chevrons around the crosshair show the side each incoming swing comes from.
  - Right-click during a wind-up to **feint**. Enemies who fall for it block far less for a moment.
  - Heavy blows stagger enemies and interrupt their swings. Shielded troops sometimes block. Enemy lords and
    the Warlord block, feint, circle you, and aim for the side you aren't guarding.
- **Magic** (Skyrim style): learn spells in the shop's Magic tab and switch to them with **3**. Spells fly in a
  straight line to where you aim, and walls, keeps and hills block them. Mana refills after a short pause in
  casting.
  - **Fireball**: hold to charge, release to throw. It explodes on impact and burns gates and siege engines.
    Stone walls shelter anyone behind them.
  - **Chain Lightning**: instantly hits what you aim at, then jumps to two more enemies in sight.
  - **Ice Spike**: a fast shard that pierces up to three enemies and slows them.
  - Upgrades: Destruction Mastery (+25% spell damage per level), Deep Mana Well (more mana) and Arcane
    Recovery (faster regeneration).
  - From round 6, **Raider Shamans** throw fireballs at you and your troops.
- **Formations**: press **F** to cycle Line, Shield Wall and Loose. They shape how your troops follow and hold:
  infantry in front, archers behind, cavalry at the back. In a held **Shield Wall**, shielded infantry lock
  shields, block most blows and arrows, and keep their line instead of chasing.
- **Veterans**: soldiers earn experience from damage, kills and surviving waves, ranking up to ★★★★★ with
  more health, damage and armour. From rank 3 they wear a plume, which turns gold at rank 5. Rank ★★★★
  soldiers can be **promoted** in the shop (Army tab): Swordsman or Spearman to Knight, Archer to Longbowman,
  Cavalry to Lancer. They keep their rank.
- **Giants**: once you've saved 1,600 gold, your castle can **summon a giant** (shop, Siege tab). The
  6-metre giant marches on your target castle, smashing gates and keeps. Its club flattens and staggers
  everyone around the blow, and the ground shakes as it walks. You can have one at a time. Rich AI lords
  summon giants too, and every 10th round the raiders bring one.
- **Gates** can be broken by anyone. **Walls** can only be breached with catapults.
- **Death**: your hero respawns at the keep. Each death makes the wait longer. Once your keep falls, you can no
  longer respawn.
- **Cavalry**: mounted troops ride through their targets, and their charges hit harder. Raiders bring riders
  from round 5.
- **Your warhorse**: press **E** to mount or dismount. If you're far from your horse, E whistles it over.
  Shift gallops. Charging adds damage and tramples enemies on foot. The horse takes half the hits you'd take,
  and if it dies you need to buy another.
- **Rival lords** (AI) recruit, repair, upgrade and, from round 4, march on other castles, yours included.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space | Move / sprint / jump |
| Mouse | Look |
| Mouse flick | Choose attack / guard direction (left, right, up = overhead, down = thrust) |
| Left click | Hold to wind up, release to strike; with the bow, hold and release to shoot |
| Right click | Guard with your shield; feint while winding up; zoom with the bow |
| 1 / 2 / 3 / mouse wheel | Sword & shield / bow / magic |
| R (or 3 again) | Next spell |
| Q | Drink a healing draught |
| E | Mount or dismount your horse, or call it |
| B | Open the shop |
| Tab | Scoreboard |
| F1 or Z | Troops: follow me |
| F2 or X | Troops: hold the position you're looking at |
| F3 or C | Troops: charge |
| F4 or V | Troops: defend the castle |
| T | Troops: assault the selected target castle |
| G | Choose which group gets orders: everyone / infantry / archers / cavalry |
| F | Cycle formation: line / shield wall / loose |
| Enter | Start the match early during preparation |
| Esc | Pause |

The stairs beside the gate lead up to the wall walk, so you can fight from the battlements.

## Code layout

| File | Purpose |
| --- | --- |
| `src/config.js` | All balance numbers: unit stats, prices, rounds, difficulty |
| `src/game.js` | Game state, rounds and waves, economy, kills, respawns, win and loss |
| `src/castle.js` | Castle construction, breakable gate, walls and keep, wall-walk posts |
| `src/units.js` | Soldier and cavalry AI, combat and animation |
| `src/models.js` | Soldier and horse models (two-segment limbs, armour, heraldry) and their poses |
| `src/nav.js` | Routing around castles and through gates and breaches |
| `src/siege.js` | Battering rams and catapults |
| `src/player.js` | First-person hero: movement, directional sword and shield, bow, horse, view-model |
| `src/combat.js` | Shared rules for attack and guard directions |
| `src/magic.js` | Spells: casting, chain lightning, flashes (fireball and ice fly via `projectiles.js`) |
| `src/grass.js` | Wind-swept grass that grows around the camera |
| `src/ai.js` | Rival lord strategy |
| `src/economy.js` | Shop items, shared by the player and the AI |
| `src/world.js`, `src/textures.js` | Terrain, sky, forests and procedural textures |
| `src/ui.js`, `index.html` | HUD, shop, minimap, menus and lobby |
| `src/net.js`, `src/netsync.js` | Online play: connection, snapshots from the host, and pose/actions from clients |
| `server/server.js` | Node server: serves the game and relays messages between players in a room |

Three.js r160 is vendored in `vendor/` (MIT licence), so the game runs offline.

## Performance

- Distant soldiers switch to a single pre-built mesh, and only nearby ones cast shadows. Stuck arrows,
  trees and grass are instanced. A late-game battle draws about 220 objects per frame.
- Grass regrows a slice at a time across frames, effect shaders are compiled at match start, and soldier
  models are prepared in the background during the preparation minute, so nothing stutters on first use.
- Online, other players and soldiers are interpolated between the host's updates for smooth movement, and
  shop purchases show instantly while the host confirms them.
- Mouse look uses raw input where the browser supports it.

## Current limits

- Online play is host-run. Everyone's view of the battle comes from the host's browser, so a slow host
  connection means laggy enemies for everyone. There's no protection against a modified client.
- The published claude.ai version of the game is single-player only, because online play needs this server.
- Graphics quality (Low / Medium / High) is in the main menu and the pause menu. Low turns off shadows and
  grass for slower computers.
- The graphics are stylised low-poly made from procedural textures. They aren't Bannerlord-quality assets.
