---
name: gameplay-and-controls
description: Change Super Toy Plane Combat flight, weapons, AI, camera, input, mobile controls or match flow without breaking playability.
user-invocable: false
---

# Gameplay and controls

## Flight

`shared/flight.ts` owns the arcade flight model. The model uses a local forward of `-Z`, bank-to-turn coordination, speed/throttle/boost targets and local-axis pitch, roll and yaw rotation. `invertY` defaults to `true`.

- Inverted pitch means mouse down and joystick down both pitch the nose up.
- The mobile stick multiplies vertical input by `settings.invertY`; keep this aligned with mouse steering.
- The mobile stick applies a centre deadzone, a soft expo response and a slow ramp so small joystick movements trim the aircraft gently, flight-sim style. Release eases the controls back to centre instead of snapping.
- The chase and cockpit cameras zoom in by 6° while the local player fires guns or rockets.
- `integrateFlight` applies a 2.1× turn assist, rising to 3.3× near minimum speed; turn radius shrinks continuously as speed drops and is about 50% tighter than the original baseline at maximum and boost speed.
- Keep collision bounces, damage and respawn behavior consistent between local and online play.
- World collisions push the plane clear and reverse its heading 180° without damage; keep local prediction, client play and the server simulation aligned.
- The chase camera uses aspect-aware FOV and distance. Portrait gets a wider FOV and slightly farther camera; preserve that when tuning.

## Controls

- Desktop: `W/S` pitch, `A/D` roll, `Q/E` yaw, `Shift` boost, `Space`/left mouse guns, `R`/right mouse rockets, `Z/X` or wheel throttle, `V` camera, `Tab` scoreboard, `T` chat, `Esc` pause.
- Touch: left virtual stick, throttle slider, FIRE, BOOST, RKT, VIEW, pause and chat. Layouts must remain usable in landscape and portrait without overlapping the HUD.
- Input lives in `src/game/Input.ts`; settings flow through `UIManager` and `Game.applySettings`.

## Combat and AI

- Guns are hitscan with server- or local-authoritative hit checks. Rockets home toward a locked target and use swept collision so they cannot skip through aircraft.
- AI lives in `src/game/AI.ts`. It selects targets, leads shots, fires bursts and rockets, uses look-ahead probes and fan steering for obstacle avoidance, and recovers from collisions.
- Spawns are team-scoped and validated as open space. The solo player starts in the living room; online teams spawn in the garden.
- Damage, respawn timers, team scores and results are handled in `LocalMatch` and mirrored authoritatively in `server/DogfightRoom.ts`.
- If changing AI, weapon balance or flight physics, verify at least a sustained solo run, a local weapon hit, mobile pitch inversion, and a two-client online match when relevant.

Keep the game immediately playable. Do not introduce pause-on-menu, mandatory tutorials or display-only aircraft stands.
