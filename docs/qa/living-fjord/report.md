# Living Fjord v0.6A — QA

Issue #94 adds presentation-only movement and restores canonical residents' original Fjordside DNA bodies and heritage cards. These runs use seed 17, the real Simulation Core, existing source assets and Low rendering quality. Weather is disabled to isolate movement. Test-only ample reserves and fixed fertility/mortality choices make the fixtures reproducible; production defaults remain unchanged except the approved two-Winter childcare duration.

## Automatic startup follow-up

The default seed-32 campaign now starts running after `/fjord-play` finishes loading. The browser run [auto-start.json](auto-start.json) observes displacement over 0.5m without pressing Start, verifies that Pause freezes movement, and checks that refreshing starts active time again. It uses normal campaign defaults, with no fixture reserves or disabled weather. It does not measure GPU performance. The original visual evidence below remains the seed-17 fixture run.

Reproduce: `node scripts/qa/check-fjord-auto-start.mjs`. Explicit load/import stays paused; 2D/3D handoff retains the chosen clock state.

## Compact resident popup follow-up

The rerun of `check-living-fjord.mjs` verifies the new compact default: only the stored name and ▲ are visible, with a popup height at most 60 CSS pixels. ▲ opens the details, ▼ hides them, and a different resident selection starts compact again. Expanded heritage, moving anchors, touch selection, exact replay, sourced Farmyard and grown-population checks all passed with no page errors. Expanded details have an independently scrolling, limited-height body.

- [Compact name popup](resident-name-popup.png)
- [Expanded profile](resident-profile.png)

## Evidence

- [Resident heritage card](resident-profile.png): stored name, current age, traits and three primary ancestries with expandable minor ancestries. The card follows the moving resident, remains inside the canvas/viewport and meets the script's 4.5:1 text-contrast assertion.
- [Capacity plus one](herd-capacity-plus-one.png): `cattle-1`, `cattle-2`, `cattle-3` and `cattle-4` inside the actual source Farmyard; `cattle-5` in the bounded overflow zone. All five remain canonically assigned and sheltered. The run verifies safe source placement and observes movement within the yard before capture.
- [At capacity](herd-at-capacity.png): the real Slaughter action removes `cattle-5`; the remaining four stay inside. This screenshot follows that action rather than an edited visual fixture.
- [Grown settlement](grown-settlement.png): fifteen canonical residents, thirteen outdoors. Ages below five and actual caregivers remain in the household/management population. The five-year-old selected child has the correct stored name and child-shaped DNA body.
- Raw observations: [browser.json](browser.json), [herd-capacity.json](herd-capacity.json). These record observed transforms, DNA profiles, motion, canonical identities and browser errors, not individual frame timings.

The initial ten residents have distinct build deviations. Their recorded posed body heights range approximately 1.33–1.50m, rather than a common fixed-height mesh. Heights here are rendered bounds of the Idle pose, not a demographic calibration or nominal anatomical-height measurement.

## Automated boundaries

The twelve public controller/projection tests cover two-Winter care and preserved saved five-Winter rules; ages 4→5; actual caregiver transfer; capacity N→N+1→N and deactivation; dry grounded bounded movement; deterministic presentation streams; unchanged canonical save/replay; DNA copies/current age; stable reconciliation; bounded overflow; source-floor recovery; and short steps in narrow source-yard spaces.

Browser checks cover initial 10-person/3-cattle landing, source Idle/Walk clips, visible DNA build differences, shared heritage content, moving profile anchor, close/reopen, real touch picking at a moved position, pause, exact canonical command replay, actual five-animal Farmyard, a grown population, and the real visibility handler. Visibility suspension is exercised by dispatching `visibilitychange` with a controlled `document.hidden` value; it is event-boundary coverage, not an OS background-tab benchmark.

Reproduce against a running server:

```sh
node --test tests/living-fjord.test.mjs
node scripts/qa/check-living-fjord.mjs
node scripts/qa/capture-living-herd.mjs
```

Both browser scripts accept `QA_ORIGIN`, `QA_OUTPUT` and `PLAYWRIGHT_MODULE`. Default origin is `http://127.0.0.1:5180`. The included Windows Playwright path can be overridden on another machine.

## Release validation

- Full local suite: **520 passed, 0 failures, 1 existing optional skip** (521 tests).
- Public Living World seams: **12 passed**.
- TypeScript and Vite production build: **passed**.
- Character asset/runtime validation with `--lab-previews`: **passed**, 20 assets / 36 GLBs, 12 Golden Characters and 19 equipped module audits.
- Initial/grown browser run and capacity close-view run: zero page errors on completed runs.
- No formatter is configured; changed source was reviewed manually and `git diff --check` is required before publishing.

The existing optional frozen-r3 portability test is opt-in through `RUN_R3_EVIDENCE=1` and is skipped by the default suite. This is independent of earlier checks and no validation rule has been weakened. The existing Three.js bundle-size warning remains nonblocking.

The full suite's old five-Winter care scenarios explicitly retain five in their saved configuration. Current default assertions use two. The Food-resilience reporting test uses seed 2 to obtain an actual shortage under the new care default, retaining all accounting assertions. Historical measurement reports were not rewritten.

## Practical limits

Headless Chromium uses SwiftShader on this older development laptop. These runs validate behavior and screenshots, not native GPU performance or precise frame-by-frame gait quality. Functional waits allow slow rendered frames; no few-millisecond performance gate is introduced. Selection/cattle collision circles are presentation proxies. Higher-level Farmyards retain the pre-existing explicit yard-marker fallback where no verified source yard exists. Missing assets or compatible clips retain an explicit static fallback; no new clothing, hair or animations are generated.
