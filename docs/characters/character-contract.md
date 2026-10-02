# Canonical Character Contract v1

This is the shared character system contract, used by Character Lab and World.
Extend it deliberately; do not create a separate world rig, DNA format or fit path.

| Layer | Owns | Source |
|---|---|---|
| CharacterDNA v1 | Persistent seed, age, traits, heritage, authored morphology and appearance clearance | `src/characters/CharacterDNA.ts` |
| VisualProfile | Derived morphology, colour, life stage, seeded appearance and movement values; never persisted as DNA | `UniversalHumanProfile.ts`, `generatePhenotype.ts` |
| PillagersHumanRig | Stable bone names, morph targets and Idle/Walk/Run clips | `CharacterContract.ts`, published body GLBs |
| Attachment & Fit | Sockets, landmarks, cages, coverage and conform/drape/rigid fitting | [Attachment & Fit Contract](../CHARACTER-ATTACHMENT-FIT-CONTRACT.md) |
| Appearance modules | Registry metadata and reviewed reference geometry | [Asset registry](asset-registry.md) |
| CharacterInstance | Independently owned bones, inverse binds, mixer, materials and equipped modules | `UniversalHuman.ts`, constructed by `CharacterFactory.ts` |

Geometry uses metres, +Y up and +Z front. The body origin is on the ground between
the feet. The neutral authored rig is approximately 1.8m; runtime morphology and
the caricature presentation determine actual height. Head modules use their
recorded measured source frame, then the #15 canonical cages. Socket names and
bone/morph names are compatibility contracts and must not be casually renamed.
The World intentionally renders one body at LOD2, without head modules; Lab uses
the same factory/rig with appearance. Different rendering budgets do not change DNA.

## DNA v1

Keep the existing nested shape; issue #16 does not change its meaning:

```json
{
  "schemaVersion": 1,
  "seed": 1983,
  "sex": "male",
  "age": 32,
  "traits": {"physicality": 0.55, "agility": 0.55, "intelligence": 0.55, "cunning": 0.4, "temperament": 0.4},
  "heritage": {"scandinavian": 0.5, "angloSaxon": 0.2, "gaelic": 0.15, "finnic": 0.05, "sami": 0.05, "baltic": 0.05}
}
```

| Field | Canonical range/meaning |
|---|---|
| `schemaVersion` | Integer 1; missing/0 is the legacy import format |
| `seed`, `naming.seed` | Unsigned 32-bit integer, 0–4294967295; no string seeds |
| `age` | 0–100 years; Lab slider starts at 6; younger render profiles use the youngest growth landmark |
| Five `traits` | 0–1; Physicality remains for compatibility and movement/occupation scores, with anatomical deformation disabled |
| `heritage` | Six known nonnegative weights; importer normalizes them, fills missing shares and uses equal shares for a zero total |
| `morphology.masculinity` | 0–1, exactly 0.5 forbidden; below/above 0.5 derives female/male; UI steps skip 50% |
| `morphology.height` | Adult target height, 1.16–1.60 metres; absent values use the deterministic seeded profile |
| `appearanceFit` | Hair 1–1.3; beard 0.75–1.5; clothing 1–1.3; omission means 1 for each |
| `naming` | Optional dominant heritage culture and independent unsigned variation seed |

`characterRanges` and `appearanceFitLimits` own these ranges. Do not add a second
`heightScale` DNA field. Growth and rendered scale are derived values. Shape of
head/hands/feet remains rigid; child growth may uniformly scale hands/feet.
Hair and beard are assigned by profile, with beard restricted to males aged 18+.

Call `deserializeCharacterDNA` for JSON, `parseCharacterDNA` for objects and
`serializeCharacterDNA` for every DNA JSON export. Import validates before assigning
the current character. Unknown/future versions and invalid fields produce clear
errors; they are never silently accepted. Unknown extra top-level fields are not
retained. The explicit migration table currently upgrades legacy v0 to v1 without
changing identity or anatomy. Add a migration and regression fixtures before
changing the schema version. Do not recompute seeds during migration.

## Golden Characters

`GoldenCharacters.ts` stores 12 permanent fixtures independent of interactive
defaults and fit presets: neutral, feminine, masculine, agile, short, tall, older,
child, overweight, underweight, legacy Physicality and a reported extreme mixed
female. Each has a stable id, fixed DNA/seed and label. The stored fixtures are
deeply frozen; `goldenCharacterDNA(id)` returns an editable independent copy.
Load them in Lab → Attachment & Fit debug → Golden Character, or use the same
data in validation scripts. Changes to fixtures should be deliberate compatibility
decisions, not a side effect of tuning the current Lab selection.

Run `npm run validate:characters` before integrating changes. See the
[registry and validation workflow](asset-registry.md) for automatic checks and
the remaining visual review.
