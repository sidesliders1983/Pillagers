# Island preparation progress and diagnostics

The loading screen estimates **completed preparation**, not downloaded bytes, remaining time or
simulation time. A timer never advances the percentage. New, same-founders restart and cold saved
restoration share the following fixed plan; warm cached-page return keeps the existing scene and
does not create an attempt. This is presentation state, excluded from campaign saves and RNG.
Local load and file import from the game menu use the same worker preparation and progress plan,
reuse their owner's decoded scenery, and restore the retained campaign on failure/cancellation.

| Required envelope | Points | Completion evidence |
| --- | ---: | --- |
| Campaign preparation | 2 | Proposal/restoration accepted |
| Geography and receipt | 50 | Unique worker substeps, followed by successful receipt/adoption |
| Houses and scenery | 5 | All existing scenery loads/fallback decisions settled |
| Terrain and nature | 20 | World factory completed, including optional asset/fallback decisions |
| Wildlife | 3 | Required source loads and instances prepared, or existing matching layer reused |
| Residents and settlement | 10 | Initial entity sync and dependent models/wardrobe/rival scene settled |
| Texture upload | 3 | Enumerated textures uploaded |
| Shader compilation | 3 | Existing compile promise succeeded |
| First draws | 3 | Enumerated geometry batches plus a complete first scene draw |
| Playable handoff | 1 | Activation succeeded, controls ready, arrival completed/skipped |

Weights are deliberately coarse and rounded from `docs/qa/cinematic-loading/iteration2.json`:
geography dominated those historical Windows/emulated-touch receipts; terrain/model preparation
cost more than scenery fetch and final GPU work. Those receipts are **not current device timings**.
Worker substep points (48 of its 50) are in `IslandLoadStatus.ts`; nested foundation search trials
are measured but never credited repeatedly. Receipt/adoption reserves two points. Current main
has ten v3 curated islands, whereas the historical v1/v2 pools had two; the stage plan does not
depend on pool size. Recalibration needs matched current browser measurements, not a guessed ETA.

Each envelope reserves all its late-discovered dependencies until its owner closes it. Asset/model
counts are shown as units without equating unlike models' costs. GPU batches are enumerated once
before fractional credit; expansion after credit is an error, not hidden by a monotonic clamp.
Shader compilation has no invented subprogress. The existing 120-second compiler timeout and
240-second worker timeout are unchanged. Supported fallback scenery remains usable and its last
failure/resource is reported; this change does not turn optional failures into mandatory failures.

## Attempts and recovery

Every retry has a new ID and reset record, with the same selected seed/recipe. Reused, already
prepared campaign/scenery envelopes may be explicitly credited on that attempt. Worker callbacks
are fenced by the existing generation client; cancelled model work cannot credit a new attempt.
Non-abortable resource construction still drains before its owner disposes shared sources. Only
the existing result-free GPU wait detaches on timeout/cancel. There is no automatic retry/reseed,
extra worker, offline simulation advance or lowered visual quality.

The loading panel remains visible with the founding chapter, then disappears without a fixed
100% delay. A deliberately open chapter is released as a reader and is not recorded as loading.
The last report can also be saved/copied from **Game menu → Loading diagnostics** after success.
Failed startup exposes its report beside the existing Retry/Back recovery. Clipboard failure on
insecure LAN falls back to local JSON download. Nothing is uploaded automatically.

## Diagnostics contract and limits

`IslandLoadStatus.snapshot()` is the small common record for a later playtest overlay. It retains
one latest attempt, at most 128 timeline entries and no world, resident names, rival facts, story
chapters, saved history, Three.js objects or resource-owning closures. The legacy loading samples
are capped at 128 too. Worker start timestamps use the worker's absolute performance clock; its
reported durations remain worker timings. Parent geography/restoration spans include their child
steps: **do not add parent and child durations together**. An unfinished entry preserves its start.

Reports contain source build (including a dirty-worktree label), attempt/mode, campaign seed,
geography recipe, browser/viewport, quality, screen-recording self-report, total/step elapsed,
completed units, last real progress age, worker state, last bounded error/resource path,
first-frame/playable times and available final renderer counters. Network URLs lose origin,
credentials and query strings. Cache temperature, process memory and GPU timing are explicitly
unsupported/unobserved; renderer counters do not measure GPU memory or GPU execution duration.

After 15 seconds without completed work, a worker/ordinary stage says no new report was received;
compilation says **Still preparing graphics**. This is advisory, not a timeout or proof of a crash.
Actual worker timeout, graphics timeout, abort, resource failure and context loss have distinct
records. Phase announcements, UI clocks and spinners do not refresh real-progress age.

A 250 ms owned UI clock updates elapsed/status only, stops on disposal and is visibility-aware.
It cannot repaint during a synchronous main-thread block; its largest observed gap is evidence
of delayed observation, not proof of CPU overload. The last started stage survives in memory
when execution resumes. A browser-process kill may leave no final report; no crash-proof logging
is claimed. There are no per-frame storage writes, blueprint clones, automatic telemetry or new
render resources. Long network requests/non-abortable model work can still take time to drain;
this issue does not diagnose or fix the reported 1–2 minute loads. Measured causes belong in #151.

## Validation

See `docs/qa/island-loading-259/REPORT.md` for completed checks and uncompleted physical/browser
gates. `node --expose-gc scripts/check-island-load-overhead.mjs` measures synthetic observer cost;
it does not benchmark island loading or GPU work. Keep the PR draft until current-head checks
and the browser/device acceptance evidence are complete.

## Owner slow-resident follow-up

The reported physical-device load exposed repeated native clothing coverage preparation. A refit
now decodes the body's attributes/morphs once for all its fragments and allocates compact fragment
outputs directly. Each refit still reads fresh source data; resident masks remain independently
owned. No persistent cache, source/LOD change, new GPU resource or gameplay rule is introduced.
The loading title returns to its parent after a nested operation, and the redundant new-landing
helper sentence has been removed. See the dated `settlement-preparation/REPORT.md` and comparison
under this issue's QA directory for the CPU measurements, exact-output checks and device limits.
