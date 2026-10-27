import { Box3, InstancedMesh, Matrix4, Object3D, Ray, Vector3 } from 'three';

type View = { position: number[]; target: number[] };
/** Short-lived local collision snapshot from existing rendered props, never another world model. */
export class CameraObstacles {
    readonly limited: boolean;
    private readonly boxes: Box3[] = [];
    private readonly ray = new Ray();
    private readonly hit = new Vector3();
    constructor(roots: readonly Object3D[], center: number[], range: number, buildings: readonly Box3[]) {
        const pivot = new Vector3().fromArray(center);
        const instance = new Matrix4(), transform = new Matrix4();
        let scanned = 0, limited = false;
        const add = (box: Box3) => {
            if (box.isEmpty() || box.distanceToPoint(pivot) > range) return;
            if (this.boxes.length >= 256) { limited = true; return; }
            this.boxes.push(box.clone().expandByScalar(.4));
        };
        const visit = (node: Object3D) => {
            if (limited || !node.visible) return;
            if (++scanned > 8192) { limited = true; return; }
            const instances = node as InstancedMesh;
            if (instances.isInstancedMesh && /conifer|deciduous|rock|boulder/i.test(node.name)) {
                instances.geometry.computeBoundingBox();
                const bounds = instances.geometry.boundingBox;
                if (!bounds) return;
                for (let index = 0; index < instances.count; index++) {
                    if (++scanned > 8192 || limited) { limited = true; break; }
                    instances.getMatrixAt(index, instance);
                    transform.multiplyMatrices(node.matrixWorld, instance);
                    add(bounds.clone().applyMatrix4(transform));
                }
                return;
            }
            if (/^(building|household):|longship|dock|boat/i.test(node.name)) {
                add(new Box3().setFromObject(node));
                return;
            }
            for (const child of node.children) visit(child);
        };
        for (const root of roots) { root.updateWorldMatrix(true, true); visit(root); }
        for (const box of buildings) add(box);
        this.limited = limited;
    }
    get count() { return this.boxes.length; }
    allows(view: View): boolean {
        if (this.limited) return false;
        const eye = new Vector3().fromArray(view.position), target = new Vector3().fromArray(view.target);
        const distance = eye.distanceTo(target);
        this.ray.set(eye, target.sub(eye).normalize());
        return this.boxes.every(box => !box.containsPoint(eye) &&
            (!this.ray.intersectBox(box, this.hit) || this.hit.distanceTo(eye) >= distance - .2));
    }
}
