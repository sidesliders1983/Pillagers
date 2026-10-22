import { WildlifeLayer } from '../wildlife/WildlifeLayer';
import { RivalScene } from './RivalScene';
import { IslandMap } from './IslandMap';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { intersectNavigationTerrain } from '../world/TerrainNavigation';
import { DiscoveryFog } from './DiscoveryFog';
import { discoveryAt, inspectClanDiscovery, type DiscoveryView } from '../simulation/ClanDiscovery';
import { IslandLoading, yieldForInput } from './IslandLoading';
import { SharedSettlement } from '../play/SharedSettlement';
import { campaignIslandPlan } from './CampaignIsland';
import { fjordFogPresentation } from '../config/FjordFog';
import { PrecipitationEffect } from '../effects/PrecipitationEffect';
import { CampfireEffect, type EffectQuality } from '../effects/CampfireEffect';
import type { FjordCalendar } from './FjordCalendar';
import { LivingWorldController } from './LivingWorldController';
import type { FjordEntity } from './FjordProjection';
import { SelectionLabels } from './SelectionLabels';
import { ProductionLabels } from './ProductionLabels';
import type { SelectionLabel } from './SelectionLabels';
import { fjordTerrain, fjordSnowLine } from '../config/FjordTerrain';
import { fjordPresentation } from '../config/FjordPresentation';
import { resolvePresentationQuality, type PresentationQuality } from '../config/PresentationQuality';
import { Vector2, Vector3, Plane, Raycaster, RingGeometry, MeshBasicMaterial, DoubleSide, Clock, PerspectiveCamera, Scene, Mesh, Texture } from 'three';
import { AssetManager } from '../core/AssetManager';
import { createRenderer } from '../core/Renderer';
import { WorldLighting } from '../core/WorldLighting';
import { SeasonTint } from '../world/SeasonTint';
import { SeasonAppearanceTransition } from '../world/SeasonAppearanceTransition';
import { DirectionalAtmosphere } from '../world/DirectionalAtmosphere';
import { createWorld } from '../world/WorldFactory';
import { RTSCameraController } from '../camera/RTSCameraController';
import { inspectCampfire, inspectSpatialExpeditions } from '../simulation/SimulationCore';
import { FjordModels } from './FjordModels';
import { FjordEntities } from './FjordEntities';
import { fjordGroundWeights } from './FjordGround';
import { dressingHomes } from './SettlementDressing';
import { SettlementDressingLayer } from './SettlementDressingLayer';
import { ResidentPortraitStudio } from '../characters/ResidentPortraitStudio';
import type { PortraitRequest } from '../characters/CharacterPortraits';

export interface FjordSceneHost {
    readonly tickIntervalSeconds: number;
    readonly loading?: IslandLoading;
    readonly stopped: boolean;
    work(delta: 1 | -1): void;
    built(): void;
}

/** Owns the active Three.js presentation; the host retains campaign commands and clock intent. */
export function createFjordScene(options: {
    shared: SharedSettlement;
    canvas: HTMLCanvasElement;
    labels: { selection: SelectionLabels; production: ProductionLabels };
    host: FjordSceneHost;
    restoredCamera?: { position: number[]; target: number[] };
}) {
    const { shared, canvas, labels, host } = options;
    const session = shared.session, campaign = shared.fjord;
    const selectionLabels = labels.selection, productionLabels = labels.production;
    const query = new URLSearchParams(location.search);
    const unifiedSunlight = query.get('sunlight') === 'unified-v1';
    const northernLight = query.get('lighting') === 'northern-v1' || unifiedSunlight;
    const atmosphere = unifiedSunlight ? new DirectionalAtmosphere() : undefined;
    const decorateMaterials = atmosphere ? (root: import('three').Object3D) => atmosphere.bind(root) : undefined;
    let restoredCamera = options.restoredCamera;
    let disposed = false, queued = false, worldRevision = 0;
    let activeBlueprint: typeof campaign.blueprint | undefined;
    let appliedRevision = -1;
    const pending = new Set<Promise<void>>();
    const track = (operation: Promise<void>) => {
        pending.add(operation);
        void operation.then(() => pending.delete(operation), () => pending.delete(operation));
        return operation;
    };
    const inactive = () => disposed || host.stopped;
    const bindings = new AbortController();
    let assets: AssetManager | undefined, models: FjordModels | undefined;
    let layer: FjordEntities | undefined, world: Awaited<ReturnType<typeof createWorld>> | undefined;
    let discoveryFog: DiscoveryFog | undefined;
    let wildlife: WildlifeLayer | undefined;
    let knownTerrain: DiscoveryView | undefined;
    let motion: LivingWorldController | undefined;
    let rivalScene: RivalScene | undefined;
    let liveMarkers: ReturnType<typeof shared.selectionPresentation> = [];
    let sceneEntities: readonly FjordEntity[] = [];
    let syncScene: (() => Promise<void>) | undefined;
    let sceneWork: Promise<void> | undefined;

    const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 2400);
    const targetGeometry = new RingGeometry(2.7, 3, 48);
    const targetMaterial = new MeshBasicMaterial({
        color: '#ffe09a', side: DoubleSide,
        depthTest: false, depthWrite: false, toneMapped: false, fog: false,
        transparent: true, opacity: 1
    });
    const targetMarker = new Mesh(targetGeometry, targetMaterial);
    targetMarker.rotation.x = -Math.PI / 2;
    targetMarker.renderOrder = 1000; targetMarker.visible = false;
    scene.add(targetMarker);

    const renderer = createRenderer(canvas);
    const portraits = new ResidentPortraitStudio(renderer);
    renderer.setPixelRatio(resolvePresentationQuality(
        document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as PresentationQuality,
        document.querySelector<HTMLSelectElement>('#fjord-effects')!.value as EffectQuality,
        devicePixelRatio, 'initial').pixelRatio);
    const controller = new RTSCameraController(camera, canvas, 'pan');
    const islandMap = new IslandMap(document.querySelector('#fjord-play')!, {
        focus: point => controller.focusAt(point),
    });

    let observer: ResizeObserver | undefined;
    let lighting: WorldLighting | undefined;
    let weatherTint: SeasonTint | undefined;
    let dressing: SettlementDressingLayer | undefined;
    let campfireEffect: CampfireEffect | undefined;
    let precipitationEffect: PrecipitationEffect | undefined;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const configureEffects = () => {
        const quality = document.querySelector<HTMLSelectElement>('#fjord-effects')!.value as EffectQuality;
        campfireEffect?.configure(quality, reducedMotion.matches);
        precipitationEffect?.configure(quality, reducedMotion.matches);
    };
    reducedMotion.addEventListener('change', configureEffects, { signal: bindings.signal });
    document.querySelector('#fjord-effects')!.addEventListener('change', configureEffects, { signal: bindings.signal });
    let weatherSignature = "";
    let lightSignature = '';
    let seasonYear: number | undefined;
    let seasonAppearance = new SeasonAppearanceTransition();
    const applySeasonAppearance = () => {
        const appearance = seasonAppearance.current;
        weatherTint?.applyAppearance(appearance);
        layer?.setSeasonAppearance(appearance);
        dressing?.setSeasonAppearance(appearance);
        rivalScene?.setSeasonAppearance(appearance);
    };

    const cleared = new Set<string>();
    let groundSignature = "";
    let arrivalPose: { position: number[]; target: number[] };
    let highlandPose: { position: number[]; target: number[] };
    document.querySelector('#fjord-view-home')!.addEventListener('click', () => {
        if (arrivalPose) controller.setView(arrivalPose);
        document.querySelector<HTMLDetailsElement>('#fjord-menu')!.open = false;
    }, { signal: bindings.signal });
    document.querySelector('#fjord-view-summit')!.addEventListener('click', () => {
        if (highlandPose) controller.setView(highlandPose);
        document.querySelector<HTMLDetailsElement>('#fjord-menu')!.open = false;
    }, { signal: bindings.signal });

    const highlight = (state = session.readSnapshot(), view = campaign.readProjection()) => {
        liveMarkers = shared.selectionPresentation(state, view.entities);
        layer?.select(liveMarkers);
        canvas.dataset.highlight = JSON.stringify(layer?.root.userData.selection ?? null);
        const markers = (layer?.root.userData.markers ?? []) as SelectionLabel[];
        canvas.dataset.markers = JSON.stringify(markers);
        selectionLabels.sync(markers);
    };

    const rebuildWorld = async (): Promise<void> => {
        if (inactive()) return;
        host.work(1);
        try {
            const blueprint = campaign.blueprint;
            const revision = ++worldRevision;
            const canonical = session.readSnapshot();
            const discovery = canonical.discovery ? inspectClanDiscovery(canonical.discovery, canonical.clan.id) : undefined;
            host.built();
            const next = await createWorld(assets!, {
                mode: 'generated', blueprint, discovery, atmosphere,
                settlement: 'canonical', groundStyle: campaignIslandPlan(blueprint) ? fjordTerrain.style : undefined, quality: document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard',
                anisotropy: renderer.capabilities.getMaxAnisotropy(),
                preparation: async (stage, operation) => {
                    if (host.loading) return host.loading.measure(stage, operation);
                    await yieldForInput();
                    return operation();
                }
            });
            if (host.loading?.signal.aborted) { next.dispose(); host.loading.check(); }
            if (inactive() || shared.transferring || revision !== worldRevision) {
                next.dispose();
                return;
            }
            if (blueprint !== campaign.blueprint) {
                next.dispose();
                return rebuildWorld();
            }
            let nextWildlife: WildlifeLayer | undefined;
            if (wildlife?.population.world !== blueprint) {
                try {
                    nextWildlife = await WildlifeLayer.create(blueprint,
                        (x, z) => !knownTerrain || discoveryAt(knownTerrain, x, z) !== 'unknown');
                } catch (error) {
                    next.dispose();
                    throw error;
                }
                if (inactive() || shared.transferring || revision !== worldRevision
                    || blueprint !== campaign.blueprint) {
                    nextWildlife.dispose();
                    next.dispose();
                    return;
                }
            }
            const anchor = next.attachments.find(item => item.key === 'boat')!;
            campaign.setMooring({ x: anchor.x, y: anchor.y, z: anchor.z, rotation: anchor.rotation, scale: 1 });
            weatherTint?.dispose();
            dressing?.dispose();
            campfireEffect?.dispose();
            precipitationEffect?.dispose();
            world?.dispose();
            world = next;
            if (nextWildlife) {
                wildlife?.dispose();
                wildlife = nextWildlife;
                atmosphere?.bind(wildlife.root);
                scene.add(wildlife.root);
            }
            activeBlueprint = blueprint;
            wildlife?.setWaterHeightSampler((x, z) => world!.waterHeightAt(x, z));
            appliedRevision = -1;
            discoveryFog?.dispose();
            knownTerrain = discovery;
            discoveryFog = discovery ? new DiscoveryFog(blueprint, discovery) : undefined;
            if (discoveryFog) scene.add(discoveryFog.root);
            const fire = campaign.readProjection().campfire;
            const firePosition = new Vector3(fire.transform.x, fire.transform.y, fire.transform.z);
            next.clearPlot({
                ...fire.transform, halfWidth: fire.clearingRadius,
                halfDepth: fire.clearingRadius, futureAsset: 'hut'
            });
            const fireState = inspectCampfire(session.readSnapshot());
            campfireEffect = new CampfireEffect(fire.id, firePosition.clone().add(new Vector3(0, .9, 0)),
                session.readSnapshot().seed, fireState.lit);
            precipitationEffect = new PrecipitationEffect(session.readSnapshot().seed,
                (x, z) => Math.max(blueprint.waterLevel, next.movement.heightAt(x, z)));
            scene.add(precipitationEffect.root);
            configureEffects();
            scene.add(campfireEffect.root);
            layer!.setCampfireHeat(campfireEffect.inspect().heat);
            const summitLine = campaignIslandPlan(blueprint) ? fjordSnowLine(blueprint) : null;
            weatherTint = new SeasonTint(next.root, next.terrain, summitLine);
            atmosphere?.bind(next.root);
            canvas.dataset.terrainStyle = JSON.stringify({
                style: summitLine !== null ? fjordTerrain.style : 'native',
                summitLineY: summitLine, minimumUp: fjordTerrain.permanentMinimumUp
            });
            weatherSignature = "";
            scene.add(next.root);
            dressing = new SettlementDressingLayer(assets!, blueprint, next.quality, decorateMaterials);
            scene.add(dressing.root);
            cleared.clear();
            motion = new LivingWorldController(campaign.blueprint, discovery ?
                (x, z) => !knownTerrain || discoveryAt(knownTerrain, x, z) !== 'unknown' : undefined);
            rivalScene?.dispose();
            rivalScene = new RivalScene(blueprint, models!, () => knownTerrain, decorateMaterials);
            scene.add(rivalScene.root);
            groundSignature = "";
            lighting?.dispose();
            lighting = new WorldLighting(scene, renderer, assets!, firePosition, next.center,
                document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard',
                fjordPresentation.lighting);
            lightSignature = '';
            seasonYear = undefined;
            seasonAppearance = new SeasonAppearanceTransition();
            lighting.includeWorldShadowBounds(next.root);
            if (syncScene) {
                await syncScene();
                // A superseded in-flight sync can have been joined above. Reconcile this
                // world once that work drains, rather than accepting its obsolete result.
                if (!inactive() && revision === worldRevision && appliedRevision !== revision)
                    await syncScene();
            }
            if (inactive() || shared.transferring || revision !== worldRevision || blueprint !== campaign.blueprint)
                return;
            controller.setNavigationSurface(next.terrain, firePosition, blueprint.terrain.bounds, next.movement.heightAt,
                { terrain: blueprint.terrain, waterLevel: blueprint.waterLevel });
            islandMap.setWorld(blueprint, { x: firePosition.x, z: firePosition.z }, discovery, next.terrain);
            islandMap.setExpeditions(inspectSpatialExpeditions(session.readSnapshot()).missions);
            // Arrive at the settlement nucleus, not at a fit-all bounding box.
            arrivalPose = {
                position: [firePosition.x + 28, firePosition.y + 31, firePosition.z - 32],
                target: [firePosition.x, firePosition.y + 1, firePosition.z],
            };
            const peak = blueprint.terrain.heights.reduce((best, y, index) => y > best.y ? { y, index } : best,
                { y: -Infinity, index: 0 });
            const peakX = blueprint.terrain.bounds.minX + peak.index % blueprint.terrain.columns * blueprint.terrain.spacing;
            const peakZ = blueprint.terrain.bounds.minZ + Math.floor(peak.index / blueprint.terrain.columns) * blueprint.terrain.spacing;
            highlandPose = { position: [peakX + 70, peak.y + 58, peakZ - 80], target: [peakX, peak.y - 3, peakZ] };
            controller.setView(restoredCamera ?? arrivalPose);
            restoredCamera = undefined;
        } finally {
            host.work(-1);

        }
    };

    const initialize = async () => {
        assets = new AssetManager();
        if (host.loading) await host.loading.measure('assets-fetch-decode', () => assets!.loadForSimulation());
        else await assets.loadForSimulation();
        host.loading?.check();
        if (inactive()) {
            assets.dispose();
            return;
        }
        models = new FjordModels(assets, decorateMaterials);
        layer = new FjordEntities(models, decorateMaterials);
        scene.add(layer.root);

        await rebuildWorld();
        if (inactive() || shared.transferring) return;
        syncScene = () => {
            if (inactive() || shared.transferring || activeBlueprint !== campaign.blueprint)
                return Promise.resolve();
            queued = true;
            if (sceneWork)
                return sceneWork;
            host.work(1);
            sceneWork = (async () => {
                do {
                    queued = false;
                    const revision = worldRevision, activeWorld = world;
                    const current = () => !inactive() && !shared.transferring &&
                        revision === worldRevision && activeWorld === world && activeBlueprint === campaign.blueprint;
                    // Keep one immutable revision through asynchronous model work. A queued revision
                    // acquires a new pair on the next pass instead of mixing new facts into this scene.
                    const state = session.readSnapshot();
                    const view = campaign.readProjection();
                    islandMap.setExpeditions(inspectSpatialExpeditions(state).missions);
                    if (state.discovery && discoveryFog) {
                        knownTerrain = inspectClanDiscovery(state.discovery, state.clan.id);
                        if (world!.setDiscovery(knownTerrain)) {
                            lighting!.includeWorldShadowBounds(world!.root);
                            weatherTint!.refreshFoliage(world!.root);
                            atmosphere?.bind(world!.root);
                            weatherSignature = '';
                        }
                        discoveryFog.setKnowledge(knownTerrain);
                        islandMap.setKnowledge(knownTerrain);
                        if (query.has('debugDiscovery')) canvas.dataset.discovery = JSON.stringify(discoveryFog.inspect());
                    } else if (query.has('debugDiscovery')) canvas.dataset.discovery = JSON.stringify({ active: false });
                    const sceneCanonicalTime = 'Canonical time: Winter ' + view.time.winter +
                        ' · tick ' + view.time.tick + '/' + state.ticksPerWinter;
                    precipitationEffect!.setWeather(view.precipitation);
                    canvas.dataset.precipitation = JSON.stringify(precipitationEffect!.inspect());
                    const nextWeather = JSON.stringify([view.calendar.visualProgress, view.weatherVisual]);
                    const nextLight = northernLight
                        ? nextWeather + ':' + view.time.winter + ':' + view.calendar.progress : nextWeather;
                    const weatherChanged = nextWeather !== weatherSignature;
                    const lightChanged = nextLight !== lightSignature;
                    const year = view.time.winter + view.calendar.progress;
                    const stepSeconds = seasonYear === undefined ? Infinity :
                        (year - seasonYear) * session.effectiveMinutesPerWinter * 60;
                    // Ordinary clock batches blend for one update interval. Loads, explicit
                    // year jumps and world replacement reanchor directly to their confirmed state.
                    const transition = session.running && stepSeconds > 0 &&
                        stepSeconds <= host.tickIntervalSeconds * 2.5 ? host.tickIntervalSeconds : 0;
                    let appearanceChanged = false;
                    if (year !== seasonYear) {
                        appearanceChanged = seasonAppearance.anchor(view.calendar.visualProgress, transition);
                        seasonYear = year;
                    }
                    if (weatherChanged) {
                        const fogPresentation = fjordFogPresentation(fjordPresentation.fogProfile, {
                            width: campaign.blueprint.config.width,
                            winterWeight: view.calendar.winterWeight,
                            rainWeight: view.precipitation.rain,
                            weather: view.weatherVisual.class,
                        });
                        lighting!.setFogPresentation(fogPresentation);
                        discoveryFog?.setPresentation(fogPresentation);
                    }
                    if (lightChanged) {
                        lighting!.setSeason(view.calendar.visualProgress, view.weatherVisual.lighting,
                            northernLight ? view.calendar.progress : undefined, northernLight ? transition : 0);
                        lightSignature = nextLight;
                    }
                    // Discovery can replace foliage during a paused or partial transition.
                    // New bindings receive the current displayed appearance, never the endpoint.
                    if (weatherChanged || appearanceChanged) applySeasonAppearance();
                    if (weatherChanged) {
                        weatherSignature = nextWeather;
                        canvas.dataset.seasonMaterials = JSON.stringify(weatherTint!.inspect());
                    }
                    if (weatherChanged || lightChanged) {
                        canvas.dataset.weather = JSON.stringify({
                            ...view.weatherVisual, observed: {
                                sky: lighting!.skyColor.getHex(), fogNear: lighting!.fog.near, fogFar: lighting!.fog.far,
                                sunIntensity: lighting!.directional.intensity, ambient: lighting!.ambient.intensity,
                                exposure: renderer.toneMappingExposure
                            }
                        });
                    }
                    const observedEntities = [...view.entities, ...view.rival.entities];
                    const observedGround = {
                        plots: [...view.ground.plots, ...view.rival.ground.plots],
                        paths: [...view.ground.paths, ...view.rival.ground.paths]
                    };
                    const grassPlots = observedEntities.filter(e => e.kind === 'household' && e.plot).map(e => e.plot!);
                    const signature = JSON.stringify([observedGround, grassPlots]);
                    if (signature !== groundSignature) {
                        const weights = fjordGroundWeights(campaign.blueprint, observedGround, grassPlots);
                        if (host.loading) {
                            await host.loading.measure('initial-ground-wear',
                                () => world!.prepareGroundWeights(weights));
                            if (!current()) return;
                        } else world!.setGroundWeights(weights);
                        canvas.dataset.ground = JSON.stringify({
                            plots: observedGround.plots.map(p => p.id),
                            paths: observedGround.paths, soilSamples: weights.filter(w => w > 0).length
                        });
                        for (const path of observedGround.paths)
                            for (const p of path.points)
                                world!.clearPlot({ ...p, halfWidth: 1.5, halfDepth: 1.5, futureAsset: 'hut' });
                        groundSignature = signature;
                    }
                    for (const [id, plot] of Object.entries(view.layout.plots))
                        if (!cleared.has(id)) {
                            world!.clearPlot({ ...plot, futureAsset: 'hut' });
                            cleared.add(id);
                        }
                    for (const entity of observedEntities)
                        if (entity.transform && !entity.status.expedition &&
                            (entity.kind === 'persona' || entity.kind === 'cattle')) {
                            const pointKey = entity.selectionKey + '@' + entity.transform.x + ',' + entity.transform.z;
                            if (!cleared.has(pointKey)) {
                                world!.clearPlot({ ...entity.transform, halfWidth: 1, halfDepth: 1, futureAsset: 'hut' });
                                cleared.add(pointKey);
                            }
                        }
                    for (const entity of view.rival.entities) {
                        const p = entity.plot ?? (entity.kind === 'campfire' ? entity.transform : undefined);
                        if (p && !cleared.has(entity.selectionKey)) {
                            world!.clearPlot({
                                x: p.x, z: p.z, halfWidth: entity.plot?.halfWidth ?? 7,
                                halfDepth: entity.plot?.halfDepth ?? 7, futureAsset: 'hut'
                            });
                            cleared.add(entity.selectionKey);
                        }
                    }
                    sceneEntities = view.entities;
                    wildlife?.setObstacles(view.entities.flatMap(entity =>
                        entity.kind === 'building' && entity.plot ? [entity.plot] : []));
                    dressing!.sync({
                        seed: state.seed, homes: dressingHomes(state, view.entities),
                        ground: view.ground, campfire: view.campfire
                    }, knownTerrain);
                    canvas.dataset.dressing = JSON.stringify(dressing!.inspect());
                    layer!.prepareExpeditions(state, campaign.blueprint, host.tickIntervalSeconds);
                    await layer!.sync(view.entities, host.loading ? yieldForInput : undefined, current, view.livestockDeaths);
                    if (!current()) return;
                    campfireEffect!.setLit(inspectCampfire(state).lit);
                    layer!.setCampfireHeat(campfireEffect!.inspect().heat);
                    const fireBounds = layer!.bounds('campfire:settlement-campfire')!;
                    canvas.dataset.campfire = JSON.stringify({
                        ...view.campfire,
                        placeholder: layer!.describe().find(e => e.kind === 'campfire')!.placeholder,
                        width: fireBounds.max.x - fireBounds.min.x, bounds: fireBounds
                    });
                    canvas.dataset.structureSnow = JSON.stringify(layer!.inspectSeason());
                    canvas.dataset.campfireEffect = JSON.stringify(campfireEffect!.inspect());
                    motion!.reconcile(view.entities, view.ground);
                    const trees = host.loading
                        ? await host.loading.measure('standing-tree-targets', () => world!.standingTrees())
                        : world!.standingTrees();
                    if (!current()) return;
                    motion!.setStandingTrees(trees);
                    layer!.configureMotion(motion!);
                    layer!.advance(motion!, 0, false);
                    await rivalScene?.sync(view.rival, view.calendar.visualProgress, trees, seasonAppearance.current);
                    if (!current()) return;
                    canvas.dataset.rival = JSON.stringify({
                        known: view.rival.known,
                        currentlyObserved: view.rival.currentlyObserved, rendered: rivalScene?.describe() ?? []
                    });
                    if (inactive() || shared.transferring)
                        return;
                    highlight(state, view);
                    const rendered = layer!.describe();
                    for (const entity of rendered) lighting!.includeEntityShadowBounds(entity.bounds);
                    productionLabels.setAnchors(rendered);
                    canvas.dataset.rendered = JSON.stringify(rendered);
                    canvas.dataset.environment = JSON.stringify(world!.describe());
                    appliedRevision = revision;
                    document.querySelector('#fjord-diagnostics')!.textContent = [...view.diagnostics,
                    ...assets!.diagnostics, ...models!.diagnostics, ...motion!.diagnostics,
                        sceneCanonicalTime,
                        'Reused FjordSide DNA, Talk/Listen and authored cattle activities; missing clip capabilities remain disabled.',
                        'Ambient motion is presentation only. Young children and active caregivers stay indoors.',
                    'Geography: ' + view.layout.geographyId].join('\n');
                } while (queued && !inactive());
            })().finally(() => {
                host.work(-1);

                sceneWork = undefined;
            });
            return sceneWork;
        };

        if (host.loading) await host.loading.measure('initial-character-scene-sync', syncScene!);
        else await syncScene!();
        if (inactive() || shared.transferring) return;
        document.querySelector('#fjord-quality')!.addEventListener('change', event => {
            const quality = (event.target as HTMLSelectElement).value as PresentationQuality;
            world!.setQuality(quality);
            dressing!.setQuality(quality);
            canvas.dataset.dressing = JSON.stringify(dressing!.inspect());
            lighting!.setQuality(quality);
            renderer.setPixelRatio(resolvePresentationQuality(quality,
                document.querySelector<HTMLSelectElement>('#fjord-effects')!.value as EffectQuality,
                devicePixelRatio, 'live').pixelRatio);
        }, { signal: bindings.signal });

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            renderer.setSize(rect.width, rect.height, false);
            camera.aspect = rect.width / Math.max(1, rect.height);
            camera.updateProjectionMatrix();
        };
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();

    };
    const clock = new Clock();
    let time = 0;
    let cameraSignature = '';
    let lastDiagnostics = 0, activeTime = 0, lastFrameMs = 0;

    const frame = (calendar: FjordCalendar, running: boolean) => {
        if (inactive()) return;
        const frameStarted = performance.now();
        const elapsed = clock.getDelta(), delta = Math.min(elapsed, .1);
        time += delta;
        controller.update(delta);
        camera.updateMatrixWorld();
        islandMap.update(camera, controller.focus, frameStarted);
        const motionDelta = Math.min(elapsed, 1);
        if (running) activeTime += motionDelta;
        if (seasonAppearance.advance(motionDelta, running)) applySeasonAppearance();
        motion!.advance(motionDelta, running, !document.hidden);
        layer!.advance(motion!, motionDelta, running);
        rivalScene?.advance(motionDelta, running);
        wildlife?.setHumans([...layer!.humanPositions(), ...(rivalScene?.humanPositions() ?? [])]);
        wildlife?.useCanonical(session.readSnapshot().wildlife, host.tickIntervalSeconds);
        wildlife?.advance(motionDelta, running, camera);
        campfireEffect!.update(delta, running && !document.hidden);
        precipitationEffect!.update(delta, running && !document.hidden, controller.focus, camera.position);
        const fireVisual = campfireEffect!.inspect();
        layer!.setCampfireHeat(fireVisual.heat);
        lighting!.setCampfire(fireVisual.lit, fireVisual.time, fireVisual.reducedMotion);
        layer!.select(liveMarkers);
        selectionLabels.setAnchors(layer!.root.userData.markers ?? []);
        productionLabels.setAnchors(layer!.productionAnchors());
        if (performance.now() - lastDiagnostics > 500) {
            canvas.dataset.rendered = JSON.stringify(layer!.describe());
            canvas.dataset.dyingLivestock = JSON.stringify(layer!.describeDeaths());
            if (import.meta.env.DEV && query.has('debugWildlife')) {
                canvas.dataset.wildlife = JSON.stringify(wildlife?.inspect());
            }
            canvas.dataset.stability = JSON.stringify({
                ...motion!.inspectMetrics(), ...models!.inspectResources(),
                lastFrameMs, drawCalls: renderer.info.render.calls,
                triangles: renderer.info.render.triangles,
                geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
                programs: renderer.info.programs?.length ?? null
            });
            canvas.dataset.islandMap = JSON.stringify(islandMap.inspect());
            canvas.dataset.motion = JSON.stringify(motion!.inspect());
            canvas.dataset.campfireEffect = JSON.stringify(fireVisual);
            canvas.dataset.precipitation = JSON.stringify(precipitationEffect!.inspect());
            canvas.dataset.structureSnow = JSON.stringify(layer!.inspectSeason());
            canvas.dataset.seasonMaterials = JSON.stringify(weatherTint!.inspect());
            canvas.dataset.motionTime = String(activeTime);
            canvas.dataset.cameraClearance = JSON.stringify(controller.inspectClearance());
            canvas.dataset.shadowCoverage = JSON.stringify(lighting!.inspectShadowCoverage());
            canvas.dataset.seasonalLight = JSON.stringify(lighting!.seasonalLightState ?? { profile: 'baseline' });
            canvas.dataset.sunlight = JSON.stringify(atmosphere?.inspect() ?? { profile: 'baseline' });
            canvas.dataset.markers = JSON.stringify(layer!.root.userData.markers ?? []);
            lastDiagnostics = performance.now();
        }
        selectionLabels.update(camera, canvas.clientWidth, canvas.clientHeight);
        productionLabels.update(camera, canvas.clientWidth, canvas.clientHeight);
        const signature = JSON.stringify({
            world: camera.matrixWorld.toArray(),
            projection: camera.projectionMatrix.toArray()
        });
        if (signature !== cameraSignature) {
            cameraSignature = signature;
            canvas.dataset.camera = signature;
            canvas.dataset.cameraClearance = JSON.stringify(controller.inspectClearance());
        }
        lighting!.setFogViewDistance(campaignIslandPlan(campaign.blueprint) ?
            camera.position.distanceTo(controller.focus) : 60);
        lighting!.update(time, calendar.visualProgress, motionDelta, running);
        lighting!.updateShadowView(camera);
        atmosphere?.update(lighting!, camera);
        world!.update(time, lighting, camera);
        discoveryFog?.update(delta);
        renderer.render(scene, camera);
        lastFrameMs = performance.now() - frameStarted;
    };

    const prepareGpu = async (loading: Pick<IslandLoading, 'stage' | 'measure' | 'check'>) => {
        loading.stage('Preparing FjordSide');
        const textures = new Set<Texture>();
        scene.traverse(node => {
            if (!(node instanceof Mesh)) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material])
                for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
        });
        await loading.measure('texture-upload', async () => {
            for (const texture of textures) {
                loading.check();
                renderer.initTexture(texture);
                await yieldForInput();
            }
        });
        await loading.measure('shader-compilation', () => renderer.compileAsync(scene, camera), { timeoutMs: 120_000 });
        await loading.measure('initial-gpu-upload-and-draws', async () => {
            const meshes: Mesh[] = [];
            scene.traverseVisible(node => { if (node instanceof Mesh) meshes.push(node); });
            for (const mesh of meshes) mesh.visible = false;
            try {
                // Upload native geometry and first-use shadow programs in separate input turns.
                // The opaque preview covers these preparation draws; final scene quality is unchanged.
                for (const mesh of meshes) {
                    loading.check();
                    mesh.visible = true;
                    renderer.render(scene, camera);
                    mesh.visible = false;
                    await yieldForInput();
                }
            } finally { for (const mesh of meshes) mesh.visible = true; }
            renderer.render(scene, camera);
        });
        loading.check();
    };

    const arrive = async (loading: IslandLoading) => {
        if (discoveryFog) discoveryFog.root.visible = false;
        try {
            await loading.arrive(controller, campaign.blueprint, arrivalPose, world!.movement.heightAt);
        } finally { if (discoveryFog) discoveryFog.root.visible = true; }
        canvas.dataset.loading = JSON.stringify(loading.evidence);
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        worldRevision++;
        bindings.abort();
        renderer.setAnimationLoop(null);
        observer?.disconnect();
        controller.dispose();
        islandMap.dispose();
        targetGeometry.dispose(); targetMaterial.dispose();
        reducedMotion.removeEventListener('change', configureEffects);
        discoveryFog?.dispose();
        wildlife?.dispose();
        rivalScene?.dispose();
        dressing?.dispose();
        layer?.dispose();
        weatherTint?.dispose();
        campfireEffect?.dispose();
        precipitationEffect?.dispose();
        world?.dispose();
        lighting?.dispose();
        portraits.dispose();
        atmosphere?.dispose();
        renderer.dispose();
        scene.clear();
        const releaseSources = () => {
            models?.dispose();
            assets?.dispose();
            models = undefined;
            assets = undefined;
        };
        if (pending.size) void Promise.allSettled([...pending]).then(releaseSources);
        else releaseSources();
    };
    return {
        root: scene, camera, renderer, controller,
        initialize: () => inactive() ? Promise.resolve() : track(initialize()),
        replace: () => inactive() ? Promise.resolve() : track(rebuildWorld()),
        sync: () => inactive() ? Promise.resolve() : track(syncScene?.() ?? Promise.resolve()),
        frame, prepareGpu, arrive, dispose, highlight,
        portrait: (input: PortraitRequest) => inactive() || renderer.getContext().isContextLost()
            ? Promise.resolve(undefined) : portraits.render(input, layer?.residentForPortrait(input)),
        resetFrameTime: () => {
            clock.start();
            lighting?.finishSeasonTransition();
            if (seasonAppearance.finish()) applySeasonAppearance();
        },
        get hasWorld() { return !!world; },
        get diagnostics() { return [...(assets?.diagnostics ?? []), ...(models?.diagnostics ?? [])]; },
        setTarget(point: { x: number; z: number } | null | undefined, valid?: boolean) {
            targetMarker.visible = !!point;
            targetMaterial.color.set(valid === undefined ? '#ffe09a' : valid ? '#22ff44' : '#ff2030');
            if (import.meta.env.DEV) {
                canvas.dataset.destinationPreview = JSON.stringify({
                    point, valid, color: targetMaterial.color.getHexString(),
                });
            }
            if (point) targetMarker.position.set(point.x, Math.max(campaign.blueprint.waterLevel,
                createBlueprintSurface(campaign.blueprint).surfaceHeightAt(point.x, point.z)) + .4, point.z);
        },
        origins(memberIds: readonly string[]) {
            const rendered = layer?.describe() ?? [];
            return Object.fromEntries(memberIds.map(id => {
                const person = rendered.find(entity => entity.kind === 'persona' && entity.id === id);
                if (!person) throw new Error('A group member is not currently on the island.');
                return [id, { x: person.position[0], z: person.position[2] }];
            }));
        },
        pick(x: number, y: number, pointerType: 'mouse' | 'touch', targetKind?: 'longship') {
            return layer!.pick(camera, x, y, canvas.getBoundingClientRect(), pointerType, targetKind);
        },
        groundPoint(x: number, y: number, fallbackToWater = false, waterOnly = false) {
            const rect = canvas.getBoundingClientRect(), ray = new Raycaster();
            camera.updateMatrixWorld();
            ray.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1,
                -(y - rect.top) / rect.height * 2 + 1), camera);
            if (waterOnly) return ray.ray.intersectPlane(
                new Plane(new Vector3(0, 1, 0), -campaign.blueprint.waterLevel), new Vector3());
            const hit = intersectNavigationTerrain(world!.terrain, ray.ray, new Vector3());
            const point = hit === undefined ? ray.intersectObject(world!.terrain, false)[0]?.point : hit;
            return point ?? (fallbackToWater ? ray.ray.intersectPlane(
                new Plane(new Vector3(0, 1, 0), -campaign.blueprint.waterLevel), new Vector3()) : undefined);
        },
    };
}
export type FjordScene = ReturnType<typeof createFjordScene>;
