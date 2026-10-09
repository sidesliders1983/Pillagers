# Generated-world sand resolution study

Issue #63 under optimization pass #74. This is an opt-in Environment Lab comparison. The default generated-world loader, including production Fjordside, still uses the existing 256px Standard sand. The 512px candidate requires owner review before a separate production activation.

## Inspect the candidate

Open /environment-lab, enable **Sand study · approved ReferenceWater**, then **Generate World**. Use **Standard sand** to switch between 256px baseline and 512px candidate. The two resolutions retain the same stored blueprint, camera, water, residents, masks and all other ground sources. **Sand shore close-up** and **Sand shore gameplay distance** target a dry shore cell near the harbor; Village and High overlook cover the settlement and distant view. Low keeps 128px colour/roughness and no normal map; its resolution selector is disabled. Reference Fjordside restores the original Lab preview.

The explicit study uses the accepted ReferenceWater implementation from #75/#80 for both resolutions. Ordinary generated Lab previews retain their existing boona13 water. Switching the study checkbox rebuilds the same stored geography with the chosen water adapter; switching only Standard sand replaces the render materials without restarting actors or water. World exports contain physical geography and placements, not this Lab presentation choice. No gameplay/save migration is required.

## Exact source and processing

All three maps come from the already locked CC0 ambientCG Ground054 1K PNG sources. The source hashes, original filenames, download and license URLs, output hashes and actual dimensions are in public/ground-materials/world-v01/sand-standard-512/manifest.json. No new source or generated substitute is used.

The existing world-v01 recipe is shared by scripts/encode-world-ground-map.mjs. It removes alpha, applies the original colour gamma 2.2, Lanczos3 resize, linear-space saturation 0.8 and tint [1.03, 1.02, 0.96], and encodes colour/roughness as WebP quality 92 and normals losslessly. Data maps receive no colour gamma. OpenGL +Y normal orientation is preserved, with no custom normal renormalization step; native Three.js handles normal sampling. Colour is sRGB; normal and roughness use NoColorSpace. The runtime is native MeshStandardMaterial, roughness 1, normalScale 0.45, RepeatWrapping, full mipmaps, trilinear minification, linear magnification and device-capped anisotropy up to 4.

The authored 3m repeat, palette, masks, four native draw layers, canonical physical terrain, water parameters and placement/navigation contracts remain fixed. Repeat length is not an asserted publisher measurement.

| Delivery | Density at 3m repeat | Encoded map bytes | Estimated RGBA8 full mip storage |
| --- | --- | --- | --- |
| Low 128px, two maps | 42.7 texels/m | 4,902 | 0.167 MiB |
| Standard 256px, three maps | 85.3 texels/m | 143,370 | 1 MiB |
| Standard 512px, three maps | 170.7 texels/m | 610,996 | 4 MiB |

The candidate adds 467,626 encoded bytes (456.7 KiB) and about 3 MiB of calculated sand-map storage. Storage estimates are not measured VRAM and do not imply a fourfold frame cost. Other layers, masks, cached source assets and water resources are outside these sand-only numbers.

## Reproduce

Download the exact locked source archive to scratch/ground-source/Ground054, as listed in the existing world-v01 manifest. With the locked pnpm environment:

~~~sh
node scripts/prepare-world-sand.mjs
node scripts/qa/audit-sand-delivery.mjs
~~~

Preparation verifies source hashes and reproduces the original 256px maps byte-for-byte before creating 512px. The audit runs preparation twice and verifies identical outputs and all twenty original Standard/Low deliveries. Only the three Ground054 Standard candidate maps and their manifest are added; Low stays unchanged. A 1024px candidate is deliberately absent: the bounded comparison has not established a specific 512px detail limitation that warrants its cost.

Browser QA uses the existing external Playwright runtime, native Edge, QA_ORIGIN (default http://127.0.0.1:5190) and optional QA_OUTPUT. It does not add a runtime browser dependency:

~~~sh
node scripts/qa/check-sand-study.mjs
node scripts/qa/capture-sand-study.mjs
node scripts/qa/check-sand-lifecycle.mjs
node scripts/qa/measure-sand-study.mjs
~~~

Run GPU scripts sequentially. The checked-in review and evidence are in docs/qa/generated-sand-resolution. Static captures freeze phase zero; timing uses active water, wind and ten residents. Hardware measurements are diagnostic on this development laptop, with no automatic few-millisecond gate. Physical mobile hardware and driver VRAM are untested. Owner approval of this candidate is pending.
