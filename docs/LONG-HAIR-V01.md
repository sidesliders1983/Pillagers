# Manually fitted shoulder-length hair

Character Lab offers `Long hair 2 · manual fit` on the existing native Meshy
Human. Open `/character-lab?hair=long-2` to select it. This is an adult preview
for ages 18–100, alongside the short hairstyles and long braid.

The source is `Assets/Characters/Human/Manual-Fitting/Long-hair-2.glb`.
It contains one mesh and one textured material, without bones or animation.
The source file is preserved. Rebuild the prepared candidate with:

```powershell
node scripts/prepare-long-hair.mjs 'C:/CodexWorkspaces/Pillagers/Assets/Characters/Human/Manual-Fitting/Long-hair-2.glb'
```

Preparation bakes its existing node transform into metre coordinates, retains
all 8,016 render vertices and 5,742 triangles, and removes the embedded textures
and UVs. The prepared GLB is 358,692 bytes. Receipts pin the source, pipeline,
geometry and binding. All hair follows DNA colour, age greying and Lab overrides.

The scalp is rigidly attached to the existing Head bone. Over the lower locks,
smooth weights transition through Neck to Spine2: Head is fully weighted above
1.48 m, while the lowest ends predominantly follow the upper back. These ends
reach the shoulders rather than hanging down the back like the long braid, so
this candidate uses the shared 44-bone skeleton directly. No additional chain
is required for the current pose-driven fit. Arms have no influence on hair.
The same binding is prepared against each exact body LOD, with no body masking.

This is skinning, without hair physics or clothing collision. The high trial
tunic collar covers some of the lowest hair points. Other collars and poses
still need visual review; this preview does not guarantee universal clearance.
After owner approval, Fjordplay also assigns this style to adult residents.
Its independent visual seed stream selects among the two short styles, the long
braid and this shoulder-length style, without depending on sex or occupation.
Children retain the existing short styles.

Verification covers source receipts, texture removal, normalized neck/back
weights, fixed scalp attachment, finite geometry and local edge stretch in Idle
and Walk at all three body LODs. DNA colour and body changes, explicit colour
override, and switching between this style and the independently rigged braid
are tested. Existing braid, short-hair and Fjord wardrobe checks also pass.

Browser QA covers front, side and back in native neutral; dark hair; and front
and back views with the trial tunic in neutral, Idle and Walk. Local captures
are in the primary workspace's ignored `scratch/long-hair-qa` directory.
