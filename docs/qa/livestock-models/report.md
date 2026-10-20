# Livestock model and animation integration

Local review: `/docs/qa/livestock-models/review.html` on preview port **5194**.
Branch: `codex/livestock-models-220`, based on the existing livestock work at
`37e8ba72e2b0127806097a886966758df1991998`. No shipping species/balance default
or historical study output is changed. #212 is the merged scene lifecycle PR;
this is the supplied-model presentation slice of #220.

## Delivered scope

Eight supplied models: kid/doe/buck, lamb/ewe/ram and sow/boar. The owner
explicitly deferred the incorrect 200,958-triangle piglet source. Its generated
runtime files were removed. It is not replaced by a scaled adult. Chicken and
Goose remain deferred. The eight new meshes retain 2,830–3,062 triangles and
their 27-joint skins; combined runtime GLBs are 3,111,092 bytes. Provisional
metre scaling uses a torso-height reference, not a biological size rule.

All eight have baked Idle, Walk, Graze, Rest, HumanInteraction and Death.
The existing four cattle models gain Death. All **16 existing cattle activity
clips** retain exactly the same channel identities, sample counts, times and
values as their frozen published inputs: maximum difference **0**.
[Actual source hashes, rig measurements, publications and preservation results](source-audit.json).

The supplied limb cycle is used to measure foot-lift ordering and period. The
new Walk bake restores the upright trunk and uses offline planted-hoof IK;
source rest meshes, UVs and weights remain intact. Runtime has no per-frame IK.
The new grazing and settled resting poses were refined after browser inspection
of the initial head-only feeding and crouched rest. Cattle's original grazing,
walk, quiet standing and human encounter remain their approved source clips.

Death is a one-shot 2.4-second fall, a 2-second held pose and a 5-second fade.
An actor must have existed and have actual Core death evidence; disappearance
through transfer/fog is insufficient. Dead animals leave selection, roaming
and producer anchors immediately. The retained body stays at its current
position, owns temporary material clones, freezes during pause, and is released
after fading or scene disposal. Rollback cancels it. History loaded into a new
scene never respawns old corpses. Rival deaths are filtered by current observation.

## Executed checks

The public projection tests use actual deterministic founding, actual births,
slaughter commands, canonical serialization and save/load. They cover species,
sex and stage selection, omitted piglets, preserved identity/history, ephemeral
death evidence, no changes to Core, alternating activity clips, pause and rollback.
The scene/fade tests cover one-shot end-pose retention, half-opacity, independent
materials, visibility loss and disposal. Published-asset tests decode all twelve
real GLBs, verify hashes and budgets, sample upright walks, and verify actual
sideways fallen poses and ground contact. The ram's wide horns make whole-mesh
height an unsuitable general fall oracle; the test checks its actual trunk
orientation, ground contact and held end pose instead.

The first complete run had one expected-obsolescence failure: the earlier #218
test required goats to be omitted before their assets existed. It now requires
the real goat, correct friendly name/sex term and `goat/adult-female` asset,
retaining the prohibition on depicting goats as cattle. Its focused rerun
passed all 22 tests. No validation was disabled or skipped to fix it.
The final complete run passed **1,044 tests**, with **0 failures** and **10 existing skips** out of 1,054 tests. [Raw output](tests-final.txt) and exact totals are recorded in [validation](validation.json).
The existing ten skips are historical suite skips, not new exemptions.

TypeScript, the production build and all 494 public asset publications were
checked. The public-asset validator now includes all eight new manifest/GLB
pairs. Original source models remain outside `public/` and Git. No automatic
formatter is configured; changed code was checked manually, with Node syntax
checks and `git diff --check`.

## Browser observations

The local in-app Chromium browser loaded all twelve gallery models and their
clips. Using the real shared LivestockDeath implementation, a fixed 6.9-second
Death sample held the last source frame at 2.400000095 seconds and opacity
0.500000019 on every variant. Animation controls, fixed-time sampling and the
per-model camera were exercised.

Three actual physical-island Fjord fixtures were opened through the review's
buttons. These are real saved campaigns, with the existing explicit trial
species profiles and 50 starting Materials to build a Farmyard through actual
commands. They are labelled QA fixtures, not measurements or defaults.

| Case | Checked outcome |
| --- | --- |
| Goat, seed 0 | Two native does and one native buck, no placeholders; live selection and correct details. Real confirmed slaughter changed Food 15→25 and herd 3→2, held its presentation while paused, then completed the fall/fade when running. Survivors continued with native Rest. |
| Pig, seed 8, 1180×820 | Two native sows and one native boar, no placeholders; Boar selection/details, 3 living animals and no horizontal overflow. |
| Sheep, seed 10, 390×844 | Two native ewes and one native ram, no placeholders; correct Ram card and usable management controls, no horizontal overflow. |

These are desktop browser viewport checks. Physical iPhone/iPad input, GPU
performance and final owner visual acceptance are not claimed. The Goat page
log included two Electron host startup errors from `node:electron`, outside
the app; no animal asset/animation error appeared. Temporary game tabs were
closed and the temporary viewport override was reset.

## Visual evidence and reproduction

[Walking comparison](images/walk-overview.jpg) ·
[Fallen comparison](images/death-overview.jpg).
Each source pose also has an individual PNG under `images/`.
[Render inputs](images/inputs.json) bind the decoded input hashes to the exact
published GLBs; [render records](images/renders.json) record frames and hashes.
These are fixed studio renders of the actual published skins, not generated
concept images. The interactive browser review also exposes feeding, rest,
interaction, fade and the actual Fjord fixtures.

```powershell
pnpm install --frozen-lockfile
node scripts/prepare-livestock.mjs C:/Users/Devoteam/iCloudDrive/Pillagers/Characters/Livestock
node scripts/qa/prepare-livestock-model-review.mjs
node scripts/qa/audit-livestock-publications.mjs
node --test tests/livestock-presentation.test.mjs tests/livestock-species.test.mjs
pnpm run build
node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5194 --strictPort
```

Run the preparation from this worktree. It reads the supplied sources and the
explicit frozen cattle publications; it never edits iCloud files. Re-running
`assets:cow` on original Blender exports also appends Death. The review source
generator and current gameplay contract are documented in
[Livestock v0.1C](../../gameplay/LIVESTOCK-V01C-PRESENTATION.md).

No GitHub push, PR, merge or public Site publication is part of this delivery.
