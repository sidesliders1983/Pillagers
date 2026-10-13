# Pillagers — Gameplay-first architecture

**Status:** Canonical architecture, revised **2026-10-13** under [GP-007](../../GAME-PRINCIPLES.md#gp-007--fjordside-is-the-single-3d-player-facing-game) and [#140](https://github.com/sidesliders1983/Pillagers/issues/140).

## Permanent principle

Pillagers is primarily a simulation/strategy game. **Simulation Core owns game truth; Three.js only presents it.**

> Three.js is a consumer of Pillagers, not the place where Pillagers lives.

The canonical game must remain **deterministically executable without a renderer** for automated tests, repeated seeds, batch playtests and consistency checks. This is **not** a requirement to maintain a second player-facing 2D game.

## Current player-facing architecture

```text
                 Simulation Core
              deterministic game truth
       (commands, time, rules, events, saves)
                         │
               Campaign / Session
         shared management, lore, save/load
                         │
                Fjordside 3D Game
       Three.js projection + gameplay interface

          ┌───────────────────────────────┐
          │ Developer labs / headless QA  │
          │ No second player-facing game  │
          └───────────────────────────────┘
```

### Hard boundaries

- Simulation Core has **no Three.js or browser UI dependency**.
- Every player action becomes an explicit, validated Simulation Command.
- Rendering, visibility/culling, animation and visual entity positions never own canonical gameplay state.
- Same seed + same commands/ticks => same simulated outcomes with or without the 3D renderer.
- Existing state, lineage, occupation, housing, mortality, cattle, weather, economics and Lore/event authority remain unaffected by removal of a presentation surface.
- Session time continues only under the existing rules while the player is present; this is not a switch to offline/persistent-world progression.
- Preserve import/export, old saves and safe legacy routes during a staged migration.

## Status of the original text/card Gameplay Lab and 2D settlement board

The original plan in [#23](https://github.com/sidesliders1983/Pillagers/issues/23) was **correct for the initial prototyping phase**: a text-first Gameplay Lab proved the core game loop, and the [#49](https://github.com/sidesliders1983/Pillagers/issues/49) isometric board offered a second presentation. That sequencing is **historical, not a current product requirement**.

**Approved change, 2026-10-13:** `/fjord-play` becomes the sole player-facing game. `/play` and `/gameplay-lab` stop receiving gameplay UI features and are retired after dependency isolation, UI parity checks and save compatibility tests. The specialized Environment/Character/Asset labs, headless mechanics tests and one-off developer diagnostics continue.

### Implementation seam (review current repository)

Currently `src/fjord-play/FjordPlay.ts` reuses `src/play/SettlementPanel.ts`, `src/play/SettlementBrowser.ts`, `src/play/SharedSettlement.ts`, and `src/gameplay-lab/GameplaySession.ts` / `updateView.ts`. These contain reusable **non-2D gameplay/session services**, despite folder names. Extract or preserve such dependencies before deleting the obsolete view implementation; avoid duplicated state owners.

The current `src/main.ts` also distinguishes the `/` standalone world prototype from `/fjord-play`. Promoting one player route must not remove developer access or unintentionally start a new campaign for returning users.

See [#140](https://github.com/sidesliders1983/Pillagers/issues/140) for the gated migration: documentation freeze → shared-service extraction → 3D entry/management parity → legacy UI removal. Preserve historical source documents for implementation provenance rather than rewriting them as though 2D had never existed.

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

The 3D Fjord gameplay controls (and headless test configuration) should expose Winter duration / simulation speed as a development parameter so different rhythms can be playtested without changing simulation rules.

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
