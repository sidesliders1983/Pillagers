import { LoopOnce, type AnimationAction, type AnimationClip, type AnimationMixer,
    type Material, type Mesh, type Object3D } from 'three';

/** Ephemeral presentation. The canonical animal is already dead before this begins. */
export class LivestockDeath {
    private elapsed = 0;
    private opacity = 1;
    private disposed = false;
    private materials: { mesh: Mesh; original: Material | Material[]; instances: Material[] }[] = [];
    private action: AnimationAction;

    constructor(private model: Object3D, private mixer: AnimationMixer, private clip: AnimationClip,
        previous?: AnimationAction) {
        model.traverse(object => {
            const mesh = object as Mesh;
            if (!mesh.isMesh) return;
            const original = mesh.material;
            const instances = (Array.isArray(original) ? original : [original]).map(material => material.clone());
            mesh.material = Array.isArray(original) ? instances : instances[0];
            this.materials.push({ mesh, original, instances });
        });
        this.action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1);
        this.action.clampWhenFinished = true;
        this.action.play();
        previous?.crossFadeTo(this.action, .15, false);
        mixer.timeScale = 1;
        mixer.update(0);
        model.userData.death = this.inspect();
    }

    advance(delta: number, running: boolean) {
        if (this.disposed || !running || !Number.isFinite(delta) || delta <= 0) return;
        this.elapsed += delta;
        this.mixer.update(delta);
        this.opacity = Math.max(0, 1 - Math.max(0, this.elapsed - (this.clip.duration + 2)) / 5);
        for (const { instances } of this.materials) for (const material of instances) {
            const transparent = this.opacity < 1;
            if (material.transparent !== transparent) {
                material.transparent = transparent;
                material.needsUpdate = true;
            }
            material.opacity = this.opacity;
            material.depthWrite = !transparent;
        }
        this.model.userData.death = this.inspect();
    }

    inspect() {
        return { elapsed: this.elapsed, opacity: this.opacity, complete: this.opacity === 0,
            phase: this.elapsed < this.clip.duration ? 'falling' : this.opacity === 1 ? 'lying' :
                this.opacity > 0 ? 'fading' : 'finished', clipTime: this.action?.time ?? 0 };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.action.stop();
        for (const { mesh, original, instances } of this.materials) {
            mesh.material = original;
            for (const material of instances) material.dispose();
        }
        this.materials = [];
        delete this.model.userData.death;
    }
}
