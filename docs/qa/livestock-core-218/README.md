# Livestock v0.1A review — #218

This is the Core/identity slice of #217. New campaigns still start with two cows and one bull. The mixed-species browser fixture uses deliberately synthetic goat rules; it is not an economic recommendation or new founding option. Additional assets belong to #220.

## Reproduce

- `node --test tests/livestock-species.test.mjs tests/livestock-legacy.test.mjs tests/cattle-lifecycle.test.mjs tests/chronicle.test.mjs tests/clan-book.test.mjs tests/narrative-continuity.test.mjs tests/fjord-bridge.test.mjs tests/work-plan.test.mjs`
- `node scripts/qa/check-livestock-core.mjs` against the current worktree on `QA_ORIGIN` (default `http://127.0.0.1:5192`). Uses `PLAYWRIGHT_MODULE` or the existing workstation Playwright installation and Edge. Fixtures stay in memory; screenshots/report go to ignored `artifacts/livestock-core-218/`.
- `node scripts/validate-public-assets.mjs --tracked`
- `node scripts/validate-characters.mjs --lab-previews`
- `pnpm run build`

GitHub's required Character contracts job additionally runs the complete test suite at the PR head. The PR stays draft until that revision has passed all required checks.

## Contract evidence

The public Core tests exercise all six species, actual sex terms, same-species breeding and lineage, maturity/cooldowns, weighted soft shelter capacity, whole Food/Materials production, feeding, mortality and slaughter. They compare split/batched/restored time, exact ledger receipts, immutable event-time identities, source removal and local title reservation across actual existing transfers. The shared session/book test preserves canonical state and published passages across view handoff.

`tests/fixtures/livestock-legacy-218.json` contains real pre-expansion saves and expected canonical SHA-256 checkpoints captured independently from clean commit `034e91fa9475d5fc8b94edefd5b79041838f4f52`. Its simulation sources match this slice's main base. Cases cover exposed and managed cattle, Landing v2 migration, saved CPU clans and an observed physical-rival campaign through the bound shared session. `scripts/qa/capture-livestock-legacy.mjs` refuses capture from another or dirty simulation checkout. Never regenerate the expected hashes with the modified Core.

## Browser evidence

The production `/fjord-play` flow is exercised at desktop 1440×1000, tablet 1180×820 with touch and phone 390×844 with touch. Checks cover the canonical HUD total even when a species has no native mesh, directory selection, species/sex/stage and stable titles, mixed Farmyard headcount versus occupied space, roster navigation, cancellation/confirmation of slaughter and unchanged surviving titles. Touch emulation is not a physical-device measurement.

The native renderer remains cattle-only. A managed goat can be selected from the directory/roster, but is not depicted as a cow. These checks add no source-model dependency, no production species selector and no capture/transport rules.

See [the visual review](review.html). Current balance and compatibility details are in [Livestock v0.1A](../../gameplay/LIVESTOCK-V01A.md).
## Recorded results (19 October 2026)

- 77 related Core, legacy-save, cattle lifecycle, Chronicle, Clan Book, narrative and Fjord bridge regressions passed.
- After the final UI corrections, 46 focused tests passed, including all 16 new livestock contracts and existing work-plan coverage.
- The independent legacy oracle matched every recorded canonical checkpoint.
- Desktop, tablet-touch and phone-touch browser flows passed with no page errors. Screenshots were inspected; there was no horizontal page overflow.
- TypeScript, production build, all 478 tracked public files/47 decoded Terrain models, and explicit character Lab previews passed (20 assets, 36 GLBs, 12 Golden Characters, 19 equipped modules). The existing large-chunk build warning remains.
- Final archive-key validation: 17 Core/compatibility tests passed after rejecting aliased registrations; all legacy canonical checkpoints remained identical.
- The existing population-study observer was updated to the shared lifecycle branches and now reads mortality coefficients from the saved species profile. All 14 population/diagnostic tests passed, including exact equality with uninstrumented Core, RNG, save/load and paired study output. Historical measurement reports were preserved.
