# Environment Lab v0.1 — sourced water (#56)

Current #75 note: Compatibility fallback now shares the approved ReferenceWater
with Fjordside and follows current Lab lighting/camera. See
[the fallback regression evidence](qa/environment-fallback-water/report.md).
Current controls: Camera, Lighting, Quality and Pause waves & wind stay visible.
**Settings** starts collapsed and groups world generation/sand studies, lighting studies,
and scenery/material controls. **Diagnostics & sources** also starts collapsed.
Collapsing keeps entered values and preview state. The page scrolls outside the orbit
canvas; wheel input over the canvas still zooms. See [controls QA](qa/environment-controls/report.md).

The original sourced-water description and Pass 1 measurements below remain historical.

Open `/environment-lab`. The default water is the MIT implementation from [boona13/threejs-grass-water-shaders](https://github.com/boona13/threejs-grass-water-shaders), pinned to `97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159`. Its water GLSL is unchanged. [Source provenance and local adaptations](../src/vendor/boona13-water/README.md) include the original license.

The lab reuses Terrain, authored house/scenery, seed 1983, WorldLighting and orbit camera. Live Fjordside continues using the existing legacy Water. The Meshy character/housing integration in #61 remains intact.

Controls: fixed seed, shore/overview/water-level camera, day/night, water visibility, pause waves and Standard/Low/Compatibility fallback. There is no Legacy/Candidate comparison control. Quality changes preserve the camera and scene. Renderer counts indicate draw calls, triangles, geometries and textures; they do not measure VRAM.

## Integration

The former in-house `onBeforeCompile` water shader is replaced by a small adapter around the selected WaterPlane, WaterMask and WaterNoiseLUT. The shared `surfaceHeightAt` depth determines the source mask, including its shallow/deep transition and edge opacity. Upstream foam fields are placed at the actual rendered shoreline, found near `shoreAt`; their centres lie inland so only a restrained fringe reaches the water.

The upstream terrain-height texture **adds surface displacement**. It is kept flat: binding sea-floor heights there would lower the water into the floor. The mask carries bathymetry instead. The source surface remains level at -0.12 m, below land. Existing noise normals provide visible motion without geometry waves, extra reflection/refraction passes or rewritten shader mathematics.

Typed parameters live in `src/config/FjordWaterConfig.ts`: 180 m coverage, Standard 180 segments / Low 90, flow speed 0.18, normal strength 3, shallow depth 0.53 m, foam fringe 0.3 m, specular intensity 0.045, reflection strength 0.08 and opacity 0.97. Colors follow the muted palette and existing WorldLighting; night tint is 0.27. The source has fixed internal octave scales and foam math; the adapter does not invent unsupported amplitude/wavelength/intensity controls.

The original shader directly outputs display color, so the adapter supplies display-space colors and adjusts the existing sky, body colors and sun direction for day/night. No water shader color-transform patch is added. Phase comes from bounded accumulated delta time; pause preserves it across quality switches.

## Validation and captures

The original code first rendered against pinned Three.js 0.180 with the shared shore/terrain and directional shadows. Only two obsolete DataTexture TypeScript casts needed correction. Texture identity/disposal fixes are recorded in provenance. The GLSL remains identical to the pinned upstream file.

User-confirmed TDD boundaries remain visible lab controls and public `waterDepthAt`. The sourced implementation's visible status check first failed against the experiment, before the adapter was installed. Public depth behavior is unchanged.

Run `node --test tests/fjord-water.test.mjs`. Run `node scripts/qa/check-environment-lab.mjs` with `PLAYWRIGHT_MODULE` pointing to Playwright; `PROTOTYPE_URL` defaults to `http://127.0.0.1:5181`. Browser checks observe actual pixels for pause/resume, day/night, camera presets, water visibility and quality fallback, then check Settlement and Meshy Fjordside. Ten-second warmed samples for each quality tier are software-renderer observations, not hardware frame-budget approval.

See [QA report](qa/environment-lab/source-report.md), saved before/after images and source performance sample. Final visual approval remains with the user before #60 integration.

The current lab also previews [Ground v0.2 (#57)](GROUND-TERRAIN-V02.md). The water source, controls and historical measurements above remain the Pass 1 record.
