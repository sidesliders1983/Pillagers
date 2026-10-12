# Precipitation aligned with the seasonal palette

Date: 2026-10-12. Route: /fjord-play. Follow-up to PR #130, base 71703bf.

## Result

Rain now builds after Summer begins, as the environment blends toward Autumn.
During Autumn, rain fades and snow builds with the Winter colour weight. Snowfall also
follows the established northern Spring thaw. Calendar labels and the existing palette
are unchanged; precipitation no longer waits for the Autumn/Winter label to appear.

| Saved tick (1,000 per year) | Snow weight | Rain weight |
| --- | ---: | ---: |
| 0 and 250 | 1 | 0 |
| 375 and 500 | 0 | 0 |
| 625 | 0 | 0.5 |
| 750 | 0 | 1 |
| 875 | 0.5 | 0.5 |
| Next year's 0 | 1 | 0 |

[Current visual review](../review.html) · [Browser observations](results.json) ·
[Behavior and provenance](../../../FJORD-SEASONAL-PRECIPITATION.md)

The [initial report](../report.md), its measurements and images remain unchanged as a record
of the earlier label-based timing. This follow-up supersedes that timing, not its source attribution.

## Checks performed

- Test-first: the new public projection test failed because the old projection provided only a
  season label. Seven season tests now pass, including explicit blend values at the Summer
  and Autumn boundaries, northern thaw, all annual weather classes, save/load and unchanged Core.
- The browser check first failed because the renderer did not receive separate snow/rain weights.
  The completed check now passes on the LAN version at port 5180, with no page/console errors.
- Actual Summer rendering contains rain while the label still reads Summer. Actual Autumn
  rendering contains both rain and snow. The snow target equals the visible environment's
  Winter weight. Early Spring snowfall fades completely during the live transition.
- Live transitions are exercised with the public one-minute year setting. Scene work is excluded
  from the game clock, so the default pace made the long thaw check exceed its wall-clock timeout.
- Low/Normal/Off, reduced motion, pause, hidden-tab freeze, imports and touch selection pass.
  The paused snowfall/Off image comparison changes 1,337 pixels in the inspected foreground area.
- Exported canonical state equals direct Simulation Core advancement after seasonal imports
  and effect-setting changes; no Core RNG, stocks, events or saved gameplay rules are modified.
- Low stays within 300 snowflakes and 250 raindrops. Seasonal imports keep two effect batches,
  28 geometries and 51 textures. Autumn allows both bounded particle types simultaneously.
- TypeScript and production build pass. Formatting was reviewed manually; no formatter is
  configured. git diff --check passes.
- The LAN review page loads and its Summer/Autumn image controls work.

## Observations and limits

Edge Chromium at 1180 × 820 with touch emulation was used. This is not physical iPad Safari
certification. The observations include individual intervals for two short 40-frame samples;
they are not an isolated GPU benchmark or a performance acceptance gate.

Images are frozen samples of a moving effect. Showers remain local to the camera focus.
The fixed particle budgets, existing effects library and resource ownership are unchanged.
The earlier campfire regression run is retained in the initial evidence; it was not rerun for
this projection-only timing adjustment.
