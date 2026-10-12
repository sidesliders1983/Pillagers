# Local Lore comparison — issue #105

Status: both sixty-chapter cohorts and both nine-chapter fixture runs completed. Owner reader-preference review remains pending; final current-head CI is checked on PR #118. This is a developer experiment. The default game still publishes the reviewed controlled composer synchronously.

## Decision under review

Recommendation: retain the model-free composer. Neither constrained candidate improved the measured repetition diagnostic, and both add latency, rejected choices and substantial hardware demand. Reader preference remains pending rather than being inferred from technical checks. Selecting a different approved variant is not evidence of better narration. This comparison holds paragraph roles/order and factual clauses fixed; it measures variant selection, not new narrative planning or unrestricted creative writing. It cannot establish that these models are incapable of better writing in a differently scoped experiment. The local adapter has no publication, notification, clock or Core-write interface; it is not enabled in any player route.

## Protocol and evidence

A is the exact frozen #104 composer output. B is Qwen3-4B-Instruct-2507 Q4_K_M; C is Qwen3.5-4B Q4_K_M. Artifact bytes, SHA-256, embedded tokenizer pin, upstream inspection revision, licenses, llama.cpp b11429 and corrected runtime flags are in [manifest.json](manifest.json). See [reproduce.md](reproduce.md) for explicit local commands. No paid, cloud or external inference provider is used.

Twenty default-rule seeds (1–20) run ten Winters each with opening, Winter 805 and Winter 810 checkpoints: sixty chapters per candidate. The raw snapshots, catalogue and aggregate Food/Materials ledger are in `corpus.json.gz`; `corpus.sha256` hashes its uncompressed JSON. Direct Core execution matches the session's serialized Core at both five-Winter checkpoints, and save/load restores the exact book. World weather, resident mortality and cattle lifecycle use unchanged defaults.

Three additional labelled imported fixtures cover quiet intervals with equal names, zero production with unmet Food need, and real occupation/caregiver changes. They retain real Core commands/events and save/load checks. Their separate nine-chapter corpus and all outcomes live in `edge-cases/`. No fictional event or gameplay-default change supplies these fixtures.

Each model receives frozen facts, relevant earlier events, planning memory, its own last three committed experiment texts and a finite approved paragraph catalogue. It returns one paragraph ID per slot. Code validates request integrity, slot membership and complete choices, then joins approved clauses and provenance. JSON grammar is not a semantic truth detector; this experiment makes no factuality claim about unrestricted prose. Exact resources stay in the factual overview.

Every request outcome, input context and raw model response remains in the JSONL records, including rejected and too-long responses. [analysis.json](analysis.json) independently verifies accepted paragraph text/provenance, chapter ordering and prior-result context. It also counts exact paragraph repetition after substituting known names and numbers; this diagnostic does not measure reader preference.

## Candidate B results

| Cohort | Chapters | Accepted | Fallbacks | Accepted text changed from A |
| --- | ---: | ---: | ---: | ---: |
| Twenty default campaigns | 60 | 53 | 7 | 51 |
| Three controlled fixtures | 9 | 8 | 1 | 7 |

Default-cohort fallbacks: six HTTP 400 responses because the pinned 4096-token context was exceeded; one model selected an ID belonging to a different slot. The controlled care/occupation fixture also exceeded context once. All returned the exact frozen A text. These are fallback outcomes, not quality successes.

B default-cohort latency, including all timed fallbacks: median 13,984 ms, p95 30,325 ms, maximum 31,514 ms. These are measurements on the owner's development laptop, with background development activity and some tests during the run. They are not isolated laboratory timings or a portable speed guarantee.

All 53 accepted default-cohort selections and eight accepted fixture selections pass the recorded catalogue/source and prior-text audit. Both A and B have zero exact or number-normalized repeated whole chapter bodies in the default cohort. That broad metric hides recurring wording: after replacing known names and numbers, A has 93 repeated paragraph instances out of 221 and B has 97 out of 221. In the fixtures, A has 11 repeats out of 25 and B has 12. Reader preference remains unmeasured; different wording alone does not prove improvement.

## Hardware and interrupted probes

Owner laptop: i7-7700HQ (four cores/eight threads), 15.86 GiB RAM, GTX 1050 4 GiB, Intel HD Graphics 630, NVIDIA driver 582.78. The exact CPU feasibility probe and interrupted initial cache run are described in [hardware-probes.md](hardware-probes.md). Initial default llama.cpp RAM prompt caching was mistakenly left at 8192 MiB and the pass was stopped; corrected runs disable the RAM prompt cache and context checkpoints, and pass the CLI flag --no-cache-prompt. All accepted main-cohort B/C replies report cached_tokens=0. Runtime LCP slot-selection messages alone do not prove cache reuse. These remain sequential loaded-model timings, not cold process/startup benchmarks. The completed earlier outcomes remain separate rather than being counted as a complete cohort.

Corrected B's observed process peak working set was 2,904,739,840 bytes and peak PeakPagedMemorySize64 process counter 3,660,345,344 bytes. Device usage sampled around 3027 MiB includes the desktop and other processes; it is not per-process VRAM allocation. Two-second samples are preserved in `resource-B.jsonl`; process high-water counters and sampled device usage have different meanings. They do not provide an exact allocation trace.

The concurrency probe uses Edge headless, a paused seed-32 Fjord at Low quality, 1024×768/DPR1, eight-second warmup and paired fifteen-second rAF windows. The actual renderer is **Intel HD Graphics 630**, while inference uses the GTX 1050. B's first complete pair measured p95 pacing of 83.7 ms loaded-but-idle versus 2016.6 ms during generation. Median pacing stayed about 66.7 ms. These large tail stalls warrant caution for optional inference on this machine; they do not change gameplay performance acceptance criteria.

The second B window was interrupted after free disk reached 98,197,504 bytes and the runtime was stopped. Its raw frames and fallback remain in `concurrent-B.json`, with the stop snapshot and corrected chronology in `concurrent-B-aborted.json`. It is not a clean second comparison. The campaign clock checkpoint remained identical and no page errors were recorded. No user assets or unrelated services were deleted; only this experiment's downloaded B artifact was removed after stopping it, with its verified pin retained.

An initial model-absent A frame probe overlapped a separate reader QA browser and model-file verification. Its intervals are exploratory and cannot serve as an isolated counterfactual. No physical iPad performance claim is made.

C's initial loading overlapped local validation and was stopped before cohort inference to preserve disk reserve. The startup/runtime log and snapshot are retained separately. The isolated run subsequently loaded and completed under the same flags; the memory-fitting warning was not a fatal failure.

## Browser and technical validation

Model-absent reader QA passed at 1024×768 touch and 390×844 phone viewports: expanded appendix dismissal, five-Winter notification, exact text through 2D↔3D handoff, reading without taking over clock intent, and no duplicate notification after refresh. A controlled livestock fixture confirms stages/counts in prose and exact receipts in the factual overview. Edge touch emulation is not physical iPad Safari validation.

The developer comparison page renders both complete sixty-chapter candidate datasets, including rejected selections, without horizontal overflow at 1440 and 390 pixels. Screenshots and results are in `browser/`. The page displays stored data only and cannot invoke a model or publish a chapter.

Local build and character validation passed. The full local suite completed 605 tests: 604 passed, zero failures, one pre-existing conditional GLB portability skip. Both required CI checks also passed for the implementation revision bf2826859761c15f2043ed5e4b2759ad5cbf5748. The final evidence revision still requires its own current-head checks; consult PR #118 rather than carrying that earlier status forward. New public-interface tests cover disabled/unavailable models, validated sourced choices, unsupported or malformed answers, raw HTTP diagnostics, timeout, duplicate/order/cache integrity, rollback staleness, prior committed context and unchanged Core/save/playback. Historical #104 QA files are preserved.

## Candidate C results and paired conclusion

| Cohort | Chapters | Accepted | Fallbacks | Accepted text changed from A |
| --- | ---: | ---: | ---: | ---: |
| Twenty default campaigns | 60 | 48 | 12 | 17 |
| Three controlled fixtures | 9 | 8 | 1 | 0 |

C default-cohort fallbacks: five over-budget HTTP 400 responses, six selections containing an ID for the wrong slot, and one incomplete JSON answer after 4077 input tokens left only nineteen completion tokens within the 4096-token limit. The entire raw response and exact A fallback are retained. The care/occupation fixture exceeded context once. Every other fixture answer selected the original A text.

C default-cohort latency, including all timed fallbacks: median 15,270 ms, p95 28,246 ms, maximum 32,769 ms. Its repeated normalized paragraphs are 93/221, equal to A; its fixture repetition is 11/25, also equal to A. Among forty-eight valid default-cohort selections, thirty-one produce exactly A and seventeen change a variant. This is no measured repetition benefit.

The independent source/history audit passes all forty-eight C default-cohort selections and eight fixture selections. Five B and four C accepted default chapters include sources predating the current interval; each fixture candidate has one such accepted chapter. Source references exist at the frozen checkpoint, selected roles/order match the catalogue, and prior experiment text matches chronological committed results. This is bounded catalogue validation, not a claim that unrestricted prose has zero semantic errors.

Facts, catalogue and canonical checkpoint match between candidates. The dynamic previousText portion deliberately contains each candidate's own committed earlier result, so later complete prompts need not be byte-identical. Inputs are preserved; do not use their latency difference as an isolated tokenizer or hardware speed comparison.

Corrected C's observed process peak working set is 3,234,660,352 bytes; peak PeakPagedMemorySize64 process counter is 3,793,350,656 bytes. Whole-device GPU use peaks at 2857 MiB; minimum sampled free RAM is 2,463,772,672 bytes. B's corresponding minimum free RAM is 2,583,478,272 bytes. [hardware-summary.json](hardware-summary.json) is generated from all corrected samples and identifies their windows. Model initialization and inference overlap the ongoing development desktop, not an empty laboratory machine.

A separate C 3D probe was not started because approximately 1 GB disk reserve remained, after B had already caused paging pressure. The exact gate snapshot is retained in `concurrent-C-gate.json`. There is no clean C concurrent-frame measurement and no claim of satisfactory concurrent performance. The verified C download was removed after stopping its runtime; a transient Windows mapped-file lock required retrying deletion after process exit. Both model hashes and raw evidence remain. User assets and unrelated services are preserved.

The initial model-absent A probe is retained as `concurrent-A-initial-ui-overlap.json`; its overlap prevents an isolated counterfactual claim. A fresh A probe after both model servers and other QA browsers/tests stopped preserves its own raw intervals in `concurrent-A.json`: p95 pacing ranges from 66.7 to 83.4 ms across four fifteen-second windows, maximum from 83.6 to 116.6 ms. Same Low-quality Intel renderer, fixed camera and paused clock are recorded. The earlier B tail stalls are an observed optional-inference concern, not a new gameplay release budget or a physical iPad measurement.

All planned model request outcomes are retained: 138 in the corrected study, plus separate CPU/initial/interrupted probes. No default dependency changes follow from this report. SmolLM3-3B remains unmeasured; it was not silently substituted. Future work, only if owner preference motivates it, could test a larger bounded context/output reserve, tighter per-slot grammar or another constrained planning scope on hardware with adequate disk/RAM reserve. Free-form narration and deployment remain separate decisions.
