# Anchored Chapter 0 tour — PR #326 owner revision

This record covers the contextual-guidance revision requested in the owner review
on [PR #326](https://github.com/sidesliders1983/Pillagers/pull/326). The earlier
[card-based QA](../report.md) remains a historical technical record; it does not
establish acceptance of this presentation. Owner visual approval and a real
uncoached new-player test remain open. Keep the same PR in draft.

## Experience and design proof

Guide me now opens one concise floating callout and a compact Journey chip. Each
hint points to an actual current DOM control or card using a transparent halo and
arrow. The highlighted controls and world remain independently usable. There is
no dimming, modal tour, scene scan, new dependency or simulation command.

The six lessons use actual accepted camera, selection, link and close actions.
Resident guidance moves from the Residents entry/list to the named Character Card
and its real Close button. Connections follow an actual household/member or live
animal link and wait for the resulting view to close. Map guidance uses the real
map and its Close control, including the existing mobile modal owner. Time offers
Got it without ticks; actual Play/Pause remains exclusively the player's choice.
Navigation follows a real menu/panel opening and closing. Show me focuses an entry
without performing a selection exercise. Long explanations and all four chapter
tabs remain in the existing Journey browser.

The separate [prototype source and revised journey/empathy hypotheses](https://github.com/sidesliders1983/Pillagers/blob/4b94ddbadca7d56301d2740784e97cb121cc9e75/docs/qa/onboarding-ui-basics-325/prototype-verdict.md)
were captured on `codex/prototype-ui-basics-325` before production integration.
They are design hypotheses, not player quotations. Native Chrome prototype review
ran four walkthroughs at each of 1440×900 and 844×390: 94 observations and 76
active-callout geometry samples, with no final overlap, interception, viewport or
44-pixel failures. Six actual touch-pointer taps verified the initial resident
transitions. A visually discovered hidden SVG connector was corrected before that
final prototype review. Its mock cards did not overflow, so internal scrolling was
left for production QA. Prototype code is not part of this implementation branch.

## Progress, intent and lifecycle

The existing six orientation IDs and all 14 Chapter I–III predicates remain.
Optional version-one `journey.tour` stores exactly a known step and dismissed
boolean. Old absent fields stay absent; import rejects malformed fields before
replacing a campaign. Live refs, transient substeps and action identities are not
saved. Continue/import keep both tour and guide closed and arrive paused.

Back changes only the tour cursor. Skip retains earned facts. Resume reacquires
current targets. Replay basics clears only the six Basics facts and their
skip/defer IDs; existing resident/worker/household observations, watch/evidence,
ship/report and Chapter I–III progress remain. Replay basics does not take over
time. Finishing the walkthrough does not switch chapter or start play; explicit
Continue opens Chapter I.

Dedicated accepted-navigation callbacks distinguish real card actions from
programmatic presentation/refresh. Genuine camera intents exclude programmatic
home/focus/escape changes. Delayed native-control observations run after owners and
default actions, fenced by current history, lifetime, readiness and tour session.
Actual entity kind travels with a close: household and persona IDs can overlap.
Missing/dead/away targets fall back truthfully without invented completion.

The view coalesces target changes, bounded UI mutations, scrolling and viewport
resize into scheduled layout work; it has no perpetual animation loop. It checks
CSS visibility and scroll clipping, uses safe areas, and removes observers, marker
attributes and pending work on close/disposal. Callout actions retain keyboard
focus when Next disappears; external re-anchoring does not steal another owner's
focus. Existing wedding invitations are suspended while either guide presentation
is visible.

Production source is committed at `3fece7070b01131f6253d0b15231f0832d7ad8a4`.
Both final browser runs record that exact revision and unchanged initial/final
working-tree byte hashes. The subsequent QA commit adds documentation/artifacts only.

## Tests and review

New public-seam red/green slices cover the single-callout invitation, genuine
resident selection/closing, linked-result return, Back/Skip/Resume/Replay,
clock-safe completion, native menu action provenance, keyboard focus and the real
founding-couple household/person identifier collision. Additional interface slices
cover accepted navigation source, stale/reentrant history changes and captured
close kind. The bounded saved cursor and narrow replay use the approved public
progress/import seam.

| Check | Result and scope |
| --- | --- |
| Dedicated guide/interface/progress tests | 48/48 passed on final source, zero failures/skips |
| Broader entry/camera/playback/wedding plus guide tests | 69/69 passed on `02521756`; final subsequent change is placement/chip protection, checked by the 48-test rerun and real browser |
| Final production build | Passed on `3fece707`: public validation, TypeScript and Vite; existing chunk-size advisory only |
| Tracked public assets | Passed: 640 files, 47 decoded Terrain models, 14 prepared islands, 56 character sources; public tree unchanged |
| Character/Lab audits | Passed: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules, Idle/Walk/Run + World; asset tree unchanged |
| Git whitespace validation | Passed; no configured formatter |

Two intermediate complete suites reported 1,673/1,683 and 1,674/1,684 tests passed,
zero test failures and ten inherited optional skips. Their provenance guards also
correctly reported source changes during the visual-review corrections. They are
retained as diagnostics and **are not claimed as final-head full-suite passes**.
The later wrapper exits nonzero for changed source despite zero test failures.
The ten existing skips are nine source-Meshy/LOD fixture checks and the opt-in
`RUN_R3_EVIDENCE` frozen export proof. No required check or assertion was disabled.
Exact-head GitHub Character contracts validation remains the full-suite merge gate;
see the PR's current checks, and keep the PR draft until it passes and owner
acceptance is recorded.

No formatter is configured. Source formatting is reviewed manually and checked
with Git whitespace validation. Original source assets, dependencies and Core
implementation are unchanged.

## Production browser evidence

| Final run | Native Chrome / viewport | Result |
| --- | --- | --- |
| Desktop | 156.0.8078.74, 1440×900 | 11/11 stages, 15 target transitions, zero page errors |
| Touch context | Same Chrome, 844×390, reduced motion | 11/11 stages, 14 target transitions, zero page errors |

Each final run checks 21 geometry observations. All visible tour controls are at
least 44×44 pixels, targets and chips remain clear, and the chip centre actually
receives input. Halo/arrow layers have no pointer interception. Source byte hashes
remain unchanged from initial capture through completion; the actual persisted
canonical campaign remains identical through orientation. Only an intentional
player time action may change it; this walkthrough chooses Got it without ticks.

The eleven stages cover paused New game, camera action/acknowledgment, Show me
without fabricated selection, Back and missing-target fallback, actual resident
selection/read/close with resize, real household link/result/close, Map open/close,
time plus menu completion, narrow Replay/Skip, ordinary Continue and actual v1
file import. Completion stays on Chapter 0 until explicit Continue.

The resident directory did not overflow at either size; it is not claimed as a
successful scroll exercise. The expanded card did overflow. A **programmatic DOM
scroll probe** moved its real scroll owner, then scrollIntoViewIfNeeded revealed
the actual household link: desktop offset 0→2; touch 0→48→204. The view then marked
the actual household button and kept it clickable. This verifies scroll/re-anchor
behavior, not a physical touch-scroll gesture or iPhone browser.

Raw and separate annotated samples were visually inspected. Desktop callout is
adjacent to the card; mobile callout is below the chip and outside the card.
Portrait, name, occupation, work details, actual Close and the Journey chip stay
unobscured. The mobile Map's existing top-layer Close and the chip remain usable.
These are sample reviews, not owner approval.

[Desktop card — raw](evidence/desktop-real-resident-card-raw.webp) ·
[Desktop card — annotated](evidence/desktop-real-resident-card-annotated.webp) ·
[Touch card — raw](evidence/touch-real-resident-card-raw.webp) ·
[Touch card — annotated](evidence/touch-real-resident-card-annotated.webp) ·
[Touch household link after scroll](evidence/touch-household-link-annotated.webp) ·
[Touch Map](evidence/touch-map-result-annotated.webp)

Actual Chrome controls and isolated real campaigns are used. Canonical parity is
read from the existing public persisted campaign envelope; no private session
commands complete the tour. Any legacy-v1 import fixture is explicitly constructed
from an actual current campaign by removing only the optional tour/orientation
fields and retaining valid existing chapter progress. It is not a historical save
captured from an older release.

Raw screenshots are retained separately from annotated derivatives. Annotations
mark the measured live target and callout, without altering the original image.
Source hashes, seeds, stage results, geometry and artifact checksums are recorded.
At least three actual target-to-target transitions are required in both sizes.
Touch-context Chrome evidence does not establish physical iPhone Safari acceptance.

### Earlier attempts retained

- First production desktop attempt exposed a real CSS inheritance problem: global
  app styles reduced callout/chip controls to 40 pixels and added HUD styling to the
  hint heading. Scoped 44-pixel controls and a dedicated heading resolved it.
- The next attempt passed those checks but dispatched the test's layout event on
  window instead of the real document owner. The runner was corrected; no force
  click, production workaround or weakened assertion was used.

See `evidence-manifest.json` for the selected preserved raw records and derivatives.
Earlier real failures also exposed an over-strict scene-work input fence (a real
selection opened its card but was not credited), and touch callout/chip overlap.
Both were fixed. Manual visual review rejected earlier technically passing runs
that obscured the card/chip; the final runner now enforces chip hit testing and
zero overlap. One interrupted provisional run is preserved as interrupted.
These earlier incomplete, superseded or visually blocked runs are not counted as
final passing journeys.

## Reproduce and owner acceptance

With the feature build serving on port 5195:

```powershell
node scripts/qa/check-anchored-basics.mjs desktop
node scripts/qa/check-anchored-basics.mjs touch
```

The runner uses the existing Playwright runtime and native Chrome, with sandbox
retained and no software-renderer override. It creates a new output directory and
rejects reuse. Environment overrides include QA_ORIGIN, QA_OUTPUT, QA_CHROME and
PLAYWRIGHT_MODULE. It records initial Git/source provenance and preserves failure
evidence. Run viewport variants separately.

The owner must still review the actual anchored presentation and record an
uncoached new-player result. Browser automation and passing predicates do not
replace those acceptance gates. No merge or Sites publication is authorized by
this review-fix request.
