# Population continuity — #127

2026-10-12. **Only the approved 15-Food player start changes production balance.** The other rules below are QA experiments, not enabled game options. [Interactive review](review.html), [summary](summary.json), [verification](verification.json), [browser results](browser/results.json).

## Decision for review

Ship 15 Food, preserving saved campaigns and CPU starting rules. Keep the current mortality curve for now. The stronger mortality trial lost four of eight clans; the current baseline lost one. Removing cattle from the human reserve threshold alone did not establish better continuity. These eight seeds are a diagnostic pilot, not an estimate of population-wide extinction probabilities.

The herd feedback is real, but the two binary breeding restrictions are too blunt to adopt as defaults. Fed-only breeding still lost one of eight autonomous clans and eliminated four of the seven surviving clans' herds. Requiring spare Farmyard space prohibited all autonomous cattle births, since this policy never assigns animals. Neither outcome establishes sustainable herd management.

**No extra tested coefficient is recommended for immediate release.** The smallest review direction is a feeding consequence for reproduction plus gradual pressure on unsupported breeding, while keeping existing natural/weather mortality. A concrete *next-trial proposal*, not yet measured or approved, is: keep the 50% base chance; multiply it by the lower of human and cattle fulfilled-Food fractions at that boundary (a zero requirement counts as fully met), then by 50% for an outside herd or by min(1, capacity / living occupants) for an active yard. Round the final basis points down; zero skips the roll; preserve age, bull and cooldown requirements. Existing cattle are neither capped nor culled. That proposal should first be paired with a policy that keeps eligible bulls and cows together; the present least-occupied-yard policy does not ensure a viable breeding group. It must not be enabled through a default or save migration without a reviewed follow-up measurement.

The family diagnosis also includes partner availability and founder age, not only Food. Do not remove kinship rules, shorten care, raise output or prescribe a death age to force a preferred chart.

## Source and campaign inventory

Implementation base: merge commit `7bb64f163c882db502c01abd9af2bac5d857a9ef` (PR #128). Measurements were made with the working changes in this PR; manifests explicitly mark the source as dirty. Each raw result carries full landing, mechanics, weather and social configurations, the original founder fingerprint, accepted/rejected public commands, source/hash identity and final canonical-state hash. [Verification](verification.json) records normalized source hashes. The first pilot's [diagnostic source](pilot/diagnostic-source.txt) is retained: afterwards a filter excluded namespaced CPU observations in full-world validation. All seven long replay comparisons match player annual rows, decisions, commands and state hashes. Four replay the original pilot across that filter change; the other three use the same diagnostic version on both sides.

No exported save of the owner's Winter-862 screenshot was supplied. The photographed 6 residents / 218 cattle / 19 Food / 64 Materials is a reported observation, not one of these campaigns. We cannot establish its saved weather, shelter or intervention history.

Production defaults remain maternal ages 18–40 inclusive, 25% eligible annual chance, two *complete* cooldown years (a birth at boundary 801 next permits 804), and five years of care. Own care stops work but does not block the mother's fertility. A proxy caregiver's current or outgoing-year participation does block fertility. There is no two-child limit. Founders are already adult survivors aged 18–40, not newborns. Mortality values are game parameters, not historical life-expectancy estimates.

Cattle mature and become fertile at three; eligible cows/bulls are 3–12, with a 50% roll and a minimum birth gap of two years (801 permits 803). Mortality age bands are separately <2 / 2–9 / 10–14 / 15+, at 2% / 0.5% / 5% / 15%. An eligible bull must share the assignment, including null for the outside herd. Young animals consume zero Food until three. No new grazing, health, replacement-animal or culling system was introduced.

## Approved starting-stock change

The public [Simulation Core factory](../../../src/simulation/SimulationCore.ts) injects 15 before stock and founding-event creation. The Gameplay Lab and shared 2D/Fjord session use that factory; frozen opening facts therefore also show 15. Materials, founder identity/ages, founding couples and cattle are unchanged. The 2D low-reserve message now reads the campaign's saved starting amount instead of hard-coding 30.

The internal Landing factory still defaults to 30 for CPU starts and historical fixtures. Explicit custom overrides remain authoritative and retain their previous propagation. Saved-rule restarts retain individual CPU landing configurations; newly generated directions inherit the alphabetically first saved neighbour's configuration. New default campaigns after old imports use 15. Existing stocks, genealogy, events and published books are not rewritten. Historical QA reports are untouched; their runnable control factories explicitly pin 30.

Browser touch emulation checked all three actual routes: new 15, import current stock 47 with starting rule 30, restart 30, new-after-import 15; fresh CPU starting configuration 30. Canonical exports, founding receipts and exported book facts were checked. This is Edge Chromium 1024×768 touch emulation, not a physical iPad Safari claim.

## Annual-path diagnosis

[Mechanics](../../../src/simulation/Mechanics.ts) finishes work using the outgoing year's weather, increments the boundary/age, then resolves human deaths and immediate Farmyard loss, cattle deaths, cattle Food consumption, human consumption, maintenance/collapse, careers, partnerships/housing, human births/care, Farmyard reconciliation, cattle births, and the following weather draw. An event at 801 can therefore reference weatherWinter 800. Mortality happens before consumption; a cow's completed work-year output can precede its death. New calves are neither consumed nor killed in that same boundary.

[Human fertility](../../../src/simulation/FamilyMechanics.ts) checks the actual first blocking branch: away, outgoing proxy care, current proxy care, dead, sex, age, partner, partner availability, cooldown, then the post-consumption Food reserve and actual random roll. The reserve is weather-adjusted human **plus cattle** need; a birth can raise the human part for later mothers in the same pass. Absence of an actual annual shortfall is not the same as passing this additional reserve gate. Diagnostics record the first branch separately from context flags; skipped rolls are null and never draw extra RNG.

In the current 15-Food autonomous cohort, living women aged 18–40 had 529 no-partner skips, 336 Food-reserve skips, 96 cooldown skips, 24 outgoing proxy-care skips, 163 failed rolls and 61 births. Of the Food skips, 227 occurred in years with no recorded consumption shortfall; 62 would have passed a human-only reserve at the same decision point. Those 62 are diagnostic counterfactuals, not 62 promised extra children: an actual changed rule alters later births, care, consumption and RNG. Nine births occurred while the mother was still in her own care period. The public regression produces a third and fourth child and verifies that all four remain visible through the Family Tree projection.

[Resident mortality](../../../src/simulation/Mortality.ts) combines natural risk and unsheltered weather risk, bounded at 100%. Default Harsh/Severe exposure increments are 0.5/2 percentage points; Mild and Normal add zero. With default weather probabilities their weighted increment is only 0.2 percentage points before conditioning on an actual campaign. Homes protect; tents do not. Food shortfall has no direct death term.

[Livestock](../../../src/simulation/Livestock.ts) really executes annual exposure: outside animals add 0/0/5/15 percentage points for Mild/Normal/Harsh/Severe. Flat weather mortality being zero does not disable that term. Every animal assigned to an active farmer home is sheltered even beyond four; each excess animal separately adds 2 percentage points crowding risk to every member. Outside herds have no crowding term. Risks are captured before removal. The last farmer's death can expose cattle immediately; maintenance collapse happens later and affects the next mortality round. Current feeding shortfalls do **not** change mortality or breeding, and cattle eat before residents. There is no automatic assignment to a newly active yard.

Guaranteed-exposure tests prove actual deaths and no later output/consumption; matched sheltered animals survive. Tests also cover all four classes, disabled weather, an invalidated yard, over-capacity shelter, no eligible bull, breeding outside, age progression and save/split-tick determinism. A combined-risk death is never labelled as proven exclusively 'from exposure'.

## Pilot design and limits

Eight seeds: 1, 2, 3, 7, 17, 32, 41, 78. Each condition runs up to 80 years. There are 88 condition-runs across the paired seeds and seven additional seed-32 replay runs, saved/reloaded at year 40. All finished or reached actual resident extinction; none hit the resource budget. The study stops at extinction, so livestock after that point are not followed to year 80. No diagnostics were dropped.

Two workers maximum, 512 MiB V8 old-generation budget per worker (not a claim about measured total RAM), 150 seconds hard worker timeout including initialization, 140 seconds checked between annual advances, and observation stops before another year if live cattle exceed 2,000. A limit stops measurement and retains a partial checkpoint; it never removes animals. Detailed rows are capped at 200,000 per run. Runtime and byte counts are in each manifest. No larger sweep was needed to reject the aggressive mortality/binary capacity directions; eight seeds remain too few for release calibration or confidence claims.

The real domestic Core executes all 1,000 ticks each year. Ordinary social events remain enabled. Expeditions and CPU simulation are omitted for this domestic study; a public three-year maintained-herd test compares identical domestic state, annual outcomes and decisions against the complete world. There are no manual Food injections, campfire commands, slaughters, trading or transfers in the measured policies.

Policies reuse the frozen #78 Food policy:

- **passive**: no player commands; normal career, partnership and housing autonomy. This does not mean there can never be autonomous houses.
- **prepared**: salvage the starting ship; about one quarter of available adults work wood, the remainder take suited Food roles including a farmer; build/specialize homes while retaining two years of upkeep plus two Materials, then upgrade. This prioritizes Food work but does not guarantee every resident can be housed immediately. All cattle assignments are suppressed and recorded as unaccepted policy commands.
- **herd**: the same algorithm plus assignment to the least-occupied active yard with free capacity. This isolates the effect of existing assignment controls, but is not an optimal breeder strategy: it can separate cows/bulls and never buys replacements, redistributes existing assignments or slaughters stock. Actual commands are saved for every run.

The algorithms are reused across candidates; realized commands may differ as stocks and residents diverge. Seeds match founder identities and initial rules except the chosen intervention. Branching changes RNG consumption, so subsequent weather is not forced to match across candidates. Determinism is asserted *within* each candidate, not identical outcomes across changed rules.

Experimental rules (all except control start with 15):

| Candidate | Exact isolated change |
| --- | --- |
| control30 | Old opening stock 30; other rules unchanged |
| baseline15 | Opening stock 15 only |
| human-reserve | Birth reserve excludes cattle; shared consumption order unchanged |
| mortality | Natural risks from age 50 multiplied by 3: 1.5%, 6%, 15%, 30%, 60%; ages below 50 unchanged. Harsh/Severe human exposure 2%/8%. Old birth reserve retained |
| combined | human-reserve plus mortality, measured only after reading their isolated results |
| feeding | A cow skips its birth roll if either residents or cattle had actual Food shortfall in the current boundary; otherwise existing 50% chance. Evaluated after cooldown and bull presence, before chance |
| yard-breeding | A cow skips its roll without an active assigned yard with a free space; births consume that space in sorted cow order. Existing excess animals remain. A deliberately strong reproduction restriction for comparison, **not** a replacement for the production soft cap |

## Outcomes

| Rules / policy | Extinct / 8 | Median people at year 80 | Median cattle* | Births | Actual Food-shortfall years |
| --- | --- | --- | --- | --- | --- |
| combined/combined/passive | 1/8 | 2.5 | 190 | 56 | 173 |
| herd-feedback/feeding/herd | 0/8 | 23.5 | 0 | 198 | 8 |
| herd-feedback/feeding/passive | 1/8 | 5 | 0 | 62 | 95 |
| herd-feedback/yard-breeding/herd | 0/8 | 14.5 | 0 | 145 | 12 |
| herd-feedback/yard-breeding/passive | 0/8 | 7 | 0 | 87 | 103 |
| management/baseline15/herd | 0/8 | 23.5 | 0 | 206 | 7 |
| management/baseline15/prepared | 1/8 | 11.5 | 362 | 144 | 43 |
| pilot/baseline15/passive | 1/8 | 5.5 | 151 | 61 | 112 |
| pilot/control30/passive | 1/8 | 4.5 | 187 | 48 | 86 |
| pilot/human-reserve/passive | 1/8 | 4 | 360 | 53 | 160 |
| pilot/mortality/passive | 4/8 | 1 | 205.5 | 61 | 148 |

*People at 80 includes extinct clans as zero. Cattle/stock/adult-descendant medians marked with * use only completed eighty-year campaigns; their denominators differ. No incomplete observations are silently treated as survivors or deaths. Full seed trajectories and final age/sex counts are in the compressed raw files and summary data.*

The 15-Food baseline has 112 annual shortfall boundaries versus 86 under the old opening, but early years 1–10 have 6 versus 10 in these seeds. This is a small nonlinear comparison: it does not prove less Food reduces scarcity. Birth availability and the saved RNG stream change subsequent trajectories. The opening difference is exact; long-term scarcity is not solved merely by halving the buffer.

| Seed | 30-Food stocks years 0–5 | 15-Food stocks years 0–5 | First shortfall year, 30 / 15 | Food-gate skips years 1–10, 30 / 15 |
| --- | --- | --- | --- | --- |
| 1 | 30 → 45 → 66 → 89 → 53 → 72 | 15 → 30 → 51 → 74 → 38 → 57 | 33 / 27 | 1 / 1 |
| 17 | 30 → 31 → 33 → 35 → 45 → 48 | 15 → 16 → 20 → 34 → 23 → 40 | 30 / 22 | 0 / 6 |
| 2 | 30 → 31 → 0 → 5 → 8 → 12 | 15 → 16 → 22 → 36 → 41 → 50 | 2 / 13 | 13 / 7 |
| 3 | 30 → 36 → 3 → 10 → 15 → 25 | 15 → 21 → 0 → 9 → 15 → 0 | 14 / 2 | 16 / 30 |
| 32 | 30 → 39 → 53 → 62 → 74 → 81 | 15 → 24 → 38 → 47 → 59 → 66 | 8 / 30 | 9 / 7 |
| 41 | 30 → 39 → 54 → 71 → 70 → 70 | 15 → 24 → 39 → 56 → 55 → 55 | 14 / 12 | 9 / 11 |
| 7 | 30 → 33 → 36 → 0 → 2 → 5 | 15 → 18 → 21 → 0 → 0 → 8 | 3 / 3 | 22 / 16 |
| 78 | 30 → 34 → 43 → 49 → 45 → 41 | 15 → 19 → 26 → 28 → 30 → 32 | 8 / 8 | 18 / 11 |

Prepared housing improves human continuity here, while outside herds can still grow. Adding yard assignment increases births to 206 and reaches generations beyond grandchildren, but all eight managed herds are gone by year 80. There are 159 no-bull cow-year blocks under the unchanged managed rules. Feeding restrictions add only four blocked cow-years to that policy; they do not fix its lack of breeding continuity. These findings rule out presenting the managed cohort's larger Food stock as a complete sustainable-herd solution.

## Founder survival and successive generations

| Cohort | Arrival age median / range | Observed founder death-age median | Deaths / censored | Reached ages 50 / 60 / 70 / 80 |
| --- | --- | --- | --- | --- |
| combined/combined/passive | 27 / 18–40 | 64 | 80 / 0 | 69/80 · 60/80 · 30/80 · 10/80 |
| herd-feedback/feeding/herd | 27 / 18–40 | 77 | 79 / 1 | 76/80 · 71/80 · 58/80 · 38/80 |
| herd-feedback/feeding/passive | 27 / 18–40 | 73 | 80 / 0 | 76/80 · 69/80 · 53/80 · 29/80 |
| herd-feedback/yard-breeding/herd | 27 / 18–40 | 78 | 80 / 0 | 76/80 · 71/80 · 55/80 · 36/80 |
| herd-feedback/yard-breeding/passive | 27 / 18–40 | 76 | 80 / 0 | 77/80 · 73/80 · 55/80 · 32/80 |
| management/baseline15/herd | 27 / 18–40 | 79 | 79 / 1 | 76/80 · 71/80 · 59/80 · 39/80 |
| management/baseline15/prepared | 27 / 18–40 | 79 | 80 / 0 | 80/80 · 80/80 · 64/80 · 37/80 |
| pilot/baseline15/passive | 27 / 18–40 | 73 | 80 / 0 | 76/80 · 71/80 · 52/80 · 27/80 |
| pilot/control30/passive | 27 / 18–40 | 77 | 80 / 0 | 77/80 · 72/80 · 55/80 · 34/80 |
| pilot/human-reserve/passive | 27 / 18–40 | 74 | 80 / 0 | 76/80 · 73/80 · 58/80 · 30/80 |
| pilot/mortality/passive | 27 / 18–40 | 62 | 80 / 0 | 65/80 · 56/80 · 24/80 · 3/80 |

Counts reaching a milestone use observed age at that boundary; death below it is a known non-survivor, a living person censored before it would be unknown. The baseline managed-herd and fed-only managed-herd cohorts each retain one living founder at the cutoff; those founders are censored, not counted as deaths. The other cohorts have no surviving founders. The death-age median uses observed deaths only and must be read with the deaths/censoring column; it is not a complete-cohort lifespan estimate. Death-age medians describe this selected adult founder cohort, not life expectancy at birth or a historical population. A family can retain adult descendants after every founder has died.

| Cohort | Born / adult / died <16 / still <16 | Generations 1 / 2 / 3 / 4 | Median adult descendants* | Care-person years |
| --- | --- | --- | --- | --- |
| combined/combined/passive | 56 / 51 / 4 / 1 | 39 / 14 / 3 / 0 | 3 | 251 |
| herd-feedback/feeding/herd | 198 / 145 / 4 / 49 | 59 / 66 / 67 / 6 | 17.5 | 863 |
| herd-feedback/feeding/passive | 62 / 58 / 0 / 4 | 34 / 23 / 5 / 0 | 5 | 286 |
| herd-feedback/yard-breeding/herd | 145 / 115 / 1 / 29 | 52 / 53 / 37 / 3 | 10.5 | 642 |
| herd-feedback/yard-breeding/passive | 87 / 75 / 3 / 9 | 44 / 25 / 17 / 1 | 6 | 384 |
| management/baseline15/herd | 206 / 149 / 3 / 54 | 60 / 71 / 71 / 4 | 17.5 | 887 |
| management/baseline15/prepared | 144 / 120 / 3 / 21 | 51 / 56 / 35 / 2 | 10 | 636 |
| pilot/baseline15/passive | 61 / 57 / 1 / 3 | 34 / 23 / 4 / 0 | 6 | 283 |
| pilot/control30/passive | 48 / 46 / 2 / 0 | 33 / 13 / 2 / 0 | 5 | 232 |
| pilot/human-reserve/passive | 53 / 49 / 1 / 3 | 33 / 14 / 6 / 0 | 4 | 252 |
| pilot/mortality/passive | 61 / 50 / 3 / 8 | 33 / 17 / 11 / 0 | 5.5 | 272 |

Children still younger than sixteen are right-censored for survival to adulthood, not counted as adult failures or deaths. Raw mother records retain first/last birth ages, child IDs and counts by father, including women with zero births. The summary includes eligible partnership rolls and formed pairs. Existing kinship exclusions remain in force. High managed Food (median 1,910 at year 80 in the baseline herd policy), 887 care-person years and its Materials reserve must be read alongside population; this is not proof of a fully balanced economy.

## Cattle, exposure and accounting

| Cohort | Cattle births / deaths | Expected cattle deaths | Exposed / sheltered animal-years | Overcrowded animal-years | Herds lost at 80* |
| --- | --- | --- | --- | --- | --- |
| combined/combined/passive | 3852 / 1984 | 1963.50 | 38109 / 0 | 0 | 1/7 |
| herd-feedback/feeding/herd | 48 / 72 | 58.66 | 6 / 935 | 259 | 8/8 |
| herd-feedback/feeding/passive | 1258 / 803 | 811.13 | 14303 / 0 | 0 | 4/7 |
| herd-feedback/yard-breeding/herd | 18 / 42 | 38.89 | 4 / 655 | 0 | 8/8 |
| herd-feedback/yard-breeding/passive | 0 / 24 | 23.10 | 321 / 0 | 0 | 8/8 |
| management/baseline15/herd | 63 / 87 | 77.84 | 12 / 1113 | 431 | 8/8 |
| management/baseline15/prepared | 3856 / 2026 | 2022.46 | 37172 / 0 | 0 | 2/7 |
| pilot/baseline15/passive | 2078 / 1115 | 1033.39 | 20346 / 0 | 0 | 3/7 |
| pilot/control30/passive | 4143 / 1745 | 1729.40 | 38412 / 0 | 0 | 2/7 |
| pilot/human-reserve/passive | 4655 / 2354 | 2325.21 | 43846 / 0 | 0 | 0/7 |
| pilot/mortality/passive | 1814 / 983 | 995.55 | 17793 / 0 | 0 | 1/4 |

The default passive cohort has 2,078 cattle births and 1,115 deaths despite applied exposure; net growth is not evidence that exposure is missing. Expected deaths are the sum of actual per-animal mortality probabilities, not an expectation calculated from final herd size. Full natural/crowding/flat/exposure components, outgoing weather frequencies, animal age/sex, eligible-cow years and feeding required/consumed/shortfall are stored separately. Slaughters and transfers are zero by policy. Every observed annual row asserts exact Food, Materials and cattle-count conservation; all residuals are zero.

## Validation and rollout boundary

- Public campaign/Core tests: default stock/facts/config, explicit overrides including zero, old import, saved-rule restarts, CPU separation, shared session/book and new-after-import.
- Public annual-path tests: diagnostic non-interference, incoming/outgoing weather, split/save replay, exposure, shelter, third/fourth children, QA proposals and CLI evidence checks. Existing lifecycle tests cover bull absence, calf ageing and birth interval.
- Browser: actual New campaign, import, restart and export in all three views. [Results](browser/results.json).
- Complete suite: **680 tests; 678 passed, 0 failed, 2 existing optional asset-fixture skips** (generated house/yard fixtures and frozen r3 character surfaces). They are not skipped because another check failed.
- TypeScript/Vite build passed; character validation passed for 20 assets / 36 GLBs, including Lab preview audits. Manual diff/format review; no repository formatter is configured.
- Seven long repeats match final state, all annual rows, decisions, commands, mother/founder/descendant records and configuration exactly across a year-40 save/load. Instrumented versus uninstrumented Core also matches RNG and events.

No save schema migration is needed for the approved opening change: Food is already explicit in saved Landing configuration. Any selected future fertility/feed/capacity rule needs a versioned opt-in experiment or explicit saved rule flag and a legacy default that preserves the current equation. Loading a save must never synthesize births/deaths or rewrite the Family Tree, personal history or frozen book. Restart retains saved rules; a new campaign gets future approved defaults.

## Reproduce

Run from the repository root. Output directories must not already contain a manifest, so old evidence is not overwritten.

```text
node --test tests/population-continuity.test.mjs
node scripts/qa/run-population-study.mjs --out=scratch/population/pilot
node scripts/qa/run-population-study.mjs --candidates=baseline15 --policies=prepared,herd --out=scratch/population/management
node scripts/qa/run-population-study.mjs --candidates=feeding,yard-breeding --policies=passive,herd --out=scratch/population/herd-feedback
node scripts/qa/run-population-study.mjs --candidates=combined --out=scratch/population/combined
node scripts/qa/run-population-study.mjs --candidates=control30,baseline15,human-reserve,mortality,feeding,yard-breeding,combined --seeds=32 --replay=true --out=scratch/population/replay
node scripts/qa/summarize-population-study.mjs scratch/population
node scripts/qa/verify-population-study.mjs
node scripts/qa/check-population-entry-points.mjs
```

The verifier audits the committed evidence and current source fingerprints. The browser script defaults to a local Vite at 127.0.0.1:5190; POPULATION_QA_URL and PLAYWRIGHT_MODULE can point to another local server/runtime. Its screenshots are supporting entry-point evidence, not a new visual/environment review. The numerical inputs/configurations and compressed raw observations remain the primary research record.
