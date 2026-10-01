# Asset Optimization Pipeline v0.1

Benchmark for issue #6, October 1, 2026. The local Pixal3D dwarf with beard, horned headgear, raised axe and broad sword is the representative static character. The source, outputs, screenshots and downloaded tools remain local; no character assets or weights are added to Git.

## Result

| Version | Exported vertices | Triangles | GLB bytes | Materials / images | Albedo |
|---|---:|---:|---:|---:|---:|
| Source | 680,287 | 966,646 | 35,851,976 | 1 / 2 | Original |
| LOD0 | 23,994 | 7,998 | 932,480 | 1 / 1 | 1024² JPEG |
| LOD1 | 11,994 | 3,998 | 465,316 | 1 / 1 | 512² JPEG |
| LOD2 | 3,594 | 1,198 | 144,952 | 1 / 1 | 256² JPEG |

All versions contain one mesh object and one draw primitive. Flat face normals split vertices at edges, so exported vertex counts differ from welded topology counts. Cleanup produces 481,602 welded vertices and 966,452 triangles. The final CPU run took 91.57 seconds in Blender 4.5.9 LTS; this is an observation on this machine, not a timing guarantee.

Triangle reductions are 99.17%, 99.59% and 99.88%. LOD2 uses about 807 times fewer triangles than the source; its file is about 247 times smaller. Full machine-readable metrics, settings, bounds and hashes are recorded in [asset-optimization-benchmark.json](asset-optimization-benchmark.json). Each local run also includes the source generation provenance if an adjacent .provenance.json exists.

## Repeat the workflow

Use Blender 4.5 or newer. Set BLENDER_PATH to its executable, put Blender on PATH, or use the locally downloaded portable tools/blender-4.5.9-windows-x64/blender.exe. Node and npm are the existing project tools. Processing uses Blender's built-in Python and CPU Cycles; no extra GPU, model download, paid service or Blender extension is required for batch processing.

From the project directory:

    npm run assets:optimize -- source-assets/character_raw.glb artifacts/character-run --name character
    npm run assets:publish -- source-assets/character_raw.glb artifacts/character-run/character_report.json
    npm run dev:lan

Open /asset-lab on port 5175. There is also a link from Character Lab. The publish command copies the source, LOD0, LOD1 and LOD2 into the local, Git-ignored public/game-assets/characters directory. It verifies file hashes before publishing and writes benchmark.json for the comparison page. Public here means the local application asset directory; this command does not upload anything.

The benchmark command is:

    npm run assets:optimize -- tools/image-to-3dlab/output/dwarf-pixal3d.glb artifacts/optimization/new-run --name dwarf
    npm run assets:publish -- tools/image-to-3dlab/output/dwarf-pixal3d.glb artifacts/optimization/new-run/dwarf_report.json

Outputs are character_LOD0.glb, character_LOD1.glb, character_LOD2.glb and character_report.json. Always choose a new empty output directory. The input is never overwritten. A failed budget/export stops the command rather than silently accepting a dense model. Local outputs from this benchmark are in artifacts/optimization/final.

Direct Blender invocation is supported:

    blender --background --factory-startup --python-exit-code 1 --python scripts/optimize-character.py -- source.glb output-directory --name character

The flags --targets 8000 4000 1200, --textures 1024 512 256, --voxel 0.0035 and --planar-angle 6 are explicit defaults. Voxel size is relative to the source's largest dimension, so the processor does not assume meters or change the source scale.

## Processing choices

1. Inspect the GLB, reject skins/animation/morphs and record source counts/hash before any writes.
2. Import into an isolated scene, join source mesh objects with their materials and apply transforms in world space. Preserve that original surface and UVs for baking.
3. Copy the source, weld seams at 0.000001 of the largest dimension, dissolve degenerate edges and recalculate face normals.
4. Voxel-remesh at 0.0035 of the largest dimension, with zero adaptivity. This resamples tangled/interior topology into a usable surface. It is intentionally fine enough to retain the broad blade and most beard/axe shapes; arbitrary hidden shells are not manually deleted.
5. Dissolve nearly coplanar detail at 6 degrees, preserving boundary edges. The benchmark falls from 664,356 remesh triangles to 222,026 after this stage.
6. Create each LOD independently from this prepared mesh. Apply limited collapse passes, each retaining at least 35% of the current triangles, until the requested budget is reached. Validate mesh data before baking/export. This avoids passing a blind 0.005 ratio directly to the raw AI mesh.
7. Use flat face normals, Smart UV charts and a selected-to-active CPU emission bake. Transfer source albedo only. Bake ray distance and cage extrusion scale with the asset. Export one matte material with metallic 0 and roughness 1; discard PBR micro-detail maps.
8. Export GLB/JPEG, inspect the actual exported counts and hash, and record unchanged coordinate conventions and bounds.

Two remesh runs produced the same exported triangle budgets. The earlier exporter repaired two residual degenerate faces per LOD; the final script validates them before the bake and exports without that warning.

Comparison without remesh: --voxel 0 retained the welded source and applied planar simplification. It took substantially longer, left 355,380 triangles after the planar stage, and stalled at 13,444 for the 8,000-triangle LOD0 target after twelve collapse passes. The budget guard rejected it. No direct-decimation result was accepted or presented as game-ready. For this source, the remesh route is the practical choice.

This is static display topology, not deformation-ready production retopology. Voxel remeshing can merge nearby thin regions or erase small disconnected shapes. Inspect every new subject; tune voxel size or use purpose-built topology where important silhouettes disappear.

## Visual and performance conclusion

Validation uses the integrated Pillagers /asset-lab route with the existing world renderer and daylight lighting. All versions receive one shared source-derived transform, with a display height of 1.8 m; each LOD is not fitted or stretched independently.

Camera comparisons include close inspection, minimum gameplay zoom 15, default zoom 40 and maximum zoom 65, plus front/side/back/three-quarter views. Gameplay cards crop the world projection while preserving the character's CSS-pixel size in a full-window gameplay canvas. Camera elevation and orbit scale match RTSCameraController. Shadows, terrain, fog, crowds and animation are excluded to isolate the character.

- LOD0 retains the beard masses, axe and broad sword well at inspection scale. Very fine bumps are gone, which suits the intended faceted style.
- LOD1 retains the overall proportions and equipment silhouette, and is the useful starting budget for close gameplay. Some beard/foot detail softens under close inspection.
- LOD2 remains recognizable at RTS distance. At close scale the horn tips, nose profile and separate feet become noticeably coarse. Use it at roughly 20–40 projected pixels in height; do not use it for close character inspection.
- At default zoom 40 and fully zoomed-out 65, the source's extra geometry gives little visible improvement in this single-character comparison. About 1,200 triangles is the lowest tested useful distant budget; this does not establish that 200–500 would work.

Recommended initial budgets remain approximately 8k for inspection, 4k for closer gameplay and 1.2k for distant RTS. These are visual recommendations for this benchmark, not automatic LOD-switch thresholds or final base-mesh budgets.

The comparison rendered without WebGL errors and was tested at a 390 × 844 responsive viewport. This is a desktop browser viewport test, not a physical-phone GPU benchmark. Page frame times around 18 ms include all four versions and are limited by the comparison environment; they do not prove an isolated per-LOD FPS gain. The measured geometry/file reductions and observed load times support reduced work and transfer size, but production crowd performance still needs a separate test.

Local visual evidence: artifacts/optimization/close-final.png, gameplay-final.png, rts-final.png, side-remesh.png, mobile-close.png and mobile-gameplay.png. Screenshots and models are deliberately not committed.

## Blender MCP

The community [mcp-for-blender integration](https://github.com/ahujasid/mcp-for-blender) is installed locally in tools/mcp-env and configured as the Codex blender server. Tested upstream revision: 60d2a31b4632a7bc178f3dd636f7e68dfb5c8ae4, package 2.1.3, addon 1.8/protocol 13.

The machine's older Blender 3.0 could not directly import EXT_texture_webp and the current addon used unsupported Python syntax. A portable Blender 4.5.9 from the official Blender download server is used instead; the old installation was not modified.

To recreate the optional MCP setup on another machine:

    git clone https://github.com/ahujasid/mcp-for-blender.git tools/mcp-for-blender
    python -m venv tools/mcp-env
    tools/mcp-env/Scripts/python.exe -m pip install ./tools/mcp-for-blender
    codex mcp add blender --env DISABLE_TELEMETRY=true --env BLENDER_HOST=127.0.0.1 -- C:/absolute/project/tools/mcp-env/Scripts/mcp-for-blender.exe
    ./scripts/start-blender-mcp.ps1

The launcher starts a dedicated factory-startup session and loads the upstream addon from its checkout without altering the user's saved Blender preferences or current scene. The socket binds to 127.0.0.1:9876. Start it once; avoid a second session on the same port. Codex loads newly added MCP tools in the next session.

The actual MCP stdio/client/server/addon round trip was tested with:

    tools/mcp-env/Scripts/python.exe scripts/blender-mcp-smoke.py tools/image-to-3dlab/output/dwarf-pixal3d.glb artifacts/optimization/mcp-proof.json

It listed 36 tools and executed Blender Python to import the original source and report 966,646 triangles. The proof is saved locally. Long remesh/bake jobs run headlessly via the same reusable script to keep the MCP scene responsive. MCP can inspect the source/outputs or run/import this Python module; it is not required on every batch run.

## Tests and boundaries

    npm test
    npm run assets:test
    npm run build

The independent Blender regression generates a dense sphere and thin equipment object with different colored materials and nontrivial transforms. It executes the real processor, reimports all three exports, and checks budgets, one mesh/material/image, image dimensions and red/blue bake content, finite coordinates, world bounds, report counts, file-size reduction, source hash preservation and the overwrite guard. It requires Blender but no licensed scenery or AI model. CLI tests reject incomplete commands, hash mismatches and unsafe output filenames before publication.

The world population and CharacterDNA architecture stay procedural. This issue adds a local conversion/inspection route; it does not replace residents, preserve rigs, build morphs, implement animation, select LODs automatically or generate impostors. Licensed scenery stays excluded from Git as before.
