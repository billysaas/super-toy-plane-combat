---
name: engineering
description: Apply Super Toy Plane Combat architecture, module boundaries and engineering invariants when changing code.
user-invocable: false
---

# Engineering

## Module map

- `shared/` — aircraft definitions, flight integration, collision helpers, and the authoritative world layout with `STATIC_BOXES` and spawn points. It is imported by both browser and server.
- `src/game/` — Three.js renderer, environment, asset loading, aircraft views, effects, audio, input, cameras and match orchestration.
- `src/game/LocalMatch.ts` — offline match simulation, AI orchestration, weapons, damage, scoring and respawning.
- `src/game/OnlineMatch.ts` — server-state interpolation, client prediction/reconciliation, online effects and HUD state.
- `src/game/ActiveMatch.ts` — the session seam used by `Game` for either match implementation.
- `src/net/NetClient.ts` — Colyseus client and room lifecycle.
- `src/ui/UI.ts` — screens, hangar, lobby, HUD, radar, chat, scoreboard and touch UI state.
- `server/` — Colyseus schema, authoritative `DogfightRoom`, room registry and Express/static hosting.

## Invariants

- Use strict TypeScript. Keep `npm run typecheck` clean, including unused locals/parameters.
- The server never trusts client position or damage. Clients send controls; the server owns flight, hits, kills, respawns and scores.
- Keep `STATIC_BOXES` in `shared/worldLayout.ts` as the single source of truth for house, furniture, tree and boundary collision.
- The browser uses Rapier for static colliders, swept aircraft collision, ray casts and debris. The server uses deterministic shared AABB helpers against the same boxes.
- Changes to the shared flight model affect solo, online prediction and the authoritative server. Verify all three paths or deliberately document a divergence.
- Both match implementations expose `ActiveMatch`; keep HUD, camera, pause and result behavior coherent.
- Memory and frame time matter: prefer low-poly geometry, merged static meshes, object pools, capped particles and existing quality tiers over new heavy effects or dependencies.
- Do not hotlink runtime assets. Keep models under `public/models/`, fonts under `public/fonts/`, and update `CREDITS.md` whenever third-party assets change.
- Preserve desktop, touch landscape and touch portrait behavior. The default pitch setting is inverted and must apply to both mouse and joystick.

## Working style

Keep changes within the user request. Prefer the smallest reversible implementation, remove dead code, and avoid speculative abstractions. Use small commits with `type: concise subject` messages. Do not commit generated `dist/` or `dist-server/` output, dependencies, secrets or local environment files.
