# ADR 0006: Persistent target clans and historical transfer identities

Status: Accepted for World Expeditions v0.4 (#54).

Expeditions must change real target clans while preserving the existing within-clan history and genealogy contracts. Deleting a transferred founder, parent or animal outright would invalidate old events, founder references and surviving descendants. Keeping it as an active resident in both clans would duplicate work, consumption and future reproduction.

Store a version-1 optional world extension containing four persistent Regions, observing-clan knowledge, reusable groups, missions and complete independently seeded target Simulation States. Target states use the same domestic tick engine, without recursive worlds. Generate the graph from a separate deterministic seed stream, so adding geography does not reroll domestic events. Legacy saves without the extension remain domestic-only until a new campaign.

Use unique identity namespaces for generated target clans. Transfer the actual active person/cattle and saved controls to the player; retain non-active historical identity snapshots for old references and genealogy. Current partnerships end upon transfer. Descendants can reference observed ancestor snapshots across clans without making those ancestors active residents or exposing remote inventories. Historical occupation intervals end at observation; snapshots do not gain unobserved experience.

The presentation receives only dated Region knowledge, player groups and factual mission reports. It never receives canonical target inventory through the world projection. Missions snapshot their weather-adjusted duration, provisions and risk at departure; wall-clock pacing only issues Simulation Commands. CPU targets continue on the same number of canonical ticks as the player.
