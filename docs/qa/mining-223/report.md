# Mining #223: rock mines, Wet Lowland and Bog Iron

## Delivered scope

The opt-in Mining implementation includes actual resident travel, finite extraction,
Miner aptitude/history, an integer clan Iron Ore specialist stock and saved work
state. Known rock outcrops can be developed for 20 Materials; natural extraction
uses the existing 50% prototype rate. Assignments work from both resident details
and the outcrop through real atomic session commands.

The supplied optimized mine is integrated with its rear in the hillside and a level
earthen forecourt. The same implementation now includes the owner's requested
Wet Lowland/Bog Iron extension. **One reachable source of either kind qualifies an
island; both are not required.** There is no forced ore near the player, new stock
category, refining stage, movement penalty or automatic CPU mining.

All twelve new island files have been regenerated and requalified under the
extended protocol. These are separate authoring exports, outside public/ and the
current shipping pool. New-campaign defaults await owner review.

## Versions and exact evidence

- Workspace: `D:/CodexSites/Pillagers/scratch/mining-223`.
- Branch `codex/mining-223`, base `4fcbf63ce0b14d227914d7a30c19139fe0baa12e` plus local feature changes.
- v4 protocol: `ae69b81b168d8425c36dd849bc47aa82447afb8294c80a3cbea39924a60e9b34`.
- Candidate runner: `6a5fd992c76dd368cbf64f7ce10b9b462ee4dae0592329553474679682d81243`.
- Route probe: `f9c2d3416631f77402d8ec76715d9d88c58348a5a77128d2b8ecf2b919ad91bf`.
- Coordinator: `2332f649a4bb106085c8d7e81028a869f9d5bf6d24c43a41b29fac0abbdb283b`.
- 174 actual transitive executable source files are frozen and hash-verified.
  Current generation/Core execution inputs still match the measurement exactly.
- Full rule/source/runner hashes, dirty-worktree evidence, Node version and asset
  identities are in the full manifest inside the ZIP. The runtime mine manifest
  separately records the exact source/model/texture identities.

The v3 rock-only measurement is retained as [historical report](rock-only-report-v3.md).
It tested 127 candidates: 35 invalid geography, 79 preparation failures, one rival
route failure, twelve qualified. v4 rechecks those same selected twelve from fresh
generation, with Wet Lowland/Bog Iron and the current physical Core; it does not
reuse their old mining or CPU trajectories.

Two initial v4 attempts reached the 120-second limit while other preparation and
tests were running. They remain recorded as resource-limited in `attempts/`.
Serial retries with the same source/protocol, 120-second limit and 768 MiB heap
both completed. No rules, seeds, outcomes or limits were changed to pass them.
The separate recovery-runner hash and both attempts are preserved. Final case
status is twelve qualified, zero technical failures, zero unresolved limited cases.

## Availability on current islands

Actual route checks include founding player/rival plots and campfires. Wetland
pocket count is geographical, not a count of iron-bearing deposits.

| Existing island | Reachable rock | Reachable Bog Iron | Wet pockets | Initial Iron Ore |
| --- | ---: | ---: | ---: | ---: |
| 18 | 4 | 0 | 4 | 292 |
| 7 | 4 | 0 | 0 | 284 |
| 15 | 4 | 0 | 4 | 302 |
| 79 | 2 | 0 | 4 | 118 |
| 88 | 4 | 0 | 1 | 278 |
| 101 | 4 | 1 | 3 | 382 |
| 112 | 4 | 0 | 2 | 273 |
| 168 | 4 | 0 | 0 | 285 |
| 195 | 4 | 0 | 2 | 273 |
| 227 | 4 | 0 | 0 | 244 |

[Raw current measurements](existing-islands-v2.json). All ten current islands retain
at least one reachable source. [All fourteen historical baked worlds](historical-islands-v2.json)
remain byte-identical in both canonical JSON and compressed transport after rebake.
Non-Mining saves and version-1 rock-only Mining proposals do not acquire new zones.

## Twelve newly exported islands

| Seed | Reachable rock | Reachable Bog Iron | Wet pockets | Actual extraction proof source | Iron Ore extracted |
| --- | ---: | ---: | ---: | --- | ---: |
| 296 | 4 | 1 | 3 | bog-iron | 1 |
| 299 | 3 | 0 | 4 | rock-outcrop | 2 |
| 306 | 4 | 0 | 4 | rock-outcrop | 1 |
| 327 | 1 | 0 | 2 | rock-outcrop | 2 |
| 329 | 2 | 0 | 3 | rock-outcrop | 1 |
| 341 | 4 | 0 | 2 | rock-outcrop | 2 |
| 351 | 4 | 0 | 4 | rock-outcrop | 1 |
| 352 | 4 | 0 | 0 | rock-outcrop | 2 |
| 360 | 2 | 0 | 0 | rock-outcrop | 2 |
| 361 | 4 | 0 | 3 | rock-outcrop | 1 |
| 369 | 4 | 0 | 0 | rock-outcrop | 1 |
| 380 | 4 | 0 | 1 | rock-outcrop | 1 |

Each case decoded the real pier, checked natural foundations and actual founders,
paid for real exploration, sighted the rival and returned home. The bounded QA
observer can choose genuine intermediate navigation points along the canonical
trail if one long A* exceeds its existing search limit; no gameplay navigation
budget or player controller was added.

A separate unchanged founding cohort paid 8 Food for a real scout, discovered an
accessible site, assigned a real Miner, traveled, extracted finite ore and verified
save/load. Bog Iron is preferred for this proof when genuinely available around
the founding exclusions; otherwise the rock source is tested. No free resources,
teleports, remote extraction or replayed cached CPU economy was used.

This cohort was originally selected by rock qualification. It is **not an unbiased
estimate of Bog Iron frequency** and contains no naturally rock-free island. An
explicit QA-only `maximumSites: 0` founding variant on physical island 101 separately
proves paid scouting, travel, actual Bog Iron extraction and save/load with no rocky
source. It changes no shipping rule or historical save.

[Completeness manifest](new-islands-manifest-v4.json) · [integrity checks](new-islands-integrity-v4.json)
· [ZIP identity](export-bundle-v4.json).

Bundle: `scratch/mining-223/mining-islands-12-wetland-v4.zip`, 31,951,154 bytes.
SHA-256: `1c40d177b54cb0d807ca7875b5b6c3bf9c0d9310114b80e4f77e748428d3428b`.
It includes twelve full compressed worlds/plans/ore proposals, twelve final results,
two preserved limited attempts, frozen sources and manifests. Reproduction uses
the exact base repository/public assets plus the frozen source overlay and lockfile;
the ZIP does not duplicate dependencies or original source models.

## Terrain and biological/economic boundaries

Wet Lowland indexes existing 4 m environment cells and drainage-valley corridors.
It adds no Biome enum, terrain height grid, hydrology simulation or RNG stream.
Candidate thresholds: 0.6–12 m above water, slope <=0.12, moisture >=0.60, mud >=0.22,
4–16 cells per pocket, at most four pockets at least 60 m apart, outside settlement
buffers. Small dark mud patches and sparse sedges appear only on discovered ground.
A deterministic subset can have up to two finite Bog Iron sites, with real route
and scenery checks. Not every mud cell contains iron. The natural collection rate
is the existing 50%; prototype reserve range is 32–96, derived from mud weight.
No rock entrance can be built in a bog. These are transparent QA coefficients,
not claims about geology, long-term affordability or an approved final balance.

Bog Iron produces exactly the same Iron Ore specialist stock. Exact source/site,
actor, quantity, reserve and canonical time are factual extraction events. Core
continues ordinary Food, work eligibility, household, weather and mortality rules.
Planning does not change world/CPU RNG or discovery; a site is assayed only when a
real Miner reaches it. Donor/raid/commerce systems are outside this change.

## Asset and performance evidence

The mine retains all 6,731 triangles, normals, positions, UVs and winding. Runtime
size: 1,451,832 bytes versus 23,927,404 source bytes. Decoded RGBA texture pixels:
6 MiB versus 96 MiB, about 8 versus 128 MiB including mipmaps. These are texture
estimates, not measured whole-device memory. Instances share geometry/textures;
instance-owned seasonal materials and forecourts are disposed correctly. Unknown
sites and bare outcrops do not trigger the authored-model download. Late decoding,
load failure and disposal do not resurrect old scenes or leak the shared template.
Original `Assets/Mining` content remains unchanged and excluded from publication.

Placement uses the actual doorway behind the rails, a level forecourt and a small
earthen ramp connecting natural ground. A bounded local orientation search embeds
the rear section without changing canonical terrain or navigation. Presentation
foot support keeps the Miner on the forecourt. Headless Blender previews inspect
actual terrain on 18 and 112. Live WebGL loading, Map and resident selection were
also exercised. The owner tested the mine placement on a physical device and accepted it; the final water/visibility follow-up still needs owner review.

Owner feedback replaced the earlier circular mud stamps with connected peat/moss
beds and shallow horizontal water clipped to natural low terrain. The approved
imagegen source is reduced to a 256-pixel WebP: 19,896 file bytes, 256 KiB decoded
pixels, about 341 KiB with mipmaps. The layer is bounded at 64 cells / 128 reed
instances, three draw calls and 12,288 triangles. Ripples use the existing active
clock and stop while paused. Discovery, fog and snow tint are reused; no canonical
terrain, hydrology, navigation, audio assets or character rigs change. Earlier
`browser-bog-proof.json` records the previous mud-stamp presentation and is retained
as historical evidence; it does not measure this new water/texture version.

The winter shaft glow includes a small emissive cylinder measured inside the
authored exterior lantern. Each developed mine adds 28 triangles and one local
light with no shadows; other seasons turn it off. A genuine winter fixture
advances the real developed campaign to Winter 805 tick 1.

Working miners are hidden inside developed rock mines, then become visible on
recall. Outdoor work at bare rock and Bog Iron remains visible. This changes
rendering only; Core serialization, travel and production remain exact. Hidden
occupants also lose their floating production indicator.

## Verification

- Earlier full suite before authored-model/lowland follow-up: 1,589 tests,
  1,579 passes, zero failures, ten existing optional original-source fixture skips.
- Extended affected suite: 87/87 passed, including Core/session, discovery/fog,
  terrain navigation, raw world save and generation, campaign replay and UI/lifecycle.
- The additional public v2 world-save/tamper test passed in the 3/3 ore-site suite;
  the explicit Bog-only physical proof also passed. No production validator was
  weakened to accept a prepared campaign world as a raw generator file.
- Twenty v2 cross-engine last-bit probes passed on all ten current islands.
  [Raw rounding results](cross-engine-rounding-v2.json).
- Latest presentation follow-up: 49/49 tests passed, including outdoor travel/work,
  developed-mine hiding, serialization parity, recall visibility, seasonal materials
  and the shared atmosphere owner. The earlier full-suite total is not a rerun of
  this final renderer-only change.
- Public assets with `--tracked` (632 files), TypeScript and the production build passed.
  Original source models are excluded; the existing Vite chunk-size advisory remains.
- Existing character/Lab validation passed (20 assets / 36 GLBs, 12 Golden
  Characters, 19 modules, Idle/Walk/Run + World); no rig is changed.
- Source formatting was checked manually; no formatter is configured in package
  scripts. Final whitespace/diff inspection is part of handoff.

No GitHub CI, merge or Sites release is claimed for this local feature diff.
Capacity/rarity, economics and physical mobile performance still need owner review
before normal campaign activation or replacing the shipping island pool.

## Reproduction and local review

```powershell
node --test tests/mining.test.mjs tests/mining-presentation.test.mjs tests/mining-assets.test.mjs tests/ore-sites.test.mjs
node scripts/qa/survey-mining-islands.mjs
node scripts/qa/check-mining-rounding.mjs
node scripts/qa/export-mining-islands.mjs D:/CodexSites/Pillagers/scratch/mining-223/scratch/mining-223/new-islands-v4
node scripts/qa/verify-mining-exports.mjs D:/CodexSites/Pillagers/scratch/mining-223/scratch/mining-223/new-islands-v4
node scripts/prepare-mining-assets.mjs D:/CodexSites/Pillagers/Assets/Mining
```

The exporter refuses changed sources/protocols. The explicit bounded recovery tool
is `scripts/qa/retry-mining-resource-limited.mjs`; it preserves prior attempts.
Review: http://192.168.68.115:5181/docs/qa/mining-223/review.html . Four genuine saves
cover scouted rock, a built authored mine funded by actual household production,
the same mine in winter, and scouted Bog Iron. Their context files retain real commands and payments.

## Owner camera-angle regression follow-up

The owner supplied a ten-second marsh recording. The pattern was visible at some
camera angles and covered by ordinary ground at others. Both the ground colour
masks and bog bed are transparent layers with depth writes disabled; native
camera-distance sorting could paint the full-island overlays after the local
peat. The fix orders peat after those colour masks and water after peat. Depth
testing remains enabled, so real terrain and opaque actors still occlude them.
It adds no draw calls, texture pixels, terrain displacement or Core changes.

The live review also exposed an existing `forest` shader failure when seasonal
copies retained an atmosphere compile hook and were decorated again. A new test
first failed on duplicate declarations (2 versus 1). Decoration now preserves the
current scene's uniforms while emitting the shared atmosphere code once. Seasonal
snow remains active and all 49 affected tests pass.

`browser-visual-followup-v2.json` retains the initial browser observations,
including the shader errors; it is not a clean final run. The winter review proved
Daugirdas loaded as Working with `visible: false` / `insideMine: true`, and the
real Return home command made him visible immediately at the same Core tick.
He returned home through normal ticks. The fresh post-fix browser check is recorded
separately rather than erasing the failing evidence.

The v4 exports and their frozen source snapshots remain intact. The final integrity
check records exactly one changed measurement input: `src/world/DirectionalAtmosphere.ts`.
This is the shader-decoration fix described above, not a Core/rule/geography change.
The twelve campaigns were measured with the frozen v4 renderer source, not silently
rerun or relabelled as the final presentation revision. All other 173 recorded
execution-source hashes still match. Raw follow-up verification is retained in
`scratch/mining-223/model/integrity-visuals-v3.log`.

### Final marsh browser check

The production build on LAN was reloaded into the same genuine Bog Iron fixture.
Three unobstructed views, including two camera orbits and a closer zoom, retained
the approved peat pattern. The shallow water also remained above its bed. The Core
clock stayed paused at Summer 800 tick 679 in all three observations. Observed
budget: 24 known wet cells, 30 reed instances, two water patches, 1,416 triangles,
three draw calls, one 256-pixel texture. No console errors were recorded after
loading this build. This is a desktop Chromium check in a narrow viewport, not a
claim of a new physical iPhone performance test.

Evidence: [angle A](browser-marsh-angle-a-v3.jpg),
[angle B](browser-marsh-angle-b-v3.jpg), [closer angle C](browser-marsh-angle-c-v3.jpg),
[raw browser observations](browser-marsh-angles-v3.json),
[presentation source/test hashes](presentation-followup-v3.json).

The final build also reloaded the genuine winter mine fixture: one ready developed
mine, one winter light, zero shadow lights, Daugirdas hidden inside while Working,
Winter 805 tick 1, and no new console errors. See
[browser winter reload](browser-winter-load-v3.json). The earlier real recall
sequence and screenshots remain under `browser-winter-mine-*-v2.jpg`; the occupant
code is identical in v3. No merge, PR, public publication or shipping-default
activation was performed by this follow-up.

## Flat marsh water and mouse selection follow-up

Owner feedback requested water above the flat bed, not only the low edge. The
previous level (lowest sample + 18 cm) left only 20 of 396 flat render-vertex
samples visibly submerged in the genuine scouted island-101 fixture. The new
presentation uses one horizontal plane 12 cm above the upper quartile of flat
interior heights. Raised banks remain dry; the peat pattern stays visible below
water. This is a renderer-only level, with no canonical height, navigation,
reserve, command, weather, save or island-generation changes.

The public presentation regression first failed on 20/396 and now passes its
minimum 70% coverage requirement, with dry banks and exact Core serialization
parity. This is a render-sample coverage check, not a hydrological measurement.
The existing 256-pixel texture, three draw calls and mesh budgets are unchanged.
Two browser angles confirmed the wider water surface and the pattern beneath it.
[First angle](browser-water-flat-a-v4.jpg), [second angle](browser-water-flat-b-v4.jpg),
[raw browser state](browser-water-flat-v4.json). These images precede the cursor
follow-up; their water implementation is identical in the combined build.

Mouse hover now uses the same real, discovery-aware mouse hit queries as clicking:
entities, known mines and known place markers. Selectable targets show `pointer`,
empty terrain retains `grab`, and dragging shows `grabbing`. Destination mode
retains its crosshair. Hover queries are coalesced at 120 ms intervals rather
than run for every mouse event/frame, including refresh for stationary pointers
when actors or the camera move. Touch, canvas leave, disabled input, blur and
scene disposal clear the owned cursor override. No hover action selects or
changes the campaign.

Validation: 15/15 Mining/assets/water tests and 45/45 camera/input/touch/cinematic
tests passed; TypeScript, 632 tracked public assets and the production build
passed. Source formatting and diff whitespace were checked manually; no project
formatter is configured. Earlier full-suite totals remain historical.

The desktop browser check found one additional cursor edge case: a prevented
right-click context menu could leave native CSS `:active` set even after camera
rotation ended. The Fjord canvas now explicitly defaults to `grab`; actual drag
feedback remains owned by the camera and its inline `grabbing` state. The scoped
rule leaves other labs unchanged and retains the more specific expedition
crosshair. The first browser observations are retained as a failing case rather
than claiming the original reset was correct.

The final combined production build is `dist-water-hover-v6`. The twelve frozen
island exports remain historical and intact; the only differing frozen input is
still the earlier `DirectionalAtmosphere.ts` presentation fix. Neither water
coverage nor hover changes Core, rules, islands, saved campaigns or resource
accounting. No push, PR, merge or Sites release was performed.

Final v6 browser verification: empty ground returned computed cursor `grab`;
a visible resident, a household tent and the campfire each returned `pointer`.
An actual left click on that tent opened Mingirdas's Tent card. The clock stayed
paused at Summer 804 tick 630, and no new console errors were observed. Unit tests
also covered actual drag, touch and cursor cleanup. See
[raw cursor observations](browser-hover-cursor-v6.json),
[actual tent selection](browser-hover-home-selection-v6.jpg) and
[final source hashes](water-hover-followup-v6.json). This was desktop Chromium
verification, not a new physical mobile device test.

## Cattails and taller procedural marsh grass

Owner requested the selected Cattail combined with higher procedural grass. The
original is Poly Pizza Cattail `9vCk81sIPve`, by Poly by Google, CC-BY 3.0. The
actual downloaded GLB is pinned by SHA-256 in the preparation script and manifest.
All 473 triangles remain; normalization grounds its origin and gives unit height.
Texture preparation reduces the original 512-pixel colour map to 128-pixel WebP.
The runtime is 41,916 bytes with 64 KiB decoded texture pixels (about 85 KiB with
mipmaps), shared by all instances. Credits and the license URL are published in
`game-assets/wetlands/ATTRIBUTION.txt`, linked from the Game menu. The MIT notice
for boona13 grass is included there as well. No paid generation was used.

The actual authoring source remains at
`D:/CodexSites/Pillagers/Assets/Wetlands/cattail-poly-pizza-original.glb` and is
excluded from runtime publication. Reproduce with:

```powershell
node scripts/prepare-cattail-assets.mjs D:/CodexSites/Pillagers/Assets/Wetlands/cattail-poly-pizza-original.glb
node --test tests/mining-assets.test.mjs tests/mining-presentation.test.mjs
```

The former cylinder placeholders are replaced by actual Cattails and the existing
boona13 GrassField. Regular procedural configuration remains 0.4 m; marsh blades
are 0.90–1.15 m, in broader tufts, with Cattails about 1.4–1.85 m tall. Each visible
canonical wet cell has an independent presentation-only random stream. Roots
follow actual peat; shallow water and banks contain irregular clumps with gaps.
No simulation RNG, reserve, movement, discovery, production or save state changes.
Vegetation never intercepts clicks. The layer caps 256 grass tufts and 32 Cattails,
at most four total colour draw calls and 30,000 triangles, with one small model
texture and the existing peat image. Optional model failure preserves grass.

The ordinary grass already present in Fjord Play is static scenery. The old
procedural adapter existed in the project, but was not driving those clumps.
This new marsh adapter really uses its wind shader. It advances from existing
activeTime, freezes when paused, and follows actual scene sunlight/fog/snow.
Wind strength/gust and tuft width were increased after owner reported not seeing
wind, and the grass culling bounds include its bent tips. No vendor shader or
regular grass settings were modified.

Validation before final visual tuning: 39/39 affected asset, lifecycle, discovery,
water, sunlight, dressing and season tests passed. After stronger wind, 22/22
asset/presentation/first-steps tests passed; after the final tuft-width adjustment,
the five affected Cattail/wetland tests passed again. TypeScript, 635 tracked public
assets and production builds passed. Formatting is reviewed manually; no formatter
is configured. Physical device performance is still an owner playtest, not proven
by these counts. No push, PR, merge or Sites release was performed.

### Live vegetation and wind check

The final v8 Chromium review loaded the real scouted island-101 campaign. The
actual GLB decoded successfully and all shaders compiled without new errors.
Observed: 24 discovered wet cells, 60 procedural tufts, 20 Cattail instances,
11,596 total layer triangles, four colour draw calls, and 64 KiB extra decoded
model texture. The deposit panel still opened through the decorative plants.
Game menu exposes the Nature asset credits link; the published notice returned
HTTP 200.

Wind was also checked while actually playing, rather than inferred only from a
shader uniform. The blades visibly bent between saved browser frames. The wind
clock progressed from 0 to about 20.688 and 60.780 active seconds. After Pause it
held exactly 61.2585 seconds across the later observation, with Core at Winter
800 tick 774 (Autumn on the presentation calendar). This QA campaign advanced
through real ticks during the check; no stocks or time were injected. The review
button still opens the original paused scouted fixture.

Evidence: [paused plant composition](browser-marsh-plants-paused-v8.jpg),
[first running frame](browser-marsh-wind-a-v8.jpg),
[second running frame](browser-marsh-wind-b-v8.jpg),
[raw browser observations](browser-wetland-vegetation-v8.json),
[exact implementation and asset hashes](wetland-vegetation-v8.json).
The ordinary static Fjord grass was not silently relabelled as animated.

## Release approval (2026-10-28)

The owner completed UAT and approved merging and public Sites publication. New
physical campaigns now prepare the same reviewed v2 Mining/Wet Lowland proposal
before discovery, without a QA query flag. Historical saves and same-founder
replays retain their saved geography. The current ten-island pool stays intact;
the twelve v4 exports remain separate research deliverables. Earlier measurements
and frozen protocol hashes above describe their original runs unchanged.
