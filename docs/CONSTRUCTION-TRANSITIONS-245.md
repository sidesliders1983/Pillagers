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
| 1–2.05 s | New house revealed bottom-to-top using a local clipping plane |
| 1.45 s | Upgrade swaps the old model for the target; brief low-poly dust puff |
| 2.08–3.2 s | Upper platforms, braces/ledgers, posts, ladder and props removed |

`ConstructionTransitions.play` retains the old model until the swap. New builds clone
only instance materials for clipping and preserve existing seasonal shader hooks.
Finish/cancel restores the original bindings. The animation is wall-clock feedback,
so an accepted build remains readable when the simulation is paused. Hidden documents
do not advance it. Duration/timing constants and the two presets are centralized in
the construction modules. No audio dependency is introduced.

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
both house roots are briefly owned, but only the appropriate state is shown; the old
root is released at the swap. A rapid next upgrade first completes the previous visual
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
