# Housing names in Lore — #112 investigation

Status: partial fix; the accepted resident-based house/household naming source is still unresolved.
This does not close #112 and must not be released as the complete naming repair.

Inspected integration: `codex/lore-clan-book`, bbdaaa9729f63ac59dd76ec2fcce7664f7dad8d3,
with the active LAN worktree in occupation-aptitude-study. Also inspected the current
primary checkout and tracked remote branches; this is not based solely on older main.
The owner confirms a resident-based naming convention exists. That remains the intended
source to reuse; the paths below do not yet identify its implementation.

## Current source map

- `src/play/SettlementView.ts`, `projectSettlement`: building labels use `b.id`;
  tent labels use `Household ${home.id}`. Named persona labels use `p.name`.
- `src/fjord-play/FjordProjection.ts`, `projectFjord`: building labels use `building.id`;
  tents use `Household ` plus `home.id`.
- `src/play/SelectionPresentation.ts`, `projectSelection`: forwards the entity label;
  `src/fjord-play/SelectionLabels.ts` escapes and renders it without resolving another name.
- `src/play/SettlementPanel.ts`, `render`: house/household headings use IDs. Its resident
  list uses stored persona names. This list is not proof of a separate house-name convention.
- `src/gameplay-lab/GameplayLab.ts`: household/building headings use IDs; resident lists
  use stored persona names.
- `src/simulation/SimulationCore.ts`: household records contain id/memberIds/residenceId;
  buildings contain id/kind/specialization. There is no declared display-name field here.
- `src/simulation/EventFacts.ts`, `eventFacts`: captures persona names/ages from participants,
  but currently captures no historical home/household designation.
- `src/lore/Chronicle.ts`, housing templates: previously interpolated those IDs directly.
- `src/lore/ClanBook.ts`, `closeCheckpoint`: freezes text composed from Chronicle at each
  milestone. `src/lore/ClanBookReader.ts` renders saved text; its opening household rows
  also currently disclose raw household/residence IDs as ordinary labels.

## Completed independent repair

Public projection tests reproduce the exact construction/move sentences reported in #112.
Events without a recorded designation now say a home/a household/a tent rather than using
an internal identifier as a name. The same fallback covers upgrade, specialization, paid
salvage, collapse, maintenance debt and Farmyard-function events. Canonical events/IDs,
ordering, monetary quantities and source links are unchanged.

Published Clan Book text stays frozen: this patch does not regenerate existing saved
chapters. The on-demand Chronicle and future chapter composition use the corrected fallback.
No repair migration or new naming policy has been introduced. Historical QA is unchanged.

## Required next work

Identify the accepted readable-name helper/consumer or an actual route/example from the
owner. Reuse it with minimal event-time snapshots, including capturing a designation before
moves/deletion. New chapter prose and factual rows must match that convention. Cover changed
membership/occupants, same-name distinct IDs, cultural spelling/escaping and published text.
Supply focused browser before/after evidence. The current neutral fallback is not a substitute
for that missing named-entity path and its acceptance checks.

## Executed checks

14 Chronicle/Clan Book public tests pass (including two red-to-green housing regressions).
Build passes. Formatting/diff checked manually; no formatter is configured.
No final browser naming acceptance or physical iPad verification is claimed yet.
