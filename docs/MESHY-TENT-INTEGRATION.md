# Hollow Meshy tent

The owner approved the generated appearance on 10 October 2026. The two supplied side images intentionally match: one side reference describes both sides of the symmetrical design. Meshy used the front, back and side references in one multi-image generation; no additional generation was needed.

## Sources and preparation

- Original: `Assets/Houses/Tent/tent-meshy-original.glb`, 7,660,788 bytes.
- Four original references: `Assets/Houses/Tent/reference/{front,back,left,right}.jpg`.
- Sanitized local provider provenance: `Assets/Houses/Tent/meshy-provenance.json`.
- Production: `public/scenery/meshy-tent-v1/tent.glb`, 2,014,820 bytes, 6,754 triangles.
- Tracked manifest records source/output SHA-256, provider task, input hashes, bounds, orientation and texture limit.
- Rebuild locally with `pnpm assets:tent`; this prepares the existing original and makes no paid API requests. Original GLB and reference files remain untouched.

Preparation preserves the generated geometry and aspect ratio. It grounds and centres the model, sets an overall height of 2.6m including the pole extensions, compresses geometry with Meshopt and reduces embedded textures to at most 1024px WebP. Normal and packed material maps use lossless WebP. Runtime dimensions are approximately 3.26m wide by 4.58m deep. Authored linen, timber, rope and PBR materials bypass the legacy scenery palette. Both sides of the cloth render from inside and outside.

This is an actual hollow mesh: rays through the doorway reach the rear wall, the centre has a low floor, and the roof and side walls can be hit from inside. At the centre the floor is approximately 0.115m above the grounded base and the inner ridge is at 1.976m, leaving about 1.86m headroom. The inside wall spacing at height 0.6m is about 1.84m. These checks use the actual production GLB and the same Three.js GLTFLoader as the world, including Meshopt decoding and authored material sidedness. The Node test replaces only the browser image decoder; actual textures are reviewed in the running Fjord.

## World placement and navigation

Fresh generated worlds append this tent after the existing twenty scenery attachments. The same dry, flat support, measured rotated bounds, nature clearance and route reservation rules determine its location. Reference fallback places it beside the central working area at x=9, z=17, facing toward the clearing. Residents keep at least 0.65m clearance outside the complete source box, including poles and base beams. The tent is scenery at this stage; no housing capacity or campaign rules are added.

New saves use `authored-props-v2`. Loading a previous `authored-props-v1` file preserves its original placements and version. Regenerating an old development preview through Generate World creates a new world with the tent. The ordinary Fjord URL always creates a fresh world.

Development tools > Debug > Review camera offers **Tent close-up** and **Tent interior** in the existing Fjord view. These options are disabled for preserved old worlds that have no tent. Right-mouse rotation and normal camera controls remain available.

## Verification

- `node --test tests/meshy-tent.test.mjs`: open doorway, empty volume, usable floor/headroom and visible inner side walls through the exported GLB.
- `node scripts/qa/check-meshy-tent.mjs`: existing visible Fjord controls, reference and generated seeds 17/91, ten moving residents, source-box clearance, screenshots and save/reload; previous save imports preserve their original twenty placements.
- Existing Fjord browser regression covers fresh startup, generation, pause, quality and geography persistence.

See [the visual and runtime review](qa/meshy-tent/REPORT.md) for recorded evidence and its limits.
