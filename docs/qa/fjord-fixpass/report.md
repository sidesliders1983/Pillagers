# Fjord loading, arrival and precipitation fixpass

Date: 2026-10-14. Branch: codex/fjord-loading-camera-fixpass, based on main 6329910.

## Scope and status

- The static document now shows a neutral Loading Pillagers message. The prototype heading, Year 1200 DC, FPS and help tools mount only when the root prototype route opens. The other eight routes no longer inherit that UI while their JavaScript loads.
- The opening camera targets the campfire at about 53 m instead of framing all residences (the previous seed-32 arrival measured 105.18 m). Summer 800 tick 500 and the canonical founding chapter are retained.
- Seasonal precipitation from PR #130 is integrated, with original commits 71703bf and ae54317 recorded by cherry-pick provenance. Both original reports and images remain unchanged. This combined owner-requested pass retains the particle implementation, seeded presentation stream, budgets and palette timing.
- #144 camera terrain clearance remains pending. No collision implementation or camera-feel acceptance is claimed here. The new pure solver/controller TDD boundary was sent for owner confirmation.
- This branch is not merged. #159 is not complete on main until this integration is merged. PR #130 is preserved as the source of the work.

## Validation

- Red → green browser bootstrap regression: with the entry module deliberately withheld, all nine route documents show only the neutral loading status. The previous document exposed the legacy header in /fjord-play.
- Red → green real mobile arrival: 105.18 m failed the under-65 m regression; the new camera ended at 52.62 m. The chapter retains exact text and scroll through loading, matches the saved book and regular reader, with no duplicate popup.
- New Summer opening: zero snow/rain targets, zero particles and zero elapsed effect time when first ready. No loading time advances Core.
- Eleven season/Summer founding tests pass, including save/load, handoff, annual weather independence and Core/RNG replay.
- Four existing desktop/touch camera-controller tests pass. These verify existing controls, not the future #144 collision behavior.
- Original precipitation browser suite passes on current integration: Low/Normal/Off, reduced motion, paused/hidden freeze, saved Winter import, gradual Summer rain, Autumn crossover, Spring thaw, live transitions, public touch selection and exported Core equivalence. The visible snow/Off comparison changed 406 foreground pixels; counters alone are not the visual check.
- TypeScript and production build pass. Existing large-chunk warning remains. No formatter is configured; formatting reviewed manually and git diff --check passes.

## Evidence and limitations

[Review gallery](review.html), [phone loading data](loading/results.json), [tablet loading data](tablet/results.json), [current precipitation observations](precipitation/results.json).
Browser: Edge Chromium, 390×844 phone, 1024×768 tablet arrival and 1180×820 precipitation touch emulation. Physical iPhone/iPad Safari has not been tested for this revision. Frame arrays in the precipitation JSON are short local observations, not an isolated effect-cost benchmark; concurrent development activity is not controlled. No whole-device/GPU memory or peak-FPS claim is made.

The original QA records under ../seasonal-precipitation remain historical evidence. No new library, shader, gameplay weather rules or saved-world regeneration was added.
