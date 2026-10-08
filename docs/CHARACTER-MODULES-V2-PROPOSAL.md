# Draft proposal for character modules v2

Date: 2026-10-08. Scope: clothing, hair, beards and accessories for the Meshy Human selected in Character Lab.

## Current priority — fitting proof, 2026-10-08

Retain the existing adapter, sockets, native bindings and module switching. The current **tunic, trousers and boots are a fitting test fixture**. Clothing artwork quality is not the immediate acceptance gate; do not spend further work polishing it. After the fitting foundation works, the user intends to create more detailed models in Meshy.

Prove fixed contact rims, correct shared native skinning, hidden covered body parts, complete restoration and swaps on **neutral, narrow and broad adults during Idle, Walk and Run**. Inspect normal Lab views and a fixed RTS view. Check all three body LODs, including the actual visible skin at clothing openings. Preserve source ownership and exact binding identities.

Keep the fixtures as **previews**. Appearance approval is required for later promotion, but does not block this technical fitting milestone. A future Meshy clothing export still needs compatible native skinning and prepared contact/binding data; this proof does not imply automatic fitting of arbitrary models.

Defer further artwork refinement, hairstyle/beard/accessory library expansion and general fitting research. Child/older qualification, compound extremes, further clips and crowd performance are follow-up work. Existing proof modules and infrastructure remain available.

Milestone evidence:

- Fixed source-derived neckline, wrist and boot rims; shared native skeleton and coincident sewn corners.
- Coverage at each body LOD, partial cuts at cuff openings and matching skin/clothing boundary subdivisions; original geometry returns on removal.
- Neutral/narrow/broad Idle/Walk/Run samples plus front, side, back and RTS browser views.
- Exact editable Blender source, recipes, exports and per-LOD binding identities; no asset promotion.

The architecture below remains the retained foundation and later roadmap. This priority supersedes the earlier art-first milestone.

Build reliable contact geometry from the actual Meshy Human and produce modules through editable Blender templates and recipes. Approved concepts determine the outer design; the body supplies the fitting surfaces, scale, symmetry frame and rig. Render every technical view from one resulting 3D source. The main investment is a small set of templates that pass fit, animation and visual review before producing controlled variants.

This proposal uses the user's clarified Lab selection, Meshy Human. The separate Golden r3 preview is a different asset. The earlier r3 mirror diagnostic does not describe the selected Meshy Human. Existing source-chain policies and acceptance rules remain in force until the corresponding proposed changes are adopted.

## Confirmed master and runtime

The editable geometry master is [Human-textured.glb](../Assets/Characters/Human/Human-textured.glb), source SHA-256 `be5173fa4f3b6e63fa7bc3506b3d61b4def28b7f67477b9a29b5eb527d80f8fe`. Preserve this user-authored source and its native SmartRigArmature/Mixamo rig. It has 44 skin joints, 14 animation clips, 7,644 triangles, one material, three authored textures and no authored morph targets.

The prepared assets are:

| Body LOD | Triangles | Exact asset hash |
| --- | ---: | --- |
| LOD0 | 7,644 | `8e07d3e1fcf61f4114557e36bc08f2f2fd8c634fb5b3c09b4f746e387caeadfe` |
| LOD1 | 3,221 | `d5639e39b84e3a8616b28722db31be643585d10483fee74088a5477bf6df7bfd` |
| LOD2 | 3,219 | `d2a05aa67337187686325f40e9dd2c4c5867517c933a09aefb857594f2faa682` |

The current World path uses LOD2. All three exports retain the same source frame and full rig/clip set. Their approximately 6.1 MB size is mostly textures and animation data; triangle reduction alone is insufficient to optimize transfer size. LOD1 and LOD2 differ by only two triangles because the current simplification error limit prevents further acceptable reduction.

At the initial baseline MeshyHuman exposed no fit system and disabled module/debug controls. The implemented native adapter, sockets and preview lifecycle are now retained. Its proportions come from native bone scaling and height normalization in MeshyHumanDynamics, with additional pose adjustments in MeshyHuman. The legacy Golden body morph targets and PillagersHumanRig are not its deformation system. The native adapter is the retained boundary for the fitting proof.

The supplied four PNGs communicate the intended character and shape language. Contact dimensions and masks must come from the confirmed GLB. A neutral vertex-to-triangle mirror diagnostic on the original source measured a maximum 3.39 mm and 95th-percentile 0.93 mm residual around the midpoint of its X bounds. The upper-head samples had a maximum 1.58 mm residual. These samples support using the body as the construction reference while still measuring symmetry explicitly; they are not continuous surface, rig, animation or fit certification. Do not silently edit the master to make a report pass.

## Lessons applied to v2

| Earlier problem | V2 construction rule |
| --- | --- |
| Separately generated views changed the person or disagreed | Render front/back/left/right from the same 3D source with recorded scale and cameras. |
| Generated heads and clothed figures introduced a second fitting reference | Derive contact templates from the exact Meshy body. Export only module geometry. |
| Bilateral shapes and contact edges were inconsistent | Mirror template construction and explicitly declare intentional design asymmetry. |
| Collision repair inflated or bent the design | Fit contact regions during authoring and bound changes to the exterior silhouette. |
| Triangle reduction retained noise or damaged shape | Author broad panels first and protect silhouette, openings, contact edges and joint loops. |
| Structural PASS was treated as visual approval | Require separate geometry/fit and actual render review for the same final asset hash. |
| Repairs and generation continued without measurable progress | Cache each stage and stop candidates that cannot pass a bounded repair. |

Earlier local QA provides concrete examples: the coherent bun fit needed a 9.99 mm radial adjustment that changed its positions, volume and planes while visual acceptance remained on hold. The revised chin concept review approved a conversion input while explicitly leaving front silhouette, dimensions and lower-lip fit unproven. A better contact template addresses these problems earlier in production.

## A shared fit interface on the native Meshy rig

Reuse the existing socket vocabulary, metadata conventions, registry, coverage concepts and Lab review tools. Refactor their rig-specific assumptions behind a BodyFitAdapter, implemented first as MeshyBodyFitAdapter. Keep one shared fitting contract with different body adapters; do not rename the 44-joint source into the older 27-bone rig.

The adapter exposes neutral and posed body surfaces, source identity, canonical metre coordinates, native skeleton/bind state, semantic regions, named rigid frames, and body-change revisions. Extend source-authored surface calibration to this body and explicitly remap it for each prepared LOD. The existing regional garment barycentric transport is useful implementation material, but its old reference dimensions and Golden calibration are not Meshy fitting data.

Use the prepared pillagersFrame and the same body-local hierarchy, offsets and dynamic height normalization as MeshyHuman. Modules must follow the exact transforms used by the body. Do not import the Golden preview's 0.8 presentation multiplier or its canonical head dimensions into this path.

Meshy's present bone proportions already deform clothing that shares its skinning state. Build clothing against the source bind geometry and native skeleton, then validate the same proportional and pose adjustments. If actual shape morphs are added later, declare a new body deformation contract and corresponding bindings. Current DNA controls do not imply that the old authored morphology targets exist in this source.

## Slots sockets and surface bindings

A **slot** decides what can coexist. A **socket** provides an attachment frame. A **surface binding** describes how a module follows a deforming surface. A **fit template** contains reusable contact construction and declared free regions. A tunic needs skinning and surface correspondence even when its metadata names a chest socket.

| Module | Attachment and fitting |
| --- | --- |
| Short hair or tied hair | A skull contact cap derived from the Meshy head; native Head drives ordinary animation. |
| Beard | An authored lower-face contact patch with a separately shaped free beard volume. |
| Tunic trousers and sleeves | Region-constrained surface correspondence and the character's native skeleton. |
| Skirt apron or shoulder wrap | Waist/shoulder contacts plus free panels with deliberately authored weights. |
| Sword pouch or rigid ornament | An item frame composed with a supported body or garment socket. |
| Necklace or strap spanning moving regions | A fitted/skinned accessory when one rigid socket cannot maintain contact. |

Retain the 16 existing semantic socket IDs. Add body-specific frame definitions that map them to the Meshy skeleton. Examples include Head to mixamorig:Head, Chest/back to mixamorig:Spine2, Hips to mixamorig:Hips, hand frames to mixamorig:LeftHand/RightHand, and forearm frames to mixamorig:LeftForeArm/RightForeArm. Shoulder parenting needs a reviewed surface and motion decision rather than an automatic string substitution.

Each definition needs an authored neutral orientation, parent bone, source-bound anchor and mirror relationship. Surface anchors should support a semantic triangle plus barycentric coordinates; geometric identity must account for duplicated render corners. Grip sockets can retain a measured rigid frame where a surface normal would give the wrong handle orientation. Derive the left/right pair from a shared frame and use valid rotations with positive scale, avoiding negative-scale mirrored transforms.

Evaluate morphology-dependent rigid frames when DNA or body proportions change, then let normal animation move them through the parent bone. Accessories needing several moving influences use skinning. A fitted tunic may expose its own belt_front or belt_side_L frame for a pouch. Declare the dependency so replacing the tunic cannot leave an orphaned object.

## Editable templates

Create a Blender master from the confirmed source with its rig correspondence, neutral pose, semantic regions and measured symmetry frame. Preserve the original GLB. A roundtrip must retain scale, bind state and the inspected silhouettes before template work begins.

Each template contains a non-rendering contact reference, the actual module mesh, locked boundary groups, free-volume groups, broad material regions and relevant bindings. Export only the module. A skull helper must not become an invisible replacement head inside a hair asset.

For **hair**, derive a cap and hairline from authored skull regions. Add grouped locks, a crest, knot or braid as deliberate masses. The contact cap stays stable while the outer silhouette varies. Long hair needs separate shoulder/neck and animation checks.

For **beards**, author a patch that respects the lower lip, mouth opening, chin and under-chin. Grow short, square, tapered or braided volumes from it. Preserve facial recesses rather than applying a universal spherical outward projection.

For **clothing**, construct large panels around measured neckline, armhole, waist and cuff boundaries. Fitted clothing may begin with a body-derived shell; a loose tunic or skirt needs authored volume and free hems. Keep trousers, straps and outer layers separate in the source. Layers touching at one pose must not be welded or receive averaged seam weights.

For **accessories**, author a measured item frame and supported carry frames. Scale from the relevant body core; attach clothing ornaments to the garment where appropriate. Declare compatibility for combinations such as a pouch on a belt or long hair above a shoulder wrap.

Use Blender's [Mirror modifier](https://docs.blender.org/manual/en/5.0/modeling/modifiers/generate/mirror.html) for bilateral construction. Use [Shrinkwrap](https://docs.blender.org/api/4.5/bpy.types.ShrinkwrapModifier.html) only on declared contact groups, with an authored offset and bounded projection distance. [Data Transfer](https://docs.blender.org/manual/en/3.6/modeling/modifiers/modify/data_transfer.html) can assist weight authoring; the resulting bindings and weights must remain reproducible and compatible with the renderer's supported influences.

A visually symmetric template and an approximately symmetric body may have different small residuals. Measure both sides against the actual body, report these separately, and determine the permitted contact tolerance from the proof asset. Intentional asymmetry, such as a side braid or one-sided pouch, belongs in a declared design region rather than an accidental fitting error.

## Recommended production route

The recommended route is hybrid: concepts determine the approved design, while scripts and editable templates construct reliable geometry. A 3D provider can supply a novel free volume or standalone item, followed by template integration. Generating another complete person is an unnecessary source of fitting uncertainty.

1. **Freeze the master and frames.** Record body, rig and LOD identities, supported proportional controls, semantic regions and reproducible neutral cameras. Capture colour, grey and silhouette views from this source.
2. **Specify one module.** Choose its template, silhouette, contact boundaries, free regions, palette, layer rules and provisional budget. Use a reviewed concept when a new design needs one. Apparent concept dimensions do not overwrite body measurements.
3. **Construct one editable 3D source.** Build through a Blender recipe and deliberate authoring. If a provider supplies geometry, isolate it and integrate it into the contact template. Reject candidates requiring another head/body or excessive silhouette distortion.
4. **Author broad facets and boundaries.** Establish panels, openings and articulation loops. Mirror the declared regions and verify neutral contact and silhouette before binding.
5. **Build bindings and weights.** Once topology is stable, save region-constrained body-triangle correspondences, stand-off vectors, seams, native bind data and normalized weights. A sleeve cannot bind to the opposite arm; a free skirt cannot inherit competing leg surfaces.
6. **Export and validate.** Bake broad material regions to mapless linear COLOR_0 and export the GLB, binding and provenance sidecars. Load through the ordinary Meshy factory/adapter and Lab.
7. **Review and register.** Bind technical and visual evidence to the exact final bytes, then admit the asset to the compatible-body registry.

Every technical front/back/left/right view comes from this same 3D source. Imagegen remains useful for designing silhouettes and material regions; its separately generated views are not independent construction authorities. Automated variants stay within the reviewed template's parameter ranges. A novel silhouette still needs a new design review.

The [current visual guide](PILLAGERS-LOW-POLY-STYLE-GUIDE.md), [Lab tools policy](CHARACTER-LAB-V04-TOOLS.md) and provenance checks prescribe actual Imagegen → reviewed concept → 3D-provider conversion for new designs. Adopting template-authored geometry requires revising that authoring policy explicitly. Record authored-template geometry and actual concept/provider lineage truthfully; do not call authored facets unchanged provider output. Preserve the existing silhouette, facet, colour and review requirements. Keep dated reports and earlier assets' acceptance status intact.

The clarified selection establishes Meshy Human as this proposal's body reference. It does not make old hair/clothing calibrated for other bodies compatible. New modules are authored for the Meshy master and identified accordingly.

## Binding data and runtime ownership

Add a versioned sidecar containing module identity, compatible body/LOD hashes, rig signature, template/recipe versions, coordinate frame, stable correspondences, stand-off vectors, contact/free regions, sewn-seam groups and garment attachment frames. Keep authoring and review metadata separate from runtime payloads.

Extend the shared fit contract, provisionally to pillagers-fit/0.2, alongside the existing 0.1 reader. V2 is the module-system name, not a second humanoid skeleton. Extend compatibility beyond the old lab-v04 scope with explicit body and rig identities; stale or mismatched bindings must fail clearly.

Bind garments to each instance's actual Meshy skeleton and bind matrices. The source may carry more influences than the renderer uses, so influence reduction must be declared and checked through posed geometry, not assumed exact. Do not duplicate the 14 animations or the body's three textures into every garment export.

Fit and derive correspondence once on equip or relevant body changes. Ordinary animation uses the native skeleton, including the existing proportional and pose adjustments. Avoid per-frame nearest-surface searches and iterative collision repair. Modules must share the body's scale/grounding hierarchy and follow any relevant live bone adjustments.

Cache immutable sources by body/rig identity, template/recipe versions, style policy, tool versions and settings. Each instance owns mutable skeleton state, fitted geometry and material colours. Recolouring or equipping one character must not change another or a pinned Lab comparison.

## Layering coverage and low-poly style

Start with the existing upper/lower/full/over wardrobe slots and add explicit accessory occupancy and dependencies. Hide only approved body triangles or bounded regions beneath the garment, retaining boundaries needed at openings. Masking cannot fix a floating neckline or invalid cuff. Removing a module restores its masks and dependencies from immutable source data.

New modules follow the existing broad-facet visual language: chunky grouped hair/beards, large garment panels, restrained muted colours, deliberate silhouette edges and geometry spent on articulation. Use opaque linear RGB(A) COLOR_0, a neutral white base-colour factor and no albedo dependency. Keep split colour/normal corners coincident with their skin data. Neutral-material renders must still show the intended facets.

The Meshy master currently uses authored base-colour, normal and material textures. Preserve its inspected appearance for the first fitting proof. A later body colour conversion is a separate source-preserving proposal and visual review; the selected textured body is not already certified by the mapless body-proof profile. Match new modules to actual body renders as well as the intended guide.

## Optimization and initial budgets

These are planning ranges for the first proof, not adopted validator limits:

| Family | Initial triangle range |
| --- | ---: |
| Hair | 150–600 |
| Beard | 100–400 |
| Simple upper garment | 350–800 |
| Lower garment | 250–600 |
| Small overlay or accessory | 60–300 |
| Rigid equipment | 150–800 |

Aim initially for roughly 1,700 visible garment triangles and about 7,500 total triangles for a simply equipped character using the current 3,219-triangle body LOD2. Freeze actual family profiles after proof assets and fixed RTS renders establish viable budgets. Measure render vertices and draw calls as well as triangles. Close-view budgets must account separately for the 7,644-triangle body LOD0.

Reduce geometry in a controlled sequence: remove helpers and unused interiors, simplify broad panels while protecting contacts/openings/joint loops, rebuild binding correspondence for each changed topology, then bake colours and normals. Mirroring must survive LOD generation; generic simplification is not automatically symmetry-preserving. Never carry unremapped raw triangle IDs across an optimizer.

Use the pinned glTF Transform/meshoptimizer dependencies and existing decoder support. [Meshopt compression](https://gltf-transform.dev/modules/functions/functions/meshopt) reduces transfer payloads for geometry and animation; it does not reduce draw calls by itself. Recheck contact and silhouette after quantization/decoding. Retain the authoring master and its original semantic calibration.

Target one material per visible module. After independent module proof, combine garment pieces sharing material and skeleton only where draw-call measurements justify it. After the first outfit appearance approval, benchmark actual World rendering with 10, 25 and 50 characters at a fixed camera and recorded hardware/settings, including equip/refit time and memory. Treat the body's repeated texture/animation payloads as a separate optimization opportunity rather than promising a smaller file from fewer triangles.

## Acceptance gates

| Gate | Required evidence |
| --- | --- |
| Master and adapter | Exact source/LOD identities; neutral mirror and paired rig/weight checks with deliberate asymmetry disabled; semantic regions; native bind/export roundtrip and correct scale/grounding. |
| Construction | Declared contact/free regions, intended openings, bounded exterior distortion, correct bilateral construction and no body/head remnants. |
| Geometry and style | Valid normals/winding, family-appropriate topology, measured budgets, mapless palette and actual grey/silhouette/facet renders. |
| Fit and motion | First milestone: neutral, narrow and broad adults during Idle/Walk/Run, contact rims, layer continuity and covered-body restoration. Child/older qualification, compound extremes and additional clips are deferred. |
| Lifetime and LOD | Swap/remove, mask restoration, stale-binding rejection, snapshots, independent instances, supported carry frames and matching bindings at each body LOD. |
| Runtime | Next milestone: exact exported bytes through ordinary Meshy Lab controls and fixed RTS review. A matched World performance sample follows appearance approval. |

Qualify child growth separately from the adult proof and preserve existing beard eligibility. Do not claim the older six sculpted Golden presets are authored Meshy morph targets. Broaden animation coverage to the remaining available clips before declaring general support, distinguishing new module defects from pre-existing body self-contact in a pose.

Record master symmetry as a measured baseline. Require template symmetry by construction where declared, then measure contact clearance against both actual sides and every relevant LOD. Start head-module clearance experiments from the existing hair/beard values of 4/3 mm in the documented canonical frame, after explicitly mapping that frame to this source; choose garment offsets by region. Freeze the Meshy-specific method and tolerances before acceptance rather than inflating modules until a check passes.

Intentional hairlines, necklines, cuffs and hems may be open boundaries. A closed-body topology profile is not a universal module profile. Test accidental holes, self-crossings and inter-layer collisions separately. Inspect actual poses; finite samples do not certify a continuous deformation domain. Visual acceptance remains required even when geometry checks pass.

Limit the first candidate to one focused repair pass. If it cannot pass within its fit allowance while retaining the approved silhouette, revise the template or design. Preserve failed evidence, resume cached external jobs and retain the existing limits on candidates, time and approved provider spend for the optional provider route.

## Delivery sequence

1. **Meshy master and adapter proof.** Freeze the source, create semantic surfaces and paired frames, establish the shared adapter/registry extension and demonstrate correct native-rig attachment, body proportions and LOD roundtrips.
2. **Adult outfit fitting fixture.** Use the existing tunic, trousers and boots to prove fixed contact rims, shared native skinning, bounded body coverage, restoration and module switches. Test neutral, narrow and broad adults during Idle, Walk and Run at each LOD. Retain existing hair, beard and pouch proofs. Defer their expansion and further artwork polishing; keep preview status.
3. **Reproducible production.** Convert accepted sources into Blender recipes, add binding sidecars and reviewed family profiles, enable Meshy selectors/debug through actual capabilities, and verify clean rebuilds. Extend snapshots with exact module/binding identities.
4. **Library expansion.** Add further styles and compose outfits from compatible pieces. Qualify long hair, skirts/overlays and child support before claiming them.

The next milestone proves fitting with the existing outfit fixture and reproducible contact/motion/lifecycle evidence. The current artwork is not its acceptance gate. More detailed Meshy models and further library work follow that fitting proof; the fixture remains a preview.

## Repository integration

Add the adapter at the MeshyHuman factory/runtime boundary and refactor shared fitting assumptions in AttachmentContract, CharacterFitSystem and GarmentFit. Extend CharacterAssets/CharacterPresentation and Lab controls through the shared compatible-body registry. Keep the native rig and animation mapping in MeshyHuman; do not send it through the old UniversalHuman constructor just to obtain sockets.

Add authoring/binding builders beside the existing asset pipeline and keep Blender 4.5.9 unless a demonstrated requirement warrants an upgrade. Store editable templates and recipes under the project's asset conventions; keep generated GLBs, binding and provenance sidecars in corresponding module directories. Account for the ignored local source/assets when documenting clean-checkout setup.

When adopting the proposal, update current Meshy integration, attachment, source-chain and registry documentation together. Preserve historical QA. Keep Lab UI text in English. Run required checks on the actual implementation head, report inherited failures separately, and keep PRs draft until all required checks pass.

References: [current guide on GitHub](https://github.com/sidesliders1983/Pillagers/blob/main/docs/PILLAGERS-LOW-POLY-STYLE-GUIDE.md), [Meshy integration](MESHY-HUMAN-INTEGRATION.md), [Meshy runtime](../src/characters/MeshyHuman.ts), [Meshy asset identities](../src/characters/MeshyHumanAssetIdentity.ts), [Attachment and Fit contract](CHARACTER-ATTACHMENT-FIT-CONTRACT.md), [asset registry](characters/asset-registry.md), [coherent bun fit workspace receipt](../artifacts/character-lab-v04/vertical-slice-qa/head-shell-coherent-fit/HANDOFF.md), [chin concept workspace review](../artifacts/character-lab-v04/vertical-slice-qa/chin-isolation-r2-review/REVIEW.md). The workspace receipts are historical local evidence; fresh implementation checks own the new acceptance decision.

Current fitting evidence: [Meshy outfit fitting proof](qa/meshy-modules-v2/REPORT.md). The fixture remains a preview; clothing artwork is deferred.
