# Ground v0.2 texture provenance

These derived PNG maps use only ambientCG Ground037 and Ground054 (CC0-1.0).
Source URLs, exact input/output hashes and dimensions are recorded in manifest.json.

Sources:
- https://ambientcg.com/view?id=Ground037
- https://ambientcg.com/view?id=Ground054
- https://docs.ambientcg.com/license/
- https://creativecommons.org/publicdomain/zero/1.0/

Pillagers uses OpenGL normals and roughness only. Source albedo, displacement,
ambient occlusion and demo files are not included. The offline bake is
scripts/prepare-ground-materials.mjs; implementation and reproduction instructions
are in docs/GROUND-TERRAIN-V02.md. These are ordinary data textures for Three.js
MeshStandardMaterial, not a terrain shader.
