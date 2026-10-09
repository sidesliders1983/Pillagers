# Pillagers Simulation Design Runs

These documents are **manual design simulations**, not outputs from the game runtime yet.

Purpose:
- explore rules before implementation;
- preserve discovered causal behavior;
- create concrete specifications/test scenarios for the future headless Simulation Core.

Files:
- `SIMULATION-RUN-001-DEMOGRAPHY.md`
- `SIMULATION-RUN-002-ECONOMY.md`
- `GAMEPLAY-MECHANICS-OVERVIEW.md` — current shared gameplay/simulation design baseline for collaborators

Next planned run:
- Run #003 with CharacterDNA-driven occupation aptitude, family experience, occupation switching, explicit kinship distance, and persistent residence/building state.

These runs are not historical models and the numerical rates are prototype design values.


## Canonical calendar update

Future simulation/game examples start at **Winter 800**.

- one simulation year runs winter-to-winter;
- player-facing ages are expressed as **winters**;
- internal age derives from `currentWinter - birthWinter`;
- the 1200-series dates in Run #001/#002 are preserved as legacy design-run notation rather than rewritten history.

Vacant permanent buildings now pay no upkeep but decay: each vacant winter adds one maintenance-debt step, and after 3 consecutive vacant winters the building collapses with the normal 50% salvage of invested Materials.
