# Pillagers — Game principles

This document records lasting game-design decisions for future Codex work. Read it before changing the calendar, persona ages, seasonal presentation, lore, cultural life, social cohesion, personality-driven life events or related UI. Implementation details and the current prototype belong in the feature documentation.

## GP-001 — Time is experienced through seasons and winters

Pillagers begins in **800 AD (800 n.Chr.)**. This is the chosen starting year of the game, not a claim that the historical Viking Age began on that exact date.

Persona ages are expressed in **winters**: “32 winters old” / “32 winters oud”. Use singular for one winter. Every completed game year adds one winter to a surviving persona's age.

Keep the calendar year clear for the player: 800, 801, 802, and so on. Use AD in English or n.Chr. in Dutch; do not use DC.

Age remains a numeric value internally. “Winters” is the player-facing wording, not a new DNA field or a change to growth curves, age limits or replacement rules.

Apply this principle consistently in world HUDs, persona profiles, annual summaries, Character Lab and other player-facing age or date labels. Average ages also use winters.

The world should communicate the recurring seasonal cycle. Regional historical practices may inspire the setting, but do not present a single reconstructed calendar as universal to all Vikings. Any further seasonal mechanics need their own design decision.

## GP-002 — Lore tells only what actually happened

The village's stories must come exclusively from actual, recorded game events. Norse oral storytelling inspires language and rhythm; it never authorizes invented or altered facts. This is an approved design constraint; the Lore v0.2 direction below does not itself implement it.

The simulation maintains an authoritative event ledger with stable event and persona IDs, chronological game time, event-time identity snapshots and recorded outcomes. AI cannot create source events, mutate facts or invent dialogue, motives, witnesses, causes or consequences. Unknown details remain unknown. Model replacement is not automatically a birth or death.

Every chronicle entry must reference its source event IDs. Preserve the ledger and stories with the world's save lifecycle and keep separate sessions separate. A quiet year needs no invented drama.

To enforce the strict factual requirement, AI may select recorded events and approved narrative templates; code validates the selection and fills factual fields directly from the ledger. Unrestricted AI prose with a second model checking it does not provide this guarantee. Use deterministic factual fallback when output is invalid or AI is unavailable.

Style can use rhythm, repetition and alliteration without adding factual claims. Embellished legends, invented rumours and personality-based assumptions about motives are outside this principle. Stories do not automatically change reputation, relationships or other gameplay state.

**Lore v0.2 direction, approved 2026-10-11:** each new campaign has a distinctive opening based on frozen founding facts, then a chapter every **five completed Winters** that draws on the whole recorded history. A factual appendix lists births, deaths, Food produced/used and Materials produced/used; code calculates these figures. Keep factual memory, narrative planning memory and published text distinct. Separate narrative variation from simulation RNG, and preserve published chapters exactly through save/load. Avoid repeated passages without promising globally unique arbitrary text.

**Automatic story pop-ups are the default:** show the opening at campaign start and each five-Winter chapter (800 opening, then 805, 810, etc.). The complete book is also available in the menu. Later, a setting may hide automatic pop-ups until the player requests the book; generation and accumulation continue regardless. This supersedes the earlier menu-only notification suggestion. Pop-ups are dismissible, with no reading penalty. **The world continues behind the story:** opening, reading or closing the pop-up/menu reader never pauses or resumes the campaign. Preserve the existing running/paused state, manual pause, hidden-tab, loading and ownership rules; this does not authorize offline/background progression. The displayed chapter remains frozen while later events or chapters accumulate.

Implementation umbrella: [GitHub lore issue #14](https://github.com/sidesliders1983/Pillagers/issues/14). Detailed requirements and slice ownership: [Lore v0.2 clan book](docs/gameplay/spec/11-LORE-CLAN-BOOK.md).

## GP-003 — Web-only play; no paid Lore service required

Pillagers is a web-only game. Players must not install a desktop app, local AI server, Ollama or another runtime.

**Lore v0.2 budget decision, 2026-10-11:** no paid API, subscription, metered trial dependency, paid hosting deployment or automatic external-provider fallback for now. Build a complete controlled, model-free book first. Any local/self-hosted model is optional and replaceable, not the owner of campaign memory.

An optional model may run on an existing developer/owner computer or our own backend through an application-owned endpoint, avoiding inference on the player's GPU. A local llama.cpp comparison is the initial experiment; Ollama with cloud disabled is an alternative. Exact model/runtime, licence, hardware budget and any later deployment require separate measured review. Browser inference remains an optional alternative, not a compulsory download or iPad workload. Free software does not imply unlimited free hosting or hardware.

Generate one opening and at most one published result per **five-Winter chapter/version**, replacing the earlier annual-story generation cadence. Save and reuse results. The existing factual event timeline may still group events annually; that is not an annual model request. Apply GP-002 everywhere. Story pop-ups and the menu reader must remain usable when AI is absent, pending or invalid, using controlled factual text. A late result must not rewrite a published chapter, repeat its pop-up or advance/resume simulation. Full offline play is not required.

Evaluation and integration tasks are separated into [#103](https://github.com/sidesliders1983/Pillagers/issues/103), [#104](https://github.com/sidesliders1983/Pillagers/issues/104) and [#105](https://github.com/sidesliders1983/Pillagers/issues/105). Recording this direction does not authorize installing a dependency or deploying infrastructure.

## GP-004 — Settlement, residents and skilled work

Approved vocabulary: **nederzetting / settlement** for the place, **gemeenschap / community** for the social group, **bewoner / resident** for a person living there, and **huishouden / household** for a domestic unit. A family/kin group is a separate relationship, not a synonym for the settlement. Settlement and resident are the default player-facing pair; persona remains development vocabulary. Tribe/clan is not the default.

The ten approved work categories are farmer, livestock keeper/herder, fisher, hunter, textile worker, smith, woodworker, boatbuilder, trader, and **leer- en juwelenmaker / leather and jewellery maker**. They are a practical game selection, not a statistically ranked historical top ten. Residents have skills and can combine work; do not require one resident per category.

Leather and jewellery making is a combined game role spanning distinct crafts. Decoration and jewellery belong in material culture and may express wealth, identity and cultural contacts. Detailed production, gifting, trade, inheritance and social effects need later design decisions. Do not infer factual relationships or motives from jewellery; lore remains governed by GP-002.

Research, evidence limits and approved terms: [Viking occupations and terminology](docs/VIKING-OCCUPATIONS-AND-TERMINOLOGY.md). This decision does not implement jobs or rename code/save schemas.

## GP-005 — Autonomous cultural life; cohesion strengthens collective resilience

**Status: Approved gameplay northstar, 2026-10-10. Future gameplay layer; no implementation or numeric balance is enabled by this document.**

> The clan lives autonomously. The player may invest resources in shared cultural moments to strengthen social cohesion: residents stand by one another when defending their settlement, facing harsh conditions, recovering from loss and passing on their skills.

Cultural investment is a distinct alternative to productive infrastructure or keeping reserves. Weddings, community storytelling/music gatherings, religious ceremonies and possible funerals/remembrances provide occasions for that choice. The player chooses whether and how much to support a gathering; they do not buy love, force births, author deaths or gate ordinary community life behind a celebration button.

Social cohesion represents collective solidarity and mutual support, not a CharacterDNA trait, generic happiness meter or automatic Food/Materials multiplier. Its primary gameplay benefits are **positive modifiers to settlement defence and resilience during harsh weather**. Cohesion helps a community withstand adversity; it does not change the weather, create Food, replace shelter, guarantee victory or make residents invulnerable.

Approved additional directions are **recovery after loss**, **mentorship and transfer of craftsmanship across households/generations**, and **acceptance/integration of newcomers, including captives brought back from pillaging**. Help must use real people and resources; mentoring does not alter DNA or create a Knowledge stock. Acceptance by the settlement and a newcomer's own attachment are distinct: capture or one celebration does not imply immediate loyalty. Exact mechanisms remain to be designed.

A **bounded positive raid-success modifier through better group coordination** is now a candidate for investigation and calibration, not an adopted gameplay modifier. This replaces the earlier blanket exclusion of offensive applications with a narrowly scoped open question; it does not approve extra loot, automatic casualty reductions or recon bonuses. Preserve actual group composition and target resistance. The existing caregiver-proxy system remains unchanged: no duplicate care mechanic or cohesion prerequisite is introduced.

These investments are optional opportunities, not recurring mandatory upkeep, missed-festival punishments or offline obligations. Do not introduce a festival-maintenance treadmill. Exact costs, participation rules, cohesion representation, persistence/decay, stacking limits and modifier values remain open for later calibration.

Cultural events and their approved effects belong to Simulation Core. Ambient meetings/animations do not award cohesion. AI/Lore may narrate recorded gatherings but never create their outcomes; GP-002 continues to apply. No new mandatory 3D assets, animations or religious subsystem are implied.

Detailed northstar and future acceptance principles: [Cultural Life & Social Cohesion](docs/gameplay/spec/10-CULTURAL-LIFE-COHESION.md).

## GP-006 — Personality is expressed through contextual life events

**Status: Approved gameplay northstar, 2026-10-12. The bounded social behavior is implemented; owner rollout decision 2026-10-12 enables it for newly created player campaigns. Existing saves retain their rules; the approved prototype coefficients are unchanged.**

> Traits shape tendencies. Circumstances create opportunities. Relationships and earlier experiences influence the response. Simulation Core resolves what actually happens; the saga tells that history.

Residents should become recognizable through probabilistic behavior rather than a uniform random drama table or fixed helper/rebel labels. Reuse CharacterDNA and its approved meanings: Temperament remains impulsive/fiery at the high end, affecting rapid conflict but potentially also prompt intervention. Intelligence and Cunning are not moral worth; Physicality and Agility do not determine kindness. No new personality roll, sex/heritage virtue multiplier or automatic assignment of motives is implied.

Eligibility, opportunity, chance and result are separate. Genuine recorded circumstances and sparse, source-linked social history may influence later behavior. No event is a valid outcome. Bounded cooldowns and consequences prevent event spam, endless escalation or mandatory player intervention. Preserve initial DNA while tracking actual lived experiences separately.

These are canonical life events, not visual encounters or generated prose. Core owns their persisted random stream, participants, consequences and semantic records; the renderer and Lore only consume them. Attempts are not successful help, and expiry/departure is not reconciliation. Future work refusal or revolt requires explicit rules and readable consequences, never silently ignored player commands. Preserve the existing caregiver proxy and optional cultural-investment principle; no global cohesion drain or compulsory feast cycle.

Begin with an optional **quarrel, mediation and reconciliation** pilot affecting only social incidents and subsequent social probabilities. Wider recovery, mentoring, integration, refusal or rebellion remain later scope. A social episode does not confer family significance for the Saga Book tree.

Detailed direction: [Personality-driven Life Events](docs/gameplay/spec/12-PERSONALITY-LIFE-EVENTS.md). First test: [#120](https://github.com/sidesliders1983/Pillagers/issues/120). Exact formulas, rates and default adoption require measured review.

## GP-007 — Fjordside is the single 3D player-facing game

**Status: Owner-approved product/architecture direction, 2026-10-13. Implementation tracked in [#140](https://github.com/sidesliders1983/Pillagers/issues/140).**

> **One living 3D game, one headless source of truth.**

Fjordside's **3D settlement experience** is the only player-facing game going forward. The older isometric `/play` board and text/card `/gameplay-lab` served their prototyping purpose and are being retired **as player interfaces**. New gameplay interaction and UX work targets the shared 3D experience; do not maintain two complete gameplay presentations.

**This changes presentation strategy, not simulation authority.** The deterministic headless Simulation Core remains the canonical owner of residents, families, economy, buildings, livestock, weather, social rules, simulation time, events, all Simulation Commands and persistence. 3D scenes, movement animation, rendering and camera visibility must never determine canonical simulation outcomes. Keep renderer-free regression tests, reproducible fast-forward/batch QA and debugging tools.

Preserve the player-facing functionality already delivered: resident selection, occupation/housing/care management, seasons and pause/speed controls, lineage/Family Tree, personal history, Clan Book, import/export and saved campaigns. Extract any reusable campaign/session/management helpers out of legacy UI folders **before** removing their former views. Old browser links and saves must transition without accidental new campaign creation, hidden time advancement, data loss or changes to saved world geography.

Specialist developer Environment Lab, Character Lab, Asset Lab and headless inspection/testing tools **remain supported**; retirement applies to duplicate player-facing 2D presentation, not developer instrumentation. No automatic offline progression is introduced by this decision; the established session-time rule remains.

**Historical clarification:** the text-first implementation ordering in [#23](https://github.com/sidesliders1983/Pillagers/issues/23) is superseded only as a *current product UI* strategy. Its headless-core, determinism and command boundaries remain foundational. Refer to [the current architecture](docs/gameplay/GAMEPLAY-FIRST-ARCHITECTURE.md) and [consolidation issue #140](https://github.com/sidesliders1983/Pillagers/issues/140) for migration gates.

## GP-008 — Exploration is strategic group-level action; knowledge belongs to communities

**Status: Owner-approved direction, 2026-10-13.** Implements through [Fjordside Exploration epic #146](https://github.com/sidesliders1983/Pillagers/issues/146), after the 3D-first decision GP-007.

> **Residents move and live autonomously. Only organized Expedition Groups receive direct player movement and mission orders.**

Individual residents remain real living people, not RTS pawns: they choose routine movement, work tasks, social interactions and personal activities autonomously under Simulation Core rules. The player retains the previously approved strategic/management influence over occupations, homes, buildings, resources and meaningful life decisions, but **does not directly issue map-click movement/patrol/attack orders to an individual Persona**.

An **Expedition Group** is persistent, comprises eligible named real residents, and is the player's controllable strategic unit. The player can form/edit a group and order it to explore a clicked island area or execute Recon, Surveillance, Pillage or an approved future mission. Group members and the route/execution remain autonomous. Mission eligibility, resources, outcomes, casualties, travel ticks, life consequences and events belong to deterministic Simulation Core. Never resolve missions from a Three.js object's position, framerate or camera visibility.

**The world is not completely known at the start.** Only the founding settlement's actual surroundings are explored initially. Discovery belongs to the observing **community/clan**, is based on confirmed observation, and survives when scouts depart. Higher ground may reveal more; ridges can conceal valleys. Current line-of-sight/visibility, persistently mapped geography, and stale/scouted/surveyed intelligence about other people are **distinct**. The player must not learn up-to-date rival inventories or population merely by orbiting a free camera over unknown territory.

The existing distance/weather **atmospheric fog** is not the authority for exploration. Add a separate saved, clan-scoped **fog-of-war / map-discovery state**, rendered in Fjordside 3D and enforced by player-visible projections, picking, labels and contextual commands. Camera zoom, debug fog toggles, rendering culling and day/night do not change knowledge. A discovered map cell stays discovered; live enemy intelligence may become stale.

A **rival CPU community exists and evolves even before it is discovered**. Link its real pre-existing Simulation Core state to the physically reserved hidden site on the canonical island. The enemy's economy, residents, lineage and risks are not created when the fog clears and do not stop when its scene is not rendered. Reuse existing Expedition Groups, CPU states and the original four-direction Region Graph in historical saves, with an explicitly versioned mapping for new physical-island campaigns.

The first playable milestone is: create an Expedition Group in the **3D Fjord**, click an unknown valley, observe autonomous travel and gradual confirmed map reveal, and return to a still-known explored landscape. Enemy-site reconnaissance and pillage follow after that. CPU-initiated raids, tactical individual unit controls, offline progression and a second 2D gameplay UI are **not approved by this principle**.

Implementation details and owner review criteria: [Expedition/Discovery design contract](docs/gameplay/EXPLORATION-FOG-AND-RIVAL-CLANS.md) and [#146](https://github.com/sidesliders1983/Pillagers/issues/146). Prior implementation [#54](https://github.com/sidesliders1983/Pillagers/issues/54) remains the historical command/mission foundation, not the active four-arrow player UX.

## Scope and implementation status

The calendar and age wording above are approved design decisions. They do not imply that the current code already implements them.

Implementation task: [GitHub issue #13](https://github.com/sidesliders1983/Pillagers/issues/13).
Current prototype: [Fjordside year cycle](docs/FJORDSIDE-YEAR-CYCLE.md).

The existing 60-second year and pause/Continue summary are prototype settings, not permanent game principles. Issue #13 preserves them while applying the approved calendar and wording changes.

GP-005 records an approved future direction only. It does not activate cultural events, social-cohesion modifiers, settlement-defence mechanics or new weather rules, and it does not block the current Fjord/lifecycle/movement slices.

GP-006 remains a broader gameplay direction; the bounded quarrel/mediation/reconciliation pilot now defaults on for new player campaigns. It does not activate new social rules in existing campaigns or expand the current Lore, family-tree or animation tasks.

## Ideas awaiting a separate decision

These are proposals, not requirements for Codex to implement automatically:

- Summer and winter as the main halves of the year, with spring and autumn transitions.
- Seasonal activities: sowing, travel and trade, harvest, winter preparation and crafts.
- Specific names, dates and regional forms for celebrations and religious ceremonies; cultural investment itself is now governed by GP-005.
- Narrative time expressions such as “after the harvest” and “three winters ago”.
- A visual moon cycle, with day/night timing distinct from the compressed annual cycle.

## Maintaining these principles

When implementing time-related features, lore, cultural life, cohesion or personality-driven life events, check them against GP-001 through GP-008 and keep feature documentation consistent. Distinguish approved principles from proposals and temporary prototype settings. Change an approved principle only when the user explicitly revises that design decision.
