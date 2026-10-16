# Existing campaign resume — review evidence

Issue #161, 2026-10-16. The owner approved pausing on return. No offline progression is added.

## Observations

- A real saved campaign at Summer 810 restores with a responsive styled shell and the exact Core,
  narrative, pinned island recipe and saved pacing. It does not create a new founding chapter or
  play a fresh landing animation. Browser checks retain camera/scene on warm return and exercise
  actual reload as a separate case.
- Synthetic persisted page transitions retain the same canvas and pause playback. These tests
  are explicitly synthetic and are not claimed as native BFCache observations.
- Actual Edge history navigation, with Playwright's BFCache-disabling launch flag removed,
  **did use BFCache**, retained the exact same canvas and preserved the entire campaign.
  See [native navigation evidence](bfcache.json).
- A genuine `WEBGL_lose_context` / restore cycle recovers the existing scene with exact paused
  Core. It does not request another island. The user can reload the saved session or export a
  recovery file if graphics restoration fails.
- Damaged active storage is downloadable; an available resume checkpoint is an explicit choice.
  A blocked generation worker cannot overwrite the old raw active save. Retry then restores the
  checkpoint. Manual save keys remain separate from the new automatic suspension checkpoint.
- The owner reports that returning after **10 seconds and 2 minutes works on a physical device**.
  The exact iPhone/iPad model was not specified. No recording or exported diagnostic trace was
  supplied, so these returns cannot be classified more precisely from the response alone.
  A longer memory-pressure interval remains unverified. See [owner report](physical-review.json).

[Browser run](browser-run.txt) · [recovery run](recovery-run.txt) · [browser summary](browser.json).
These automated checks use desktop Edge, including a touch-capable 390×844 viewport. They are
separate from the physical owner report.

## Restore-work diagnosis

The old caller-thread restore took 18,636 ms in the captured cold Node run, and 634 ms when its
island cache was already warm. The save path constructed a default legacy landscape before
importing its saved island. [Original diagnostic run](baseline.json), source revision
`8193982027668fc9cb10d600e2f291bb8eb3fc16`.

The new diagnostic run spent 79 ms validating small authoritative metadata, 15,295 ms awaiting
actual worker generation, 51 ms adopting the result, and 865 ms committing the validated saved
campaign. Core remained exact. [New run and source hashes](async-restore.json).

These are diagnostic wall times, not a controlled speed benchmark, complete page-ready times,
frame measurements or physical Safari numbers. Asset parsing, canonical reconstruction and
first-use GPU work still cost time. The important architectural change is moving expensive island
reconstruction off the caller thread and removing the throwaway legacy world; it is not a claim
that all main-thread work or cold-loading cost has disappeared.

## Checks and limitations

The approved public session/campaign, async generation and Fjord bridge run passed 33 tests.
The final invalid-camera-pose guard also passed its focused red/green regression. TypeScript,
production build and character validation passed (20 assets / 36 GLBs, including Lab previews).
The complete current-head suite is enforced by the PR's required checks; the PR stays draft while
those checks are pending or failing. Formatting is checked manually and with `git diff --check`.
No formatter is configured in this repository.

Existing saved terrain remains authoritative. When only manual canonical campaign data survives,
recovery explicitly labels the option as campaign data only; that file does not contain saved
scenery or published book passages. Candidate probing never mutates either file.

The 64-event diagnostic trace and bounded long-task aggregate are opt-in via `debugLifecycle=1`.
Trace history crosses a real reload where session storage is available, and can be downloaded
from the game menu. The code records cold navigation without pretending to prove OS tab eviction.
No physical memory-pressure eviction test or recording has been obtained.
