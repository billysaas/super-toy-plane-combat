---
name: verification-and-deploy
description: Verify, build, deploy and report Super Toy Plane Combat changes on the live tailnet service.
user-invocable: false
---

# Verification and deployment

## Required checks

For code or asset changes run:

```bash
npm run typecheck
npm run build
```

`npm run check` runs both. For meaningful gameplay or UI changes, also launch the build and verify in a browser. For multiplayer changes, run two clients against a local server. Test desktop, touch landscape and touch portrait when controls or HUD change.

Useful local commands:

```bash
npm run dev
MATCH_SECONDS=20 npm run server
npm start
```

`npm run dev` starts Vite on 5173 and Colyseus on 2567. Production `npm start` serves `dist/` and the WebSocket endpoint from port 2567 unless overridden.

A completion report should state the changed files, commands and checks actually run, the production build status, any known limitations, and the commit reference. Do not claim checks or device coverage that were not run.

## Live service

The game is served on the host tailnet by:

- PM2 app `super-toy-plane-combat`, working directory this repo, `PORT=3000`.
- Tailscale Serve mapping `https://vps-6d4e75bf.tail8bba3d.ts.net:8443/` to `http://127.0.0.1:3000`.
- Tailscale port 443 belongs to a different application and its `/` and `/race` mappings must not be modified.

Deploy verified code with:

```bash
npm run build
pm2 restart super-toy-plane-combat --update-env
pm2 save
curl -fsS https://vps-6d4e75bf.tail8bba3d.ts.net:8443/api/health
```

Then open the tailnet URL in a browser and smoke-test the changed area. PM2 is owned by user `ubuntu`; use `sudo` only where Tailscale configuration requires it. Do not delete or restart unrelated PM2 processes. If a build, restart, health check or browser smoke fails, report the failure and the revision still being served rather than claiming deployment.
