# Cattle animation prototype — adult female

The existing Character Lab offers **Character → Cow · adult female** at
`/character-lab?model=cow`. Human remains the default and retains its DNA,
appearance, LOD and comparison controls. There is no additional lab route.

Only the adult female is authored. The other cattle models have different
skeletons (39, 46 and 50 joints); clips need adaptation before those variants
can be offered.

| Clip | Lab label | Duration | Blender frames |
| --- | --- | --- | --- |
| Idle | Standing | 6 s | 1–181 |
| Graze | Grazing | 12 s | 1–361 |
| Walk | Walking | 1.5 s | 1–46 |
| HumanInteraction | Human interaction | 6 s | 1–181 |

The four ordinary baked bone animations have matching opening and closing
poses. Graze includes lowering, feeding posture and raising; there are no
extra public transition clips. A separate anatomical jaw bone has not been
verified, so the prototype uses muzzle/head motion.

The runtime cow has a **1.10 m withers height**, measured on the shoulder
surface rather than the higher head/neck. A uniform parent transform scales
the authored model; its mesh, weights and proportions are preserved. The
optional reference human is fixed at **1.65 m**.

Walk is in place at approximately 0.37 m/s after physical scaling, with HL → FL → HR → FR footfalls and contact for
64% of the hind-leg cycle and 68% of the foreleg cycle. The Lab's moving grid
follows that pace. World playback must match movement speed to playback rate
and model scale. Cattle gameplay rules and balances are unchanged.

Graze keeps a raised feeding pose: the muzzle-to-poll head axis stays near
75 degrees downward from horizontal (15 degrees away from vertical
downward) during 2.4–9.6 s. The muzzle stays approximately 0.16 m above
the ground. Gentle Blender
Z-axis turns originate in the body (1 degree), shoulders (1.25 degrees), neck
(1.5 degrees) and head (3 degrees). Head turns use the world vertical axis
after pitch correction. IK holds all four hoof targets during these turns.
The optional Meshy Human faces the cow as a visual reference.

## Editable source

Original, unchanged:
`Assets/Characters/Cow/Adult female/cow-female-adult-textured.glb`

Outputs in its `Animations/` directory:

- `cow-female-adult-animations.blend`: editable Blender 5.2.2 file, four Actions.
- `cow-female-adult-animated.glb`: full texture export, about 6.59 MB.
- `cow-female-adult-runtime.glb`: optimized browser version, about 0.91 MB.
- `authoring.json` and `runtime-manifest.json`: source identity and measurements.

In Blender select SmartRigArmature, open Dope Sheet → Action Editor, choose
an Action, and set the timeline end to its frame count above. Disabled IK
constraints and targets are authoring guides; saved Actions use baked keys.

Regenerate from the project directory in PowerShell:

~~~powershell
& `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` --background --factory-startup --python scripts/author-cow-animations.py -- --source `Assets/Characters/Cow/Adult female/cow-female-adult-textured.glb` --output `Assets/Characters/Cow/Adult female/Animations`
npm run assets:cow
~~~

Preparation writes `public/game-assets/cattle/adult-female/`. It checks four
clips, finite keys and their durations, one cow mesh, one skin, 67 joints and
5,250 triangles before and after compression. Geometry and weights remain
preserved. Color uses 1024px WebP; normal and material maps are resized to
512px and 256px and encoded losslessly. Encoding is lossless after resizing;
the maps are not pixel-identical copies of the source.

## Motion references

The proposed YouTube clip could not be played here:
https://youtu.be/sObyVL3oU6g . This is not motion capture or a frame-by-frame
reconstruction of that clip.

Timing and hoof-contact design use primary research:

- [Kinematic gait characteristics of straight line walk in clinically sound dairy cows](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0253479), 2021.
- [The grazing gait, and implications of toppling table geometry for primate footfall sequences](https://pmc.ncbi.nlm.nih.gov/articles/PMC6012707/), 2018.

Cycle duration, speed, head gestures and poses are artistic choices for this
stylized model, not measurements from the proposed video.

## Validation

41 existing Character Lab/Meshy tests, TypeScript and production build passed.
All four clips were inspected in the existing lab. Its freeze/playback,
camera, Human/Cow switching and mobile layout were checked through the UI.
The exported skinned mesh measured 1.10001 m at the shoulder. All four clips
had matching opening/closing keys. The preview reports a 1.65 m reference
human. Grazing head tilt was sampled across the feeding interval and the
revised loop was visually checked in the browser from side, front and RTS
views, including lowering and raising. The corrected reference angle is
15 degrees off downward vertical, not 15 degrees off horizontal. The original .glb retained its SHA-256; browser inspection had no page errors.
`authoring.json` reports IK target residuals, not a guarantee of zero visible
hoof sliding on every future terrain.

