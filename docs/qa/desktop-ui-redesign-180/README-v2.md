# Fjordside desktop UI prototype comparison

Review three structural layouts against the approved interaction principles in the [desktop design proposal](../../FJORDSIDE-DESKTOP-UI-DESIGN-V01.md).

This is a disposable design study on branch codex/desktop-ui-prototypes-180. It is not a production UI change or a candidate to merge into the game. No layout has been selected.

## Open the study

Run the repository's existing command **pnpm run dev:lan** and open:

- [Interactive study](prototype-v2.html?variant=A&journey=farmyard)
- [Screenshot comparison](comparison-v2.html)

The development route is /docs/qa/desktop-ui-redesign-180/prototype-v2.html. The previous/next layout controls and left/right arrow keys change the variant query parameter while retaining the current local draft. Arrow keys inside form controls retain their native behavior. Reloading opens the declared journey again.

The study is deliberately hosted in the existing QA review area. It uses the actual captured game scene and frozen data while keeping proposed mutations separate from the live /fjord-play route. No simulation, save, asset pipeline or production routing is modified. The study UI is gated out of production.

## Variants

| Layout | Structure | Farmyard setup world coverage at 1440 by 900 |
| --- | --- | ---: |
| A | Vertical right inspector; costs and commit action remain visible | 75.5 percent |
| B | Bottom task tray; residents, cattle and cost shown side by side | 69.0 percent |
| C | Compact selection near the subject; a temporary focused task surface | 69.7 percent |

All three use editable resident and cattle suggestions, explicit occupation/autonomy consequences, an optional named farming specialization, one commitment and a compact result retaining the selection.

## Journey observations

| Complete journey | A | B | C |
| --- | ---: | ---: | ---: |
| Farmyard with unchanged suggestions | 3 clicks | 3 clicks | 3 clicks |
| Order a new expedition with three individually selected residents | 8 clicks | 8 clicks | 8 clicks |
| Start the paused expedition's travel preview | 1 additional click | 1 additional click | 1 additional click |
| Open Clan Book, Family Tree and a specific person | 3 clicks | 3 clicks | 3 clicks |

The farmyard count starts without a selection and ends after the result: select household, Set up farmyard, Confirm farmyard. Selecting another directly displayed household member adds one click. Further custom changes have to be counted individually rather than hidden inside a nominal action.

The expedition count includes navigation, Create group, three member selections, Start Expedition with its cost visible, Explore Area and a destination click. The clock remains paused. Preparation spends two Food per member; destination changes use the same provisions.

The original five-Materials state blocks the ten-Materials build and keeps the draft intact. Cancelling retains the household selection without spending resources. A future-risk preview also demonstrates that changing a developed home's last farmer deserves a review of its cattle losing shelter.

At 1280 by 720, all three farmyard commit controls are visible. A keeps its cost/commit area fixed while its detail area can scroll. B and C cover more of a small desktop: 58.0 and 58.7 percent of the world remain free during this task, versus 72.8 percent in A. The smaller screen is a meaningful trade-off for review; the 65-percent task target was specified for 1440 by 900.

The headless Edge capture reports no page errors, out-of-bounds overlay rectangles, horizontal overflow or campaign storage writes. These are browser and layout observations, not physical-device certification, live simulation validation or user research.

## Data provenance and limitations

The shared background images and initial facts originate from the existing summer-32 and developed-810 fixtures at eeba00d09c4ea0350a9cfc8dd2cde948fd41c66c.

The funded scenario is a new derived review snapshot. Its five Materials become 25 through the existing SalvageLongship command, with the source fixture hash and exact preparation command recorded in study-data-v2.json. This is fixture preparation, not part of farmyard setup. The common founding backdrop predates that preparation; no vessel is visible in the frame.

The preparation script also checks the proposed farmyard arrangement through the existing BuildHouse, AssignOccupation, SpecializeBuilding and three AssignCattle commands. That resulting canonical arrangement has one active Farmyard, three occupants, capacity four and 15 Materials left. It proves feasibility of this particular arrangement, not an implemented combined command or atomic transaction.

Interactive actions operate on an in-memory UI stub. They neither load a real campaign nor execute Core commands in the browser. Screenshots remain static world backdrops even after a local house or journey result. There are no live camera controls, travel, save/load, production forecasts or new future gameplay mechanics. No rendering or simulation performance gain is claimed.

Source characters keep their actual names, ages, occupations and household relationships. The book opens the actual fixture chapter. The developed view uses its actual aggregate cattle count; it does not invent animal identities.

## Reproduce the review

- **node scripts/qa/prepare-desktop-ui-study-v2.mjs** derives the data through the current Core.
- Start the existing development server.
- **node scripts/qa/capture-desktop-ui-study-v2.mjs** captures the layouts and records observation data. QA_ORIGIN and PLAYWRIGHT_MODULE can override local runtime paths.

The capture uses the bundled Playwright runtime and the installed Edge browser. These add no project dependencies. See [observations-v2.json](observations-v2.json) for per-state click counts, coverage, geometry and storage observations.

The 35 recorded states include a changed farmer, a variant switch retaining the draft, cancellation, the insufficient-Materials case and the last-farmer risk review. The four captured UI/data source hashes match the reviewed files. JavaScript syntax checks pass. Formatting was reviewed manually because the project has no configured formatter. No production regression suite or live performance benchmark is claimed for this study.

Earlier review.html, prototype.mjs, check-desktop-ui-study.mjs and their images predate these agreed journeys. They are not v2 acceptance evidence. Only the v2 files and shared source captures belong to this review.
