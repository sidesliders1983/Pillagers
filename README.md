# Pillagers — World Prototype v0.2

A small Three.js Viking settlement beside a fjord. v0.2 implements [GitHub issue #1](https://github.com/sidesliders1983/Pillagers/issues/1): a visual identity pass with a muted Nordic palette, warmer fill light, softer shadows, feathered building platforms, organic ground variation, connected informal paths and small prop clusters. Native TypeScript, Vite and Three.js; no backend or gameplay framework.

## Run

Use Node.js 22.12+ (Node 24 recommended). Supply your licensed GLBs in `Assets/Terrain/` with the original filenames, then:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For production:

```sh
npm run build
npm run preview
```

The provided pnpm lockfile also supports `pnpm install`, `pnpm dev`, and `pnpm build`. This workstation has bundled pnpm but no npm, so validation used pnpm and Node 24. Do not commit `Assets/` or `dist/`.

## LAN / mobile testing

Connect your phone to the same Wi-Fi as this computer. For a LAN development server with live updates:

```sh
npm run dev:lan
```

For the built version:

```sh
npm run build
npm run preview:lan
```

Use `http://<computer-Wi-Fi-IP>:5175/` (development) or `http://<computer-Wi-Fi-IP>:4175/` (production preview). These servers bind to all interfaces; they run only while the process and computer remain active. Allow the selected TCP port through Windows Firewall for your local subnet if needed. No router port forwarding or public deployment is needed. This workstation has a narrow firewall helper at `scripts/enable-lan-firewall.ps1`; run it as administrator if access is blocked. It permits only the Node executable on Wi-Fi, from the local subnet, for TCP ports 4175/5175. To remove it later, run `Remove-NetFirewallRule -Name Pillagers-LAN-Preview` as administrator.

Mobile controls: tap a location to move the camera center there; swipe horizontally to rotate around that center, vertically to adjust the orbit elevation. Pinch fingers together to zoom out; spread them apart to zoom in. A pinch never turns into an accidental tap when one finger lifts. Mouse/keyboard controls remain available. Gesture settings and zoom/elevation limits live in `worldConfig.camera.touch`.

## Character Lab v0.3

Open `/character-lab` or use Character Lab in the world's ⋯ menu. The same route works in the LAN preview, including mobile. Edit sex, age, seed, five traits and six normalized heritage shares; preview the image-generated Universal Human and live occupation-fit scores. Pin a comparison to inspect one-trait changes or seed variation, and use DNA JSON to import, copy or export a character.

Personal names now derive deterministically from heritage, sex, local culture and seed. The dominant heritage automatically chooses the naming culture; reroll only the name while preserving appearance. Naming configuration travels with DNA JSON and pinned comparisons. See [Naming v0.2](docs/CHARACTER-NAMING-V02.md) for curated patterns, patronymics and the historical/art-direction boundaries.

The model is independent of Three.js. Physicality/Agility influence build, while Intelligence/Cunning affect tendencies and fit without changing facial anatomy. Heritage uses overlapping illustrative art probabilities. The ten world residents use the same DNA generator and phenotype mannequins. The Lab has one shared adult rig with continuous masculinity, height, physicality/agility and seed variation, three LODs, Idle/Walk/Run and Heavy/Nimble/Balanced presets. Hands have one bone each and attachment sockets, without finger rigging. See [Universal Human pipeline and validation](docs/UNIVERSAL-HUMAN-V01.md) and [DNA design](docs/CHARACTER-LAB-V01.md). Optional UI verification: `node scripts/character-lab-smoke.cjs` with Playwright installed and `PROTOTYPE_URL` set to the running server origin.

## Explore

- WASD / arrow keys: pan relative to camera direction.
- Drag the canvas with a mouse button: pan. Wheel: smooth zoom.
- Q / E: rotate. Home: return to the settlement.
- ?: contextual mouse/touch help; dismiss by tapping the world or pressing Escape.
- ⋯: Character Lab, Home and Debug. Debug shows FPS, draw calls, triangles, inhabitants and camera coordinates; fog, shadows and helpers toggles.

Camera movement and zoom are bounded. The world has ten independently wandering characters generated with the Character Lab DNA pipeline. Click or tap a character to open a following profile card with name, gender, age, all five traits and the three largest heritage shares. Expand minor ancestries for the remaining shares. Close with the card button, Escape or a ground click/tap. Buildings, the hearth and well have circular navigation exclusions. There are no economy, combat or placement systems.

## Night presentation

Open ⋯ → Debug → Lighting to switch between Day and Night without reloading. Night combines cool moonlight/fog with warm flickering hearth light and emissive windows, retaining a single shadow source. Tuning values and performance notes are in [Night Mode v0.1](docs/NIGHT-MODE-V01.md).

## Main files

- `src/core/Game.ts`: startup, lighting, frame loop and diagnostics.
- `src/core/AssetManager.ts`: semantic asset registry, Draco decoding, grounded pivots and palette treatment.
- `src/world/World.ts`: deliberate settlement composition.
- `src/world/SettlementLayout.ts`: shared rotated building footprints, communal area and curved desire paths.
- `src/world/Paths.ts`: one feathered path mesh that follows the actual terrain triangles.
- `src/world/Terrain.ts`, `Environment.ts`, `Water.ts`: coast and hill height field, instanced scenery, water.
- `src/camera/RTSCameraController.ts`: smooth bounded RTS camera.
- `src/entities/Villager.ts`, `src/systems/MovementSystem.ts`: replaceable visuals and bounded steering.
- `src/config/worldConfig.ts`: seed, camera, palette, material color treatment, sunlight, ambient light, shadows, exposure, background and fog settings.
- `vite.config.ts`: original local asset serving and production copying, including local Draco decoder files.
- `docs/ASSETS.md`: complete asset inventory and license provenance.

The kit is kept in its original folder. The asset manager normalizes each model using its transformed bounding box because authored node translations center many models vertically. Clones share geometry/materials; repeated trees, rocks and ground cover use instancing. Palette changes affect only the loaded geometry in memory, never the source GLBs.

## Validation

```sh
npm test
npm run build
```

Tests exercise deterministic randomness, coast/hill heights, shoreline continuity, level building footprints, connected paths and ten minutes of simulated movement for all ten villagers. Optional browser smoke testing requires Playwright and Chromium installed separately; run `node scripts/browser-smoke.cjs` while the dev server is running. `PLAYWRIGHT_MODULE` can point to a preinstalled Playwright package, and `PROTOTYPE_URL` can target a production preview. It checks rendering/asset loading, keyboard pan, zoom, home and debug controls, and saves `artifacts/world-prototype.png`. `node scripts/mobile-smoke.cjs` exercises native touch events in a mobile browser context, checks terrain taps, centered swipes, conventional pinch zoom and responsive controls, and saves `artifacts/mobile-lan.png`. Set `PROTOTYPE_URL` to the LAN preview address for this check.

## Decisions and limitations

- The downloaded kit contains scenery only; villagers use shared primitive geometry with four coat materials. A `Villager` can receive another visual object later.
- Movement uses local steering and destination retries, not pathfinding. It keeps villagers on dry ground and outside major structures; it may pause or change direction near obstacles and does not handle every small prop.
- Terrain is a deterministic faceted height field, not an infinite terrain generator. Building footprints are locally leveled and feathered into the landscape; foundations are not excavated or simulated.
- Water is a matte, gently bobbing plane with instanced subtle ripple marks, with no reflections, shoreline shader or wave simulation. Fog and hemisphere lighting provide simple atmospheric depth; no post-processing stack.
- Shadows use one directional light and a fixed 2048 map. Pixel ratio is capped at two; actual performance depends on hardware. Browser smoke performance on software rendering is not a hardware benchmark.
- The production bundle currently triggers Vite's 500 kB chunk advisory; it builds successfully. Three.js and GLTF decoding account for most of the bundle.
- This directory began with only assets, without a Git checkout. No repository was initialized, no source assets were committed, and nothing was pushed or published.

## Asset license

The owner confirmed the local Viking/Fjord assets were obtained from threejsassets.com under the Pack Commercial License. The published terms allow covered assets in the owner's commercial/client projects and prohibit redistribution of the asset files. See [the license](https://threejsassets.com/license#pack-commercial-license), checked September 30, 2026; the page lists version 1, July 8, 2026. The owner's purchase/account terms remain the entitlement record. This prototype assumes these 47 files are covered by that purchase.

Production builds copy the licensed kit for use by the local application. The raw kit and build outputs stay Git-ignored; collaborators must supply their own authorized copies. No public asset mirror or reusable asset bundle is created or published.

## Next steps

The scriptable Blender character optimization benchmark and /asset-lab comparison page are described in [Asset Optimization Pipeline v0.1](docs/ASSET-OPTIMIZATION-V01.md). Run npm run assets:optimize to generate three LODs and npm run assets:publish to compare them locally. Generated assets and downloaded tools remain Git-ignored. npm run assets:test runs the independent Blender fixture test.

1. Build one production-direction Pillagers Viking, keeping the current placeholders for scale comparison.
2. Validate that character at close, default and overview RTS camera distances; add a simple walk cycle.
3. Tune the Character Lab distributions and occupation preferences through comparisons before expanding into VikingGenome.

## UI language

English is the default language for all user-facing UI: labels, buttons, help text, status messages and errors. Apply this rule to new features and edits across the world and all labs. Character names retain their generated cultural spelling.
