# Fjordside integration v0.2 — production review

Captured 2026-10-09 from a frozen production build. This is the staged #60 integration and a water/wind visibility pass. Reference remains the ordinary Fjordside default. Generated is available only through `/?worldDev=1` → Development tools → Debug → Generate World. Northstar approval remains a separate owner decision.

## Evidence and fixtures

[Review the 36 images](review.html), [raw captures and timings](results.json), [source/build hashes](provenance.json), [motion comparison](motion.json), and [integration contract](../../FJORDSIDE-INTEGRATION.md).

Reference is the original production World with seven buildings; Generated seeds 17 and 91 contain the six original authored Meshy parcels and twenty original props. Every image has the same ten resident identities, ages, and source assets. Residents are paused on safe terrain at their canonical surface height. Their early walking positions and elapsed clock phase vary slightly across reloads; the comparison does not claim identical animation frames.

All images use a 1400×900 viewport. Village and Shore use the same camera offset relative to each settlement centre. High overlook uses the same absolute pose. Each world is captured in Standard/Low and native Day/Night. Exact camera, source, quality, pixel ratio and population are recorded for each image. Reference is not the one-resident Environment Lab fixture. Lighting presets and asset palettes are the existing production defaults; HDR and low-sun experiments were not promoted.

## Performance — diagnostic on this machine

Native headless Edge 154 reports Intel HD Graphics 630 through ANGLE Direct3D11. Each case has three four-second requestAnimationFrame runs at Day/High overlook with ten active residents, water and wind enabled. Measurements were serial, after settling, against a frozen build; browser automation and other applications can still influence scheduling. The exported `runs` arrays contain every sampled interval, including spikes. Pooling those intervals gives the following values. These are display scheduling intervals, not isolated GPU timings or a demonstrated FPS gain from the effect tuning.

| World | Tier | Frames | Median ms | P95 ms | Max ms | Main calls | Main triangles |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| reference | standard | 431 | 35.0 | 36.3 | 162.0 | 49 | 243,339 |
| reference | low | 427 | 35.6 | 38.2 | 72.0 | 49 | 243,339 |
| 17 | standard | 162 | 72.0 | 108.0 | 126.0 | 61 | 918,055 |
| 17 | low | 166 | 72.0 | 90.1 | 108.1 | 61 | 869,455 |
| 91 | standard | 146 | 87.8 | 125.5 | 144.0 | 62 | 1,231,640 |
| 91 | low | 154 | 72.0 | 107.7 | 144.0 | 62 | 1,183,040 |

Calls/triangles come from the main renderer pass and omit shadow pass calls. Geometries/textures and browser details are retained in the raw record. Both tiers ran at DPR 1 on this viewport; Standard permits up to 1.5 elsewhere, Low caps at 1 and uses 1024 shadows. Low retains the same source nature geometry, so it is not a complete LOD solution. The generated scenes remain much heavier than Reference on this old laptop. No hard few-millisecond gate is used and no hardware-independent performance claim is made.

## Water and wind visibility

The isolated Environment Lab motion fixture compares two screenshots two seconds apart, with the same camera and visibility controls. Baseline pine crowns had zero changed channels; the sourced EZ-Tree leaf adapter now changes 252,518 channels by more than three levels (mean absolute channel delta 2.684). Water increased from 31,964 to 110,416 such channels (mean delta 0.156 → 0.470). These are image differences, not wind velocities. Clock phase differs between the baseline and final runs. Both paused pairs have zero channel difference. Before images and final pairs are included in this folder.

Water uses the pinned boona13 source; its water/noise/foam GLSL remains intact. Published controls make ripples and highlights easier to see. Native Three.js fog chunks join distant water to the existing atmosphere; the isolated fog-on/off water test went red before the bridge and green afterward. Day/night colours reuse two objects rather than allocate them each frame. EZ-Tree uses its pinned original leaf noise/sway callback, with an instanceMatrix compatibility insertion and tuned published uniforms. Trunks/roots remain static, source bounds remain safe, and upstream MIT/noise notices are included. Leaf shadow silhouettes remain static. Neither change introduces house/tree reflections or physical wave displacement.

## Northstar assessment

| Area | Observation | Remaining work |
| --- | --- | --- |
| Ground | Grass, sand and rock layers are visibly structured. | Further art direction at close camera distances. |
| Crowns | Detailed EZ-Tree pines replace the simple conifer silhouettes, at varied source role heights. | Broadleaf forms and palette cohesion. |
| Palette | Original houses remain warm; native day/night works. | KayKit bushes and broadleaf greens are still too vivid beside the houses. |
| Composition | Authored buildings, coast and procedural backdrop share one geography. | Compact framing, cliff arrangement and distant silhouettes need owner review. |
| Lighting | Native production Day/Night and an actual anchored hearth work. | The warm evening Northstar mood is not yet demonstrated; HDR stays a separate experiment. |
| Water | Animated highlights are more readable; far water follows atmosphere. | Actual building/tree reflection and physical wave displacement remain absent. |
| Residents/assets | Existing source geometry, animations, selection and annual aging remain. | No new gameplay or clothing scope is included. |

The final images show usable staged integration, not full visual parity with the mock-ups. Generated does not become the default through this PR. Reference remains the rollback path.

## Validation

- Full local suite: 429 tests, 428 passed, one existing skip, zero failures. After the final navigation/fog repairs, the focused world generation, lighting, touch and annual-cycle suite passed all 22 tests.
- Production build passed. Character validation passed 16 assets/32 GLBs, twelve golden characters and fifteen equipped modules, including Idle/Walk/Run and World.
- Public factory browser contract passed seeds 17 and 91: six parcels, twenty actual-bounds props, dry roots, canonical triangle raycast heights, clear household/harbor routes, deterministic stored placement and save/load bytes.
- Real Fjordside browser passed explicit generation, separate save/load/export, invalid-import preservation, Reference fallback, safe resident heights and exact pause. The actual 60-second annual boundary aged residents, Continue resumed, selection opened the real profile, seasons/day/night worked, and saved geography stayed unchanged.
- Isolated effect checks passed motion/pause and native water fog. Final capture passed all 36 scenes with equal population and no browser errors.
- GPU runs were serial: an earlier concurrent browser run overloaded this laptop and timed out; its unchanged assertions passed on the serial rerun. That timeout is not omitted from this report.
- No project formatter is configured. Formatting was inspected manually and git diff --check passes for handwritten files; the copied upstream leaf callback retains five original trailing-space lines. Remote push and PR checks must both pass on the current commit before the PR is marked ready.

## Review and rollback

Open the development URL, enter Debug, choose a seed and Generate World. Toggle water/wind and Pause, try Day/Night and camera presets, export, reload and load the same geography. Ordinary URLs always open Reference. Use Reference fallback in Debug to clear the active generated preview while retaining an explicit local save. These geography saves do not change Simulation Core campaign identity, economy, expeditions, or the existing Fjordside character/clock initialization on reload.
