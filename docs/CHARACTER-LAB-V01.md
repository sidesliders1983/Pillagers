# Character Lab v0.1

Implements [Pillagers issue #2](https://github.com/sidesliders1983/Pillagers/issues/2). Open `/character-lab` using the existing Vite development or production preview. The route also works on the LAN preview at `http://<computer-Wi-Fi-IP>:4175/character-lab`. A link is available in the world's controls.

## Try it

1. Pin the default character as a comparison.
2. Increase Physicality: shoulders, torso and limbs widen for either sex. Reduce Agility to see a heavier build and movement tendency.
3. Reroll the seed: the five traits, age, sex and heritage stay unchanged while hidden identity details vary.
4. Change Intelligence or Cunning: face dimensions stay unchanged; behavioral tendencies and occupation scores update.
5. Move age from 20 to 68: identity samples remain stable while hair greys, posture changes and physical movement tendency moderates.
6. Adjust a heritage percentage: that percentage is retained and the other five shares scale proportionally. If the others were all zero, the available remainder is distributed equally.
7. Export or copy the JSON, randomize the character, then paste and apply the exported DNA to restore it exactly.

The preview supports mouse/touch orbit, conventional pinch and scroll zoom, Reset view and an elevated RTS view. On mobile the preview comes first and the controls are below it. Scroll the page outside the canvas; gestures on the canvas manipulate the character view.

## Model boundary

`CharacterDNA` contains only an unsigned 32-bit seed, binary sex, age from 0 to 100, five traits in `[0,1]`, and the six heritage weights. It does not contain an assigned occupation, progression state, clothes/rank, parents or a save-game schema.

`generatePhenotype(dna)` produces a plain object with no Three.js dependency. Named deterministic random streams keep existing microvariation stable when traits/age change or new fields are added. The same normalized DNA always generates the same phenotype under this model version. Model formula/profile changes in future releases can change the result; version a persistent generation schema before shipping save games.

- Physicality controls shoulder breadth, mass, limb thickness and posture.
- Agility controls lighter/slimmer proportions, limb ratios, movement weight, cadence and speed tendency. Age moderates those tendencies rather than resetting the trait.
- Intelligence influences a relative learning tendency; Cunning an opportunism tendency. Neither influences anatomy.
- Temperament influences idle pose tension and occupation fit, without changing facial anatomy.
- The same trait equations apply to both sexes. The small baseline stature/hip differences overlap heavily with individual variation; traits are never forced from sex.
- Age uses a deliberately simple growth/late-life modulation for the mannequin, not a calibrated growth or aging simulation. Adult seed-derived facial proportions persist across aging.

## Heritage assumptions

The six heritage profiles are **illustrative designer priors, not empirical ethnicity or genetics models**. They currently shift categorical probabilities for hair, eye and skin shades. Every supported shade remains possible in every profile, with substantial overlap. Facial dimensions are seeded microvariation rather than heritage templates. Heritage does not affect intelligence, other dispositions or occupation fit.

Mixtures are normalized to a sum of one; missing weights become zero, negative/non-finite weights are sanitized by the normalization helper, and an entirely empty/zero helper input becomes an even six-way mix. JSON import is stricter: malformed/negative weights, unknown heritage keys and invalid identity/traits are rejected. The lab preserves the prior character when import fails. Display percentages are rounded to one decimal; full-precision normalized weights are exported.

## Occupation fit

Six profiles live in `occupationFit.ts`: Blacksmith, Warrior, Scout, Trader, Farmer and Healer / Seer. Each combines normalized trait weights with preferred values. Fit is the weighted closeness to those preferences, remapped to `[0.15,1]`, so a poor fit never forbids a profession. Values are designer scores, not probabilities or skill predictions. They ignore age, sex, heritage and seed; no occupation is assigned by the lab.

The pinned character is rendered beside the current one. Its DNA is a deep copy and stays unchanged when the current character is edited. Dark ticks in the fit bars show the pinned character's scores.

## Files

- `src/characters/CharacterDNA.ts`: types, defaults, normalization, percentage redistribution and validated import.
- `src/characters/seededRandom.ts`: named deterministic sample streams.
- `src/characters/heritageProfiles.ts`: overlapping art distributions and labels.
- `src/characters/Phenotype.ts`, `generatePhenotype.ts`: rendering-independent derivation.
- `src/characters/occupationFit.ts`: weighted preference profiles and scores.
- `src/character-lab/CharacterLab.ts`: state and actions.
- `CharacterLabUI.ts`, `character-lab.css`: live controls, readouts and responsive layout.
- `CharacterPreview.ts`: Three.js staging and OrbitControls.
- `Mannequin.ts`: neutral low-poly visual built solely from phenotype values; geometry/materials are disposed when replacing a visual.
- `tests/characters.test.mjs`: deterministic generation, normalization, trait and aging boundaries, overlapping profiles, occupation scoring and JSON validation.
- `scripts/character-lab-smoke.cjs`: desktop/mobile UI, real JSON export, editing, comparison and preview checks.

To replace the mannequin with a real Viking mesh, keep `CharacterDNA → generatePhenotype → Phenotype` and map phenotype values to that mesh's bones/morphs in a new visual adapter. A world `Villager` already accepts an injected visual; the current settlement placeholders are not replaced in this issue. Future occupation/rank/history appearance should be a separate layer on top of the base phenotype.

## Validation and limits

Run `npm test` and `npm run build`. The model tests require no WebGL. The optional browser script requires Playwright/Chromium installed separately; `PLAYWRIGHT_MODULE` may point to an existing package and `PROTOTYPE_URL` should be the origin without a trailing slash. Desktop and mobile screenshots go to `artifacts/character-lab-*.png`.

The lab loads no third-party scenery models and adds no dependencies. Its renderer is intentionally a development mannequin, not final character art, clothing or a morph/skeleton system. Hands/face/idle animation are simplified. Copy uses Clipboard API where available, with selected-text/manual copy fallback for HTTP LAN sessions. Full simulation, heredity, families, occupation growth and saves remain out of scope.

This workspace has no Git checkout and GitHub still reports an empty repository. The work is delivered in the local application; no assets were published and no issue, branch or PR was modified.
