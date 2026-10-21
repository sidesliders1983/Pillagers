# Marine wildlife v0.2 — #243

The existing wildlife registry, population, renderer and canonical sightings runtime
now include rare humpback and orca visitors. The owner supplied an updated orca
with a 16-joint skin during review. There is no second marine simulation or
permanent marine population.

## Assets and scale

`Whale.glb` contains a 27-joint skin and no animation clips. Preparation preserves
the supplied mesh, UVs, textures and weights, straightens the raised tail through
its existing chain, and normalizes its nose-to-tail axis to 14 m. The resulting
`public/wildlife/humpback.glb` is approximately 160 kB, with 2,994 triangles.
The updated `Orca.glb` contains 16 joints and no clips. Its downward-curved tail
chain is neutralized in the same preparation step and its body length is 7 m;
the runtime publication is approximately 83 kB. Neither asset is reconstructed
from geometric primitives.
No original source model is required or included in the browser build.

Reproduce just this publication without rewriting other animals:

```sh
node scripts/prepare-wildlife.mjs /path/to/Assets/Characters/Wildlife --only=orca,humpback
```

The generated runtime/TypeScript manifests record source and publication hashes,
dimensions, canonical reference, skin count and operations. Existing publications
are byte-identical. `body-length` publications use a centred origin; earlier
standing animals retain their original ground origin.

## Encounter and habitat rules

- Registry profiles: `humpback_surface_sighting` (rare, 14 m) and
  `orca_surface_sighting` (uncommon–rare, 7 m), both water movement.
- At most one slot per species per physical island. Both remain absent between
  visits. No suitable route means no visitor; there is no shallow-water fallback.
- Habitat tags: `fjord_water`, `deep_coastal_water`, `outer_coast`. Deep coastal
  samples are at least 4 m underwater and 15 m from the coast; outer coast starts
  at 80 m from the coast. The whale's stricter route rule requires **6.5 m depth**
  and a **7.1 m body-clearance envelope**, including diagonal probes.
  Orcas require **5 m depth** and a **3.6 m clearance envelope**.
- At world initialization, a bounded search checks straight 240 m whale / 276 m
  orca corridors from
  the deep-water map edge. Sample spacing is 2 m; full-body clearance is checked
  along the route. Retain at most six seeded corridors, favouring safe coastal
  passages. Enclosed water pockets cannot qualify. No route search runs per frame.
- First arrival occurs after 240–480 wildlife seconds. Following visits have a
  720–1,200 second cooldown for humpbacks. Orcas arrive after 90–210 seconds,
  followed by a 300–600 second cooldown. Selection uses the world seed, instance and encounter
  number; it never consumes campaign RNG or depends on the camera.
- Each humpback visit travels at 2 m/s for 120 seconds: submerged approach (14 s), first
  surface (28 s), dive (14 s), submerged travel (14 s), second surface (20 s),
  dive (14 s), submerged exit (16 s). Repositioning for the next route happens
  only while absent, before the submerged approach starts.
- Orcas travel at 3 m/s for 92 seconds: approach (10 s), surface (24 s), dive (8 s),
  submerged travel (12 s), surface (20 s), dive (8 s), exit (10 s). The dorsal fin
  and a little back remain visible during surface cruise. Twenty-five percent
  of visits include a gentle head rise during the second surface. The supplied
  tail chain gives a subtle swimming stroke without flexing the dorsal fin.
- Surface rise takes six eased seconds. Body mostly remains underwater. The first
  surface has a 2.5 second blow beginning seven seconds into that phase.
  Twelve percent of humpback visits use a pronounced tail-arch/slap dive. The fluke
  rises, holds briefly, then lowers more quickly, following the supplied reference.
  The normal dive retains a small arch. Tail motion uses the supplied bones.
- A fixed pool of 32 overlapping, soft mist puffs and two low-resolution wake/splash rings per
  visitor adds no fluid simulation or per-frame allocation of effect geometry.
  The humpback blow expands upward from its blowhole and fades as a short cloud;
  it is not a column of individual water droplets. Impact ripples can finish after
  the body disappears below the surface.
- Rendering samples the actual displaced `ReferenceWater` triangle through the
  current world adapter. Canonical placement/depth use the blueprint water level
  and terrain; visual wave displacement does not alter discovery outcomes.
- Camera/frustum rejection and hidden/submerged states skip skeletal and effect
  updates. Discovery still hides unknown terrain. No camera movement or locking
  is introduced in Fjord Play.

At the existing 0.2 wildlife seconds per canonical tick, initial/cooldown intervals
follow canonical game progress. Visual water waves and small cosmetic motions
remain on presentation time. Pausing freezes animal decisions and poses.

## Otter water behaviour

Only the water otter gets `otter_shore_water`; the shore animal retains its Meshy
walk and rest animation. Every third destination decision gives the water otter
a 14–24 second back-float. Enter/exit roll eases over two seconds. It drifts at
0.025 m/s with water/obstacle checks, breathes and adjusts its head
and forepaws over its belly. Floating height uses the actual skinned tail-tip
vertex, held 8 mm above the local displaced water triangle, so the body sits partly
in the water. Body pitch and neck posture keep the head clear at every heading. All
overlays restore the prior pose before the mixer runs; transforms do not accumulate.

## Sightings, history and saves

Both species use the same `WildlifeSighted` event, Attention discovery, Clan Book species
index, group history and personal witness history as other fauna. Only a surfaced
pose is observable. Absent, deep approach, fully submerged and exit poses cannot
produce a sighting. Surfaced marine visitors use a 64 m sight radius; resident species
retain 32 m. Both require known terrain and an unobstructed terrain sightline.
Contact cooldowns and first/repeat encounter semantics remain unchanged.

Motion snapshots now include encounter elapsed time, cooldown, route, cycle,
special-dive flag and the otter float timer. Wildlife state version 2 saves these
alongside the existing actors. Version 1 resident-only saves upgrade once when
bound to their real world: preserve existing motion/history and append only the
future visitor slots. No earlier sighting is invented. Old snapshots remain
renderable before that upgrade. Invalid encounter clocks, states and route IDs
are rejected. Save/load and tick subdivision preserve encounter and witness results.

## Review and checks

- Production-motion review: `/scripts/qa/marine-wildlife-243.html`.
  Choose humpback or orca. Buttons play normal surface, blow, rare tail dive,
  head rise, submerged pose, full visit, otter swimming and back-floating. The
  encounter-time slider also allows paused inspection. This isolated fixture does not change a campaign.
  Its optional follow camera is a review aid only.
- `node --test tests/marine-wildlife.test.mjs tests/marine-sightings.test.mjs`
- Existing wildlife, sightings and Clan Book tests.
- `node scripts/check-wildlife.mjs`: verifies real campaign islands 18 and 7,
  both visitors, all 28 residents, and habitat/territory constraints.
- Normal build, public-asset and character validation, plus the full test suite.

This adds no hunting, whaling, food, resources, combat or ecological population
mechanics. The existing terrain-only line-of-sight limitation remains unchanged.
