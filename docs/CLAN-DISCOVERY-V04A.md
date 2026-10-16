# Clan Discovery v0.4A — prototype contract

Status: opt-in implementation of #147, the first slice of exploration epic #146. Normal new campaigns and existing campaigns remain unchanged until the owner approves rollout. Expedition Group controls and authoritative travel are #148; physical rival-clan placement is #149; spatial Recon/Surveillance/Pillage is #150.

## Canonical knowledge

`SimulationState.discovery` is an optional version-1 physical-world extension. It stores one immutable WorldBlueprint identity, world bounds, grid dimensions, observation policy and independent clan masks. It does not store another heightfield, navigation grid, biome classification, camera or rendered meshes. Absence means historical gameplay without physical fog; loading never invents knowledge or reinterprets the four-direction expedition graph.

The owner-approved prototype uses 8 m cells, 96 m settlement/landing observation, 64 m expedition observation and 1.7 m eye height. These values are saved rather than replaced by future defaults. Terrain uses the existing exact triangle/sightline queries. The representative ground point at a cell's centre must be within range and visible from the observer; sea uses its surface elevation. This is a bounded coarse model, not exact optical visibility at every point of a cell. Forest, weather and daylight do not yet modify detection.

Two little-endian bitsets distinguish permanently explored terrain from current observation. The save codec is lowercase hexadecimal, with validated length, padding and `visible ⊆ explored`. For an 800 m island this is 10,000 cells: 2,500 raw mask bytes per clan, 5,000 encoded characters, about 5.3 kB including the one-clan metadata. CPU clan masks can live independently in the same world extension; they are never copied into a player's read model.

`initializePhysicalDiscovery` explicitly binds a new physical world using its real settlement and landing positions. It consumes no time, stock, events or RNG. `commitClanObservation` is a trusted simulation seam for confirmed observer positions, not a player command. There is no browser API for moving a resident or revealing from the camera. #148 must call this seam only from committed group progress, and remove temporary observers on return, interruption, death or loss of eligibility. Planned routes grant no knowledge. The first slice proves this seam using a labeled headless/browser observer fixture; it does not claim a playable expedition is implemented.

Validation rejects unsupported versions, oversized masks/grids, invalid policy/coordinates/timing, visible bits outside explored bits and missing owning-clan knowledge. The Fjord import also checks the immutable geography identity and numeric bounds before committing any campaign state. A damaged save is rejected rather than silently reset. The existing clan book's canonical identity additionally protects the complete saved state.

## Player-visible information

`inspectClanDiscovery` returns a deeply frozen, clan-scoped read model. `projectDiscoveryEntities` explicitly selects only allowed marker fields; current observation is required for live foreign entities. It never spreads a raw canonical object, so inventories, DNA and other foreign details cannot hitchhike on a marker. Mapped terrain alone does not permit live enemy markers. Dated Scouted/Surveyed intelligence remains the existing separate contract.

The current Fjord entity layer contains only player-owned canonical residents, homes, cattle, vessel and campfire. It does not instantiate a rival settlement in this slice. Unknown scenery roots are excluded from instance assembly and standing-tree targets. New committed discoveries reconcile known scenery while retaining cleared home/path plots. Ambient resident movement stays on mapped terrain and does not reveal anything. #149 must feed future enemy objects through the allowed projection before creating meshes, labels, pick candidates or action panels; hiding a mesh alone is insufficient.

Saved game bytes and developer fixtures are inspectable locally. This is information-flow correctness for normal gameplay, not cryptographic anti-cheat secrecy.

## Presentation

The production prototype uses native Three.js `MeshBasicMaterial.alphaMap`, a world-aligned texture and a mesh following the existing canonical terrain triangles. There is no custom fog shader, new terrain renderer or multipass render target. Unknown cells are opaque; the feather lies inside known cells. Mapped, currently unobserved terrain receives a light veil. The surface is 0.2 m above ground/sea, above the approved water's maximum 0.18 m displacement. Native depth testing preserves visible foreground objects. A sea apron closes the discovery boundary.

Steady fog adds one native draw call. A 0.8-second previous-mask fade can temporarily add a second. Interrupted fades preserve the current visual alpha before the next transition. Knowledge commits immediately and is never delayed by animation; reloading during a fade restores the committed map. Masks/textures are rebuilt only on canonical knowledge changes, not per frame. Geometry, textures and native materials are disposed with the scene and survive the existing warm-resume lifecycle.

Atmospheric distance/weather fog remains separate. The cinematic loading preview may show coast/relief, without CPU inhabitants, inventory or site markers. Fog is applied at the home-settlement gameplay handoff. Preview, orbit, zoom, quality, weather and presentation clocks cannot mutate knowledge.

## Review and rollout

Use the [review gallery](qa/clan-discovery/review.html). `?discovery=1` opts **explicitly created new island campaigns** into the prototype. Existing active/imported campaigns retain their saved setting, even if the query is present. A saved prototype retains fog when reopened without the query. `?debugDiscovery=1` adds read-only coverage/allocation diagnostics; it provides no reveal action.

The developer-only `scene.html` fixture is served by Vite and deliberately labeled. It is not part of the production game and is not shipped as an alternate player map. Production review uses the image gallery and the real `/fjord-play` route. Actual Core expedition travel, mobile Safari performance and owner visual acceptance remain separate gates. The first playable milestone is #147 + #148; default activation is deferred until that experience is reviewed.
