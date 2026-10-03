# Pillagers — Low-Poly Character Reference Guide

Version: `pillagers-character-style/0.4-draft`  
Date: 2026-10-03  
Scope: canonical visual direction for the Character Lab v0.4 upgrade. This document records requirements; it does not certify that assets have been generated, reviewed or implemented.

## 1. North star

**Caricature through silhouette and large sculpted planes — not realistic anatomy with a polygon filter.**

Return to the exaggerated proportions of the supplied illustrations. The recent base-body sheets are useful composition experiments, but are not authority for normalizing anatomy or enlarging hands/feet with body mass. The latest user requirement takes precedence: a bald, clean-shaven base with substantially different bodies and nearly identical low-poly head/face, hands and feet.

The four independent asset families are:

| Family | Visual responsibility | Must not contain |
| --- | --- | --- |
| Golden adjustable human | Body proportions, one common face/head, hands and feet | Hair, beard, weapons, outer costume |
| Hair and beard | Interchangeable graphic silhouettes | Replacement heads, baked skin, a private character rig |
| Clothing | Reusable garment silhouettes and large material regions | Another body, integrated hair or weapons |
| Socketed equipment | Readable item silhouette and attachment/grip frame | Character anatomy or an independent humanoid rig |

A striking individual hero is not the target. A coherent reusable character language is.

## 2. Reference inventory and precedence

Eight unique illustrations were supplied in the conversation; the repeated adult sheet is one source, not two. The associated local/task reference pack is named `pillagers-character-lab-v04-references.zip` and contains a filename/provenance/hash manifest.

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

Reference precedence:

1. Explicit user decisions in this guide and the v0.4 implementation brief.
2. Approved Golden Human proportions and the existing technical contracts.
3. The supplied illustrations for shape language, silhouette, simplification and palette.
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

Keep geometry reusable under material changes. Do not bake dramatic directional lighting, cast shadows, names or sheet labels into albedo. A texture may carry intentional flat color regions; it must not be the only source of the low-poly impression.

Use soft neutral review lighting and a second flatter diagnostic mode. The parchment backgrounds and cinematic poses in the illustrations are presentation, not part of any exported asset.

## 11. Image generation contract

The implementation agent generates its own concepts through an actually available image-generation capability. A written prompt or a procedural placeholder is not evidence that image generation ran. Check capability, references and any required authorized budget first; record a blocker if unavailable.

Use this shared prompt prefix, followed by a narrowly scoped asset-family instruction:

> Pillagers modular character design. Strongly caricatural Nordic-fantasy silhouettes, intentionally sparse broad planar facets, simplified angular facial construction, tapered sculpted limbs and muted earthy colors. Match the supplied reference shape language, not realistic human anatomy. Preserve the approved Golden Human head, hands, feet, scale and technical pose. Design only the requested module. No realistic skin, tiny cloth wrinkles, strands, ornate armor, baked lighting, integrated equipment or background scenery.

Generate in this order: Golden Human views and body comparisons, a single compatible hair/beard/garment/item proof, then the remaining family batches. One contact sheet is not an image-to-3D input for a whole modular library. Use separate approved views/isolated candidates and track which output belongs to which asset.

All isolated export/reference cutouts requested as transparent must be actual alpha PNGs. Inspect against both light and dark backgrounds. Reject opaque checkerboards, background remnants, colored fringes, accidental holes and cast shadows left around silhouettes. Labels belong outside isolated asset images.

Save the exact prompt, tool/model identification when available, reference IDs/hashes, job ID, parameters, output path and review outcome. Reuse accepted results rather than regenerating on every validation run. Multiple generated views may disagree; reconcile them before treating them as 3D construction authority.

## 12. Visual acceptance rubric

A candidate is accepted only with recorded reference/render evidence for all applicable checks:

- **Silhouette:** deliberate caricature, distinct body or module, recognizable without decorative color and at an actual fixed RTS camera.
- **Shared construction:** adult head/hands/feet remain standardized; modules do not redesign the underlying person.
- **Facet language:** broad purposeful planes, no realistic anatomy or random dense tessellation.
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
