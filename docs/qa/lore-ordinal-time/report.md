# Ordinal-time wording correction · PR #118

New prose replaces absolute calendar-year numbers with verified event anchors and spelled ordinal Winters. The opening no longer says `Winter 800`; the stock passage at calendar boundary 805 says `By the fifth winter after the founding party arrived`. Exact UI dates, checkpoint ranges and resource facts remain available.

Arrival winter is offset zero. The fifth winter after arrival is offset five, avoiding a first/sixth-year indexing error. Longer offsets are spelled, including `twenty-fifth`. An account with no arrival or clan-initialization event explicitly uses its recorded opening checkpoint. No date or founding event is fabricated from old prose.

Generator/style/template 4 applies to new text only. Published style-2 and style-3 text and provenance survive load and later chapter generation; their optional paragraph catalogues use their recorded composer. The new model-free preview covers the same 69 source checkpoints in a separate folder. Historical style-2 model results, original audits and style-3 preview files remain untouched. The current stricter re-audit is separately labelled `../local-lore/analysis-review-v3.json`.

Regressions cover no calendar-year numbers in new opening/chapter prose, the fifth/tenth/twenty-fifth Winter after arrival, fallback to an actual account checkpoint, exact UI/factual dates, source references, save/load and preservation of older published text/catalogues. Core, RNG, events, clock intent and five-Winter delivery are unchanged. No local model is loaded.

Final build, tests, browser evidence and current-head CI results are reported on PR #118. Source formatting is inspected manually; the project has no configured formatter command. The existing ordinary asset audit still requires approval for the bun Lab preview; the required CI command audits explicit Lab previews under its existing policy.
