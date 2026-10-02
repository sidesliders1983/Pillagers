# Pillagers — Game principles

This document records lasting game-design decisions for future Codex work. Read it before changing the calendar, persona ages, seasonal presentation, lore or time-related UI. Implementation details and the current prototype belong in the feature documentation.

## GP-001 — Time is experienced through seasons and winters

Pillagers begins in **800 AD (800 n.Chr.)**. This is the chosen starting year of the game, not a claim that the historical Viking Age began on that exact date.

Persona ages are expressed in **winters**: “32 winters old” / “32 winters oud”. Use singular for one winter. Every completed game year adds one winter to a surviving persona's age.

Keep the calendar year clear for the player: 800, 801, 802, and so on. Use AD in English or n.Chr. in Dutch; do not use DC.

Age remains a numeric value internally. “Winters” is the player-facing wording, not a new DNA field or a change to growth curves, age limits or replacement rules.

Apply this principle consistently in world HUDs, persona profiles, annual summaries, Character Lab and other player-facing age or date labels. Average ages also use winters.

The world should communicate the recurring seasonal cycle. Regional historical practices may inspire the setting, but do not present a single reconstructed calendar as universal to all Vikings. Any further seasonal mechanics need their own design decision.

## GP-002 — Lore tells only what actually happened

The village's stories must come exclusively from actual, recorded game events. Norse oral storytelling inspires language and rhythm; it never authorizes invented or altered facts. This is an approved design constraint, not yet implemented.

The simulation maintains an authoritative event ledger with stable event and persona IDs, chronological game time, event-time identity snapshots and recorded outcomes. AI cannot create source events, mutate facts or invent dialogue, motives, witnesses, causes or consequences. Unknown details remain unknown. Model replacement is not automatically a birth or death.

Every chronicle entry must reference its source event IDs. Preserve the ledger and stories with the world's save lifecycle and keep separate sessions separate. A quiet year needs no invented drama.

To enforce the strict factual requirement, AI may select recorded events and approved narrative templates; code validates the selection and fills factual fields directly from the ledger. Unrestricted AI prose with a second model checking it does not provide this guarantee. Use deterministic factual fallback when output is invalid or AI is unavailable.

Style can use rhythm, repetition and alliteration without adding factual claims. Embellished legends, invented rumours and personality-based assumptions about motives are outside this principle. Stories do not automatically change reputation, relationships or other gameplay state.

Implementation task: [GitHub lore issue](https://github.com/sidesliders1983/Pillagers/issues/14).

## GP-003 — Web-only play; lore architecture to be decided

Pillagers is a web-only game. Players must not install a desktop app, local AI server, Ollama or another runtime.

Lore generation may run entirely on our own backend, avoiding inference workloads on the player's GPU and eliminating the need for a player-side model download. A self-hosted model does not require calls to an external AI provider. Browser inference remains a possible alternative, not a requirement.

The northstar architecture, runtime/model, hosting, event authority, API boundaries, queuing, persistence and operating budgets will be evaluated later. Do not implement or lock these choices merely from this principle. Backend generation is the current preferred direction.

Generate at most once per annual summary and reuse saved results. Apply GP-002 regardless of where inference runs. The game and annual summary must remain usable while generation is pending or fails, using factual template-based chronicles as fallback. Avoid continuous inference requests and any automatic external-provider fallback. Full offline play is not required.

## GP-004 — Settlement, residents and skilled work

Approved vocabulary: **nederzetting / settlement** for the place, **gemeenschap / community** for the social group, **bewoner / resident** for a person living there, and **huishouden / household** for a domestic unit. A family/kin group is a separate relationship, not a synonym for the settlement. Settlement and resident are the default player-facing pair; persona remains development vocabulary. Tribe/clan is not the default.

The ten approved work categories are farmer, livestock keeper/herder, fisher, hunter, textile worker, smith, woodworker, boatbuilder, trader, and **leer- en juwelenmaker / leather and jewellery maker**. They are a practical game selection, not a statistically ranked historical top ten. Residents have skills and can combine work; do not require one resident per category.

Leather and jewellery making is a combined game role spanning distinct crafts. Decoration and jewellery belong in material culture and may express wealth, identity and cultural contacts. Detailed production, gifting, trade, inheritance and social effects need later design decisions. Do not infer factual relationships or motives from jewellery; lore remains governed by GP-002.

Research, evidence limits and approved terms: [Viking occupations and terminology](docs/VIKING-OCCUPATIONS-AND-TERMINOLOGY.md). This decision does not implement jobs or rename code/save schemas.

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

## Maintaining these principles

When implementing time-related features or lore, check them against GP-001 through GP-004 and keep feature documentation consistent. Distinguish approved principles from proposals and temporary prototype settings. Change an approved principle only when the user explicitly revises that design decision.
