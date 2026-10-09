import { Box3, Object3D, Quaternion, Vector3 } from 'three';
import type { ReferenceWater } from '../water/ReferenceWater';

const UP = new Vector3(0, 1, 0);
// Measured grounded faering source: 1.324 × 1.181 × 4.954 m, gunwale near 0.60 m.
// The waterline is 0.24 m above the keel, leaving about 0.36 m of midship freeboard.
const WATERLINE = 0.24;
const HALF_SUPPORT_WIDTH = 0.38;
const HALF_SUPPORT_LENGTH = 1.25;

/** Four-point kinematic flotation of the original faering; no drift or source-resource ownership. */
export class BoatFloat {
    private readonly heading = new Quaternion();
    private readonly normal = new Vector3();
    private readonly localNormal = new Vector3();
    private readonly waterline: number;
    private readonly width: number;
    private readonly length: number;
    private readonly points: { x: number; z: number; height: number }[];
    private readonly authoredHeading: number;
    private time = 0;
    private readonly heights = new Float64Array(4);

    constructor(private readonly boat: Object3D) {
        if (!boat) throw new Error('The required original faering model is missing.');
        this.authoredHeading = boat.rotation.y;
        this.heading.setFromAxisAngle(UP, this.authoredHeading);
        const probe = boat.clone(true);
        probe.position.set(0, 0, 0);
        probe.quaternion.identity();
        probe.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(probe);
        const size = bounds.getSize(new Vector3());
        const scale = boat.scale.y;
        if (![scale, size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0)) {
            throw new Error('The faering has invalid source bounds.');
        }
        this.waterline = bounds.min.y + WATERLINE * scale;
        this.width = HALF_SUPPORT_WIDTH * 2 * boat.scale.x;
        this.length = HALF_SUPPORT_LENGTH * 2 * boat.scale.z;
        if (this.width >= size.x || this.length >= size.z || this.waterline >= bounds.max.y) {
            throw new Error('The measured faering support contract no longer fits the source.');
        }
        this.points = [];
        for (const z of [-this.length / 2, this.length / 2]) {
            for (const x of [-this.width / 2, this.width / 2]) {
                const point = new Vector3(x, 0, z).applyQuaternion(this.heading).add(boat.position);
                this.points.push({ x: point.x, z: point.z, height: 0 });
            }
        }
    }

    update(water: ReferenceWater, time: number) {
        // Reject invalid supports before changing the pose; never substitute zero for missing water.
        for (let index = 0; index < this.points.length; index++) {
            const point = this.points[index];
            const height = water.getHeightAt(point.x, point.z, time);
            if (height === null) {
                throw new RangeError('The moored faering must remain inside the active water mesh.');
            }
            this.heights[index] = height;
        }
        const [leftBack, rightBack, leftFront, rightFront] = this.heights;
        const slopeX = (rightBack + rightFront - leftBack - leftFront) / (2 * this.width);
        const slopeZ = (leftFront + rightFront - leftBack - rightBack) / (2 * this.length);
        this.localNormal.set(-slopeX, 1, -slopeZ).normalize();
        this.normal.copy(this.localNormal).applyQuaternion(this.heading);
        this.boat.quaternion.setFromUnitVectors(UP, this.normal).multiply(this.heading);
        const average = (leftBack + rightBack + leftFront + rightFront) / 4;
        this.boat.position.y = average - this.waterline * this.normal.y;
        for (let index = 0; index < this.points.length; index++) {
            this.points[index].height = this.heights[index];
        }
        this.time = time;
    }

    describe() {
        return {
            time: this.time, waterline: this.waterline, heading: this.authoredHeading,
            supportWidth: this.width, supportLength: this.length,
            supports: this.points.map(point => ({ ...point })),
            position: this.boat.position.toArray(), quaternion: this.boat.quaternion.toArray(),
        };
    }
}
