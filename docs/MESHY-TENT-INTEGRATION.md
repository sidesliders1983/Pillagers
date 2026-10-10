# Hollow Meshy tent

The owner approved the generated appearance on 10 October 2026. The two supplied side images intentionally match: one side reference describes both sides of the symmetrical design. Meshy used the front, back and side references in one multi-image generation; no additional generation was needed.

## Sources and preparation

- Original: `Assets/Houses/Tent/tent-meshy-original.glb`, 7,660,788 bytes.
- Four original references: `Assets/Houses/Tent/reference/{front,back,left,right}.jpg`.
- Sanitized local provider provenance: `Assets/Houses/Tent/meshy-provenance.json`.
- Production: `public/scenery/meshy-tent-v1/tent.glb`, 2,014,824 bytes, 6,754 triangles.
- Tracked manifest records source/output SHA-256, provider task, input hashes, bounds, orientation and texture limit.
- Rebuild locally with `pnpm assets:tent`; this prepares the existing original and makes no paid API requests. Original GLB and reference files remain untouched.

The owner requested a compact campsite scale: about 1.50m overall height and no ground dimension above 2m. Preparation retains the generated mesh, grounds and centres it, scales the front proportions uniformly to 1.50m including the pole extensions, and shortens depth independently to respect the footprint cap. Runtime dimensions are approximately 1.88m wide by 2.00m deep by 1.50m tall. A 0.2mm depth allowance keeps the decoded Meshopt bounds below 2m. Geometry uses Meshopt and embedded textures are at most 1024px WebP. Normal and packed material maps use lossless WebP. Authored linen, timber, rope and PBR materials bypass the legacy scenery palette. Both sides of the cloth render from inside and outside.

This is an actual hollow mesh: rays through the doorway reach the rear wall, the centre has a low floor, and the roof and side walls can be hit from inside. At the centre the floor is approximately 0.067m above the grounded base and the inner ridge is at 1.14m. This is a low camping tent. Interior ray probes use the compact scale, while a separate decoded-bound check requires height within 1cm of 1.50m and both ground dimensions at most 2m. These checks use the actual production GLB and the same Three.js GLTFLoader as the world, including Meshopt decoding and authored material sidedness. The Node test replaces only the browser image decoder; actual textures are reviewed in the running Fjord.

## World placement and navigation

Fresh generated worlds append this tent after the existing twenty scenery attachments. The same dry, flat support, measured rotated bounds, nature clearance and route reservation rules determine its location. Reference fallback places it beside the central working area at x=9, z=17, facing toward the clearing. Residents keep at least 0.65m clearance outside the complete source box, including poles and base beams. The tent is scenery at this stage; no housing capacity or campaign rules are added.

New saves use `authored-props-v3`. Initial `authored-props-v2` tent previews are validated against their original measured footprint and original plan before migration. Their tent is resized at its saved location and exported as v3; the blueprint and first twenty prop placements remain unchanged. Loading a previous `authored-props-v1` file preserves its original placements and version. Regenerating an old development preview through Generate World creates a new world with the tent. The ordinary Fjord URL always creates a fresh world.

Development tools > Debug > Review camera offers **Tent close-up** and **Tent interior** in the existing Fjord view. These options are disabled for preserved old worlds that have no tent. Right-mouse rotation and normal camera controls remain available.

## Verification

- `node --test tests/meshy-tent.test.mjs`: open doorway, empty volume, usable floor/headroom and visible inner side walls through the exported GLB.
- `node scripts/qa/check-meshy-tent.mjs`: existing visible Fjord controls, reference and generated seeds 17/91, ten moving residents, source-box clearance, screenshots and save/reload; v1 imports preserve their original twenty placements and v2 tent previews resize at their original location.
- Existing Fjord browser regression covers fresh startup, generation, pause, quality and geography persistence.

See [the visual and runtime review](qa/meshy-tent-compact/REPORT.md) for recorded evidence and its limits.
