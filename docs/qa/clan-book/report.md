# QA — Clan Book v0.2A (#103)

Date: 11 October 2026. Branch codex/lore-clan-book, stacked on PR #110 / 3167f01.

## Executed verification

- Build passes. Eight public book/session tests pass, with Chronicle and seasonal projection regressions.
- Full local suite before the final supplemental accounting/import cases: 564 tests, 563 pass,
  zero failures, one unchanged opt-in R3 evidence skip. Current-head CI must pass before readiness.
- Actual Edge browser controls test new-campaign opening, real ticks behind the reader in both
  2D/Fjord, manual pause, chapter queuing without passage replacement, refresh/handoff notification
  deduplication, exact saved text on menu reread, keyboard dismissal, same-book rollback, controlled
  hidden-tab guard and 1024/390 touch layouts. No browser page errors.
- A separate direct HTTP LAN check opens the book at 192.168.68.104:5180/play with secureContext
  false and no page errors. Narrative identity uses getRandomValues, not secure-context-only randomUUID.

## Facts and accounting

Public commands compare Core JSON exactly with an unsplit 15,000-tick run, including stocks,
RNG, lifecycle and events. Three chapters retain cutoffs at 805/810/815, disjoint source IDs
and successive opening/closing stocks. Creation, reading and notification do not change Core.

Controlled source/sink cases prove: 20 Materials ship salvage; 15 Food slaughter;
10 Materials house + 5 upgrade + five paid upkeep rounds at 2 = 25 spent;
115 actual annual Food consumption plus 2 Recon and 5 Pillage provisions = 122 total use;
10 recovered Food is a receipt; later salvage of the 15-Materials building returns 7 Materials.
Five forced Harsh years with no output and no stock record 175 unmet Food, zero spending
and zero closing Food. Fixture mortality/exposure and fertility are controlled for this case;
production/balance defaults are not changed.

Natural deaths keep recorded historical names and do not infer a cause from mortality risk.
Imported legacy data is explicitly partial. Corrupt narrative facts and a stale future book
paired to an earlier Core save are rejected before mutation. Plain saves are accepted without
retroactive popup floods, and their first observed partial interval stays labelled partial.

[Browser evidence](browser.json) · [Reader/appendix images](review.html).
Local build/contracts/full-suite logs are included. The full-suite log predates the final
supplemental cases; the contracts log covers those changes. Required CI validates final head.

## Limits

Physical Safari/iPad and device sleep were not retested. Hidden-tab behavior uses a controlled
visibility property with real application handlers. This is the factual controlled baseline;
full narrative composition/continuity is #104. No model or asynchronous writer is installed,
so no paid inference, download, model latency measurement or late model callback is claimed.
The saved identity fingerprint is a consistency check, not authentication of user-edited files.
No frame-time threshold or new performance benchmark is claimed for this slice.
