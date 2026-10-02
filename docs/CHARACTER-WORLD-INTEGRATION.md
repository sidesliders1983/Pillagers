# Character to world integration (#11)

Character Lab and the world use `CharacterFactory` and the same `UniversalHuman` runtime. The lab compatibility module re-exports that runtime. The factory caches source GLBs by URL and removes failed loads for retry. Each instance clones its skeleton, bind matrices, materials and mixer while sharing immutable source geometry, clips and source textures. Heritage tint textures remain instance-owned.

The world creates ten deterministic adult DNA profiles from the world seed. Existing movement owns the navigation root, terrain height and heading. Animation clips remain in place; measured movement speed selects Idle below 0.03 m/s, Walk below 1.4 m/s, otherwise Run, with a 0.2 second crossfade. The existing wander stops now actually wait at the destination so Idle remains visible during rests.

World characters start in LOD2. Below 22 metres they asynchronously load LOD1; beyond 28 metres they return to LOD2. Hysteresis prevents camera jitter. Each character keeps its two independent runtime instances after the first close view, but updates only the active one. Navigation, profile-card hit areas and identity remain attached to a stable outer root. Page exit releases instance resources. In-flight loads dispose their result if the character was already disposed.

The world uses bald bodies and the existing technical underlayer. Reference hair remains enabled in Character Lab through the same factory; final clothing/beard integration is separate. Physicality body deformation remains disabled.

Validation: TypeScript, production build, navigation simulation, real-GLB skin/motion and instance isolation tests; factory state/LOD/lifecycle tests; desktop and emulated-mobile profile-card tests. `scripts/world-humans-smoke.cjs` verifies one body request per LOD, ten LOD2 residents at RTS distance, close-view LOD1 switching and the Character Lab shared runtime. Browser rendering uses software WebGL and is not a hardware mobile FPS benchmark. A sampled close view used 46 draw calls and 145,828 triangles for the entire scene.
