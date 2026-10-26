# Running approach and ceremony equipment

The owner accepted the garland and requested residents run to the fire and remove their
occupation tools during ceremonies. Decoration geometry is unchanged. Running uses the
existing shipped Running clip and measured native gait (about 3.3–3.9 m/s in this fixture),
with playback matched to actual physical speed. Ordinary work and the journey back retain
Walking. Existing terrain, body clearance, participant limits and route budgets remain.

The exact saved island fixture reaches gathering at 15.8 active seconds, versus historical
24.5 with Walking (35.5% sooner). Response ends at22.8 and all actors physically return by54.5.
All four Low6/Standard8 fixed/advancing-clock cases have zero overlaps and exact headless
Core parity. A retained passing bend now reaches its physical corner and validates the next
connection rather than cutting a validated terrain corner. Ordinary passing is unchanged.

Actual occupation-tool groups are hidden throughout the active presentation frame, including
paused approach and gestures, then restored when presentation ends or suspends. Visibility
reuses the same objects and geometry, performs no equip/refit, and does not hide clothes or
hats. Invisible equipment also releases its hand/arm grip. An asynchronous occupation change
retains hidden equipment and restores the current tool afterward. No Core occupation, work,
resource, attendance or cultural consequence changes.

[Qualification](qualification.json) pins current source/tests and the unchanged input.
[Final tests](test-output.txt):80 passed,0 failed/skipped, including actual model Running
playback/pose restoration, tool/grip visibility, clothing, pause/cancel, real walking return,
ordinary passing and expedition regressions. The ordinary production build/typecheck passed.
[Native preparation](native-preparation.json) records10 additional Run-preparation spans:
66.5ms total,6.65ms mean,9.74ms maximum in this headless sample. Unchanged reconciliation
adds no new preparations. These are bounded CPU observations, not device/GPU/frame claims.
The measurement runner refuses to overwrite its preserved report.

Reproduce functional checks from the project root:

    node --max-old-space-size=1024 --test --test-concurrency=2 tests/cultural-wedding-navigation.test.mjs tests/cultural-gathering-navigation.test.mjs tests/cultural-wedding-presentation.test.mjs tests/cultural-motion.test.mjs tests/occupation-tools.test.mjs tests/fjord-clothing.test.mjs tests/resident-passing.test.mjs tests/expedition-mode.test.mjs
    node docs/qa/cultural-occasions-277/invitation-delivery/verify.mjs --verify
    pnpm run build

Historical Walking and earlier failed approach results remain unchanged. Physical-device
review of running pace and tool visibility remains separate. No new source asset/provider
call, texture, actor, material, light or animation loop was added.
