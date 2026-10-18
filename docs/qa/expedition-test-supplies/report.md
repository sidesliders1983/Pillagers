# Expedition test supplies

Date: 2026-10-18. Follow-up to PR #204, using the approved Core/session/save-load and browser seams.

Group preparation now contains collapsed **Test supplies** with **Food per resident (test)**. Default: 2. Accepted whole-number range: 1–10, following the owner's maximum of ten. A custom pack is paid once from clan stocks and visibly labelled as a test override. It extends the existing 250-active-ticks-per-Food allowance without changing safe return, work exclusion or normal balance. Existing away expeditions cannot be refilled.

Validation:

- 37 related Core tests passed across Expedition Mode, spatial expeditions and island missions. The added example purchases 8 per resident for three members: 24 Food and 2,000 active ticks. It remains Exploring after 600 ticks with 1,400 ticks of carried endurance. Exact continuation after save/load matches uninterrupted execution. Invalid values, values above 10 and insufficient stocks reject atomically.
- [Four browser checks passed](browser.json), with no page errors. The production panel and real GameplaySession/Core are mounted against a flat deterministic control fixture. The default stays 2; 11 disables departure without changing Core; 8 quotes 24 Food for three residents; cancelling is free; confirmation purchases once without unpausing; the test label and extended rations survive session save/load; a real return enables the next choice; the maximum quotes 30 Food on a 390px phone layout without horizontal overflow. The input has a 44px touch target and 16px text.
- Public assets validation passed: 453 files, manifests and 47 decoded Terrain models. TypeScript and production Vite build passed, with the existing Three.js chunk-size warning. No formatter is configured; manual diff/whitespace review passed.

Commands: `node --test tests/expedition-mode.test.mjs tests/spatial-expeditions.test.mjs tests/island-missions.test.mjs`, `node scripts/qa/check-expedition-test-supplies.mjs`, `node scripts/validate-public-assets.mjs`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vite/bin/vite.js build`.

These are browser control-fixture results, not physical iPad acceptance or a new full 3D visual/performance comparison. Earlier navigation/3D evidence remains in the neighbouring exploration-navigation report. Required CI must pass on the new head before leaving draft.
