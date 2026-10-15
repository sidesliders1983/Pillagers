# Character Lab clothing restoration

The original clothing candidates remained in the local ImageGen/Meshy worktree while main
continued to evolve. This change restores their frozen assets and clothing selection support
on the current main branch.

## Available choices

All choices use the existing Meshy Human and its native skeleton. They are explicit Lab
previews and remain outside automatic occupation/world selection and the published registry.

| Field | Label | Asset ID |
| --- | --- | --- |
| Full outfit | Grid trial · tunic and trousers | garment/meshy-grid-trial-001 |
| Trousers | Long skirt | garment/meshy-long-skirt-005 |
| Trousers | Short trousers | garment/meshy-short-trousers-006 |
| Shoes | Low shoes | garment/meshy-low-shoes-005 |
| Shoes | High shoes | garment/meshy-high-shoes-005 |

The long skirt and short trousers are included so both footwear combinations can be inspected.
Each pair of shoes retains the single generated shoe and its mirrored counterpart, including
UVs, reversed winding and the corresponding left/right native joints. The low shoe includes
the corrected posterior sole; its old heel flap is retained only as a regression fixture.

Select Human, choose the Meshy Human body source, then select a Full outfit or individual
clothing fields. A full outfit clears the separate clothing fields. Selecting a separate
piece clears the full outfit. Existing snapshots acquire empty separate fields when absent;
new snapshots pin exact body, clothing and binding identities.

Convenience routes:

- /character-lab?outfit=grid-001: the tunic and trousers full outfit.
- /character-lab?clothing=pass-005: long skirt and low shoes.
- /character-lab?clothing=pass-006: short trousers and high shoes.

## Fitting and limits

Frozen bindings validate exact source body hashes and topology for all three existing Human
LODs. Runtime clothing shares the body's skeleton, body proportions and height scale. The
static Native neutral inspection pose intentionally disables DNA deformation. Regression
checks cover DNA height/build changes, exposed chest retention below the tunic neckline,
reversible body masking and source material ownership.

These are restored prototypes. Numerical tests do not certify every animation frame or
DNA combination; the original tunic's motion/skirt fit remains a visual review limitation.
There is no per-combination fitting solver or separate Clothing ratio control. The later
rejected white shirt and laced farmer tunic are not restored by this change. The newer
verified Human animation extension from main remains available.

## Validation

Run the same checks as the Character contracts workflow:

- pnpm run build
- pnpm run validate:characters --lab-previews
- pnpm test

The additional regression files cover the full tunic, independent footwear/lower garments,
slot composition and snapshots, source-bound provider materials, and exact shared native rigs.
The original experimental worktree and its source/QA history are preserved separately.
