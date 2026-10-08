# The Landing v0.1 — Starting Situation

Issue #32 introduces `createCampaign(seed, landingOverrides?, mechanicsOverrides?)` through `src/simulation/SimulationCore.ts`. Unlike the earlier three-person settlement fixture, this creates a new campaign at Winter 800 with no permanent buildings. The existing `createFixtureClan` and `createSettlement` APIs retain their replay behavior.

## Founding party

Ten founders are generated with the existing CharacterDNA and naming systems. A named deterministic random stream sets their ages, composition and prior work experience independently of future simulation RNG draws. Every founder is 18–40 Winters old; there are at least four women and four men. Traits, heritage, names, ages, occupations and experience vary with seed. Founders have no registered parents. Seeded existing couples share tent households; singles occupy individual tents. Occupations use farmer, fisher, hunter or woodworker roles and carry zero to five complete Winters of prior experience, constrained by adult work age. Initial assignments are autonomous; explicit player assignment sets the existing occupation lock.

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
| Farmyard conversion | Free; automatic in a permanent home with a farmer |
| Farmyard capacity | 4 living cattle, soft cap |
| Farmyard upkeep/debt/salvage | Existing base-building rules: 1 Materials upkeep; collapse at debt 3; 50% invested Materials salvage |

Food/Materials, salvage, cattle rates, adult threshold, exposure modifier, slaughter and Farmyard capacity are stored in `landing.config` and configurable. They are explicit prototype values, not final balance. Founding ages/composition are this generator's viability guardrails.

Cattle start unsheltered and immediately participate in the first simulated Winter. Output accumulates per tick as integer progress and produces only whole Food units. Consumption occurs at the same Winter boundary as resident consumption; keeping the game closed does not advance either system. Cattle consume first, then resident Food is consumed, followed by upkeep and social mechanics. Birth/career stock-need queries include cattle's next-Winter consumption. Shortfalls are factual events; this issue does not add starvation or natural mortality.

## Assets, commands and history

All commands go through `applyCommand` and return detached, validated state:

- `KeepLongship {longshipId}`: preserve the vessel and gain no Materials. Keeping it does not prevent a later salvage decision.
- `SalvageLongship {longshipId}`: gain the saved configured Materials once, mark the vessel permanently salvaged, disable maritime capability while no live ships exist. No replacement is created.
- `SlaughterCattle {cattleId}`: gain 5 Food for Young, 10 for Young Adult, or the saved configured adult yield (default 15 Food), once; the animal stops output/consumption and releases shelter occupancy.
- `AssignCattle {cattleId, farmyardId}`: assign one living animal to an active Farmyard home, or use null to unassign. Capacity is a soft cap.
- A permanent home automatically gains the Farmyard function when its first living farmer is assigned or moves in, including when a house is built for an existing farmer. There is no standalone Farmyard build command or additional conversion cost. A tent never gains the function. When the last farmer changes occupation or leaves, the function is lost and all assigned cattle are unassigned. The house and upgrades remain.
- Existing occupation, household housing and other Simulation Core commands remain available.

Ship and cattle identity records survive removal from the living asset set, retaining salvage/death Winter for history and save/load. `landingSummary(state)` reports founding counts, current stocks, live ship/cattle counts, maritime capability, unsheltered cattle and per-Farmyard occupancy/capacity/overcrowding. It is a headless query for the later Gameplay Lab; no clickable UI is added here.

The landing Region starts with `settledByClanId: null`; establishing permanent house infrastructure records the founding clan. This is a starting-state marker, not a Region Graph implementation.

Events include `FoundingPartyLanded`, `FoundingLongshipKept`, `FoundingLongshipSalvaged`, `FarmyardFunctionChanged`, `CattleAssigned`, `CattleSlaughtered`, `CattleFoodProduced` and `CattleFoodConsumed`, alongside existing maintenance/collapse and persona events. The landing event names founding identities and starting stocks. Events carry facts and game time; narrative text remains outside this issue.

## Farmyard soft cap

The function belongs to the occupied permanent home and depends on farmer presence. Conversion never assigns or creates cattle automatically. Capacity does not reject excess cattle and does not automatically expel them. All assigned cattle receive sheltered output; occupancy and `max(0, occupants - capacity)` are derived from saved living cattle assignments and saved capacity. Overcrowding will increase animal mortality when that mechanic is introduced. **No mortality rate or random deaths are introduced in #32**, as agreed. A collapsed home loses the Farmyard function and clears cattle shelter assignments, restoring exposed output from subsequent ticks. Existing debt-reset and salvage rules apply.

There is no livestock reproduction, herd movement, pillage, farm upgrade animal spawning, weather, maritime expedition implementation or final balancing in this issue. These remain future mechanics. No separate animal CharacterDNA model is introduced.

## Verification

```text
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/qa/run-landing.mjs
```

The landing scenarios prove generation/save identity, keep/salvage exclusivity, exposed cow output/full cattle consumption, soft-cap shelter without spawning, slaughter, invalid-state rejection, collapse exposure and fifty-Winter replay with partial ticks/save-resume and forbidden wall-clock randomness.

## Correction and save migration

The separately buildable Farmyard prototype is superseded by the confirmed household rule. Landing extension version 2 removes farmyardCost. Loading version-1 saves explicitly retires standalone Farmyard buildings, leaves resource stocks unchanged, unassigns affected cattle and retains all previous events plus a FarmyardModelMigrated event. No original JSON file is overwritten, and migration is applied once. New saves validate that every assigned animal references an active farmer home.

## Existing founding couples

After generating ten adult individuals, an independent seeded stream shuffles candidates and tries each disjoint eligible pair once using the normal adult/sex/kinship partnership rules. Default foundingCoupleChanceBps is 5000 and foundingCoupleCap is 3 (configurable from 0 to 3). This typically produces one or two couples, with zero and three valid outcomes. Founder identities do not change when these settings change.

Couples have reciprocal partnerId, one shared tent household and a family group; singles retain individual tents. FoundingPartnershipPresent records participants and household as relationships already present at arrival. It asserts no meeting/marriage date and does not emit PartnershipFormed. Existing saves receive missing config defaults without generating or changing their relationships.
