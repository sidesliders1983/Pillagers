# Cultural motion source and offline qualification — #274

Status: two real Meshy-generated clips are downloaded, retargeted into a scratch-only native-rig candidate, and inspected offline. Nothing is wired into the game. No gameplay command, Core fact, save rule, body model, published runtime asset or animation default changed.

## Sources and costs

The owner explicitly requested new human motion through Meshy. Exactly two `prime` Text-to-Motion tasks were created with fixed prompts: `Storytelling_Gesture` (4 seconds requested) and `Gathering_Applause` (3 seconds requested). Both succeeded. The existing credit balance changed from 245 to 225: 20 credits, no purchases or rerolls. IDs, exact prompts, raw file hashes and source body identity are in [source-evidence.json](source-evidence.json).

The generation API and formats were checked against the current [Meshy Text-to-Motion documentation](https://docs.meshy.ai/en/api/text-to-motion). Source FBXs and the exclusive creation journal remain under `scratch/culture-motion`; signed URLs and credentials are excluded from reports. The runner refuses another creation when its journal exists. Continue known tasks with `poll`; never recreate them because an observer times out.

Raw provider FBXs include 16 generic preview meshes and a 52-bone SMPL-H rig. These are source material only. Their bone names are not a drop-in match for the 44-joint native body. A semantic mapping is insufficient to certify orientation or contact.

## Candidate and preservation

`scratch/culture-motion/Human_CulturalAnimations.candidate.glb` is 445,676 bytes, SHA-256 `8fb9ff11a617d53064515f152cab184de2804a23eece4e5456edf66b92ae143f`. It has two animations and zero meshes, images, textures or skins. Actual parsed track-array sizes total 480,480 bytes, counting each track's times and values conservatively, within the proposed 512 KiB budget. This is animation data, not measured browser process RAM.

The offline retarget maps 25 upper-body orientations through Blender's actual imported bone frames and back into the original native glTF joint frames. Existing native Idle owns lower-body movement and root position; generated pelvis drift is not transferred. All 46 original nodes retain exactly the same local rest matrices and child hierarchy (zero matrix difference), verified in [rest-node-equivalence.json](rest-node-equivalence.json). All three shipped native LODs have the same rest-hierarchy hash and 44 joints; see [native-lod-rigs.json](native-lod-rigs.json).

Exported-clip playback was parsed with the installed GLTFLoader and evaluated on the exact native Three.js skin at every frame. Lower-body local-position differences versus native Idle are at most 2.52e-8 m; normalized quaternion-angle differences are at most 8.43e-8 radians. No generated root travel is added. See [playback-and-contact.json](playback-and-contact.json).

## Offline views and contact limits

[Storytelling poses](storytelling-runtime-review.webp) and [applause poses](applause-runtime-review.webp) show the actual native geometry deformed by Three.js at several times. Blender renders those static posed meshes; these are offline evidence, not game-browser or physical-device acceptance. The figures stay upright and retain the native Idle lower body. The storyteller movement reads as restrained open-arm/shrug-like gestures; native hands remain angular.

The [oblique closure sequence](applause-closure-review.webp) shows opening and near-contact phases. Source wrist minima occur near 0.47, 0.73, 1.00 and 1.23 seconds. At those phases the native hand meshes approach within about 12.7, 9.9, 2.6 and 3.6 mm respectively. Palm-landmark centers remain roughly 9–10 cm apart because the rigs and hand proportions differ. Vertex proximity alone does not prove correct palm-surface contact or justify an exact clap sound marker. Keep any per-clap audio acceptance pending motion/owner review; do not make or reroll Core facts from this presentation.

An initial diagnostic sheet accidentally copied Blender's hidden 42-vertex `Icosphere` bone custom-shape helper into each visible snapshot. The performance agent identified it in `scratch/perf-native-audit/blender-helper-identity.json`. Filtering only meshes with an Armature modifier targeting the real native rig fixed the review. This was an offline review-assembly error, not a runtime model/memory defect. Failed diagnostic images remain in scratch.

## Reproduce the existing sources

Run from this D: checkout with installed dependencies and Blender 5.2.2. No new generation is needed:

1. `node scratch/culture-motion/meshy-motion.mjs poll`
2. `node scratch/culture-motion/prepare-native.mjs`
3. `blender --background --factory-startup --python-exit-code 1 --python scratch/culture-motion/retarget_review.py`
4. `node scratch/culture-motion/retarget-native.mjs`
5. `node scratch/culture-motion/inspect-playback.mjs`
6. `blender --background --factory-startup --python-exit-code 1 --python scratch/culture-motion/render-runtime-review.py`
7. `node scratch/culture-motion/prepare-contact-review.mjs`
8. `blender --background --factory-startup --python-exit-code 1 --python scratch/culture-motion/render-contact-review.py`

The workstation executable is `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`. All input/output and temporary research files remain on D:. Runtime source and models are unchanged. No new tests were written while seam confirmation was pending; the inspections above are offline asset measurements.

## Smallest runtime integration after coordination

Use a separate lazy, hash-verified clip-only library with one shared promise, loaded only for an accepted visible gathering. Do not add these clips to the existing eager `HumanExtraAnimations` extension or load new bodies per attendee. Share immutable clip arrays and use the existing resident-owned mixer and existing frame loop.

A bounded public method on `MeshyHuman` can register presentation clip references without mutating the shared native source animation array. One-shot playback must crossfade back to Idle; no loop seam is qualified. Failed loads, hidden actors and reduced effects use existing Talk/Listen/Idle, without a new Core command. Parent owns the cultural participant projection and presentation scheduler. Asset loader/playback and public Core/session parity tests follow the confirmed seams before runtime promotion.
