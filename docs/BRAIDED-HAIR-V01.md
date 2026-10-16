# Manually fitted long braid

Character Lab offers `Long braided hair · manual fit` on the existing native
Meshy Human. Open `/character-lab?hair=long-braided` to select it directly.
It is an adult Lab preview; Fjordplay's approved short-hair assignment is unchanged.

The input is the local `Assets/Characters/Human/Manual-Fitting/Long-hair-braided.glb`.
The original file is preserved. Rebuild the prepared candidate with:

```powershell
node scripts/prepare-braided-hair.mjs 'C:/CodexWorkspaces/Pillagers/Assets/Characters/Human/Manual-Fitting/Long-hair-braided.glb'
```

The source has one mesh, one baked material and no skeleton. Preparation bakes
the existing transform into metre coordinates, preserves all 3,157 triangles,
and removes the embedded textures. At the leather boundary, 27 shared render
vertices are split to keep colour changes sharp. The runtime GLB is 193,240 bytes.
Receipts pin the original source, preparation script, prepared geometry and binding.

## Colour

The source's leather band is identified from its measured height band together
with the baked colour map. This classification is frozen in the prepared binding:
245 triangles and 353 render vertices form the fixed-colour zone. Hair uses the
normal DNA hair colour, including age greying and optional Lab colour overrides.
The strap always uses the fixed brown `#684c33`. One opaque mapless material and
vertex colours render both regions.

## Skeleton and drape

The body retains its exact 44-bone native skeleton and body identity. Only the
hair module owns an extended skin: it references those same 44 bones and adds a
six-bone `Hair_Braid_0` through `Hair_Braid_5` chain under the existing Head bone.
No body bones or clips are copied or renamed. The cap follows Head, the upper
braid blends into the chain, and the hanging length follows the chain's controls.
The leather band is rigidly weighted to one chain bone. Every render vertex has
at most four normalized influences. The chain is supported at all three body LODs.

The imported braid passes through the native back. Its module-owned chain poses
the braid behind the measured back surface while preserving the cap. The measured
braid/tassel radius is about 31.5 mm; a 36 mm bound includes a small guard. The
chain follows Head near its root and Spine2 toward its end, with length constraints
and a conservative rear envelope. This is deterministic pose-driven deformation,
not a free swinging hair simulation.

Selected clothing is included. At equip or DNA refit, ray intersections select
up to 63 sparse contact samples on the real garment. Subsequent poses update only
their touched vertices using the existing garment skin weights, interpolate a
moving envelope, and account for the braid's extent in both height and depth.
There is no full garment search per frame. Sampling a clip at a fixed time produces
the same result regardless of previously played frames.

The clothing envelope is an approximation, not general cloth collision. New
outfits and extreme poses still need inspection. Side views are useful for judging
the visible transition between the cap, nape and hanging braid after draping.

## Verification

`tests/braided-hair.test.mjs` checks receipts, texture removal, fixed leather under
DNA/manual colours, source-bone reuse, chain ownership/disposal, all three body
LODs and finite deformations in Native neutral, Idle, Walk and Run. It also samples
braid vertices against actual animated tunic triangles in neutral, Idle and Walk.
Existing short-hair and Fjord wardrobe tests protect the earlier approved assets.

Local browser captures and measurement reports live in
`C:/CodexWorkspaces/Pillagers/scratch/braid-qa/`. The isolated LAN review runs on
5194 because 5180 currently serves the separate clan-discovery preview. The build
includes the existing local housing and scenery files needed by the full world.
