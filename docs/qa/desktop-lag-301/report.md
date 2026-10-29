# Desktop lag investigation — #301

29 October 2026. **Diagnosis and a focused diagnostic export improvement; owner review required before optimization.**
The reported Ryzen 5 9600X / Radeon RX 7900 GRE blocker is not reproduced here. There is no
Running export, confirmed browser/OS/driver, viewport, or target-device profile. No root cause,
GPU utilization, FPS regression percentage, or universal regression is established.

## Version and evidence

- Fresh main and public `site-version.json` both identify **`c5fcecd1959a7264c1a98924964bebac9b08cddb`**.
  The screenshot build prefix also matches. Investigation route: **`/fjord-play`**.
- That upstream commit passed [Character contracts](https://github.com/sidesliders1983/Pillagers/actions/runs/40724828102).
  This is baseline CI, not validation of this patch's later head.
- [Observed/reported facts and explicit untested matrix](observations.json) preserve the distinction
  between tester reports, screenshot readings and missing runtime measurements.
- [New bounded Node/jsdom measurements](overlay-headless.json) pin source SHA-256 hashes,
  fixture hashes, Node version, UTC and all 32 arms. These measure instrumentation only.
- Computer-use inventory returned no browsers, with **“Local browser use is disabled in Work settings.”**
  No substitute browser, GPU, viewport emulation or historical capture is presented as AMD evidence.
  Physical desktop/mobile gameplay, context recovery and hidden-tab loading remain **not tested**.

## What the screenshots do and do not say

The tester reports severe lag preventing play, roughly 35 seconds preparing the island, and slower
or apparently stopped progress after switching tabs. Reported hardware does not establish the OS.
The owner's smooth iPhone/iPad/old-laptop experience is a separate report, without comparable exports.

The diagnostic screenshot reads **Paused, Low/Low, DPR 1**, N/A FPS, zero interval window and zero
ticks. Its CPU callback p95 is 12.5 ms, retained hitch 361.1 ms and estimated JS heap 416 MiB.
Those are **not active-play measurements**. Mode changes clear cadence/CPU/span windows; the hitch
is retained independently for 60 seconds. One CPU callback sample can exist before a second frame
establishes an interval. The image cannot establish what ran at the time of that hitch.

`CPU frame` covers the synchronous animation callback, including scene work/render submission.
The canonical 500 ms tick timer and queued action/UI tasks also run outside that callback;
a short callback therefore does not rule out periodic main-thread stalls. Frame intervals reflect
scheduling/presentation cadence. Renderer submission duration is not asynchronous GPU execution.
These overlapping quantities must not be summed.

**GPU timer unsupported means the timing extension is unavailable**, not that hardware acceleration
is disabled or that the GPU is unused. VRAM is unavailable. The heap estimate excludes substantial
native/worker/GPU allocations and proves neither a leak nor an out-of-memory failure. No actual
context-loss or driver-error record has been supplied.

## Current path inspection and negative findings

Source findings below are structural observations on the pinned build, not measured hotspot costs.

| Path | Finding / existing protection |
| --- | --- |
| `FjordPlay.ts` animation loop / `tickClock` | Paused still draws the scene. Running enables canonical ticks and presentation activity. Hidden pages stop drawing and explicitly pause playback. Clock ownership, queued-action intent checks and reset prevent offline/catch-up ticks. |
| `GameplaySession.readSnapshot()` / refresh | #167's frozen read view remains cached per committed revision. UI spans use the existing public refresh boundary. No evidence justifies restoring repeated whole-state copies. |
| `LivingWorldController.route()` | #167's equivalent failed-route memory remains bounded to eight entries/agent, with active-time expiry and context invalidation. Return corridors still revalidate obstacles. Route retries are not proven to have regressed. |
| `MeshyHuman.applyDNA()` | Neutral-fit signature reuse, dependency checks and forced-refit fallback remain. Annual refitting is not assumed to be the current cause. |
| Ground selection | `TerrainNavigation.intersectNavigationTerrain()` bounded native-triangle path and the empty-selection refresh guard remain. This historical touch fix is not a desktop steady-state FPS measurement. |
| `FjordScene.ts` frame | Motion, character animation, wildlife/rivals, culture, effects, labels, lighting and rendering share the main thread. Diagnostic datasets remain throttled to 500 ms. Entity animation is not generally gated by camera-frustum membership; off-camera CPU work is plausible but unmeasured. Some hidden/indoor cases already skip work. |
| Renderer / quality | Three r180 creates WebGL2; antialiasing and shadows remain enabled. Low caps DPR at 1 and shadow maps at 1024, uses low water, smaller textures/dressing and Low effect budgets. DPR 1 does not cap canvas pixels on a large monitor. Resize uses CSS bounds. No composer/postprocessing chain was found in this path; native shadows/water still cost work. |

`tests/campaign-read-view.test.mjs`, `fjord-route-retries`, `meshy-fit-reuse`, `terrain-navigation`,
`campaign-playback` and loading lifecycle contracts exercise these protections. Historical
[#166/#167 reports](../fjord-performance-evidence.md) remain unchanged; their old costs and
remaining acceptance limits are not new measurements on current assets or the tester's GPU.

## Hidden-tab loading: preparation versus arrival

1. `IslandLoading.prepare()` awaits the existing worker's messages. Prepared geography/adoption,
   model work and GPU preparation are separate envelopes, with cancellation/retry and attempt fences.
2. `IslandLoading.measure()` yields through `setTimeout(0)`. Texture uploads and first-use draw
   batches also yield once per item. Three r180 `compileAsync()` polls readiness with `setTimeout(10)`.
   Essential preparation can therefore **slow under browser background scheduling**; there is no
   source basis for promising full-speed background completion. Worker execution does not guarantee
   fast main-thread adoption. No essential preparation dependency on the loader's animation rAF was found.
3. New-campaign `arrive()` explicitly awaits rAF and advances its 2.6-second presentation only while
   visible, with each delta capped at 50 ms. This is an **intentional arrival pause**. Continue skips it.
   Loading remains visible until arrival finishes; that alone can look like stopped preparation.
4. `pagehide` cancels loading; gameplay/BFCache/context recovery pause and reset their clocks.
   A hidden tab, pagehide cancellation, GPU timeout and an unrecoverable loading stall are distinct.
   Existing tests cover cancellation/draining, retry fences and bounded GPU waits; they do not
   reproduce real browser throttling. The loader observation-gap metric excludes hidden time.

**No true hidden-tab stall is reproduced.** Next capture the loading JSON before/after hiding at
worker, textures, compile, draws and arrival stages, then foreground for at least 30 seconds.
Compare new and Continue separately on the same seed. Advancing preparation units with a stationary
arrival clock supports expected presentation pause; no progress after return, failed workers or
expired GPU waits require their own minimal lifecycle reproduction. Do not change yields, move all
work to workers, add background ticks or alter arrival/cancel behavior from this report alone.

## Export coverage and the small patch

Existing #260 exports already include build/seed/geography recipe, user agent, viewport, requested
quality/effects, effective renderer DPR and canvas pixel dimensions; mode; rolling five-second
interval mean/p50/p95/p99 and callback distributions; named Core/UI/scene/model-preparation/portrait
spans; bounded 60-second half-second summaries; separate main/portrait calls/triangles; resource
counts; bounded errors/context-loss/stalls and #259 loading timeline. Totals are not GPU-frustum counts.
A 30–60 second capture retains history, but its final interval distribution covers the latest five
seconds, **not the whole run**. Model spans measure preparation, not every runtime animation update.

Missing diagnostic fields addressed here are **the actual context's optional driver identity,
WebGL version, actual drawing buffer versus canvas attribute/CSS dimensions and context attributes**.
The additive `graphics` export inspects the context already associated with the overlay only on
Copy diagnostics / Save JSON. No new renderer, draw, timer, frame query, scene traversal, readback,
blocking GPU wait, automatic upload or game-state read is introduced. Off/disposal releases the
context; early loading/Off exports report `unavailable`. Lost context reports `context-lost`.
The identity extension reports `unsupported-or-hidden` or `unavailable` when restricted. Strings
are capped at 256 characters; the existing 128 KiB export bound and resource limits still apply.
Requested `powerPreference` does not prove the selected GPU or browser acceleration setting.

Still absent: confirmed browser acceleration/driver settings, per-runtime motion/mixer/VFX/GC
attribution, pass-by-pass GPU costs, actual frustum counts, whole-run interval histograms and counts
above 33.3/50 ms. Use a separate bounded DevTools capture / #166 harness for those if needed;
do not grow the player overlay into an always-on profiler. The overlay has no trusted OS/driver
version API; request those from the tester rather than infer them from a reduced user agent.

## Reproduction matrix and ranked next probes

All physical runtime rows in `observations.json` are **not tested**. Pin the same reviewed build,
seed/recipe, saved state, season/year/tick, population, pace and camera pose/path. Start with the
tester's own failing scene; use checked-in `summer-32` / `developed-810` fixtures for local comparisons
only, not as evidence of reproducing their save. Warm up 10 seconds, sample 30–60 seconds and repeat
three alternating pairs. Export while **Running and foregrounded**, before pausing or switching tabs.
Record cache state and screen recording on/off; profile in separate trials to avoid profiler overhead.

| Rank / evidence strength | Probe and smallest conditional follow-up | Expected effect hypothesis / risk / effort |
| --- | --- | --- |
| 1. Renderer/backend and pixel workload; high information value, cause unconfirmed | Paused/Running at the same Low/Low DPR 1; export `graphics`, browser/OS and acceleration setting. Repeat at half width **and** height, then Chrome/Edge vs Firefox on identical state/pixels. Compare calls/triangles/resources, intervals and valid GPU timings. | If both states improve with one-quarter pixels, investigate fill/shadows/water or backend before Core. If a software backend is actually identified, verify the browser's supported accelerated path. Any code fix must reproduce a browser/backend fault first; no automatic quality reduction. Low diagnostic effort; backend/driver risk unmeasured. |
| 2. Running presentation / off-camera model work; source-supported possibility, current cost unknown | Compare stationary/moving camera, then same state looking away; profile `motion.advance`, `FjordEntities.advance`, mixers/skinning, wildlife/rivals/culture, VFX and renderer submission separately. Only if justified, repeat #166's single-system DEV-only ablation. | If motion/mixers dominate, a narrowly bounded redundant-work or pose-update cache may reduce that measured span. It may not change GPU time. Medium effort; animation/shadow continuity risk; never pause canonical simulation for culled actors. |
| 3. Periodic action/scene/UI work; historical precedent with fixes still present | Correlate interval hitches with Core/UI spans, action queue, `syncScene`, route metrics, diagnostic dataset refresh, annual fitting and GC in a bounded main-thread profile. Compare same scene at 1/3/5-minute years only after an initial matched capture. | If a specific invalidation or repeated allocation dominates, fix just that redundant projection/work. Expected benefit is removal of the measured burst, not a claimed overall FPS gain. Small/medium effort; stale UI, lifetime and fitting risks. Preserve cached read views, failed-route expiry and refit fallback. |

For any follow-up, record interval p50/p95/p99, >33.3/>50 ms counts, worst hitch, named CPU spans,
actual GPU-query validity, drawing pixels, all-pass calls/triangles and resource counts. Keep still
and moving camera/Paused and Running separate. A proposed success target is at least 20% reduction
of the identified span with no >5% matched p95/p99 regression, exact Core/RNG replay and unchanged
visuals/lifecycle; these are **future acceptance hypotheses**, not achieved targets. Owner reviews
this diagnosis and measured reproduction before any optimization. If inability to play is reproduced,
escalate that concrete blocker to P0 under #151; do not reopen its accepted umbrella or the ~35 s
alpha loading baseline. Menu/onboarding issues #296–#300 remain separate.

## Ready-to-send tester request

> Thanks for testing! Could you open `/fjord-play?debugPerf=1`, press Play and keep the tab in the
> foreground for 30–60 seconds while the lag is happening? While it still says Running, open the
> overlay's Options and choose Save JSON (or Copy diagnostics), then send that report. Please include
> browser/version, OS, window/screen resolution, whether hardware acceleration is enabled, and your
> graphics driver version if known. If convenient, repeat at half window width and height, and in
> Chrome/Edge versus Firefox using the same campaign. For the loading issue, tell us which loading
> step is visible when you switch tabs and whether it resumes when you return.

The message is prepared for the owner; nothing has been sent to the external tester.

## Instrumentation measurements and validation

The existing harness used two frozen public Core fixtures, Running/Paused, alternating
None/Off/Compact/Details repeats: **32 arms, four exact Core/RNG/history cohorts**, zero timers
Off/after disposal and at most one timer enabled. Timestamps fed to the collector have a synthetic
60 Hz cadence; the table times real Node/jsdom hook/DOM work, **not game FPS or browser layout**.
No WebGL context is created by this harness. Export-only identity overhead on a real driver is
unmeasured; unit/DOM integration tests check that frame/display work makes no identity requests.

| View | Maximum frame-hook p95 (ms) | Sampled hook + DOM p95 range (ms) | Maximum export bytes |
| --- | ---: | ---: | ---: |
| None | 0.0003 | 0.0001–0.0012 | 0 |
| Off | 0.0003 | 0.0002–0.0021 | 816 |
| Compact | 0.0006 | 0.2356–0.6232 | 28,951 |
| Details | 0.0005 | 0.2533–0.5564 | 28,951 |

Mixed-sign Node heap deltas include Core/harness allocations and are not browser memory evidence.
No physical-device overhead percentage or GPU acceptance is claimed.

Reproduction with the repository's pnpm 10 / Node 24 dependencies:

```sh
pnpm install --frozen-lockfile
node --test tests/performance-renderer-info.test.mjs tests/playtest-performance.test.mjs tests/performance-gpu.test.mjs tests/performance-overlay-dom.test.mjs tests/campaign-playback.test.mjs tests/island-loading-lifecycle.test.mjs tests/fjord-route-retries.test.mjs
node --expose-gc scripts/qa/measure-performance-overlay.mjs artifacts/desktop-lag-301/overlay-headless.json
pnpm run build
pnpm run validate:public --tracked
pnpm run validate:characters --lab-previews
pnpm test
```

Local validation:

- All 25 focused tests passed.
- Full suite: **1,599 passed, zero failed/cancelled, ten existing conditional skips** out of 1,609
  tests (845,849.5 ms). Nine legacy source-comparison tests require the optional original Meshy
  source assets; one r3 evidence export requires `RUN_R3_EVIDENCE=1`. No check was weakened or
  skipped because of an earlier failure.
- TypeScript/production build passed, with the existing Vite large-chunk warnings.
- Tracked public-asset validation passed: 635 files, 47 decoded Terrain models, 14 prepared islands
  and 56 exact character sources. Character/explicit Lab validation passed: 20 assets / 36 GLBs,
  12 Golden Characters, 19 equipped modules and Idle/Walk/Run + World.
- All measured source/fixture hashes were rechecked against the final files. The source changes
  were not altered after these measurements and tests. Current-head GitHub CI remains a separate
  delivery gate; the PR stays draft for owner review and missing physical-device evidence.
Formatting is reviewed manually; this repository has no configured formatter. `git diff --check`
passes. Browser/AMD/physical-mobile acceptance is not claimed.

## API references

- [Khronos renderer identity and privacy](https://registry.khronos.org/webgl/extensions/WEBGL_debug_renderer_info/)
- [Khronos asynchronous disjoint GPU timers](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [WHATWG animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames)
- The installed `three@0.180.0/src/renderers/WebGLRenderer.js` supplies the inspected compile polling implementation.
