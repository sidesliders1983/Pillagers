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
