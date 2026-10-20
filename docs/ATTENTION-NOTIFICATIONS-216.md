# Attention notifications #216

## Audit before implementation

Audited main `65980e08b496876fedaac843151ae9fd0882ab45` (2026-10-20).
The existing `/fjord-play` Attention button opens `FjordInterface`'s shared workspace.
Its badge currently counts empty Food, each tent household and unsheltered livestock.
It has no read/acknowledgement state, event feed, severity policy or historical navigation.
`FjordPlay.refresh` recomputes `projectChronicle(state.events)` while Attention is open.
That full-history scan is unsuitable for a long-running notification hub.

`SimulationState.events` already supplies ordered `event-N` IDs and canonical year/tick.
`eventFacts` freezes historical names and housing references. `GameplaySession` owns
rebuildable personal/family indexes and a campaign-replacement epoch. `FjordCampaign`
already stores noncanonical narrative/layout metadata outside Core. These are the
owners to extend; notification priority and read state do not belong in Core.

## Source and priority decision table

| Real source | Policy | Navigation / historical fallback |
| --- | --- | --- |
| `ChildBorn` | Noteworthy life event; group births by year | Child card, recorded family; source detail when unavailable |
| `PersonaDied` | Noteworthy life event | Historical detail / family tree, never a live world marker |
| `PartnershipFormed` | Noteworthy life / household formation | Recorded participant or household where available |
| `HouseBuilt`, `BuildingCollapsed` | Noteworthy settlement milestone | Existing home, otherwise recorded detail |
| `ExpeditionDeparted`, `ExpeditionReturned` | Noteworthy expedition fact | Actual mission/group reference or historical report |
| `ExploreAreaDeparted` | Noteworthy only for real departure; redirects ambient | Actual group/mission or historical report |
| `ExploreAreaReturnStarted` | Noteworthy homeward travel | Actual mission/group or historical record |
| `ResidentQuarrelled`, `ResidentsReconciled` | Noteworthy actual social facts | Recorded participants / family or historical detail |
| `ExploreAreaReturned` | Noteworthy expedition result | Actual group or historical report |
| `IslandSiteSighted`, `IslandMissionVisited` | Noteworthy actual discovery / visit | Only recorded, known site/mission; no unseen clan inventory |
| `ExploreAreaStranded` | Current critical alert, not a duplicate event badge | Current stranded mission; source remains in Chronicle |
| Current Food <= 0 | Critical actionable state alert | Existing Food surface |
| Households without permanent homes | Grouped noteworthy actionable state alert | Actual household |
| Unsheltered livestock | Grouped noteworthy actionable state alert | Actual livestock |
| Production/consumption, occupations, provisions, preparations, group editing | Ambient / Chronicle only | Bounded recent fact view; canonical history retained |
| Formal marriages, skills, combat, raids, leadership, diplomacy | No invented adapter | Only implemented events can be added later |

`PartnershipFormed` is the implemented partnership/household event; it is not called
marriage. Death and birth are canonical facts, not inferred from a later population.
Wildlife #226 will be an adapter on this contract, with only first species discovery
noteworthy. It will not keep a separate badge or independent read-state mechanism.

## Projection and bounded metadata

A versioned presentation record contains source event ID/type, category, severity,
year/tick, historical actor IDs, factual text and a typed optional navigation target.
Canonical IDs/order deduplicate event records. State alerts use documented stable
condition IDs (`food-empty`, `housing`, `livestock-shelter`, `stranded:<mission>`).
No random notifications or simulated events are introduced.

A rebuildable append-only index retains at most 200 noteworthy notifications and
100 recent Chronicle facts; source history is neither copied into saves nor pruned.
The UI groups same-type events in a year, pages groups/details, and shows an exact
unread count. Older notifications remain accessible as historical facts in the Clan
Book/Chronicle rather than expanding an unbounded inbox. Earlier Chronicle pages scan
at most 200 source events per request and show at most 20 formatted facts. Ambient facts have no badge.
New visible-world events receive one compact eight-second notification card. Reload/adoption is silent; large batches become one catch-up invitation instead of a replay burst.

Save only version 1 UI metadata: an adoption/read-through event ordinal, up to 200
read event IDs and at most 19 current alert episode/acknowledgement records. Individual
reads are compacted against the retained inbox. Mark events read advances the cursor; critical conditions require their separate Acknowledge action.
Older saves adopt at their current event head, so historical life events are not
replayed as new; genuine current actionable conditions still appear.

An alert is one continuously observed positive canonical condition. It remains until
acknowledgement or resolution; acknowledgement suppresses its badge, not the actual
condition or gameplay. Once a refresh observes resolution, its episode is removed.
A later activation gets a new episode keyed by the canonical event head. Transitions
entirely inside a fast-forward batch are intentionally grouped, not invented as
individually observed alert episodes. Counts/body always come from current state.
Read metadata round-trips with the campaign envelope, resets on new/restarted games,
and is discarded for mismatched canonical/sidecar snapshots. It cannot resume/pause
the clock, edit resources or change replay outcomes.

## Ownership, interaction and validation plan

1. Commit this audit and mapping proposal before implementation.
2. Add the incremental index, pure condition projection and bounded metadata contract.
3. Reuse the existing Attention workspace/button for notifications, current alerts,
   grouped details and a bounded recent Chronicle view. Keep weather information.
4. Route clicks through current canonical availability; unavailable destinations stay
   readable historical details. Preserve keyboard focus, Escape and 44px touch targets.
5. Test real life/expedition events, save/load/replay/rollback, acknowledgements,
   no duplicate fast-forward notifications, no unknown-site leakage and unchanged Core
   bytes/RNG/clock intent. Benchmark 100,000+ events and repeated UI reads.
6. Stack #226 on this foundation and migrate its first-discovery adapter/read handling.
   Fix its lightweight QA launcher and open Attention directly for review.

Browser control currently reports no enabled browser surfaces. DOM interaction tests
are available, but do not substitute for CSS/WebGL/device visual acceptance. Keep the
PRs draft until required current-head checks pass and report the visual QA limit.

Reproducible interaction and profile evidence: [QA report](qa/attention-216/README.md).

## Short world notifications (owner review, 2026-10-20)

The existing dark Fjord UI now has one notification card above the bottom navigation,
inside device safe areas. It offers View details and Dismiss, announces politely,
keeps keyboard focus in place, and pauses its eight-second timeout during hover or
keyboard interaction. Reduced-motion preferences disable its entrance animation.
The world never pauses and no sound is played. Dismiss/expiry do not mark a source
read or acknowledge an emergency; View uses the same Attention detail/read contract.

Only newly observed canonical events are delivered, with at most three pending cards.
A larger batch becomes a generic catch-up card; a newly critical condition keeps
its explicit message before that summary. Existing history and initial conditions
are silent on adoption, load or campaign replacement. Hidden/loading periods and
open workspaces/readers advance the ephemeral cursor without a later replay queue.
No toast state is saved. The persistent Attention badge/history remains available.

`ExploreAreaReturnStarted` is now a noteworthy expedition fact (heading home is
distinct from arrival). Real `ResidentQuarrelled` and `ResidentsReconciled` events
are noteworthy life facts; mediation attempts and incident expiry remain ambient.
Names come from historical snapshots. The social pilot must actually be enabled
and emit these events; notifications never enable it or fabricate disagreements.

The feed uses the shared dark-theme palette, a selected filter, compact actions and
a direct detail link for single-event groups. All actions retain 44px touch targets.
