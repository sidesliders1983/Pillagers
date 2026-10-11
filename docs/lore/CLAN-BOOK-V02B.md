# Clan Book v0.2B: controlled narrative continuity

Implemented for #104, following the owner-approved [English direction and conditional corpus](NARRATIVE-CORPUS-V1-REVIEW.md) and [style v2](PILLAGERS-NARRATIVE-STYLE-V2.md). The complete attributed owner reference is kept under references/. Its fictional scenes are style examples, not campaign facts.

## Facts, plans and published paragraphs

The factual memory is the complete saved Core event history and frozen checkpoint packages. Supported Chronicle projections provide event-time names, identities and actions. Raw unknown event types remain available to diagnostics; they cannot acquire narrative meaning through an animation or earlier prose.

A saved version-1 narrative plan selects up to three themes and four supported current events per theme. Older callbacks are retrieved from the whole supported history, not a window of recent chapters. Birth-to-occupation/death matches persona IDs; construction-to-upgrade/salvage/collapse matches building IDs; birth-to-founding-partnership matches both parents; expedition returns match mission IDs; calves match their own mother's latest recorded earlier assignment and birth Farmyard. Founders can be recalled at death from the recorded arrival membership. Residence changes can recall an earlier recorded move of that household. These are dated observations, not inferred motives or proof of continued occupancy.

Planning memory stores featured event/subject IDs, unrecalled birth/construction references, and three recent chapter structures. An unrecalled reference does not assert that a person or building is still present. Plans and memory are validated against the canonical event prefix on import. Future or foreign paragraph event references, invalid older-account references and inconsistent memory are rejected before replacing the active campaign.

The published layer saves exact text, paragraph/template versions, event references and factual package references. Previously written prose is never factual input to a later chapter. Old names remain attached to older events; a name change for the same persona is linked explicitly. Same-named people are not matched by display name. Death and transfer retain their distinct recorded meanings.

## Composition and accounting

Generator/style version 2 uses controlled paragraphs in restrained past-tense English. Named actions lead the narrative. Theme order, chronology and paragraph structures vary through a separate saved uint32 narrative seed; it never consumes Core RNG. The public session accepts an optional narrative seed for reproducible QA, while normal new campaigns choose their own seed.

Recent paragraph IDs discourage reuse of recent opening/ending structures. A maximum of 24 candidates rejects exact whole-body duplicates already in that book. If all candidates repeat, one sourced interval/index paragraph gives a bounded factual fallback. This is a finite composer, not a promise of infinite unique language. Corpus measurement reports exact and normalized overlaps rather than disguising recurring wording.

A complete Food account can recall the latest older complete checkpoint that ended without Food and with unmet need, when the current complete account ends with Food and no unmet need. That paragraph references the old frozen ledger and its Food transaction sources separately. The chapter's current source set and resource ledger still cover only its own interval. Shortfall is never counted as consumption. Incomplete accounts omit unsupported zero-shortfall or quantity claims.

The detailed ledger and demographics remain in the factual overview. Quiet intervals stay brief; the opening/chapter word ranges from the issue are exploratory, not padding quotas. No dialogue, witness, promise, tool, illness or emotional consequence is invented to fill a paragraph. Animals have neutral descriptions; their canonical IDs remain in provenance and the appendix.

## Persistence and reader

The additive save envelope remains version 1 and accepts existing generator/style-1 books. Existing published chapters are frozen on load. Newly closed checkpoints use version 2. Plain Core imports retain an explicitly partial founding package; later fully observed intervals can have complete accounts. Save/load, campaign transfer and explicit 2D/Fjord handoff share the stored book.

The founding popup and five-Winter cadence are unchanged. Reading neither pauses nor restarts the campaign. Notifications are deduplicated through persisted state. The reader fits below the actual HUD; its sticky Close button remains reachable with the appendix expanded on phone/tablet viewports.

No gameplay rules, balance values, lifecycle timing, Core state, Core RNG, events or replay format change. No runtime model, endpoint or download is introduced. [Actual runtime review](../qa/lore-continuity/runtime-review.html) and [validation evidence](../qa/lore-continuity/report.md) accompany this change.
