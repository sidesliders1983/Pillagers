# 01 — Time

## TIME-001 — Canonical Winter calendar
**Status:** Canonical

> **As a player, I want clan history expressed in winters, so that time, age and survival share a strong thematic language.**

Rules:
- Game starts at **Winter 800**.
- One year runs winter-to-winter.
- Player-facing age is **X winters**.
- Age = currentWinter - birthWinter.

Acceptance:
- Born Winter 800 => 16 winters old at Winter 816.

## TIME-002 — No offline progression
**Status:** Canonical

> **As a player, I want the simulation to pause when I leave the game, so that my clan cannot suffer consequences while I am unable to intervene.**

Rules while offline:
- no aging;
- no resource production/consumption;
- no cattle progression;
- no building decay;
- no weather resolution;
- no expedition/raid progress;
- CPU clans also freeze.

Acceptance:
- Given save Winter 817/tick 430, when returning after 48 real hours, then canonical state resumes at Winter 817/tick 430 unchanged by wall-clock time.

## TIME-003 — Presentation speed is not canonical
**Status:** Canonical behaviour; duration Open

> **As a player, I want to control the pace of quiet and critical moments, so that I spend my time making decisions rather than waiting.**

Rules:
- One Winter contains deterministic integer ticks.
- Seconds per Winter are presentation configuration.
- Gameplay Lab should test ~1, ~3 and ~5 minutes/Winter.
- Support pause/time acceleration where practical.
- Local actions may consume fractions of a Winter; distant expeditions may span Winters.

Acceptance:
- Presentation speed cannot change deterministic outcomes.
