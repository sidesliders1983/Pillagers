# Living Island Clan v0.4C — #149

Status: opt-in discovery prototype. Default activation and the owner visual/mobile review remain pending. #179 / #148 is merged; spatial Recon, Surveillance and Pillage remain #150.

## Canonical ownership

Fresh `/fjord-play?discovery=1` campaigns bind exactly one `island-rival` domestic Simulation Core state to the existing `WorldBlueprint.rivalSite.candidateId`. The version-2 world stores a version-1 named geography/site/clan link and the existing target-clan state. It stores no terrain, navigation, biome classification or second heightfield. The independently seeded rival uses the established Landing factory, weather, household/work/livestock/lifecycle rules and social configuration. Its clock starts at the player's exact founding time. Every parent tick advances it once through the existing `stepMechanicsTick`, even when completely unseen or without a renderer. No autonomous raids or new CPU management policy is added.

World version 1 retains exactly four historical directional regions and their original target states, missions and outcomes. Saved worlds are not silently reinterpreted. Enabling terrain discovery on an old campaign adds only the old discovery mask; it does not create or reset an island rival. New/restarted discovery prototypes use the new binding. Invalid sites, corrupt links and unsafe saved rival layouts reject atomically rather than reseeding or replacing the current campaign. Site intelligence and geographic mission targets are deliberately separate work in #150.

## Physical layout

The existing Fjord settlement projection accepts an explicit rival-site context on the same canonical terrain. Actual current households create tents; buildings appear only from real Core building state, with actual level/Farmyard variants. The founding residents, cattle and one campfire reuse existing sourced models and DNA body fitting. Six Environment Lab demonstration houses never become the rival population. No terrain grading is added. Tent reservations use the existing six-metre minimum future-hut parcel; permanent dwellings request larger supported footprints when needed. All parcels stay inside the rival reserve, clear the campfire, avoid overlap and use the same terrain support/path queries. Saved presentation placement is independent of CPU entropy and is validated on import. The existing expedition context also excludes the actual rival parcels and campfire; a goal in those footprints corrects to nearby safe ground without a second navigation field.

The target Core still owns its actual founding longship. The rival reserve has no validated ship berth, so this slice does not invent a rendered boat or dock on dry land. Existing legacy maritime semantics remain unchanged.

## Player knowledge and rendering

The existing per-clan discovery masks are the only visibility classifier. Unknown rival geography returns no site identity, coordinates, actor list, inventory, names, family relations or event history to the player projection. An explored nucleus marks a known settlement location; that is not Scouted/Surveyed intelligence. Only currently visible actors and complete observed path references enter the rival render layer. Unseen live changes cannot update player information. Mapped terrain stays known after the party returns, while live rival actors disappear from the player view.

Visible residents are anonymous. Their actual visual body/motion profile is passed through the existing Meshy profile override, with neutral surrogate DNA traits and no naming metadata, so the appearance payload is not an enemy attribute inspector. No enemy management panel, name labels, production popups, family list or direct movement commands are exposed. The main player projection, selection and stock/population totals remain player-only. Future strategic interaction belongs to #150.

A small rival scene adapter reuses `FjordEntities`, `FjordModels` and `LivingWorldController`. Unknown rivals allocate no actor instances. Visible actors use the same season materials, sourced clothing and autonomous presentation movement; pause stops that movement. Visibility loss releases instances, while canonical CPU state continues unchanged. Camera/frustum changes never tick Core or reveal terrain. The local saved state remains inspectable by its owner; this is game-information correctness, not cryptographic secrecy.

## Verification

Public Core/session/projection tests cover creation, independent hidden progression, save/replay, old-world preservation, invalid sites and saved layouts, actual ten-household founding capacity and no enemy information leak. The sourced-model browser case checks zero hidden actors, real body shape with neutral gameplay traits, animation, pause, culling/reveal and unchanged Core. The slice QA records ten founding seeds, the actual curated geography coverage, 100-Winter headless replay, and Low/Standard browser samples without making a few milliseconds on the development laptop a release gate. Physical-device observations must be reported separately from emulation.


## Measured prototype limits

Ten campaign seeds currently select two curated geography seeds, 7 and 18; they are not ten independent island geometries. All ten real founding populations fit. With the unchanged two-ration/500-active-tick pack, the sampled ordinary waypoint exploration reaches observable rival terrain on island 7. On island 18 the same pack triggers safe return before that observation. This is a measured expedition range limitation, not a missing/reset rival or justification to reveal it artificially. Far direct goals may also hit the existing bounded route-search limit; QA uses ordinary nearer objectives along the established terrain route. This slice changes neither search budgets nor Food/endurance values. Wider-range gameplay needs an explicit balance/mission decision, alongside #150.

The 100-Winter seed-32 replay matches the same target run independently through Core, including a save/load halfway through. Its actual population reaches zero by year 100 under the existing rules; the system does not respawn or subsidize an unseen clan. No new CPU building/occupation strategy or immortality rule is implied by the word living.
