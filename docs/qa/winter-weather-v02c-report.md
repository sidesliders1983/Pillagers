# Winter weather and economic risk — v0.2C QA
#43; dependent on cattle lifecycle #42 / PR #45.

## Outcome

PASS: 109 automated tests, TypeScript checking, production build and four browser checks. All 300 real-core scenarios repeat exactly, including state hashes and annual output. The production build retains the existing large Three.js chunk warning.

## Saved prototype rules

| Class | Probability | Food output | Adult cattle Food multiplier | Exposed resident risk addition | Exposed cattle risk addition | Future travel duration / extra risk |
|---|---:|---:|---:|---:|---:|---:|
| Mild | 20% | 110% | 1× | 0 | 0 | 1× / 0 |
| Normal | 55% | 100% | 1× | 0 | 0 | 1× / 0 |
| Harsh | 20% | 75% | 2× | +0.5 percentage point | +5 percentage points | 1.25× / +5 percentage points |
| Severe | 5% | 50% | 3× | +2 percentage points | +15 percentage points | 1.5× / +15 percentage points |

These are configurable game values, not historical climate estimates. Permanent houses and active Farmyards remove the additional weather mortality; natural mortality and cattle overcrowding remain. Adult consumption increases even in shelter. Calves retain their configured Food requirement (default zero) until age two. Food work and ongoing cow output receive the multiplier; Materials and slaughter do not. Risk additions share the existing death roll and cap at 100%. Travel modifiers are projected for a future system; no travel resolution is added.

## Reveal, preparation and compatibility

Each new campaign reveals Winter 800 weather at tick zero. Each subsequent Winter reveals its weather only after the preceding work, mortality, consumption, upkeep, partnership, birth and Farmyard reconciliation complete. For example, boundary 801 resolves outgoing weather 800 before announcing weather 801. Housing and cattle assignment before the boundary protect against the exposure addition at reckoning. Production/death events retain the outgoing weather class, region and Winter.

“Enable winter weather” defaults on and affects the next new or restarted campaign. It cannot alter the running campaign. Save/load restores the saved rule and current forecast without rerolling. Older saves without the weather extension remain disabled. Disabled campaigns take no weather RNG draws; regression tests compare complete outcomes/RNG with an equivalent pre-weather save.

## Measurement design

Seeds 0–99, 25 Winters (800–824 resolved), one current region per campaign. Even seeds salvage the ship, assign founder-1 as farmer, house that household and assign all founding cattle. Odd seeds make no player decisions. Neither policy makes subsequent repairs or reassignments. The 50/50 policy groups are descriptive and are not a paired causal shelter experiment: farmer deaths, career changes and maintenance can change shelter. Death counts reflect actual shelter at death, not initial policy. Naturally sheltered deaths are expected.

Every weather scenario reloads at midpoint. Every annual Food ledger is checked against real production and consumption events. The full 100-scenario weather batch and both 100-scenario economic groups are repeated and compared exactly. Weather draws use the saved RNG, so enabling weather also changes later stochastic life histories; ON/OFF comparisons assess the complete campaign rules, not an isolated output multiplier. Sequential seeds all initially draw Normal; frequencies below cover all 2,500 resolved Winters, excluding newly announced but unresolved Winter 825.

## Measured weather outcomes

| Class | Resolved Winters | Frequency | Winters with Food shortfall | Resident deaths sheltered / exposed | Cattle deaths sheltered / exposed |
|---|---:|---:|---:|---:|---:|
| Mild | 493 | 19.72% | 3 (0.61%) | 9 / 9 | 148 / 121 |
| Normal | 1429 | 57.16% | 38 (2.66%) | 13 / 20 | 372 / 292 |
| Harsh | 443 | 17.72% | 65 (14.67%) | 5 / 26 | 160 / 336 |
| Severe | 135 | 5.40% | 30 (22.22%) | 2 / 26 | 49 / 214 |

Deaths are all-cause counts, not estimates of deaths caused by weather. They do not adjust for animal/resident time at risk. Controlled public-core tests separately demonstrate shelter removing only weather exposure.

| Completed boundary | Food median (P10–P90) | Population median | Living cattle median |
|---|---:|---:|---:|
| 805 | 63 (13–124.4) | 13 | 6.5 |
| 810 | 75 (3–192.1) | 14 | 9 |
| 815 | 86 (7–266.2) | 15 | 10 |
| 820 | 78 (0.9–324.4) | 15 | 9.5 |
| 825 | 93 (7.4–369.4) | 15 | 10 |

Both opening policies lost their entire herd in 3/50 campaigns by boundary 825. These 25-Winter results do not replace the longer 50-Winter lifecycle report.

## Economy calibration at the unchanged Food baseline

The #39 harness uses default autonomy and no scripted decisions: 100 identical seeds × 15 Winters, Food production baseline 10 for farmer/fisher/hunter. Both current groups include persona mortality and cattle lifecycle.

| Rules | Campaigns with any Food shortage | Final Food median | Population median | Materials median |
|---|---:|---:|---:|---:|
| Archived pre-mortality / pre-weather #39 | 5% | 69 | 16 | 56.5 |
| Current, weather OFF | 8% | 66 | 15 | 59.5 |
| Current, weather ON | 40% | 42.5 | 14 | 52 |

Weather increases observed economic risk: current ON shortage incidence is 40% versus 8% OFF. The agreed rates are preserved; further balancing should consider reserves, cattle consumption and preparation rather than silently changing the worker baseline. Food shortfall is unmet consumption after stocks clamp to zero; this issue does not introduce starvation deaths.

## Reproduce and inspect

- Run `node --test tests/*.test.mjs`, TypeScript `--noEmit`, and the Vite production build.
- Run `node scripts/qa/run-weather-risk.mjs` for all 300 scenarios and the full repeat. This uses four workers and writes `artifacts/qa/winter-weather/`.
- Run the weather, Gameplay Lab, mortality and cattle browser QA scripts against port 5180 with the bundled Playwright dependency directory.
- Archived [manifest](winter-weather-v02c-manifest.json) stores exact configuration, seed range, runtime and normalized source fingerprints. [Summary](winter-weather-v02c-summary.json), [annual weather CSV](winter-weather-v02c-annual.csv) and [compressed complete results](winter-weather-v02c-results.json.gz) retain the measurements.
- Browser evidence: [weather](winter-weather-v02c-browser.json), [Gameplay Lab](winter-weather-v02c-gameplay-browser.json), [mortality](winter-weather-v02c-mortality-browser.json), [cattle](winter-weather-v02c-cattle-browser.json).

## Manual QA

1. Open Gameplay Lab. Confirm “Enable winter weather” is checked and a current Winter class is shown.
2. Uncheck it and start a new campaign from a seed or restart. Confirm “Weather disabled”; advancing a Winter must not create weather events.
3. Check it while that campaign is active. The current campaign must stay disabled until the next new/restarted campaign.
4. Restart with “Use the same founders” checked. Confirm the party is retained and the chosen weather rule changes for the new campaign.
5. Save locally, change the next-campaign checkbox and restart; load the save. Confirm the saved option and forecast return.
6. In Harsh/Severe, inspect the prominent warning, Food multiplier and exposed resident/livestock counts. Build a permanent farmer home and assign cattle; exposure counts decrease. Natural/overcrowding risk can remain.
7. Advance to the next Winter; confirm the preceding class is recorded on affected production/death outcomes before the new class is announced.
