# Activity Center: journey, empathy and design question

THROWAWAY DESIGN STUDY — branch `codex/activity-center-prototype`. Not intended for main.

## Question

Which structure lets a player notice, understand, act and return to the world with
least interruption? Compare three genuinely different hierarchies inside the existing
Fjord Play shell, with the same real paused expedition checkpoint and cultural names.

## Evidence and constraints

The owner’s phone screenshot shows the first notification card consuming a large
part of the world view, with redundant close/detail controls. The owner asks for a
small icon/category/message immediately above the Attention counter, then clarifies
that tapping the whole notification should close it and open Activity Center.
That exact notification correction is already in the implementation branches.

The earlier chosen Horizon shell (#182) puts world visibility first, uses one
right-thumb navigation row and transient sheets, with 44px actions and safe insets.
Keep those decisions. Do not add an invented Health/Mood/skills dashboard, a second
clock, hidden species, a new gameplay command or a full-screen management page.

## Journey and empathy map

| Moment | Player goal / likely thought | Friction in current view | Design response |
| --- | --- | --- | --- |
| Notice | “Something happened; can I keep exploring?” | Large overlay, two unnecessary actions | Compact timed message; one whole-message tap |
| Orient | “Is this urgent or just interesting?” | Conditions and unread events share one count/list vocabulary | Separate active conditions, new activity and history |
| Understand | “Who, where and what actually happened?” | Repeated View/group/detail actions and technical provenance | Single-event row opens detail; historical people/context first; provenance collapsed |
| Act | “Take me to the thing that needs my attention” | Acknowledge can look like resolving the underlying problem | One relevant context action; Confirm seen explicitly leaves condition active |
| Resume | “I want my world back” | Large persistent menus or nested navigation | Existing close/Escape and world remain; no automatic pause |
| Recall | “What did that group discover earlier?” | Unread management mixed with the permanent journal | Explicit History or subject path; recorded facts retained |

Hypotheses, not user-research findings: players may feel interrupted by a large
card, may confuse read state with resolution, and may want urgency before chronology.
The supplied screenshot and owner instructions support the specific size/action
correction; a prototype comparison is needed to validate the broader hierarchy.

## Functional clustering

- Awareness: compact world message + existing Attention counter.
- Triage: current actionable conditions, with critical priority and explicit seen state.
- Reading: new life, expedition and discovery facts, grouped without a transaction dump.
- Context: affected people/group/site and historical fallback, then relevant destination.
- Recall: recent history/topic navigation, with technical source under disclosure.
- Presentation controls: isolated purple prototype switcher/state inspector, never game UI.

## Variants and tradeoffs

| Variant | Structure | Best at | Cost |
| --- | --- | --- | --- |
| Focus (recommended hypothesis) | Priority conditions, then new activity; History tab | Quick triage and getting back to play | Two distinct clusters to scan |
| Inbox | One compact list; master/detail on desktop, inline detail on mobile | Fast chronological catch-up | Urgency and story compete in the same list |
| Journal | Subject index, subject timeline, separate condition disclosure | Deliberate recall by topic | Extra navigation before an individual record |

Primary paths to compare: notice → open → inspect; condition → context; first
sighting → people/source; mark updates read while conditions remain active;
find a prior expedition; switch designs on the same phone without changing data.

## Prototype boundaries and verdict

Real canonical records, frozen names and currently available destinations are projected
once. Reads, seen flags and destination actions mutate only component-local memory.
The snapshot is paused; the prototype never sends a simulation command or persists
notification metadata. Normal surrounding game controls remain real: use the separate
QA origin, not a personal campaign. Purple controls expose all relevant local state.

Initial recommendation was Focus. The owner selected **Focus** on 2026-10-20:
current conditions first, then new activity. Rewrite that hierarchy in the actual
component with the existing read/acknowledgement/navigation contracts. Retain all
three primary-source alternatives on this branch; do not merge prototype code.

Run `pnpm dev --host 0.0.0.0 --port 5220 --strictPort`, then open
`/scripts/qa/activity-center-prototype.html?variant=focus` (also `inbox`, `journal`).
The variants live on `/fjord-play?activityPrototype=1&variant=...` and use a shared
floating switcher; arrow keys switch except inside inputs/selects/editable content.
The route is development-only and prototype code is captured separately from main.
