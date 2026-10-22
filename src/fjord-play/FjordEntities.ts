import { spatialMemberPosition, type SpatialMission } from '../simulation/SpatialExpeditions';
import type { SimulationState } from '../simulation/SimulationCore';
import { createBlueprintSurface, type TerrainSurface } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { StructureSeasonTint } from '../world/StructureSeasonTint';
import { createFjordYardSurface } from './FjordYardSurface';
import type { LivingWorldController } from './LivingWorldController';
import type { SelectionMarker } from '../play/SelectionPresentation';
import { Box3, Camera, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, Raycaster, RingGeometry, SkinnedMesh, Vector2, Vector3 } from 'three';
import { FjordModels } from './FjordModels';
import type { FjordEntity } from './FjordProjection';
import { livestockPresentation } from '../characters/LivestockPresentation';
import type { LivestockDeath } from './LivestockDeath';
import { longshipDeckAnchors } from './LongshipDeck';

interface YardFloor {
    yard: Object3D;
    matrix: number[];
    x: number;
    y: number;
    z: number;
    height?: number;
}

/** Reconcile canonical identities; unchanged objects and the environment remain alive. */
export class FjordEntities {
    readonly root = new Group();
    private entries = new Map<string, {
        signature: string;
        model: Object3D;
        season?: StructureSeasonTint;
        localBounds?: Box3;
        modelBounds?: Box3;
        boundsSignature?: string;
        yardFloor?: YardFloor;
    }>();
    private deaths = new Map<string, { model: Object3D; presentation: LivestockDeath }>();
    private expeditionSurface?: TerrainSurface;
    private expeditionWorld?: WorldBlueprint;
    private expeditionFrames = new Map<string, { mission: SpatialMission; from: number; elapsed: number; duration: number }>();
    prepareExpeditions(state: SimulationState, world: WorldBlueprint, updateIntervalSeconds = .5) {
        if (this.expeditionWorld !== world) {
            this.expeditionWorld = world;
            this.expeditionSurface = createBlueprintSurface(world);
            this.expeditionFrames.clear();
            for (const entry of this.entries.values()) entry.yardFloor = undefined;
        }
        const active = Object.values(state.world?.spatial?.missions ?? {}).filter(m => m.status !== 'Returned' && m.status !== 'Prepared');
        const ids = new Set(active.map(m => m.id));
        for (const id of this.expeditionFrames.keys()) if (!ids.has(id)) this.expeditionFrames.delete(id);
        for (const mission of active) {
            const previous = this.expeditionFrames.get(mission.id);
            if (previous?.mission === mission) continue;
            const ratio = previous ? Math.min(1, previous.elapsed / previous.duration) : 1;
            // A new route starts at an authoritative reached position, not a distance on the old path.
            const sameRoute = previous && JSON.stringify(previous.mission.route) === JSON.stringify(mission.route);
            const from = sameRoute ? previous.from + (previous.mission.travelled - previous.from) * ratio : mission.travelled;
            // Spread a coalesced Core update across its actual cadence, instead of one 180ms tick.
            const duration = Math.min(1, Math.max(updateIntervalSeconds, previous?.elapsed ?? updateIntervalSeconds));
            this.expeditionFrames.set(mission.id, { mission, from, elapsed: 0, duration });
        }
    }
    private expeditionPose(missionId: string, personaId?: string) {
        const frame = this.expeditionFrames.get(missionId);
        if (!frame) return;
        const travelled = frame.from + (frame.mission.travelled - frame.from) * Math.min(1, frame.elapsed / frame.duration);
        const point = spatialMemberPosition({ ...frame.mission, travelled }, personaId ?? frame.mission.memberIds[0]);
        return { ...point, y: frame.mission.transport?.phase === 'embarked' ? this.expeditionWorld!.waterLevel + .15 :
            this.expeditionSurface!.surfaceHeightAt(point.x, point.z) };
    }
    private disposed = false;
    private seasonProgress: number | null = null;
    private yardSamplers = new Map<string, { signature: string; sample: (x: number, z: number, clearance: number) => number | null }>();
    private markers = new Map<string, {
        mesh: Mesh<RingGeometry, MeshBasicMaterial>;
        radius: number;
    }>();
    constructor(private models: FjordModels) {
    }
    setSeason(progress: number | null) {
        this.seasonProgress = progress;
        for (const entry of this.entries.values()) entry.season?.update(progress);
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
        livestockDeaths: readonly { id: string }[] = []) {
        if (this.disposed || !current()) return;
        // Passenger roots remain independently owned; detach before removing/replacing any hull.
        for (const { model } of this.entries.values())
            if (model.userData.canonical?.aboardShip && model.parent !== this.root) this.root.attach(model);
        const visible = entities.filter(e => e.transform !== null);
        const wanted = new Set(visible.map(e => e.selectionKey));
        const confirmedDeaths = new Set(livestockDeaths.map(fact => fact.id));
        for (const key of this.deaths.keys()) if (wanted.has(key)) this.finishDeath(key);
        for (const [key, entry] of this.entries)
            if (!wanted.has(key)) {
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
            const signature = entity.asset + ':' + (entity.terrainAsset ?? '');
            let entry = this.entries.get(entity.selectionKey);
            if (!entry || entry.signature !== signature) {
                const model = await this.models.create(entity);
                model.userData.asset = entity.asset;
                if (this.disposed || !current()) {
                    this.remove(model);
                    return;
                }
                if (entry) {
                    entry.season?.dispose();
                    this.remove(entry.model);
                }
                const season = entity.kind === 'building' || entity.kind === 'household' || entity.kind === 'campfire'
                    ? new StructureSeasonTint(model) : undefined;
                season?.update(this.seasonProgress);
                entry = { signature, model, season };
                this.entries.set(entity.selectionKey, entry);
                this.root.add(model);
            }
            const p = entity.transform!;
            entry.model.name = entity.selectionKey;
            const display = entity.status.shipExpedition ? this.expeditionPose(entity.status.shipExpedition) ?? p :
                entity.status.expedition ? this.expeditionPose(entity.status.expedition, entity.id) ?? p : p;
            entry.model.position.set(display.x, display.y, display.z);
            entry.model.rotation.y = display.rotation;
            await this.models.reconcile(entry.model, entity);
            if (this.disposed || !current()) return;
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
            const boundsSignature = JSON.stringify([entity.asset, this.models.boundsShape(entry.model) ?? entity.dna, entity.transform!.scale, entity.transform!.rotation, entry.model.userData.clothingSet?.id]);
            if (entry.boundsSignature !== boundsSignature) {
                entry.localBounds = new Box3().setFromObject(entry.model, true).translate(entry.model.position.clone().negate());
                entry.modelBounds = entry.localBounds.clone().translate(entry.model.position)
                    .applyMatrix4(entry.model.matrixWorld.clone().invert());
                entry.boundsSignature = boundsSignature;
            }
        }
        // Four stable deck anchors, using the existing characters and their appearance resources.
        for (const { model } of this.entries.values()) {
            const facts = model.userData.canonical;
            if (!facts?.aboardShip) continue;
            const hull = this.entries.get('longship:' + facts.aboardShip)?.model;
            const anchor = longshipDeckAnchors[facts.aboardAnchor as 0 | 1 | 2 | 3];
            if (!hull || !anchor) continue;
            hull.add(model);
            model.position.set(anchor[0], anchor[1], anchor[2]);
            model.rotation.y = 0;
            model.updateMatrixWorld(true);
        }
    }
    bounds(key: string) {
        const entry = this.entries.get(key);
        if (entry?.model.userData.canonical?.aboardShip) {
            entry.model.updateWorldMatrix(true, false);
            return entry.modelBounds?.clone().applyMatrix4(entry.model.matrixWorld);
        }
        return entry?.localBounds?.clone().translate(entry.model.position);
    }
    /** Touch targets use CSS pixels and current moving bodies, independently of render DPR. */
    pick(camera: Camera, x: number, y: number,
        viewport: { left: number; top: number; width: number; height: number },
        pointerType: 'mouse' | 'touch' = 'mouse') {
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
        const exact = canonical(ray.intersectObject(this.root, true)[0]?.object ?? null);
        if (pointerType !== 'touch' || exact?.kind === 'persona' || exact?.kind === 'cattle')
            return exact;
        const candidates: { facts: { kind: string; id: string }; distance: number; depth: number }[] = [];
        for (const [key, entry] of this.entries) {
            const facts = entry.model.userData.canonical;
            if (facts.kind !== 'persona' && facts.kind !== 'cattle') continue;
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
            // At least 44 x 44 CSS pixels; small models also get forgiving edge padding.
            const halfWidth = Math.max(22, (maxX - minX) / 2 + 8);
            const halfHeight = Math.max(22, (maxY - minY) / 2 + 8);
            if (Math.abs(x - screenX) > halfWidth || Math.abs(y - screenY) > halfHeight) continue;
            // Enlarging a target must not make a resident selectable through a nearer home.
            ray.setFromCamera(new Vector2(projected.x, projected.y), camera);
            const body = ray.ray.intersectBox(bounds, new Vector3());
            const foreground = ray.intersectObject(this.root, true)[0];
            if (body && foreground && canonical(foreground.object)?.id !== facts.id &&
                foreground.distance + .01 < body.distanceTo(ray.ray.origin)) continue;
            candidates.push({ facts, distance: Math.hypot(x - screenX, y - screenY), depth: projected.z });
        }
        candidates.sort((a, b) => a.distance - b.distance || a.depth - b.depth ||
            a.facts.id.localeCompare(b.facts.id));
        return candidates[0]?.facts ?? exact;
    }
    configureMotion(motion: LivingWorldController) {
        for (const id of this.yardSamplers.keys())
            if (!this.entries.get('building:' + id)?.model.userData.canonical.farmyard) this.yardSamplers.delete(id);
        for (const [key, entry] of this.entries) {
            motion.setPace(key, this.models.pace(entry.model));
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
        for (const [key, death] of this.deaths) {
            death.presentation.advance(delta, running);
            if (death.presentation.inspect().complete) this.finishDeath(key);
        }
        for (const frame of this.expeditionFrames.values()) frame.elapsed += running ? delta : 0;
        for (const { model } of this.entries.values()) {
            const facts = model.userData.canonical;
            const frame = facts?.shipExpedition && this.expeditionFrames.get(facts.shipExpedition);
            if (!frame) continue;
            const pose = this.expeditionPose(frame.mission.id, frame.mission.memberIds[0]);
            if (pose) { model.position.set(pose.x, pose.y, pose.z); model.rotation.y = pose.rotation; }
        }
        for (const entry of this.entries.values()) {
            const facts = entry.model.userData.canonical;
            if (facts?.expedition) {
                const pose = this.expeditionPose(facts.expedition, facts.id);
                if (pose && !facts.aboardShip) {
                    entry.model.position.set(pose.x, pose.y, pose.z);
                    entry.model.rotation.y = pose.rotation;
                }
                this.models.animate(entry.model, !facts.aboardShip && pose?.moving ? 'Run' : 'Idle', 1, running ? delta : 0);
            }
        }
        for (const agent of motion.inspect()) {
            const model = this.entries.get(agent.key)?.model;
            if (!model) continue;
            model.position.set(agent.x, agent.y, agent.z);
            model.rotation.y = agent.rotation;
            this.models.animate(model, agent.state, agent.speed, running ? delta : 0);
        }
    }
    /** Only moving producer anchors are needed each frame; full diagnostics are throttled. */
    productionAnchors() {
        return [...this.entries].flatMap(([key, entry]) => {
            const facts = entry.model.userData.canonical;
            if (facts.kind !== 'persona' && facts.kind !== 'cattle') return [];
            return [{ id: facts.id, kind: facts.kind, bounds: this.bounds(key)! }];
        });
    }
    humanPositions() {
        return [...this.entries.values()].flatMap(({ model }) =>
            model.userData.canonical?.kind === 'persona' && model.visible
                ? [(() => { const p = model.getWorldPosition(new Vector3()); return { x: p.x, z: p.z }; })()] : []);
    }
    describe() {
        this.root.updateMatrixWorld(true);
        return [...this.entries].map(([key, entry]) => ({
            key, renderId: entry.model.uuid, ...entry.model.userData.canonical,
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
        for (const { model } of this.entries.values())
            if (model.userData.canonical?.aboardShip && model.parent !== this.root) this.root.attach(model);
        for (const key of this.deaths.keys()) this.finishDeath(key);
        for (const entry of this.entries.values()) {
            entry.season?.dispose();
            this.remove(entry.model);
        }
        this.select([]);
        this.entries.clear();
        this.expeditionFrames.clear();
        this.yardSamplers.clear();
        this.root.removeFromParent();
    }
}
