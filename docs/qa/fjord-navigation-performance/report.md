# FjordSide touch-navigation stall — measured fix

The owner reports that tapping a location stalls the image on physical iOS, including while Paused. This reproduces on the current performance branch independently of active simulation. Implementation: `44df1f9df402de3ea7225ef0883f1f76fb789db6`; before: `06cd2f4718e0985cf267ca80edd30870331f93aa`. The existing draft PR #167 retains the separate #168/#169/#170 work. Their historical pinned reports are unchanged.

## Cause and relation to #144

The initial four native-profiled taps take 169.4–173.5ms in navigate, of which 150.4–156.8ms is the complete terrain raycast. Entity picking is 0.7–1.0ms and the camera update remains below 0.7ms in this fixture. See [initial measurements](investigation/native-cause/results.json) and the adjacent compressed CPU profiles; [the exact profiling harness](investigation/profile-harness.mjs) runs against the before source on port5190. The mesh contains the canonical grid and overlapping material draw groups, so the native full-mesh query repeats physical triangle work across layers. Empty-ground selection also rebuilt unchanged management UI before navigation.

The full-mesh navigation raycast already exists in the controller before #144 (`528c4a4^`). These measurements identify a present independent stall; they do not establish which historical build made it noticeable on the physical phone. The #144 terrain/boom lift is retained. Interpolation speed, recovery and camera delta-time policy are not changed.

## Implementation and fidelity

The canonical terrain builder weakly registers its existing six Float32 vertices per grid cell and eight deep-sea triangles. A near-to-far X/Z traversal tests only crossed cells, using the same native Three Ray.intersectTriangle, winding, material side and transformed source positions. It selects the same nearest hit, including offshore continuation. This creates no copied terrain, BVH, GPU buffer, material, listener or simulation state. Reference/foreign meshes retain the native raycast. Unexpected geometry/position/index/group/draw-range edits decline the shortcut; legitimate wear-index updates refresh their signature; disposal releases registration. An empty-ground tap skips the UI refresh only when selection is already empty; actual selection/deselection is preserved.

## Repeated controlled measurements

[Plan and exact hashes](plan.json), [24 raw captures](paired/results.json), [validated summary](summary.json). Three repeats reverse variant order in the middle repeat. Each source gets two Paused and two Running trusted touch events on the same real-house fixture, fixed camera, Low quality, DPR1 and 390×844 touch viewport. Every actual destination matches the native raycast within 1e-8m, and matched source pairs reach the same point. All Paused canonical hashes match; every naturally advanced Running Core matches authoritative replay of its actual ticks. No placeholder or page error occurs. Native verification is deliberately performed after the timed interval.

| Mode | Handler CPU median before → after (ms) | Paired CPU reduction median | First camera submission median before → after (ms) | After handler range (ms) |
| --- | ---: | ---: | ---: | ---: |
| Paused | 160.85 → 1.45 | 99.09% | 189.30 → 68.85 | 1.00–2.60 |
| Running | 156.15 → 0.90 | 99.41% | 180.75 → 65.50 | 0.80–1.10 |

The after camera solver block never exceeds 0.4ms in these paired taps. These are per-input CPU savings, not whole-game FPS gains. The first-camera metric starts at pointer dispatch and ends at main-thread render submission: browser input queue delay, GPU queueing and physical display presentation are different quantities. GPU command execution was not measured by this input benchmark and no GPU speedup is claimed. Renderer geometry/texture/draw observations remain in the raw results. Running wall-clock ticks differ because the old input handler blocks longer; replay compares each actual tick count, not unequal-time Core bytes.

The first strict benchmark attempt rejected a ~1.3-micrometre mismatch from comparing planned double-precision coordinates with browser-quantized touch coordinates even on the unchanged baseline. [Its rejection](investigation/qa-coordinate-check/rejected.json) is retained. The accepted harness records actual pointer coordinates and camera matrices and keeps the same 1e-8m native-hit tolerance; no failed run is accepted.

## Validation

- [21 camera/touch contracts](validation/camera-touch-contracts.txt), including six new navigation regressions, pass. They cover native differential hits across alternating cells, diagonals/edges, front/back/double sides, sea continuation, transformed parents, misses/vertical/parallel rays, material-mask reindexing, stale/disposed sources, actual touch events and a bound of at most two triangles per crossed cell plus eight sea triangles. Existing ridge, near-plane, ground/boom safety, Home, world replacement, review poses, selection, drag and pinch contracts remain intact.
- [Eight ground/material contracts](validation/ground-contracts.txt) pass; [TypeScript/normal production build](validation/build.txt) passes.
- [Actual camera-safety browser QA](camera-safety/results.json) passes ridges/cliffs/coasts, desktop controls, 390/1024px touch gestures, Home and replacement of curated island18 by island7. This fixture’s 130 sampled updates have p95 0.1ms, max 0.2ms, at most59 height queries and no conservative fallback. Its pictures show the existing corrected/uncorrected #144 views, not a different terrain geometry.
- [Ordinary production touch smoke](production-tap/result.json) passes on a 390px viewport with no QA bridge: a real empty-ground touch moves the camera, selects nothing and preserves every exported Core fact. The public camera signature changes after 72.8ms in this single smoke; this is functional integration evidence, not a new A/B timing estimate. [Existing production touch-selection checks](production-selection/result.json) pass finger-size near misses, moving residents, held touches with drift, drag/pinch selection preservation and exact Core replay. The smoke explicitly starts the imported checkpoint in Pause; its first setup attempt inherited Running pace and was not accepted as a pause proof.
- Current-head full CI must pass on [PR #167](https://github.com/sidesliders1983/Pillagers/pull/167/checks). Keep draft for owner review and the earlier performance issues’ remaining acceptance limits.

No formatter is configured; source style is checked manually, with node --check and git diff --check. Physical iPhone/iPad Safari after the fix is **untested locally**; Chromium touch emulation does not certify it. The owner’s original iOS report is the input to this investigation, not an after-fix phone measurement. No game rules, Core ticks, save schema, camera safety margins or authored assets change.

## Integration with the newer world hair

While the navigation CI was running, main advanced to `5845abda1f8c4716962aec830f2feac302c44718` (#172), installing DNA-coloured hair on world residents. The original branch's push check passed (800 passes, 11 pre-existing conditional skips), but [the PR merge check](https://github.com/sidesliders1983/Pillagers/actions/runs/38773272414) correctly failed the earlier fitting test at female age45: that assertion still expected reuse for a previously hairless world resident. No navigation test failed.

Main is now integrated. Test adjustment `3179f818374a749ba3466c8493f9530fa981e6d1` requires full refitting and an actual installed-hair colour change at ages45/50/75, while retaining reuse at the invariant ages and at fully grey age99. Every original source/coverage/posed-vertex/material/bounds/picking comparison against forced full refits remains. [All 35 relevant fitting, hair, wardrobe, camera, navigation and touch contracts](hair-integration/validation/contracts.txt) pass without skips; [the normal production build](hair-integration/validation/build.txt) passes. No fitting, navigation or camera runtime algorithm was changed for this integration.

[The ordinary production touch check with the newer hair](hair-integration/production-tap/result.json) also passes: no QA bridge, no page errors/placeholders, an actual empty-ground touch moves the camera and the exported Paused Core stays exactly unchanged. Its single camera-signature observation is functional evidence, not another paired performance estimate. The controlled A/B timings above remain pinned to their original sources and assets; they have not been re-measured with the added hair. Current-head full CI is still required and the PR stays draft.
