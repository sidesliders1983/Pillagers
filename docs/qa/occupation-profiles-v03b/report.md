# CharacterDNA v0.3B — occupation profiles and specialization

**Scope:** Issue #85 research only. Current scoring, campaign defaults and historical #83/#84 evidence remain unchanged. No new CharacterDNA traits, gender assumptions or production modifiers were introduced.

## Recommendation and limits

B is the preferred **profile candidate for a separately reviewed follow-up**, because it materially reduces the two previously near-duplicate pairs using weights and preferences alone. Retain A in production for now. Do not adopt C as a default: wider best–worst spread and more specialists do not establish a larger top-two decision gap, preservation of useful generalists or economic neutrality under aptitude-aware management. The 5–10 point top-two band is exploratory; neither measured candidate meets it. Further revision should preserve generalists and check the remaining Farmer/Herder and Fisher/Hunter overlap before implementation.

Under aware/base, B changes mean total Food production by 1.45% and Materials by 2.08%. Mean final Food is 344.86 versus A 344.95; shortage seeds are 40/100 versus 36/100. C increases mean Food production by 10.04% and Materials by 7.92%, with mean final Food 440.69. Both candidates retain zero unmet Normal Winters under this aware policy. Under aware/protected, B changes mean total Food production by 0.70% and Materials by 2.34%. Mean final Food is 194.66 versus A 199.51; shortage seeds are 43/100 versus 40/100. C increases mean Food production by 10.24% and Materials by 7.75%, with mean final Food 247.37. Both candidates retain zero unmet Normal Winters under this aware policy.

B increases founder specialists from 1 to 128, while reducing strict generalists from 109 to 9. This is a substantial breadth trade-off. Under base/random allocation, B shortage seeds rise from 40 to 56; under passive play from 89 to 96. Review starting assignments and broad usefulness before adoption; do not silently change the frozen benchmark policies or classification boundaries to improve these outcomes.

C saturates 678/10000 founder scores at 100%, leaving 169/1000 top-two ties. This helps explain why its median top-two gap does not improve beyond B, even as its specialist count rises sharply.

C’s role-mean centering is an expectation under the rounded-uniform founder generator, not a guarantee about the selected workforce, inherited descendants or whole-campaign output. Raw means, matched deltas, shortages and reserves below determine how much this matters. Do not infer that a fixed policy algorithm produces identical assignments or later demographic/RNG paths.

## Cohorts, recipes and reproducibility

1000 frozen #83 founders and 655 frozen inherited descendants are evaluated in every A/B/C model, across ten roles. The study regenerates all founders with the real current CharacterDNA generator and checks the complete control records against the archive. Descendants are the same recorded people from the original control/aware campaigns, including deceased people, not candidate-specific survivor samples.

1800 main campaigns × 25 Winters = 45000 domestic Winter resolutions. Seeds 0–99 cross three models, default/random/aware policies and base/protected economies: 18 conditions per seed. Primary data are domestic-only; full-world equivalence uses canonical CPU regions and no expeditions.

A keeps saved current vectors and the canonical score. B uses the differentiated vectors documented in [design.md](design.md), retaining linear scoring. C uses B vectors and the unrounded linear score, then applies: legacy expected role mean + 1.5 × (candidate linear score − candidate expected role mean), rounds once to basis points and clamps to 15–100%. Expectations enumerate 0.00–1.00 with 0.005 endpoint probability and 0.01 interior probability, matching the real rounded-uniform founder marginal. No Expanded/Quadratic default or scores above 100% are introduced.

The protected economy is #77’s isolated C10-safe recipe: after the complete domestic Winter, discard floor(10% × max(0, Food − 2 × current normal-Winter consumption)). Mortality, consumption, maintenance, careers, couples and births run before spoilage; the next weather is already drawn. Protection is an exemption from spoilage, not guaranteed Food or immunity from consumption. No capacity/diminishing-return modifier is applied.

All ten occupations are scored. The current economy activates only Farmer, Fisher and Hunter for resident Food and Woodworker for Materials; Herder and the other crafts have no direct resource output yet. This comparison cannot calibrate their future production chains.

Policies reuse the frozen public-command allocator: default is passive; random and aware assign roughly one quarter of available workers to woodwork, choose at least one farmer, shelter/upgrade households with upkeep reserves, and shelter cattle within the soft cap. Aware reads that model’s aptitude. It can change assignments as scores/populations change, but the algorithm, seeded random role choice and budgets are fixed. They are benchmark policies, not optimal play.

All aggregate production totals are whole units per 25-Winter campaign. Final stocks are at Winter 825. “Any shortage” means an unmet resident/cattle consumption event; three consecutive shortage Winters is reported separately. Food shortage is nonlethal in the current prototype. Low reserve means stock below two normal Winters. Productive-person output excludes Harsh zero-productivity Winters and excludes cattle production from its numerator; it still reflects shelter, age, care, upgrades, work remainders and switching.

Base source revision: `5c8a4af936901ef3d26464f93d6f3070e201be74`. Runtime: `v24.19.0 / win32 / x64`. Complete rules, numeric profiles, source/mapping identities, cohort and harness hashes: [manifest.json](manifest.json). Every seed’s full annual rows, commands and hashes: `runs/seed-N.json.gz`. Every person’s scores: [founders.json.gz](founders.json.gz) and [descendants.json.gz](descendants.json.gz).

## Trait semantics and role identities

Physicality describes physical strength and force; agility dexterity and nimbleness; intelligence analytical and technical facility; cunning tactical and opportunistic tendency. **Low temperament is calm, restrained, patient and steady; high temperament is impulsive, fiery, intense and quick to react.** It is not generic virtue or discipline. None of these traits assigns an occupation or applies a gender multiplier. See [canonical semantics](../../gameplay/spec/02-PERSONAS-FAMILY.md#person-004--characterdna-trait-meanings) and [all ten candidate vectors and role justifications](design.md#initial-differentiated-candidate).

## Aptitude distributions

### Founders

| Model | People | Median top-two gap (pp) | Median best–worst gap (pp) | Generalist | Specialist | Poor fit | Mixed | Scores at 100% | Top-two ties |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 1000 | 2.34 | 19.76 | 109 | 1 | 43 | 847 | 0/10000 | 4 |
| B | 1000 | 3.15 | 30.17 | 9 | 128 | 42 | 821 | 0/10000 | 7 |
| C | 1000 | 3.13 | 41.61 | 6 | 515 | 27 | 452 | 678/10000 | 169 |

### Frozen descendants

| Model | People | Median top-two gap (pp) | Median best–worst gap (pp) | Generalist | Specialist | Poor fit | Mixed | Scores at 100% | Top-two ties |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 655 | 1.83 | 17.28 | 134 | 0 | 19 | 502 | 0/6550 | 4 |
| B | 655 | 2.80 | 24.67 | 16 | 43 | 23 | 573 | 0/6550 | 1 |
| C | 655 | 2.65 | 33.17 | 12 | 187 | 21 | 435 | 320/6550 | 89 |

Classification retains #83’s exploratory boundaries: generalist = minimum ≥70% and best–worst gap ≤15 points; specialist = maximum ≥90%, minimum ≤60% and gap ≥25 points; poor fit = maximum <70%; otherwise mixed. These disjoint labels are not assignment restrictions. Wider score spreads mechanically reduce generalist counts under this definition; remaining generalists are not evidence that broad usefulness is fully preserved.

| Occupation | A mean / SD / P10 / P90 (%) | B mean / SD / P10 / P90 (%) | C mean / SD / P10 / P90 (%) | Best role A/B/C (founders) |
| --- | --- | --- | --- | --- |
| farmer | 76.33 / 7.82 / 66.13 / 86.23 | 71.60 / 11.28 / 56.74 / 86.71 | 76.25 / 16.17 / 54.40 / 99.37 | 92/135/161 |
| herder | 77.40 / 6.80 / 68.21 / 86.06 | 69.51 / 12.45 / 52.57 / 86.57 | 76.65 / 17.48 / 52.04 / 100.00 | 215/101/159 |
| fisher | 74.55 / 9.05 / 62.05 / 86.23 | 70.87 / 11.25 / 55.54 / 85.77 | 73.93 / 16.50 / 51.16 / 96.50 | 71/110/109 |
| hunter | 73.39 / 9.83 / 60.01 / 85.98 | 69.15 / 11.72 / 53.68 / 84.50 | 72.99 / 17.01 / 50.10 / 96.34 | 145/84/96 |
| textileWorker | 73.50 / 9.35 / 60.86 / 85.34 | 68.93 / 11.79 / 53.29 / 83.98 | 73.06 / 17.10 / 49.93 / 95.96 | 53/85/83 |
| smith | 72.76 / 10.43 / 58.28 / 86.61 | 66.58 / 12.81 / 48.87 / 84.28 | 72.29 / 18.41 / 46.21 / 99.31 | 152/64/129 |
| woodworker | 74.04 / 8.82 / 62.30 / 85.17 | 74.51 / 8.94 / 62.64 / 86.25 | 74.25 / 13.36 / 56.46 / 91.89 | 11/130/32 |
| boatbuilder | 71.66 / 10.70 / 57.58 / 85.72 | 69.69 / 12.48 / 52.99 / 86.40 | 71.25 / 18.33 / 46.43 / 96.56 | 85/98/115 |
| trader | 71.53 / 10.41 / 57.31 / 85.04 | 68.56 / 12.04 / 52.56 / 85.04 | 71.19 / 17.67 / 47.42 / 96.14 | 143/100/88 |
| leatherAndJewelleryMaker | 72.12 / 9.87 / 59.37 / 85.04 | 72.82 / 9.65 / 60.00 / 86.19 | 72.05 / 14.35 / 52.88 / 92.17 | 33/93/28 |

Per-role percentiles/extrema, per-person rankings/gaps/categories, best-role counts, original assignment gaps, complete founder/descendant role and trait matrices: [summary.json](summary.json). Correct 100% cap counts and top-two ties are above and in [diagnostics.json](diagnostics.json); the reused #83 summary’s legacy “125% cap” diagnostic is irrelevant for these bounded models.

## Correlations and single-trait risk

| Pair | A r | B r | C r |
| --- | --- | --- | --- |
| textileWorker / leatherAndJewelleryMaker | 0.98 | 0.28 | 0.29 |
| woodworker / boatbuilder | 0.93 | 0.44 | 0.45 |
| farmer / herder | 0.91 | 0.78 | 0.79 |
| fisher / hunter | 0.84 | 0.83 | 0.83 |

Both weights and preferred values change. Textile emphasises repetitive dexterity/patience; Leather/Jewellery emphasises technical design/adaptive finishing. Woodwork favours physical joinery; boatbuilding favours structural planning. Residual Food-role overlap remains visible. A strong role-specific intelligence–boatbuilding or temperament–herding association does not mean a single trait controls every career; inspect all five trait rows, the ten winning-role counts and the remaining generalists together. C’s saturation can suppress top-two gaps even while best–worst gaps rise.

### A founder role correlations

| Role | farmer | herder | fisher | hunter | textileWorker | smith | woodworker | boatbuilder | trader | leatherAndJewelleryMaker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| farmer | 1.00 | 0.91 | 0.76 | 0.47 | 0.52 | 0.64 | 0.74 | 0.58 | 0.31 | 0.45 |
| herder | 0.91 | 1.00 | 0.71 | 0.41 | 0.64 | 0.41 | 0.68 | 0.52 | 0.38 | 0.55 |
| fisher | 0.76 | 0.71 | 1.00 | 0.84 | 0.78 | 0.46 | 0.80 | 0.55 | 0.24 | 0.76 |
| hunter | 0.47 | 0.41 | 0.84 | 1.00 | 0.67 | 0.32 | 0.65 | 0.44 | 0.44 | 0.71 |
| textileWorker | 0.52 | 0.64 | 0.78 | 0.67 | 1.00 | 0.26 | 0.82 | 0.70 | 0.49 | 0.98 |
| smith | 0.64 | 0.41 | 0.46 | 0.32 | 0.26 | 1.00 | 0.73 | 0.74 | 0.22 | 0.30 |
| woodworker | 0.74 | 0.68 | 0.80 | 0.65 | 0.82 | 0.73 | 1.00 | 0.93 | 0.48 | 0.84 |
| boatbuilder | 0.58 | 0.52 | 0.55 | 0.44 | 0.70 | 0.74 | 0.93 | 1.00 | 0.52 | 0.74 |
| trader | 0.31 | 0.38 | 0.24 | 0.44 | 0.49 | 0.22 | 0.48 | 0.52 | 1.00 | 0.49 |
| leatherAndJewelleryMaker | 0.45 | 0.55 | 0.76 | 0.71 | 0.98 | 0.30 | 0.84 | 0.74 | 0.49 | 1.00 |

### B founder role correlations

| Role | farmer | herder | fisher | hunter | textileWorker | smith | woodworker | boatbuilder | trader | leatherAndJewelleryMaker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| farmer | 1.00 | 0.78 | -0.04 | 0.06 | 0.28 | 0.38 | 0.58 | 0.03 | 0.02 | -0.10 |
| herder | 0.78 | 1.00 | 0.19 | 0.03 | 0.45 | -0.09 | 0.19 | 0.04 | 0.28 | 0.02 |
| fisher | -0.04 | 0.19 | 1.00 | 0.83 | 0.74 | -0.18 | 0.17 | -0.00 | 0.36 | 0.28 |
| hunter | 0.06 | 0.03 | 0.83 | 1.00 | 0.44 | 0.19 | 0.40 | 0.00 | 0.45 | 0.26 |
| textileWorker | 0.28 | 0.45 | 0.74 | 0.44 | 1.00 | -0.07 | 0.37 | 0.11 | 0.02 | 0.28 |
| smith | 0.38 | -0.09 | -0.18 | 0.19 | -0.07 | 1.00 | 0.79 | 0.60 | 0.12 | 0.45 |
| woodworker | 0.58 | 0.19 | 0.17 | 0.40 | 0.37 | 0.79 | 1.00 | 0.44 | 0.10 | 0.42 |
| boatbuilder | 0.03 | 0.04 | -0.00 | 0.00 | 0.11 | 0.60 | 0.44 | 1.00 | 0.45 | 0.90 |
| trader | 0.02 | 0.28 | 0.36 | 0.45 | 0.02 | 0.12 | 0.10 | 0.45 | 1.00 | 0.53 |
| leatherAndJewelleryMaker | -0.10 | 0.02 | 0.28 | 0.26 | 0.28 | 0.45 | 0.42 | 0.90 | 0.53 | 1.00 |

### C founder role correlations

| Role | farmer | herder | fisher | hunter | textileWorker | smith | woodworker | boatbuilder | trader | leatherAndJewelleryMaker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| farmer | 1.00 | 0.79 | -0.04 | 0.06 | 0.28 | 0.38 | 0.57 | 0.03 | 0.02 | -0.09 |
| herder | 0.79 | 1.00 | 0.18 | 0.02 | 0.45 | -0.07 | 0.19 | 0.05 | 0.28 | 0.02 |
| fisher | -0.04 | 0.18 | 1.00 | 0.83 | 0.75 | -0.17 | 0.18 | -0.00 | 0.36 | 0.28 |
| hunter | 0.06 | 0.02 | 0.83 | 1.00 | 0.45 | 0.19 | 0.40 | 0.00 | 0.45 | 0.26 |
| textileWorker | 0.28 | 0.45 | 0.75 | 0.45 | 1.00 | -0.06 | 0.37 | 0.11 | 0.02 | 0.29 |
| smith | 0.38 | -0.07 | -0.17 | 0.19 | -0.06 | 1.00 | 0.80 | 0.61 | 0.12 | 0.45 |
| woodworker | 0.57 | 0.19 | 0.18 | 0.40 | 0.37 | 0.80 | 1.00 | 0.45 | 0.10 | 0.43 |
| boatbuilder | 0.03 | 0.05 | -0.00 | 0.00 | 0.11 | 0.61 | 0.45 | 1.00 | 0.45 | 0.90 |
| trader | 0.02 | 0.28 | 0.36 | 0.45 | 0.02 | 0.12 | 0.10 | 0.45 | 1.00 | 0.53 |
| leatherAndJewelleryMaker | -0.09 | 0.02 | 0.28 | 0.26 | 0.29 | 0.45 | 0.43 | 0.90 | 0.53 | 1.00 |

### A trait-to-role correlations

| Trait | farmer | herder | fisher | hunter | textileWorker | smith | woodworker | boatbuilder | trader | leatherAndJewelleryMaker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| physicality | 0.55 | 0.22 | 0.41 | 0.31 | -0.05 | 0.82 | 0.42 | 0.35 | -0.03 | -0.01 |
| agility | 0.16 | 0.18 | 0.74 | 0.79 | 0.68 | -0.01 | 0.44 | 0.22 | 0.06 | 0.72 |
| intelligence | 0.16 | 0.18 | 0.07 | 0.07 | 0.49 | 0.47 | 0.62 | 0.84 | 0.55 | 0.54 |
| cunning | -0.08 | -0.11 | -0.00 | 0.40 | -0.02 | -0.07 | -0.04 | -0.04 | 0.71 | 0.00 |
| temperament | -0.54 | -0.60 | -0.27 | 0.00 | -0.26 | 0.06 | -0.16 | -0.09 | -0.28 | -0.17 |

### B trait-to-role correlations

| Trait | farmer | herder | fisher | hunter | textileWorker | smith | woodworker | boatbuilder | trader | leatherAndJewelleryMaker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| physicality | 0.45 | -0.08 | 0.01 | 0.46 | -0.06 | 0.75 | 0.68 | -0.03 | -0.09 | -0.08 |
| agility | -0.13 | -0.01 | 0.85 | 0.63 | 0.85 | -0.11 | 0.21 | 0.00 | -0.04 | 0.24 |
| intelligence | -0.04 | -0.09 | -0.14 | -0.09 | 0.02 | 0.65 | 0.40 | 0.96 | 0.35 | 0.80 |
| cunning | -0.13 | 0.12 | 0.48 | 0.62 | -0.06 | -0.10 | -0.11 | 0.08 | 0.88 | 0.22 |
| temperament | -0.83 | -0.95 | -0.02 | 0.09 | -0.41 | -0.05 | -0.23 | -0.08 | -0.13 | 0.03 |

### C trait-to-role correlations

| Trait | farmer | herder | fisher | hunter | textileWorker | smith | woodworker | boatbuilder | trader | leatherAndJewelleryMaker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| physicality | 0.45 | -0.08 | 0.01 | 0.46 | -0.06 | 0.74 | 0.68 | -0.03 | -0.09 | -0.08 |
| agility | -0.13 | -0.01 | 0.85 | 0.63 | 0.85 | -0.11 | 0.21 | 0.00 | -0.04 | 0.24 |
| intelligence | -0.04 | -0.09 | -0.14 | -0.09 | 0.02 | 0.65 | 0.40 | 0.96 | 0.34 | 0.80 |
| cunning | -0.13 | 0.11 | 0.48 | 0.61 | -0.06 | -0.09 | -0.11 | 0.08 | 0.89 | 0.22 |
| temperament | -0.83 | -0.95 | -0.02 | 0.09 | -0.41 | -0.04 | -0.23 | -0.08 | -0.13 | 0.03 |

## Matched economy results

| Condition | Mean Food produced | Mean Materials produced | Final Food mean / median | Final Materials mean / median | Final population mean | Any shortage seeds | 3+ consecutive shortage seeds | Normal shortage Winters |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A/default/base | 829.64 | 121.11 | 35.22 / 17.50 | 78.69 / 72.50 | 12.60 | 89/100 | 39/100 | 101 |
| A/default/protected | 829.55 | 120.84 | 36.74 / 22.00 | 78.52 / 69.50 | 12.56 | 89/100 | 39/100 | 101 |
| A/random/base | 1036.91 | 125.35 | 251.99 / 242.50 | 14.35 / 14.00 | 15.76 | 40/100 | 6/100 | 0 |
| A/random/protected | 1037.25 | 125.66 | 156.33 / 156.50 | 14.45 / 14.00 | 15.71 | 51/100 | 6/100 | 0 |
| A/aware/base | 1097.39 | 136.82 | 344.95 / 345.50 | 15.79 / 17.00 | 15.45 | 36/100 | 4/100 | 0 |
| A/aware/protected | 1100.46 | 136.54 | 199.51 / 197.50 | 15.56 / 17.00 | 15.60 | 40/100 | 6/100 | 0 |
| B/default/base | 792.34 | 132.55 | 38.61 / 21.00 | 87.85 / 79.50 | 12.47 | 96/100 | 52/100 | 131 |
| B/default/protected | 794.06 | 132.19 | 33.83 / 20.50 | 87.94 / 79.50 | 12.48 | 97/100 | 52/100 | 127 |
| B/random/base | 989.68 | 129.56 | 213.39 / 209.00 | 14.71 / 15.00 | 15.70 | 56/100 | 6/100 | 0 |
| B/random/protected | 982.53 | 128.80 | 135.12 / 138.00 | 14.00 / 13.50 | 15.59 | 61/100 | 7/100 | 1 |
| B/aware/base | 1113.30 | 139.67 | 344.86 / 343.00 | 15.49 / 15.50 | 16.16 | 40/100 | 6/100 | 0 |
| B/aware/protected | 1108.19 | 139.73 | 194.66 / 199.50 | 15.04 / 15.00 | 16.10 | 43/100 | 6/100 | 0 |
| C/default/base | 862.27 | 128.51 | 54.76 / 31.00 | 81.46 / 75.50 | 13.00 | 89/100 | 38/100 | 60 |
| C/default/protected | 857.43 | 127.65 | 50.05 / 30.00 | 80.62 / 72.50 | 13.00 | 89/100 | 41/100 | 61 |
| C/random/base | 1020.96 | 125.93 | 239.69 / 243.00 | 13.49 / 13.00 | 15.73 | 42/100 | 7/100 | 0 |
| C/random/protected | 1027.39 | 127.70 | 154.21 / 151.00 | 14.27 / 14.00 | 15.70 | 50/100 | 6/100 | 0 |
| C/aware/base | 1207.56 | 147.65 | 440.69 / 462.00 | 16.48 / 17.00 | 16.13 | 29/100 | 2/100 | 0 |
| C/aware/protected | 1213.19 | 147.12 | 247.37 / 256.00 | 16.62 / 17.50 | 16.12 | 35/100 | 5/100 | 0 |

### Paired changes against the same A policy/economy/seed

| Condition vs matched A | Food-production mean delta | Materials-production mean delta | Final Food mean delta | Shortfall mean delta | Population mean delta |
| --- | --- | --- | --- | --- | --- |
| B/default/base | -37.30 | 11.44 | 3.39 | 34.83 | -0.13 |
| B/default/protected | -35.49 | 11.35 | -2.91 | 27.98 | -0.08 |
| B/random/base | -47.23 | 4.21 | -38.60 | 1.33 | -0.06 |
| B/random/protected | -54.72 | 3.14 | -21.21 | 3.04 | -0.12 |
| B/aware/base | 15.91 | 2.85 | -0.09 | 1.81 | 0.71 |
| B/aware/protected | 7.73 | 3.19 | -4.85 | 0.32 | 0.50 |
| C/default/base | 32.63 | 7.40 | 19.54 | 4.39 | 0.40 |
| C/default/protected | 27.88 | 6.81 | 13.31 | 12.12 | 0.44 |
| C/random/base | -15.95 | 0.58 | -12.30 | 3.12 | -0.03 |
| C/random/protected | -9.86 | 2.04 | -2.12 | -0.98 | -0.01 |
| C/aware/base | 110.17 | 10.83 | 95.74 | -5.69 | 0.68 |
| C/aware/protected | 112.73 | 10.58 | 47.86 | -5.12 | 0.52 |

### Reserves, effective work and switching

| Condition | Mean low-reserve Winters | Final normal reserve Winters (median) | Human Food / productive Food-person-Winter (mean) | Mean player changes | Mean total occupation changes | Mean building specialization changes | Mean spoiled Food |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A/default/base | 21.62 | 0.44 | 4.46 | 0.00 | 2.67 | 0.00 | 0.00 |
| A/default/protected | 21.65 | 0.48 | 4.46 | 0.00 | 2.67 | 0.00 | 5.08 |
| A/random/base | 8.05 | 6.44 | 5.96 | 17.68 | 18.42 | 9.40 | 0.00 |
| A/random/protected | 9.54 | 4.55 | 5.94 | 17.88 | 18.57 | 9.43 | 98.83 |
| A/aware/base | 5.99 | 10.62 | 6.54 | 14.96 | 15.74 | 8.30 | 0.00 |
| A/aware/protected | 6.71 | 6.53 | 6.54 | 15.02 | 15.81 | 8.29 | 149.72 |
| B/default/base | 22.52 | 0.44 | 4.41 | 0.00 | 3.65 | 0.00 | 0.00 |
| B/default/protected | 22.66 | 0.43 | 4.39 | 0.00 | 3.65 | 0.00 | 2.97 |
| B/random/base | 9.32 | 5.78 | 5.63 | 17.69 | 18.30 | 9.80 | 0.00 |
| B/random/protected | 10.21 | 4.33 | 5.63 | 17.61 | 18.24 | 9.82 | 80.14 |
| B/aware/base | 6.18 | 10.21 | 6.58 | 15.26 | 16.16 | 8.99 | 0.00 |
| B/aware/protected | 7.06 | 5.83 | 6.56 | 15.10 | 16.00 | 8.96 | 146.88 |
| C/default/base | 20.96 | 0.71 | 4.84 | 0.00 | 5.03 | 0.00 | 0.00 |
| C/default/protected | 20.87 | 0.71 | 4.84 | 0.00 | 5.04 | 0.00 | 8.60 |
| C/random/base | 8.50 | 6.83 | 5.92 | 17.83 | 18.51 | 9.81 | 0.00 |
| C/random/protected | 9.14 | 4.56 | 5.92 | 18.02 | 18.70 | 9.87 | 99.13 |
| C/aware/base | 4.94 | 13.67 | 7.32 | 15.34 | 16.13 | 9.13 | 0.00 |
| C/aware/protected | 5.25 | 7.62 | 7.31 | 15.29 | 16.09 | 9.08 | 201.24 |

Absolute final stocks can change through household formation, childcare, deaths, upgrades and role switches as well as immediate aptitude. 728 of 1,200 candidate/control pairs diverge in saved RNG state during the campaign. Same-seed deltas are descriptive matched experiments, not isolated causal effects with identical subsequent weather and births. Full per-seed deltas and annual stock distributions are in summary.json; per-seed reserves and output diagnostics are in diagnostics.json.

## Weather, accounting and verification

Current merged weather is used once: Mild produces 110% Food, Normal 100%, Harsh produces no resident/cattle Food or Materials and raises resident/adult-cattle demand by 50% with separate category ceilings, Severe produces 50% Food with normal Materials/resident demand and triple adult-cattle demand. Probabilities are 20/55/20/5%. Their descriptive labels are not interchangeable.

The independent archive audit checks Food = opening Food + human/cattle production − consumption − spoilage, and Materials = opening Materials + woodwork + recovery − construction/upgrades − upkeep, on every annual row. It also checks exact spoilage rounding, no capacity loss, actual Harsh/Severe demand and production, initial reported scores against real worker scores, all 18 matched conditions, source identities, complete cohorts, derived summaries and artifact checksums.

300 A/base controls match #83 final-state hashes and public command histories; 100 A/protected/aware controls match #84 C10-safe. 72 repeated midpoint save/load runs, 24 full-world/domestic equivalences and six partial-work replay checks passed. Mismatched model/economy saves are rejected by tests. [audit.json](audit.json) records the checks. Historical manifests describe their own source revisions; their files are not rewritten to match the extended adapter.

The build, required character/Lab-preview validation and full test suite are verified for delivery and recorded in the PR. No project formatter is configured; source layout was reviewed manually against neighbouring modules. The research boundary is the public harness output and real Simulation Core commands/save/load; no new browser UI is introduced.

## Production follow-up

The existing save retains numeric vectors/progress but no scoring-formula ID. The QA envelope includes model, policy, economy, numeric-profile hash, mapping hash, adapter hash and underlying source/hook identity. It rejects incompatible continuation and keeps experimental files separate from ordinary campaign saves. This proves the research adapter, not a completed production migration.

A later implementation must explicitly approve vectors/formula and save versioning, resolve missing formula IDs to legacy behaviour, preserve saved vectors/progress/RNG, and display the same campaign-aware innate fit in gameplay choices, careers and work. Keep productivity modifiers separate. Character Lab’s six illustrative roles are a separate presentation decision from the ten gameplay roles. See [implementation-plan.md](implementation-plan.md).

## Reproduce

```text
pnpm install --frozen-lockfile
node scripts/qa/run-occupation-profiles.mjs --output artifacts/occupation-profiles-v03b --seeds 100 --winters 25 --workers 4
node scripts/qa/verify-profile-study.mjs artifacts/occupation-profiles-v03b
node scripts/qa/render-profile-report.mjs artifacts/occupation-profiles-v03b
node --test tests/occupation-profiles.test.mjs
```

Report figures are generated from the audited raw archive. [report-provenance.json](report-provenance.json) fingerprints the generator, dependency lock, manifest, summary, audit, diagnostics, design, implementation plan and final Markdown. Small CLI/test runs intentionally cannot produce this complete-cohort report.
