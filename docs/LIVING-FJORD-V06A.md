# Living Fjord v0.6A

Issue #94 adds ambient resident and cattle locomotion to /fjord-play. It also restores the original Fjordside DNA body proportions and character profile with heritage.

## Authority and clocks

The Living World Controller receives the canonical presentation projection, never Simulation State. Its own seeded random streams choose bounded dry waypoints. Positions, headings, Idle/Walk state and idle delays are ephemeral and absent from saves, resource events and canonical replay. Reloading recomputes movement from canonical anchors.

Opening or refreshing `/fjord-play`, creating a new campaign, and restarting a campaign automatically start the clock after scene loading. Explicit save loading/import remains paused. A 2D/3D handoff preserves the chosen running or paused state; leaving the tab still pauses it, with no offline catch-up. `/play` and Gameplay Lab retain their own startup defaults.

Pending automatic starts are cancelled by the latest explicit clock/load/import intent, hidden-tab suspension or loss of route ownership. New/restart follows the same rule. Asset loading contributes no active time. Timer work rechecks visibility, ownership, scene readiness and the intent revision when it actually executes, so stale queued intervals are discarded. Returning to a suspended tab remains paused, with a reset time baseline.

Movement advances in real seconds while the campaign runs and the tab is visible. Campaign pause, hidden tabs, route transfer and disposal stop it, without catch-up. Changing minutes per Winter changes the simulation clock only. Slow rendered frames use movement substeps up to 0.1 seconds, with a one-second maximum frame interval to avoid large jumps after stalls. The explicit +1 Winter button does not start ambient motion on a paused campaign.

## Visibility and care

Children younger than five Winters stay indoors visually and remain selectable in the management list. Outdoor bodies appear at five, using current canonical age derived from birthWinter. This visibility rule changes no consumption, lineage or production rule. The actual active caregiver stays indoors; transferring care exchanges the donor/mother presentation immediately. Death and expeditions remove outdoor agents.

New campaigns use five Winters of canonical childcare and a separate two-complete-Winter birth cooldown. Existing saves keep their configured duration and existing care endpoints; restarting such a campaign also retains its saved rules. Use New campaign from seed for fresh defaults. The earlier two-Winter-care branch instruction was corrected on 11 October 2026; no silent conversion of explicit two-Winter playtest saves is performed. Care transfer preserves both endpoints; a younger child can renew care beyond an older child’s fifth birthday.

## Body and profile reuse

Residents use the verified Human_LOD2 through the same MeshyHumanFactory as Fjordside: unique seeded height, body build, sex, age shaping, skin tint, bones and animation mixer. No old clothing modules are assigned. DNA is copied from the canonical resident; only its presentation age is updated. Native body shaping caps age at the existing authoring limit of 100, while the card continues to show actual canonical age. Original stored names retain their spelling.

The previously approved growth curve remains 40% at birth to 100% at sixteen. The body adapter's internal childhood height factor is compensated once by the outer scale, avoiding double shrinkage; its child anatomical proportions remain. Ages below five have no outdoor body. Body refits happen only when DNA/current age changes.

Selecting an outdoor resident opens a compact popup with only their stored name and a touch-sized ▲ button. ▲ expands the shared Fjordside character profile content; ▼ collapses it again: name, current age, sex, five traits and heritage percentages. Each different resident selection starts collapsed; expansion survives clock updates for the same resident. Expanded details scroll within a limited-height body so the scene stays visible. The three largest ancestries are visible; minor ancestries expand. The viewport-clamped profile follows the actor, hides offscreen or indoors, closes independently of management selection and cleans up its Escape listener on disposal.

## Routes and livestock

Bounded four-neighbour waypoint searches (one-metre spacing outside yards, 0.25 metres inside yards) use the displayed terrain triangles, walking elevation above water (+0.2m), maximum slope (0.55), dynamic canonical parcels and source nature clearances. Tents need no permanent paths. Straight movement segments are checked every 0.2m; acceleration and heading interpolation prevent ordinary teleporting. Agents stop/replan for nearby bodies. Invalidated homes/assignments may re-anchor an actor during canonical reconciliation.

Failed goal searches retain at most eight entries per actor for one active presentation second. Pause/hidden time does not expire or replay them. A changed start, goal, canonical navigation/house/assignment/stage input, standing-tree layout, source-yard version, endpoint blocker or social reservation invalidates reuse immediately. Ordinary moving traffic elsewhere receives a fresh attempt within that one-second bound; no successful route is cached and no goal is permanently blacklisted. Goal searches use a stable minimum queue and wandering uses a FIFO cursor, preserving the same bounded neighbour search and clearance checks.

Successful work visits also retain their bounded outbound waypoints until returning home. A return may reuse that corridor only after every segment and the final home connection pass current terrain/parcel/source-obstacle checks. Actual steps and passing still check bodies; no waypoint teleports an actor. Invalidated corridors fall back to the ordinary bounded search, and cancellation/removal releases the trail. This avoids repeatedly rediscovering the long route from remote shore work. Source-yard caches invalidate when the house world frame changes. Their 16,000-point bound evicts one old point at capacity instead of flushing every recent route probe.

The first living assigned cattle IDs up to the canonical capacity (normally four) occupy the Farmyard; excess assigned animals graze nearby outside its reserved footprint. This does not change assignment, shelter, overcrowding risk or economic productivity. Unassigned cattle roam near their exposed anchor. Yard routes avoid actual farmhouse walls, fences and props using a cached source-triangle spatial index and floor raycasts. Stage collision radii are 0.5m for Young, 0.7m for Young Adult and 0.9m for Adult; these are presentation collision proxies, not canonical capacity changes. The source floor's outer garden apron is excluded. A blocked initial point is relocated deterministically to the nearest available safe slot in the same yard without rewriting its canonical anchor; unsafe/missing routes retain Idle. Higher-level yard-marker limitations remain explicit as in v0.5C.

Residents reuse Walking/Idle_02, cattle Walk/Idle. Human pace is measured from the existing stance-foot sampling helper and DNA cadence; cattle use each source manifest's walkSpeedMps. Animation pace follows movement speed. Missing clips/assets produce explicit stable static fallbacks rather than invented animation. Rings, relation labels, production feedback and character cards follow live transforms; cached body bounds avoid measuring skinned vertices every frame.

## Resident clothing in Fjordplay

Fjordplay uses explicit owner-selected visual sets on the existing Meshy Human:

| Resident | Clothing set |
| --- | --- |
| Generic adult (all occupations except farmer) | Original tunic and long trousers with low leather shoes |
| Female farmer | Long woven skirt and low leather shoes; native undershirt, no tunic |
| Male farmer | Short woven trousers and high leather boots; native undershirt, no tunic |

Selection follows canonical DNA sex and current occupation. It updates on the same resident
model when occupation, sex or age changes; it changes neither Core data nor production rules.
The adult source garments retain their supported age range: residents below eighteen keep the
native body presentation rather than receiving an unverified resized adult outfit.

The original tunic ensemble explicitly leaves footwear independent. Its existing chest,
neck and cuff masks compose with the selected shoes' measured ankle/foot masks. Height
normalization measures the complete native body even while clothing hides foot triangles.
All clothing uses the same native skeleton and DNA scaling. A slow obsolete clothing request
cannot overwrite a newer occupation, and an unavailable garment retains the current live body
with a diagnostic and a retry on later reconciliation. The existing assets remain frozen;
this selection does not grant arbitrary preview assets automatic registry acceptance.

The rendered entity diagnostics include the installed clothing set and exact asset IDs.
Regression coverage is in tests/fjord-clothing.test.mjs; the original fit limitations still
apply to the source tunic and its animation skirt. Hair and beard selection remain unchanged.

## Verification

Run node --test tests/living-fjord.test.mjs for the public projection/controller and Core save/replay seams. Run node scripts/qa/check-living-fjord.mjs against the LAN/dev server for actual DNA bodies, movement, heritage popup, touch, pause, replay and five-animal Farmyard reconciliation. Run node scripts/qa/capture-living-herd.mjs for close views at capacity plus one, actual within-yard movement, and return to capacity through the real Slaughter command. Browser evidence is in docs/qa/living-fjord. Existing character validation, build and the complete test suite remain required.

Selection framing uses cached asset/body bounds translated to the live position. Exact heading/pose framing remains approximate; turning cattle and extreme DNA builds should be checked in the later polish/performance pass. Existing Fjordside Talk/Listen and prepared cattle Graze/HumanInteraction integration remains #95, with one movement/animation owner per actor; no new interaction system is introduced here.
