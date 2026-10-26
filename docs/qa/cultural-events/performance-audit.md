# Cultural events — initial performance audit

Date: 26 October 2026. Role: dedicated performance review for epic #274.
Baseline: `fb327996013b115bff985f7f87b7a69ff37eb24f` (`main`, merged PR #273).
Workspace: `D:/CodexSites/Pillagers/scratch/social-cultural-events-274`.

This is a read-only source/asset audit followed by this evidence file. It is not
integrated performance acceptance. No new tests, runtime changes, provider
requests or credit spending were performed by this role. The proposed budgets
below have not been approved or demonstrated in the browser. TDD test-seam and
prototype-rule questions were still awaiting the owner when this audit was saved.

## Existing contracts to preserve

| Area | Current source and finding | Implication for cultural events |
| --- | --- | --- |
| Shared human sources | `src/characters/MeshyHuman.ts:79–87,616`: module-global factory caches body sources, facial sources and fitted module sources. | Reuse existing source ownership; do not create another human factory per event. |
| Instance ownership | `src/characters/MeshyHuman.ts:349–404`: each resident borrows `source.animations` and owns its cloned skeleton, material copies and AnimationMixer. `dispose()` at lines 608–613 releases instance ownership. | Reuse the actual resident model and its mixer. Do not spawn a ceremonial duplicate or an additional mixer. |
| Existing extra clips | `src/characters/MeshyHuman.ts:125–151` and `src/characters/HumanExtraAnimations.ts`: the current extra-animation GLB is requested while a native body source loads; clips are cloned into each loaded body source. | Adding cultural clips to this bundle would make them eager. Prefer a separate lazy clip-only bundle and shared request, with validated native-rig targets and a cheap existing-pose fallback. |
| Actor updates | `src/fjord-play/FjordEntities.ts:455–505` updates the current resident animation with zero delta while paused. `src/characters/MeshyHuman.ts:590–606` still restores, shapes and updates bones/hair; its distance argument is unused. | Frustum/visibility culling does not establish CPU animation culling. Do not multiply actor updates or add a second frame loop. Cultural work must be gated separately when inactive. |
| Motion | `src/fjord-play/LivingWorldController.ts:658–675,704–745`: bounded stepping already exists, while clearance/social selection scans other real actors. | Avoid adding another all-person pair scan. Choose bounded presentation slots and schedule routes on state changes rather than every frame. No teleportation. |
| Audio ownership | `src/audio/FjordAudio.ts:149–184,362–397,440–490`: application owns AudioContext/buffer cache; each world owns voices. Buffer requests are shared, decoded buffers are bounded and unused entries are evicted. | Use the existing owner and buses. Do not create a ceremonial AudioContext, decode the same sound per attendee or require all warm caches to vanish when a world closes. |
| Audio limits | `src/audio/Soundscape.ts:40,100–109`: 128 emitters, three ambience beds, eight nearby local voices, two fading voices, 32 buffers, 24 MiB decoded cache, 4 MiB source-file cap, 0.2-second planning cadence; local budget falls to four/two past 80/160 metres. `FjordAudio.ts:372–389` permits at most two concurrent decodes and rejects an individual decoded buffer above 8 MiB. | Fit culture inside these existing limits, not a separate allowance that bypasses them. |
| Fire lighting | `src/core/WorldLighting.ts:15–19,68–80,314–348`: one existing non-shadow PointLight and surface halo follow actual fire state. There is one directional shadow authority. | Reuse the existing light/halo/emission. Do not add shadow lights, recompile materials per frame or visually ignite an extinguished fire for free. |
| Effects/quality | `src/config/PresentationQuality.ts:23–50` and `src/effects/CampfireEffect.ts:102–147` retain bounded Low/Normal particles and Off/reduced-motion behavior. | Keep these budgets and lifecycle/disposal behavior. Cultural presentation must not silently raise quality or add a second fire emitter. |
| Compact textures | `src/config/ModelTextureAssets.ts` and `docs/gameplay/PRESENTATION-QUALITY.md`: default Low uses twelve compact house/Farmyard/tent/campfire sources. | Preserve the existing 140→35 MiB calculated image-pixel budget improvement. It is not measured total browser RAM. |

Line references describe the baseline above; subsequent implementation may move them.

## Actual baseline asset measurements

These values were read from the committed runtime GLB bytes, without loading a
renderer or sampling an AnimationMixer. File hashes bind them to exact sources.

| Relative path | Encoded GLB bytes | Animation clips | Channels per clip | Unique animation accessors | Animation-accessor byte budget | Meshes / images |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `public/game-assets/human/Human_ExtraAnimations.glb` | 1,022,008 | 4 | 88 | 267 | 316,152 | 0 / 0 |
| `public/game-assets/human/Human_LOD2.glb` | 6,118,512 | 14 | 88 | 780 | 864,304 | 1 / 3 |

SHA-256:

- `Human_ExtraAnimations.glb`: `a6f3884603041026f290fe0cffa2327c616ae490c779a48a456cb67edcb7a676`.
- `Human_LOD2.glb`: `d2a05aa67337187686325f40e9dd2c4c5867517c933a09aefb857594f2faa682`.

Method: read the GLB JSON chunk; collect the unique input/output accessor indices
from animation samplers; sum `accessor.count × component width × component-type
bytes`. This avoids counting the same accessor repeatedly. Encoded GLB size and
this accessor budget are different measurements. Neither includes JavaScript
objects, decoded Three.js tracks, working arrays, decoder overhead, GPU allocations
or process RAM. A future decoded-track budget must inspect actual `times` and
`values` typed-array byte lengths after parsing, not relabel this table as that
measurement.

## Proposed bounded presentation budget

These are review proposals, not enabled gameplay rules or demonstrated timings.
The staging limit must never change canonical attendance, effects or history.

- One presented gathering at a time. Stage at most six existing residents on Low
  and eight on Standard, selected only from canonical eligible participants.
  Reuse their current model, skeleton and single mixer; additional attendees may
  remain unstaged without being fabricated or removed from the factual record.
- Start with at most two shared cultural clips. Target no more than 1.5 MiB
  combined encoded animation payload and 512 KiB of actual parsed track arrays.
  Require zero meshes and images in the clip-only bundle. Fetch/parse once lazily
  when an accepted, observable gathering needs it. Do not load a new human LOD,
  copy albedo/normal images or request portraits for the gathering.
- Route/reserve presentation slots only when event or participant availability
  changes. Avoid per-frame path construction, scene traversal, fitting, model
  cloning, skin recoloring or all-person pair construction. An unavailable route
  or missing clip gets a modest truthful fallback, not a teleport or Core retry.
- Add no light, shadow map, render pass or particle system. Prefer existing fire
  and halo uniforms. Any later extra glow geometry needs its own measured draw
  cost rather than being assumed free. Preserve Off/reduced motion and actual
  campfire fuel/burning state.
- Use one positional world-bus group emitter rather than one voice per attendee
  or a global ambience bed. At most two mono clips of up to four seconds each,
  no more than 2 MiB combined decoded PCM, within the existing global cache and
  voice limits. Two four-second mono clips at 48 kHz require 1,536,000 sample
  bytes; actual browser sample rate/channel count must be checked after decode.
- Pause/background, loss of visibility, replaced scenes, rejected/obsolete loads
  and completed presentation must cease cultural work/voices. Late results must
  not attach to the new scene. Missing audio or animation must not affect Core
  facts or authorize a second cost/contribution.

## Public metrics and repeatable comparison

Reuse current public instrumentation rather than inventing inferred RAM/FPS:

- `src/fjord-play/PlaytestPerformance.ts:225–264,341–395`: frame intervals and CPU
  p95, asynchronous main GPU query, main/portrait draw workloads, renderer resource
  counts and high-water values, optional JS heap and export.
- `src/fjord-play/PerformanceMeasurements.ts`: bounded sample windows, history,
  hitch/error events and mode boundaries. Do not sum CPU/GPU/frame intervals.
- `src/fjord-play/FjordModels.ts:178–181`: actor, source-template and owned-instance
  counts. `FjordEntities.performanceCounts()` reports visible resident/livestock
  counts, not an independently measured total animation cost.
- `src/fjord-play/FjordScene.ts:715–747`: existing motion/frame/resource, audio,
  effect and lighting diagnostics. No second diagnostics timer is needed.
- `src/audio/FjordAudio.ts:440–458`: current/high voice counts, active decodes,
  retained decoded bytes, downloads, requested/started cues, scheduling/decode
  timing and failure status.

For integrated acceptance, use exact matched saves and record build/asset hashes,
seed, population, actual event/participants, weather, camera, viewport, device DPR,
quality, effects, pacing and audio settings. Compare no-gathering and gathering
windows with equal elapsed sampling time and at least three alternating paired
repetitions. Separate first-use cold fetch/decode from warm animation, and do not
extend a short event with an undisclosed synthetic loop. Include Low/Standard,
audio on/off, paused/resumed, hidden/returned, offscreen, missing assets and scene
replacement. Core event outcomes must match with presentation disabled.

Proposed review gates: no added resident/source-image allocation; no extra shadow
pass; no retained per-event owned resources after completion; no monotonic growth
across repeated gatherings and scene replacements; and at most 5% warm frame-p95
regression in a repeatable matched browser comparison. These are hypotheses for
review, not passed gates. Intentional global human/audio source caches may remain
warm, so compare against the matching warm-cache baseline rather than demanding
zero resources after a world closes.

## Unverified and next ownership

No actual browser render, native GPU measurement, crash reproduction, physical
mobile session or sustained thermal run was performed in this audit. Asset sizes
and code ownership do not establish the eventual runtime delta. Safari may lack
JS heap or GPU-timer APIs; report those as unavailable. Renderer texture counts
are not VRAM bytes. A physical iPhone/iPad sustained review remains separate from
headless contract tests and desktop browser results.

This role will own independent integrated performance evidence and a bounded QA
harness under `scripts/qa/` / `docs/qa/cultural-events/` after test seams are agreed.
Runtime ownership remains with the core, motion, audio and lighting roles. Do not
alter shipping quality or global validation to make an acceptance result pass.
