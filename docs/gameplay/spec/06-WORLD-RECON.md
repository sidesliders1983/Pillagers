# 06 — World & Reconnaissance

## WORLD-001 — Region Graph
**Status:** Canonical

> **As a player, I want location to shape opportunities and constraints, so that geography creates strategy without a world-scale tile simulation.**

Rules:
- world is a graph of Regions;
- no Civilization-style macro grid required;
- Regions may define farming, fishing, forestry/hunting, grazing, natural defense and travel connections;
- local 3D spatial detail is presentation/local interaction, not macro simulation truth.

## WORLD-002 — Sites
**Status:** Canonical direction

> **As a player, I want meaningful destinations within Regions, so that expeditions target understandable places rather than arbitrary coordinates.**

Possible Sites: settlement, forest/logging, fishing grounds, grazing, dock, later outposts/defenses.

## RECON-001 — Unknown world
**Status:** Canonical direction

> **As a player, I want to discover other Regions/clans through reconnaissance, so that external opportunities and threats are earned information.**

Player does not automatically know exact remote clan state.

## RECON-002 — Imperfect/stale intelligence
**Status:** Canonical direction

> **As a player, I want reconnaissance to provide imperfect information, so that raids involve judgment and risk rather than omniscient optimization.**

Recon may reveal estimates such as population, defenses, resource abundance, livestock and observed specialists. Information can become stale. This is player knowledge/fog-of-war state, not a Knowledge resource.

## Implemented v0.4 slice

[World Expeditions v0.4](../../WORLD-EXPEDITIONS-V04.md) records the implemented region graph, reusable groups, optional Surveillance, mission provisions/risk and one-category carrying capacity. Named residents and actual target assets move through Simulation Core commands; the player UI is /play and Gameplay Lab retains shared-save debugging.
