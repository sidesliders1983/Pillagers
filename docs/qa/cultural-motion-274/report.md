# Cultural motion source and offline qualification — #274

Status: two real Meshy-generated clips are downloaded, retargeted and inspected offline. After owner approval of the motion/model test boundaries, the exact clip-only bundle is now staged under public/game-assets with a lazy prototype library and existing-human playback API. This report covers motion preparation and headless runtime contracts; the parent owns Fjord scheduling/integration. No gameplay command, Core fact, save rule, body model or shipping animation default is changed by these motion-owned files.

## Sources and costs

The owner explicitly requested new human motion through Meshy. Exactly two `prime` Text-to-Motion tasks were created with fixed prompts: `Storytelling_Gesture` (4 seconds requested) and `Gathering_Applause` (3 seconds requested). Both succeeded. The existing credit balance changed from 245 to 225: 20 credits, no purchases or rerolls. IDs, exact prompts, raw file hashes and source body identity are in [source-evidence.json](source-evidence.json).

The generation API and formats were checked against the current [Meshy Text-to-Motion documentation](https://docs.meshy.ai/en/api/text-to-motion). Source FBXs and the exclusive creation journal remain under `scratch/culture-motion`; signed URLs and credentials are excluded from reports. The runner refuses another creation when its journal exists. Continue known tasks with `poll`; never recreate them because an observer times out.

Raw provider FBXs include 16 generic preview meshes and a 52-bone SMPL-H rig. These are source material only. Their bone names are not a drop-in match for the 44-joint native body. A semantic mapping is insufficient to certify orientation or contact.

## Candidate and preservation

`scratch/culture-motion/Human_CulturalAnimations.candidate.glb` is 445,676 bytes, SHA-256 `8fb9ff11a617d53064515f152cab184de2804a23eece4e5456edf66b92ae143f`. It has two animations and zero meshes, images, textures or skins. Actual parsed track-array sizes total 480,480 bytes, counting each track's times and values conservatively, within the proposed 512 KiB budget. This is animation data, not measured browser process RAM.

The offline retarget maps 25 upper-body orientations through Blender's actual imported bone frames and back into the original native glTF joint frames. Existing native Idle owns lower-body movement and root position; generated pelvis drift is not transferred. All 46 original nodes retain exactly the same local rest matrices and child hierarchy (zero matrix difference), verified in [rest-node-equivalence.json](rest-node-equivalence.json). All three shipped native LODs have the same rest-hierarchy hash and 44 joints; see [native-lod-rigs.json](native-lod-rigs.json).

Exported-clip playback was parsed with the installed GLTFLoader and evaluated on the exact native Three.js skin at every frame. Lower-body local-position differences versus native Idle are at most 2.52e-8 m; normalized quaternion-angle differences are at most 8.43e-8 radians. No generated root travel is added. See [playback-and-contact.json](playback-and-contact.json).

## Offline views and contact limits

[Storytelling poses](storytelling-runtime-review.webp) and [applause poses](applause-runtime-review.webp) show the actual native geometry deformed by Three.js at several times. Blender renders those static posed meshes; these are offline evidence, not game-browser or physical-device acceptance. The figures stay upright and retain the native Idle lower body. The storyteller movement reads as restrained open-arm/shrug-like gestures; native hands remain angular. These views use the unmodified native body, not every age/DNA/wardrobe variant; clap-contact acceptance must account for the actual actor proportions.

The [oblique closure sequence](applause-closure-review.webp) shows opening and near-contact phases. Source wrist minima occur near 0.47, 0.73, 1.00 and 1.23 seconds. At those phases the native hand meshes approach within about 12.7, 9.9, 2.6 and 3.6 mm respectively. Palm-landmark centers remain roughly 9–10 cm apart because the rigs and hand proportions differ. Vertex proximity alone does not prove correct palm-surface contact or justify an exact clap sound marker. Keep any per-clap audio acceptance pending motion/owner review; do not make or reroll Core facts from this presentation.

An initial diagnostic sheet accidentally copied Blender's hidden 42-vertex `Icosphere` bone custom-shape helper into each visible snapshot. The performance agent identified it in `scratch/perf-native-audit/blender-helper-identity.json`. Filtering only meshes with an Armature modifier targeting the real native rig fixed the review. This was an offline review-assembly error, not a runtime model/memory defect. Failed diagnostic images remain in scratch.

## Tracked offline reproduction

The executed conversion now lives in [scripts/characters/cultural-motion](../../../scripts/characters/cultural-motion/README.md), with explicit source/output directories and Blender executable arguments. It has no provider-generation command or network calls. Both original FBXs and a redacted receipt were copied, without removing scratch history, into the ignored authoring folder `D:/CodexSites/Pillagers/Assets/Characters/Human/CulturalEvents-274`. Raw preview models remain outside public/Git.

Three complete tracked-pipeline runs, including the final normalized preparation sources, reproduced the exact original 445,676-byte candidate and SHA-256 without an intentional layout or playback change. [reproduction.json](reproduction.json) records the actual final preparation-source hashes, frozen input manifest, Blender version, clip budgets and unregistered status. Use the tracked README command with a new staging subdirectory; the earlier scratch commands below are retained only as the historical diagnostic/render sequence.

## Historical scratch diagnostic sequence

Run from this D: checkout with installed dependencies and Blender 5.2.2. No new generation is needed:

1. `node scratch/culture-motion/meshy-motion.mjs poll`
2. `node scratch/culture-motion/prepare-native.mjs`
3. `blender --background --factory-startup --python-exit-code 1 --python scratch/culture-motion/retarget_review.py`
4. `node scratch/culture-motion/retarget-native.mjs`
5. `node scratch/culture-motion/inspect-playback.mjs`
6. `blender --background --factory-startup --python-exit-code 1 --python scratch/culture-motion/render-runtime-review.py`
7. `node scratch/culture-motion/prepare-contact-review.mjs`
8. `blender --background --factory-startup --python-exit-code 1 --python scratch/culture-motion/render-contact-review.py`

The workstation executable is `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`. All input/output and temporary research files remain on D:. At that offline phase runtime source and models were unchanged. No new tests were written while seam confirmation was pending; the inspections above are offline asset measurements.

## Coordinated runtime prototype

The prepared 445,676-byte bundle and redacted provenance are now in `public/game-assets/human/Human_CulturalAnimations.glb` and `cultural-animations.json`, with the exact prepared SHA-256 above. Raw FBXs, their 16 preview meshes and staging history remain ignored authoring files. The public bank contains zero meshes/images/textures/skins and only the two native-rig clips; no `HumanExtraAnimations` extension was changed.

`CulturalMotion.prepare({eventId, visible})` gates the one shared promise; empty/unaccepted or offscreen requests never download. The default transport is HTTP fetch. The existing `AssetDigest` verifies the frozen byte count and SHA on both WebCrypto and HTTP-LAN fallback paths. Failures remain quiet and cached until an explicit reset permits one retry. `reset()` invalidates pending event requests, including a microtask race after the bank resolves, while retaining a valid shared bank; `dispose()` releases the owner's bank reference and ignores late completions.

`CulturalMotion.play(human, clip, request)` uses a WeakMap for the last event/clip per actor. It registers shared clip references on the existing human, avoids replaying the same event, and never creates an actor, material or mixer. `MeshyHuman.registerPresentationClips()` validates the entire native-bone binding bank before installation without changing `source.animations`/`human.clips`. `playPresentationClip()` uses the existing actor mixer, one-shot semantics and existing 0.15-second crossfade, then returns to Idle in the existing update loop. Disposed/dead actors ignore late motion. `stopPresentationClip()` stops only an active presentation clip. The existing `isDisposed` getter is reused.

The parent presentation owner must stop its active actors on scene/event reset before or with `CulturalMotion.reset()`; the motion library deliberately keeps no strong actor registry. The parent also owns accepted-event projection, continuous visibility/eligibility, movement overrides, FjordModels bridge, Core/session parity and browser acceptance. No new frame loop or per-clap sound is installed here. Near-contact metadata remains explicitly unqualified for exact applause audio.

## Headless validation and memory incident

Eleven focused behaviors were written and run as individual red → green cycles at the approved public library/model seams. The tests parse the actual clip-only GLB with the actual GLTFLoader. Model tests build an image-free derivative of the committed native LOD2 using actual NodeIO; only images/materials are removed for Node, leaving real geometry, skeleton, native animation and body fitting. The download/fetch boundary is mocked; no private mixer/map assertions or stand-in actor implementations are used. The HTTP-LAN test deliberately removes WebCrypto to exercise the real digest fallback.

Executed commands:

```powershell
node --max-old-space-size=512 --test tests/cultural-motion.test.mjs tests/meshy-animation-timing.test.mjs tests/meshy-human-runtime.test.mjs
node --max-old-space-size=512 node_modules/typescript/bin/tsc --noEmit
```

Result: 14 passed (11 new motion tests plus 3 existing animation-timing tests), zero failures. Nine existing `meshy-human-runtime` source-comparison tests were skipped by their existing `hasAssets` guard because the original ignored `Assets/Characters/Human/Human-textured.glb` is absent in this worktree. No guard was changed. TypeScript passed. Source/readability review and scoped whitespace/syntax checks were performed manually; no formatter is configured in package scripts.

The early red-case full-object equality assertion caused a terminal Node memory failure; retained observations are in [test-memory-incident.json](test-memory-incident.json). It was not replayed. The independent [bounded memory diagnostic](../cultural-events/motion-memory-diagnostic.md) identified Node's full-object assertion/Myers-diff allocation path using actual formatted line counts, without executing that diff. All later assertions use bounded Boolean, scalar, name or hash comparisons, and isolated children use a 512 MiB managed-heap cap. This cap alone does not bound external typed-array allocations.

The independent frozen-loader diagnostic completed 100 actual load/dispose cycles with 480,480 conservative track bytes (370,440 unique backing bytes), returning ArrayBuffer storage to its labelled 602,271-byte baseline at every disposal checkpoint. Peak Node resource-usage RSS was 150.93 MiB; it does not prove indefinite RSS or browser/device stability. The exact frozen snapshot and all samples are in that diagnostic. The current motion-owned source identities and delivered asset contract are recorded in [runtime-validation.json](runtime-validation.json).

## Existing-controller campfire approach

The coordinated navigation slice adds `LivingWorldController.beginGathering(eventId, participantKeys, 6 | 8)`, `inspectGathering()` and `releaseGathering()`. It owns only ephemeral presentation intent. Fresh accepted participant keys resolve to existing outdoor agents. The parent validates the paid event and current Core eligibility, owns the 30-second approach budget and later phases, and never reconstructs an approach from saved history.

At event time, 24 candidate points lie on seeded 5.5/6.25/7-metre rings around the actual campfire, outside its 4.4-metre obstacle radius plus the existing resident body radius. Each selected actor tries at most four existing bounded routes. Successful targets retain at least 1.2 metres between centers; ordinary safe/segment/terrain/body/turn/walk/passing checks remain authoritative. Low stages at most six actors and Standard at most eight. Repeated staging of the same event is idempotent and performs no new search. Candidate selection does not consume Core RNG.

The existing `advance`/`step` loop moves approaching actors; they are excluded from ordinary social, cattle interaction and occupation ownership. Arrived actors remain Idle and face the campfire until explicit release. Pause/hidden scenes freeze them. Current projection reconciliation marks disappeared, departed, dead or caregiving participants dropped. A newly blocked route drops that presentation intent without a render-time route search or teleport. Dropped/unreachable actors remain in canonical attendance and history. Release clears the staged route while retaining the body's current world position.

Executed validation:

```powershell
node --max-old-space-size=512 --test --test-concurrency=1 tests/cultural-gathering-navigation.test.mjs tests/cultural-presentation.test.mjs tests/living-fjord.test.mjs tests/fjord-interactions.test.mjs tests/fjord-stability.test.mjs tests/fjord-route-retries.test.mjs
```

Result: 52 passed, zero failures/skips. The three navigation tracer behaviors were demonstrated red before their implementation: safe ring approach; immediate projection invalidation; and a mid-route obstacle while the endpoint is still safe. A fourth contract check verifies 6/8 limits, four candidate-route attempts per actor, idempotence and explicit release. After a small review change bounded temporary key selection without copying the full input list, the final four navigation tests and two parent presentation tests were rerun and passed. The final TypeScript check also passed after the concurrently owned audio errors were resolved. No unrelated validation was weakened. [navigation-validation.json](navigation-validation.json) pins these final owned source identities.

These are headless geometry/lifecycle/ownership results. The parent still owns actor animation bridging, presentation/audio synchronization and actual browser/device review. No new renderer, tick loop, model, gameplay rule or Core fact is added by this controller slice.

## Scoped post-gathering return refinement

The independent v2 trace found eight failed occupation searches by one fisher at the same update, 20 seconds after release; it did not establish a synchronized multi-worker burst. The v2 failure and its raw trace remain unchanged. A delay stagger was therefore not applied.

The owner approved a presentation-only physical return to each actor's actual reached position before ordinary work resumes. The controller now keeps at most 512 actually passed gathering points and at most 4,096 existing path/detour/home-trail waypoints per paused intent. No prior-return chain is nested by a second gathering. Release revalidates the corridor using the existing segment authority and may join at most eight nearby retained points at once to avoid replaying obsolete historical passing loops. Body clearance, passing, turn alignment and walking remain authoritative. The ordinary route-search and work-target budgets, Core facts, stocks and RNG are unchanged.

A finite return uses the existing presentation travel budget (at most 240 active seconds). Pause/background freeze it. Care, departure, disappearance or a changed home cancel retained ownership; new route obstruction or expiry drops the return without teleporting or asking for a replacement route. At the actual origin, the previous visual intent resumes only if home, occupation, eligibility, current source/clip and remaining segments still match. Invalid intent is discarded; no work success is fabricated. Public `inspectMetrics()` reports conservative `retainedGatheringWaypoints` and `returningGatheringActors` for the independent audit.

The actual production campaign seed 91 regression was red on the missing physical-return destination before implementation. It is now green: the fisher returns physically, makes no occupation-target search before reaching that position, and later reaches a real shore activity through the ordinary rules. At the measured five-second warmup the fisher was not yet on a shore visit; the test deliberately does not claim otherwise. A second red → green case prevents a home changed during the gathering from creating an obsolete return at release.

Final focused command: `node --max-old-space-size=512 --test tests/cultural-gathering-navigation.test.mjs tests/cultural-presentation.test.mjs` — 12 passed, zero failures/skips. TypeScript passed. Care/home cancellation, new obstruction, second sponsorship, bounded ownership and complete cleanup are covered at public seams. Source and result identities are in [navigation-return-validation.json](navigation-return-validation.json).

The longer v3 performance run remains independent and must include the CPU maximum at release, all later route bursts and retained-waypoint counts across its full observation window. Functional success does not establish that the hitch was eliminated or that browser/device performance improved.
