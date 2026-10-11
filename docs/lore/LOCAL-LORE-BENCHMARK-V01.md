# Local Lore benchmark v0.1 — issue #105

This developer investigation builds on the reviewed controlled composer in PR #116. It does not enable a model in player routes, change default pop-ups, or replace published text. PR #115 is merged into its existing stack; #116 remains a separate dependency awaiting owner merge approval.

## Settled experiment contract

The campaign remains the factual authority. A frozen request contains a validated chapter, approved paragraph catalogue, relevant dated older facts, planning references and selected prior text. The model selects one paragraph ID per slot. Code checks exact request SHA-256, slot membership and complete selection, then fills the approved text and provenance. JSON grammar is an output constraint, not a semantic truth detector. Arbitrary prose is rejected. This comparison therefore measures arrangement/variant selection within the same finite composer, not unrestricted creative writing.

The adapter is developer-only, explicitly disabled by default, and accepts only a configured HTTP loopback endpoint with redirects disabled. No browser model, player download, paid API, external-provider fallback, cloud hosting or additional inference dependency is added. The model has no tools or game-state write interface. Names and event text are encoded as JSON data and identified as untrusted data in the prompt; unsupported choices never become text.

The experiment queue processes chapters chronologically and gives the next job committed prior experiment text. A duplicate input returns the same settled result. The developer caller must explicitly invalidate before rollback, restart, import or handoff; this advances a transient epoch, and a late result is discarded. The queue is not attached to production routes. Results cannot publish, notify, unpause or change any game state. The production session continues to publish the baseline synchronously at the existing cadence, so a missing model cannot block play or reopen a dismissed reader.

## Hardware and reproducibility

Owner/developer laptop: Intel i7-7700HQ, four cores/eight threads; 15.86 GiB RAM; GTX 1050 with 4 GiB VRAM; NVIDIA driver 582.78. Initial observed free RAM 4.11 GiB and disk 8.29 GiB. These are availability snapshots, not peak memory or measured inference speed.

Reference candidates are [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) and [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B). Both official cards declare Apache-2.0. Their original Transformers weights are not the quantized artifacts run here. The exact community GGUF files, embedded tokenizer, hashes and runtime are pinned in the experiment manifest; do not imply a community conversion was built from the currently inspected upstream revision without evidence. [SmolLM3-3B](https://huggingface.co/HuggingFaceTB/SmolLM3-3B) remains an optional candidate, not a measured fallback.

Runtime: [llama.cpp](https://github.com/ggml-org/llama.cpp), b11429, commit d81235049384534c167caea52b85a694f6103d14. Server binds 127.0.0.1:8085, one slot, 4096 context tokens, four CPU threads. CPU and GPU evidence must be reported separately. Raw server stays private and is not proxied through Vite or exposed to LAN players. Production adoption would need an application-controlled endpoint and a separate owner decision.

The corpus uses real public Core/session commands and preserves raw facts and source IDs. Controlled QA rule overrides and imported fixtures are labelled. Reports retain all request outcomes and timings rather than only successful examples. Required acceptance includes comparison quality/repetition, resource measurements and reader review; passing technical tests alone is not evidence of better prose.

## Scope of tests

Owner agreed: public adapter and benchmark output, plus browser reader/pop-ups with the model absent. Contract coverage includes unchanged Core/save/playback, validated selection and fallback, timeout/unavailable endpoint, ordered chapters, duplicate requests and stale completions. Browser evidence is recorded separately and does not imply physical iPad validation.
