# Lossless pine texture transport, 16 November 2026

This follow-up reduces the first-download bytes used by world pines. It follows the separate startup preparation change in PR #336. The reported 4:30 load was over Wi-Fi through a phone hotspot; it was not reproduced on this connection. The mobile backhaul is relevant context, not a proven cause.

## Scope and download budget

The four original 1024 by 1024 PNG textures total 7,807,140 bytes. Their lossless WebP derivatives total 4,764,046 bytes: 3,043,094 fewer image bytes (38.98%). Including the unchanged binary geometry and the optional-extension glTF overhead, the pine source changes from 8,636,895 to 5,594,283 transferred source bytes. This is approximately 3.04 MB less for a fresh supported-browser load, or approximately 5.8% of the earlier 52,067,248 observed window bytes. Worker downloads were outside that earlier count.

All decoded RGBA pixels, image dimensions and original source files remain identical. Geometry, indices, attributes, node transforms, materials, samplers, UVs and role normalization are preserved. GPU texture memory and the number of textures are unchanged. No quality setting, terrain generation, game balance or character appearance changes.

The derived glTF uses optional EXT_texture_webp references while retaining its original PNG image prefix and core texture sources. Readers that ignore the extension can use those original PNG sources. Three.js r187 selects the extension image directly, without a WebP support probe or PNG retry. It catches a texture request/decode failure as a null map; that can leave a loaded tree without its maps and does not necessarily trigger the world fallback for rejected model loads. Current supported browser delivery is checked explicitly. The transport change does not add network-failure recovery.

## Validation

The generator and public-asset gate pin original and derived bytes and compare all four decoded RGBA images. Corruption tests must reject modified pixels, geometry and provenance. The browser check separately verifies actual WebP-only pine requests during scene load, ImageBitmap decode identity, loaded geometry/material/role bounds, and the ordinary paused campaign export after the existing public adoption commands.

The browser check is a correctness and delivery check. It is not another controlled loading benchmark, a physical-phone test or proof that every hotspot load now finishes quickly. The prior native A/B/A timings and their limits remain recorded unchanged in ../startup-loading-333/README.md. Substantial other first-load downloads remain, especially prepared character sources and housing models.

Formatting is reviewed manually; this repository has no configured formatter. The owner-private combat preview remains separate from the main-only public Site and contains only the game and the two existing QA saves.
