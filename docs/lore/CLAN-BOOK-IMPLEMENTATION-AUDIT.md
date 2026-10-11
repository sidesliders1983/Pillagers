# Clan Book v0.2A — implementation inventory and delivery contract

Status: implementation preparation for #103, 11 October 2026. No Clan Book runtime
has been added by this audit. Approved owner direction: issue #103 and the design
specification in unmerged PR #106. Working branch: codex/lore-clan-book, based on
PR #110 / 3167f0172d0b17de5f6190bd78b5e87e394b4a9d. Do not merge dependencies implicitly.

## Existing sources to reuse

| Source | Existing behavior | Required integration |
| --- | --- | --- |
| src/lore/Chronicle.ts | Controlled factual templates with source event IDs; unknown events remain raw | Preserve timeline; reuse supported text, add real lifecycle mappings |
| docs/CLAN-CHRONICLE-V01.md | Chronicle contract and original scope | Keep v0.1 history; document the added book separately |
| src/simulation/Landing.ts | Creates ten named/DNA founders, occupations, households, ship, cattle and stocks; founding couples use their own stream | Freeze the complete opening at creation after partnerships are resolved |
| src/simulation/EventFacts.ts | Event-time ID/name/age snapshots for persona and participant IDs | Prefer recorded identities over mutable current personas |
| src/simulation/FamilyMechanics.ts | ChildBorn records name, parents, participant snapshots and DNA | Birth appendix uses recorded identity and parent IDs/names |
| src/simulation/Mortality.ts | PersonaDied records name, household, occupation and risk/exposure context | Natural death has no explicit cause field; do not invent one from risk |
| src/simulation/Livestock.ts | CattleBorn/CattleDied record ID, sex, parents, age and risks | Separate animal lifecycle appendix; no invented animal names |
| src/simulation/WorldExpeditions.ts | Real Expedition death cause, transfers, mission spending and recovered cargo | Count cargo once on return; preserve historical transfer identities |
| src/gameplay-lab/GameplaySession.ts | Sole canonical command/pacing owner, canonical JSON, load/restart boundaries | Observe command outcomes here; freeze intermediate complete checkpoints |
| src/play/SharedSettlement.ts | Shared 2D/Fjord owner, local saves, persist/restore and route handoff | One book/notification state across both routes |
| src/fjord-play/FjordCampaign.ts | Versioned presentation wrapper around canonical campaign | Add optional narrative extension; plain Core JSON remains accepted |
| src/play/SettlementBrowser.ts | Refresh/handoff ownership and persisted active session | Persist publication/notification state before presentation; respect hidden/loading ownership |
| src/fjord-play/FjordHeader.ts; src/play/PlayUI.ts | Game menus and controls; existing Chronicle/Raw Events | Menu access to one shared book reader; preserve existing timeline |

The founding arrival event stores founder/ship/cattle IDs and stocks, but not the complete
names, jobs or households. Founding partnership events contain participant names. A delayed
opening cannot reconstruct the full arrival by consulting current surviving founders.
A new campaign must freeze those facts immediately. Legacy openings must clearly identify
missing founding information and use only recorded historical facts.

## Economic source/sink inventory

Amounts are whole stock transactions, never productivity estimates or nominal need.

| Event | Field | Resource/category | Producer |
| --- | --- | --- | --- |
| ResourceProduced | resource, units | Food/Materials production, resident | Mechanics.stepMechanicsTick |
| CattleFoodProduced | units | Food production, herd | Livestock.stepCattleOutput |
| FoodConsumed | units; shortfall separate | Actual resident Food consumption; unmet need separately | Mechanics.stepMechanicsTick |
| CattleFoodConsumed | units; required/shortfall separate | Actual herd Food consumption; unmet need separately | Livestock.consumeCattleFood |
| HouseBuilt | cost | Materials spending | Mechanics.applyMechanicsCommand |
| BuildingUpgraded | cost | Materials spending | Mechanics.applyMechanicsCommand |
| BuildingMaintained | units | Paid Materials upkeep | Mechanics.stepMechanicsTick |
| MaintenanceDebtIncreased | reason/debtWinters | No stock movement; unpaid upkeep amount is not recorded | Mechanics.stepMechanicsTick |
| BuildingSalvaged | salvage | Other Materials receipt | Mechanics.applyMechanicsCommand |
| BuildingCollapsed | salvage | Other Materials receipt | Mechanics.stepMechanicsTick |
| FoundingLongshipSalvaged | materials | Other Materials receipt | Landing.applyLandingCommand |
| CattleSlaughtered | food | Other Food receipt, not production; animal death fact | Landing.applyLandingCommand |
| ExpeditionDeparted | foodCost | Actual Food spending | WorldExpeditions.applyExpeditionCommand |
| ExpeditionReturned | food, materials | Other receipts; do not recount cargo transfers | WorldExpeditions.stepWorld |
| SettlementPillaged | food, materials | Outgoing losses in CPU settlement's own ledger | WorldExpeditions.recoverCargo |
| FoodSpoiled | units | Food loss, only if an actual supported event is present | scripts/qa/food-engine.mjs experimental harness |

Current runtime has no Food spoilage/storage/capacity rule. Preserve the experiment and its
historical reports. Diminished output is not a loss of existing stock. Founding stock is
opening stock, not production or a chapter receipt. Failed construction/dispatch makes no
transaction. Residence moves, specialization, assignment and Farmyard conversion cost
nothing. Do not treat debt, required consumption or expedition carrying capacity as spent
inventory. CPU ledgers are independent; never aggregate the nested target clans into the
player's book. Unknown transaction fields and unexplained reconciliation residuals must
mark coverage incomplete, not silently become zero. If an exact unpaid-upkeep total is
needed, add only factual metadata to that existing event; preserve balance/RNG behavior.

Reconcile each resource:
opening + production + other receipts - actual consumption/spending - losses = closing.
Keep resident/cattle production subtotals, unmet Food need and transaction source IDs.

## Closed checkpoint contract — proposed v1

Mechanics.stepMechanicsTick produces work before advancing time, then emits work at the
updated time. Cattle output follows. At tick zero it emits WinterAdvanced, resolves deaths,
consumes cattle/resident Food, handles upkeep/collapse, careers, partnerships, births,
care, Farmyards, cattle births and weather. stepWorld runs last, including mission returns.
Therefore WinterAdvanced alone is not a closed checkpoint and event.time.winter is not
a safe accounting cutoff.

The checkpoint is the complete returned state from the tick resolving the boundary,
including stepWorld. Record exclusive event sequence end, actual stock totals, canonical
time and a versioned input/history identity. All events since the previous exclusive end
belong to this package, including incoming-timestamp final output and annual consumption.
A player command issued at the same calendar tick afterwards belongs to the next package.
Demographic records retain their actual recorded Winter; no relabelling to fit a range.

For an opening at 800, chapter 1 closes at 805 tick 0, chapter 2 at 810 and chapter 3 at
815. Label intervals as five completed annual resolutions ending at that boundary. An
advance from a partial year may cross several cutoffs; split presentation observation at
each milestone, freeze each actual intermediate result, then finish the original command.
Prove resulting Core JSON exactly equals the original unsplit command. Accumulate trend
for the whole command and keep failed-command handling atomic. Reading/refresh cannot
produce a checkpoint or consume RNG. Exclude the opening's existing creation events from
chapter transaction windows, while retaining them as opening provenance.

## Narrative identity and persistence — proposed v1

Keep the narrative extension outside SimulationState so canonical saveJSON, RNG and replay
remain unchanged. GameplaySession owns the observer/book; the Fjord wrapper and shared
handoff persist it. New campaigns choose a distinct narrative identity/seed using a
presentation-only source, never simulation RNG. Load/restart boundaries explicitly select
restore versus new-book behavior. Final controlled text is saved with facts/provenance,
style/template/checkpoint versions, index, source range and publication/notified/read state.

Store and validate history identity, not just gameplay seed plus index. Local save pairing
currently checks only equal seed: narrative pairing must additionally match the exact
canonical save/history lineage. Restoring an older canonical save must not attach a newer
sidecar's chapters. Validate extension before committing an import. Unsupported/corrupt
extensions give a clear error or explicit partial-history path, never silently accept a
foreign book. Plain canonical JSON remains usable with explicit legacy coverage and no
retrospective popup flood. Do not backfill several complete checkpoints from one mutable
final snapshot. Subsequent observed intervals can become complete from their saved cursor.

No runtime model is needed. Publish a controlled readable baseline immediately. Future
writer jobs must be keyed to current book/input identity and cannot replace published text,
reopen dismissed chapters or resume a paused/hidden/transferred session. Published facts
are immutable even while new chapters accumulate.

## Shared reader behavior

A single accessible reader is used in 2D and Fjord. New-campaign opening appears once.
Each newly published five-Winter chapter is notified once; the book is always in the menu.
Close dismisses all pending notifications in the ordered viewer without deleting chapters;
read status remains separate. New chapters arriving during reading join the queue without
replacing the current passage. Provide chapter navigation and accessible factual tables.
No mandatory decisions, costs, reading delay or model spinner. Render data with safe text.

Use a contained, scrollable touch/keyboard panel that leaves the clock/manual pause usable.
Opening/reading/closing never changes running intent or pacing. Respect existing scene
loading, visibility and transfer guards. Focus should enter the reader and restore to a
valid opener on close; key handling must not leak into camera controls. Do not create a
full-screen backdrop that makes manual pause inaccessible while the world continues.
Future hide-automatic-popup settings are explicitly outside this slice.

## First TDD delivery sequence

The owner confirmed the Clan Book/session and browser seams on 11 October 2026.
The implementation follows these vertical slices:

1. Frozen new-campaign opening, stable text and separate narrative identity; exact Core unchanged.
2. One complete five-Winter package, boundary transactions and ledger reconciliation.
3. Multiple milestones, rollback/import/handoff and plain-save partial coverage.
4. Shared automatic reader/menu with no-auto-pause, ordered notifications and frozen content.
5. Missing real lifecycle mappings, negative factual/identity cases and compatibility regressions.

Checks must cover paid upkeep/construction/upgrades, salvage/refunds, slaughter, mission
spending/loot, shortages and incomplete event data. Test repeat callbacks and save/load at
partial ticks, 15-Winter fast-forward, rollback to a different future, and hidden/load races.
The browser must verify visible clock progression behind the reader, manual pause, no
hidden catch-up, touch layout, keyboard focus and persistence across 2D/Fjord.

Implementation and final acceptance remain pending; this audit does not close #103.

Runtime implementation: [CLAN-BOOK-V02A.md](CLAN-BOOK-V02A.md). This inventory records
the design groundwork; executed acceptance evidence is maintained in the linked QA report.
