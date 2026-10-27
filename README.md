# Castle Wars

A first-person medieval castle-siege game that runs in the browser. It's inspired by the look and feel of
Mount & Blade II: Bannerlord, and by the lane waves of a MOBA. Four lords each hold a castle. When the
preparation time is over, every castle sends a fresh army marching out every 30 seconds, for as long as it
stands. The armies meet in the field, fight, and push on to the enemy gates, while you lead from the front as
a hero of one of six classes, spend gold on your army, castle and siege engines, and break the other lords'
gates, walls and keeps.
**The last castle and hero standing wins.**

## Play

### Play in your browser (GitHub Pages)

**https://darkstalkermap-prog.github.io/Experimental-Game/**

This link works once GitHub Pages is switched on (a one-time setting): go to the repository's **Settings → Pages**,
under **Build and deployment** choose **Deploy from a branch**, pick **main** and **/ (root)**, then **Save**. After
a minute or two the game is live at the address above, and every push to `main` updates it. Multiplayer works on
this link too, with no server (see **Online** below): one person clicks **Multiplayer → Host Online Game**, copies the
invite link and sends it to friends.

### Single player

The game is plain static files with no build step. Serve the folder with any static web server and open it
in a desktop browser (Chrome, Edge or Firefox):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

### Online (up to 4 players)

The game picks the first connection that works: your own **Castle Wars server** when the page was served by
one (Render or `npm start`, below), the **claude.ai live room** when the game is opened as a claude.ai
artifact, and otherwise **browser to browser** when it is plain static files (GitHub Pages). All three
use the same host, invite code and lobby. Before the battle starts, the host picks a mode in the lobby:

- **Versus**: every castle for itself. The last castle and hero standing wins.
- **Co-op** (2 to 4 players): the human players are allies. With 2 or 3 players everyone fights on one side
  against the AI lords that hold the empty castles. With 4 players there are no AI lords, so the lobby makes
  **two teams of two: Blue + Red against Green + Gold**. Allied troops, towers, arrows and spells never hurt
  each other, allied gates open for each other, and armies never march on an allied castle. Allies are marked
  **ally** in the castle list. A side wins when every rival house has fallen, and loses when every allied
  castle has fallen.

**On the GitHub Pages link (or any plain web hosting): no server needed.** One person hosts, the others join:

1. The host opens the link, clicks **Multiplayer**, types a name and clicks **Host Online Game**.
2. The host clicks **Copy Invite** and sends the link (it looks like `.../?join=ABCD`) to friends.
3. Friends open it, type a name and press Enter. If they only have the code, they can use **Multiplayer** and
   type it in.
4. The host picks **Versus** or **Co-op** and clicks **Start the Battle**.

Players' browsers connect straight to each other (WebRTC, using the free PeerJS matchmaking service only to
introduce them), and the host's browser runs the battle. Everyone needs internet access. On rare strict networks
(some mobile data or corporate Wi-Fi) a direct connection can't be made; the claude.ai link or your own server
below work around that.

**Easiest: the claude.ai link.** When the game is opened from its claude.ai artifact link, online play works
with no server: the host clicks **Host Online Game** and gets a 4-letter invite code, and friends open the same
link, enter the code and click **Join**. Friends must be signed in to claude.ai and have access to the
artifact (invite them from the artifact's **Share** menu). Visitors who are signed out, or who arrived through a
public link only, can play single player but can't join a room. The players' pages talk through claude.ai's
live room, so updates are a little less frequent than with the server (about 7 per second instead of 10).

**Or run your own server:**

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
3. The host picks a mode (see above) and clicks **Start the Battle**.

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

- **You are the hero** of your castle, in first person, with a sword and shield or a bow, and optionally a
  warhorse. Before the battle you pick one of six **hero classes** (below).
- **Preparation**: every match opens with a locked 1:00 countdown and 500 gold to recruit and upgrade before the
  first wave. Nobody can skip or shorten it, online or off. In single player, time stops while the shop or the
  game menu is open.
- **Map size**: choose Small, Medium or Large in the menu. Small puts castles close for early clashes, and
  Large leaves long marches through more forest. Online, the host's choice applies to everyone.
- **Waves**: when preparation ends, every castle that still stands sends a new army out of its gate every
  30 seconds, for the rest of the game, and nobody has to buy it. The first wave is four soldiers (swordsmen,
  a spearman and an archer). Later waves are bigger and a little tougher every time, and add cavalry and
  knights; a battering ram rolls out with every third wave and a catapult joins now and then, and the engines
  and soldiers of later waves hit gates and walls harder. A castle stops sending waves when its keep falls.
  Every house also gets a wage in gold with each wave, and soldiers who live through a wave learn from it.
  The exact numbers are in `WAVES` in `src/config.js`.
- **Lanes**: each army marches on one enemy castle. By default the waves alternate between your two neighbours
  so that every wave meets one coming the other way: odd waves pair Blue with Green and Red with Gold, even
  waves pair Blue with Gold and Red with Green (an ally or a fallen partner is skipped). In the shop's **Siege**
  tab, **Auto lanes** is that default. Pick a castle instead and every wave and engine goes there until it
  falls; **T** sends your troops at it too. The top of the screen says where your armies march. **When a castle
  falls, every army that was marching on it moves on to the next one by itself**: waves, your army on an assault
  order, giants and siege engines, and the rival lords' pushes too (you are told which castle is next).
- **Garrison, army and lane**: every soldier you own has one of three jobs, and you choose who does what in the
  shop's **Army** tab (**B**):
  - **Garrison**: stays home and defends the castle; the archers man the wall walk.
  - **Army**: follows you and takes your orders (follow, hold, charge, defend, assault, formations).
  - **Lane**: marches out with the waves, by itself, on the enemy. The soldiers that leave your gate on the wave
    timer start out as lane soldiers.

  The tab lists every soldier with a health bar and three buttons, so you can move them one at a time, move
  everyone, or move every soldier of one type (all the archers up on the walls, all the swordsmen into your army).
  A switch decides where **new recruits** go: the garrison or straight into your army. Orders only reach your
  army, and a soldier drafted into it later takes up the army's standing order. The troop limit (12, raised by
  Expand Barracks up to 36) counts the garrison and the army together; lane soldiers are counted separately.
- **Gold** comes from kills, a wage with every wave, a small steady trickle, breaking gates and destroying keeps.
  Spend it in the shop (**B**):
  - **Army**: your soldier roster (above), and swordsmen, spearmen, archers, knights, cavalry and lancers to
    recruit. **Expand Barracks** raises the troop limit and adds a soldier to every wave. **Elite Levies** has
    3 levels, and each adds one more elite to every wave: a knight, then a cavalry rider, then a lancer.
    **Drill Sergeants** give all your troops, waves included, +15% health and damage per level. Veterans can
    be promoted.
  - **Class**: change your hero class in the field (see **Hero classes**).
  - **Castle**: repair or reinforce the gate, repair or thicken the walls, restore the keep, and add tower archers.
  - **Items** (greyed out for now): better swords, a kite shield, a war bow, a warhorse, arrows and healing
    draughts. The tab is disabled in the shop until the items come back.
  - **Siege**: battering rams, catapults and the giant, plus where your armies march (Auto lanes, or a castle you choose).

  **Every upgrade changes how things look**, so you can see what you bought (and what a rival has built) from across
  the field, and a burst of dust and house-coloured motes marks the new work:
  - **Thicken Walls**: level 1 adds a stone plinth and buttresses, level 2 taller buttresses with caps and iron bands,
    level 3 dresses the whole outer face in paler stone with corbels, iron-banded pilasters and a crest on every wall.
    The new stone is solid: soldiers and engines can't walk into it, and it goes when a wall is breached.
  - **Iron-Banded Gate**: level 1 three iron bands, level 2 vertical straps and rivets, level 3 spikes on the outside,
    heavy hinge stiles and a gold crest.
  - **Tower Archers**: level 1 house shields on the tower walls and an archer on every tower roof, level 2 more shields,
    a second archer and a ballista, level 3 a third archer, braziers, gold-rimmed shields and wooden hoardings.
  - **Expand Barracks**: racks of spears and shields line one more wall of the courtyard with every level (back,
    left, right, then the front).
  - **Elite Levies**: one more pair of tall standards beside the keep door with every level, topped by a spearhead,
    then a gold ball, then a gold eagle.
  - **Drill Sergeants**: every level puts your soldiers in better kit: 1 steel pauldrons and a white cross, 2 a cloak
    in your colour, 3 gold at the throat, on the cloak and on the shield, 4 gold wings on the helm and gold pauldrons,
    5 a gilded breastplate, a long cloak and a little more height.
- **Rival lords** (AI) buy troops, repair, upgrade, and spend spare gold on rams, catapults and giants. After the
  first few minutes they also now and then send their whole garrison, and sometimes their hero, on a push at
  the weakest castle (yours included), and their waves and engines follow it. They pull back to defend when
  their gate falls.
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
  - Heavy blows stagger enemies and interrupt their swings. Shielded troops sometimes block. Enemy lords
    block, feint, circle you, and aim for the side you aren't guarding.
- **Hero classes**: pick one in the main menu (online, in the lobby, where everyone sees each other's choice).
  Each class changes your health, armour, speed and damage, and gives you two abilities on cooldowns: **Q** is an
  attack and **R** is a defence. The numbers are in `src/classes.js`.
  - **Knight** (130% health, +5 armour, slower; your shield blocks 10% more). **Q Shield Bash**: lunge forward
    and slam your shield into everything ahead for heavy damage, a long stun and a shove. **R Bulwark**: for 5 s
    you take 70% less damage and can't be staggered; allies beside you take 40% less.
  - **Berserker** (130% sword damage, light armour, quick; hits 15% harder below half health). **Q Whirlwind**:
    spin for a second and cut everyone around you three times. **R Blood Rage**: for 7 s you heal for half the
    damage you deal, can't be staggered and hit 25% harder.
  - **Ranger** (140% bow damage, draws 20% faster, quick, frail). **Q Arrow Volley**: nine free arrows in a fan.
    **R Evasive Roll**: throw yourself nine metres the way you are moving (back when standing still); nothing
    can hurt you for a moment.
  - **Mage** (125% spell damage, abilities recharge 15% faster, very frail). **Q Fireball**: a ball of fire that
    flies where you aim and explodes on impact, burning gates and engines too. Stone walls shelter anyone behind
    them. **R Frost Ward**: a shell of ice that soaks up the next 170 damage for 8 s, and chills and staggers
    enemies close to you.
  - **Cleric** (some armour, 110% spell damage, heals 2.5 times faster out of combat). **Q Smite**: a bolt of
    holy light on the spot you aim at, blasting everyone near it. **R Healing Light**: heal yourself for 45% and
    every ally within 14 m for 40%.
  - **Cavalier** (starts with a warhorse and armour; mounted, the horse shields you and tramples harder).
    **Q Lance Charge**: charge straight ahead for a second at full gallop (a rush on foot), flattening everyone
    in your path. **R Rally Cry**: every ally within 28 m takes 30% less damage and moves 25% faster for 8 s
    (you take 40% less).

  **Switching class in the field**: open the shop (**B**) and choose the **Class** tab. Health keeps its proportion
  (a hero at half health stays at half health), buffs end, and the new abilities are ready after 6 seconds. You can't
  switch in the middle of a fight (within 4 s of being hit) or again within 15 s. It is free before the first wave and
  while you wait to respawn (you come back as the new class). Online, everyone sees the new class on your name tag.

  The two ability tiles and any effects running on you sit above your health bar.
- **Siege crews**: every ram and catapult is worked by two engineers. They are real soldiers: they push the engine to
  its target, and enemies (and your own arrows) can cut them down one at a time. A short-handed engine is slower, and
  when both have fallen it stands **abandoned**, drawn as an empty box on the minimap. **Anyone can take over an
  abandoned engine**:
  - Marching soldiers of any house (wave troops, an army you told to charge or assault, the rival lords' men) walk
    over and take the empty seats. An engine nobody works for goes to whoever takes it, and rolls on that house's
    target. A friendly soldier can also replace a fallen crewman on an engine that still has one.
  - **You** can climb aboard: press **E** beside an abandoned engine (or one of your own). **W/S** roll it, **A/D**
    turn it, the **left button** swings the ram or looses a boulder at the spot you are looking at (a catapult
    reaches 62 m), and **E** climbs out. While you steer, you are inside the engine and can't be hit; the engine
    takes the blows. Your allies in co-op can do the same.
  - Soldiers don't waste time smashing an empty engine, they take it. An abandoned engine nobody takes falls apart
    after 90 seconds and doesn't count toward your engine limit.
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
  summon giants too.
- **Commanding your army**: the command bar at the bottom of the screen always shows your orders and their keys.
  Press **O** for the clickable **Orders** menu, which has orders, formations, army groups, the gate and an
  army count. Orders go to the soldiers in your **army** (see above); the garrison always defends the castle and
  the lane soldiers march on their own.
- **Gates are solid**: a closed gate stops everybody, your own side included. It swings open for your friends as they
  come near and shuts the moment an enemy is at it (within 5.5 m), and it never shuts on someone standing in the
  gateway. You, the lord, can always call your own gate open by standing within 6 m of it, to lead a sally against
  a gate the enemy is besieging, and so can soldiers you have ordered out (charge or assault) once they reach it.
  The garrison stays behind a shut gate. Your arrows pass an open gate, not a shut one.
- **The gate lever**: stand at the lever just inside your gate and press **E** to bar the gate. A barred gate
  stays shut for everyone, your own troops included, until you unbar it. You can also do this from the Orders
  menu.
- **Rocks are solid** too: nobody walks through a boulder, and soldiers walk round rocks and trees. Only the
  knee-high ones are low enough to step onto.
- **Wall walk**: a 5 m wide walk (a wooden hoarding beside the stone wall top) runs all the way around the
  inside of the walls and over the gate. Stairs on both sides of the courtyard lead up to it.
- **Towers**: each corner tower is open to the wall walk. Walk into the tower at the corner of the walk, climb the
  two flights of stairs inside, and come out on the crenellated roof (13 m up): merlons stop enemy arrows and spells,
  your own fly through. The Tower Archers upgrade fills the roofs with archers, a ballista and braziers.
- **Battlements**: the wall tops have merlons with gaps between them, and your archers stand behind the gaps.
  Archers on your walls, your tower archers, and your own arrows and spells fly through the slots and over the
  stone. Enemy arrows and spells are stopped by the merlons, so only a head showing over the top can be hit.
  A wall that is badly damaged loses its merlons.
- **Gates** can be broken by anyone. **Walls** can only be breached with catapults.
- **Death**: your hero respawns at the keep. Each death makes the wait longer. Once your keep falls, you can no
  longer respawn.
- **Cavalry**: mounted troops ride through their targets, and their charges hit harder. Waves bring riders
  from about wave 7, and Elite Levies add them to every wave.
- **Your warhorse**: press **E** to mount or dismount. If you're far from your horse, E whistles it over.
  Shift gallops. Charging adds damage and tramples enemies on foot. The horse takes half the hits you'd take,
  and if it dies a Cavalier gets a fresh one the next time they respawn.
- **Music and sound**: the game makes its own medieval music as you play, with no audio files: a lute, a
  recorder, a drone, hand drums and a war horn in the old church modes. It is calm during preparation and
  builds into drums and a war horn when enemies are close, you are hurt, or an army is at your gate. Browsers
  only allow sound after a click or key press, so the music starts with your first one.
- **Big map**: press **M** for a large live map with the terrain, roads and forests, every castle with its towers, gate
  and name, every soldier and engine, your armies' marching lines and your own position. The battle goes on while it is
  up. Press **M** again to close it (opening the game menu closes it too).
- **Game menu**: **Esc** opens the standard menu: **Resume**, **Options**, **Controls** and **Quit to Main
  Menu**. In single player the world freezes; online, the battle goes on while you are in the menu. Esc again
  resumes (it closes the shop, Options or Controls first). **Options** has master, music and sound-effects
  volume, mouse sensitivity, field of view and graphics quality, all remembered in your browser. The main menu
  has the same Options and Controls.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space | Move / sprint / jump |
| Mouse | Look |
| Mouse flick | Choose attack / guard direction (left, right, up = overhead, down = thrust) |
| Left click | Hold to wind up, release to strike; with the bow, hold and release to shoot |
| Right click | Guard with your shield; feint while winding up; zoom with the bow |
| 1 / 2 / mouse wheel | Sword & shield / bow |
| Q | Class ability: attack |
| R | Class ability: defence |
| H | Drink a healing draught |
| E | Use the gate lever when next to it; take over an abandoned siege engine (or one of yours) beside you; otherwise mount, dismount or call your horse |
| W / S / A / D, left click, E (inside an engine) | Roll / turn / strike or fire / climb out |
| O | Orders menu (click to command troops) |
| B | Open the shop (the Army tab is where you choose garrison, army and lane; the Class tab switches your hero class) |
| M | Big map (press again to close) |
| Tab | Scoreboard |
| F1 or Z | Army: follow me |
| F2 or X | Army: hold the position you're looking at |
| F3 or C | Army: charge |
| F4 or V | Army: defend the castle |
| T | Army: assault the selected target castle |
| G | Choose which group gets orders: everyone / infantry / archers / cavalry |
| F | Cycle formation: line / shield wall / loose |
| Esc | Game menu: resume, options, controls, quit (closes the shop or a panel first) |

Stairs on both sides of the courtyard lead up to the wall walk, which goes all the way around the castle and into the corner towers.

## Code layout

| File | Purpose |
| --- | --- |
| `src/config.js` | All balance numbers: unit stats, prices, waves, difficulty |
| `src/game.js` | Game state, army waves and lanes, economy, kills, respawns, win and loss |
| `src/castle.js` | Castle construction, breakable gate, walls with merlons, climbable towers, keep, wall-walk posts |
| `src/upgrades.js` | What every upgrade level looks like: wall stone, gate ironwork, tower archers, racks, standards |
| `src/units.js` | Soldier and cavalry AI, combat and animation |
| `src/models.js` | Soldier and horse models (two-segment limbs, armour, heraldry) and their poses |
| `src/nav.js` | Routing around castles and through gates and breaches |
| `src/siege.js` | Battering rams and catapults: crews, abandoned engines, takeovers, driving |
| `src/classes.js` | The six hero classes: stats, abilities, buffs |
| `src/player.js` | First-person hero: movement, directional sword and shield, bow, horse, view-model |
| `src/combat.js` | Shared rules for attack and guard directions |
| `src/magic.js` | Fireball and Smite effects: bolts, flashes (the fireball itself flies via `projectiles.js`) |
| `src/grass.js` | Wind-swept grass that grows around the camera |
| `src/ai.js` | Rival lord strategy: spending, repairs and pushes |
| `src/teams.js` | Who fights whom: co-op sides |
| `src/economy.js` | Shop items, shared by the player and the AI |
| `src/world.js`, `src/textures.js` | Terrain, sky, forests and procedural textures |
| `src/ui.js`, `index.html` | HUD, shop, minimap, menus (main, game menu, options, controls) and lobby |
| `src/settings.js` | Volume, sensitivity and field-of-view settings, kept in the browser |
| `src/audio.js` | Sound effects and the volume buses |
| `src/music.js` | The procedural medieval music: lute, recorder, drone, drums and horn |
| `src/physics.js`, `src/projectiles.js` | Terrain and colliders (including the merlons), arrows and boulders |
| `src/net.js`, `src/peernet.js`, `src/roomnet.js`, `src/netsync.js` | Online play: connection (own server, browser-to-browser, or claude.ai live room), snapshots from the host, and pose/actions from clients |
| `server/server.js` | Node server: serves the game and relays messages between players in a room |

Three.js r160 is vendored in `vendor/` (MIT licence), so the game runs offline.

## Performance

- Distant soldiers switch to a single pre-built mesh, and only nearby ones cast shadows. Stuck arrows,
  trees and grass are instanced, so a big battle stays cheap to draw.
- Grass regrows a slice at a time across frames, effect shaders are compiled at match start, and soldier
  models are prepared in the background during the preparation minute, so nothing stutters on first use.
- Online, other players and soldiers are interpolated between the host's updates for smooth movement, and
  shop purchases show instantly while the host confirms them.
- Mouse look uses raw input where the browser supports it.

## Current limits

- Online play is host-run. Everyone's view of the battle comes from the host's browser, so a slow host
  connection means laggy enemies for everyone. There's no protection against a modified client.
- On the claude.ai link, online play runs through claude.ai's live room, which carries less data than the server. In very big battles, some cosmetic effects (blood, sparks, distant arrows) may not show for joined players.
- Graphics quality (Low / Medium / High) is in Options, on the main menu and the game menu. Low turns off
  shadows and grass for slower computers.
- The graphics are stylised low-poly made from procedural textures. They aren't Bannerlord-quality assets.
