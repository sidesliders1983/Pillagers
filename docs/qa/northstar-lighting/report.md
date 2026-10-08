# Low northern sun and native shadows — first stage

Owner-requested #59 lighting study, 2026-10-08. Parent main: 986154c73ab4da22302ad295bd9de31020bc6b97. Runtime hashes, camera, tier, DPR and all native light/shadow settings accompany each capture in baseline.json, sun-comparison.json and refined-sun.json. The original reference is docs/references/environment/REF-B.png, unchanged.

The baseline was captured before any runtime edits. The first sweep is 10°, 20°, 30° with azimuth −57.3° (atan2(x,z), +Z=0°), direct intensity 2.8 / #ffecd6, hemisphere .65 / sky #bfd4ee / ground #716c65. ACESFilmic and exposure 1.05 are unchanged. The original day is 55.3°, direct 1.55 and hemisphere 2.45. Intensities of different light types are not a measured lighting ratio.

The sweep shows coherent long building/tree shadows instead of the pale baseline's faint shadows, and markedly stronger roof/wall/facet separation. Ten degrees makes roof/wall readability poorest and shadows dominate the clearing. At the original back-light azimuth, even twenty degrees leaves several visible walls dark. These are diagnostic alternatives, not accepted defaults.

A separately captured refinement turns the source toward the visible house fronts: elevation 20°, azimuth +135°. Sky fill .65 versus 1.0 is isolated with direct intensity and exposure fixed. Fill 1.0 retains more shaded-wall detail; this is the preferred review candidate, not owner approval. It still has overly vivid undergrowth, a pale empty background and an open village composition. These are unresolved source/composition gaps, not grounds for substituting scenery in this lighting change.

Native DirectionalLight shadow bounds include the visible receiver/caster world bounds transformed into the light camera, with 3m padding and depth fit. Target is the actual bounds centre, source is 200m away. The map is 2048px Standard / 1024px Low; PCF, bias −.00005, normalBias .02. Baseline/night restore the original fixed ±50 bounds, target origin, bias 0 and normalBias .045. PCF radius is inherited; VSM blurSamples is not an active PCF blur tuning. No GLSL change. The standalone Meshy person gains cast/receive only in the pilot; baseline remains the recorded original.

Actual authored material inventories and cast/receive flags are recorded in refined-sun.json. Native ground has albedo/normal/roughness maps (Low omits normal), KayKit atlas has roughness .6, source EZ-Tree bark has normal/roughness textures, pine leaves retain source material. Meshy materials retain authored map stacks: factor metalness=1 with metallic/roughness maps is not evidence of uniformly metallic wood. No roughness or palette edit is used to fake highlights. Material-specific highlight/contact close inspection and orbit checks follow in the functional evidence stage.

The upstream boona13 shader expects surface-to-light direction. The adapter now supplies light.position − light.target.position. Previously an absolute position happened to work with target at origin. Upstream GLSL is unchanged; sky-gradient water is not a reflection of buildings or trees.

Functional: browser tracer failed for missing low-sun control, then passed selection of 20°, Night and Current day. Build passes. Sun evidence is saved before adding the separately labelled native HDR stage. Screenshot-window frame estimates are NOT performance benchmarks. Desktop repeated cost/lifecycle evidence and full checks follow. Physical mobile and GPU VRAM remain untested. #60 and owner visual acceptance remain pending.

## Native HDR stage and close inspection

Sun/shadow evidence was committed separately at 96e9bbd before the HDR implementation. The named publisher HDR was then downloaded and verified against the publisher MD5: 1,198,770 bytes, SHA-256 162e8a4a42db3b26c8a5e4558db5355df156212a55127577725692f683106fa4. Source/license/author records live at public/lighting/lonely-road/source-lock.json and NOTICE.txt. This is the existing Poly Haven CC0 Lonely Road Afternoon Pure Sky, not a new generated image.

Native Three r180 HDRLoader replaces the now-deprecated RGBELoader name from the existing dgreenheck demo. PMREMGenerator.fromEquirectangular and Scene.environment perform material lighting; Scene.background remains the current Color. No demo code/dependencies are imported. Intensity is 0.15. The measured HDR peak pixel (614,230) is rotated to the active light direction using native Scene.environmentRotation; exact XYZ angles accompany captures. Original HDR texture and temporary PMREM generator are disposed after prefilter; one reusable output target stays cached for switches and is disposed on pagehide. Late async loading after pagehide disposes the source without applying it. Daylight HDR is suppressed at night, with checkbox preference retained for return to day.

The 25 additional captures in final-observations.json isolate HDR OFF/ON on both existing tree sets, village/shore, Standard/Low. Source materials and background are identical. HDR brightens roofs/walls and greenery, but makes the bright KayKit undergrowth more conspicuous and weakens visible shade separation. **Agent result: HDR is a working comparison option, not the preferred visual candidate.** Low sun + sky fill 1.0 + exposure 1.05 + HDR OFF is preferred for owner review. Nothing is promoted to production.

Exposure .85/1.05/1.25 was captured separately at identical light/material/camera settings. Raising it brightens everything; it does not repair the remaining empty backdrop or overly vivid undergrowth. Exposure 1.05 is retained. Close house/person images show dry wood/soil rather than globally lowered roughness. Highlights remain restrained. Native directional shadows are visible under roofs and across the ground in the orbit image. Small person-foot contact is less legible at normal distance and is not marked as fully resolved. Coarse ground slope/triangle boundaries become more obvious at low sun; no terrain topology or placement was altered. Low's 1024px map produces visibly coarser shadow edges than Standard.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Native sun direction, elevation and long cast shadows | Pass for bounded pilot | 10/20/30°, matched views; 20° front refinement; world-space caster/receiver fit |
| Restrained warm lit / cooler shaded planes | Improved; owner review pending | Source maps kept, sky fill sweep, HDR separate; not merely orange global tint |
| Roof, rock, tree and person contact | Partial | Long shadows/facets visible; tiny foot/base contact and source ground facets remain limitations |
| Orbit/pan/zoom | Observed, no visible frustum cut-off in saved views | Camera positions are recorded; not exhaustive temporal-flicker proof |
| Night / day / HDR transitions | Pass | Public browser test; ten switches; 39 geometries and 73 textures at every HDR-on endpoint |
| Source compliance | Pass | Native APIs; pinned water GLSL unchanged; actual publisher HDR/hash/CC0; source models/maps unchanged |
| Full Northstar composition / reflections / #60 | Still open | No cliffs, compact village re-layout, snow, new models or geometry-reflection implementation |
| Physical mobile / VRAM | Untested | Desktop Intel HD 630 / Edge only |

The original capture metrics reset after the native shadow pass and therefore count only the main pass. The subsequent Lab counter explicitly includes shadow passes (info.autoReset=false with per-frame reset). New cost measurements record that distinction; do not compare the old and new call columns as though their semantics matched. Individual screenshot-window timing estimates are incidental diagnostics, not the repeated benchmark.

## Local validation before repeated profiling

Build passes (existing chunk-size warning unchanged). Full CI-equivalent character validation with explicit Lab previews passes: 16 assets / 32 GLBs, 12 Golden Characters, 15 equipped modules, Idle/Walk/Run + World. Full suite: 419 tests, 418 pass, 0 fail, 1 pre-existing opt-in frozen-GLB evidence skip. The two public browser tracers pass on the final runtime; no page/console errors. All 57 capture hashes and the original HDR SHA-256 were independently checked. The standard native directional/hemisphere lighting controls remain available; no gameplay rules or production palette defaults changed.

Live review: http://192.168.68.104:5181/docs/qa/northstar-lighting/review.html. In the Lab choose **Low sun · 20° front light**, **Low-sun sky fill 1.0**, **Low-sun exposure 1.05**, **HDR OFF** for the preferred review candidate. Default entry remains Current day. Source fixtures in saved evidence include their parent commit and runtime-file hashes; screenshot metadata predates the later counter-only change that includes shadow calls. Replay scripts default to scratch/northstar-lighting/replay so historical evidence is not overwritten.
