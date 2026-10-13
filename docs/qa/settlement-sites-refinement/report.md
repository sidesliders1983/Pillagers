# Settlement site refinement - owner review

Issue #134 / PR #139. Fixed requested seeds: 17, 42, 91, 1983, 1337, 18, 104, 211, 512, 819.

**5/10 accepted**, compared with 1/10 in the unchanged [initial report](../settlement-sites/report.md). The accepted seeds are 42, 1983, 18, 211, 819. All ten reproduce their complete blueprint hash and round-trip saves. No seed was substituted and the six-parcel requirement, authored sizes, setbacks, 0.6m cut/fill and 160/40/240m limits remain.

## Fixed batch

| Seed | Result | Eligible/all compartments | Six-parcel fits | Centers m | Zone gap m | Route m | Full proof rays | Generation s | Founding tents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | REJECTED | 4/10 | 4/48 | - | - | - | - | 7.7 | 8 |
| 42 | PASS | 6/10 | 12/48 | 380.1 | 246.5 | 920 | 1932 | 10.1 | 8 |
| 91 | REJECTED | 5/11 | 11/48 | - | - | - | - | 8.3 | 7 |
| 1983 | PASS | 6/10 | 12/48 | 522.4 | 434.6 | 872 | 1440 | 9.7 | 8 |
| 1337 | REJECTED | 6/10 | 5/48 | - | - | - | - | 7.7 | 8 |
| 18 | PASS | 5/14 | 18/48 | 313.2 | 220.2 | 772 | 1575 | 9.6 | 9 |
| 104 | REJECTED | 5/12 | 22/48 | - | - | - | - | 20.6 | 9 |
| 211 | PASS | 6/7 | 7/48 | 460.4 | 399.1 | 1162 | 1881 | 10.0 | 7 |
| 512 | REJECTED | 5/11 | 9/48 | - | - | - | - | 11.9 | 9 |
| 819 | PASS | 2/4 | 33/48 | 230.9 | 131.8 | 389 | 1800 | 7.3 | 8 |

Eligible compartments have at least one connected 3000m² coastal anchor. All cores, including ineligible ones, are recorded below and in the Lab. The route is measured from the actual landing, not between site centers. Every accepted ray is terrain-occluded at 8m roof height, including footprint edges.

## What changed

- Lowland cores and geodesic expansion identify terrain compartments; candidate budgets are shared round-robin rather than spent on a single globally ranked plain.
- Denser anchors and a 65m natural-pocket search support twelve bounded layout/order combinations, authored plus compass rotations, and backtracking. The terrain silhouette is untouched.
- Physical poses and player routes are cached. Disconnected pairs fail before expensive sightline work. A visible sample stops a rejected proof early, explicitly reported as a lower bound; accepted proofs remain complete.
- Saves retain full terrain and optional diagnostics. A blueprint produced from original revision da0c7c6 was parsed by the new code without changing any field; see old-save-check.json.

## Remaining limitations and capacity decision

Seeds 17, 91 and 1337 have complete fits concentrated in one compartment. Seed 512 has fits in two nearby compartments but no pair satisfying separation/buffer. Seed 104 has multiple buildable areas but fails land connection or visibility. More searching is not proof that all rejected terrain is unusable. Five of ten is still a material limitation, so the feature remains opt-in and the PR draft for review.

The [capacity review](../../SETTLEMENT-CAPACITY-REVIEW.md) distinguishes the actual founding party (ten people, seven to ten tents, zero permanent houses) from the six mixed Lab expansion parcels. The batch records actual tent counts from Core; this is not a spatial guarantee for those gameplay plots. Any smaller acceptance contract needs explicit owner approval.

## Visual and browser review

Five different accepted seeds have overhead and actual player-start images. Nature and atmospheric fog are disabled for the proof; source ground/water and authored player houses remain visible. No rival village or CPU state is created. The overhead debug camera deliberately reveals the reservation. Seed 42 places the player in an enclosed inlet valley; 211 separates opposite outer shores through intervening highland and a long coastal walk. The images show materially different geography and layouts. Ground texture striping is visible in the existing material and is outside this placement change.

Browser checks passed for generation, compartment/pair diagnostics, complete export/import, shared start camera, rejected-world UI and reference fallback. 1024×768 touch-enabled browser viewport and orbit passed. A physical iPad was not tested.

## Cost observations

Generation took 7.3-20.6 seconds in this run; the initial implementation reported 2.4-5.3 seconds. These are development-machine observations, not a controlled speed benchmark or a hard millisecond gate. The increased generation cost buys broader coverage; generation is synchronous and can pause the Lab UI. This limitation is reported rather than concealed by rerolling or weakening checks.

The following are four renderer summary windows per desktop view, with nature/fog off. They are not individual frame samples, peak RAM or GPU timings. Other validation ran on the same old development laptop. These observations cannot certify physical-device performance.

| Seed | ms/frame window range | Draw calls incl. shadows | Triangles | Geometries | Textures |
| --- | --- | --- | --- | --- | --- |
| 42 | 44.5-45.9 | 41 | 1581118 | 106 | 103 |
| 1983 | 35.6-46.9 | 41 | 1581118 | 104 | 103 |
| 211 | 39.8-45.9 | 41 | 1581118 | 101 | 103 |
| 819 | 43.0-46.2 | 41 | 1581118 | 125 | 103 |

Tablet window: 63.1 ms/frame; 41 draw calls. No rendering technology, shader or asset size was changed.

## Per-compartment evidence

### Seed 17

- compartment-1: 12/49 anchors evaluated; 4 six-parcel fits. Coverage retained.
- compartment-2: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-3: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-4: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-5: 12/32 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-6: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-7: 12/40 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-8: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-9: 12/27 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-10: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.

Placement attempts: 535; nodes: 173176. Best partial placement counts (parcels: candidates): {"3":6,"4":22,"5":16,"6":4}.

### Seed 42

- compartment-1: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-2: 8/37 anchors evaluated; 1 six-parcel fits. Coverage retained.
- compartment-3: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-4: 8/23 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-5: 8/31 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-6: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-7: 8/8 anchors evaluated; 3 six-parcel fits. Coverage retained.
- compartment-8: 8/42 anchors evaluated; 7 six-parcel fits. Coverage retained.
- compartment-9: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-10: 8/42 anchors evaluated; 1 six-parcel fits. Coverage retained.

Placement attempts: 460; nodes: 183652. Best partial placement counts (parcels: candidates): {"4":18,"5":18,"6":12}.

### Seed 91

- compartment-1: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-2: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-3: 13/39 anchors evaluated; 11 six-parcel fits. Coverage retained.
- compartment-4: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-5: 8/8 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-6: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-7: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-8: 2/2 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-9: 12/20 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-10: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-11: 13/41 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.

Placement attempts: 455; nodes: 150381. Best partial placement counts (parcels: candidates): {"2":1,"3":1,"4":18,"5":17,"6":11}.

### Seed 1983

- compartment-1: 5/5 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-2: 9/86 anchors evaluated; 3 six-parcel fits. Coverage retained.
- compartment-3: 8/9 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-4: 8/40 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-5: 9/68 anchors evaluated; 4 six-parcel fits. Coverage retained.
- compartment-6: 9/52 anchors evaluated; 5 six-parcel fits. Coverage retained.
- compartment-7: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-8: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-9: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-10: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.

Placement attempts: 456; nodes: 120889. Best partial placement counts (parcels: candidates): {"2":1,"3":12,"4":6,"5":17,"6":12}.

### Seed 1337

- compartment-1: 8/116 anchors evaluated; 5 six-parcel fits. Coverage retained.
- compartment-2: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-3: 8/47 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-4: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-5: 8/35 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-6: 8/10 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-7: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-8: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-9: 8/22 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-10: 8/11 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.

Placement attempts: 521; nodes: 162759. Best partial placement counts (parcels: candidates): {"3":7,"4":13,"5":23,"6":5}.

### Seed 18

- compartment-1: 10/28 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-2: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-3: 10/56 anchors evaluated; 9 six-parcel fits. Coverage retained.
- compartment-4: 9/20 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-5: 9/31 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-6: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-7: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-8: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-9: 10/61 anchors evaluated; 9 six-parcel fits. Coverage retained.
- compartment-10: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-11: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-12: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-13: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-14: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.

Placement attempts: 378; nodes: 116384. Best partial placement counts (parcels: candidates): {"3":2,"4":14,"5":14,"6":18}.

### Seed 104

- compartment-1: 10/44 anchors evaluated; 8 six-parcel fits. Coverage retained.
- compartment-2: 6/6 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-3: 11/55 anchors evaluated; 9 six-parcel fits. Coverage retained.
- compartment-4: 10/13 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-5: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-6: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-7: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-8: 11/43 anchors evaluated; 5 six-parcel fits. Coverage retained.
- compartment-9: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-10: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-11: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-12: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.

Placement attempts: 343; nodes: 189881. Best partial placement counts (parcels: candidates): {"4":3,"5":23,"6":22}.

### Seed 211

- compartment-1: 8/42 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-2: 8/23 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-3: 8/11 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-4: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-5: 8/35 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-6: 8/40 anchors evaluated; 3 six-parcel fits. Coverage retained.
- compartment-7: 8/38 anchors evaluated; 4 six-parcel fits. Coverage retained.

Placement attempts: 502; nodes: 150161. Best partial placement counts (parcels: candidates): {"3":13,"4":18,"5":10,"6":7}.

### Seed 512

- compartment-1: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-2: 10/37 anchors evaluated; 3 six-parcel fits. Coverage retained.
- compartment-3: 10/55 anchors evaluated; 6 six-parcel fits. Coverage retained.
- compartment-4: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-5: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-6: 9/16 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-7: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-8: 10/55 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.
- compartment-9: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-10: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-11: 9/30 anchors evaluated; 0 six-parcel fits. No evaluated anchor fits six authored parcels.

Placement attempts: 486; nodes: 201142. Best partial placement counts (parcels: candidates): {"3":1,"4":9,"5":29,"6":9}.

### Seed 819

- compartment-1: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-2: 24/100 anchors evaluated; 11 six-parcel fits. Coverage retained.
- compartment-3: 0/0 anchors evaluated; 0 six-parcel fits. No connected 3000m² coastal pocket has an anchor in this compartment.
- compartment-4: 24/56 anchors evaluated; 22 six-parcel fits. Coverage retained.

Placement attempts: 216; nodes: 71751. Best partial placement counts (parcels: candidates): {"3":1,"4":4,"5":10,"6":33}.

## Validation

708 local tests passed; zero failed; one existing opt-in skip (709 total). All 13 focused placement tests, the TypeScript/Vite build and character validation with Lab previews passed. GitHub CI is tracked independently at the PR head. See validation.json. No formatter is configured; manual review and git diff --check passed.

## Reproduce

```text
node --test tests/settlement-sites.test.mjs
node scripts/qa/measure-settlement-sites.mjs
node scripts/qa/check-settlement-sites.mjs
node scripts/qa/check-settlement-sites-previous-save.mjs
node scripts/qa/publish-settlement-sites.mjs
```
