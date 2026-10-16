# Clan Discovery & Fog of War — #147

Status: opt-in first slice of #146; technical review ready after green current-head CI. Default rollout and physical-mobile/owner visual acceptance remain pending. [Review gallery](review.html) · [Contract](../../CLAN-DISCOVERY-V04A.md).

## Canonical result

The 8 m prototype ties explored/current masks to one canonical world identity and clan. Founding settlement/landing observations use the existing terrain-triangle LOS; camera, quality, light/weather fog and the loading fly-in do not reveal territory. The public read model is frozen and clan-scoped. Foreign marker fields are explicitly selected and require current visibility; old Scouted/Surveyed intelligence is separate. Existing four-direction campaigns retain their state and mission semantics. No Core clocks, RNG, stocks, events or published story text are changed by binding discovery.

47 relevant public contract tests passed, including eight new discovery/save/session tests; TypeScript, production build and complete character/Lab asset validation passed. The production browser check covers exact mask reload, orbit/zoom, 390 px touch selection and both quality controls. The first new browser test failed before opt-in wiring; public validation tests failed before their corresponding guards. The actual foreground pixel test failed before native depth testing was restored, and the draw-call test failed before the unnecessary transparent second pass was removed.

## Ten fixed geography seeds

These are ten structural generator fixtures, not ten new production campaign layouts: production still selects its approved two-island pool. Rejected generator seeds were retained, not replaced or made valid by weakening site rules. The six accepted site pairs all keep the reserved rival centre unknown. The four rejected fixtures have no reserved rival.

| Seed | Inherited site result | Known cells | Initial observation ms | Discovery JSON bytes | Rival centre |
| --- | --- | --- | --- | --- | --- |
| 17 | Existing rejection | 4.30% | 46.95 | 5305 | No reserved rival |
| 42 | PASS | 4.88% | 35.23 | 5306 | unknown |
| 91 | Existing rejection | 5.34% | 48.12 | 5306 | No reserved rival |
| 1983 | PASS | 4.57% | 34.50 | 5308 | unknown |
| 1337 | Existing rejection | 5.78% | 28.03 | 5308 | No reserved rival |
| 18 | PASS | 5.54% | 46.91 | 5306 | unknown |
| 7 | PASS | 4.93% | 30.87 | 5305 | unknown |
| 73 | Existing rejection | 5.53% | 28.34 | 5306 | No reserved rival |
| 256 | PASS | 5.55% | 32.71 | 5307 | unknown |
| 65537 | PASS | 4.77% | 28.16 | 5309 | unknown |

The JSON numbers include metadata and hexadecimal encoding. The two bitsets themselves total 2,500 raw bytes at 8 m, not 2,500 encoded JSON bytes. The saved extension is approximately 5.3 kB per one-clan world. The measured 4/8/16 m alternatives and exact timings are retained in [matrix.json](matrix.json). CPU timings are individual diagnostic calls, not distributions or physical-iOS measurements.

## Render cost

Native alphaMap, no bespoke shader or offscreen multipass. The steady layer adds one draw call and 320,008 triangles over the unchanged terrain; an active 0.8 s fade can temporarily add one further call. The geometry is 7,056,436 attribute/index bytes; each alpha texture is 646,416 bytes. A fade shares the geometry and temporarily retains the previous texture/material. These are retained typed-array sizes, excluding transient builder arrays, process overhead and GPU copies. No full-grid computation runs every frame.

The isolated, undecorated Three.js fixture used 1024×768 desktop Edge with 60 raw frame samples per condition/seed (2,400 samples total), Low pixel ratio 1 and Standard 1.5. This isolates the fog workload; it is not the full settlement or physical Safari. Submit time measures CPU render submission, not completed GPU time. RAF intervals include scheduling/vsync. Background desktop activity was uncontrolled; raw samples and source hashes are preserved in [render-matrix.json](render-matrix.json).

| Quality | Fog | Draw calls | Triangles | Median submit ms | P95 RAF interval ms |
| --- | --- | --- | --- | --- | --- |
| low | Off | 1 | 320,000 | 0.20 | 17.30 |
| low | On | 2 | 640,008 | 0.20 | 17.20 |
| standard | Off | 1 | 320,000 | 0.20 | 17.20 |
| standard | On | 2 | 640,008 | 0.20 | 17.20 |

The real 390 px game has separate raw RAF samples and its existing renderer diagnostics in [browser.json](browser.json). Emulation is not a physical iPhone/iPad test. Do not infer a mobile performance guarantee from this desktop run.

## Confirmed observer proof

A deliberately labeled developer fixture traverses 25 confirmed samples of the existing seed-18 canonical navigation connection. It does not dispatch a Core mission, charge provisions or pretend that #148 is implemented. Observed cells commit immediately; successive masks reveal progressively rather than at route planning. Interrupted fades preserve visual continuity. Coverage grows from 554 to 1698 cells. Departing retains 1698 mapped cells while removing the live rival fixture. Native depth testing preserves the known red foreground box (actual pixel [255,11,8,255]), rather than allowing a distant fog surface to paint over it.

Per-step browser diagnostics are 28.3–55.4 ms for canonical observation and 1.7–63.2 ms for mask presentation/reconciliation in this fixture. These synchronous update costs are separate from steady render cost; they must be budgeted in the real #148 travel integration before default rollout. No per-frame recomputation is used. [Raw observations](observer-route.json).

## Scope and remaining review

Unknown nature roots and standing-tree targets are excluded from production scene assembly. A future allowed discovery reconciles scenery while retaining cleared plots. Ordinary ambient residents cannot reveal terrain and stay on mapped ground. The current game only instantiates the player's own entities: a living physical rival is #149. The sanitized marker/label/picking contract is proven with fixtures; this report does not claim that an unimplemented rival scene has been end-to-end tested. No cryptographic anti-cheat secrecy is claimed.

Day, dusk/night, atmospheric fog on/off, full-map and oblique views are included for all ten seeds. Terrain edges remain recognizably based on an 8 m grid at high global zoom despite the inward feather. This is a visual prototype, not owner-approved final fog art. The whole island remains allowed in the loader preview, without CPU sites or resource intelligence.

No physical-mobile coverage is claimed for #147; the owner's earlier 10 s/2 min return tests concerned #161. Default activation is deferred until the first playable #147+#148 exploration milestone and owner review. Expedition UI/travel (#148), the real rival (#149), spatial missions (#150) and final epic QA (#151) remain open.
