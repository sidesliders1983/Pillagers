# 03 — Work & Economy

## WORK-001 — CharacterDNA aptitude
**Status:** Canonical

> **As a player, I want personas to differ in occupational aptitude, so that assigning real people creates meaningful trade-offs.**

Rules: reuse canonical CharacterDNA traits; heritage/appearance do not currently modify fit; aptitude affects effectiveness but does not prohibit player assignment.

Research evidence: [occupation aptitude v0.3 measurement (#78)](../../qa/occupation-aptitude-v03/report.md) compares 1,000 founders, inherited descendants and matched economies. Its candidate mappings are QA experiments; the canonical formula and gameplay balance remain unchanged.

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
