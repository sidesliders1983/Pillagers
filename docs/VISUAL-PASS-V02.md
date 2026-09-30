# World Prototype v0.2 — visual identity pass

Implements [Pillagers issue #1](https://github.com/sidesliders1983/Pillagers/issues/1). This pass changes art direction and composition; the eight existing placeholder villagers, camera ranges, local steering and gameplay scope remain intact.

## Visual decisions

- Roofs and foliage move toward sage/dusty moss, rock toward cool grey, timber toward soft brown, and the water toward blue-grey. Vertex color luminance and local detail are retained; recoloring happens in memory once after loading.
- Lower directional intensity and warmer hemisphere fill reduce deep shadow contrast. PCF shadow filtering supports the configured shadow radius. Sky/fog, both hemisphere colors, sun position/intensity, map size, filtering radius, bias and tone-map exposure live together in `worldConfig.ts`.
- A smooth beach transition replaces the height discontinuity at the old shore. Low-frequency ground variation and broad color patches replace the repeating terrain color pattern. Rotated building footprints receive flat platforms with blended edges.
- Curved, branching paths connect the harbor, communal area, buildings and well. One translucent feathered mesh follows the actual terrain triangles; matching color wear is baked into the ground. Paths do not introduce navigation or job systems.
- Buildings have varied orientations and offsets. Storage and timber props cluster near structures; the central hearth stays open. Scenery uses rejection sampling around shared obstacles and paths, with an irregular forest edge instead of pushing scenery into straight strips.
- A single instanced mesh adds restrained water ripple strokes. The water remains matte without reflections or expensive shaders.

## Validation and review

`npm test` covers deterministic seeds, coast/hill heights, shoreline continuity, level building footprints, route endpoints, actual raycast grounding of paths, and ten minutes of bounded villager wandering. `npm run build` performs strict TypeScript validation and the Vite production build.

The optional browser test exercises pan, zoom, Home and all diagnostic toggles, checks for runtime/console errors and captures the default view. With `VISUAL_REVIEW=1`, it also captures minimum/maximum camera-distance views in `artifacts/`. Software-rendered browser FPS is not representative of hardware performance; compare draw calls/triangles and retain manual feel checks on the user's device.

No dependencies or lights were added. Repeated scenery stays instanced, paths use one mesh, and water strokes one additional instanced mesh. The existing bundle-size advisory remains. Groundcover/props still have no individual collision volumes; proper navigation stays a later milestone.

## Source and delivery

The commercial kit is unchanged on disk and remains excluded from Git. No source models or production asset outputs are published. At the start of this issue, GitHub reported an empty repository (size zero), while this workspace had no `.git` checkout. The changes are delivered in the local runnable project; no issue was closed and no remote branch or PR was created.

Next: one production-direction Viking, then readability tests across camera distances, then the procedural visual representation interface. Full procedural character generation is outside this issue.
