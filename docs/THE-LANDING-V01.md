# The Landing v0.1 — Starting Situation

Issue #32 introduces `createCampaign(seed, landingOverrides?, mechanicsOverrides?)` through `src/simulation/SimulationCore.ts`. Unlike the earlier three-person settlement fixture, this creates a new campaign at Winter 800 with no permanent buildings. The existing `createFixtureClan` and `createSettlement` APIs retain their replay behavior.

## Founding party

Ten founders are generated with the existing CharacterDNA and naming systems. A named deterministic random stream sets their ages, composition and prior work experience independently of future simulation RNG draws. Every founder is 18–40 Winters old; there are at least four women and four men. Traits, heritage, names, ages, occupations and experience vary with seed. Founders have no preset partners/parents and each initially occupies a separate tent household. Occupations use productive Food/craft roles and carry zero to five complete Winters of prior experience, constrained by adult work age. Initial assignments are autonomous; explicit player assignment sets the existing occupation lock.

This is a generated party, not a fixed cast. Seed and saved state reproduce it exactly. Food/Materials assignments and house construction use the same simulation mechanics as later play, including the existing tent-productivity modifier.

## Saved prototype defaults

| Setting | Default |
|---|---:|
| Initial Food | 30 |
| Initial Materials | 5 |
| Founding longships | 1 |
| Longship salvage Materials | 20 |
| Founding cattle | 2 cows + 1 bull |
| Founding cattle age | 3 Winters (adult founding stock) |
| Cattle adult age | 2 Winters |
| Adult cattle consumption | 1 Food per animal per Winter |
| Calf consumption | 0 Food per Winter (prototype, below adult consumption) |
| Adult cow output | 4 Food per Winter |
| Bull output | 0 |
| Exposed output | 50%; consumption remains 100% |
| Slaughter yield | 15 Food per animal |
| Farmyard construction | 10 Materials |
| Farmyard capacity | 4 living cattle, soft cap |
| Farmyard upkeep/debt/salvage | Existing base-building rules: 1 Materials upkeep; collapse at debt 3; 50% invested Materials salvage |

Food/Materials, salvage, cattle rates, adult threshold, exposure modifier, slaughter and Farmyard cost/capacity are stored in `landing.config` and configurable. They are explicit prototype values, not final balance. Founding ages/composition are this generator's viability guardrails.

Cattle start unsheltered and immediately participate in the first simulated Winter. Output accumulates per tick as integer progress and produces only whole Food units. Consumption occurs at the same Winter boundary as resident consumption; keeping the game closed does not advance either system. Cattle consume first, then resident Food is consumed, followed by upkeep and social mechanics. Birth/career stock-need queries include cattle's next-Winter consumption. Shortfalls are factual events; this issue does not add starvation or natural mortality.

## Assets, commands and history

All commands go through `applyCommand` and return detached, validated state:

- `KeepLongship {longshipId}`: preserve the vessel and gain no Materials. Keeping it does not prevent a later salvage decision.
- `SalvageLongship {longshipId}`: gain the saved configured Materials once, mark the vessel permanently salvaged, disable maritime capability while no live ships exist. No replacement is created.
- `SlaughterCattle {cattleId}`: gain the saved configured Food once; the animal stops output/consumption and releases shelter occupancy.
- `EstablishFarmyard`: build a new Farmyard if affordable and shelter currently unsheltered living cattle. Creates no animals.
- Existing occupation, household housing and other Simulation Core commands remain available.

Ship and cattle identity records survive removal from the living asset set, retaining salvage/death Winter for history and save/load. `landingSummary(state)` reports founding counts, current stocks, live ship/cattle counts, maritime capability, unsheltered cattle and per-Farmyard occupancy/capacity/overcrowding. It is a headless query for the later Gameplay Lab; no clickable UI is added here.

The landing Region starts with `settledByClanId: null`; establishing permanent house/Farmyard infrastructure records the founding clan. This is a starting-state marker, not a Region Graph implementation.

Events include `FoundingPartyLanded`, `FoundingLongshipKept`, `FoundingLongshipSalvaged`, `FarmyardEstablished`, `CattleSlaughtered`, `CattleFoodProduced` and `CattleFoodConsumed`, alongside existing maintenance/collapse and persona events. The landing event names founding identities and starting stocks. Events carry facts and game time; narrative text remains outside this issue.

## Farmyard soft cap

Capacity does not reject excess cattle and does not automatically expel them. All assigned cattle receive sheltered output; occupancy and `max(0, occupants - capacity)` are derived from saved living cattle assignments and saved capacity. Overcrowding will increase animal mortality when that mechanic is introduced. **No mortality rate or random deaths are introduced in #32**, as agreed. A collapsed Farmyard clears cattle shelter assignments, restoring exposed output from subsequent ticks. Existing debt-reset and salvage rules apply.

There is no livestock reproduction, herd movement, pillage, farm upgrade animal spawning, weather, maritime expedition implementation or final balancing in this issue. These remain future mechanics. No separate animal CharacterDNA model is introduced.

## Verification

```text
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/qa/run-landing.mjs
```

The landing scenarios prove generation/save identity, keep/salvage exclusivity, exposed cow output/full cattle consumption, soft-cap shelter without spawning, slaughter, invalid-state rejection, collapse exposure and fifty-Winter replay with partial ticks/save-resume and forbidden wall-clock randomness.
