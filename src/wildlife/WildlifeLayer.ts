import { restoreWildlife } from './WildlifeSnapshot';
import type { WildlifeState } from '../simulation/WildlifeSightings';
import { animalRestRig, clearAnimalRest, poseAnimalRest, type AnimalRestRig } from './AnimalRestMotion';
import { rabbitRig, poseRabbit, type RabbitRig } from './RabbitMotion';
import { coastalAnimalRig, poseCoastalAnimal, type CoastalAnimalRig } from './CoastalAnimalMotion';
import {
    prepareGullWings, gullWingRig, gullWingMotion, poseGullWings,
    gullFoldedWings, poseGroundedGull, gullHeadLook, type GullWingRig,
} from './GullWings';
import { AnimationMixer, Frustum, Group, Matrix4, Mesh, Quaternion, Sphere, Texture, Vector3, type Camera, type Bone } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { WildlifeMotionTrack } from './WildlifeMotionTrack';
import { terrainGradientAt } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { wildlifeAssetManifest } from './WildlifeAssetManifest';
import { WildlifePopulation, type WildlifeActor } from './WildlifePopulation';
import { marinePose, wildlifeObservable } from './MarineEncounters';
import { MarineEffects } from './MarineEffects';
import { marineTailRig, poseMarineTail, otterFloatRig, clearOtterFloat, poseOtterFloat,
    otterTailPoint, otterBackPoint, type OtterFloatRig } from './MarineMotion';
import type { WildlifeObstacle } from './WildlifeHabitats';
interface CachedAsset {
    promise: Promise<GLTF>;
    users: number;
}
const assets = new Map<string, CachedAsset>();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
function acquire(id: string) {
    let cached = assets.get(id);
    if (!cached) {
        const entry = wildlifeAssetManifest.find(item => item.id === id);
        if (!entry)
            throw new Error('Unknown wildlife asset: ' + id);
        cached = { promise: loader.loadAsync(entry.path), users: 0 };
        assets.set(id, cached);
    }
    cached.users++;
    return cached.promise;
}
function release(id: string) {
    const cached = assets.get(id);
    if (!cached || --cached.users > 0)
        return;
    assets.delete(id);
    void cached.promise.then(source => {
        const geometry = new Set<import('three').BufferGeometry>();
        const materials = new Set<import('three').Material>();
        const textures = new Set<import('three').Texture>();
        source.scene.traverse(node => {
            if (!(node instanceof Mesh))
                return;
            geometry.add(node.geometry);
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                materials.add(material);
                for (const value of Object.values(material))
                    if (value instanceof Texture)
                        textures.add(value);
            }
        });
        geometry.forEach(value => value.dispose());
        materials.forEach(value => value.dispose());
        textures.forEach(value => { value.dispose(); value.image?.close?.(); });
    }, () => { });
}
export interface WildlifeSources {
    acquire(id: string): Promise<GLTF>;
    release(id: string): void;
}
const defaultSources: WildlifeSources = { acquire, release };
interface LegPose {
    bone: Bone;
    rest: Quaternion;
    axis: Vector3;
    phase: number;
}
interface RenderActor {
    presentedPosition?: Vector3;
    motion?: WildlifeMotionTrack;
    actor: WildlifeActor;
    root: Group;
    body: Group;
    floating?: OtterFloatRig;
    marineTail?: ReturnType<typeof marineTailRig>;
    effects?: MarineEffects;
    mixer?: AnimationMixer;
    legs: LegPose[];
    coastal?: CoastalAnimalRig;
    rabbit?: RabbitRig;
    resting?: AnimalRestRig;
    wings?: GullWingRig[];
    foldedWings?: Mesh[];
    height: number;
    radius: number;
}
/** Reuses existing source limb chains for a small procedural walk when no authored clip is supplied. */
function legPoses(root: Group): LegPose[] {
    root.updateMatrixWorld(true);
    const bones: Bone[] = [];
    root.traverse(node => {
        if ((node as Bone).isBone)
            bones.push(node as Bone);
    });
    if (!bones.length)
        return [];
    const hip = bones[0].getWorldPosition(new Vector3());
    const groups = new Map<string, {
        bone: Bone;
        point: Vector3;
    }>();
    for (const bone of bones) {
        const point = bone.getWorldPosition(new Vector3());
        if (Math.abs(point.x - hip.x) < .025 || point.y > hip.y * 1.35 || point.y < hip.y * .55)
            continue;
        let lowest = Infinity;
        bone.traverse(child => {
            if ((child as Bone).isBone)
                lowest = Math.min(lowest, child.getWorldPosition(new Vector3()).y);
        });
        if (lowest > hip.y * .3)
            continue;
        const key = (point.x < hip.x ? 'left' : 'right') + (point.z > 0 ? 'front' : 'back');
        if (!groups.has(key) || point.y > groups.get(key)!.point.y)
            groups.set(key, { bone, point });
    }
    return [...groups].map(([key, { bone }]) => ({ bone, rest: bone.quaternion.clone(),
        axis: new Vector3(1, 0, 0).applyQuaternion(bone.parent!.getWorldQuaternion(new Quaternion()).invert()),
        phase: key === 'leftfront' || key === 'rightback' ? 0 : Math.PI }));
}
/** Ambient visual layer. Loading, habitat search and actor creation occur once per world, never per camera move. */
export class WildlifeLayer {
    readonly root = new Group();
    readonly population: WildlifePopulation;
    readonly diagnostics: string[] = [];
    private records: RenderActor[] = [];
    private leases = new Set<string>();
    private disposed = false;
    private frustum = new Frustum();
    private projection = new Matrix4();
    private sphere = new Sphere();
    private cameraPoint = new Vector3();
    private surfaceNormal = new Vector3();
    private surfaceTilt = new Quaternion();
    private up = new Vector3(0, 1, 0);
    private waterHeight?: (x: number, z: number) => number;
    private floatTailPoint = new Vector3();
    private constructor(world: WorldBlueprint, private known: (x: number, z: number) => boolean, private sources: WildlifeSources) {
        this.population = new WildlifePopulation(world);
        this.root.name = 'Ambient wildlife';
    }
    static async create(world: WorldBlueprint, known: (x: number, z: number) => boolean = () => true, sources: WildlifeSources = defaultSources) {
        const layer = new WildlifeLayer(world, known, sources);
        try {
            const ids = [...new Set(layer.population.actors.map(actor => actor.variant.asset))];
            const loads = await Promise.allSettled(ids.map(async (id) => {
                layer.leases.add(id);
                const source = await layer.sources.acquire(id);
                if (id.startsWith('gull-'))
                    prepareGullWings(source.scene, id === 'gull-standing');
                for (const actor of layer.population.actors.filter(item => item.variant.asset === id)) {
                    const entry = wildlifeAssetManifest.find(item => item.id === id)!;
                    const root = new Group(), body = new Group(), model = clone(source.scene);
                    root.name = 'wildlife:' + actor.id;
                    root.add(body);
                    body.add(model);
                    const floating = actor.variant.behavior === 'otter_shore_water'
                        ? otterFloatRig(model as Group, root) : undefined;
                    if (floating) {
                        body.position.y = (entry.bounds.max[1] + entry.bounds.min[1]) * .5;
                        model.position.y -= body.position.y;
                    }
                    const effects = actor.marine ? new MarineEffects(actor.variant.encounter!.canonicalLength) : undefined;
                    if (effects) layer.root.add(effects.root);
                    model.traverse(node => {
                        if (node instanceof Mesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                            node.frustumCulled = false;
                        }
                    });
                    const mixer = source.animations.length ? new AnimationMixer(model) : undefined;
                    if (mixer)
                        mixer.clipAction(source.animations[0]).play();
                    const coastal = mixer ? undefined : coastalAnimalRig(model as Group, actor.species);
                    const rabbit = actor.species === 'rabbit' ? rabbitRig(model as Group, root) : undefined;
                    layer.records.push({ actor, root, body, mixer, coastal, rabbit, floating, effects,
                        motion: actor.variant.movement === 'ground' || actor.variant.movement === 'shore'
                            ? new WildlifeMotionTrack(actor.position, actor.heading) : undefined,
                        marineTail: actor.marine ? marineTailRig(model as Group, actor.species) : undefined,
                        resting: mixer ? animalRestRig(model as Group, root, actor.species) : undefined,
                        legs: mixer || coastal || rabbit || actor.marine || id.startsWith('gull-') ? [] : legPoses(model as Group),
                        wings: id === 'gull-flying' ? gullWingRig(model as Group) : undefined,
                        foldedWings: id === 'gull-standing' ? gullFoldedWings(model as Group) : undefined,
                        height: entry.bounds.max[1] - entry.bounds.min[1],
                        radius: Math.hypot(...entry.bounds.max.map((value, i) => value - entry.bounds.min[i])) * .5 + .15 });
                    layer.root.add(root);
                }
            }));
            const failure = loads.find(result => result.status === 'rejected');
            if (failure?.status === 'rejected')
                throw failure.reason;
            layer.advance(0, false);
            return layer;
        }
        catch (error) {
            layer.dispose();
            throw error;
        }
    }
    private canonical?: WildlifeState;
    private animationTime = 0;
    private canonicalPending = false;
    private lastCanonicalTime = 0;
    private targetPosition = new Vector3();
    useCanonical(snapshot?: WildlifeState, updateIntervalSeconds = .5) {
        if (snapshot === this.canonical) return;
        if (snapshot) {
            const duration = Math.max(updateIntervalSeconds, this.animationTime - this.lastCanonicalTime);
            restoreWildlife(this.population, snapshot.actors, this.animationTime, snapshot.version === 1);
            for (const record of this.records) record.motion?.retarget(
                record.actor.position, record.actor.heading, duration, !this.canonical);
            this.lastCanonicalTime = this.animationTime;
        }
        this.canonical = snapshot;
        this.canonicalPending = true;
        if (!snapshot) this.records.forEach(record => { record.presentedPosition = undefined; });
    }
    setHumans(positions: readonly { x: number; z: number }[]) {
        this.population.setHumans(positions);
    }
    setObstacles(obstacles: readonly WildlifeObstacle[]) { this.population.habitats.setObstacles(obstacles); }
    setWaterHeightSampler(sample: (x: number, z: number) => number) { this.waterHeight = sample; }
    advance(delta: number, running: boolean, camera?: Camera) {
        if (this.disposed)
            return;
        if (this.canonical) {
            if (running) this.animationTime += delta;
            this.population.time = this.animationTime;
        } else {
            this.population.advance(Math.min(1, delta), running);
            this.animationTime = this.population.time;
        }
        if (camera) {
            camera.updateMatrixWorld();
            this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this.frustum.setFromProjectionMatrix(this.projection);
            camera.getWorldPosition(this.cameraPoint);
        }
        for (const record of this.records) {
            const { actor, root } = record;
            const moving = actor.state === 'roam' || actor.state === 'swim' || actor.state === 'flee';
            const gaitSpeed = actor.state === 'flee'
                ? actor.variant.fleeSpeed ?? actor.speed * 2.5 : actor.speed;
            const turnAmplitude = record.wings || record.foldedWings ? .5 : .06;
            const look = !moving && actor.variant.movement !== 'air'
                ? Math.sin(this.population.time * .25 + actor.phase) * turnAmplitude : 0;
            const water = actor.variant.movement === 'water', airborne = actor.variant.movement === 'air';
            const pose = actor.marine ? marinePose(actor) : undefined;
            const canonicalTime = this.canonical ? (this.canonical.advancedAt - this.canonical.startedAt) * .2
                : this.population.time;
            const remainingFloat = (actor.floatUntil ?? 0) - canonicalTime;
            const floatAmount = actor.state === 'back_float'
                ? Math.max(0, Math.min(1, (actor.wait - remainingFloat) / 2, remainingFloat / 2)) : 0;
            this.targetPosition.set(actor.position.x, actor.position.y, actor.position.z);
            if (record.motion) {
                if (this.canonical) record.motion.advance(delta, running, this.canonicalPending);
                else record.motion.sample(actor.position, actor.heading);
                root.position.copy(record.motion.position);
                root.position.y = this.population.habitats.surface.surfaceHeightAt(root.position.x, root.position.z);
            } else if (this.canonical) {
                // Smooth presentation between tick poses without moving the authoritative animal.
                record.presentedPosition ??= this.targetPosition.clone();
                const blend = !running ? (this.canonicalPending ? 1 : 0) : 1 - Math.exp(-12 * delta);
                record.presentedPosition.lerp(this.targetPosition, blend);
                root.position.copy(record.presentedPosition);
            } else root.position.copy(this.targetPosition);
            root.rotation.set(0, (record.motion?.heading ?? actor.heading) + look, actor.bank);
            if (pose) record.body.rotation.x = pose.pitch;
            if (actor.variant.movement === 'ground') {
                const gradient = terrainGradientAt(this.population.world, actor.position.x, actor.position.z);
                this.surfaceNormal.set(-gradient.x, 1, -gradient.z).normalize();
                this.surfaceTilt.setFromUnitVectors(this.up, this.surfaceNormal);
                root.quaternion.premultiply(this.surfaceTilt);
            }
            root.position.y += actor.hop?.lift ?? 0;
            const activeEffect = pose && (pose.wake > .01 || pose.spout > .01 || pose.splash > .01);
            const waterHeight = water && (wildlifeObservable(actor) || activeEffect)
                ? this.waterHeight?.(root.position.x, root.position.z) ?? this.population.world.waterLevel
                : this.population.world.waterLevel;
            if (water) {
                root.position.y += waterHeight - this.population.world.waterLevel;
            }
            if (water && !actor.marine) {
                const immersion = actor.species === 'otter' ? .35
                    : actor.species === 'puffin' ? .45 : .6;
                root.position.y -= record.height * (immersion - floatAmount * .1);
                root.position.y += Math.sin(this.population.time * 1.4 + actor.phase) * .025;
                root.rotation.x = Math.sin(this.population.time + actor.phase) * .035;
                record.body.rotation.z = floatAmount * (Math.PI + Math.sin(this.population.time * .6) * .035);
                record.body.rotation.x = -floatAmount * .15;
            }
            const known = this.known(actor.position.x, actor.position.z);
            let inView = true;
            root.visible = known
                && (pose ? pose.renderVisible : wildlifeObservable(actor))
                && (airborne || this.population.habitats.valid(actor.position, actor.variant));
            if (camera) {
                this.sphere.center.copy(root.position).y += record.height * .5;
                this.sphere.radius = record.radius;
                inView = this.frustum.intersectsSphere(this.sphere);
                root.visible &&= inView;
            }
            if (record.effects && pose) {
                record.effects.root.visible = known && inView && !!activeEffect;
                if (record.effects.root.visible) record.effects.update(root.position.x, waterHeight, root.position.z,
                    actor.heading, pose, this.population.time);
            }
            if (record.marineTail && pose) {
                // Finish the dive pose even on its first submerged frame; a stale lifted
                // fluke must not be hidden while its previous skin pose still clears water.
                poseMarineTail(record.marineTail, this.population.time, pose.tail, actor.species);
                continue;
            }
            if (!root.visible || camera && root.position.distanceToSquared(this.cameraPoint) > 200 * 200)
                continue;
            if (record.wings) {
                const pose = gullWingMotion(this.population.time, actor.phase, false, actor.flapEffort);
                poseGullWings(record.wings, pose.flap);
            }
            if (record.foldedWings) {
                const pose = gullWingMotion(this.population.time, actor.phase, true);
                poseGroundedGull(record.foldedWings, pose.fold,
                    gullHeadLook(this.population.time, actor.phase), pose.lower);
            }
            if (airborne)
                root.rotation.x = -Math.atan2(actor.climbRate, actor.speed) * .3;
            if (record.rabbit) {
                poseRabbit(record.rabbit, { time: this.population.time, phase: actor.phase,
                    position: actor.position, heading: actor.heading, hop: actor.hop,
                    ground: (x, z) => this.population.habitats.surface.surfaceHeightAt(x, z) });
            }
            else if (record.coastal) {
                poseCoastalAnimal(record.coastal, {
                    time: this.population.time, delta: running ? delta : 0, phase: actor.phase,
                    moving, water, speed: gaitSpeed,
                });
            }
            else if (record.mixer) {
                if (record.floating) clearOtterFloat(record.floating);
                if (record.resting) clearAnimalRest(record.resting);
                const gaitTime = record.motion ? actor.phase + record.motion.distance
                    : this.population.time * gaitSpeed + actor.phase;
                record.mixer.setTime(moving ? gaitTime : 0);
                if (record.resting && !moving)
                    poseAnimalRest(record.resting, this.population.time, actor.phase);
                if (record.floating) {
                    poseOtterFloat(record.floating, floatAmount, this.population.time);
                    const back = otterBackPoint(record.floating, this.floatTailPoint);
                    const backWater = this.waterHeight?.(back.x, back.z) ?? this.population.world.waterLevel;
                    const swimCorrection = backWater - .008 - back.y;
                    const tip = otterTailPoint(record.floating, this.floatTailPoint);
                    const surface = this.waterHeight?.(tip.x, tip.z) ?? this.population.world.waterLevel;
                    root.position.y += swimCorrection * (1 - floatAmount)
                        + (surface + .008 - tip.y) * floatAmount;
                }
            }
            else
                for (const leg of record.legs) {
                    leg.bone.quaternion.copy(leg.rest);
                    if (moving)
                        leg.bone.quaternion.premultiply(new Quaternion().setFromAxisAngle(leg.axis,
                            Math.sin((record.motion?.distance ?? this.population.time * Math.max(.4, gaitSpeed))
                                * 5 + actor.phase + leg.phase) * .22));
                }
        }
        this.canonicalPending = false;
    }
    inspect() {
        return { version: 'wildlife-v0.2', population: this.population.inspect(),
            diagnostics: [...this.population.diagnostics, ...this.diagnostics],
            rendered: this.records.filter(record => record.root.visible).length,
            instances: this.records.length, sharedAssets: this.leases.size };
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.records.forEach(record => {
            record.effects?.dispose();
            record.mixer?.stopAllAction();
            record.mixer?.uncacheRoot(record.mixer.getRoot());
            record.root.traverse(node => {
                if ('isSkinnedMesh' in node && node.isSkinnedMesh) {
                    (node as import('three').SkinnedMesh).skeleton.dispose();
                }
            });
        });
        this.root.removeFromParent();
        this.root.clear();
        this.records.length = 0;
        this.leases.forEach(id => this.sources.release(id));
        this.leases.clear();
    }
}
