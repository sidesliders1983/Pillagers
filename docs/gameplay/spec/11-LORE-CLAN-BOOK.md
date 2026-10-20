# Lore v0.2 — the continuing clan book

**Status: Canonical northstar, approved 2026-10-11; implementation pending.** This records the owner's narrative direction and latest pop-up clarification. Exact storage/API schemas, final writing corpus and runtime/model choice remain open where stated. The owner has settled reader timing: opening or reading the book does not pause a running world.

Related: [GP-002/GP-003](../../../GAME-PRINCIPLES.md), [Chronicle v0.1](../../CLAN-CHRONICLE-V01.md), [narrative style](../../lore/PILLAGERS-NARRATIVE-STYLE-V1.md), [cultural life](10-CULTURAL-LIFE-COHESION.md).

Umbrella [#14](https://github.com/sidesliders1983/Pillagers/issues/14). Implementation: [#103 foundation/pop-ups](https://github.com/sidesliders1983/Pillagers/issues/103) → [#104 continuity/style](https://github.com/sidesliders1983/Pillagers/issues/104) → [#105 optional local-model evaluation](https://github.com/sidesliders1983/Pillagers/issues/105).

> The campaign owns its history. Its book begins with a distinctive factual opening and gains a chapter every five Winters. The writer is replaceable; the people, facts and published past are not.

## LORE-001 — One opening, then five-Winter chapters

**Status:** Canonical direction.

**Story:** As a player, I want my campaign to begin with its own story and gain chapters as its people live, so that the settlement has an accumulating identity rather than disconnected reports.

**Rules:**
- Freeze founding facts when the campaign is created: actual founders, event-time names, partnerships already present, households, occupations, ship, cattle and stocks. A delayed opening cannot substitute current survivors or invent a voyage, homeland, feud or reason for departure.
- An opening at Winter 800 is followed by chapters after five, ten and fifteen completed Winters: 805, 810, 815. Cadence is relative to campaign origin, not a resident's age or wall-clock time.
- Freeze chapter inputs only at a completely processed canonical boundary. Audit actual event ordering: final-tick production and outgoing-period consumption can be stamped at the incoming Winter. Define and version the checkpoint/event-sequence and human-readable period contract rather than guessing from calendar labels.
- Each interval contributes to one economic/demographic appendix. Historical callbacks may reuse older facts in prose without counting them again in the interval totals.
- Crossing several milestones freezes every intermediate package in order, not several stories built from the same final snapshot.

**Acceptance:** Opening and milestones are stable under split ticks, fast-forward, save/load and duplicate callbacks; no missing/double-counted boundary transactions or future facts in earlier chapters.

## LORE-002 — Story pop-ups by default; permanent menu reader

**Status:** Canonical direction, latest owner clarification. Supersedes the earlier suggestion of menu-only notification. The pop-up is visible by default but does not interrupt the simulation clock.

**Story:** As a player, I want a pop-up at the start and every five subsequent Winters, while the world continues behind it, so that storytelling remains part of the living settlement rather than a pause screen.

**Rules:**
- Automatically show the new campaign's opening, then each new five-Winter chapter. A badge/menu entry alone is insufficient.
- Display the story and an accessible factual appendix, with an immediate close action. No minimum reading time, mandatory choice, resource charge or missed-reading penalty.
- The same saved book is always available from the game menu in both 2D and Fjord. Closing or reopening does not rewrite a chapter.
- Distinguish publication, notification and reading where needed. Refresh, save/load and view handoff must not reannounce already-notified chapters as new. Pending/unread chapters remain accessible.
- Several milestones crossed together use a single ordered reader/notification queue, not stacked dialogs. Preserve every chapter and offer a way back to play without a long mandatory dismissal chain.
- **Later enhancement:** a setting hides automatic pop-ups until the player asks for the book in the menu. Default automatic display is enabled. Hiding affects presentation only: generation, memory, accumulation and saving continue. Re-enabling does not flood the player with historic pop-ups. The settings UI need not ship with the initial slice.
- Model generation is asynchronous and optional; do not make the required pop-up depend on an available AI server or an endless loading screen. A controlled readable baseline is always available.
- **Owner decision, 2026-10-11: the world keeps running behind the story.** Opening, reading, changing chapters or closing the pop-up/menu reader must not pause, resume or reset canonical pacing or ambient motion. A previously running visible campaign keeps running; a previously paused campaign stays paused. Existing manual pause, hidden-tab, loading and ownership rules still take precedence. This is not permission for offline/background-tab progression. A late model response must never restart simulation or reopen a dismissed chapter.
- Keep the displayed chapter and appendix frozen at their publication checkpoint even while new events happen behind the reader. If another chapter becomes due during reading, queue it in order without replacing the passage being read or stacking a new modal over it.

**Acceptance:** New-campaign and 805/810 pop-ups work; repeated refresh/handoff does not duplicate them; all chapters can be reread from the menu. A running visible world continues through opening/reading/closing; manual pause and hidden-tab/load/handoff remain effective. The visible historical chapter stays unchanged while new chapters queue. Slow/failed AI does not suppress presentation. Keyboard/touch/focus behavior and pause/loading races have tests. Future notification hiding never disables generation.

## LORE-003 — Exact demographic and economic appendices

**Status:** Canonical direction.

**Story:** As a player, I want to see who was born, who died, and what the community produced and used, so that the story has a transparent factual foundation.

**Rules:**
- Compute appendices in TypeScript from recorded facts, never with model arithmetic.
- Births/deaths use stable identities and historical names; parents, causes, location or other details appear only if recorded. Ordinary model replacement is not birth/death. Cattle lifecycle may be listed separately, never confused with residents.
- Food production distinguishes resident/cattle output. Food use distinguishes actual consumption and other real spending. Materials production and use include actual construction, upgrades and paid upkeep as applicable.
- Separate production, other receipts, consumption/spending, losses and unmet need. Slaughter, loot and salvage are not production. Spoilage is loss, not consumption. A shortage is not spent inventory.
- Reconcile each resource: `opening stock + production + other receipts - consumption/spending - losses = closing stock`.
- Inventory all supported Core sources/sinks and transaction fields. If necessary add the smallest factual event metadata, not a replacement economy. Unknown/incomplete historical accounting stays explicitly incomplete, not assumed zero.

**Acceptance:** Exact sums, disjoint source IDs and reconciliation at every checkpoint; tests include boundary output/consumption, paid upkeep, refunds and incomplete saves. The narrative may be selective; the appendix is not.

## LORE-004 — Whole-history continuity without trusting generated prose

**Status:** Canonical direction.

**Story:** As a player, I want later chapters to remember earlier people and events, so that I follow one community across generations.

**Rules:**
- Keep factual memory (ledger and historical snapshots), narrative planning memory (featured people/themes/recent language), and published text distinct.
- Retrieve relevant facts from the whole recorded history, not only the last chapter. Keep references to stable people/events/households; a vector database is not required for the first implementation.
- Supply a bounded context to any writer: current frozen facts, relevant older facts, compact sourced planning memory, style examples and selected prior text. Do not blindly send the entire mutable save or endlessly append everything to one prompt.
- Old prose is a continuity/style reference, not authority for relationships, motives, causes or numbers. Summaries cannot promote earlier mistakes to facts.
- Plan a few connected themes and factual callbacks rather than reciting every technical event. Quiet periods may be quiet; no forced climax.

**Acceptance:** A later chapter can refer correctly to an older birth/arrival/home beyond the recent context. Dead/departed/renamed people, duplicate names and founding couples retain correct historical identities.

## LORE-005 — Distinctive telling, stable published history

**Status:** Canonical goal; repetition thresholds remain tuning parameters.

**Story:** As a player, I want a distinctive opening and varied later chapters, while my saved history remains unchanged when I return.

**Rules:**
- Save a narrative identity/seed separate from the simulation PRNG. A genuinely new campaign may choose another structure/voice variant for the same game seed; a restored campaign keeps its book.
- Vary complete paragraphs, focus, callbacks and openings/endings, not just synonyms. Track exact duplicates and excessive recent overlap; allow deliberate motifs and necessary factual repetition.
- Use bounded selection/retry rules. Do not promise globally collision-free arbitrary text across all independent offline games or hallucinate drama when variants run out.
- Store the published text itself plus facts hash, source references and generator/style/template identity. Re-running a seed on another model/runtime is not a persistence mechanism.
- A published baseline chapter is not silently replaced by a late model answer. Any future explicit revision feature would require its own visible version semantics.

**Acceptance:** Cross-campaign/multi-chapter repetition is measured; the same saved chapter is byte-stable across reload/model updates. Narrative randomness cannot change canonical outcomes.

## LORE-006 — Controlled writing and a fixed style

**Status:** Canonical factual boundary; initial style direction and example corpus require writing review.

**Story:** As a player, I want one recognizable narrative voice without fabricated events, so that I trust the book and enjoy reading it.

**Rules:**
- GP-002 remains mandatory. Reuse/extend Chronicle provenance, controlled paragraphs, conditions and narrative structures. The reliable default works without a runtime LLM.
- An optional model may propose allowed event IDs, callbacks, structure and approved templates. Code checks their compatibility and fills factual identities/clauses/quantities.
- JSON shape constraints or a second LLM do not establish semantic truth. Unrestricted prose is a separate developer experiment, not a silent relaxation of the no-invention promise.
- Use the versioned style brief in `docs/lore/PILLAGERS-NARRATIVE-STYLE-V1.md`. Initial English voice: sober, concrete, past tense, restrained oral-storytelling rhythm, names and generations rather than generic grandeur.
- No invented emotions, conversations, witnesses, causality, family links, mentoring, supernatural intervention or feats. A family relationship alone does not prove who taught whom.
- Model-assisted drafting of offline content is possible for later human review. Do not automatically trust generated fragments or require fine-tuning.

**Acceptance:** Reviewed conditional paragraphs/examples and negative tests reject unsupported claims/IDs. Invalid or unavailable model output yields controlled factual text.

## LORE-007 — No paid service; optional local model study

**Status:** No-paid-service constraint is canonical for now. Model/runtime selection is experimental, not a dependency commitment.

**Story:** As a player, I want the book without a paid AI dependency or installed runtime, so that the browser game remains usable on its own.

**Rules:**
- No paid inference API, subscription, metered trial dependency, automatic external fallback or paid hosting deployment. No compulsory model download or Ollama/desktop install for players.
- First compare the model-free composer with a small model on an existing owner/developer machine through a private application-owned endpoint. Initial preferred runtime experiment: llama.cpp; Ollama with cloud disabled is an alternative. This does not approve infrastructure deployment.
- Candidates from the research discussion: Qwen3-4B-Instruct-2507, Qwen3.5-4B, optionally SmolLM3-3B. They are not tested winners. Recheck official availability, exact model/revision, licence, quantization and runtime compatibility when performing #105; pin all identities/settings.
- Mandatory browser WebGPU inference is not the baseline, particularly alongside the 3D game on iPad. Browser inference remains a future optional experiment.
- Free software still uses hardware, electricity and an available machine. Record measured limits instead of implying unlimited free public hosting.
- Compare quality, unsupported claims, continuity, repetition, style, latency, memory and concurrent-game impact on identical frozen campaigns. A first suggested cohort is twenty multi-chapter campaigns; this is a study plan, not a completed benchmark.

Primary starting references for #105, to verify before use: [llama.cpp](https://github.com/ggml-org/llama.cpp), [Qwen reference](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), [Qwen comparison](https://huggingface.co/Qwen/Qwen3.5-4B), [SmolLM comparison](https://huggingface.co/HuggingFaceTB/SmolLM3-3B), [Ollama local configuration](https://docs.ollama.com/faq). These references are research inputs, not performance or licence certification by this document.

**Acceptance:** A and B work without any model. #105 records raw comparisons and a reviewed adopt/retain/iterate decision; no automatic model default or external call is introduced by this design PR.

## LORE-008 — Save lineage, ordered generation and safe failure

**Status:** Canonical requirements; precise schema remains implementation design.

**Story:** As a player, I want the right book after loading or changing my campaign's future, without stories arriving from another timeline.

**Rules:**
- Use a versioned narrative save extension with chapter/checkpoint identity, exact input/history identity, provenance, text, versions and notification/read status as needed. Reuse shared session/save/export, not a second game-state owner.
- Process dependent chapters sequentially per campaign. Key jobs/results by campaign and save lineage plus input/history identity; seed and chapter number alone are insufficient.
- Reject stale completions after rollback, restart, import or transfer. Opening/reading never writes Core resource, identity, relationship or RNG state.
- Old plain canonical saves remain supported. Reconstruct only facts that were recorded; missing founding details or economic coverage require explicit partial-history/backfill handling and no flood of retrospective pop-ups.
- Missing endpoint, failed validation, slow inference and insufficient resources use a readable controlled chapter. Retries are bounded and idempotent. The saved book is never dependent on keeping a model conversation alive.
- Treat free-text names/events as input data, not model instructions. Render output as safe text; the optional writer has no tools or write access.

**Acceptance:** Save/load/handoff, forked futures, duplicate requests, invalid output and hidden/loading completion tests preserve the right book and unchanged Core replay.

## LORE-009 — Future cultural events, not ambient animation

**Status:** Extension direction only.

**Story:** As a player, I want later chapters to remember real cultural occasions when those mechanics exist.

**Rules:** Add mappings for actual recorded weddings, community storytelling/music, religious gatherings and possible remembrances only after their Core events exist. Unknown events remain available in Raw Events but do not gain fabricated meaning. A Talk/Listen, Graze, Doze or work clip is not a ceremony, production award or cohesion event. Lore never grants cohesion or creates its effects.

**Acceptance:** Future schema/registry additions preserve provenance and versioning; unavailable mechanics are not invented to enrich a quiet chapter.

## Delivery and open decisions

#103 owns factual packages, storage and **default automatic pop-ups plus menu reader**. #104 owns full-history continuity, controlled composition and style review. #105 is an optional local study against that complete baseline. Future hiding of pop-ups is an additional settings enhancement and cannot gate the initial delivery.

The reader's no-auto-pause policy is decided in LORE-002; detailed multi-chapter navigation remains an implementation UX choice. Before model adoption, settle exact candidate/runtime/licence and measured resource limits. Approximate opening length 150–250 words, chapter 250–450 and about ten style examples are initial proposals, not quotas. No compulsory voice generation, new game mechanics or fine-tuning is implied.

This specification does not claim Lore v0.2 is already implemented and does not rewrite historical QA reports.


## Wildlife history (#226)

**Clan Book > Wildlife / Creatures of the Fjord** records only species encountered by
real physical expeditions. Each species entry shows its first sighting, historical
group and witnesses, subsequent encounter count and paged recorded locations.
Personal Chronicle entries describe expedition participation, not independent spotting.
First-discovery read state is presentation metadata; the group-level event and saved
witness identities remain canonical and survive later death or membership changes.
The existing Attention surface links first discoveries to these records without
pausing movement. The broader Attention hub remains tracked separately in #216.

Eligibility, cooldowns, old-save adoption and validation are documented in
[Wildlife sightings #226](../../WILDLIFE-SIGHTINGS-226.md).
