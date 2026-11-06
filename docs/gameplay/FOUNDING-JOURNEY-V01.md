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

New histories receive the **Guide me / Explore on my own** invitation directly
after the island camera arrival. Preparation retains its progress, cancellation
and optional founding reader; the camera arrival removes that temporary reader,
progress and return-to-menu controls so the island stays visible. Only **Skip
camera arrival** remains at the bottom. The opening is still available in Clan
Book. The invitation does not require closing another story window.
Continue/import keep guidance closed; **Navigation menu → Need help?**
reopens the regular guide manually. Collapse/Escape, Close journey, Resume and
Replay guidance retain their existing browsing behavior. Chapter 0 additionally
offers **Resume tour** and **Replay basics**. Its tour uses one anchored callout
and a progress chip while normal selection/workspace/map controls retain their
space. All four chapters and longer copy remain in the regular guide.

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

Real completion takes precedence over a previous skip/defer. The existing
Replay guidance action resets UI observations/acknowledgments and still credits
real historical Core actions. **Replay basics** has the narrower Chapter 0 reset
described below. There are no extra buildings, items, sightings or raids to repeat
for a checkbox.

## Chapter 0 — UI Basics & Navigation

New and restarted histories start guidance on **0 · UI Basics & Navigation**.
Older saved chapter choices and missing orientation metadata keep their existing
Home/Discovery/Conflict behavior. Continue/import never force Chapter 0 or reopen
the invitation. A player can select Basics or explicitly replay guidance later.

*Before you guide your people, learn how to explore their world. Look around,
meet a resident, and find your way back whenever you need to.*

After **Guide me**, the Journey collapses to a small progress chip and shows
**one concise anchored callout at a time**, with **Step 1/6** through **Step 6/6**.
A live arrow and subtle target halo point to the actual canvas edge, control or
opened panel. The player uses the real control; accepted player actions move the
callout through each lesson's substeps. Merely opening a Character Card through
a programmatic navigation hook, or refreshing its projection, is not a tour
action. **Show me** can focus or reveal an existing entry when the player is lost;
it does not perform the highlighted exercise.

**Back** returns to an earlier lesson without erasing earned facts. **Skip tour**
dismisses the callout, **Resume tour** returns to its saved lesson, and
**Replay basics** starts the six lessons again. **Got it/Next** is available where
an explanation or safely unobservable interaction needs acknowledgment; it never
stands in for a required resident close or connection action. The chip opens the
regular guide, where all four chapters, the longer copy and **Chapter objectives**
remain accessible without finishing the tour. Chapters I–III keep their existing
checklists.

The lessons are orientation, not gameplay goals:

| Stable objective ID | Existing interaction and recognition |
| --- | --- |
| orientation / ui-camera | Anchor a lightweight hint at the canvas edge. Mouse: left drag pans, right drag rotates, wheel zooms. Touch: drag orbits, pinch zooms, tap open ground centres. Advance on genuine supported camera input, or Got it when gesture recognition is unavailable. No exact camera pose is required. |
| orientation / ui-resident | Point to a real selectable resident or the existing Settlement/Residents entry and list. After actual selection, move to the full Character Card's real name/occupation, then its Close control. Close or Escape completes the return to the world. Mobile peek/collapse, work tasks, switching cards and stale cards do not substitute. The real inspection also credits Chapter I's resident check. |
| orientation / ui-connections | Point to an actual resident-to-household link, a household's real resident link or a valid local livestock/list fallback. Follow the resulting view and wait for its actual close before moving on. Handle missing houses and away/dead residents through available local records; no permanent home or invented link is assumed. |
| orientation / ui-home | Point to actual Map or View settlement. A real View settlement action returns the camera; Map must actually open and then close before the tour continues. These change only the view; hidden geography and rival coordinates stay hidden. |
| orientation / ui-time | Recognize an accepted deliberate Play/Pause control action, or choose Got it while remaining paused. Show me focuses the existing control; it never activates it, changes speed or advances a year. |
| orientation / ui-navigation | Point to an existing Game menu/Help, Activity Center or Clan Book entry, follow the actual opened panel and its close control, and finish after the real open/close pair. One existing surface is enough; opening every panel is not required. The regular guide retains its explicit acknowledgment fallback and Help/Need help? entry. |

All four chapters remain available in the regular guide. Return later,
Skip objective and Consider again retain their presentation-only semantics.
Completed lessons can be selected again to review their copy and Show me
destination. Finishing all six shows
**Basics complete** and offers **Continue to Chapter I — A Home for Your People**.
Only an explicit choice changes chapter; completion never starts time, grants a
reward or adds a canonical event.

The callout resolves stable live DOM references and re-anchors after scrolling,
panel open/close, responsive layout changes and viewport resize. Placement stays
within viewport/safe-area bounds, away from its target. A vanished or clipped
target falls back to a visible entry or compact explanation. Mobile menu/drawer
visibility and the existing Map dialog retain their normal owners.

Only the small chip and callout controls receive pointer input; the halo, arrow
and surrounding layer are transparent to world clicks, touch and wheel gestures.
There is no screen dimming, modal tour or gameplay input trap. Existing panels
keep focus ownership, native Escape behavior and accessible control labels;
callout buttons keep movement shortcuts out of the world. Live status announces
the current step, and reduced-motion preferences remain respected. External
observations do not steal another panel's focus. No scene renderer or per-frame
world scan is added.

The optional `journey.orientation` array contains at most the six known objective
IDs, without duplicates. Optional `journey.tour` is a strict
`{ step, dismissed }` object: `step` is one of those six IDs and `dismissed` is a
boolean; extra keys and invalid values are rejected. Both are version-1
presentation metadata. Old absent fields stay absent on read, preserving the
saved chapter, selection, skip/later and inspection facts. Continue/import keep
both guide and tour closed regardless of the saved cursor, and stay paused until
explicit Play; reopening/resuming is a separate player choice.

**Replay basics** clears only the six orientation observations/acknowledgments
and their entries in `skipped`/`later`, selects Basics and resets the cursor to
`ui-camera` with `dismissed: false`. Chapter I–III inspections/completion and
skip/defer facts, retained ship/report facts, legacy watch/evidence, Core history,
RNG, current time and playback choice remain intact. New/restarted histories
still start a fresh per-history guide; ordinary restoration never resets it.

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
UI inspections, retained-ship acknowledgment, viewed report event ID, optional
orientation facts and the optional bounded tour cursor. At most the 20 stable
skip/defer IDs span all four chapters (six Basics IDs and 14 existing IDs).
No chapter authority is added to Core.

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

The [original chapter QA](../qa/founding-journey-270/report.md) and earlier
[Chapter 0 implementation/browser QA](../qa/onboarding-ui-basics-325/report.md)
remain historical records of their original implementations. The owner review on
[PR #326](https://github.com/sidesliders1983/Pillagers/pull/326) identified the
earlier card/checklist presentation as a blocking contextual-tour UX gap. Its
passing automated results do not establish acceptance of this anchored revision.
New technical and annotated visual evidence must be recorded separately against
the revised source.

That evidence must show at least three real target-to-target transitions,
action-driven progression, touch hit targets, resize/reflow, close/replay,
paused entry and saved/imported progress on desktop and 844×390 landscape.
Chrome touch emulation does not establish physical iPhone acceptance. Owner
visual approval and a small uncoached playtest remain open before merge/release;
automated checks do not prove novice understanding. A hunt or raid need not
finish during that test.

Ask the player, without coaching:
1. What do you control, and what happens autonomously?
2. Which real choice did you make, and what did it cost or risk?
3. What do exploration and Recon tell you, and what remains unknown?
4. Who would you equip/send, or why would you postpone conflict?
5. What actual next action would you choose independently?

The [anchored-tour revision QA](../qa/onboarding-ui-basics-325/anchored-tour/report.md) records source-specific technical and browser evidence for the PR #326 owner review; owner visual approval and the uncoached test remain separate gates.
