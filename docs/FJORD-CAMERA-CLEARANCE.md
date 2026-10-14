# Fjord camera terrain clearance (#144)

The shared RTS camera preserves the requested focus, yaw, elevation and zoom. After computing
that orbit, it adds a separate vertical correction using the same canonical triangle-interpolated
height callback as world contact. It immediately lifts above an obstruction and recovers downward
with exponential damping. Temporary clearance never rewrites the requested zoom.

## Geometry and limits

- Default eye clearance: 2 m above terrain or the saved water level, whichever is higher.
- Boom clearance: 0.35 m. The first 3 m of horizontal distance from the look-at target are
  excluded because ordinary navigation targets lie on the ground. A near-vertical view still
  enforces endpoint/near-plane safety. This explicit allowance is not a promise of visibility
  inside a cliff immediately at the selected target.
- The camera near plane is enclosed by its bounding sphere and a conservative X/Z square.
  Boundary triangle crossings and enclosed terrain vertices bound its physical height footprint.
- The boom visits heightfield cell boundaries and their alternating diagonals. Surface height
  and camera height are linear between those crossings, so checking the segment endpoints
  bounds the whole segment; narrow triangle tips cannot fall between regular distance samples.
- The solver makes at most 512 height queries. If traversal exhausts that budget or a sampler
  fails, it uses the terrain's source maximum as a conservative ceiling, with diagnostics.
  It does not accept a partly unchecked boom. Invalid/overflowing numeric poses are rejected.
- Source maximum and grid metadata are bound once per geography, not rescanned each frame.
  The controller reuses an 8 KiB numeric scratch buffer. There is no new persistent world data,
  geometry, physics engine, BVH, shader, biome classification or frame-by-frame terrain scan.
- While a navigation focus interpolates between destinations, it follows canonical ground;
  an intermediate hill cannot leave that focus underground. A moving focus adds one height
  query outside the solver budget. Stationary orbit/review targets retain their requested focus.

Settings live in worldConfig.camera.clearance. The default recovery rate is 3.5 per second.
setNavigationSurface and Home clear old correction state. setView resolves safety immediately.
Generated worlds supply their existing grid and water level; the Reference world uses its
existing 2 m alternating grid. Authored tent and low-water review poses explicitly request
0.2 m ground clearance; Home restores 2 m. All views retain near-plane and boom checks.

## Diagnostics and validation

RTSCameraController.inspectClearance() reports requested orbit, current correction, required
correction, endpoint/boom clearance, height-query count, conservative mode, unavailable-height
count and solver-block timing. Fjord canvas data-camera-clearance exposes those read-only
presentation diagnostics; they are not persisted or sent into Simulation Core.

- tests/camera-clearance.test.mjs covers intervening ridges, narrow triangle tips, near-plane
  slopes, immediate escape, time-based recovery, no orbit drift, Home, world replacement,
  sea/flat terrain, bounded fallback, invalid data and the moving navigation focus.
- scripts/qa/check-camera-clearance.mjs uses the real controller, actual canonical island
  heightfields and native terrain rendering. It exercises mouse/keyboard, 390 px phone and
  1024 px tablet touch emulation, both curated islands, world replacement and before/after poses.
- scripts/qa/check-camera-reference.mjs checks the actual Reference-world review controls.
- Existing gameplay touch/selection/export and real new-campaign loading tests remain relevant.

[Current evidence and limitations](qa/fjord-fixpass/report.md),
[interactive camera review](qa/fjord-fixpass/camera-review.html).
Physical iPhone/iPad Safari is not certified by Chromium touch emulation. Buildings and trees
are outside this terrain-only camera constraint. Owner review of camera feel precedes merge.
