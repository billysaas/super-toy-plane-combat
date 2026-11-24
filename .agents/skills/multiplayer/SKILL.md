---
name: multiplayer
description: Work on the authoritative Colyseus server, networking protocol, matchmaking rooms or online client behavior.
user-invocable: false
---

# Multiplayer

## Authority

`server/DogfightRoom.ts` owns the match. At 30 Hz it integrates flight, resolves world and aircraft collisions, performs hitscan and rocket damage, handles respawns, scores and the timer. Clients send input packets and render interpolation/prediction; they never send positions or damage.

Server state is defined in `server/schema.ts`. Client prediction lives in `src/game/OnlineMatch.ts` and room lifecycle in `src/net/NetClient.ts`.

## Protocol

Client messages: `input`, `ready`, `aircraft`, `team`, `start`, `chat`, `leaveMatch`.

Server broadcasts/events: `system`, `chat`, `shot`, `hit`, `kill`, `explosion`, `rocketSpawn`, `impact`, `balloonHit`, `balloonDown`, `pickup`, `respawn`, `matchStart`, `matchEnd`, `roomError`.

Keep shared simulation helpers and schema fields synchronized. New gameplay that affects both modes belongs in `shared/` or both match paths, not only one.

## Rooms

- Modes: `tdm` and `ffa`.
- Room sizes are created from 4 to 24; the default is 12.
- Public room browsing comes from `server/RoomRegistry.ts` and `/api/rooms`; private rooms use six-character codes and `/api/rooms/find`.
- The lobby requires every non-host pilot to ready before the host can start when more than one pilot is present.
- Joins are rejected after the match begins. Host migration occurs on leave. Empty rooms auto-dispose. A host can rematch after `ended`.
- Rooms are not persisted and there is no AI fill or horizontal scaling. This is the current scope.

## Safety and behavior

- Validate and clamp controls, sanitize names/chat, reject duplicate callsigns, rate-limit chat and input, and never expose private state outside the room.
- Preserve friendly-fire-disabled team deathmatch and all-target free-for-all behavior.
- Test multiplayer changes with at least two browser clients: create/join, ready, start, movement, gun/rocket effects, state reconciliation, kill feed, results and rematch. Use `MATCH_SECONDS` for short local matches.
