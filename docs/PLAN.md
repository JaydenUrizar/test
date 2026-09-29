# Emberwild — Implementation Plan

**Stack**: Node 22 (ESM) server + `ws` WebSockets; browser client on Three.js (no build step, served statically,
import-map for `three`). Shared deterministic modules (`shared/`) run on both sides (world generation, item data,
collision) so the server stays authoritative while the client can predict.

**Authority model**: server owns inventory, crafting, combat (hitscan with lag-compensated rewind), building,
survival stats, mobs, loot, persistence. Client sends *intents*; movement is client-predicted and server-validated
(speed/terrain/collision clamp with reconciliation).

## Milestones
1. **Foundation** – shared noise/worldgen/items, persistence, accounts, server list, WS protocol. *Verify*: node unit tests + bot joins.
2. **World & survival** – terrain chunks, water, sky/day-night, weather, movement, stats, respawn, map. *Verify*: browser screenshot, walk-around.
3. **Economy loop** – gather, inventory (drag/drop), crafting queue, workstations, tools, furnace/campfire, farming, loot crates, XP/blueprints.
4. **Building** – grid pieces, tiers, doors, code locks, upgrade/repair/remove, teams, turrets/spikes/explosives.
5. **Combat** – melee, bow, 4 guns, armor, mobs (deer/boar/wolf/bear/raiders), PvP rules, corpses.
6. **Polish** – menu, char creator, server browser/private servers, settings, tutorial, sounds, reconnect. Docs + tests.

## Delivery log (what was actually run and verified per milestone)

1. **Foundation** – `node test/units.mjs` (13 checks: determinism, data consistency, building rules, physics vs walls/doors/stairs, inventory,
   atomic persistence, accounts) and a protocol bot smoke test (register → join → walk with shared physics → gather; 0 server corrections).
2. **World & survival** – headless-Chromium screenshots of beach, forest, desert outpost, town at dusk, ocean; day/night sky, water, weather; minimap/compass;
   map shows the seed and charts progressively; vitals, temperature (fires, roofs, biomes) verified in bot tests.
3. **Economy loop** – integration test: gather with the rock → craft hatchet/hammer/workbench (queue + gating) → furnace smelting (ore → ingot) →
   campfire cooking → containers/locks → farming (plant → ripen → harvest) → blueprints/perks/XP.
4. **Building** – integration test: foundations, walls, doorways, windows, doors, floors, stairs, upgrade wood→stone→metal, repair, code locks, stranger denied,
   privilege radius stops griefing, structural collapse, raiding with bullets and satchels.
5. **Combat** – revolver hitscan with rewind, headshots/armour, team friendly-fire prevention, PvE servers immune, PvP death → loot bag → respawn choices.
6. **Polish** – real-UI browser run (`test/e2e.cjs`): register, host a private server, join, place pieces with the mouse, reload/fire the revolver,
   light a campfire, night and storm visuals; reconnect and full-server-restart persistence in the integration test.
