# Living Fjord v0.6A — QA

Issue #94 adds safe presentation movement and restores canonical residents' original Fjordside DNA bodies and shared heritage cards. This evidence was regenerated after the PR #101 owner correction: new campaigns use **five Winters of care** and **two complete Winters of birth cooldown**. Explicit saved rules/endpoints, including two-Winter care playtest saves, retain their behavior on load and saved-rule restarts. Existing FamilyMechanics handles care, transfer and subsequent births; no new care system or economy tuning is introduced.

The seed-17 visual fixtures use the real Simulation Core, existing source assets and Low rendering quality. Weather is disabled, ample reserves and fixed fertility/mortality settings isolate the behavior being checked. These are test fixtures, not starting balance changes.

## Superseded evidence

The two-Winter-care description and browser observations at [6c02845](https://github.com/sidesliders1983/Pillagers/blob/6c02845bc1419a403a9f93c6c77f7bb15e7c439e/docs/qa/living-fjord/report.md) describe the earlier, superseded instruction. The images and JSON in this directory now come from the corrected five-Winter runs. The grown settlement is **15 canonical residents, 11 outdoors**, replacing the earlier 15/13 observation. Historical #83/#84 measurement records are unchanged.

## Startup, pause and ownership

[Startup regressions](startup-races.json) record eight actual-browser cases: hidden before initial readiness; import, load and manual pause before readiness; New/Restart completed after suspension; New completed after manual pause; and paused 2D→3D handoff. Initial house-manifest or later ground-texture HTTP requests are held and released to exercise the real asynchronous loading paths. Each case compares the full canonical export before/after, with matching SHA-256 hashes: time, stocks, RNG and events remain unchanged. Return to the visible tab neither resumes nor catches up. Import/load and saved-rule restart also retain explicit two-Winter care settings.

Visibility is controlled through document.hidden and the real visibilitychange handler. This is event-boundary coverage, not an OS background-tab benchmark or physical Safari validation.

[Automatic startup](auto-start.json) independently checks a normal seed-32 campaign: after loading it advances and moves residents/cattle without pressing Start, Pause freezes movement, and refreshing starts again. No ample-reserve or disabled-weather fixture is used in that run. Pending automatic starts are canceled by newer pause/load/import/suspension intent. Actual timer execution rechecks intent, visibility and route ownership; scene loading contributes no active time.

## Visual evidence

- [Compact name popup](resident-name-popup.png): stored name and expand arrow, at most 60 CSS pixels high. Expand opens details; collapse restores the compact popup. A different resident selection starts compact again.
- [Expanded shared profile](resident-profile.png): stored cultural name, age in Winter/Winters, traits, three primary ancestries and expandable minor ancestries. It follows the moving resident, stays within the viewport and passes the 4.5:1 text-contrast assertion. Details have an independently scrolling, limited-height body.
- [Capacity plus one](herd-capacity-plus-one.png): four animals inside the actual sourced Farmyard and one in its bounded overflow zone. All five remain canonically assigned and sheltered. Safe source placement and movement inside the yard are checked before capture.
- [At capacity](herd-at-capacity.png): the real Slaughter action removes the overflow animal; all four remaining animals stay inside.
- [Grown settlement](grown-settlement.png): 15 residents, 11 outdoors. Children aged 0–4 and actual caregivers retain canonical management/population identities indoors. The selected five-Winter-old child uses its stored name and child-shaped DNA body.
- Raw observations: [browser.json](browser.json), [herd-capacity.json](herd-capacity.json). They contain transforms, DNA profiles, motion, canonical identities and errors, not individual frame timings.

The initial residents' posed body heights range approximately 1.33–1.50m, demonstrating distinct DNA build/height shaping. These are rendered Idle bounds, not demographic or anatomical-height calibration.

## Public tests and reproduction

The twelve Living World controller/projection tests cover care beyond Winter two and release after five; exact two-complete-Winter birth cooldown through care transfer; preserved endpoints and saved two-Winter continuation/restart; younger siblings extending care; donor fertility restrictions; ages 4→5; safe deterministic movement and stable reconciliation; yard capacity/overflow; DNA/current age; and unchanged canonical replay. Existing mortality/economy fixtures altered only for the mistaken care default were restored to the main baseline without weakening accounting assertions. The shared-session family marker fixture disables additional births after its first birth to isolate that child's five-Winter visibility boundary.

Browser coverage includes source Idle/Walk clips, DNA variation, moving profile/selection, touch picking at moved positions, pause, exact replay, the actual five-animal Farmyard, a grown population, and hidden-tab suspension.

Run against the dev server:

```sh
node --test tests/living-fjord.test.mjs
node scripts/qa/check-living-fjord.mjs
node scripts/qa/capture-living-herd.mjs
node scripts/qa/check-fjord-auto-start.mjs
node scripts/qa/check-fjord-startup-races.mjs
```

Default origin is http://127.0.0.1:5180. Browser scripts support QA_ORIGIN and PLAYWRIGHT_MODULE; visual scripts also support QA_OUTPUT. The included Windows Playwright module path can be overridden.

## Release validation

- Full local suite rerun after the correction: **520 passed, 0 failures, 1 existing optional skip** (521 tests).
- Public Living World seams: **12 passed**; the focused Living World/shared-session run also passed all 18 tests.
- TypeScript and Vite production build: **passed**.
- Character validation with --lab-previews: **passed**, 20 assets / 36 GLBs, 12 Golden Characters and 19 equipped module audits.
- All four browser scripts: **passed**, zero page errors, including all eight delayed-loading cases.
- Changed source reviewed manually; git diff --check passed. No formatter is configured.

The existing frozen-r3 portability test remains opt-in through RUN_R3_EVIDENCE=1; its default skip is independent of earlier failures. No validation rule is bypassed or weakened. The existing Three.js bundle-size warning remains nonblocking. Current-head GitHub checks must also pass before the PR is marked ready.

## Practical limits

Headless Chromium uses SwiftShader on the older development laptop. These runs validate behavior and screenshots, not native GPU performance or precise gait quality; no few-millisecond gate is introduced. Cached selection bounds follow translation but exact heading/pose framing remains approximate. Turning cattle and extreme DNA builds remain later polish checks. Higher-level Farmyards retain the existing explicit yard-marker fallback where no verified source yard exists. Missing assets/clips retain stable static fallbacks; no new clothing, hair or animations are generated.

Existing Fjordside Talk/Listen and cattle Graze/HumanInteraction integration remains #95. It must reuse the existing coordination/clips with one transform/animation owner per actor; PR #101 does not add a second interaction system.
