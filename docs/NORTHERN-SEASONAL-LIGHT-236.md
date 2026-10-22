# Northern Seasonal Light — #236

Status: owner approved the profile, smooth transitions and visual result on 22 October 2026,
and subsequently requested Northern Light as the Fjord Play default with #256.
Ordinary `/fjord-play` URLs now select `northern-v1`; `?lighting=baseline` retains
the earlier comparison. This default changes presentation only, including existing saves.
Historical baseline measurements against main `d42b878` remain unchanged.

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

The pure profile and composed endpoints are re-evaluated on canonical
progress/weather changes. Ordinary running clock batches blend from the currently
visible light to the new confirmed endpoint over the existing 500 ms clock
interval. Direction is normalized; linear RGB colors, direct/ambient strength,
darkness, sky, base fog and exposure blend together. The presentation may trail
Core by one update interval; it never extrapolates future calendar time. Small
forward steps across midwinter wrap forward rather than crossing back through summer.

Interpolation uses the existing active frame delta, with no additional timer or
Core clock. Pause freezes the current light; resume continues from that pose.
Loads, explicit time jumps and new worlds anchor directly to the supplied tick.
Hidden-tab/context recovery reanchors to the last confirmed endpoint without
replaying elapsed background time. The existing paused fire clock remains separate.

Three reusable CPU buffers hold the render values. Frozen read-only light
snapshots are created lazily for consumers such as diagnostics, and remain
immutable after publication. Water copies the same sun authority directly into
its existing uniforms, avoiding a snapshot allocation every frame. A steady or
paused view retains its cached state. There are no new scene traversals, lights,
shadow maps, shader variants, geometry or textures. The existing native receiver
crop follows the interpolated direction, using cached bounds; camera/bounds
changes retain their existing immediate behavior. Shadow crop CPU work is
included in the follow-up measurement, rather than omitted from its cost.

Light and seasonal-material invalidation have separate signatures, so returning
sunlight does not force foliage/snow reprocessing while the winter palette is held.

After owner acceptance of the interpolated lighting, the same presentation approach
also smooths the existing snow/seasonal-material endpoints. `SeasonAppearanceTransition`
uses `visualProgress` rather than solar progress; the approved Winter hold and Spring
thaw remain independent of returning sunlight. Terrain, foliage, structures and
settlement dressing share one reusable material sample. This snow/color smoothing
also applies with baseline lighting. See [the current seasonal contract](FJORD-SEASONS-HUD.md).

Camera, quality, FPS and brightness cannot change this state's annual solar
direction. Shadow fitting consumes the direction and may translate the light
along it, without becoming the authority for that vector. No new shadow maps or
scene-bound traversals occur at annual transitions.

The paired #237 will consume this state for unified water and atmosphere work.
#236 retains the existing water consumer and only makes any minimal adaptation
needed to avoid representing a below-horizon sun as a bright solar source.
It does not add direct/ambient water separation, shadow reception or glow shaders.

## Delivery and acceptance

Northern annual lighting is the owner-approved default on `/fjord-play`.
`?lighting=baseline` retains the original comparison, and the explicit
`?lighting=northern-v1` link remains supported. The review launcher is
`/scripts/qa/northern-light-236.html`. Keep the developer day/night presets. Provide matched
saved-scene phase comparisons and a short year-boundary capture, with bounded
CPU/shadow/resource measurements. Test pause, speed, import/time jumps, restart,
disposal and canonical-save equivalence. Low/Standard and both existing islands
are part of the review where relevant.

The owner accepted the smooth annual light and snow appearance and requested
default activation. Any missing instrumented phone/tablet or GPU evidence remains
explicit under #151, never substituted with emulated or generated imagery.

`scripts/check-northern-light-236.mjs` prepares all seven fixed phases for both
historical production island fixtures (18 and 7), storing saves and a CPU-only
report under `output/northern-light-236/`. The launcher also supports Low and
Standard quality, normal and permitted low cameras (about 26.4° elevation), and
restores exactly the same save/presentation for Baseline and Northern light.
Its canvas recorder observes the real scene while the player advances the
existing one-minute annual clock. Review telemetry is bounded and never drives
light, campaign time or Core commands.
