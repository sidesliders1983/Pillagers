# Community Hearth model sources — #313

The owner supplied two Meshy GLBs in the Campfire Drive folder. Both were
retrieved through the connected Drive account as original binary files; their
SHA-256 hashes and original byte counts are pinned in the
[runtime manifest](../../../public/game-assets/community-hearth/manifest.json).
No model generation was requested. Originals and preview renders remain in the
ignored local intake directory `scratch/community-hearth-source-313` under the
D: repository root.

| Tier | Supplied model | Runtime GLB | Footprint (width × depth) | Height | Runtime bytes |
| --- | --- | --- | --- | --- | ---: |
| Gathering Shelter | Meshy_AI_Timber_Hall_1105102350_texture.glb | gathering-shelter.glb | 4.254 × 5.028 m | 3.000 m | 1,053,464 |
| Clan Hall | Meshy_AI_Nordic_Hearth_Hall_1105102323_texture.glb | clan-hall.glb | 13.990 × 12.520 m | 4.000 m | 1,081,632 |

Blender source views confirmed that both models face +Z in glTF. The shelter's
open front, benches, and rear/side wind screens suit the lower tier. The hall
has a marked entrance and foreground benches and short fences. Those props
count toward the footprint. Neither model includes an opaque ground slab.
The existing campfire remains a separate asset; this intake adds no flame,
interior, gathering actors, or terrain edits.

Prepare from the feature worktree with installed repository dependencies:

```powershell
node scripts/prepare-community-hearth.mjs D:/CodexSites/Pillagers/scratch/community-hearth-source-313
```

Preparation verifies the original hashes, centres and grounds both models,
scales the hall uniformly to 80% of its original size, and keeps the source
triangle counts (6,486 and 6,642). It uses the existing Meshopt/WebP pipeline:
three 512 px maps per model, lossless normal and material maps, and quality-88
albedo. The public pair is 2,135,096 bytes versus 29,647,900 original bytes.
Each tier uses an estimated 3 MiB RGBA before mipmaps (4 MiB with a full mip
chain), versus 48 MiB before mipmaps for the source maps. The adjacent manifest
and generated TypeScript use the bounds measured after runtime decoding,
including Meshopt's submillimetre rounding.

The asset guard checks the encoded byte count, SHA-256, decoded footprint,
triangle count, image dimensions, and texture budget. Outdoor staging,
placement on the saved island, and actual device acceptance are separate
gameplay checks.
