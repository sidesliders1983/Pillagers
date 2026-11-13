# Personal armor QA - #333

This follow-up is stacked on iron equipment #224 (draft PR #334), itself stacked
on the native combat-presentation baseline #310 (draft PR #332). It does not
merge those drafts or publish to Sites. Owner-approved trial rules are in
[Personal armor v0.1](../../gameplay/PERSONAL-ARMOR-V01.md).

## Reproducible evidence

- [Matched cohort](balance.md) and [raw results](balance.json): 33 loadouts,
  128 recorded uint32 seeds each, 4,224 actual public Core dispatch/return trials.
  Only the named wearer's gear changes; the unchanged ally's exact casualty seed
  set remains equal across every loadout. On-site analytical columns are labelled
  separately from actual reached encounter tests.
- [Production receipts](production-provenance.json): real finite Ore extraction,
  eligible livestock slaughter and ordinary Smith/Leatherworker work produce
  all seven items. No preview grants stock.
- [Native source and fitting](../../assets/NATIVE-PERSONAL-ARMOR-333.md): exact
  owner-supplied models, redistribution provenance, derived geometry, native
  bindings, qualification samples and measured limits. Geometry qualification
  and physical-device acceptance are distinct.

## Local review campaign

Run from this worktree:

    node scripts/qa/prepare-personal-armor-review.mjs
    pnpm run build
    node scripts/qa/serve-personal-armor-review.mjs 5204

Open /qa/review.html on that server. It offers downloads; it never replaces a
browser campaign automatically. Import through Load game and choose Continue
campaign. Seed 25 selects the actual shipping island 7. Fionnín has the four
personal items in Group 2 (Armor QA). The ally owns the Wooden Shield; the
Leather-reinforced Shield is stored. The accelerated saved labour threshold and
ample starting supplies are explicit QA settings. Ore, Hides, finished equipment
and Recon knowledge still come from public commands and genuine outcomes.

Use the home file for reassignment and the mine-bound expedition file for away
visibility and reassignment restrictions. The latter is not an active battle.
The public territorial-awareness adoption happens after returned Recon without
advancing time, consuming RNG or rewriting earlier receipts. Group 2 has a real
on-site Pillage offer. Open Expeditions, select Armor QA, then Known places and
the identified settlement. Review Pillage, confirm Start mission, then Play.
Actual defenders and outcomes remain canonical; no victory is injected.
Character Lab pose selections provide repeatable idle/walk/run and combat motion
views without creating campaign equipment. The review page shows the exact
served build revision, including whether source changes remain uncommitted.

## Acceptance boundaries

Public Core tests cover stock conservation, exact recipes, four independent
slots, absent/unavailable workers, away restrictions, capture/transfer, home and
on-site death, survivor return, interrupted save/replay, old mission snapshots
and zero-new-armor RNG parity. DOM/Lab tests cover selectors, unavailable stock,
factual own-person equipment, explicit preview assets and identity preservation.

Final acceptance also needs the current built UI in a browser: normal file
import, preparation, field person and Character Card, export/reload, responsive
landscape controls, native pose snapshots and retained rendering-resource deltas.
An emulated viewport is not a physical iPhone. Phone frame pacing, heat and touch
acceptance must be reported separately as tested or not tested; software-rendered
headless timings cannot certify phone performance.

For an automated repeat of the public browser journeys, install Playwright in
your test host or point PILLAGERS_PLAYWRIGHT_MODULE at its module directory. Run:

    node scripts/qa/check-personal-armor-ui.mjs --origin http://127.0.0.1:5204 --expect-commit <full-commit-sha>

Use --chrome with an explicit executable when the test host has no bundled
Playwright browser. --expect-commit requires the exact revision and a clean
served source build. --output selects the local evidence directory. The runner
uses isolated desktop and coarse-pointer touch contexts, ordinary player files
and public controls; it never injects browser storage or calls private game
commands. It saves screenshots, fixture/runner hashes, build identity and errors,
and closes its own browser. See --help for the complete invocation.

Repeat the bounded native rendering comparison with the same Playwright setup:

    node scripts/qa/measure-personal-armor-rendering.mjs --origin http://127.0.0.1:5204 --expect-commit <full-commit-sha> --native-counts

It retains actual drawing callbacks and submitted triangles, native material and
texture counts, repeated off/on resource plateaus, callback wall time, and
separate supported CDP thread-CPU / asynchronous GPU query durations. Unsupported
CPU or GPU counters remain explicitly unmeasured. Thirty frames per profile are
a bounded observation; they do not establish phone heat or frame pacing.

Retain actual native Lab stills, exact replayable snapshots and a continuous video
with the same public controls:

    node scripts/qa/capture-personal-armor-native.mjs --origin http://127.0.0.1:5204 --expect-commit <full-commit-sha>

The capture runner includes LOD2 front/side/rear views, targeted LOD0 Death phases
0.75 and 1 with both actual spear models, and live idle/walk/run/spear/shield/Death
segments. Capture completion is not a geometry or owner-acceptance verdict.
The retained browser bundle and rendering report identify the tested clean build;
evidence-only commits must leave its production source and public assets equal.
Earlier failed revisions and inherited skips are retained in
[the regression history](regression-history.md).

The current source/fit documents and final pinned build evidence determine
pass/fail/not-tested status. This page does not itself assert that unfinished
geometry fitting or physical acceptance has passed.
