# Clan Chronicle v0.1 QA report

Executed 2026-10-07 for #37, based on merged #36.

- Regression suite: 76 tests pass, zero failures/skips.
- TypeScript and production build pass. The existing Fjordside chunk-size warning remains.
- Browser proof: 14 checks pass, including the collapsible Chronicle timeline, Raw Events toggle, source disclosure, immediate salvage text and exact Chronicle identity after local save/load.
- Desktop and 390px screenshots reviewed. Desktop places the sticky timeline left of gameplay; narrow layout stacks it above gameplay and supports collapse/expand without horizontal overflow.
- No browser runtime errors or Three.js/GLB requests in the Lab flow.

## Projection evidence

Golden cases verify canonical Winter grouping, newest-first groups and ledger-order entries. Production sums retain exact contributing event IDs, appear at the first source occurrence, and remain visually secondary. Quiet/future unsupported events do not invent descriptions. Unknown/malformed templates stay raw-only.

Core-generated founding relationships and births retain event-time people snapshots. A realistic command sequence exercises housing, occupation, ship salvage, cattle assignment/slaughter, specialization and upgrades. Changing current names/birth Winters cannot alter the projected history. Save/reconstruction yields exactly the same text, IDs and template metadata, with no duplicated source events.

Explicit template cases cover maintenance debt, collapse and caregiver assignment. Tests establish the neutral fact-only wording and missing-field behavior. No model runtime, external narration or network inference is used.

## Long-run regression

The existing ten-founder, 50-Winter run still ends at Winter 850 tick 321 with 26 personas, 193 Food, 367 Materials, six surviving homes and two living cattle. Repeat, split ticks, midpoint save/resume and nonnegative integer-stock checks pass. The SHA-256 is now 1f611e859886ee099e2fae896180b9223ddd823b4132f00ce23a8430f7220cbe because new ledger records include historical identity snapshots; economic outcomes and event counts remain unchanged.

## Reproduction and limits

Use node --test tests/*.test.mjs, TypeScript checking and Vite build. Start Vite on port 5180 and run scripts/qa/check-gameplay-lab.mjs with the bundled Playwright directory. Browser evidence/screenshots are generated under artifacts/qa/gameplay-lab/; the long-run script writes artifacts/qa/the-landing/.

Older events are never backfilled from current mutable names: missing historical names are represented by recorded resident IDs. Unsupported events remain available through Raw Events, whose UI shows the latest 100 while exports preserve the complete ledger. This is a deterministic Chronicle slice and leaves #14 open.
## Integration check after weather and cattle lifecycle

The original Chronicle PR #38 remained open, so newer main-based Gameplay Lab builds did not contain the sidebar. Reapply the Chronicle on main after merged #45/#46, resolving the layout around the existing weather controls and livestock lifecycle. The browser test first failed on the missing Clan Chronicle heading, then passed with the collapsible left timeline, Raw Events toggle, source provenance, live controls, save/load and narrow layout restored. The weather browser check also passes. All 113 automated tests, TypeScript checking and production build pass; the existing Three.js chunk-size warning remains.

The earlier long-run figures above describe the original pre-mortality/pre-weather Chronicle branch. They are historical evidence, not outcomes for the current combined ruleset. Restored historical identity facts add event metadata; archived calibration state hashes remain tied to their recorded source commits.
