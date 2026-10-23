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

## Physical Pillage adapter (#150)

[Spatial missions v0.4D](../../ISLAND-MISSIONS-V04D.md) connects the existing Pillage rules to the single saved island rival. A group must return from Explore and leave home on a separate confirmed mission. Normal cost is 5 Food per member for 500 ticks, adjusted by existing weather. The real land round trip must fit that duration. A dated Recon opportunity is required; Surveillance remains optional and is only available after a CPU clan has been identified. The existing one-category-per-survivor limits, actual target debits, mortality and identity transfers remain in force. CPU raids and tactical combat are not introduced.

## RAID-004 — Personal Weapon and Shield (#221)

New Pillage dispatches snapshot actual named gear. Spears add at most 10 percentage points to the unchanged 60% baseline according to the equipped share; wooden/leather shields reduce only their own wearer's casualty probability by 25%/40% respectively. Surviving owners retain gear; away deaths lose it permanently. Recon, Surveillance, Food costs and historical unsnapshotted missions retain their rules. See [Smithery v0.1](../SMITHERY-V01.md) for the owner-approved calibration, save and transfer contracts.
