# Sourced water implementation — #56 / #61

2026-10-08. The selected MIT water implementation replaces the earlier in-house shader experiment. Meshy character/housing integration is preserved. Live Fjordside still uses its existing Water; Environment Lab is the isolated preview.

## Compatibility and provenance

Upstream: [boona13/threejs-grass-water-shaders](https://github.com/boona13/threejs-grass-water-shaders), revision `97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159`. Four required source files and original MIT license are vendored. [Local changes](../../../src/vendor/boona13-water/README.md) record the two texture type-cast corrections and texture ownership/disposal corrections.

Original unmodified source rendered with Three.js 0.180, WebGLRenderer, directional shadows and Pillagers' terrain/shore functions. No runtime API/GLSL errors; [spike result](source-spike.json) and [original-source capture](source-spike.png). TypeScript originally rejected two BufferSource casts; passing the actual typed arrays fixes them. No shader compatibility rewrite was necessary. GLSL SHA-256 is `7E8EA802196BE785E787157F86D603E1A6640157C4AF3C30101D443120618BB3`, identical to upstream.

The adapter tunes published uniforms and mask/foam textures only. The source's additive terrain-height texture is kept flat so water does not follow the sea floor; bathymetry from surfaceHeightAt drives the existing shoreline/depth mask. Existing WorldLighting controls sky/body colors and sun direction. No new in-house water GLSL, onBeforeCompile replacement, reflection/refraction pass or Water2 substitution.

## Checks and visual evidence

PASS: 39 tests covering water depth, Meshy assets/runtime, navigation, social encounters, lighting, settlement projection and Chronicle. TypeScript and production build pass (existing bundle-size advisory).

The browser test first failed on the old experiment's visible source status before replacement. The final complete browser run passes: visible waves pause/resume, day/night, three camera presets, Low triangle reduction, Compatibility fallback, water visibility, Settlement and Meshy Fjordside. No browser runtime/console errors. The missing favicon found during route QA was fixed. Numeric counts were also checked against the visible locale-formatted statistics (75.656 and 27.056 in this browser).

Before/after references use the same shared scene and camera preset. The old experiment captures remain historical; its viewport was 1440×1000, whereas these source captures use 1024×768, so their pixel counts and old timing sample must not be directly compared.

| View | Previous experiment | Sourced implementation |
| --- | --- | --- |
| Day / shore | [before](fjord-water-day.png) | [after](source-water-day.png) |
| Night / shore | [before](fjord-water-night.png) | [after](source-water-night.png) |
| Overview | [before](fjord-water-overview.png) | [after](source-water-overview.png) |
| Water level | [before](fjord-water-water.png) | [after](source-water-water.png) |

Visible assessment: restrained normal ripples, muted deep/shallow transition and a soft fringe following the existing coast. No obvious z-fighting or disconnected foam strip in the fixed day/night and camera captures. The existing finite terrain patch can still reveal its far boundary at wider angles; terrain expansion belongs to the following environment pass. Final aesthetic acceptance belongs to the user before #60.

## Indicative performance

[Recorded samples](source-baseline.json): Edge/Chromium headless, forced SwiftShader **software renderer**, 1024×768 viewport, warmed shared scene, paused wave phase. Each tier sampled for at least 10 seconds. These measure whole-scene frame intervals, not isolated GPU water time or VRAM.

| Tier | Frames / sample | Median frame | p95 frame | Draw calls | Triangles | Textures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Standard | 16 / 10.07 s | 667.5 ms | 684.2 ms | 15 | 75,656 | 7 |
| Low | 20 / 10.29 s | 517.2 ms | 533.9 ms | 15 | 27,056 | 7 |
| Compatibility | 94 / 10.06 s | 100.2 ms | 116.9 ms | 16 | 10,968 | 4 |

The sourced shader is slower than legacy in this software sample. Low reduces geometry but does not remove the source's fragment work. This is evidence for retaining Compatibility and conducting target-device GPU profiling; it is not a hardware performance pass or justification for silently replacing the selected shader. No live Fjordside integration is included.
