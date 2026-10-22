# Airborne gull cadence and resident-list integration

The owner reported jerky birds and a collapsed resident list in the longship
preview on 2026-10-22. The resident and land-animal fixes from open PR #250
were missing from this branch. Commit `573a445` was cherry-picked into the
longship branch, preserving the earlier report as historical evidence.

That earlier motion track covered land and shore animals only. Airborne gulls
still exponentially approached each 500 ms snapshot and immediately adopted its
heading, bank, pitch and wing effort. This produced fast initial travel followed
by a near-stop, with abrupt attitude and wingbeat-amplitude changes.

Airborne presentation now uses the same confirmed-position interval, retaining
interpolated flight height instead of projecting it onto terrain. Heading takes
the shortest turn; bank, climb rate and wing effort interpolate together. Wingbeat
phase stays on the continuous presentation clock. No render-frame simulation,
saved-state edits, extrapolation or extra polling is introduced. Grounded wing
folding and stretches remain unchanged.

House, tent and household selections show all residents immediately. Their names
remain links to the selected person, with occupations beside them.

## Validation

- 32 wildlife, motion-track and resident DOM checks pass, with no skips. The new
  production-layer test exercises all six flying gulls across 180/500/600 ms
  snapshots and different frame subdivisions. Every frame is checked for even
  3D displacement, continuous heading/bank/pitch/effort, matching wing-joint pose,
  immutable canonical state and frozen position/attitude/wings on pause.
- 35 additional marine, wildlife-sighting and expedition-mode checks pass, with
  no skips. Sightings remain reproducible through save/load and batched ticks.
- The production build passes, including public-asset validation and TypeScript.
  The existing Three.js bundle-size warning remains.
- The separate QA page passes strict TypeScript. Its pre-existing nullable
  fixture building ID and resize-handler invocation errors were repaired.
- No repository formatter is configured; formatting and `git diff --check` were
  checked manually.

The review page `/scripts/qa/wildlife-home-regressions.html` now opens on a flying
gull, with a wolf switch and live house/tent selection. It uses memory-only
fixtures and does not replace a stored campaign. The game preview remains on
port 5226. Restart its dedicated Vite process after edits and inspect the served
modules, because this ignored Windows worktree has previously served stale
transforms despite updated files on disk.

Current visual browser verification is unavailable: computer-use inventory
returns no apps or browsers. The earlier screenshot/report is not evidence for
this revision. The owner's phone remains the final check of perceived smoothness.
