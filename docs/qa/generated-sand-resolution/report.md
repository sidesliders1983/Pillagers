# Generated sand resolution — #63 / #74

Date: 2026-10-09. Parent main: a51b844dba1baafaec571ac479d9adaf5b617bc8 (merged #80). This is a bounded Environment Lab study, with production still on Standard 256px. [Interactive review](review.html), [capture fixtures](captures.json), [source/delivery audit](delivery-audit.json), [lifecycle evidence](lifecycle.json), [source/artifact provenance](provenance.json).

## Visual assessment

The candidate is the existing CC0 ambientCG Ground054, delivered at 512px rather than 256px. GrassField is disabled. Day, fixed low sun and Night were reviewed for frozen blueprints 17 and 91. Shore close-up, shore gameplay distance, village and far overlook cover the requested distances; an additional low-sun ground-only pair for each seed removes scenery occlusion. The review contains 76 WebP images (quality 92): 48 Standard frames, 24 unchanged-Low frames and four ground-only frames.

Twenty-four Standard A/B pairs independently assert identical camera, actual native light settings, water description/phase, resident positions/animation and non-sand loaded maps. Exported blueprint SHA-256 stays fixed across the material changes. All captures independently assert decoded Ground054 width/height rather than trusting the selector label. The final captured set was rerun in full after the loader-path correction; no earlier, mislabeled-512 capture is part of this report. Low uses the existing preview rebuild, so resident positions can differ from Standard.

| Finding | Assessment |
| --- | --- |
| Sand structure nearby | Slightly finer grain and less blurred relief with 512px; clearest in the shore close-ups. |
| Sand at gameplay distance | Modest gain. Mask blending, rock layers and scenery limit how much sand occupies the image. |
| Far distance | Little visible difference under existing fog and mip filtering. |
| Repetition | No conspicuous new repeated motif in the reviewed stills; the authored 3m repeat and UVs are unchanged. This does not certify temporal aliasing. |
| Palette and roughness | Preserved; no warm-light or saturation retuning. Night retains its existing visibility limits. |
| Northstar composition | Still unresolved: the narrow sand resolution change does not provide sculpted coastal cliffs, improved rock silhouettes, wet/dry sand transitions or the reference's warmer coherent atmosphere. |
| Proposed delivery | 512px is the review candidate for closer views. Production promotion requires owner review in a separate change. Low stays 128px. |
| 1024px | Not prepared: no specific remaining 512px detail limitation justifies its cost in this bounded study. |

## Source and controlled variables

The [candidate manifest](../../../public/ground-materials/world-v01/sand-standard-512/manifest.json) records source/output hashes, filenames, bytes, dimensions, encoding and CC0 provenance. Source maps are Ground054_1K-PNG_Color.png, NormalGL.png and Roughness.png, at 1024². Their SHA-256 values are respectively bb3b8b28e2a03f6a448a042880532da732e0b00bb3978b912be98001e85c2151, 331258541860948a77d1b47f6a2435344fcd0100e6b789208f5637e77b3bc53f and c4a9057826c1f723cc029159c750fd592fe980f406299a61d179ec40f49c1de8. See the linked audit for exact download/license URLs.

The shared original recipe reproduces the exact existing 256px bytes before creating 512px from the locked originals. Two complete candidate preparation runs produce identical hashes, including the manifest. All twenty original generated-world Standard/Low maps remain byte-identical. The original source preparation was also replayed without changing its outputs or nature footprints. No regional v0.4 atlas is rebaked.

Native MeshStandardMaterial remains fixed: normalScale 0.45, roughness 1, authored 3m repeat, original colour treatment/masks/vertex colours, sRGB colour, NoColorSpace data, OpenGL +Y normals, native mipmaps/trilinear minification and capped anisotropy 4. Canonical heights, topology, biomes, placements and navigation are unchanged. Four native terrain draw layers remain. The explicit study fixes accepted ReferenceWater from #75/#80 across both resolutions; ordinary generated Lab previews retain boona13. No water parameters or algorithm are retuned.

| Sand delivery only | Encoded bytes | Texels/m | Calculated RGBA8 full mip storage |
| --- | --- | --- | --- |
| Low 128, colour/roughness | 4,902 | 42.7 | 0.167 MiB |
| Standard 256, three maps | 143,370 | 85.3 | 1 MiB |
| Standard 512, three maps | 610,996 | 170.7 | 4 MiB |

Candidate delta: 467,626 bytes (456.7 KiB) encoded and about 3 MiB calculated storage. WebP delivery bytes and decoded texture estimates are separate. Driver allocation and VRAM were not measured; the fourfold sand storage estimate does not predict a fourfold frame cost.

## Behavioral validation

- TDD browser boundary: missing controls initially RED; later the genuine decoded-dimensions assertion exposed the incorrect 256px URL under a 512px label. Loader correction makes that boundary GREEN. Selection, default opt-out, exact blueprint/paused actors, Low and normal-water restoration pass through real UI.
- Fourteen focused public generation/terrain/material contract tests pass. The complete baseline suite reports 441 pass, 0 fail and 1 optional-asset skip (442 tests). The production build and full character validation with Lab previews pass locally. The final production browser checks for the study and the ordinary generated Lab also pass.
- Ten warm quality/sand ownership cycles (512 → Low128 → 256) preserve the exported blueprint. Each tier's settled renderer counts stay fixed: 38 geometries; 101 textures for either Standard resolution, 97 for Low. Texture count does not measure byte size.
- Ten page reload teardowns have stable ownership counts. Pause/resume advances then holds the shared water clock; mouse camera movement and 900 × 500 resize work. No page errors are recorded. These are bounded ownership observations, not an exhaustive long-duration leak proof.

## Hardware protocol and limitations

Actual desktop: Windows 10.0.19045, Intel Core i7-7700HQ, native headless Edge 154.0.0.0, ANGLE Intel HD Graphics 630 / Direct3D11, eight logical processors. Canvas 1536 × 1024, DPR 1, viewport 1640 × 1400. This is the development laptop, not a physical-mobile proxy.

Seed 17, shore gameplay and village views, fixed low sun 20° front / fill 1 / exposure 1.05, HDR OFF, GrassField OFF. Each variant has three runs per view, with 10 seconds of warm-up and 30 seconds of requestAnimationFrame interval samples. Water, wind and ten resident animations/movement remain active; advancing water time is checked. Variant order is 256 / 512 / Low128 for each repeat. Low is the existing complete quality tier (including its water grid and omitted ground normals), not a sand-only performance isolation. There is no hard millisecond gate. [hardware-runs.json](hardware-runs.json) retains every individual sampled frame interval, per-run p50/p95/min/max, settings and before/after renderer statistics. Metrics include main and shadow passes. Resident culling can change draw counts between active runs.

Host requestAnimationFrame intervals include scheduling and whole-scene workload; they are not isolated GPU timer measurements. Heat/load/order can affect repeats. No timing claim is inferred solely from calculated texture storage. Physical mobile hardware, driver VRAM, long-duration temporal shimmer and final owner art approval remain untested/pending.

## Measured desktop runs

Values are milliseconds; each cell lists repeat 1 / 2 / 3 rather than pooling away the variation. Calls include main and shadow passes.

| View | Sand px | p50 per run | p95 per run | All-pass calls at end |
| --- | --- | --- | --- | --- |
| sand-shore | 256 | 54.0 / 54.0 / 89.9 | 90.0 / 72.1 / 108.1 | 63–63 |
| sand-shore | 512 | 71.5 / 36.0 / 72.0 | 108.1 / 54.0 / 108.0 | 63–63 |
| sand-shore | 128 | 54.1 / 36.0 / 36.1 | 90.0 / 36.2 / 54.1 | 63–63 |
| village | 256 | 54.0 / 72.0 / 54.0 | 54.2 / 108.0 / 71.7 | 70–70 |
| village | 512 | 53.5 / 89.9 / 54.0 | 54.1 / 141.3 / 54.1 | 71–71 |
| village | 128 | 36.2 / 72.0 / 36.0 | 54.1 / 108.0 / 54.1 | 70–71 |

All measured runs retain 38 geometries. Standard retains 101 textures at either sand resolution; Low retains 97. The timings overlap and vary substantially, including within the same variant. This run does not establish a stable sand-only penalty or gain. It also does not demonstrate a playable frame-rate target on this old development laptop. The bounded Lab delivery has no hard timing gate.

## Main reconciliation

During delivery, main advanced to 80a862a00c3ee7b3c3cdf5a103ad78a3b71eefa2 (#71 character modules/timing). The branch incorporates that main revision. Sand, terrain, water and Lab runtime sources are unchanged by this merge. The original 76 comparison frames, lifecycle observations and 18 timing runs remain the frozen #80-baseline record, rather than silently being relabeled as measurements of the newer actor runtime. The latter has separate [post-main71 production evidence](post-main71/evidence.json) and the final current-head CI suite. The comparison does not establish its frame-time cost.
