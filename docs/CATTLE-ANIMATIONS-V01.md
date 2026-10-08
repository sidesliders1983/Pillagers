# Cattle animation prototype — four variants

The existing Character Lab offers **Character → Cow**, with a **Cow variant**
selector for Adult female cow, Baby calf, Young adult cow and Adult bull.
Use `/character-lab?model=cow`; an optional `variant` query selects
`adult-female` (default), `baby`, `young-adult` or `adult-male`.
Switching variants preserves the selected animation. Human retains its
existing DNA, appearance, LOD and comparison controls.

Each source uses its own original rig and skin weights. Bone names do not
identify the same anatomy across the four sources. The mappings, physical
sizes, neck bends and leg chains are recorded in `scripts/cattle-rigs.json`.
The adult female's approved runtime geometry and animations are unchanged.

| Variant | Source relative to `Assets/Characters/Cow/` | Triangles | Bones | Withers | Runtime MB | Walk m/s |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Adult female | `Adult female/cow-female-adult-textured.glb` | 5,250 | 67 | 1.10 m | 0.913 | 0.366 |
| Baby calf | `Baby/cow-baby-textured.glb` | 6,800 | 50 | 0.60 m | 0.925 | 0.212 |
| Young adult | `Young Adult/Cow-young-adult.glb` | 4,388 | 46 | 0.95 m | 0.786 | 0.330 |
| Adult bull | `Adult Male/cow-male-adult-textured.glb` | 5,664 | 39 | 1.20 m | 0.761 | 0.278 |

The adult female height follows the requested 1.10 m shoulder reference.
Calf, young adult and bull heights are provisional presentation choices.
A uniform parent transform preserves each source's proportions. Shoulder
surface height is measured separately from the higher poll, ears or horns.
The optional reference human is fixed at 1.65 m. These are asset presentation
settings; cattle gameplay rules and balance are unchanged.

| Clip | Lab label | Duration | Blender frames |
| --- | --- | --- | --- |
| Idle | Standing | 6 s | 1–181 |
| Graze | Grazing | 12 s | 1–361 |
| Walk | Walking | 1.5 s | 1–46 |
| HumanInteraction | Human interaction | 6 s | 1–181 |

All four ordinary baked bone animations have matching opening and closing
poses. Graze includes lowering, feeding and raising; there are no additional
public transition clips. A dedicated anatomical jaw control has not been
verified, so the prototype uses head motion. The young adult has no verified
separate ear controls and uses breathing and tail motion during Standing.

Walk is in place, with HL → FL → HR → FR footfalls and contact for 64% of the
hind-leg cycle and 68% of the foreleg cycle. The moving grid follows each
variant's authored pace. The bull uses a shorter stride and slightly lowered
body during walking, allowing its relatively short front-leg chains to reach
their planted targets. World playback must match movement speed to playback
rate and model scale.

Graze distributes the bend across shoulders and the available neck joints:
five for the adult female, three for calf and young adult, two for the bull.
The neck extends forward and down rather than folding vertically at its base.
During feeding at 2.4–9.6 seconds, the muzzle-to-poll head axis points about
75 degrees below horizontal, or 15 degrees away from downward vertical.
Small Blender Z-axis turns originate in the body (1 degree), shoulders
(1.25 degrees), neck (1.5 degrees) and head (3 degrees). Head turns use the
world vertical axis after pitch correction. IK keeps the hoof targets planted.

Measurements sampled across the feeding interval:

| Variant | Head downward angle | Neck-root-to-head downward angle | Muzzle above ground | Muzzle ahead of fore-hoof plane |
| --- | --- | --- | --- | --- |
| Adult female | 74.86–74.99° | 48–49° | about 0.23 m | about 0.45 m |
| Baby calf | 74.36–74.99° | 47.90–49.06° | 0.109–0.115 m | 0.213–0.217 m |
| Young adult | 74.86–74.99° | 49.26–50.28° | 0.273–0.278 m | 0.450–0.455 m |
| Adult bull | 74.66–75.00° | 46.58–48.16° | 0.256–0.266 m | 0.594–0.602 m |

The generated source neck lengths limit ground reach. The chosen poses preserve
the accepted neck curve and head angle rather than stretching the meshes to
put every muzzle on the floor. There is no measured video motion capture.

## Editable files and preparation

Original source GLBs remain unchanged. Each source's sibling `Animations/`
directory contains:

- `<stem>-animations.blend`: packed, editable Blender 5.2.2 file, four Actions.
- `<stem>-animated.glb`: full texture export with all four animations.
- `<stem>-runtime.glb`: optimized browser version.
- `authoring.json` and `runtime-manifest.json`: source identity and measurements.

Stems are `cow-female-adult`, `cow-baby`, `cow-young-adult` and
`cow-male-adult`, respectively. In Blender select the armature, open Dope Sheet
→ Action Editor, choose an Action, and set the timeline end to its frame count
above. Disabled IK constraints and targets are guides; the saved Actions use
baked keys. Select the dedicated cattle scene if the default scene is active.

Regenerate all four from the project directory in PowerShell:

~~~powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/author-cow-animations.py -- --source 'Assets/Characters/Cow/Adult female/cow-female-adult-textured.glb' --output 'Assets/Characters/Cow/Adult female/Animations' --variant adult-female
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/author-cow-animations.py -- --source 'Assets/Characters/Cow/Baby/cow-baby-textured.glb' --output 'Assets/Characters/Cow/Baby/Animations' --variant baby
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/author-cow-animations.py -- --source 'Assets/Characters/Cow/Young Adult/Cow-young-adult.glb' --output 'Assets/Characters/Cow/Young Adult/Animations' --variant young-adult
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/author-cow-animations.py -- --source 'Assets/Characters/Cow/Adult Male/cow-male-adult-textured.glb' --output 'Assets/Characters/Cow/Adult Male/Animations' --variant adult-male
node scripts/prepare-meshy-cow.mjs
~~~

Preparation writes `public/game-assets/cattle/<variant>/` and copies optimized
outputs into the source's `Animations/` directory. To prepare only one,
use `node scripts/prepare-meshy-cow.mjs --variant baby` (or another ID).
The four prepared runtime GLBs and their manifests are tracked in Git, so
Cow mode can load in a fresh checkout without Blender. Original sources and
editable outputs under `Assets/` remain local and ignored; preserve those
when moving workspaces. Regeneration requires these originals. The scripts
and documentation are tracked.

Preparation checks the source hash, four clips, finite keys, durations,
matching loop endpoints, one cow mesh, one skin, variant-specific joint count
and triangle count before and after compression. No geometry simplification
is applied. Color uses 1024px WebP; normal and material maps are resized to
512px and 256px, then encoded losslessly. Lossless encoding after resizing
does not mean the maps are pixel-identical copies of the source.

## Motion references

The proposed YouTube clip could not be played here:
https://youtu.be/sObyVL3oU6g . This is not motion capture or a frame-by-frame
reconstruction of that clip. The user-supplied grazing-cow reference photo
informed the forward-and-down neck curve.

Timing and hoof-contact design use primary research:

- [Kinematic gait characteristics of straight line walk in clinically sound dairy cows](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0253479), 2021.
- [The grazing gait, and implications of toppling table geometry for primate footfall sequences](https://pmc.ncbi.nlm.nih.gov/articles/PMC6012707/), 2018.

Cycle duration, speeds, head gestures and poses are artistic choices for these
stylized models, not measurements from the proposed video.

## Validation — 2026-10-08

All four clips on each new variant were inspected through the existing Lab's
public controls. Grazing was checked from side, front and RTS views, including
lowering and raising. Walk was inspected at several phases; the bull was
rechecked after shortening its stride. Human interaction was reviewed against
the fixed-height human. Playback, freeze, animation-preserving variant changes,
return to Human and mobile layout were checked. LAN access on port 5182 worked;
no page errors were reported.

The decoded runtime skinned meshes measured shoulder heights of 0.60000 m,
0.95000 m and 1.19996 m. All runtime clips had identical first and last keys.
The worst planted-target residual was 0.0501 mm (young adult Graze); the final
bull Walk residual was below 0.001 mm. These are target residuals, not a
promise of zero visible hoof sliding on arbitrary future terrain.

30 existing Character Lab/Meshy regression tests, TypeScript and production
build passed. The original GLB hashes match the authoring manifests. The adult
female runtime binary retains its approved hash. Visual evidence and numeric
measurements are saved in `docs/qa/cattle-animation/`.
