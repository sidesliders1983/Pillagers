# Seasonal precipitation — browser review

Date: 2026-10-12. Route: `/fjord-play`. Base: `dfde23b` (merged #129).

## Result

Winter emits slow snowflakes; Autumn emits faster blue-grey rain streaks. Spring and Summer
are dry. The established northern snow-cover/thaw curve is unchanged. Low is the default;
Menu → Local effects also offers Normal and Off. The existing Three.quarks renderer is reused.

[Visual review](review.html) · [Seasonal browser observations](results.json) ·
[Campfire regression observations](campfire-regression.json) ·
[Behavior and source notes](../../FJORD-SEASONAL-PRECIPITATION.md)

## Checks performed

- Test-first: the public season projection initially lacked precipitation, and the first
  browser check could not observe snowfall. Both passed after implementation.
- Six public season tests pass, covering exact boundaries, every annual weather class,
  economic-weather Off, save/load, shared-session handoffs, replay and the northern thaw.
- Browser checks pass for Low/Normal/Off, reduced motion, pause, hidden tabs, seasonal
  imports, Winter → Spring fade and Autumn → Winter crossfade.
- The rendered snowfall is compared with Off in a paused camera-focus region, excluding
  water and the management overlay; the assertion observes changed pixels rather than
  relying solely on particle counters.
- Touch selection reaches the campfire through the particles. Canonical JSON exports
  equal direct Simulation Core advancement after snowfall, quality changes and imports.
- Low has at most 300 snowflakes / 250 raindrops; Normal has at most 700 / 600. The prior
  shower can briefly coexist with the next shower during the two-second transition.
- Spring/Summer/Autumn imports retain two effect batches. The observed renderer resources
  stay at 28 geometries and 51 textures across those imports, with the local prepared houses.
- Existing campfire browser QA passes: ignition/extinguishing, fuel, snow melt, quality,
  reduced motion, pause, selection and import behavior remain intact.
- TypeScript and production build pass. Formatting reviewed manually; no project formatter
  is configured. `git diff --check` passes.

## Measurement limits

Edge Chromium at 1180 × 820 with touch emulation was used. This is not a physical iPad/Safari
certification. Two short, 40-frame sequences are retained as individual frame intervals in
`results.json`; they are development-machine observations, not an isolated VFX benchmark or
performance acceptance threshold. Load during validation varied, so Low and Normal timings
must not be interpreted as a controlled quality comparison.

Still images freeze the particles. Movement is easier to judge in the running game. Snowfall
is local around the camera focus, not a world-wide particle simulation. There are no new
splashes, puddles, roof collisions, wind drift or accumulated snow from individual particles.
