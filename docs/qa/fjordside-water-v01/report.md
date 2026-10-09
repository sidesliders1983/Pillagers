# Fjordside ReferenceWater and boat integration — QA

Issue #75, based on merged #79 at b6f4f57da1db522127ba881ae80bf5ad28b50910.
Captured 9 October 2026 from a frozen production build on port 5188. The existing
Water Lab component was approved by the owner; integrated visual and phone
performance review remain pending.

[Review images](review.html) · [Capture settings](results.json) ·
[Source provenance](provenance.json) · [Touch checks](touch.json) ·
[Boat/pier/terrain samples](boat-clearance.json)

## Result and scope

Both generated Fjordside and the original Reference scene use the selected
ReferenceWater. The old production surfaces are replaced, with one opaque water
draw and no reflection render target. Amplitude 0.18 m, speed 1, detail 0.65 and
#073650 / #078d92 colours retain the approved defaults. The 80 m dense grid follows
the existing boat mooring; the 2,000 m sparse skirt covers the horizon. World water
levels, terrain, navigation, population, parcels and authored attachments persist.

The actual original AssetManager faering follows four rendered-triangle height
queries. Its waterline is 0.24 m above the grounded keel; supports span 0.76×2.50 m
inside the measured 1.324×1.181×4.954 m hull. Horizontal mooring and heading remain
fixed. This is kinematic heave/pitch/roll, without drift, forces, sailing, wakes or
collision response. Missing water raises an error while retaining the last finite
pose. Shared boat geometry is not disposed by the world.

Native fog, sun/moon direction and colour, sky and ambient gain adapt the selected
component to existing production lighting. Exposure and the source wave/detail
shader are unchanged. Day glints are strong under the native world sun; the images
make that integrated appearance reviewable without an unapproved retuning.

There are no actual house/tree/boat reflections, seabed refraction, measured depth
mask or shoreline foam. Turquoise tint is angle-based. Environment Lab's existing
boona13 water and historical source/licence files are retained.

## Tests and evidence

The agreed seams are the public World factory/save contract and actual Fjordside
browser controls. RED preceded GREEN for replacing the water, moving the real
boat, and live quality changes. Native touch testing then exposed a close-up zoom
floor that made pinch-out jump farther away; that check failed before the camera
fix and passes afterward. Home retains the ordinary RTS zoom floor.

- 27 existing water, buoyancy, lighting, time, touch and annual-cycle tests pass,
  without failures or skips. CPU height queries are independently compared against
  raycast triangles across all water tiers and the skirt.
- Actual factory checks pass for Reference, seed 17 and seed 91: approved surface,
  finite changing boat pose, repeated-time determinism, fixed mooring, held pause,
  live Standard/Low quality, geography/save preservation, invalid-support rejection,
  and owned-water/shared-boat resource lifecycle.
- Production browser checks pass with 44 WebP captures, no page errors: three
  worlds × two water tiers × seven views, plus portrait and landscape mobile layout.
  Views include boat at 0/2.5/8.1 seconds, low-angle, shore, far overview and night.
  Metadata records camera, lighting, water clock/supports/pose, seed, DPR and costs.
- Pause/resume, deterministic effects scrub, live quality and unchanged seed pass.
  Ordinary startup creates a fresh generated world; explicit developer save/load
  preserves its blueprint. The prior startup/save/load/pause browser checks pass.
- Native CDP touch on desktop Edge passes for tap controls, live quality, rotation
  and pinch in a 390×844 viewport. A spread moves the close-up camera closer while
  the paused water/boat remain unchanged. Portrait/landscape have no horizontal
  page overflow. This is emulation, not physical phone performance evidence.
- Character validation passes: 16 assets / 32 GLBs, 12 goldens, 15 modules, and
  Idle/Walk/Run plus world fixtures. Production TypeScript/Vite build passes.

### Boat clearance

The 36 audit records cover Reference/17/91 and Standard/Low, including the old
baseline, three specified times, and sampled minimum/maximum heave found over
0–16 seconds at 0.25-second intervals. No boat/pier triangle edge crossings were
found. Hull vertices retain positive canonical terrain clearance; the lowest
sample is 0.174994794 m. These are bounded geometry samples, not a swept collision
proof, exhaustive coplanar contact test or collision solver. Images accompany the
numeric checks so the owner can assess apparent waterline/freeboard and contact.

## Render costs

Water alone: Standard/Medium has 8,192 triangles and two normal samples; Low has
2,048 triangles and two samples. Both have one draw, one geometry/material and one
128×128 RGBA8 normal texture. Full mip storage is estimated at 87,380 bytes, not
measured VRAM. No reflection target is allocated.

Visible main-pass overview readouts follow. They include ten present residents
and the whole scene, exclude additional shadow passes, and are not water-only or
complete GPU memory figures.

| World / water tier | Main draws | Main triangles | Renderer geometries | Renderer textures |
| --- | ---: | ---: | ---: | ---: |
| reference-standard | 48 | 251,419 | 29 | 38 |
| reference-low | 48 | 245,275 | 30 | 38 |
| 17-standard | 61 | 861,447 | 36 | 58 |
| 17-low | 61 | 855,303 | 36 | 58 |
| 91-standard | 62 | 1,175,032 | 36 | 58 |
| 91-low | 62 | 1,168,888 | 36 | 58 |

Generated ground maps were initially loaded at Standard for both captures; live
quality changes update water, DPR cap and shadow budget without reloading ground
maps. Ground tier is recorded independently. A reload uses the saved tier.

No new controlled local timing campaign was run. Capture frame readouts are host
diagnostics on an old laptop, with paused simulation; they do not prove animated
performance or phone frame rates. The owner will assess the phone. The historical
#60 report retains its raw measurements and now has an erratum identifying its
paused render cadence; it must not be read as an active-motion benchmark.

## Reproduction

Run pnpm build and serve its output with Vite preview. The committed QA scripts
accept QA_ORIGIN and QA_OUTPUT (see each script). They require the original ignored local boat/scenery assets and
a Playwright installation. GPU browser scripts should run sequentially.

Open /?worldDev=1 → Development tools → Debug. Choose Boat close-up or Water low
angle, then set Review effects time and pause. Switch Standard/Low without losing
the clock. Resume to inspect motion. /?worldDev=1&world=reference explicitly opens
the original scene in a fresh session. The current frozen LAN preview is
http://192.168.68.104:5188/; ordinary loads intentionally choose a new seed.

Source raw and LF-normalized SHA256 hashes and the frozen production entry hashes
are recorded in provenance.json. The licensed original boat is identified by hash
and remains excluded from the commit. Historical Water Lab and buoyancy reports
are preserved with the approved component baseline.
