# Spatial Expedition Groups v0.4B — Expedition Mode (#148 / PR #179)

New `/fjord-play` islands enable exploration and one physical rival by default from 2026-10-18. Expedition Groups reuse the existing Simulation Core, canonical physical routes, native resident Run and clan discovery. Ordinary residents stay autonomous. Existing saves keep their original rules; separate spatial missions are documented in v0.4D (#150), and larger ship/horse/cart carrying capacities are not implemented.

## Current owner decisions

The 2026-10-16 Expedition Mode brief replaces destination-distance prices and repeated Food purchases. The owner's subsequent clarification supersedes the brief's refund clauses: **Food is spent permanently when Start Expedition is confirmed. Nothing is refunded after that confirmation**, including cancellation before physical movement or early return. Cancelling the confirmation dialog itself changes nothing. Historical QA remains evidence of the rules used in those runs.

Prototype values are **2 Food per member**, **one carried ration per 250 active canonical ticks**, **500 ticks of endurance**, **2 m movement per canonical tick**, and a temporary **10 minutes per 1,000 ticks** for the whole running simulation. These values are prototype tuning, not historical claims. The former 25-tick automatic stay is retained only for old version-1 journeys; new expeditions can explore/wait at the target until recalled, redirected or required to return safely.

## Player flow and confirmation

### Test carrying capacity — 2026-10-18

To test distant exploration without changing normal balance, group preparation includes a collapsed **Test supplies** section. **Food per resident (test)** accepts a whole number from **1 to 10**; the normal default remains **2**. Three members taking 8 each cost **24 Food** and receive **2,000 active ticks** each at the existing 250 ticks per Food. Ten each is the maximum: **2,500 active ticks**, including the unchanged protected physical return allowance.

The paid departure dialog shows the actual total, per-person amount and a test-pack label. Back/cancel spends nothing; confirmation revalidates the crew, amount and clan stock, then spends once. Invalid amounts or insufficient Food reject atomically. There is no free Food, refund, timer reset, resupply while away or change to production, casualties, discovery or separate Recon/Surveillance/Pillage provisions.

`StartExpedition.testFoodPerMember` is an explicit optional playtest command field. A custom purchase stores its amount in the existing provisions and an optional `testCapacity: true` marker. Save validation bounds marked packs to 1–10 and still requires unmarked normal packs to carry exactly 2; all ration accounting checks remain. Save/load and replay retain the purchased custom pack and its remaining rations. The unpurchased input draft is presentation state for the next departure, not a persistent campaign-wide balance setting. Ongoing custom supplies remain labelled **Test pack** in the UI.

### Navigation and mobile visibility — 2026-10-18

Only the paid **Start Expedition** action requires confirmation. Choose/Change destination arms a single ground tap; a valid tap immediately applies the new route using the same pack. An invalid tap leaves the existing expedition unchanged and keeps destination selection active. Separate Recon, Surveillance and Pillage departures retain their own paid confirmation.

Each active group has a numbered route-icon shortcut above Expeditions in the navigation dock. It hides or restores that group's map controls without changing its mission, supplies, camera or clock. Hiding also leaves destination-selection mode so ordinary map navigation is available. Multiple groups have independent visibility controls; visibility is transient presentation state.

The **Exploration supplies** bar excludes the existing protected journey-home allowance (actual reached return trail at canonical speed plus the existing two-tick safety margin). Its time estimate is available exploration time, not total pack endurance including return. Automatic low-supply return shows zero exploration time and an explicit reason, including while paused. Remaining rations still fund the real homeward journey. This changes presentation only: prices, consumption, safe-return rules, save data and pacing are unchanged. A general attention/warning system is outside this pass.

Expeditions opens the global group overview regardless of the selected home, resident or animal. Create exploration group creates Group 1, Group 2, etc. Each group has an inline resident checklist, using the canonical eligibility rules; membership can change only while no expedition is active. Group actions stay available without clearing the world selection.

The Campaign menu defaults Enable exploration & rival clan on for new and restarted islands. This is a proposal for the next island, rather than an indicator of the active save. Existing saves retain their discovery state. The QA launcher also offers a paused Exploration & rival clan campaign with ordinary starting resources, one hidden living rival and two eligible founders already assigned to a group. Changing the new-campaign checkbox alone never changes the active campaign.

**Start Expedition** opens the concise owner-approved confirmation: “This will cost XX food (2 food per member). Are you sure?” with the fixed total price filled in. Three members cost **6 Food**. Cancel in this dialog changes no stock, time or mission. Confirm validates membership and Food atomically, spends the fixed price once, and creates a **Prepared** expedition. Insufficient stock, invalid/caregiving members, an already active group or capacity limits reject without mutation. Repeated confirmation cannot spend twice.

A Prepared group remains physically at home; its residents retain home autonomy/work/annual consumption, while the carried ration timer remains stopped. Explore Area arms one destination tap. Ordinary ground taps remain camera navigation outside this mode. One valid destination tap begins physical travel from the members' actual current rendered origins, checked and saved by Core. Invalid/unreachable targets leave the prepared state intact. Cancel expedition ends preparation but does **not** return its already-spent Food.

Traveling, Exploring, Returning and Stranded members produce no home Food or Materials and accumulate no work progress. Pending or visible home-production popups are cleared on departure, so an earlier award cannot follow an explorer. Already recorded production and stock totals remain factual. Work resumes only after actual homecoming.

While Traveling, Exploring or Returning, Explore Area and another destination tap replace the goal using the **same pack**, no purchase/refill/refund and no timer reset. Core uses confirmed positions for away members and ignores renderer-origin overrides. Return Home recalls the real reached group, not a projected destination. Invalid orders leave stocks, route, progress, supplies and discovery unchanged. Supplies remaining is shown as active ticks; no per-destination Food quote is displayed.

## Carried Food and accounting

Each member starts with two unopened rations. On the first active travel tick a ration is opened and supplies 250 ticks; subsequent active ticks decrement its integer tick balance. A second ration is opened only after the first is exhausted. This avoids treating a partly eaten ration as unused Food. Waiting in Prepared does not open or consume anything. Away travel, time spent exploring and the actual return consume the same carried allowance. Pause, hidden tabs and render frames consume no canonical ticks.

Home stocks decrease **only at confirmed Start Expedition**. Opening/eating a carried ration never charges home stocks again, and away residents keep the existing exclusion from annual household Food consumption. Death makes unopened supplies unrecoverable; started rations already count as consumed. On confirmed homecoming or cancellation, any unopened remainder is recorded as **unused/discarded**, never credited to stocks. A subsequent new expedition buys a fresh pack at the same fixed member price.

Canonical per-member balances distinguish unopened Food, the active ration's remaining ticks, consumed units, discarded units and lost units. The sum of unopened/consumed/discarded/lost units must equal the initial two units for each member. The factual Clan Book maps the start to home-stock spending; carried consumption/discard/loss are separate interval activity and cannot be double-counted as further stock debits. Preparation cancellation records no fictitious physical homecoming. Published historical chapters are not rewritten.

## Safe movement, return and terminal failure

Core plans with bounded deterministic A* on the existing navigation grid and canonical heightfield. New fixed-pack orders use eight directions, with diagonal distance charged at its actual length: movement remains 2 m per tick, rather than becoming faster on diagonals. A diagonal requires both adjacent cardinal cells to be safe, so it cannot cut blocked terrain or building corners. Sampled dry ground, a maximum local grade of 0.65 and reserved home/campfire exclusions remain in use. A tap on an unavailable cell can resolve to safe local ground within 8 m without jumping water or a ridge. Search remains bounded at 40,000 nodes. No second terrain classification, saved heightfield, renderer authority or new random casualty system is added.

Each new route stores `routeMode: eight-way-v1`; old saved journeys retain their recorded cardinal geometry until a new order is given. Partial diagonal redirects and exact homeward trails survive save/load. Per-tick slope checks follow the actual crossed polyline edges: a valid hillside corner must not be mistaken for a steeper straight chord and trigger a false return. This requires no new path search per tick or frame.

Every new leg retains its confirmed origin and a validated trail back to the original home. Redirecting extends/reuses actual reached geometry. Core compares each living member's remaining endurance with the actual traversable return trail before the next active tick, using a conservative two-tick margin. A distant target can be accepted without promising it will be reached: the group turns back before its return budget would become unsafe. Return uses the reached trail, including partial edges and exact home origins, rather than teleporting or inventing progress. It requires no new path search on each render frame/tick.

A newly blocked outward step triggers return. A truly blocked homeward path or exhausted endurance before home produces an explicit **Stranded** terminal report at the reached position. Its living identities remain unavailable for ordinary home work, and their unresolved group cannot take new missions; no homecoming or refund is fabricated. All members dying terminates as Lost with no recovered supplies. These terminal outcomes stop Expedition Mode; rescue gameplay is outside this slice.

Only actual confirmed positions refresh the clan discovery mask, at existing 8 m progress intervals and phase changes. Camera movement, order previews, dispatch and cinematic loading do not reveal planned corridors. The terrain seasonal-color correction remains in place: discovery refreshes foliage without repeatedly tinting ground or abandoning its live snow uniforms.

## Session pacing, pause and save/load

Prepared, Traveling, Exploring and Returning version-2 expeditions derive a temporary **10 min / 1,000 ticks** override for the entire player session. The normal user-selected 1/3/5-minute preference is preserved separately and the Year length control shows the forced mode. With multiple groups, the override remains until the last group returns, cancels or ends terminally; a low-ration return is still active until physical completion. Ending the last expedition restores the saved preference, including when it ends within one elapsed-time batch.

**+1 Year is disabled throughout Expedition Mode**, including Prepared, Traveling, Exploring and Returning groups, while running or paused and after save/load. It becomes available when the last active expedition ends; one group returning does not unlock it while another remains active. Ordinary Start/Pause remains available.

Starting, changing targets and mode changes never unpause a manual, hidden-tab, import/load or recovery pause. There is no offline progression or renderer-driven locomotion. Canonical speed remains 2 m/tick, approximately 3.33 m/s at this temporary pace. The render layer interpolates confirmed progress across the existing cadence and resets at a replaced route; native Run does not advance Core.

New starts upgrade the optional `world.spatial` extension to version 2. Its carried balances, Prepared/Stranded states, routes, confirmed progress and factual events are deterministic headless data. Geography is reattached on load; no duplicate world is saved in Core. Pacing intent/preference remains session state and the active override is derived from canonical expeditions. Save/load, replay and view handoff retain it without replacing the user's preference or resuming time automatically.

Existing version-1 spatial missions and old four-region Recon/Surveillance/Pillage saves retain their recorded movement/economy semantics. The 3D UI guides an already underway version-1 group home before starting the fixed-pack mode; it cannot silently purchase new route-priced provisions through the new UI. Old paid journeys are not assigned invented reserves. New gameplay uses the explicit confirmed start contract.

## Physical mission adapter (#150)

The [v0.4D physical mission contract](ISLAND-MISSIONS-V04D.md) now connects the same groups to separate Recon, Surveillance and Pillage journeys from home. It retains the existing mission prices/durations and actual recovery limits; it does not extend an Explore pack or change its endurance. Spatial version 3 allows old Explore packets and new versioned mission tasks to coexist without changing the old records.
