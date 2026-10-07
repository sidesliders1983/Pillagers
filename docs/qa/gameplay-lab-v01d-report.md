# Gameplay Lab v0.1D QA report

Executed 2026-10-07 for issue #29, based on merged PR #35.

- Full regression suite: 72 passed, zero failures or skips.
- TypeScript check and production build pass. The existing Fjordside Three.js chunk-size warning remains.
- Browser proof: 13 checks pass, covering both required cadence choices and all existing household/person/livestock interactions, live controls, saves/imports, work-age gating, restart choices and narrow viewports.
- No browser runtime errors or Three.js/GLB requests in the Lab flow.

## Cadence evidence

Two public GameplaySession instances begin with seed 32. One runs 30 seconds at 1 minute/cycle; the other runs 150 seconds at 5 minutes/cycle. Both reach Winter 800 tick 500 with identical complete states. Both execute salvage ship, build house, assign farmer and assign one cow. Their cadence settings are then exchanged, without modifying the canonical state. After the second half cycle both match the expected Simulation Core state and history at Winter 801 tick 0. Save reconstruction produces the same result.

Browser QA verifies the cycle explanation and both option values, runs the 5-minute cadence and observes advancing ticks, then runs the 1-minute cadence and verifies pause. Browser waits are short; full-cycle equivalence is verified at the public session boundary rather than waiting five real minutes.

## Scope and limits

#28 already supplied the requested clickable decisions and inspection cards. #29 clarifies cadence and validates the integrated gameplay rhythm controls. No simulation rules or assets changed. Automated tests establish correctness and control availability; they do not claim the gameplay is engaging or balanced.

Reproduce using node --test tests/*.test.mjs and the existing scripts/qa/check-gameplay-lab.mjs with Vite on port 5180. Raw browser evidence is written under artifacts/qa/gameplay-lab/ (ignored by Git).
