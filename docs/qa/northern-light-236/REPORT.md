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
