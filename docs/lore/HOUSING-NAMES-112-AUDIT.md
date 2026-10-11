# Housing names in Lore — #112 source map

Implemented after the owner's 11 October screenshot clarification: the affected labels
are `house-2`, `Household: founder-9` and `Residence: house-2` in the management panel.
The screenshot shows Daugirdė as its resident. These references now use Daugirdė's stored
character name consistently in the settlement and in newly recorded Lore.

## Naming source and clarification

The inspected integration is `codex/lore-clan-book` at bbdaaa9, also the base of this fix.
Both its 2D/Fjord projections and management panel used raw housing IDs; their resident
lists already used stored persona names. The audit did not find a separate accepted house
name field or formatter. The supplied screenshot clarified that these raw panel labels
are themselves the target. This fix shares their resident-based display resolution rather
than claiming to have found an existing named-house registry.

`src/simulation/HousingNames.ts`, `housingName`, reads existing active household membership
and stored cultural character names. A single resident gives `Daugirdė’s home` and
`Daugirdė’s household`; multiple residents give `Daugirdė and Sigrid’s home`. All living
members are included in existing membership order. There is no selected household head,
new surname, dynasty, place generator, extra identity field, or random draw. A vacant
home has the neutral label `A home`. Tents use the same residents with the noun `tent`.

## Shared consumers and history

- `src/play/SettlementView.ts` and `src/fjord-play/FjordProjection.ts` call the shared
  helper for housing entity labels. Selection keys and canonical IDs stay unchanged.
- `src/play/SettlementPanel.ts`, `src/play/PlayUI.ts` and
  `src/gameplay-lab/GameplayLab.ts` use it for headings, household/residence links and
  house/Farmyard picker text. Option values, commands and selection attributes retain IDs.
- `src/simulation/EventFacts.ts`, `eventFacts`, adds `details.housingNames` only when a
  recorded reference can be resolved: `{ version: 1, building?, household?, residence? }`.
  Each entry contains its canonical `id` and the contemporaneous `name`.
- `src/simulation/Mechanics.ts` captures salvage/collapse names before deleting homes or
  returning their residents to tents. Build events use their explicit household reference.
- `src/simulation/Farmyards.ts` uses the existing fact-capture path for function transitions.
  A transition emitted after removal cannot resolve the deleted home and uses a neutral
  historical fallback; no current resident is invented as its former owner.
- `src/lore/Chronicle.ts`, `housingReference`, accepts only matching IDs in version-1
  snapshots. Construction, move, specialization, upgrade, debt, salvage, collapse,
  Farmyard function and cattle assignment templates retain quantities and source IDs.
- `src/lore/ClanBook.ts` freezes optional opening household `displayName` and
  `residenceName` fields. `src/lore/ClanBookReader.ts` escapes these factual labels;
  explicit Housing source identities retain household, residence and membership IDs.

## Compatibility and gameplay

New events carry additive presentation metadata; rules, canonical entities, event order,
relationships, RNG, resource quantities and command outcomes are unchanged. A comparison
against bbdaaa9 checks three seeds at eight command checkpoints each, including nested CPU
clans and ten Winters. After excluding only `housingNames`, states are deeply identical.

Legacy events without a usable recorded designation use `a home`, `a household` or
`a tent`; they retain provenance and are not backfilled from present-day residents.
The on-demand Chronicle and future chapter composition use the corrected references.
Already published chapter text remains byte-for-byte stored text, including old raw-ID
sentences. No automatic repair migration is included. Old opening facts lacking optional
labels render neutral rows and retain their IDs in the source disclosure.

## Evidence

[Focused browser evidence and regression results](../qa/housing-lore/report.md).
Historical measurement/QA reports are preserved. Formatting was reviewed manually;
there is no configured formatter command.
