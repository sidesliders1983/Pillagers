# 07 — Raiding & Combat

## RAID-001 — Real raid parties
**Status:** Canonical direction

> **As a player, I want raid parties to consist of named residents, so that military action has economic, family and lineage consequences at home.**

Rules:
- raid party members are real personas;
- while away they do not perform normal settlement work;
- injuries/deaths/history persist;
- local raids may take a fraction of a Winter; distant expeditions may span Winters.

## RAID-002 — Assets transfer between clans
**Status:** Canonical direction

> **As a player, I want pillaging to take real assets from another clan, so that a raid permanently changes both communities.**

Rules:
- Food/Materials/livestock/personas transferred as loot are removed from target state and added to raider state;
- do not create owned target loot ex nihilo;
- consequences persist after the raid.

## RAID-003 — Expertise lives in people
**Status:** Canonical

> **As a player, I want incorporated specialists to retain their personal experience, so that acquiring people changes my clan through people rather than an abstract Knowledge resource.**

Rules:
- no Knowledge resource;
- transferred specialist remains the same persona with age, CharacterDNA, origin and occupation history;
- their former clan loses that persona.

Acceptance:
- Given Einar has 16 winters Smith experience in Clan B, when transferred to Clan A, then Clan A receives Einar with 16 winters Smith experience and Clan B no longer contains Einar; no Smithing Knowledge stock is created.

## COMBAT-001 — Headless first
**Status:** Canonical development direction

> **As a developer/player, I need combat decisions proven before expensive presentation work, so that combat mechanics drive 3D rather than being dictated by animations.**

Simulator v0.2 resolves player-initiated raids headlessly first. Tactical presentation/control may be layered later.

## COMBAT-002 — CPU raids deferred
**Status:** Canonical roadmap

Player-initiated raids come first. CPU reconnaissance/raids and defenses are a later step after persistent two-clan consequences work.

## Implemented v0.4 slice

[World Expeditions v0.4](../../WORLD-EXPEDITIONS-V04.md) records the implemented region graph, reusable groups, optional Surveillance, mission provisions/risk and one-category carrying capacity. Named residents and actual target assets move through Simulation Core commands; the player UI is /play and Gameplay Lab retains shared-save debugging.
