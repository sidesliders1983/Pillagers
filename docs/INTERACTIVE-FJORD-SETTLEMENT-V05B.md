# Interactive Fjord settlement v0.5B

Issue: #88. Builds on the technical bridge merged in PR #92.

## Authority and presentation

Both `/play` and `/fjord-play` use GameplaySession, Simulation Core commands and one shared
management panel. Household, building, resident, livestock and ship selections are canonical
kind/ID pairs. Neither the panel nor renderer introduces economy or eligibility rules.
Canonical command evaluation supplies availability and the reason an action is disabled.
Occupation eligibility probes a real occupation, so clearing an existing occupation cannot
accidentally expose the assignment form for an underage resident.

## View handoff

The existing routes replace the document. A shared session checkpoint explicitly transfers
ownership when the player chooses **2D Settlement** or **3D Fjord**. It carries canonical state,
selection, exact Fjord geography/layout and browser pacing, including fractional ticks.
The outgoing clock stops; the receiving view resumes the saved running flag and cycle speed.
Navigation/loading time never advances the simulation. Refresh and explicit save/load remain
paused. Direct visits restore the current tab's campaign paused; independent tabs do not run
one shared clock. The developer Gameplay Lab retains explicit local save/load.

Plain canonical JSON remains compatible with the developer lab. The Fjord envelope retains
its existing version and exact metre-based geography. Both player views use the existing
canonical local-save key and Fjord sidecar; no simulation schema or balance changes.

## Interactions

A tap/click selects the nearest canonical model ancestor. Empty terrain clears selection.
The existing RTS controller distinguishes clicks/taps from drags, rotations and pinches.
Clicking or tapping empty terrain clears selection and navigates to that point. Dragging with
one finger or the left mouse button rotates; a pinch zooms out and spreading two fingers zooms
in. Scroll still zooms and WASD/arrows pan. The Fjord prototype uses the same control mapping.
Selection highlighting belongs to the renderer; commands are submitted only by explicit
management buttons. Available forms are shared with the existing 2D settlement.

The selected object has a gold ring with a transparent centre. Selecting a resident also
marks their visible partner, children and current home in cyan. Selecting a home marks its
visible residents in cyan. Floating English role/name labels identify each connection. Labels are spaced to prevent
overlap; thin leader lines connect them to their actual model anchors.
The projection follows canonical relationships and current household membership; it never
creates or changes a relationship. Dead, archived or away relatives remain accessible in the
management history/lineage but have no live model to mark. Markers never participate in picking.
Their colours are unaffected by scene fog or tone mapping.

Construction, upgrades, specialization, household moves, occupation and caregiver assignment,
livestock assignment/slaughter and salvage use current Core commands. The explicit **Build house**
button sends BuildHouse: it requires the configured Materials and disables itself with the
Core reason if construction is unavailable. Automatic HouseHousehold placement, including its
vacant-house and tent fallback, remains a separate unchanged Core behavior. Normal incremental
updates reconcile the existing objects and stable layout. Tents retain grass; only permanent
homes create soil and dry connecting paths. Expeditions remain available in 2D only and are
outside this 3D slice.

Selection changes reset management choices for the newly selected identity, while ticking
preserves the current identity's focused controls. Import clears stale sidecar selections
without deleting canonical history. Scene actions are serialized and world construction
checks its campaign/revision before installation. Restoring a cached outgoing browser page
reloads the latest checkpoint instead of reviving its old clock or disposed renderer.

## Approved verification

The public shared-session seam covers canonical commands/availability, handoff selection/time,
exact geography, deterministic replay and atomic save/load. Browser checks cover real picking,
shared panel actions, immediate scene updates, navigation, save/load and tablet touch gestures.
Physical iPad Safari/WebGL validation remains separate from Chromium touch emulation.

Evidence and reproduction commands: [interactive Fjord report](qa/interactive-fjord/report.md).

Navigation and construction regression evidence: [controls follow-up](qa/interactive-fjord-controls/report.md).
