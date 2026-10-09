# Fjordside uninterrupted annual transitions

9 October 2026. Follow-up to PR #82, after the owner requested removal of the obsolete annual summary popup.

The new browser regression first failed on the previous implementation: one modal was open at Year 1201. With the summary and automatic pause removed, the same check passed for three annual transitions in generated seed 17, Low quality, with ten Meshy residents. A controlled external `performance.now()` clock advances the annual boundaries; rendering, runtime characters, navigation and visible controls remain real. This is functional verification, not elapsed real-time or performance measurement. The screenshot's FPS value is affected by the controlled clock.

The run verified no blocking modal or automatic pause at the year boundary, correct annual ages and safe ground positions, continuing movement and animation time, unchanged exported geography, and manual Pause/Resume. A two-year clock advance while manually paused left ages, positions and animation time unchanged; resuming continued the remaining year interval. No browser errors occurred. The [raw snapshots](results.json) and [Year 1202 screenshot](year-1202.webp) record this run. The screenshot was visually inspected.

Run `node scripts/qa/check-fjordside-year.mjs` with Fjordside available at `QA_ORIGIN` (default `http://127.0.0.1:5182`). Output defaults to ignored `scratch/fjordside-continuous-years`.

The earlier resident-passing review and historical annual summary reports retain their original measurements. Current gameplay documentation and smoke runners describe uninterrupted annual aging. Source formatting was checked manually and with `git diff --check`; the project has no configured formatter.
