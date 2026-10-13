# Geologically driven island generation — QA

13 October 2026 · issue #133 · `codex/macro-island-shape`

[Visual review](review.html) · [generation data](batch.json) · [browser evidence](browser.json) · [contract](../../MACRO-ISLAND-V03B.md) · [research](../../NORDIC-ISLAND-LANDFORMS.md)

## Outcome and limits

The explicit Nordic Island preset uses an 800 × 800 m field with 2 m terrain samples. Elongated basalt accumulation is followed by drainage-derived glacial valleys, connected tributaries, marine inundation and continuous lowland shaping. Ridges remain between eroded valleys. No independently placed mountain cones, angular inlet list or rectangular settlement pads are used. The older Icelandic Westfjords/Eastfjords are the main references; the research distinguishes this from Norway's older glacial bedrock and Denmark's glacial/sedimentary coasts.

The gallery starts with top-down elevation maps and neutral oblique terrain renders for ten fixed seeds. Nature, village, fog and ground textures are disabled there. Optional source-material and scenery views come afterwards. The resulting shapes have broad remaining uplands and deeply cut flooded valleys. Coarse valley walls still expose the 2 m mesh. Shape metrics are artifact screens, not proof of realism or a substitute for owner visual review. These fixed regression seeds do not establish a population-wide generation success rate.

Natural connected pockets are measured after formation. At least two must each exceed 3,000 m², lie at least 120 m apart, have a continuous intervening rise of at least 8 m over at least 12 m, and retain a safe terrain connection and coastal approaches. The outlines follow usable cells rather than rectangular platforms. No houses, residents, rival clan or final site reservations are placed; those decisions and line-of-sight remain #134.

## Reproducibility and physical evidence

Every accepted seed below has one cardinally connected landmass, a closed physical coast, a sea margin, lowlands, a valley and highlands. Explicit regeneration is identical, full-blueprint export/import is identical, and terrain hashes differ between seeds. Public triangle queries and rendered raycasts agree, including the offshore continuation of the canonical seabed. Old preset hashes and stored v0.1 worlds remain unchanged; imports do not regenerate geography. Conifer/quality changes preserve the stored terrain.

The recorded drainage graph has descending floor profiles, two to four main valleys and connected tributaries. The highest terrain belongs to a connected highland region rather than a small isolated peak. Coast convex-hull occupancy is below 85%; rotational overlap is below 90% for orders 3, 4, 5, 6 and 8. A deliberately regular radial-star fixture fails the symmetry screen. A flat island fails the terrain-separation requirement even if its pockets are distant.

Seed 73 with relief 1.5 is intentionally retained as a rejected fixture: **The dry land is not one connected island.** The seed/config are not silently retried. The Lab displays the rejection, permits inspection/export and does not spawn reference residents. Tiny detached marine remnants up to 256 m² are removed during generation; larger fragmentation is rejected.

TDD used the approved WorldBlueprint, terrain-query and browser seams. Failing cases were observed before implementing the larger/versioned island, geological drainage, natural-pocket feasibility, radial-shape rejection, save validation, offshore mesh continuation and initial camera controls. The old arbitrary peak-to-coast buffer was replaced with a highland-connectivity assertion because steep Icelandic fjord walls can meet high ridges.

## Measurements

The primary generation run was repeated after other heavy local validation jobs finished. Values include final generation validation.

| Seed | Main / tributary valleys | Approx. dry m² | Maximum elevation m | Pocket areas m² | Ridge rise / width m | Generation ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 17 | 2 / 4 | 190,172 | 54.9 | 4,876 / 4,408 | 10.9 / 23.8 | 2223 |
| 91 | 3 / 6 | 164,260 | 56.9 | 4,476 / 3,096 | 29.7 / 141.6 | 2291 |
| 1983 | 3 / 6 | 173,920 | 56.6 | 6,124 / 4,020 | 9.2 / 14.0 | 2525 |
| 42 | 4 / 8 | 160,012 | 53.3 | 6,044 / 3,168 | 17.6 / 105.5 | 2640 |
| 18 | 3 / 6 | 191,120 | 54.7 | 6,212 / 3,968 | 9.3 / 17.9 | 2576 |
| 104 | 2 / 4 | 180,988 | 52.6 | 4,836 / 3,424 | 10.8 / 23.7 | 2005 |
| 211 | 3 / 6 | 168,676 | 53.2 | 5,796 / 3,880 | 11.3 / 17.9 | 2317 |
| 512 | 2 / 4 | 178,752 | 55.9 | 7,608 / 3,592 | 12.5 / 45.5 | 2146 |
| 819 | 4 / 8 | 157,696 | 53.3 | 5,104 / 3,400 | 27.4 / 113.1 | 2611 |
| 1337 | 4 / 8 | 156,764 | 54.8 | 6,100 / 3,024 | 47.0 / 147.5 | 3123 |

Dry area is dry-vertex count × 4 m², a grid estimate. Pocket area is a connected-sample estimate, not verified foundations. Full saves are 14.81–14.90 MB and retain all physical data. Before/after Node heap and RSS observations are stored per run; they are **not peak or GPU memory**. Garbage collection can make deltas negative. No few-millisecond performance gate is applied.

The earlier [concurrent generation run](batch-concurrent-validation.json) remains separately available; its 5.7–25.5 second timings overlap build, tests and browser work and are not representative of isolated generation. The earlier [concurrent browser run](browser-concurrent-validation.json) also remains available. Its first RAF interval mixed `performance.now()` with a RAF timestamp and can be negative; it is not used as a frame-duration measurement. The final browser harness starts at the first RAF timestamp and retains every subsequent interval.

The final phone-width sample contains 40 raw RAF intervals, 16.5–16.9 ms. These are development-browser observations, not physical iPad performance. Browser JSON retains renderer summaries per capture, not every desktop frame. Repeated Low-quality imports are compared after resource settling; stable counts in that bounded sample do not prove zero lifetime leaks.

## Validation

- Full local suite: **692 tests; 691 passed, 0 failed, 1 existing opt-in evidence test skipped** (`RUN_R3_EVIDENCE` unset). No validation was weakened.
- Production build passed, with the existing bundle-size advisory. Character validation passed: 20 assets / 36 GLBs, including explicit Lab previews.
- Full Environment Lab browser run: ten seeds, canonical export equality, repeated save/import, old-world import, Reference rollback, explicit rejection, camera controls, Low quality, 1024 px touch and 390 px layout. No page or console errors. The final evidence must have `passed: true` and `captureOnly: false`.
- Follow-up island/world regression suite: 22/22 passed. The legacy Fjordside browser passed fresh generation, reload, existing residents, pause, save/load, invalid import and Reference rollback. TypeScript validation passed after the final source review.
- Formatting was inspected manually; this repository has no configured formatter. `git diff --check` is used for whitespace errors.

Current game defaults and stored campaigns receive no terrain migration. CI must pass on the PR's current head before it is marked ready. Visual adoption remains for owner review.
