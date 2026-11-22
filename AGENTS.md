# Super Toy Plane Combat — Agent Guide

Read the matching internal skill before doing that work. These are repository references, not user-invocable commands.

| Skill | Read when |
| --- | --- |
| [project-overview](.agents/skills/project-overview/SKILL.md) | Orienting in the repo, checking scope, release state, live service or current limitations. |
| [engineering](.agents/skills/engineering/SKILL.md) | Changing code, dependencies, module boundaries or shared simulation. |
| [gameplay-and-controls](.agents/skills/gameplay-and-controls/SKILL.md) | Changing flight, weapons, AI, cameras, input, mobile controls or match flow. |
| [multiplayer](.agents/skills/multiplayer/SKILL.md) | Touching Colyseus, authority, netcode, schema, rooms or matchmaking. |
| [visual-and-assets](.agents/skills/visual-and-assets/SKILL.md) | Touching UI, HUD, scene art, fonts, performance or licensing. |
| [verification-and-deploy](.agents/skills/verification-and-deploy/SKILL.md) | Testing, building, restarting the live service or reporting completion. |

## Change workflow

For every new change:

1. Create a task-specific Git worktree under `.worktrees/`.
2. Verify the change.
3. Commit and push the task branch.
4. Merge the task branch into `main` and push `main`.
5. Remove the worktree and delete the merged task branch locally and remotely.
6. After cleanup, deploy the latest pushed `main` to the tailnet game and verify it at the live URL.
