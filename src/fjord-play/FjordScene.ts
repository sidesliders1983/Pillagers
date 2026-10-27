import { WildlifeCamera, wildlifeCameraPivot } from '../camera/WildlifeCamera';
import { CameraObstacles } from '../camera/CameraObstacles';
import { WildlifeCinematicView } from './WildlifeCinematicView';
import { resolveWildlifeFocus } from '../lore/AttentionNavigation';
import { Box3 } from 'three';
import { WeddingEnsemble } from './WeddingEnsemble';
import { WeddingCamera } from './WeddingCamera';
import { WeddingCinematicView } from './WeddingCinematicView';
import { weddingAssets } from './WeddingAssets';
import type { ForegroundTrack } from '../audio/ForegroundTrack';
import { WildlifeLayer } from '../wildlife/WildlifeLayer';
import { ConstructionGpuPreparation } from '../construction/ConstructionGpuPreparation';
import { RivalScene } from './RivalScene';
import { IslandMap } from './IslandMap';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { intersectNavigationTerrain } from '../world/TerrainNavigation';
import { DiscoveryFog } from './DiscoveryFog';
import { discoveryAt, inspectClanDiscovery, type DiscoveryView } from '../simulation/ClanDiscovery';
import { IslandLoading, yieldForInput } from './IslandLoading';
import { loadResourceId } from './IslandLoadStatus';
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
import { fjordLighting } from '../config/FjordLighting';
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
import type { PlaytestPerformance } from './PlaytestPerformance';
import type { FjordAudio } from '../audio/FjordAudio';
import type { SoundEmitter } from '../audio/Soundscape';
import { selectFjordSoundPack } from '../audio/SoundPack';
import { SettlementSounds, type SettlementSoundFrame } from '../audio/SettlementSounds';
import { WorkContacts } from '../audio/WorkContacts';
import { WildlifeSounds } from '../audio/WildlifeSounds';
import { CulturalMotion } from '../characters/CulturalMotion';
import { CulturalSounds } from '../audio/CulturalSounds';
import { withCulturalSoundPack } from '../audio/CulturalSoundPack';
import { CulturalPresentation, type CulturalPresentationFrame } from './CulturalPresentation';
import { CulturalCeremonyVisuals } from './CulturalCeremonyVisuals';

export interface FjordSceneHost {
    readonly tickIntervalSeconds: number;
    readonly loading?: IslandLoading;
    readonly stopped: boolean;
    work(delta: 1 | -1): void;
    built(): void;
}

/** Owns the active Three.js presentation; the host retains campaign commands and clock intent. */
export function createFjordScene(options: {
    diagnostics?: PlaytestPerformance;
    audio?: FjordAudio;
    shared: SharedSettlement;
    canvas: HTMLCanvasElement;
    labels: { selection: SelectionLabels; production: ProductionLabels };
    host: FjordSceneHost;
    restoredCamera?: { position: number[]; target: number[] };
    openWildlifeRecord?: (eventId: string) => void;
    notify?: (message: string) => void;
}) {
    const { shared, canvas, labels, host } = options;
    const diagnostics = options.diagnostics;
    const sceneWorkMeasured = <T>(operation: () => Promise<T>) => diagnostics
        ? diagnostics.operation('scene', operation) : operation();
    const session = shared.session, campaign = shared.fjord;
    const selectionLabels = labels.selection, productionLabels = labels.production;
    const query = new URLSearchParams(location.search);
    const soundSelection = selectFjordSoundPack(location.search);
    const proofAudio = soundSelection.mode === 'proof';
    const settlementAudio = !proofAudio;
    let audioWorld: ReturnType<FjordAudio['world']> | undefined;
    let audioSources: SoundEmitter[] = [];
    let culturalSounds = new CulturalSounds((session.readSnapshot().culture?.nextSequence ?? 1) - 1);
    let settlementSounds: SettlementSounds | undefined;
    let workContacts = new WorkContacts();
    let wildlifeSounds: WildlifeSounds | undefined;
    let soundFire: SettlementSoundFrame['fire'];
    let soundWeather: string | null = null;
    let soundProjectionMs = 0, soundContacts = 0;
    let lastSoundContact: { at: number; focus: import('../audio/Soundscape').SoundPoint;
        sources: SoundEmitter[] } | undefined;
    const { unified: unifiedSunlight, northern: northernLight, warmHomes } = fjordLighting(query);
    canvas.dataset.homeLightingMode = warmHomes ? 'warm-v1' : 'off';
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
    const culturalMotion = new CulturalMotion();
    let culture: CulturalPresentation | undefined;
    let ceremonyVisuals: CulturalCeremonyVisuals | undefined;
    const weddingEnsemble = new WeddingEnsemble(undefined, import.meta.env.BASE_URL);
    let weddingView: WeddingCinematicView | undefined;
    let weddingTrack: ForegroundTrack | undefined;
    let preparedWeddingMusic: { id: string; track: ForegroundTrack } | undefined;
    let weddingId: string | undefined;
    let weddingMusicStarted = false;
    let weddingObstacles: Box3[] = [];
    let culturalMotionReady = false;
    let preparingCultureEvent = '';
    let lastCulturalPhase = '';
    let cultureSuspended = false;
    const culturalVisible = () => {
        const point = culture?.inspect()?.position;
        if (!point || document.hidden) return false;
        const projected = new Vector3(point.x, point.y + 1, point.z).project(camera);
        return projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.1 && Math.abs(projected.y) <= 1.1 &&
            (!knownTerrain || discoveryAt(knownTerrain, point.x, point.z) === 'visible');
    };
    let rivalScene: RivalScene | undefined;
    let liveMarkers: ReturnType<typeof shared.selectionPresentation> = [];
    let sceneEntities: readonly FjordEntity[] = [];
    let staticSceneSignature = '';
    let syncScene: (() => Promise<void>) | undefined;
    let sceneWork: Promise<void> | undefined;

    const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 2400);
    const targetGeometry = new RingGeometry(2.7, 3, 48);
    const targetMaterial = new MeshBasicMaterial({
        color: '#ffe09a', side: DoubleSide,
        depthTest: false, depthWrite: false, toneMapped: false, fog: false,
        transparent: true, opacity: 1
    });
    let targetRequested = false;
    const targetMarker = new Mesh(targetGeometry, targetMaterial);
    targetMarker.rotation.x = -Math.PI / 2;
    targetMarker.renderOrder = 1000; targetMarker.visible = false;
    scene.add(targetMarker);

    const renderer = createRenderer(canvas);
    const constructionGpu = new ConstructionGpuPreparation();
    renderer.localClippingEnabled = true;
    const portraits = new ResidentPortraitStudio(renderer, undefined, undefined,
        operation => diagnostics ? diagnostics.draw(renderer, 'portrait', operation) : operation());
    renderer.setPixelRatio(resolvePresentationQuality(
        document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as PresentationQuality,
        document.querySelector<HTMLSelectElement>('#fjord-effects')!.value as EffectQuality,
        devicePixelRatio, 'initial').pixelRatio);
    const controller = new RTSCameraController(camera, canvas, 'pan');
    const weddingCamera = new WeddingCamera(camera, controller, point => {
        const ground = world?.movement.heightAt(point.x, point.z);
        return ground !== undefined && Number.isFinite(ground) && point.y >= ground + 1.8 &&
            (!knownTerrain || discoveryAt(knownTerrain, point.x, point.z) === 'visible') &&
            !weddingObstacles.some(box => box.containsPoint(new Vector3(point.x, point.y, point.z)));
    });
    let wildlifeView: WildlifeCinematicView | undefined;
    let wildlifeObstacles: CameraObstacles | undefined;
    const queryWildlife = (target: Parameters<WildlifeLayer['liveAnchor']>[0]) => {
        if (inactive() || shared.transferring || document.hidden || world?.blueprint !== campaign.blueprint ||
            session.readSnapshot().wildlife?.worldId !== target.worldId) return;
        const anchor = wildlife?.liveAnchor(target);
        return anchor && (!knownTerrain || discoveryAt(knownTerrain, anchor.position[0], anchor.position[2]) === 'visible')
            ? anchor : undefined;
    };
    const wildlifeCamera = new WildlifeCamera(camera, controller, queryWildlife, (view, phase, previous) =>
        !!wildlifeObstacles?.allows(view, phase !== 'approach') &&
        (!previous || wildlifeObstacles.travel(previous, view.position)) && (!knownTerrain ||
            discoveryAt(knownTerrain, view.position[0], view.position[2]) !== 'unknown' &&
            discoveryAt(knownTerrain, view.target[0], view.target[2]) !== 'unknown'));
    wildlifeCamera.onEnd = reason => {
        wildlifeView?.dispose();
        wildlifeView = undefined;
        wildlifeObstacles = undefined;
        if (reason === 'animal-unavailable' || reason === 'animal-moved-away')
            options.notify?.('The animal has moved out of view.');
    };
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) wildlifeCamera.cancel('hidden');
    }, { signal: bindings.signal });
    window.addEventListener('pagehide', () => wildlifeCamera.cancel('page-hidden'), { signal: bindings.signal });
    canvas.addEventListener('webglcontextlost', () => wildlifeCamera.cancel('context-lost'), { signal: bindings.signal });
    document.addEventListener('click', event => {
        const target = event.target as Element | null;
        if (target && target !== canvas && !target.closest('.wildlife-cinematic, #fjord-run'))
            wildlifeCamera.cancel('another-task');
    }, { capture: true, signal: bindings.signal });
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
        wildlifeCamera.cancel('effects-changed');
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
    let preparedGroundSignature = "";
    let preparedSoilSamples = 0;
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

    const updateCeremonyVisuals = (frame: CulturalPresentationFrame | null, active: boolean) => {
        layer?.setCulturalParticipants(active ? frame : null);
        const fireLit = inspectCampfire(session.readSnapshot()).lit;
        if (frame && frame.occasion !== 'storytelling_music' && active && fireLit)
            ceremonyVisuals ??= new CulturalCeremonyVisuals(scene, canvas.parentElement ?? undefined);
        if (!ceremonyVisuals) return;
        const state = session.readSnapshot();
        const spouses = (frame?.spouseIds ?? []).flatMap(id => {
            const person = state.personas[id];
            const bounds = layer?.bounds('persona:' + id);
            if (!person || !bounds || !frame?.participantKeys.includes('persona:' + id)) return [];
            const center = bounds.getCenter(new Vector3());
            return [{ id, name: person.name,
                position: { x: center.x, y: bounds.max.y + .25, z: center.z },
                visible: !knownTerrain || discoveryAt(knownTerrain, center.x, center.z) === 'visible' }];
        });
        ceremonyVisuals.update(frame, { active, fireLit, spouses, camera,
            width: canvas.clientWidth, height: canvas.clientHeight });
    };
    const stopWedding = () => {
        preparedWeddingMusic?.track.dispose();
        preparedWeddingMusic = undefined;
        weddingEnsemble.stop();
        weddingCamera.restore();
        weddingTrack?.dispose(); weddingTrack = undefined;
        weddingView?.dispose(); weddingView = undefined;
        weddingId = undefined; weddingMusicStarted = false;
    };
    const skipWedding = () => {
        if (!weddingId && !preparedWeddingMusic) return;
        culture?.skip();
        stopWedding();
        updateCeremonyVisuals(null, false);
        models?.stopCulture();
    };
    const updateWedding = (current: CulturalPresentationFrame | null, running: boolean) => {
        if (!weddingId) return;
        if (!current?.wedding || current.id !== weddingId || document.hidden) { stopWedding(); return; }
        const residents = layer?.weddingResidents(current.participantKeys) ?? [];
        const musicians = current.wedding.roles.filter(role => role.role === 'musician')
            .flatMap(role => { const resident = residents.find(person => person.id === role.id);
                return resident ? [resident.human.root.getWorldPosition(new Vector3())] : []; });
        const musicSource = musicians.length ? musicians.reduce((sum, point) => sum.add(point), new Vector3())
            .divideScalar(musicians.length).add(new Vector3(0, 1.2, 0)) :
            new Vector3(current.position.x, current.position.y + 1.2, current.position.z);
        weddingTrack?.setPosition({ x: musicSource.x, y: musicSource.y, z: musicSource.z });
        const playing = current.phase !== 'approach';
        const elapsed = current.wedding.elapsed;
        weddingTrack?.update(elapsed, playing && running,
            Math.min(1, elapsed / 1.2, Math.max(0, current.wedding.duration - elapsed) / 1.5));
        if (playing && !weddingMusicStarted && options.audio?.enabled && running) {
            weddingMusicStarted = true;
            void weddingTrack?.play();
        }
        if (weddingTrack) culture?.setWeddingDuration(weddingTrack.duration);

        if (playing) weddingEnsemble.update(current.wedding.roles, residents,
            reducedMotion.matches ? 0 : elapsed);
        else weddingEnsemble.stop();
        const spousePositions = current.spouseIds.flatMap(id => {
            const resident = residents.find(person => person.id === id);
            return resident ? [resident.human.root.getWorldPosition(new Vector3())] : [];
        });
        const center = spousePositions.length === 2 ? spousePositions[0].add(spousePositions[1]).multiplyScalar(.5)
            .add(new Vector3(0, 1.1, 0)) : new Vector3(current.position.x, current.position.y + 1.1, current.position.z - 6);
        weddingCamera.update(current, center, reducedMotion.matches);
        const names = current.spouseIds.map(id => session.readSnapshot().personas[id]?.name ?? 'Resident');
        weddingView?.update(names, current.phase, weddingTrack?.inspect().state ?? 'unavailable', running,
            current.wedding.duration - elapsed);
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) skipWedding(); }, { signal: bindings.signal });
    canvas.addEventListener('webglcontextlost', skipWedding, { signal: bindings.signal });
    document.addEventListener('pointerdown', event => {
        if (!weddingId || !(event.target instanceof Element) || event.target.closest('.wedding-cinematic, #fjord-run')) return;
        // Choosing another HUD task exits the cosmetic scene before ordinary navigation runs.
        if (event.target !== canvas) skipWedding();
    }, { capture: true, signal: bindings.signal });
    // RAF may stop before a hidden/context-lost frame. Invalidate synchronously at the lifecycle edge.
    const suspendCulture = () => {
        if (document.hidden || host.stopped || renderer.getContext().isContextLost()) skipWedding();
        else weddingTrack?.suspend();
        updateCeremonyVisuals(weddingId ? culture?.inspect() ?? null : null, !!weddingId);
        culturalMotion.reset();
        models?.stopCulture();
        preparingCultureEvent = '';
        cultureSuspended = true;
        const frame = culture?.inspect();
        lastCulturalPhase = frame ? frame.id + ':' + frame.phase : '';
        culturalSounds.sample({ presentation: frame ?? undefined, running: false, hidden: true,
            sampleRate: audioWorld?.sampleRate ?? null, ready: () => false });
        audioWorld?.pause();
    };
    const rebuildWorld = async (): Promise<void> => {
        if (inactive()) return;
        stopWedding();
        wildlifeCamera.cancel('world-replaced');
        culture?.dispose();
        ceremonyVisuals?.dispose();
        ceremonyVisuals = undefined;
        culturalSounds.clear();
        culture = undefined;
        culturalMotion.reset();
        models?.stopCulture();
        lastCulturalPhase = '';
        audioWorld?.dispose();
        audioWorld = undefined;
        host.work(1);
        try {
            const blueprint = campaign.blueprint;
            const revision = ++worldRevision;
            const canonical = session.readSnapshot();
            const discovery = canonical.discovery ? inspectClanDiscovery(canonical.discovery, canonical.clan.id) : undefined;
            let initialGroundSignature = '';
            let initialSoilSamples = 0;
            host.built();
            const next = await createWorld(assets!, {
                mode: 'generated', blueprint, discovery, atmosphere,
                settlement: 'canonical', groundStyle: campaignIslandPlan(blueprint) ? fjordTerrain.style : undefined, quality: document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard',
                anisotropy: renderer.capabilities.getMaxAnisotropy(),
                initialGroundWeights: () => {
                    const view = campaign.readProjection();
                    const ground = { plots: [...view.ground.plots, ...view.rival.ground.plots],
                        paths: [...view.ground.paths, ...view.rival.ground.paths] };
                    const grassPlots = [...view.entities, ...view.rival.entities]
                        .filter(entity => entity.kind === 'household' && entity.plot).map(entity => entity.plot!);
                    initialGroundSignature = JSON.stringify([ground, grassPlots]);
                    const weights = fjordGroundWeights(blueprint, ground, grassPlots);
                    initialSoilSamples = weights.filter(weight => weight > 0).length;
                    return weights;
                },
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
            host.loading?.complete('world');
            if (wildlife?.population.world !== blueprint) {
                try {
                    const createWildlife = () => WildlifeLayer.create(blueprint,
                        (x, z) => !knownTerrain || discoveryAt(knownTerrain, x, z) !== 'unknown');
                    nextWildlife = host.loading
                        ? await host.loading.measure('wildlife-preparation', createWildlife)
                        : await createWildlife();
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
            host.loading?.complete('wildlife');
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
            if (activeBlueprint !== blueprint) layer!.resetConstructionBaseline();
            activeBlueprint = blueprint;
            wildlife?.setWaterHeightSampler((x, z) => world!.waterHeightAt(x, z));
            appliedRevision = -1;
            discoveryFog?.dispose();
            knownTerrain = discovery;
            discoveryFog = discovery ? new DiscoveryFog(blueprint, discovery) : undefined;
            if (discoveryFog) scene.add(discoveryFog.root);
            const fire = campaign.readProjection().campfire;
            const firePosition = new Vector3(fire.transform.x, fire.transform.y, fire.transform.z);
            const audioManifest = canonical.culture && !proofAudio
                ? withCulturalSoundPack(soundSelection.manifest) : soundSelection.manifest;
            audioWorld = options.audio?.world(audioManifest, import.meta.env.BASE_URL);
            culturalSounds = new CulturalSounds((canonical.culture?.nextSequence ?? 1) - 1);
            settlementSounds = settlementAudio ? new SettlementSounds(blueprint) : undefined;
            workContacts = new WorkContacts();
            wildlifeSounds = settlementAudio ? new WildlifeSounds(session.readSnapshot().events, soundSelection.manifest) : undefined;
            soundContacts = 0;
            lastSoundContact = undefined;
            audioSources = proofAudio ? [
                { id: 'qa-bed', cue: 'qa-bed', permitted: true },
                ...[-10, 10].map((offset, index) => ({
                    id: 'qa-local-' + index, cue: 'qa-local', permitted: false,
                    position: { x: firePosition.x + offset, y: firePosition.y + 1, z: firePosition.z },
                })),
            ] : [];
            next.clearPlot({
                ...fire.transform, halfWidth: fire.clearingRadius,
                halfDepth: fire.clearingRadius, futureAsset: 'hut'
            });
            const fireState = inspectCampfire(session.readSnapshot());
            soundFire = { id: fire.id, position: fire.transform, lit: fireState.lit };
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
            layer!.setHomeGround(blueprint);
            dressing = new SettlementDressingLayer(assets!, blueprint, next.quality, decorateMaterials);
            scene.add(dressing.root);
            cleared.clear();
            motion = new LivingWorldController(campaign.blueprint, discovery ?
                (x, z) => !knownTerrain || discoveryAt(knownTerrain, x, z) !== 'unknown' : undefined);
            culture = new CulturalPresentation(session.readSnapshot(), motion, fire.transform);
            rivalScene?.dispose();
            rivalScene = new RivalScene(blueprint, models!, () => knownTerrain, decorateMaterials,
                warmHomes ? assets!.homeLightMaps : undefined);
            scene.add(rivalScene.root);
            groundSignature = "";
            preparedGroundSignature = initialGroundSignature;
            preparedSoilSamples = initialSoilSamples;
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
        const textureQuality = query.get('originalModelTextures') === '1' ? 'standard' :
            document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as PresentationQuality;
        assets = new AssetManager(textureQuality);
        canvas.dataset.modelTextures = textureQuality === 'low' ? '512px' : 'Original';
        if (host.loading) await host.loading.measure('assets-fetch-decode', () => assets!.loadForSimulation(event => {
            const loading = host.loading;
            if (!loading || loading.signal.aborted) return;
            loading.units('assets', event.completed, event.total, 'models');
            if (event.resource) loading.diagnostics.latestResource = loadResourceId(event.resource);
            if (event.error) loading.diagnostics.problem('asset-fallback', event.error, event.resource);
        }));
        else await assets.loadForSimulation();
        if (warmHomes) await assets.loadHomeLighting();
        host.loading?.check();
        if (inactive()) {
            assets.dispose();
            return;
        }
        const preparation = host.loading?.diagnosticRun || diagnostics ? Object.assign(
            (sample: import('../characters/CharacterPreparation').CharacterPreparationSample) => {
                host.loading?.diagnosticRun?.character(sample);
                diagnostics?.span(sample.mode === 'synchronous' ? 'modelCpu' : 'modelWall', sample.durationMs);
            }, { enabled: () => !!host.loading?.diagnosticRun || !!diagnostics?.enabled }) : undefined;
        models = new FjordModels(assets, preparation, decorateMaterials);
        layer = new FjordEntities(models, decorateMaterials, warmHomes ? assets.homeLightMaps : undefined);
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
                    wildlifeSounds?.append(state.events, { clanId: state.clan.id,
                        worldId: state.wildlife?.worldId ?? '',
                        tick: state.time.winter * state.ticksPerWinter + state.time.tick,
                        now: performance.now() / 1000,
                        active: session.running && !document.hidden && !!options.audio?.enabled });
                    const view = campaign.readProjection();
                    islandMap.setExpeditions(inspectSpatialExpeditions(state).missions);
                    if (state.discovery && discoveryFog) {
                        knownTerrain = inspectClanDiscovery(state.discovery, state.clan.id);
                        if (world!.setDiscovery(knownTerrain)) {
                            wildlifeCamera.cancel('scenery-changed');
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
                    const nextStaticSignature = JSON.stringify(observedEntities
                        .filter(entity => ['building', 'household', 'longship'].includes(entity.kind))
                        .map(entity => [entity.selectionKey, entity.asset, entity.transform, entity.plot]));
                    if (nextStaticSignature !== staticSceneSignature) {
                        wildlifeCamera.cancel('structures-changed');
                        staticSceneSignature = nextStaticSignature;
                    }
                    const observedGround = {
                        plots: [...view.ground.plots, ...view.rival.ground.plots],
                        paths: [...view.ground.paths, ...view.rival.ground.paths]
                    };
                    const grassPlots = observedEntities.filter(e => e.kind === 'household' && e.plot).map(e => e.plot!);
                    const signature = JSON.stringify([observedGround, grassPlots]);
                    if (signature !== groundSignature) {
                        let soilSamples = preparedSoilSamples;
                        // Initial masks/index already use this exact projection. Keep plot/UI
                        // reconciliation, but rebuild wear only if the projection has changed.
                        if (signature !== preparedGroundSignature) {
                            const weights = fjordGroundWeights(campaign.blueprint, observedGround, grassPlots);
                            soilSamples = weights.filter(weight => weight > 0).length;
                            if (host.loading) {
                                await host.loading.measure('initial-ground-wear',
                                    () => world!.prepareGroundWeights(weights));
                                if (!current()) return;
                            } else world!.setGroundWeights(weights);
                        }
                        canvas.dataset.ground = JSON.stringify({
                            plots: observedGround.plots.map(p => p.id),
                            paths: observedGround.paths, soilSamples
                        });
                        for (const path of observedGround.paths)
                            for (const p of path.points)
                                world!.clearPlot({ ...p, halfWidth: 1.5, halfDepth: 1.5, futureAsset: 'hut' });
                        groundSignature = signature;
                        preparedGroundSignature = '';
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
                    const prepareEntities = () => layer!.sync(view.entities, host.loading ? yieldForInput : undefined, current,
                        view.livestockDeaths, host.loading ? (completed, total, entity, started) => {
                            host.loading?.units('characters', completed, total, 'settlement models');
                            if (entity && started !== undefined)
                                host.loading?.diagnosticRun?.model(entity.kind, entity.asset, started, entity.id);
                        } : undefined, preparation);
                    if (host.loading) await host.loading.measure('initial-settlement-models', prepareEntities);
                    else await prepareEntities();
                    if (!current()) return;
                    const fireLit = inspectCampfire(state).lit;
                    campfireEffect!.setLit(fireLit);
                    if (soundFire) soundFire.lit = fireLit;
                    soundWeather = view.weatherVisual.class;
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
        host.loading?.complete('characters');
        document.querySelector('#fjord-quality')!.addEventListener('change', event => {
            wildlifeCamera.cancel('quality-changed');
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
            wildlifeCamera.cancel('viewport-changed');
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
        if (proofAudio && audioWorld?.due) {
            for (const source of audioSources) if (source.position)
                source.permitted = !knownTerrain || discoveryAt(knownTerrain, source.position.x, source.position.z) === 'visible';
            const focus = controller.focus;
            const height = world!.movement.heightAt(focus.x, focus.z);
            audioWorld.update({
                focus: { x: focus.x, y: Number.isFinite(height) ? Math.max(campaign.blueprint.waterLevel, height) :
                    campaign.blueprint.waterLevel, z: focus.z },
                forward: { x: focus.x - camera.position.x, z: focus.z - camera.position.z },
                distance: camera.position.distanceTo(focus),
            }, audioSources, !running);
        }
        islandMap.update(camera, controller.focus, frameStarted);
        const motionDelta = Math.min(elapsed, 1);
        if (running) activeTime += motionDelta;
        if (seasonAppearance.advance(motionDelta, running)) applySeasonAppearance();
        motion!.advance(motionDelta, running, !document.hidden);
        culture?.advance(motionDelta, running && !document.hidden, culturalVisible(),
            inspectCampfire(session.readSnapshot()).lit);
        const culturalFrame = culture?.inspect();
        const phaseKey = culturalFrame ? culturalFrame.id + ':' + culturalFrame.phase : '';
        const suspended = !running || document.hidden || !culturalFrame?.visible || reducedMotion.matches;
        if (suspended && !cultureSuspended) {
            preparingCultureEvent = '';
            culturalMotion.reset();
            models!.stopCulture();
        }
        cultureSuspended = suspended;
        if (phaseKey !== lastCulturalPhase) {
            culturalMotion.reset();
            models!.stopCulture();
            lastCulturalPhase = phaseKey;
            if (culturalFrame && !suspended && !reducedMotion.matches) {
                if (!culturalFrame.wedding && culturalFrame.phase !== 'approach' && culturalMotionReady && culturalFrame.phaseElapsedSeconds <= .15) {
                    layer!.playCulture(culturalMotion, culturalFrame);
                }
            }
        }
        if (!culturalFrame?.wedding && culturalFrame?.phase === 'approach' && !suspended && !culturalMotionReady &&
            preparingCultureEvent !== culturalFrame.id) {
            preparingCultureEvent = culturalFrame.id;
            void culturalMotion.prepare({ eventId: culturalFrame.id, visible: true })
                .then(clips => { if (clips && !inactive()) culturalMotionReady = true; });
        }
        layer!.advance(motion!, motionDelta, running);
        updateWedding(culturalFrame ?? null, running && !document.hidden);
        updateCeremonyVisuals(culturalFrame ?? null, !document.hidden);
        layer!.updateConstruction(document.hidden ? 0 : delta);
        rivalScene?.advance(motionDelta, running);
        wildlife?.setHumans([...layer!.humanPositions(), ...(rivalScene?.humanPositions() ?? [])]);
        wildlife?.useCanonical(session.readSnapshot().wildlife, host.tickIntervalSeconds);
        wildlife?.advance(motionDelta, running, camera);
        wildlifeCamera.advance(delta);
        targetMarker.visible = targetRequested && !wildlifeCamera.active;
        camera.updateMatrixWorld();
        if (settlementAudio && audioWorld && settlementSounds) {
            const visible = (x: number, z: number) =>
                !knownTerrain || discoveryAt(knownTerrain, x, z) === 'visible';
            const work = workContacts.sample(frameStarted / 1000,
                options.audio?.enabled ? layer!.soundActivities(visible) : [],
                running && !document.hidden && !!options.audio?.enabled);
            const culturalSound = culturalSounds.sample({ presentation: culturalFrame?.wedding ? undefined : culturalFrame ?? undefined,
                running: running && !!options.audio?.enabled, hidden: document.hidden,
                sampleRate: audioWorld.sampleRate, ready: cue => audioWorld!.ready(cue) });
            for (const cue of culturalSound.prepareCueIds) audioWorld.prepare(cue);
            if (work.fresh) soundContacts++;
            if (document.hidden || !options.audio?.enabled) wildlifeSounds?.clear();
            else if (!running) wildlifeSounds?.clearAmbient();
            if (audioWorld.due || work.fresh || work.invalidated || culturalSound.fresh || culturalSound.invalidated) {
                const projectionStarted = performance.now();
                const focus = controller.focus;
                const height = world!.movement.heightAt(focus.x, focus.z);
                const soundCamera = {
                    focus: { x: focus.x, y: Number.isFinite(height) ? Math.max(campaign.blueprint.waterLevel, height) :
                        campaign.blueprint.waterLevel, z: focus.z },
                    forward: { x: focus.x - camera.position.x, z: focus.z - camera.position.z },
                    distance: camera.position.distanceTo(focus),
                };
                if (work.fresh) lastSoundContact = { at: frameStarted, focus: soundCamera.focus, sources: work.sources };
                const soundActors = [...layer!.soundActors(visible), ...(wildlife?.soundActors(visible) ?? [])];
                audioSources = settlementSounds.project({ focus: soundCamera.focus, season: calendar.season,
                    weather: soundWeather, now: frameStarted / 1000,
                    visible, known: (x, z) => !knownTerrain || discoveryAt(knownTerrain, x, z) !== 'unknown',
                    fire: soundFire,
                    actors: soundActors });
                const wildlifeCalls = wildlifeSounds?.sample(frameStarted / 1000, soundCamera, soundActors,
                    !document.hidden && !!options.audio?.enabled, !running) ?? [];
                const callIds = new Set(wildlifeCalls.map(source => source.id));
                audioSources = audioSources.filter(source => !callIds.has(source.id));
                audioSources.push(...wildlifeCalls);
                audioSources.push(...work.sources, ...culturalSound.sources);
                soundProjectionMs = performance.now() - projectionStarted;
                audioWorld.prepare('axe-impact');
                audioWorld.update(soundCamera, audioSources, !running,
                    work.fresh || work.invalidated || culturalSound.fresh || culturalSound.invalidated);
            }
        }
        campfireEffect!.update(delta, running && !document.hidden);
        precipitationEffect!.update(delta, running && !document.hidden, controller.focus, camera.position);
        const fireVisual = campfireEffect!.inspect();
        layer!.setCampfireHeat(fireVisual.heat);
        lighting!.setCampfire(fireVisual.lit, fireVisual.time, fireVisual.reducedMotion);
        layer!.select(liveMarkers);
        selectionLabels.setAnchors(layer!.root.userData.markers ?? []);
        productionLabels.setAnchors(layer!.productionAnchors());
        if (performance.now() - lastDiagnostics > 500) {
            if (options.audio) canvas.dataset.audio = JSON.stringify(options.audio.sample());
            if (settlementAudio) canvas.dataset.audioMix = JSON.stringify({
                scope: soundSelection.mode === 'review' ? 'Local candidate mix' : 'Published game mix', logicalSources: audioSources.length,
                projectionLastMs: soundProjectionMs, visualContacts: soundContacts,
                lastContact: lastSoundContact,
            });
            if (diagnostics?.enabled) diagnostics.context({ ...layer!.performanceCounts(),
                renderedWildlife: wildlife?.renderedCount(),
                quality: document.querySelector<HTMLSelectElement>('#fjord-quality')!.value,
                effects: document.querySelector<HTMLSelectElement>('#fjord-effects')!.value });
            canvas.dataset.rendered = JSON.stringify(layer!.describe());
            canvas.dataset.dyingLivestock = JSON.stringify(layer!.describeDeaths());
            canvas.dataset.construction = JSON.stringify(layer!.inspectConstruction());
            if (import.meta.env.DEV && query.has('debugWildlife')) {
                canvas.dataset.wildlife = JSON.stringify(wildlife?.inspect());
            }
            if (query.has('debugPerf') || query.has('debugWildlife'))
                canvas.dataset.wildlifeCamera = JSON.stringify(wildlifeCamera.inspect());
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
            canvas.dataset.homeLighting = JSON.stringify(layer!.inspectHomeLighting());
            canvas.dataset.homeGroundGlow = JSON.stringify(layer!.inspectHomeGround() ?? null);
            canvas.dataset.seasonMaterials = JSON.stringify(weatherTint!.inspect());
            canvas.dataset.motionTime = String(activeTime);
            canvas.dataset.culture = JSON.stringify(culture?.inspect() ?? null);
            canvas.dataset.wedding = JSON.stringify({ active: !!weddingId, camera: weddingCamera.active,
                ...weddingEnsemble.inspect(), music: weddingTrack?.inspect() ?? null });
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
        layer!.setHomeDarkness(lighting!.darkness);
        rivalScene?.setHomeDarkness(lighting!.darkness);
        lighting!.updateShadowView(camera);
        atmosphere?.update(lighting!, camera);
        world!.update(time, lighting, camera);
        discoveryFog?.update(delta);
        if (diagnostics) diagnostics.draw(renderer, 'main', () => renderer.render(scene, camera));
        else renderer.render(scene, camera);
        lastFrameMs = performance.now() - frameStarted;
    };

    const prepareGpu = async (loading: Pick<IslandLoading, 'stage' | 'measure' | 'check'> & Partial<Pick<IslandLoading, 'complete' | 'units'>>) => {
        loading.stage('Preparing FjordSide');
        await loading.measure('construction-gpu-preparation', () => constructionGpu.prepare({
            renderer, scene, models: models!, anchor: controller.focus.clone(),
            check: () => loading.check(), yieldControl: yieldForInput
        }));
        const textures = new Set<Texture>();
        scene.traverse(node => {
            if (!(node instanceof Mesh)) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material])
                for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
        });
        await loading.measure('texture-upload', async () => {
            let completed = 0;
            loading.units?.('textures', 0, textures.size, 'textures', true);
            for (const texture of textures) {
                loading.check();
                renderer.initTexture(texture);
                loading.units?.('textures', ++completed, textures.size, 'textures', true);
                await yieldForInput();
            }
        });
        loading.complete?.('textures');
        await loading.measure('shader-compilation', () => renderer.compileAsync(scene, camera), { timeoutMs: 120_000 });
        loading.complete?.('compile');
        await loading.measure('initial-gpu-upload-and-draws', async () => {
            const meshes: Mesh[] = [];
            scene.traverseVisible(node => { if (node instanceof Mesh) meshes.push(node); });
            for (const mesh of meshes) mesh.visible = false;
            let completed = 0;
            loading.units?.('draws', 0, meshes.length + 1, 'draw batches', true);
            try {
                // Upload native geometry and first-use shadow programs in separate input turns.
                // The opaque preview covers these preparation draws; final scene quality is unchanged.
                for (const mesh of meshes) {
                    loading.check();
                    mesh.visible = true;
                    renderer.render(scene, camera);
                    mesh.visible = false;
                    loading.units?.('draws', ++completed, meshes.length + 1, 'draw batches', true);
                    await yieldForInput();
                }
            } finally { for (const mesh of meshes) mesh.visible = true; }
            renderer.render(scene, camera);
            loading.units?.('draws', ++completed, meshes.length + 1, 'draw batches', true);
        });
        loading.complete?.('draws');
        if (loading instanceof IslandLoading) {
            loading.diagnostics.firstFrameMs = performance.now() - loading.diagnostics.started;
            loading.diagnostics.metadata.quality = document.querySelector<HTMLSelectElement>('#fjord-quality')!.value;
            loading.diagnostics.resources = { ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0,
                calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
                renderPixelRatio: renderer.getPixelRatio(), drawingBuffer: [canvas.width, canvas.height] };
        }
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
        stopWedding();
        weddingEnsemble.dispose();
        wildlifeCamera.dispose();
        culture?.dispose();
        ceremonyVisuals?.dispose();
        ceremonyVisuals = undefined;
        culturalMotion.dispose();
        models?.stopCulture();
        renderer.setAnimationLoop(null);
        audioWorld?.dispose();
        diagnostics?.releaseGpu();
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
        constructionGpu.dispose();
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
        initialize: () => inactive() ? Promise.resolve() : track(sceneWorkMeasured(initialize)),
        replace: () => inactive() ? Promise.resolve() : track(sceneWorkMeasured(rebuildWorld)),
        sync: () => inactive() ? Promise.resolve() : track(sceneWorkMeasured(() => syncScene?.() ?? Promise.resolve())),
        frame, prepareGpu, arrive, dispose, highlight, suspendCulture,
        get cameraForSave() {
            return wildlifeCamera.saveView ?? { position: camera.position.toArray(), target: controller.focus.toArray() };
        },
        cancelWildlife: () => wildlifeCamera.cancel('another-task'),
        focusWildlife: (eventId: string): 'started' | 'unavailable' | 'unsafe' => {
            wildlifeCamera.cancel('replaced');
            if (inactive() || shared.transferring || document.hidden || host.loading || !world) return 'unavailable';
            const focus = resolveWildlifeFocus(session.readSnapshot(), eventId);
            const anchor = focus && queryWildlife(focus.target);
            if (!focus || !anchor) return 'unavailable';
            skipWedding();
            const pivot = wildlifeCameraPivot(anchor);
            const range = camera.position.distanceTo(pivot) + 64;
            if (range > 200) return 'unsafe';
            // These roots contain only the existing rendered player and sanitized observed rival models.
            wildlifeObstacles = new CameraObstacles([
                world.root, ...(dressing ? [dressing.root] : []),
                ...(layer ? [layer.root] : []), ...(rivalScene ? [rivalScene.root] : []),
            ], pivot.toArray(), range, []);
            const reportFocus = (reason: string) => {
                if (query.has('debugPerf')) canvas.dataset.wildlifeFocus = JSON.stringify({ reason,
                    obstacles: wildlifeObstacles?.count, limited: wildlifeObstacles?.limited });
            };
            const reason = wildlifeCamera.begin(focus.target, reducedMotion.matches) ? 'started' : 'entry-or-orbit';
            reportFocus(reason);
            if (reason !== 'started') {
                wildlifeObstacles = undefined;
                return 'unsafe';
            }
            if (options.audio?.enabled) {
                const state = session.readSnapshot(), event = state.events.find(event => event.id === eventId);
                if (event) wildlifeSounds?.focus(event, { clanId: state.clan.id, worldId: anchor.worldId,
                    now: performance.now() / 1000 }, { id: anchor.wildlifeInstanceId, kind: 'wildlife',
                    species: anchor.speciesId, observable: true, movement: anchor.movement,
                    position: { x: anchor.position[0], y: anchor.position[1], z: anchor.position[2] } });
            }
            const epoch = session.personalHistoryEpoch;
            wildlifeView = new WildlifeCinematicView(canvas.parentElement!, focus.label, {
                stop: () => wildlifeCamera.cancel('stopped'),
                book: () => {
                    wildlifeCamera.cancel('record');
                    if (epoch === session.personalHistoryEpoch) options.openWildlifeRecord?.(eventId);
                },
            });
            canvas.focus({ preventScroll: true });
            return 'started';
        },
        primeWeddingMusic: () => {
            if (inactive()) return;
            const state = session.readSnapshot();
            const event = state.events.find(event => event.id === state.culture?.lastGatheringEventId);
            if (event?.type !== 'CulturalGatheringHeld' || event.details?.occasion !== 'wedding') return;
            preparedWeddingMusic?.track.dispose();
            const track = options.audio?.foreground(weddingAssets.music, { spatial: true });
            if (track) {
                preparedWeddingMusic = { id: event.id, track };
                void track.prime();
            }
        },
        acceptGathering: (focusCeremony = false) => {
            if (inactive() || !culture) return false;
            // Keep the element primed before the asynchronous scene sync, on this exact accepted event.
            const primed = preparedWeddingMusic;
            preparedWeddingMusic = undefined;
            // This entry point is called only after a successful live command, never while restoring.
            stopWedding();
            const original = { position: camera.position.toArray(), target: controller.focus.toArray() };
            const fire = campaign.readProjection().campfire.transform;
            if (focusCeremony) {
                // Explicit ceremony confirmation brings its actual location into view.
                controller.setView({ position: [fire.x + 14, fire.y + 17, fire.z - 18],
                    target: [fire.x, fire.y + 1, fire.z] });
                camera.updateMatrixWorld();
            }
            const projected = new Vector3(fire.x, fire.y + 1, fire.z).project(camera);
            const visible = !document.hidden && projected.z >= -1 && projected.z <= 1 &&
                Math.abs(projected.x) <= 1.1 && Math.abs(projected.y) <= 1.1 &&
                (!knownTerrain || discoveryAt(knownTerrain, fire.x, fire.z) === 'visible');
            const quality = document.querySelector<HTMLSelectElement>('#fjord-quality')!.value;
            const accepted = culture.accept(session.readSnapshot(), quality === 'low' ? 6 : 8, visible,
                { weddingSeconds: weddingAssets.music.seconds });
            const frame = culture.inspect();
            if (accepted && frame) {
                if (frame.wedding) {
                    weddingId = frame.id;
                    weddingTrack = primed?.id === frame.id ? primed.track : options.audio?.foreground(weddingAssets.music, { spatial: true });
                    if (primed && primed.track !== weddingTrack) primed.track.dispose();
                    weddingObstacles = sceneEntities.filter(entity => ['building', 'household'].includes(entity.kind))
                        .flatMap(entity => { const box = layer?.bounds(entity.selectionKey); return box ? [box.expandByScalar(.4)] : []; });
                    if (!weddingCamera.begin(frame, original)) {
                        culture.skip();
                        stopWedding();
                        controller.setView(original);
                        return accepted;
                    }
                    if (!primed) void weddingTrack?.prime();
                    weddingView = new WeddingCinematicView(canvas.parentElement!, {
                        skip: skipWedding,
                        play: () => {
                            const track = weddingTrack;
                            if (!track || culture?.inspect()?.phase === 'approach') return;
                            void options.audio?.enable().then(() => {
                                if (track === weddingTrack) { weddingMusicStarted = true; void track.play(); }
                            });
                        },
                    });
                    void weddingEnsemble.prepare();
                }
                culturalSounds.start({ id: frame.id, sequence: frame.sequence });
                updateCeremonyVisuals(frame, !document.hidden);
            }
            if (primed && primed.track !== weddingTrack) primed.track.dispose();
            return accepted;
        },
        portrait: (input: PortraitRequest) => {
            if (inactive() || renderer.getContext().isContextLost()) return Promise.resolve(undefined);
            const capture = () => portraits.render(input, layer?.residentForPortrait(input));
            return diagnostics ? diagnostics.operation('portrait', capture) : capture();
        },
        resetFrameTime: () => {
            suspendCulture();
            clock.start();
            lighting?.finishSeasonTransition();
            if (seasonAppearance.finish()) applySeasonAppearance();
        },
        get hasWorld() { return !!world; },
        get diagnostics() { return [...(assets?.diagnostics ?? []), ...(models?.diagnostics ?? [])]; },
        setTarget(point: { x: number; z: number } | null | undefined, valid?: boolean) {
            targetRequested = !!point;
            targetMarker.visible = targetRequested && !wildlifeCamera.active;
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
