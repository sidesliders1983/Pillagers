# Procedural ground and cool-grey stone — #137

## Awaiting owner visual review

The candidate replaces the conspicuous repeating grass tiles and stretched vertical cliff detail with source-derived atlases and native height-aware rock projections. Exposed walls now read as grey stone, retaining darker structure; grass and soil remain visible around their edges. The existing Poly Haven mossy_rock source is sufficient for this first colour candidate. No replacement asset is proposed or implicitly approved.

[Open the paired viewer](review.html). Its first eight comparisons isolate **colour only**: the original olive atlas versus its cool-grey treatment, with the same normal/roughness, projection, terrain, camera, light and tier. They cover a steep inland wall, low sea cliff, rock/grass transition and whole-island oblique in day and low sun. The remaining pairs compare the full original material stack with the candidate. There are **62 captures** across accepted seeds 18, 42 and 1983, including settlement, Standard/Low, night, tablet viewport and optional cold-climate snow.

The exact daylight cliff and valley screenshots still require owner sign-off. This is an Environment Lab study, not a production-default change or a claim of completed visual acceptance.

## Sources and material changes

- Approved CC0 sources remain ambientCG Ground037/Ground054 and Poly Haven mossy_rock/grass_path_2. Original source hashes, URLs and licences are retained in the new delivery manifest alongside output hashes.
- Rock colour is a separately selectable deterministic treatment: preserve linear luminance structure, reduce chroma, apply a restrained cool tint and 1.3 linear gain. It does not replace textured RGB with a flat colour. Normal and roughness files remain identical between colour candidates. Snow is off in all colour comparisons.
- Twenty base atlas maps plus two alternate rock colour maps are delivered. The selected colour replaces the other at runtime; both are not simultaneously bound. Standard uses 1024 px colour/normal/roughness; Low uses 512 px colour/roughness without normals.
- Seeded quarter-turns and offsets blend overlapping source patches offline. The full atlas repeats every 24 m while retaining the source's 3/4 m physical detail scale. This is bounded periodic variation, not infinite non-repetition.
- At the original repeat distance, the stored source autocorrelation values are near zero rather than the exact tiled reference of 1. This supports, but cannot replace, the screenshots. Very close detail is softer than the original small tile. Distant 24 m repetition remains a limitation.

## Preserved world and rendering contracts

Existing #135 grass, sand, mud and rockExposure fields are normalized for rendering. The existing moisture/shelter/slope context already contributes to those fields; clearing/path wear shifts the mix toward soil. No second classifier, new saved raster, geometric noise, terrain displacement or change to height/coast/navigation is introduced.

Six native MeshStandardMaterial passes use native texture channels for XZ/ZY/XY rock projection and independent alpha masks. There is no GLSL, onBeforeCompile or custom splat/triplanar shader. All projections share the source images. The base retains every canonical triangle; extra passes omit a quad only if all four bilinear alpha corners are zero. Seed 18's bare-terrain submitted count changes from 1,280,032 to 746,464 triangles, with 4 → 6 draws. Saved unzoned worlds retain the baseline. Export after preview changes matches the original imported world.

Some broad zoning boundaries remain readable; this slice deliberately does not alter the accepted geology or zoning to conceal them. House/farmyard contact, worn ground and coast are shown with the existing scene in the settlement captures.

## Timing and memory limits

Machine: Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz, Edge/Chromium on Windows. Each capture retains all 90 raw rAF intervals after a 1-second settle. **Repository tests ran concurrently with this visual capture**, so these frame observations are load-contaminated and must not be interpreted as a reliable speed comparison. They do not separate CPU and GPU time. A separate quiet timing run, if included, is identified independently rather than replacing these observations.

| View | Baseline median / p95 ms | Candidate median / p95 ms | Calls | Submitted triangles |
| --- | ---: | ---: | ---: | ---: |
| ground-rock-standard | 83.4 / 116.7 | 66.6 / 83.4 | 4 → 6 | 1280032 → 746464 |
| ground-rock-low | 66.7 / 83.4 | 50.1 / 66.8 | 4 → 6 | 1280032 → 746464 |
| player-start-settlement | 133.3 / 150.0 | 116.7 / 150.0 | 71 → 73 | 5256184 → 4722616 |
| player-start-tablet-low | 100.0 / 116.8 | 99.9 / 116.8 | 71 → 73 | 5207584 → 4674016 |

| Tier | Baseline texture / total ground estimate MiB | Candidate texture / total ground estimate MiB |
| --- | ---: | ---: |
| standard | 4.0 / 53.4 | 64.0 / 137.9 |
| low | 0.7 / 50.1 | 10.7 / 84.5 |

Texture estimates assume RGBA and mipmaps; total includes render attributes, index and alpha masks. They exclude driver alignment, temporary CPU construction arrays, decoded-image residency, render targets and the rest of the scene. Native rock texture clones share GPU source images. Raw evidence also records total renderer texture counts and JavaScript heap observations; neither is an isolated GPU memory measurement. Tablet-sized touch emulation is not a physical iPad performance result.

## Separate quiet timing run

After the regression suite, build and visual capture completed, a separate browser session measured the same bare inland wall. Each tier/mode has three runs, alternating order, 120 raw rAF intervals per run after a two-second settle. No repository tests or other task QA ran concurrently. OS background activity and display scheduling remain uncontrolled; this is browser wall time, not exclusive CPU/GPU timing.

Graphics reported by WebGL: ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11).

| Tier / mode | Combined median ms | Combined p95 ms | Individual run medians ms |
| --- | ---: | ---: | --- |
| standard · baseline | 66.8 | 100.0 | 66.8 / 83.2 / 66.7 |
| standard · zoned | 50.2 | 83.4 | 50.1 / 50.1 / 66.6 |
| low · baseline | 66.6 | 83.4 | 66.6 / 66.6 / 66.6 |
| low · zoned | 33.4 | 66.7 | 33.4 / 49.9 / 33.4 |

[All 1,440 raw timing intervals and settings](runtime.json) are retained separately. These measurements inform the cost discussion; they do not establish physical iPad performance or an acceptance threshold on this old laptop.

## Optional snow

Normal 6 °C annual climate has zero retained snow potential and allocates no snow pass. The separate fictional −8 °C fixture has identical terrain and uses the saved climate/aspect/shelter/slope-driven snow potential. Its on/off comparison uses a seventh native white material pass; off restores the substrate. Snow stays off by default, separate from grey stone and pending owner approval.

## Validation and reproduction

Public terrain tests cover normalized composition, steep-wall texture scale, live wear, empty-pass omission, climate snow gating, deterministic save/load and old-world fallback. Browser assertions cover matched views, colour-only map changes, all weight diagnostics, immutable export, tiers/lighting, touch controls, snow and reference return. Local validation: 730 tests, 729 passed, zero failed, one existing opt-in pose-fixture skip; TypeScript and Vite build passed; character validation including explicit Lab previews passed (20 assets / 36 GLBs). Existing large-chunk build warnings remain. PR checks must pass for the published head before readiness. No formatter is configured; source formatting was reviewed manually and git diff --check was run.

1. Run scripts/qa/prepare-ground-fixtures.mjs to reproduce the fixed versioned worlds.
2. Run scripts/prepare-blended-ground.mjs with the original approved source directory.
3. Start the local Vite server; run scripts/qa/check-ground-blending.mjs (QA_ORIGIN can override port 5180).
4. After tests and other QA stop, run scripts/qa/measure-ground-runtime.mjs for the separate timing capture.
5. Run scripts/qa/measure-ground-sources.mjs, then scripts/qa/publish-ground-blending.mjs.

See [the implementation contract](../../PROCEDURAL-GROUND-BLENDING.md) and [raw evidence](measurements.json).
