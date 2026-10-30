# Expedition journeys and empathy hypotheses

These maps support a clickable design comparison, not a claim that unfamiliar players have validated it. Labels O, S and H distinguish a new observation, a source/historical fact, and a hypothesis for owner review. English wording below describes proposed UI, not an implemented change.

| Intent / stage | Current evidence | Possible need or uncertainty (H) | Prototype intervention |
| --- | --- | --- | --- |
| Prepare a group | O: Expeditions → New group → two resident checkboxes. The real 15-Food campaign cannot fund a 16-Food pack. [Observed shortage](evidence/current-run-3/02-current-insufficient.txt). | Who can I spare, what will it cost, and why is preparation blocked? No emotion or quote is attributed to a player. | Named crew with age, availability and explicit shortfall. A separates steps; B shows cost beside crew; C collapses crew under the order. |
| Pay and choose where to go | O: one selected resident → Prepare expedition → packing review → Pack supplies. Clan Food changes 15→7 while paused. The group shortcut exposes the map controls. [Review](evidence/current-run-3/03-current-pack-review.txt), [controls](evidence/current-run-3/04-current-target-controls.txt). | Have I paid? Have they departed? Which click issues the order? | Explicit Supplies packed state, visible next action, and map instructions that a valid click commits immediately. No second payment. |
| Back, cancel and leave | O: after opening the map toolbar, Cancel selection → Expeditions leaves a Prepared group, 100% pack and 7 clan Food. [Observed result](evidence/current-run-3/05-current-prepared-after-map-cancel.txt). | Does Back cancel a draft, end the journey or refund supplies? | Back before packing leaves 15 Food; later map cancellation retains the paid pack. End expedition separately explains discarded supplies. Close keeps clock intent. |
| Use a sighted village | S: IslandMissionPanel has its own group selection; an active group cannot start another mission. Recon starts at home; successful returned Recon identifies a settlement. This was source-checked, not newly discovered in this audit. | Why is a known place visible while its actions are unavailable? Which group am I sending? | Same selected-group context, visible phase-specific reason, Return group home / Choose another group, and locked later actions with explanations. No remote dispatch or hidden rival knowledge. |
| Understand a failed journey | Historical O: the #297 audit recorded outward-route-blocked followed by Completed, then a separate real sighting and Stranded after a return order. S: status, lifecycle outcome, reason and returnedAt are distinct. | Is the group home? Did exploration succeed? Are people still away? | Separate Returned early — route blocked and Return blocked — group stranded examples. Preserve Food paid and absence of arrival; no rescue/refund. |
| Manage several groups | S: crew cannot be in another group; membership/disband depends on being home. The owner's earlier UAT confirmed separation/disband improvements; it is not approval of this design. | Which group is selected, and which one is available? | B keeps all group phases visible. A/C retain explicit selection. Disband at home produces an empty list and Create group. |
| Use the longship | S: current commands own boarding, coastal disembark and stock/capacity checks. Physical participants must actually reach the vessel. | Is this a new journey or the same paid pack? Can I safely disembark here? | Explicit same-expedition context. Boarding is condensed only for the demo; a safe-coast fixture exposes Disembark. No added transport mechanic. |

## Proposed task paths

**Explore:** choose/create group → select available residents → review actual supplies → confirm pack → choose valid land/ship destination → resume clock deliberately → review actual progress/return. Opening the workspace is not a command to travel.

**Known settlement:** choose a home group → choose a legitimately known place → review mission-specific eligibility and quote → confirm separate dispatch → return → inspect the dated report. Seeing a settlement does not identify it, and a failed Recon does not unlock later actions.

**Return/outcome:** recall when valid → show Returning while underway → display actual arrival, early return, or stranding. Do not substitute the word Completed for an assessment of the actual outcome. Historical events remain authoritative.

## Before/after intervention map

| Existing capability and owner | Proposed access | Boundary |
| --- | --- | --- |
| ExpeditionPanel: CreateExplorationGroup / SetExplorationMember | Group overview or guided crew step | Existing commands and eligibility; no automatic recruitment |
| ExpeditionPanel: startExpeditionOffer / StartExpedition | Supplies review with one payment | Exact live quote and stale-offer revalidation remain required |
| ExpeditionPanel: ExploreArea / RecallExpedition | Explicit map order / Return home in current group context | Real physical route and carried supplies; no free change in resources |
| ExpeditionPanel: CancelExpedition / DisbandExpeditionGroup | Separate End expedition / Disband group actions | Prepared pack disposal differs from removing an idle home group |
| IslandMissionPanel: islandMissionOffer / DispatchIslandMission | Known place within the selected group's task | Home eligibility, knowledge, equipment and exact offer remain authoritative |
| IslandMissionPanel: equipment / cargo priorities | Mission review details | No targeted animal/sex/age selection; no fictional stock |
| Existing navigation: group focus, Home, Map, Activity Center | Contextual map focus and factual report link | Preserve pan/selection/clock intent; do not invent a new global hub |
| ExpeditionPanel: Test supplies | Secondary tester route in a future implementation proposal | Eight remains the normal pack; do not remove an existing supported test override silently |
| Chronicle / AttentionHistory / mission projection: R01 | Outcome-specific summary and existing event details | Correlate actual status/reason/arrival; no rewritten historical facts or route repair |

## Evidence still needed after design feedback

The model cannot validate real pathfinding, hidden-information safety under every save, success probabilities, save compatibility, physical touch/Safari gestures, live performance or novice comprehension. A later implementation must use the existing public offers/commands and its own approved regression boundaries. This prototype is not evidence that M01 is fixed or that the game is alpha-ready.
