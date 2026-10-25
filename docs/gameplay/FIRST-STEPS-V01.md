# First steps — alpha orientation (#263)

## Current contract

The guide explains the player's role after an explicitly chosen new campaign has
finished loading. It uses the existing Fjord scene, Character Card, stock views,
household/work previews and Play/pause. It owns no Core command, renderer,
production clock, reward, RNG draw or event feed.

The opening chapter is preserved verbatim. The invitation waits for the player to
close it; loading completion does not cut off reading. The actual campaign clock
stays paused through reading and the invitation; Play and +1 Year stay unavailable
until that choice is made. **Guide me** keeps that pause
until the player uses Play. **Explore on my own** invokes the existing ordinary
new-start intent, including its lifecycle/clock-intent fence. Help is available at
**Game menu → First steps / Help**.

### Trigger and reset policy

| Entry or action | Guidance behavior |
| --- | --- |
| New scenario, including a deliberately reused seed | Fresh invitation after readiness/story handoff; no old progress reused |
| Same-founders restart | Same fresh invitation; the player can opt out immediately |
| Continue / imported or locally loaded campaign | Preserve saved progress, initially keep the guide closed; no invitation or automatic replay |
| Tab return, BFCache or graphics recovery | Existing lifecycle pause is retained; no new invitation/reset; an already visible card stays at its existing step |
| Skip for now | Hide the card; keep earned UI progress; ordinary UI refreshes do not reopen it |
| Help after skipping | Offer Resume first steps or Replay first steps |
| Replay | Explicitly pause and reset guide observations; existing real homes/work remain eligible for credit |
| Collapse / Escape inside the card | Keep a compact current-goal line; Escape on the initial choice opts out like Explore on my own |

Progress is a bounded optional `firstSteps` field in the Fjord campaign envelope,
independent of canonical `SimulationState` and narrative/attention facts. It is
exported/imported and kept in the matching local sidecar. A sidecar from a
different canonical history cannot lend its progress. Restarts discard it even
when the seed and founders are identical. Old saves need no migration or global
same-seed completion flag. Unknown or malformed guide metadata is rejected before
replacing a loaded campaign; unknown imported fields are not retained.

## Four goals and observed predicates

| Player uncertainty | Existing screen / action | Recognition |
| --- | --- | --- |
| Who are these people? | Open a real available resident's full Character Card | Actual resident profile was presented, with name, work and household; the mobile link expands the existing card |
| What supports the community? | Inspect stocks and an actual productive worker or task | A resource view and productive worker/task were inspected; suitable work needs no reassignment |
| Can this household invest? | Inspect its current household, real BuildHouse price and occupied upkeep | The inspected household has a real permanent home, including a home built out of order; otherwise the player may deliberately keep existing Materials production while saving |
| Did a decision have a consequence? | Use existing Play/pause; inspect resulting production or upkeep | A real appended ResourceProduced, BuildingMaintained or MaintenanceDebtIncreased event after the watched decision is available; the player acknowledges that actual result |

The guide only navigates. Build/AssignOccupation and work-plan approval still
happen in the ordinary UI and use canonical availability/preview checks. Already
built homes count; no extra building, livestock slaughter, Longship salvage,
pregnancy, raid or role change is required. Selection facts are recomputed from
current available people and homes. Dead, absent, moved or removed targets fall
back to current ones; an unobservable watched target is released rather than
leaving a permanently waiting instruction. A former Materials worker who can no
longer produce Materials also releases that instruction. Actual unpaid maintenance
is a valid observed consequence, not a tutorial failure or an invented reward.

### Genuine Materials shortfall

Current fresh Fjord starts have **15 Food and 5 Materials**. A baseline permanent
home costs **10 Materials**, with **1 Materials/year** occupied upkeep. Those
values are read from the actual state/config; the guide never supplies the missing
five Materials. It shows the real shortfall, links to current producers and, only
when needed, opens an eligible existing work-plan preview without new housing or
specialization. When Materials work already exists, **Keep working and save for a
home** is a legitimate optional first choice. The next step waits for that actual
worker's production; it does not promise instant or guaranteed annual output.
Without a Materials producer, that choice is replaced by a work-preview link.

After the four goals, the manually reopenable **What's next?** helper shows at
most one grounded suggestion: empty Food stocks, an actual tent household, or
reviewing Expedition groups and their paid provisions/risks. It is not a quest log
or second notification feed. There is no additional automatic expedition popup in
this slice; its contextual explanation is in this helper and the existing UI.

## Performance, accessibility and layout

Canonical observation is attached to the existing UI refresh and guarded by the
session revision. The observer reads only appended events via a cursor. Unchanged
inspections do not save or rebuild the card. Affordability reuses the shared
availability cache. Metadata comparison/serialization covers only the tiny guide
record, never a whole save per frame. The feature loads no models, images,
dependencies, scene traversal, analytics or render loop.

One token-based panel sits over open world space. Navigation links yield its space to the real task/card. Existing workspaces and
selection sheets hide the guide; Help closes those presentation surfaces before
reopening it, without issuing a Core command. Landscape has a compact-line mode and
safe-area-aware bounds. Buttons retain 44px touch targets, keyed DOM updates,
keyboard focus, Escape handling and a separate quiet goal announcement. There is
no guide animation, including under reduced-motion preferences.

## Acceptance evidence and remaining playtest

Base: `12518aec36ac0d12bb6fafba8d7856ecc23bc4a3` (main, Character contracts successful).
See `docs/qa/onboarding-263/report.md` for executed checks and limitations.

The implementation must not be equated with proven novice understanding. Before
visual/alpha acceptance, ask a small uncoached playtester to start a new scenario
without instructions from the author. Record where they hesitate, then ask:

1. What do you control, and what do residents do autonomously?
2. Which real decision did you make, and what did it cost or reserve?
3. What actual consequence did you observe?
4. What would you do next without further coaching?

Record owner visual approval, a short actual first-run recording and physical
phone checks separately. DOM assertions or completion clicks are not an
independent playtest or physical iPhone certification. No automatic merge/deploy.
