# Ground v0.2 — native terrain treatment (#57)

Open /environment-lab. The lab now applies Ground v0.2 directly, alongside sourced fjord water and visible GrassField blades from boona13/threejs-grass-water-shaders. Live Fjordside still calls createTerrain() with its original treatment; integration is reserved for #60 after visual approval.

## Rendering and terrain contract

createTerrain({treatment:'ground-v02', maps:await loadGroundMaterials()}) uses one native Three.js MeshStandardMaterial, flat shading and continuous vertex colors. There is no authored GLSL, material onBeforeCompile hook, splat shader, displacement, photographic albedo or comparison toggle.

The canonical 2 m triangulation, positions and winding remain identical. shoreAt, heightAt and surfaceHeightAt are unchanged. Ground UVs cover x [-58,58], z [-18,62]. The lab also renders the existing createPaths() mesh, which follows surfaceHeightAt + 0.018 m; route definitions, building footprints and navigation are unchanged.

CPU color fields blend muted grass/moss, sandy shore, darker wet sand, trampled earth and rocky slopes. They use coastal distance, existing height/slope, authored paths, rotated building footprints/clearings and modest seeded variation. Shared vertices receive identical colors, avoiding random per-face checkerboards. Color strings enter Three.js as sRGB colors and its Color class converts them to linear vertex values.

src/config/GroundTreatmentConfig.ts contains the fixed seed (1983), palette, transition thresholds, normal strength (0.4), source repeat scale (3 m), atlas size (1024) and authoring signal grid (256). The revised palette has deeper green grass/moss, darker earth/wet sand and clearer rock contrast. The initial native treatment was rejected as too flat; its historical captures remain in the QA directory.

## Sources and offline transitions

Only two sources from the approved ambientCG catalog are used:

| Asset | Intended detail | Published source |
| --- | --- | --- |
| Ground037 | Earth, grass/moss ground microdetail | https://ambientcg.com/view?id=Ground037 |
| Ground054 | Sand/soil microdetail at shore and worn areas | https://ambientcg.com/view?id=Ground054 |

Both are CC0-1.0: https://docs.ambientcg.com/license/. Exact download URLs, source archive and map SHA-256 hashes, output hashes, dimensions and byte sizes are in public/ground-materials/v02/manifest.json. No Poly Haven source was needed. No color/albedo, displacement or AO map is shipped.

The normal and roughness sources are reduced to 256 pixels for restrained detail. scripts/prepare-ground-materials.mjs repeats them at the selected world scale and blends them offline using the same shore/path/clearing fields. It normalizes the blended normal vectors, attenuates detail around worn/wet areas, and keeps roughness between 0.84 and 1. These two baked 1024 x 1024 PNGs are applied through the standard material slots, with NoColorSpace, default mipmaps, clamped world-atlas edges and anisotropy 4. PNG row orientation corresponds to the terrain UVs; the OpenGL normal convention is retained.

Delivery: normal.png 1,286,924 bytes; roughness.png 380,082 bytes; total 1,667,006 bytes. Two RGBA8 1024 maps would occupy about 8 MiB before mipmaps, about 10.7 MiB with a complete mip chain; this is a format estimate, not measured GPU allocation.

This is a static atlas for the existing landscape. It gives smooth precomputed native-material transitions, rather than runtime independently tiled material layers. Changing height/layout, source scale or blend fields requires rebaking; this slice does not introduce dynamic terrain painting. A new runtime multi-material requirement needs a separate decision on an existing compatible solution.

## Published grass renderer

The initial implementation used only native ground textures and the repository's water renderer; it did not integrate its grass shader. User feedback requested visible public-source structure rather than another color-only adjustment. The lab now also uses the actual MIT GrassField from https://github.com/boona13/threejs-grass-water-shaders, pinned to 97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159. The two grass GLSL modules remain byte-identical to upstream; provenance, hashes and the original MIT notice are in src/vendor/boona13-grass.

SettlementGrass is a placement/uniform adapter, not a new shader. It retains source-generated seeded tufts, instance colors, geometry, wind and shading, then filters/compacts public instance buffers using existing shore, path, building and slope fields. Roots use surfaceHeightAt exactly, 0.01 m below the surface to avoid a hovering gap. The source's flat height texture stays flat so roots are not lifted twice. No terrain triangles or navigation behavior change.

Published options are configured in SettlementGrassConfig: 0.4 m blade height, 0.03 m width, Standard spacing 0.65 m with four segments/three blades per tuft; Low and Compatibility spacing 1 m with two segments/two blades. Native fields keep shore sand, worn routes, building clearings and rocky slopes free; seeded thinning softens surrounding coverage. Source lighting uniforms follow the existing day/night mode, with display-space inputs because upstream directly emits display colors.

Grass is on by default; its checkbox shows/hides the separate sourced mesh. Pause waves & wind freezes both sources. Quality changes rebuild the field at the corresponding density. Already-grown preview blades use birthTime -1, so phase-zero paused captures retain visible structure. Original class changes only fix texture/instance ownership/disposal; no shader math is rewritten.

The ambientCG normal/roughness atlas provides the base ground's surface detail. It does not create physical blades or rock/tree detail. GrassField supplies visible animated vegetation; existing tree/rock model replacement remains a later pass.

## Reproduce

Use the exact archive/map hashes in the manifest. Download the two 1K-PNG archives into ignored scratch/ground-source and expand each into its matching asset directory. For example in PowerShell:

    foreach ($groundId in @('Ground037','Ground054')) {
      Invoke-WebRequest -Uri ("https://ambientcg.com/get?file="+$groundId+"_1K-PNG.zip") -OutFile ("scratch/ground-source/"+$groundId+"_1K-PNG.zip")
      Expand-Archive -LiteralPath ("scratch/ground-source/"+$groundId+"_1K-PNG.zip") -DestinationPath ("scratch/ground-source/"+$groundId) -Force
    }
    node scripts/prepare-ground-materials.mjs

The archives may include demo files; the pipeline reads only PNG maps and does not execute source demo content. Keep raw archives and unused maps out of the repository. Rerunning the bake with the recorded inputs yields the same output hashes. The runtime only needs the two published PNGs.

## QA and review

User-approved TDD boundaries: public terrain mesh/height functions and visible Environment Lab rendering/controls. The texture-coordinate and color-field tests were observed failing before implementation. The lab status test was observed failing before integration.

Run:

    node --test tests/terrain-treatment.test.mjs tests/navigation.test.mjs tests/lighting.test.mjs tests/fjord-water.test.mjs
    node node_modules/typescript/bin/tsc --noEmit
    node node_modules/vite/bin/vite.js build
    node scripts/qa/check-ground-terrain-browser.mjs <directory-containing-playwright>

The browser harness uses Edge/Chromium with SwiftShader, seed 1983, 1024 x 768 viewport and the visible Pause waves control selected before loading completes (phase zero). It captures day/night, overview and water-level views, and checks quality, water visibility and motion. Ten-second whole-scene samples are compared with the saved Pass 1 sample. See [current sourced-grass QA report](qa/ground-terrain-v02/sourced-grass/report.md) for results and before/after captures.

Visual acceptance and hardware profiling remain required before #60. Historical reports are retained as records of their original passes.
