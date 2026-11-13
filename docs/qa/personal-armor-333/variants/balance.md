# Four-variant personal armor matched cohort — #333

Owner-approved additional trial values: Leather Helmet 5%; Iron-reinforced Body
Armor 30%. Original Leather Body Armor 20%, Iron Helmet 10% and all shield values
remain unchanged. Total personal protection remains capped at 60%.

Implementation fingerprint: 2a6339e5f7707953d33b66db1950b45839fd18861f2c631b88cea20fa785e22b. Implementation commit: eb73baee671534fa105be05a1e000ff6457b1e36; these results do not accept
later code changes or physical-device fitting.

The same named wearer and unchanged unarmed ally use 64 recorded matched
uint32 seeds from the existing randomUint schedule (initial state 0x333224).
An Iron-tipped Spear is held constant. All 36 combinations of four shield choices,
three body choices and three helmet choices use actual public Core dispatch/return.
No annual economy boundary is crossed during each explicitly one-tick trial.

All nine products are genuinely crafted: 25 Materials, 6 Hides and 7 Iron Ore.
The fast fixture explicitly yields 2 Hides per eligible actual slaughter (three
animals); the shipped yield stays 1. The player-review save uses the same explicit QA yield,
with three actual animals and six genuinely paid recipe Hides. Finished inventory is never injected.

| Wearer loadout | Derived wearer casualty | Observed wearer deaths | Unchanged ally deaths | Derived crew success | Observed successes |
| --- | ---: | ---: | ---: | ---: | ---: |
| no-shield/no-body/no-helmet | 10.00% | 11/64 | 10/64 | 67.50% | 43/64 |
| no-shield/no-body/leatherHelmet | 9.50% | 10/64 | 10/64 | 67.50% | 43/64 |
| no-shield/no-body/ironHelmet | 9.00% | 10/64 | 10/64 | 67.50% | 43/64 |
| no-shield/leatherBodyArmor/no-helmet | 8.00% | 9/64 | 10/64 | 67.50% | 43/64 |
| no-shield/leatherBodyArmor/leatherHelmet | 7.60% | 9/64 | 10/64 | 67.50% | 43/64 |
| no-shield/leatherBodyArmor/ironHelmet | 7.20% | 8/64 | 10/64 | 67.50% | 43/64 |
| no-shield/ironBodyArmor/no-helmet | 7.00% | 8/64 | 10/64 | 67.50% | 43/64 |
| no-shield/ironBodyArmor/leatherHelmet | 6.65% | 8/64 | 10/64 | 67.50% | 43/64 |
| no-shield/ironBodyArmor/ironHelmet | 6.30% | 8/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/no-body/no-helmet | 7.50% | 8/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/no-body/leatherHelmet | 7.12% | 8/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/no-body/ironHelmet | 6.75% | 8/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/leatherBodyArmor/no-helmet | 6.00% | 8/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/leatherBodyArmor/leatherHelmet | 5.70% | 8/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/leatherBodyArmor/ironHelmet | 5.40% | 8/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/ironBodyArmor/no-helmet | 5.25% | 7/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/ironBodyArmor/leatherHelmet | 4.98% | 6/64 | 10/64 | 67.50% | 43/64 |
| woodenShield/ironBodyArmor/ironHelmet | 4.72% | 5/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/no-body/no-helmet | 6.00% | 8/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/no-body/leatherHelmet | 5.70% | 8/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/no-body/ironHelmet | 5.40% | 8/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/leatherBodyArmor/no-helmet | 4.80% | 6/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/leatherBodyArmor/leatherHelmet | 4.56% | 5/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/leatherBodyArmor/ironHelmet | 4.32% | 4/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/ironBodyArmor/no-helmet | 4.20% | 4/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/ironBodyArmor/leatherHelmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |
| leatherShield/ironBodyArmor/ironHelmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |
| ironShield/no-body/no-helmet | 5.00% | 6/64 | 10/64 | 67.50% | 43/64 |
| ironShield/no-body/leatherHelmet | 4.75% | 5/64 | 10/64 | 67.50% | 43/64 |
| ironShield/no-body/ironHelmet | 4.50% | 5/64 | 10/64 | 67.50% | 43/64 |
| ironShield/leatherBodyArmor/no-helmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |
| ironShield/leatherBodyArmor/leatherHelmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |
| ironShield/leatherBodyArmor/ironHelmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |
| ironShield/ironBodyArmor/no-helmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |
| ironShield/ironBodyArmor/leatherHelmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |
| ironShield/ironBodyArmor/ironHelmet | 4.00% | 4/64 | 10/64 | 67.50% | 43/64 |

The ally's exact casualty seed set is asserted equal across every loadout, and
all actual canonical RNG consumption is checked. Shared on-site risk/offense
columns in the JSON are analytical calculations, not an additional combat resolver.
Actual reached encounter, loss and save/replay tests run separately.

This bounded cohort tests direction, cap and conservation. It does not establish
fine casualty frequencies, every battle outcome, visual fit, or phone performance.
Earlier 33-loadout measurements remain unchanged historical evidence.

    node scripts/calibrate-personal-armor-variants.mjs 64
