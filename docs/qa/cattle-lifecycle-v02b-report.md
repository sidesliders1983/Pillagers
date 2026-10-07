# Cattle lifecycle v0.2B — QA report

Scope: #42. New campaigns use persistent cattle ancestry, age-derived life stages, herd-local reproduction and age/crowding mortality. Existing saves retain static cattle. Food baseline remains unchanged at 10 for the existing Food occupations.

## Agreed rules

- Each active Farmyard is one herd; all unassigned animals share the outside herd.
- Young: age below 1; Young Adult: 1–under 2; Adult: 2+. Output and full consumption start at 2.
- Breeding requires a cow and bull aged 2–12 in the same herd. Each eligible cow has a 50% annual chance, minimum two Winters between births. First eligible bull by ID; saved RNG selects sex 50/50. Parentage is retained; kinship does not block this prototype.
- Calves inherit their mother's assignment, including above the soft cap.
- Annual age mortality: under 2: 2%; 2–9: 0.5%; 10–14: 5%; 15+: 15%. Each excess Farmyard animal adds 2 percentage points for every member; total risk is capped at 100%. Risks use pre-death occupancy. Weather modifier defaults to zero.
- Mortality precedes consumption. Calving follows maintenance and final Farmyard reconciliation. Newborns do not face mortality at their birth boundary. Completed work-year output is retained.
- Death keeps identity/parents/history, clears assignment, and stops future output/consumption. Slaughter remains a distinct factual event with one-off Food.

## Automated validation

Public boundaries: Simulation Core commands, save/load, public cattle inspection and Gameplay Lab browser controls. Tests cover stages, cooldown, ancestry, no-bull and separate-herd cases, calf Food rules, soft-cap births, crowding risk, death cleanup, legacy migration, invalid genealogy and deterministic split/save replay. Existing founding-asset tests explicitly disable lifecycle rules when measuring fixed-herd economics.

Validation on the final implementation: **96 tests passed**, TypeScript checking passed, and the production build passed.

The livestock browser check verifies calf parents and stages, frozen slaughter age, disabled deceased actions, local save/load and distinct natural death. Existing Gameplay Lab and resident mortality browser checks are also retained.

## Reproduction

Run `node --test tests/*.test.mjs`, TypeScript checking and the Vite production build. Browser scripts use the available Playwright installation and Microsoft Edge against the local Gameplay Lab.

Run `node scripts/qa/run-cattle-calibration.mjs --seeds 100 --winters 50 --verify` for 100 seeds × 50 Winters in each of two policies, followed by a complete repeat. Every scenario includes a midpoint save/load and checks cattle identity conservation, stage counts and retained genealogy.

Outside policy makes no player decisions. Farmyard policy salvages the ship, assigns the first founder by ID to farmer, houses that household and assigns all three founding cattle once. Thereafter both use canonical autonomy. Losing the farmer or house exposes animals; the harness never replaces farmers or reassigns cattle. These policies describe whole campaigns and do not isolate shelter's causal effect, because their opening occupation/housing also differ.

[Saved configuration and fingerprints](cattle-lifecycle-v02b-config.json) · [Annual trajectories](cattle-lifecycle-v02b-trajectory.csv) · [Complete results, gzip](cattle-lifecycle-v02b-results.json.gz) · [Summary](cattle-lifecycle-v02b-summary.json) · [Browser checks](cattle-lifecycle-v02b-browser-report.json).

The saved configuration, runtime and source/harness fingerprints accompany the CSV trajectories and compressed complete results. Food production, actual consumption and required consumption are recorded separately. No scripted slaughter is performed, so slaughter counts are expected to be zero; the command is exercised in core/browser QA.

## Manual QA

1. Restart a new campaign, inspect the three founding animals and their Adult stage.
2. House a farmer's household and assign each animal individually. Observe normal sheltered output and the live overcrowding count as the herd grows.
3. Advance Winters: newborn calves show Young and their real parents; after one and two Winters they show Young Adult and Adult. Verify automatic maternal shelter assignment.
4. Slaughter the only eligible bull. Breeding stops until another bull in the same herd becomes eligible. Inspect the retained slaughter record.
5. Change the last farmer's occupation: the Farmyard function disappears and its animals become exposed. Recreating the function does not automatically reassign them.
6. Save, advance, reload and compare age/stage, ancestry and assignments. Import a pre-lifecycle save to verify its static herd rules remain in force.

## Measurement results

**PASS: all 200 scenarios (100 seeds per policy, 50 Winters) repeated identically**, including annual measurements, genealogy/event facts and complete final state hashes. Each batch executes 10 million canonical ticks. Results hash: `c952a7064a93a68fd003fcc147ae608b3dd45053718642e031d88ceb9eaa83b2`.

| Metric | Outside opening | Farmyard opening |
|---|---:|---:|
| Births | 71,666 | 6,663 |
| Natural deaths | 16,888 | 3,465 |
| Slaughters | 0 | 0 |
| Final herd median | 470 | 0 |
| Final herd P10 | 0 | 0 |
| Final herd P90 | 1,184.3 | 46.6 |
| Extinct runs / 100 | 13 | 58 |
| Overcrowded Winters / 5,000 | 0 | 2,465 |
| Cattle Food produced | 447,782 | 62,400 |
| Cattle Food consumed | 482,604 | 47,935 |
| Cattle Food required | 488,396 | 48,038 |
| Final cows | 27,554 | 1,736 |
| Final bulls | 27,524 | 1,762 |
| Final Young | 6,417 | 393 |
| Final Young Adult | 5,622 | 347 |
| Final Adult | 43,039 | 2,758 |

Counts and Food are totals across 100 campaigns per column; herd quantiles describe the 100 final living-herd sizes. Age-stage counts and sex counts are final totals. Every campaign starts with two cows and one bull.

The agreed prototype is **not balanced for long-term herd stability**: outside herds reach median 470 animals, while 58% of Farmyard-opening campaigns lose their entire herd. The outside model has no stocking or weather penalty, and reproduction continues without a Food-availability gate. The Farmyard opening applies its soft-cap mortality pressure, but homes/farmers can later disappear; these policy results must not be interpreted as a controlled shelter effect. At Winter 850, the Farmyard-opening cohort has 99 sheltered and 3,399 exposed living animals in aggregate. No automatic reassignment is performed.

Actual cattle consumption is below required consumption by 5,792 Food in the outside cohort and 103 in the Farmyard-opening cohort. There is no starvation mortality in this prototype. These figures expose pressure without silently changing the agreed rules or human Food baseline. Weather remains for #43; combined economy/herd calibration follows it. No animal DNA or inbreeding restriction is modeled.
