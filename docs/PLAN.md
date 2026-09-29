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
