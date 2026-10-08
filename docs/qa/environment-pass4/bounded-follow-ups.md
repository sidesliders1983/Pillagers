# Bounded source follow-up assessment — Pass 4

Reviewed 2026-10-08. This documents exact candidate code and a review plan, not a new source import or an experiment that passed. No source selection is silently changed by this document.

## Native HDR pilot

The named [dgreenheck environment-map demo](https://github.com/dgreenheck/threejs-environment-map/blob/0f99a90ebde0b76c46db8acf6474788af6cc29aa/main.js) at `0f99a90ebde0b76c46db8acf6474788af6cc29aa` has an [MIT code license](https://github.com/dgreenheck/threejs-environment-map/blob/0f99a90ebde0b76c46db8acf6474788af6cc29aa/LICENSE). It uses RGBELoader for lonely_road_afternoon_puresky_1k.hdr and sets both scene.background and scene.environment. Copying the whole demo would impose a photographic background and unrelated dependencies/assets; those are not needed.

The [Poly Haven named sky](https://polyhaven.com/a/lonely_road_afternoon_puresky) is separately CC0 and has a 1K publisher delivery. It is a high-contrast warm afternoon sky, so it is only a **daylight pilot**, not a night/default sky. Actual downloaded file/hash and distribution provenance must be recorded before importing it; no download is claimed in this assessment.

Installed Three is exactly 0.180.0. Its local Scene.js exposes environment/environmentIntensity and PMREMGenerator.js exposes fromEquirectangular/dispose. The official [Scene documentation](https://threejs.org/docs/pages/Scene.html) treats environment and background independently; [PMREM documentation](https://threejs.org/docs/pages/PMREMGenerator.html) describes roughness-prefiltered environment lighting. Use those existing native APIs, not new GLSL. These API/source reads establish an available path, not a rendered compatibility/quality result.

A bounded pilot would keep the current background, assets, ground, camera and seed; show OFF/ON with recorded directional/hemisphere/exposure/intensity choices; preserve WorldLighting time/night control, with daylight HDR disabled or explicitly adapted at night. Test current Standard and Low, dispose source/PMREM render targets correctly, and measure stable texture counts. It must identify actual consumers: native terrain and shared KayKit materials are MeshStandardMaterial; the boona13 water uses its own sky/uniform path and will not gain geometry reflections from Scene.environment. Human/house material consumption must be enumerated in the pilot, not assumed from appearance.

Evidence justifying the pilot: pale terrain/bright greenery, limited contact depth and missing warm/cool light cohesion in the current scorecard. Expected gain is **a hypothesis**; reject the pilot if it washes out the atlas, doubles sun lighting or degrades night control. Contact shadow and missing cliff/dock geometry remain separate gaps. Pilot implementation/captures: **untested**.

## KayKit / EZ-Tree comparison

Candidate reviewed: [EZ-Tree Tree implementation](https://github.com/dgreenheck/ez-tree/blob/dcf309bd86bd521083d9c70f01f2de45fdc7c457/src/lib/tree.js), revision `dcf309bd86bd521083d9c70f01f2de45fdc7c457`, [MIT code license](https://github.com/dgreenheck/ez-tree/blob/dcf309bd86bd521083d9c70f01f2de45fdc7c457/LICENSE). The inspected library has generateLODs and same-skeleton detail generation; it also has pine_small/medium/large presets. Do not treat its default LOD triangle ratios as measured Pillagers costs or assume an exported GLB includes runtime THREE.LOD policy.

Keep the actual KayKit controls as the baseline. Compare one small, medium and large seeded pine family at matched world scale, camera, light, palette and crown density. Record geometry/material/texture/shadow cost and provenance for each exported file and every bark/leaf texture. Inspect bundled texture licenses separately from the MIT library code. Preserve original house/farmyard roles and existing footprints. No production tree replacement until the owner accepts the exact variant.

Evidence justifying the comparison: simple layered crowns, bare thin trunks and rounded bright shrub clusters in the current forest/village images compared with REF-A/REF-B. Alternate exports and matched captures: **untested**. Broader canopy/atmosphere implementation is a bounded follow-up, not an invisible addition to the ground-material slice.

Tidewater remains a separately credited visual reference with a different WebGPU/WGSL engine. No engine migration, ocean replacement or copied performance claim is proposed by this QA pass.

The reviewed [EZ-Tree texture notice](https://github.com/dgreenheck/ez-tree/blob/dcf309bd86bd521083d9c70f01f2de45fdc7c457/src/app/public/textures/LICENSE.md) separately attributes bark maps to ambientCG CC0 and bundled leaves to the project license. That notice improves provenance availability; an actual chosen export still needs its own file/texture lock and hashes. The README says GLB export of a generated LOD tree includes every level: the integration must preserve an explicit runtime LOD policy rather than rendering all exported levels together.

## Follow-up evidence — pine comparison, 2026-10-08

The separately authorized first experiment is now recorded in [the pine comparison report](../pine-crown-comparison/report.md) and [matched review viewer](../pine-crown-comparison/review.html). It uses the unchanged Small/Medium/Large source presets and seeds from the pinned EZ-Tree revision, static native materials and real locked texture bytes. Neutral and source-material views separate shape from palette. This does not revise the historical Pass 4 capture record or activate a production replacement. HDR remains a separate unperformed next step.
