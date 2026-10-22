import { Vector3 } from 'three';

interface Point { x: number; y: number; z: number }
interface FlightPose { bank: number; climbRate: number; flapEffort: number }

function copyFlight(target: FlightPose, source: FlightPose) {
    target.bank = source.bank;
    target.climbRate = source.climbRate;
    target.flapEffort = source.flapEffort;
}

/** Presentation only: interpolate confirmed motion without extrapolating or changing saved wildlife. */
export class WildlifeMotionTrack {
    readonly position = new Vector3();
    heading: number;
    distance = 0;
    readonly flight: FlightPose = { bank: 0, climbRate: 0, flapEffort: 0 };
    private fromFlight = { ...this.flight };
    private targetFlight = { ...this.flight };
    private from = new Vector3();
    private target = new Vector3();
    private fromHeading: number;
    private targetHeading: number;
    private elapsed = 0;
    private duration = .5;
    private targetPending = false;

    constructor(point: Point, heading: number, flight?: FlightPose) {
        this.position.set(point.x, point.y, point.z);
        this.from.copy(this.position);
        this.target.copy(this.position);
        this.heading = this.fromHeading = this.targetHeading = heading;
        if (flight) {
            copyFlight(this.flight, flight);
            copyFlight(this.fromFlight, flight);
            copyFlight(this.targetFlight, flight);
        }
    }

    retarget(point: Point, heading: number, duration: number, snap = false, flight?: FlightPose) {
        if (snap) {
            this.position.set(point.x, point.y, point.z);
            this.from.copy(this.position);
            this.target.copy(this.position);
            this.heading = this.fromHeading = this.targetHeading = heading;
            if (flight) {
                copyFlight(this.flight, flight);
                copyFlight(this.fromFlight, flight);
                copyFlight(this.targetFlight, flight);
            }
            this.elapsed = this.duration;
            this.targetPending = false;
            return;
        }
        if (this.target.x === point.x && this.target.y === point.y &&
            this.target.z === point.z && this.targetHeading === heading &&
            (!flight || this.targetFlight.bank === flight.bank &&
                this.targetFlight.climbRate === flight.climbRate &&
                this.targetFlight.flapEffort === flight.flapEffort)) return;
        this.from.copy(this.position);
        this.target.set(point.x, point.y, point.z);
        this.fromHeading = this.heading;
        this.targetHeading = heading;
        copyFlight(this.fromFlight, this.flight);
        if (flight) copyFlight(this.targetFlight, flight);
        this.elapsed = 0;
        this.duration = Math.min(1, Math.max(.001, duration));
        this.targetPending = true;
    }

    sample(point: Point, heading: number, flight?: FlightPose) {
        this.distance += Math.hypot(point.x - this.position.x, point.z - this.position.z);
        this.position.set(point.x, point.y, point.z);
        this.heading = heading;
        if (flight) copyFlight(this.flight, flight);
    }

    advance(delta: number, running: boolean, pending: boolean) {
        if (!running) {
            // A metadata-only snapshot from the pause command must not finish a stride.
            if (pending && this.targetPending)
                this.retarget(this.target, this.targetHeading, this.duration, true, this.targetFlight);
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
        this.flight.bank = this.fromFlight.bank + (this.targetFlight.bank - this.fromFlight.bank) * ratio;
        this.flight.climbRate = this.fromFlight.climbRate
            + (this.targetFlight.climbRate - this.fromFlight.climbRate) * ratio;
        this.flight.flapEffort = this.fromFlight.flapEffort
            + (this.targetFlight.flapEffort - this.fromFlight.flapEffort) * ratio;
        this.distance += Math.hypot(this.position.x - x, this.position.z - z);
    }
}
