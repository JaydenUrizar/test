# Emberwild — status & roadmap

Everything listed in the README is implemented and exercised by `npm test` (protocol-level bots) and by headless-browser playtests.
This file records what the current version deliberately does **not** do, with the concrete next step for each.

## Known limits (v1.0)

| Area | Limit today | Next step |
|---|---|---|
| **Scale** | One Node process simulates every loaded world (≈8 by default). Worlds are JSON files. | Run several instances behind a lobby, or move `JsonStore` behind an interface backed by SQLite/Postgres (`server/store.js` is the only file that touches disk). |
| **Mobs** | Steering AI without pathfinding: animals/raiders can snag on walls and don't open doors. Only raiders shoot. | Add a coarse nav-grid (`WorldData.staticGrid` + `PieceIndex`) with A*; let raiders breach doors; add night-time zombie-like events. |
| **Building** | No triangular roofs, gates, fences, ramps for steep foundations (players jump onto foundations up to 1.2 m). Privilege = "no other team's pieces within 26 m" rather than a tool cupboard; decay is a simple offline timer (PvP modes only). | Tool-cupboard entity with upkeep cost; extra pieces (roof, half-wall, gate); per-piece "authorized list". |
| **Combat** | Hitscan lag compensation rewinds players only (not mobs); no bullet drop; no melee blocking; no explosives other than satchel. | Rewind mobs; ballistic rifle rounds; grenades/rocket. |
| **Survival** | No bleeding/radiation/fishing/cooking recipes beyond the campfire meat, no vehicles/boats. | Add fishing rods + boats; more cook/brew recipes (data-only in `shared/items.js` + `SMELT`). |
| **Persistence** | Player state is per world; account-level stats are limited to playtime + appearance. | Global profile stats/achievements screen. |
| **Networking** | JSON snapshots (fine for ~30 players in range). No delta compression. | Binary snapshots + quantisation; area-based tickrate for far entities. |
| **Anti-cheat** | Server validates speed, terrain, reach, cooldowns, recipes, placement, inventories. A modified client can still move at the maximum legal speed and gets no line-of-sight aim-bot detection. | Statistical aim-assist detection; server-side stamina enforcement; signed builds. |
| **Accounts** | Name + password only, no e-mail/reset flow, no OAuth. | Optional OAuth / password reset via e-mail. |
| **Input & accessibility** | Desktop mouse+keyboard only (rebindable keys). No gamepad/touch, no colour-blind palettes, English only. | Gamepad layer in `controls.js`; string table extraction. |
| **Audio** | Fully synthesised (no recorded assets), so no true occlusion/reverb zones. | Optional audio pack loaded over the same `audio.sfx(name)` interface. |
| **Moderation** | Owner commands (`/kick /ban`) and rate limits only; no profanity filter or report tool. | Word filter, mute, report queue. |

## Verification checklist for a manual playtest

1. Register, customise the character, join **Official · Relaxed**; the tutorial checklist advances as you play.
2. Chop a tree and break a boulder with the rock; craft a hatchet and hammer (Tab); build a foundation + walls + doorway + door; craft and light a campfire.
3. Open the map (M): the seed is displayed; walk to a landmark and get the *Discovered* banner and XP.
4. Loot a supply crate, learn a blueprint, craft at a workbench, smelt ore in a furnace.
5. Fight a wolf/raider with a gun; die; respawn; recover the loot bag.
6. Host a private server from the menu, share the invite link, join with a second browser, form a team, share a base.
7. Leave and restart the server (`Ctrl+C` saves); rejoin — buildings, inventory, position and crops persist.
