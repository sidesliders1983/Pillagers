# Longship transport #248 — validation

Base: main `5f260f1`. No source models or new asset publications are required.

## Automated coverage

- Final targeted simulation/DOM/source-deck regression suite: **65 passed, 0 failed, 0 skipped**.
- Production build and separate strict TypeScript check for the QA launcher: passed. Vite retains the existing large Three.js chunk warning.
- The broad run completed 1,141 tests: 1,130 passed, 10 pre-existing optional source-fixture skips, and one Windows-checkout provenance failure. `scripts/prepare-female-hair.mjs` had CRLF bytes while its committed receipt hashes LF. Restoring the exact committed LF bytes made that unchanged test pass; no receipt, assertion or script content was changed. The two new deck tests and later salvage case also pass in the final targeted suite. The broad suite has not been rerun after that checkout correction; exact-head GitHub CI remains the publication/merge gate.

The targeted suite covers the real Core, shared session, production island projection, actual source ship mesh and actual ExpeditionPanel DOM. It checks paid capacity without resource creation, 2× canonical sailing speed, saved routes and return trails, land/rough-water rejection, exclusive ship reservations, safe disembark/re-board, idle salvage, actual cargo transfers, original group/member identity, imported state and exact resume.

The source-deck test decodes the committed longship GLB and raycasts at all four fixed occupant anchors. Each foot position is within 5 mm of the horizontal source deck and has no seat or mast above it. The scene test verifies real root ownership, shared hull movement, idle animation and disposal in both reconciliation orders. These structural checks do not replace visual UAT of the real character models.

The production build validates 507 public files before TypeScript/Vite compilation. The standalone QA launcher also receives a separate strict TypeScript check. No repository formatter is configured; source formatting and `git diff --check` are reviewed manually.

## Manual preview

Run Vite on a separate preview origin and open `/scripts/qa/longship-transport-248.html`. A launcher button explicitly creates a paused QA campaign with five named founders and paid supplies. It can start prepared on foot or already aboard. It does not write to campaigns on other ports.

Review on desktop and a narrow touch viewport:

1. Choose the existing longship as the prepared group's destination. Resume time; all members approach shore, then three recognizable members appear aboard one hull.
2. Select the occupied ship. Load Food once at the founding coast and check the clan stock deduction. Set an open-water destination; the controls collapse and sailing is smooth.
3. Hover land and the rough outer sea. The ring is red before clicking. Clicking the latter opens **Sea too rough**; it does not move the hull there.
4. Sail near safe coast, disembark, move on land and re-board the same hull. Check that all five members return to land and that the idle ship stays at that coast.
5. Export/import while sailing and repeat after landing. Recall the group and check its land homecoming.
6. Inspect the recognizable hair, beard, clothes and feet at all four deck anchors while the ship turns.

Visual desktop/mobile UAT remains open: the current computer-use inventory reports no available browser. LAN HTTP checks cover the launcher, TypeScript module and game routes, not WebGL rendering or input quality. Do not treat this report as visual approval.

## Follow-up: owner-reported occupant pose and post-landing destination

The owner's MOV shows an occupant lying in the hull; the follow-up photo reports `Invalid spatial expedition state` after disembarking and choosing land. The latter reproduces when joining the two identical points of the valid waiting route to a longer homeward trail: the duplicate became an invalid interior edge. Route joining now removes adjacent duplicates across both input paths, while preserving the valid two-point representation of a genuinely zero-length route.

Occupants now sample a standing Idle pose once per reconciliation and have no independent animation clock. Previous blended actions are stopped. Stable hull attachments are retained; pitch/roll reset on attachment and landing; stale autonomous frames cannot move an expedition member or play a conflicting activity. The native-resident regression uses actual founder DNA/faces, the committed body and extra animation clips: Doze → standing deck pose, repeated sync and hull turns, rejected stale Run updates, disembark → ordinary Walk. The scene regression also injects an incorrectly tilted root and verifies recovery and resource ownership. These checks cover the former gap in the initial source-deck-only test; visual UAT on the owner's device remains necessary.

Follow-up validation: **67 targeted checks pass, 0 fail, 0 skip**, including a saved land journey and recall after disembarking. The production build passes, retaining the existing large-chunk warning. The separate LAN Vite process required a restart because its transformed modules still contained the earlier source after filesystem edits; verify the served `setEmbarked` method as well as disk contents when reviewing this worktree.
