# Emberwild client UI contract

Emberwild is a browser game: Node server (`server/`), shared deterministic modules (`shared/`), and a Three.js client
(`client/`, served statically, ES modules, **no build step**). Import map (see `client/index.html`):
`three` → `/vendor/three.module.js`, `three-addons/` → `/vendor/three-addons/` (three/examples/jsm). Shared code is
imported as `/shared/*.js` (absolute path, works in browser and Node).

Run: `npm start` → http://localhost:3000 (`PORT=3111 DATA_DIR=/tmp/x npm start` for a scratch instance).

## Visual identity
Name **EMBERWILD** — tagline *"Light a fire. Claim the wild."* Warm ember-orange (`--ember #ff8a3c`) on deep slate-teal
(`--ink`, `--panel*`), cream text (`--text`), leaf green / sky blue accents, chunky rounded buttons with a 3D bottom edge,
uppercase letter-spaced headings, low-poly friendly art. **Use the CSS variables/classes in `client/css/base.css`**
(`.btn .btn.primary .panel .panel-h .tab .tag .input .field .check .bar .slot .modal-back .modal`). No external fonts/CDNs
(offline-safe). Everything must be responsive down to ~1100×650 and look polished.

## Shared modules you may import
* `/shared/items.js` – `ITEMS` (id → {name, cat, stack, color, shape, desc, power, melee, gun, armor, warmth, food, water, heal, dur, slot…}),
  `RECIPES` (`{id,out,n,ing:{item:n},time,bench:0|1|2,xp,gate?:{level?,bp?}}`), `PERKS`, `MODES`, `RULE_KEYS`, `NODES`,
  `HOTBAR=6`, `INV_SLOTS=30`, `EQUIP_SLOTS=['head','chest','legs','feet']`, `xpForLevel`.
* `/shared/worldgen.js` – `WorldData(seed)` (`.height(x,z)`, `.biome(x,z)`, `.landmarks`, `.terrain.roadDist`, `WORLD_HALF=1024`, `BIOME`, `BIOME_NAMES`).
* `/shared/building.js` – building constants.
* `client/js/models.js` – `buildCharacter(appearance)` → THREE.Group, `setEquipment(char, equipArray)`, palettes
  `SKIN, HAIR, CLOTH, ACCENT, HAIR_STYLES, EYE_STYLES, HAT_STYLES`. Appearance = `{skin,hair,hairColor,eyes,shirt,pants,accent,hat}` (integers;
  counts: skin 8, hair 8, hairColor 10, eyes 6, shirt 12, pants 12, accent 8, hat 5).
* `client/js/api.js` – `api` REST client (`login, register, logout, me, saveProfile({appearance,tutorialDone,settings}), servers(), createServer(cfg), deleteServer(id), lookupInvite(code), modes()`).
* `client/js/settings.js` – `settings` (`get/set/on/all/key(action)/rebind/resetKeys/applyPreset`), `ACTIONS`, `PRESETS`, `keyLabel(code)`.

## The `app` singleton — `client/js/app.js` (written by the lead)
```js
import { app } from '../app.js';
app.api, app.settings, app.audio            // audio.ui('click'|'hover'|'back'|'success'|'error') plays UI sounds
app.profile                                  // {uid,name,appearance,tutorialDone,playSeconds}  (mutable, update after saveProfile)
app.toast(text, kind='info'|'good'|'warn'|'bad')
app.play(server, {password, invite})         // start joining a server (server = an object from api.servers()); menus hide themselves via menus.hide()
app.leaveGame()                              // back to main menu
app.game                                     // current Game or null
app.menus                                    // the object returned by initMenus()
```

## Server rule presets & fields (`GET /api/servers` items)
`{id,name,desc,mode,modeLabel,official,players,maxPlayers,seed,private,hasPassword,owner,mine,invite?,rules:{pvp,raiding,friendlyFire,mobs,deathDrop:'all'|'none',gatherRate,lootRate,dayLength},day?,created}`
`POST /api/servers` body `{name,mode,seed,desc?,private,password?,maxPlayers,rules:{…overrides}}` → `{server}` (includes `invite` code for the owner).
`GET /api/modes` → `{modes:{survival:{label,pvp,raiding,…},cooperative:…,relaxed:…,hardcore:…}}`.
`POST /api/servers/invite {code}` → `{server, invite}`. `DELETE /api/servers/:id` (owner only).

---
## Module A — Menus (`client/js/ui/menus.js`, `client/css/menus.css`)
`export function initMenus(app)` → `{ show(name, arg?), hide(), showPause({onResume,onLeave}), joinInvite(code), showConnecting(text), showError(title, text, {retry?}) }`.
Mounts into `#screen-root`. Screens: **login/register** (tabs, validation, error text), **main menu** (Play / Host a Server / Character / Settings / Controls / Credits, name + logout),
**server browser** (table/cards: official first, name, mode tag PvP/PvE, players/max, seed, lock icon, day; refresh + auto-refresh, filters, search, password prompt, invite-code box), **host a server** (name, mode preset cards from `/api/modes`,
seed input with 🎲 random + clear text “same seed = same world”, private toggle, optional password, max players, advanced rules with toggles/sliders that reflect the preset, create → success screen showing the **invite code + copyable link `?join=CODE`** and a Join Now button; also **My servers** list with delete/copy),
**character creator** (live 3D preview using `buildCharacter` in its own small WebGL renderer, slowly turning, drag-to-rotate; pickers for skin, hair style/colour, eyes, hat, shirt, pants, scarf/accent; Randomize; Save → `api.saveProfile({appearance})`, `app.profile.appearance = …`),
**settings** (tabs: Graphics [quality presets via `settings.applyPreset`, view distance slider 150–700, shadows off/medium/high, FOV 60–110], Audio [master/sfx/music/ambience], Gameplay [sensitivity, ADS sensitivity, invert Y, head bob, damage numbers, FPS counter, crosshair, tips]),
**controls guide** (rebindable list from `ACTIONS` — click a row then press a key; Reset; plus a mouse section + short survival tips), **credits**, **pause menu** (Resume, Settings, Controls, Leave server; shows world name/seed/day when `app.game` exists),
**connecting overlay** and **error dialog**. Backdrop: attractive animated CSS/canvas-2D scene (dusk sky gradient, layered low-poly mountain silhouettes, drifting embers, glowing logo with a flame SVG) — *not* a static box. Play UI sounds via `app.audio.ui(...)`.
When a screen needs a server join, call `app.play(server, {password, invite})`. Deep link: `?join=CODE` is handled by main.js calling `menus.joinInvite(code)` (look up, show a confirm card with server info, then join; if not signed in, remember the code, show login first).
Logged-out state: after login/register call `app.onLoggedIn(profile)` (provided by lead; it shows the main menu).

## Module B — Icons, inventory, crafting (`client/js/ui/icons.js`, `client/js/ui/inventory.js`, `client/css/inventory.css`)
`icons.js`: `export function iconHTML(itemId, cls='ico')` → inline `<svg viewBox="0 0 64 64" class=...>` string, and `iconEl(itemId)`. Draw distinctive, attractive flat/low-poly-style SVG art for **every item in `ITEMS`** (~67; use `shape`+`color`
plus per-shape drawing code: log, rock, fiber, cloth, hide, ore, ingot, powder, gear, berry, corn, pumpkin, meat, can, bottle, bandage, medkit, seed, hatchet, pickaxe, hammer, torch, spear, machete, bow, revolver, smg, shotgun, rifle, arrow, bullet, shell,
hood/shirt/pants/boots/helmet/chest armour, campfire, furnace, bench, bag, box, chest3, lock, spikes, turret, satchel, bp (blueprint scroll)). Cache results. Also export `itemTip(id, inst)` → HTML for tooltips (name, category, description, key stats: damage/rate/mag for guns, armor%, warmth, food/water, durability, tool power).
`inventory.js`: `export class InventoryUI { constructor(game, root) ; open(tab='inventory'|'crafting'), close(), toggle(), isOpen(), refresh() }` mounted in `#inv-root` (toggle `hidden` class on the root). It subscribes to game events itself.
Layout: left = equipment paper-doll (head/chest/legs/feet slots + a 3D-less silhouette + armor% / warmth readout), backpack grid (24 slots = inv[6..29]) and hotbar row (inv[0..5]); middle/right = **tabs**: *Crafting* and (when `game.state.cont`) the opened *container* panel (title from `cont.title`; grid of `cont.slots`; for `kind` furnace/campfire show labelled slots: fuel / input / output, a flame toggle button + progress bar using `cont.sub` (`on`,`burn`,`prog`); turret shows ammo slots; box/crate/bag plain grids; a 🔒 lock indicator).
Crafting: category filter tabs (All, Tools, Weapons, Ammo, Armor, Deployables, Survival, Materials — derive from `ITEMS[out].cat`), search box, recipe list (icon, name, ingredient chips green/red depending on availability, craft time, bench requirement badge, lock overlay with requirement text "Level 4" / "Blueprint needed" when gated and not unlocked), detail pane with description/stats, quantity 1/5/10/max, big Craft button (disabled with reason), and the **queue** (progress bar for the head, count, cancel ✕).
`game.state.benchTier` (0..2) says which workbench is nearby.
Drag & drop (mouse): LMB-drag moves the whole stack; RMB-drag moves half; Ctrl+LMB-drag moves one; drop on another slot = merge/swap/place (server validates); **drop outside the panels = drop item into the world**; shift-click or double-click = quick move (`qm`). Dragged item follows the cursor. Tooltip on hover (`itemTip`). Slot filter feedback (equipment slot only accepts its armor type — highlight valid targets while dragging). Right-click on an *inventory* item without dragging opens a small context menu: Use/Equip, Split, Drop, and (hotbar bind: “Move to hotbar”). Selected hotbar slot (`game.state.sel`) is highlighted.
Messages you send via `game.send(msg)`: `{t:'mv_item', a:[kind,idx], b:[kind,idx], n}` kinds `'inv'|'eq'|'c'` (`'c'` = the open container) ; `{t:'drop', a:[kind,idx], n}` ; `{t:'qm', a:[kind,idx]}` ; `{t:'craft', r:recipeId, n}` ; `{t:'cancelcraft', i:queueIndex}` ; `{t:'use', k:'dep', id, tog:true}` (light/extinguish) ; `{t:'close'}` when the container panel closes/inventory closes ; `{t:'sel', i}` to select a hotbar slot.
Inventory opens/closes are controlled by the game (Tab, Esc). When it opens: call `game.uiOpened('inventory')`, when it closes `game.uiClosed('inventory')` (so the game can release/reacquire pointer lock and stop world input).
The game also calls `inventory.open()` automatically on `cont` events (server opened a crate/box/etc.).

## Module C — Map, minimap, skills, team (`client/js/ui/map.js`, `client/js/ui/panels.js`, `client/css/panels.css`)
`map.js`: `export class MapUI { constructor(game, root); open(), close(), toggle(), isOpen() }` in `#map-root`, plus `export class Minimap { constructor(canvas, game); draw(x, z, yaw, dt) }` for `#minimap` (160×160 canvas, circular, rotates so the view direction is up, small compass letters, landmark blips, team blips, waypoint arrow at the edge).
Both render the world **from `game.world.data` (a `WorldData`)**: build a cached offscreen base image (e.g. 512×512 for the 2048 m island: biome colours matching the game — sea deep-blue → shallow, beach sand, meadow green, forest dark green, desert tan, tundra white-blue, highlands grey with snow caps — plus cheap hill-shading from height differences, roads drawn as pale lines from `terrain.roadLines`, rendered progressively/async in chunks so the UI doesn't hitch).
Full map: pan (drag) & zoom (wheel), grid lines + coordinates readout under cursor, **seed shown prominently** (`game.worldInfo.seed`), world name, day/time, legend. Landmark icons by `type` (outpost/town/lighthouse/mine/radio/farmstead/camp) — **only discovered landmarks (`game.state.disc` is a Set of ids) show their name and colour icon; undiscovered ones show a faint “?”** (exploration reward). Your own arrow with heading; teammates (`game.state.teamPos`: Map eid→{x,z,name}); death marker; sleeping bags; **waypoint**: click sets/moves a pin (right-click removes), stored in `game.state.waypoint = {x,z}|null`, shown in HUD compass/minimap. Fog-of-war is NOT required. Also a small “You are here: Forest · x,z” label.
`panels.js`: `export class SkillsUI {constructor(game, root); open/close/toggle/isOpen}` — 6 perks from `PERKS` with rank pips, descriptions, “+” buttons (`{t:'perk', id}`), points available, level + XP bar, stats (kills, deaths, playtime optional). `export class TeamUI {…}` — players online list (`game.state.players`: Map eid→{name,team}), your team (`game.state.team` = null | `{id,name,leader,members:[{uid,name,online,eid}]}`), create team (name input), invite by name (button beside each online player and a text box), pending invite banner (`game.state.invite = {from,team}` → Accept/Decline), leave, kick (leader). Messages: `{t:'team', op:'create'|'invite'|'accept'|'decline'|'leave'|'kick', name}`. Both panels mount in `#panel-root` (only one visible at a time) and call `game.uiOpened('panel')` / `game.uiClosed('panel')`.
Panel/inventory/map all close on `Esc` (the game forwards Esc to the open UI: each class exposes `close()`).

## Game object (written by the lead) — what your module can rely on
```js
game.state = {
  inv: [30 × ({id,n,dur?,ammo?}|null)], eq: [4 × item|null], sel: 0..5,
  cont: null | {k:'crate'|'dep', id, kind:'crate'|'box'|'furnace'|'campfire'|'turret'|'bag', title, slots:[…], sub?:{on,burn,prog,lk}},
  craftQ: [{r,n,t}], learned: [bpIds], level, xp, xpNext, points, perks:{gather:2,…},
  vit: {hp,food,water,stamina,temp,maxHp,maxSt}, benchTier: 0|1|2,
  disc: Set<landmarkId>, team: null|{…}, invite: null|{from,team}, players: Map<eid,{name,team}>, teamPos: Map<eid,{x,z,name}>, waypoint: null|{x,z},
}
game.me            // {x,y,z,yaw,pitch}  local player (metres)
game.world         // WorldView, game.world.data is the WorldData
game.worldInfo     // {name, seed, mode, rules, day, hour, owner, invite}
game.send(msg); game.on(evt, fn) → unsubscribe fn; events: 'inv','cont','contx','craftq','vit','perks','learned','team','invite','players','disc','level'
game.uiOpened(name); game.uiClosed(name)
```
Each UI module must be **testable standalone**: build a tiny mock `game` (state above + `send` logging + `on`) in a throw-away harness page under `client/dev/` (not linked from the app) and screenshot it with Playwright to verify layout.
