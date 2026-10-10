# Living Fjord v0.6A

Issue #94 adds ambient resident and cattle locomotion to /fjord-play. It also restores the original Fjordside DNA body proportions and character profile with heritage.

## Authority and clocks

The Living World Controller receives the canonical presentation projection, never Simulation State. Its own seeded random streams choose bounded dry waypoints. Positions, headings, Idle/Walk state and idle delays are ephemeral and absent from saves, resource events and canonical replay. Reloading recomputes movement from canonical anchors.

Movement advances in real seconds while the campaign runs and the tab is visible. Campaign pause, hidden tabs, route transfer and disposal stop it, without catch-up. Changing minutes per Winter changes the simulation clock only. Slow rendered frames use movement substeps up to 0.1 seconds, with a one-second maximum frame interval to avoid large jumps after stalls. The explicit +1 Winter button does not start ambient motion on a paused campaign.

## Visibility and care

Children younger than five Winters stay indoors visually and remain selectable in the management list. Outdoor bodies appear at five, using current canonical age derived from birthWinter. This visibility rule changes no consumption, lineage or production rule. The actual active caregiver stays indoors; transferring care exchanges the donor/mother presentation immediately. Death and expeditions remove outdoor agents.

New campaigns use two Winters of canonical childcare. Existing saves keep their configured duration and existing care endpoints; restarting such a campaign also retains its saved rules. Use New campaign from seed for fresh defaults. This is the sole simulation-default change in this slice.

## Body and profile reuse

Residents use the verified Human_LOD2 through the same MeshyHumanFactory as Fjordside: unique seeded height, body build, sex, age shaping, skin tint, bones and animation mixer. No old clothing modules are assigned. DNA is copied from the canonical resident; only its presentation age is updated. Native body shaping caps age at the existing authoring limit of 100, while the card continues to show actual canonical age. Original stored names retain their spelling.

The previously approved growth curve remains 40% at birth to 100% at sixteen. The body adapter's internal childhood height factor is compensated once by the outer scale, avoiding double shrinkage; its child anatomical proportions remain. Ages below five have no outdoor body. Body refits happen only when DNA/current age changes.

Selecting an outdoor resident opens the shared Fjordside character profile content: name, current age, sex, five traits and heritage percentages. The three largest ancestries are visible; minor ancestries expand. The viewport-clamped profile follows the actor, hides offscreen or indoors, closes independently of management selection and cleans up its Escape listener on disposal.

## Routes and livestock

Bounded four-neighbour waypoint searches (one-metre spacing outside yards, 0.25 metres inside yards) use the displayed terrain triangles, walking elevation above water (+0.2m), maximum slope (0.55), dynamic canonical parcels and source nature clearances. Tents need no permanent paths. Straight movement segments are checked every 0.2m; acceleration and heading interpolation prevent ordinary teleporting. Agents stop/replan for nearby bodies. Invalidated homes/assignments may re-anchor an actor during canonical reconciliation.

The first living assigned cattle IDs up to the canonical capacity (normally four) occupy the Farmyard; excess assigned animals graze nearby outside its reserved footprint. This does not change assignment, shelter, overcrowding risk or economic productivity. Unassigned cattle roam near their exposed anchor. Yard routes avoid actual farmhouse walls, fences and props using a cached source-triangle spatial index and floor raycasts. Stage collision radii are 0.5m for Young, 0.7m for Young Adult and 0.9m for Adult; these are presentation collision proxies, not canonical capacity changes. The source floor's outer garden apron is excluded. A blocked initial point is relocated deterministically to the nearest available safe slot in the same yard without rewriting its canonical anchor; unsafe/missing routes retain Idle. Higher-level yard-marker limitations remain explicit as in v0.5C.

Residents reuse Walking/Idle_02, cattle Walk/Idle. Human pace is measured from the existing stance-foot sampling helper and DNA cadence; cattle use each source manifest's walkSpeedMps. Animation pace follows movement speed. Missing clips/assets produce explicit stable static fallbacks rather than invented animation. Rings, relation labels, production feedback and character cards follow live transforms; cached body bounds avoid measuring skinned vertices every frame.

## Verification

Run node --test tests/living-fjord.test.mjs for the public projection/controller and Core save/replay seams. Run node scripts/qa/check-living-fjord.mjs against the LAN/dev server for actual DNA bodies, movement, heritage popup, touch, pause, replay and five-animal Farmyard reconciliation. Run node scripts/qa/capture-living-herd.mjs for close views at capacity plus one, actual within-yard movement, and return to capacity through the real Slaughter command. Browser evidence is in docs/qa/living-fjord. Existing character validation, build and the complete test suite remain required.
