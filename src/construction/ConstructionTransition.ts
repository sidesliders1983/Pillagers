import {
    BoxGeometry, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh,
    Matrix4, MeshStandardMaterial, Object3D, OctahedronGeometry, Plane, Vector3
} from 'three';
import { measureBuildEnvelope, unionBuildEnvelope, type BuildEnvelope } from './BuildEnvelope';
import { generateScaffold, type ScaffoldPart } from './ScaffoldGenerator';
import { ConstructionMaterials } from './ConstructionMaterials';

export const constructionDuration = 3.2;
export const constructionFadeStart = 1.1;
export const constructionFadeDuration = .8;
const feedbackTime = constructionFadeStart + constructionFadeDuration / 2;
const ease = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return 1 - (1 - t) ** 3;
};

/** Owns shared scaffold resources; each active transition owns only instance buffers/material clips. */
export class ConstructionTransitions {
    readonly root = new Group();
    private geometry = {
        pole: new CylinderGeometry(1, 1, 1, 6), plank: new BoxGeometry(1, 1, 1),
        lashing: new BoxGeometry(1, 1, 1), turf: new BoxGeometry(1, 1, 1),
        dust: new OctahedronGeometry(1, 0)
    };
    private material = {
        pole: new MeshStandardMaterial({ color: '#705038', roughness: 1, flatShading: true }),
        plank: new MeshStandardMaterial({ color: '#a3865b', roughness: 1 }),
        lashing: new MeshStandardMaterial({ color: '#493b27', roughness: 1 }),
        turf: new MeshStandardMaterial({ color: '#5e6440', roughness: 1 }),
        dust: new MeshStandardMaterial({ color: '#b39d7b', roughness: 1, depthWrite: false })
    };
    private active = new Map<string, {
        time: number; group: Group; target: Object3D; old?: Object3D;
        envelope: BuildEnvelope; plan: ReturnType<typeof generateScaffold>;
        batches: { mesh: InstancedMesh; parts: ScaffoldPart[] }[];
        dust: InstancedMesh; plane: Plane;
        reveal?: ConstructionMaterials; oldFade?: ConstructionMaterials; targetFade?: ConstructionMaterials;
        releaseOld?: () => void; swapped: boolean; fadeProgress: number;
    }>();

    play(key: string, target: Object3D, old?: Object3D, releaseOld?: () => void) {
        this.finish(key);
        target.updateWorldMatrix(true, true);
        let envelope: BuildEnvelope = target.userData.buildEnvelope ??
            measureBuildEnvelope(target, target.userData.asset);
        if (old) {
            old.updateWorldMatrix(true, true);
            envelope = unionBuildEnvelope(envelope, old.userData.buildEnvelope ??
                measureBuildEnvelope(old, old.userData.asset),
            target.matrixWorld.clone().invert().multiply(old.matrixWorld));
        }
        const group = new Group();
        group.name = 'construction:' + key;
        group.position.copy(target.position);
        group.quaternion.copy(target.quaternion);
        group.scale.copy(target.scale);
        this.root.add(group);
        const plan = generateScaffold(envelope), batches = [];
        for (const kind of ['pole', 'plank', 'lashing', 'turf'] as const) {
            const parts = plan.parts.filter(part => part.geometry === kind);
            if (!parts.length) continue;
            const mesh = new InstancedMesh(this.geometry[kind], this.material[kind], parts.length);
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.raycast = () => {};
            group.add(mesh);
            batches.push({ mesh, parts });
        }
        const dust = new InstancedMesh(this.geometry.dust, this.material.dust, 12);
        dust.frustumCulled = false;
        dust.raycast = () => {};
        group.add(dust);
        const plane = new Plane(new Vector3(0, -1, 0), target.position.y + envelope.baseHeight - .05);
        const reveal = old ? undefined : new ConstructionMaterials(target, 'reveal', plane);
        const oldFade = old ? new ConstructionMaterials(old, 'fade') : undefined;
        const targetFade = old ? new ConstructionMaterials(target, 'fade') : undefined;
        targetFade?.setOpacity(0);
        target.visible = !old;
        this.active.set(key, { time: 0, group, target, old, envelope, plan, batches, dust,
            plane, reveal, oldFade, targetFade, releaseOld, swapped: false, fadeProgress: 0 });
        this.update(0);
    }

    private matrix = new Matrix4();
    private position = new Vector3();
    private scale = new Vector3();
    private identity = new Object3D().quaternion;

    /** Wall-clock visual feedback also completes while the campaign is paused. */
    update(delta: number) {
        for (const [key, transition] of this.active) {
            transition.time += Math.max(0, Math.min(delta, .1));
            const { time, envelope } = transition;
            if (time >= constructionDuration) { this.finish(key); continue; }
            if (transition.old) {
                const progress = Math.max(0, Math.min(1, (time - constructionFadeStart) / constructionFadeDuration));
                // Smooth start/end, with complementary opacities throughout the overlap.
                transition.fadeProgress = progress * progress * (3 - 2 * progress);
                transition.oldFade!.setOpacity(1 - transition.fadeProgress);
                transition.targetFade!.setOpacity(transition.fadeProgress);
                transition.target.visible = transition.fadeProgress > 0;
                if (progress >= 1) {
                    transition.swapped = true;
                    transition.old.visible = false;
                    // Restore before releasing: the seasonal owner must see its original bindings.
                    transition.oldFade!.dispose();
                    transition.targetFade!.dispose();
                    transition.oldFade = transition.targetFade = undefined;
                    transition.releaseOld?.();
                    transition.releaseOld = undefined;
                    transition.old = undefined;
                }
            }
            const reveal = Math.max(0, Math.min(1, (time - 1) / 1.05));
            transition.plane.constant = transition.target.position.y + envelope.baseHeight - .05 +
                (envelope.ridgeHeight - envelope.baseHeight + .1) * reveal;
            for (const batch of transition.batches) {
                batch.parts.forEach((part, index) => {
                    const amount = ease((time - part.erect) / .25) *
                        (1 - ease((time - part.remove) / .25));
                    this.position.copy(part.start).addScaledVector(part.direction, part.length * amount / 2);
                    this.scale.set(part.width, part.length * amount, part.depth);
                    this.matrix.compose(this.position, part.rotation, this.scale);
                    batch.mesh.setMatrixAt(index, this.matrix);
                });
                batch.mesh.instanceMatrix.needsUpdate = true;
            }
            const puff = Math.max(0, Math.min(1, (time - feedbackTime) / .45));
            transition.dust.visible = puff > 0 && puff < 1;
            if (transition.dust.visible) {
                const xs = envelope.footprint.map(p => p.x), zs = envelope.footprint.map(p => p.z);
                for (let i = 0; i < 12; i++) {
                    const angle = i * Math.PI / 6;
                    this.position.set(Math.cos(angle) * (Math.max(...xs) - Math.min(...xs)) * .5,
                        envelope.baseHeight + .35 + puff * .7,
                        Math.sin(angle) * (Math.max(...zs) - Math.min(...zs)) * .5);
                    this.scale.setScalar(Math.sin(puff * Math.PI) * (.16 + (i % 3) * .06));
                    this.matrix.compose(this.position, this.identity, this.scale);
                    transition.dust.setMatrixAt(i, this.matrix);
                }
                transition.dust.instanceMatrix.needsUpdate = true;
            }
        }
    }

    finish(key: string) {
        const transition = this.active.get(key);
        if (!transition) return;
        transition.target.visible = true;
        transition.reveal?.dispose();
        transition.oldFade?.dispose();
        transition.targetFade?.dispose();
        transition.releaseOld?.();
        for (const batch of transition.batches) batch.mesh.dispose();
        transition.dust.dispose();
        transition.group.removeFromParent();
        this.active.delete(key);
    }

    inspect() {
        return [...this.active].map(([key, value]) => ({ key, time: value.time,
            phase: value.time < .5 ? 'posts' : value.time < 1.1 ? 'frame' :
                value.time < 2.1 ? 'building' : 'dismantle',
            preset: value.envelope.scaffoldPreset, envelope: value.envelope,
            postPoints: value.plan.postPoints, pieces: value.plan.parts.length,
            drawCalls: value.batches.length + Number(value.dust.visible), swapped: value.swapped,
            fadeProgress: value.fadeProgress }));
    }

    dispose() {
        for (const key of this.active.keys()) this.finish(key);
        for (const geometry of Object.values(this.geometry)) geometry.dispose();
        for (const material of Object.values(this.material)) material.dispose();
        this.root.removeFromParent();
    }
}
