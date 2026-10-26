# Normal-rules wedding review fixture (#277)

[Download the paused campaign](review-wedding-campaign.json).

The fixture starts from the normal Summer 800/tick 500 Fjord factory with 15 Food and 5 Materials, its normal four-species rules, weather/social mechanics and the explicit culture prototype. It uses an existing shipped prepared island and actual physical clan/discovery initialization. Only real farming assignments and canonical time advancement precede the review point. No stocks, DNA, relationships, events, fertility or probabilities were edited.

## Review in Fjord Play

1. Open `/fjord-play?culture=1` in this review build. Use **Menu → Campaign → Import campaign** and choose the downloaded JSON.
2. Keep the clock paused. The selected campfire exposes the existing cultural card below its independent fire controls. If selection is not open, select the settlement campfire.
3. Choose **Occasion → Wedding celebration** and **Thorrik Hakonarson & Leofhild**. The card links their actual new partnership record.
4. **Support gathering** opens the 3 Food review. **Not now**, Escape or closing the card must leave Food at 4 and preserve the partnership.
5. Reopen and choose **Sponsor · 3 Food**. Expected: Food 1, one prepared support and one source-linked wedding receipt. This pays for a celebration; the relationship already exists.
6. Press **Play** to review optional existing-actor travel, presentation and audio. Both actual partners must be present for a wedding performance. Visual/audio playback cannot charge or award another support.

Reimport the original checkpoint before independently reviewing a **Communal ceremony** or **Storytelling & music**. All share the same cost: after spending 3 of the available 4 Food, a second purchase is correctly unaffordable. Importing this checkpoint loads existing history; it must not replay a past gathering, and this checkpoint contains none.

The source is `PartnershipFormed event-28` at Winter 801/tick 0, not a founding partnership. Thorrik Hakonarson is 33 and Leofhild is 36. Both are actually available. The saved endpoint is that same tick, so the optional one-year window has not elapsed. The save is paused; real-world review time consumes none of the window. No hidden rival location or inventory is disclosed in these instructions.

## Bounded search and reproduction

The frozen search policy considers seeds 1–5 in order, at most 5,000 ticks each, and accepts the first eligible candidate at a canonical annual boundary. Seed 1 was retained as no valid wedding within that bound. Seed 2 qualified after 500 ticks; seeds 3–5 were not run. The chosen campaign has 11 ordered public commands: ten farming assignments and one `AdvanceTicks(500)`. All attempted commands/observations and the actual default configuration are in [the search evidence](review-fixture-search.json).

The retained search is marked provisional; [the final manifest](review-fixture-manifest.json) separately freezes the settled source and verified import. Reproduction:

```text
node docs/qa/cultural-occasions-277/review-fixture.mjs --freeze
node docs/qa/cultural-occasions-277/review-fixture.mjs --verify
node docs/qa/cultural-occasions-277/review-fixture.mjs --replay
```

`--freeze` replays the selected real commands, verifies its original Core hash, performs a public SharedSettlement save/import roundtrip, and records the actual prepared-asset identities and final source hashes. `--verify` checks those artifacts without simulating; `--replay` checks the exact recorded commands and persisted campaign again. It never reruns the seed search to hunt for a different favourable result.

The original publicly saved opening BookSave is restored before physical initialization on replay, preserving its genuine independently generated book identity and narrative seed without altering Core. Final source metadata records portable UTF-8 CRLF-to-LF hashes separately from exact host-specific working bytes. Normalization changes only CRLF to LF; it preserves BOM, whitespace and Unicode. This avoids claiming Windows byte hashes are directly portable to another platform.

The Core endpoint SHA-256 is `7d0560b48723929115cf8bc473ad8590f6373db7d4e064f28af7ff0a351efb45`. This fixture proves a normal-rule review opportunity and importable physical world, not population balance, rendered appearance, listening quality or physical-device performance.
Final verification passed: source/asset/artifact check, exact public-command replay, byte-identical persisted import fixture and actual SharedSettlement restore. The portable normalized-source fingerprint is `07aac4cc9a258888e673254390fca23470e4893eda0ff0735857fb8d8bb3c804`. The original 96,784-byte campaign file was preserved unchanged. Search JSON raw hashes are explicitly host-specific; portable verification uses its separate CRLF-to-LF hash.
