# Procedural Fjordside Generator v0.1

Issue #70 is an isolated Environment Lab proposal. Live Fjordside and Simulation Core saves keep their existing geometry and rules. Production adoption requires owner visual review, the pending #60 integration decision and a separate focused migration PR.

## Use the Lab

Open /environment-lab. Select a fixed Review seed or enter an integer World seed, choose Fjord, Coastal Valley or Rocky Inlet, then press Generate World. The readout reports the actual seed, normalized parameters, generator version, biome counts, site score and rejection reasons. High overlook, Village and Shore cameras inspect the layout. Diagnostic overlays show biomes and the final scenery-aware walkability field. Atmospheric fog is optional for inspection; turning it off exposes the bounded terrain edges.

Reference Fjordside restores the existing seed-1983 authored scene and its previous ground/quality/conifer controls. It is a compatibility fallback, not a new algorithm claiming to regenerate the previous coastline. The Conifers selector remains available in generated worlds: EZ-Tree Large · varied heights or KayKit FREE conifers. Generation honors the current choice. Changing it replans nature and its navigation exclusions while retaining the stored terrain, coastline and settlement. Generated worlds disable the optional GrassField and legacy static terrain atlases. Standard and Low remain available. Source assets and their original proportions are preserved.

Export world downloads a versioned JSON blueprint. Import world restores the stored height samples, coast, site, navigation, placements and conifer choice without running the generator. Original v0.1 saves without a conifers parameter retain KayKit and their full stored blueprint. Standard/Low changes preserve the stored source and placements. Unknown versions, invalid array dimensions, unsupported assets and malformed data are rejected visibly. Campaign saves are separate and unchanged. No populations, cattle, resources, neighboring regions or expedition facts are created by this geographical proposal. Ten fixed existing Meshy reference identities demonstrate movement only.

## Physical and deterministic contract

The generator is pure for seed + normalized config + generatorVersion. Version is fjordside-v0.1; noise is pinned simplex-noise 4.0.3 (MIT), fed by the existing private seededRandom. No wall clock or global randomness enters the blueprint. Terrain stores 91 × 91 Float32-rounded samples over 180 × 180 metres, +Y up, with alternating 2m triangles. Bounds are -90 to 90 on X and Z; the existing water level is -0.12m. Navigation is a 1m cardinal grid. Relief is bounded to 0.5–1.5 and forest density to 0.3–1.3; the three UI presets use normalized defaults of 1.

Rendering, raycasts, props, foundations, resident heights, bathymetry and shoreline intersections consume those same triangles. Existing reference Terrain and shoreAt callers retain their behavior behind optional adapters. The pinned boona13 water shader and its wave/foam math are unchanged; the adapter supplies actual generated depth and coast segments.

A maximum of twelve deterministic candidate sites is examined within the requested seed. The six existing reference parcels retain their relative positions, rotations and footprint dimensions. Naturally dry candidates are flattened to 2.6m with an 18m smooth outer transition in the authoritative terrain array. Submerged samples are never raised to manufacture land. Failure does not select another seed. A rejected landscape has visible reasons and does not receive houses or reference residents.

Current suitability thresholds (metres and slope in m/m):

| Check | Threshold |
| --- | --- |
| Foundation maximum slope | 0.12 |
| Foundation height above water | 0.25m |
| Walking maximum slope | 0.55 |
| Walking height above water | 0.20m |
| Resident parcel/road clearance | 0.65m |
| Final connected clearing | At least 1500m² |
| Dry harbor approach | Within 2m of actual coast |

Every building approach and harbor route must be cardinally connected. Connected area and reachability are measured again after nature clearances remove navigation cells. Runtime steering uses the existing MovementSystem, collision separation and animation with an injected generated physical domain. Its roaming area is the reserved settlement clearing; it is not a global exploration/pathfinding system.

## Assets and native materials

The fourteen source roles in public/nature/kaykit-v1/manifest.json and docs/references/environment/kaykit-source-lock.json are unchanged. scripts/prepare-world-sources.mjs verifies their SHA256 hashes and measures model bounds, preserving primitive/node transforms. Placement plans use those footprints, slope/dryness, biome clustering and full parcel/road exclusions. Scale and rotation vary deterministically. Geometry remains authored and instanced. The optional normalized conifers parameter selects kaykit or ez-tree; omitted means the original KayKit contract. EZ-Tree uses the already approved, unchanged Large pine preset at revision dcf309bd86bd521083d9c70f01f2de45fdc7c457, reused through LabPines. Its three role heights match the original KayKit heights before seeded scaling. scripts/prepare-pine-footprints.mjs verifies the pinned model/resources and measures centered source bounds; these wider crown radii drive dry/parcel/road checks and navigation. It does not use the narrower KayKit footprint for EZ-Tree. Tree counts may differ because crown widths differ. Source node transforms, materials and cached geometry remain intact.

Ground uses the same approved ambientCG Ground037/Ground054 and Poly Haven mossy_rock/grass_path_2 CC0 sources, the same v0.4 saturation/tints and physical texture repeat lengths. The previous regional atlases encode the old coastline and parcels, so they cannot be reused verbatim on different geography. New source-tile deliveries are recorded in public/ground-materials/world-v01/manifest.json: Standard 256px albedo/normal/roughness, Low 128px albedo/roughness. These are native MeshStandardMaterials with vertex colours, not a new terrain shader. Biome and wear masks blend the four native source layers through alphaMap on an independent world UV channel. Source texture repeat lengths remain 3m (grass, sand, paths) and 4m (rock). Linear-filtered 91 × 91 masks soften boundaries without custom GLSL. This differs from the static atlas delivery: four full terrain draw layers add measured rendering cost. Source textures and models are unchanged.

The simplex-noise notice is in docs/licenses/simplex-noise-4.0.3.txt. Three.js remains the locked 0.180.0 vanilla WebGL renderer. No scenery substitutes, new GLSL, renderer migration, seasonal system or geometry reflections are introduced.

## Lifetime and QA

Generation prepares a replacement scene before swapping. Revision checks discard stale asynchronous requests. Regeneration disposes generated terrain buffers, water targets/masks, instancing buffers and cloned resident materials/skeletons; shared authored geometry stays cached. Approved ground tiles are reused within a tier and disposed on tier replacement/reference restoration. Event handlers are installed once for the Lab page. Page teardown also releases the active proposal.

Run pnpm test, pnpm build and pnpm run validate:characters --lab-previews. Browser scripts use an externally supplied Playwright runtime (PLAYWRIGHT_MODULE) and QA_ORIGIN; no browser dependency is added to the game. scripts/qa/check-generated-pines.mjs checks both conifer choices, ten EZ-Tree seeds, source-aware saves, old-save compatibility, quality changes and repeated switching; its default output is scratch/generated-pines. The follow-up captures and renderer snapshots are in docs/qa/generated-conifer-choice. scripts/qa/review-generated-worlds.mjs defaults to scratch output so committed reports remain historical records. QA_OUTPUT can explicitly create a new report directory.

The review batch fixes ten requested seeds across three presets, records replay and placement hashes, captures equivalent high-overlook views, tests export/import and unknown-version rejection, observes residents and checks settled regeneration resource counts. Frame intervals are retained separately for every sampled run. Timings on this old laptop are diagnostic, not an automatic few-millisecond blocker. Renderer statistics include shadow passes and are not GPU memory measurements. A bounded observation cannot prove absence of every long-duration navigation or memory issue.

## Migration after approval

1. Agree the source-backed scene and material boundary treatment against REF-A/REF-B and the generated seed gallery.
2. Adopt the shared canonical terrain/placement adapters in a separate Fjordside PR; migrate all ground/click/nav/shore callers together.
3. Keep existing campaign geography or require an explicit world migration. Bump generatorVersion for changed generation and continue loading stored blueprints unchanged.
4. Map presentation coast direction to existing Simulation Core region facts through an explicit integration contract. The generator must not override the region graph.

## Sand study follow-up — 2026-10-09

The focused #63/#74 comparison adds an opt-in Environment Lab sand resolution selector, two shore inspection cameras and a fixed accepted ReferenceWater adapter for both A/B resolutions. Standard can compare the original 256px with a source-derived 512px Ground054 candidate; Low remains 128px without normals. Geography, navigation, saves and other material layers are unchanged. The default loader used by production Fjordside still selects 256px. See [Generated sand resolution](GENERATED-SAND-RESOLUTION.md) and [the review report](qa/generated-sand-resolution/report.md). This Lab delivery does not approve production promotion.
