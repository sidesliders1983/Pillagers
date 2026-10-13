# ADR-0007 — Single 3D player-facing gameplay with headless Simulation Core

- **Status:** Accepted product direction; implementation pending in [#140](https://github.com/sidesliders1983/Pillagers/issues/140)
- **Decision date:** 2026-10-13
- **Scope:** User-facing gameplay presentation and migration only
- **Authority:** [GP-007](../../GAME-PRINCIPLES.md#gp-007--fjordside-is-the-single-3d-player-facing-game)

## Context

Pillagers previously proved the mechanics through a text/card Gameplay Lab (#23) and an isometric 2D settlement board (#49). It now has a canonical Simulation Core and an integrated `/fjord-play` 3D settlement with shared campaign management, lineage and lore. Maintaining two full gameplay UIs adds recurring work and no longer serves the current goal.

The old 2D UI code is not isolated: the 3D game imports shared modules from `src/play/` and `src/gameplay-lab/`, so wholesale directory deletion would be incorrect. The root `/` world prototype is also separate from the 3D gameplay route.

## Decision

1. **The single player game is Fjordside 3D** (`/fjord-play`, with the canonical entry route decided during implementation).
2. `/play` and `/gameplay-lab` are legacy player UI prototypes and receive no new player UX/gameplay features. Deprecate and safely retire them after extraction/parity.
3. **Simulation Core remains canonical and headless**, with deterministic state, typed commands, persistence and tests. Do not tie simulation progression or economy to render FPS, meshes or camera visibility.
4. **Developer labs remain independent tools** (Environment, Character, Asset and necessary diagnostics). Maintain headless regression and batch simulation tools.
5. Preserve user save formats, identifiers, campaign handoff/storage, pause/clock behavior, narrative history, family-tree views and command accessibility; do not silently reroll or restart sessions during route migration.
6. Deliver through small, reviewable stages defined in #140. Retire old UI implementation only after verification, not in the initial documentation PR.

## Consequences

- Player UI development concentrates on Three.js Fjord and in-world management.
- Shared session, command, selection, save/lore and DOM update utilities must be independent of 2D view code even if their current paths suggest otherwise.
- The former `GAME-SIMULATOR-ROADMAP.md` v0.1–v0.4 text-first presentation ordering remains historical evidence; the active roadmap is now 3D-first.
- Headless/no-renderer reproducibility remains mandatory, but does **not** require maintaining a standalone text-based consumer UI.
- No automatic offline progression, new gameplay balance, renderer migration or removal of historical QA evidence is part of this decision.

## Validation/rollback requirements

- Legacy saved campaigns load and export with equivalent canonical time/state/lineage/lore and world layout.
- `/fjord-play` supports existing player commands and UI affordances; old direct routes are safe.
- Same seed, command sequence and ticks produce identical Core results without a renderer.
- Developer labs and build/CI remain functional; performance deltas are measured separately.
- If parity cannot yet be achieved, delay destructive 2D deletion and keep a compatibility adapter until it can.
