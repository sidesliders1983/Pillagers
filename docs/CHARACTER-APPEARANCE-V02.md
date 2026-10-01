# Character Appearance v0.2

This document records the durable appearance rules for the Universal Human / CharacterDNA pipeline used by Pillagers issue #8.

The goal is to keep hair colour, greying and later modular hair/beard rendering deterministic and data-driven, while preserving the existing rule that heritage shifts probabilities rather than acting as a rigid visual template.

## Hair-colour model

A character has a deterministic **base hair colour** derived from:

```text
heritage mix + character seed -> base hair shade
```

Heritage does not directly select a fixed colour. The six heritage profiles blend probability distributions, then the deterministic seed selects from the shared palette.

These are illustrative art-direction priors for the game, not empirical ethnicity/genetics claims. Every base shade remains possible for every heritage profile.

### Shared base palette

The current Character Lab palette is:

| ID | Visual description | Hex |
| --- | --- | --- |
| `light_ash` | light ash / dark blond | `#b8a079` |
| `medium_brown` | muted medium brown | `#786052` |
| `dark_brown` | dark brown / charcoal brown | `#49443f` |
| `auburn` | muted auburn / copper brown | `#986e55` |

The muted values are intentional and should remain compatible with the soft, desaturated Pillagers art direction.

### Heritage weighting

Current weights for the four shared shades are:

| Heritage | Light ash | Medium brown | Dark brown | Auburn |
| --- | ---: | ---: | ---: | ---: |
| Scandinavian | 35% | 34% | 20% | 11% |
| Anglo-Saxon | 26% | 39% | 22% | 13% |
| Gaelic / Celtic | 22% | 35% | 25% | 18% |
| Finnic | 32% | 34% | 25% | 9% |
| Sámi | 24% | 36% | 31% | 9% |
| Baltic | 28% | 36% | 26% | 10% |

For mixed heritage, blend these distributions by the normalized `HeritageMix` before the deterministic shade selection.

Do not create a separate hard-coded hair palette per heritage.

## Age-driven greying

Base hair colour belongs to the character's underlying phenotype and should remain stable as the character ages. Age then adds a second, derived greying layer.

### Rule

> Hair keeps its natural base colour through age 45. After age 45, every character gradually greys toward a shared light-grey elder colour.

Use this target elder shade:

```text
elder grey = #c2bcb3
```

The transition must be:

- zero before and at age 45;
- continuous rather than switching in discrete age bands;
- monotonic: increasing age must never make hair less grey;
- visibly gradual through later adulthood;
- predominantly light grey in the elder range;
- deterministic for the same character and age;
- independent of sex, masculinity/femininity and heritage.

The exact easing curve may be tuned visually during #8, but the start age and target colour are part of the durable appearance contract.

Conceptually:

```ts
const greyAmount = age <= 45
  ? 0
  : ageGreyCurve(age); // monotonic 0..1

hairColor = mixColor(baseHairColor, ELDER_GREY, greyAmount);
```

Do not replace the stored/base hair identity when ageing. A younger rendering of the same character should recover the same natural hair shade.

## Beard and moustache colour

When facial hair exists, it should originate from the same underlying base colour family and use the same age-driven greying factor unless a later dedicated beard-colour rule explicitly replaces this.

This prevents an elder character from having light-grey hair with an unrelated fully saturated young beard colour.

Hair/beard **style** and hair/beard **colour** are separate concerns:

```text
CharacterDNA / phenotype
  -> base hair colour
  -> age greying

CharacterVisualProfile
  -> hairStyleId
  -> beardStyleId
```

Changing a hairstyle must not reroll the character's hair colour.

## Character Lab requirements for #8

Character Lab should make this rule testable with the same character/seed at several ages.

Recommended comparison presets:

```text
age 30  -> natural base shade
age 45  -> natural base shade, no greying yet
age 55  -> visible early greying
age 70  -> clearly greyed
elder   -> predominantly light grey
```

When modular hair/beard meshes are active, they must receive the phenotype's resolved age-aware colour rather than carrying fixed material colours inside each module.

## Current implementation note

The v0.1 Character Lab already contains deterministic heritage-based hair shades and an age blend toward `#c2bcb3`, but that implementation begins greying before the rule recorded here and the exact palette/weights were previously documented only in code.

Issue #8 should align the implementation with this document: **greying starts only after age 45**, while preserving the character's deterministic underlying base shade.

## Design principle

> **Heritage shifts the probability of the natural base shade; seed creates the individual; age changes how that same colour presents over the character's lifetime.**
