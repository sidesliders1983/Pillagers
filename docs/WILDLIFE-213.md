# Wildlife v0.1 — Fjordside (#213)

Wildlife is a visual population in the loaded Fjordside world. It does not change
world generation, navigation, the simulation clock, residents, resources, hunting,
food production, rival settlements or campaign RNG. It is not saved as ecology.
Reloading reconstructs the same initial population from the blueprint seed;
moving the camera and changing presentation quality keep the current actors.

## Population and habitats

| Species | Instances | Placement |
| --- | ---: | --- |
| Brown bear | 1 | Deep forest or foothills, at least 135 m from settlement centres |
| Red fox | 1 | Forest edge or lowland, at least 100 m from centres |
| Wolf | 1 | Forest, forest edge or foothills, at least 145 m from centres |
| Moose | 1 | Wet lowland or forest edge, at least 40 m inland and 125 m from centres |
| Reindeer | 1 | Alpine terrain, at least 125 m from centres |
| Lynx | 1 | Deep forest or foothills, at least 135 m from centres |
| Great black-backed gull | 6 flying + 3 grounded | One species, two supplied model variants around the coast |
| Puffin | 3 on land + 2 in water | Small coastal group |
| Otter | 1 on shore + 1 in water | Coastal pair |
| Seal | 2 hauled out + 2 in water | Small coastal group |

The registry in `src/wildlife/WildlifeSpecies.ts` owns these values, movement
speeds, roaming radii, group spacing and clearances. Habitat tags derive from the
existing terrain surface, coast segments, biome, forest cover, moisture and rock
exposure. Alpine terrain begins at water level plus the greater of 20 m or 58%
of peak relief. No new noise or alternate geography is generated.

Candidates are sampled once on an 8 m grid and along existing coast segments.
The six solitary mammals reserve their territories jointly, prioritizing scarce
habitats. Roaming discs have at least 40 m of separation, and their complete radius
starts outside settlement avoidance distances. Bear/wolf/lynx remain at least
35–45 m inland; fox is at least 25 m inland. This removes the former nearest-harbour
bias for land animals. Flying gulls retain the harbour/settlement reference.
Mixed land/water groups require a shared coastal anchor. Ground footprints must
be walkable, dry and clear of buildings and nature obstacles. Water actors remain
in water at least 20 cm deep; their routes cannot cross a headland. Movement checks
the whole proposed segment every 50 cm. Ground mammals follow the existing
terrain triangle normal so their feet do not remain horizontal across a slope. Newly built structures update the obstacle
list. An actor whose position becomes blocked rests and is hidden rather than
appearing inside the structure or teleporting elsewhere. Unavailable habitats
produce a diagnostic instead of an invalid forced spawn.

Flying gulls use bounded elliptical routes with individual phase, radius, speed
and altitude. Base height is 12–30 m above local terrain/water, with individual
3–8 m vertical variation and a 12 m minimum clearance. Terrain is sampled across
the bird's footprint. Coast and world bounds constrain initial routes. Flying gulls stay near the settlement
harbour. Their actual vertical speed drives wing effort: above 0.08 m/s ascent they
transition into wingbeats, while level or descending flight transitions to gliding.
There is no random wingbeat timer. Wing effort blends over approximately 0.25 s;
each bird retains an individual beat phase.

## Source assets and animation

`Assets/Characters/Wildlife` is the read-only source directory. Original source
models are excluded from the runtime publication. Rebuild the compact assets with:

```powershell
node scripts/prepare-wildlife.mjs C:/CodexWorkspaces/Pillagers/Assets/Characters/Wildlife
```

`wildlife.sources.json` defines each source and canonical size. Source poses have
inconsistent scales, including very small skinned bear/wolf transforms. The
pipeline measures posed bounds, applies a single authored metre-scale wrapper,
keeps original UVs and skinning, compresses colour maps to 512 px WebP, and removes
normal, roughness/metallic, occlusion and emissive maps. The bear/wolf emissive
factor is also reset to zero. All eleven runtime GLBs together are about 1.36 MB;
individual exports are below 150 KB. The publication manifest pins original and
runtime SHA-256 hashes and records every authoring operation.

Canonical shoulder/body reference heights in metres: bear 1.15, fox 0.40, wolf
0.75, moose 1.90, reindeer 1.15, lynx 0.62, otter 0.30 and seal 0.60. Shoulder/body
references are measured source cross-sections rather than overall antler, head or
upright otter height. Puffin standing height is 0.32 m; grounded gull height is
0.60 m; flying gull wingspan is 1.60 m. Puffin wing chains are posed compactly with
the supplied rig and the body is rotated upright for land/water. The grounded
gull gets a compact folded-wing morph target at runtime using the original faces
and UVs. The target sweeps the intact wing volume rearward beside the body; the
head and feet remain fixed. Each bird spends most time folded, with a 3.6-second
stretch approximately every 29–35 seconds, and visibly turns while resting. Flying
gulls receive a small seven-bone wing rig once in the shared model cache.

Bear uses `Grizzly-animate-walking.glb`; wolf uses `Wolf-animated.glb`. Both keep
their actual one-second Meshy walk clip. Only horizontal hip root motion is removed
so the world controller moves the actor exactly once; vertical bob and joint
motion remain. The separate `-rigged` originals are retained untouched in Assets.

Other supplied models have no authored clips. Four-legged skeletons receive a
small procedural leg swing during roaming. Idle animals make a subtle orientation
change; hauled-out seals rest; grounded gulls turn and stretch their folded wings. Swimmers bob and glide;
flying gulls alternate ascent-driven wingbeats and gliding. These are ambient v0.1 motions,
not authored locomotion, hunting or flight takeoff/landing animations.

Land mammals also react to nearby people: bear/wolf/reindeer detect people at
42–45 m, moose/lynx at 35–38 m and fox at 28 m. Otters and puffins have shorter
shore-side alert ranges. The displayed resident, expedition and observed-rival
positions are the authority; camera position and Core RNG are not inputs. A
startled animal chooses a bounded, habitat-valid escape segment away from the
person, using a faster gait. If no safe segment exists it watches instead of
walking in place. Alert persists for six seconds after the person leaves range.
Escape never teleports an animal or changes its territory. This is presentation
behavior, with no hunting, combat or economic effect.

## Rendering and inspection

Each model loads once through a reference-counted cache. Actor clones share
geometry, textures, materials and source clips, and own independent skeletons.
Rebuilding the world disposes the old population and releases its asset leases;
failed loads wait for outstanding loads before cleanup. Discovery hides wildlife
in unknown terrain. Frustum culling skips hidden actors, and animations more than
200 m from the camera are not evaluated. Camera position does not influence
placement or motion decisions.

In the development server open `/fjord-play?debugWildlife` and inspect
`JSON.parse(document.querySelector('canvas[data-wildlife]').dataset.wildlife)`.
It reports stable IDs, species/variant, habitat, state, position, anchor, radius,
flight height, live instance/asset counts and missing-habitat diagnostics. This is
inspection only; it adds no map markers or simulation entities.

## Validation

Run `node scripts/check-wildlife.mjs` to repeat the two real campaign-island
placement and 60-second roaming checks. It writes inspection records under
`output/wildlife-213`.

`tests/wildlife.test.mjs` checks deterministic population counts, seed variation,
land/water/alpine/flight constraints over motion, pause behavior, full-segment
obstacle checks, missing habitats, immutable geography, compact asset hashes,
canonical dimensions, retained walk clips and stationary hip root motion. Render
resource tests cover shared geometry/materials, independent skeletons, discovery,
repeated disposal and cleanup after an asset-load failure. The build's public asset
validator verifies all wildlife runtime manifest entries, including tracked files
in CI.

The two current curated campaign island recipes (18 and 7) were also inspected
using `createCampaignIsland`: both produce all 26 actors without a missing-habitat
fallback. This is placement validation, not a claim of complete ecology or authored
animation quality for models without clips.

Updated behavior and distribution evidence is in [revision 002](qa/wildlife-213/revision-002/README.md).
