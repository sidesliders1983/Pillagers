# Expedition Mode — PR #179

## Owner contract used

The approved Expedition Mode brief uses a fixed two-Food pack per resident, one ration per 250 active ticks and a temporary whole-game ten-minute/1,000-tick pace. The owner's subsequent chat correction replaces the brief's refund clauses: confirming Start Expedition spends Food permanently. Cancelling its confirmation is free; cancelling an already prepared expedition or returning early gives no refund. Target selection and redirects never buy more Food.

The owner requested a concise confirmation: “Start Expedition” followed by “This will cost XX food (2 food per member). Are you sure?” with the total price filled in. It does not start/unpause the clock. New expeditions wait at home in Prepared without eating their carried pack. Once away, one opened ration supports 250 ticks; remaining endurance covers both exploration and actual return. Core turns the group home using reached, traversable trail geometry and a conservative two-tick margin. Truly blocked returns are factual Stranded outcomes with no invented recovery, teleport or home work availability.

Unused supplies are recorded as discarded; dead/stranded members' unrecovered supplies are lost. All quantities remain attributable and reconcile with the initial committed pack. Neither consumption nor disposal charges home stocks again. Old version-1 journeys and four-region missions keep their recorded semantics; the new UI guides old journeys home before starting the new mode.

## Local verification

- Nine new public Core/session/Clan Book cases pass: three residents cost exactly six Food; invalid and duplicate starts are atomic; Prepared waiting/save/cancellation; actual individual origins; free redirects/recall even with empty home stock; replay and corrupt-pack rejection; no-refund accounting and truthful pre-departure cancellation; proactive safe return from a distant goal; terminal blocked return/death losses; saved normal preference, pause, overlapping groups and exact pace restoration within an elapsed-time batch. A 900 ms worked example spends 600 ms returning under expedition pace and the remaining 300 ms on the normal five-minute pace.
- Fourteen version-1 spatial cases and four seasonal-material cases pass. Historical tests explicitly construct the version-1 saved extension; new campaigns cannot bypass Start Expedition. Fifty-seven related legacy expedition/discovery/narrative/seasonal cases pass. Required full CI runs on the new head rather than inheriting the previous head's green checks.
- TypeScript and production build pass. The existing large-chunk advisory remains unchanged. No formatter is configured; changed formatting was reviewed manually and git diff --check passes.
- The real-session browser test verifies the Start modal's two-Food/member and total-price copy, cancelling it without mutation, paying only on confirmation, remaining paused, availability of Explore Area, invalid-target atomicity, target-mode exclusivity and free paused-returning redirection.
- The real production 3D flow passes in Edge touch emulation at 1024x768 and 390x844. It creates/recruits a group, opens and cancels/reopens the price confirmation, confirms one fixed charge, observes Prepared and the forced ten-minute control, sends the actual residents from their current origins, runs/pauses, changes quality, reloads exact Core state, recalls and redirects with the same pack, then returns and restores the three-minute normal preference. Source hashes, empty page-error output and short raw RAF diagnostics are in browser.json. Samples are not performance gates.
- Headless Edge reports all tabs visible, so the hidden-tab test is explicitly **simulated at the public visibilitychange boundary**. The application receives hidden/visible state transitions, pauses, preserves exact time/supplies for the interval, returns still paused and performs no offline catch-up. This is not claimed as native physical iPad lifecycle proof.
- A separate actual-model/Core browser test retains smooth 500 ms interpolation, the real Running clip, no predicted progress, frozen presentation on pause, unchanged Core data and body-position continuity across redirection/recall. Its controlled frame inputs are not FPS measurements.
- Discovered terrain colors match a fresh load at the identical paused time. The previous seasonal-color/material fix remains intact.

## Review limits

The latest physical iPhone/iPad check remains open. Existing reports are historical and unchanged. The PR remains draft while required checks run on this revision; no validation or performance threshold was weakened. Later ship/horse/cart capacity is not implemented.
