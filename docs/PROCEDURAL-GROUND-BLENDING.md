# Procedural ground blending — #137 native material study

The Environment Lab study consumes the saved `environment.fields` from #135. It does not reclassify terrain, alter the canonical heightfield or serialize additional terrain values. Production rendering remains on the existing material recipe pending visual review.

## Comparison controls

Import or generate a world with **Environment zoning**. Choose **Ground rendering → Zoned blend · native source atlas**. The baseline remains available in the same control; switching replaces terrain materials without moving the camera or regenerating the world. **Rock colour** independently switches between the original mossy olive and the cool-grey art-direction candidate. It defaults to grey inside the explicit Lab study; production remains unchanged. Unzoned imports retain the baseline and disable the study selector.

The diagnostic selector exposes dominant rendered material and grass, sand, mud/wear and rock weights. Existing rock exposure and climate-gated snow-potential views retain their #135 meaning. Dedicated ground study cameras inspect broad grass, wet ground, steep rock, gentle highlands and sheltered ground; they select viewpoints from existing fields, not new region classifications.

## Material composition

Grass, sand, mud and rock exposure are bilinearly sampled from the existing fields and normalized. Existing clearing/path wear shifts the mixture toward the approved soil source. Water samples with zero land influence use the approved sandy seabed. No new elevation cutoff or coastal classifier is introduced: low coastal rock and gentle grassy highlands retain the distinctions already present in zoning.

The native stack consists of grass, sand, soil and three orientations of the same rock source. Alpha is calculated for sequential over-composition so that the resulting mixture represents normalized weights. Rock uses XZ, ZY and XY texture coordinates; orientation contributions follow the canonical triangle gradient. Native `Texture.channel`, `alphaMap` and `MeshStandardMaterial` implement the composition. There is no new GLSL, `onBeforeCompile`, custom splat/triplanar shader or mesh displacement.

Each rock projection shares the same source image with the other orientations. The ground mask uses its own clamped UV channel. Side projections add two render-only UV attributes; they do not change any position, triangulation or physical terrain query. Source references for live wear updates are held in a WeakMap, with no additional saved rasters.

## Source sampling

Sources remain ambientCG **Ground037**, **Ground054**, Poly Haven **mossy_rock** and **grass_path_2**, all CC0. Exact original source hashes, attribution URLs and generated output hashes are recorded in `public/ground-materials/blended-v1/manifest.json`.

`node scripts/prepare-blended-ground.mjs <source-root>` verifies the original maps against the existing v0.4 manifest, then builds periodic atlases from overlapping source patches with deterministic quarter-turns and offsets. The original tint/saturation is applied once for the source comparison; colour blending uses linear light, and OpenGL normals are rotated into the atlas frame and renormalized. This recipe contains no terrain or zoning inputs.

Standard supplies 1024 px colour, normal and roughness atlases. Low supplies 512 px colour and roughness, omitting normals. Both cover 24 metres per atlas while retaining the source scale inside each patch. The atlas is periodic, not infinitely non-repeating: its 24-metre repetition remains a limitation to assess at far zoom. The objective is to remove the conspicuous original 3/4-metre tile patterns and vertical stretching at gameplay distance.

## Cool-grey stone art direction

The owner addition on #137 explicitly requests light-to-medium cool-grey exposed stone. This study keeps the existing Poly Haven rock source, its dark structure, normal and roughness. A separate deterministic colour-only delivery reduces saturation to 12% of the already treated source chroma, multiplies linear luminance by 1.3 and applies a restrained RGB tint [0.96, 1, 1.055]. No flat RGB override, elevation whitening or snow is used to obtain grey stone.

Only two extra colour files are delivered (Standard/Low). The selected colour replaces the source colour in memory; normal and roughness files are shared unchanged. The source colour remains available for a controlled same-projection comparison. Existing rockExposure incorporates slope and environmental context; grass, mud and wear provide the sheltered moss/soil transitions. No colour-based terrain classifier is introduced.

Source-vs-grey comparisons cover a steep inland wall, low sea cliff, rock/grass transition and whole-island oblique view in day and low sun. These camera probes select evidence viewpoints, not terrain regions. Exact daylight images require owner sign-off before this slice can be called visually complete. No additional asset is proposed unless this first candidate proves inadequate.

## Optional climate snow

**Potential snow cover · Lab study** is off by default. It uses only the saved climate-dependent snowRetentionPotential and allocates no pass when the entire field is zero. For a cold fictional candidate, set **Annual mean °C for new zoned worlds** to −8 and generate again. Normal 6 °C and cold −8 °C fixtures retain identical geometry. Switching snow off restores the substrate; this is separate from the rock colour treatment.

## Render budget

The base material retains every canonical triangle. Subsequent material groups omit a quad only when all four corners of its bilinearly sampled alpha mask are zero. The fourth corner matters even outside a triangle. This reduces unnecessary terrain passes without modifying physical geometry. Live wear updates rebuild the temporary masks and render index; no additional data is serialized.

## Evidence and limits

See [the review report](qa/ground-blending/report.md) and [matched browser images](qa/ground-blending/review.html) for measurements and the visual judgement. Timing describes the measured browser and hardware; it is not a claim about physical iPad GPU performance. Persistent snow remains off in the baseline climate; the saved snow-potential field is climate-aware rather than an automatic snowline on a low island.
