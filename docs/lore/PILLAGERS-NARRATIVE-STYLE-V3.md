# Controlled lore · relative time style 3

Owner direction: [PR #118 review](https://github.com/sidesliders1983/Pillagers/pull/118#issuecomment-6117995961).

The shared composer now gives each narrative paragraph its own dated anchor. A validated arrival or longship salvage can supply the first reference; otherwise one exact calendar date establishes it. Later clauses are sorted by event year, tick and source order. Same-year clauses stay in that year; gaps come from the underlying calendar years. A non-boundary event uses year wording rather than implying a winter-season occurrence. Topic order and independently selected paragraph variants cannot inherit a date from another paragraph.

Livestock stays grouped by action, year and destination, with species, event-time life stage and count. Animal names and IDs remain provenance. Exact Food/Materials amounts, coverage, unmet need and source dates stay in the factual overview. Narrative stock descriptions refer only to the stores, never to every resident's wellbeing. A stock callback explicitly anchors to the chapter's closing Winter before looking back. Incomplete quantities remain unstated.

New openings and checkpoints use generator/style/template version 3. The save envelope and five-Winter cadence do not change. Restore accepts versions 1–3 and preserves every published text, fact and source reference. Only future chapters use the new style. The version-2 composer remains available for historical frozen request catalogues; this does not rewrite old passages or enable inference.

The original #105 model corpus, responses, summaries, browser evidence and analysis are historical style-2 records. The stronger integrity audit writes `analysis-review-v2.json`, leaving `analysis.json` untouched. A separately labelled model-free preview at `docs/qa/lore-relative-time/review.html` compares sixty-nine old/new passages against the same source checkpoints. It is not a rerun of Qwen or an accepted reader-preference measurement. New corpus runs require a separate output folder; benchmark output refuses to overwrite an existing outcome file.
