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

### Active presentation ownership (#209)

This is the narrow implementation map for the scene-lifecycle extraction, at the existing architecture location tracked by [#17](https://github.com/sidesliders1983/Pillagers/issues/17). It does not replace the authority of Core, add an engine abstraction, or prescribe the scheduling/quality changes in #210/#211.

| Owner | Responsibility and lifetime |
| --- | --- |
| `SimulationCore`, `GameplaySession`, `SharedSettlement` | Authoritative commands, time, RNG, events, discovery, persistence and selection. The scene reads the existing cached `FjordCampaign.readProjection()`; it does not tick or save Core. |
| `FjordPlay` | Restores the campaign, composes DOM/gameplay interfaces, queues commands, owns the canonical clock interval and playback intent, and installs the single renderer frame callback. It retains the existing page/background/context epochs, recovery dialog, generation/arrival controls and failed-import restoration. Its teardown stops the clock, aborts lifecycle listeners and disposes its UI owners and the active scene. |
| `createFjordScene` in `FjordScene.ts` | Constructs, replaces, updates and releases the active Three.js presentation. Owns the renderer, scene root, camera/controller, asset/model factories, resident/rival layers, current world, discovery fog, lighting, dressing, visual effects, target marker and island map. `initialize`, `replace`, `sync` and `dispose` are its lifecycle boundary; concrete camera/input/GPU-preparation ports let the entry point retain existing interaction and recovery policy. |
| `FjordScene` visual bindings | Owns its ResizeObserver, reduced-motion/effects, quality and saved-view bindings. The host supplies the current loading operation and stopped state. Work-start/end notifications retain the existing campaign-clock load gate; they never advance canonical time. The entry point supplies frame eligibility; scene disposal stops that renderer's frame loop. |
| Existing resource owners | `FjordEntities` owns resident instance roots, rings and structure season state; `FjordModels` owns native Meshy actors and its model templates; `AssetManager` owns the scenery templates borrowed by worlds and houses. `WorldFactory`, `RivalScene`, `SettlementDressingLayer` and the existing effect/lighting classes retain their own resource disposal. World replacement retains the shared factories; final scene disposal releases them. |
| Existing UI owners | `FjordPlay` retains mission panels/markers, selection and production labels, header/mobile shell, book/history views and command/form bindings. The scene borrows the labels and the attached mission-marker root. Their actual owners release them; scene replacement does not recreate forms or discard in-progress edits. |

The extraction retains the same 500 ms campaign-clock cadence, visual update frequencies, quality defaults, entity reconciliation, source assets, independent home/rival ground caches and save formats. Generation workers and cancellation remain in `IslandLoading`; graphics recovery continues to use the existing context epoch and GPU preparation. This is a maintainability change, with no claimed frame-rate improvement.

Lifecycle defects exposed by delayed-load/disposal checks are isolated from the mechanical extraction in separate commits and recorded with the QA evidence. They must not be hidden by changing the ordinary baseline or weakening parity checks. A simple revert removes the extraction/fix commits together; canonical campaigns need no migration. Physical iOS acceptance is pending unless a device is actually tested.

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
