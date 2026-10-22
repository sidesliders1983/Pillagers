# Northern Seasonal Light — #236

Status: owner approved the contract/profile on 22 October 2026; opt-in integration is implemented.
Baseline: main `d42b878`. Default activation requires a later visual acceptance;
this issue delivers an opt-in comparison in the existing Fjord Play scene.

## Approved annual profile

Use the existing canonical `calendar.progress`, where 0/1 is midwinter and .5
is high summer. Preserve `visualProgress` exclusively for the existing seasonal
palette, snow hold and thaw. No day/hour clock, added calendar fields or Core
events are introduced.

The fixed artistic profile is **northern-v1**:

- Elevation in degrees: `20 - 25 × cos(2π × progress)`, smoothly ranging from
  −5° in midwinter to 45° in high summer.
- Retain the approved horizontal light bearing: `atan2(x,z) = 135°`.
  World +Y is up, +X is east and −Z is north; this bearing therefore points
  towards +X/−Z. Only elevation changes through the year; there is no daily
  orbit or random campaign latitude. This is an artistic abstraction, not a
  geographical solar-position calculation.
- Direct solar scale: `smoothstep(0°,18°,elevation)`. Below-horizon sunlight
  contributes zero direct light; late spring and summer sustain full sunlight.
- Darkness: `1 - smoothstep(-4°,12°,elevation)`. The concentrated midwinter
  phase uses cool sky/ground fill, preserving readable terrain and residents.
  Existing night/fog colors are the starting point for visual review, without
  introducing another directional night source.

| Calendar progress | Scene phase | Elevation | Direct solar scale | Darkness |
| --- | --- | ---: | ---: | ---: |
| 0 / 1 | Midwinter | −5° | 0 | 1 |
| .125 | Returning light, snow still held | 2.32° | .046 | .654 |
| .25 | Spring | 20° | 1 | 0 |
| .375 | Late spring | 37.68° | 1 | 0 |
| .5 | High summer | 45° | 1 | 0 |
| .75 | Early autumn | 20° | 1 | 0 |
| .875 | Late autumn twilight | 2.32° | .046 | .654 |

## Shared read-only light state

The state exposes one world-space sun and separate ambient fill:

```ts
interface SeasonalLightState {
    readonly profile: 'northern-v1';
    readonly yearProgress: number;
    readonly sunDirection: readonly [number, number, number]; // normalized surface-to-sun
    readonly sunElevation: number; // radians, may be below the horizon
    readonly solarStrength: number; // actual direct-light intensity, zero below horizon
    readonly solarColor: readonly [number, number, number]; // linear RGB
    readonly ambient: Readonly<{
        skyColor: readonly [number, number, number]; // linear RGB
        groundColor: readonly [number, number, number];
        strength: number;
    }>;
    readonly darkness: number;
}
```

Compose the current seasonal palette and weather treatment first, then the
annual direct-light and darkness treatment. Reuse the existing hemisphere,
directional source, fog and fire ownership. Keep exposure from counteracting the
annual curve; preserve authored material colors. The exact readable fill level
is to be judged against matched real-scene views in this opt-in review.

The implemented ambient strength is `max(.6, seasonalWeatherStrength ×
(1 - .25 × darkness))`. This keeps cool fill visible without applying the
direct solar attenuation to ambient a second time. Sky and ground ambient
colors blend towards the existing native night palette. Background and fog
colors use that same darkness blend; weather exposure and fog distances retain
their existing owners. There is no compensating annual exposure boost.

The pure profile and frozen composed state are re-evaluated on canonical
progress/weather changes. Render frames reuse that state. No within-tick
interpolation timer was added: pause and hidden-tab behavior follow existing
canonical updates, and imports/time jumps anchor directly to the supplied tick.
Light and seasonal-material invalidation have separate signatures, so returning
sunlight does not force foliage/snow reprocessing while the winter palette is held.

Camera, quality, FPS and brightness cannot change this state's annual solar
direction. Shadow fitting consumes the direction and may translate the light
along it, without becoming the authority for that vector. No new shadow maps or
scene-bound traversals occur at annual transitions.

The paired #237 will consume this state for unified water and atmosphere work.
#236 retains the existing water consumer and only makes any minimal adaptation
needed to avoid representing a below-horizon sun as a bright solar source.
It does not add direct/ambient water separation, shadow reception or glow shaders.

## Delivery and acceptance

The opt-in annual lighting is `/fjord-play?lighting=northern-v1`; ordinary
`/fjord-play` retains its baseline. The review launcher is
`/scripts/qa/northern-light-236.html`. Keep the developer day/night presets. Provide matched
saved-scene phase comparisons and a short year-boundary capture, with bounded
CPU/shadow/resource measurements. Test pause, speed, import/time jumps, restart,
disposal and canonical-save equivalence. Low/Standard and both existing islands
are part of the review where relevant.

Actual phone/tablet readability and visual owner acceptance remain explicit
gates before default rollout. Unavailable hardware/browser evidence must be
reported as pending, never substituted with emulated or generated imagery.

`scripts/check-northern-light-236.mjs` prepares all seven fixed phases for both
historical production island fixtures (18 and 7), storing saves and a CPU-only
report under `output/northern-light-236/`. The launcher also supports Low and
Standard quality, normal and permitted low cameras (about 26.4° elevation), and
restores exactly the same save/presentation for Baseline and Northern light.
Its canvas recorder observes the real scene while the player advances the
existing one-minute annual clock. Review telemetry is bounded and never drives
light, campaign time or Core commands.
