# Interactive Fjord controls and house construction — follow-up QA

Follow-up to [PR #93](https://github.com/sidesliders1983/Pillagers/pull/93), based on the user's navigation feedback and clarification that **Build house (tent → house)** was the failing action.

## Corrections

- Empty-ground clicks and taps clear selection, then navigate to the terrain point. Entity picks continue to select without navigating.
- The 3D settlement and Fjord prototype use left-button drag to rotate. One-finger drag rotates, spreading two fingers zooms in and pinching zooms out. Scroll and keyboard panning remain available. Other camera consumers retain their existing default drag mode.
- The shared 2D/3D **Build house** button now sends the explicit `BuildHouse` command. The previous `HouseHousehold` command could succeed by assigning a tent when Materials were insufficient. Construction availability now disables the button and displays the authoritative Core reason. Automatic housing, building costs and simulation rules are unchanged.
- English control help and current interactive-settlement documentation were updated.

## TDD and verification

The browser checks first failed on empty-ground click navigation, left-button drag rotation and an enabled construction button with only 5 Materials. After the respective fixes, each check passed.

The final [combined browser run](all.json) passed four cases with no browser errors:

1. Single mouse click on empty ground navigates and deselects.
2. Left-button drag changes camera orientation without selecting.
3. Actual touch input: tap navigates, drag rotates, spread moves the camera inward and pinch moves it outward without selecting.
4. With 5 Materials, house construction is disabled with `Insufficient Materials`. With 100 Materials, the real command creates a visible house in 3D. Switching to 2D and building a second house also succeeds. The exported/saved canonical state exactly matches two actual Core `BuildHouse` commands, including the Materials debit.

The browser fixture initializes only an empty session; it does not overwrite the campaign during route handoff. Navigation waits for the new document rather than all assets to finish loading.

TypeScript checking and the production build passed. The existing Vite chunk-size warning remains. All 53 relevant camera/touch, shared-session, gameplay, mechanics, settlement-projection and Fjord-bridge tests passed with no skips. Source formatting was inspected manually and `git diff --check` passed; the repository has no configured formatter. Required current-head CI results are linked in the PR after completion.

Touch checks use Chromium at 1280 × 800 with touch input enabled. A physical iPad Safari run has not been performed. No frame-time or hardware performance conclusion is drawn from these functional checks.

## Reproduction

Start the local Vite server on port 5180 and use Node 24 with project dependencies and the QA host's bundled Playwright runtime:

```powershell
node scripts/qa/check-fjord-controls.mjs
node --test --test-concurrency=1 tests/touch.test.mjs tests/shared-settlement.test.mjs tests/simulation-mechanics.test.mjs tests/gameplay-lab.test.mjs tests/settlement-view.test.mjs tests/fjord-bridge.test.mjs
npm run build
```

`QA_CASE` selects `navigation`, `rotation`, `touch` or `housing`; it defaults to `all`. `QA_ORIGIN`, `QA_OUTPUT` and `PLAYWRIGHT_MODULE` override the host-specific paths.
