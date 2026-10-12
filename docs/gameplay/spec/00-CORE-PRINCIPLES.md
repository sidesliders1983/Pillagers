# 00 — Core Principles

## CORE-001 — Gameplay is the product
**Status:** Canonical

> **As a player, I want meaningful decisions about my clan to drive the game, so that the 3D world supports gameplay rather than replacing it.**

Rules:
- Pillagers is primarily a simulation/strategy game.
- The 3D Fjord is a presentation layer.
- Visual fidelity must not block gameplay validation.

Acceptance:
- Given final 3D assets are unavailable, when Gameplay Lab runs, then the core game remains playable through state, cards and commands.

## CORE-002 — One canonical Simulation Core
**Status:** Canonical

> **As a game system, I need one renderer-independent source of truth, so that Gameplay Lab, Fjord and CPU clans resolve the same rules.**

Rules:
- Simulation Core has no Three.js dependency.
- Rendering/animation never owns gameplay truth.
- Player actions resolve to explicit simulation commands.
- Same seed + commands produce the same canonical outcome regardless of presentation.

Acceptance:
- Headless and rendered runs with identical seed/commands have identical canonical outcomes.
- Disabling the renderer removes no gameplay rule.

## CORE-003 — Controlled simulation depth
**Status:** Canonical

> **As a player, I want depth where it creates consequential choices, so that Pillagers remains a strategy game rather than an all-in-one life simulation.**

Rules:
- Personas: deep simulation.
- Cattle: medium lifecycle simulation.
- Buildings: state/upgrades/upkeep.
- Resources: abstract integer stocks/work progress.
- Environment: Region/Site modifiers.
- Weather: Winter-level risk.
- Crops, fish populations and individual trees stay abstract unless later gameplay justifies more depth.

## CORE-004 — Autonomous life, voluntary cultural investment
**Status:** Canonical northstar; future implementation and numeric balance remain open

> **As a player, I want the community to live autonomously while I choose to invest resources in shared cultural moments, so that social cohesion helps residents defend their settlement and withstand harsh conditions together.**

Rules:
- Cultural investment strengthens collective resilience rather than serving as a generic production upgrade.
- Weddings, storytelling/music gatherings, religious ceremonies and possible remembrance events use a shared future cultural-event system.
- Ordinary relationships and life events do not depend on buying a celebration.
- Cohesion primarily provides bounded positive settlement-defence and harsh-weather-resilience modifiers, not guaranteed outcomes or magical weather changes.
- Additional approved directions are recovery after loss, transfer of craftsmanship through real mentors, and newcomer/captive integration. Exact mechanics remain open.
- Better raid coordination as a bounded success modifier is an exploratory candidate, not a live rule or a universal combat bonus.
- The existing caregiver-proxy system remains independent of cohesion; no second care system is required.
- Cultural support remains optional; no mandatory festival cycle or offline penalty is introduced.
- Rendering and AI narration cannot generate cohesion or gameplay consequences.

Detailed contract: [10 — Cultural Life & Social Cohesion](10-CULTURAL-LIFE-COHESION.md), under [GP-005](../../../GAME-PRINCIPLES.md#gp-005--autonomous-cultural-life-cohesion-strengthens-collective-resilience).
