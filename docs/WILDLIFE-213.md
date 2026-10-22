# Wildlife v0.1 — Fjordside (#213)

Current marine encounters and otter back-floating extend this runtime in
[Wildlife v0.2 (#243)](WILDLIFE-MARINE-243.md). In physical campaigns, the canonical
motion/sighting snapshots described in [#226](WILDLIFE-SIGHTINGS-226.md) take
precedence over reconstructing the opening population on reload.

Wildlife is a visual population in the loaded Fjordside world. It does not change
world generation, navigation, the simulation clock, residents, resources, hunting,
food production, rival settlements or campaign RNG. It is not saved as ecology.
Reloading reconstructs the same initial population from the blueprint seed;
moving the camera and changing presentation quality keep the current actors.

## Population and habitats

Wildlife coats use native scene lighting with source emission disabled once on
cached model templates. They follow Northern Light alongside residents and terrain;
this does not change authored colors, motion, discovery or sightings.

| Species | Instances | Placement |
| --- | ---: | --- |
| Brown bear | 1 | Deep forest or foothills, at least 135 m from settlement centres |
| Red fox | 1 | Forest edge or lowland, at least 100 m from centres |
| Wolf | 1 | Forest, forest edge or foothills, at least 145 m from centres |
| Moose | 1 | Wet lowland or forest edge, at least 40 m inland and 125 m from centres |
| Reindeer | 1 | Alpine terrain, at least 125 m from centres |
| Lynx | 1 | Deep forest or foothills, at least 135 m from centres |
| Great black-backed gull | 6 flying + 3 grounded | One species, two supplied model variants around the coast |
| Puffin | 3 on land + 2 in water | Initial coastal group within 16 m of its shared anchor; land birds at least 0.6 m above water |
| Otter | 1 on shore + 1 in water | Coastal pair |
| Seal | 2 hauled out + 2 in water | Small coastal group |
| Rabbit | 2 | Forest edge/lowland pair, at least 60 m from centres and 18 m inland |

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
normal, roughness/metallic, occlusion and emissive maps. Emissive factors are reset
to zero. All fourteen runtime GLBs together remain below 2 MB;
individual exports are below 200 KB. The publication manifest pins original and
runtime SHA-256 hashes and records every authoring operation.

Canonical shoulder/body reference heights in metres: bear 1.15, fox 0.40, wolf
0.75, moose 1.90, reindeer 1.15, lynx 0.62, otter 0.30 and seal 0.60. Shoulder/body
references are measured source cross-sections rather than overall antler, head or
upright otter height. Puffin standing height is 0.32 m; grounded gull height is
0.60 m; flying gull wingspan is 1.60 m. Rabbit height including ears is 0.42 m. Puffin wing chains are posed compactly with
the supplied rig and the body is rotated upright for land/water. The grounded
gull gets compact raised and lowered folded-wing morph targets at runtime using
the original faces and UVs. The wings rest down against the flanks, with their
feathers pointing rearward; the head and feet remain fixed. Each bird spends most
time folded, with a 3.6-second
stretch approximately every 29–35 seconds, and visibly turns while resting. Flying
gulls receive a small seven-bone wing rig once in the shared model cache.

Bear uses `Grizzly-animate-walking.glb`; wolf uses `Wolf-animated.glb`. Both keep
their actual one-second Meshy walk clip. Only horizontal hip root motion is removed
so the world controller moves the actor exactly once; vertical bob and joint
motion remain. The separate `-rigged` originals are retained untouched in Assets.

Puffins retain species-specific procedural movement: waddling at 0.12 m/s on
land, paddling while swimming, and small head and folded-feather motions while
resting. Their poses restore authored joint rotations each frame and pause with
the wildlife clock. Land birds remain at least 0.6 m above the waterline and stay
in the same coastal colony as water birds. Their canonical height remains 0.32 m.
Water immersion is 35% of otter height and 45% of puffin height, leaving the upper
body visible; other swimmers retain 60% immersion.

Fox, lynx, reindeer, sea otter and seal now use the supplied `-animated` Meshy
exports, alongside the existing bear and wolf clips. Each contains a one-second
locomotion loop. Horizontal hip motion is removed so the world controller moves
the actor once; source joint motion and vertical bob remain. New wrappers are
calibrated against the previous runtime body length in the first animated pose;
this avoids inheriting Meshy's inconsistent export units. Counts, habitats,
roaming speeds and shyness do not change. Swimming otters and seals reuse the
supplied locomotion loop with their existing water immersion and bob; these are
not separate authored swimming clips.

All seven Meshy animals retain species-specific procedural resting movement over
the source clip's resting frame: small head turns, breathing and tail movement
where appropriate. Hauled-out seals keep their position and move their head and
upper body subtly. The rest overlay is removed before evaluating locomotion, so
it cannot accumulate into the Meshy walk/swim pose. Every animal has its own
seeded phase. The wildlife clock and all these poses freeze when the game pauses;
resuming the simulation resumes normal wandering and animation.

Grounded gulls also scan left/right with their head independently of their folded
wings and feet. A 5.5-second scan is followed by a longer neutral rest, with a
14–21 second per-bird cycle. The existing 3.6-second wing stretch every 29–35
seconds retains its schedule. The first 0.6 seconds lift the still-closed wings
into the previous raised pose, followed by 1.2 seconds opening and 1.2 seconds
closing. The final 0.6 seconds lower the closed wings against the flanks again.
Smooth transitions stop at each pose without a jump. These motions also use the
paused wildlife clock. See [lowered gull wings revision 006](qa/wildlife-213/revision-006/README.md).
See [resting motion revision 005](qa/wildlife-213/revision-005/README.md).

The reindeer export has a crossed right hind hock and hoof chain. The authoring
pipeline mirrors the sound left chain, inverse bind matrices and hindquarter skin
weights onto the right side, then samples opposite-phase motion in the moving hip
frame. The other 23 animated joints, geometry, UVs and materials are retained.
This repair is applied only to the derivative runtime export; the supplied GLB is
unchanged. See [authored motion revision 004](qa/wildlife-213/revision-004/README.md).

The rabbit uses the supplied `bunny.glb` skeleton (no authored clip), with a
procedural hop informed by the supplied `WgZ.gif`. It gathers before pushing,
travels mostly during flight, lands on its forepaws, then recovers its hind paws.
Stride phase drives both horizontal travel and a separate visual lift: 6 cm when
roaming, 8.5 cm when fleeing. Roaming averages 0.65 m/s before seeded variation;
fleeing uses 1.8 m/s. Hop duration ranges from 0.42 to 0.70 s with pace. A stride
lands before stopping or changing direction; pause freezes the exact phase.
Support paws use the actual terrain height and the supplied leg chains, with
independent body compression, head stabilization and ear follow-through. No
geometry, skin weights or source bone lengths are changed. This is a procedural
interpretation of the reference, not motion capture. The pair stays within a
12 m roaming radius, detects people within 16 m, and shares the existing six-second
alert behavior. It adds no hunting, resource production or Core entities.

The supplied `Elk.glb` contains a 35-joint rig but no animation. Its runtime
derivative now retargets the actual one-second `Lynx-animated.glb` walk. World-space
rotation deltas are transferred onto the original moose bind pose, retaining its
own skin weights, leg lengths, body proportions and antlers. Extra shoulder, neck
and hoof joints share the corresponding donor motion. Vertical root correction
keeps the lowest hoof on the ground, with dense contact samples across support
changes; horizontal motion remains under the world controller. Both source
hashes and the retarget operation are recorded in the publication manifest.

Moose rest uses a separate neutral `Idle` clip with all four hooves down, plus
small head and breathing movements. It switches back to `Walk` when roaming or
fleeing, without retaining the rest overlay. This is transferred feline motion,
not a separately authored moose gait. See [moose retarget and wildlife audit](qa/wildlife-213/moose-001/README.md).

Hauled-out seals rest; grounded gulls turn and stretch their folded wings.
Swimmers bob and glide; flying gulls alternate ascent-driven wingbeats and gliding.
These remain ambient motions without hunting or flight takeoff/landing animations.

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

The active `FjordScene` owns wildlife loading, human proximity inputs, per-frame
updates and disposal. Same-blueprint world replacement retains the population;
changed blueprints replace it. Superseded asynchronous loads release their layer
before attaching anything to the current scene.

Each model loads once through a reference-counted cache. Actor clones share
geometry, textures, materials and source clips, and own independent skeletons.
Rebuilding the world disposes the old population and releases its asset leases;
failed loads wait for outstanding loads before cleanup. Discovery hides wildlife
in unknown terrain. Frustum culling skips hidden actors, and animations more than
200 m from the camera are not evaluated. Camera position does not influence
placement or motion decisions.

Confirmed land/shore and airborne positions are interpolated over the campaign's actual
snapshot cadence, including coalesced updates, rather than repeatedly easing into
each tick position and stopping. Heading follows the shortest turn. Land Meshy
clip time and the fallback moose leg phase advance with horizontal metres actually
displayed, so changing from roaming to fleeing does not multiply the whole elapsed
clock by a new speed or leave fast feet cycling over a stationary body. Pauses
retain the interpolated pose; loading snaps without adding teleport distance to
the gait. Flying gulls retain their interpolated altitude; heading, bank, pitch
and ascent-driven wing effort transition across the same snapshot interval. This
avoids a rush-and-stall every 500 ms and abrupt changes in wingbeat amplitude.
No flight extrapolation or additional simulation decisions run in render frames.
These are presentation changes: canonical flee speeds, shyness,
habitats, sighting positions and saved wildlife remain unchanged.

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
canonical dimensions, seven retained source locomotion clips, the retargeted
moose walk and neutral rest, stationary horizontal root motion and the repaired
reindeer hind chain. Moose checks sample all four strides, original segment
lengths, ground contact between baked frames, compact skin bounds and loop closure. Render
resource tests cover shared geometry/materials, independent skeletons, discovery,
repeated disposal and cleanup after an asset-load failure. The build's public asset
validator verifies all wildlife runtime manifest entries, including tracked files
in CI.

The two current curated campaign island recipes (18 and 7) were also inspected
using `createCampaignIsland`: both produce all 28 actors without a missing-habitat
fallback. This is placement validation, not a claim of complete ecology or authored
animation quality for models without clips.

Gull and distribution evidence is in [revision 002](qa/wildlife-213/revision-002/README.md).
Current coastal animal motion and placement evidence is in [revision 003](qa/wildlife-213/revision-003/README.md).

Rabbit motion and placement evidence is in [rabbit revision 001](qa/wildlife-213/rabbit-001/README.md).

Airborne snapshot interpolation and immediate house residents are covered in
[the cadence regression report](qa/wildlife-home-regressions/revision-002.md).
