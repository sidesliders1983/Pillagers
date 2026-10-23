# Unified sunlight — #237

Unified sunlight is the default for Fjord Play following the owner's request on
23 October 2026. Ordinary URLs, including `?debugPerf=1`, use the integrated water
sunlight, coastal shadows and directional atmosphere. Explicit
`?sunlight=northern-v1` preserves the earlier annual-lighting comparison;
`?lighting=baseline` preserves the original lighting comparison.

The original opt-in implementation followed Northern Seasonal Light #236 /
PR #255, based on `e02c41f96cfc2a0050c17d232523c6f638045001`. Main was still
`d42b878` when work began. Historical QA measurements below describe that delivery.

## Comparison and scope

Open `/scripts/qa/unified-sunlight-237.html` on the separate preview origin.
The initial fixture is late spring, a permitted low camera and a sunward bearing.
The launcher reuses #236's fourteen archived real saves for islands 18/7. Both
variants restore the identical paused campaign, camera and quality through the
existing active-session storage lane. Changing bearing mirrors only the camera's
horizontal offset about its fixed target; minimum tilt/range limits are unchanged.

- Earlier annual lighting: `/fjord-play?lighting=northern-v1&sunlight=northern-v1`.
- Unified sunlight (now the default): `/fjord-play?sunlight=unified-v1`.

Both retain the accepted light/snow interpolation. Other labs
keep their existing water/material behavior. There is no daily calendar, sun
disc, moon, new skybox, extra light, postprocessing pass or gameplay modifier.

## One light authority and independent contributions

All consumers read #236's current interpolated world-space surface-to-sun vector,
linear solar color and actual direct intensity. `copySeasonalSun` copies into
existing buffers; it does not allocate a frozen public snapshot per frame.
The earlier clamped compatibility input remains available for baseline water.

Frame order is light presentation, native shadow fitting, shared atmosphere
uniform update, existing water uniform update, then the native renderer. Camera
movement affects reflection/view alignment, never sun direction or annual time.

The candidate adapts the existing ReferenceWater shader once at construction:

- Existing body and sky/Fresnel reflection are scaled by ambient intensity.
- Solar body diffuse and the existing wave/detail-normal highlights are scaled
  by actual solar intensity and visibility from the native directional shadow.
- Ambient is never multiplied by that solar visibility. Zero direct sun removes
  solar diffuse/glitter/glow while retaining readable body/sky fill.

Authored deep/shallow colors, wave equations, height sampling, grid/skirt layout,
normal/detail attenuation and quality geometry budgets are unchanged. No scene
reflection/refraction, duplicate water surface or new water texture is introduced.

## Bounded shadow reception

Water borrows the existing directional shadow texture and matrix. The matrix is
shared by reference: Three's native shadow pass updates it before the water draw,
avoiding a one-frame-old copied transform. Shadow queries use the actual displaced
world position and wave/detail normal with the native normal/depth bias/intensity.
Packed-depth decoding uses installed Three r180's packing chunk.

Low uses four PCF comparisons; Standard uses nine. The existing Low/Standard map
sizes, light count and native shadow pass remain unchanged. There is extra water
fragment work, which needs real GPU/device measurement; unchanged draw count is
not evidence that this cost is free.

`WorldLighting` accepts an explicit local receiver bound for water. It covers the
stored terrain rectangle plus 16 m of coast, with ±0.2 m around the water level.
The 2,000 m skirt never becomes an ocean-wide shadow bound/caster. Native terrain
and sanitized visible actors remain the only casters; no hidden actor lookup or
discovery change is added. Outside fitted coverage, water keeps ambient and
unoccluded solar light; a four-texel edge fade avoids a hard map rectangle.
The first frame after map creation/reallocation uses an unshadowed fallback until
the native texture exists. This is bounded coastal reception, not complete
offshore or cascaded shadow coverage; edge/low-sun artifacts require visual review.

## Shared directional atmosphere

One reversible material owner binds standard/physical materials at world,
discovery, model/wardrobe and dressing creation boundaries. Existing wind,
skinning, instancing, snow and source hooks are retained. Render frames update
shared uniform values only; there is no scene/material walk or recompile per tick.
Retired material callbacks release their owner registrations; disposal restores hooks.

The effect uses sunward horizontal view alignment, permitted camera tilt, world
distance/view depth and actual solar intensity. It applies a restrained pale warm
veil in the distance, reduced when looking away/raising the camera. Native land
direct diffuse, which already contains shadow occlusion, conservatively gates
the glow; water uses its solar visibility. This approximates directional haze,
not volumetric ray occlusion. It does not claim physically correct mountain/cloud
scattering. Foreground selection/basic materials, HTML UI, precipitation and
discovery fog keep their existing owners.

The installed Three fog path normally blends output-encoded fog after output
conversion. Candidate lit materials and water instead use the same copied linear
fog color in one linear display-space composition after lighting tone mapping and
before output encoding. This preserves the native exposure-independent fog color
at full fog opacity while avoiding a linear haze over encoded RGB. The stock late
fog fragment is removed only in those candidate materials. Far-opaque fog returns
to the original fog color to retain the apron/sky join. No bloom, flare,
fullscreen golden filter or compensating exposure boost is used.

## Evidence and remaining gates

See [the QA report](qa/unified-sunlight-237/REPORT.md) for shader compile/link,
focused contracts and proportional CPU measurements. The comparison exporter
records light/atmosphere, calendar, camera, quality and renderer resource counts,
including program counts. It records no invented GPU timings.

At original delivery no controllable browser was available. Baseline/candidate
pixel captures and the moving pan sequence were therefore not claimed. Visual review
must check both islands, both qualities, sunward/away/normal cameras, real shadowed
coasts, summer, returning light, dark winter and applicable weather. Real GPU/frame
measurements use the existing #151 protocol. Physical iPhone/iPad and visual
evidence remain under #151. The owner's subsequent request activates the existing
effect by default; it does not supply new measured GPU/device evidence.
