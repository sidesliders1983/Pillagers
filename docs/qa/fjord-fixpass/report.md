# Fjord loading, arrival and precipitation fixpass

Date: 2026-10-14. Branch: codex/fjord-loading-camera-fixpass, based on main 6329910.

## Scope and status

- The static document now shows a neutral Loading Pillagers message. The prototype heading, Year 1200 DC, FPS and help tools mount only when the root prototype route opens. The other eight routes no longer inherit that UI while their JavaScript loads.
- The opening camera targets the campfire at about 53 m instead of framing all residences (the previous seed-32 arrival measured 105.18 m). Summer 800 tick 500 and the canonical founding chapter are retained.
- Seasonal precipitation from PR #130 is integrated, with original commits 71703bf and ae54317 recorded by cherry-pick provenance. Both original reports and images remain unchanged. This combined owner-requested pass retains the particle implementation, seeded presentation stream, budgets and palette timing.
- #144 is implemented after owner confirmation of the controller/clearance seam: canonical triangle traversal, endpoint/near-plane safety, immediate upward correction and damped recovery. Requested zoom/yaw remain independent. Owner visual acceptance of camera feel is still pending before merge.
- This branch is not merged. #159 is not complete on main until this integration is merged. PR #130 is preserved as the source of the work.

## Validation

- Red → green browser bootstrap regression: with the entry module deliberately withheld, all nine route documents show only the neutral loading status. The previous document exposed the legacy header in /fjord-play.
- Red → green real mobile arrival: 105.18 m failed the under-65 m regression; the new camera ended at 52.62 m. The chapter retains exact text and scroll through loading, matches the saved book and regular reader, with no duplicate popup.
- New Summer opening: zero snow/rain targets, zero particles and zero elapsed effect time when first ready. No loading time advances Core.
- Eleven season/Summer founding tests pass, including save/load, handoff, annual weather independence and Core/RNG replay.
- Ten public clearance/controller tests and four existing desktop/touch input tests pass. Red/green cases caught a hidden intervening ridge, missed narrow triangle tip, snap-down recovery, near-plane slope, unsafe setView, invalid numerical inputs, displaced authored close-ups and navigation-focus tunneling.
- Original precipitation browser suite passes on current integration: Low/Normal/Off, reduced motion, paused/hidden freeze, saved Winter import, gradual Summer rain, Autumn crossover, Spring thaw, live transitions, public touch selection and exported Core equivalence. The visible snow/Off comparison changed 406 foreground pixels; counters alone are not the visual check.
- TypeScript and production build pass. Existing large-chunk warning remains. No formatter is configured; formatting reviewed manually and git diff --check passes.

## Camera evidence

[Interactive camera review](camera-review.html), [camera browser data](camera/results.json).
The native undecorated diagnostic view shares the real RTS controller and canonical heightfield.
Independent dense boom queries verify the corrected views, in addition to the solver diagnostics.
The test exercises two 800 m curated islands, mouse orbit/pan/wheel/WASD/Q, repeated touch
pinch reversals, Home, phone/tablet resizing and geography replacement. Its uncorrected
reference button is only in this separate QA view, never in the player game.

Final recorded profiling series: island 7, 132 rendered updates,
median 0.10 ms, p95 0.10 ms,
maximum 0.20 ms for the clearance solver block; maximum
59 height queries in this series and zero conservative fallbacks.
These values exclude the rest of input/navigation/rendering, are timer-resolution limited and
are not a physical mobile-device benchmark. The configured hard solver budget remains 512.

Actual /fjord-play tablet smoke passed rotation, spread/pinch, resident touch selection,
management-panel reopening and exact canonical Core/layout export equality with a paused
saved island and ten built homes: [gameplay evidence](gameplay-touch/touch.json).

Reference-world browser QA also passed the actual tent-interior, low-water, village, shore
and overlook controls. The interior eye remained at its authored 0.6 m height:
[Reference observations](reference/results.json).

The new-campaign loading suite was rerun with clearance active: the founding chapter and
scroll are preserved, Summer 800 tick 500 stays dry, the campfire arrival remains about
52.62 m away, and the final endpoint/boom clearance diagnostics satisfy their margins.

## Evidence and limitations

[Review gallery](review.html), [phone loading data](loading/results.json), [tablet loading data](tablet/results.json), [current precipitation observations](precipitation/results.json).
Browser: Edge Chromium, 390×844 phone, 1024×768 tablet arrival and 1180×820 precipitation touch emulation. Physical iPhone/iPad Safari has not been tested for this revision. Frame arrays in the precipitation JSON are short local observations, not an isolated effect-cost benchmark; concurrent development activity is not controlled. No whole-device/GPU memory or peak-FPS claim is made.

The original QA records under ../seasonal-precipitation remain historical evidence. No new library, shader, gameplay weather rules or saved-world regeneration was added.
