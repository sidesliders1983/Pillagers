import { PerspectiveCamera, Vector3 } from 'three';
import type { RTSCameraController } from '../camera/RTSCameraController';

type View = { position: number[]; target: number[] };
type Frame = { id: string; phase: string; phaseElapsedSeconds?: number;
    position: { x: number; y: number; z: number }; wedding?: { elapsed: number; duration: number; rotation?: number } };
const ease = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };

/** The existing presentation clock selects bounded local shots; Core and game speed are absent. */
export class WeddingCamera {
    private previous?: View & { enabled: boolean };
    private id?: string;
    private shots: View[] = [];
    constructor(private readonly camera: PerspectiveCamera, private readonly controller: RTSCameraController,
        private readonly safe: (point: { x: number; y: number; z: number }) => boolean) {}
    begin(frame: Frame, original?: View): boolean {
        if (!frame.wedding || this.id === frame.id) return false;
        this.restore();
        const center = frame.position;
        const rotation = frame.wedding.rotation ?? 0;
        const rotate = (offset: number[]) => new Vector3(...offset).applyAxisAngle(new Vector3(0, 1, 0), rotation)
            .add(new Vector3(center.x, center.y, center.z)).toArray();
        const target = rotate([0, 1.1, -8]);
        this.shots = [[4, 2.6, -14], [2.2, 2, -11.6], [-3.4, 2.4, -13], [4, 2.6, -14]]
            .map(offset => ({ position: rotate(offset), target: [...target] }))
            .filter(view => this.safe({ x: view.position[0], y: view.position[1], z: view.position[2] }));
        // A steep local slope can rule out every low view. Keep a terrain-safe fallback,
        // rather than moving a low camera through the ground or undiscovered terrain.
        if (!this.shots.length) this.shots = [[10, 9, -17], [-8, 5.1, -13]]
            .map(offset => ({ position: rotate(offset), target: [...target] }))
            .filter(view => this.safe({ x: view.position[0], y: view.position[1], z: view.position[2] }));
        if (!this.shots.length) return false;
        this.previous = { ...(original ?? { position: this.camera.position.toArray(), target: this.controller.focus.toArray() }),
            enabled: this.controller.enabled };
        this.controller.enabled = false;
        this.id = frame.id;
        return true;
    }
    update(frame: Frame, coupleCenter: Vector3, reducedMotion: boolean) {
        if (!this.previous || frame.id !== this.id || !frame.wedding || !this.shots.length) return;
        const progress = Math.max(0, Math.min(1, frame.wedding.elapsed / frame.wedding.duration));
        const markers = [0, .25, .65, 1];
        let index = 0;
        while (index < 2 && progress > markers[index + 1]) index++;
        if (reducedMotion) index = 0;
        const first = this.shots[Math.min(index, this.shots.length - 1)];
        const second = this.shots[Math.min(index + 1, this.shots.length - 1)];
        const blend = reducedMotion ? 0 : ease((progress - markers[index]) / (markers[index + 1] - markers[index]));
        const eye = new Vector3().fromArray(first.position).lerp(new Vector3().fromArray(second.position), blend);
        const center = new Vector3().fromArray(first.target);
        if (frame.phase !== 'approach' && coupleCenter.distanceTo(center) < 8) center.lerp(coupleCenter, .65);
        const originalEye = new Vector3().fromArray(this.previous.position);
        // Never fly across undiscovered geography from a distant previous viewpoint.
        if (!reducedMotion && frame.phase === 'approach' && originalEye.distanceTo(eye) < 30 &&
            this.safe({ x: originalEye.x, y: originalEye.y, z: originalEye.z })) {
            const enter = ease((frame.phaseElapsedSeconds ?? 0) / 2.5);
            eye.lerp(originalEye, 1 - enter);
            center.lerp(new Vector3().fromArray(this.previous.target), 1 - enter);
        }
        if (this.safe({ x: eye.x, y: eye.y, z: eye.z }))
            this.controller.setView({ position: eye.toArray(), target: center.toArray() });
    }
    restore() {
        const previous = this.previous;
        this.previous = undefined; this.id = undefined; this.shots = [];
        if (previous) {
            this.controller.setView(previous);
            this.controller.enabled = previous.enabled;
        }
    }
    get active() { return !!this.previous; }
    dispose() { this.restore(); }
}
