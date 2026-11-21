---
name: project-overview
description: Orient in Super Toy Plane Combat and establish current scope, structure, release state and live operations.
user-invocable: false
---

# Project overview

Super Toy Plane Combat is a complete browser 3D arcade dogfighting game set in a giant low-poly toy house and garden. Players fly four miniature fighter variants through rooms, furniture, windows and the garden. Solo is fully offline against AI; multiplayer uses an authoritative Colyseus server.

- Stack: Three.js, TypeScript, Vite, Rapier, Node.js, Colyseus and Express.
- Repository: <https://github.com/billysaas/super-toy-plane-combat>.
- Current branch: `main`.
- Solo modes: team deathmatch and free-for-all against 1–11 AI pilots.
- Online modes: team deathmatch and free-for-all, public/private rooms, lobby, ready checks, up to 24 configured players.
- Platforms: desktop keyboard/mouse, touch landscape and touch portrait.
- Match duration: 7:24 by default (`WORLD.matchSeconds` / `MATCH_SECONDS`).
- Code license: MIT. Vendored Polyfork models: CC BY 4.0. Fonts: OFL. See `CREDITS.md`.

The current build is a playable game, not a mockup. Preserve the solo-first experience and the authoritative multiplayer path. Existing scope does not include accounts, persistence, matchmaking services beyond room browsing, ranked play, anti-cheat beyond validation, AI fill in online rooms, or horizontal scaling.

Production is served by the Node process from `dist/` and `dist-server/`. It also serves the Colyseus WebSocket endpoint on the same origin. Runtime configuration is `PORT`, `MATCH_SECONDS` and `VITE_SERVER_URL`; see `.env.example`.

The live tailnet service is separate from the other application on Tailscale HTTPS port 443. Do not disturb the 443 root mapping or the unrelated PM2 processes. See [verification-and-deploy](../verification-and-deploy/SKILL.md) before redeploying.

Use `README.md` for setup and player-facing behavior, `CREDITS.md` for asset attribution, and the other repository skills for engineering context.
