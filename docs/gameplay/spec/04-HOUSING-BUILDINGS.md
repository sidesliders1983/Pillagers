# 04 — Housing & Buildings

## Fjord Play selection

Selecting a house or tent immediately shows its residents, occupations and links
to individual person cards. The resident list is always visible in the initial
selection card on desktop and mobile; it does not require a disclosure click.
Specialization, upgrades and work management retain their existing actions.

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

## BUILD-003 — Construction feedback
**Status:** Canonical presentation v0.1 (#245)

Fjord Play presents newly built houses and housing upgrades with a 3.2-second timber
construction transition. The housing sequence is Tent → Hut → Homestead → Longhouse →
Great Hall. Tents remain emergency shelter and do not receive scaffolding. Farm Hut and
Farm Homestead use the same transition system at their corresponding house sizes.

Posts rise first, then ledgers, sparse braces, working planks and a ladder. Every target
building appears from its foundation to its roof, for both new builds and upgrades.
An upgrade also crossfades its previous model into
the target over 0.8 seconds (1.1–1.9 seconds into the transition), behind the standing
frame and accompanied by a brief dust effect. The frame
then disappears from its upper platforms down to its posts and ladder.

The transition communicates an already accepted Core command. Construction has no added
labour, cost, delay, collider or navigation rule. Occupancy, upkeep and production take
effect at the same canonical moment as before. Visual feedback finishes even while the
campaign clock is paused; a hidden browser tab suspends it. Loading a campaign displays
completed houses immediately, without replaying construction history.

See [the construction contract](../../CONSTRUCTION-TRANSITIONS-245.md) for envelopes,
shared scaffold presets, lifecycle ownership and review tooling.
