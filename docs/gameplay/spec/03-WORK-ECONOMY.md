# 03 — Work & Economy

## WORK-001 — CharacterDNA aptitude
**Status:** Canonical

> **As a player, I want personas to differ in occupational aptitude, so that assigning real people creates meaningful trade-offs.**

Rules: reuse canonical CharacterDNA traits; heritage/appearance do not currently modify fit; aptitude affects effectiveness but does not prohibit player assignment.

Research evidence: [occupation aptitude v0.3 measurement (#78)](../../qa/occupation-aptitude-v03/report.md) compares 1,000 founders, inherited descendants and matched economies. Its candidate mappings are QA experiments; the canonical formula and gameplay balance remain unchanged. [Occupation profile calibration v0.3B (#85)](../../qa/occupation-profiles-v03b/report.md) follows up with differentiated weights and preferences, a limited mean-aware contrast, and paired base/protected-spoilage economy runs. Those profiles remain experimental pending a separate implementation decision.

## WORK-002 — Cultural occupation legacy
**Status:** Canonical

> **As a player, I want parents' work experience to help children learn the same craft, so that professions can become family traditions without becoming genetic traits.**

Relevant parental occupation history may provide apprenticeship advantage. Occupation history persists.

## WORK-003 — Autonomous career switching
**Status:** Canonical behaviour; Prototype cadence/modifier

> **As a simulation, I should change careers only for both economic and personal reasons, so that the population does not oscillate toward the currently scarce resource.**

Rules:
- review roughly every 5 Winters;
- switch requires real settlement need + credible personal fit;
- experience creates retention bias;
- first Winter after switch currently 75% productivity;
- player may override.

## ECON-001 — Integer resources
**Status:** Canonical

> **As a player, I want resources to be whole units, so that stocks and loot remain tangible rather than fractional accounting.**

Food/Materials stocks are integers. Productivity changes work/time per unit.

## ECON-002 — Work progress
**Status:** Canonical direction; exact scale Open

> **As a simulation, I need deterministic sub-Winter work progress, so that production supports fast Winter stepping and later continuous presentation.**

Rules: fixed integer ticks/Winter; integer/fixed-point work progress; when required work is reached create one integer resource unit; preserve valid excess progress.

## ECON-003 — Food reserve calibration

**Status:** Research only; production rules unchanged

[Food resilience v0.3 measurement (#77)](../../qa/food-resilience-v03/report.md) compares passive and prepared campaigns, annual Food spoilage of 5%, 10% and 15%, a protected reserve of two normal Winters, and separate regional farmer/fisher/hunter diminishing returns. All candidate storage and capacity rules are isolated QA experiments, not regular campaign options. No Storage building or starvation-death rule is introduced.

The experiment retains the merged weather rules: Harsh stops Food and Materials production and increases resident/adult cattle consumption by 50%; Severe halves Food production and triples adult cattle consumption while retaining normal resident consumption and Materials output. Exact saved configurations, work-equivalent capacity losses, Food ledgers and replay coverage are recorded with the results.

## ECON-004 — Campfire fuel (implemented #97 spike)

One Material prepays one complete burning year (1,000 simulation ticks). The fire starts off.
Extinguishing banks unused fuel. Refuelling occurs before the next unpaid burning tick,
then work and annual maintenance follow. Empty stock extinguishes the fire instead of
creating debt. There is no production or shelter bonus. Purchases are recorded in the
Clan Book Materials ledger. See [the precise timing and save contract](../../SETTLEMENT-CAMPFIRE.md#campfire-fuel--97-spike).

## ECON-005 — Smithery specialist production (#221)

Smiths make Wooden Spears and Wooden Shields; Leatherworkers make Leather-reinforced Shields from real Materials/Hides. Small saved targets count stored plus personally worn stock. Production reuses ordinary work, aptitude, care/age/absence and existing specialized-home upgrades. Hides remain a specialist stock, outside the universal HUD. See [the approved recipes, work/ownership contract and QA](../SMITHERY-V01.md).


## WORK 005 Mining

**Status:** Owner UAT approved; enabled for new physical island campaigns

[Mining v0.1](../MINING-V01.md) adds actual Miner assignments to discovered,
finite physical outcrops. It reuses the canonical aptitude, occupation history,
parental apprenticeship and integer work progress. Real travel precedes work;
blocked paths, unavailability and exhaustion stop extraction. Iron Ore is a
specialist integer stock with exact site-to-clan accounting. No historical
geography, base ten-occupation founder distribution or CPU automation is changed.
