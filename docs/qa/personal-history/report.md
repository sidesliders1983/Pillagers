# Personal history QA · #122

Base: `626a5c2adbad91ce9ac9c5c1cdec4ec3a9a3dfc8` (accepted #124).

## Before / after

Before, a resident's management panel ended at occupation history. Their supported birth, partnership, housing, expedition and social records could only be read in the settlement-wide Chronicle/book. See the [baseline resident panel](https://github.com/sidesliders1983/Pillagers/blob/626a5c2adbad91ce9ac9c5c1cdec4ec3a9a3dfc8/src/play/SettlementPanel.ts).

After, the same panel contains a compact **Personal history** disclosure. It shows ten factual records at a time, original relative dates, involvement roles, source details, exact safe published excerpts and **Read in Saga Book** passage/context links. The current profile and event-time identity remain distinct.

- [Desktop board](browser/play-desktop-after.png)
- [Desktop Fjord](browser/fjord-play-desktop-after.png)
- [Tablet Fjord](browser/fjord-play-touch-after.png)
- [Saved passage navigation](browser/fjord-play-touch-passage.png)
- [Archived childless outsider](browser/fjord-play-touch-archived.png)
- [Reuse map and attribution boundaries](../../lore/PERSONAL-HISTORY.md)

The early trace image `collapsed.png` is an intermediate collapsed disclosure, not a baseline screenshot.

## Executed checks

- Public projection/session TDD: 12 tests pass. Same-name residents, entity namespaces, renames, frozen household membership, births/partners, real Core social attempts/results, historical expedition participants, care, deaths, archived outsiders, repeated saved callbacks, exact excerpts, rollback, handoff and unknown old metadata.
- `pnpm test`: 647 tests; 646 pass, 0 failures, 1 existing skip. The skip is the optional portable frozen r3 GLB fixture check, not a skipped downstream validation after a failure.
- `pnpm run build`: passes.
- Browser script: `/play` and `/fjord-play`, 1440×900 desktop and 1024×768 touch emulation. Bounded paging, source expansion, passage navigation, switching individuals, archived access and rollback pass. Exported canonical state remains byte-structure equal before/after reading, including RNG and events. Manual pause is retained.
- Running-clock browser checks: scrolling survives harmless ticks; opening/closing the reader preserves the running clock. Desktop transfers in both directions retain selected-person history and manual pause.
- No page errors in the four browser runs. Results: [browser/results.json](browser/results.json). These tests use real controls and explicit imported fixtures; they do not certify physical iPad Safari.
- The repository has no configured formatter. New source/tests were laid out with the installed TypeScript printer and reviewed manually; `git diff --check` passes. No formatter configuration or dependency was added.

Character validation with explicit Lab previews passes: 20 assets / 36 GLBs, 12 Golden Characters and 19 equipped modules. Exact-head GitHub checks are required before marking the PR ready; their final status is recorded in the PR.

## Scope and limits

No biography generation, model calls, balance changes, Family Tree admission changes or extra Core commands were introduced. The derived index is not saved as another ledger. Reading cannot generate chapters. Appended events are indexed once; frozen publication references are updated when the book changes, not every frame. Campaign replacement invalidates the cache and link epoch even when the seed/book identity repeats.

New housing events store event-time occupants, preserving snapshots captured before salvage/collapse. Existing event histories and published prose are not rewritten. On 12 October 2026 the owner waived reconstruction of old campaigns: absent or mismatched housing attribution stays unknown. Old paragraphs without a supported personal boundary get context links rather than fabricated excerpts.

The review uses actual supported schemas and real Core commands, with a labelled archived-identity fixture and saved-paragraph callback fixture. Existing historical measurement reports are untouched.
