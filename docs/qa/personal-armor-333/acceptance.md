# Personal armor #333 — acceptance status

This is a combined-playtest checklist, not owner or release acceptance.
The implementation rules are pinned at 99a254fa6eee76c401981b795b32f20d801c6eae;
current clean browser build: **7f756202b47e30ad9db6b96f95eea1aa56cedeb3**.
The evidence-only follow-up preserves its production inputs; see
[build equivalence](browser/build-equivalence.json) and the
[exact retained file hashes](browser/retained-files.json).
Earlier failures and measurements retain their actual source scope in
[regression history](regression-history.md).

| Check | Status | Evidence and limits |
| --- | --- | --- |
| Recipes, real production, four-slot ownership, individual protection/cap, loss/transfer, save/replay and historical/RNG parity | **PASS** | 75 focused Core tests. Current contract: [Personal armor v0.1](../../gameplay/PERSONAL-ARMOR-V01.md). No replacement resolver or fabricated finished stock. |
| Repeatable balance comparison | **PASS — bounded** | [4,224 public Core trials](balance.md), 33 loadouts × 128 matched recorded seeds, with [real production receipts](production-provenance.json). The unchanged ally retains its exact casualty seed set. Not fine balance certification. |
| Public UI on the current clean production build | **PASS** | [12 observed steps](browser/ui/report.json), desktop and touch-emulated landscape: ordinary home/field import and Continue, four actual slots, independent transfer/back, real Pillage preview/Back, native scene/Card, canonical export/reimport and pause/time/RNG/stock conservation. No page/console/HTTP errors. Physical touch is separate. |
| Native helmet, source-grasp and Death correction | **PASS — bounded** | [861 unchanged helmet samples plus 84 both-spear transitions and 20 Death samples](death-forearm-regression.json). Actual body/shaft/helmet/floor and native-fall parity checks stay strict. The previous full-suite failure is recorded, not reclassified as a pass. |
| Vest/helmet against hand props | **PASS — bounded** | Current [vest](vest-prop-qualification.json) and [helmet](helmet-props-after-death-fix.json) reports: each 252 motion states / 357 exact pair checks on the final runtime. |
| Composite mechanics, original-clothes restoration and LOD samples | **PASS — bounded diagnostics remain** | [45 cases / 90 paired evaluations](BOUNDED-COMPOSITE-REVIEW.md), one 44-bone native rig, finite points, preserved DNA, no frame-time fitting, exact restoration. Matched LOD0 delta ≤0.483248 mm; LOD1/2 equal in those samples. 39 potential-gap cases and broad forearm/cross-patch rays remain explicit, not pixel-coverage verdicts. |
| Actual textured native rendering | **REVIEWED — owner QA pending** | [13 stills, seven exact snapshots and six live actions](browser/native/report.json); [bounded visual review](browser/visual-review.md). Small jagged shoulder/armhole cloth edges and dark Death-panel flecks remain. The [current central-back probe](death-central-back-current.json) leaves cloth ≥7.087 mm behind the outer vest in 121 comparable rays; prior 4.547 mm contact is historical. Source-self diagnostics remain RED. No zero-contact or all-body fit acceptance is claimed. |
| Existing character/Lab contracts | **PASS locally; exact-head CI required** | Full local validation: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules, Idle/Walk/Run and World. Current assets remain byte-pinned. |
| Actual desktop rendering cost and retained resources | **MEASURED — bounded** | [Raw report](browser/rendering/report.json), [summary](browser/rendering/summary.md). Fixed-DNA LOD2 Iron Spear/Shield comparison: +14,157 native triangles (including fitted hair), +2 materials/+2 texture objects, actual draws 19→23 and submitted triangles 386,806→415,120. Thirty GPU samples per profile; median baseline/both 7.294/7.468 ms. Aggregate thread-CPU and callback-wall counters are separately labelled. Three warm on/off cycles plateau; two textures remain cached when armor is removed. No precise causal-cost or phone-FPS claim. |
| Full regression on the final PR head | **EXACT-HEAD CI** | [PR #335 checks](https://github.com/sidesliders1983/Pillagers/pull/335/checks) must succeed before ready/merge. The ten inherited private-source/opt-in skips and previous 8e87768e failure are detailed in [regression history](regression-history.md); no test gate was weakened. |
| Physical iPhone rendering, touch, frame pacing and heat | **NOT TESTED** | Browser emulation and Intel HD Graphics 630 / ANGLE / D3D11 desktop observations cannot certify this. |
| Owner combined combat/offense UAT | **NOT TESTED** | Pending owner review of the current candidate and the explicit visual limits. |

## Public review steps

Prepare and serve the review build using the commands in [the QA guide](README.md),
then open `/qa/review.html`. Download a prepared file and load it through **Load
game**, then **Continue campaign**. The page does not replace an active campaign.
Both files are ordinary player-export files, paused on import, with genuinely
mined Ore, slaughtered Hides and crafted equipment. Accelerated work and ample
starting supplies are explicit test settings.

1. In the home save, open **Expeditions → Armor QA → Known places**. Inspect all
   four personal slots. Remove and transfer Body Armor and Headgear independently;
   returned items must reappear in stock. The ally owns the only Wooden Shield;
   unequip it from that person before assigning it elsewhere.
2. Inspect the main resident at home and in the field save, including the
   Character Card. Actual four-item ownership must agree. Home work may visually
   stow incompatible personal gear with a status message; field clothing uses the
   normal tunic. Away equipment controls must be disabled.
3. The field save is travelling to a mine, **not fighting**. For a real on-site
   encounter, reload the home save, select the identified settlement under
   **Known places**, review **Pillage**, confirm **Start mission**, then start the
   clock. Defenders and outcomes are genuine; no victory is forced. Return home
   before changing gear. Keep the home download for repeat comparisons.
4. Download the campaign and import that exported file again. Confirm the clock
   remains paused and resources, owners and stored items are retained. Use
   Character Lab for repeatable front/side/rear motion inspection; it does not
   manufacture campaign items. Include a physical iPhone run separately.

Owner acceptance remains separate from these automated and bounded rendered checks.
Keep earlier measurements as historical records.
