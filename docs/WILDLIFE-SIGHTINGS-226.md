# Wildlife sightings — #226

## Original architecture audit (main 65980e0, before #216)

- Wildlife entered Fjord Play in [PR #215](https://github.com/sidesliders1983/Pillagers/pull/215).
  `WildlifePopulation` owns seeded real instance IDs, habitat placement and motion.
  `FjordScene` currently advances it using frame seconds and rendered human poses.
  That is suitable for ambience but cannot author deterministic historical facts.
- `SimulationCore.applyCommand` advances `stepMechanicsTick` and
  `stepSpatialExpeditions` per tick. `SpatialMission.memberIds` is the active
  mission roster; `spatialMemberPosition` is the confirmed per-member route pose.
  Prepared groups have not departed. Returned groups are historical, not observers.
- `ClanDiscovery` stores authoritative explored/visible masks. Observations use
  triangle-interpolated terrain and `traceTerrainSightline`, with a 64 m expedition
  radius and throttled visibility refresh. Camera and render culling are not facts.
- `SimulationState.events` is the ordered canonical history, serialized with Core.
  `eventFacts` freezes participant names. `PersonalHistoryIndex` already derives
  personal participation from saved IDs and retains dead/archived identities.
- `ClanBookReader` currently has Story and Family Tree tabs. A rebuildable species
  index and a third Wildlife tab can share the existing reader and history.
- [#216](https://github.com/sidesliders1983/Pillagers/issues/216) remains open.
  Attention currently shows live condition counts and a Chronicle excerpt; there
  is no general persisted notification feed. This issue adds only a wildlife-first
  discovery adapter to that existing surface, leaving the general hub to #216.

## Implemented authoritative contract

A versioned optional `SimulationState.wildlife` binds the existing seeded
population to a physical world. Its compact motion snapshot advances at fixed
0.2-second wildlife steps per canonical tick, without consuming Core RNG.
The renderer reads those actual positions and keeps cosmetic animation on its
paused presentation clock. Camera, model load success and frame subdivisions
cannot create sightings or move the authoritative animals.

New Fjord physical-island campaigns enable the feature. Existing saves keep their meaning;
older physical campaigns may explicitly start recording from their current tick.
No historical sightings are backfilled. Graph-only campaigns remain unchanged.

`WildlifeSighted` is one canonical group-level event. Its version-1 details contain
`sightingId`, `clanId`, `worldId`, `speciesId`, `wildlifeInstanceId`,
`expeditionGroupId`, `groupName`, `missionId`, `witnessPersonaIds`, `position`,
`habitat`, `occurredAtTick`, `encounterKey` and `firstForClan`. Standard event time
provides the year and within-year tick. Saved witness names use `eventFacts`.
Witnesses are living participants in the actual mission roster at encounter time;
none is described as an independent spotter or randomly selected primary observer.
Missing participant identity is omitted. Later roster changes never rewrite events.

## Eligibility and encounter policy

- Sample every 5 canonical ticks, after expedition movement and discovery updates.
- Index existing animals in 32 m spatial buckets; query only nearby candidates
  from confirmed living expedition member poses. Never scan a cross product on
  render frames. Coalesce all member/instance matches into one group/species match.
- Require actual proximity within 32 m, mapped or currently visible terrain, and
  the existing terrain sightline from expedition eye height to the real animal.
  Trees/buildings are not newly claimed as opaque: LOS has the same terrain-only
  limitation as current exploration. Prepared and returned groups do not observe.
- Keep group/species contact across destination redirects. Continuous proximity
  produces one encounter. Re-entry requires at least 50 ticks out of contact and
  250 ticks since the previous sighting. A persisted monotonic encounter sequence
  prevents ID reuse after group dissolution. Old contacts are bounded to active
  groups/species; absence/despawn cannot erase historical events.
- The clan's first event for each species is noteworthy once. Subsequent encounters
  remain quiet history. No Familiar/biological-knowledge threshold is introduced.

## Projections and UI metadata

A rebuildable append-only index maps the one event stream to species, groups and
encounters. Personal history uses the same witness IDs. Views never list names,
locations, instance counts or registry entries for undiscovered species.
Species encounter pages are bounded; history is not cloned into UI storage.
This PR now depends on [Attention #216 / PR #235](https://github.com/sidesliders1983/Pillagers/pull/235).
The `wildlifeAttentionAdapter` joins the common Attention projection: first clan
species sightings are noteworthy discoveries, subsequent encounters are ambient
Chronicle facts. Both use the canonical sighting ID and actual witness roster.
One shared badge and bounded `attention` metadata store cover life, expeditions,
conditions and wildlife. Reading the species in Clan Book marks that same source
read. There is no separate wildlife notification feed or persisted read store.

Prototype #226 saves with `wildlifeReadIds` are validated and migrated on import:
retained old non-wildlife facts are adopted as read; actual first-sighting read flags
are preserved. New exports contain only the #216 contract. Without either metadata
field, normal #216 old-save adoption applies. Older facts outside the bounded inbox
remain in Chronicle and the species history.
When local storage combines an older canonical save with a newer same-seed sidecar,
stale read IDs are discarded; a reused event number cannot mark another discovery read.
Historical navigation falls back to the recorded encounter when a group/person
is no longer available. Gameplay clocks and movement are not interrupted.

## Delivery and validation

1. Commit this audit and contract before implementation.
2. Implement versioned motion/encounter state and canonical event validation.
3. Add incremental projections, Clan Book, personal/group links and Attention.
4. Verify save/load/replay, command batching/fast-forward, camera independence,
   redirects, group lifecycle/death, LOS/fog, unknown-species privacy and bounded
   query/index costs. Record profiling and desktop/mobile inspection evidence.

This feature does not implement hunting, taming, combat or population growth.


## Implementation notes and limits

- The initial audit was committed separately as `e6ee42d`, before implementation.
- No group-splitting, disband or wildlife-despawn command exists in current main.
  Existing roster edit, separate groups, physical return and real mortality are
  exercised. Historical projections tolerate absent groups/actors without
  reattributing or deleting their events; this does not introduce new commands.
- Canonical animal avoidance uses confirmed expedition poses. Cosmetic resident
  motion and camera visibility cannot change the canonical animal population.
- The renderer smooths tick positions and retains existing cosmetic animations;
  render-only smoothing cannot affect distance, LOS, encounter IDs or witnesses.
- DOM integration tests exercise actual reader/Attention/group links, keyboard
  tabs, Escape, historical participant navigation, read persistence and epoch
  guards. A pinned jsdom development dependency supplies DOM semantics only.
- Browser control reported no available browsers in this session. Desktop/mobile
  screenshots and visual UAT are **not** claimed. The isolated review page is
  `scripts/qa/wildlife-sightings-review.html`, including a 390 px iframe option.
- Reproducible real-island checkpoint and bounded workload measurements:
  `node scripts/qa/wildlife-sightings-226.mjs`.
  See [QA evidence](qa/wildlife-sightings-226/README.md).

## Stacked delivery

Merge #216 first. This feature branch and PR #234 target its branch so reviewers see
only the wildlife extension. Retarget #234 to main after the foundation merges; do
not merge the stack while checks for either head are pending/failing. The QA launcher
binds immediately, reports loading/fetch failures and opens the selected paused
checkpoint directly at Attention. It no longer imports/restores a whole world before
responding to a click. The actual game remains responsible for checkpoint restoration.

## Short first-discovery messages

The shared #216 pop-up presents a first sighting as “Coast watch sighted a seagull
on their journey.” The exact group name/species come from that canonical event;
View details opens its shared Attention source and then the Clan Book encounter.
Repeat sightings remain ambient. No wildlife-specific timer, badge or read store
is introduced. The live QA checkpoint is captured before the actual first sighting;
pressing Play advances that real route and generates a new event, not a scripted
or replayed example. Saved unread/read checkpoints intentionally do not replay cards.
