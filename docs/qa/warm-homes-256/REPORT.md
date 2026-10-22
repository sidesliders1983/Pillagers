# Warm home lighting #256 — review receipt

Implementation stacks on approved-preview #237 revision
`f0f02075f11c53d83a96a77d55492d882a81ce5e`, itself based on #236.
The owner requested Northern Light as the default. New housing glow remains
opt-in pending visual acceptance. Neither this receipt nor a successful unit
test constitutes a real-game visual/GPU or physical-device pass.

## Executed validation

- 61 focused checks passed in the complete lighting/housing/season/lifecycle/rival
  batch, with zero failures or skips. The final supported-asset correction is
  additionally covered by the housing/launcher rerun.
- Production build, strict application TypeScript and public asset validation pass.
  The existing large Three.js chunk warning remains.
- Both new QA TypeScript sources pass a separate strict TypeScript check.
- Manual formatting review and `git diff --check`; no project formatter is configured.
- LAN launcher and a published mask return HTTP 200 on isolated port 5229.
  This checks serving only, not rendering. Browser inventory exposed no controllable
  app/browser, so paired in-game captures could not be taken by the agent.

The focused cases cover default/query policy, interpolation without frame scans
or material recompilation, source/neighbor instance isolation, native snow hook
composition, upgrade/removal, actual household reassignment and salvage,
currently observed versus hidden/mapped-only rivals, exact GLB/mask identities,
UV triangle gating and unchanged authored triangle positions/draw groups. The
existing annual/campfire tests cover canonical fire, deterministic flicker,
pause, reduced motion and light ownership without changing fire implementation.

## Authored surface review

The adjacent `homestead-views.png`, `longhouse-views.png` and `farmHut-views.png`
are **software source projections**. Orange is a diagnostic surface overlay,
not the final shader color or a game screenshot. They confirm placement only.
The rejected `greatHall-rejected-mask.png` records why GreatHouse support was
withheld: a projected aperture mask also colored the exterior back wall.

Supported: Homestead, Longhouse, Farm Hut. Explicitly unlit: Tent, Hut,
GreatHouse, Farm Homestead. The latter sources need a separately reviewed
authored surface correction before support can be claimed. Original assets are
unchanged, and no substitute window mesh is introduced.

## Incremental CPU and resource budget

`cpu-report.json` records 15,000 warmed CPU-only update samples per case.
This is the same native emissive path on Low/Standard, **not** a full village
render benchmark. Millisecond differences this small are near timer noise.

| Homes | Delta p50 ms | Delta p95 ms | Delta p99 ms |
| --- | ---: | ---: | ---: |
| 5 | .0003 | .0008 | −.0006 |
| 80 | .0010 | .0009 | .0018 |

Code/resource inspection: zero added local or shadow-casting lights, zero new
draw groups/passes, zero additional instance material clones. Three shared
512px mask textures cost approximately 4 MiB RGBA with mipmaps, independent of
home count. Three shared expanded geometry buffers replace source runtime
buffers once before instancing; per-corner UVs add bounded buffer memory, not
one geometry per house. Actual renderer draw/material/texture retention,
GPU time and physical iPhone/iPad frame percentiles remain unmeasured.

## Pending acceptance

Use `/scripts/qa/warm-homes-256.html`: compare the same archived real save under
current annual lighting and warm homes, for summer, autumn twilight, midwinter
and returning winter light. Check Low/Standard, normal/close views, native
pause/resume, fire lit/extinguished, effects Off and device reduced motion.
The fixture deliberately includes both supported and unsupported homes.
Use existing home controls for upgrade/removal and household reassignment.

Paired game captures, visible warm-home readability at strategy distance,
matched fire appearance, real village/GPU measurements and physical devices
remain open gates. Keep housing opt-in and the PR draft; do not auto-merge.

## Ordinary preview link correction — 22 October 2026

The owner reported an unlit inhabited Homestead in a real campaign on port 5229.
The ordinary game route still defaulted to housing emission off; only the
comparison iframe appended the candidate query. The dedicated review server now
injects a development-only candidate default for ordinary `/fjord-play` links.
Explicit `homes=baseline` still overrides it. Production activation continues to
require `homes=warm-v1` until owner visual acceptance.

Eight focused housing/launcher checks and the production build pass after this
correction. The served source was checked for the enabled review-server flag.
The native GLTFLoader also finds the expected `Mesh_0` binding and creates the
aperture UV channel on Homestead (13 triangles), Longhouse (11) and Farm Hut (22).
That loader check stubs texture decoding and is not a WebGL/image test. Browser
inventory again exposed no controllable browser, so device visibility remains
subject to the owner's reload and review. Existing campaign storage is retained.

## Ground spill and fauna follow-up — 22 October 2026

The owner confirmed visible house windows on their device, then requested warm
spill on snow and reported livestock staying bright. New source observations:
all 27 published animal models use lit PBR; the nine goat/pig/sheep variants have
an imported white emissive factor, unlike cattle and wildlife. Runtime source
preparation disables animal-coat emission and the livestock exporter clears it
for future publications. Original models/textures/animations remain unchanged.

The candidate now batches warm, terrain-conforming ground patches for occupied,
supported windows. One draw/material/geometry per visible settlement layer is
added, with no new lights, shadow passes or textures. Empty/summer batches do not
draw. Visibility and submerged-ground rejection are tested. Window anchors are
derived reproducibly from the same aperture mask samples. Existing campfire code
and tuning remain unchanged.

87 focused lighting, housing, fauna, wildlife, marine, livestock and rival checks
passed with no failures/skips. The final submerged-ground guard is covered by
the subsequent focused rerun. Production build and asset validation pass. Three
offline GLSL compile/link variants (no fog, linear fog, exponential fog) pass;
see `spill-shader-report.json`. This does not establish rendered appearance.

`spill-cpu-report.json` preserves the new CPU-only measurements separately from
the original emission-only benchmark above. For 5/80 homes (10/160 patches):

| Operation | 5 homes p50/p95/p99 ms | 80 homes p50/p95/p99 ms |
| --- | --- | --- |
| Cached Core sync | .0040 / .0113 / .0246 | .0516 / .0805 / .1533 |
| Changed layout rebuild | .0673 / .1936 / .3731 | .5858 / 1.2624 / 1.3501 |

The frame-uniform delta is at timer-noise scale (p99 at most .0002ms). Rebuilds
are housing/visibility events, not a periodic frame operation. Counts are code
budgets, not captured GPU counters. Physical-device GPU timings and paired
captures of snow spill and dimmed coats remain pending owner review on port 5229.
