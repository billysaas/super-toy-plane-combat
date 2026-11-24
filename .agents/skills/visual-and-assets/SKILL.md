---
name: visual-and-assets
description: Preserve the low-poly toy-house art direction, pixel HUD, responsive layouts and third-party asset licensing.
user-invocable: false
---

# Visuals and assets

## Direction

The target look is a bright, colorful low-poly toy world: oversized house and furniture, warm soft interior light, garden border, pixel typography, dark navy HUD panels, RAF blue, Axis red and yellow accents. The reference is the user-supplied dogfight screenshot; reproduce its principles with the existing original scene rather than copying its imagery.

- House shell, garden, stairs, fireplace, posters, props and effects are procedural.
- Furniture, trees and the fighter mesh are vendored Polyfork GLBs in `public/models/`.
- The fighter is recoloured at runtime for four variants. It has no display stand or base.
- UI fonts are Press Start 2P and Silkscreen, loaded locally from `public/fonts/`.

## UI and mobile

All UI is DOM/CSS in `index.html`, `src/style.css` and `src/ui/UI.ts`. Keep the pixel HUD legible, including scores, timer, radar, reticle, health, armour, rapid-fire status, speed, boost, throttle, ammo, kill feed, chat and scoreboard. Touch layout must work in both landscape and portrait, with safe-area-aware HUD and controls.

The portrait layout deliberately moves score and bars below the radar, keeps the stick and action pad at the bottom, and hides width-hungry desktop chrome. Do not reintroduce a rotate-required overlay. Test at a 390×844 mobile viewport as well as landscape.

## Assets and licensing

- Polyfork meshes are CC BY 4.0 and must keep their credit line in `CREDITS.md` and the in-game footer.
- Do not add assets without a compatible recorded license and attribution.
- Keep third-party assets local if the build must work offline.
- Fonts are OFL with license texts included. Audio is synthesized in the browser; do not add unlicensed samples.
- Prefer merged static geometry, instancing, simple materials and the existing low/medium/high quality settings over heavy postprocessing.

Update screenshots or docs only when they would otherwise mislead.
