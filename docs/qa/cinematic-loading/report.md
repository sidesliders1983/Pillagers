# Responsive island loading — measured review

Issue #153 introduces a worker-based geographical preview and camera arrival for **new campaigns and current-island restarts**. The owner excluded saved-season introduction work. Existing load/import and legacy-geography restart retain their established paths. Owner visual acceptance and physical iPhone/iPad verification remain open; this PR does not auto-merge.

## Measurement conditions

Windows development laptop, Microsoft Edge headless with touch emulation. Fresh contexts use campaign seed 32 and the same pinned island recipe, at desktop 1280×800, mobile 390×844 and tablet 1024×768. Low and Standard retain their existing rendering quality. Mobile Standard uses reduced motion; tablet Standard skips camera arrival. All six cases reached Summer 800, tick 500 with no elapsed campaign time or page errors. The QA harness pauses immediately upon readiness to capture the founding state.

The owner's physical iPhone observation was roughly 15 seconds of frozen initial loading. We could not reproduce that on an identified physical iPhone in this environment. The local before/after evidence is a separate browser measurement, not a substitute for that observation.

## Before and after

The baseline at `bf5529f` recorded uninterrupted generation long tasks of **18.74 seconds (desktop) and 20.31 seconds (mobile)**. These default-Low contexts reached readiness in 24.98 and 25.74 seconds respectively. See [baseline.json](baseline.json).

Final runs on the implementation with yielding initial ground wear and indexed tree lookup:

| Viewport | Quality | First terrain preview | Ready | Longest recorded task | Largest 40 ms timer gap |
| --- | --- | ---: | ---: | ---: | ---: |
| desktop 1280×800 | low | 7.04 s | 78.90 s | 1.03 s | 1.72 s |
| desktop 1280×800 | standard | 6.60 s | 73.20 s | 1.24 s | 1.90 s |
| mobile 390×844 | low | 4.22 s | 50.63 s | 1.38 s | 2.16 s |
| mobile 390×844 | standard | 3.79 s | 52.13 s | 1.61 s | 2.51 s |
| tablet 1024×768 | low | 3.60 s | 51.08 s | 0.63 s | 1.00 s |
| tablet 1024×768 | standard | 2.99 s | 37.55 s | 0.92 s | 1.45 s |

These are sequential development runs, not a controlled throughput comparison. **They do not demonstrate faster total loading.** Total time includes module/asset loading, worker generation, data transfer, cooperative yielding, GPU preparation and camera arrival; thermal conditions and browser caches were not controlled. The intended improvement is visible progress and repeated input opportunities during generation. Remaining individual transfer, browser and driver operations can still delay input. Physical mobile responsiveness needs owner review.

[after.json](after.json) retains phase durations, browser Long Task entries delivered before readiness, maximum heartbeat gap, animation-frame callback count and ready-state evidence. It does **not** contain every frame time. A phase's wall time includes any yields inside that phase and must not be read as one uninterrupted task.

[iteration1.json](iteration1.json) records the initial worker/yielding implementation before staged GPU warm-up. [iteration2.json](iteration2.json) records staged GPU preparation before yielding initial ground wear and indexing source trees. These historical runs are retained as observations, without rewriting their measurements.

## Data and resource boundaries

- Each geographical preview contains at most 128×128 heights and existing ground-zone codes: **81,920 bytes** of transferred typed-array data per snapshot. This campaign produced four snapshots, **327,680 bytes total**.
- The final canonical blueprint crosses the worker boundary once. Its measured UTF-8 JSON representation was **16,522,048 bytes**. That is a diagnostic size proxy, not the browser's structured-clone wire allocation. The optional `profileLoading=1` query adds this serialization measurement in the worker; normal play avoids it.
- Ready-state main-context heap readings varied from about **146–311 MB**. They are neither peak memory nor combined worker/GPU memory, and cannot establish a peak-memory improvement.
- Mesh/index/mask equality is checked against the unchanged synchronous path. The generator, seed selection, source assets, terrain detail and saved blueprint schema are preserved.
- No rival markers, private state or settlement footprints enter the 2D preview. The temporary geographical view does not mutate discovery. This change does not implement or claim #147 gameplay fog-of-war.

## Behaviour checks

- Public contract tests cover canonical worker equality, pinned recipe identity, bounded previews, stale results, cancellation, timeout, worker failure and disposal, plus matching synchronous/yielding terrain and ground masks.
- [Original flows.json](flows-2026-10-13.json): unavailable worker → retry; cancellation during generation and during arrival; prior Core/geography restoration; a second campaign seed; skip arrival; explicit saved load without an intro. All four created generation workers terminated, with no page errors.
- [lifecycle.json](lifecycle.json): navigating away terminates the worker without a partial save; a deliberately failed ground texture fetch uses the existing declared native-material fallback and reaches the playable Summer state.
- [legacy.json](legacy.json): an old same-founder campaign restarts without a new-island introduction and preserves its exact saved geography. The browser test first reproduced the unintended introduction, then passed with the original restart route restored.
- Initial cancellation also passed using a real emulated touch tap at 390px width.
- [lab.json](lab.json): requested seed generation, touch cancellation retaining the old landscape, and conifer replanning retaining its seed. Three generation workers were created and terminated, with no page errors.
- TypeScript and the focused terrain/generation regressions pass. Required GitHub checks run on the final PR head; their status is authoritative for release.

The source uses the repository's existing formatting conventions. No formatter is configured; changed code and whitespace are reviewed manually. A complete physical-device background/foreground and long-session memory-leak certification is outside the evidence collected here.

## Owner review

Open [the visual review](review.html), then use **Open a new review tab** or the game's New campaign/Restart action. Review the complete sequence: sea → actual relief → ground colours → overhead descent → playable Summer settlement. Check Cancel and Skip on the physical iPhone/iPad. Existing saved campaigns intentionally do not replay this introduction.


## 14 October follow-up — contextual cancellation and the canonical Clan Book

The owner approved the loading sequence and authorized merge after addressing the PR comments and passing current-head CI. The 13 October measurements and screenshots above remain historical observations; no new timing improvement is claimed here.

- First launch hides cancellation and has no link to the separate root prototype. Worker failure keeps Retry generation. In-game new/restart offers Cancel & Return to Game; internal cancellation and pagehide disposal remain intact.
- GameplaySession prepares the opening before the worker starts. Initial startup adopts that exact session rather than constructing another narrative or a throwaway geographic campaign. Existing new/restart commits retain the proposal's saved book.
- A simple window has an upper-right ×, independent text scrolling and responsive map/text regions. Closing it does not cancel generation. Completion neither dismisses the window nor resets its reading position. The usual menu reader reuses the same chapter; no duplicate auto-popup appears.
- The new public session regression was observed red before implementation, then green. TypeScript, production build and all 19 focused session/book/summer-start tests pass. The browser regression also caught and corrected a reading-position reset during scene mounting.
- [390px chapter verification](book/results.json) checks exact saved/menu text, retained reading position, no duplicate popup, Summer 800:500 and no page errors. [Phone screenshot](book/mobile-reading.png) and [tablet screenshot](book/tablet-reading.png) were visually inspected. These new tests use Edge touch emulation; they do not claim a new physical iPhone test.

Issue #161 owns soft return, BFCache, true cold restore and WebGL recovery. Saved loads remain outside the new-founding introduction. No claim is made that this follow-up fixes the owner's iOS resume report. A future returning-campaign shell must use the saved book and season instead of creating a new opening.

The updated [recovery run](flows.json) passed all six cases: retry retains the prepared opening; generation cancellation and arrival cancellation restore the prior campaign; closing the new-seed chapter does not cancel or duplicate it; same-founder restart permits touch cancellation; explicit saved loading preserves Core and remains outside this intro. All five generation workers terminated and no page errors were recorded.
