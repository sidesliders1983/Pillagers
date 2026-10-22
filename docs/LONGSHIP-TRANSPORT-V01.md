# Expedition Longship v0.1 — #248

The founding longship is persistent transport for an existing Explore expedition. Simulation Core owns its saved position, reservation, water route, supplies and movement. Render frames interpolate confirmed movement only.

## Player flow

Prepare an expedition normally. While choosing its destination, select the founding longship. Each member follows an ordinary land route to safe shore beside it; the ship is reserved immediately, and everyone boards together. Choosing another land destination or recalling the party cancels boarding and releases that reservation.

When choosing a ship destination, mouse and touch use the same projected ship area with 18 CSS pixels of padding and a minimum 56 × 56 CSS pixel target. Nearby water and gaps between hull/sail triangles snap to that ship; the validity ring and the click use the same target. Hidden ships and ships behind nearer buildings cannot be selected this way. Once aboard, nearby water remains available as a sailing destination. Boarding still completes only when all members have reached shore; if travel is paused before they arrive, resume it to finish boarding.

An embarked group chooses water destinations using the existing green/red destination ring. Land, obstructed channels and points within 24 metres of the map boundary are rejected; the boundary message is **Sea too rough**. An invalid click reopens the controls with its reason, while a valid click leaves the map unobstructed. Selecting the occupied ship opens its existing expedition controls.

**Disembark** appears only within 24 metres of a safe, reachable shore. The coast must be walkable, above water, outside buildings and connected to the group's original home by a valid land route. The full group resumes land exploration. The ship stays at its actual position and can be boarded again. **Return home** reserves both the reached water trail and each member's land journey from the embarkation shore. This slice serves the same connected island; it adds no second-island travel.

## Movement, carrying and accounting

- Sailing is **2×** the current foot speed: with the ordinary policy, 4 metres per canonical tick instead of 2. It adds no weather multiplier, crew minimum or naval physics.
- The ship permits **2×** the expedition's paid Food pack capacity. At the founding coast, **Load N Food** buys the missing whole rations from clan stocks. Capacity creates no Food. An opened ration counts toward the limit; repeated loading cannot duplicate it. Supplies already purchased remain with the same expedition after disembarking, and unused Food is discarded at its eventual end under the existing rule. Away-from-home resupply is rejected.
- The existing cargo recovery resolver gives an unsalvaged assigned ship **2×** the normal return budget within each member's single chosen category: up to 20 Food, 10 Materials, two cattle or two people. It transfers real target assets; dead members provide no capacity. This also applies to ship-using compatibility region missions. Free Explore currently has no cargo pickup action, and this change adds no inventory or new sea Pillage workflow. Separate physical Recon/Surveillance/Pillage missions still depart from home under their existing contract.
- Food loading is explicit stock spending and joins the Clan Book's reserved-supply ledger. Consumption, losses and disposal retain the existing accounting.

## Identity and persistence

One canonical ship can be reserved by only one active group, including boarding. The same reservation excludes legacy region missions and salvage. Idle saved ship locations remain after disembarkation and are checked against regenerated geography on load.

The hull represents the group while embarked. Up to four deterministic current living members appear at fixed deck anchors, with their existing DNA, hair, beard and clothing. Groups of one or two show everyone; three–five show two–three; six–eight show three–four; larger groups show four. Others have no duplicate ground actor. These anchors have no independent deck AI, physics, crew assignment or boarding animation. Discovery and wildlife witnesses use the full original expedition, regardless of which members are rendered.

Occupants hold a sampled standing Idle pose with no running animation clock. Unchanged attachments stay parented to the hull across Core updates. Land locomotion, stale autonomous frames and previous activity animations cannot overwrite that pose or its deck position. Disembarking resets the actor's pitch/roll, releases the held pose and restores ordinary land movement. A subsequent land destination joins the waiting point to its homeward trail without retaining duplicate interior route points.

Water A* runs on destination proposals/commands against a cached terrain mask, with bounded search and sampled segments. It does not run every animation frame. The mask provides simple coastal clearance, not hull physics or a guarantee that an arbitrarily rotated full ship fits every narrow channel. Saves validate transport phase, assignment, member routes, return trails, Food accounting and actual hull position. Previous saves without transport fields retain their previous behavior.

## Validation

`tests/longship-transport.test.mjs` exercises boarding, paid loading, water speed, deterministic resume, recall, disembark/re-board, exclusive reservation, invalid saves, actual cargo transfer and real expedition controls. It also boards from the existing production-island berth and checks real resident appearance projection. The manual launcher is `/scripts/qa/longship-transport-248.html`; it creates an explicit QA campaign on a separate preview origin only when its button is clicked.
