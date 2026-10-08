# Pine crown comparison — #59, step 1
Reviewed 2026-10-08. Base environment: merged #68, `d4cf5b065562a2a12418ef5abb7ee0bea17c20b7`. [Recorded comparison](review.html); live development fixture: `/scripts/qa/pine-comparison.html`.

## Decision supported by the images
The existing EZ-Tree **Large** preset is the most promising of these three for crown presence: finer branch layers, irregular needle clusters and less exposed trunk than the locked KayKit conifer. Small and Medium have more open crowns. Far views lose needle detail. The identical neutral study confirms a substantial shape difference independent of the much darker source leaf texture. None of this is final owner visual approval or a forest replacement.

Compared with [REF-B](../../references/environment/REF-B.png), EZ-Tree is less geometric and more needle-like; the vision's dense, stylized foliage mass is still not reproduced automatically. Current KayKit trees have clear faceted masses but sparse, disconnected tiers and bright green beside the unchanged Meshy house. Source EZ-Tree colour fits that house better in this fixture; palette judgement remains separate from crown judgement. Both receive exactly the same light/exposure.

## Controlled fixture
Twelve paired 1536 × 768 captures: Small/Medium/Large × Near/Far × current/source or neutral materials. The two halves use identical PerspectiveCamera 45°, positions Near [12,9,16] and Far [37,23,46], target [0, 45% of matched tree height, 0], aspect 1, pixel ratio 1 and ACES Filmic exposure 1.05. Each pair uses the same tree ground point, house, 1.8 m Meshy resident and matte floor. Houses retain authored dimensions; no substitute house/person is introduced.

KayKit C/B/A represent Small/Medium/Large; each keeps its actual source geometry and current AssetManager runtime tint `0xb7c9b8`, scaled by 0.8. EZ-Tree is uniformly normalized to the corresponding height, preserving its original preset proportions. Matching height does **not** claim matching canopy volume or density. Ground anchoring centers X/Z and minY on both. Per-capture raw bounds/scales/camera are saved in [observations](observations.json).

Lighting uses the current Environment Lab Day hemisphere/sun colours, intensity, direction and exposure; PCF shadows, identical 2048 maps on both sides. This is an isolated shape/material fixture with a matte floor and tighter shadow frustum, not a rerender of the full fjord. No HDR, fog, water, background, campfire, GrassField or new composition is introduced.

The neutral mode applies identical native matte material/tint to both trees. It removes original RGB textures and bark normals; EZ-Tree's leaf alpha is retained with a white-RGB copy of the exact exported leaf mask. It preserves native triangle normals and leaf double-sided alpha-test. It is a shape diagnostic, not a proposed production palette.

## Chosen source and exports
[EZ-Tree](https://github.com/dgreenheck/ez-tree/tree/dcf309bd86bd521083d9c70f01f2de45fdc7c457) is pinned to `dcf309bd86bd521083d9c70f01f2de45fdc7c457`. Existing pine_small/medium/large JSON and generator code are vendored unchanged with [file hashes/source URLs](../../../scripts/qa/vendor/ez-tree/source-lock.json) and MIT license. No custom pine shape or new GLSL was written.

The original preset seeds are 11744 / 13977 / 44166. Textures are the actual 1024² **Bark003 colour / OpenGL normal / roughness** (ambientCG CC0, as attributed by upstream), and bundled **pine.png** (project MIT). Real Git LFS media bytes were downloaded, not pointer text; their original hashes and URLs are locked. Attribution and license copies accompany [the export manifest](../../../public/nature/ez-tree-pilot/manifest.json).

Static full-detail native MeshStandardMaterial exports retain preset tint, leaf map, alpha-test 0.3, DoubleSide and roughness 1. They intentionally exclude upstream animated leaf GLSL and its rounded-normal shader override. Thus these are **static preset geometry comparisons**, not a claim of matching the EZ-Tree app's animated appearance. No wind implementation is added to Pillagers. There is no LOD policy or production integration in this experiment.

Three 0.180.0 GLTFExporter creates static geometry/material data; @gltf-transform/core 4.2.1 separates containers into glTF/binaries and four shared exported PNG images. Geometry is not decimated, and texture dimensions are unchanged. Exporter performs the required glTF image orientation/metallic-roughness packing, so exported texture bytes differ from original JPEG/PNG inputs. The manifest locks both meshes and all generated resource hashes; source hashes remain separately recorded. Shared exported images avoid storing the same maps three times.

## Costs and observed browser behaviour
| Pair | Matched height | KayKit triangles | EZ-Tree triangles | EZ source seed |
| --- | ---: | ---: | ---: | ---: |
| Small (C) | 4.220 m | 404 | 18,756 | 11744 |
| Medium (B) | 5.554 m | 522 | 19,872 | 13977 |
| Large (A) | 8.619 m | 982 | 19,392 | 44166 |

One KayKit tree has one primitive/material; one EZ-Tree has trunk and leaf primitives/materials. Four EZ-Tree exported images total 7,807,140 bytes, plus three binaries totaling 2,611,800 bytes and glTF JSON. The authoring source textures add 4,790,232 bytes. These full-detail asset costs are real; they are not GPU/VRAM or whole-forest performance measurements. A forest with many copies needs a separately agreed LOD/instancing evaluation before adoption.

Intel HD 630 / Edge headless / ANGLE D3D11 observations: all 12 states rendered with no page errors or failed HTTP responses; three subsequent preset/material cycles stabilized at 13 geometries / 27 textures for this paired fixture; resizing to 1024 px retained aspect 1 per half. Resources allocate lazily as each source variant and neutral mask is first rendered. This is a bounded control observation, not a leak/VRAM or physical-mobile certification. No frame-time pass threshold is introduced and no speed claim is made.

## Validation
Local build passed. The complete existing suite passed: 418 passed, 0 failed, 1 existing opt-in evidence test skipped (419 total). The same full character validation command used by CI, `pnpm run validate:characters --lab-previews`, passed: 16 assets / 32 GLBs, 12 Golden Characters and 15 equipped modules across Idle/Walk/Run + World. Lab preview audits do not grant visual approval. The initial plain validator invocation rejected the existing preview hair module because its explicit Lab-preview audit flag was omitted; the CI command is unchanged.

[Source/export audit](source-audit.json) verified all 30 pinned original files, every exported resource hash, loaded geometry counts and 1024² images. All 12 recorded-review selections and the original REF-B image loaded with no browser errors. These are export/control observations for the review artifact; no new gameplay behaviour or production interface is introduced.

## Reproduction and next step
With dependencies and existing Meshy/KayKit assets available, start the normal Vite development server. Set `QA_ORIGIN` if not port 5181 and `PLAYWRIGHT_MODULE` if Playwright is elsewhere.

```
node scripts/qa/export-ez-pines.mjs
node scripts/qa/capture-pine-comparison.mjs
node scripts/qa/audit-pine-comparison.mjs
```

The vendored upstream code is used only for authoring exports; the live comparison loads static glTF. The saved review page works from relative PNGs and does not require WebGL. All current gameplay/world/lab tree defaults remain unchanged.

Owner review of the exact source presets remains pending. The next separate experiment is native Three HDR before/after on the unchanged combined environment. Background/coast composition and building/tree water reflections remain later steps; #60 remains unready.

