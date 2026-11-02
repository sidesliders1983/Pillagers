# Optional Basics orientation — prototype decision record

This is a throwaway flow prototype for #325, created before production UI changes.
Open `orientation-flow.PROTOTYPE.html` directly in a browser; it has no dependencies,
server, network requests or persistence. Branch: `codex/prototype-ui-basics-325`.
Base: `01dc5f79c9b8ee4024c0fbed338af4778a5f4c97` (`origin/main` when created).

Question: can six optional Basics steps ahead of Chapters I–III retain clear progress
when a player explores out of order, returns later, skips, revisits or finishes?

## Journey map

These are design hypotheses, not observed player research.

| Moment | Player's likely aim | Friction to avoid | Prototype response |
| --- | --- | --- | --- |
| Arrive | Understand the world without losing control | Time advancing during unfamiliar guidance | Fresh campaign starts paused; guidance never changes time |
| Look around | Learn the mouse or touch controls | A gesture challenge before exploring | Accurate device instructions and an explicit Got it |
| Meet residents | Open a person, understand how to return | A card that feels like a dead end | Open and close the mock existing resident card |
| Understand connections | Find the household and settlement context | An invented second navigation system | Follow the mock existing household → Settlement link |
| Get home | Recover after roaming | Guessing how to restore the camera | Explicit Return home action |
| Manage pace | Learn the time controls safely | Being required to press Play | Got it is sufficient; Play remains a separate choice |
| Continue or leave | Choose the next activity | A forced chapter change or lost progress | Return later, Skip Basics, revisit and explicit Continue to Chapter I |

## Empathy map

All statements below are hypotheses to check with players, not quotations.

| Lens | Fresh player | Returning player |
| --- | --- | --- |
| Thinks | How do I move, select someone and get back? | Can I keep playing my current chapter? |
| Feels | Curious, with limited confidence about unfamiliar controls | Confident about some systems, uncertain about newer ones |
| Does | Explores, opens a resident and follows a connection out of order | Skips familiar guidance, returns only when useful |
| Needs | One clear next objective, visible progress and a safe return path | Preserved chapter/time state and revisitable guidance |

## Model decisions

- Four freely selectable chapter tabs: 0 Basics, I Home, II Discovery, III Conflict.
  Selecting a chapter opens no game panel and changes neither time nor progress.
- One objective card recommends the first unfinished Basics step. Completed steps
  remain individually revisitable through the progress list.
- Only camera, time and interface guidance use Got it. Acknowledging controls does
  not pretend the player performed a gesture or pressed Play.
- Meet your people completes only after the resident mock card is opened and closed.
  Closing another surface or closing with none open cannot award it.
- Discover connections completes on the mock existing household → Settlement link.
  Find your way home completes on the explicit Return home action.
- Each objective tracks its own progress. Relevant actions count out of order.
- Return later hides the card and retains completed steps. Skip Basics records Skipped
  without marking unfinished steps complete. Both remain revisitable.
- Finishing Basics changes no chapter, panel or time state. Continue to Chapter I is
  an explicit action; all chapter tabs remain available before completion too.
- A fresh scenario begins paused; an existing campaign begins in Chapter II with
  time playing. Basics preserves either state.
- Theme values are an inline snapshot of `src/ui/fjord-theme.css` at the base commit,
  allowing a single shareable file while keeping the established palette/card roles.

## Walkthrough evidence and verdict

Evidence is an agent replay of the HTML's included walkthrough actions through its
pure reducer, plus source inspection. It is **not a human playtest**, a visual browser
review or proof of production integration. CUA browser access reported
`Local browser use is disabled in Work settings`. No prototype tests were added.

| Walkthrough | Observed result |
| --- | --- |
| Fresh start | The six steps reach 6/6 while Chapter 0 remains selected and time remains paused. Only Continue changes to I Home. |
| Existing campaign | Choosing Basics is explicit. Return later preserves 1/6; Chapter II remains selectable; revisiting retains the completed camera step. Playing time remains playing. |
| Out of order | Connection and home count first. Closing no resident card adds no progress. Opening and closing a resident brings progress to 3/6. Camera movement alone adds nothing; Got it makes 4/6. |
| Skip and revisit | Skip at 1/6 records Skipped. Chapter III can be selected. Revisit keeps 1/6; another completion gives 2/6; Return later and revisit preserve both. |
| Premature Continue | At 0/6, Continue leaves Chapter 0 and progress unchanged, with an explanation that chapter tabs remain available. |

Provisional verdict: the state model can support the optional six-step orientation
without imposing action order or taking control of time/chapter navigation. Keep
progress separate from whether the guide is visible or skipped. Implement these
state decisions behind existing game surfaces, then verify real event wiring and
responsive presentation in production. Whether the guidance actually improves
first-session confidence still requires player feedback.

No formatter is configured in the inspected root/package files. Source formatting
was checked manually, and Git whitespace checks were used. No production files,
gameplay rules or balance values changed.
