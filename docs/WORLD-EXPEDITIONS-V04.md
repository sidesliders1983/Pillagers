# World Expeditions v0.4 — #54

Status: implemented prototype. UI text is English. Simulation Core owns the graph, clan knowledge, groups, missions, progression and consequences.

## Player flow

Open **World** at the board's bottom-left. Create recon group, enter a name and select named living residents. Groups have stable IDs, show members/occupations/status/location, and can be edited when not away. A member belongs to at most one group. Eligibility starts at 16 Winters and excludes residents providing active childcare.

Four touch-sized arrows select North, East, South and West neighbours. North is the founding longship's coastal connection; its mission requires and reserves an available unsalvaged ship. An away ship cannot be salvaged or used by another group. Each other neighbour is seeded terrain with a possible settlement; at least one land neighbour has a settlement.

The context panel uses button pickers for group, mission and ordered pillage priorities. It shows canonical costs, duration, success chance, death risk and blocking reasons before **Send expedition**. New/restart, save/load and import/export moved into top-right **Settings**. Time controls stay on the HUD. World and Settings panels scroll independently; board arrows and controls do not pan with sprites. Confirming a group or selecting a resident dismisses the World overlay so destination arrows remain reachable.

## Saved prototype rules

| Mission | Base duration | Food per member | Base success chance | Death risk per member |
| --- | ---: | ---: | ---: | ---: |
| Recon | 250 ticks | 2 | 80% | 2% |
| Surveillance | 400 ticks | 4 | 90% | 3% |
| Pillage | 500 ticks | 5 | 60% | 10% |

A Winter has 1,000 ticks. These are game values, configurable through the saved expedition configuration. Dispatch snapshots the current weather duration and risk modifiers, so a later forecast cannot change an already planned mission. Duration rounds up to whole ticks. Food per member is the base ration scaled by final/base duration and rounded up; total provisions are deducted at departure. Provisions are not refunded after failure or casualties. Annual home Food consumption is assessed at the Winter boundary: members still away are excluded. Shorter missions that return before the boundary do not prorate the existing annual home charge.

Away residents keep their identity, occupation and work remainders, but stop home production and are hidden from home sprites. Membership, occupation changes and career autonomy commands are blocked during the mission. They cannot form new partnerships, produce births or be assigned as caregivers while absent. Natural age mortality still applies at the Winter boundary; home shelter weather exposure does not apply while traveling. Mission-specific death risk resolves at the scheduled return, before the success roll and cargo allocation. Deaths use the existing cleanup for household, work, partnerships and childcare. There is no separate injury state or tactical combat in this prototype.

All ticks advance the player clan and persistent CPU target clans using the same domestic economy, family, mortality, cattle and weather engine. CPU targets have independently saved RNG streams. They do not initiate raids. Target creation is seeded independently of the player's domestic RNG. CPU settlements start with the same campaign configurations, not dynamically created loot caches.

## Knowledge and opportunities

Unknown reveals only direction and coastal access. Successful Recon records Scouted terrain, an observed settlement name and whether a pillage opportunity existed. This is already enough to permit Pillage. Surveillance is optional: it improves or refreshes knowledge to Surveyed and adds a broad resistance estimate (Low / Medium / High), without exposing exact inventory or population. Reports retain the observation timestamp; the UI warns after one Winter that intelligence may be stale. Failure retains earlier knowledge. Empty regions cannot be pillaged. An observed opportunity can be exhausted before a later raid returns, which produces an explicit no-assets report.

## One cargo category per survivor

Every returning living member has one carrying slot:

- up to 10 Food; **or**
- up to 5 Materials; **or**
- 1 living cattle entity; **or**
- 1 living persona.

The player selects priorities and can reorder them. For each survivor, the first priority with actual available assets fills the slot. Partial resource loads still consume one slot. Casualties contribute no slots; categories cannot be combined for one member. Captured cattle and people retain IDs and identity/history, and are removed from the target's active population/herd. Resources are debited from the target and credited to the player. Cattle arrive unassigned; people arrive in a new tent household. Current partnerships and active childcare end on transfer, with historical links retained. Horses and wagons are future extensions, not part of v0.4.

## Persistence and identity

The optional version-1 world extension stores graph, clan-scoped knowledge, configurable rates, groups, missions and complete CPU clan states. Active identity IDs are unique across clans. Historical person and cattle records retain genealogy and references in the clan that lost an entity; they are not active residents or productive/consuming animals. Historical relatives are copied as reference snapshots when needed by transferred descendants. Origin, DNA, birth Winter, occupation history and saved progress survive transfer. Historical occupation intervals end at observation so unobserved expertise does not grow silently.

Missions record departure, expected/actual return, participant names, provisions, priorities, discoveries, casualties and actual loot. Factual departure/return/transfer events feed the Chronicle. Success does not imply loot; failed and empty results are explicit. Existing saves without a world extension replay their domestic rules unchanged and show a new-campaign notice for expeditions; no graph or RNG rolls are silently added on load. New campaigns enable the world extension. Both routes retain explicit shared save/load and pause on loading.

## Validation

Public command/save-load tests cover hidden/persistent neighbours, reusable groups, constraints, production absence, supplies, coastal capability, deaths, optional Surveillance, one-slot resource cargo, real persona/cattle transfer, lineage after repeated raids, legacy replay, save validation and split-tick determinism. Browser QA covers the player flow and an iPad-sized viewport. See [QA report](qa/world-expeditions-v04/REPORT.md).
