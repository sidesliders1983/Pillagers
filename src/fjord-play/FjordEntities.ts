import { ExpeditionStanding, type ExpeditionStandingGround } from './ExpeditionStanding';
import { miningWorkerPosition, type MiningWorker } from '../simulation/Mining';
import { spatialMemberPosition, type SpatialMission } from '../simulation/SpatialExpeditions';
import type { SimulationState } from '../simulation/SimulationCore';
import { createBlueprintSurface, type TerrainSurface } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { StructureSeasonTint } from '../world/StructureSeasonTint';
import { HomeLighting } from '../world/HomeLighting';
import { HomeGroundGlow } from '../world/HomeGroundGlow';
import type { Texture } from 'three';
import type { SeasonAppearance } from '../world/SeasonAppearanceTransition';
import { createFjordYardSurface } from './FjordYardSurface';
import type { LivingWorldController, ExpeditionMotionTarget } from './LivingWorldController';
import type { SelectionMarker } from '../play/SelectionPresentation';
import { Box3, Camera, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, Raycaster, RingGeometry, SkinnedMesh, Vector2, Vector3 } from 'three';
import { FjordModels } from './FjordModels';
import type { CulturalMotion } from '../characters/CulturalMotion';
import type { CulturalPresentationFrame } from './CulturalPresentation';
import type { FjordEntity } from './FjordProjection';
import { livestockPresentation } from '../characters/LivestockPresentation';
import type { LivestockDeath } from './LivestockDeath';
import { ConstructionTransitions } from '../construction/ConstructionTransition';
import { longshipDeckAnchors } from './LongshipDeck';
import type { PortraitRequest } from '../characters/CharacterPortraits';
import { characterSync, type CharacterPreparationObserver } from '../characters/CharacterPreparation';
import type { SoundActor } from '../audio/SettlementSounds';
import type { WorkSoundActivity } from '../audio/WorkContacts';

interface YardFloor {
    yard: Object3D;
    matrix: number[];
    x: number;
    y: number;
    z: number;
    height?: number;
}

/** A slow Core tick may skip an entire presentation update. Cover that bounded gap
 * using confirmed positions only, so a runner does not finish a segment too early. */
function travelInterpolationWindow(updateInterval: number, secondsPerTick: number): number {
    return Math.max(updateInterval,
        Math.ceil(secondsPerTick / updateInterval - 1e-9) * updateInterval);
}

/** Reconcile canonical identities; unchanged objects and the environment remain alive. */
export class FjordEntities {
    readonly root = new Group();
    private construction = new ConstructionTransitions();
    private constructionInitialized = false;
    private entries = new Map<string, {
        signature: string;
        model: Object3D;
        season?: StructureSeasonTint;
        homeLight?: HomeLighting;
        localBounds?: Box3;
        modelBounds?: Box3;
        boundsSignature?: string;
        yardFloor?: YardFloor;
    }>();
    private deaths = new Map<string, { model: Object3D; presentation: LivestockDeath }>();
    private workSounds: WorkSoundActivity[] = [];
    private expeditionTickSeconds = .5;
    private expeditionSurface?: TerrainSurface;
    private expeditionWorld?: WorldBlueprint;
    private expeditionStanding?: ExpeditionStanding;
    private expeditionFrames = new Map<string, { mission: SpatialMission; from: number; elapsed: number; duration: number }>();
    prepareExpeditions(state: SimulationState, world: WorldBlueprint, updateIntervalSeconds = .5,
        secondsPerTick = updateIntervalSeconds, standingGround: ExpeditionStandingGround = {}) {
        this.expeditionTickSeconds = secondsPerTick;
        if (this.expeditionWorld !== world) {
            this.expeditionWorld = world;
            this.expeditionSurface = createBlueprintSurface(world);
            this.expeditionStanding = new ExpeditionStanding(world);
            this.expeditionFrames.clear();
            for (const entry of this.entries.values()) entry.yardFloor = undefined;
        }
        const active = Object.values(state.world?.spatial?.missions ?? {}).filter(m => m.status !== 'Returned' && m.status !== 'Prepared');
        const ids = new Set(active.map(m => m.id));
        this.expeditionStanding!.prepare(standingGround);
        for (const id of this.expeditionFrames.keys()) if (!ids.has(id)) this.expeditionFrames.delete(id);
        for (const mission of active) {
            const previous = this.expeditionFrames.get(mission.id);
            if (previous?.mission === mission) continue;
            const ratio = previous ? Math.min(1, previous.elapsed / previous.duration) : 1;
            // A new route starts at an authoritative reached position, not a distance on the old path.
            const sameRoute = previous && JSON.stringify(previous.mission.route) === JSON.stringify(mission.route);
            if (sameRoute && previous.mission.travelled === mission.travelled &&
                previous.mission.status === mission.status) {
                previous.mission = mission;
                continue;
            }
            const from = sameRoute ? previous.from + (previous.mission.travelled - previous.from) * ratio : mission.travelled;
            const cadence = travelInterpolationWindow(updateIntervalSeconds, secondsPerTick);
            const duration = Math.max(cadence, Math.min(cadence * 2, previous?.elapsed ?? cadence));
            this.expeditionFrames.set(mission.id, { mission, from, elapsed: 0, duration });
        }
    }
    private expeditionPose(missionId: string, personaId?: string) {
        const frame = this.expeditionFrames.get(missionId);
        if (!frame) return;
        const travelled = frame.from + (frame.mission.travelled - frame.from) * Math.min(1, frame.elapsed / frame.duration);
        const point = spatialMemberPosition({ ...frame.mission, travelled }, personaId ?? frame.mission.memberIds[0]);
        return { ...point, y: frame.mission.transport?.phase === 'embarked'
            ? this.expeditionWorld!.waterLevel + .15
            : this.expeditionSurface!.surfaceHeightAt(point.x, point.z) };
    }

    private miningSurface?: TerrainSurface;
    private miningHeight?: (x: number,z: number,natural: number) => number;
    private miningWorld?: WorldBlueprint;
    private miningFrames = new Map<string, {worker: MiningWorker; from: number; elapsed: number; duration: number; inside: boolean; face: {x: number; z: number}}>();
    prepareMining(state: SimulationState, world: WorldBlueprint, interval = .5,
        height?: (x: number,z: number,natural: number) => number, secondsPerTick = interval) {
        this.miningHeight = height;
        if (this.miningWorld !== world) {
            this.miningWorld = world; this.miningSurface = createBlueprintSurface(world); this.miningFrames.clear();
        }
        const workers = state.mining?.workers ?? {};
        for (const id of this.miningFrames.keys()) if (!workers[id]) this.miningFrames.delete(id);
        for (const [id, worker] of Object.entries(workers)) {
            const previous = this.miningFrames.get(id);
            const site = state.mining!.sites.find(s => s.id === worker.siteId)!;
            const inside = !!site.mine && worker.phase === 'Working';
            if (previous?.worker === worker && previous.inside === inside) continue;
            const ratio = previous ? Math.min(1, previous.elapsed / previous.duration) : 1;
            const from = previous ? previous.from + (previous.worker.travelled - previous.from) * ratio : worker.travelled;
            const face = site.position;
            const cadence = travelInterpolationWindow(interval, secondsPerTick);
            this.miningFrames.set(id, {worker, from, inside, elapsed: 0,
                duration: Math.max(cadence, Math.min(cadence * 2, previous?.elapsed ?? cadence)), face});
        }
    }
    private miningPose(id: string) {
        const frame = this.miningFrames.get(id);
        if (!frame) return;
        const distance = frame.from + (frame.worker.travelled - frame.from) * Math.min(1, frame.elapsed / frame.duration);
        const point = miningWorkerPosition({...frame.worker, travelled: distance});
        const next = frame.worker.phase === 'Working' ? frame.face : miningWorkerPosition({...frame.worker,
            travelled: Math.max(0, Math.min(frame.worker.distance, distance + (frame.worker.phase === 'Returning' ? -.1 : .1)))});
        const natural = this.miningSurface!.surfaceHeightAt(point.x,point.z);
        const inside = frame.inside && distance >= frame.worker.distance - 1e-4;
        return {...point, inside, y: this.miningHeight?.(point.x,point.z,natural) ?? natural,
            rotation: Math.atan2(next.x-point.x, next.z-point.z),
            moving: !frame.worker.blockedReason && frame.worker.phase !== 'Working',
            working: !frame.worker.blockedReason && frame.worker.phase === 'Working'};
    }
    private disposed = false;
    private seasonProgress: number | null = null;
    private seasonAppearance?: SeasonAppearance;
    private yardSamplers = new Map<string, { signature: string; sample: (x: number, z: number, clearance: number) => number | null }>();
    private markers = new Map<string, {
        mesh: Mesh<RingGeometry, MeshBasicMaterial>;
        radius: number;
    }>();
    private homeDarkness = 0;
    private homeGround?: HomeGroundGlow;
    constructor(private models: FjordModels, private decorateMaterials?: (root: Object3D) => void,
        private homeMasks?: ReadonlyMap<string, Texture>, private animateConstruction = true) {
    }
    setHomeDarkness(darkness: number) {
        if (darkness === this.homeDarkness) return;
        this.homeDarkness = darkness;
        this.homeGround?.setDarkness(darkness);
        for (const entry of this.entries.values()) entry.homeLight?.setDarkness(darkness);
    }
    setHomeGround(world: WorldBlueprint, visible?: (x: number, z: number) => boolean) {
        if (!this.homeMasks) return;
        this.homeGround?.dispose();
        const surface = createBlueprintSurface(world);
        this.homeGround = new HomeGroundGlow(surface.surfaceHeightAt, (x, z) =>
            surface.surfaceHeightAt(x, z) > world.waterLevel + .02 && (!visible || visible(x, z)));
        this.homeGround.setDarkness(this.homeDarkness);
        this.root.add(this.homeGround.mesh);
        this.refreshHomeGround();
    }
    setHomeGroundVisibility(version: string) { this.homeGround?.setVisibilityVersion(version); }
    inspectHomeGround() { return this.homeGround?.inspect(); }
    private refreshHomeGround() {
        this.homeGround?.sync([...this.entries.values()].flatMap(entry =>
            entry.homeLight?.inhabitedRoot ? [entry.homeLight.inhabitedRoot] : []));
    }
    inspectHomeLighting() {
        return [...this.entries].flatMap(([key, entry]) => entry.homeLight
            ? [{ key, ...entry.homeLight.inspect() }] : []);
    }
    resetConstructionBaseline() {
        for (const transition of this.construction.inspect()) this.construction.finish(transition.key);
        this.construction.root.removeFromParent();
        this.constructionInitialized = false;
    }
    inspectConstruction() { return this.construction.inspect(); }
    updateConstruction(delta: number) {
        this.construction.update(delta);
        if (!this.construction.root.children.length) this.construction.root.removeFromParent();
    }
    setSeason(progress: number | null) {
        this.seasonAppearance = undefined;
        this.seasonProgress = progress;
        for (const entry of this.entries.values()) entry.season?.update(progress);
    }
    setSeasonAppearance(appearance: SeasonAppearance) {
        this.seasonAppearance = appearance;
        for (const entry of this.entries.values()) entry.season?.setSnowAmount(appearance.snowAmount);
    }
    setCampfireHeat(heat: number) {
        this.entries.get('campfire:settlement-campfire')?.season?.setSnowMultiplier(1 - heat);
    }
    inspectSeason() {
        return [...this.entries].flatMap(([key, entry]) =>
            entry.season ? [{ key: key === 'campfire:settlement-campfire' ? 'settlement-campfire' : key, ...entry.season.inspect() }] : []);
    }
    select(markers: readonly SelectionMarker[]) {
        const wanted = new Set(markers.filter(marker => this.entries.has(marker.selectionKey)).map(marker => marker.selectionKey));
        for (const [key, entry] of this.markers) {
            if (!wanted.has(key)) {
                entry.mesh.removeFromParent();
                entry.mesh.geometry.dispose();
                entry.mesh.material.dispose();
                this.markers.delete(key);
            }
        }
        const descriptions = [];
        for (const marker of markers) {
            const model = this.entries.get(marker.selectionKey)?.model;
            if (!model)
                continue;
            const box = this.bounds(marker.selectionKey)!;
            const size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
            const radius = Math.max(.9, Math.max(size.x, size.z) / 2 + .3);
            let entry = this.markers.get(marker.selectionKey);
            if (!entry) {
                const mesh = new Mesh(new RingGeometry(radius - .22, radius, 96), new MeshBasicMaterial({
                    side: DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 1, fog: false, toneMapped: false
                }));
                mesh.raycast = () => {
                };
                mesh.rotation.x = -Math.PI / 2;
                mesh.renderOrder = 1000;
                this.root.add(mesh);
                entry = { mesh, radius };
                this.markers.set(marker.selectionKey, entry);
            }
            if (Math.abs(radius - entry.radius) > .001) {
                entry.mesh.geometry.dispose();
                entry.mesh.geometry = new RingGeometry(radius - .22, radius, 96);
                entry.radius = radius;
            }
            const color = marker.role === 'selected' ? '#ffdf6a' : '#79e0ed';
            entry.mesh.material.color.set(color);
            entry.mesh.position.set(center.x, box.min.y + .04, center.z);
            descriptions.push({
                ...marker, color, fill: 'transparent', radius,
                position: entry.mesh.position.toArray(), anchor: [center.x, box.max.y + .4, center.z]
            });
        }
        this.root.userData.markers = descriptions;
        this.root.userData.selection = descriptions.find(marker => marker.role === 'selected') ?? null;
    }
    async sync(entities: readonly FjordEntity[], yieldControl?: () => Promise<void>, current = () => true,
        livestockDeaths: readonly { id: string }[] = [],
        progress?: (completed: number, total: number, entity?: FjordEntity, started?: number) => void,
        observe?: CharacterPreparationObserver) {
        if (this.disposed || !current()) return;
        const visible = entities.filter(e => e.transform !== null);
        let prepared = 0;
        progress?.(prepared, visible.length);
        const nextEntities = new Map(visible.map(entity => [entity.selectionKey, entity]));
        // Retain unchanged attachments. Detach only before removal, hull replacement or landing.
        for (const [key, { model }] of this.entries) {
            const shipId = model.userData.canonical?.aboardShip;
            if (!shipId || model.parent === this.root) continue;
            const hullKey = 'longship:' + shipId, nextHull = nextEntities.get(hullKey);
            const sameHull = nextHull && this.entries.get(hullKey)?.signature ===
                nextHull.asset + ':' + (nextHull.terrainAsset ?? '');
            if (!sameHull || nextEntities.get(key)?.status.aboardShip !== shipId) this.root.attach(model);
        }
        const wanted = new Set(visible.map(e => e.selectionKey));
        const confirmedDeaths = new Set(livestockDeaths.map(fact => fact.id));
        for (const key of this.deaths.keys()) if (wanted.has(key)) this.finishDeath(key);
        for (const [key, entry] of this.entries)
            if (!wanted.has(key)) {
                this.construction.finish(key);
                entry.homeLight?.dispose();
                entry.season?.dispose();
                const facts = entry.model.userData.canonical;
                const death = facts?.kind === 'cattle' && confirmedDeaths.has(facts.id)
                    ? this.models.beginDeath(entry.model) : undefined;
                if (death) {
                    delete entry.model.userData.canonical;
                    this.deaths.set(key, { model: entry.model, presentation: death });
                } else this.remove(entry.model);
                this.entries.delete(key);
            }
        for (const entity of visible) {
            if (this.disposed)
                return;
            await yieldControl?.();
            if (this.disposed || !current()) return;
            const started = progress ? performance.now() : 0;
            const signature = entity.asset + ':' + (entity.terrainAsset ?? '');
            let entry = this.entries.get(entity.selectionKey);
            let transitionOld: typeof entry;
            let construct = false;
            if (!entry || entry.signature !== signature) {
                const model = await this.models.create(entity);
                model.userData.asset = entity.asset;
                if (this.disposed || !current()) {
                    this.remove(model);
                    return;
                }
                this.construction.finish(entity.selectionKey);
                construct = this.animateConstruction && this.constructionInitialized && entity.kind === 'building' &&
                    (!entry || entity.status.level! > (entry.model.userData.canonical?.level ?? -1));
                if (entry && construct) transitionOld = entry;
                else if (entry) {
                    entry.homeLight?.dispose();
                    entry.season?.dispose();
                    this.remove(entry.model);
                }
                const season = entity.kind === 'building' || entity.kind === 'household' || entity.kind === 'campfire'
                    ? new StructureSeasonTint(model) : undefined;
                if (this.seasonAppearance) season?.setSnowAmount(this.seasonAppearance.snowAmount);
                else season?.update(this.seasonProgress);
                const house = entity.kind === 'building' ? model.getObjectByName(entity.asset) : undefined;
                const mask = this.homeMasks?.get(entity.asset);
                const homeLight = house && mask && !house.userData.placeholder
                    ? new HomeLighting(house, mask) : undefined;
                homeLight?.setDarkness(this.homeDarkness);
                this.decorateMaterials?.(model);
                entry = { signature, model, season, homeLight };
                this.entries.set(entity.selectionKey, entry);
                this.root.add(model);
            }
            const p = entity.transform!;
            entry.model.name = entity.selectionKey;
            const miningDisplay = entity.status.mining ? this.miningPose(entity.id) : undefined;
            const display = miningDisplay ?? (entity.status.shipExpedition ? this.expeditionPose(entity.status.shipExpedition) ?? p :
                entity.status.expedition ? this.expeditionPose(entity.status.expedition, entity.id) ?? p : p);
            const retainedTravelBody = entity.status.expedition && entry.model.userData.canonical?.expedition &&
                !entity.status.aboardShip && !entry.model.userData.canonical?.aboardShip;
            if ((!entity.status.aboardShip || entry.model.parent === this.root) && !retainedTravelBody) {
                entry.model.position.set(display.x, display.y, display.z);
                entry.model.rotation.set(0, display.rotation, 0);
            }
            await this.models.reconcile(entry.model, entity);
            if (this.disposed || !current()) {
                transitionOld?.homeLight?.dispose();
                transitionOld?.season?.dispose();
                if (transitionOld) this.remove(transitionOld.model);
                return;
            }
            if (entity.status.mining || entry.model.userData.insideMine) {
                entry.model.userData.insideMine = miningDisplay?.inside ?? false;
                entry.model.visible = !entry.model.userData.insideMine;
            }
            entry.homeLight?.setInhabited(entity.status.inhabited === true);
            this.models.setEmbarked?.(entry.model, !!entity.status.aboardShip);
            if (entity.kind === 'persona' && !entry.model.userData.appearance) entry.model.scale.setScalar(p.scale);
            if (entity.kind === 'cattle' && entity.status.assignment) {
                const home = this.entries.get('building:' + entity.status.assignment)?.model;
                const yard = home?.getObjectByName('farmHutTerrain') ?? home?.getObjectByName('farmyardMarker');
                if (yard) {
                    yard.updateWorldMatrix(true, false);
                    const previous = entry.yardFloor;
                    // The authored yard is static. Reuse only this instance's exact query;
                    // world replacement, another yard, or any transform/point change invalidates it.
                    if (!previous || previous.yard !== yard || previous.x !== p.x ||
                        previous.y !== p.y || previous.z !== p.z ||
                        yard.matrixWorld.elements.some((value, index) => value !== previous.matrix[index])) {
                        this.root.updateMatrixWorld(true);
                        const height = new Raycaster(new Vector3(p.x, p.y + 20, p.z), new Vector3(0, -1, 0))
                            .intersectObject(yard, true)[0]?.point.y;
                        entry.yardFloor = { yard, matrix: [...yard.matrixWorld.elements],
                            x: p.x, y: p.y, z: p.z, height };
                    }
                    const floor = entry.yardFloor!.height;
                    if (floor !== undefined)
                        entry.model.position.y = floor;
                } else entry.yardFloor = undefined;
            } else entry.yardFloor = undefined;
            entry.model.userData.canonical = { kind: entity.kind, id: entity.id, ...entity.status };
            entry.model.updateMatrixWorld(true);
            characterSync(observe && (sample => observe({ ...sample, subject: entity.id })), 'reconciliation-bounds-registration', () => {
                const boundsSignature = JSON.stringify([entity.asset, this.models.boundsShape(entry.model) ?? entity.dna, entity.transform!.scale, entity.transform!.rotation, entry.model.userData.clothingSet?.id]);
                if (entry.boundsSignature !== boundsSignature) {
                    entry.localBounds = new Box3().setFromObject(entry.model, true).translate(entry.model.position.clone().negate());
                    entry.modelBounds = entry.localBounds.clone().translate(entry.model.position)
                        .applyMatrix4(entry.model.matrixWorld.clone().invert());
                    entry.boundsSignature = boundsSignature;
                }
            }, entity.asset);
            if (construct) {
                this.root.add(this.construction.root);
                const old = transitionOld;
                this.construction.play(entity.selectionKey, entry.model, old?.model, old ? () => {
                    old.homeLight?.dispose();
                    old.season?.dispose();
                    this.remove(old.model);
                } : undefined);
            }
            progress?.(++prepared, visible.length, entity, started);
        }
        // Four stable deck anchors, using the existing characters and their appearance resources.
        for (const { model } of this.entries.values()) {
            const facts = model.userData.canonical;
            if (!facts?.aboardShip) continue;
            const hull = this.entries.get('longship:' + facts.aboardShip)?.model;
            const anchor = longshipDeckAnchors[facts.aboardAnchor as 0 | 1 | 2 | 3];
            if (!hull || !anchor) continue;
            if (model.parent !== hull) hull.add(model);
            model.position.set(anchor[0], anchor[1], anchor[2]);
            model.rotation.set(0, 0, 0);
            model.updateMatrixWorld(true);
        }
        this.constructionInitialized = true;
        this.refreshHomeGround();
    }
    bounds(key: string) {
        const entry = this.entries.get(key);
        if (entry?.model.userData.canonical?.aboardShip) {
            entry.model.updateWorldMatrix(true, false);
            return entry.modelBounds?.clone().applyMatrix4(entry.model.matrixWorld);
        }
        return entry?.localBounds?.clone().translate(entry.model.position);
    }
    setCulturalParticipants(frame: CulturalPresentationFrame | null) {
        const keys = new Set(frame?.visible ? frame.participantKeys : []);
        for (const [key, entry] of this.entries)
            this.models.setOccupationToolsVisible(entry.model, !keys.has(key));
    }
    playCulture(bank: CulturalMotion, frame: CulturalPresentationFrame) {
        const keys = frame.phase === 'gathering' ? frame.participantKeys.slice(0, 1) : frame.participantKeys;
        const clip = frame.phase === 'gathering' ? 'Storytelling_Gesture' : 'Gathering_Applause';
        for (const key of keys) {
            const model = this.entries.get(key)?.model;
            if (!model?.visible || model.userData.canonical?.expedition || model.userData.canonical?.mining) continue;
            void this.models.playCulture(model, bank, clip, { eventId: frame.id, visible: frame.visible });
        }
    }
    weddingResidents(keys: readonly string[]) {
        return keys.slice(0, 8).flatMap(key => {
            const model = this.entries.get(key)?.model;
            const facts = model?.userData.canonical;
            const human = model && this.models.weddingResident(model);
            return model?.visible && facts?.kind === 'persona' && facts.living !== false &&
                !facts.expedition && !facts.mining && !facts.aboardShip && human ? [{ id: facts.id as string, human }] : [];
        });
    }
    residentForPortrait(input: PortraitRequest) {
        const model = this.entries.get('persona:' + input.residentId)?.model;
        return model ? this.models.residentForPortrait(model, input) : undefined;
    }
    /** Expanded targets use CSS pixels and current moving bodies, independently of render DPR. */
    pick(camera: Camera, x: number, y: number,
        viewport: { left: number; top: number; width: number; height: number },
        pointerType: 'mouse' | 'touch' = 'mouse', targetKind?: 'longship') {
        if (viewport.width <= 0 || viewport.height <= 0) return null;
        this.root.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2((x - viewport.left) / viewport.width * 2 - 1,
            -(y - viewport.top) / viewport.height * 2 + 1), camera);
        const canonical = (node: Object3D | null) => {
            while (node && !node.userData.canonical) node = node.parent;
            return node?.userData.canonical ?? null;
        };
        const visible = (node: Object3D | null) => {
            while (node) {
                if (!node.visible) return false;
                node = node.parent;
            }
            return true;
        };
        const exact = canonical(ray.intersectObject(this.root, true)
            .find(hit => visible(hit.object))?.object ?? null);
        if (targetKind ? exact?.kind === targetKind :
            pointerType !== 'touch' || exact?.kind === 'persona' || exact?.kind === 'cattle')
            return exact;
        const candidates: { facts: { kind: string; id: string }; distance: number; depth: number }[] = [];
        for (const [key, entry] of this.entries) {
            const facts = entry.model.userData.canonical;
            if (targetKind ? facts.kind !== targetKind : facts.kind !== 'persona' && facts.kind !== 'cattle') continue;
            const bounds = this.bounds(key);
            if (!bounds || !entry.model.visible) continue;
            const center = bounds.getCenter(new Vector3()), projected = center.clone().project(camera);
            if (projected.z < -1 || projected.z > 1) continue;
            const points = [];
            for (const px of [bounds.min.x, bounds.max.x])
                for (const py of [bounds.min.y, bounds.max.y])
                    for (const pz of [bounds.min.z, bounds.max.z]) {
                        const p = new Vector3(px, py, pz).project(camera);
                        points.push({
                            x: viewport.left + (p.x + 1) * viewport.width / 2,
                            y: viewport.top + (1 - p.y) * viewport.height / 2
                        });
                    }
            const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
            const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
            const screenX = (minX + maxX) / 2, screenY = (minY + maxY) / 2;
            // Ship destinations include hull/sail gaps and nearby water on mouse and touch.
            const minimumHalfSize = targetKind === 'longship' ? 28 : 22;
            const padding = targetKind === 'longship' ? 18 : 8;
            const halfWidth = Math.max(minimumHalfSize, (maxX - minX) / 2 + padding);
            const halfHeight = Math.max(minimumHalfSize, (maxY - minY) / 2 + padding);
            if (Math.abs(x - screenX) > halfWidth || Math.abs(y - screenY) > halfHeight) continue;
            // Enlarging a target must not make a resident selectable through a nearer home.
            ray.setFromCamera(new Vector2(projected.x, projected.y), camera);
            const body = ray.ray.intersectBox(bounds, new Vector3());
            const foreground = ray.intersectObject(this.root, true).find(hit => visible(hit.object));
            const foregroundFacts = foreground && canonical(foreground.object);
            if (body && foreground && foregroundFacts?.id !== facts.id &&
                !(targetKind === 'longship' && foregroundFacts?.aboardShip === facts.id) &&
                foreground.distance + .01 < body.distanceTo(ray.ray.origin)) continue;
            candidates.push({ facts, distance: Math.hypot(x - screenX, y - screenY), depth: projected.z });
        }
        candidates.sort((a, b) => a.distance - b.distance || a.depth - b.depth ||
            a.facts.id.localeCompare(b.facts.id));
        return candidates[0]?.facts ?? (targetKind ? null : exact);
    }
    configureMotion(motion: LivingWorldController) {
        for (const id of this.yardSamplers.keys())
            if (!this.entries.get('building:' + id)?.model.userData.canonical.farmyard) this.yardSamplers.delete(id);
        for (const [key, entry] of this.entries) {
            motion.setPace(key, this.models.pace(entry.model), this.models.pace(entry.model, 'Run'));
            motion.setSocialEnabled(key, this.models.socialEnabled(entry.model));
            motion.setActivityClips(key, this.models.activityClips(entry.model));
            motion.setOccupationClips(key, this.models.occupationClips(entry.model));
            const canonical = entry.model.userData.canonical;
            if (canonical?.grazingZone !== 'yard') continue;
            const farm = this.entries.get('building:' + canonical.assignment)?.model;
            const yard = farm?.getObjectByName('farmHutTerrain') ?? farm?.getObjectByName('farmyardMarker');
            if (!yard || !farm) continue;
            farm.updateWorldMatrix(true, false);
            const yardVersion = farm.uuid + ':' + JSON.stringify(farm.matrixWorld.elements);
            let sampler = this.yardSamplers.get(canonical.assignment);
            if (!sampler || sampler.signature !== yardVersion) {
                const house = farm.getObjectByName(farm.userData.asset);
                sampler = {
                    signature: yardVersion,
                    sample: createFjordYardSurface(yard, house, farm.position.y)
                };
                this.yardSamplers.set(canonical.assignment, sampler);
            }
            const clearance = livestockPresentation(entry.model.userData.asset)?.radius ?? .9;
            const sample = sampler.sample;
            motion.setYardSurface(key, (x, z) => sample(x, z, clearance), yardVersion + ':' + clearance);
        }
    }
    advance(motion: LivingWorldController, delta: number, running: boolean) {
        this.workSounds = [];
        for (const [key, death] of this.deaths) {
            death.presentation.advance(delta, running);
            if (death.presentation.inspect().complete) this.finishDeath(key);
        }
        for (const frame of this.miningFrames.values()) frame.elapsed += running ? delta : 0;
        const travelTargets: ExpeditionMotionTarget[] = [];
        for (const frame of this.expeditionFrames.values()) {
            frame.elapsed += running ? delta : 0;
            if (frame.mission.transport?.phase === 'embarked') continue;
            const points = new Map(frame.mission.memberIds.filter(id =>
                this.entries.get('persona:' + id)?.model.userData.canonical?.expedition === frame.mission.id)
                .map(id => [id, this.expeditionPose(frame.mission.id, id)!]));
            const arrived = frame.mission.status === 'Exploring' &&
                (frame.from === frame.mission.travelled || frame.elapsed >= frame.duration);
            const goals = this.expeditionStanding!.targets(frame.mission.id, points, arrived);
            for (const [id, point] of goals) travelTargets.push({ key: 'persona:' + id, point,
                settled: arrived, speed: Math.max(4, 3 / this.expeditionTickSeconds) });
        }
        if (travelTargets.length) motion.followExpeditions(travelTargets, running ? delta : 0);
        for (const { model } of this.entries.values()) {
            const facts = model.userData.canonical;
            const frame = facts?.shipExpedition && this.expeditionFrames.get(facts.shipExpedition);
            if (!frame) continue;
            const pose = this.expeditionPose(frame.mission.id, frame.mission.memberIds[0]);
            if (pose) { model.position.set(pose.x, pose.y, pose.z); model.rotation.y = pose.rotation; }
        }
        for (const entry of this.entries.values()) {
            const facts = entry.model.userData.canonical;
            if (facts?.aboardShip) {
                const hull = this.entries.get('longship:' + facts.aboardShip)?.model;
                const anchor = longshipDeckAnchors[facts.aboardAnchor as 0 | 1 | 2 | 3];
                if (anchor && entry.model.parent === hull) {
                    entry.model.position.set(anchor[0], anchor[1], anchor[2]);
                    entry.model.rotation.set(0, 0, 0);
                }
                continue;
            }
            if (facts?.mining) {
                const pose = this.miningPose(facts.id);
                if (pose) {
                    entry.model.position.set(pose.x, pose.y, pose.z);
                    entry.model.rotation.set(0, pose.rotation, 0);
                    entry.model.userData.insideMine = pose.inside;
                    entry.model.visible = !pose.inside;
                    if (pose.inside) continue;
                    this.models.animate(entry.model, pose.moving ? 'Run' : pose.working ? 'Attack' : 'Idle',
                        pose.moving ? this.models.pace(entry.model, 'Run') : 1, running ? delta : 0);
                }
            }
        }

        for (const agent of motion.inspect()) {
            const model = this.entries.get(agent.key)?.model;
            // Passengers and miners retain their own physical owners; residents share body traffic.
            if (!model || model.userData.canonical?.aboardShip || model.userData.canonical?.mining) continue;
            model.position.set(agent.x, agent.y, agent.z);
            model.rotation.y = agent.rotation;
            this.models.animate(model, agent.state, agent.speed, running ? delta : 0);
            const facts = model.userData.canonical, animation = model.userData.motion;
            if (facts.workEligible && facts.occupation === 'woodworker' &&
                agent.visit?.phase === 'activity' && animation?.sourceClip === 'Attack') {
                this.workSounds.push({ id: agent.key, target: agent.visit.source,
                    position: { x: agent.x, y: agent.y + 1, z: agent.z },
                    generation: model.uuid + ':' + animation.generation, loop: animation.loop,
                    clip: animation.sourceClip, time: animation.clipTime, duration: animation.duration });
            }
        }
    }
    /** Read-only current visual poses. Excludes passengers, removed and hidden actors. */
    soundActors(visible: (x: number, z: number) => boolean): SoundActor[] {
        const actors: SoundActor[] = [];
        for (const [id, { model }] of this.entries) {
            const facts = model.userData.canonical;
            if (facts?.kind !== 'cattle' || !facts.living || facts.expedition || facts.aboardShip) continue;
            const position = model.getWorldPosition(new Vector3());
            if (!visible(position.x, position.z)) continue;
            actors.push({ id, kind: 'livestock', species: facts.species ?? 'cattle',
                sex: facts.sex, stage: facts.stage, observable: true,
                position: { x: position.x, y: position.y + .5, z: position.z } });
            if (actors.length >= 64) break;
        }
        return actors;
    }
    soundActivities(visible: (x: number, z: number) => boolean) {
        return this.workSounds.filter(source => visible(source.position.x, source.position.z));
    }
    /** Only moving producer anchors are needed each frame; full diagnostics are throttled. */
    productionAnchors() {
        return [...this.entries].flatMap(([key, entry]) => {
            const facts = entry.model.userData.canonical;
            if (!entry.model.visible || facts.kind !== 'persona' && facts.kind !== 'cattle') return [];
            return [{ id: facts.id, kind: facts.kind, bounds: this.bounds(key)! }];
        });
    }
    humanPositions() {
        return [...this.entries.values()].flatMap(({ model }) =>
            model.userData.canonical?.kind === 'persona' && model.visible
                ? [(() => { const p = model.getWorldPosition(new Vector3()); return { x: p.x, z: p.z }; })()] : []);
    }
    performanceCounts() {
        let renderedResidents = 0, renderedLivestock = 0;
        for (const [key, entry] of this.entries) {
            if (!entry.model.visible) continue;
            if (key.startsWith('persona:')) renderedResidents++;
            if (key.startsWith('cattle:')) renderedLivestock++;
        }
        return { renderedResidents, renderedLivestock };
    }
    describe() {
        this.root.updateMatrixWorld(true);
        return [...this.entries].map(([key, entry]) => ({
            key, renderId: entry.model.uuid, ...entry.model.userData.canonical,
            visible: entry.model.visible, insideMine: entry.model.userData.insideMine === true,
            position: entry.model.getWorldPosition(new Vector3()).toArray(),
            asset: entry.model.userData.asset, scale: entry.model.scale.toArray(),
            bounds: this.bounds(key),
            appearance: entry.model.userData.appearance, motion: entry.model.userData.motion,
            clothing: entry.model.userData.clothingSet,
            placeholder: (() => {
                let result = false;
                entry.model.traverse(n => {
                    if (n.userData.placeholder)
                        result = true;
                });
                return result;
            })(),
        }));
    }
    retainVisibleDeaths(visible: (x: number, z: number) => boolean) {
        for (const [key, death] of this.deaths)
            if (!visible(death.model.position.x, death.model.position.z)) this.finishDeath(key);
    }
    describeDeaths() {
        return [...this.deaths].map(([key, death]) => ({ key, position: death.model.position.toArray(),
            ...death.presentation.inspect() }));
    }
    private finishDeath(key: string) {
        const death = this.deaths.get(key);
        if (!death) return;
        death.presentation.dispose();
        this.remove(death.model);
        this.deaths.delete(key);
    }
    private remove(model: Object3D) {
        model.removeFromParent();
        if (this.models.release(model)) return;
        model.traverse(node => {
            if (node instanceof SkinnedMesh)
                node.skeleton.dispose();
        });
    }
    dispose() {
        this.disposed = true;
        this.construction.dispose();
        this.homeGround?.dispose();
        for (const { model } of this.entries.values())
            if (model.userData.canonical?.aboardShip && model.parent !== this.root) this.root.attach(model);
        for (const key of this.deaths.keys()) this.finishDeath(key);
        for (const entry of this.entries.values()) {
            entry.homeLight?.dispose();
            entry.season?.dispose();
            this.remove(entry.model);
        }
        this.select([]);
        this.entries.clear();
        this.expeditionFrames.clear();
        this.expeditionStanding = undefined;
        this.yardSamplers.clear();
        this.root.removeFromParent();
    }
}
