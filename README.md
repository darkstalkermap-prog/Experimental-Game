# Castle Wars

A first-person medieval castle-siege game that runs in the browser. It's inspired by the look and feel of
Mount & Blade II: Bannerlord, and by the lane waves of a MOBA. Four lords each hold a castle. When the
preparation time is over, every castle sends a fresh army marching out every 30 seconds, for as long as it
stands. The armies meet in the field, fight, and push on to the enemy gates, while you lead from the front as
a hero of one of six classes, spend gold on your army, castle and siege engines, and break the other lords'
gates, walls and keeps.

## Game modes

Pick the mode in the menu (and, for an online game, in the lobby); **Conquest** is the main one.

- **Conquest** (the main mode): break the other houses' castles. **The last castle and hero standing wins.**
  The hill in the middle of the map is only scenery here: a mound ringed by standing stones, with a banner.
- **King of the Hill**: the same war, with the hill in the middle of the map live. A house takes the hill by standing on it
  alone: a lone soldier takes an empty hill in about eight seconds, more soldiers are quicker (a hero counts for two,
  a giant for four). While soldiers of two houses are on it, it is **contested** and nothing changes. Whoever holds it
  earns **2 gold a second** (paid in lumps of ten) and the seconds add up: **hold it for 2:30 in all and you win
  outright**, wherever the rest of the war stands. A house that is destroyed loses its hold. The hill box under the
  top panel shows who holds it, who is taking it and each side's time (the castle list and the scoreboard show it
  too, and the map marks the hill in the holder's colour). Each rival lord sends three of his first soldiers up to the
  hill at once, and men of every wave after that (more as the war goes on) to keep them there, so nobody can sit on it
  unopposed and it is fought over all game long. **Y** sends your own army up to
  hold it. In co-op, allies share the hold and the time, and win together.
- **Hero Game Mode**: three heroes against three, out of one castle each, with nothing to control but your hero and its
  talents while the armies march by themselves, round after round tougher. Win by 25 hero kills, by destroying the enemy
  keep, or by the most hero kills in 20 minutes (see **Hero Game Mode** below). Single player for now.

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

### Practice courtyard

The **Practice Courtyard** button in the main menu takes you to a walled yard on its own flat ground, with nothing at war: no waves, no
rival lords, nobody wins or loses. It is for trying things out on **training dummies**. A dummy cannot be beaten: it only counts what it
takes, and shows it above its head (the damage per second over the last 5 seconds, the last blow, the best, the total), and the HUD keeps
your own damage per second in the top left. Dummies come in five armour tiers (Straw 0, Mail 3, Plate 7, Champion 11, Fortress 15), so you
can see what armour does to a blow. The floor has chalk lines every 10 m and distance boards on the walls, for the bow, the spells and the volley.

Press **P** for the practice panel (the mouse is free while it is up, and the yard carries on behind it):

- **Your hero**: any of the six classes at level 1 to 5, with full health and ready abilities each time. **All talents** gives the whole tree of
  the class at any level (**No talents** clears it, **Talent tree (N)** spends the points the level gives), **Heal and refill** tops everything up.
  The line below shows what your hero is now (health, armour, sword, bow, spells, speed, recharge).
- **Soldiers**: any kind (swordsman, spearman, archer and cavalry; knight, longbowman and lancer; lord and giant) at any **veteran rank** (1 to 5,
  +12% health, +10% damage, +1 armour per rank above the first) and any **training tier** (0 to 5, +15% health and damage and a better kit), one, five,
  ten or twenty at a time (40 in the yard at most). They stand behind you and charge the nearest dummy by themselves. They keep the rank and tier they
  were sent in with, and the panel tells how many damage per second each group does, each and in all, so kinds, ranks and tiers can be compared.
- **Dummies**: the armour of the row, the crowd and the far targets, and which stands are filled: a **ladder** (one of each armour, side by side),
  a **row of five** (alike: the fair test for soldiers, who choose the nearest dummy), a **crowd of twelve** (for the Whirlwind, fireballs and the
  volley) and **far targets** (46 and 56 m). **Reset counters** starts the counting again.

The yard is part of the world, so entering and leaving it rebuilds the map (the small one); it is single player only.

### Online (up to 4 players)

The game picks the first connection that works: your own **Castle Wars server** when the page was served by
one (Render or `npm start`, below), the **claude.ai live room** when the game is opened as a claude.ai
artifact, and otherwise **browser to browser** when it is plain static files (GitHub Pages). All three
use the same host, invite code and lobby. Before the battle starts, the host picks a mode in the lobby:

- **Versus**: every castle for itself. (In Conquest the last castle and hero standing wins.)
- **Co-op** (2 to 4 players): the human players are allies. With 2 or 3 players everyone fights on one side
  against the AI lords that hold the empty castles. With 4 players there are no AI lords, so the lobby makes
  **two teams of two: Blue + Red against Green + Gold**. Allied troops, towers, arrows and spells never hurt
  each other, allied gates open for each other, and armies never march on an allied castle. Allies are marked
  **ally** in the castle list. A side wins when every rival house has fallen, and loses when every allied
  castle has fallen.

  **Calling a fallen ally back (co-op Conquest).** A house is finished when its keep has fallen and its hero is dead:
  that player can only watch. Any ally still in the battle can pay **500 gold** to bring them back to life.
  Open the shop (**B**): under the tabs, on every tab, a red bar names each ally who is out of the battle, with a
  **Call back to life** button (it says how much gold is missing if you are short). **U** does the same for the first
  fallen ally without opening the shop. The ally rises in the courtyard of their own keep, ruin though it is, with
  two seconds of protection and at full health, and fights on. There is no keep left to raise them again, so if they
  fall again they are out again until somebody pays again. A toast when the house falls, a callout that comes back now and
  then while the ally is out, and the fallen player's own screen all say that it can be done. It is not offered in King of the Hill, in Versus, or for a player who has left
  the game. The price (and the protection) are `SUMMON` in `src/config.js`; the rules are `Game.summonBlock` and
  `Game.summonAlly` (a guest rises by itself, in its own courtyard, as soon as the host says it is alive again).

**On the GitHub Pages link (or any plain web hosting): no server needed.** One person hosts, the others join:

1. The host opens the link, clicks **Multiplayer**, types a name and clicks **Host Online Game**.
2. The host clicks **Copy Invite** and sends the link (it looks like `.../?join=ABCD`) to friends.
3. Friends open it, type a name and press Enter. If they only have the code, they can use **Multiplayer** and
   type it in.
4. The host picks **Versus** or **Co-op**, and **Conquest** or **King of the Hill**, and clicks **Start the Battle**.

Players' browsers connect straight to each other (WebRTC, using the free PeerJS matchmaking service only to
introduce them), and the host's browser runs the battle. Everyone needs internet access. On rare strict networks
(some mobile data or corporate Wi-Fi) a direct connection can't be made; the claude.ai link or your own server
below work around that.

**Easiest: the claude.ai link.** When the game is opened from its claude.ai artifact link, online play works
with no server: the host clicks **Host Online Game** and gets a 4-letter invite code, and friends open the same
link, enter the code and click **Join**. Friends must be signed in to claude.ai and have access to the
artifact (invite them from the artifact's **Share** menu). Visitors who are signed out, or who arrived through a
public link only, can play single player but can't join a room. The players' pages talk through claude.ai's
live room, so updates are a little less frequent than with the server (about 7 per second instead of 10, and slower for large battles).

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
- **Preparation**: every match opens with a 1:00 countdown (0:36 in a Short match) and 500 gold to recruit and upgrade
  before the first wave. It is no longer locked: press **Enter** (Ready) and the first wave marches at once; online it
  marches when every lord has pressed Ready, or when the countdown runs out (see "Between matches"). In single player,
  time stops while the shop or the game menu is open.
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
  - **Class**: change your hero class, at your own castle (see **Hero classes**).
  - **Castle**: repair or reinforce the gate, repair or thicken the walls, restore the keep, and add tower archers.
    Repairing the gate (or rebuilding a broken one) costs **1500 gold**, the same for every house, so a gate that falls
    is a real loss (`GATE_REPAIR_COST` in `src/config.js`). The Iron-Banded Gate upgrades are priced on their own.
  - **Items** (greyed out for now): better swords, a kite shield, a war bow, arrows and healing draughts. The tab is
    disabled in the shop until the items come back.
  - **Warhorse** (on the Class tab, **400 gold**, `HORSE_COST` in `src/config.js`): a horse for your hero, whatever the class
    (a Cavalier starts with one). It is yours until it is killed; then you can buy another. Online, a guest's purchase goes
    through the host like every other.
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
- **Melee** (simple on purpose):
  - Left click swings your sword; hold it to keep swinging. The swings take turns (from the right, from the left, now and
    then overhead) just for the look of it: you never choose a direction, and every swing reaches and hits the same.
  - Right click raises your shield. It stops any blow from in front (each one costs a little stamina; with too little
    left the shield only softens it), and softens arrows and spells from in front. Blows from the side or behind get through.
  - Raise the shield just as a blow lands to **parry**: the attacker staggers and is open.
  - Heavy blows stagger enemies and interrupt their swings. Shielded troops sometimes block. Enemy lords block and
    circle you, looking for your side.
- **Hero classes**: pick one in the main menu (online, in the lobby, where everyone sees each other's choice).
  Each class changes your health, armour, speed and damage, and gives you two abilities on cooldowns: **Q** is an
  attack and **R** is a defence. The numbers are in `src/classes.js`.
  - **Knight** (130% health, +5 armour, slower; your shield blocks 10% more). **Q Shield Bash**: lunge forward
    and slam your shield into everything ahead for heavy damage, a long stun and a shove. **R Bulwark**: for 5 s
    you take 70% less damage and can't be staggered; allies beside you take 40% less.
  - **Berserker** (130% sword damage, light armour, quick; hits 15% harder below half health). **Q Whirlwind**:
    spin for a second and cut everyone around you three times. **R Blood Rage**: for 7 s you heal for half the
    damage you deal, can't be staggered and hit 25% harder.
  - **Ranger** (140% bow damage, draws 20% faster, quick, frail). **Q Arrow Volley**: hold Q and a circle appears on
    the ground where your crosshair points (up to 62 m away; it turns amber when that is as far as it reaches); let go
    and 18 free arrows come down out of the sky on it, spread over the men standing inside. Walls don't stop it, so it
    reaches men behind them. A quick tap looses it at once; Esc or R cancels.
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

  **Switching class**: open the shop (**B**) and choose the **Class** tab. A class can only be taken up **at your own
  castle**: inside its walls or within 14 m of them (the card says "Only at your own castle" anywhere else, in the
  field or at another house's castle). A hero waiting to respawn may choose from wherever they lie, since they
  rise at their own keep. Health keeps its proportion (a hero at half health stays at half health), buffs end, and the
  new abilities are ready after 6 seconds. After the first wave you also can't switch in the middle of a fight (within 4 s
  of being hit) or again within 15 s. A hero who has died comes back as the new class. Online, the host checks the
  position too, and everyone sees the new class on your name tag.

  **Talents**: every level after the first gives one talent point, and the shop's **Talents** tab (**B**, or **N** for
  short) spends it on your own class's tree: seven talents in four tiers, a branch for each ability, and a capstone.
  A talent needs the level shown beside its row (level 2 for the first tier, 5 for the capstone) and the talent above
  it, so the four points of a level 5 hero never buy a whole tree. Some talents are plain numbers (health, armour,
  speed, draw time); most change an ability: the Knight's Shield Bash stuns longer, the Berserker's Whirlwind strikes
  once more, the Ranger rolls twice, the Mage's fireballs burn and fork, the Cleric's Smite chains on to more foes, the
  Cavalier's Rally Cry reaches further. A gold hint, "Talent point available", pulses on the HUD while you have a point
  to spend, and the icons of what you have learnt sit beside Q and R. **Respec** gives every point back, free, at your
  own castle. Talents stay through death; a new class starts a new tree. Online the host checks every request (class,
  level, parent, free point, castle) and says why it refused one. Every number is in the table at the top of
  `src/talents.js`.

  The two ability tiles and any effects running on you sit above your health bar.
- **Hero levels**: your hero earns **experience** and rises from level 1 to **level 5**. The host pays it out for
  what the hero, or the army fighting beside them, brings down:

  | For | Experience |
  | --- | --- |
  | A swordsman, spearman or archer / a longbowman | 8 / 14 |
  | A knight or cavalryman / a lancer | 18 / 26 |
  | A giant / a rival lord's hero / a rival player's hero | 150 / 70 / 80 |
  | A ram / a catapult | 30 / 40 |
  | Veterans (per rank above the first) / rival heroes (per level above the first) | +12% / +15% |
  | A kill by one of your allies within 28 m of you | 40% of the above |
  | Every wave you live through | 10 |
  | Breaking an enemy gate / opening a breach / breaking a keep | 40 / 15 / 250 |
  | Taking the hill (King of the Hill) while standing on it | 25 |
  | A Healing Light that really mends others / a Rally Cry | 5% of the health restored (at most 40) / 3 for each ally reached (at most 24) |

  It takes 120, 320, 640 and 1100 experience in all to reach levels 2 to 5. **Every level** adds health (+7% of the
  class's), armour, a little speed, faster healing out of combat, abilities that recharge sooner and more damage with
  the sword, the bow and spells, mends 30% of your health and gives you a **talent point** (see **Talents**, above). The damage is sized so that **at level 5 a hero's
  best weapon hits a little harder than the best veteran soldier** (a rank-5 Lancer hits for 42): a Knight's sword
  goes from 34 to about 46, a Berserker's from 44 to 50 and a Ranger's arrow from 42 to 47 (the classes that already
  hit hard grow less in damage), while the casters' spells grow by a third. Your level stays through death and when
  you change class, and begins again in a new match. The bar under your health shows the way to the next level
  (purple, gold at level 5), `+XP` floats up under the crosshair, a banner and a flare mark each level-up, and your
  level shows on your name tag and the scoreboard. All the numbers are in `src/heroes.js`.
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
  come near and shuts the moment an enemy is at it (within 5.5 m). An open gate is an open gateway for everybody: an
  enemy (hero or soldier) who reaches it before it shuts walks straight in, and armies route through it while it stands
  open. It never shuts on anyone, friend or foe, standing in the gateway, and a broken gate lets everyone through. You, the lord, can always call your own gate open by standing within 6 m of it, to lead a sally against
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
  and if it dies a Cavalier gets a fresh one the next time they respawn. Any other class can buy one in the shop
  (Class tab, 400 gold).
- **Music and sound**: the game makes its own medieval music as you play, with no audio files: a lute, a
  recorder, a drone, hand drums and a war horn in the old church modes. It is calm during preparation and
  builds into drums and a war horn when enemies are close, you are hurt, or an army is at your gate. Browsers
  only allow sound after a click or key press, so the music starts with your first one.
- **Big map**: press **M** for a large live map with the terrain, roads and forests, every castle with its towers, gate
  and name, every soldier and engine, your armies' marching lines and your own position. The battle goes on while it is
  up, and the mouse is free while you look at it so you can click it (markers, below). Press **M** again, press **Esc** or
  click outside the map to close it and take the mouse back (opening the game menu closes it too).
- **Game menu**: **Esc** opens the standard menu: **Resume**, **Options**, **Controls** and **Quit to Main
  Menu**. In single player the world freezes; online, the battle goes on while you are in the menu. Esc again
  resumes (it closes the shop, Options or Controls first). **Options** has master, music and sound-effects
  volume, mouse sensitivity, field of view, the **Alerts and sounds** and **Tips** switches (below) and graphics
  quality, all remembered in your browser. The main menu has the same Options and Controls.

## Alerts and tips

The game tells you what needs you, even when you are looking somewhere else. All of it is worked out on your own screen
from what every player's screen already knows (castle parts, soldiers, engines, the hill, the wave clock and your own hero),
so it works the same in single player, as the host and as a guest.

- **Callouts** come down the left of the screen, each with an icon, a coloured edge (red danger, orange warning, green good
  news, gold information) and, when it happened somewhere, a pointer and the distance. "Your north gate is under attack!"
  (the gate, a wall or the keep losing health, named by the side of your castle it is on; once per part every 20 s),
  "Breach!" (a gate or wall falls), "Enemy army approaching from the north-east!" (five or more enemy soldiers or engines
  within 80 m of your castle, once, when they arrive, with the war horn), "Enemy battering ram spotted" (an enemy engine
  within 70 m), "Wave 4 marches in 10 s" with a tick for each of the last three seconds of the preparation and wave countdowns,
  "Low health" (under 30%, with a heartbeat that quickens; it mentions the potion, H, while you hold one), "Running low on
  arrows", "You have 400 gold to spend (B)" (250 or more unspent for 40 s while you are at your castle) and a faint tick
  when an ability with a long cooldown (14 s or more) is ready again. In King of the Hill the game's own messages about
  the hill (taken, lost, 60, 30 and 10 seconds to a win) get their sounds, and "The hill is contested!" a callout.
  North is up on the maps.
- **Kill streaks**: 3, 5 and 8 kills of your own within 12 seconds show "Killing spree", "Rampage" and "Unstoppable" with a brass fanfare.
- **Tips**: a slim hint line at the bottom of the screen (clear of the crosshair, the minimap and the health bars) shows
  one tip for nine seconds after about 25 calm seconds (nothing has hurt you for ten), and never more than one every 40
  seconds. There are about forty: controls, tricks for each of the six classes, climbing and ducking, the maps, orders and
  the Army tab, King of the Hill, upgrades and the shop, levels and talents, and (with a human ally in the game) pings. Tips about things you have already done are skipped, none comes
  round twice until every one that applies has been shown, and what you have seen is remembered in this browser. The
  respawn screen and the game-over screen show one too. The list is the `TIPS` array at the top of `src/alerts.js`. In Hero Game
  Mode (below) the gold, army, order, shop and castle-upgrade tips and the gold alert are left out, and hero tips (the way to
  win, the armies that come by themselves, talents, the fountain) come first.
- **While you look away**: when the tab is hidden or the window loses focus the game keeps a log. Something important (an
  attack, a breach, an army at the gate) flashes the browser tab's title ("⚔ (3) Castle under attack!") and sounds its
  alert, and when you come back a "While you were away" panel lists what happened for a few seconds: attacks, waves, kills,
  deaths, gold earned and any levels you reached. Browsers stop the render loop of a hidden tab, so an online game (host or guest) is stepped from a
  timer in 1/20 s slices meanwhile: a host who looks at another tab does not freeze the match for everybody. Single player
  simply waits for you.
- **Idle nudge**: after 25 seconds without touching anything while you are alive, "Still with us? Wave 4 marches in 0:21."
  and a soft chime, once per idle spell.
- **Options** has two switches: *Alerts and sounds* (callouts and their sounds, kill streaks, the nudge, the away panel and
  title flash) and *Tips* (the hint line and the tips on the respawn and game-over screens).

Code that wants to add an alert calls `game.alerts.raise(key, { text, icon, tone, sound, cooldown, away, pos })`: the same
`key` never fires twice within `cooldown` seconds, `tone` is `info`, `good`, `warn` or `danger`, `away` also puts it in the
away panel, `pos` adds the pointer. `game.alerts.tip(text)` shows a hint line, and `game.alerts.learn(flag)` tells the tips
that the player knows something now. The details are in the header of `src/alerts.js`, and the sounds (`alertLow`,
`alertDanger`, `tick`, `heartbeat`, `streak`, `chime`, ...) are in `src/alertsounds.js`.

## Big finishes

The end of a match is a short show, not a cut to a menu (`src/finale.js`). When the match is decided:

- **Slow motion.** In single player the world's step is really scaled: it eases down to about 0.3 in a sixth of a second, holds,
  and eases back to 1 over the last second, so soldiers, arrows and dust all slow together. Online nobody can slow the host's
  shared world, so only what you see and hear changes (the camera, the effects, the sound and the short wait).
- **The war horn** (`src/horn.js`, built from WebAudio nodes like everything else): a rising call and a long full chord over
  timpani for a victory, one low dark horn that sags at its end over a slowing heartbeat of drums for a defeat. The music is
  ducked under it and comes back, and the sounds of the world are dulled while time is slowed. (A shorter call sounds when the
  last rival keep falls but the match goes on, with a moment of slow motion in your own view; the horn that opens a battle and
  every tenth wave has the same brass voice now.)
- **The keep falls** (`src/castlecollapse.js`). The keep and the four corner towers are drawn again from the same shapes cut
  into blocks about 3 m across and roof patches; each block has a plan worked out once (the structure shakes and leans, the
  stone lets go from the top downwards, tumbles, lands in a ring of rubble and hops once), and a frame only evaluates the plan
  at the time `t`, so it is identical on every screen, takes a millisecond or two a frame while it plays, nothing afterwards,
  and uses three meshes in place of the keep's own. Dust clouds, fire bursts, a shock ring, a rumble and the camera shake come
  with it. A stump (with one tooth of wall left standing) and its rubble burn for the rest of the match, the same state a
  castle is redrawn in after a change of graphics quality.
- **The camera** frames the keep that decided it (the last rival keep for a victory, your own for a defeat) from the side you
  were on: high and wide at first, then pushing in over the wall and sweeping a little, under a letterbox (if you stand in sight of
  the keep, the first third of a second is your own view in slow motion before the cut); after the show it goes on drifting round
  the ruin behind the end screen. With no keep to look at (King of the Hill, a keep that fell long ago) the same slow motion, horn and
  banner play in your own view, shorter.
- **The banner** closes the show: Victory or Defeat and the best moment of the match, and the same line is the end screen's
  first section ("Moment of the battle").
- **Skip**: any key or click (after half a second, so that the blow that ended it does not skip it), or Esc, goes straight to
  the end screen. The end screen is built the moment the match is decided and waits see-through behind the show, so nothing
  that reads it is late. A concede, a lost connection and the practice yard have no show. Hero Game Mode has it when a keep
  decided the battle; a win on kills or on the clock gets the horn and the highlight line and the end screen at once.
  **Options → Big finishes** switches it all off.

The highlight line (`src/highlights.js`) is worked out from the match log (`src/matchlog.js`): gates, wall segments and keeps
remember who hurt them (a Fireball, a sword, a Smite, a catapult, a ram, the army), and the hero who did a fifth of the damage
or more is named before the army that did the rest. Lords slain, several foes to one sweep of an ability, the first blood and an
engine burned are recorded too, and a gate that held through the whole match is told when nothing better is. Each moment is
scored (a keep falling > a lord slain > a gate > a sweep ...; more when you did it, most when a named ability did) and the best
is put in words from your side: "Your Fireball broke the north gate at 8:42", "House Varr's army brought down your keep at
14:48". In an online game the host sends the notable moments with the end of the match, and every screen tells them for its own
player. Code that wants a moment in the line records a `matchlog` event of one of the types in the header of
`src/highlights.js`; code that hurts a gate, wall or keep passes the ability's name as the third argument of `takeDamage`.

## Battle Decrees and comebacks

**Battle Decrees.** When a battle ends, the game rolls one or two *decrees* for the next one: random rule changes such as
"Giants cost half" or "Double waves: every house sends twice the soldiers". The end screen shows them under **Next battle**,
each with its effect in a line, and two buttons: **Reroll** (key **R**; as often as you like, it is a hook and not a currency) and
**Classic battle** (play the next one without decrees). The main menu has the same row, and Play Again, Single Player and
hosting all start with what you saw. At the start of the battle a banner names the decrees, a line under the wave timer keeps
them in view, and the Esc menu lists them with their effects. The first battle you ever play is classic, and
**Options -> Battle Decrees** switches the whole thing off (no roll, classic battles) and back on. Decrees rule every house,
the AI lords included. Hero Game Mode and the practice courtyard have none.

| Decree | What it does |
| --- | --- |
| Giants' Bargain | Giants cost half |
| The Great Muster | Double waves: every house sends twice the soldiers (and has room for them) |
| Gold Rain | Income +50% (the trickle and every wave's wage) |
| Hard Winter | Soldiers cost 25% more and the waves come 25% less often |
| Swift March | Soldiers march 20% faster |
| Blood Price | Every kill pays double |
| Siege Season | Battering rams and catapults cost half |
| Iron Discipline | Barracks, Drill Sergeants and Elite Levies cost half |
| Smiths' Holiday | Swords, shields, bows, horses, potions and arrows cost half |
| War Chest | Start with 600 more gold, but earn 20% less |
| Cavalry Fever | Cavalry and Lancers cost 40% less |
| Heroes' Return | Heroes and lords rise in half the time; heroes walk 10% faster |
| Lean Times | Income -30%, but every kill pays 50% more |
| Long Siege | Waves come 40% less often and are 60% bigger |
| Eager Armies | Waves come 30% faster |
| Mercenary Fair | Soldiers cost 30% less, but kills pay 40% less |
| Masons' Holiday | Gate, wall, keep and tower works cost half |
| Archery Contest | Archers cost half |

The wave wage comes with each wave, so a decree that changes the pace changes the wages with it. Two decrees rolled together never push the same rule (a pace decree with a gold decree, never two of a kind), and a roll never
repeats the decrees of the battle just played. In the shop a price that a decree changed shows the usual price struck out beside
the new one. Online the host rolls and rerolls; the decrees travel to the guests in the start message (`options.decrees`), the
guests set the same rule modifiers and see the same prices, banner and line, and their end screen shows the host's roll read-only.

**How it is built.** `src/decrees.js` holds the catalogue (`DECREES`: id, name, icon, one-line text and the rule modifiers each
sets), the roll, the end-screen section (order 50) and the menu row; `Game.start` puts the decrees of `options.decrees` in force
as `mods` sources (`decree:<id>`, see `src/mods.js` for the keys and where each is read: wave size and gap, income, bounty, march
and hero speed, respawn time, starting gold, and the shop prices in `src/economy.js`). A new decree is one more entry.

**Comeback mechanics** (`src/comeback.js`, numbers in `COMEBACK` in `src/config.js`). Losing should be a fight, not a slow defeat.
All three rules are decided by the host and apply to the AI lords exactly as to people.
- **Underdog's wage.** From wave 3 on, every second the game weighs each house: the health of its keep, gate and walls, what its
  soldiers and engines are worth (their price, by health) and half its purse. A house far behind the average of its enemies
  (below 60%, until it climbs above 80%) is paid a bonus wage, 30% to 80% of what it already earns without fighting (the more it
  is behind the more it gets, about 60 to 200 gold a minute by mid-game), paid out in a lump every ten seconds. The HUD shows
  "Underdog's wage +N gold/min" beside the gold, and a toast explains it the first time.
- **Cheaper gate.** Rebuilding a gate that has fallen costs 750 instead of 1500 (stacking with decrees). The shop's Repair Gate
  card says so and shows both prices.
- **Last Stand** (**L**, or the glowing button above the minimap). Once a match, when your keep is below 25% of its health: your
  hero is healed and refreshed (and rises at once at the keep if it had fallen), and for 20 seconds your soldiers and your hero hit 30%
  harder and move 25% faster (the hero also takes 40% less damage for 10 s), and six militia rise in the courtyard. A war horn,
  golden rings and a flash across the screen mark it, a banner says so. The AI lords call theirs the moment their keep drops that low.
  Online a guest's L is sent to the host. There is none in Hero Game Mode (no gold, and a fallen keep ends the mode).

The log (`matchlog`, see its header) records `decrees` and `comeback` events (`underdog`, `gate`, `last_stand`, `stand_held`),
and the end screen adds a "Comeback" ribbon when they did something for your house.

## Rival lords

Every battle the three rival houses are led by **named lords with a style of their own** instead of three copies of the same AI: "Lord Varric
the Reckless" does not play like "Lady Morwen the Patient", so each match asks for a new plan. The lords are drawn at random when a match starts
(never two alike, and no house gets the lord it had last time); the house keeps its colour and its name (House Varr is the red one whoever leads it).

| Lord | Style | How to meet him |
| --- | --- | --- |
| **the Reckless** (Rusher) | Strikes at about 2:30 with swords and riders, guards the castle thinly and mends it late. | Hold the gate through the first push, then hit back at the thin walls. |
| **the Patient** (Turtler) | Raises walls, gate and towers first (its masons work cheap), calls the army home when a host stands at the gate, marches after about 8:30 with a big army. | Do not feed an army to the walls: break the others first, or bring engines. |
| **the Breaker** (Siege-lover) | Buys rams and catapults from about 2:30 on (its engineers work cheap), keeps spearmen with them and does not march without an engine. | Kill the engines before they reach the gate (riders and archers do it best). |
| **the Swift** (Raider) | Fast riders raid the field again and again, never for long, and leave the waves on their lanes. | Archers on the wall and riders of your own: raiders flee a fight they cannot win. |
| **the Gilded** (Merchant) | Invests before it fights: Elite Levies, Drill Sergeants, a bigger barracks and thick walls first; marches after about 8 minutes, with waves that are better trained than yours. | Hit early, before the levies pay off. |
| **the Vengeful** (Zealot) | Every wave, engine, giant and push marches on the human houses and nobody else. | Stand your gate: the other houses are left in peace. |
| **the Ironclad** (Warlord) | Few soldiers but knights and veterans, promoted early, the lord at their head. | Archers and engines hurt plate best; stay out of the open. |
| **the Giantsworn** (Giant-caller) | Saves every coin for a giant (its retinue pays two fifths), keeps a thin guard and calls the next one when the last has fallen: one every few minutes. | Kill the giant (600 gold) or hit the thin guard while the next one is paid for. |
| **the Cunning** (Opportunist) | Drills its men and waits until a castle is broken (a gate down, a keep burning), then pounces on the wreck. | Do not leave your gate broken or your keep burning. |

Each lord has six names (three Lords, three Ladies) to go with the epithet. They are shown wherever a lord is named: a **card at the start of the
match** with each rival and how he plays, a small tag next to every house in the top-left list ("House Elden  Patient"), the **Rival lords** list in the
game menu (Esc) with a plan against each, the scoreboard (**Tab**), the big map (**M**) under each castle, the announcements ("Lord Varric the Reckless
charges out against House Elden!", "Lord Brokk the Breaker sends a battering ram against ..."), the kill feed, and the online lobby's AI slots. The end screen
has a **Rivals next battle** row (with *Draw other lords*) and says how the rivals fared this time; **Play Again** starts with exactly the lords it showed.

**Options -> Named rival lords** (On by default, remembered in this browser) switches them off: every house then has the plain old lord ("Lord Varr", "Lady
Elden", "Lord Sol") whose numbers are the ones the AI always had. The difficulty stays the strength scale (Easy, Normal, Hard make every lord slower or
quicker to attack, in the same way); the lords differ in style, not in cheating (the Patient's masons, the Breaker's engineers and the Giantsworn's retinue
each pay a share of what their plan buys, which is what keeps those plans a match for the others). Bot-versus-bot matches were used to tune them so that no lord
is far ahead of or behind the rest. Online, the host draws the lords and sends the ids in the start message
(`options.rivals`), the guests only show them; a player who leaves is replaced by the plain lord. Hero Game Mode and the practice courtyard have no rival
lords.

For modders: a personality is a table of parameters in `src/rivals.js` (the key list is in its header; `CLASSIC` is the old lord), played by `LordAI` in
`src/ai.js`; `options.rivals[team]` is `''`/`'classic'` for the old lord or an id like `rusher` or `rusher3` (the digit picks the name). A lord's waves follow
his style too (`Game.waveList`). `src/rivalsui.js` is everything the player sees. The match log records `rival`, `push` and `rivalFell` events.

## Hero Game Mode

Three heroes against three, fought out of **one castle each**: Blue (yours) against Red. You play one hero; your two
Blue team mates and the three Red heroes are bots (`src/herobot.js`), each a full hero with a class, levels, talents and
abilities. The other two castles of the map stand empty: no lords, no soldiers, no waves. This round the mode is single
player only: with Hero Mode chosen, the Multiplayer button is disabled and says so.

Everything but your hero is taken away. There is no gold, no shop, no castle upgrades, no army and no orders, and you
cannot change class. You move, strike, guard, shoot, use **Q** and **R**, drink, ride, climb, duck, look at the map, ping
and spend your **talents**. The armies march by themselves: both castles send a wave every 30 seconds (after a short
preparation), each round tougher than the last (tougher soldiers, elite levies and training tiers, then rams and
catapults), the same for both sides, so a match always ends. A hero who falls rises again at their own keep after 8 seconds
(3 more for every earlier death, 24 at most), is untouchable for 2 seconds, and mends quickly near the keep (the fountain: 8% of
their health a second within 16 metres, which also refills stamina, arrows and a spent healing draught); experience comes
1.5 times as fast as in the war modes, because the match is short. The numbers are the `HERO` table in `src/herogame.js`.

**The rounds.** The first army marches after 30 seconds, then one every 30 seconds from each keep. Soldiers get 6% tougher with
every round and hit gates, walls and keeps 6% harder; Drill Sergeants' training arrives from round 5 (a step every 5 rounds), a
barracks upgrade from round 6 (a bigger army, one more soldier per wave) and an elite in every wave from round 8 (a knight, then
a rider, then a lancer); rams and catapults roll out as in the war modes. Both houses get the same, so by round 20 (ten minutes)
a soldier has about 3.4 times the health and damage of a round-one soldier and a wave is five times as big.

**The bot heroes** (`src/herobot.js`) play like a careful human: they walk the road behind their own soldiers and never run ahead
alone, melee classes close in, the Ranger and the casters keep their distance, the Cavalier rides through its target, a wounded
rival is picked first and the guard goes up against blows and arrows they can see coming. Q and R have rules per class, they retreat
to the keep below 30% health, drink their draught, come back at 70 to 85%, hit the enemy gate and keep when no one is left to
fight, and spend their talents from a list for each class. Reaction time, aim and how often they decide scale with the difficulty.
They do not climb, duck or drive engines.

**Three ways to win**, chosen in the menu: pick *Hero Mode* in the Mode row and a second row offers them (the last choice is
remembered in your browser):

- **Hero kills**: the first side to **25 hero kills** wins. A hero kill is a hero who falls to the other side, to a hero,
  a soldier, an engine, whatever hit last.
- **Castle**: destroy the enemy keep. Hero kills only count on the scoreboard.
- **Timed**: **20 minutes** of battle (the clock starts when the first army marches). The side with more hero kills wins,
  then the stronger keep; if those are level too, it is a draw.

In every way of winning, a keep that falls ends the match at once, and no match runs past **30 minutes** of battle (a warning
comes 5 minutes before): then it is decided as the timed mode is, on hero kills, then keeps.

**Controls.** **B** or **N** open the **Talents** panel and nothing else: the shop with only its Talents tab, no gold and no
other tabs. In single player the world waits while it is open, and closing it gives the mouse back as usual. **O**, **F1-F4**,
**Z**, **X**, **V**, **T**, **Y**, **G**, **F** and the class switch do nothing, and the key hints and the Controls sheet leave
them out and list the Hero Game Mode keys. **M** (the map), pings, **Tab** and **Esc** work as usual, and **Enter** is Ready:
the 30 seconds before the first round can be skipped like the war modes' minute. There is nothing to concede here (a keep that
falls ends the match) and the Short / Standard length does not apply.

**The HUD.** The orders bar, the army line, the gold box, the castle list and the hill box are gone. A panel at the top centre
shows the score (Blue's hero kills : Red's), the goal of the chosen mode, the battle clock (the time left in the timed mode), the
round with the seconds to the next army ("Prepare: 24 s" during the preparation), and both keeps and gates as slim bars. A roster
of the six heroes sits at the top left: class icon, name, level, kills/deaths and a health bar, or "respawn 7 s" while down, with
your own hero highlighted. Your health, stamina, level and experience bar, abilities, potions and the talent-point hint stay.
**Tab** shows the score and a table of the six heroes (side, hero, class, level, kills, deaths, status). A callout says when a
hero falls ("Enemy hero slain: 12/25", "Your ally Mara was slain"), and the end screen gives the reason, the score and what each
of the six did (class, level, kills, deaths).

Code: the rules (`HeroMode`: the sides, respawns, fountain, kill count, the three wins and `escalate` for the rounds) are in
`src/herogame.js` and the bots in `src/herobot.js` (a bot is a remote `Player` with `isBot` and a `bot`, steered through the same
movement, swing, shot and ability paths as a person); `Game.start` switches the mode on when the setup has
`hero: { win: 'kills' | 'castle' | 'timed' }`, and `game.hero` is null in every other mode. The menu, HUD and
controls read `game.hero` (`index.html`, `src/ui.js`, `src/main.js`, `Game.handleInput`).

## Biomes and seeds

The same battlefield (castle sites, roads, the hill in the middle, the valley and every height) can be dressed four ways, each with one small rule twist. The
**Land** row of the menu (and the host's lobby) picks the biome; **Seed** varies the land inside it. Heights, castles, gates and the hill never change, so a
biome never makes the war easier to read or harder to reach.

| Biome | Look | Twist |
| --- | --- | --- |
| Meadow | the classic land (seed 0 is exactly the old arrangement) | none |
| Snow | white ground and drifts, frozen ponds, snow-laden pines and bare birches, pale overcast sky, falling flakes, snow on the castle roofs | **Deep snow**: soldiers off the roads march 12% slower; the roads, the castle yards and the hill in the middle are trampled |
| Marsh | mud, standing water and reeds, dead and mossy trees, green-grey mist that hides the far hills | **Fens**: the mist cuts archers' range by 20%, and soldiers wading through a pond (the dark water you can see) march 22% slower |
| Desert | sand and bands of dunes, red sandstone mountains, palms, cacti and dry shrubs, a hot orange haze and a long clear sight, drifting dust | **Scorching sun**: a hero's sprint drains stamina 50% faster and it returns 35% slower |

The opening banner names the twist, and the Esc menu keeps it in view (a box above the Battle Decrees in force).

**Seeds** (0 to 999999) move the trees, the rocks, the forest on the mountains and the colour patches and ponds of the ground. Seed 0 is each biome's classic
arrangement; a random seed gives a new arrangement every time. Nothing is placed on a road, in a castle's yard or on the hill, whatever the seed
(`okForProp` in `src/scatter.js`), and the same biome and seed always build the same world: nothing in a build uses `Math.random`, so the host and its guests
each build their own copy from the `biome` and `seed` of the match options. Types of land the game does not know (an older client) play as the meadow.

**Choosing.** The first battle is the classic land. After it the choice turns to **Random** (unless you picked a biome yourself): every battle ends with the land
as the second half of the **Next battle** panel of the end screen, right under the Battle Decrees (the two share one frame): a little picture of the land that comes
next, its name, its twist, and a **Reroll land** button (a fixed biome only rerolls its seed). Hero Game Mode has no decrees, so there the land is the whole panel.
Play Again and Quick Play start on what the preview shows. The page also opens on `?land=snow:4321` (a biome and a seed), which is also how to share a land. The
practice courtyard is always the meadow. Online, the host picks and the guests see it in the lobby (their end screen says that the host picks the next land);
Hero Game Mode takes biomes too.

**How it is built.** `src/biomes.js` is the table of everything a biome changes (the ground colours and the splat shader's palette, the haze, the sun and sky
light, the plants, the grass, the weather, the twist) and the land state; the world is built after `setWorldLand(biome, seed)` (main.js `ensureMap` builds it
again when the biome or the seed differs). The colours of the splat shader are uniforms, so every biome shares one program; the fog is a linear `THREE.Fog`
whose colour and near distance carry the haze tint and the murk (see `atmosphere.js`). The twists are mods like the decrees' (`offroadSpeed`, `mudSpeed`,
`archerRange`, `staminaDrain`, `staminaRegen`, each its own source `biome:<id>`, see `src/mods.js` and `src/biometwist.js`), so they multiply with the decrees' keys
wherever both apply: Swift March (+20%) in the snow is +20% along the roads and +5.6% across open ground. `src/landui.js` has the menu row and the end-screen
section; `src/weather.js` the flakes, the
mist banks and the dust (written into the smoke layer of the effects: no extra draw call); `src/biomedust.js` the snow on the castles.

## Renown, unlocks and records

Every match you play to its end earns **Renown**, won or lost, and the end screen says how much and how far it takes you
("340 / 500 to unlock the Wolf banner"). Renown only ever accumulates: it has no deadline, nothing to keep up and nothing that
can be lost, and what it unlocks is for show or a different choice, never for power, so a new player is never behind. It all
lives in your browser (`localStorage['cw-progress']`, one versioned JSON object; a damaged or missing record is a fresh account,
a browser that keeps nothing plays on with the account in memory for the visit). Delete that key to start again.

**What a match is worth** (`RENOWN` in `src/progress.js`, shown on the end screen as "The fight 30 · Time held 53 · Waves 39 ·
Kills 18 · Victory 50"): 30 for the fight (in full from the fourth minute), 3.5 for each minute held (up to 25), 1.5 for each wave
(up to 30), 0.6 for each kill of yours (up to 100) and 50 for a victory, times 0.8 on Easy, 1 on Normal, 1.2 on Hard. That is about 80
to 250 for an ordinary match, so the first unlock comes in two or three. The match is counted once, when it ends; a conceded or
lost match counts, a match you leave or reload before it ends does not, and the practice courtyard grants nothing. Hero Game Mode
counts like the others (its rounds stand in for waves, and it has no gold or army).

**The unlock track** (`src/unlocks.js`): 18 steps in a fixed order, so there is always exactly one next unlock and a bar that only
fills. A step costs the Renown shown (counted from the previous step; what you earn beyond it carries over): Raven banner 250,
Wolf banner 500, Crimson Mantle 450, Stag banner 500, and so on up to 900, 11,250 in all.

- **Banners** (Raven, Wolf, Stag, Boar, Dragon, Bear, Crown, Rose): an emblem painted on the hanging banners, flags and levy
  standards of your castle (the field stays your house colour, so houses can still be told apart) and a plaque on your
  first-person shield. `src/emblems.js` draws them with canvas paths; there are no images.
- **Cloaks** (Crimson Mantle, Greenwood Cloak, Wolfskin Mantle, Midnight Cape): a cloak on your hero's body, which the other
  players see. In first person you cannot see your own back, and in single player nobody else is looking, so the Renown panel
  shows it on a small figure.
- **Alternate capstone talents**, one for each class, in the capstone's own place in the talent tree. Each costs one point like
  the capstone it can stand in for, replaces it (a hero has one or the other, and Respec lets them change their mind) and is a
  **sidegrade**: a different effect that is no bigger than the original's (`ALT_TALENTS` and its numbers, in `src/talents.js`).
  Knight, *Bastion Strike* (instead of Avenging Wall): 30% of every melee blow taken under Bulwark is stored, and when Bulwark ends
  the shield slams down and the store strikes the foes around (about what Avenging Wall hands back during it, at once and to
  the one who struck, here shared out and with a stagger). Berserker, *Blood Tithe* (instead of Reaper): the last strike of a Whirlwind heals 8% of your health if it hits
  anything (Reaper gives 1.5% for each foe, each strike). Ranger, *Steady Aim* (instead of Second Wave): 90% of a volley's arrows
  seek out a foe, not 70%. Mage, *Cold Snap* (instead of Shatter): when the ward breaks, the next Fireball within 6 s hits 50%
  harder. Cleric, *Mercy* (instead of Second Dawn): Healing Light heals those below 40% health 60% more. Cavalier, *Shieldwall
  Charge* (instead of Vanguard!): allies within 20 m, and you, take 20% less damage for 5 s after a charge. They show in the talent
  tree, under the capstone, only for an account that has earned them (and in the practice yard, where anybody may try them), and
  they stay out of the lists that walk the tree (bots, the practice yard's "All talents").

A new banner or cloak is put on at once if you wear nothing in its place (so it is seen in the very next battle, even if you
never visit the menu); what you chose to wear is never swapped.

**The Renown button** on the main menu (next to Options) opens the panel: your Renown, the next unlock with its bar, every banner,
cloak and capstone (the locked ones say how much Renown they still need), what you wear with a small preview (click an unlocked
card to wear it, "House" and "None" take it off), the mastery rank of each class and your records. A dot on the button counts
unlocks you have not looked at.

**On the end screen** two sections (`src/endprogress.js`, registered with `registerEndSection`): *Your battle* shows kills, the
longest run of kills without falling, damage dealt, waves, army kills, gold, deaths and time, each with your best beside it, and
"New best: 47 kills!" with a flourish when a record falls (the first match sets its records quietly), then the mastery of the
class you played rising ("Knight rank III → IV: Sergeant!"); *Renown* shows what the match earned and how it adds up, the
unlock if the bar was filled, and the bar towards the next one. The counters (damage, streak, gates and walls broken, heroes
slain, engines destroyed, keeps felled) come from small hooks in `Game.damage` and the `on...` handlers (`src/stats.js`); a
guest is sent its own numbers by the host with the end message.

**Class mastery**: each match adds mastery points to the class you played (shared by the time spent in each, if you changed
class on the way): 20 for the match, 1 per kill, 1.2 per wave, 2.5 per minute, 30 for a victory. Ranks I to X (Squire, Footman,
Veteran, Sergeant, Captain, Champion, Banneret, Marshal, Warden, Warlord) begin at 0, 100, 250, 450, 700, 1000, 1400, 1900, 2500
and 3200 points; a rank rises on the class's button in the menu and the lobby as a small numeral. Mastery opens nothing: it is a
record of how long you have fought as that class.

**Online.** Each player's look (banner, cloak and the capstones they have earned) travels in the lobby entry as `cos`
(`{ banner, cloak, alts }`, ids only, cleaned on receipt) and in the start message, so every screen draws your banner on your
castle and your cloak on your hero; the host lets a guest learn an alternate capstone only if the guest's entry says they have it.
Bots and AI houses keep the default look. Your account is yours alone: nothing is shared between players.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space | Move / sprint / jump |
| Space (at a castle wall) | Jump at a castle wall from outside, or at the edge of the wall walk from its courtyard, to climb up and over the battlements onto the wall walk (a prompt shows when you can; an enemy's wall is slower and costs more stamina) |
| C (hold) | Duck: your head and hitbox drop (arrows fly over you, a merlon covers you), you move at half pace, and you can't sprint or jump |
| Mouse | Look |
| Left click | Swing your sword (hold to keep swinging); with the bow, hold and release to shoot |
| Right click | Block with your shield (stops blows from in front; just as a blow lands, it parries); zoom with the bow |
| 1 / 2 / mouse wheel | Sword & shield / bow |
| Q | Class ability: attack (Ranger: hold to place the volley circle, let go to loose it) |
| R | Class ability: defence |
| H | Drink a healing draught |
| E | Use the gate lever when next to it; take over an abandoned siege engine (or one of yours) beside you; otherwise mount, dismount or call your horse |
| W / S / A / D, left click, E (inside an engine) | Roll / turn / strike or fire / climb out |
| O | Orders menu (click to command troops) |
| B | Open the shop (the Army tab is where you choose garrison, army and lane; the Class tab switches your hero class, at your own castle) |
| N | Talents: the shop on the Talents tab (press again to close) |
| U | Co-op Conquest: call the first fallen ally back to life for 500 gold (the bar under the shop's tabs has a button for each) |
| L | Last Stand, once a battle, when your keep is below 25%: you are healed, your soldiers hit harder and march faster for 20 s and militia rise at the keep (the glowing button does the same) |
| R (end screen) | Roll the next battle's Battle Decrees again |
| P | Practice courtyard only: the practice panel (hero class, level and talents; soldiers by rank and tier; dummies) |
| M | Big map (the mouse is free while it is up; press again to close) |
| Middle click | Ping what the crosshair is on: a foe or an enemy castle part is **Attack** (red), your own castle or an ally is **Defend** (blue), plain ground is **Go here** (gold). Allies see it |
| Middle button (hold) | Marker wheel round the crosshair: move the mouse towards Go here / Attack / Defend / Danger / Need help and let go to place a marker there; let go in the middle for the ordinary ping |
| Map click | On the big map or the HUD minimap, while the mouse is free: left click puts down a marker of the kind chosen in the palette beside the big map, right click removes your nearest one |
| Tab | Scoreboard |
| Any key or click | At the end of a match: skip the ending (slow motion, the horn, the falling keep) and go straight to the results (see Big finishes) |
| F1 or Z | Army: follow me |
| F2 or X | Army: hold the position you're looking at |
| F3 | Army: charge |
| F4 or V | Army: defend the castle |
| T | Army: assault the selected target castle |
| Y | King of the Hill: army takes the hill in the middle and holds it |
| G | Choose which group gets orders: everyone / infantry / archers / cavalry |
| F | Cycle formation: line / shield wall / loose |
| Enter | Ready: end the first preparation now (online: when everybody has pressed it). On the main menu: Quick Play |
| K | When the battle is decided (offered in the HUD and the game menu): concede and start the next one, or finish a war you have won. Press twice to confirm |
| Space / Enter (end screen) | Play Again (online, the host's Rematch) |
| Esc | Game menu: resume, options, controls, quit (closes the shop or a panel first) |

In **Hero Game Mode** (below) only some of these work: B and N both open the Talents panel (and nothing else), and O, F1-F4,
Z, X, V, T, Y, G, F and K do nothing (Enter is still Ready).

**Pings and markers.** Team mates can call out targets and places. A **ping** is a quick middle click on whatever the
crosshair is on and lasts about 6 seconds; a **marker** (the held-button wheel, or a click on a map) lasts 45 seconds,
at most 3 per player (the oldest is replaced, and placing within 3 m of one of yours renews it). Each shows as a pulse on the
minimap and big map, a beacon with an icon and a distance in the world, an arrow at the edge of the screen when it is out of
view, a toast ("Gwen: Attack here!") and a sound that differs for each of the five kinds, and carries the colour of
whoever placed it. You always see your own (in single player it is a personal waypoint); online the host checks each one
(shape, range, and a rate limit of 1 per 0.6 s and 8 per 10 s per player) and passes it on to your allies only, so in
Versus nobody else sees it and in co-op the whole side does. The numbers are in `PINGS` in `src/config.js`.

Stairs on both sides of the courtyard lead up to the wall walk, which goes all the way around the castle and into the corner towers.

**Climbing and ducking.** The walls are 8 m high, far past a jump, so a hero who stands at the foot of a wall on the outside
and jumps at it (Space, facing it, within about a metre and a half) scrambles up it and mantles over the battlements onto the
wall walk. The hero goes over through a crenel, the gap between two merlons nearest to where they stand, never through the
stone. From the courtyard the same jump takes you up onto the edge of the wall walk (not from underneath its planking). On your
own (or an ally's) walls it takes about a second and 20 stamina. An **enemy's** wall can be climbed too, but it takes about
1.7 times as long and 35 stamina (`BODY.enemyClimb` in `src/config.js`), and the defenders get their chance: a solid hit (a
heavy blow, or an arrow or blow worth more than 8% of your health) knocks a climber off any wall until they are over the top.
Not on a breach, not while ducking or mounted. A "Space: Climb onto the wall walk" (or "Climb the enemy wall") prompt shows
when it will work, and other players see the climb. Holding **C** ducks: the head and the hitbox
drop from 1.8 m to 1.2 m, so an arrow aimed at head height flies over and a merlon (1.3 m) covers the whole hero, at the cost of
walking at half pace; a ducked hero can't sprint or jump. Other players see the crouch on the hero's body.

## Between matches

The gap between two matches is as short as it can be: nothing reloads, and what you chose last time is what starts next.

- **Quick Play** is the big gold button on the main menu. One click starts a single-player match with your last class, mode
  (Conquest, King of the Hill or Hero Mode), map size, difficulty and length; the small line under it says what that is
  ("Knight · Conquest · Medium · Normal"). Enter on the main menu does the same. Difficulty and mode are remembered in
  `cw-last`, the class in `cw-class`, the map in `cw-map`, the length in `cw-options`; a first visit opens on the defaults.
- **Play Again** is the biggest button on the end screen (Space or Enter also press it), with a small **Change class**
  beside it that opens the class picker right there (the choice is remembered and the next match uses it) and a quiet
  **Main menu** link. The page does not reload: a world is built for one match only (castles, soldiers, engines and upgrades
  are all spent by the end), so the next one is built while the end screen is up, a couple of seconds after the match ends,
  and Play Again only has to start it. Menu to match and end screen to match are both a single click. After a finishing
  show the world waits for the show, and the keys of the end screen for the moment it comes into view (the key that skips the
  show is never also Play Again). The row of buttons sticks to the bottom of the end card, however many sections it has.
  `src/flow.js` and `ensureMap` / `freshWorldSoon` in `src/main.js`.
- **Online**, the host's end screen has **Rematch**: everybody who is still in the room goes back to its lobby (same room,
  same lords; the room stays locked, so nobody new can join), picks classes again and the host starts the next battle.
  Guests see "Waiting for the host…" with **Change class** (sent to the host) and **Leave the room**.
- **Ready** (Enter, the button in the top panel or in the shop) ends the first preparation early by the same path as the
  timer running out. Online every lord has to press it ("Ready 2/3" shows in the panel); a lord who leaves counts as
  ready, a bot hero always is, and the timer still ends the preparation by itself. The Hero Game Mode's 30 seconds can be
  skipped the same way; the practice courtyard has no preparation.
- **Concede / Next battle** (K, twice to confirm, or the button in the game menu) is offered, never forced, when a battle is
  decided: your keep has fallen; or you are one of the last two castles and the other is clearly winning (the rule and the
  numbers are `DECIDED` in `src/flow.js`; not while your Last Stand can still be called, that comes first); or, the other way round, you are clearly winning, and the button says **Finish
  the war** (a victory at once). Conceding ends the match as a defeat with its own end screen (it skips any finishing show).
  Online, a lord who is out may **Leave · Next battle** while the war goes on for the others; the host never ends a battle
  for friends who are still in it. None of this applies to the Hero Game Mode, whose match ends when a keep falls.
- **Match length** (Standard / Short, a row under the difficulty and in the host's lobby, `options.length`). Short is a
  **timed war**. Its tempo is faster, by a `mods` source named `length:short`: a shorter preparation (36 s), a wave every 21 s
  instead of 30, and soldiers and engines that grow tougher a quarter quicker. And at **12:00 of play the strongest house
  wins**: the castles that still stand, then the health of their keeps, then the kills, then the soldiers alive (a dead heat is
  a draw; allied lords count as one side). A war that is won sooner ends sooner; the top panel shows the time left, with a word
  of warning at three minutes and at one. Why a clock and not the pace alone: in bot-vs-bot wars (see `LENGTHS` in
  `src/config.js`) the lords hold out, with the comeback rules even more than before: the first castle of a Standard war fell
  after about 12 minutes and only two wars in six were over within 30, while in Short wars the clock decided all six. A
  faster pace brings the early war forward but not the end of it, so only a clock guarantees an end. Standard has no clock: it is the war as it always was.
  The Hero Game Mode (its own timed match) and the practice courtyard keep their own pace.

## Code layout

| File | Purpose |
| --- | --- |
| `src/config.js` | All balance numbers: unit stats, prices, waves, difficulty |
| `src/game.js` | Game state, army waves and lanes, economy, kills, respawns, win and loss |
| `src/aimring.js` | The circle on the ground that shows where the Ranger's volley will fall (and stays marked while it lands) |
| `src/practice.js` | The practice courtyard: the walled yard, the training dummies and what they count, the soldiers sent in by kind, rank and tier |
| `src/practiceui.js` | The practice panel (P), its readout and the HUD box, and the floating damage numbers |
| `src/hill.js` | The hill in the middle: the banner, and in King of the Hill the capture, scoring, gold and win |
| `src/pings.js` | Pings and markers: the crosshair ray and what it hit, the marker wheel, map clicks, the beacons and edge arrows, the sounds, and the host's checks and relay to allies |
| `src/castle.js` | Castle construction, breakable gate, walls with merlons, climbable towers, keep, wall-walk posts |
| `src/upgrades.js` | What every upgrade level looks like: wall stone, gate ironwork, tower archers, racks, standards |
| `src/units.js` | Soldier and cavalry AI, combat and animation |
| `src/models.js`, `src/shapes.js`, `src/modelkit.js` | Soldier, horse and hero rigs (joint groups, two-segment limbs), their poses, and the catalogue of parts they wear (helmets, armour, weapons, shields, heraldry) built from primitives with baked shading |
| `src/crowd.js`, `src/unitmat.js`, `src/unittex.js` | Every soldier, horse and hero body drawn as instances of shared shapes (a few batches, not hundreds of meshes); the one shader they share and its face and emblem atlases |
| `src/nav.js` | Routing around castles and through gates and breaches |
| `src/siege.js` | Battering rams and catapults: crews, abandoned engines, takeovers, driving |
| `src/classes.js` | The six hero classes: stats, abilities, buffs |
| `src/heroes.js` | What makes a hero strong: class, level (experience, per-level growth) and talents, merged by `heroMods` |
| `src/talents.js` | The talent trees (every number and effect in one table) and the rules for learning and respeccing |
| `src/talentui.js` | The shop's Talents tab, the "Talent point available" hint and the learnt icons beside Q and R |
| `src/player.js` | First-person hero: movement, sword and shield, bow, horse, climbing, view-model |
| `src/combat.js` | The melee numbers: the hero's swing, the parry window, what a block costs, the look of each swing |
| `src/magic.js` | Fireball and Smite effects: bolts, flashes (the fireball itself flies via `projectiles.js`) |
| `src/grass.js` | Wind-swept grass that grows around the camera |
| `src/ai.js` | Rival lord strategy: spending, repairs and pushes, in the style of the lord's personality (the classic lord's numbers are the old ones) |
| `src/rivals.js`, `src/rivalsui.js` | The rival lords: the nine personalities (a table of parameters each, their names and plans), the roll, and what the player sees (the card at the start, the game menu list, the HUD tag, the end-screen row, the Options switch) |
| `src/teams.js` | Who fights whom: co-op sides |
| `src/economy.js` | Shop items, shared by the player and the AI |
| `src/decrees.js`, `src/comeback.js` | Battle Decrees (the catalogue, the roll, the end-screen "Next battle" panel) and the comeback rules (underdog's wage, cheaper gate, Last Stand); both work through `src/mods.js` |
| `src/world.js`, `src/textures.js` | The roads, where the solid trees and rocks stand, the centre piece, the sky and lights hooks; procedural textures |
| `src/terrain.js`, `src/landscape.js`, `src/terrainmat.js`, `src/terraintex.js` | The land: culled chunks that follow the physics heights exactly, the far mountains beyond the play area, the ground shader (grass, soil, road ruts, rock strata, snow) |
| `src/foliage.js`, `src/foliagegeo.js`, `src/scenery.js`, `src/grass.js` | Trees and rocks as instanced models in three levels of detail with wind, the forest on the mountains, the grass that grows around the camera |
| `src/biomes.js`, `src/landui.js`, `src/scatter.js`, `src/roads.js`, `src/biometwist.js`, `src/biomedust.js`, `src/weather.js` | Biomes and seeds: the table of what a biome changes and the land state, the menu row and the end-screen preview of the next land, where the solid trees and rocks stand (a pure function of the land), the roads, the twists, the dusting of the castles, the flakes and the dust |
| `src/foliage.js`, `src/foliagegeo.js`, `src/treecards.js`, `src/scenery.js`, `src/grass.js` | Trees and rocks as instanced models in three levels of detail with wind, the forest on the mountains (its far trees are painted cards that stand on the slope: treecards.js), the grass that grows around the camera |
| `src/castlegeo.js`, `src/castletex.js`, `src/castlefx.js`, `src/parts.js`, `src/props.js`, `src/materials.js`, `src/siegegeo.js` | How castles and siege engines look: static geometry merged by material, relief stone and timber, torches, banners in the wind, props, the engines' few meshes |
| `src/viewmodel.js`, `src/vmkit.js`, `src/vmgeo.js`, `src/vmweapons.js`, `src/vmmat.js`, `src/vmtex.js` | The first-person kit: arms, hands, weapons and shields of the six classes, their motion, the swing trail |
| `src/fx.js`, `src/particles.js`, `src/fxtex.js`, `src/groundfx.js`, `src/camfx.js` | Effects: GPU particles and ground marks, the ability glyphs, and the camera (shake, kicks, field-of-view punch, colour drain on low health, death fade) |
| `src/atmosphere.js`, `src/shadows.js`, `src/post.js`, `src/gfx.js`, `src/quality.js`, `src/shaderhook.js` | The renderer: sky, fog and the tone curve, the two shadow cascades, the HDR post passes, the frame path and adaptive resolution, the quality tunables `Q`, and the helper that lets several modules extend one material's shader |
| `src/perf.js`, `src/perfutil.js` | The profiler overlay (backquote or `?perf`) and the seeded benchmark `window.__bench` |
| `src/herogame.js`, `src/herobot.js` | Hero Game Mode: the rules (the two sides, respawns and the fountain, the hero-kill count, the three ways to win, the `HERO` table) and the AI that plays the bot heroes |
| `src/ui.js`, `index.html` | HUD, shop, minimap, menus (main, game menu, options, controls) and lobby; the Hero Game Mode HUD, roster and scoreboard |
| `src/flow.js` | The gap between matches: what Quick Play starts, the end screen's actions (Play Again, Change class, Rematch), Ready, and the offer to concede or finish a decided war |
| `src/settings.js` | Volume, sensitivity, field-of-view and alerts/tips settings, kept in the browser |
| `src/alerts.js` | Callouts, kill streaks, tips, the idle nudge, the away log and the background ticker for hidden tabs; `raise(key, {...})` is the way in |
| `src/alertsounds.js` | The sounds of the alerts (bells, brass, ticks, heartbeat), added to the registry in `audio.js` |
| `src/audio.js` | Sound effects and the volume buses |
| `src/horn.js` | The war horn of the ending (victory fanfare, defeat dirge, the call of the last keep) and the ducking of the music under it |
| `src/music.js` | The procedural medieval music: lute, recorder, drone, drums and horn |
| `src/finale.js`, `src/castlecollapse.js`, `src/highlights.js` | The ending of a match: the show (slow motion, camera, letterbox, banner, skip), the falling keep and towers (blocks with a plan each), and the highlight line |
| `src/physics.js`, `src/projectiles.js` | Terrain and colliders (including the merlons), arrows and boulders |
| `src/net.js`, `src/peernet.js`, `src/roomnet.js`, `src/netsync.js` | Online play: connection (own server, browser-to-browser, or claude.ai live room), snapshots from the host, and pose/actions from clients |
| `src/progress.js`, `src/unlocks.js`, `src/stats.js` | The account (Renown, unlocks, mastery, records) and its maths and storage, the unlock catalogue and track, and the per-match counters the end screen reads |
| `src/endprogress.js`, `src/wardrobe.js`, `src/cosmetics.js`, `src/emblems.js` | The end screen's battle and Renown sections, the menu's Renown panel, the pictures of what is unlocked, and the banner emblems painted on canvas |
| `server/server.js` | Node server: serves the game and relays messages between players in a room |

Three.js r160 is vendored in `vendor/` (MIT licence), so the game runs offline.

## Validation

Run `npm ci` and `npm test` with Node.js 18 or newer. The tests exercise malformed requests,
normal WebSocket room flows, and complete live-room snapshot reassembly, including large battles,
Unicode payloads, reordered updates and missing chunks. The live-room transport is tested with a
mock room API; testing the claude.ai integration itself requires an authenticated artifact session.

## Performance

- Soldiers, horses and heroes are drawn as instances of shared shapes (rich near the camera, plain farther, one static
  model far away), so 150 of them cost about a hundred draw calls; castles are merged by material, the land is culled
  in chunks, and trees, rocks, arrows and grass are instanced. Crowds, engines and the first-person kit cast shadows
  into the near shadow map only, drawn there as their plainest model. The profiler overlay (backquote) shows where a
  frame goes.
- Grass regrows a slice at a time across frames, effect shaders are compiled at match start, and soldier
  models are prepared in the background during the preparation minute, so nothing stutters on first use.
- Online, other players and soldiers are interpolated between the host's updates for smooth movement, and
  shop purchases show instantly while the host confirms them.
- Mouse look uses raw input where the browser supports it.
- Edges are smoothed by 4x multisampling of the scene target plus FXAA at High and Ultra and by FXAA alone at Medium; the canvas itself has samples only at Low, where the scene is drawn straight into it.
- Sun shadows read five samples of the soft filter where a pixel is clearly in light or shadow, and all of them only near a shadow edge.

## Current limits

- Online play is host-run. Everyone's view of the battle comes from the host's browser, so a slow host
  connection means laggy enemies for everyone. There's no protection against a modified client.
- On the claude.ai link, online play runs through claude.ai's live room, which carries less data than the server. In very big battles, some cosmetic effects (blood, sparks, distant arrows) may not show for joined players.
- Graphics quality (Auto / Low / Medium / High / Ultra) is in Options, on the main menu and the game menu. Auto
  picks a level for the machine (and steps down if even the lowest resolution cannot keep the frame rate); Low turns
  off shadows, grass and the post passes for slower computers. Whatever the level, the render resolution drops by
  itself when frames get slow and creeps back up when they are calm (switch off under Options: Adaptive resolution);
  the frame counter shows it next to the fps. The sky, fog, sun shadows (two cascades, snapped to the shadow map's
  texels), the HDR post passes (bloom, tone curve and grade, vignette, FXAA) and the quality tunables are in
  `src/atmosphere.js`, `src/shadows.js`, `src/post.js`, `src/gfx.js` and `src/quality.js`. No three.js add-ons are vendored.
- The graphics are stylised low-poly made from procedural textures. They aren't Bannerlord-quality assets.
