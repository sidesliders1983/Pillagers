# Fjord island campaign integration — QA

Date: 2026-10-13. Scope: new `/fjord-play` campaigns on the existing r3 island generator and zoned ground materials, selected from a deterministic curated pool. This report does not replace the historical Lab geography/material reviews.

## Results

- Public campaign/projection tests: deterministic pool selection; unchanged Simulation Core seed; pinned compact save; local storage; 2D/3D handoff; restart; transactional rejection of invalid recipes.
- Both pool entries accommodate ten independent founder households, all ten house conversions, a Farmyard with assigned cattle, a Longhouse upgrade and ten connecting home paths. Every projected entity has a valid transform.
- Desktop Edge: fresh campaign, real source models and zoned ground, building a house, assigning farmer, compact export, exact 2D → 3D return and a second campaign selecting the other island. No page errors.
- Edge touch emulation at 1024 × 768: ten built homes; single-finger rotation, spread to zoom in, pinch to zoom out, resident selection and management reopening. Gestures leave canonical state and saved placements unchanged. No page errors. This is not a physical iPad Safari test.
- TypeScript, Vite build and character validation including Lab previews passed locally. The complete regression suite and current-head CI are tracked on PR #145; a targeted browser pass is not a substitute for those checks.

## Measured capacity and persistence

| Campaign seed | Geography seed | Home plots | Maximum grading | Rival reserve gap | Center separation | Rival walking route | Minimum hull depth | Ten-home save |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 18 | 12 | 0.583334 m | 180.2 m | 328.57 m | 776 m | 0.938 m | 78,335 bytes |
| 33 | 7 | 13 | 0.597101 m | 42.76 m | 197.36 m | 270 m | 0.621 m | 76,657 bytes |

Each row repeated exactly, round-tripped through save/load, and preserved the same Core state as a campaign with the original geography. Heights stay within the approved 0.6 m local grading limit. Both source worlds also pass the existing six-demonstration-parcel Lab validation before campaign preparation. The campaign's actual ten-home proof is additional evidence, not inferred from those six parcels.

The current save stores the recipe, Core, narrative and layout, without heightfield, navigation or zoning arrays. An initial browser export was 66,055 bytes. Campaign seed and geography seed intentionally differ.

## Visual observations and limits

The screenshots show the live gameplay route, not a separate terrain mock-up. The newer coastline, highlands and material zoning are visible around the canonical settlement. Summer exposes the local foundation terraces; individual rectangular leveled areas can still be seen, particularly before houses occupy them. They are limited local cut/fill, not one flattened settlement platform. Tents have no dirt paths; permanent houses gain paths through the existing presentation projection.

The ship uses the full-hull validated berth and the sourced pier is parallel beside it. The camera frames residents and homes instead of zooming out to include a distant boat. Atmospheric fog is adjusted for that higher overview camera while retaining seasonal/weather treatment. It is not discovery fog. Rival rendering and exploration concealment remain future work.

Capacity is finite: 12 or 13 reserved plots. This does not promise indefinite settlement expansion or that all larger authored Farmyard variants fit. Changing the pool or preparation algorithm after release requires a new recipe version. Existing saves retain their original world.

Cold preparation took 28.1 s and 24.3 s in the measurement process while other local checks were running. These are two end-to-end preparation timings, not a controlled performance benchmark or frame-time samples. Preparation is synchronous; the route displays a loading message before it starts. The warm in-process cache holds at most the two immutable worlds. No frame-time threshold was imposed.

## Reproduction and evidence

1. Start the active branch on port 5180; open `/fjord-play`.
2. **Menu → Campaign → New campaign from seed**: seed 32 selects island 18; seed 33 selects island 7. Existing campaigns must explicitly start a new campaign to see the new geography.
3. Run `node scripts/qa/measure-fjord-islands.mjs` for both entries and the funded touch fixture.
4. Run `node scripts/qa/check-fjord-island.mjs` for the desktop flow.
5. Run `node scripts/qa/check-fjord-island-touch.mjs` for touch emulation. Both browser scripts accept `QA_ORIGIN` and `PLAYWRIGHT_MODULE`.

[Image review](review.html) · [Measurements](measurements.json) · [Desktop results](browser.json) · [Touch results](touch.json) · [Current contract](../../FJORD-ISLAND-CAMPAIGNS.md)
