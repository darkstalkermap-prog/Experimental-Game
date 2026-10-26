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

Friends on the same Wi-Fi can use the host's local IP address, for example `http://192.168.1.20:8080`. To
play over the internet, run the server somewhere public, such as a cloud VM or a Node host like Render or
Railway (set `PORT` if the host requires it), or use a tunnel like ngrok.

The host's browser runs the whole battle. Other players control their own hero and receive about 10 updates
a second. If the host leaves, the game ends. If someone else leaves, an AI lord takes over their castle.

## How it works

- **You are the hero** of your castle, in first person, with a sword and shield or a bow, and optionally a warhorse.
- **Rounds**: there is a preparation phase, then a raider wave hits every castle. Later waves bring archers,
  brutes, battering rams and catapults, and every 5th round a Raider Warlord leads the horde.
- **Gold** comes from kills, surviving rounds, breaking gates and destroying keeps. Spend it in the shop (**B**):
  - **Army**: swordsmen, spearmen, archers, knights, cavalry and lancers, plus a larger barracks and troop training.
  - **Castle**: repair or reinforce the gate, repair or thicken the walls, restore the keep, and add tower archers.
  - **Hero**: vitality, strength and armour.
  - **Items**: better swords, a kite shield, a war bow, a warhorse, arrows and healing draughts.
  - **Siege**: battering rams and catapults, sent against the castle you choose.
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
| Left click | Sword attack, or hold and release to shoot the bow |
| Right click | Block with your shield (sword), or zoom (bow) |
| 1 / 2 / mouse wheel | Switch between sword & shield and bow |
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
| `src/player.js` | First-person hero: movement, sword, shield, bow, view-model |
| `src/ai.js` | Rival lord strategy |
| `src/economy.js` | Shop items, shared by the player and the AI |
| `src/world.js`, `src/textures.js` | Terrain, sky, forests and procedural textures |
| `src/ui.js`, `index.html` | HUD, shop, minimap, menus and lobby |
| `src/net.js`, `src/netsync.js` | Online play: connection, snapshots from the host, and pose/actions from clients |
| `server/server.js` | Node server: serves the game and relays messages between players in a room |

Three.js r160 is vendored in `vendor/` (MIT licence), so the game runs offline.

## Current limits

- Online play is host-run. Everyone's view of the battle comes from the host's browser, so a slow host
  connection means laggy enemies for everyone. There's no protection against a modified client.
- The published claude.ai version of the game is single-player only, because online play needs this server.
- The graphics are stylised low-poly made from procedural textures. They aren't Bannerlord-quality assets.
