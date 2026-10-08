# Pillagers — Low-Poly Character Reference Guide

Version: `pillagers-character-style/0.4-draft.1`  
Date: 2026-10-03  
Scope: canonical visual direction for the Character Lab v0.4 upgrade. This document records requirements; it does not certify that assets have been generated, reviewed or implemented.

Companion documents: [Codex multi-agent implementation brief and acceptance criteria](CHARACTER-LAB-V04.md) · [original source-reference manifest](references/character-lab-v04/manifest.json) · [supplemental reference metadata](references/character-lab-v04/supplemental-manifest.json).

This guide owns visual rules. The implementation brief owns delivery scope, agent ownership, validation gates and stop conditions. The existing character/fit/registry contracts continue to own technical semantics. Read them together; do not create a second style guide or parallel character framework.

## 1. North star

**Caricature through silhouette and large sculpted planes — not realistic anatomy with a polygon filter.**

Return to the exaggerated proportions of the supplied illustrations. The latest user-supplied six-build body sheet (original `1-Foto-1.jpg`, SHA-256 `7b5f890c3e0c4d31af7b7d5035136bde967c6a63e52897f0b9907305a203b766`) **is authority for adult body proportions and extreme silhouettes**, supplementing the original eight-image pack. Preserve the still-authoritative bald, clean-shaven base and shared adult low-poly head/face, hands and feet. The new sheet does not authorize enlarging those common parts with body mass, individual toes, painted anatomical detail or an exposed abdomen.

The four independent asset families are:

| Family | Visual responsibility | Must not contain |
| --- | --- | --- |
| Golden adjustable human | Body proportions, one common face/head, hands and feet | Hair, beard, weapons, outer costume |
| Hair and beard | Interchangeable graphic silhouettes | Replacement heads, baked skin, a private character rig |
| Clothing | Reusable garment silhouettes and large material regions | Another body, integrated hair or weapons |
| Socketed equipment | Readable item silhouette and attachment/grip frame | Character anatomy or an independent humanoid rig |

A striking individual hero is not the target. A coherent reusable character language is.

## 2. Reference inventory and precedence

Eight unique illustrations were supplied in the conversation; the repeated adult sheet is one source, not two. The associated local/task reference pack is named `pillagers-character-lab-v04-references.zip` and contains a filename/provenance/hash manifest. Its `MANIFEST.json` corresponds to the [repository manifest](references/character-lab-v04/manifest.json); verify hashes before visual work.

**The source illustrations are not embedded in this GitHub document or automatically available in Codex.** Attach the reference pack to the Codex task or supply a readable local reference directory. If neither is available, report that limitation before claiming direct image-reference validation. Do not treat a ChatGPT sandbox path as a repository asset path.

| Reference-pack filename | Original supplied filename | Extract from it |
| --- | --- | --- |
| `01-adult-silhouette-sheet.jpeg` | `C9E53543-E36F-4234-9C45-8CD4F45801B9.jpeg` | Strong adult silhouette contrast; broad shoulder masses, tapered limbs, layered angular costume forms |
| `02-child-proportions-sheet.jpeg` | `2D741FC8-5CED-40DC-86F9-9B2EA7F8CE7D.jpeg` | Age-aware proportion language only; do not use this as the adult measurement standard |
| `03-bearded-archetypes-sheet.jpeg` | `12ECE77F-498D-48C6-A9A7-E07A60CF0621.jpeg` | Distinct compact, broad and lean forms; large wedge-like beard volumes |
| `04-lean-warrior.jpeg` | `IMG_3963.jpeg` | Lean construction, angular simplified face, long tapered limbs, restrained detail |
| `05-spear-carrier.jpeg` | `IMG_3962.jpeg` | Compact stylized anatomy and simple, readable equipment |
| `06-broad-axe-carrier.jpeg` | `IMG_3961.jpeg` | Broad compact mass; big graphic beard and equipment shapes |
| `07-rounded-warrior.jpeg` | `IMG_3959.jpeg` | Rounded belly represented by large angular planes; short tapering legs |
| `08-stooped-elder.jpeg` | `IMG_3960.jpeg` | Posture, long narrow shapes and asymmetry without fine anatomical detail |

The additional 1280×960, 149,602-byte six-build sheet is recorded separately in the supplemental metadata; the original ZIP and its eight verified files remain unchanged. Its body masses, torso/limb relationships and posture direction govern Giant, Raven, Bear, Fox, Elder and Jarl. Keep the adopted adult common-part shape lock and <=5% bounds tolerance, central body-shape strength 0.6, maximum adult height 1.60m, and opaque white coverage over the full abdomen. The image remains task-local/private; metadata is not permission to publish it.

Reference precedence:

1. Explicit user decisions in this guide and the v0.4 implementation brief.
2. Approved Golden Human proportions and the existing technical contracts.
3. The latest supplemental six-build sheet for adult body proportions/extreme silhouettes, and the original eight illustrations for shape language, simplification, palette and module direction; explicit shared-part/presentation constraints remain higher priority.
4. Generated concepts, which remain candidates until reviewed.

Do not reproduce individual reference characters. Do not infer that a cloak, fur mantle or beard represents underlying body volume. Extract the design language, then author independent modules. Fantasy motifs in the illustrations are not a historical-authenticity requirement or an instruction to add helmets/armor to this milestone.

Original authorship and publication rights have not been verified here. Keep the source illustrations task-attached/local unless publication rights are confirmed; the reference pack is not a production asset license.

## 3. Silhouette and proportions

A body must remain recognizable as a distinct build when hair, beard, equipment and outer clothing are removed and the whole figure is rendered as one dark silhouette.

Use a small number of deliberate masses: shoulder span, chest block, abdomen, pelvis, upper/lower limb lengths and taper. Exaggerate their relationships. Avoid realistic anatomical subdivisions, bodybuilder muscle diagrams and proportion drift toward generic human templates.

Use these as visual test presets, not species, occupations, ranks or fixed gameplay classes:

| Preset | Body-only silhouette |
| --- | --- |
| Giant | Broadest powerful upper body and substantial limbs; tall within the agreed world range |
| Raven | Narrow elongated torso, long slim limbs; angular and visibly lighter |
| Bear | Compact broad torso, substantial belly and short strong legs; not merely Giant uniformly scaled down |
| Fox | Smaller wiry/athletic body, clear waist and agile limb proportions; not a gender-specific template |
| Elder | Leaner mass distribution and restrained stooped posture, driven separately from identity |
| Jarl | Balanced broad torso and upright stance; less extreme than Giant; does not grant a gameplay rank |

The presets must be reproducible configurations of one adjustable system. Do not independently generate six incompatible body meshes or six skeletons.

Do not invent a universal big-head ratio or reject ordinary adult height relationships solely because the latest sheet depicts them. Geometric plane language and anatomical microdetail are reviewed separately from those approved body ratios.

There is deliberately no universal head-to-height ratio for all bodies: the same adult head size against varying torso/limb proportions produces the intended caricature. Measure each approved preset at the same camera scale; do not auto-fit each portrait to identical height and thereby hide proportion differences.

## 4. Shared head, hands and feet — non-negotiable

**For the adult body-type comparison, use the same base shapes and nearly the same absolute dimensions, not merely similar relative proportions.**

- One bald skull/face construction: broad forehead/brow plane, simple cheek/jaw planes, a readable wedge-like nose and minimal mouth/eye treatment.
- One simplified hand construction per side: a compact palm/finger mass with a readable thumb; no detailed finger anatomy or extra finger-rig project.
- One low-poly foot construction per side: an angular wedge/block with a simple toe edge; no toe-by-toe detail project.
- Changing torso mass, shoulders, belly, arm/leg length or adult body preset must not silently scale or reshape these parts with the body.
- Morphology transitions should be absorbed by the neck, wrists and ankles, without seams, spikes or abrupt detached-looking joints.
- Keep adult head/hand/foot scale locked by default. Do not add ordinary `headScale`, `handScale` or `footScale` sliders that defeat this requirement.
- Preserve the separate existing child-growth behavior. Adult body invariance is not an instruction to give a child adult-sized hands/feet or to replace age-aware growth with uniform scaling.

Suggested measurable interpretation for Gate 0: after runtime presentation scale, adult head, hand and foot local-axis bounds differ by at most 5% from the approved neutral reference, measured in the neutral/rest pose and excluding hair, clothing and equipment. This is a proposed QA tolerance, not a measurement taken from the illustrations. Record the adopted tolerance and measurement method before authoring the library; do not silently broaden it to pass a failing asset.

## 5. Geometry and shading

Use intentionally placed broad facets, not random triangulation noise. Torso, limbs, face, hair and garments should share the same visual frequency. A forearm can read as a few tapered planar masses; it does not need separate veins, tendons and every muscle.

Flat/faceted surface treatment must survive neutral material and lighting tests. Painted triangles on a smooth silhouette are insufficient. Preserve deformation-friendly topology at shoulders, elbows, hips, knees and neck; low-poly does not mean broken animation.

Spend geometry on silhouette and articulation. Inherit the registry's measured budgets and establish family-specific targets at the first planning gate. Existing high-detail quality exceptions are not automatic budgets for every new hairstyle. Do not claim a triangle count from a concept image: measure exported meshes.

### Source geometry and bounded topology repair

Preserve the approved generated design, major planes, principal silhouette and intended openings. This does not require retaining generator folds, inverted inner walls or every noisy triangle. A negative winding sign is not evidence that a generated component represents intended air; bind material/cavity roles to the actual reviewed reference and source views before cleanup.

Exact native-plane arrangements are useful when they preserve both style and valid topology. If they create false windows or nonmanifold wall contacts, freeze that failure and propose one bounded source-landmark panel repair. Record every removed/changed/new facet and vertex, the source boundary correspondence, actual two-way surface deviation, silhouette/extrema changes and cavity controls. New repair facets must be labelled as authored cleanup, never falsely certified as unchanged native planes. Preserve the approved outer construction and use intentional broad inner panels; no new hairstyle design, body cutter, floating hole cover or per-seed/runtime workaround. Technical checks and independent neutral/silhouette visual review precede canonical fit and acceptance. The dated coordinator clarification and candidate-specific limits remain discoverable in the #18 evidence tree.

## 6. Golden-body presentation

The baseline is bald, clean-shaven and barefoot, with an opaque plain white sleeveless undershirt and opaque white fitted briefs/short trunks. The shirt covers the abdomen; no cropped-top variant. The underlayer follows the body closely and must not create outer-costume volume.

No accessories, jewelry, armor, boots, weapons, hair or beard in the Golden Human sheet. Use a neutral, technically reproducible pose with space between arms and torso and readable feet. Use the rig's established rest pose for technical views rather than silently introducing a different binding pose.

Required technical presentation: front, side and back on the same scale, plus an optional three-quarter illustration. A perspective beauty image is not an orthographic construction guide. Keep separate per-view files in addition to overview/contact sheets.

## 7. Hair and beard vocabulary

Create five distinct hairstyles and five distinct beard styles. None/bald/clean-shaven are options, not counted assets. Color variants do not count as separate styles.

Suggested compact initial vocabulary, to finalize against existing approved assets:

| Hair | Beard |
| --- | --- |
| Short angular crop | Short cropped beard |
| Swept medium crest | Squared full beard |
| Tied topknot | Tapered wedge beard |
| Single chunky braid | Split/forked beard |
| Shoulder-length grouped locks | Single braided beard |

Use chunky wedges, grouped polygon locks and readable gaps. No strands, realistic hair cards, wispy transparency or fine curls. Braids should read as a few interlocking sculpted masses.

Use exactly the same neutral head, pose and scale in all head reference views. Generated support heads are fitting references only and must not remain inside exported modules. Hair color and the existing post-45 greying behavior remain material-driven and independent of geometry. Do not generate separate meshes for each hair color or age.

## 8. Clothing vocabulary

Deliver six distinct outfit definitions: three masculine-presenting and three feminine-presenting. These labels describe garment cuts, not separate body pipelines or hard gender locks. Prefer compositions of the existing upper/lower/full-body/over-layer slots rather than inseparable hero meshes.

Suggested starting cuts:

| Set | Outfit direction |
| --- | --- |
| M01 | Short belted tunic and trousers |
| M02 | Longer work tunic, trousers and a simple apron |
| M03 | Simple tunic/trousers with a short sleeveless vest |
| F01 | Plain long dress with an apron-style overlayer |
| F02 | Belted knee-length tunic-dress with leggings |
| F03 | Plain long dress with a restrained short shoulder wrap |

Construct cloth from a few large hanging/tapering panels. Use belts as clear mass breaks. Keep wool, leather and optional fur graphic and sparse, not photorealistic. Do not expand the task into elaborate armor, rank costumes, giant capes or physics. Use the shared fit/cage/coverage system; a rigid socket does not make a tunic conform to an adjustable torso.

Neutral-material garment tests must prove silhouette independently of color. No generated body remnants, extra arms, baked weapons or hair inside the clothing export. Preserve intended openings at neck, sleeves and hem. Coverage masking must restore the underlying body when the garment is removed.

## 9. Socketed equipment vocabulary

Three initial item types: sword, spear and axe, with one representative low-poly mesh each. Use bold, simplified profiles, readable handles and restrained oversized heads/blades where useful at RTS distance. No tiny engravings or realistic edge microdetail.

The common hand/grip construction sets item scale, not the other way around. Author a stable item grip frame and map it through existing sockets. Moving an item from hand to hip/back must not require changing its geometry. A long spear needs an explicit, reviewed carry transform or a clearly reported unsupported slot; do not invent a visually invalid universal holster.

These are equipment/attachment validation assets, not a combat-system milestone.

## 10. Palette and materials

Favor warm cream, faded rust/red, muted ochre, earthy brown, sage/olive and charcoal/dusty blue-grey. Use broad value regions and restrained accent colors. Skin uses simple consistent shading, not pores or photographic texture.

Keep geometry reusable under material changes. Do not bake dramatic directional lighting, cast shadows, names or sheet labels into albedo. The user clarified on 2026-10-03 that vertices have one colour each, with a deliberate gradient allowed when needed. The default flat-facet rule below is the technical implementation of that intent, not a verbatim user requirement.

- Each exported vertex carries one RGB or RGBA colour value in `COLOR_0`. Default: all corners of a triangle, and all triangles/corners belonging to one intended polygon/facet, use the same facet colour. White underlayer regions are assigned to the source geometry's vertices/facets rather than painted as garment outlines inside a face.
- Deliberate vertex-colour gradients are optional. Declare their region/purpose and review the interpolated result; accidental sampling noise or baked illumination is not an intentional gradient.
- At a colour border, split colour attributes/vertex records as needed while keeping corresponding positions, skin weights and morph data coincident. Attribute separation must not create geometric gaps, loose seams or detached pieces. Place design-region borders on deliberate facet edges, not high-frequency subdivisions.
- No garment edge painted across the interior of a face. No dense diffuse-texture triangles, intraface colour noise or painted facets masquerading as geometric planes. Facet construction must still read under neutral material and lighting.

New hair, beard/face-covering, clothing and accessory designs follow actual Imagegen concept output → visual review → 3D-provider conversion → source-preserving optimization/canonical fit and colour quantization/bake → validation. Bake approved broad flat regions to `COLOR_0` by default; preserve only declared gradients. Retain the input/output hashes, palette/region/gradient decisions and conversion lineage. A prompt file, invented mesh design or texture-only polygon effect does not replace that source chain.

For the next accepted colour-pipeline proof, mapless base colour is an explicit export gate: linear RGB(A) `COLOR_0`, a neutral white material base-colour factor, and no albedo/base-colour texture dependency. Remove unused albedo images at export. Measure and record these properties; a valid attribute or a manifold mesh alone does not prove the reference style. Independently inspect neutral-material silhouettes and rendered flat-facet colours at matching front/side/back and fixed RTS cameras before acceptance. Generic runtime support or a passing structural report cannot replace that visual decision.

Current assets using legacy diffuse maps remain inspection-only until individually re-reviewed and migrated against these rules. Do not bulk recolour or convert them automatically. Dated screenshots, provenance and current Lab `pillagers-character-style/0.4-draft.1` labels describe the existing inspection state and are not retroactively reapproved or invalidated. Plan a separate next accepted-asset style revision with an explicit identifier, colour-pipeline proof, compatibility/snapshot handling and visual review before publication; this clarification alone changes no runtime style/version or fixture.

Proposed next candidate identifier: `pillagers-character-style/0.4-draft.2`. This is a plan, not an active runtime or accepted-asset version. Freeze it only with the first sourced colour-pipeline proof and Art Guardian review; then deliberately update accepted asset metadata and snapshot compatibility, retaining draft1 inspection history. No fixture/hash rewrite or automatic old-library migration accompanies this proposal.

Use soft neutral review lighting and a second flatter diagnostic mode. The parchment backgrounds and cinematic poses in the illustrations are presentation, not part of any exported asset.

## 11. Image generation contract

The implementation agent generates its own concepts through an actually available image-generation capability. A written prompt or a procedural placeholder is not evidence that image generation ran. Check capability, references and any required authorized budget first; record a blocker if unavailable.

Use this shared prompt prefix, followed by a narrowly scoped asset-family instruction and the flat-facet colour requirements from section 10:

> Pillagers modular character design. Strongly caricatural Nordic-fantasy silhouettes, intentionally sparse broad planar facets, simplified angular facial construction, tapered sculpted limbs and muted earthy colors. Match the supplied reference shape language, not realistic human anatomy. Preserve the approved Golden Human head, hands, feet, scale and technical pose. Design only the requested module. No realistic skin, tiny cloth wrinkles, strands, ornate armor, baked lighting, integrated equipment or background scenery.

Generate in this order: Golden Human views and body comparisons, a single compatible hair/beard/garment/item proof, then the remaining family batches. One contact sheet is not an image-to-3D input for a whole modular library. Use separate approved views/isolated candidates and track which output belongs to which asset.

All isolated export/reference cutouts requested as transparent must be actual alpha PNGs. Inspect against both light and dark backgrounds. Reject opaque checkerboards, background remnants, colored fringes, accidental holes and cast shadows left around silhouettes. Labels belong outside isolated asset images.

Save the exact prompt, tool/model identification when available, reference IDs/hashes, job ID, parameters, output path and review outcome. Reuse accepted results rather than regenerating on every validation run. Multiple generated views may disagree; reconcile them before treating them as 3D construction authority.

## 12. Visual acceptance rubric

A candidate is accepted only with recorded reference/render evidence for all applicable checks:

- **Silhouette:** deliberate caricature, distinct body or module, recognizable without decorative color and at an actual fixed RTS camera.
- **Shared construction:** adult head/hands/feet remain standardized; modules do not redesign the underlying person.
- **Facet language:** broad purposeful planes, no realistic anatomy or random dense tessellation; default constant facet vertex colours, declared gradients only, with coincident colour borders and no intraface painted garment edges.
- **Separation:** body, head modules, garments and equipment remain independent; no unintended source-body remnants.
- **Fit and motion:** no major floating, embedding, collapsed hems, disconnected sockets or severe clipping across the supported range and Idle/Walk/Run.
- **Presentation:** correct scale/views, inspectable alpha when required, no background or typography baked into exports.
- **Reusability:** changing color, body preset or supported socket does not require generating another mesh.

Technical success alone does not approve style. A style reviewer must inspect actual images/renders rather than rely on an asset author's status message. Minor prototype artifacts must be named and shown; they cannot be silently described as fully approved. Repeated failure should lead to a simpler compatible design or a bounded regeneration, not hours of unbounded fitting loops.

## 13. Existing implementation contracts

Reuse the current system; do not create parallel skeleton, socket or registry definitions in this guide. On inspection (2026-10-03), the developed character systems are on `codex/universal-human-v02`, inspected at commit `85d831174b9f9ddd81c7c442b19b44525deec6dd`; `main` is not an equivalent implementation snapshot. Re-check the actual working branch before implementation.

- [Canonical character contract at the inspected commit](https://github.com/sidesliders1983/Pillagers/blob/85d831174b9f9ddd81c7c442b19b44525deec6dd/docs/characters/character-contract.md)
- [Attachment & Fit contract at the inspected commit](https://github.com/sidesliders1983/Pillagers/blob/85d831174b9f9ddd81c7c442b19b44525deec6dd/docs/CHARACTER-ATTACHMENT-FIT-CONTRACT.md)
- [Asset registry and validation at the inspected commit](https://github.com/sidesliders1983/Pillagers/blob/85d831174b9f9ddd81c7c442b19b44525deec6dd/docs/characters/asset-registry.md)

This new brief specifies the intended v0.4 visual upgrade; conflicts with older artistic assumptions must be identified explicitly. It does not silently authorize changes to DNA semantics, world scale, age progression, beard eligibility or gameplay rules.


## 13. Mandatory candidate technical style gate

Before promoting any new v0.4 vertex-palette candidate, run the repository-controlled style policy and retain the exact source hash, profile hash and named diagnostics. For the current body proof use:

```text
npm run validate:style -- --family body-proof <local-candidate.glb>
```

The body-proof policy uses coplanar-region facets, at most 1,600 authored/rendered triangles, 4,800 authored/render vertices, one material and sixteen palette colours. It requires real authored and active-scene geometry, mapless linear COLOR_0, neutral white base RGB, separately opaque alpha, unit geometric-face-aligned corner normals and the selected topology checks. The generic utility ceiling remains 10,000 triangles / 30,000 vertices / two materials / sixteen colours; that ceiling is not a new family budget approval. Add another family profile only through a reviewed repository change with its actual budget and open/closed topology policy.

Profiles are strict typed declarations. Colour tolerance cannot exceed 1e-6, normal-length tolerance 1e-4, and hard-normal dot alignment cannot fall below .99999. Coplanar detection uses fixed .1-degree and 1e-6-metre tolerances. Unknown fields, weakened tolerances, empty scenes and malformed booleans cannot bypass the rules. The CLI accepts no untrusted profile, arbitrary budget/tolerance or GLB self-approval flags.

`--family diagnostic-triangle` is conditional diagnostic output only, including coplanar-boundary warnings; it cannot replace the body-proof policy. Optional mathematical gradients require an external trusted review bound to the exact source/profile hashes and exact declared scopes/stops. No gradient approvals are read from GLB extras, and the current CLI has no gradient-profile approval input.

Technical PASS is required but never sufficient: retain independent reference silhouette/facet, shared-core, morphology, attachment, animation and actual browser/fixed-RTS visual evidence. A corrected attribute-only proof may pass this utility while its source design or white garment boundary still fails visual acceptance. Legacy inspection assets are not automatically certified, converted or republished.


### Geometric self-intersection evidence

Manifold topology and constant facet colors do not prove that a surface is free of self-intersection. Before candidate acceptance, retain an exact-source geometric crossing audit in neutral rest and the supported morphology/motion samples, alongside actual grey/silhouette views. Distinguish nonadjacent triangle interior crossings from shared vertices/edges, tangencies and numerical near-zero contacts. Record the method, exclusions, source hash, region/pair IDs and measured overlap; disclose unsupported cases such as coplanar overlaps. Significant wrist/hand or face crossings block body acceptance even when the style CLI reports technical PASS. The current CLI does not perform this crossing audit; no style/profile flag can waive that limitation.
