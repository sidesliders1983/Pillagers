# Wildlife — lowered gull wings revision 006

Grounded gulls now rest with their wings rolled down and held closer to their
flanks, with the feathers still swept rearward. The user-supplied standing-gull
photograph informed the resting silhouette. The original raised folded pose is
retained as an intermediate pose rather than removed. Head scans, feet, supplied
faces, UVs and flight wingbeats retain their existing behavior.

The existing 3.6-second stretch every 29–35 seconds now has four smooth stages:
0.6 seconds lifting the closed wings, 1.2 seconds opening, 1.2 seconds closing,
and 0.6 seconds lowering them along the body. Both folded targets combine with
the independent head targets. The runtime still uses the paused wildlife clock.

## Validation

All 29 focused wildlife, Fjord yard-cache and presentation-quality tests pass.
Geometry checks confirm a lower mean wing height, reduced lateral width,
rearward feather ordering, finite targets and feathers above the feet. Tests
also check stage order and continuity at the stage and cycle boundaries. Existing
head/foot isolation, pause, source-clip handover, habitat and reindeer tests pass.

The actual WildlifeLayer browser helper was inspected from the side and rear in
low rest, and in the raised and fully spread poses. A stepped complete cycle
returned to the same low-rest influences without moving the actor. The final
browser frame was paused; repeated reads retained its time and pose. The helper
reported no habitat diagnostics or browser errors. See browser-inspection.json.
This is a focused layer review, not a full Fjord Play end-to-end test. The source
mesh retains its stylized angular anatomy; the change adjusts the wing pose.
The attempted review-image download timed out; no saved screenshot is claimed.

Public asset validation, TypeScript and the separate Vite production build pass.
The existing large-chunk advisory remains. No formatter is configured; source
formatting was inspected manually and git diff --check passes. The checked build
is served through the existing temporary Cloudflare tunnel, keeping old chunks
available for sessions already open. The main-based public Sites deployment is
unchanged.
