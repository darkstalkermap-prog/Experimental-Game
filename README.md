# Castle Wars

A first-person medieval castle-siege game that runs in the browser. It's inspired by the look and feel of
Mount & Blade II: Bannerlord. Four lords each hold a castle. Waves of raiders attack every castle, and each
round is harder than the last. The rival lords also go to war with each other. **The last castle and hero
standing wins.**

## Play

The game is plain static files with no build step. Serve the folder with any static web server and open it
in a desktop browser (Chrome, Edge or Firefox):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

`npx serve .` works too. You can also enable GitHub Pages on this repository and play from the Pages URL.

## How it works

- **You are the hero** of the blue castle, in first person, with a sword and shield or a bow.
- **Rounds**: there is a preparation phase, then a raider wave hits every castle. Later waves bring archers,
  brutes, battering rams and catapults, and every 5th round a Raider Warlord leads the horde.
- **Gold** comes from kills, surviving rounds, breaking gates and destroying keeps. Spend it in the shop (**B**):
  - **Army**: swordsmen, spearmen, archers and knights, plus a larger barracks and troop training.
  - **Castle**: repair or reinforce the gate, repair or thicken the walls, restore the keep, and add tower archers.
  - **Hero**: vitality, strength and armour.
  - **Items**: better swords, a kite shield, a war bow, arrows and healing draughts.
  - **Siege**: battering rams and catapults, sent against the castle you choose.
- **Gates** can be broken by anyone. **Walls** can only be breached with catapults.
- **Death**: your hero respawns at the keep. Each death makes the wait longer. Once your keep falls, you can no
  longer respawn.
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
| B | Open the shop |
| Tab | Scoreboard |
| F1 or Z | Troops: follow me |
| F2 or X | Troops: hold the position you're looking at |
| F3 or C | Troops: charge |
| F4 or V | Troops: defend the castle |
| T | Troops: assault the selected target castle |
| G | Choose which group gets orders: everyone / infantry / archers |
| Esc | Pause |

The stairs beside the gate lead up to the wall walk, so you can fight from the battlements.

## Code layout

| File | Purpose |
| --- | --- |
| `src/config.js` | All balance numbers: unit stats, prices, rounds, difficulty |
| `src/game.js` | Game state, rounds and waves, economy, kills, respawns, win and loss |
| `src/castle.js` | Castle construction, breakable gate, walls and keep, wall-walk posts |
| `src/units.js` / `src/models.js` | Soldier AI, combat, animation and low-poly models |
| `src/nav.js` | Routing around castles and through gates and breaches |
| `src/siege.js` | Battering rams and catapults |
| `src/player.js` | First-person hero: movement, sword, shield, bow, view-model |
| `src/ai.js` | Rival lord strategy |
| `src/economy.js` | Shop items, shared by the player and the AI |
| `src/world.js`, `src/textures.js` | Terrain, sky, forests and procedural textures |
| `src/ui.js`, `index.html` | HUD, shop, minimap and menus |

Three.js r160 is vendored in `vendor/` (MIT licence), so the game runs offline.

## Current limits

- The other three lords are AI-controlled. Online play between four people isn't built yet; it would need a
  game server.
- The graphics are stylised low-poly made from procedural textures. They aren't Bannerlord-quality assets.
- There's no cavalry or mounted combat yet.
