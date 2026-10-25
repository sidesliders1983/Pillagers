# The Founding Journey — alpha v0.1 (#270)

The optional #263 guide now introduces three playable modes through real objectives:
an autonomous community, discovery with limited knowledge, and preparation for
risk-bearing conflict. This is presentation and navigation, not a quest engine,
reward economy, tutorial simulation or requirement to complete chapters.

## Campaign entry and time

New scenario, same-founders restart, in-game New/Restart, ordinary Continue,
import and local load arrive paused. Both **Guide me** and **Explore on my own**
stay paused. Only a deliberate playable **Play** starts time. Play is unavailable
during loading, the founding story and the invitation. +1 Year is unavailable
before that first Play and during expedition mode. Existing speed and fractional
pacing are retained where applicable.

There is one intentional exception: an explicit internal board → Fjord view
handoff may carry its already-running pacing after scene readiness. A newer pause,
visibility loss, recovery, reset or player intent invalidates its pending callback.
Ordinary Continue does not use this exception. Warm-tab/BFCache/WebGL recovery
keeps the existing pause policy. No entry or guide choice advances Core ticks,
produces resources, draws RNG or simulates time while the game is closed.

## Optional journey

New histories receive the invitation after the preserved founding story closes.
Continue/import keep guidance closed; **Game menu → Founding Journey / Help**
reopens it manually. Collapse/Escape, Close journey, Resume and Replay guidance
reuse the existing small card. Mobile navigation folds the card away, and normal
selection/workspace/map controls retain their space.

Every chapter is immediately selectable. One objective is recommended at a time,
with authored purpose, real progress and **Show me**. The chapter list allows
out-of-order goals. **Return later**, **Skip objective** and **Consider again**
affect guidance only. A deferred upgrade, a long wildlife hunt, a missing ship or
a declined raid never blocks another chapter or actual gameplay.

| Status | Meaning |
| --- | --- |
| Completed | A real campaign fact or actual UI inspection/acknowledgment satisfies this objective |
| Available | A next inspection/action can be reviewed through ordinary UI; it is not a dispatch promise |
| Later | The player deliberately set the objective aside, or a real Recon is still underway |
| Skipped | The player deliberately skipped this objective |
| Blocked right now | Current knowledge, supplies, people or another actual prerequisite is unavailable |

Real completion takes precedence over a previous skip/defer. Replay resets UI
observations/acknowledgments; it still credits real historical Core actions. There
are no extra buildings, items, sightings or raids to repeat for a checkbox.

## Authored chapters and predicates

| Stable objective ID | Existing interaction and recognition |
| --- | --- |
| home / meet-people | Inspect a full real resident profile, a household, a resident via its home list, and individual founding livestock (including a truthful historical record if needed). Person, household, building and animal are different concepts. |
| home / understand-work | Inspect Food/Materials and productive work. Suitable jobs need no reassignment. If Materials work is missing, Show me opens an eligible existing work draft, without approving it. |
| home / permanent-home | An actual permanent home or saved HouseBuilt fact counts, including construction before opening the guide. Otherwise show real cost, upkeep and Materials shortfall. |
| home / specialize-home | A real non-null BuildingSpecialized fact or current specialized home counts. Show me expands the existing home preview; occupations stay unchanged. |
| home / upgrade-home | A real BuildingUpgraded fact or current positive upgrade level counts. Show real next cost, matching-work bonus and occupied annual upkeep; later is valid. No new housing-capacity rule is claimed. |
| home / longship-choice | Actual salvage/keep facts or an explicit UI acknowledgment for a retained ship. Keep for now never issues KeepLongship or creates an event. Distinguish kept, away, salvaged and not present. |
| discovery / prepare-expedition | A genuine paid Explore departure, including actual embarkation with a paid pack. Group creation or packing alone is not departure. |
| discovery / wildlife-species | Three distinct supported species from canonical WildlifeSighted records, owned by this clan/world with actual named witnesses. Deduplicate species across groups and historical imports. Camera sightings and livestock do not count. |
| discovery / find-neighbours | A dated site in the existing public island-intel projection. The guide never reads CPU inventories, globally generated rival locations, hidden names or undiscovered paths. |
| discovery / sea-travel | Optional same-mission embark → sea destination → actual elapsed sailing time → disembark facts. Immediate same-tick destination/landing does not count. A gone ship gets truthful on-foot guidance, never a replacement ship. |
| conflict / recon | A real returned Recon, even if failed/cancelled. An underway Recon is later; blocked supplies/crew/knowledge remain explainable through the existing offer. |
| conflict / personal-gear | Actual supported gear assigned to named people, including existing assignments or historical genuine EquipmentAssigned. A target or stored spear alone is not equipped readiness. |
| conflict / pillage | A genuinely accepted Pillage dispatch. It is optional; no success, taking People/livestock, or particular cargo is required. |
| conflict / mission-result | Open the real returned Pillage's Activity Center report. Save the actual event ID; the same mission and result remain selected after load. Failure, casualties, lost gear and legitimately empty loot count as consequences. |

Each objective presents its actual steps as a read-only checklist. An outlined
box becomes a visible check mark as soon as the corresponding inspection or real
campaign fact is recorded. The checklist cannot be toggled by the player and
does not add completion requirements or saved derived progress. Existing actions
count, including previously constructed homes and assigned gear. Wildlife checks
name only species already legitimately witnessed; pending slots reveal no unseen
species or locations. Show me follows the first unfinished step, and completed
objectives link to their existing review.

Show me performs navigation/read-only review only. Construction, work changes,
upgrade, salvage, target setting, equipping, packing and dispatch still require
the normal user action/confirmation and canonical eligibility. No chapter owns a
Core command.

### Real economy and risk

Fresh Fjord starts currently have 15 Food and 5 Materials. A baseline home costs
10 Materials and 1 Material/year while occupied; read saved campaign rules.
Salvage currently returns 20 Materials irreversibly and removes sea travel.
Keeping the ship is equally valid. The guide supplies nothing and never requires
slaughter or salvage to fund a house.

Normal Explore currently packs 8 Food per actual person. A new two-person group
needs 16 Food, more than the fresh clan's 15. Review the real offer, choose a
feasible smaller group or produce Food; absence affects settlement work.
Ship boarding, sailing, disembarkation and carried provisions use #248 unchanged.

Smithery supports Wooden Spear, Wooden Shield and Leather-reinforced Shield.
Actual targets and ordinary timed work produce items; setting a target spends no
inputs and does not finish an item. Hides are only needed for the supported
leather shield recipe. There is no body-armor slot, iron weapon, wounds/health or
tactical combat engine in this guidance.

Pillage uses the existing real risks, priorities and mission outcome. The
Activity Center's existing historical record now displays actual success/failure,
crew returned/lost, integer recovered assets and retained/lost gear. It does not
re-resolve the raid or create a second event feed.

## State and performance

The optional per-history firstSteps envelope retains version 1 compatibility.
Its bounded optional journey version 1 contains the selected chapter/objective,
UI inspections, retained-ship acknowledgment, viewed report event ID, and at
most the 14 stable skip/defer IDs. No chapter authority is added to Core.

A small in-memory index reconstructs facts once on history restore, then consumes
only appended events on session revisions. It retains a bounded set of evidence
IDs, supported species and live sea-trip cursors; derived progress is never saved.
Unchanged refreshes do not save metadata or redraw keyed HTML. There is no full
state serialization, lifetime history scan or renderer traversal per frame.

Guide refreshes do not plan mission routes. Cheap current supply/crew/knowledge
checks describe readiness; explicit Show me uses the existing actual mission
offer/confirmation, which returns the precise route or eligibility reason.
No hidden destination is supplied to that review. Existing availability caching
is reused for housing. No new assets, dependencies, service or telemetry.

Import validates known bounded fields and the canonical viewed Pillage report
before replacing the campaign. Matching-history local sidecars retain progress.
New/restarted histories discard it. Existing four-step metadata remains readable;
its UI observations are retained when manually opening the chapter layer.

## Acceptance

See [implementation QA](../qa/founding-journey-270/report.md). Automated checks do
not prove novice understanding or physical phone layout. Owner review of authored
copy, desktop/phone visual checks and a small uncoached playtest remain required
before merge/release. A hunt or raid need not finish during that test.

Ask the player, without coaching:
1. What do you control, and what happens autonomously?
2. Which real choice did you make, and what did it cost or risk?
3. What do exploration and Recon tell you, and what remains unknown?
4. Who would you equip/send, or why would you postpone conflict?
5. What actual next action would you choose independently?
