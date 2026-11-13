# Qualified field-tunic fitting under personal armor

This is a technical appearance contract. It changes no equipment ownership, crafting, protection, Core state, saved campaign rules, clock, or encounter facts.

A personal body-armor layer can fit a private copy of the exact normal field tunic through the existing prepared-native path. Both clothes share the resident's existing 44-bone native rig. The optional bodyArmorLayer.underlayFit payload has:

- version: 1;
- meshName: Module_grid_trial_top_0;
- maximumDisplacementMetres: a positive measured maximum, at most 0.08 m;
- vertices: unique original vertex IDs, with finite native-metre position triples;
- optional paired joints/weights: exactly four existing native joint IDs and normalized nonnegative influences from the qualified actual body support.

The armor layer pins garment/meshy-grid-trial-001 and source SHA-256 79794137e3e2bb33da24429d084cec0e5fb84711fdc4fd87c1568b1dabb4d52e. Preflight checks the original source mesh and vertex bounds, declared displacement, native influences, and effective opaque material before the live outfit is cleared. Body coverage and extra body-opening declarations remain forbidden for the armor layer.

At appearance time, MeshyModuleRuntime starts from the cached garment's fresh geometry clone. It replaces only declared positions and any declared native influences, then updates normals on adjacent source faces. All original indices, UVs, material slots, other garments, and unlisted positions/influences remain exact. Distant exposed normals stay exact. The existing inverse encoding and native binding then apply normally. There is no additional skeleton, shader, renderer, or per-frame fitting.

Unequipping armor, unsupported-age fallback, failed preparation, a second wearer, later wearers and borrowed portraits retain or restore their appropriate original geometry. The cached source is never rewritten. Ordinary clothing and legacy occupation headwear have no matching fitting declaration and keep their previous path.

The failed whole-triangle underlay-mask prototype is not the production contract. It was rejected because a single source face could protrude above an opaque panel in one pose while crossing its actual edge in another. The source model, opacity and exposed neck/sleeve/hem requirements are qualified with the fitted composite rather than hidden by a larger body mask.

## Verification boundaries

The public factory tests in tests/personal-armor-underlay-fit.test.mjs use two explicitly technical 1 mm offsets to verify the contract, failure atomicity, cache/twin isolation, topology/UV preservation, native influence restoration, age fallback and borrowed-portrait behavior. They do not establish artwork fit or physical clearance for the actual generated fitting data.

Actual source-form, motion, morphology/age/LOD, exposed clothing/body boundaries, gear contacts and rendered acceptance remain separate asset qualification evidence. Headless timing is not phone or GPU certification.
