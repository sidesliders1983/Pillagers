import { coastalAnimalRig, poseCoastalAnimal, type CoastalAnimalRig } from './CoastalAnimalMotion';
import {
    prepareGullWings, gullWingRig, gullWingMotion, poseGullWings,
    gullFoldedWings, poseGroundedGull, type GullWingRig,
} from './GullWings';
import { AnimationMixer, Frustum, Group, Matrix4, Mesh, Quaternion, Sphere, Texture, Vector3, type Camera, type Bone } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { terrainGradientAt } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { wildlifeAssetManifest } from './WildlifeAssetManifest';
import { WildlifePopulation, type WildlifeActor } from './WildlifePopulation';
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
    actor: WildlifeActor;
    root: Group;
    mixer?: AnimationMixer;
    legs: LegPose[];
    coastal?: CoastalAnimalRig;
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
                    const root = new Group(), model = clone(source.scene);
                    root.name = 'wildlife:' + actor.id;
                    root.add(model);
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
                    layer.records.push({ actor, root, mixer, coastal,
                        legs: mixer || coastal || id.startsWith('gull-') ? [] : legPoses(model as Group),
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
    setHumans(positions: readonly { x: number; z: number }[]) {
        this.population.setHumans(positions);
    }
    setObstacles(obstacles: readonly WildlifeObstacle[]) { this.population.habitats.setObstacles(obstacles); }
    advance(delta: number, running: boolean, camera?: Camera) {
        if (this.disposed)
            return;
        this.population.advance(Math.min(1, delta), running);
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
            root.position.set(actor.position.x, actor.position.y, actor.position.z);
            root.rotation.set(0, actor.heading + look, actor.bank);
            if (actor.variant.movement === 'ground') {
                const gradient = terrainGradientAt(this.population.world, actor.position.x, actor.position.z);
                this.surfaceNormal.set(-gradient.x, 1, -gradient.z).normalize();
                this.surfaceTilt.setFromUnitVectors(this.up, this.surfaceNormal);
                root.quaternion.premultiply(this.surfaceTilt);
            }
            if (water) {
                const immersion = actor.species === 'otter' ? .35
                    : actor.species === 'puffin' ? .45 : .6;
                root.position.y -= record.height * immersion;
                root.position.y += Math.sin(this.population.time * 1.4 + actor.phase) * .025;
                root.rotation.x = Math.sin(this.population.time + actor.phase) * .035;
            }
            root.visible = this.known(actor.position.x, actor.position.z)
                && (airborne || this.population.habitats.valid(actor.position, actor.variant));
            if (camera) {
                this.sphere.center.copy(root.position).y += record.height * .5;
                this.sphere.radius = record.radius;
                root.visible &&= this.frustum.intersectsSphere(this.sphere);
            }
            if (!root.visible || camera && root.position.distanceToSquared(this.cameraPoint) > 200 * 200)
                continue;
            if (record.wings) {
                const pose = gullWingMotion(this.population.time, actor.phase, false, actor.flapEffort);
                poseGullWings(record.wings, pose.flap);
            }
            if (record.foldedWings) {
                poseGroundedGull(record.foldedWings, gullWingMotion(this.population.time, actor.phase, true).fold);
            }
            if (airborne)
                root.rotation.x = -Math.atan2(actor.climbRate, actor.speed) * .3;
            if (record.coastal) {
                poseCoastalAnimal(record.coastal, {
                    time: this.population.time, delta: running ? delta : 0, phase: actor.phase,
                    moving, water, speed: gaitSpeed,
                });
            }
            else if (record.mixer) {
                record.mixer.setTime(moving ? this.population.time * gaitSpeed + actor.phase : 0);
            }
            else
                for (const leg of record.legs) {
                    leg.bone.quaternion.copy(leg.rest);
                    if (moving)
                        leg.bone.quaternion.premultiply(new Quaternion().setFromAxisAngle(leg.axis, Math.sin(this.population.time * 5 * Math.max(.4, gaitSpeed) + actor.phase + leg.phase) * .22));
                }
        }
    }
    inspect() {
        return { version: 'wildlife-v0.1', population: this.population.inspect(),
            diagnostics: [...this.population.diagnostics, ...this.diagnostics],
            rendered: this.records.filter(record => record.root.visible).length,
            instances: this.records.length, sharedAssets: this.leases.size };
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.records.forEach(record => {
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
