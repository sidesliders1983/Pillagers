# Prepared campaigns — physical-device follow-up, 22 October 2026

## Input and scope

The owner supplied `fjordside-loading-run-mvjvof4f-1.json` from build
`f8242aab20ed7c9594ef2710b61d671794941ca7`, campaign **2935851268**, geography **101**,
Low quality, iPhone CriOS/iOS 27, 393 × 654 CSS pixels, browser DPR 3 and actual render DPR 1.
The original bytes are retained here with SHA-256
`1a2d2b4767039be6028eff821cba099576ab4f7f9d1833ba326cdf8fa04f5d63`.
The run completed diagnostically in 111.858 seconds; the loading attempt took 111.399 seconds,
with first draw at 108.704 seconds. Recording and cold/warm cache state are unknown.

Geography took 43.229 seconds, initial settlement models 41.734 seconds, terrain/masks
11.312 seconds and first GPU draws 6.521 seconds. Parent/child spans overlap. The preceding
physical run used campaign 3055065912/geography 7; their total times are **not a matched A/B**.
Digest/fetch/decode spans are async-inclusive, so their sums are not isolated CPU time.

The owner requested a larger change: prepare the fixed island pool offline, and reuse fixed
character preparation without replacing unique DNA with generic residents.

## Changes and integrity

- Fourteen versioned publications cover the ten current islands and both historical two-island
  pools. Each is the complete final canonical world and campaign plan, including native terrain,
  coast, geology, foundations, zoning, vegetation, navigation, plots and berth. Full-precision
  JSON survives a lossless gzip round trip. The browser requests exactly one selected file.
- The production campaign worker loads, verifies and unpacks that proposal; Environment Lab and
  synchronous headless APIs keep their procedural generator. Main-thread adoption preserves the
  existing bounded two-world cache and compact recipe-only saves. No generated replacement or
  random reseed hides a failed/missing publication.
- Committed catalogs pin compressed hashes and exact output lengths. Build validation also checks
  canonical hashes and every transitive generator input. Changed inputs require regenerating
  publications; output/rule changes retain their existing recipe/version review requirement.
- Fifty-six compressed character source publications reconstruct exactly the existing body,
  animation, garment, hair, beard, hat, tool and binding bytes. Their total is **34,016,154 bytes**
  versus **73,678,614 original bytes**. The actual ten founders in this report require
  **30,160,174 versus 63,399,961 bytes** before browser/HTTP cache or transport compression.
  This is asset byte size, not a measured network transfer saving on a warmed browser.
- Runtime checks verify the compressed identity tied to the original catalog SHA, then inflate
  with an exact output-size bound. Build validation verifies each original SHA and original file
  bytes. Existing per-factory decoded-source caches remain; every human retains independent DNA,
  face, owned skeleton/materials/fitted geometry and mixer. There is no pool preload or new
  persistent application cache. Unpublished Lab sources retain original verification.
- Terrain render buffers/masks, individual body/face/clothing fits, image decoding and GPU work
  still happen on device. Character identity generation was not the expensive model-preparation
  stage; this change does not claim to eliminate fitting or all character load cost.

## Three matched local pairs

`comparison.json` retains every trial's values, canonical hashes, resident fingerprints, operation
totals, checkpoint memory and raw-output file hashes. Trials ran serially with Node 24.19.0 on
Windows/x64, campaign 2935851268/geography 101. Both arms use the HTTP-LAN JavaScript SHA fallback.
Character image decoding is stubbed. Disk reads replace actual network delivery.

| Work, median of three | Original | Prepared |
| --- | ---: | ---: |
| Island generation vs file read, hash, inflate, parse and worker adoption | 10,438.6 ms | 386.1 ms |
| Ten residents, create/reconcile preparation | 5,012.3 ms | 4,857.4 ms |
| Complete character harness including sampled-pose fingerprints | 5,523.0 ms | 5,366.3 ms |

The large measured CPU improvement is **island preparation**. Compressed character sources
reduce publication/verification bytes substantially, but improve this local CPU harness by
about 3%; a large measured character CPU speedup is not claimed. The physical device may have
different hash/decode costs and must be measured directly.

The entire world/plan has identical canonical SHA-256
`7de87397eeb199d6f46fa0e6c184ef0e31e6d28d218aba59c9dd51ea0656a208` in all six island trials.
Each trial separately times a structured clone and main-thread-style adoption; these are not
actual cross-thread postMessage timings. Every resident's body/module/morph buffers, selected
assets, ground pace and sampled Idle/Walk/Run bone matrices agree in all three matched pairs.

The selected island publication is **2,695,244 bytes**; all fourteen total **36,892,752 bytes** on
disk. Source files remain available for authoring and compatibility. Temporary compressed and
inflated buffers/text add bounded preparation memory; no reduction in physical browser/GPU peak
memory is claimed. The Node character harness releases residents individually and is not a
measurement of ten live residents. The island worker exits after transferring its canonical result.

## Validation

Completed: production public-asset validation, strict TypeScript and Vite build; 34 focused
contracts including all compressed publications, generated-versus-loaded canonical results for
both device seeds and historical recipes, corrupt/missing/truncated/stale data rejection,
bounded inflation, cancellation/ownership, original Lab verification, wardrobe/aging/LOD fits,
precise coverage and unchanged poses. The production-worker integration check and complete
repository suite are recorded separately in the local output logs. Formatting is checked manually
and with `git diff --check`; the project has no formatter configuration.

Pending: a matched physical iPhone diagnostic, actual WebGL/new/restart/resume/import play review,
network/peak-memory measurements and current-head GitHub checks. The available computer-use
inventory returned no browsers or apps, so no full UI/device result is inferred from HTTP or Node
checks. The PR remains draft. Historical measurement reports are preserved unchanged.

Reproduce from the worktree root:

```powershell
pnpm assets:islands
pnpm assets:character-sources
node --test tests/prepared-loading.test.mjs
node --expose-gc scripts/qa/measure-prepared-island.mjs generated-1 --seed=2935851268 --http-digest
node --expose-gc scripts/qa/measure-prepared-island.mjs loaded-1 output/island-loading-259/prepared-island-generated-1.json --seed=2935851268 --prepared --http-digest
node --expose-gc scripts/qa/measure-settlement-models.mjs source-raw-1 --seed=2935851268 --verified-sources --legacy-source-bytes --http-digest
node --expose-gc scripts/qa/measure-settlement-models.mjs source-prepared-1 output/island-loading-259/settlement-source-raw-1.json --seed=2935851268 --verified-sources --http-digest
# Repeat the matched pair with labels 2 and 3, then:
node scripts/qa/summarize-prepared-loading.mjs
```

Matched device replay: `/fjord-play?diagnostics=load&entry=qa-new&seed=2935851268`.
Diagnostics use the complete real loading path, stop before campaign activation and download
the report without replacing the active save.
