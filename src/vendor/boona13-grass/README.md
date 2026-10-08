# boona13 grass source

Upstream: https://github.com/boona13/threejs-grass-water-shaders
Pinned revision: 97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159.
License: MIT, copyright (c) 2026 boona13; original notice in LICENSE.

GrassField.ts, grassShader.glsl.ts and windNoise.glsl.ts are vendored from that revision.
Both GLSL source modules are unchanged byte-for-byte. Their upstream SHA-256 hashes:
- grassShader.glsl.ts: 505a993e29504b49b5433086c7e11835fe7def0fecbab7a23d54fd51c6716228
- windNoise.glsl.ts: e926349534786f2e62fa8d440571d71878a37daec7a4db1b0805be49b30b6b56
- original GrassField.ts: 953dd0fe82fdb5078efc6ec35f5818ca05cadad62bb487c23aaa1500038c62e1

GrassField.ts has only texture/instance ownership fixes: retain the flat-height texture
after UniformsUtils.merge (otherwise it clones the texture) and dispose that owned
texture plus the InstancedMesh instance buffers. No shader algorithm is rewritten.

Pillagers' separate SettlementGrass adapter uses the source's seeded geometry,
wind and lighting API. It filters and compacts the public instance buffers to keep
paths, building clearings, sand, submerged ground and rocky slopes free. Roots are
placed using canonical surfaceHeightAt. The source's default flat height texture is
retained because CPU placement already supplies exact triangle height; binding a
height texture as well would lift roots twice.

Source shaders output display colors directly. The adapter supplies display-space
base/tip colors and uses existing source uniforms to follow WorldLighting day/night.
Static preview tufts have birthTime -1 so paused phase-zero captures show mature
blades. Wind and water share the visible pause control. Quality changes reconstruct
the field at the configured Standard/Low spacing.

No demo terrain, dependencies, textures or new grass GLSL are included.
