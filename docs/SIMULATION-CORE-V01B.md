# Simulation Core v0.1B

Issue #27 adds headless economy, housing, careers and family mechanics. Use `createSettlement(seed, overrides?)`, `applyCommand`, `advanceWinter`, `personaAge`, `serializeState` and `reconstructState` from `src/simulation/SimulationCore.ts`. Each operation returns detached state. No renderer, browser timer, offline advancement or unseeded randomness participates.

## Calendar and ordering

A Winter contains 1,000 ticks. `AdvanceWinter` advances exactly 1,000 ticks, including from a partial Winter. Each tick accumulates integer work and emits whole resource units. At the boundary: finish production, advance the calendar and emit `WinterAdvanced`, consume Food, maintain/collapse buildings, review careers, form partnerships, resolve births, then resolve caregivers. Current age always derives from `birthWinter`; `dna.age` remains an identity snapshot.

## Confirmed prototype defaults

All balance settings live in the saved `mechanics.config`; these are explicit configurable prototype assumptions, not final balance.

| Rule | Default |
|---|---|
| Work / adulthood | From 16 / from 18 Winters |
| Food consumption | 1 per living persona under 16; 2 from 16 inclusive |
| Base output | Farmer, fisher, hunter: max 10 Food per Winter; craft occupations: max 5 Materials |
| Herder / trader | Valid career/history roles; no output while cattle/trade are out of scope |
| Aptitude | 15% floor + 85% weighted distance fit against CharacterDNA traits |
| Apprenticeship | One capped +10% bonus after a parent completes 1,000 ticks in that role |
| Aging | 100% through 49; -2 percentage points per Winter from 50; floor 50% |
| Career change | 75% productivity for exactly 1,000 ticks; progress retained separately per role |
| Career autonomy | Every 5 Winters; actual stock need, at least 10 percentage points better fit, plus 1 point retention per full Winter of current-role experience |
| Tent productivity | 50% |
| House construction | Immediate, 10 Materials |
| Occupancy | One household per residence/building; no member capacity limit yet |
| Upkeep | Occupied house: 1 Materials plus upgrade level per Winter; vacancy costs no upkeep |
| Maintenance debt | Vacancy or unpaid upkeep adds one; paid upkeep clears debt; collapse on third |
| Salvage | 50% of total construction and upgrade investment, rounded down |
| Upgrades | Three levels costing 5 / 10 / 20 Materials; matching occupation +25% / +50% / +75% |
| Specialization change | Free; upgrades retained; bonus applies only to matching work |
| Partnerships | Eligible unpartnered adults, opposite sex in this prototype; 10% per eligible pair per Winter |
| Fertility | Partnered female aged 18–40 inclusive; 25% annual chance; sufficient Food for next Winter |
| Birth cooldown | Two complete Winters: birth at 801 permits the next birth at 804 |
| Childcare | Five complete Winters of zero maternal work; later births reset the endpoint |
| Caregiver | Adult female with no occupation or conflicting childcare; one donor per mother's group; may live elsewhere |
| Caregiver opportunity cost | Zero work; fertility blocked for any Winter she served, even if replaced before its boundary |
| Trait inheritance | Parental mean; each trait independently has 25% chance to copy a seeded chosen parent's value |
| Dominant marker | Records the source parent for this child only; not propagated as a marker |

`Mechanics.ts` records the five-element weight/preference vectors for each prototype occupation in CharacterDNA trait order. Heritage affects inherited identity, not occupation fit. Heritage is the normalized parental mean; newborn sex and inheritance choices use the saved deterministic RNG.

Children, including adult children, remain in the parental household until partnership forms a new household. New households prefer a vacant house, otherwise build if affordable, otherwise live in a tent. A future capacity rule can be introduced separately. There is no age-triggered eviction.

Close-kin restrictions exclude parent/child, grandparent/grandchild, siblings including half-siblings, and aunt/uncle with niece/nephew. First cousins are allowed. Reconstruction rejects prohibited and nonreciprocal partnerships and invalid parent chronology.

## Player commands

`AssignOccupation` sets a persistent player lock, including explicit unemployment (`occupation: null`). `ReleaseOccupation` restores career autonomy. `AssignCaregiver` replaces autonomous choice; `caregiverId: null` locks care back to the mother. `AssignResidence` moves a household; a null residence selects its tent. `HouseHousehold` performs housing priority; `BuildHouse` explicitly builds. `SpecializeBuilding` and `UpgradeBuilding` control specialization/upgrades. Invalid commands fail atomically without changing the supplied state.

Automatic caregiver selection chooses the first eligible persona in sorted ID order. A care group expires at its endpoint and clears its caregiver lock. Caregiver participation is persisted so save/load cannot restore fertility within a Winter already spent caring.

## Save compatibility and scope

Existing v0.1A saves and `createFixtureClan` retain their time/history-only behavior. New settlements explicitly enable the versioned `mechanics` extension of schema 1. Mechanics records, integer stocks/progress, configuration bounds, household membership, building debt, genealogy and caregiver assignments are validated on save/load and advancement. No silent migration enables a new economy in a legacy replay.

Food shortage emits a shortfall and blocks births; it does not invent mortality. Natural mortality, UI integration, regions, raids, weather, cattle, trade and final balancing remain outside #27. A fifty-Winter run can therefore contain very old living personas.

## Verification and QA

Run from the repository root:

```text
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/qa/run-simulation-v01b.mjs
```

The QA runner starts ten personas at Winter 800 with seed 27, 100 Food and 100 Materials, one shared house, one farmer and one farm upgrade. These generous stocks are a QA fixture, not the normal starting balance. Fifty Winters exercise production, autonomous careers, partnerships, births, housing, upkeep and collapse. It compares repeat runs, 137/863 split ticks and a save/reload at Winter 825. Raw report and final save are generated in `artifacts/qa/simulation-v01b/`.
