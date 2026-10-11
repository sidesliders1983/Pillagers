# Housing / household display correction — #112

Date: 2026-10-11. Base: `codex/lore-clan-book`, bbdaaa9. Review scope: the owner's raw-ID
management labels and matching new Chronicle/Clan Book housing references.

## Reproduction and result

Before the fix, the browser household-heading assertion failed on `Household founder-9`;
the saved before image captures that panel. Public Chronicle tests also reproduced the
reported construction/move wording and failed before the neutral legacy fallback.
The named projection test failed before the shared housing formatter, and the browser
opening factual-name assertion failed before opening names were frozen.

After the fix, a real fresh seed-32 campaign identifies Daugirdė's household and home.
Salvage the ship, build her home, then advance five Winters: the new chapter records
`Daugirdė’s home was completed for Daugirdė’s household for 10 Materials.` The residence
picker still submits `house-1` while displaying her home name. The 3D panel uses the same
label; the transferred reader retains the exact saved chapter.

- [Before: raw household panel](panel-before.png)
- [After: named home and residence picker](panel-after.png)
- [New five-Winter chapter](chapter-after.png)
- [Fjord management panel](fjord-after.png)
- [Browser assertion output](browser.json)
- [Interactive image review](review.html)

The before screenshot selects a tent household; the after screenshot selects the built
home. They demonstrate the respective label corrections, not a scenery comparison.

## Checks

- Public Chronicle, book/session and settlement/Fjord projection contracts: 20 passing.
  Coverage includes construction/moves, specialization/upgrades, pre-deletion salvage and
  collapse labels, same-name distinct IDs, multi-member labels, later occupant/name changes,
  legacy or mismatched snapshots, source IDs, amounts and immutable old published text.
- Full local suite: 575 tests, 574 passing, one existing optional source-asset test skipped,
  zero failures. No test threshold or provenance assertion was weakened.
- Build: passed; existing Vite chunk-size advisory remains.
- Character validation with explicit Lab previews: passed, 20 assets / 36 GLBs.
- `node scripts/qa/compare-housing-core.mjs`: three seeds (17/32/1983), eight real-command
  checkpoints each and ten Winters. All canonical state, including CPU clans, is identical
  to bbdaaa9 after excluding only the documented `housingNames` event metadata.
- `node scripts/qa/check-housing-lore.mjs`: native Edge, tablet viewport/touch enabled,
  visible real UI controls, 2D/Fjord handoff, opening source disclosure, refresh notification
  deduplication, and a running clock while reading. Separate imported-name fixture verifies
  cultural spelling, HTML escaping and no injected markup or script execution.
- Formatting and `git diff --check`: manual review; no formatter is configured.

## Practical limits

This run uses desktop Edge with tablet emulation; it does not claim a new physical iPad
Safari check. Already-published test chapters remain unchanged, so old raw-ID sentences
can still be present in an existing saved book. Future observed events use frozen readable
names; unresolvable legacy events use neutral references with canonical source disclosure.

[Implementation / source map](../../lore/HOUSING-NAMES-112-AUDIT.md).
