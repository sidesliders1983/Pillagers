# Fjordside desktop UI prototype comparison

Review three structural layouts against the approved interaction principles in the [desktop design proposal](../../FJORDSIDE-DESKTOP-UI-DESIGN-V01.md).

This is a disposable design study on branch codex/desktop-ui-prototypes-180. It is not a production UI change or a candidate to merge into the game. No layout has been selected.

## Open the study

Run the repository's existing command **pnpm run dev:lan** and open:

- [All household work plans](prototype-v2.html?variant=A&journey=work&view=work)
- [Ordinary housing](prototype-v2.html?variant=A&journey=housing)
- [Screenshot comparison](comparison-v2.html)

The development route is /docs/qa/desktop-ui-redesign-180/prototype-v2.html. The work link opens Manage work directly, with all occupation plans visible. The complete journey counts below start without a selection; that deep link omits the first two navigation clicks. The previous/next layout controls and left/right arrow keys change the variant query parameter while retaining the current local draft. Arrow keys inside form controls retain their native behavior. Reloading opens the declared journey again.

The study is deliberately hosted in the existing QA review area. It uses the actual captured game scene and frozen data while keeping proposed mutations separate from the live /fjord-play route. No simulation, save, asset pipeline or production routing is modified. The study UI is gated out of production.

## Variants

| Layout | Structure | Housing inspection world coverage | Optional farmyard task world coverage |
| --- | --- | ---: | ---: |
| A | Vertical right inspector; costs and commit action remain visible | 86.4 percent | 75.1 percent |
| B | Bottom task tray; residents, context and cost shown side by side | 82.2 percent | 68.6 percent |
| C | Compact selection near the subject; a temporary focused task surface | 86.8 percent | 69.7 percent |

Coverage is measured at 1440 by 900. Ordinary housing preserves both residents' occupations, career settings, building specialization and cattle assignments. Manage work now offers a complete combined plan for each of the ten canonical occupations, including smith, fisher, hunter and boatbuilder, as well as the individual resident actions. The earlier revision only implemented a combined Farmyard plan; the person occupation chooser alone did not cover the other whole-task journeys.

Choose Smithing, Fishing, Hunting or another work plan to review an editable suitable resident, a proposed house and an optional specialization together. Housing can be excluded, leaving the tent and its existing animal assignments intact. An already suitable occupation keeps its career settings. The result names the occupation and housing decision and shows the building specialization. The frozen world image remains unchanged; this is called out in the study header.

The new work chooser leaves 74.5, 64.4 and 67.3 percent of the world visible in A, B and C. B's chooser remains slightly below the proposed 65-percent task target, an explicit layout trade-off. During the smithing plan itself, coverage is 74.5, 67.2 and 68.7 percent. This is a design comparison with no winning layout selected.

Farmyard is one optional combined task inside Manage work. Its editable suggestions, occupation/autonomy consequences, optional farming specialization and cattle assignments appear only after that intention is chosen. It is not the tent's primary action. Future occupations can extend the same work entry point; their specific combined tasks need separate journey design.

Livestock is a separate navigation category with species and assignment information. This snapshot supplies cattle. The design document reserves the same entry point for goats, geese, chickens, horses and pigs, with species-specific shelter, care and transport rules still to be defined. It does not show invented animals or apply cattle capacity to every species.

## Journey observations

| Complete journey | A | B | C |
| --- | ---: | ---: | ---: |
| Build ordinary housing, retaining occupations | 2 clicks | 2 clicks | 2 clicks |
| Set up Smithing, Fishing or Hunting with the displayed proposal | 4 clicks | 4 clicks | 4 clicks |
| Farmyard with unchanged suggestions | 4 clicks | 4 clicks | 4 clicks |
| Order a new expedition with three individually selected residents | 8 clicks | 8 clicks | 8 clicks |
| Start the paused expedition's travel preview | 1 additional click | 1 additional click | 1 additional click |
| Open Clan Book, Family Tree and a specific person | 3 clicks | 3 clicks | 3 clicks |

The housing count is select tent, Build house with visible cost. The farmyard count starts without a selection and ends after the result: select household, Manage work, Set up farmyard, Confirm farmyard. Selecting another directly displayed household member makes five clicks total. Further custom changes are counted individually.

A separate smith assignment completes in three clicks: select resident, Change work, choose Smith. The chooser exposes all ten canonical occupations. Assigning through the household adds one navigation click. A house can later be used for the optional farmyard task without paying for another house; that sequence completes in five clicks from the original unselected tent.

The combined work route is select household, Manage work, choose a work plan, Confirm work setup. All ten plans are reviewed in A; Smithing, Fishing and Hunting are also reviewed in B and C. The work-without-a-house sample takes five clicks because it explicitly excludes the proposed house before confirming. This also permits work in the original five-Materials state. A work plan never silently assigns the three cattle; the separate Farmyard task includes those assignments explicitly.

The expedition count includes navigation, Create group, three member selections, Start Expedition with its cost visible, Explore Area and a destination click. The clock remains paused. Preparation spends two Food per member; destination changes use the same provisions.

The original five-Materials state blocks ordinary housing and plans that include a new house. Excluding optional housing allows an eligible occupation assignment with no Materials spent. Cancelling retains the household selection without spending resources. An impact preview also demonstrates that changing a developed home's last farmer deserves a review of its cattle losing shelter.

At 1280 by 720, all three farmyard commit controls are visible. A keeps its cost/commit area fixed while its detail area can scroll. B and C cover more of a small desktop: 57.4 and 58.7 percent of the world remain free during this task, versus 72.8 percent in A. The smaller screen is a meaningful trade-off for review; the 65-percent task target was specified for 1440 by 900.

The headless Edge capture reports no page errors, out-of-bounds overlay rectangles, horizontal overflow or campaign storage writes. These are browser and layout observations, not physical-device certification, live simulation validation or user research.

## Data provenance and limitations

The shared background images and initial facts originate from the existing summer-32 and developed-810 fixtures at eeba00d09c4ea0350a9cfc8dd2cde948fd41c66c.

The funded scenario is a new derived review snapshot. Its five Materials become 25 through the existing SalvageLongship command, with the source fixture hash and exact preparation command recorded in study-data-v2.json. This is fixture preparation, not part of housing or farmyard setup. The common founding backdrop predates that preparation; no vessel is visible in the frame.

The preparation script checks BuildHouse alone: the hunter and fisher keep their occupations and career settings, specialization stays null, cattle assignments do not change and there is no Farmyard. A separate existing-farmer case verifies that their permanent house activates the current Farmyard function with zero cattle assigned and no specialization.

It also checks the optional farmyard arrangement through BuildHouse, AssignOccupation, SpecializeBuilding and three AssignCattle commands. That arrangement has one active Farmyard, three occupants, capacity four and 15 Materials left. These checks prove feasibility of particular arrangements, not an implemented combined command or atomic transaction.

The preparation script additionally derives and checks a complete work plan for every canonical occupation. Aptitude and current command availability determine the suggested resident, retaining the current occupation when already suitable. Each reviewed plan uses existing BuildHouse, conditional AssignOccupation and SpecializeBuilding commands, with no cattle assignment. A separate AssignOccupation-only case verifies smith work while keeping the tent. These plans introduce no new building types, occupation output rules or production forecasts.

Interactive actions operate on an in-memory UI stub. They neither load a real campaign nor execute Core commands in the browser. Screenshots remain static world backdrops even after a local house or journey result. There are no live camera controls, travel, save/load, production forecasts or new future gameplay mechanics. No rendering or simulation performance gain is claimed.

Source characters keep their actual names, ages, occupations and household relationships. The book opens the actual fixture chapter. The developed view uses its actual aggregate cattle count; it does not invent animal identities.

## Reproduce the review

- **node scripts/qa/prepare-desktop-ui-study-v2.mjs** derives the data through the current Core.
- Start the existing development server.
- **node scripts/qa/capture-desktop-ui-study-v2.mjs** captures the layouts and records observation data. QA_ORIGIN and PLAYWRIGHT_MODULE can override local runtime paths.

The capture uses the bundled Playwright runtime and the installed Edge browser. These add no project dependencies. See [observations-v2.json](observations-v2.json) for per-state click counts, coverage, geometry and storage observations.

The 85 recorded states include 16 complete work-plan walkthroughs, ordinary housing in every layout, reuse of an existing home, mixed occupations, an individual smith assignment, work without a new house, the livestock list, a changed farmer, a variant switch retaining the draft, cancellation, insufficient Materials and the last-farmer risk review. Work-plan results are compared with the prepared Core outcomes, including occupations, specialization, house cost and animal assignments. The four captured UI/data source hashes match the reviewed files. JavaScript syntax checks pass. Formatting was reviewed manually because the project has no configured formatter. No production regression suite or live performance benchmark is claimed for this study.

Earlier review.html, prototype.mjs, check-desktop-ui-study.mjs and their images predate these agreed journeys. They are not v2 acceptance evidence. Only the v2 files and shared source captures belong to this review.
