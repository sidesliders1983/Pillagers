# PR #118 review follow-through

## Changes

- Invalid frozen input now throws before returning any narrative text, including with inference disabled. Ordinary valid requests still retain their trusted baseline on timeout, invalid model output or an unavailable server. A rejected queue job is never committed and blocks later jobs until explicit invalidation; a stale job contains no narrative text.
- The independent complete-cohort auditor requires one row per expected campaign/chapter, rejecting missing, unexpected and duplicate outcomes. It checks the baseline, request/result keys, complete context with the actual committed prior text, accepted source/slot combinations and exact fallback content. Missing files and stale results cannot be labelled a complete cohort. Interrupted probes remain separate.
- Shared controlled composer style 3 uses paragraph-local source anchors, sorted dated clauses and computed elapsed time. Same-year events cannot become consecutive winters. Livestock grouping and factual receipts remain exact. New narrative passages omit interval/account machinery and do not claim that aggregate Food coverage proves every resident's experience.
- Published chapters are preserved on reload; future chapters use style/generator 3. Historical style-2 request catalogues retain their original composer. No Core, balance, clock or notification semantics change.

## Evidence

`comparison.json` is a separately labelled, model-free preview of 60 default-campaign and 9 controlled-fixture passages, using the frozen source checkpoints. It does not overwrite historical corpus, model output, summary, report or browser files. No local model was loaded for this review follow-through.

The stricter audit passed the original 138 outcomes: B 53/60 plus 8/9 accepted; C 48/60 plus 8/9 accepted. Counts and raw measurements are unchanged. See `../local-lore/analysis-review-v2.json` for the new audit and source hashes.

Regressions cover changed baseline with disabled/enabled inference, queue rejection/recovery, missing/duplicate/unexpected cohort rows, altered baseline/context/result key/fallback, stale records, same-year events, two-year gaps, paragraph variants/order, absent event anchors and version-2 save/provenance preservation followed by a new version-3 checkpoint. Existing continuity tests still cover older cross-chapter construction, occupation, arrival, expedition and herd callbacks. Exact calendar dates remain in the UI and factual records.

Browser reader checks at 1024×768 touch and 390×844 passed with no model: notification, dismissal, route transfer, playback intent, grouped livestock and exact receipts. Evidence is in `browser/`. These are emulation checks, not a new physical iPad validation.

Build and targeted tests passed. The full local suite completed 612 tests: 611 passed, zero failures, one inherited conditional GLB portability skip. The ordinary local asset command still rejects the existing unreviewed hair/v04-bun Lab preview; the required workflow explicitly audits Lab previews with `pnpm run validate:characters --lab-previews`. No asset or validation policy was changed. Current-head CI results are recorded on PR #118. Source formatting was inspected manually; the project has no configured formatter command. Reader approval of the revised passages remains separate from technical validation.
