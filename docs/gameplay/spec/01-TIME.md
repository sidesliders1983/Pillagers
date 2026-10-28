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

## TIME-004 — Fjord calendar seasons
**Status:** Canonical presentation; no new simulation rules

The /fjord-play header shows the season and year derived from the saved within-year tick.
The current 1,000-tick year displays Winter at ticks 0–249, Spring at 250–499,
Summer at 500–749 and Autumn at 750–999. The next tick starts Winter of the next year.
Existing smooth seasonal palettes use the same normalized canonical progress.

The Fjord calls pacing **Year length**, with 1/3/5 **min per year**, and the advance
command **+1 Year**. It still sends AdvanceWinter, preserving any partial-year tick:
Spring 800 / tick 430 becomes Spring 801 / tick 430. Core field/command names, age in
Winters, annual weather/economy/maintenance, fertility, mortality and Chronicle years
remain unchanged. A season transition creates no new gameplay event.

Save/load, import, pause, hidden tabs and view handoff retain canonical season progress.
Weather-off still shows seasons. Seasonal weather composition is visual only; the
configured annual weather modifiers continue to apply across all four quarters.
See [Fjord calendar and header](../../FJORD-SEASONS-HUD.md).


### Compact year-length control (28 October 2026)

The upper status bar keeps one native Year length picker between Play/Pause and
the game menu, including mobile. Its double-play icon and current `1/3/5 min per
year` label reflect the existing pacing setting. Expedition Mode shows its fixed
10-minute pace and disables manual changes; this adds no second clock or speed
rule. Choosing **Explore on my own** at the new-campaign invitation starts the
existing guarded clock immediately; guided play and ordinary restore remain paused.
