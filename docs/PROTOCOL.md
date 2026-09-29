# Emberwild network protocol

Transport: WebSocket at `/ws`, UTF-8 JSON text frames (max 16 KB). REST under `/api/*` handles accounts and the server list.

## REST

| Method & path | Body | Result |
|---|---|---|
| `POST /api/register` `POST /api/login` | `{name, password}` | `{token, profile}` |
| `POST /api/logout` | – | `{ok}` |
| `GET /api/me` | – | `{profile}` (`Authorization: Bearer <token>`) |
| `POST /api/profile` | `{appearance?, tutorialDone?, settings?}` | `{profile}` |
| `GET /api/servers` | – | `{servers:[…]}` – official + public + your own private |
| `POST /api/servers` | `{name, mode, seed, private, password?, maxPlayers, rules:{…}}` | `{server}` (owner gets `invite`) |
| `POST /api/servers/invite` | `{code}` | `{server, invite}` |
| `DELETE /api/servers/:id` | – | owner only |
| `GET /api/health` `GET /api/modes` | – | status / rule presets |

## Session

1. Client → `{t:'join', token, server, password?, invite?}` (must arrive within 8 s).
2. Server → `{t:'joined', eid}` then, in the next snapshot, events `welcome`, `inv`, `vit`, `craftq`.
3. Server → `{t:'error', error}` or `{t:'kicked', reason}` and closes on failure.

`welcome` carries the world config (seed, rules, mode, hour, weather), your player state, all structures, deployables, plants,
dropped items, depleted resource ids, opened crates and teams. Static world content (terrain, resources, landmarks, loot crate
positions) is **not** sent — the client regenerates it from the seed with `shared/worldgen.js`.

Reconnect: the client re-sends `join`; if the body is still lingering (20 s) the server reattaches it and sends a fresh `welcome`.

## Server → client: `{t:'s'}` snapshot (20 Hz)

```
{ t:'s', k: tick, a: lastAckedMoveSeq, h: hourOfDay,
  P: [[eid, x, y, z, yaw, pitch, flags, heldItemId, atkSeq, hp, emote], …],      // players in 260 m
  M: [[id, species, x, y, z, yaw, state, hp, atkSeq], …],                         // mobs in 200 m
  PR: [[id, x, y, z, vx, vy, vz], …],                                              // arrows
  tm?: [[eid, x, z], …],                                                           // team mates (any distance, 1 Hz)
  ev?: [ event, … ] }
```

Player `flags`: `1` sprint · `2` crouch · `4` swimming · `8` airborne · `16` aiming/drawing · `32` dead · `64` disconnected · `128` reloading.

### Events (`ev[]`, each has `e`)

`welcome inv vit sel corr toast chat pj pl pteam peq pst hurt dead respawned hm hit swing shot rl draw blood mobdie mobatk boom node- node+
drop+ drop- dep+ dep- dep~ piece+ piece- piece~ built plant+ plant~ plant- crate~ cont contx craftq crafted got learned perks level disc weather time
kill sfx ammo team invite unlocked lockprompt berr pong`

Notable payloads: `inv {inv[30], eq[4], sel}` · `vit {v:[hp,food,water,stamina,temp,maxHp,maxSt], xp, lvl, pts, next}` ·
`shot {eid, w:weaponId, o:[x,y,z], en:[[x,y,z,kind],…]}` (negative `eid` = mob/turret) · `hit {eid,k,x,y,z,nt?,mat?}` ·
`cont {k,id,kind,title,slots,sub?}` (`kind`: crate, box, furnace, campfire, turret, bag) · `corr {x,y,z,s,force?}`.

## Client → server messages

| `t` | Fields | Notes |
|---|---|---|
| `mv` | `s,x,y,z,yaw,pitch,f,e?` | 20 Hz predicted position. Validated: speed budget, terrain, airborne, collision. |
| `sel` | `i` | Hotbar slot 0–5 (0.25 s weapon-swap delay). |
| `atk` | `yaw,pitch,ph?,tp?` | Use held item: melee / gather / shoot / eat / learn blueprint / plant (`tp:[x,z]`). Bows: `ph:0` draw, `ph:1` release. |
| `reload` | – | |
| `use` | `k:'crate'\|'dep'\|'drop'\|'plant'\|'water', id, tog?, pk?` | Interact. `tog` lights/extinguishes, `pk` picks up a deployable. |
| `mv_item` | `a:[kind,i], b:[kind,i], n?` | `kind`: `inv`,`eq`,`c` (open container). |
| `qm` `drop` | `a:[kind,i], n?` | quick-move / drop into the world. |
| `craft` `cancelcraft` | `r,n` / `i` | |
| `build` | `type,L,gx,gz,dir,rot` | Requires the hammer. |
| `bupg` `brepair` `bremove` `bdoor` | `id` (+`tier`) | |
| `place` | `slot,x,z,y?,ry` | Deployables (incl. satchel). |
| `lock` `unlock` `rmlock` | `k:'piece'\|'dep', id, code` | 4-digit code locks. |
| `respawn` | `bag` | 0 = random coast spawn. |
| `chat` | `text, ch?` | `/commands` supported. |
| `perk` `team` `close` `ping` | | |

Every message type has a server-side token-bucket rate limit (`RATES` in `server/game.js`).
