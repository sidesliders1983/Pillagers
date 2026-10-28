# 09 — Player Actions

## PLAYER-001 — Direct occupation authority
**Status:** Canonical

> **As a player, I want to assign or change a resident's occupation, so that I can actively solve settlement problems rather than only influence autonomous decisions.**

Rules:
- player may override autonomous occupation preference;
- aptitude still affects effectiveness;
- switching consequences still apply.

## PLAYER-002 — Caregiver assignment
**Status:** Canonical

> **As a player, I want to choose an eligible caregiver, so that I can decide which labor capacity is sacrificed after childbirth.**

## PLAYER-003 — Housing authority
**Status:** Canonical

> **As a player, I want to build housing and assign residents/households to valid residences, so that housing strategy is an active decision.**

## PLAYER-004 — Building investment
**Status:** Canonical

> **As a player, I want to specialize and upgrade economic buildings, so that Material surplus can be converted into persistent productive infrastructure.**

## PLAYER-005 — Expedition/raid composition
**Status:** Canonical direction for v0.2

> **As a player, I want to choose which named personas leave on reconnaissance or raids, so that external opportunities carry visible opportunity cost and personal risk.**

## PLAYER-006 — Social autonomy boundary
**Status:** Canonical

> **As a player, I want strong settlement authority without directly controlling every life event, so that personas remain people rather than interchangeable units.**

Player generally does not directly:
- force love/partnership;
- force a birth;
- edit CharacterDNA;
- prevent natural aging/death.

## PLAYER-007 — Respect absence
**Status:** Canonical

> **As a player, I should not be punished for choosing not to play, so that Pillagers creates engagement through decisions rather than FOMO.**

Acceptance:
- no adverse or beneficial canonical progression occurs purely because wall-clock time passed while offline.

## PLAYER-008 — Support culture and social cohesion
**Status:** Canonical northstar; not implemented by this documentation change

> **As a player, I want to choose when and how much to invest in shared cultural events, so that my settlement gains solidarity and resilience without my having to control residents' private lives.**

Rules:
- The player may support weddings, storytelling/music gatherings, religious ceremonies and possible funerals/remembrances through deliberate resource spending.
- Timing, scale and participation are future choices to specify, not a command to force love, a birth or a death.
- The intended benefit is social cohesion, primarily aiding settlement defence and survival through harsh conditions; no automatic Food/Materials production buff.
- Recovery after loss, mentorship across households and the acceptance/integration of newcomers including captives are additional supported directions. Existing caregiver-proxy access is not gated by cultural investment.
- A possible raid-success advantage through group coordination requires separate evaluation; no new raid modifier is enabled here.
- Declining an optional celebration does not block autonomous clan life or create a missed-event punishment.
- Exact costs, cooldowns, participation, gain and modifier formulas require separate design/calibration.

See [Cultural Life & Social Cohesion](10-CULTURAL-LIFE-COHESION.md) and CORE-004.

## Implemented v0.4 slice

[World Expeditions v0.4](../../WORLD-EXPEDITIONS-V04.md) records the implemented region graph, reusable groups, optional Surveillance, mission provisions/risk and one-category carrying capacity. Named residents and actual target assets move through Simulation Core commands; the player UI is /play and Gameplay Lab retains shared-save debugging.

## PLAYER-009 — Settlement campfire (implemented #97 spike)

Select the stone campfire in `/fjord-play` to light or extinguish it in the contextual panel.
The panel shows whether it is burning, remaining prepaid fuel, and the cost to relight.
Lighting without prepaid fuel requires one Material; an unavailable action explains why.
[Fuel rules](../../SETTLEMENT-CAMPFIRE.md#campfire-fuel--97-spike) apply throughout the year.
Ceremonies and the future settlement information panel remain outside this spike.

## The Founding Journey — alpha presentation (#263 / #270)

New players may use three optional chapters about their autonomous community,
exploration/discovery and preparation for conflict. Every chapter is freely
accessible. Real homes, upgrades, witnessed species, Recon, personal supported
equipment and optional Pillage outcomes count, including actions done out of order.
Show me navigates/reviews existing UI; it never issues Core commands or supplies
resources. Skip, defer and replay are per-history presentation metadata.
Ordinary campaign entries stay paused until deliberate Play or the explicit
**Explore on my own** invitation choice. **Guide me**, Continue/import and recovery
remain paused.

See [The Founding Journey v0.1](../FOUNDING-JOURNEY-V01.md) for the current
predicates, knowledge limits, paused-entry exception and QA contract.
