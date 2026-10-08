# boona13 water source

Upstream: https://github.com/boona13/threejs-grass-water-shaders
Pinned revision: `97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159` (reviewed 2026-10-08).
License: MIT, copyright (c) 2026 boona13. Original notice: [LICENSE](LICENSE).

Only WaterPlane.ts, WaterMask.ts, WaterNoiseLUT.ts and waterShader.glsl.ts are vendored. This water bundle contains no grass, demo dependencies or downloaded texture assets. The grass renderer is separately vendored in [boona13-grass](../boona13-grass/README.md). This repository is a small demo and is not treated as a production compatibility guarantee.

## Local changes

- WaterMask/WaterNoiseLUT: pass the actual typed array into DataTexture; the old BufferSource casts fail against @types/three 0.180.
- WaterPlane: retain original mask/noise/flat-height texture identities after UniformsUtils.merge (which otherwise clones textures); own and dispose the default flat-height texture. This lets quality changes release the textures actually rendered.
- **waterShader.glsl.ts is byte-for-byte upstream.** No new water GLSL or onBeforeCompile patch is introduced.

Pillagers' separate FjordWater adapter bakes its shared rendered terrain depths into the existing mask, sets the existing uniform controls and uses upstream foam sources. The upstream heightmap is an additive surface displacement, not a bathymetry texture; keeping it flat prevents the fjord surface following the sea floor. Day/night adapts existing colors, sky and sun-direction uniforms from WorldLighting. Colors are passed in display space because this original shader writes its final color directly, without Three.js tone-mapping/color-space chunks.

## Narrow compatibility spike

Original unmodified source compiled and rendered with three 0.180, WebGLRenderer, directional shadows and Pillagers createTerrain/surfaceHeightAt. No API or GLSL runtime errors. Two TypeScript DataTexture casts were the only compile errors; removing them resolves type checking without changing runtime data. The spike and source capture are recorded under docs/qa/environment-lab/.

The original source was selected by issue #56. Official Water2 is only a named fallback for a future explicit decision; it was not substituted here. The existing legacy Water remains the requested Compatibility mode.
