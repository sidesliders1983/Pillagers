# Reproduce the optional local Lore experiment

The game never downloads or starts these models. Run these steps manually on the developer machine, with adequate RAM, VRAM and disk reserve. Bind the raw server to loopback only. Do not run both candidates simultaneously. Preserve previous outputs before repeating a run: the runner starts a fresh JSONL file.

1. Download the exact GGUF from the repository/revision in `manifest.json`. Verify its byte length and SHA-256 before use. Both official models declare Apache-2.0; their cards and the community conversion provenance are distinguished in the manifest. No weights are redistributed here.
2. Use llama.cpp b11429 (`d81235049384534c167caea52b85a694f6103d14`) with the pinned CUDA 12.4 distribution/dependencies. The CPU smoke probe is a separate, incomplete hardware test.
3. Start one model with these common flags (substitute the verified artifact path):

```powershell
& '<runtime>/llama-server.exe' -m '<verified-model.gguf>' --host 127.0.0.1 --port 8085 -c 4096 -np 1 -t 4 -tb 4 -ngl 99 --jinja --no-context-shift -b 256 -ub 128 --flash-attn on --cache-ram 0 --ctx-checkpoints 0 --no-cache-prompt
```

The server's default 8192 MiB RAM prompt cache caused an interrupted probe on the owner laptop. Keep the explicit cache bounds. The CLI requests --no-cache-prompt and cache_prompt is omitted from HTTP bodies. All accepted main-cohort B/C replies report cached_tokens=0; LCP slot-selection logs alone do not establish reuse. Preserve raw cached_tokens/timings.cache_n and distinguish sequential loaded-model timings from cold process/startup benchmarks. The model has no tools or write access; JSON grammar constrains IDs and code checks the selection against each slot.

4. Use the committed `corpus.json.gz` and uncompressed-content hash in `corpus.sha256` for exact paired input. Do not re-freeze between B and C. A fresh corpus intentionally gets new book lineage IDs, so its hash will differ even when deterministic Core facts match. The raw snapshots contain the original lineage and approved text.

```powershell
$env:LORE_CANDIDATE = 'B' # then C with its matching verified server
node scripts/qa/benchmark-local-lore.mjs
$env:LORE_OUTPUT = 'docs/qa/local-lore/edge-cases'
node scripts/qa/benchmark-local-lore.mjs
Remove-Item Env:LORE_OUTPUT
```

Fresh corpus generation, when explicitly desired:

```powershell
node scripts/qa/freeze-local-lore-corpus.mjs
node scripts/qa/freeze-local-lore-edge-cases.mjs
```

The first command freezes twenty unmodified seeded campaigns, ten Winters each, three chapters each. The second freezes three labelled imported fixtures for quiet/duplicate-name, shortage and care/occupation coverage. Commands use the actual Core. Each script compares the session's serialized Core with direct command execution and checks exact book reload.

5. Recompute provenance, ordering and repetition diagnostics:

```powershell
node scripts/qa/analyze-local-lore.mjs
```

`candidate-*.jsonl` preserves each input context, raw response, accepted selection or fallback and timing. Candidate summaries include every timed fallback. The catalogue, full snapshots and frozen aggregate ledger remain in the compressed corpus. Resource logs sample the server process and whole GPU device every two seconds; these are sampled observations, not exact device-allocation traces.

6. Optional concurrency probe (close other QA browsers/tests first):

```powershell
$env:LORE_CANDIDATE = 'B' # A means no server loaded; C uses the other verified server
node scripts/qa/profile-local-lore.mjs
```

It uses Edge headless, a paused seed-32 Low-quality Fjord scene at 1024x768, eight seconds warmup, two paired fifteen-second requestAnimationFrame windows and one opening generation per active window. The loaded model remains present during B/C idle windows. Raw frame intervals are saved. This measures browser pacing, not GPU execution time; the renderer/device and clock checkpoints are recorded. Observe memory/disk and stop the experiment if reserve is lost. Interrupted windows must remain explicitly labelled.

7. Production reader QA needs no server:

```powershell
$env:QA_OUTPUT = 'docs/qa/local-lore/browser'
node scripts/qa/check-lore-continuity.mjs
```

This preserves the earlier #104 evidence folder. It checks notifications, dismissal, phone/tablet layout, exact text across route handoff and clock intent. Touch emulation does not establish physical iPad Safari support.

No benchmark command enables a model in player routes. The default composer remains the synchronous, model-free publisher. A future application endpoint, text-publication policy or player option requires a separate integration decision.
