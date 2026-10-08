# Environment v0.3 reference review — candidate, not accepted

Render implementation fixture: **96b4d65784b46120c38b26eb70721adc20ae5680**, PR #64, stacked on PR #62. References: unchanged REF-A/REF-B at de91046; hashes/crops in docs/references/environment/references.json. Fixed seed 1983, phase 0, GrassField OFF, shared ACES renderer. Capture manifest records exact camera position/target/FOV/zoom, lighting, tier, pixel ratio and canvas rectangle. Capture size is 1536×1024 **canvas**, not viewport. Hardware measurement size is 1024×768 **canvas**.

## Art-direction assessment

These are agent observations from the recorded captures, not owner approval. HUD, snow/season logic, raids, weddings, UI redesign and new gameplay are outside these environment slices.

| Criterion | Result | Evidence / remaining gap |
| --- | --- | --- |
| 1. Authored varied conifer crowns and clustered forest | **Fail against reference richness** | Three distinct actual KayKit crowns replace diagnostic cones; source/runtime pairs retain geometry. Branching/silhouette is markedly simpler and greenery more saturated than the owner mock-ups. Source authenticity passes; aesthetic equivalence does not. |
| 2. Faceted stones and broken rocky shore | **Pass for source/placement; owner review pending** | Actual irregular small stones/boulders and authored grouped outcrops break the shoreline at varied scales. Grouped tower shapes are a KayKit style difference from natural fjord cliffs. No hand-sculpted substitute. |
| 3. Worn earth with patchy shrubs/clumps | **Fail against reference ground detail** | Paths are open; KayKit clumps are primary; no map-wide spike lawn. Ground normal/roughness response remains subtle at normal distance, and gaps/clearances are broader/smoother than the densely detailed reference. Original farm parcels are preserved rather than flattening new terrain. |
| 4. Warm Meshy timber/people vs cooler rocks/water | **Pass for source identity; palette approval pending** | Original house/farmyard/person assets retained. Original KayKit UV/atlas preserved with modest foliage tint. Neither passing tests nor brighter green means owner-approved cohesion. Contact sheet records matched physical scale. |
| 5. Calm muted blue-grey water and continuity | **Blocked for reference reflections** | #56 sourced water remains; no shader rewrite. Its Fresnel sky-gradient term is not scene-geometry reflection. Houses/trees/rocks do not mirror as in the reference. |
| 6. Foreground/village/forest/background depth | **Fail / backdrop gap** | Foreground shore stones, middle village and clustered forest exist. Distant fjord walls/mountain backdrop and the complete dock composition are absent from this approved starter set; not replaced with handmade cliffs. |
| 7. Seams, floating roots, LOD/material/night readability | **Fail for reference night lighting; dusk blocked** | Day/night Standard/Low/Compatibility captures are supplied. Canonical triangle grounding and footprint/route masks are retained. A complete dusk preset does not exist; no fabricated pass. Ten reloads and ten Low/Compatibility/Standard cycles completed; public-control observations are recorded separately. Night silhouettes are readable, but warm window/torch lighting from the references is absent; the inherited ground halo is not a complete light composition. Owner must inspect contacts and night visibility. |

## Performance protocol

Hardware: Windows 10 Pro 10.0.19045, Intel HD Graphics 630 driver 27.20.100.9664, Edge headless 154. GPU renderer is verified as ANGLE Intel Direct3D11; the installed GTX 1050 is not claimed as the rendering adapter. Software SwiftShader results from earlier passes are historical diagnostics only.

Paired workload: identical commit/camera/ground/Meshy village/water/light with KayKit nature OFF/ON, Standard and Low, village and forest, three runs each. Each run warms 10 seconds then samples 30 seconds. This isolates incremental nature cost; it is not a whole previous-release comparison and does not certify ten animated inhabitants or iPad performance. See hardware-measurements.json for individual medians/p95, counts and exact fixture. No perf budget approval is inferred.

## Integration readiness

**#60 blocked.** Required next decisions are source/style fit of the forest and rock groups, detailed ground readability, an authored cliff/backdrop source/composition, geometry-reflection treatment, dusk coverage, confirmed performance budgets and owner approval of exact captures/commit. Character CI also remains red: cream-tunic LOD2 has 71 non-manifold edges. The character validator is intact. Production /play and Fjordside scenery have not been changed.

[dgreenheck assessment](dgreenheck-assessment.md) records EZ-Tree, native environment lighting and Tidewater as bounded future candidates. They are not silently imported or substituted for the locked stack.

## Recorded desktop results

All 24 warmup/sample runs completed on the verified Intel hardware adapter, with no page errors. Median presentation interval stayed about 16.7ms. Individual p95 results are in hardware-summary.json: village Standard/Low candidates 16.8–16.9ms; forest Standard candidate 16.9ms; forest Low candidate **33.4ms in all three runs**. A forest Standard baseline run reached 29.0ms and is retained. The 60Hz presentation cap prevents interpreting equal medians as zero additional GPU work.

KayKit adds exactly 14 reported draw calls: village 12→26, forest 9→23. Added geometry is 196,950 reported triangles at these fixed poses. Low lowers water geometry, while the current static nature instance counts remain the same. Warm texture counts remain 34; that does not prove zero atlas cost. Published runtime glTF/BIN/atlas/manifest size is 313,316 bytes; optional embedded GLB audit copies add 928,052 bytes and are not requested by the lab.

Proposed initial review budgets: p95 ≤33.3ms for Standard/Low at this 1024×768 canvas, ≤14 additional nature draw calls and ≤512KiB nature runtime delivery. These are proposals for owner confirmation. The Low forest runs slightly exceed the proposed frame threshold, so the performance gate is **not declared passed**. Real iPad/browser visibility testing and a whole previous-release comparison remain pending. Ten animated production inhabitants are explicitly a #60 measurement, not certified by this one-body static fixture.

## Lifecycle and interaction observations

The completed repeat observed ten reloads with identical paused pixels and stable renderer counts (26 calls, 26 geometries, 34 textures). Ten Low/Compatibility/Standard cycles returned stable counts (26 calls, 28 geometries, 34 textures): the extra two geometries appear after exercising the water tiers, with no further count growth across those cycles. Zoom, right-drag pan and wave resume changed rendered pixels; the resized canvas was 900×500. No page errors were recorded. See lifecycle-observations.json and resized.png. These are public browser observations, not a VRAM leak proof.

One initial attempt timed out waiting for the canvas readiness marker after 60 seconds. Its cause was not established; no source change was made before the successful repeat, and this timeout is not presented as fixed. Visible-tab/hidden-tab behavior and real iPad verification remain pending. Short readiness-loop timing values in the lifecycle file are not the warmed hardware benchmark.