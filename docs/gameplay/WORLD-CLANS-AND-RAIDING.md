# Pillagers — World, clans, reconnaissance and raiding

Status: design baseline for Game Simulator v0.2 and later.

## World abstraction

Do not start with a Civilization-style world grid.

The simulation world is a graph of economically and strategically distinct **Regions**, optionally containing meaningful **Sites**.

A Region may expose:
- farming potential;
- fishing potential;
- forestry / hunting potential;
- grazing potential;
- natural defense;
- travel connections/duration;
- occupying clan/settlement.

Possible Sites:
- settlement;
- forest/logging site;
- fishing grounds;
- grazing land;
- dock;
- later outpost/defensive site.

The 3D Fjord is a local presentation of a Region. The Simulation Core does not need individual trees, terrain triangles or world-scale tiles.

## Game Simulator v0.2

v0.2 introduces a second CPU clan plus reconnaissance and player-initiated pillaging.

The CPU clan uses the same underlying clan simulation as the player. It is not a simple `enemyStrength + loot` object.

A CPU clan has:
- personas / CharacterDNA;
- family and lineage;
- occupations and experience;
- Food and Materials;
- households/buildings;
- livestock once v0.3 exists.

### Controlled sequence

1. Simulate two clans independently.
2. Player sends reconnaissance.
3. Reconnaissance reveals imperfect/stale information about another Region/clan.
4. Player forms a raid party from real personas.
5. Raid resolves headlessly.
6. Real assets can transfer between clans.
7. Continue both simulations and observe persistent consequences.

CPU-initiated raids are deliberately later.

## No Knowledge resource

There is no abstract Knowledge stock.

Specialist knowledge lives in personas through occupation experience.

Example: taking/incorporating an experienced Blacksmith transfers that exact persona, including their age, CharacterDNA, origin, occupation history and experience. If the specialist dies before knowledge is socially transferred, the expertise may disappear from the clan.

## Pillage outcomes

Potential raid outcomes:
- Food;
- Materials;
- livestock;
- equipment/items later;
- real personas, including specialists and potential future household members.

Assets should transfer rather than appear from nowhere when they belong to the target clan.

A raid therefore changes both histories:
- the raider gains assets/personas but risks productive residents;
- the victim loses the exact resources, animals and people taken/killed.

## Later: CPU attacks and defense

After v0.2 proves player-initiated raids:
- CPU reconnaissance;
- CPU raids;
- watchtowers / earlier detection;
- palisades / defenses;
- named defenders;
- opportunity cost of sending productive personas away.

Settlement geography can influence natural defense and travel exposure.
