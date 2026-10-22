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
| Geography and receipt | 50 | Prepared island downloaded, unpacked and verified, followed by receipt/adoption |
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

The prepared-island path satisfies those same fixed dependencies when verification succeeds;
download/unpack starts alone credit no points. Diagnostics record actual `island-download`,
`island-unpack` and `island-verify` spans, without inventing procedural phase measurements.

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

## Diagnostic-only loading run

Open `/fjord-play?diagnostics=load`, or choose **Run loading diagnostics** on the start menu.
Choose **Test saved campaign**, **Test original arrival**, or **Test a new scenario**. The run uses
the real loading path, including prepared-island loading/restoration, assets, residents, texture uploads,
shader compilation, initial draws and the normal arrival. It stops before campaign activation,
playback or installation of the campaign clock. The scene and its owned resources are disposed;
no active save or resume checkpoint is replaced. A new test scenario therefore needs no campaign
replacement confirmation. Regular play retains its existing confirmation and activation gates.

At completion, cancellation or failure, the result screen attempts a local JSON download and
keeps **Download diagnostics JSON**, **Run again** and **Back to start menu** available. Some
mobile browsers require the explicit download click. Retrying creates a fresh recorder for the
same selected seed/source; returning to normal play removes the diagnostics query flag.

The `fjordside-loading-run` v1 report includes the ordinary loading status and renderer counts,
up to 2,048 preparation spans, 2,048 observed window Resource Timing entries, 512 settlement model
preparation durations and 512 main-thread long tasks where the browser supports that API.
Truncation counts and unsupported observers are explicit. Network paths exclude origin,
credentials and queries; embedded image/blob data is omitted. It records available request and
response timings, transfer/body byte sizes and HTTP status. Zero sizes/status do not establish
cache hits or failures. Model durations include create/reconcile/bounds and any waiting; network
duration, nested preparation time and long tasks overlap and must not be added as total CPU time.
Preparation timestamps use each loading attempt's origin; resources/models/long tasks use the
outer run's origin. Internal worker/cache/decoder activity may not produce window entries. Files
loaded before choosing the run are outside its capture window. A run beginning after another run
can be warmer; this mode deliberately does not clear caches or infer cold/warm status.

The extended observers and records exist only during this opt-in run, disconnect before export,
and perform no automatic upload or storage logging. GPU execution time/process memory remain
unsupported. A browser-process kill can prevent the final report, as with ordinary loading.
The diagnostic path still prepares and draws the scene: it measures real load costs rather than
estimating them without loading assets.

## Physical-device follow-up

The original iPhone report for build f9feee5, seed 3055065912/recipe 7 and Low quality
is retained unchanged under `docs/qa/island-loading-259/iphone-follow-up/`, with matched
local before/after receipts and the current validation limits. New diagnostic runs add
up to 2,048 `characterPreparation` spans: synchronous operations are distinguished from
async-inclusive waiting, with resident IDs for correlation. Body/source/binding, fitting,
coverage, clearance, pace and bounds phases stay separate; parent/child spans overlap.
The actual render DPR and framebuffer dimensions accompany the existing renderer counts.

Three bounded preparation changes preserve the earlier coverage optimization and source
fidelity: temporary, budgeted hair-clearance triangle candidates; a single-use natural
heightfield handoff within generation; and initial terrain masks built from the exact
current settlement/rival wear instead of a zero-then-rebuild pass. Changed wear still
uses the existing update path. No new world/save field, pool preload or permanent model
cache is introduced. See the follow-up report for byte/pose/canonical-world equivalence,
memory tradeoffs, three-repeat local timings, the rejected candidate and the pending
matched mobile diagnostic/gameplay rerun. Local CPU gains do not predict mobile load time.

## Prepared fixed islands and character sources

The next owner-supplied run still spends 43 seconds in geography. Fjord Play now reads the complete
prepared final blueprint/plan for its selected version and seed, rather than rerunning campaign
generation on the device. Historical v1/v2 pools remain available. Committed publications have
build-time source/dependency checks and runtime compressed-identity/size verification. Shared
character source bytes are also prepared losslessly, while DNA/faces and individual fits stay
independent. No visual LOD or gameplay rules change. See the current
[campaign publication contract](FJORD-ISLAND-CAMPAIGNS.md#prepared-publications-259-follow-up) and
[matched CPU measurements and limits](qa/island-loading-259/prepared-campaigns/REPORT.md).
