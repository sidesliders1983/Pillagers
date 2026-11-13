# Four-variant personal armor acceptance — #333

Automated/bounded review status; owner visual and physical-device acceptance is
separate. Clean tested implementation: **eb73baee671534fa105be05a1e000ff6457b1e36**. The subsequent evidence-only
change preserves production inputs: [equivalence](browser/build-equivalence.json).
[Raw retained file hashes](browser/retained-files.json) identify actual observations.

| Check | Status | Evidence / scope |
| --- | --- | --- |
| Approved four-item recipes, roles, personal cap and actual inventory | PASS | [Current rules](../../../gameplay/PERSONAL-ARMOR-V01.md). 85 focused Core tests, including nine paid products (25 Materials / 6 Hides / 7 Ore), separate missing-input stalls, atomic assignment/transfer, factual receipts, loss and forgery rejection. |
| Historical saves/mission rules and RNG | PASS — bounded | Explicit prospective catalogue v4 adoption; old v3 state/recipes stay intact. New actual wear uses v4 Pillage / v2 on-site armor policy. The executed 100-seed no-variant case keeps old v3 snapshots/outcomes/RNG exact. Two real reached on-site cases include actual incoming action and four-item death loss. |
| Matched equipment comparison | PASS — bounded | [36 combinations ×64 matched seeds](balance.md): 2,304 real public Core dispatch/return trials. Fixed Iron Spear; all body/helmet/shield choices; unchanged ally seed set and exact canonical RNG checks. On-site columns are analytical shared-rule calculations, not another resolver or physical battle run. |
| Source fidelity and reproducibility | PASS | [Source inventory](source-inventory.json), [21-artifact two-round reproduction](source-reproduction.json) and [prepared sources](prepared-sources.json). Existing two assets/bindings/provenance and tunic data remain byte-identical. Both actual new supplied sources retain their materials/UVs; bindings are independent. Normal runtime/fitter/rig are unchanged. |
| Native variants, own hair/beard and restoration | PASS — bounded | [12 actual loadouts / 96 poses](native-integration.json), representative owner/teen/older bodies, one native44-bone rig, unchanged identity, finite points, exact original/twin/unequip restoration and no frame-time fitting. New-cap-only measured 5mm hair clearance resolves its rim contacts. No global tolerance exemption. |
| New pair versus hand props | PASS — bounded | [36 states / 144 exact pairs](native-integration.json), both spears and all three shields in ready/spear/shield and Death phases 0.5/0.75/1. Zero intersections/exemptions in this probe. This is not every possible morph/time. |
| Original native/underlay/public regressions | PASS | 39 focused tests retain original fitting, strict source/opacity guards, original clothes and age/borrowed-portrait restoration. |
| Production/preparation controls | PASS | Six Smithery DOM tests, including both body/helmet choices in four total slots, correct Smith/Leatherworker inputs, actual paid stock replacement, save roundtrip and disabled away controls. |
| Built public UI journeys | PASS | [12 steps](browser/ui/report.json): ordinary home/field import and Continue, both variants swapped/restored, real Pillage preview/Back, stock/time/RNG conservation, full Core export/reimport, compact desktop and touch-emulated landscape, actual native models for both named residents, Character Card. No page/console/HTTP errors. |
| Built native appearance | REVIEWED — limits remain | [13 stills / seven snapshots / six live segments](browser/native/report.json), [bounded review](browser/visual-review.md). Remaining shoulder/armhole overlaps, dark fold/panel flecks and chest-plate splay in curled Death are visible. No zero-contact, all-body or owner acceptance claim. |
| Desktop render/resource comparison | MEASURED — bounded | [Raw](browser/rendering/report.json), [summary](browser/rendering/summary.md): added pair +14,828 native triangles including fitted-hair delta3,030; +2 materials/+2 texture objects; actual draws19→23, submitted triangles386,806→416,462. Thirty valid GPU samples/profile; baseline/both median7.136/8.060ms on Intel HD Graphics630/ANGLE D3D11. Separate aggregate CPU and callback-wall counters; three warm off/on resource plateaus (two textures remain cached off). Not a precise causal cost or phone guarantee. |
| Full final-head regression | EXACT-HEAD CI | [PR #335 checks](https://github.com/sidesliders1983/Pillagers/pull/335/checks) must succeed before ready/merge. Earlier successful two-item head91c8 and its ten inherited skips remain historical; they do not certify the new head. |
| Physical iPhone/touch/heat/frame pacing | NOT TESTED | Desktop/coarse-pointer emulation cannot certify a physical phone. |
| Owner combined combat/offense QA | NOT TESTED | The draft remains for owner review of the actual four variants and visible limits. |

The prepared saves intentionally use two Hides per eligible actual slaughter,
versus one in normal FjordSide, plus accelerated labour and initial supplies.
Every item is nevertheless genuinely paid and crafted; no finished stock is
injected. This QA-only source policy is serialized and explicitly shown on the
review page. Ordinary shipped livestock rules are unchanged.

The failed attempt to await six simultaneous mature animals on seed25 did not
meet its bounded preparation precondition. It produced no accepted save and is
not a Core-production regression. The final files use the explicit policy above.
