# Offline cultural human motion preparation

This pipeline reconstructs the already generated #274 clips. It makes no network requests,
creates no provider tasks, needs no API key and does not register or publish runtime assets.
The manifest pins both raw FBXs, all three native human LOD identities, decoded intermediates,
Blender 5.2.2 and the exact prepared output hash.

The preserved authoring directory on this workstation is:
`D:/CodexSites/Pillagers/Assets/Characters/Human/CulturalEvents-274`.
It contains `Storytelling_Gesture.fbx`, `Gathering_Applause.fbx` and a redacted `receipt.json`.
The original scratch sources remain intact. Raw FBXs include provider preview meshes and must
stay in ignored authoring storage; they are never copied to `public/` or Git.

From the repository root, with its locked dependencies installed:

```powershell
$motionSource = 'D:/CodexSites/Pillagers/Assets/Characters/Human/CulturalEvents-274'
$motionBlender = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
node scripts/characters/cultural-motion/prepare.mjs `
    --source-directory $motionSource `
    --output-directory "$motionSource/staging/rebuild-001" `
    --blender $motionBlender
```

Paths are explicit arguments, so another workstation can use its own source and Blender locations.
Use a new output directory inside the ignored source directory. Existing output is preserved and
causes rejection; there is no overwrite, deletion or provider-regeneration option. Changed source,
native or intermediate hashes and a different Blender version stop preparation.

`prepare.mjs` decodes private native copies, invokes `retarget.py` for the two preserved source
motions, then uses `build-clips.mjs` to map the measured Blender bone orientations into the exact
native glTF frames. Native Idle retains the root and lower body. All 46 original rest-node
transforms and child references are checked before a successful preparation result is written.

Expected output:

- `Human_CulturalAnimations.glb`: **445,676 bytes**.
- SHA-256: `8fb9ff11a617d53064515f152cab184de2804a23eece4e5456edf66b92ae143f`.
- Two animations, zero meshes/images/skins; conservative parsed-track budget **480,480 bytes**.
- `prepared.json`: input-manifest and preparation-source hashes, tools, exact output identity and
  **prepared-unregistered** status. Intermediate native copies, pose measurements and the Blender
  log remain in the same ignored output directory.

The two original Meshy tasks consumed 20 credits; reconstructing these sources consumes none.
This is an offline candidate, not game/browser/device acceptance. Exact per-clap sound timing
remains unapproved; see [the motion report](../../../docs/qa/cultural-motion-274/report.md).
