# Reference water component

`ReferenceWater` is a reusable Three.js WebGL water surface inspired by the supplied
screen recording. It reproduces layered wave motion, a blue to turquoise response
to the viewing angle, and broken sun highlights with one opaque draw. Open
`/water-lab` to inspect it without boats or scenery.

The implementation is an approximation of the visible result. The video cannot
identify its original shader or simulation. This component does not sample the
scene behind the water, so the reference's submerged detail and refractive
distortion are outside its current rendering capabilities.

## Video evidence

Source: `1-ScreenRecording_10-09-2026-08-26-03_1.mov`, supplied by the user on
9 October 2026. The HEVC recording is 1180 × 1750, approximately 7.72 seconds,
with 465 decoded frames. Presentation timestamps span 0.000–7.710 seconds.

Every frame was decoded with its source timestamp. All 465 lower-half water crops
were visually reviewed in eight contact sheets, at 256 × 190 pixels per crop.
Six additional source-resolution samples at approximately 0, 1, 3, 5, 6 and
7 seconds were inspected. This is complete temporal coverage at contact-sheet
scale, not native-resolution inspection of every frame.

The camera orbits throughout the clip. Camera motion and missing world dimensions
prevent reliable recovery of physical wave speeds, wavelengths, amplitudes or
a unique simulation algorithm. The source's 60–61 FPS overlay is not a benchmark
of this implementation or a mobile device.

See the [source overview](qa/reference-water/source-overview.jpg),
[frame timeline](qa/reference-water/frame-timeline.csv) and
[detailed observations](qa/reference-water/analysis.json).
The ignored local folder `output/water-reference/` retains every decoded frame,
all contact sheets and the full-resolution samples.

## Analysis and implementation

| Area | Visible evidence | Implementation |
| --- | --- | --- |
| Shaders | Rolling faces, angle-dependent blue and turquoise, irregular bright streaks | Three analytic wave directions; slope normals; Fresnel sky reflection; an angle-based absorption tint |
| Animation and motion | Broad movement and smaller ripples evolve continuously across the camera orbit | Absolute elapsed seconds drive distinct wave phases and differently directed texture flows; no per-frame geometry rebuild |
| Texturing | Irregular detail spans multiple scales; underwater-looking features remain visible in parts of the recording | A deterministic, periodic 128 × 128 RGBA8 slope and height texture, sampled twice or three times; no downloaded assets |
| Lighting | Soft sky reflections and narrower silver glints, especially around 6.4–7.4 seconds | Configurable directional sun and sky colors, tighter specular highlights, and Three.js tone mapping and output color conversion |
| LOD and DOF | Detail compresses toward the horizon; no conspicuous focus band or visible LOD boundary at reviewed scale | Three mesh tiers; suppression of wavelengths the grid cannot resolve; mip filtering and gradual normal-detail fade; optional sparse horizon skirt; no DOF pass |
| Rendering cost | The video does not expose GPU, draw count or memory usage | One front-facing opaque surface with depth writing; no mandatory scene capture, reflection target, transparent overdraw or postprocessing |
| QA | The recording provides elevated, grazing and strong-highlight views | Deterministic captures, independent visual review, frame motion and pause comparisons, resource checks, mobile viewport checks and desktop timing diagnostics |

At 0–1 seconds, the view changes from turquoise foreground toward a lower, bluer
angle. The 1–4.3 second interval emphasizes rolling crests and grey-blue
reflections. From roughly 4.8 seconds, the rising viewpoint reveals more turquoise
and underlying-looking dark detail. The final interval adds concentrated broken
glints. Hull foam is localized; it is not a pervasive whitecap layer.

The work was split among an agent for shaders, texture and lighting; an agent for
LOD, rendering cost and automated verification; and an agent for frame coverage,
motion and visual QA. The coordinating agent implemented the lab and reviewed
the combined result.

## Buoyancy sample

The lab now opens with an orange floating sample and the **Buoyancy close-up**
camera. **Floating sample** toggles it off for water-only inspection. On phones
the controls start collapsed so they do not cover the object. Increase **Wave
height** to make heave, pitch and roll easier to inspect. Pause and time scrubbing
freeze or reposition the water and object together.

The object uses four support heights from `water.getHeightAt(x, z, elapsedSeconds)`.
The method evaluates the shared shader wave definitions at grid vertices and
interpolates the rendered triangle, including quality-dependent wave filtering
and the flat horizon skirt. It returns `null` outside the surface. Coordinates
are world-space and placement supports the same translation-only contract as
the water mesh. Omitting the time samples the current water animation time.

```ts
const height = water.getHeightAt(worldX, worldZ, elapsedSeconds);
if (height !== null) object.position.y = height + freeboard;
```

`FloatingSample` fits a plane through four support heights to determine vertical
position and tilt. Its fixed draft is 0.34 m for a 0.85 m tall block. This is a
deterministic kinematic buoyancy preview; it does not simulate mass, inertia,
drag, collisions, drift, wakes or force-based flotation. Fragment-normal texture
ripples do not change the physical surface height.

The sample owns one geometry and one material, adds **132 triangles and one draw**,
and downloads no assets. With it hidden, the water retains its one-draw budget.
The lab footer reports total visible draws and triangles. The existing water
benchmark harness explicitly hides the sample and selects the reference view,
so previous water-only measurements remain comparable in scope.

Validation for this addition: 13 focused water and buoyancy tests, plus browser
checks for changing position and orientation, exact paused transforms, zero-wave
draft, all quality tiers, visibility toggle and mobile controls. Browser evidence
is saved in `docs/qa/water-buoyancy/`. No performance benchmark was run for this
addition; measurements remain the user's phone test.

## Using the component

```ts
import { Vector3 } from 'three';
import { ReferenceWater } from './water/ReferenceWater';

const water = new ReferenceWater({
    size: 80,
    extent: 2000,
    level: 0,
    quality: 'medium',
});
scene.add(water.mesh);

water.setLighting({
    sunDirection: new Vector3(-0.6, 0.8, -0.4),
    sunColor: '#fff5db',
    skyColor: '#709bbb',
    intensity: 1,
});

// Call once per frame using the game's existing simulation clock.
water.update(elapsedSeconds, camera);

// Settings may be changed without resetting the animation clock.
water.setQuality('low');
water.setParameters({ waveAmplitude: 0.18, waveSpeed: 1, detailStrength: 0.65 });

// Removes the mesh and releases its owned geometry, material and texture.
water.dispose();
```

The component owns no renderer, animation loop, camera, global listeners or scene
objects besides its mesh. Pass the camera when updating, particularly for an
orthographic game view. Translate the horizontal mesh with `mesh.position`;
rotation and scaling are not supported placements. The shader uses world
coordinates for surface patterns.

`size` controls the central grid size in world metres, defaulting to 40.
`extent` defaults to `size`. A larger extent stretches only the outermost grid
row into a far horizon skirt and fades its geometric displacement to zero,
preserving the triangle budget. Keep the camera over the dense central area.
The skirt is suitable for distant open water; it does not replace a terrain
boundary or a camera-following ocean tiling system.

Larger grids resolve fewer short geometric waves. The shader suppresses
under-sampled wavelengths and retains smaller ripples in its fragment normals.
Wave amplitude is a maximum summed displacement; grid filtering may lower the
actual displacement. Set the camera's far plane to include the desired extent.

`update` uses absolute seconds, making a chosen time reproducible at different
update rates. `waveSpeed: 0` freezes the pattern. Changing speed while running
changes the absolute phase; it is a tuning control, not a continuous acceleration
model. To pause a game, hold the elapsed time fixed and resume that clock.

`setLighting` accepts world-space sun direction, sun color, sky color and
intensity. It does not read Three.js light objects. Supply the relevant values
from the game's lighting system. The shader includes tone mapping and output
color conversion as required for a custom
[Three.js ShaderMaterial](https://threejs.org/manual/pages/color-management.html).
The lab uses ACES filmic tone mapping and sRGB output.

## Quality and mobile rendering

| Tier | Grid | Triangles | Texture samples per fragment | Lab DPR cap |
| --- | ---: | ---: | ---: | ---: |
| Low | 32 × 32 | 2,048 | 2 | 1 |
| Medium | 64 × 64 | 8,192 | 2 | 1.5 |
| High | 96 × 96 | 18,432 | 3 | 2 |

Every tier uses one draw and one 128 × 128 RGBA8 texture. The calculated texture
payload is 87,380 bytes including mipmaps, about 85.3 KiB, excluding driver
overhead. It is not measured VRAM. Geometry changes only when switching tiers;
the texture is retained. Disposal is idempotent.

For comparison, the existing working-tree FjordWater configuration uses
16,200 triangles for low quality and 64,800 for standard quality. Both new
mobile tiers therefore use about 87% fewer triangles than those corresponding
configurations. This is a structural comparison, not an equal-feature speedup:
FjordWater also provides shoreline masks, foam sources and scene shadows.
The existing water and vendor shader have been preserved.

Start phone evaluation with low quality and DPR 1. Try medium only with measured
headroom in the full game. The lab bounds DPR independently of the component,
because resolution belongs to the host renderer. Fill rate, game content,
thermal throttling and device GPU still determine the usable frame rate.
The lab updates its UI telemetry four times per second and skips rendering while
the document is hidden.

## Validation

The automated checks exercise deterministic motion and freeze, all camera and
quality presets, ten complete quality cycles, correct draw and triangle counts,
stable geometry and texture counts, high-DPR mobile emulation, portrait and
landscape layout, and browser or shader errors. Unit tests cover validation,
resource ownership, quality switching and bounds including the horizon skirt.

The final results and runtime source hashes are saved in
[the browser report](qa/reference-water/results.json). The report distinguishes
desktop GPU timings from mobile viewport emulation. Timing samples are rAF
intervals, including display and host scheduling, rather than isolated GPU
execution time. No physical phone performance claim is made.

Visual acceptance is property-based: layered movement, darker troughs, angular
color response, broken highlights and stable distant detail. Pixelwise image
matching to the recording would be misleading because the source camera,
geometry and environment are unavailable. Automated image differences verify
motion and pause within this implementation, not similarity to the source.

The initial pale appearance and exposed plane edge were corrected after visual
review. A second review caught radial streaks from interpolating wave slopes
over the stretched horizon triangles. Wave height and slope now fade to zero
before those triangles begin, and a regression test covers every skirt triangle
in every quality tier. The result still approximates the reference's reflection complexity.
True scene refraction, bathymetry-driven shallow color, submerged-object
visibility, reflected objects, shadows on the water, shoreline foam and hull
interaction are not implemented. Boat and environment reconstruction are excluded.


The full existing suite completed with 435 passed, zero failed and one skipped
out of 436 tests. The skip is the existing opt-in test `actual r3
neutral/female/Giant/compound/child frozen GLBs are portable`, gated by
`RUN_R3_EVIDENCE=1`; its configuration was not changed. After the final horizon
correction, all eight focused water tests passed. The final `pnpm build` passed;
Vite retains its warning about the existing Three.js chunk exceeding 500 kB.
No project formatter is configured; the new source was manually reviewed and
`git diff --check` passed.
## Desktop timing evidence

The local desktop diagnostic used Edge 154 with an Intel HD Graphics 630 through
ANGLE D3D11, a 1200 × 900 viewport and DPR 1. Each sample had 3 seconds of warmup
and 8 seconds of raw rAF intervals. Three runs used alternating tier order.
The five runtime source hashes match the final functional report exactly.

| Tier | Median milliseconds across three runs | p95 milliseconds across three runs |
| --- | --- | --- |
| Low | 18.0 / 35.2 / 35.9 | 18.1 / 36.1 / 36.3 |
| Medium | 18.0 / 18.0 / 35.9 | 18.1 / 18.3 / 38.0 |
| High | 18.0 / 18.0 / 35.9 | 18.1 / 36.0 / 36.3 |

The initial cadence was approximately 56 FPS and later fell to about 28 FPS
across all tiers. This does not demonstrate sustained 60 FPS, a stable ordering
of GPU cost by quality, or mobile performance. Other Codex threads were running concurrently on the same computer. This is
not a controlled test and cannot attribute cadence changes to the water.
The user will evaluate performance on a physical phone; no additional desktop
benchmarking is required for this handoff. All intervals, environment data and source
hashes remain in [the timing report](qa/reference-water/timings.json).

[The desktop interface capture](qa/reference-water/desktop-interface.png) shows
the readout at one warmed moment, not a summary of all samples. The mobile
screenshots are layout evidence; their capture-time FPS values are not phone
benchmarks.
## Reproducing the checks

```sh
pnpm dev -- --port 5192 --strictPort
node --test tests/reference-water.test.mjs tests/water-buoyancy.test.mjs
# Set QA_ORIGIN=http://127.0.0.1:5192 in your shell.
node scripts/qa/check-water-buoyancy.mjs
node scripts/check-reference-water.mjs
node scripts/qa/check-water-buoyancy.mjs
node scripts/check-reference-water.mjs --measure
pnpm test
pnpm build
```

The browser harness needs Playwright and Edge by default. Override
`PLAYWRIGHT_MODULE`, `QA_BROWSER`, `QA_ORIGIN` and `QA_OUTPUT` for another
installation. `--software` explicitly requests SwiftShader and is recorded as
such. The standard measurement defaults to 10 seconds warmup and 30 seconds
sampling for each of three repetitions per tier. The delivered desktop diagnostic
may use shorter intervals, recorded explicitly in each sample.

Re-extract a supplied video with Pillow and FFmpeg installed separately:

```sh
python scripts/qa/extract-water-reference.py recording.mov output/water-reference \
    --ffmpeg /path/to/ffmpeg --sample-times 0 1 3 5 6 7
```

The extraction preserves source presentation timestamps, writes every review
frame and contact sheet, computes a source hash and exports requested
full-resolution samples. Extraction alone does not declare the images reviewed.
No decoder, video or generated Python dependencies are added to the game bundle.
## Phone evaluation

The lab includes a rolling frame-cadence display using the latest 120 raw rAF
intervals: average FPS and the 95th-percentile interval in milliseconds. It updates
four times per second and resets after tab visibility changes. It is a lightweight
interactive readout, not an isolated GPU timer or a sustained thermal benchmark.

Once the lab is served through an approved local-network endpoint, open
`/water-lab` on the phone. Keep motion playing, start with Mobile low, and then
compare Mobile balanced from the same view. Let each tier settle before reading
FPS and p95. Repeat in portrait and landscape and after several minutes of use.
A 30 FPS target corresponds to about 33.3 ms per frame; a 60 FPS target to 16.7 ms.
Also inspect the grazing view for shimmer and the close view for texture softness.
This isolated lab leaves the rest of the game's GPU workload out of the result.