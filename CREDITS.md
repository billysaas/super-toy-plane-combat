# Credits and Third-Party Licenses

Super Toy Plane Combat's game code is released under the MIT License (see `LICENSE`).
The game contains third-party art, fonts, and software under the licenses below.

## Polyfork low-poly 3D assets

The following GLB mesh files are included in `public/models/` and are used under
**CC BY 4.0** with the credit lines below. Source and licensing information:
<https://polyfork.dev/licensing>.

The models are used at runtime with scaling and placement changes. The aircraft
mesh is recoloured at runtime to create the four playable variants. The original
downloaded GLB files have not been otherwise edited.

- Single-Engine Fighter: Single-Engine Fighter by Polyfork (<https://polyfork.dev/asset/single-engine-fighter-a6addf>), CC BY 4.0
- Sofa: Sofa by Polyfork (<https://polyfork.dev/asset/sofa-9c0e7e>), CC BY 4.0
- Dining Table: Dining Table by Polyfork (<https://polyfork.dev/asset/dining-table-7af83a>), CC BY 4.0
- Dining Chair: Dining Chair by Polyfork (<https://polyfork.dev/asset/dining-chair-530532>), CC BY 4.0
- Alcove Bookcase: Alcove Bookcase by Polyfork (<https://polyfork.dev/asset/alcove-bookcase-83894d>), CC BY 4.0
- Bed: Bed by Polyfork (<https://polyfork.dev/asset/bed-6e10e8>), CC BY 4.0
- Broad Canopy Shade Tree: Broad Canopy Shade Tree by Polyfork (<https://polyfork.dev/asset/broad-canopy-shade-tree-e7c4a2>), CC BY 4.0
- Ornamental Front-Yard Tree: Ornamental Front-Yard Tree by Polyfork (<https://polyfork.dev/asset/ornamental-front-yard-tree-c6781a>), CC BY 4.0
- Floor Houseplant: Floor Houseplant by Polyfork (<https://polyfork.dev/asset/floor-houseplant-8fad17>), CC BY 4.0
- Kitchen Island: Kitchen Island by Polyfork (<https://polyfork.dev/asset/kitchen-island-47f4c8>), CC BY 4.0
- Coffee Table: Coffee Table by Polyfork (<https://polyfork.dev/asset/coffee-table-acc698>), CC BY 4.0
- Area Rug: Area Rug by Polyfork (<https://polyfork.dev/asset/area-rug-5c56e2>), CC BY 4.0
- Table Lamp: Table Lamp by Polyfork (<https://polyfork.dev/asset/table-lamp-e25998>), CC BY 4.0
- Lounge Armchair: Lounge Armchair by Polyfork (<https://polyfork.dev/asset/lounge-armchair-5a72ca>), CC BY 4.0
- Low Media Unit: Low Media Unit by Polyfork (<https://polyfork.dev/asset/low-media-unit-645e61>), CC BY 4.0
- Sideboard: Sideboard by Polyfork (<https://polyfork.dev/asset/sideboard-dd343b>), CC BY 4.0
- Fridge Freezer: Fridge Freezer by Polyfork (<https://polyfork.dev/asset/fridge-freezer-fb9b5a>), CC BY 4.0
- Framed Wall Art: Framed Wall Art by Polyfork (<https://polyfork.dev/asset/framed-wall-art-d2c8a2>), CC BY 4.0
- Curtain Panel: Curtain Panel by Polyfork (<https://polyfork.dev/asset/curtain-panel-ee2ed9>), CC BY 4.0

The house shell, garden terrain, stairs, fireplace, posters, props, waterfall/fountain,
garden fence, and decorative geometry are built procedurally in this project.

## Fonts

Both fonts are loaded locally from `public/fonts/` and are licensed under the
SIL Open Font License 1.1. License texts are included next to the font files.

- **Press Start 2P** by CodeMan38. Source: <https://fonts.google.com/specimen/Press+Start+2P>. OFL text: `public/fonts/OFL-PressStart2P.txt`.
- **Silkscreen** by Jason Kottke. Source: <https://fonts.google.com/specimen/Silkscreen>. OFL text: `public/fonts/OFL-Silkscreen.txt`.

## Software libraries

- [three.js](https://threejs.org/) — MIT License
- [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) — Apache License 2.0
- [Colyseus](https://colyseus.io/) and `colyseus.js` — MIT License
- [Vite](https://vite.dev/) — MIT License
- [Express](https://expressjs.com/) — MIT License

## Audio

All sound effects and engine sounds are synthesized in real time with the Web Audio
API. No third-party audio files are bundled.

## Visual and gameplay reference

The user-supplied visual reference image was used only as art direction for colour,
typography, and HUD composition. It is not included in the repository or the build.
