# Native personal armor variants — #333

This extension adds the actual owner-supplied Leather Helmet and Iron-reinforced Body Armor. It does not recolor or rename an existing model. The original two-model [source and fit record](NATIVE-PERSONAL-ARMOR-333.md), its fourteen-artifact reproduction receipt and earlier browser/performance reports remain historical records of their measured revisions.

## Exact sources and authorization

| Item | Observed Drive source | Original bytes | Original SHA-256 |
| --- | --- | ---: | --- |
| Leather Helmet | [Meshy leather helmet](https://drive.google.com/file/d/1N0cubr7JuFgonOF8SYK-KzBm-9l_1VGW/view?usp=drivesdk) | 3,413,336 | `aa1ace130f8377da61a25253e975b917fbd9b86753dd1e7c5b0cab4ffe099a66` |
| Iron-reinforced Body Armor | [Meshy iron bust](https://drive.google.com/file/d/1p_kaHyRNed8w-G0YVWquLlS05YdbsIQF/view?usp=drivesdk) | 3,834,404 | `78ff9395653e12472c7dc792245f44b98e7c66e4cf16470fff4abc08a6f402e5` |

The owner supplied these files in the combat-assets folder and explicitly authorized their integration. Source possession and task authorization do not establish an independently verified open redistribution license. Original GLBs remain in ignored `Assets/Combat`; public output contains only prepared derivatives. No permissions were changed.

Both originals have one identity-transformed mesh, one primitive/material and a 2048-pixel PNG, with no rig or animation. Their geometry differs from the earlier pieces: the leather cap has 5,538 vertices / 5,101 triangles; the iron bust has 6,839 vertices / 6,697 triangles. Neither shares the existing model's index topology. [The source inventory](../qa/personal-armor-333/variants/source-inventory.json) records exact comparison evidence. Indexed weights or opening IDs are not copied between models.

## Preparation and preserved appearance

The existing preparation pipeline retains the complete original triangle indices, UVs, material color, real openings and separate decorations of each new source. It resizes the actual albedo to a 1024-pixel JPEG at quality 90 and recomputes normals after offline fitting. Each prepared asset has one material and uses the same native 44-joint skeleton. There is no generated replacement mesh, source mannequin, second rig, new clip or per-frame garment fit.

The iron bust uses its own actual 2,016-triangle main source panel and actual source inner/outer surfaces. Its initial bounds reuse the accepted bust dimensions, then the established native-body-supported smooth cage and final-point native LOD2 donors fit that real source. Small detached decorations retain common donor/translation support. Maximum source displacement is 78.75 mm, below the existing 120 mm preparation bound; maximum discarded influence mass before strongest-four normalization is 17.82%. Original metal plates, belt, stitches and openings remain present.

The leather cap uses its own measured opening plane, from 72 first actual radial wall contacts at 0.5 mm vertical resolution (maximum plane residual1.57 mm). Actual cavity rays then fit the existing native Head5/frame. An early minimum-volume candidate compressed its vertical scale to0.4; that was rejected after actual textured review. The final source-specific vertical/radial scale ratio is constrained to 0.95–1.10. The resulting scale is approximately `[0.70675, 0.72000, 0.81068]`; the native cap depth is 134.38 mm instead of the rejected 74.66 mm. Actual source/fitted front and side views confirm the source cap form remains recognizable.

The new cap's 96-angle /80-height cavity measurement includes a 6 mm all-null gutter below its real lowest surface. It invents no wall. This allows the existing bounded real-rim hair falloff to handle a measured100%-Head-bound hair triangle crossing the lower rim; distant exposed locks remain outside that local support. The new cap uses 5 mm of hidden-hair clearance after a bounded exact teen short-hair pilot: 4 mm retained a neighboring brow-rim contact, while 5 mm cleared actual hair and body with zero intersections or allowances. Its actual skull-fitting clearance remains 3 mm. The original iron helmet's GLB, binding and fitting branch remain unchanged.

## Iron-specific private underlay

`native-iron-body-armor-underlay-fit.json` is derived from the actual fitted iron main/belt/chest/waist panels and the same exact normal tunic/native LOD2 body. It is not the leather vest's footprint reused by name. It fits 23,559 tunic vertices, with 23,554 native-four donor records, maximum 69.329 mm displacement and a 30 mm geodesic boundary falloff. The source-body target is body + 3 mm under the opaque fitted layer; actual 8 mm tangent-neighborhood erosion protects real openings. Maximum discarded donor mass is 19.53%.

Runtime applies that declared fit only to the wearer's private normal-tunic clone on appearance change. All original indices, UVs and materials remain. Existing source caches, another wearer, native body coverage, and exact unequip restoration retain the [fit-only contract](PERSONAL-ARMOR-UNDERLAY-FIT.md). No whole-triangle underlay mask or new body cut is introduced.

## Current identities and reproduction

| Prepared model | Bytes | Triangles | SHA-256 |
| --- | ---: | ---: | --- |
| Leather Helmet | 636,128 | 5,101 | `fafaf39d0e7a1cc550199d33f2ef102c96e5f12aafe2462e97f0db3dd94fde33` |
| Iron-reinforced Body Armor | 744,320 | 6,697 | `bf9cc7cabc42ed3c9a570d27de5f08a4f7f9dcf412ccf5bc917f8c9fb3294d1c` |

The new cap binding is `40e327c7766620789d9f08cdcc10b1d83221fda10ee3a402257112d7257c99e4`; the new iron-bust binding is `2f776841ac4bc51c88bd96fe18a39c20b7adfa55827344c1099210d5e9ba547c`. All six original public model/binding/provenance files and the earlier leather underlay data remain byte-identical against the historical reproduction record.

Two independent cold-process rounds succeeded with exact output-byte assertions:

    node scripts/prepare-native-personal-armor.mjs --verify
    node scripts/characters/derive-native-personal-armor-underlay-fit.mjs --item=ironBodyArmor --verify

[The new 21-artifact reproduction ledger](../qa/personal-armor-333/variants/source-reproduction.json) pins current scripts, manifest, measurements, four prepared variants and iron-specific fit data. The complete new numeric derivation remains losslessly packaged under `output/native-personal-armor-333/variants/`; no 22 MB plain provenance copy is required. Earlier two-model records are not rewritten as four-model measurements.

The binding declares ages 16–100. Actual bounded native integration and source/twin/unequip checks are reported separately in [variant integration](../qa/personal-armor-333/variants/native-integration.json). Those finite profiles and camera views do not qualify every morph, animation time or physical device. Combined owner combat QA remains separate; this source receipt makes no gameplay-balance, GPU, thermal or universal zero-contact claim.
