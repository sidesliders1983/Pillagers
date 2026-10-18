# Island map and camera Home — #194

This is an orientation surface for the existing Fjord scene. It sends no Simulation Core command, adds no save schema and changes no discovery, expedition, economy or terrain-generation rule.

## Owner decisions

The owner's 18 October clarification supersedes the issue's original bottom-right persistent desktop proposal: **Map is an icon in the lower-left, collapsed by default, with show/hide controls.** A direct Home camera button sits beside it. On phone and compact touch tablets, Map opens a deliberate modal window with Close and Home actions; the normal Horizon shell remains in use. Desktop opens a small non-modal map above the lower-left controls. Layout changes close the map; its open state is transient UI state.

The map shows one numbered destination flag per active expedition group, never individual members. Traveling and Exploring flags use the group's ordered destination. Returning flags point to the settlement nucleus. Prepared, Returned and Stranded groups have no active destination flag. A player's own order can be shown in unknown terrain without granting knowledge of that terrain. Flags never reveal enemy identities or contents.

## Geography and discovery

The existing `terrainPreview` samples at most 128 × 128 values from the current canonical WorldBlueprint. This is the loading preview's geographic contract: height, coast and existing ground field, with no sites, building parcels, resources or entities. The map does not generate another world, copy the full-resolution heightfield or run a second classification system.

North is negative world Z and stays up; east is positive X. The same world bounds drive raster, camera marks and click conversion, preserving rectangular proportions. The approved island silhouette is visible in muted colours. Unknown, mapped and currently observed interior shading comes from the observing clan's existing discovery mask. No rival camp, home, resident, loot or secret site marker is added.

Click/tap a known point to move only the camera focus, preserving orbit/zoom intent through the existing terrain-safe RTS controller. Unknown points reject with one generic message, without a path query, reveal or order. Home uses the controller's Home action focused at the actual campfire nucleus. These interactions never start/pause the campaign. Existing saved camera presentation remains separate from Core.

## Rendering and lifecycle

The geographic raster is cached for the current blueprint and reused during quality switches. Fog changes repaint that bounded image only when canonical mask strings change. Camera position/focus, direction and viewport footprint use a separate SVG overlay, throttled to at most 10 Hz while open and unchanged when the camera is stationary. Footprint rays reuse the existing canonical terrain-navigation query, with a focus-plane/finite far fallback for the sky and sea. No extra scene, WebGL renderer, render target or map texture is created.

The map consumes only the player's public mission projection for flags. Group labels are written as SVG text, not interpolated HTML. A fixed raster's backing bytes and generation/update timings are reported separately from scene diagnostics. Restart/import replaces the map source; disposing the scene removes map controls, dialog, listeners and raster references. No map pixels or collapse preferences enter campaign saves.

Keyboard users can open Map/Home from the ordinary tab order. On the map, arrows move a local cursor, Enter/Space focuses a known point, Home returns the camera and Escape closes. Mobile modal containment prevents touches reaching the scene; map keyboard events do not reach camera movement handlers. Controls have 44 CSS pixel targets and use the existing safe-area tokens.

## Review

Evidence and current limitations are recorded under `docs/qa/island-map/`. The production pool contains **two distinct terrains (7 and 18)**; multiple campaign seeds exercise these without adding another production island. Physical iPhone/iPad acceptance and owner usefulness/fit approval remain explicit review steps before merging.
