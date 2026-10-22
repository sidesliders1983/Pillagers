# Northern Seasonal Light — implementation and review evidence

Baseline: main `d42b878`. The owner approved the small profile/state contract on
22 October 2026. Default visual rollout has **not** been approved.

## Delivered

- `/fjord-play?lighting=northern-v1` evaluates the approved annual elevation
  curve using canonical calendar progress. The normal URL retains its baseline.
  No new saved fields, daily clock, Core events or gameplay modifiers exist.
- `SeasonalLightState` freezes normalized world-space surface-to-sun direction,
  solar elevation/color/actual strength, separate ambient sky/ground fill and
  darkness. `WorldLighting` publishes it; camera-dependent shadow fitting does
  not generate it. State objects are reused between canonical changes.
- Existing seasonal palettes/weather compose first. Snow/thaw stays on
  `visualProgress`. Dark midwinter uses the existing cool night colors and a
  minimum hemisphere strength of .6, with no compensating exposure animation.
  That floor is a review candidate, not a physical-screen readability claim.
- The existing directional source, hemisphere, native shadow owner and map
  settings remain. Annual darkness does not select the developer Moonlight map
  resolution. Native developer day/night presets still reset the opt-in state.
- Lit/extinguished fire remains authoritative even with particle VFX off. Fire
  material flicker uses the same paused effect time as the point-light accent.
- The existing water adapter reads the shared solar vector. Its legacy sun color
  is attenuated by `min(1, solarStrength)`, so a below-horizon sun cannot remain
  bright. Full direct/ambient separation, shadow reception and atmospheric glow
  remain #237 work; no water shader was rewritten.

## Fixed real-scene review

Open `/scripts/qa/northern-light-236.html` on the separate port 5227. Select one
of the two historical production fixtures (18/7), a phase, Low/Standard and
normal/permitted low camera. **Prepare review save** explicitly prepares this
origin's QA state. **Baseline** and **Northern light** restore the exact same
save and camera in the real `/fjord-play` iframe.

The review settlement is created with normal Core commands, 500 Food/100
Materials for a stable supplied comparison, and two built houses. This changes
only the QA fixture, not game balance. The permitted low camera is about 26.4°,
above the existing .45-radian minimum. No procedural asset substitutes are used.

`node scripts/check-northern-light-236.mjs` generated **14 fixed saves**, covering
midwinter, returning light under held snow, early/late spring, high summer,
autumn twilight and the year boundary for both islands. It writes them under
`output/northern-light-236/fixtures`; their archived copies are in `fixtures/`
beside this report (about 1.1 MB total). Their hashes and canonical phase metadata
are in [cpu-report.json](cpu-report.json). The launcher fetches these saves and
changes only their presentation metadata, without generating a second world in
the parent review page. It stages the active save through the existing
sessionStorage entry contract before either comparison. They are generated
review artifacts, not duplicated source assets.

For a full-year video choose Year boundary, restore Northern light, start the
canvas recorder, then press the game's Play control. The existing one-minute
annual pacing drives the entire cycle. Stop after it crosses the next year
boundary. Recording and bounded telemetry observe the real scene; neither
creates a second presentation/simulation timer. Export measurements to retain
actual frame CPU samples, light state, camera, shadow coverage, render calls,
geometry and texture counts. Capture the surrounding HTML UI separately when
checking darkness readability.

## Automated validation and proportional cost

42 focused lighting/profile, native preset, fog, shadow, water, fire and review-workflow checks
pass, with no skips. They cover:

- Continuity across phases/year boundaries, no compulsory summer night, and
  light returning while the snow palette is held.
- Immutable normalized sun state, camera/quality independence, finite moving
  shadow coverage, one retained directional source/map, and cached unchanged
  frames at different frame-time inputs.
- Actual legacy water uniforms using the shared vector and a zero solar color
  in midwinter, without replacing water geometry/materials.
- Paused fire accents and authoritative extinguishing.
- Byte-identical canonical saves/events/RNG, physical discovery, paid expedition
  supplies, movement and return results with/without presentation, including
  save reconstruction and time-jump reanchoring.
- All fourteen archived phase saves match their receipt hashes and pass Core
  reconstruction. The actual review button handlers restore identical Core data
  through the active-session storage lane; presentation choices remain separate.

Production public-asset validation, TypeScript and Vite build pass. The existing
Three.js large-chunk warning remains. The separate QA sources pass strict
TypeScript. No formatter is configured; source formatting and `git diff --check`
are reviewed manually.

The recorded Windows/Node CPU microbenchmark compares cached
`WorldLighting.update` calls at the same fourteen phase/weather fixtures using
a mock renderer. Median measured incremental CPU cost is about **0.00014 ms**,
and the maximum fixture difference is **0.00121 ms**. These tiny differences are
near measurement noise: this is not a browser frame-time or GPU benchmark and
does not establish a device performance guarantee. Resource identity/source
counts are checked; actual GPU allocations are not measured by the mock.

## Pending acceptance evidence

No controllable browser is available in this session. Opening the Codex preview
is queued, and computer-use reports both no available browser and unavailable
in-app browser creation. HTTP 200 and transformed-source checks verify serving,
not WebGL visuals or input behavior.

**Matched screenshots, the actual full-year video, real renderer cost/resource
captures, darkest-view UI/selection readability, and physical iPhone/iPad
evidence are still pending.** The launcher provides the fixed scenarios and
recording/export workflow; it is not a substitute for those artifacts. Device
acceptance remains under #151. Do not activate this profile by default, close
#236 as fully accepted, or merge automatically from these CPU-only results.

## Follow-up: interpolate the accepted palette between clock batches

The owner's 22 October recording (`ScreenRecording_10-22-2026 13-13-07_1.mov`)
accepts the transition/palette but shows distracting stepped updates. Frames
extracted from that supplied recording were inspected; they are evidence of the
previous version, not a capture of the interpolation change. The approved annual
profile and palette are unchanged.

Ordinary confirmed clock batches now interpolate for 500 ms using existing
active frame time. Reusable CPU buffers blend the full light presentation,
including the normalized sun, ambient, background and base fog. Pause freezes
the presentation; resume continues; year wrap stays forward. Import/time jumps,
world replacement and hidden/context recovery reanchor. This adds no timer,
Core mutation, light, shadow map or GPU resource. The native shadow crop follows
the moving sun using existing cached world bounds, without a scene traversal.
Frozen public snapshots are lazy; water consumes the same presentation authority
without requesting a snapshot each frame.

Four additional focused tests cover intermediate frames, 15/30/60/120 FPS
equivalence, pause/resume, interrupted transitions, year wrap, explicit reanchors,
unchanged paused shadow coverage, and actual water/shadow agreement. The render
path test rejects snapshot reads and world-bound traversals. The resulting
focused suite has **46 passing tests, zero failures and zero skips**. Production
asset validation, TypeScript and build also pass; the existing large-chunk
warning remains. Formatting is manually reviewed with `git diff --check`.

`smoothing-cpu-report.json` preserves a separate follow-up benchmark; the initial
CPU report above is unchanged. Eight paired samples compare stepped and blended
presentation at 30/60 FPS, Low/Standard and normal/permitted low camera angles.
Each sample measures five warmed-up complete one-minute annual cycles, including
actual native receiver-crop math against fixed 500 × 50 × 500 bounds. Median
extra CPU cost per frame ranges from **0.0035 to 0.0086 ms** in this Windows/Node
run. Shadow crops increase from 120 to 1,786/3,571 per simulated minute as the sun
moves between clock samples; their math is included in those timings. The
existing native shadow source/map and resource identities remain stable. This
is a mock-renderer CPU measurement, not a WebGL/GPU or physical-device guarantee.

Browser inventory remains empty in this session. A new real-scene smoothness
capture and physical-device acceptance are pending; the updated LAN comparison
uses the existing port 5227. The default profile and publication gates remain unchanged.

## Follow-up: smooth snow and seasonal material transitions

The owner accepted the interpolated light on 22 October and requested the same
treatment for snow. A shared reusable appearance sample now blends the existing
ground/foliage colors and snow amount between confirmed `visualProgress` endpoints
over the same 500 ms update interval. It applies in baseline and northern-light
Fjord Play. The canonical full-Winter hold, Spring thaw, annual weather and
permanent summit mask remain unchanged. Falling precipitation already has its own
existing smooth emission/opacity ramp and is unchanged.

Terrain/foliage material bindings, local/rival structure uniforms and dressing
batches receive the same appearance. Paused partial transitions stay frozen.
New/upgraded houses, discovery foliage and newly rebuilt quality subsets inherit
that partial state. Local campfire heat continues to multiply the seasonal snow.
No render-frame scene traversal, asset cloning, instance-buffer rebuild or shader
recompile is needed. Paused/settled frames skip the appearance update loop.

The expanded focused suite has **68 passes, zero failures and zero skips**.
It includes six new cases for actual snow shader uniforms/resource identity,
15/30/60/120 FPS, interruptions and pause/resume, year rollover, hidden recovery,
exact held-winter/thaw endpoints, newly discovered foliage, house replacement
while paused, and quality/layout dressing rebuilds. Existing canonical seasons,
save/load, weather-off, fog, permanent snow, fire and northern light tests pass.
Production public-asset validation, TypeScript and build pass; the existing
large-chunk warning remains. Formatting is reviewed manually with `git diff --check`.

`snow-cpu-report.json` records a separate CPU-only material-binding benchmark:
12 terrain materials, 24 foliage materials, 20/100 structures, 30/60 FPS and
five warmed-up one-minute annual cycles. Paired median extra cost ranges from
**0.0022 to 0.0043 ms per frame** in this Windows/Node run. These small timings
are subject to runtime noise and do not measure browser/GPU, whole-scene or
physical-device behavior. Previous light-only reports remain historical records.
The LAN comparison on 5227 serves the new snow interpolation; real-device
smoothness acceptance for this follow-up is pending.
