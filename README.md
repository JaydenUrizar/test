# 🔥 EMBERWILD — *Light a fire. Claim the wild.*

A multiplayer open-world survival game that runs entirely in the browser. Gather, craft, build a base, explore
ruined towns and outposts, fight raiders, wildlife and (if the server allows) other players — then come back to a
persistent world tomorrow.

* **Server:** Node 20+ (ESM) with `ws` — an *authoritative* game server (inventory, combat, building, survival, mobs, saves).
* **Client:** Three.js, plain ES modules, **no build step**. Procedural low-poly art and fully synthesised audio — there are no binary assets.
* **Shared:** `shared/` runs on both sides: deterministic world generation (same seed ⇒ same world), item/recipe data,
  building rules and movement/collision physics (client predicts, server validates with the same code).

## Quick start

```bash
npm install
npm start            # http://localhost:3000
```

Open the URL, create an account, customise your character, pick a server (or host your own private one) and play.
Friends on your network can join at `http://<your-ip>:3000`; for internet play see [Deployment](#deployment).

## What's in the game

| Area | Details |
|---|---|
| **World** | 2 km × 2 km island generated from a seed (`EMBER-COOP`, `1234`, any text). Beaches, meadows, forests, deserts, tundra and mountain highlands; lakes; a road network linking **25 landmarks** (outposts, ruined towns, lighthouses, mines, radio towers, farmsteads, raider camps) with loot crates and raiders; ~17k harvestable trees, boulders, iron/sulfur veins, berry bushes and hemp. The seed is shown in the map, pause menu, server browser and `/seed`. |
| **Survival** | Health, hunger, thirst, stamina and **body temperature** (biome, night, rain/storm, roofs, campfires, clothing). 20-minute day/night cycle (configurable), weather (clear, cloudy, rain, storm with lightning, fog; snow in the tundra), fall damage, drowning-free swimming. Death drops a loot bag; respawn at the coast or at a **sleeping bag**. |
| **Economy** | Rock → hatchet/pickaxe → hammer → workbench I → furnace (smelt iron) → workbench II → guns, ammo, armor, turrets. 40 recipes, crafting queue with timers, blueprints found in crates, level/skill gates. Farming (corn, pumpkin) with growth stages and rain. Campfire cooking. |
| **Progression** | XP from gathering, crafting, looting, kills and **discovering landmarks**; 30 levels; 6 perks (Forager, Toughness, Endurance, Brawn, Artisan, Scavenger). Better loot lives at dangerous places. |
| **Inventory** | 30-slot inventory + 6-slot hotbar, 4 armour slots, stacks, containers (crates, boxes, furnaces, campfires, turrets, corpses), drag & drop (whole / half / one), quick-move, drop to world. |
| **Combat** | Melee (rock, spear, hatchet, machete), hunting bow (projectile + drop), and four guns with distinct handling — **Ember Revolver** (accurate, slow reload), **Hornet SMG** (auto, climbs), **Thumper Shotgun** (pellet spread, per-shell reload), **Longwatch Rifle** (bolt action, 3× scope). Headshots, armour, lag-compensated hitscan, recoil/spread/bloom, tracers, muzzle flash, hit-markers. Enemies: deer, boar, wolf packs, bears, **raiders** with guns. |
| **Building** | Grid building: foundations, walls, doorways, windows, doors, floors, stairs; wood → stone → metal upgrades, repair, remove; structural support (destroy the base, the roof falls). **Code locks** on doors and boxes, team-shared permissions, building-privilege radius, **auto turrets**, **spike barricades**, **satchel charges** for raiding. |
| **Multiplayer** | Public/official servers, **private servers** with invite codes/links (+ optional password), 2–32 players. Rules per server: PvP, base raiding, friendly fire, wildlife, death drop, gather/loot rates, day length. Teams (shared building/lock access, no friendly fire, map markers), chat (global/team), owner tools (`/kick /ban /time /weather /give /tp`). |
| **Quality** | Main menu, server browser, host-a-server wizard, character creator with live 3D preview, settings (graphics presets, audio, sensitivity, key rebinding), controls guide, first-time tutorial, minimap + full map with waypoints, reconnect handling. |

### Controls (rebindable in Settings → Controls)

| Key | Action | Key | Action |
|---|---|---|---|
| `W A S D` | Move | `Tab` | Inventory & crafting |
| `Shift` | Sprint | `M` | Map (click = waypoint) |
| `Space` | Jump | `K` | Skills |
| `C` | Crouch | `P` | Team & players |
| `E` | Interact (hold: pick up / drink) | `Enter` | Chat (`/t msg` = team) |
| `F` | Light / extinguish fire | `V` | 1st / 3rd person |
| `R` | Reload (hold with hammer = repair) | `G` | Emotes |
| `1`–`6` / wheel | Hotbar | `Z` | Rotate stairs / deployable |
| `LMB` | Attack / use / place | `X` (hold) | Remove build piece |
| `RMB` | Aim down sights (guns) · upgrade piece (hammer) | `F3` | Stats overlay |

Building: equip the **hammer**, scroll the mouse wheel (or click the bar) to choose a piece, `LMB` to place, `RMB` to upgrade the piece you're looking at.

## Server rules & modes

Presets (`shared/items.js → MODES`): **Survival** (PvP + raiding), **Cooperative** (PvE), **Relaxed** (PvE, keep gear on death, boosted rates),
**Hardcore** (PvP, friendly fire, scarce loot). When hosting you can override every rule: `pvp`, `raiding`, `friendlyFire`, `mobs`,
`deathDrop` (`all`/`none`), `gatherRate`, `lootRate`, `dayLength` (seconds), `decay`. The world seed can be typed in (reproducible worlds) or randomised.

## Configuration

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | Accounts, servers and world saves (JSON, atomic writes + `.bak`) |
| `MAX_WORLDS` | `8` | Max worlds simulated at once (idle worlds unload after 60 s empty and are saved) |

Official servers are defined in `server/lobby.js` (`OFFICIAL`). Game data (items, recipes, loot tables, perks, node yields, rule presets)
is in `shared/items.js`; world generation parameters in `shared/worldgen.js`.

## Architecture

```
shared/   noise.js worldgen.js items.js building.js physics.js     (isomorphic, deterministic)
server/   index.js (HTTP, REST, WS)  lobby.js  accounts.js  store.js  game.js (GameWorld core)
          systems/  survival crafting combat mobs building containers devices social
client/   index.html  css/  js/ (game.js world.js entities.js controls.js interact.js hud.js audio.js models.js effects.js net.js …)
          js/ui/ menus, inventory, icons, map, panels
test/     units.mjs  integration.mjs (protocol bots)  smoke.mjs  e2e.cjs  showcase.mjs  bot.js  pw.cjs
docs/     PLAN.md  PROTOCOL.md  CLIENT_API.md  ROADMAP.md
```

**Authority model.** The server owns everything that matters: inventories, crafting, resource nodes, loot, combat, structures, survival
stats, mobs, weather/time and persistence. Clients send *intents* (`atk`, `craft`, `build`, `mv_item`, …). Movement is
client-predicted with the shared physics and **validated by the server** each packet (speed budget, terrain/collision/airborne checks) — a
rejected packet gets a `corr` correction that snaps the client back. Shots are hitscan on the server with **lag compensation**
(target positions are rewound by the shooter's RTT/2 + interpolation delay, capped at 400 ms).

**Exploit protection.** Per-message-type token buckets, 16 KB payload cap, strict argument validation (ints/ranges/enums; null-prototype data
tables so `__proto__` ids resolve to nothing), distance/reach checks for every interaction, server-side placement validation (support,
privilege radius, terrain), recipe/blueprint gating, inventory moves validated per slot type, scrypt password hashes, hashed session tokens,
login rate limiting, code-lock brute-force lockout, spawn protection, owner-only admin commands.

**Persistence.** Each world is saved to `DATA_DIR/worlds/<id>.json` every 30 s, when it empties, and on `SIGINT/SIGTERM` (write to temp file →
rename, previous version kept as `.bak`). Player state (position, inventory, XP, perks, blueprints, team) is stored per world; buildings,
deployables, crops, dropped items, depleted resources and opened crates persist too. While a server is empty, crops and respawn timers
catch up at half speed on next load (max 6 h).

**Networking.** JSON over WebSocket at 20 Hz; snapshots are interest-filtered (260 m players, 200 m mobs). Remote entities are interpolated/smoothed;
the client reconnects automatically (backoff, up to 12 tries) and the server keeps a disconnected body for 20 s so a quick reconnect resumes seamlessly.

## Testing

```bash
npm test                    # unit checks + full protocol integration test (starts its own server)
node test/units.mjs         # 13 fast checks: worldgen determinism, data consistency, building rules, physics, inventory, persistence, accounts
node test/integration.mjs   # 19 steps with real WebSocket bots: gather → craft → build → locks → furnace/campfire → farming → PvP → teams →
                            # death/loot → raiding → anti-cheat → reconnect → full-server-restart persistence
node test/smoke.mjs         # quick join/walk/gather smoke test
node test/e2e.cjs           # headless-Chromium E2E through the real UI: register, host a server, join, build with the mouse, reload/fire, campfire
node test/showcase.mjs      # visual QA: warps a browser player to landmarks/weather/night and saves screenshots (default /tmp/ew-show)
```

The browser tests need Playwright with Chromium (`npm i -g playwright`; `E2E_OUT=dir` changes the screenshot folder). **Network QA:** open the game with
`http://localhost:3000/?lag=200&loss=0.03` to simulate 200 ms round-trip latency and 3% packet loss on movement input — prediction/reconciliation should
still feel smooth (the server logs a `corr` only when a move is genuinely illegal).

## Deployment

**Docker**

```bash
docker compose up -d --build     # data persists in the emberwild-data volume
```

**Bare metal / VM.** Node ≥ 20, `npm ci --omit=dev`, then run `node server/index.js` under systemd or pm2 with `DATA_DIR` on persistent storage.
`SIGTERM` saves all worlds before exit.

**Reverse proxy / HTTPS.** Terminate TLS in front (the client automatically uses `wss://` when served over `https://`). nginx example:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 3600s;
}
```

**Backups.** Copy `DATA_DIR` (JSON files) — it is safe to copy while running (writes are atomic). One process serves all worlds; to scale out, run several
instances with different `DATA_DIR`s behind a lobby of your choice.

## Known limits / roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what is intentionally not in this version and the precise next steps.

## License

MIT. All art, sound and code in this repository were created for Emberwild.
