# Affordable normal-rule wedding review, v2

This is a separately versioned replacement review scenario for the owner-corrected wedding price: **3 Food per actual attendee**, plus any normal ignition Material. The original v1 files are retained unchanged as evidence of their former 3-Food-total rule. These are actual normal Fjord campaigns with culture explicitly enabled; no resources, probabilities, fuel, DNA, events or Core state were granted or edited.

## Frozen bounded selection

`policy.json` was frozen in `policy-freeze.json` before execution. The runner searched seeds 1–5 in order, allowing at most five years per campaign and observing every 50 ticks. At founding, all currently available adults received real `AssignOccupation: farmer` commands. There were no other domestic or expedition commands. The actual shipped baked island, physical clans and discovery were initialized normally through `SharedSettlement`.

- Seed 1: retained negative result after all 5,000 ticks / 100 observations; no affordable wedding.
- Seed 2: first affordable public offer after 1,050 ticks / 21 observations, at **Summer 801, tick 550**. Search stopped immediately; seeds 3–5 were not attempted.
- Current stock: **24 Food / 5 Materials**. Eight actual attendees cost **24 Food + 1 Material** for normal campfire ignition. No gathering has yet been sponsored and the support bank is empty.
- Real partnership: `PartnershipFormed`, `event-28`, Winter 801/tick 0; **Thorrik Hakonarson and Leofhild**. Both are currently available, are reserved in the Core roster, and are 550 ticks into the actual one-year celebration window.

The 31 ordered commands, every observation including rejection reasons, opening BookSave, initial rules, exact source dependencies, baked asset hashes and both checkpoint hashes are in `search.json`. Attention was constructed at founding before any time advanced. The real partnership source remains unread; acknowledgement metadata was not manufactured after the event.

## Two genuine review checkpoints

1. **`review-before-partnership.json`** — paused at Autumn 800/tick 950, before the source exists. Import through **Menu → Import campaign**, then start the clock. The next 50 canonical ticks create the real partnership, so the optional invitation can be reviewed from its actual trigger. Its initial quote is unaffordable; retaining that result is intentional. At the normal three-minute year pace, 50 ticks take about nine active seconds. Continue normal production within the real window to reach the affordable scenario, or import the second checkpoint separately.
2. **`review-wedding-campaign.json`** — paused at Summer 801/tick 550 with the exact affordable quote. Import and review the invitation or the campfire's wedding action. Confirm only if the 24 Food / 1 Material spend is intended; it leaves **0 Food / 4 Materials**. No participant or hidden-resource subsidy has been added to make the example comfortable.

Both imports use the same normal campaign and independent, preserved BookSave. A restored historical source is distinct from a newly generated partnership; the pre-source checkpoint exists to exercise the actual new-event flow. No rival coordinates or inventories are exposed by these notes. The legitimate full campaign save contains the normal saved world.

## Executed verification and remaining review

`--search` completed and `--replay` passed through the actual factory, ordered commands and `SharedSettlement.restore`. Both checkpoint byte hashes, the canonical endpoint, the real pre-source-to-PartnershipFormed transition and genuinely unread source metadata matched. Source dependencies did not change during the search. The endpoint Core SHA-256 is `4bc329ed0e31256741272daee46ea51b18be6b4a6a6ed81454ba7e9314d5a9d5`.

The search began at Git head `d43fff1a036e04b0ad91c54e43c3d7bc6dadce90` plus the explicit dirty owner-approved pricing/fire implementation recorded in `policy-freeze.json` and `search.json`. Its transitive dependency portable fingerprint is `0156b78f92d008ba5a928775c77ef27da417269e4f5590e7d500d1a9022ff8ca`. The original search retains provisional metadata; `manifest.json` now separately freezes the final settled Core/SharedSettlement dependency bytes without overwriting the search or checkpoint files. `--freeze`, `--verify`, `--replay` and the separate one-year helper `--verify` all passed on 26 October 2026. This does not claim that the old clean commit implements the new rules: the recorded dirty-source hashes are authoritative until the containing final Git commit pins the full change.

**Actual production native-gait qualification passed in a separate headless preflight.** The parent retained the real native actor/model and DNA-derived pace evidence separately under `../approach-qualification/`: both the Low six-actor presentation and Standard eight-actor presentation reached gathering at 24.5 active seconds, response ended at 31.5 seconds, and all participants returned by 55.1 seconds. Both actual spouses are reserved; the canonical eight-attendee charge remains 24 Food even when Low presents six actors. The small ceremony-only passing change also has a real public navigation regression test. The first affordable seed was retained; no alternate seed or synthetic default pace was substituted.

This fixture manifest covers its explicitly listed transitive Core/SharedSettlement dependencies; it does **not** cover all renderer/navigation sources (notably the separate LivingWorldController path). The separate qualification report and containing final Git commit pin that scope. Headless imports, commands and native navigation do not establish rendered appearance, audible sound, physical-device performance or owner acceptance. Browser/device review of the new flow remains separate.

## Reproduce

From the feature repository root, on the recorded implementation:

```powershell
node --max-old-space-size=1024 docs/qa/cultural-occasions-277/review-fixture-v2/review-fixture.mjs --replay
```

The final source manifest is already frozen. `--verify` checks its portable source hashes, actual baked assets and retained checkpoint bytes without simulation; `--replay` runs the recorded public commands and both imports again. To repeat the bounded search, use a fresh isolated checkout with this directory's generated artifacts absent; `--search` refuses to overwrite any existing search or policy freeze. Never delete historical evidence or adjust the declared policy to obtain a better seed.

Portable source hashes are SHA-256 over valid UTF-8 text with CRLF changed to LF only. BOM, other whitespace and Unicode are preserved. Separate raw worktree hashes are host-specific. Campaign checkpoints are compared byte-for-byte. The original opening BookSave is restored through its public API so independent presentation randomness does not invalidate exact replay.

## Fast fresh-invitation review through the existing +1 Year action

A separate bounded check restored `review-before-partnership.json` paused and applied exactly `AdvanceTicks 1000`. It also restored the same save independently and applied **`AdvanceWinter`**, the actual command used by the existing **+1 Year** button. The two canonical endpoint hashes matched exactly.

For an immediate review, import the pre-source checkpoint, **leave the clock paused**, then click **+1 Year once**. The endpoint is Winter 801/tick 950, with **38 Food / 5 Materials**, the genuine new unread `PartnershipFormed event-28`, both spouses available, and an allowed **24 Food + 1 Material** quote. Confirmation leaves **14 Food / 4 Materials**. Only 50 canonical ticks remain in this source's real wedding window; keeping playback paused gives time to review the optional invitation without that window advancing.

`review-year-jump-observation.json` retains both actual commands, source facts, unread projection, quote, exact checkpoint and endpoint hashes, and source/asset identity. This is additional review evidence; it does not overwrite or redefine the first-affordable search. The helper passed `node --check` and the executed public-action checks. Reproduce it without overwriting the evidence:

```powershell
node --max-old-space-size=1024 docs/qa/cultural-occasions-277/review-fixture-v2/review-year-jump.mjs --verify
```

Canonical endpoint SHA-256: `b4406e4ea0c6b59e997056b461b11d986ffbd050f98df07c3b1b582d7ba04c2b`.

### Portable verification provenance

The observation retains its original Git HEAD and generating-helper hash as historical provenance. Those metadata do not change the measured public-command result. `review-year-jump-original.mjs` preserves the exact original helper bytes, SHA-256 `5c07cc3a11178d9de788976cfe576a77d713d257cffd3c289b9bc14ff1999a6c`, matching the hash captured in the unchanged observation.

The active helper now compares every measured output and the normalized Core dependency fingerprint, while allowing a different containing Git commit and verifier implementation. It also verifies the archived original helper hash. Hardened helper SHA-256: `be54643d11295a38b88a836cd7d8353c823471164f2e9bf10003beeccd4dab76`. This permits an identical source checkout committed under a new HEAD to reproduce the historical result; it does not permit changed Core dependencies or different campaign outcomes. The hardened `--verify` passed, followed by the main v2 `--verify`; neither the observation, frozen Core manifest, original search nor either checkpoint was changed.
