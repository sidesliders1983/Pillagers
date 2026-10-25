# Model texture memory audit and compact default

The owner reports browser-tab reloads/errors on several devices, both with and without sound.
This audit identifies asset costs; it does not reproduce the crash or prove an unbounded leak.

## Scope and measured files

Baseline: GitHub main 12518aec36ac0d12bb6fafba8d7856ecc23bc4a3, the published audio release.
The reproducible inventory covers 134 non-authoring GLBs: 107 under game-assets, terrain, scenery,
wildlife and nature, plus 27 registered Fjord wardrobe/hair/occupation sources. It is a per-source library inventory, not a list of concurrently loaded models.
The raw file/image identities and dimensions are in [measurements.json](measurements.json).

All figures below are RGBA8 image-pixel budgets derived from actual embedded image dimensions.
They exclude browser decoder overhead, GPU format/mipmaps, geometry, render targets, external image
files and JavaScript. They must not be presented as measured process RAM or a known browser limit.
Shared source textures are not multiplied by the number of residents, cows or house instances.

| Source | Original image budget | Compact candidate |
| --- | ---: | ---: |
| Human body, each loaded LOD | 48 MiB | Unchanged |
| General outfit source | 32 MiB | Unchanged |
| Seven other loaded garment/shoe sources | 16 MiB each | Unchanged |
| Nine housing/Farmyard source models | 12 MiB each | 3 MiB each |
| Farm Homestead house | 8 MiB | 2 MiB |
| Tent | 12 MiB | 3 MiB |
| Campfire | 12 MiB | 3 MiB |
| Cattle, each loaded variant | 5.25 MiB | Unchanged |
| Goat/pig/sheep, each loaded variant | 4 MiB | Unchanged |

The exact housing/Farmyard subtotal is 116 MiB (one of the ten has two maps).
The twelve changed sources, including tent/fire, total 140 MiB before and 35 MiB after: 105 MiB
or 75% fewer pixels. AssetManager loads these sources up front even when their buildings are absent.
Their encoded files total 27.58 MiB before and 12.57 MiB after. Compressed file size is not resident memory.

## Bounded implementation

A deterministic offline step bakes 512px, lossless-WebP image variants from the current runtime
models. It replaces only image payload ranges, updating their offsets and relocated Meshopt offsets.
Every non-image payload is byte-identical. Scene graphs, accessors, indices, UVs, animations,
materials, rigging and home-light attachment geometry are unchanged. The ordinary runtime models
and ignored authoring originals remain intact.

The owner approved ordinary Fjord Play activation on 25 October 2026. The existing default Low
preset uses compact models without an opt-in flag; Standard retains original assets. Live Quality
changes retain the already loaded model-image tier, like the existing ground tier; reload to compare.
The QA-only originalModelTextures=1 switch selects original images with all other Low settings
unchanged. No new quality selector, Core/save rule, terrain technology, animal behavior or character
identity is introduced.

The existing build validator verifies all candidate identities, dimensions and retained geometry.
A changed source requires regeneration. Prepared-island dependency provenance includes AssetManager,
so the complete normal island preparation was rerun rather than bypassed. All fourteen resulting
island entries, canonical hashes and compressed payload identities equal the saved baseline.

## Verification and remaining limits

Eight targeted tests passed, including a regression that failed before wiring the real AssetManager:
it requested original housing rather than the compact candidate. The tests exercise actual public
load requests, unchanged campaign/save serialization, default Low requests, unchanged Standard/Lab paths,
source/variant hashes, all retained compressed data, decoded bounds and exact campaign/save parity.
A corrupted compressed geometry payload is rejected by the new guard.

The comparison page shows extracted original/compact colour atlases and links to the complete game.
These images are not invented 3D scene renders. Browser-control inventory was empty, so this pass
does not claim a browser listening/rendering run, measured peak GPU/process memory, sustained
physical-device acceptance or a fix for the reported crash. Human source images and global source
caches remain follow-up profiling targets, not an assumed second defect.

The owner explicitly authorized default activation, merge and Sites publication. Publication still
requires successful CI for the exact current main commit. This authorization does not establish
that the reported crashes are fixed or replace the remaining physical-device memory measurements.

Reproduce:

1. node scripts/prepare-compact-models.mjs
2. node scripts/audit-model-memory.mjs
3. node --test tests/model-texture-memory.test.mjs tests/presentation-quality.test.mjs tests/construction-gpu-preparation.test.mjs
4. pnpm build

No formatter is configured. Source formatting is checked manually and with git diff --check.

The production build passed audio/public-asset validation, all twelve compact checks, TypeScript and Vite. The existing large-chunk warning remains. All fourteen regenerated island outputs matched the baseline byte for byte.
