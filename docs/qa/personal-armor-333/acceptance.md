# Personal armor #333 — acceptance status

This is a combined-playtest checklist, not owner or release acceptance. The
implementation uses vest model 1083a715439a5a2acb3b714908070802459d3d0b8f72eb5d270956f9152c002a
and binding 8f9653339f32015fd46d56198110e28d4c0ea9c3f466658e992356b8b2d2e4c8.
Implementation commit: 99a254fa6eee76c401981b795b32f20d801c6eae. Final clean built-candidate checks are pending below.
Earlier observations retain their actual source/build scope.

| Check | Status | Evidence and limits |
| --- | --- | --- |
| Canonical recipes, actual production, four-slot ownership, individual protection/cap, loss/transfer, save/replay and historical/RNG parity | **PASS** | 75 focused Core tests passed. Current gameplay contract: [Personal armor v0.1](../../gameplay/PERSONAL-ARMOR-V01.md). No replacement resolver or fabricated finished stock. |
| Repeatable balance comparison | **PASS** | [4,224 public Core trials](balance.md), 33 loadouts × 128 matched recorded seeds; [raw results](balance.json) and [real production receipts](production-provenance.json). The unchanged ally retains its exact casualty seed set. This is bounded evidence, not fine balance certification. |
| Public UI journeys on provisional, dirty candidates | **PASS — historical** | 12 observed steps passed with no observed page errors: ordinary home/field file loading, four actual slots, reassignment, preparation, own-person presentation, export/reimport and compact desktop/touch-emulated controls. Local report: `scratch/personal-armor-browser/ui-integrated-1794568146585/report.json`. The portable runner also passed all 12 steps on a585 fitting data (`scratch/personal-armor-browser/ui-2026-11-13T14-10-28-829Z/report.json`). Neither observation accepts the final clean build. |
| Public UI journeys on the final clean commit | **NOT TESTED** | Rerun [the public UI runner](../../../scripts/qa/check-personal-armor-ui.mjs) against the exact clean built commit, retain build identity, screenshots and errors. |
| Native helmet geometry and legacy cap parity | **PASS — bounded pinned samples** | [Helmet qualification](helmet-qualification.json): 861 head/hair/beard motion samples plus 252 spear/shield motion states (357 exact pair checks); [legacy cap parity](legacy-cap-parity.json). The report pins tested source/assets. It does not cover every character or physical device. |
| Vest source preparation and visible tunic/body composite | **READY FOR BOUNDED OWNER REVIEW — limits remain** | Actual textured Idle/Spear views are substantially clean at normal Lab framing. The revised Death view retains a small central torso contact, measured at up to 4.547 mm on the bounded probe, plus opening-edge contacts. The [dark spot](death-dark-spot-classification.json) is opaque inner lining/fold shadow with intact tunic behind it. Strict source self-crossing diagnostics remain RED; no zero-contact or owner fit acceptance is claimed. [Source audit](../../assets/NATIVE-PERSONAL-ARMOR-333.md), [fit-only mechanical contract](underlay-runtime-contract.json). |
| Bounded composite mechanics and LOD samples | **PASS — bounded; visual diagnostics remain** | [45 cases / 90 paired evaluations](BOUNDED-COMPOSITE-REVIEW.md) retain exact source identities, finite native evaluation, one native rig, no frame-time fitting and exact restoration. LOD0 garment delta ≤0.4833 mm; LOD1/2 equal in the four matched poses. Raw forearm rays remain unresolved; no zero-gap or owner-acceptance claim. |
| Existing character/Lab contracts | **PASS** | Full local validation: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules, Idle/Walk/Run and World; visual owner approval is separate. |
| Actual rendering cost and retained GPU-resource deltas | **NOT TESTED** | [Performance runner](../../../scripts/qa/measure-personal-armor-rendering.mjs) is prepared; no actual renderer measurements have run. Required: fixed-DNA/camera/LOD/no-armor, body-only, helmet-only and both; repeated off/on cycles; actual draws/triangles/resources and callback wall time, plus GPU query samples when supported. |
| Physical iPhone rendering, touch, frame pacing and heat | **NOT TESTED** | Browser touch emulation and desktop timings cannot certify this. |
| Owner combined combat/offense UAT | **NOT TESTED** | Pending owner review after the fitting blockers and final built-candidate checks are resolved. |

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

Final acceptance must replace pending rows with evidence tied to the exact clean
commit and current assets. Keep earlier measurements as historical records.
