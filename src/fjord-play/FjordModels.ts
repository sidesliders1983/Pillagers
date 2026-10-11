import { MeshyHumanFactory, meshyAnimationClips, type MeshyHuman } from '../characters/MeshyHuman';
import { universalHumanProfile } from '../characters/UniversalHumanProfile';
import { humanPreviewGroundSpeed } from '../character-lab/HumanPreviewPace';
import { AnimationMixer, LoopOnce, LoopRepeat, Box3, BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AssetManager } from '../core/AssetManager';
import { placeSettlement } from '../world/PlaceSettlement';
import type { FjordEntity } from './FjordProjection';
/** Reuse verified Fjordside DNA bodies and source livestock clips, with independent instance ownership. */
export class FjordModels {
    readonly diagnostics: string[] = [];
    private humans = new MeshyHumanFactory();
    private actors = new Map<Object3D, { human?: MeshyHuman; mixer?: AnimationMixer;
        clips?: import('three').AnimationClip[]; action?: import('three').AnimationAction;
        fingerprint?: string; resumeGrazeTime?: number; pace: number; groundSpeed: number; state: string }>();
    reconcile(model: Object3D, entity: FjordEntity) {
        const actor = this.actors.get(model);
        if (!actor?.human || !entity.dna) return;
        const fingerprint = JSON.stringify(entity.dna);
        if (actor.fingerprint !== fingerprint) {
            model.scale.setScalar(1);
            actor.human.applyDNA({ ...entity.dna, age: Math.min(100, entity.dna.age) });
            actor.fingerprint = fingerprint;
            const profile = universalHumanProfile({ ...entity.dna, age: Math.min(100, entity.dna.age) });
            model.scale.setScalar(entity.transform!.scale / (1 - .35 * profile.weights.Child));
            const position = model.position.clone(), rotation = model.quaternion.clone();
            model.position.set(0, 0, 0); model.quaternion.identity();
            try { actor.groundSpeed = humanPreviewGroundSpeed(actor.human, 'Walk'); }
            finally { model.position.copy(position); model.quaternion.copy(rotation); }
            if (!actor.human.clips.some(c => c.name === 'Walking'))
                this.diagnostics.push(entity.id + ': missing Walking source clip; stable Idle pose fallback.');
            actor.human.setAnimation('Idle');
            actor.pace = actor.groundSpeed * profile.motion.cadence;
            actor.state = 'Idle';
        }
        model.userData.appearance = model.userData.universalHumanProfile;
        model.userData.pace = actor.pace;
    }
    pace(model: Object3D) { return this.actors.get(model)?.pace ?? 0; }
    activityClips(model: Object3D) {
        const actor = this.actors.get(model);
        const available: { Graze?: number; HumanInteraction?: number } = {};
        if (!actor?.mixer) return available;
        for (const name of ['Graze', 'HumanInteraction'] as const) {
            const clip = actor.clips?.find(clip => clip.name === name);
            if (clip) available[name] = clip.duration;
            else {
                const message = model.name + ': missing ' + name + ' source clip; activity unavailable.';
                if (!this.diagnostics.includes(message)) this.diagnostics.push(message);
            }
        }
        return available;
    }
    occupationClips(model: Object3D) {
        const actor = this.actors.get(model);
        const result: { Farm?: number; Attack?: number; Doze?: number } = {};
        if (!actor?.human) return result;
        const cadence = model.userData.universalHumanProfile?.motion.cadence ?? 1;
        for (const state of ['Farm', 'Attack', 'Doze'] as const) {
            const clip = actor.human.clips.find(clip => clip.name === meshyAnimationClips[state]);
            if (clip) result[state] = clip.duration / cadence;
        }
        if (!result.Doze) {
            const message = 'Fisher Doze off source binding unavailable; bounded shore visits use Idle.';
            if (!this.diagnostics.includes(message)) this.diagnostics.push(message);
        }
        return result;
    }
    socialEnabled(model: Object3D) {
        const human = this.actors.get(model)?.human;
        const available = Boolean(human && ['Talk', 'Listen'].every(state =>
            human.clips.some(clip => clip.name === meshyAnimationClips[state as 'Talk' | 'Listen'])));
        if (human && !available) {
            const message = model.name + ': missing Talk/Listen source clips; social encounters disabled.';
            if (!this.diagnostics.includes(message)) this.diagnostics.push(message);
        }
        return available;
    }
    animate(model: Object3D, state: 'Idle' | 'Walk' | 'Talk' | 'Listen' | 'Graze' | 'HumanInteraction' | 'Farm' | 'Attack' | 'Doze', speed: number, delta: number) {
        const actor = this.actors.get(model);
        if (!actor) return;
        if (actor.human) {
            const humanState = state === 'Graze' || state === 'HumanInteraction' ? 'Idle' : state;
            if (actor.human.clips.some(c => c.name === meshyAnimationClips[humanState])) {
                actor.human.setAnimation(humanState);
                actor.human.setPlaybackRate(state === 'Walk' ? Math.max(.05, speed / Math.max(.01, actor.groundSpeed)) : null);
                actor.human.update(delta);
            }
        } else if (actor.mixer) {
            const clip = actor.clips!.find(c => c.name === state);
            if (clip && actor.state !== state) {
                if (actor.state === 'Graze' && state === 'HumanInteraction' && actor.action) {
                    actor.resumeGrazeTime = actor.action.time;
                    actor.action.paused = true;
                }
                const next = actor.mixer.clipAction(clip).reset();
                next.paused = false;
                if (state === 'Graze' && actor.resumeGrazeTime !== undefined) {
                    next.time = actor.resumeGrazeTime;
                    actor.resumeGrazeTime = undefined;
                }
                const once = state === 'Graze' || state === 'HumanInteraction';
                next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
                next.clampWhenFinished = once;
                next.play();
                actor.action?.crossFadeTo(next, .15, false);
                actor.action = next; actor.state = state;
            }
            actor.mixer.timeScale = state === 'Walk' ? Math.max(.05, speed / Math.max(.01, actor.pace)) : 1;
            actor.mixer.update(delta);
        }
        model.userData.motion = { state, speed, clipTime: actor.human?.animationState.time ?? actor.action?.time, sourceClip: actor.human?.root.userData.clip ?? actor.action?.getClip().name ?? 'static-fallback', clip: actor.human?.animationState.animation ?? actor.action?.getClip().name ?? 'static-fallback' };
    }
    inspectResources() {
        return { actors: this.actors.size, sourceTemplates: this.templates.size,
            ownedInstanceRoots: this.instanceResources.size };
    }
    release(model: Object3D) {
        const actor = this.actors.get(model);
        if (actor?.human) actor.human.dispose();
        if (actor?.mixer) { actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(model); }
        this.actors.delete(model);
        model.traverse(node => {
            if (!this.instanceResources.delete(node)) return;
            this.loaded.delete(node);
            node.traverse(child => {
                if (!(child instanceof Mesh)) return;
                child.geometry.dispose();
                for (const material of Array.isArray(child.material) ? child.material : [child.material])
                    material.dispose();
            });
        });
        return Boolean(actor?.human);
    }
    private templates = new Map<string, Promise<Object3D>>();
    private loaded = new Set<Object3D>();
    private instanceResources = new Set<Object3D>();
    private motionSources = new WeakMap<Object3D, { clips: import('three').AnimationClip[]; pace: number }>();
    private draco = new DRACOLoader().setDecoderPath(import.meta.env.BASE_URL + 'draco/');
    private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(this.draco);
    constructor(private assets: AssetManager) { }
    async create(entity: FjordEntity): Promise<Object3D> {
        if (entity.kind === 'persona' && entity.dna) {
            try {
                const human = await this.humans.createWorld({ ...entity.dna, age: Math.min(100, entity.dna.age) });
                this.actors.set(human.root, { human, pace: 0, groundSpeed: 0, state: 'Idle' });
                this.reconcile(human.root, entity);
                return human.root;
            } catch (error) {
                this.diagnostics.push(entity.id + ': DNA body unavailable; explicit static fallback — ' + String(error));
            }
        }
        if (entity.kind === 'building') {
            const model = placeSettlement(this.assets, [{ id: entity.selectionKey, key: entity.asset,
                    terrainKey: entity.terrainAsset === 'farmyardMarker' ? undefined : entity.terrainAsset, x: 0, z: 0, rotation: 0,
                    halfWidth: entity.plot!.halfWidth, halfDepth: entity.plot!.halfDepth, radius: 9 }], () => 0);
            const sourcedYard = model.getObjectByName('farmHutTerrain');
            if (sourcedYard) {
                // The native parcel leaves too little clearance for four mature source bodies.
                // Use the existing reserved plot while retaining the authored fences/props and house size.
                const size = new Box3().setFromObject(sourcedYard).getSize(new Vector3());
                sourcedYard.scale.x *= Math.max(1, (entity.plot!.halfWidth * 2 - .02) / size.x);
                sourcedYard.scale.z *= Math.max(1, (entity.plot!.halfDepth * 2 - .02) / size.z);
            }
            if (entity.terrainAsset === 'farmyardMarker') {
                const yard = new Mesh(new BoxGeometry(12, .03, 12), new MeshStandardMaterial({
                    color: 0x566b38, roughness: 1, transparent: true, opacity: .25, depthWrite: false
                }));
                yard.position.y = .015;
                yard.name = 'farmyardMarker';
                yard.userData.placeholder = true;
                model.add(yard);
                // Marker resources are instance-specific; source house resources stay asset-owned.
                this.loaded.add(yard);
                this.instanceResources.add(yard);
            }
            const size = new Box3().setFromObject(model).getSize(new Vector3());
            if (size.x > entity.plot!.halfWidth * 2 || size.z > entity.plot!.halfDepth * 2) {
                this.diagnostics.push(entity.id + ': source exceeds reserved footprint; explicit house placeholder.');
                this.release(model);
                const root = new Group(), mesh = new Mesh(new BoxGeometry(4, 3, 4), new MeshStandardMaterial({ color: 0x9d8465, roughness: 1 }));
                mesh.position.y = 1.5;
                root.add(mesh);
                root.userData.placeholder = true;
                this.loaded.add(root);
                this.instanceResources.add(root);
                return root;
            }
            return model;
        }
        if (entity.kind === 'household')
            return this.assets.get('tent');
        const cacheKey = entity.asset;
        let template = this.templates.get(cacheKey);
        if (!template) {
            template = this.load(entity);
            this.templates.set(cacheKey, template);
        }
        const source = await template;
        const root = clone(source);
        if (entity.kind === 'persona') root.userData.placeholder = true;
        const sourceMotion = this.motionSources.get(source);
        if (entity.kind === 'cattle' && sourceMotion) {
            const clips = sourceMotion.clips;
            const mixer = new AnimationMixer(root), idle = clips.find(c => c.name === 'Idle');
            const action = idle ? mixer.clipAction(idle).play() : undefined;
            const pace = sourceMotion.pace;
            this.actors.set(root, { mixer, clips, action, pace, groundSpeed: pace, state: 'Idle' });
            if (!clips.some(c => c.name === 'Walk') || !idle)
                this.diagnostics.push(entity.id + ': missing Idle/Walk source clip; stable static pose fallback.');
        }
        return root;
    }
    private async load(entity: FjordEntity) {
        let url: string, height: number | undefined, pace = 0;
        try {
            if (entity.kind === 'persona') {
                url = 'game-assets/human/Human_LOD2.glb';
                height = 1.8;
            }
            else if (entity.kind === 'cattle') {
                const response = await fetch(import.meta.env.BASE_URL + 'game-assets/cattle/' + entity.asset + '/manifest.json');
                if (!response.ok)
                    throw new Error('Cattle manifest unavailable');
                const manifest = await response.json();
                if (!Number.isFinite(manifest.height) || manifest.height <= 0 ||
                    typeof manifest.file !== 'string' || /[\/\\]/.test(manifest.file))
                    throw new Error('Invalid cattle source metadata');
                url = 'game-assets/cattle/' + entity.asset + '/' + manifest.file;
                height = manifest.height;
                pace = manifest.walkSpeedMps ?? .28;
            }
            else
                url = 'assets/Terrain/longship-drakkar.glb';
            const gltf = await this.loader.loadAsync(import.meta.env.BASE_URL + url);
            const source = gltf.scene;
            source.updateMatrixWorld(true);
            const bounds = new Box3().setFromObject(source), size = bounds.getSize(new Vector3());
            if (!Number.isFinite(size.y) || size.y <= 0)
                throw new Error('Invalid model bounds');
            const scale = height === undefined ? 1 : height / size.y;
            source.scale.multiplyScalar(scale);
            const center = bounds.getCenter(new Vector3());
            source.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
            const root = new Group();
            root.add(source);
            this.motionSources.set(root, { clips: gltf.animations, pace });
            root.traverse(node => { if (node instanceof Mesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            } });
            this.loaded.add(root);
            return root;
        }
        catch (error) {
            this.diagnostics.push(entity.asset + ': explicit metric placeholder — ' + String(error));
            const root = new Group();
            const person = entity.kind === 'persona';
            const dimensions: [
                number,
                number,
                number
            ] = entity.kind === 'longship' ? [1.5, .5, 4] :
                entity.asset === 'baby' ? [.4, .6, .9] : [.6, 1.1, 1.6];
            const mesh = new Mesh(person ? new CapsuleGeometry(.2, 1.4, 3, 6) : new BoxGeometry(...dimensions), new MeshStandardMaterial({ color: person ? 0xc6ad86 : 0x887461, roughness: 1 }));
            mesh.position.y = person ? .9 : dimensions[1] / 2;
            root.add(mesh);
            root.userData.placeholder = true;
            this.loaded.add(root);
            return root;
        }
    }
    dispose() {
        for (const model of this.actors.keys()) this.release(model);
        const geometries = new Set<import('three').BufferGeometry>();
        const materials = new Set<import('three').Material>();
        const textures = new Set<import('three').Texture>();
        for (const root of this.loaded)
            root.traverse(node => {
                if (!(node instanceof Mesh))
                    return;
                geometries.add(node.geometry);
                for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                    materials.add(material);
                    for (const value of Object.values(material))
                        if (value && typeof value === 'object' && 'isTexture' in value)
                            textures.add(value as import('three').Texture);
                }
            });
        for (const resource of [...geometries, ...materials, ...textures])
            resource.dispose();
        this.templates.clear();
        this.loaded.clear();
        this.instanceResources.clear();
        this.draco.dispose();
    }
}
