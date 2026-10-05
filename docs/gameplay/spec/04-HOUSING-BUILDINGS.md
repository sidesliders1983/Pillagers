# 04 — Housing & Buildings

## HOUSE-001 — Housing priority
**Status:** Canonical

> **As a player, I want households to reuse existing shelter before consuming Materials, so that settlement history matters.**

Order: suitable vacant house → build permanent house for 10 Materials if affordable → Tent. Player may override valid residence assignment.

## HOUSE-002 — Tents
**Status:** Canonical; Prototype productivity

> **As a player, I need emergency housing with meaningful downside, so that lack of Materials does not block families but permanent housing remains valuable.**

Rules: 0 upkeep; residents currently 50% productivity; partnerships/children allowed; bad weather can increase mortality risk.

## HOUSE-003 — Maintenance debt and vacancy
**Status:** Canonical

> **As a player, I need unused or unmaintained buildings to deteriorate, so that inherited infrastructure cannot be stockpiled forever without activity.**

Rules:
- occupied + unpaid full upkeep => +1 debt/Winter;
- vacant => 0 upkeep and +1 debt/Winter;
- 3 consecutive debt Winters => collapse;
- paid occupied upkeep resets debt 0;
- reoccupation before collapse stops vacancy decay.

Acceptance:
- vacant 1 Winter => debt 1/upkeep 0;
- vacant 3 Winters => collapse;
- reoccupied at debt 2 + upkeep paid => debt 0.

## HOUSE-004 — Collapse and salvage
**Status:** Canonical

Collapse removes permanent Building; occupants move to Tent; salvage = 50% of total Materials invested in base + upgrades.

## BUILD-001 — Economic workplace
**Status:** Canonical

> **As a player, I want homes to carry economic specialization, so that infrastructure and family/work decisions reinforce each other.**

Specialization belongs to Building; does not auto-change with occupation; only matching work receives bonus.

## BUILD-002 — Workplace upgrades
**Status:** Canonical structure; Prototype values

| Level | Cost | Matching productivity | Total upkeep |
|---|---:|---:|---:|
| Base | — | +0% | 1 |
| I | 5 | +25% | 2 |
| II | 10 | +50% | 3 |
| III | 20 | +75% | 4 |

Upgrades remain with the Building.
