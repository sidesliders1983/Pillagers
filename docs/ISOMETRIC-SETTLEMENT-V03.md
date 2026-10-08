# Gameplay UI v0.3 — static isometric settlement
Issue #49 adds /play beside /gameplay-lab. Both use the Simulation Core through GameplaySession, open paused, and share the existing local save key. Moving between routes requires Save locally / Load locally. Pan, zoom, selection and deterministic presentation slots never change simulation state or RNG.

## Controls and scope
Select a resident, tent household, house or animal on the board or through the entity picker. The right panel exposes canonical identity, household members (name, occupation, sex, age), lineage, work, maintenance and applicable commands. Under-16 and deceased residents have no occupation controls. Deceased identities remain available in the picker and history, but have no board sprite. Living calves appear from real reproduction events.

The HUD shows only current Winter, ticks, weather, Food, Materials, living residents and cattle. Winter watch uses actual exposure/modifiers and factual events; the low-Food warning explicitly compares with the founding reserve, not a new starvation rule. Weather appearance reads canonical weather. Campaign weather preference applies only to new/restarted campaigns. Campaign settings support new seeded campaigns and restart with the same or new founders.

The board is a presentation layout, not a navigation map. There is no movement, collision, construction placement or animation. Household slots are stable by ID; new entities and vacated homes remain inspectable. Generic sprites do not depict individual DNA appearance.

## Sprite contract and provenance
scripts/sprites/contract.json records a 45-degree horizontal / 35.26438968-degree downward orthographic camera, 48 pixels per metre and ground anchor (0.5, 0.5). Board ground projection uses that same isometric scale. Blender 5.2.2 renders existing house, Farmyard and cattle GLBs into transparent PNGs. Cattle share one source mesh and authored ochre material; bull/age variants are presentation scales, not new models. House upgrades have authored visible foundation/timber markers rather than new canonical house geometry.

Run Blender with absolute source and output paths:
```
blender --background --python scripts/sprites/render.py -- --asset-root C:/CodexWorkspaces/Pillagers --output C:/CodexWorkspaces/Pillagers/scratch/issue26-delivery/public/sprites
```

The tent and generic male/female/child proxies were actually generated with built-in ImageGen using docs/PILLAGERS-LOW-POLY-STYLE-GUIDE.md, pillagers-character-style/0.4-draft.1. Exact prompts and source/output hashes are in public/sprites/imagegen-manifest.json; source PNGs are retained in imagegen-source. pack-imagegen.mjs performs only alpha-preserving resize/ground-anchor packing. Reapply the retained generated sources after the Blender render; do not regenerate during builds.

ImageGen camera and scale are approximate raster projections, not calibrated 3D geometry. Tent uses a declared footprint allowance when packing. Broad facets, earthy palette, full silhouettes and cutout edges were inspected. The first tent had a visible halo and was rejected; the replacement is clean. Adult common-part invariance, topology, COLOR_0, rigging and module separation cannot be certified from these raster proxies. These are not accepted Character Lab v0.4 assets. The original private reference images were unavailable; this pass follows the supplied document without claiming direct source-image validation. Existing GLBs are not automatically recertified by this style pass.

## Validation
- 115 public regression tests pass, including two new settlement projection tests developed red/green.
- TypeScript check and production build pass.
- Browser report: artifacts/qa/play/browser-report.json, 11 checks pass: opening Landing/HUD; resident selection; house construction and members; Farmyard/livestock assignment; advance and save/load; zoom/fit; Severe weather; calves; shared Lab saves; narrow viewport; sprite loading/no GLB requests/no runtime errors.
- Desktop and mobile evidence: artifacts/qa/play/desktop.png and mobile.png.

Local preview: http://127.0.0.1:5180/play. LAN preview while the dev server runs: http://192.168.68.104:5180/play.


Repack retained ImageGen sources: node scripts/sprites/pack-imagegen.mjs public/sprites/imagegen-manifest.json. Adult raster proxies use a 1.60m presentation height as stated by the guide.

Layout follow-up: founding households now occupy three widely spaced columns/rows across the board. Resident and cattle offsets leave more room around homes. The projected ground grows with the entity bounds, and Fit settlement includes that ground so the full plot stays visible. The public projection regression and all 11 browser checks pass.

Clock regression: scripts/qa/check-clock-browser.mjs imports a canonical tick-999 save and tests both /play and /gameplay-lab. Automatic rollover continues into Winter 801 with positive ticks and an active Pause control; +1 Winter while running continues into Winter 802; explicit Pause freezes subsequent progression. Both routes pass without runtime errors. No timer implementation change was needed: the reported earlier stopping behavior was not reproduced in the current build.

Longship follow-up: the unsalvaged founding ship is a selectable board entity, rendered from Assets/Terrain/longship-drakkar.glb with the same camera contract. Its context panel exposes Keep and Salvage through existing commands; salvage adds the configured Materials and removes the sprite, while the picker retains its history. The public projection test and 12 browser checks pass, including actual board selection, keeping and salvaging the ship.

Desktop scroll follow-up: above 1100px, /play uses one viewport with fixed HUD/footer rows and a flexible board row. Winter watch and context panels scroll independently and contain scroll chaining. Campaign settings open above the footer rather than increasing page height. Mobile retains normal page scrolling. scripts/qa/check-play-scroll-browser.mjs verifies a long expanded Chronicle, page height, board wheel zoom without page movement, sidebar scrolling, open settings and mobile overflow. This check and the 12 existing browser checks pass.

House salvage: both gameplay screens expose SalvageBuilding for houses. It refunds floor(investedMaterials / 2), including paid upgrades and excluding free Farmyard conversion. Occupants move to their household tent, assigned livestock becomes unassigned, and the building/residence are removed with a factual BuildingSalvaged Chronicle event. Repeated salvage is rejected. /play keeps ship actions only in the ship context panel, removing duplicate footer controls. Validation: 118 tests, TypeScript and production build pass; all 13 player browser checks and the scroll regression pass.
