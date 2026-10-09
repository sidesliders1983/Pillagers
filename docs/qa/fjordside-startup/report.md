# Automatic generated startup — 9 October 2026

The owner approved fresh generation on ordinary Fjordside loads after the staged
integration review. Ordinary `/` now generates a random-seed Fjord immediately;
reloading it generates a fresh world. `/?world=reference` is the explicit original
scene rollback. `/?worldDev=1` retains deliberately generated/imported/loaded
geography across reloads, so saved-world and quality operations preserve placement.

The public production browser check first failed against the prior build because
ordinary startup returned Reference. It now passes fresh startup, a changed seed
on ordinary reload, explicit Reference rollback, development generation, save/load,
invalid-import preservation and pause. Pause asserts clock and physical resident
state exactly, excluding camera/projected-screen metadata: the camera intentionally
remains interactive during pause and has harmless floating-point interpolation.

The actual World factory passed placement, navigation and deterministic save/load
checks for seeds 0, 1, 2, 7, 17, 32, 91, 1983, 2147483647 and 4294967295. The
production build passed. This is bounded coverage, not proof for every possible seed.

The [36-image integration review](../fjordside-integration-v02/report.md) remains
a historical record of the preceding opt-in build and its original source hashes.
Visual materials and world placement rules are unchanged by this startup update.
