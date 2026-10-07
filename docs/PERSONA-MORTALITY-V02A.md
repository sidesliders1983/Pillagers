# Persona mortality v0.2A

Accepted design for #41.

Natural mortality runs once at the incoming Winter boundary, after completion of the previous work year and before consumption, upkeep, partnerships and births. Age derives only from birthWinter and the current Winter. Each living resident is considered in sorted ID order using the saved RNG; zero risk consumes no random draw.

Prototype annual mortality bands (minimum age / basis points): 0/10, 16/5, 50/50, 60/200, 70/500, 80/1000, 90/2000. Rates are game configuration, not historical claims. The final band continues indefinitely; there is no guaranteed death age.

Death retains identity, DNA, parents, Family membership and event/history records. It closes occupation participation, breaks both partner links, removes active Household membership and releases the residence of an empty household. Empty household records persist. Buildings follow existing vacancy, debt and collapse rules. PersonaDied records factual age, household, residence, occupation and former partner context at tick zero.

Maternal care ends on maternal death; care for motherless children is deferred. A dead donor is released and existing care selection can replace her. A child death shortens care to the youngest surviving child's care endpoint, ending care if none remain.

Existing mechanics saves migrate to an explicit zero-risk curve, preserving their replay. New campaigns use the prototype curve. Time/history-only saves remain time/history-only. No wall-clock mortality or automatic replacements.

Agreed TDD seams: public Simulation Core commands and save/load; Gameplay Lab display and actions. QA: 100 campaign seeds over at least 50 Winters, age-band deaths (children separately), observed lifespan percentiles, births/deaths, population trajectory and living founders. Observed lifespan is censored by the run horizon and is not a historical life expectancy estimate.
