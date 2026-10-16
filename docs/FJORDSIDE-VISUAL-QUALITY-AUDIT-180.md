# Fjordside visual quality audit and proposed roadmap

Audit date: 16 October 2026. Issue: [#180](https://github.com/sidesliders1983/Pillagers/issues/180). Status: **audit delivered for review; implementation plan and visual direction proposed, not approved**.

Fjordside can move substantially closer to the supplied settlement reference by improving the presentation of systems it already has. The strongest early opportunities are camera framing, directional light and contact shadows, coherent foliage/ground materials, and readable terrain transitions. A new terrain, clothing or rendering framework is unnecessary. Canonical simulation CPU growth deserves its own early investigation before adding visual workload.

The user subsequently discontinued the **2D environment**. `/play` is therefore excluded from the implementation roadmap. Its captured shortcomings remain diagnostic evidence only. Preserve the renderer-independent Simulation Core, its tests and useful development tools; do not interpret discontinuing the 2D presentation as abandoning simulation. No routes or code have been removed in this audit.

The user also limited this pass to **desktop UI**. Mobile UI design and implementation belong to [issue #182](https://github.com/sidesliders1983/Pillagers/issues/182), the separate landscape-first mobile reference task. Share tokens and data contracts where useful, but do not duplicate its sheets, gestures, safe-area layouts or mobile mockups here. Shared 3D changes must still respect existing mobile compatibility and performance.

## Scope and evidence

Four coordinated readers covered seven responsibilities: Art Direction and Assets/Characters; Terrain/Environment and World Composition; Lighting/Atmosphere and Performance; UI/UX and integration. All specialist work was read-only in the shared checkout, so there were no concurrent file edits. Future implementation requires separate branches/worktrees and explicit ownership as requested in the issue.

Sources are current implementation, existing project contracts, the supplied Viking settlement image, historical QA and a fresh browser inspection. The supplied settlement `Foto 1.jpg` is distinct from the similarly named character-sheet reference mentioned in the character style guide.

For independent review, the supplied [target settlement reference](qa/visual-quality-180/target-settlement-reference.jpg) is included alongside the observed screenshots. Read this audit against the [audited source snapshot](https://github.com/sidesliders1983/Pillagers/tree/9b11ad0d891d1b26131a68506f016c181ef9cd21); `main` has advanced since that snapshot. Findings require revalidation against newer implementations before turning them into implementation tasks.

The inspected checkout is `9b11ad0d891d1b26131a68506f016c181ef9cd21`, plus pre-existing local changes to `README.md`, `docs/CHARACTER-MODULES-V2-PROPOSAL.md`, the untracked human manifest and tunnel helper. These inputs were left untouched. Source observations below apply to this checkout, not every other active branch.

Current browser evidence is retained in [observations](qa/visual-quality-180/observation.json), [3D desktop](qa/visual-quality-180/world-seed17-desktop.png), [3D narrow viewport](qa/visual-quality-180/world-seed17-narrow.png), [discontinued 2D desktop](qa/visual-quality-180/play-desktop.png) and [discontinued 2D narrow viewport](qa/visual-quality-180/play-narrow.png). The existing server on port 5180 served a different archived build and was excluded. These accepted captures came from a separate current-checkout Vite server on port 5182.

Evidence categories:

- **Observed now:** seed 17, generated Fjord, EZ-Tree, Standard, ten Meshy residents, day, Village camera, effects time 0 and manual pause. Desktop 1400×900 and narrow viewport 390×844, DPR 1; Edge 155 headless on Intel HD Graphics 630. No page errors occurred. This is viewport resizing, not a physical-phone test.
- **Source verified:** generation, saves, geometry, materials, placement, lighting, character composition and simulation update paths described below.
- **Measured now:** bounded Node CPU diagnostics and a single browser renderer-stat snapshot. Neither is a release benchmark or GPU profile.
- **Historical:** October QA galleries and hardware reports retain their original rules, code and limitations. Generated startup is now active even where older reports describe staging or Reference startup. No historical report was rewritten.
- **Proposed:** all Phase A tasks, budgets, visual scores and golden-scene extensions below await review. This pass did not implement a golden harness or claim visual acceptance.

## Proposed shared visual direction

Use the supplied reference for relationships that generalize across worlds: warm timber and ochre roofs against cool rock/water/shadow; broad readable landforms; dark coherent conifer masses; clustered activity around entrances and yards; and a clear foreground, settlement middle distance and fjord backdrop. Preserve cultural character names and English interface text.

The image's early-winter lighting is an anchor case, not a permanent snow treatment for every season. Spring and summer need equally legible paths, grass, shore and building foundations. Do not reproduce its resource labels, objectives, population or building functions unless canonical gameplay provides them.

| Visual decision | Proposed direction | Existing contract to preserve |
| --- | --- | --- |
| Shape hierarchy | Roof groups and terrain planes first; secondary vegetation masses; fine detail concentrated around activity | Authored Meshy buildings, canonical terrain triangles and modular characters |
| Palette | Restrained foliage, cool rock/fjord, warm timber; a small range of rust/ochre clothing accents | Source maps and per-role material ownership; no global desaturation override |
| Lighting | Warm directional planes, cool readable shadows, grounded feet/foundations | One directional shadow source; existing hemisphere and unshadowed hearth |
| Materials | Comparable detail scale at normal RTS distance; quieter distant rock | Retain approved texture sources and authored materials; no blanket vertex-colour conversion |
| Composition | Readable communal/building/shore groups with open routes and meaningful negative space | Current parcel geometry, navigation and saved placement contracts |
| Characters | Recognizable clothed silhouettes where accepted assets support them; identity readable through selection | DNA, exact-body bindings, accepted-only composition, source hashes and native rigs |
| Desktop UI | Quiet scene, legible selected entity, restrained panels and clear pointer/keyboard interaction | Existing selection and focus behavior; reusable tokens for #182; no fabricated economy/combat UI |

The [low-poly style guide](PILLAGERS-LOW-POLY-STYLE-GUIDE.md) explicitly concerns characters. Its muted palette and broad-facet goals inform the environment, but its character material rules do not require replacing textured houses or terrain. This proposed environment companion should be agreed before parallel material work.

## Consolidated audit by responsibility

Each lane lists five priority gaps. The following implementation table supplies effort, risk, dependencies and ownership for the corresponding proposals.

### 1. Art direction

1. **Mixed detail scale:** fine pine foliage, rounded bright bushes, textured mountains and warm detailed houses compete. Harmonize large shapes and palette before increasing object counts.
2. **Weak focal hierarchy:** the current Village image contains a broad pale clearing and isolated buildings; it does not layer the shore and settlement like the reference. Test framing first.
3. **Flat value separation:** terrain, roofs and light fill occupy similar bright values. Tune lighting and materials together with neutral comparison views.
4. **No single environment review contract:** character style guidance and individual environment pilots exist, but do not yet establish accepted integrated visual direction. Agree the proposed companion above.
5. **Seasonal intent needs explicit review:** a warm winter reference cannot certify summer or transition states. Use one cross-season scorecard, never one hero screenshot.

Relevant sources: [AssetManager](../src/core/AssetManager.ts), lines 34–74 and 89–103; [worldConfig](../src/config/worldConfig.ts); [current integration contract](FJORDSIDE-INTEGRATION.md); [historical integration review](qa/fjordside-integration-v02/report.md).

### 2. Terrain and environment

1. **Ground transitions lack broad, coherent shapes.** Four native terrain layers and linear-filtered masks already exist. Sand/rock use binary biome membership on the 2m field; wear supplies the path layer. Pilot continuous presentation masks from existing fields without changing canonical heights/navigation.
2. **Mountain texture competes with settlement detail.** Reduce excessive contrast/repetition through existing material settings and distance/framing comparisons. A texture replacement or geometry rewrite is not the first step.
3. **Coast readability varies with view.** Actual coast extraction, dry approaches and reference water already exist. Review shore/rock/path transitions and the water horizon together; do not assume missing coastline generation.
4. **Vegetation styles are inconsistent.** Fourteen approved nature roles, source-aware footprints, slope/dry checks and instancing already exist. Tune their material relationships before density.
5. **Seasonal recolouring can erase identity.** Ground/foliage snow mixing exists; it is not accumulated roof/prop snow. Preserve visible soil/path/foundation differences in winter instead of whitening everything alike.

Relevant sources: [GenerateWorld](../src/world-generation/GenerateWorld.ts), lines 49–78; [BlueprintTerrain](../src/world/BlueprintTerrain.ts), lines 18–34 and 46–100; [WorldGroundMaterials](../src/world/WorldGroundMaterials.ts), lines 8–36; [PlanNature](../src/world-generation/PlanNature.ts), lines 18–103; [SeasonTint](../src/world/SeasonTint.ts), lines 11–45; [water contract](FJORDSIDE-WATER.md).

The terrain is a 91×91 canonical height field, 2m spacing, reused for navigation and grounding. Current layers render over the full terrain in four material groups: measure overdraw before increasing masks, resolution or passes. Standard includes normal maps; Low omits them. Instancing saves submissions but does not remove pine triangle/shadow cost.

### 3. Lighting and atmosphere

1. **Directional form is subdued.** Production direct intensity is 1.55 with hemisphere intensity 2.45 and exposure 1.05. The existing Environment Lab low-sun candidate is a better starting experiment than a new lighting architecture: 20° front sun, direct 2.8, fill 1.0, exposure 1.05, HDR off. It is not approved for production.
2. **Contact detail suffers from broad shadow coverage.** Generated worlds use a ±130m shadow volume, versus ±50m for Reference. That is about 12.7cm/25.4cm per texel at 2048/1024 before projection effects. Study stable receiver/caster coverage and snapping within the current single-map design; watch for popping or excluded shadows.
3. **Fog obscures contextual depth in the current view.** Linear fog already exists, including water integration. Tune foreground clarity and distant layering together with camera/backdrop composition.
4. **Seasonal light and materials need joint acceptance.** Existing seasonal presets and snow uniforms are useful foundations. Include exact seasonal phases and transition boundaries.
5. **Expensive lighting pilots remain unqualified.** Historical HD 630 runs show HDR can worsen frame intervals, especially in forest views. Native contact/material tuning should precede AO, bloom, reflections, volumetrics or extra shadow sources.

Relevant sources: [Renderer](../src/core/Renderer.ts), line 3; [WorldLighting](../src/core/WorldLighting.ts), lines 9–40 and 60–79; [lightingConfig](../src/config/lightingConfig.ts); [timeVisualization](../src/config/timeVisualization.ts); [LabLighting](../src/environment-lab/LabLighting.ts), lines 10–33; [Northstar report](qa/northstar-lighting/report.md) and [historical hardware costs](qa/northstar-lighting/hardware-report.md).

### 4. World composition

1. **Parcel spacing creates an open display of buildings.** Six existing Meshy parcels are translated as a fixed group, preserving rotations, bounds and farmyards. Use camera/grouping studies now; defer a new expansion-aware layout grammar.
2. **Props do not always read as contextual clusters.** Twenty original props already have preferred offsets and measured-bounds placement. Nearest-feasible placement does not explicitly optimize a relationship to an entrance, working yard or related prop.
3. **Review framing is inconsistent across seeds.** Village/Shore are settlement-relative; Overlook remains absolute. A bounds-aware framing proposal is low risk and reusable.
4. **Relief lacks the reference's layered fjord silhouettes.** Current relief is a bounded elevation field plus noise, not absent terrain. First study existing cliffs/framing/fog; geography changes require a separate contract.
5. **Activity cannot yet represent the complete canonical settlement.** The 3D preview's fixed residents/annual cycle and the canonical campaign are separate. Decorative jobs, population growth, stockpiles and combat aftermath must consume stable simulation facts rather than invent them.

Relevant sources: [SettlementLayout](../src/world/SettlementLayout.ts), lines 3–11; [PlanSettlement](../src/world-generation/PlanSettlement.ts), lines 47–51; [PlaceSettlement](../src/world/PlaceSettlement.ts); [WorldAttachments](../src/world/WorldAttachments.ts), lines 21–118; [Game](../src/core/Game.ts), lines 121–136; [gameplay-first architecture](gameplay/GAMEPLAY-FIRST-ARCHITECTURE.md).

**Compatibility boundary:** `WorldFactory.ts:41–42` expects twenty attachments and `authored-props-v1`; lines 89–90 recompute and compare saved placements. Nature placements and navigation also live in stored blueprints. Changes to `PlanNature`, `PlanSettlement`, heights or attachment placement are not presentation-only. Approve an explicit versioning/loading strategy before changing them; old worlds must not silently regenerate or move buildings/props.

### 5. Assets and characters

1. **Bare residents are a real presentation gap.** Meshy is the production default; `createWorld` uses LOD2 and the factory default selects no hair, beard, outfit or equipment. This is not a missing attachment framework.
2. **Preview modules are not accepted artwork.** Native fitting, exact-body compatibility, coverage restoration, sockets and source validation exist. Catalog modules remain previews; the style guide explicitly defers their artwork. Review a minimal outfit slice separately before any promotion.
3. **Perceived scale needs production-camera evidence.** DNA profiles produce roughly 1.32–1.52m adults, while the Environment Lab reference person is 1.8m. Compare metre rulers and fixed projection; do not enlarge DNA heights to imitate screenshot pixel sizes.
4. **Role-specific material differences need an inventory.** Authored housing is intentionally treated differently from legacy scenery. Preserve source bytes and existing import/optimization scripts; do not globally reset roughness/metalness from a scalar alone.
5. **Crowd cost/readability is not established.** Fixed LOD2 ignores distance, while texture and animation costs remain. Measure actual cost at ten/forty residents before changing LOD or texture policy.

Relevant sources: [MeshyHuman](../src/characters/MeshyHuman.ts), lines 20–52 and 201–218; [CharacterPresentation](../src/characters/CharacterPresentation.ts), lines 37–43; [MeshyModuleCatalog](../src/characters/MeshyModuleCatalog.ts); [MeshyModuleRuntime](../src/characters/MeshyModuleRuntime.ts); [UniversalHumanProfile](../src/characters/UniversalHumanProfile.ts), line 36; [native fitting evidence](qa/meshy-neck-fit/REPORT.md); [style guide](PILLAGERS-LOW-POLY-STYLE-GUIDE.md), lines 249–251.

Attack, Death, farming and social animation clips already exist. The gap is production gameplay integration and qualification, not missing animation acquisition. Existing sampled adult fitting success does not establish child/elder/all-motion approval.

### 6. UI and UX

The remaining UI work concerns **desktop 3D Fjordside only**. The reference's screen-wide resource/build/objective panels should not be copied into the preview before the corresponding canonical gameplay integration is ready. Mobile layout findings are handed to #182 and are not Phase A desktop tasks.

1. **Panel language differs from the reference.** The world uses pale cream panels; the target uses quiet charcoal surfaces and warm highlights. Propose shared colour, spacing and type tokens, with one selected-character example; no final HUD redesign yet.
2. **Small text competes with the scene.** World status/eyebrows use 8–11px text. Test 14px primary content, 12px secondary content and contrasting backing surfaces at real display sizes.
3. **Selection needs stronger desktop hierarchy.** The existing profile follows its resident and clamps to the viewport. Compare an anchored card with a stable side panel at 1280×720, 1400×900 and 1920×1080; keep the selected person visible and retain dismissal and focus behavior. Show current identity/traits first; future task/health/mood fields remain clearly marked concepts until supplied by gameplay.
4. **Scene and diagnostics need separate emphasis.** The persistent FPS/calendar presentation and small world status compete with the cinematic view. Propose a player-facing header and a separate development display, preserving diagnostic access and keyboard/mouse pan, zoom, orbit and selection.
5. **Future gameplay information must have a data contract.** Keep technical diagnostics under development tools. Reuse canonical identity/actions later; do not show invented health/experience/resources to imitate the reference.

Relevant sources: [style.css](../src/style.css), lines 1–12; [WorldHUD](../src/ui/WorldHUD.ts); [CharacterProfileCard](../src/ui/CharacterProfileCard.ts), lines 18–103; [RTSCameraController](../src/camera/RTSCameraController.ts); [TouchGestures](../src/camera/TouchGestures.ts); [world UI contract](WORLD-UI-V04.md).

The discontinued 2D board avoided horizontal overflow at 390px, but its default fitted resident targets measured about 4.9×8.2px. Its Start/+1 Winter buttons were about 39.7px high. This is diagnostic evidence only: do not fix the retired presentation or treat it as the mobile design baseline for #182. The narrow 3D capture also clips foreground context; #182 should review its own landscape-first framing. No physical touch or mobile-GPU certification was performed.

### 7. Performance

1. **Canonical command cost grows with history.** `applyCommand` validates input, clones the whole state and validates the result; validation walks ordered events and recursively checks neighboring clan states. Bounded measurements below show substantial long-run growth.
2. **Availability can execute gameplay work.** `canApplyCommand` runs and discards the real command, including an entire Winter for `AdvanceWinter`. This API remains relevant to future 3D controls even though `/play` is discontinued. Profile it and propose pure equivalent queries without weakening authoritative validation.
3. **Simulation and rendering need separate profiles.** `/` has fixed 10/40 slots and `AnnualCycle`; canonical campaign mechanics live elsewhere. Neighboring target clans already tick mechanically. Remaining CPU-clan strategy/combat stability must not be described as absent neighbor simulation.
4. **Render costs need pass-aware accounting.** Existing instancing and DPR/shadow tiers help; production terrain has four passes and detailed pines remain costly. Current `renderer.info` snapshots are not the shadow-inclusive protocol used by the historical lighting profiler. Do not compare those counters directly.
5. **Long-run and physical-mobile baselines remain missing for this head.** Profile movement/social pair checks, animation/skeleton updates, world effects, render submission, allocation/GC and resource lifetime independently. Attribute growth before optimizing.

Relevant sources: [SimulationCore](../src/simulation/SimulationCore.ts), lines 79–113 and 184–200; [WorldExpeditions](../src/simulation/WorldExpeditions.ts), lines 45–67 and 111–113; [GameplaySession](../src/gameplay-lab/GameplaySession.ts), line 11; [MovementSystem](../src/systems/MovementSystem.ts), lines 41–42 and 76–83; [Game](../src/core/Game.ts), lines 196–239; [lighting profiler](../scripts/qa/profile-northstar-lighting.mjs).

## Current exploratory performance evidence

Node v24.19.0 used the actual TypeScript source through `scripts/load-typescript.mjs`. No configuration, gameplay rules or persisted state changed. Samples ran with other local activity and without a browser flamegraph; treat them as diagnostic direction, not target-device budgets.

Default campaign seed 32, advanced with one `advanceWinter` per year. Counts include the home and two target clans. Each clone/tick operation used three warmups and fifteen samples; command-availability measurements used three warmups and five samples. Median and p95 use sorted samples at indices `floor(n*.5)` and `floor(n*.95)`.

| Winter | Events / personas across clans | Serialized JSON bytes | Clone median | One-tick command median / p95 | AdvanceWinter availability median |
| --- | ---: | ---: | ---: | ---: | ---: |
| 800 | 15 / 30 | 52,642 | 1.268ms | 5.503 / 14.455ms | 119.568ms |
| 805 | 622 / 42 | 230,794 | 9.586ms | 12.885 / 19.201ms | 92.955ms |
| 810 | 1,054 / 43 | 344,638 | 9.070ms | 11.096 / 15.729ms | 156.088ms |
| 825 | 3,231 / 44 | 933,482 | 40.004ms | 34.459 / 51.338ms | 271.106ms |
| 850 | 11,775 / 51 | 3,313,526 | 116.190ms | 102.191 / 119.644ms | 521.708ms |

Population and gameplay evolve in this experiment. A second experiment isolates history size: clone the same seed-32 founding state; append 0/1,000/10,000 ordered inert `AuditSyntheticHistory` events to **each** clan, with sequential `event-N` IDs at the clan's current time. Test two warmups/nine samples of `structuredClone`, `applyCommand({type:'AdvanceTicks',ticks:1})`, and `stepMechanicsTick` on a separate mutable scratch clone.

| Extra events per clan | Clone median | One-tick command median | Direct scratch mechanics tick median |
| --- | ---: | ---: | ---: |
| 0 | 1.600ms | 6.308ms | 0.610ms |
| 1,000 | 12.577ms | 19.041ms | 0.343ms |
| 10,000 | 114.756ms | 114.585ms | 0.229ms |

The scratch mechanics measurement advances only eleven non-boundary ticks and excludes command cloning/validation. Its decreasing times reflect noise/warmup, not improving mechanics. The combined evidence strongly supports investigating history copying and validation; it does not establish their exact percentage of browser CPU. Preserve all history, deterministic event ordering, input immutability and validation guarantees.

The current 3D paused dev snapshot reported 50 calls, 849,331 triangles, 36 geometries and 58 textures. Its last short-window mean was 91.2ms; the screenshot FPS overlay represents a different sample. No warmup/repeated timing protocol was applied, and calls are not certified to include shadows. These numbers cannot establish an animated/GPU/mobile baseline.

Historical [Northstar hardware runs](qa/northstar-lighting/hardware-report.md) used 36 matched runs and explicit shadow-inclusive accounting on HD 630. HDR increased frame intervals in several cases. The [integration report](qa/fjordside-integration-v02/report.md) explicitly clarifies that its timings were **paused**. Preserve these records without presenting them as current animated measurements.

## Proposed Phase A work and implementation order

Effort estimates describe scope, not committed dates: S is roughly 1–2 focused developer days, M 3–5, L more than a week. Measurement findings can change estimates. Each row is an independent follow-up issue proposal; none has been created or implemented.

| Order / suggested issue title | Concrete proposal and principal files | Impact / effort / risk | Dependencies and runtime constraint |
| --- | --- | --- | --- |
| A0 — Agree Fjordside environment direction | Agree palette/shape/season rubric above and compatibility boundaries; link current style/integration contracts | High enabling / S / low | Integration lead owns shared decisions; no runtime cost |
| A1 — Deterministic golden scenes and current performance baseline | Extend `capture-fjordside-integration.mjs`, `ReviewSeeds.ts` and existing year-clock test approach; record manifests, states and subsystem timings | High enabling / M / medium | A0; fixed hardware/protocol; no production gameplay time changes |
| A2 — Profile campaign history and command overhead | Profile clone/validation/availability at fixed early/mid/late saves; propose pure availability/read projections only where measured | High responsiveness / M, optimization TBD / medium | A1; retain canonical validation/events/replay; no 2D UI maintenance |
| A3 — Seed-aware 3D camera framing | Settlement/harbor-relative default and review views in `Game.ts`, `RTSCameraController.ts`, `worldConfig.ts`; desktop scene occupancy and free exploration | High / S / low | A1; no geometry/nav changes; zero added rendering work; mobile framing belongs to #182 |
| A4 — Evaluate existing low-sun lighting and shadow contact | Matched pilot in `WorldLighting.ts`, `worldConfig.ts`, `lightingConfig.ts`; stable single-map receiver/caster coverage | High / M / medium | A1+A3; pair with material owner; retain one shadow map and measured tier budgets |
| A5 — Harmonize existing materials across seasons | Muted nature, quieter rock, warm house identity using `AssetManager.ts`, `WorldGroundMaterials.ts`, `SeasonTint.ts`, time presets | High / M / low–medium | A0+A1; evaluate with A4; source maps and instancing retained; no extra passes |
| A6 — Refine native ground transition masks | Continuous presentation weights from existing coast/wear/slope in `BlueprintTerrain.ts` and relevant ground config | High / M / medium | A1+A5; canonical geometry/biomes/nav unchanged; keep four passes unless a measured proposal wins |
| A7 — Character scale and accepted-outfit qualification | Production metre/camera matrix; review one minimal native outfit's appearance and supported ages/motions through existing factory/catalog | Medium–high / M / medium | A1+A4; artwork/preview acceptance first; extra texture/draw/animation costs measured at 10/40 |
| A8 — Desktop 3D UI foundations and selection hierarchy | Theme/type/spacing tokens, desktop header and selected-profile proposal in `style.css`, `WorldHUD.ts`, `CharacterProfileCard.ts`; pointer/keyboard flows | Medium–high / S–M / low–medium | A0+A3; English text and focus preserved; no final gameplay HUD; share tokens with #182 without implementing mobile layouts |
| A9 — Versioned procedural dressing and backdrop pilot | Semantic grouping of existing props/nature and silhouette studies using `WorldAttachments.ts`, `PlanNature.ts` and current cliff sources | Medium–high / M–L / medium–high | Conditional after A3–A6 review; explicit saved-world compatibility first; bounded density and navigation gates |

A1 and the diagnostic portion of A2 should run first. After baseline, camera and UI foundations can proceed independently. A4 and A5 require a shared review before either becomes a default. Ground masks follow that agreed light/material balance. A7 can run alongside environment work but is not a shortcut around preview-artwork acceptance. A9 is optional Alpha scope; defer it if compatibility or cost exceeds the agreed limit.

Potential optimizations such as cached projections, structural sharing, history storage separation or animation throttling need specific profiles and equivalence tests. They are investigation options, not authorization for a simulation rewrite. Never prune event history or remove validation merely to improve a benchmark.

## Golden-scene benchmark specification

Extend the existing capture workflow. Do not introduce a second scene generator or hand-place a special settlement. Freeze real accepted production outputs and test newly generated outputs as separate cases.

1. **Manifest:** commit plus dirty source hashes, generator/attachment/schema versions, full exported geography bytes and SHA-256, asset/body/module hashes, browser/GPU/OS, viewport, DPR, ground tier, conifer source and quality at initial load.
2. **Presentation state:** exact camera position/target/FOV, resident DNA/positions/headings/animation phase and fixed update count, annual year/progress, visualization mode, effects time and pause state. Record light/shadow settings. Geography saves currently do not include resident or calendar state.
3. **Clock control:** reuse the test-only clock injection in `scripts/world-year-cycle-smoke.cjs`, then drive a fixed update count and actor state through a bounded test harness. Current effects scrub only sets effect time and pauses; it does **not** set season/year progress. Do not change production time semantics for screenshots.
4. **Season anchors:** progress 0 Winter, .25 Spring, .5 Summer, .75 Autumn, plus an early-winter transition at .875. Keep native day/night views separate from seasonal visualization; the present modes are mutually exclusive. Combined season/night fixtures would be a harness extension, not an existing UI capability.
5. **Views:** settlement-relative Village and Shore, diagnostic Overlook, and fixed close character/contact crops. Include ordinary Home view and a camera sweep so improvements cannot depend on one flattering angle.
6. **Matrix:** use all ten `ReviewSeeds.ts` entries across fjord/coastal-valley/rocky-inlet, not replacement seeds selected after failure. Full gate: ten seeds × five seasonal phases × two tiers × three views = 300 captures; add native night cases on anchor seeds 17/91/42. Per-PR smoke: 17/91/42 × Winter/Summer × two tiers × Village/Shore = 24 captures. Desktop UI reviews use 1280×720, 1400×900 and 1920×1080. Coordinate physical-mobile render-cost checks for shared effects with #182; mobile UI acceptance remains there.
7. **States:** current 3D residents 10 and stress 40, annual replacement/Continue and social-motion states. Separately retain canonical campaign saves at Winters 800/825/850, unchanged population/history fixtures and recorded command streams. Later map those states to the 3D presentation through the agreed gameplay integration; do not pretend that bridge exists today.
8. **Output:** matched before/after screenshots, exact fixture manifests, raw timing samples, error/resource reports and explicit human verdicts. Two consecutive captures must reproduce state hashes/transforms and camera values. Pixel tolerance should be calibrated on the pinned browser/GPU; cross-device exact pixels are not a useful gate.

## Proposed acceptance criteria

These are reviewable targets, not claims of compliance. Ratify hardware and tolerances in A1 before merging visual work.

| Area | Gate |
| --- | --- |
| Visual coherence | Score 0–4 with anchored examples for shape/palette coherence, directional form, contact, depth/composition and seasonal readability. Anchor fixtures must reach ≥3 in every category; full-matrix category medians ≥3 and no individual score <2. Retain and fix every failed seed; owner review determines acceptance. |
| Cross-view quality | Main building/communal/shore relationships remain identifiable in Home/Village/Shore; no persistent floating roots/foundations, detached foot shadows, new acne or obvious shadow popping during camera sweep. Diagnostic Overlook remains navigable. |
| Physical correctness | Preserve current tests and suitability values: six connected building approaches, foundation slope ≤.12, foundation elevation ≥.25m, walking elevation ≥.20m, resident clearance .65m, connected clearing ≥1,500m². Grounding/raycast disagreement remains within existing test tolerance .00001m. These are existing rules, not balance changes. |
| Simulation behavior | Same seed and command stream produce identical canonical outcomes, RNG state and ordered history with renderer disabled/enabled. Preserve input immutability, split-tick equivalence, pause/no-offline progression and save/load behavior. CPU fixes must not skip validation guarantees. |
| Saves and source assets | Old blueprints/attachment saves load without moving content; any new placement version is explicit. Original Meshy/source bytes, authoring pipeline and exact-body binding rules remain intact. |
| Character acceptance | Only accepted compatible modules enter ordinary worlds. Qualify the declared age/body/motion support, including annual transitions and Talk/Listen; equip/remove restores body coverage. No silent preview promotion. |
| Desktop 3D UI | Primary text ≥14px and secondary ≥12px as proposed tokens; normal-text contrast ≥4.5:1; primary controls have ≥44×44 CSS-pixel targets. Check 1280×720, 1400×900 and 1920×1080, keyboard focus/Escape, selection dismissal, panel/world overlap, mouse pan/orbit/zoom and no accidental selection after dragging. Mobile layouts, sheets and touch acceptance belong to #182. |
| Cheap presentation changes | Camera/palette-only work adds zero terrain triangles, material passes, lights or shadow maps. Initial lighting pass retains one directional shadow source and no new postprocess pass. |
| Paired runtime cost | Three serial runs per fixture/tier, 10s warmup + 30s samples; report median/p95 frame intervals and CPU spans, long tasks, shadow-inclusive calls/triangles, counts and available bytes. Proposed ≤5% median/p95 regression for camera/material/lighting-only work; rerun noisy pairs and report inconclusive results rather than force a pass. Mask/dressing cost needs a separate approved budget. |
| Long-run rendering | Run 30 active minutes at fixed 10/40 residents, explicitly handling annual Continue. Compare equal five-minute windows and a scripted camera; after warmup, equivalent-state resource counts should plateau. Proposed ≤10% p95 degradation at fixed workload; log long tasks and allocation/GC evidence. Keep legitimate canonical history growth separate from render leaks. |
| Canonical CPU | Repeat early/mid/late and controlled-history fixtures in Node and browser. A2 should eliminate full gameplay execution for availability queries and demonstrate substantial reduction of measured overhead; set its numeric target after profiles. Keep complete replay/validation equivalence. |
| Memory/lifecycle | Ten create/dispose or initial-tier reload cycles return to the same post-warmup owned geometry/texture counts; inspect retained JS objects. Report texture/buffer byte estimates separately from actual GPU memory, which may be unavailable. |

60 FPS desktop and 30 FPS physical mobile are proposed product goals, not achieved baselines. Current exploratory results do not establish headroom for additional effects. `requestAnimationFrame` intervals and renderer submission time are not GPU execution time; use disjoint-safe timer queries where supported and report unavailable GPU timing honestly.

Ground maps are chosen at initial load. A live Low switch changes DPR/shadows/water but does not constitute a freshly loaded Low ground-resource run. Use separate cold tier loads for budget comparisons.

## Phase B and entry conditions

Start the full visual pass only after CPU-clan strategy, combat mechanics, expansion and core player interactions have stable simulation/presentation contracts. Neighboring clans already execute mechanics; the condition concerns their remaining behavior and integration.

| Independent follow-up issue proposal | Why defer / dependency |
| --- | --- |
| Simulation-driven 3D settlement growth and contextual activity | Layout grammar, production-linked dressing, stockpile amounts, cattle/jobs, construction stages and household growth depend on canonical placement/interaction rules. |
| CPU-clan architecture and settlement identity | Clan differentiation and population-density tuning need stable ownership, growth and strategic behavior. |
| Combat animation, equipment and event feedback | Existing clips need state integration, timing, selection and outcome contracts; includes injury/death, destruction and aftermath. |
| Full wardrobe, portraits and occupation identity | Native modules and fitting exist; broad appearance/age/pose qualification and occupation equipment should follow final gameplay requirements. |
| Final desktop 3D HUD, build/command and combat interfaces | Final panels, minimap/world interaction and desktop viewport flows depend on complete commands and information hierarchy. The discontinued 2D board is excluded; mobile UI remains in #182. |
| Advanced rendering experiments | AO, bloom, reflections, volumetrics, geometric snow or extra shadow lights require demonstrated need and measured desktop/mobile budgets; Phase B does not automatically authorize them. |
| Integrated long-campaign visual and runtime gate | Re-run the seed/season/state gallery and performance protocols with the actual canonical campaign driving 3D. |

## Coordination and review decisions

The integration lead owns `Game.ts`, renderer/light/camera contracts and default promotion. Terrain owns `BlueprintTerrain.ts` and ground materials; nature/composition owns placement experiments; assets owns factories/catalogs/bindings; UI owns profile/HUD/CSS. `SeasonTint.ts`, shared materials and camera fixtures have one designated editor per change. Specialists propose cross-lane changes through that owner, then review the same paired gallery.

Implement approved rows as small draft PRs with explicit source ownership, benchmark manifests and no unrelated refactoring. Keep #180 open across both phases. Do not mark a PR ready or merge until required checks pass on its current head; report inherited failures and do not weaken checks.

Review decisions requested: agree the visual direction/rubric; approve A0–A6 and the limited desktop 3D UI scope in A8; decide whether A7 outfit acceptance belongs in Alpha; keep A9 conditional on compatibility/performance evidence. Phase B remains deferred. Creating issues, changing defaults, removing 2D code and implementing any proposed task are outside this first-pass delivery. #182 remains the owner of mobile UI work.

## Audit verification

The bounded verification command was `node --test tests/world-generation.test.mjs tests/terrain-treatment.test.mjs tests/lighting.test.mjs tests/time-visualization.test.mjs tests/navigation.test.mjs tests/touch.test.mjs tests/settlement-view.test.mjs tests/gameplay-lab.test.mjs`: **38 passed, 0 failed, 0 skipped**. This checks inspected contracts; the 2D projection tests were inspected before its discontinuation and remain unchanged. Four current-checkout browser screenshots were visually inspected and emitted zero page errors.

No production code, gameplay/balance, runtime assets, dependencies or historical reports were changed. Full build, complete test/asset-validation suite, CI, browser CPU flamegraphs, GPU timing, 30-minute soak and physical-phone measurements were not run in this planning pass. Their absence is a baseline task, not a claimed pass or an inherited failure. The subsequent publication adds this report, its supplied reference and captured evidence in a documentation-only draft PR; it does not approve implementation or close #180. No implementation follow-up issues were created.
