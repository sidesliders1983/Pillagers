# Pillagers — Game principles

This document records lasting game-design decisions for future Codex work. Read it before changing the calendar, persona ages, seasonal presentation or time-related UI. Implementation details and the current prototype belong in the feature documentation.

## GP-001 — Time is experienced through seasons and winters

Pillagers begins in **800 AD (800 n.Chr.)**. This is the chosen starting year of the game, not a claim that the historical Viking Age began on that exact date.

Persona ages are expressed in **winters**: “32 winters old” / “32 winters oud”. Use singular for one winter. Every completed game year adds one winter to a surviving persona's age.

Keep the calendar year clear for the player: 800, 801, 802, and so on. Use AD in English or n.Chr. in Dutch; do not use DC.

Age remains a numeric value internally. “Winters” is the player-facing wording, not a new DNA field or a change to growth curves, age limits or replacement rules.

Apply this principle consistently in world HUDs, persona profiles, annual summaries, Character Lab and other player-facing age or date labels. Average ages also use winters.

The world should communicate the recurring seasonal cycle. Regional historical practices may inspire the setting, but do not present a single reconstructed calendar as universal to all Vikings. Any further seasonal mechanics need their own design decision.

## Scope and implementation status

The calendar and age wording above are approved design decisions. They do not imply that the current code already implements them.

Implementation task: [GitHub issue #13](https://github.com/sidesliders1983/Pillagers/issues/13).
Current prototype: [Fjordside year cycle](docs/FJORDSIDE-YEAR-CYCLE.md).

The existing 60-second year and pause/Continue summary are prototype settings, not permanent game principles. Issue #13 preserves them while applying the approved calendar and wording changes.

## Ideas awaiting a separate decision

These are proposals, not requirements for Codex to implement automatically:

- Summer and winter as the main halves of the year, with spring and autumn transitions.
- Seasonal activities: sowing, travel and trade, harvest, winter preparation and crafts.
- Seasonal celebrations, with region-specific historical research before selecting names or dates.
- Narrative time expressions such as “after the harvest” and “three winters ago”.
- A visual moon cycle, with day/night timing distinct from the compressed annual cycle.
- An annual chronicle of supported births, deaths, arrivals and other settlement events.

## Maintaining these principles

When implementing time-related features, check them against GP-001 and keep feature documentation consistent. Distinguish approved principles from proposals and temporary prototype settings. Change an approved principle only when the user explicitly revises that design decision.
