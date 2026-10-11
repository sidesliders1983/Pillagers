# Living Fjord v0.6B — interaction reuse and Human v2 animations

PR: [#102](https://github.com/sidesliders1983/Pillagers/pull/102). Implementation starts from merged PR #101 (3610cc2). This report covers the #95 presentation slice; no simulation balance or award rules change.

## Source and implementation

The owner's Human-textured-v2.glb has the same nodes, hierarchy/transforms, inverse bind matrices, geometry, normals, UVs and skin weights as the original Human source. Only four additional animations are published in a separate 1,022,008-byte pack: Archery_Shot_1, Archery_Shot_2, Heavy_Hammer_Swing and Sit_and_Doze_Off. The pack SHA-256 is a6f3884603041026f290fe0cffa2327c616ae490c779a48a456cb67edcb7a676. Original body LODs and fitting identities are preserved. Full source hashes are in [extra-animations.json](../../../public/game-assets/human/extra-animations.json).

Existing social/passing behavior is extracted into shared consumers, rather than a second movement owner. Cow Character Lab spacing, four cattle variants and authored Graze/HumanInteraction clips are reused. The source-to-consumer map and bounded navigation adapter are documented in [LIVING-FJORD-V06B-REUSE.md](../../LIVING-FJORD-V06B-REUSE.md).

Farmer visits require an actual permanent Farmyard; woodworkers approach actual standing trees; fishers reach dry shore approaches and use Sit_and_Doze_Off; hunters pause at forest approaches without an invented hunting clip. Visits, social pairs and cattle interactions share exclusive ownership. Source removal, role/work eligibility changes, pause, hidden tabs and loading release or suspend the appropriate presentation state without changing Core records.

The new Doze animation is an authored seated pose. There is no chair asset beneath it. Archery and hammer additions are exposed in Character Lab, without adding combat, hunting or smithing gameplay. Missing Doze capability produces an explicitly reported bounded Idle fallback.

## Automated checks

- 18 public controller behavior tests: reciprocal/exclusive reservations, authored durations and resumed grazing, pause/interruption, body clearance, safe visits, target removal, Core/save/replay isolation, varying time steps and real-pace route progress.
- Two regressions were demonstrated failing before correction: a fisher circling a passing neighbour on its first trip, and founding cattle remaining blocked by herd mates. The fixes retry a valid trip without extending its finite budget, and let blocked cattle take the next grazing/rest turn on safe support after three active seconds.
- Verified default CharacterFactory loads all 18 clips; the runtime crowd fixture uses the real original body plus the actual published additive pack.
- TypeScript, build and full character validation passed: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules and explicit lab previews.
- The first full local run had 539 tests: 537 passed, one failed and one optional authoring-fixture skip. The failure was an injected fixture still supplying only 14 clips; it now includes the actual additive pack, and its targeted rerun passed. No assertion or required check was bypassed. Final-head GitHub validation reruns the complete suite; PR readiness requires its success.

## Browser evidence

Source previews, occupation trips, startup and lifecycle captures were recorded on implementation revision 41be696. Social/cattle and paused-interruption checks were repeated after the bounded herd-blocking correction. The original Fjordside check uses the shared source behavior, which that cattle-only correction does not alter.

| Evidence | Coverage |
| --- | --- |
| [Source previews](source-previews/results.json) | Four new clips: authored duration, frozen source pose and snapshot export/import. All four Cow Character Lab variants: Graze 12 seconds, HumanInteraction 6 seconds, human Listen. |
| [Occupation visits](visits/results.json) | Four real roles approach, play their source activity and depart toward home; exclusive ownership. Fisher reaches the actual shore and plays Sit_and_Doze_Off. Departure means the home phase was observed, not that every return trip was followed to arrival. |
| [Social and cattle](results.json) | Real Talk_Passionately/Listening_Gesture, touch selection and expandable heritage, pause freeze, authored Graze and natural cattle/human proximity, source HumanInteraction and human Listen. |
| [Paused interruption](interruptions/interruption.json) | Role change releases both reserved participants and switches both selected source clips to Idle while paused. |
| [Lifecycle regression](lifecycle/browser.json) | DNA size/build, age-five visibility, following compact name/profile, moved-position touch selection, real Farmyard herd/overflow and hidden-tab suspension. |
| [Startup races](startup-races/startup-races.json) | Eight delayed loading, hidden/paused start/import/load/restart/new-campaign and paused 2D-to-3D handoff cases; matching complete Core hashes. |
| [Original Fjordside](original-fjordside/results.json) | Shared source behavior remains grounded, maintains personal space, makes progress and resumes after a conversation. The full 60.4 active-second run uses native Edge rendering at 480 × 300. |

Canonical browser exports are compared to the same initial state and actual elapsed Core ticks without presentation. Stocks, RNG, work progress and event history match exactly. Production popups remain factual Core awards; activity gestures create no resources or Lore facts.

## Review limits

An initial 20-active-second software-rendered comparison passed safety and travel assertions but observed no conversation. The complete 60-active-second original contract was then run with native rendering, retaining all behavior assertions; it observed a conversation and route resumption and passed.

Screenshots and JSON contain observable state/clip samples, not raw frame timings or performance measurements. Motion diagnostics refresh at most every 500 wall milliseconds. The occupation harness observes those public diagnostics from the browser frame loop so driver polling does not miss short clips. Old laptop rendering can make wall time much longer than active presentation time; no few-millisecond performance gate is applied.

Browser runs use headless Chromium/Edge, including SwiftShader and touch emulation. Physical Safari and phone interaction are not certified by these runs. Images supplement the behavioral assertions; the wide settlement capture alone does not establish an individual clip binding. Manual diff/format review is used because this repository has no configured formatter. Historical QA reports remain unchanged.
