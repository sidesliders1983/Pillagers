# The Founding Journey — alpha v0.1 (#270 / #325)

The optional #263 guide has four freely selectable chapters: short UI orientation,
an autonomous community, discovery with limited knowledge, and preparation for
risk-bearing conflict. This is presentation and navigation, not a quest engine,
reward economy, tutorial simulation or requirement to complete chapters.

## Campaign entry and time

In Fjord Play, a new scenario, same-founders restart, in-game New/Restart,
ordinary Continue, import and local load arrive paused. **Guide me** stays paused
until **Play**.
Choosing **Explore on my own** releases the invitation hold but also stays
paused until the actual Play control is used. Dismissing with Escape stays
paused. Continue/import, replaying guidance and background recovery do not
auto-start time. Play is unavailable
during loading, the founding story and the invitation. +1 Year is unavailable
before that first Play and during expedition mode. Existing speed and fractional
pacing are retained where applicable.

There is one intentional exception: an explicit internal board → Fjord view
handoff may carry its already-running pacing after scene readiness. A newer pause,
visibility loss, recovery, reset or player intent invalidates its pending callback.
Ordinary Continue does not use this exception. Warm-tab/BFCache/WebGL recovery
keeps the existing pause policy. Choosing free play never records playback
intent or issues a Core advance command.
After an actual Play click, active time uses the ordinary guarded frame loop. No entry
or guide choice simulates offline time or bypasses loading/lifecycle guards.

## Optional journey

New histories receive the invitation after the preserved founding story closes.
Continue/import keep guidance closed; **Navigation menu → Need help?**
reopens it manually. Collapse/Escape, Close journey, Resume and Replay guidance
reuse the existing small card. Mobile navigation folds the card away, and normal
selection/workspace/map controls retain their space.

Every chapter is immediately selectable. One objective is recommended at a time,
with authored purpose, real progress and **Show me**. Expand **Chapter objectives**
to select any objective in that chapter, including out-of-order or completed goals.
**Return later**, **Skip objective** and **Consider again**
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

## Chapter 0 — UI Basics & Navigation

New and restarted histories start guidance on **0 · UI Basics & Navigation**.
Older saved chapter choices and missing orientation metadata keep their existing
Home/Discovery/Conflict behavior. Continue/import never force Chapter 0 or reopen
the invitation. A player can select Basics or explicitly replay guidance later.

*Before you guide your people, learn how to explore their world. Look around,
meet a resident, and find your way back whenever you need to.*

The six short lessons are independent. One compact card shows the recommended
lesson, its status, short instructions and actions. Basics does not repeat a
read-only checklist beneath those instructions. The supporting chapter explanation
and all six selectable lessons are inside **Chapter objectives**, which starts
collapsed. Chapters I–III keep their existing checklists.

The lessons are orientation, not gameplay goals:

| Stable objective ID | Existing interaction and recognition |
| --- | --- |
| orientation / ui-camera | Explain actual input-specific controls. Mouse: left drag pans, right drag rotates, wheel zooms. Touch: drag orbits, pinch zooms, tap open ground centres. Got it acknowledges the explanation; no precise gesture is required or inferred. |
| orientation / ui-resident | Open a real available resident's full Character Card and close it using Close or Escape. Peek/collapse, work tasks, switching cards and stale cards do not substitute. The real resident inspection also credits Chapter I's existing resident check. |
| orientation / ui-connections | Follow the inspected resident's real household or a household's real resident link, or inspect a living individual animal. Use currently available local records. No permanent home is assumed and no record is invented. |
| orientation / ui-home | Use the actual View settlement return or successfully open Map. These change only the view; hidden geography and rival coordinates stay hidden. |
| orientation / ui-time | Recognize an accepted deliberate Play/Pause control action, or choose Got it while remaining paused. Show me focuses the existing control; it never activates it, changes speed or advances a year. |
| orientation / ui-navigation | Open an existing Settlement, Activity Center, Clan Book or Game menu surface, or acknowledge where they are. No need to open every panel; Help/Need help? reopens the same guide. |

All existing chapter tabs remain open. Return later, Skip objective and Consider
again retain their presentation-only semantics. Completed lessons can be selected
again to review their copy and Show me destination. Finishing all six shows
**Basics complete** and offers **Continue to Chapter I — A Home for Your People**.
Only an explicit choice changes chapter; completion never starts time, grants a
reward or adds a canonical event.

On compact screens the guide folds away for competing surfaces. Character Cards
and existing panels keep focus ownership; guide buttons do not pass movement or
recording shortcuts to the world. Explicit acknowledgments return reading focus
to the guide, while external observations never steal another panel's focus.
Camera and menu help add no new scene renderer or per-frame world scan.

The optional journey.orientation array contains at most the six known objective
IDs, without duplicates. It is version-1 UI metadata; old absent fields stay
absent on read, and existing chapter, selection, skip/later and inspection facts
are retained. New/restarted histories and Replay guidance select Chapter 0;
restoring saved guidance does not change its chapter. Core, RNG, save events,
economics and physical discovery are unchanged.

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

Need help? uses the shared question-mark icon in the main navigation. On
compact/mobile screens it is inside the bottom-right menu, below Clan Book.
Choosing it closes that drawer and opens the existing Founding Journey with
saved progress. The initial new-campaign invitation and paused clock are unchanged.

Each objective in Chapters I–III presents its actual steps as a read-only
checklist. An outlined box becomes a visible check mark as soon as the
corresponding inspection or real
campaign fact is recorded. The checklist cannot be toggled by the player and
does not add completion requirements or saved derived progress. Existing actions
count, including previously constructed homes and assigned gear. Wildlife checks
name only species already legitimately witnessed; pending slots reveal no unseen
species or locations. A gone Longship shows on-foot guidance without unfinished
sailing checks; an earlier completed sea journey retains its real credit.
Show me follows the first unfinished step, and completed
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
most the 20 stable skip/defer IDs across all four chapters (six Basics IDs and
14 existing IDs). No chapter authority is added to Core.

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
