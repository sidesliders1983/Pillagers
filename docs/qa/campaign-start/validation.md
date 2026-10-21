# Campaign start validation

Base: `584a5ee5510407fdb79989b55c205aa882668f6a`.

Executed locally on Node 24:

- TypeScript `--noEmit` and Vite production build: pass. The existing large-chunk advisory remains.
- `node scripts/validate-public-assets.mjs --tracked`: pass, 496 public files and 47 decoded Terrain models.
- `node scripts/validate-characters.mjs --lab-previews`: pass, 20 assets / 36 GLBs, 12 Golden Characters and 19 equipped modules.
- Startup/session/resume/founding/livestock acceptance selection: 30 tests pass.
- Final startup/DOM/four-species/physical-transfer selection: 12 tests pass.
- Existing Attention, occupation-profile archive and livestock-transfer suites: pass on recheck.

The initial broader run executed 1,093 tests: 1,076 passed, seven failed and ten were skipped.
One failure exposed an overly broad founder-fidelity restriction on legacy Lab restart fixtures;
that restriction now belongs to explicit menu eligibility/prepared replay, preserving the Lab contract.
Six failures were missing tracked historical fixtures in this sparse research checkout. The exact
committed fixtures were materialized and all affected suites passed without modifying tests or records.
The final required complete-suite result is the current-head GitHub Character contracts check.

Browser observations use the in-app browser's desktop engine. Viewport tests at 390 × 844 and
844 × 390 are emulation, not physical Safari validation. Fresh and saved menus, confirmation/Cancel,
local resume selection, explicit file import, normal reload, continued Summer 810 and a real
seed-7 sheep founding were exercised. See `observations.json` and the review images.

No gameplay study matrix was run. The small founding samples are deterministic contract fixtures,
not balance evidence or claims about player enjoyment. Historical study outputs were retained.

No project formatter is configured. Formatting was reviewed manually and `git diff --check` passed.
