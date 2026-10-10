# Interactive Fjord settlement — QA

Issue [#88](https://github.com/sidesliders1983/Pillagers/issues/88). Based on PR #92, merged at `16e6999aeb1751a86aedc15b6a224a6c1bdbd3c8`.

## Result

The 3D settlement uses the same management panel and canonical commands as the 2D settlement. Selecting a resident shows a gold ring, with cyan rings and English labels for their visible partner, children and current home. Selecting a home identifies its visible occupants. Labels avoid overlap and connect to their model anchors with thin leader lines.

Both views transfer campaign state, selected identity, running intent, cycle speed, fractional ticks and exact Fjord geography through a shared checkpoint. The outgoing clock stops. Loading time does not advance simulation time. Direct visits, refresh and explicit save/load remain paused. Campaign rules, balance, canonical save schema and production feedback are unchanged.

## Evidence

| Check | Observed result |
| --- | --- |
| TypeScript and production build | Passed; existing Vite chunk-size warning remains |
| Full local test suite | 502 tests: 501 passed, 1 existing conditional asset skip, 0 failures |
| Character validation with explicit Lab previews | Passed: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules; Idle, Walk, Run and World contracts |
| Public shared-session seam | Six tests: handoff/pacing, authoritative command availability, deterministic replay, atomic import/save/load, stale selection and canonical family projection |
| Full browser integration run | Nine checks passed; no browser errors. See [browser.json](browser.json) |
| Family-label follow-up | Actual label rectangles do not overlap. See [family-labels.json](family-labels.json) |
| Loading follow-up | 29 real GLB requests delayed, zero ticks during loading, rendered seed 17. See [loading.json](loading.json) |
| Running-control follow-up | Resident changes reset occupation controls in both views; a focused 2D management button survives clock ticks. See [running-selection.json](running-selection.json) |

The full browser run verifies real model picking, household construction, Farmyard activation/specialization/upgrades, canonical disabled reasons, cattle assignment, exact exported Core state, 2D/3D transfers, local save/load, salvage, new/restarted campaigns, family markers and tablet gestures. The label, loading and keyboard-focus fixes were checked separately afterward through focused browser runs.

### TDD observations

Tests failed before each relevant implementation: missing shared-session capabilities, a retained stale calf selection, missing canonical family projection, overlapping family labels, simulation ticks during delayed asset loading, stale occupation choices on resident changes, and keyboard focus lost during ticking. Each corresponding public or browser check passed after its correction. Browser loading checks delay original responses rather than substituting models; picks use actual rendered model bounds and camera coordinates.

### Visual review

[Open the screenshot review](review.html).

- [Selected Farmyard livestock and shared panel](interactive-farmyard.png)
- [Selected resident, partner, child and home](family-selection.png)
- [1024 × 768 tablet touch panel](tablet-touch-panel.png)

## Limits

Physical iPad Safari/WebGL has not been tested; tablet evidence uses Chromium touch emulation, including orbit and pinch. Existing higher-level building placeholders remain. Expeditions remain in the 2D view. Per-person `+1 Food` / `+1 Materials` production notifications are not part of this change.

The local conditional skip is `actual r3 neutral/female/Giant/compound/child frozen GLBs are portable`: those optional frozen files are absent. CI may have additional existing asset-presence skips; required workflow steps must still pass for the PR's current head. No checks or validation rules were weakened.

## Reproduce

Run from the repository with Node 24 and project dependencies installed:

```sh
node --test --test-concurrency=1 tests/*.test.mjs
node scripts/validate-characters.mjs --lab-previews
npm run build
```

Start Vite on port 5180, then run the browser scripts. They use the bundled Playwright runtime on this Windows QA host; `QA_ORIGIN` and `QA_OUTPUT` override the origin and evidence directory.

```sh
node scripts/qa/check-interactive-fjord.mjs
node scripts/qa/check-fjord-family.mjs
node scripts/qa/check-fjord-loading.mjs
node scripts/qa/check-fjord-selection.mjs
```

Source formatting follows the existing TypeScript style. No repository formatter is configured; formatting was inspected manually and `git diff --check` passed.
