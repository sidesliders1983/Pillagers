# Family Tree #287 · QA and recording save

## Try it

- Local feature preview: `http://192.168.68.115:5247/fjord-play`.
- Isolated reader preview: `http://192.168.68.115:5247/scripts/qa/family-tree-287.html?portraits`.
- [Download the gameplay test save](legacy-gameplay-save.json). In Fjord Play, open the menu → **Campaign → Import campaign**, then choose this JSON. The start menu's recovery/import also accepts it. It opens paused.
- Open **Clan Book → Family Tree**. MaelColuim and Inghild's descendants include Sigrik and Hallulf, then Aodhán in generation 3. Select a card to highlight real relationships and read their history.
- [4.5-second QA pan](legacy-pan.webm) is a labelled reader capture of this test scenario. There is no autoplay in normal gameplay.

The recording save has **57 actual Core-generated family records, ten founders, three generations, 53 living people and four deceased founders** in Summer 832, plus six homes. It contains no invented resident or fabricated kinship/life event. Setup accelerates fertility/partnerships, disables mortality until the large family exists, then uses a test-only elder mortality pass. Normal mechanics are restored afterwards. Homes, upgrades and work use real commands. Food 200 / Materials 60 are recording supplies. This is a test scenario, not an ordinary economy playthrough.

Both normal Fjord import and startup recovery are round-trip checked by the generator. The exported Fjord format preserves geography, layout, book and factual histories. Loading/importing pauses the game; choose the desired calendar speed before recording.

## Evidence

- Before: [desktop](before-desktop.png), [simulated phone landscape](before-phone-landscape.png).
- After: [desktop](after-desktop.png), [simulated tablet landscape](after-tablet-landscape.png), [simulated phone landscape](after-phone-landscape.png).
- Selected relationships: [desktop](selected-desktop.png), [simulated phone landscape](selected-phone-landscape.png).
- Real Fjord integration: [screenshot](fjord-play-desktop.png), [results](fjord-play.json). The actual Character Card and tree return the identical cached image, share one world WebGL context and leave the canonical export unchanged.
- [Intentional initials fallback](fallback-phone-landscape.png) when no portrait source is available.
- [Browser checks](browser.json): 57 records, three generation columns, ten true founders, four deceased people, shared production portraits, one WebGL context, relationship links, mouse/native simulated touch pan, keyboard tabs, reachable Close, viewport/selection retention and unchanged Core.
- [Layout measurements](performance.json): 57 records; first layout about 0.84 ms; median anchored update about 0.04 ms (200 samples on this workstation). This is presentation CPU work, not full-world FPS/GPU or a physical-device benchmark.
- [Save summary](testsave-summary.json) records setup and population facts. Source and generation logic remain the existing canonical projection.

The reader harness uses the actual ClanBookReader, FjordInterface cache and ResidentPortraitStudio, with one production studio and no 3D world loop. All phone/tablet captures and touch inputs are simulated in desktop Edge, **not physical iPhone/iPad acceptance**. The live game uses its already-existing world renderer. No per-card WebGL context is created.

## Reproduce

Use the repository's supported Node and pnpm 10, install the locked dependencies on D:, and start Vite on port 5247.

```sh
node scripts/qa/create-family-tree-287-save.mjs
node scripts/qa/measure-family-tree-287.mjs
node scripts/qa/check-family-tree-287.mjs
node scripts/qa/check-family-tree-287-fjord.mjs
node --test tests/family-tree*.test.mjs tests/persona-portrait-dom.test.mjs tests/character-portraits.test.mjs tests/personal-history*.test.mjs
pnpm run build
node scripts/validate-characters.mjs --lab-previews
pnpm test
```

The browser QA scripts accept QA_ORIGIN and PLAYWRIGHT_MODULE overrides. Raw recordings and logs belong in ignored scratch output.

## Validation notes

The final build and all 32 focused genealogy/history/portrait tests pass on main 36417f2c6b34915be5609a92ee88f60696f33311. The full Fjord integration was rerun on that base and again passed (57 records, one WebGL context, identical Character Card image, unchanged Core). The first full Windows run reported 1,342 passed / one failed / ten intentionally skipped: the inherited female-hair receipt check compared the committed pipeline hash to a CRLF-converted working copy of `scripts/prepare-female-hair.mjs`. Restoring that file's exact committed bytes (no repository/content change) made the failed check pass. No receipt, asset identity, test assertion or required validation was weakened. The final PR's GitHub checks apply to the exact pushed head.

Historical #119 and #198 measurement records are left unchanged. Larger-tree layout, portrait limits, rollback/cancellation and existing canonical family-significance/history tests remain separate from graphics performance claims.
