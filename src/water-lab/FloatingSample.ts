import { BoxGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { ReferenceWater } from '../water/ReferenceWater';

const WIDTH = 2.8;
const LENGTH = 1.9;
const HEIGHT = 0.85;
const DRAFT = 0.34;
const UP = new Vector3(0, 1, 0);

/** Four-point kinematic float: deterministic heave, pitch and roll, without a physics solver. */
export class FloatingSample {
    readonly mesh: Mesh<BoxGeometry, MeshLambertMaterial>;
    private readonly normal = new Vector3();
    private disposed = false;

    constructor() {
        const geometry = new BoxGeometry(WIDTH, HEIGHT, LENGTH, 16, 1, 1);
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        const orange = new Color('#ec762c');
        const cream = new Color('#fff1cc');
        for (let index = 0; index < positions.count; index++) {
            const x = Math.abs(positions.getX(index));
            const color = x >= 0.65 && x <= 0.9 ? cream : orange;
            colors.set([color.r, color.g, color.b], index * 3);
        }
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        this.mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
        this.mesh.name = 'Four-point floating sample';
    }

    update(water: ReferenceWater, elapsedSeconds: number): void {
        if (this.disposed) throw new Error('Floating sample has been disposed.');
        if (!this.mesh.visible) return;
        const x = this.mesh.position.x;
        const z = this.mesh.position.z;
        const leftBack = water.getHeightAt(x - WIDTH / 2, z - LENGTH / 2, elapsedSeconds);
        const rightBack = water.getHeightAt(x + WIDTH / 2, z - LENGTH / 2, elapsedSeconds);
        const leftFront = water.getHeightAt(x - WIDTH / 2, z + LENGTH / 2, elapsedSeconds);
        const rightFront = water.getHeightAt(x + WIDTH / 2, z + LENGTH / 2, elapsedSeconds);
        if (leftBack === null || rightBack === null || leftFront === null || rightFront === null) {
            throw new RangeError('The floating sample must stay inside the water surface.');
        }

        // Fit the four support heights to a plane; small texture ripples are shading only.
        const slopeX = (rightBack + rightFront - leftBack - leftFront) / (2 * WIDTH);
        const slopeZ = (leftFront + rightFront - leftBack - rightBack) / (2 * LENGTH);
        this.normal.set(-slopeX, 1, -slopeZ).normalize();
        this.mesh.quaternion.setFromUnitVectors(UP, this.normal);
        const averageHeight = (leftBack + rightBack + leftFront + rightFront) / 4;
        this.mesh.position.y = averageHeight + (HEIGHT / 2 - DRAFT) * this.normal.y;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}