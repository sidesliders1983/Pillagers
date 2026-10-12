# Personal History · #122 implementation contract and reuse map

Base: accepted PR #124, including the owner-approved new-player rollout. Approved test seams: public Personal History projection/shared session, plus desktop/touch browser behavior and Saga Book navigation.

| Concern | Reused source/seam | Boundary |
| --- | --- | --- |
| Personal involvement | Canonical event-type-specific actor/parent/participant/mediator fields | Canonical persona IDs; names and arbitrary strings are not an involvement index. |
| Current vs historical identity | `Identity.personaIdentity`, active/archive registry, event-time people snapshots | Current profile values do not rewrite event-time names/ages. |
| Factual prose | Existing `Chronicle` registry | No individual biography generator, model, motives or resource-account invention. |
| Published text | Saved `BookChapter.paragraphs`, source IDs and typed plan source/callback refs | Preserve exact text. Dating anchors and mixed stories do not establish personal involvement. |
| Housing | Prospective event-time household/residence snapshots in `EventFacts` | Capture before salvage/collapse/move mutation where already supported. Missing old attribution stays unknown; no backwards engineering is required. |
| Shared UI | `SettlementPanel`, reused by `/play` and `/fjord-play` | One compact, lazy disclosure for living, deceased and archived residents. |
| Reader | `ClanBookReader.open` | Navigate to a saved chapter/passage without changing clock intent or Core. |
| Derived cache | Shared `GameplaySession` state/book lifecycle | Incremental appended-event indexing, publication updates, complete reset on campaign replacement/rollback. Nothing authoritative is added to the save. |
| Tree integration | Shared query/view contract | #119 has no implementation in this base. Expose the contract without changing admission or making that tab a prerequisite. |

The timeline includes supported lifecycle, partnership, occupation, arrival/departure, historically attributed housing, recorded expedition participation and the actual social schemas. It excludes resource-production spam, global shortfalls and unrelated residents' events. Shared group results remain group results; a helper's attempt is distinct from success.

Older housing attribution may remain partial. The owner explicitly waived back-engineering old campaigns on 12 October 2026. New records use actual event-time membership; previous canonical events and published chapters are not rewritten.

Published excerpts are offered only when every meaningful story source in the saved paragraph is demonstrably relevant to the selected person. A mixed paragraph can be linked as chapter context without quoting its unrelated stories as personal history. Original event dates/order remain independent of later publication/callback dates.

Reading, switching people and following source links never generate events, publish a partial chapter, consume RNG or pause/resume the world. Controls validate current campaign and selection; content is escaped, paged/expanded, and indexed lazily rather than rescanning the whole book on each resource/animation tick.
