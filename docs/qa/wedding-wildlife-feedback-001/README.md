# Coastal wildlife and wedding feedback — revision 001

Follow-up on owner UAT of #288/#292, kept on `codex/wedding-cinematic-288` / PR #291.
Baseline: `84ce470399e36229d4418ec81117cfd1fd4ada64`. Core and save schemas are unchanged.

## Changes

- Camera approach validates the moving eye corridor separately from an occluded
  **old** ground focus. A safe arrived view/orbit still requires sight of the actual
  animal. Native terrain/water/near-plane and known-area checks stay in force. When
  a close orbit cannot fit, a safe held view can frame the animal without a flight.
- Explicit focus plays the approved existing animal call once per event per scene,
  including during player pause. The same animal's periodic emitter is replaced
  while it plays. Refresh/repeated clicks do not replay it; unavailable historical
  animals remain silent. Puffin has no approved recording in the current pack.
- The wreath uses the fitted scalp socket and the real posed HEAD surface for its
  center and size. It temporarily hides the existing cap, then restores its original
  visibility. Native rigs, hair, clothing selection and identity are unchanged.
- Wedding MP3 stays streamed, using one native Panner and the existing World bus at
  the actual musicians' centroid. Normal listener/distance/zoom and World/Master
  volumes apply. Other buses are not ducked. Existing pause, consent and cleanup
  remain; the track does not enter the decoded SFX cache.

## Reproduce

```powershell
node scripts/prepare-wildlife-feedback-review.mjs
node --test --test-concurrency=2 tests/wildlife-camera.test.mjs tests/camera-obstacles.test.mjs tests/wildlife-live-anchor.test.mjs tests/wildlife-sounds.test.mjs tests/soundscape.test.mjs tests/wedding-ensemble.test.mjs tests/wedding-music.test.mjs
pnpm build
```

Serve `dist` on LAN 5180. Copy this folder and the existing wedding fixture directory
into `dist/docs/qa` after building. The review page describes normal start-menu
recovery/import. Preserve a personal campaign before importing QA checkpoints.

`fixtures.json` records genuine paid expedition commands on campaign seed 32 /
physical island 168: swimming `seal:water:0`, event-11 at tick 30, and
`puffin:land:0`, event-13 at tick 40. Animals, event records and discovery masks are
not rewritten. The earlier explicit QA-only 5000 Food/quiet-demography checkpoint
is reused; these are review fixtures, not shipping founding values.

## Executed validation

**330 targeted tests passed; 0 failed, 0 skipped.** This includes existing camera,
touch, wildlife/marine, notifications, audio, cultural/wedding, transport and quality
regressions. New cases use real cap/crown/book assets and native human rigs, the
actual physical island and wildlife models, an obstructed-old-focus case, held-view
fallback, one-off paused wildlife audio/Core parity and the public Web Audio adapter.
The adapter checks one actual route through a Panner, source position, unchanged
ambience gain, distance silence/recovery, mute, disposal and zero song PCM cache.

Production public-asset validation, TypeScript and Vite build passed. The existing
large-bundle advisory remains. No validation is bypassed or weakened. No formatter
is configured; edits and diff whitespace were reviewed manually. Current-head CI
and physical-device listening remain separate gates.

Browser evidence includes a genuinely recorded seal focus with exactly one started
seal cue while Core stayed paused, and a real puffin focus with native scenery /
clearance enabled. The broad run's genuine-world camera case tests swimming seal
and floating puffin. Headless bitmap adapters are not a browser material-render test.
Native playback state/adapter routing do not certify audible quality on iPhone.


The native browser wedding proof records streamed music at 10.225 seconds while
ordinary world/ambient voices remain active (`foregroundDucking: false`). Five
actors and two instruments were staged in that capture; it is not evidence that
all three assigned musicians had arrived. The full screenshot shows the wreath
on the scalp without the original cap. After Skip, the camera and all staged
actors/instruments/accessories were released and the media state became
`released`; the usual wind remained active. Cap restoration is also asserted by
the real-asset test.

`wedding-close.png` is the full native screenshot; `wreath-detail.png` is only a
crop of a recorded full screenshot, without image alteration. Browser JSON files
contain public debug DOM diagnostics, not injected application state. Existing
forest shader diagnostics and the lower IAB rendering frame rate are not resolved
by this scoped camera/accessory/audio change. No physical-device audible/spatial
acceptance is claimed from the desktop diagnostics.
