# Spatial Expedition Groups v0.4B — Expedition Mode (#148 / PR #179)

This opt-in `/fjord-play?discovery=1` slice reuses the existing Simulation Core groups, canonical physical routes, native resident Run and clan discovery. Ordinary residents stay autonomous. Rival presentation and spatial raids remain #149/#150; larger ship/horse/cart carrying capacities are not implemented.

## Current owner decisions

The 2026-10-16 Expedition Mode brief replaces destination-distance prices and repeated Food purchases. The owner's subsequent clarification supersedes the brief's refund clauses: **Food is spent permanently when Start Expedition is confirmed. Nothing is refunded after that confirmation**, including cancellation before physical movement or early return. Cancelling the confirmation dialog itself changes nothing. Historical QA remains evidence of the rules used in those runs.

Prototype values are **2 Food per member**, **one carried ration per 250 active canonical ticks**, **500 ticks of endurance**, **2 m movement per canonical tick**, and a temporary **10 minutes per 1,000 ticks** for the whole running simulation. These values are prototype tuning, not historical claims. The former 25-tick automatic stay is retained only for old version-1 journeys; new expeditions can explore/wait at the target until recalled, redirected or required to return safely.

## Player flow and confirmation

With no selection, Create exploration group creates Group 1, Group 2, etc. Select residents and use Add to group; membership can change only while no expedition is active. Clear selection or use Menu → Expedition groups to see the group actions.

**Start Expedition** opens the concise owner-approved confirmation: “This will cost XX food (2 food per member). Are you sure?” with the fixed total price filled in. Three members cost **6 Food**. Cancel in this dialog changes no stock, time or mission. Confirm validates membership and Food atomically, spends the fixed price once, and creates a **Prepared** expedition. Insufficient stock, invalid/caregiving members, an already active group or capacity limits reject without mutation. Repeated confirmation cannot spend twice.

A Prepared group remains physically at home; its residents retain home autonomy/work/annual consumption, while the carried ration timer remains stopped. Explore Area arms one destination tap. Ordinary ground taps remain camera navigation outside this mode. One valid destination tap begins physical travel from the members' actual current rendered origins, checked and saved by Core. Invalid/unreachable targets leave the prepared state intact. Cancel expedition ends preparation but does **not** return its already-spent Food.

Traveling, Exploring, Returning and Stranded members produce no home Food or Materials and accumulate no work progress. Pending or visible home-production popups are cleared on departure, so an earlier award cannot follow an explorer. Already recorded production and stock totals remain factual. Work resumes only after actual homecoming.

While Traveling, Exploring or Returning, Explore Area and another destination tap replace the goal using the **same pack**, no purchase/refill/refund and no timer reset. Core uses confirmed positions for away members and ignores renderer-origin overrides. Return Home recalls the real reached group, not a projected destination. Invalid orders leave stocks, route, progress, supplies and discovery unchanged. Supplies remaining is shown as active ticks; no per-destination Food quote is displayed.

## Carried Food and accounting

Each member starts with two unopened rations. On the first active travel tick a ration is opened and supplies 250 ticks; subsequent active ticks decrement its integer tick balance. A second ration is opened only after the first is exhausted. This avoids treating a partly eaten ration as unused Food. Waiting in Prepared does not open or consume anything. Away travel, time spent exploring and the actual return consume the same carried allowance. Pause, hidden tabs and render frames consume no canonical ticks.

Home stocks decrease **only at confirmed Start Expedition**. Opening/eating a carried ration never charges home stocks again, and away residents keep the existing exclusion from annual household Food consumption. Death makes unopened supplies unrecoverable; started rations already count as consumed. On confirmed homecoming or cancellation, any unopened remainder is recorded as **unused/discarded**, never credited to stocks. A subsequent new expedition buys a fresh pack at the same fixed member price.

Canonical per-member balances distinguish unopened Food, the active ration's remaining ticks, consumed units, discarded units and lost units. The sum of unopened/consumed/discarded/lost units must equal the initial two units for each member. The factual Clan Book maps the start to home-stock spending; carried consumption/discard/loss are separate interval activity and cannot be double-counted as further stock debits. Preparation cancellation records no fictitious physical homecoming. Published historical chapters are not rewritten.

## Safe movement, return and terminal failure

Core plans with bounded deterministic A* on the existing navigation grid and canonical heightfield. Cardinal routes, sampled dry ground, a maximum local grade of 0.65 and reserved home/campfire exclusions remain in use. A tap on an unavailable cell can resolve to safe local ground within 8 m without jumping water or a ridge. Search remains bounded at 40,000 nodes. No second terrain classification, saved heightfield, renderer authority or new random casualty system is added.

Every new leg retains its confirmed origin and a validated trail back to the original home. Redirecting extends/reuses actual reached geometry. Core compares each living member's remaining endurance with the actual traversable return trail before the next active tick, using a conservative two-tick margin. A distant target can be accepted without promising it will be reached: the group turns back before its return budget would become unsafe. Return uses the reached trail, including partial edges and exact home origins, rather than teleporting or inventing progress. It requires no new path search on each render frame/tick.

A newly blocked outward step triggers return. A truly blocked homeward path or exhausted endurance before home produces an explicit **Stranded** terminal report at the reached position. Its living identities remain unavailable for ordinary home work, and their unresolved group cannot take new missions; no homecoming or refund is fabricated. All members dying terminates as Lost with no recovered supplies. These terminal outcomes stop Expedition Mode; rescue gameplay is outside this slice.

Only actual confirmed positions refresh the clan discovery mask, at existing 8 m progress intervals and phase changes. Camera movement, order previews, dispatch and cinematic loading do not reveal planned corridors. The terrain seasonal-color correction remains in place: discovery refreshes foliage without repeatedly tinting ground or abandoning its live snow uniforms.

## Session pacing, pause and save/load

Prepared, Traveling, Exploring and Returning version-2 expeditions derive a temporary **10 min / 1,000 ticks** override for the entire player session. The normal user-selected 1/3/5-minute preference is preserved separately and the Year length control shows the forced mode. With multiple groups, the override remains until the last group returns, cancels or ends terminally; a low-ration return is still active until physical completion. Ending the last expedition restores the saved preference, including when it ends within one elapsed-time batch.

**+1 Year is disabled throughout Expedition Mode**, including Prepared, Traveling, Exploring and Returning groups, while running or paused and after save/load. It becomes available when the last active expedition ends; one group returning does not unlock it while another remains active. Ordinary Start/Pause remains available.

Starting, changing targets and mode changes never unpause a manual, hidden-tab, import/load or recovery pause. There is no offline progression or renderer-driven locomotion. Canonical speed remains 2 m/tick, approximately 3.33 m/s at this temporary pace. The render layer interpolates confirmed progress across the existing cadence and resets at a replaced route; native Run does not advance Core.

New starts upgrade the optional `world.spatial` extension to version 2. Its carried balances, Prepared/Stranded states, routes, confirmed progress and factual events are deterministic headless data. Geography is reattached on load; no duplicate world is saved in Core. Pacing intent/preference remains session state and the active override is derived from canonical expeditions. Save/load, replay and view handoff retain it without replacing the user's preference or resuming time automatically.

Existing version-1 spatial missions and old four-region Recon/Surveillance/Pillage saves retain their recorded movement/economy semantics. The 3D UI guides an already underway version-1 group home before starting the fixed-pack mode; it cannot silently purchase new route-priced provisions through the new UI. Old paid journeys are not assigned invented reserves. New gameplay uses the explicit confirmed start contract.
