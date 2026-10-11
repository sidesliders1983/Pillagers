# QA — canonical Fjord seasons and compact HUD (#109)

Date: 11 October 2026. Branch: codex/fjord-seasons-hud, based on PR #107 / 53aff06975a60ed18e264194367d86196927dc41.
Result: **PASS** for the executed contracts, browser scenarios and local validation below.

## Evidence

- [Four-season visual comparison and five viewport captures](review.html).
- [Weather/season observations, layout rectangles and resource counts](observations.json).
- [Delayed loading/pause/handoff scenarios](regressions/startup/startup-races.json).
- [Real touch selection, moving actors, rotate/spread and Core replay](regressions/touch/result.json).
- [Resident/cow production feedback and no history replay](regressions/production/browser.json).
- [Screen-awake behavior in the new menu and existing routes](regressions/awake/result.json).
- Local build, full test and character validation logs are included in this directory.

## Calendar, time ownership and gameplay

Public projection tests cover all nine required boundaries: ticks 0, 249, 250, 499, 500,
749, 750, 999 and 1000; the last rolls Autumn 800 into Winter 801. Projection leaves the
serialized Core untouched. Import, local save/load and both view handoffs restore Spring
800 at tick 430. +1 Year submits AdvanceWinter and returns Spring 801 at tick 430.

The session test exercises all four quarters at 1/3/5 minutes per year; three minutes
therefore gives 45 seconds per quarter. Pausing contributes no ticks. Browser tests cross
250 and 1000 with the real running clock, confirm continued running, retained menu edits,
and no material/agent replacement. Hidden-tab verification uses a controlled document.hidden
fixture with the real visibility handler, rather than claiming physical background-tab timing.
All saved states/commands are compared exactly against the real Core, including RNG,
annual weather, events, stocks, mortality and cattle lifecycle. Six years of quarter
projections and save/load also match a single 6,000-tick run.

## Rendering and weather

The browser runs all **20 combinations** of Weather Off/Mild/Normal/Harsh/Severe and
Winter/Spring/Summer/Autumn. It checks actual lighting, all generated ground layers,
foliage tint, existing snow uniforms, seasonal labels and exact exported Core state.
Weather does not reroll at quarters. Spring and Summer retain their existing season
baseline even during an annual Harsh/Severe forecast. Annual gameplay modifiers still
apply across the full canonical year.

Winter at tick 0 uses the existing 0.65 snow treatment; quarter starts Spring/Summer/
Autumn have no snow. The existing Autumn blend approaches winter snow before rollover.
The captures visibly show white winter terrain/foliage, spring green, warmer summer ground
and autumn browner foliage. They use the same seed 17, camera, 1280×800 viewport and Low
quality; source water animation phases differ between captures. Existing camera/fog/composition
limitations remain, and are not silently replaced by new assets or scenery in this slice.

Three repeated same-world imports each retain **22 geometries / 43 textures** after
rendering. Quality round trips preserve seasonal material IDs and snow amounts. Rebuilding
restores original seasonal colours without accumulated tint. This is bounded renderer
resource evidence, not a GPU-memory or physical-device performance benchmark. There is
no new frame-time approval threshold on the development laptop.

## Layout and controls

Measured viewports: **320×740, 390×844, 768×1024, 1024×768 and 1600×900**. Controlled large
counter fixtures use 25 residents, 12 cattle and nine-digit stocks; these are not natural
growth/balance results. Date/year, KPI and timing-region rectangles are exactly unchanged
across all four seasons at each viewport. No horizontal page overflow or overlapping date/
controls occurs. Desktop KPIs occupy fixed centred columns; tablets/phones use a deliberate
second row. Phone Year length moves into Menu. Menu fits and scrolls within each viewport.
Buttons and the menu summary have at least 44px touch targets; the header omits raw ticks.
Exact time remains in Developer diagnostics and the public canvas time description.

Arrow input in the header does not navigate the world; Escape closes Menu and returns
focus. Camera matrix comparisons allow only 1e-10 roundoff, observed at approximately
1e-14 during normal controller updates. Core comparisons remain exact.
Existing near-finger taps, held touch with drift, moving selection, rotate and spread all
pass. Resident/cow +1 output retains exact producer attribution, drift/fade, paused fading,
full-year batches and no replay after partial save/load or view handoff. The opt-in screen-awake
button works inside Menu, including real HTTP LAN compatibility media and controlled native
API lifecycle. Physical iPad/Safari behavior is not newly claimed by these Edge touch tests.

## Validation and test corrections

- Build/typecheck: PASS; existing large-bundle warning retained.
- Full repository suite: **558 tests, 557 pass, zero failures, one existing explicit opt-in
  RUN_R3_EVIDENCE frozen-character export test skipped**. Its guard is unchanged; no check
  was skipped because another failed.
- Character validation with Lab previews: PASS; 20 assets / 36 GLBs, 12 Golden Characters.
- New public seasonal/session contract cases: five PASS.
- All executed browser runners: zero unhandled page errors.

Test-first failures recorded missing calendar projection, missing header date slots,
unchanged summer lighting, clamped darker-weather colour deltas and count-dependent KPI
widths. The implementation fixes those observations. An inherited product-feedback runner
also assumed direct visits were paused; it now supplies an explicit paused shared save to
isolate its existing no-history-replay assertion, matching the established autostart contract.
No production, eligibility or validation assertions were disabled. Current Fjord QA adapters
use Menu/+1 Year and the canonical time seam; historical reports remain unchanged. Older
manual runners are not all rerun or presented as validated by this report.

Required GitHub checks must pass on the PR head before it leaves draft. PR #107 remains
an unmerged dependency; this change does not authorize merging it.

## Reproduction

With the LAN development server on port 5180:

```powershell
pnpm run build
pnpm test
pnpm run validate:characters --lab-previews
node scripts/qa/check-fjord-seasons.mjs
$env:QA_NATIVE='1'
$env:QA_OUTPUT='docs/qa/fjord-seasons-hud/regressions/startup'
node scripts/qa/check-fjord-startup-races.mjs
$env:QA_OUTPUT='docs/qa/fjord-seasons-hud/regressions/touch'
node scripts/qa/check-fjord-touch-selection.mjs
$env:QA_OUTPUT='docs/qa/fjord-seasons-hud/regressions/production'
node scripts/qa/check-fjord-lifecycle.mjs
$env:QA_OUTPUT='docs/qa/fjord-seasons-hud/regressions/awake'
node scripts/qa/check-screen-awake.mjs
```

QA_ORIGIN / QA_LAN_ORIGIN and PLAYWRIGHT_MODULE can point to other local servers/runtime
installations. Physical iPad follow-up: verify the compact date/KPI rows, open/scroll Menu,
change Year length, collapse/reopen management, and confirm touch selection/rotate/pinch
still feel usable. For seasons, use an existing partial-year save or let the running year
cross quarters; no QA-only gameplay controls were added.
