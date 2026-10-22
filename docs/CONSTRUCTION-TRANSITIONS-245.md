# Construction transitions v0.1

Fjord Play uses one presentation system for house construction and size upgrades.
The canonical Core build/upgrade command still completes immediately. No scaffold state
is persisted, and temporary objects do not enter navigation, collision or selection.

## Building envelope

`src/construction/BuildEnvelope.ts` defines a building-local, metric contract:
footprint, base, eave and ridge heights, scaffold margin, light/heavy preset and material
profile. `FjordModels` measures the fitted target house once when creating it. Named
house geometry excludes a farm's authored yard, fences and props. Heights use the
target source bounds and the explicit housing profile's eave ratio; these are stylized
working heights rather than authored roof seam measurements.

All four sizes are covered: Hut, Homestead, Longhouse and Great Hall. Farm Hut and Farm
Homestead have their own metadata entries and use the same light preset. Longhouse and
Great Hall use the heavy preset. The union of old and target envelopes is calculated in
target-local coordinates, including any change of position or rotation, so an expansion
does not leave the old form outside the frame.

## Scaffold generation and timing

`ScaffoldGenerator` samples a rectangular perimeter outside the source's overhangs.
The two shared presets control spacing, pole thickness and working levels. The light
preset has one working level; the heavy preset adds a second level when the building
is tall enough. Deterministic variation changes post thickness, spacing and top height
without consuming campaign RNG. Each frame includes ledgers, sparse single braces,
paired planks, block-like rope lashings, one rough ladder and three small material props.
It is a stylized timber work frame, not an archaeological reconstruction.

The 3.2-second sequence is:

| Time | Presentation |
|---|---|
| 0–0.6 s | Staggered posts and small material stack |
| 0.45–1.1 s | Ledgers, braces, platforms and ladder |
| 1–2.05 s | Every target, including upgrades, revealed bottom-to-top using a local clipping plane |
| 1.1–1.9 s | Upgrade crossfades old → target with smooth complementary opacities |
| 1.5 s | Brief low-poly dust puff during the crossfade |
| 2.08–3.2 s | Upper platforms, braces/ledgers, posts, ladder and props removed |

`ConstructionTransitions.play` retains the old model until the 0.8-second crossfade
finishes. Both upgrade models use temporary material copies with complementary eased
opacities, transparency and depth writes disabled for the overlap. Authored material
opacity is multiplied rather than replaced; a translucent yard retains its original
appearance. `ConstructionMaterials` shares copies within each model and preserves
seasonal shader hooks. Every target uses the same foundation-to-roof reveal, including
upgrades. Its clipping plane follows the fitted target's own world height range,
including source scale and placement, independently of the larger old/new scaffold
envelope. Full opacity at 1.9 seconds does not remove clipping early: the roof finishes
at 2.05 seconds. New builds use temporary copies only for clipping. Completing or
cancelling the effect restores exact original bindings before releasing an owner.
The animation is wall-clock feedback,
so an accepted build remains readable when the simulation is paused. Hidden documents
do not advance it. Duration/timing constants and the two presets are centralized in
the construction modules. No audio dependency is introduced.

Future occupational building models can use this same transition without authored
per-building animation. Register their source geometry and construction metadata:
footprint, base/eave/ridge heights, material profile and light/heavy preset. A workshop
with a chimney, for example, needs its chimney included in the measured ridge bounds.
The current house profiles remain in `housingConstructionProfiles`; a model may instead
provide explicit `userData.buildEnvelope` metadata. This does not add a Blacksmith model
or turn a resident occupation change into a construction command. A synthetic workshop
contract test verifies independent source scale, foundation height and scaffold preset.

## Integration and ownership

`FjordEntities.sync` starts a transition only for a newly appearing house after its
initial baseline, or an existing house whose canonical upgrade level has increased.
Repeated snapshots and occupation/specialization appearance swaps do not replay it.
World replacement resets the baseline. Removal, salvage, rapid successive upgrades and
scene disposal finish and release the corresponding temporary owners.
Observed rival snapshots opt out: discovering an existing rival house does not invent
a witnessed construction event. This v0.1 hook presents local campaign build commands.

Each system owns five shared low-poly geometries and five materials. A transition
allocates one instance buffer for each used part kind and one for its 12 dust pieces:
at most five scaffold/effect draws per site. Posts, ledgers, braces and ladder parts
share a hexagonal cylinder; planks and lashings use boxes. Active frames update instance
matrices without rebuilding topology. Temporary geometry casts no shadows, has no ray
hits and is released at completion. An idle system does no procedural frame work.

The original house geometry/materials and asset files are not edited. During an upgrade
both house roots are briefly shown during the crossfade; the old root is released at
its end. A rapid next upgrade first completes the previous visual
transition. This is intentionally bounded presentation, without worker AI, real labour
simulation, scaffold physics, per-piece colliders or saved construction progress.

## Review

`scripts/qa/construction-transitions-245.html` uses actual production house assets,
`FjordModels`, `FjordEntities`, real Core build/upgrade commands and the production
projection. It uses an in-memory campaign on a flat review stage, without reading or
writing campaign storage. Scenarios cover every size transition, the farm variant and
three simultaneous builds. Replay, pause, timeline and envelope overlays expose phase,
post coordinates, eave/ridge heights and preset. The game also exports throttled
`canvas.dataset.construction` diagnostics.

Tests in `tests/construction-transition.test.mjs` cover bounds, transformed unions,
preset generation, reveal/swap timing, ownership, shared resources, interruption,
salvage, selection changes, baseline loads and real Core commands through every upgrade.
Existing housing, yard, presentation and lifecycle tests remain applicable.
