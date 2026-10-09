# Fjordside ReferenceWater and faering flotation

Issue #75 integrates the Water Lab component approved on 9 October 2026 into
ordinary generated Fjordside and the original Reference scene. The lab's original
wave/detail implementation and defaults are reused; this is the existing original
approximation of the supplied video, not a copy of an unidentified demo bundle.

## Surface and lighting

- Wave amplitude 0.18 m, speed 1, detail strength 0.65; deep/shallow colours
  #073650 / #078d92. No silent visual retuning or world-exposure change.
- Standard uses Medium: 64×64 cells, 8,192 triangles and two normal samples.
  Low uses 32×32 cells, 2,048 triangles and two normal samples. High remains in Water Lab.
- One opaque water draw; one owned geometry, material and 128×128 RGBA8 normal
  texture. The complete mip-chain estimate is 87,380 bytes, not measured VRAM.
- An 80 m dense region is centred on the original boat mooring. The 2,000 m sparse
  skirt covers distant water. Near the outer grid cells, geometric waves fade to
  the flat skirt; the grid is not stretched across the entire navigable world.
- Generated water retains the stored WorldBlueprint water level. Reference retains
  its original -0.12 m level. Terrain, nature, six parcels, source props, horizontal
  boat/pier positions, headings and saved attachments remain unchanged.
- Native Three.js fog chunks join the horizon to the existing world atmosphere.
  The same camera, directional sun/moon direction and colour, sky colour and ambient
  day/night gain drive the selected component. Day gain is 1; gain follows the native
  ambient intensity continuously, including seasons. World exposure is untouched.

This replaces both previous visible Fjordside water surfaces; no duplicate water
renderer remains. Environment Lab still uses its existing boona13 adapter. The old
source files, vendor licences and measurement reports are retained. ReferenceWater
has no real building/tree/boat reflections, seabed refraction, bathymetry mask or
shoreline foam. Its turquoise tint depends on viewing angle, not measured depth.

## Original boat

The grounded AssetManager faering measures 1.324 m wide, 1.181 m high and 4.954 m
long. Its keel is at local y=0 and midship gunwale is near y=0.60. The selected
waterline is local y=0.24, leaving about 0.36 m of midship freeboard. This calibration
comes from the actual original boat, not the orange block's dimensions or draft.

Four supports form a 0.76×2.50 m rectangle within the hull. They are transformed by
its existing horizontal placement, heading and scale. ReferenceWater.getHeightAt
interpolates the rendered grid triangles at the same absolute time as the water.
A fitted plane determines heave and pitch/roll; its tilt is composed with the
original heading. The root's horizontal mooring stays fixed. Missing support water
raises a visible error without replacing the last finite pose with zero or NaNs.

This is kinematic flotation. It adds no mass, inertia, drag, sailing, drift, wakes,
force solver or collision response. Normal-texture ripples do not displace the boat.
The boat borrows AssetManager geometry/materials and does not dispose them.

## Controls, lifecycle and review

Open `/?worldDev=1` → Development tools → Debug. Boat close-up and Water low angle
are additional review cameras. Set effects time and pause scrubs water/boat/wind
together without advancing the annual simulation. Resume continues from that time.
Annual aging no longer opens a summary or pauses the world. Manual Pause still holds the annual clock and environmental motion.

Changing Standard/Low switches the live water mesh, DPR cap and shadow budget
without reloading, resetting time or changing geography. The ground-map tier is the
one loaded at scene creation, recorded as groundTier; this slice does not reload
terrain maps during live quality changes. Reload/import of an explicit saved world
uses its saved tier and placement. Owned water resources are released on world
switch/reload; shared boat resources remain owned by AssetManager.

See [integration evidence](qa/fjordside-water-v01/report.md). Host frame readouts are
uncontrolled diagnostics; this change does not require another local timing campaign.
The owner will assess performance on the phone and review the integrated water/boat.

## Environment Lab compatibility fallback

The Lab's default/generated water remains its boona13 adapter. Compatibility
fallback uses the shared ReferenceWater wrapper and receives the current native
lighting and camera after they update. Day, Night and Low sun therefore apply
to its own sun, sky and gain, including while waves are paused. See the
[regression evidence](qa/environment-fallback-water/report.md).
