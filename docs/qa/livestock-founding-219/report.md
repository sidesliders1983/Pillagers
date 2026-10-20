# Livestock v0.1B — founding and balance review

**Matrix complete. Balance and default activation await owner approval.**

The implementation supports one real seeded founding species per clan, independent of human DNA and terrain. Exactly two adult females and one adult male arrive; a single physical CPU rival chooses from the other five species. Shipping New campaign still uses the existing cattle contract. No new models are included; those remain #220.

## Evidence and reproducibility

Generated from verified raw evidence: 630/630 complete, 0 resource-limited, 0 failed, 0 missing. Maximum annual Food/Materials/herd accounting residual: 0.

The matrix is seeds 1–30 × current cattle control plus six species × three policies × 40 years, starting in Summer 800 (tick 500), with 1,000 ticks per year. The original frozen measurement revision is `fcf465d4dc836848b92a613e8bf5c987a80b33ac`. Each raw observation contains the actual source, adapter, policy, scenario and candidate hashes, saved rule configuration, founder fingerprint and final state hash. The resumed runner records its own revision separately and rejects changed protocols or corrupted evidence. Completed observations are never overwritten.

Player starts with 15 Food and five Materials. The actual CPU starts with its saved 30 Food and five Materials. Weather and social mechanics are enabled, using the existing annual birthday mode. Individual birthday timing is a separate opt-in and is not claimed to have been measured here. The dry QA island changes no economic rates; there are no expeditions or purchases.

Species are contrasted before the real founding event through a QA-only player-selection adapter. Production does not import it. CPU selection and economics use unchanged Core. Identical configurations and seeds do not guarantee identical realized weather: subsequent domestic RNG calls differ with species. Treat these as paired seed comparisons, not an isolated causal estimate of one coefficient.

Annual observations end at Summer tick 500; peaks below are observed year-end peaks, not claims about every intermediate tick. Human descendants reaching adulthood include those who later died. Young livestock feeding counts and base costs are recorded separately; their configured young Food need is zero. Canonical Core has no spoilage rule, so spoilage is explicitly zero.

Human Food shortfalls are recorded by the existing economy and affect its established reserve/fertility constraints. This slice adds no starvation-death rule. Low clan-extinction counts therefore cannot, by themselves, establish that Food balance is comfortable.

[Raw matrix and provenance](measurement-soft-v2-final/manifest.json) · [Derived full totals](measurement-soft-v2-final/summary.json) · [Complete proposed rules](proposed-rules.json) · [Interactive review](review.html)

## Reading the completed matrix

All six seeded-species cohorts completed 30/30 cases under each policy. Prepared play lost 0 clans; species medians ranged from 521 to 725 final Food and 4 to 5 human descendants reaching adulthood. This supports a workable 15-Food start under the measured preparation policy, not a promise of shortage-free play.

Long-term herd continuity is weaker. Under the fixed herd policy, pigs remain in 1/30 cases at year 40, compared with 5/30 current cattle controls. The proposed cattle guards reduce the observed unmanaged herd peak from 152 to 15. Do not treat reduced crowding growth as proof of a self-sustaining breeding herd.

## Player policy: passive

No player commands; existing social/economic autonomy continues.

| Species | Complete | Clan lost | Human shortage observed | First shortage year, median (range) | Final Food, median (range) | Descendants reached adulthood, median | Herd lost | Peak herd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current cattle control | 30/30 | 0/30 | 29/30 | 5 (2–34) | 41.5 (8–153) | 3 | 8/30 | 152 |
| Seeded cattle | 30/30 | 0/30 | 25/30 | 4 (2–25) | 53 (0–265) | 3.5 | 19/30 | 15 |
| Chicken | 30/30 | 0/30 | 28/30 | 3 (2–15) | 44.5 (0–235) | 3 | 26/30 | 93 |
| Pig | 30/30 | 0/30 | 29/30 | 2 (1–30) | 56 (0–390) | 2 | 30/30 | 12 |
| Sheep | 30/30 | 0/30 | 29/30 | 3 (1–39) | 51.5 (0–324) | 2 | 25/30 | 16 |
| Goat | 30/30 | 0/30 | 29/30 | 4 (2–39) | 47.5 (0–348) | 3 | 22/30 | 14 |
| Goose | 30/30 | 0/30 | 30/30 | 3 (1–30) | 51.5 (0–272) | 3 | 23/30 | 31 |

| Species | Food produced / animal share | Human / animal Food consumed | Animal Food required / shortfall | Slaughter Food | Materials produced | Hides received | Human births / deaths | Animal births / deaths / slaughters | Crowded animal-years |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current cattle control | 40372 / 12717 | 22959 / 16247 | 19270 / 3023 | 0 | 6181 | 0 | 110 / 118 | 2190 / 1100 / 0 | 0 |
| Seeded cattle | 30803 / 3086 | 25351 / 3762 | 3923 / 161 | 0 | 6252 | 0 | 137 / 106 | 368 / 435 / 0 | 3030 |
| Chicken | 31854 / 4382 | 24346 / 5788 | 6267 / 479 | 0 | 6068 | 0 | 126 / 96 | 687 / 679 / 0 | 1778 |
| Pig | 27750 / 0 | 23370 / 2384 | 2530 / 146 | 0 | 5896 | 0 | 83 / 103 | 199 / 289 / 0 | 1460 |
| Sheep | 29392 / 1352 | 23773 / 3674 | 3886 / 212 | 0 | 6752 | 0 | 85 / 104 | 250 / 327 / 0 | 2159 |
| Goat | 30546 / 2745 | 25034 / 3667 | 3844 / 177 | 0 | 6044 | 0 | 131 / 103 | 266 / 333 / 0 | 2044 |
| Goose | 31168 / 3219 | 23592 / 5792 | 6322 / 530 | 0 | 5815 | 0 | 123 / 110 | 472 / 497 / 0 | 915 |

## Player policy: prepared

The frozen #78 Food/housing policy, with livestock assignments disabled.

| Species | Complete | Clan lost | Human shortage observed | First shortage year, median (range) | Final Food, median (range) | Descendants reached adulthood, median | Herd lost | Peak herd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current cattle control | 30/30 | 0/30 | 19/30 | 3 (2–28) | 419 (34–1161) | 5 | 7/30 | 289 |
| Seeded cattle | 30/30 | 0/30 | 14/30 | 3 (2–19) | 691.5 (256–1151) | 5 | 18/30 | 15 |
| Chicken | 30/30 | 0/30 | 22/30 | 3 (2–24) | 521 (56–966) | 5 | 23/30 | 90 |
| Pig | 30/30 | 0/30 | 23/30 | 3 (2–9) | 546 (137–993) | 4 | 28/30 | 12 |
| Sheep | 30/30 | 0/30 | 18/30 | 3.5 (2–10) | 725 (332–1213) | 4 | 25/30 | 16 |
| Goat | 30/30 | 0/30 | 19/30 | 5 (2–16) | 646 (271–1063) | 4.5 | 22/30 | 16 |
| Goose | 30/30 | 0/30 | 24/30 | 3.5 (2–26) | 600.5 (56–1051) | 4.5 | 20/30 | 43 |

| Species | Food produced / animal share | Human / animal Food consumed | Animal Food required / shortfall | Slaughter Food | Materials produced | Hides received | Human births / deaths | Animal births / deaths / slaughters | Crowded animal-years |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current cattle control | 67664 / 16300 | 31548 / 22808 | 23305 / 497 | 0 | 7832 | 0 | 237 / 91 | 2922 / 1263 / 0 | 0 |
| Seeded cattle | 55583 / 2923 | 31876 / 3632 | 3658 / 26 | 0 | 8414 | 0 | 236 / 98 | 405 / 460 / 0 | 3082 |
| Chicken | 55088 / 6077 | 30870 / 9045 | 9199 / 154 | 0 | 7517 | 0 | 212 / 85 | 1089 / 983 / 0 | 3574 |
| Pig | 49165 / 0 | 29878 / 2253 | 2314 / 61 | 0 | 7876 | 0 | 211 / 103 | 197 / 285 / 0 | 1297 |
| Sheep | 56598 / 1306 | 31449 / 3811 | 3852 / 41 | 0 | 9918 | 0 | 225 / 87 | 294 / 357 / 0 | 2279 |
| Goat | 53808 / 2613 | 30721 / 4032 | 4112 / 80 | 0 | 8344 | 0 | 205 / 95 | 309 / 373 / 0 | 2509 |
| Goose | 55899 / 4055 | 30795 / 8193 | 8237 / 44 | 0 | 8013 | 0 | 204 / 93 | 755 / 657 / 0 | 2897 |

## Player policy: herd

The same preparation plus real herd assignment and slaughter. Compatible sexes remain together in one actual Farmyard where available. Mature breeders and young replacements take priority over surplus adults. This fixed strategy is not an optimal breeder or new automatic gameplay.

| Species | Complete | Clan lost | Human shortage observed | First shortage year, median (range) | Final Food, median (range) | Descendants reached adulthood, median | Herd lost | Peak herd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current cattle control | 30/30 | 0/30 | 10/30 | 2.5 (2–27) | 722.5 (317–1271) | 6 | 25/30 | 7 |
| Seeded cattle | 30/30 | 0/30 | 10/30 | 2.5 (2–27) | 765.5 (317–1271) | 6 | 26/30 | 7 |
| Chicken | 30/30 | 0/30 | 16/30 | 3 (2–23) | 797.5 (507–2351) | 5 | 20/30 | 48 |
| Pig | 30/30 | 0/30 | 20/30 | 3 (2–21) | 606.5 (37–1081) | 5 | 29/30 | 7 |
| Sheep | 30/30 | 0/30 | 12/30 | 2.5 (2–16) | 937.5 (569–1489) | 6 | 16/30 | 8 |
| Goat | 30/30 | 0/30 | 10/30 | 3 (2–5) | 791 (366–1570) | 5.5 | 22/30 | 8 |
| Goose | 30/30 | 0/30 | 14/30 | 3 (2–14) | 873.5 (164–1758) | 5 | 18/30 | 25 |

| Species | Food produced / animal share | Human / animal Food consumed | Animal Food required / shortfall | Slaughter Food | Materials produced | Hides received | Human births / deaths | Animal births / deaths / slaughters | Crowded animal-years |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current cattle control | 56780 / 4424 | 34008 / 2408 | 2410 / 2 | 2090 | 8129 | 0 | 265 / 85 | 224 / 101 / 200 | 663 |
| Seeded cattle | 56408 / 4439 | 33856 / 2417 | 2428 / 11 | 2095 | 8238 | 74 | 265 / 89 | 230 / 102 / 205 | 691 |
| Chicken | 66303 / 15924 | 32239 / 8351 | 8386 / 35 | 2184 | 7827 | 0 | 253 / 112 | 1706 / 388 / 1092 | 1510 |
| Pig | 50179 / 0 | 31723 / 1694 | 1716 / 22 | 1659 | 8013 | 62 | 237 / 107 | 145 / 100 / 134 | 424 |
| Sheep | 61523 / 2827 | 33188 / 3354 | 3359 / 5 | 2866 | 11137 | 267 | 266 / 96 | 357 / 95 / 320 | 712 |
| Goat | 58657 / 5400 | 33237 / 3130 | 3134 / 4 | 2536 | 8243 | 238 | 275 / 94 | 312 / 102 / 280 | 597 |
| Goose | 61937 / 9866 | 31511 / 7336 | 7354 / 18 | 4865 | 8300 | 0 | 251 / 99 | 1227 / 189 / 973 | 558 |

## Paired player differences from the current cattle control

Each difference uses the same seed and policy, candidate minus current cattle control. Medians of paired differences can differ from differences of cohort medians. A negative shortfall difference means less unmet human Food need.

| Species | Policy | Paired seeds | Final Food difference, median | Adult descendants difference, median | Cumulative human shortfall difference, median |
| --- | --- | --- | --- | --- | --- |
| Seeded cattle | prepared | 30 | 154.5 | 0 | 0 |
| Seeded cattle | herd | 30 | 0 | 0 | 0 |
| Chicken | prepared | 30 | 80.5 | -0.5 | 0 |
| Chicken | herd | 30 | 118.5 | -1 | 0 |
| Pig | prepared | 30 | 139 | -0.5 | 5 |
| Pig | herd | 30 | -132.5 | -1 | 3 |
| Sheep | prepared | 30 | 284.5 | 0 | 0 |
| Sheep | herd | 30 | 219.5 | 0 | 0 |
| Goat | prepared | 30 | 307 | 0 | 0 |
| Goat | herd | 30 | 53 | 0 | 0 |
| Goose | prepared | 30 | 165 | -1 | 0 |
| Goose | herd | 30 | 117.5 | -1 | 0 |

## Managed herd continuity

Herd loss and clan loss are different outcomes. These counts include completed 40-year runs only.

| Species | Herd present after 10 years | After 20 years | After 40 years |
| --- | --- | --- | --- |
| Current cattle control | 30/30 | 27/30 | 5/30 |
| Seeded cattle | 30/30 | 26/30 | 4/30 |
| Chicken | 29/30 | 18/30 | 10/30 |
| Pig | 29/30 | 16/30 | 1/30 |
| Sheep | 30/30 | 27/30 | 14/30 |
| Goat | 30/30 | 29/30 | 8/30 |
| Goose | 30/30 | 25/30 | 12/30 |

## CPU outcomes

90 distinct completed CPU trajectories are represented below. The same autonomous trajectory reused across player policies is counted once. Its normalized initial state, source and annual trace must match; the real saved founding exclusion is retained in returned states. These are distinct initial states, not independent seed sets. No Food/housing/herd-management policy is applied to the CPU.

| CPU species | Saved rules | Distinct runs | Clan lost | Human shortage observed | Final Food, median (range) | Herd lost | Peak herd |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Seeded cattle | control-autonomous | 30 | 0 | 30 | 33.5 (0–256) | 10 | 146 |
| Seeded cattle | seeded-autonomous | 5 | 0 | 5 | 97 (4–286) | 4 | 10 |
| Chicken | seeded-autonomous | 7 | 0 | 7 | 18 (0–142) | 6 | 23 |
| Goat | seeded-autonomous | 16 | 0 | 15 | 48.5 (0–236) | 16 | 12 |
| Goose | seeded-autonomous | 9 | 0 | 9 | 91 (0–250) | 8 | 25 |
| Pig | seeded-autonomous | 9 | 0 | 8 | 33 (0–331) | 9 | 7 |
| Sheep | seeded-autonomous | 14 | 0 | 14 | 29.5 (4–190) | 10 | 15 |

The bounded CPU cache is a study optimization. Full-world oracle tests compare annual results and exact canonical serialization, including RNG, event history and save/load, against uncached world stepping.

## Proposed coefficients and activation decision

No coefficient below is an approved shipping default. Cattle retain the current LandingConfig. The proposed new-species profiles are saved in full, including mortality bands, fertility ages, both-sex Food/Materials rates, slaughter by stage and species weight.

| Species | Adult age / fertile ages | Birth chance / interval | Adult / young Food need | Female Food / Materials per year | Male Food / Materials per year | Slaughter Food young / subadult / adult | Cattle-equivalent space |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chicken | 1 / 1–6 | 45% / 1 year(s) | 1 / 0 | 4 / 0 | 0 / 0 | 1 / 2 / 2 | 0.1 |
| Pig | 2 / 2–8 | 40% / 1 year(s) | 1 / 0 | 0 / 0 | 0 / 0 | 3 / 10 / 20 | 1 |
| Sheep | 2 / 2–10 | 30% / 1 year(s) | 1 / 0 | 2 / 1 | 0 / 1 | 2 / 5 / 10 | 0.75 |
| Goat | 2 / 2–10 | 30% / 1 year(s) | 1 / 0 | 4 / 0 | 0 / 0 | 2 / 5 / 10 | 0.75 |
| Goose | 1 / 1–8 | 35% / 1 year(s) | 1 / 0 | 3 / 0 | 0 / 0 | 1 / 3 / 5 | 0.2 |

The current candidate keeps the feeding-shortfall birth guard and soft weighted crowding, including outside herds. It does **not** enable a hard birth-capacity gate. Outdoor capacity is four cattle-equivalent spaces. Actual adult slaughter proposes one Hide for cattle/pig/sheep/goat and none for poultry, young animals, natural death or wildlife. These specialist stocks do not add a third universal HUD resource.

Recommended review thresholds, pending owner agreement: require all 30 paired seeds per cohort, zero accounting errors and no hidden resource grants; under reasonable prepared play, flag more than 2/30 clan extinctions or a median of fewer than one human descendant reaching adulthood. Independently flag herd continuity below 24/30 at year 10 or 15/30 at year 40 under the fixed herd policy. Flag any budget limit or continuing unmanaged growth. These are proposed interpretation criteria, not pre-registered acceptance rules or guarantees from a 30-seed sample.

**Recommendation: keep default activation gated.** Review the clan results and the separate herd-continuity table before accepting these coefficients. Clan survival alone does not show that a three-animal herd remains self-sustaining. If longer herd continuity is required, run a separate, single-axis replacement study rather than silently increasing several rates or granting more animals/Food. This matrix remains the evidence for its exact saved candidate.

[The strict-cap pilot was rejected](rejected-strict-cap.md). Its 36 completed observations remain historical, with an interrupted manifest; the later six-control protocol check is [also preserved separately](interrupted-protocol-check.md). Neither is counted in this 630-case candidate matrix.

## Validation and remaining review

The saved browser report records 10/10 passing checks across all six species on desktop and goat/chicken touch layouts at 1180×820 and 390×844, with zero browser errors. It covers real founding, stable Livestock N labels, species/sex details, weighted Farmyard space, cancel/confirm and actual Food/Hides slaughter receipts. Touch emulation is not physical iPad acceptance. These roster fixtures use extra Materials solely to create inspection yards; the economy matrix has no such grant.

[Browser evidence](browser.json) · [Desktop](desktop-goat.png) · [Tablet](tablet-goat-roster.png) · [Phone](phone-chicken.png)

Current build/test status is recorded separately in [validation.json](validation.json). Interrupted suites are not claimed as passes. GitHub CI is unavailable until an explicitly authorized public push; no PR is marked ready. Additional 3D meshes remain #220, and crafting/equipment remain #221.
