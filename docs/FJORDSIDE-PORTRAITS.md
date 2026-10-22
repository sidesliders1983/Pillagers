# FjordSide resident snapshots

Persona cards use `ResidentPortraitStudio` through the active `FjordScene`.
The studio borrows the resident's completed native world rig, fitted clothes,
hair, face morphs and current pose. It uses the existing world renderer and
never creates a WebGL context for a card. Borrowing is synchronous; parent order,
transforms, visibility, animation and renderer settings are restored before
returning, including on graphics/encoding errors.

Four cached native head anchors require only twelve skinned source-corner
evaluations. Selection does not build a full posed body surface, load LOD0 or
refit another live resident. A changed appearance that has not reached the world
model, or a historical/indoor person without a live model, uses an owned world-LOD
instance on the same renderer, with cleanup after success, failure or closing.

The 64px card avatar is captured at 128px (Low) or at most 192px (Standard).
One reusable pair of bounded render targets preserves linear HDR lighting and
the standard Three.js ACES/sRGB output conversion. Targets and readback buffers
are released with the scene; the borrowed renderer and residents remain owned
by the world. Context recovery creates no replacement portrait context.

`CharacterPortraits` retains its serial queue, abort checks and bounded 24-image
cache. Keys include the resident, appearance and asset versions. Revisiting an
unchanged resident reuses its PNG. Superseded queued selections are skipped.
Canonical DNA, parentage, birthdays, saves and gameplay do not change. The
standalone Character Lab studio remains separate from this in-game avatar path.

## Reproduction

```powershell
node --test tests/resident-portrait-studio.test.mjs tests/persona-portrait-dom.test.mjs tests/character-portraits.test.mjs
node --expose-gc scripts/qa/measure-portrait-selection.mjs scratch/portrait-selection/result.json
pnpm run build
pnpm run validate:characters --lab-previews
pnpm test
```

[Raw preparation measurements](qa/portrait-selection/headless-preparation.json)
record base revision, source hashes, real founding residents and asset requests.
On the recorded laptop run, legacy LOD0 preparation took 631–1,767ms for three
different clothed residents. Borrowed snapshots took 0.15–3.48ms over six captures,
with no additional asset requests and one reusable render-target pair. These
measure **CPU preparation** with stub graphics/PNG boundaries, not complete
browser rendering, GPU memory, iPhone FPS or total selection latency.

Regression tests exercise real native rigs and the mobile card controller:
repeated selection, cache reuse, obsolete requests, source/morph/pose retention,
renderer restoration, target cleanup and late archival-load disposal. Source
formatting is reviewed manually; this repository has no configured formatter.

Physical-device validation remains required: repeatedly select at least ten
residents on the affected iPhone, revisit earlier cards, keep the clock running,
then background/return. Confirm the three-quarter images, stable scene and no
multi-second stalls or context loss. No connected browser surface was available
in the implementation session; headless evidence does not establish that every
reported crash has the same cause.
