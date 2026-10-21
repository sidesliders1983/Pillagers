import { Vector3 } from 'three';

interface Point { x: number; y: number; z: number }

/** Presentation only: interpolate confirmed motion without extrapolating or changing saved wildlife. */
export class WildlifeMotionTrack {
    readonly position = new Vector3();
    heading: number;
    distance = 0;
    private from = new Vector3();
    private target = new Vector3();
    private fromHeading: number;
    private targetHeading: number;
    private elapsed = 0;
    private duration = .5;
    private targetPending = false;

    constructor(point: Point, heading: number) {
        this.position.set(point.x, point.y, point.z);
        this.from.copy(this.position);
        this.target.copy(this.position);
        this.heading = this.fromHeading = this.targetHeading = heading;
    }

    retarget(point: Point, heading: number, duration: number, snap = false) {
        if (snap) {
            this.position.set(point.x, point.y, point.z);
            this.from.copy(this.position);
            this.target.copy(this.position);
            this.heading = this.fromHeading = this.targetHeading = heading;
            this.elapsed = this.duration;
            this.targetPending = false;
            return;
        }
        if (this.target.x === point.x && this.target.y === point.y &&
            this.target.z === point.z && this.targetHeading === heading) return;
        this.from.copy(this.position);
        this.target.set(point.x, point.y, point.z);
        this.fromHeading = this.heading;
        this.targetHeading = heading;
        this.elapsed = 0;
        this.duration = Math.min(1, Math.max(.001, duration));
        this.targetPending = true;
    }

    sample(point: Point, heading: number) {
        this.distance += Math.hypot(point.x - this.position.x, point.z - this.position.z);
        this.position.set(point.x, point.y, point.z);
        this.heading = heading;
    }

    advance(delta: number, running: boolean, pending: boolean) {
        if (!running) {
            // A metadata-only snapshot from the pause command must not finish a stride.
            if (pending && this.targetPending)
                this.retarget(this.target, this.targetHeading, this.duration, true);
            return;
        }
        if (!Number.isFinite(delta) || delta <= 0) return;
        this.targetPending = false;
        const x = this.position.x, z = this.position.z;
        this.elapsed = Math.min(this.duration, this.elapsed + delta);
        const ratio = this.elapsed / this.duration;
        this.position.lerpVectors(this.from, this.target, ratio);
        const turn = Math.atan2(Math.sin(this.targetHeading - this.fromHeading),
            Math.cos(this.targetHeading - this.fromHeading));
        this.heading = this.fromHeading + turn * ratio;
        this.distance += Math.hypot(this.position.x - x, this.position.z - z);
    }
}
