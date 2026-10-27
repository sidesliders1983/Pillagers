import { Bone, Group, Mesh, Quaternion, Vector3, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetDigest } from '../characters/AssetDigest';
import type { MeshyHuman } from '../characters/MeshyHuman';
import { weddingAssets } from './WeddingAssets';
import type { WeddingInstrument, WeddingRole } from './WeddingCast';

export type WeddingResident = { id: string; human: MeshyHuman };
type Performer = WeddingResident & { role: WeddingRole; prop?: Object3D;
    pose?: { bone: Bone; before: Quaternion; applied: Quaternion }[] };
const point = (x: number, y: number, z: number) => new Vector3(x, y, z);

function disposeAsset(root: Object3D) {
    const textures = new Set<Texture>();
    root.traverse(node => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            for (const value of Object.values(material)) if ((value as Texture)?.isTexture) textures.add(value as Texture);
            material.dispose();
        }
    });
    for (const texture of textures) { texture.dispose(); (texture.image as ImageBitmap)?.close?.(); }
}
function swing(joint: Bone, child: Bone, target: Vector3) {
    const origin = joint.getWorldPosition(new Vector3());
    const current = child.getWorldPosition(new Vector3()).sub(origin).normalize();
    const desired = target.clone().sub(origin).normalize();
    const world = new Quaternion().setFromUnitVectors(current, desired).multiply(joint.getWorldQuaternion(new Quaternion()));
    const parent = joint.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    joint.quaternion.copy(parent.invert().multiply(world));
    joint.updateWorldMatrix(false, true);
}
/** Analytic two-bone reach, using the actual native skeleton and current DNA proportions. */
function reach(human: MeshyHuman, side: 'Left' | 'Right', target: Vector3) {
    const find = (part: string) => human.fit.nativeSkeleton.bones.find(bone => bone.name.endsWith(side + part));
    const upper = find('Arm'), lower = find('ForeArm'), hand = find('Hand');
    if (!upper || !lower || !hand) return 0;
    const a = upper.getWorldPosition(new Vector3()), b = lower.getWorldPosition(new Vector3());
    const c = hand.getWorldPosition(new Vector3());
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    if (l1 < .001 || l2 < .001) return 0;
    const vector = target.clone().sub(a);
    const distance = Math.max(.01, Math.min(vector.length(), l1 + l2 - .001));
    const direction = vector.normalize();
    const bend = point(side === 'Left' ? 1 : -1, -.65, -.15)
        .transformDirection(human.root.matrixWorld);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const along = Math.max(-l1, Math.min(l1, (l1 * l1 + distance * distance - l2 * l2) / (2 * distance)));
    const elbow = a.clone().addScaledVector(direction, along)
        .addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    swing(upper, lower, elbow);
    swing(lower, hand, target);
    return hand.getWorldPosition(new Vector3()).distanceTo(target);
}

/** At most three shared rigid props; all bodies/rigs remain the existing live residents. */
export class WeddingEnsemble {
    private templates = new Map<WeddingInstrument, Group>();
    private performers = new Map<string, Performer>();
    private preparation?: Promise<void>;
    private disposed = false;
    private maximumGripError = 0;
    private failures: string[] = [];
    private downloads = new AbortController();
    constructor(private readonly download: (url: string) => Promise<ArrayBuffer> = async url => {
        const response = await fetch(url, { signal: this.downloads.signal });
        if (!response.ok) throw new Error('Wedding instrument unavailable.');
        return response.arrayBuffer();
    }, private readonly base = '/') {}
    prepare(): Promise<void> {
        if (this.disposed) return Promise.resolve();
        return this.preparation ??= Promise.all(weddingAssets.instruments.map(async asset => {
            try {
                const bytes = await this.download(this.base + 'game-assets/wedding/' + asset.file);
                if (bytes.byteLength !== asset.bytes || await assetDigest(bytes) !== asset.sha256)
                    throw new Error('Wedding instrument identity differs.');
                const gltf = await new GLTFLoader().parseAsync(bytes, '');
                if (this.disposed) { disposeAsset(gltf.scene); return; }
                gltf.scene.name = asset.id;
                gltf.scene.traverse(node => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; } });
                this.templates.set(asset.id, gltf.scene);
            } catch { if (!this.disposed) this.failures.push(asset.id); }
        })).then(() => {});
    }
    update(roles: readonly WeddingRole[], residents: readonly WeddingResident[], seconds: number) {
        if (this.disposed) return;
        const active = new Set<string>();
        this.maximumGripError = 0;
        for (const role of roles.slice(0, 8)) {
            const resident = residents.find(item => item.id === role.id && !item.human.isDisposed);
            if (!resident) continue;
            active.add(role.id);
            let performer = this.performers.get(role.id);
            if (performer && (performer.human !== resident.human || performer.role.role !== role.role ||
                performer.role.instrument !== role.instrument)) {
                this.release(performer); this.performers.delete(role.id); performer = undefined;
            }
            if (!performer) {
                performer = { ...resident, role };
                this.performers.set(role.id, performer);
            }
            if (role.instrument && !performer.prop && this.templates.has(role.instrument)) {
                performer.prop = this.templates.get(role.instrument)!.clone(true);
                resident.human.root.add(performer.prop);
            }
            this.pose(performer, seconds);
        }
        for (const [id, performer] of this.performers) if (!active.has(id)) {
            this.release(performer); this.performers.delete(id);
        }
    }
    private pose(performer: Performer, seconds: number) {
        const { human, role, prop } = performer;
        // The native mixer normally supplies a fresh base every frame. Also support repeated
        // zero-time inspection without accumulating our own overlay.
        for (const saved of performer.pose ?? [])
            if (saved.bone.quaternion.equals(saved.applied)) saved.bone.quaternion.copy(saved.before);
        performer.pose ??= human.fit.nativeSkeleton.bones.filter(bone => /(Left|Right)(Arm|ForeArm)$/.test(bone.name))
            .map(bone => ({ bone, before: bone.quaternion.clone(), applied: bone.quaternion.clone() }));
        for (const saved of performer.pose) saved.before.copy(saved.bone.quaternion);
        const h = Math.max(1.3, Math.min(2.2, Number(human.root.userData.character?.height) || 1.75));
        const scale = h / 1.75, pulse = Math.sin(seconds * Math.PI * 3.2);
        let left: Vector3, right: Vector3;
        if (role.instrument === 'wedding-lyre') {
            if (prop) { prop.position.set(.08 * scale, h * .48, h * .09); prop.scale.setScalar(scale); }
            left = point(.21 * scale, h * .48 + .35 * scale, h * .09 + .035 * scale);
            right = point(-.035 * scale, h * .48 + (.30 + .018 * pulse) * scale, h * .09 + .08 * scale);
        } else if (role.instrument === 'wedding-flute') {
            const head = human.fit.nativeSkeleton.bones.find(bone => bone.name.endsWith('Head'));
            human.root.updateWorldMatrix(true, true);
            const mouth = head ? human.root.worldToLocal(head.getWorldPosition(new Vector3())) : point(0, h * .88, 0);
            mouth.add(point(0, -.08 * scale, .14 * scale));
            if (prop) { prop.position.copy(mouth); prop.scale.set(.32 * scale, .13 * scale, .13 * scale); }
            left = mouth.clone().add(point(.14 * scale, .02 * scale, .025 * scale));
            right = mouth.clone().add(point(-.14 * scale, .02 * scale, .025 * scale));
        } else if (role.instrument === 'wedding-frame-drum') {
            if (prop) { prop.position.set(.10 * scale, h * .56, h * .11); prop.scale.setScalar(scale); }
            left = point(.28 * scale, h * .56 + .20 * scale, h * .11 + .015 * scale);
            right = point(-.01 * scale, h * .56 + .22 * scale, h * .11 + (.075 + .025 * pulse) * scale);
        } else {
            human.root.updateWorldMatrix(true, true);
            const shoulders = human.fit.nativeSkeleton.bones.filter(bone => /(Left|Right)Arm$/.test(bone.name));
            const center = shoulders.reduce((sum, bone) => sum.add(bone.getWorldPosition(new Vector3())), new Vector3())
                .divideScalar(Math.max(1, shoulders.length));
            human.root.worldToLocal(center);
            const clapping = role.role === 'clapper';
            const gap = clapping ? .035 + .12 * (.5 + .5 * pulse) : .18;
            const drop = clapping ? .18 : role.role === 'officiant' ? .20 : .30;
            left = center.clone().add(point(gap * scale, -drop * scale, .20 * scale));
            right = center.clone().add(point(-gap * scale,
                (-drop + (role.role === 'officiant' ? .025 * pulse : 0)) * scale, .20 * scale));
        }
        human.root.updateWorldMatrix(true, true);
        this.maximumGripError = Math.max(this.maximumGripError,
            reach(human, 'Left', human.root.localToWorld(left)), reach(human, 'Right', human.root.localToWorld(right)));
        for (const saved of performer.pose) saved.applied.copy(saved.bone.quaternion);
    }
    private release(performer: Performer) {
        performer.prop?.removeFromParent();
        if (!performer.human.isDisposed) {
            for (const saved of performer.pose ?? [])
                if (saved.bone.quaternion.equals(saved.applied)) saved.bone.quaternion.copy(saved.before);
            performer.human.root.updateWorldMatrix(true, true);
        }
    }
    stop() {
        for (const performer of this.performers.values()) this.release(performer);
        this.performers.clear();
    }
    inspect() {
        return { actors: this.performers.size, instruments: [...this.performers.values()].filter(item => !!item.prop).length,
            templates: this.templates.size, maximumGripError: this.maximumGripError, unavailable: [...this.failures] };
    }
    dispose() {
        if (this.disposed) return;
        this.stop();
        this.disposed = true;
        this.downloads.abort();
        for (const root of this.templates.values()) disposeAsset(root);
        this.templates.clear();
    }
}
