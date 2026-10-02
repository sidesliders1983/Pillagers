# Character Lab v0.1

Implements the original [Pillagers issue #2](https://github.com/sidesliders1983/Pillagers/issues/2). This document describes the Character Lab architecture and historical v0.1 implementation while aligning its design terminology with the current Pillagers game principles.

For current cross-cutting design authority, also read:

- `GAME-PRINCIPLES.md`
- `docs/GAMEPLAY-PRINCIPLES-V01.md`
- `docs/VIKING-OCCUPATIONS-AND-TERMINOLOGY.md`

Open `/character-lab` using the existing Vite development or production preview.

## Try it

1. Pin the default character as a comparison.
2. Increase Physicality: shoulders, torso and limbs widen for either sex. Reduce Agility to see a heavier build and movement tendency.
3. Reroll the seed: the five traits, age, sex and heritage stay unchanged while hidden identity details vary.
4. Change Intelligence or Cunning: face dimensions stay unchanged; behavioral tendencies and the lab's experimental work-fit scores update.
5. Change age: identity samples remain stable while hair, posture and physical movement tendencies respond to aging.
6. Adjust a heritage percentage: that percentage is retained and the other five shares scale proportionally.
7. Export or copy the JSON, randomize the character, then paste and apply the exported DNA to restore it exactly.

The preview supports mouse/touch orbit, conventional pinch and scroll zoom, Reset view and an elevated RTS view.

## Model boundary

`CharacterDNA` contains only an unsigned 32-bit seed, binary sex, numeric age, five traits in `[0,1]`, and six heritage weights. It does not contain an assigned occupation, progression state, clothes/rank, parents or a save-game schema.

Player-facing age should follow GP-001 and be shown in **winters**; age remains numeric internally.

`generatePhenotype(dna)` produces a plain object with no Three.js dependency. Named deterministic random streams keep existing microvariation stable when traits/age change or new fields are added. The same normalized DNA always generates the same phenotype under this model version. Model formula/profile changes in future releases can change the result; version a persistent generation schema before shipping save games.

- Physicality controls shoulder breadth, mass, limb thickness and posture.
- Agility controls lighter/slimmer proportions, limb ratios, movement weight, cadence and speed tendency. Age moderates those tendencies rather than resetting the trait.
- Intelligence influences a relative learning tendency; Cunning an opportunism tendency. Neither influences anatomy.
- Temperament influences idle pose tension and work-fit tendencies, without changing facial anatomy.
- The same trait equations apply to both sexes. Traits are never forced from sex.
- Age uses a deliberately simple growth/late-life modulation for the development model, not a calibrated growth or aging simulation.

## Heritage assumptions

The six heritage profiles are **illustrative designer priors, not empirical ethnicity or genetics models**. They currently shift categorical probabilities for appearance. Every supported shade remains possible in every profile, with substantial overlap. Facial dimensions are seeded microvariation rather than heritage templates. Heritage does not affect intelligence, other dispositions or occupation fit.

Mixtures are normalized to a sum of one. JSON import remains stricter than helper normalization and rejects malformed identity/trait data.

## Occupation fit — current implementation versus approved design

The original v0.1 lab implemented six experimental fit profiles in `occupationFit.ts`:

- Blacksmith
- Warrior
- Scout
- Trader
- Farmer
- Healer / Seer

These profiles were useful for proving that the five core traits could drive differentiated work tendencies, but **they are no longer the design authority for Pillagers occupations**.

The approved initial work categories are now:

1. **Farmer** — Boer / akkerbouwer
2. **Livestock keeper / herder** — Veehouder / herder
3. **Fisher** — Visser
4. **Hunter** — Jager
5. **Textile worker** — Textielmaker
6. **Smith** — Smid
7. **Woodworker** — Houtbewerker
8. **Boatbuilder** — Bootbouwer
9. **Trader** — Handelaar
10. **Leather and jewellery maker** — Leer- en juwelenmaker

The current six-profile code may remain temporarily as a historical prototype seam until the occupation system is deliberately updated. Do **not** treat Warrior, Scout or Healer / Seer as approved starting occupations merely because they still appear in old code or screenshots.

### Approved work model

A **resident** has skills and performs tasks. A displayed primary occupation summarizes their main skilled contribution but does not become an immutable class.

Therefore:

- residents may perform useful tasks outside their primary occupation;
- seasonal and emergency work can shift without changing identity;
- combat participation can be a temporary role rather than an occupation;
- construction can be a task performed by suitable residents rather than requiring a permanent Builder occupation;
- social status is separate from occupation.

Future work-fit should support the approved ten occupations and should eventually combine more than the five DNA traits alone.

Conceptually:

```text
core traits
+ learned skills
+ experience
+ age
+ availability
+ community demand
+ local opportunity
→ occupation suitability / preference
```

Poor fit must never mean impossible.

Potential effects of fit later include:

- likelihood of automatic occupation selection;
- learning speed;
- efficiency;
- mastery development;
- player-facing recommendation.

The full purpose/tasks/inputs/outputs for each occupation belong in the gameplay occupation spec, not in Character Lab.

## Terminology

Player-facing design uses:

- **settlement** for the physical place;
- **community** for the social group;
- **resident** for an individual living there;
- **household** for a domestic/economic unit;
- **family / kin group** for kinship.

`Persona` may remain development vocabulary. `Villager` may remain a legacy code/entity name until a separate code migration is justified; code names do not override the approved player-facing terminology.

## Pinned comparison

The pinned character is rendered beside the current one. Its DNA is a deep copy and stays unchanged when the current character is edited. Comparison markers in the fit UI are development aids, not final gameplay recommendations.

## Files

- `src/characters/CharacterDNA.ts`: types, defaults, normalization, percentage redistribution and validated import.
- `src/characters/seededRandom.ts`: named deterministic sample streams.
- `src/characters/heritageProfiles.ts`: overlapping art distributions and labels.
- `src/characters/Phenotype.ts`, `generatePhenotype.ts`: rendering-independent derivation.
- `src/characters/occupationFit.ts`: **legacy v0.1 experimental** weighted preference profiles and scores.
- `src/character-lab/CharacterLab.ts`: state and actions.
- `CharacterLabUI.ts`, `character-lab.css`: live controls, readouts and responsive layout.
- `CharacterPreview.ts`: Three.js staging and OrbitControls.
- `Mannequin.ts`: original neutral low-poly development visual.
- `tests/characters.test.mjs`: deterministic generation, normalization, trait and aging boundaries, overlapping profiles, occupation scoring and JSON validation.
- `scripts/character-lab-smoke.cjs`: desktop/mobile UI, JSON export, editing, comparison and preview checks.

The character architecture should preserve the separation:

```text
CharacterDNA
→ derived phenotype / visual profile
→ universal character runtime
→ optional appearance / occupation / history layers
```

Occupation, rank and personal history should remain separate from inherited base morphology.

## Validation and limits

Run `npm test` and `npm run build` for implementation work. The core model tests require no WebGL.

Character Lab is a development environment, not the gameplay occupation authority. Full simulation, heredity, families, occupation growth, community demand and save persistence are separate gameplay layers.

## Current design rule

> **Traits define tendencies; skills and experience define capability; community need creates opportunity; life history determines what a resident ultimately becomes.**
