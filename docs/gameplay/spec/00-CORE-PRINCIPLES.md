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
