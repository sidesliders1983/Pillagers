# Contextual groups and individual travel — #148 / PR #179

The initial named-group form and shared campfire departure were replaced following owner feedback. The current flow creates empty numbered groups with one button when nothing is selected. Membership is managed from each selected resident. Each group has its own expandable actions and latest journey outcome/provision record.

## Verified behavior

- Two real resident identities are added through the existing selection flow. No group name input is present.
- Dispatch snapshots each visible body's exact X/Z into its own canonical safe route. The test compares each route origin to its actual rendered body before departure; no teleport to a shared start.
- Travelling residents use the native semantic Run animation (source Running); early arrivals idle. No new animation asset or speed multiplier is introduced. The full rendered diagnostics are retained in movement.json.
- A real land target is chosen through touch raycasting. Dispatch preserves discovery exactly, later confirmed progress maps new ground, and the running party is excluded from ordinary daily movement.
- Reload preserves exact Core state and individual routes. Return Home recalls members over their own reached routes; a subsequent annual command completes return. Both 1024×768 tablet and 390×844 phone viewports are exercised.
- 37 public expedition/discovery/shared-session tests and 27 projection/Living World tests passed locally. TypeScript and production build passed. Required full build, asset validation and test suite run in CI; the PR stays draft while those final-head checks run.
- A separate real-session browser check (`node scripts/qa/check-expedition-controls.mjs`) reproduced and fixes loss of focus in the resident group picker during clock ticks. The component now retains its controls while their rendered content is unchanged. This final focused correction follows the recorded complete 3D flow; its screenshots remain representative.
- Full character validation passed: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules and Idle/Walk/Run + World.
- The project's installed TypeScript formatter was used on the two substantially changed modules; no dependency or formatter configuration was added. git diff --check is also used.

## Evidence and limits

browser.json retains source hashes, raw frame intervals, touch/identity/origin/Run assertions, exact reload and browser errors. The latest functional rerun uses 12 intervals per quality; this is a brief diagnostic sample, not a performance benchmark or physical-iPad claim. The original 60-per-quality measurement and initial screenshots remain unchanged one directory above as historical evidence.

The owner tested the initial flow on a physical device and requested this redesign. Revised physical iPad/Safari acceptance remains open. No performance requirement or required validation was weakened. Food remains one unit per member per begun 125 planned ticks, using the longest route and shared target wait; speed remains 2 m/tick and target dwell 25 ticks. Previous shared-route saves retain their existing semantics.
