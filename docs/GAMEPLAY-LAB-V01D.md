# Gameplay Lab v0.1D — clickable cycle cadence

Issue #29 builds on the playable Lab delivered by #28. Most requested household, person and livestock interactions already use canonical Simulation Core commands. This pass makes the cycle meaning explicit and adds focused evidence for cadence independence instead of duplicating those mechanics.

The Cycle duration selector offers 1, 3 and 5 minutes per cycle. One cycle is one Winter, containing 1,000 ticks. Duration is transient browser pacing only; changing it does not change canonical state, random draws, economic rules or event history. Pausing, hidden-tab pause and the fractional tick remainder retain their existing semantics.

## Acceptance coverage

| Requirement | Implementation and evidence |
|---|---|
| Playable without Three.js | Independent Gameplay Lab route; browser QA observes no Three.js or GLB requests |
| 1 and 5 minutes per cycle | Cycle duration selector; both choices exercised with Start/Pause in browser QA |
| Cadence-independent rules | Public session test uses different elapsed times, switches cadence midway and applies ship/housing/occupation/cattle commands; complete canonical states and histories match core commands exactly |
| Household/building interaction | Cards show residents, residence, occupancy, upkeep, debt, investment and upgrades; housing, moving, specialization and upgrades dispatch core commands |
| Person interaction | Resident and lineage cards show family, DNA, occupation aptitude and work; assignment is available from work age; eligible caregiver controls use core eligibility |
| Livestock interaction | Animal cards show individual identity, sex, age, shelter and herd totals; assignment, soft-cap occupancy and slaughter use core commands |
| Immediate results | Successful actions render stocks, resident/building/animal cards and canonical events immediately |
| Optional Fjord | No changes to world simulation or renderer; the existing navigation link remains sufficient |

The implementation adds no cycle-based game rules, livestock depth, raids, combat or trade. Session engagement at different cadences remains a human playtesting question, not an automated assertion.

## Playtest

Open /gameplay-lab. Select 1 minute per cycle, press Start, inspect residents and choose an occupation or housing decision. Pause whenever needed. Restart with Use the same founders checked and repeat at 5 minutes per cycle. Compare the time available to inspect state and make meaningful decisions. Use JSON export to retain a run's factual history.

## Verification

Run node --test tests/*.test.mjs, TypeScript checking and the Vite production build. With the development server on port 5180, run scripts/qa/check-gameplay-lab.mjs using a Playwright runtime. Detailed evidence is in docs/qa/gameplay-lab-v01d-report.md.
