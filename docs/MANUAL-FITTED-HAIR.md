# Manually fitted short hair in Character Lab

The native Meshy Human has two additional Hair choices: `Hair short · manual fit`
and `Hair short 2 · manual fit`. Both are explicit Lab previews. They use the
existing Human and its native skeleton; they are not separate character models.
They are not assigned automatically to Fjordplay residents.

The authoring inputs are `Hair-short.glb` and `Hair-short2.glb` in the local,
Git-ignored `Assets/Characters/Human/Manual-Fitting/` directory. Regenerate with:

```powershell
node scripts/prepare-manual-hair.mjs 'C:/CodexWorkspaces/Pillagers/Assets/Characters/Human/Manual-Fitting'
```

The preparation script bakes each existing node transform into metre coordinates,
preserving all vertex positions and triangle indices. It does not resize, recenter,
decimate or reshape the hair. It removes the embedded textures and UVs and emits
one opaque material with a white vertex-colour carrier. The existing module runtime
sets that colour from the DNA appearance, including age greying. The Lab's optional
manual colour override remains available; Auto uses DNA.

| Input | Triangles | Original GLB bytes | Prepared GLB bytes |
| --- | ---: | ---: | ---: |
| Hair-short.glb | 4,099 | 34,058,892 | 255,620 |
| Hair-short2.glb | 6,333 | 26,786,800 | 347,196 |

The export also creates bindings for the exact three frozen native body LODs.
Every vertex has a single full influence from the existing `mixamorigHead` joint.
No skeleton, body geometry, animation or body mask is duplicated in the hair.
Binding and geometry hashes are recorded in the catalog, measurement file and
source receipts. Published appearance assets and existing clothing stay available.

## Inspection

Source-to-export position differences are below 0.000001 m, from float32 storage.
Neither asset has unused vertices, degenerate triangles, duplicate triangles,
invalid normals or opposed normals. Both source meshes contain one tiny detached
triangle. After metric welding, the first has 15 non-manifold edges and the second
has 5. Their open boundaries and these source topology defects are preserved for
review; this integration does not claim watertight or repaired meshes.

`tests/manual-hair.test.mjs` checks exact body discovery, textureless payloads,
source receipts, binding hashes, shared skeleton ownership and no body masking.
It samples Native neutral, Idle and Walk at all three body LODs and checks that
hair vertices stay fixed relative to the Head. Child, elder and feminine DNA
changes also retain that attachment and apply their calculated hair colour.

Browser review uses the actual built Character Lab on LAN, with front, side and
back views in Native neutral for both styles. Animation and colour controls use
the normal Lab interface. Local inspection captures and detailed topology evidence
are saved under `C:/CodexWorkspaces/Pillagers/scratch/manual-hair-qa/`.
