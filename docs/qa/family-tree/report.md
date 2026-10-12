# Family Tree QA · #119

Reviewed on 12 October 2026, on the same branch/PR as #122 Personal history.

## Before / after

The [baseline reader at 03e521d](https://github.com/sidesliders1983/Pillagers/blob/03e521d42926adf9a368121e4100c06f579e5afa/src/lore/ClanBookReader.ts) offered story chapters and their factual overview. Personal history was already available in resident management.

The existing reader now has **Story** and **Family Tree** tabs. Story keeps its chapter selector, frozen text and factual overview. The tree shows the current loaded family's connections: ten original founders on one top row, actual descendants below both recorded parents, and independent newcomer families when they have genuine family ties. Selecting a card exposes parent/child/partnership details and the reused Personal history disclosure.

[Visual review](review.html) · [Reuse and data contract](../../lore/FAMILY-TREE.md) · [Importable Core fixture](fixture.json)

## Fixture and public-contract checks

The large fixture grows through real public Simulation Core Winter commands with explicitly forced fertility/partnership rates, no mortality and ample stocks. These are fixture-only values. It contains **58 canonical residents, 57 admitted family nodes, ten founders and three generations**, with 2,276 source events at Winter 831. The one added unaffiliated worker remains in canonical resident management but is absent from the diagram.

Ten Family Tree tests pass through the public projection and shared session. They cover: founder retention; two-parent descent; cross-family relationships and same-name identities; newly arrived and independent families; real partnership, birth, death and re-partnering; departure and external references; honest unknown age/occupation; archived membership from genuine local relationship records; malformed/self/cyclic ancestry; newborns and included indoor caregivers; exclusion of caregiver proxies; save/load, rollback and 2D/Fjord handoff. Tests preserve canonical IDs, parentage, state, RNG and saved story content. Ten tree tests plus the twelve Personal history tests pass together (22/22).

Red/green checks exposed and corrected: an incorrect inferred relationship-ending cause after a later death; missing external-child references; loss of a historically qualified archived partner; automatic reopening after closing a queued chapter; and stale queued navigation after loading an older campaign.

## Browser checks

Real controls on /play and /fjord-play were exercised in desktop 1440×900, tablet 1024×768 touch emulation and phone portrait 390×844 touch emulation. All six runs pass with no page errors. Tests cover two-parent navigation, newborn selection, outsider filtering, saved passage links, keyboard tabs, internal scroll retention, reachable Close, and exact canonical equality before/after reading. Running remains running; manual pause remains paused. A new chapter leaves the tree and selected person in place, can be explicitly opened, and cannot reopen a closed reader or survive rollback as a stale navigation target.

| Route | Viewport mode | Tree render + style flush | Result |
| --- | --- | ---: | --- |
| /play | desktop | 33.90 ms | Pass |
| /play | tablet | 26.90 ms | Pass |
| /play | phone | 31.40 ms | Pass |
| /fjord-play | desktop | 48.20 ms | Pass |
| /fjord-play | tablet | 39.40 ms | Pass |
| /fjord-play | phone | 32.20 ms | Pass |

These are single browser layout/style-flush samples, not GPU frame timings. Tablet/phone touch emulation is not physical iPad Safari certification. Images show a scrolled diagram as well as the founder-row overview; relationship details remain available below it inside the same scrollable reader.

[Six-run results](browser/results.json) · [Personal history regression results](personal-history-regression/results.json)

The existing Personal history browser script was also rerun in desktop/touch 2D and Fjord (four passes), including archived outsiders, passage/context links, rollback, clock intent and desktop 2D↔3D transfer. Its output is stored here, preserving the earlier #122 report and screenshots. The optional output-directory argument only changes where QA evidence is written.

## Measured work

First public projection: **8.44 ms**. Cached queries: **0.93 ms median**, **1.79 ms p95**, over 100 queries. Card refresh after a real occupation command: **1.41 ms**, with identical node positions.

[Measurements](measurements.json) preserve all 100 cached-query timing samples and the single first-projection/card-update samples. The development laptop and concurrent load affect these results; they are observations, not acceptance thresholds or FPS promises. Topology is derived lazily and cached; ordinary resource ticks do not rebuild layout.

## Build and regression validation

- Full local suite before the final archived-history test/queued-rollback fix: 656 tests, 655 passes, zero failures, one existing optional frozen-r3-GLB evidence skip. This is not a skipped downstream step caused by failure.
- Latest focused public tests: 22 passes. Latest TypeScript check: pass.
- Production build: pass. Existing large-chunk warning remains.
- Character validation with Lab previews: pass, 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules.
- All required GitHub checks must pass on the final PR head before ready; the PR records their exact revision and links.
- No repository formatter is configured. New TypeScript/test files were laid out with the installed TypeScript printer and manually reviewed; diff whitespace was checked. No formatting dependency was introduced.

## Limits and source authority

The tree is reconstructible presentation data, not a saved genealogy ledger. Real local relationship/birth records can prove historical membership; an unknown later observation date stays unknown. Known external parents or children are readable references, not automatic import of another settlement's ancestry. Historical partnership endings are labelled only when recorded, and parent roles never come from array position.

Old missing history is not reconstructed, per the owner's clarification. The diagram has no historical time slider: choosing an old story chapter does not change its live family meaning. No portraits, model calls, settlement naming, new relationship rules, economic balance changes or visual-world mechanics are added.
