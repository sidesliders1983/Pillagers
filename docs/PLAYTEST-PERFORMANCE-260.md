# Playtest performance overlay — #260

Started from a clean main checkout at `671270ebfdef32b55d081e5d9cd1d2dcdc623b92`.
No gameplay, quality, asset budgets or canonical save fields change.

## Use in the built game

Choose **Debug / Performance overlay → Compact or Details** in the normal start
menu, before opening a campaign. The same preference is in the game settings.
`/fjord-play?debugPerf=1` enables Compact at entry; the URL override is intentional.
Default is Off. Only `fjordside-performance-view` is stored in localStorage;
it is separate from campaign saves.

The block shows the real build identifier, UTC sample time, elapsed diagnostic
session time, mode and effective renderer DPR. Unknown builds say `local/unknown`.
Move corner cycles through four positions above ordinary navigation. On loading
screens the view lives inside the existing modal/focus ownership, alongside the
founding chapter. Only interactive controls intercept pointer input.

Freeze display stops visible statistics, not gameplay or the collector. Its
timestamp and Unfreeze button remain visible. Options contains Copy diagnostics,
Save JSON and a manual screen-recording annotation. The overlay never records
the screen or uploads anything. Both denied clipboard access on HTTP LAN and
download restrictions leave selectable JSON. A late copy response cannot reopen
a disabled/replaced view.

## Reading the numbers

| Reading | Meaning and limits |
| --- | --- |
| FPS, interval mean/p95 | Rolling callback intervals over at most five seconds, capped at 2,048 samples. Not measured physical display presentation. Loading and hidden-tab gaps are excluded; changing mode starts a new window. |
| CPU frame p95 | Synchronous work in the existing main animation callback, including scene updates/render submission and destination preview. Not CPU utilization. |
| Core/UI | Actual synchronous public command/tick batch and projection/UI refresh boundaries. Processed canonical ticks and rate are recorded separately. |
| Scene submit CPU / async wall | Synchronous initial submission of an async scene operation, and its complete wall duration. Resumed async continuations are not inferred to be CPU time. |
| Model CPU / wall | Existing #259 native-character preparation observer: separately labelled synchronous and async-inclusive samples. Nested spans overlap; do not add them. |
| Portrait CPU / wall | On-demand snapshot submission and completion, separate from main frame callback work. The existing snapshot readback is unchanged; no readback is added for diagnostics. |
| GPU main | Asynchronous elapsed GPU query for the existing main render, including its native shadow/nested passes. Unsupported, uninitialized, busy, pending, stale, disjoint or lost-context readings show N/A. Paused rendering still has real GPU work. |
| Draw workload | Main-with-shadows and portrait snapshots have separate counters. Both portrait render/output passes share their portrait scope. No extra draw pass is introduced. |
| Geometries/textures/programs | Actual renderer resource counts and observed high-water marks, not VRAM bytes. |
| Heap | Optional, non-standard `performance.memory` JS heap, sampled every five seconds. Excludes/unreliably covers workers, native and GPU allocations. VRAM and total app/device RAM remain unavailable. |
| Hitch | Worst recent main-thread frame scheduling gap, retained for sixty seconds independently of the small event ring. Long Tasks are separately observed only when the API is available. Neither signal proves OOM or a leak. |
| Load callback gap | #259's maximum observed loader callback gap, with a nominal 250 ms cadence. Kept separate from runtime frame intervals; elapsed/stage/progress ages and first-frame/playable timing are retained in the export. |

CPU time, GPU duration and frame intervals overlap and must not be summed.
There are no guessed CPU/GPU percentages, device memory limits, forced quality
reductions or wall-time catch-up. Details/export include seed/recipe, canonical
time/pace, viewport/drawing dimensions, own population and visible-instance
counts. Instance visibility flags are not GPU frustum/occlusion counts. Rival
coordinates, identities, private stocks/history and complete campaigns are not
queried or exported. Error URL origins, credentials and queries are redacted.

## Ownership and hard bounds

One entry-owned view continues through loading, import/restart/retry, gameplay
and BFCache return. The existing #259 `lastIslandLoad()` version-1 snapshot is
the shared read-only seam: attempt ID, UTC origin, stage, percent, worker/error
and at most 128 timeline entries. The overlay reads this snapshot twice/second;
it creates no parallel loader or generation observer.

There are 2,048 scalar slots per metric, 120 half-second summary records, 32
event markers, one retained latest error and 61 one-second hitch buckets. The
typed metric storage is approximately 0.47 MiB while enabled. Export is capped
at 128 KiB UTF-8, trimming old summaries/timings if necessary. No per-frame
serialization, scene traversal, memory request, save write or console log occurs.

GPU sampling attempts/polling are limited to twice/second and four pending queries
on the actual world context. A query owned by another consumer is left alone;
results are read only after availability, rejected on disjoint, and released on
Off/replacement/context loss. No `finish`, blocking query read, measurement pixel
readback, second renderer or extra pass is used.

Off removes observers, timers, global listeners, query objects, typed buffers and
history. Late async results are fenced. Existing source-character observers use
an enabled predicate to bypass their clocks while diagnostics are disabled.

## Reproduction and validation

```powershell
pnpm install --frozen-lockfile
node --test tests/playtest-performance.test.mjs tests/performance-gpu.test.mjs tests/performance-overlay-dom.test.mjs tests/character-preparation-observation.test.mjs
node --expose-gc scripts/qa/measure-performance-overlay.mjs scratch/performance-overlay/headless.json
pnpm run build
pnpm run validate:characters --lab-previews
pnpm test
```

[Executed headless evidence](qa/performance-overlay/headless.json) pins source and
public #167 fixture hashes. Thirty-two balanced arms cover None/Off/Compact/Details,
Running/Paused, initial summer and developed Winter-810 Core fixtures. All four
Core cohorts retain exact byte-identical serialized Core/RNG/history. The harness
uses synthetic cadence solely to exercise aggregation; its timings measure real
host JS/DOM work. It has no browser layout, WebGL, actual camera or controlled
screen recorder. Its optional Node heap delta includes harness/Core allocations
and is not browser or device RAM. Do not use these results as a full-game frame
regression percentage or physical-device acceptance.

The latest headless run's maximum p95 frame-hook costs were 0.0004 ms Off,
0.0008 ms Compact and 0.0007 ms Details. Sampled hook-plus-DOM p95 ranged
0.245–0.732 ms Compact and 0.282–0.705 ms Details across cohorts/repetitions.
There were zero timers Off, at most one enabled and zero after disposal; reports
peaked at 28,435 bytes. Node heap deltas had mixed signs and include Core/harness
allocations; they are not evidence of stable browser memory or a leak. The
earlier optimized run also varied substantially, so no device target is claimed.

The [initial measurement](qa/performance-overlay/headless-initial.json) is retained
with its own source hashes. Compact originally updated hidden Details text;
caching the fixed DOM fields and skipping hidden Details avoids that work.

The first broad Windows run had one inherited CRLF provenance mismatch in the
unchanged `scripts/prepare-female-hair.mjs` and one in-progress new-test failure.
The pipeline receipt matches the canonical HEAD LF blob (`cb8aa6af…`), while this
Windows checkout initially had CRLF bytes (`6fe76009…`). Restoring the unchanged
canonical blob locally produced no source diff and the three hair tests passed.
The new regression was fixed and focused tests rerun. No validation or receipt
was weakened. Current-head GitHub CI remains the delivery gate.

Source formatting is reviewed manually; this repository has no configured
formatter. On 23 October 2026 the owner tested the built LAN overlay at
`http://192.168.68.115:5180/fjord-play?debugPerf=1` in response to the physical
iPhone/iPad review request and confirmed: "Getest: leesbaar en bediening werkt."
This confirms physical-device readability and control usability. The response
does not specify device model, an exported report or a recorded capture.

The implementation session exposed no connected browser surface
(`apps: [], browsers: []`); opening the in-app browser also returned unavailable.
A real desktop/phone capture, developed-village Off/Compact/Details comparison
at identical camera/quality/DPR, the proposed <1 ms sampled overhead / <5% p95
frame-regression device targets and context-recovery visual QA remain **pending**.
Keep the PR draft until these acceptance limits are reviewed; #151 remains the
integrated performance gate.

For owner review: capture loading → play → pause/resume, move/freeze the block,
select residents, use camera/Map/story, toggle Off/on, copy/save on HTTP, then
background/return. Record recorder on/off separately and export the same-session
diagnostics. Context recovery requires a real context interruption; do not infer
its visual behavior from jsdom.

## API references

- [Khronos GPU timer queries](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [Three renderer info/reset scope](https://threejs.org/docs/pages/WebGLRenderer.html), checked against installed r180 source
- [MDN performance.memory limits](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)
- [MDN Long Tasks availability and meaning](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming)

## Desktop discrepancy follow-up (#301)

Copy diagnostics / Save JSON additionally inspect the existing WebGL context at
export time: `graphics` includes WebGL version, masked and optional unmasked
vendor/renderer identity, actual drawing-buffer pixels, canvas attribute size,
CSS bounds and selected context attributes. There is no new frame/poll work.
Identity may be `unsupported-or-hidden` or `unavailable`; an absent/lost context
is labelled explicitly. Driver strings are bounded. A requested power preference
is not proof of GPU selection, utilization or the browser acceleration setting.

Export during foreground **Running**, before pausing: the final interval
distribution is a rolling five-second window, while bounded summary history
covers up to sixty seconds. Read the [#301 investigation and tester request](qa/desktop-lag-301/report.md)
for controlled comparisons and untested target-device limitations.
