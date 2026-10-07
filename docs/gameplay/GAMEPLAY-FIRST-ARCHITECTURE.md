# Pillagers — Gameplay-first architecture

Status: canonical design direction.

## Principle

Pillagers is primarily a simulation/strategy game. The 3D Fjord is a presentation layer, not the owner of gameplay truth.

> Three.js is a consumer of Pillagers, not the place where Pillagers lives.

The game must remain playable and deterministic without the 3D renderer.

## Architecture

```text
                    Simulation Core
                    source of truth
                    /            \
                   /              \
          Gameplay Lab          Fjord World
          text / cards           Three.js
                   \              /
                    \            /
                     Gameplay UI
```

### Hard boundaries

- Simulation Core must not depend on Three.js.
- Gameplay Lab must not depend on Three.js.
- Rendering/animation state never owns canonical gameplay state.
- Player actions become explicit Simulation Commands.
- Same seed + same commands => same simulation result regardless of presentation.
- Deleting/disabling the renderer must not change Winter 800 -> Winter N outcomes.

## Gameplay Lab

Before deeper 3D production, prove the core loop in a text/card-first web interface.

Minimum surfaces:
- settlement header: Winter, population, Food, Materials, trends;
- Household/Building cards;
- Person cards;
- Lineage;
- Event log;
- direct actions for occupations, caregivers, housing and workplace upgrades;
- advance Winter.

Resources are integer stocks. Productivity changes work/time required to create the next integer resource unit rather than creating fractional Food/Materials.

The work model should remain compatible with fast headless `advanceWinter()` and later continuous presentation.

## Fjord

The current Fjord remains valuable as the immersive view of canonical state.

Examples:
- a Farm upgrade changes simulation state first, then the Fjord renders the richer Farm;
- building collapse is decided by the Simulation Core, then visualized;
- CharacterDNA determines persona identity; 3D represents it;
- work animations visualize production but do not determine it.

See issue #23 for the implementation brief.


## Canonical session-time model

Pillagers is currently designed as a **session-based simulation**, not a persistent/offline world.

> **The clan lives while the player plays. When the player stops, the world freezes.**

### No offline progression

For the canonical v0.1 direction:

- simulation time does **not** advance while the game is closed/offline;
- Food/Materials production does not continue offline;
- personas do not age offline;
- births/deaths do not resolve offline;
- cattle do not consume/reproduce offline;
- weather does not resolve offline;
- buildings do not decay/collapse offline;
- raids/attacks do not happen while the player is absent.

This is a deliberate gameplay/product decision, not a technical limitation.

The goal is to avoid designing around real-world timers, protection windows, notifications, login pressure or FOMO. Important consequences should happen while the player is present and able to make decisions.

### Canonical time vs presentation speed

Canonical simulation time remains:

- one **Winter** = a fixed number of deterministic integer simulation ticks;
- age and long-term history are measured in Winters;
- real-world seconds per Winter are **not canonical**.

The Gameplay Lab should expose Winter duration / simulation speed as a development parameter so different rhythms can be playtested without changing simulation rules.

Initial test range:

- ~1 minute per Winter;
- ~3 minutes per Winter;
- ~5 minutes per Winter.

Also support pause/time acceleration where practical.

The correct duration should be determined empirically from gameplay rather than fixed upfront.

### Rhythm design target

The desired rhythm is:

```text
settlement runs
      ↓
player accelerates quiet periods
      ↓
meaningful event / risk appears
      ↓
slow down or pause
      ↓
player decides / intervenes
      ↓
simulation continues
```

Examples of meaningful events:
- birth / adulthood / death;
- childcare decision;
- Severe Winter;
- Food/Materials pressure;
- building maintenance/collapse risk;
- reconnaissance result;
- raid/attack;
- cattle crisis;
- occupation or housing decision.

### Combat implication

Combat does not require a different canonical calendar.

A Winter contains sub-winter ticks. Local reconnaissance, travel and tactical raids can consume a fraction of a Winter, while distant expeditions may span multiple Winters.

This allows tactical actions to take minutes of player-facing time without forcing the demographic simulation to use real-world 24-hour Winters.

### Player-experience principle

> **Pillagers respects the player's absence. Nothing bad happens because the player chose not to play.**

Offline/persistent-world progression is therefore out of scope for the initial game direction. Because presentation speed is decoupled from canonical simulation ticks, this decision is not an architectural point of no return and can be revisited later if playtesting provides a compelling reason.
