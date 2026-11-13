# Regression history for personal armor #333

These results remain historical records of their tested revisions. They do not
accept later changes or replace the current-head CI result.

## Built revision 8e87768e

Commit: 8e87768e395dc4378bed3a86e946a64cc8a5cee3.
[Character contracts #944](https://github.com/sidesliders1983/Pillagers/actions/runs/43445968254)
failed with 1,922 tests: 1,911 passed, 1 failed and 10 existing skips.
The full local run also reported 1,911 / 1 / 10 (0 cancelled).

The failing native helmet test found two actual body/helmet intersections at
owner-default LOD0, no hair, Death phase 1. The contacting body surface was the
right forearm. Intermediate native checks subsequently found the same class of
contact on smaller/older bodies. This is a real regression requiring a pose
correction; the assertion remains zero intersections and no collider exemption
was added. A subsequent wooden-spear check also found shaft/forearm contact at
Death phase 0.75 and was retained as a blocking result during correction.

## Inherited skips

Nine unchanged tests in tests/meshy-human-runtime.test.mjs require the private
legacy Assets/Characters/Human/Human-textured.glb source, which is absent in this
worktree. The public optimized LOD0 exists. These source-comparison tests were
skipped by their existing hasAssets guard; they have not passed here.

The remaining unchanged test in tests/static-pose-export.test.mjs is the opt-in
r3 frozen-model portability check, gated by RUN_R3_EVIDENCE=1 and retained private
scratch inputs. These two test files and skip guards are unchanged from the
pre-#333 base 8374fac84e766aedf16131c1c246cddbecb13db9. No skip was added to
obtain a passing result, and none of these skips was caused by the failure above.

## Earlier browser and rendering observations

The ordinary public desktop/touch-emulated UI journey passed all 12 steps on
clean 8e87768e. A bounded desktop Intel HD Graphics 630 / ANGLE / D3D11 rendering
comparison also passed its resource-measurement contract on that revision.
Those runs predate the forearm correction and cannot accept its native geometry.
Their raw originals remain in ignored local QA output; the final retained browser
bundle records its own exact tested build separately.

The local full suite finished at 15:02:08.609 UTC; the rendering sample began at
15:02:33.626 UTC, 25.017 seconds later on 13 November 2026. The performance run
therefore did not overlap that suite. No independent host-idle control or physical
phone measurement was recorded.
