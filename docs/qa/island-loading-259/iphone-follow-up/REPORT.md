# Physical iPhone loading follow-up — 22 October 2026

## Retained baseline

The owner supplied `fjordside-loading-run-mvjtlle8-1.json` after the
[review comment](https://github.com/sidesliders1983/Pillagers/pull/261#issuecomment-6347426190).
The adjacent file is the original, unchanged 126,112-byte report, SHA-256
`eaca05e79bcbe55ef8e230ea8730b58cd3600f337098255d6f2ecdadf5ce16ca`.
The comparison receipt retains its build, device, seed and measurement limitations.

This is build `f9feee5406630c88b2b0aa49c20b16c4e9c74484`, **after** the earlier
decode-once/refit improvement. Campaign seed 3055065912 selects geography 7 with
`island-pool-v3` / `fjordside-island-v0.3e-r3`. Quality is Low; viewport 393 × 654;
reported browser DPR 3. The latter does not identify the actual rendering DPR.
The device reports CriOS 155 on iOS 27.0.1. Cache temperature and screen recording
were not established. Long Tasks, GPU duration and process memory are unavailable.

| Physical baseline operation | Elapsed seconds |
| --- | ---: |
| Complete diagnostic run | 118.577 |
| Loading attempt | 118.250 |
| First recorded frame | 115.546 |
| Initial settlement models, inclusive | 44.948 |
| Ten personas within that stage | 44.544 |
| Geography, including adoption/receipt | 42.532 |
| Terrain mesh/masks | 11.418 |
| Initial ground wear | 4.349 |

These durations overlap where nested. The 9.613-second maximum observation gap
does not identify a particular blocking function. The 286 observed resource entries
report 15,107,480 transferred bytes; zero-body entries do not prove missing assets.
The longest observed request is 550 ms for the 5.5 MB long-2 binding. That is not
evidence that its parse, validation, fitting or dependency processing was cheap.

## 1. Persona preparation

Opt-in `characterPreparation` records now distinguish synchronous spans from
async-inclusive waits. They cover verified source fetch/read/digest/decode, cached
source waits, binding fetch/digest/text parse, body/face construction/reconciliation,
module binding validation, clothing/hair/beard/hat fitting, coverage, hair/garment
clearance, walking-pace preparation and final bounds/registration. Resident IDs join
these spans to settlement-model entries; no DNA, names or save content is exported.
Nested spans overlap and async-inclusive duration is not pure network wait or CPU time.
Records are capped at 2,048, disconnect with the run and reject post-disposal samples.
The report also records the actual render pixel ratio and drawing-buffer dimensions.

The matched CPU harness uses the actual new Summer scenario for seed 3055065912,
the existing world LOD, original assets, source reads from disk and stubbed images.
Binding dependency keys take about 0.27 seconds and binding validation about 0.29
seconds in the detailed local baseline. Hair/garment clearance alone takes about
1.11 seconds; body-coverage preparation about 1.2 seconds. These desktop proportions
cannot identify the iPhone's individual costs; the new device subspans are needed.

The retained candidate precomputes which garment triangles can intersect **any**
of the existing +Z clearance rays, using their exact back-space strip. It preserves
triangle order and the native intersection/barycentric calculation. It changes no
geometry, rig, profile, clothing source or pose. Each refit owns temporary candidate
indices, capped at **256 KiB across all its garments**; a dense source uses the old
exhaustive query. The measured campaign needs at most 8,360 candidate bytes per refit.
Construction's temporary number list is also capped at 65,536 entries. No candidate
cache survives the call and mutable resident buffers remain separate.

Three fresh Node A/B processes isolate the original clearance class from commit
f9feee5 against the candidate; all other current instrumentation, inputs and assets
are identical. `--legacy-clearance` selects that exact original source without editing
the working tree. This is separate from the earlier seed-32 benchmark.

| Local CPU operation | Before median | After median | Change |
| --- | ---: | ---: | ---: |
| Ten resident preparations | 4.535 s | 3.660 s | −19.3% |
| Hair/garment clearance, nested | 1.112 s | 0.204 s | −81.7% |

Every resident retains exact native body attributes/indices/morphs, selected modules
and pace. All resident/module geometry buffers and Idle/Walk/Run transform/skeleton
fingerprints match the original clearance implementation in all three repeats.
The factory retains the same one body source, one facial source and 19 module sources.
Node checkpoint memory measurements are in the receipt; they vary with GC and are
neither browser memory nor true peaks. The CPU harness releases each resident before
preparing the next; it does not represent the peak of ten live scene residents.
No reduced memory peak is claimed.

A separate clipping-plane membership/normal precomputation trial did not improve
the matched first comparison (4.588 s versus 4.625 s) and was reverted. The earlier
decode-once body-coverage implementation remains intact.

## 2. Single-use natural terrain handoff

The first terrain formation and `campaign-natural-terrain` call use the same normalized
config, seed and water level. Island foundation grading copies its input heightfield;
the original natural field remains unchanged. The generator can now retain this one
field for its exact result in a WeakMap. Campaign preparation consumes/deletes it
once, before applying the existing rival and campaign foundations. Cloned/imported
sources regenerate through the original path. No persistent cache, pool preload,
new asset download, serialization or heightfield copy is introduced. Only the original
generator result can carry the handoff; there is no version/config cache lookup to go
stale. Existing recipe/version validation and the two-world cache remain unchanged.

The laboratory nature and campaign nature stages remain: their foundations, clearing,
zoning and placement/navigation results differ. Similar names do not justify skipping
either validation or preparation. This change does not ship precomputed full worlds.

Three same-seed Node pairs measure complete generator + campaign preparation.
The median is **10.190 → 9.370 seconds (−8.0%)**. The repeated natural-terrain call
falls from roughly 0.94 seconds to a field handoff. Complete canonical world and
campaign-plan JSON hashes and sizes match in every pair:
`6bcccb9a871df5cf1b1af4b648aeafdf0fddf189d236446ad1e884f51d36be8c`.
This includes terrain, foundations, zoning, placements, navigation and validation.
The handoff holds one original 160,801-number heightfield until consumption, with
no second full-world object. Worker wire data is unchanged. Browser receipt/copy
cost is not measured by this synchronous worker-core harness.

## 3. Initial terrain wear

The prior path builds masks/index for zero wear, then immediately rebuilds them from
the actual settlement/rival paths and parcels. The world factory now samples the
actual initial presentation weights once before terrain construction. Reconciliation
compares the exact ground/grass-plot signature and skips only the already-built update;
plot clearing and UI registration still run. A changed projection follows the existing
update path. Only a small signature and soil-sample count survive, not a second mask
set, heightfield or retained weights array. The callback and weights are not saved.

The matched terrain harness builds the actual seed-7 terrain with placeholder source
materials. Three pairs compare zero-build + update with direct initial weights.
Median **1.936 → 1.456 seconds (−24.8%)**; one after sample is 1.943 seconds, so the
individual ranges overlap. The Node input-yield count falls **1,348 → 969**; this is
not a measurement of mobile input responsiveness. The final drawn geometry/morph
attributes, indices, groups and alpha-mask bytes match, including subsequent wear
changes in the regression test. The final surface fingerprint is
`220aad34bb359a7068e4e3072624b9b67a31ec6ff5177f584214d653998b7b58`.
Final counters are 960,024 vertices, six groups, 2,108,376 drawn indices and five
alpha masks in both paths. Original materials/textures and terrain shading are unchanged.
The redundant work is CPU construction; this does not establish duplicate GPU uploads.

## Validation and remaining acceptance

The focused suite covers entry/save/diagnostic lifetime, bounded observers, exhaustive
versus accelerated hair queries (including the candidate-budget fallback), native
hair/face/wardrobe/age/LOD/animation, exact geography and imported fallback, existing
recipe/save/restart contracts, terrain mask equivalence and live wear/navigation paths.
The final run passed **71 tests, zero failures and zero skips**. Production asset
validation, strict TypeScript and the production build are checked separately.
Formatting is manual plus `git diff --check`; no formatter is configured.

There is **no new physical-device after measurement, first-frame total or full WebGL
playthrough**. Browser control returned no apps/browsers. Use the same LAN port and
device, Low quality, viewport, recording and comparable cache conditions. The exact
diagnostic replay is `/fjord-play?diagnostics=load&entry=qa-new&seed=3055065912`.
Repeat and export the JSON. Compare individual synchronous/wait subspans, total load,
first frame, observation gaps, render DPR and resource counts. Then separately open
ordinary `/fjord-play` and verify activation, playback, saves and interaction; diagnostic
completion deliberately never enters gameplay. Keep PR #261 draft pending those gates
and exact-head CI. Further binding/mesh work belongs under #151 after matched evidence.

Reproduction scripts: `scripts/qa/measure-settlement-models.mjs` (with `--seed=3055065912`
and optional `--legacy-clearance`), `measure-loading-geography.mjs` (with/without
`--reuse-natural`) and `measure-loading-terrain.mjs` (with/without `--prepared-wear`).
Each accepts a label and optional baseline JSON path; A/B checks fail on output drift.
`summarize-loading-follow-up.mjs` rebuilds the adjacent comparison from retained local
run outputs. Timings are elapsed operations, with Node memory checkpoints and explicit
scope limits. Do not sum these three percentages or predict an iPhone loading time.
