# Livestock wording correction · #104

Owner instruction, 11 October 2026: describe livestock by species, life stage and quantity; group related events; keep exact resource quantities in the factual overview; invent no motives, traits or ownership. This supplements the original [cohort report](report.md), whose earlier composer metrics are preserved.

The composer now groups recorded cattle births, deaths, slaughter and assignment by action, Winter and destination. Each selected group includes all of its contributing events, rather than stopping at four animals. Event-time age is evaluated against the saved campaign's lifecycle thresholds. Current default boundaries are calf below one Winter, heifer/young bull from one to below three, and adult cow/bull from three. Legacy/configured thresholds remain authoritative. Missing evidence uses a general cattle designation. New founding passages use the same descriptions.

Food and Materials amounts have moved out of new narrative prose, including slaughter yields, construction costs, expedition provisions and reserves. Their exact values remain in the frozen facts, resource ledger and transaction sources. The overview groups livestock too; individual IDs are confined to collapsed source details. Published chapters are not rewritten. Version-1 plans still import under their original grouping rules; new plans are version 2. Core commands, lifecycle, stocks, RNG and replay are unchanged.

## Test-first evidence

- Three slaughter commands for a calf, a heifer and an adult bull now produce one sentence. Public saved receipts remain exactly 5, 10 and 15 Food, totaling 30; an independent direct Core run is identical and the book restores exactly.
- Repeating the same assignment preserves both source records but still describes one cow, not two.
- Five births at the same Winter are all counted and referenced in a single passage. The regression first showed only four calves despite five factual birth records.
- Founding prose identifies two adult cows and one adult bull. A configured adult threshold of five correctly describes a three-Winter female as a heifer at slaughter, even though the checkpoint occurs later.
- Focused public book/session/housing suite: 37 passed, zero failures/skips. Production build passed; the inherited bundle-size advisory remains. A plain Core import also leaves its 20 Materials ship-salvage receipt in the factual overview instead of the partial opening prose. No formatter is configured; source formatting and the diff were reviewed manually.

## Browser and review

[Browser results](browser.json), [livestock screenshot](livestock-tablet.png). Edge touch emulation (1024×768 and 390×844) passed without page errors. A canonical Core fixture was imported through the actual file control; three UI slaughter commands produced the grouped passage and a 30 Food receipt in the factual overview. Existing reader dismissal, HUD bounds, notification, 2D-to-Fjord text transfer and running-clock checks still pass. This is not a physical iPad Safari claim.

[Actual runtime review](runtime-review.html) now contains thirteen regenerated passages, including calves and the calf/heifer/bull slaughter case. `node scripts/qa/sample-lore-continuity.mjs` recreates them using real Core campaigns or explicitly disclosed configured Core fixtures. Prior saved wording remains frozen. The original 20×50-Winter metrics have not been recomputed for this wording correction; they are not presented as measurements of the new prose.

Required CI is rerun on the amended PR head before the PR is released. No validation or conditional skip was introduced or weakened.
