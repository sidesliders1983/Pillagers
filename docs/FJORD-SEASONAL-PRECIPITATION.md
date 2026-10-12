# Seasonal precipitation in the Fjord

## Player behavior

`/fjord-play` uses the same saved visual-season blend for environment colours and precipitation.
Rain starts building after **Summer** begins; snowfall starts building after **Autumn** begins.
Both can be present while Autumn colours blend into Winter. Calendar labels keep their existing
quarter boundaries. With the current 1,000 ticks per year:

| Saved tick | Precipitation |
| --- | --- |
| 0–250 | Full Winter snowfall |
| After 250–375 | Snowfall fades with the northern Spring thaw |
| 375–500 | Dry |
| After 500–750 | Rain builds with the Summer → Autumn colour transition |
| After 750–1,000 | Rain fades as snow builds with the Autumn → Winter colour transition |

These weights reuse the existing smooth environment curve; there is no separate date offset.
The ground and structure snow-cover curve is unchanged.

The existing menu setting is now **Local effects**, covering snow, rain and campfire particles.
It defaults to Low. Off and the device's reduced-motion preference hide precipitation and clear
existing particles, including while paused. Pausing the campaign or hiding the tab freezes
the effect clock. Loading or restarting creates an empty effect; it starts emitting when the
campaign resumes, without replaying past snowfall or rain.

These are seasonal decorations. They do not consume resources, change annual weather rolls,
change harvests, melt ground snow, or introduce rain/snow gameplay modifiers. The campaign's
**Enable winter weather** option still controls the saved annual weather rules. Seasonal
visuals remain available with that option disabled, just like the existing seasonal palette.

## Implementation and provenance

The implementation reuses pinned **three.quarks 0.16.0**, **quarks.core 0.16.0** and the existing
Three.js version. See the [campfire source/licence notes](CAMPFIRE-VFX-SPIKE.md). It uses the
library's [billboard and stretched-billboard renderers](https://docs.quarks.art/docs/core-components/renderers),
ParticleSystem, BatchedRenderer and ColorOverLife; no new renderer, shader, remote service,
texture download or dependency version is introduced. The small radial alpha mask is shared
from the campfire adapter; the seasonal emitter settings are authored in this repository.

Snow uses slow, soft flakes; rain uses faster blue-grey streaks. Each effect has one batch.
The volume follows the camera focus, with a radius of 12–44 world units and height of 12–28.
Existing particles remain in world space. Particle lifetimes end at the sampled terrain/water
height. Depth testing lets opaque scenery occlude particles. There is no mesh collision,
roof accumulation, puddle, splash or wind simulation in this step.

| Setting | Snow live cap | Rain live cap | Snow rate / second | Rain rate / second |
| --- | ---: | ---: | ---: | ---: |
| Low | 300 | 250 | 70 | 180 |
| Normal | 700 | 600 | 140 | 400 |
| Off / reduced motion | 0 | 0 | 0 | 0 |

The emission guard includes fractional emission headroom. Emission and opacity follow separate
snow/rain weights from the environment blend. Both caps can coexist during the Autumn transition.
A full-strength jump takes up to two active seconds to settle; regular ticking tracks the
gradual palette blend rather than waiting for the next calendar label.
A camera zoom never increases these caps; a bounded size multiplier keeps particles readable at
overview distance. Quality changes reuse resources and clear particles.
Frame deltas are clamped to 0.1 seconds, preventing catch-up storms. A local seeded stream is
independent of canonical RNG. World rebuild and route disposal release emitters, batches,
materials and textures.

## Verification

- Public Fjord projection tests cover all quarter boundaries, all annual weather classes,
  disabled economic weather, and unchanged canonical state/save/replay.
- The browser check exercises actual `/fjord-play` rendering and menu controls, Low/Normal/Off,
  reduced motion, seasonal imports, live transitions, pause/hidden tab, and touch selection.
- [Review](qa/seasonal-precipitation/review.html) and
  [palette-timing observations](qa/seasonal-precipitation/palette-timing/report.md).
  The original report remains a historical record of the earlier label-based timing.
- Run `node --test tests/fjord-seasons.test.mjs`, then
  `node scripts/qa/check-seasonal-precipitation.mjs` against a local Vite server on port 5190.
  `QA_ORIGIN`, `QA_OUTPUT` and `PLAYWRIGHT_MODULE` override the local environment.

The automated browser is Edge Chromium with tablet-sized touch emulation. It does not certify
physical iPad Safari behavior. Frame intervals are local observations, not a performance gate
or an isolated GPU cost measurement. Physical-device visual review remains useful.
