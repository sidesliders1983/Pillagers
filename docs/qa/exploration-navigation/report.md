# Exploration navigation regression pass

Date: 2026-10-18. Scope: PR #204 follow-up, reused Expedition Mode and the approved Core/session/browser seams.

## Result

- Each active expedition has a route-icon button with its group number above Expeditions. It hides/restores the group's map controls. The panel leaves space for these shortcuts; at most three shortcut rows are visible before scrolling.
- Choose/Change destination arms one ground tap. A valid tap dispatches immediately using the existing pack. Invalid destinations leave Core unchanged and keep targeting active. The paid departure confirmation remains.
- Exploration supplies exclude the existing safe-return allowance. Automatic low-supply return explicitly explains why the group is going home and shows zero remaining exploration time, including while paused. Prices, ration use, physical return and saved gameplay state are unchanged.

## Validation

- 35 related Core tests passed: Expedition Mode, spatial expeditions and island missions. The new projection example retains 480 active ticks after 20 travelling ticks, reserves 22 ticks for the reached route home and safety margin, and exposes 458 exploration ticks. Save/load preserves the same projection without saving derived fields.
- [Seven browser checks passed](browser.json), with no page errors. Real Core commands exercise direct dispatch/redirect, invalid targets, unchanged Food, independent group visibility, automatic supply return and layout changes at 390, 1024, 1180 and 1440 pixels.
- The real saved `/fjord-play` scene passed iPad touch emulation: hide/restore the controls, tap a feasible point on the rendered terrain, depart without another confirmation/charge, then reload the active exploration with the exact paused campaign and group shortcut retained.
- TypeScript and the production Vite build passed. The existing Three.js chunk-size warning remains. No formatter is configured; manual diff/whitespace checks passed.
- A separate broader island-mission browser rerun timed out waiting for canvas readiness after reload, without a page error. It is not counted as a pass. The subsequent bounded real-scene exploration/reload regression above completed successfully; the earlier run's timing is not a device-performance result.

Commands: `node --test tests/expedition-mode.test.mjs tests/spatial-expeditions.test.mjs tests/island-missions.test.mjs`, `node scripts/qa/check-exploration-navigation.mjs`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vite/bin/vite.js build`.

These are browser emulation results, not physical iPad acceptance. Exact-head required CI must pass before the PR leaves draft. A general attention/warning system is outside this pass.
