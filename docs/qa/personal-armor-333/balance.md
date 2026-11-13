# Personal armor matched-cohort balance - #333

Owner-approved playtest values, 13 November 2026. Source implementation commit: 99a254fa6eee76c401981b795b32f20d801c6eae;
algorithm fingerprint: 8279c843025d7934bc9daecaccb8a85ba084838db351115ae749353a7f6789cc.

The same named wearer (MaelColuim) and unchanged unarmed ally
(Kauppi) use 128 explicitly recorded matched uint32 seeds.
The existing public randomUint generator creates that reproducible seed schedule from 0x333224.
All seven item stocks come from real public crafting, finite extraction and eligible slaughter;
selectors grant nothing. Each trial uses actual Core dispatch and one-tick legacy return.
Production/mission timing is explicitly accelerated. This bounded cohort is not final physical
combat, performance or device acceptance.

Legacy success is **additive and averaged**: one wooden spear in this two-person crew raises
60% to 65%; one iron spear raises it to 67.5%. If every crew member holds one, the same formula
gives 70%/75%. On-site attacks instead multiply the actual holder's 250 bps action by 1.10/1.15,
yielding 275/287 bps. No legacy success bonus is applied a second time to on-site combat.

Protection combines actual wearer factors once. Armor plus helmet yields 28% reduction without
a shield, 46% with wood, 56.8% with leather, and 60% capped with iron. A conservative **CEIL on
minimum remaining risk** enforces the 60% cap even for tiny nonzero chances. A saved custom
shield above 60% remains unchanged without armor; its unsupported armor combination is rejected
explicitly.

| Wearer loadout | Derived wearer casualty | Observed wearer deaths | Unchanged ally deaths | Derived crew success | Observed successes |
| --- | ---: | ---: | ---: | ---: | ---: |
| unarmed-unprotected | 10.00% | 18/128 | 17/128 | 60.00% | 82/128 |
| woodenSpear/no-shield/none | 10.00% | 18/128 | 17/128 | 65.00% | 86/128 |
| woodenSpear/no-shield/body | 8.00% | 14/128 | 17/128 | 65.00% | 86/128 |
| woodenSpear/no-shield/helmet | 9.00% | 16/128 | 17/128 | 65.00% | 86/128 |
| woodenSpear/no-shield/both | 7.20% | 13/128 | 17/128 | 65.00% | 86/128 |
| woodenSpear/woodenShield/none | 7.50% | 13/128 | 17/128 | 65.00% | 86/128 |
| woodenSpear/woodenShield/body | 6.00% | 11/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/woodenShield/helmet | 6.75% | 12/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/woodenShield/both | 5.40% | 11/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/leatherShield/none | 6.00% | 11/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/leatherShield/body | 4.80% | 9/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/leatherShield/helmet | 5.40% | 11/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/leatherShield/both | 4.32% | 6/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/ironShield/none | 5.00% | 9/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/ironShield/body | 4.00% | 6/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/ironShield/helmet | 4.50% | 7/128 | 17/128 | 65.00% | 87/128 |
| woodenSpear/ironShield/both | 4.00% | 6/128 | 17/128 | 65.00% | 87/128 |
| ironSpear/no-shield/none | 10.00% | 18/128 | 17/128 | 67.50% | 89/128 |
| ironSpear/no-shield/body | 8.00% | 14/128 | 17/128 | 67.50% | 89/128 |
| ironSpear/no-shield/helmet | 9.00% | 16/128 | 17/128 | 67.50% | 89/128 |
| ironSpear/no-shield/both | 7.20% | 13/128 | 17/128 | 67.50% | 89/128 |
| ironSpear/woodenShield/none | 7.50% | 13/128 | 17/128 | 67.50% | 89/128 |
| ironSpear/woodenShield/body | 6.00% | 11/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/woodenShield/helmet | 6.75% | 12/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/woodenShield/both | 5.40% | 11/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/leatherShield/none | 6.00% | 11/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/leatherShield/body | 4.80% | 9/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/leatherShield/helmet | 5.40% | 11/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/leatherShield/both | 4.32% | 6/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/ironShield/none | 5.00% | 9/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/ironShield/body | 4.00% | 6/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/ironShield/helmet | 4.50% | 7/128 | 17/128 | 67.50% | 90/128 |
| ironSpear/ironShield/both | 4.00% | 6/128 | 17/128 | 67.50% | 90/128 |

The ally's exact casualty seed set is asserted equal across every profile. Each canonical trial
consumes exactly two casualty rolls plus one success roll when anyone survives. Different gear
may legitimately prevent an all-dead outcome and therefore retain the existing success roll;
it adds no independent armor roll. Separate 100-seed no-iron/no-armor regression tests preserve
old snapshot bytes, outcomes and RNG.

The on-site columns in the JSON are analytical evaluations of the shared public functions.
The actual reached on-site four-slot, loss and interrupted-save journeys are covered separately
by tests/personal-armor-encounter.test.mjs. This report does not replace those journeys or
physical iPhone acceptance. Reproduce with:

    node scripts/calibrate-personal-armor.mjs 128
