# Fjordside — Expedition Groups, Exploration, Fog of War and Rival Clans

**Status:** Owner-approved design direction (2026-10-13). #147 has an opt-in discovery/fog prototype; default activation and the remaining epic slices are pending review.

**Authority:** [GP-008](../../GAME-PRINCIPLES.md#gp-008--exploration-is-strategic-group-level-action-knowledge-belongs-to-communities) · [Exploration Epic #146](https://github.com/sidesliders1983/Pillagers/issues/146).

## North star

Fjordside is a living 3D island that the player must explore. Residents lead autonomous lives; **only Expedition Groups** receive direct strategic movement and mission orders. Exploration reveals terrain as observers actually visit/see it. A real CPU community grows independently at the hidden rival site before either side is discovered.

## Current implementation inventory

- The authoritative headless `Simulation Core` already owns personal identity, family, occupations, resources, cattle, events, time and separate target CPU clan states.
- `src/simulation/WorldExpeditions.ts` already supports persistent groups and `CreateExpeditionGroup`, `EditExpeditionGroup`, `DispatchExpedition`; Recon, Surveillance, Pillage; provisions, risk, absence, casualties, real loot transfers and clan-scoped Unknown/Scouted/Surveyed intelligence.
- That historical simulation targets **exactly four abstract directional regions**. The retired isometric player interface (#54) selected those via arrows; its geographic identities must **not** be retroactively reinterpreted as physical island coordinates.
- `WorldBlueprint` now contains a deterministic natural island with navigation, topographic information and a **reserved rival site** (#134). That reserve currently does not instantiate the rival CPU community.
- `WorldLighting.fog` remains atmospheric distance/weather fog. The optional version-1 `SimulationState.discovery` prototype now stores per-clan explored/current masks tied to canonical geography; it is independent of camera motion. See [the current prototype contract](../CLAN-DISCOVERY-V04A.md). New campaigns opt in explicitly; old saves and the abstract Region Graph retain their original meaning.
- GP-007 and #140 retire separate 2D player experiences. All new UI belongs in `/fjord-play`.

## Direct control policy

| Actor | Player control | Autonomous behavior |
| --- | --- | --- |
| Ordinary resident | Strategic management such as occupation, home, caregiver, housing and communal priorities where approved | Routine path/movement, work, relationships and life |
| Expedition Group | Form/edit real membership; click an area to Explore; issue Recon, Surveillance, Pillage and approved group missions | Path selection, progress, formation, routine responses and execution |
| CPU clan | No direct commands from the player | Headless independent social/economic/biological progression even while unseen |

A resident cannot be double-booked into simultaneous Expedition Groups/missions or home production while away. No click-to-move for single residents.

## Three kinds of spatial knowledge

1. **Unknown geography** — terrain and settlement not yet discovered, obscured in the 3D client and its normal pick/tooltip/HUD channels.
2. **Previously explored geography** — persistent mapped location. The land remains visible after the scout returns, while current enemy residents/stock may no longer be visible.
3. **Currently observed geography** — known terrain within current clan observation; updated visible details may be displayed only as allowed by separate intelligence rules.

Scouted and Surveyed are *intelligence levels for actual regions/sites/opponents*, not the same as terrain visibility bits. Scouted knowledge may already enable Pillage if a real opportunity was identified; Surveillance refreshes information and is not a mandatory pillage prerequisite.

Observation is from real settlement/scout positions in canonical world space and must account for ridges/height. Camera travel, camera altitude and atmospheric-fog toggling do not reveal new geography. Incremental observation should be committed during actual group travel, not at dispatch. No arbitrary pre-reveal of future routes.

**Technical caution:** Stored campaign bytes are inspectable by users in a local browser; hiding enemy data is a game UX and player-visible-projection correctness requirement, not cryptographic security.

## Recommended geographic model

Introduce a **versioned mapping** of the known WorldBlueprint and its stable sites/areas to Simulation Core world-clan/mission targets. Candidate is a compact ~8m discovery raster, but resolution and costs require profiling. Do not duplicate the canonical 1m navigation data or 4m biome fields; derived visibility must be compact and deterministic.

A new island may have at least player and rival settlement IDs; old four-direction Region Graph saves retain their exact original schema/meaning. Physical missions use explicit typed locations/IDs and do not invent new CPU clans for each area clicked.

## First interaction milestone

1. Start a new physical-island campaign with a small visible founding area.
2. Create a named Expedition Group from eligible residents in the 3D Fjordside game.
3. Select the group, choose Explore Area, tap unknown terrain, confirm; reveal only allowed known travel estimates.
4. The group chooses a plausible path, progresses by canonical ticks, uses provisions and reveals actual terrain visited or seen behind/above ridge constraints.
5. On return, terrain remains mapped. The group can later reconnoiter a known possible rival site, surveil for fresher intelligence, or pillage a confirmed valid target.
6. The rival CPU state has continued advancing autonomously even while hidden; revealing land cannot rewind or respawn that clan.

## Stage ownership

- [#147](https://github.com/sidesliders1983/Pillagers/issues/147): per-clan discovery, fog masking, visible-state projection and sightlines.
- [#148](https://github.com/sidesliders1983/Pillagers/issues/148): 3D Expedition Groups and click-to-explore.
- [#149](https://github.com/sidesliders1983/Pillagers/issues/149): persistent existing CPU clan linked to reserved rival site.
- [#150](https://github.com/sidesliders1983/Pillagers/issues/150): physical site Recon/Surveillance/Pillage without breaking abstract old graph.
- [#151](https://github.com/sidesliders1983/Pillagers/issues/151): save/replay, visibility-leak, mobile and CPU/performance validation.

## Decisions deferred to implementation evidence

Exact detection radius by terrain height, forest, season/weather; expedition speed/food and risk; failed-route behavior and ship travel; CPU site founding/expansion detail; overall fog render technique and low-tier budget. Keep them configurable, versioned and explicitly reviewed; do not silently invent final coefficients.

## Explicit non-goals

Direct resident movement control, CPU-initiated raids and autonomous warfare, tactical player-directed combat, auto-exploration by every resident, real-time multiplayer, offline progression, unlimited procedural region streaming, fully simulated optical weather, adding a second player-facing 2D world map, or rewriting lore facts.
