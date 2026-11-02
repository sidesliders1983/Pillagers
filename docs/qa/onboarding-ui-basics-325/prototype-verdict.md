# Anchored Basics tour — prototype revision after owner feedback

Open `orientation-flow.PROTOTYPE.html` directly. This remains one self-contained,
throwaway HTML file with in-memory state and no dependencies or server. Its base
is `01dc5f79c9b8ee4024c0fbed338af4778a5f4c97`; the earlier card-based prototype is
preserved at commit `9a4dfa5` on branch `codex/prototype-ui-basics-325`.

## Question and owner feedback delta

Can one anchored callout guide genuine target-to-target actions across six optional
Basics objectives without taking control of game time, chapter choice or input?

The owner's blocking PR #326 review on 2026-11-02 says the prior persistent Journey
card is a help checklist rather than the requested interactive guided tour. The
revision therefore explores a compact progress chip, one concise floating callout,
an arrow and a pointer-transparent target halo. It deliberately keeps a single
requested flow rather than proposing competing layouts. No production code is
included here and this prototype is not owner approval.

## Journey map: hypotheses changed by the review

| Moment | Previous hypothesis | Revised design hypothesis |
| --- | --- | --- |
| Begin | A small Journey card is enough context | The chip should leave the world visible and the first callout should point beside the canvas |
| Move | Reading controls is sufficient | A reliable genuine gesture should move the hint; Got it remains a deliberate fallback |
| Select a person | Show me can open the right surface | Highlight Settlement, then an actual resident row; the player opens the card |
| Understand the card | Instructions can stay in the guide | Move the callout to name/occupation, then to the real Close control |
| Follow connections | Mention existing links | Point to the actual household link and move to its resulting record |
| Recover position | Explain home navigation | Point to Map, then View settlement, observing the explicit return |
| Set pace | Explain time without starting it | Attach to Play/Pause; Got it must allow continuing while paused |
| Navigate | List panel names | Point to the actual menu entry, then its Close control |
| Leave or revisit | Preserve objective facts | Back moves only the cursor; Skip preserves progress; Replay resets tour observations and preserves time/chapter |

## Empathy map: hypotheses, not player quotations

| Lens | Hypothesis informed by owner feedback | Response explored here |
| --- | --- | --- |
| Thinks | Where exactly is the thing I should use? | One live element ref, outline and arrow |
| Feels | A persistent text card competes with the world | One compact chip and concise callout; no dimmer |
| Does | Tries the highlighted control before finishing the text | Keep the actual target clickable; external evidence moves the hint without focus theft |
| Needs | Control of pace and a clear exit | Back, Skip tour, Replay basics, safe acknowledgment and every chapter available |
| Encounters change | A resident or anchor can disappear | Visible-entry fallback, truthful missing-person copy and no invented completion |

## Flow and presentation decisions

- Six objective labels remain unchanged. Substeps are presentation state, not new
  gameplay objectives: canvas → Settlement → resident row → Character Card details
  → Close → actual household link → resulting view → Map → View settlement → time
  → Game menu → Close.
- The mock controls emit the same actions used by the walkthrough buttons. The
  callout never triggers an action on the player's behalf. Camera gestures are
  simulated pointer/wheel events; no production camera signal is claimed.
- Camera and time support Got it because safe observation must not require a
  precise gesture or running time. Reading the resident details uses Next; closing
  the card still requires the actual Close control or Escape.
- A completed household/animal navigation shows its resulting view before Next.
  The final menu lesson requires opening and closing its actual mock surface.
- A missing resident is left incomplete. The next connection lesson can use an
  actual mock local animal record. No person, house or link is fabricated.
- All ordinary fresh and existing-campaign scenarios begin paused. This supersedes
  the earlier prototype's legacy-playing fixture to match the current paused-entry
  contract. Only the explicit mock Play/Pause control changes time.
- Continue to Chapter I is explicit. Selecting any chapter closes the tour and
  preserves its facts. Replay may run while Chapter III remains selected.
- The shell holds stable live DOM refs. It recalculates placement from current
  bounds after render, resize and captured scroll. Candidates avoid the target,
  HUD, navigation rail, open panel and chip; safe-area padding bounds the result.
  The diagnostics report actual target overlap for browser inspection.
- Arrow and halo layers use `pointer-events: none`. Only the small callout itself
  accepts input. There is no full-screen overlay, dimmer, keyboard trap or animation.
- A hidden/disappeared anchor falls back to the visible Settlement entry, or to
  the chip if that entry is unavailable. The fallback explains that the target
  disappeared and does not award progress.
- Escape closes an open mock panel; otherwise it tucks away the tour. Explicit
  tour-navigation buttons move reading focus to the new heading. External actions
  do not move focus into the tour. Live status reports the current instruction.
- The stage fills the viewport and includes a 44px control minimum. 844 × 390
  landscape is an intended inspection size, not a certified physical-device result.
  The shared Fjord theme remains inlined for standalone sharing.

## Evidence and provisional verdict

Evidence collected here: both inline scripts parsed successfully, the included
walkthrough actions were replayed against the pure reducer, source was reviewed,
and Git whitespace checks were used. No prototype tests were added. Local CUA
browser access is disabled in Work settings; no browser geometry, target-click,
visual accessibility or physical-device acceptance is claimed by this record.
The parent task owns the real browser/production checks and owner review.

| Included walkthrough | Observed reducer result |
| --- | --- |
| Fresh target-to-target | Six completions; anchor intents traverse canvas, Settlement, resident row, details, Close, household link/result, Map/home, time and menu/Close. Only explicit Continue selects Chapter I. Time stays paused. |
| Skip, Back and replay | Back retains completed facts; Skip closes the tour; Replay clears tour observations. The final replay leaves Chapter III selected and time paused. |
| Missing target | Hiding the current resident target awards no completion; restoring it permits selection and moves the anchor intent to card details. DOM fallback/geometry still needs browser inspection. |
| No resident / legacy | Chapter II and paused state remain. Missing resident stays incomplete; the existing mock animal link completes connections. Progress is 2/6 and the cursor advances to home. |

Provisional verdict: the flow model can express the owner's requested action-driven
substeps while preserving optional chapters and explicit time control. The earlier
persistent-card verdict did not establish the desired UX. This revision supplies
an inspectable anchored alternative; target collision, real event wiring, mobile
fit, uncoached comprehension and owner visual approval remain open.

Only the prototype HTML and this record changed. No production files, tests,
canonical rules or balances changed. No formatter is configured for this standalone
prototype; formatting was reviewed manually.
