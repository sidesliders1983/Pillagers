# Pillagers — Game Simulator roadmap

> **Current delivery direction, 2026-10-13:** **Fjordside 3D is the only player-facing game**, with headless Simulation Core as the sole authoritative rules/data layer. The text/card Gameplay Lab and isometric 2D board are completed *historical prototypes*, no longer parallel product surfaces. This supersedes the older presentation-first sequencing below, not the simulation mechanics or earlier historical milestones.
>
> Decision: [GP-007](../../GAME-PRINCIPLES.md#gp-007--fjordside-is-the-single-3d-player-facing-game). Migration: [#140](https://github.com/sidesliders1983/Pillagers/issues/140). Canonical architecture: [Gameplay-first architecture](GAMEPLAY-FIRST-ARCHITECTURE.md).

## Current active delivery roadmap — 3D-first

### Stage 1 — Consolidate existing game presentation (issue #140)

- Freeze new features and polish for `/play` and `/gameplay-lab`.
- Keep Simulation Core, campaign/session logic, saves, Family Tree, Personal History, Clan Book, debug/batch QA.
- Extract shared modules from 2D-named folders only where truly presentation-neutral, minimizing schema and runtime risk.
- Make `/fjord-play` the sole player-facing game with safe old-route navigation and preserved saved campaigns.
- Retire 2D presentation code only when 3D management/command parity, save migration and browser tests have passed.
- Keep Environment Lab, Character Lab and Asset Lab as developer tools; keep the separate `/` world prototype reachable for development until intentionally migrated.

### Stage 2 — A believable island as the shared playable world (epic #132)

Complete the independently reviewed procedural landmass and paired settlement-site generation, biome zoning, grid semantics and visual ground blending (#133–#137). Coordinate camera-visible rendering/performance (#131); do not couple terrain shaping to Simulation Core economics or a second 2D gameplay UI.

### Stage 3 — Expand the living 3D settlement

Iteratively add/complete resident, household, family, occupations, cattle, construction, resource, social and seasonal visualization/management **through 3D**. Continue balancing and deterministic headless multi-winter tests independently from scene rendering.

### Stage 4 — Exploration, rival settlements, recon and pillaging

Use canonical multi-clan / world-region simulation and commands; connect their projections and interactions to 3D rather than rebuilding separate 2D flows. CPU attacks/defense, diplomacy and endgame remain separate approved gameplay phases where applicable.

## Historical simulator milestones — delivered/proposed gameplay layers, not active 2D UI roadmap

The following original v0.1–v0.4 headings are retained for traceability. Any reference to "Gameplay Lab" or "without requiring 3D" describes **how mechanics were prototyped**, not a mandate to keep a player-facing 2D interface.

## v0.1 — One clan

Primary goal: prove the internal Pillagers gameplay loop without requiring 3D.

Includes:
- personas and lineage;
- CharacterDNA-driven aptitude;
- occupations/history;
- Food + Materials;
- childcare;
- households/residences/buildings/tents;
- economic building upgrades;
- direct player intervention;
- canonical Winter 800 time;
- text/card-first Gameplay Lab.

## v0.2 — Two clans, reconnaissance and pillaging

Add:
- second CPU clan using the same clan simulation;
- Region Graph + Sites;
- reconnaissance with imperfect/stale information;
- player-selected raid parties made of real personas;
- player-initiated headless raids;
- transfer of real Food/Materials/personas between clans;
- persistent post-raid consequences.

No abstract Knowledge resource. Expertise lives in personas.

CPU attacks are deferred.

## v0.3 — Cattle and Winter weather

Add:
- cattle only;
- Cattle Pen as Farm module;
- starter herd 2 cows + 1 bull;
- cattle Food consumption;
- cow ongoing Food production;
- reproduction;
- slaughter;
- cattle as raid loot;
- per-Region Mild/Normal/Harsh/Severe Winter roll;
- exposure risk for tents/cattle;
- weather impact on Food and expeditions.

Keep other production abstract.

## v0.4 candidate — CPU raids and defense

Only after v0.2/v0.3 are understood:
- CPU reconnaissance;
- CPU-initiated raids;
- watchtowers / detection;
- palisades;
- defenders;
- strategic raid/defense opportunity cost.

Exact scope remains open.
