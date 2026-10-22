# Sites memory and loading recovery

## Scope and evidence

The reported failure is an island crash after a few seconds, or loading that
never finishes. The public Site was version 10, upstream
`31e54ef0c4425ccd1328cf35acdbb56febe71f2d`. Worker error logs were empty. That
does not exclude a client JavaScript, graphics-driver or memory failure.
No browser surface was available in this session, so an on-device crash and
actual GPU memory use have **not** been reproduced or measured.

Two independently reproducible problems were found:

1. Clothing coverage fragments retained unreferenced copies of the complete
   native body, including nine position/normal morph targets per vertex.
2. A never-settling `compileAsync` kept the loading flow awaiting forever;
   cancelling the loader did not release that wait. Context loss during loading
   presented a recovery dialog behind the loading overlay.

## Memory measurement

The actual `MeshyHumanFactory` and `FjordWardrobe` prepare the ten real founding
residents from campaign seed 32 (Summer 800), then another ten with shared asset
sources. GLBs are parsed normally; image bitmaps supply their real dimensions
without allocating pixel arrays. The experiment counts unique backing buffers
of the instances' attributes, indices and morph attributes. Node process/RSS
figures are supplementary and environment dependent.

| Prepared residents | Baseline geometry buffers | Compacted geometry buffers |
| --- | ---: | ---: |
| 10 | 185,992,866 bytes (177.4 MiB) | 88,881,890 bytes (84.8 MiB) |
| 20 | 371,985,732 bytes (354.8 MiB) | 177,763,780 bytes (169.5 MiB) |

This is a 52.2% reduction in measured geometry buffers, **not** a 52.2%
reduction in total browser memory. Texture images, GPU allocations, terrain,
animals and the application's remaining objects are outside that measurement.
The 19 unique images used by these outfits represent an estimated 196,083,712
bytes of decoded RGBA pixels before mipmaps. These pixel arrays were not
allocated by the headless fixture. No loading-speed claim is made from the
elapsed timings: those were not controlled benchmarks.

Raw observations:
[baseline](resident-memory-baseline.json), [compacted](resident-memory-compact.json).
The original baseline runner was copied from an ignored investigation directory;
the maintained reproduction is `scripts/qa/measure-resident-memory.mjs`.
The raw `source` field identifies the base revision; the compacted file includes
the working patch described here. The accompanying source-hashes file records
the baseline and corrected geometry source bytes.

## Repair

Compact each owned coverage fragment before merging it. Preserve the native
vertex prefix of the first fragment for fitting/source correspondence. Preserve
all referenced attribute values, native skin influences, morph offsets, UV
seams and triangle order. Do not simplify the visible garments or modify source
models. All ten fixtures retain identical SHA-256 digests of drawn triangle
corner attributes and morph targets. Three representative occupations enforce
both those frozen digests and a vertex budget through the public factory and
wardrobe regression test.

Explicitly bounded GPU compilation waits can now detach on cancellation or
failure. Initial shader preparation has a 120-second limit. Context loss during
loading fails the opening attempt, revealing the existing retry/back/export
flow. Saved campaigns are not replaced by a failed opening. Ordinary resource
builders still drain before owner cleanup; their ownership is unchanged.
The browser's native compiler itself cannot be cancelled by this change.

## Reproduction and validation

Use locked dependencies and Node 24, from the repository root:

```powershell
node --expose-gc scripts/qa/measure-resident-memory.mjs scratch/sites-memory-audit/result.json
node --test tests/native-facial-geometry.test.mjs tests/island-loading-lifecycle.test.mjs
pnpm run build
pnpm run validate:public --tracked
pnpm run validate:characters --lab-previews
pnpm test
```

To reproduce the baseline count, run the measurement script against the recorded
base revision in a separate checkout with its locked dependencies. The runner
changes only headless fetch/image adapters; it does not change campaign rules.

The new loading tests first reproduced the missing cancellation, failure and
deadline behavior, then passed with the repair. Existing coverage, clothing,
neck seams, animated poses, female hair, campaign-entry and lifecycle contracts
also pass in the targeted local checks. The exact PR/main CI records are the
release gates for the full suite.

## Remaining verification

Retest a new and a saved campaign on the affected physical devices, including
several minutes of travel and a background/foreground cycle. Confirm that the
published `site-version.json` matches the repaired main revision. This patch
removes a substantial confirmed memory cost and an unbounded graphics wait;
it does not establish that every reported crash has the same cause. The existing
large clothing textures remain a potential follow-up if physical-device memory
pressure persists.
