# Simulation-to-Fjord bridge — implementation review

Date: 2026-10-10. Issue #87. Branch: codex/simulation-fjord-bridge-implementation.

## Scope and visual contract

The new /fjord-play route renders the actual player campaign through the shared GameplaySession and existing Fjord environment factory. It starts paused and presents canonical residents, household tents, permanent building levels, active Farmyards, cattle stages/sex and the founding longship. It has time controls, identity selection, collapsible diagnostics, explicit shared save/load and exact Fjord import/export. Context-panel gameplay commands belong to #88; they are exercised here through real core commands and existing Gameplay Lab saves.

Tents now have grass only. Soil appears when a permanent home replaces its tent, with deterministic dry walking paths between permanent homes. Salvage removes that home's soil and connections. The canonical snapshot, RNG, geography triangles and original biome fields remain unchanged by these visual updates.

## Automated validation

| Check | Result |
| --- | --- |
| Public projection and campaign adapter | 10 tests passed: canonical founding identities, stable physical buildings, upgrades and Farmyard changes, renderer-independent replay, exact geography/layout save/load, atomic invalid-import rejection, founding parcels across seeds 17/32/91, canonical death/slaughter/salvage, stored source mooring, grass/soil transition and dry connecting paths and consumer isolation |
| Existing world generation, regional ground, terrain treatment and tent contracts | 16 tests passed after the ground integration |
| Full local suite before the final grass/path and consumer-isolation tests | 493 tests: 492 passed, 0 failed, 1 existing conditional fixture skip. The optional actual r3 neutral/female/Giant/compound/child GLB portability fixture is absent locally; no validation was changed or bypassed |
| Character validation including explicit Lab previews | Passed: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules, Idle/Walk/Run + World |
| TypeScript and production build | Passed; existing large-chunk advisory remains |
| Formatting | New TypeScript was normalized with the existing TypeScript printer and inspected manually. No repository formatter/check is configured; none was added. git diff --check passed |

TDD used the owner-approved public projection/campaign and browser boundaries. Each new grass/soil and connecting-path behavior was first observed failing through the public projection, then implemented and re-run green.

## Browser evidence

The reproducible browser harness is scripts/qa/check-fjord-bridge.mjs. It uses real Simulation Core commands and saved campaign JSON, source assets through the HTTP boundary, and rendered identity/bounds output. Asset fault injection aborts GLB, manifest and texture requests instead of stubbing simulation internals.

All 11 browser checks passed with zero unhandled JavaScript errors. Results are recorded in [browser.json](browser.json). Desktop is 1280×800 and the tablet-sized viewport is 1024×768. The software renderer is Chromium/SwiftShader, Low quality, DPR 1. Startup elapsed time is diagnostic only; no frame-time distribution, FPS guarantee or physical iPad measurement is claimed.

- [Founding campaign: grass-only tents](founding-desktop.png)
- [Canonical houses, Farmyard and connecting soil/path](canonical-houses-farmyard.png)
- [Tablet-sized viewport](ipad-viewport.png)
- [All source assets unavailable: explicit metric placeholders](missing-assets-fallback.png)

## Practical limits

Prepared house and Terrain source files are developer-generated assets outside Git. The complete local checkout supplies them through the existing pipeline; a checkout without them receives declared placeholders. The public prepared human/cattle/tent sources remain reused. This change does not add an asset production pipeline.

FarmHomestead's authored yard is too large for the reserved parcel, so level 1 explicitly uses the nearest safe FarmHut yard. Higher Farmyard levels retain their actual normal dwelling and a lightweight yard marker. Unique human DNA appearance, clothing and animation remain excluded; all residents use the existing shared static body and canonical age/sex metadata.

Screenshots confirm grass/soil behavior and real source reuse; this is a technical bridge rather than approval of the complete Northstar art/composition. Physical iPad Safari/WebGL and final artistic approval remain owner checks. Millisecond thresholds on this old laptop are diagnostic, not merge gates.
