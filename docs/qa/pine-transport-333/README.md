# Lossless pine texture transport, 16 November 2026

This follow-up reduces the first-download bytes used by world pines. It follows the separate startup preparation change in PR #336. The reported 4:30 load was over Wi-Fi through a phone hotspot; it was not reproduced on this connection. The mobile backhaul is relevant context, not a proven cause.

## Scope and download budget

The four original 1024 by 1024 PNG textures total 7,807,140 bytes. Their lossless WebP derivatives total 4,764,046 bytes: 3,043,094 fewer image bytes (38.98%). Including the unchanged binary geometry and the optional-extension glTF overhead, the pine source changes from 8,636,895 to 5,594,283 transferred source bytes. This is approximately 3.04 MB less for a fresh supported-browser load, or approximately 5.8% of the earlier 52,067,248 observed window bytes. Worker downloads were outside that earlier count.

All decoded RGBA pixels, image dimensions and original source files remain identical. Geometry, indices, attributes, node transforms, materials, samplers, UVs and role normalization are preserved. GPU texture memory and the number of textures are unchanged. No quality setting, terrain generation, game balance or character appearance changes.

The derived glTF uses optional EXT_texture_webp references while retaining its original PNG image prefix and core texture sources. Readers that ignore the extension can use those original PNG sources. Three.js r187 selects the extension image directly, without a WebP support probe or PNG retry. It catches a texture request/decode failure as a null map; that can leave a loaded tree without its maps and does not necessarily trigger the world fallback for rejected model loads. Current supported browser delivery is checked explicitly. The transport change does not add network-failure recovery.

## Validation

The generator and public-asset gate pin original and derived bytes and compare all four decoded RGBA images. Seven passing focused tests include rejection of modified pixels, geometry and provenance. The browser check separately verifies actual WebP-only pine requests during scene load, ImageBitmap decode identity, loaded geometry/material/role bounds, and the ordinary paused campaign export after the existing public adoption commands.

The browser check is a correctness and delivery check. It is not another controlled loading benchmark, a physical-phone test or proof that every hotspot load now finishes quickly. The prior native A/B/A timings and their limits remain recorded unchanged in ../startup-loading-333/README.md. Substantial other first-load downloads remain, especially prepared character sources and housing models.

Formatting is reviewed manually; this repository has no configured formatter. The owner-private combat preview remains separate from the main-only public Site and contains only the game and the two existing QA saves.

## Recorded browser observation

Installed Chrome on Intel HD630/D3D11, 1366 by 768 at DPR1, normal motion and cleared/disabled HTTP cache loaded the fixed field campaign on clean implementation commit d45fee1d987ae341b16574d6eb0814228b3023bd. The scene requested exactly four unique pine WebPs and zero original pine PNGs. A separate verification phase intentionally fetched the PNG originals: those requests are not runtime fallback.

The built shared GLTFLoader loaded all five expected map slots (four unique 1024-square images), with non-null maps and correct selected image URIs. Geometry, indices, attributes, material settings and all three normalized role bounds matched the original source. All four ImageBitmap-to-RGBA8 framebuffer hashes matched between PNG and WebP; this avoids Canvas2D alpha re-premultiplication. The scene contained ten native residents at Low quality, paused. Its ordinary export exactly matched the fixture after the two existing public import adoption commands. Time801/tick500, RNG2345743795, Food9976 and Materials475 were preserved. There were zero failed requests, HTTP errors, page errors and console errors. The still shows the expected terrain and tree textures at the retained framing; it is not a pixel-perfect screenshot comparison.

The full public gate passed696 files,47 decoded Terrain models,12 compact variants,14 prepared islands and74 exact character sources. TypeScript and Vite passed. The original14-file raw-byte audit and six-artifact deterministic reproduction are retained alongside the seven-test receipt. Text notice/provenance fingerprints normalize checkout line endings explicitly; binary images/models retain raw hashes. The later evidence-only commit preserves the measured runtime and public assets.

## Retained records and reproduction

retained-files.json pins the exact retained bytes and gzip original identities. browser-report.json.gz records requests by phase, actual map and pixel proofs, errors, native actors and Core parity. exported-campaign.json.gz retains the public export; the unchanged input fixture is ../startup-loading-333/fixture-campaign.json.gz. Browser and loopback server were stopped after the check.

The exact measurement harness is retained as browser-check.mjs.gz. Extract it to scratch/pine-lossless-browser/verify-pine-transport.mjs to preserve its relative project imports. Use the existing scripts/qa/serve-startup-build.mjs to serve a clean built snapshot on an owned loopback port. Supply --commit, --dist, --pine-gltf nature/ez-tree-pilot/pine-large-lossless.gltf, --baseline (the original built snapshot), --fixture, --chrome, --origin and --output explicitly; provide the installed Playwright module through PILLAGERS_PLAYWRIGHT_MODULE. It installs no dependencies and changes no game API. It is a historical correctness protocol, not a performance threshold or CI browser requirement.
