import { Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three';
import { seededRandom, worldConfig } from '../config/worldConfig';
export class Water {
    readonly mesh = new Group();
    constructor() { const surface = new Mesh(new PlaneGeometry(180, 180), new MeshStandardMaterial({ color: worldConfig.palette.water, roughness: 1, metalness: 0 })); surface.rotation.x = -Math.PI / 2; surface.position.z = -35; surface.receiveShadow = true; this.mesh.add(surface); const ripples = new InstancedMesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: worldConfig.palette.ripple, roughness: 1, transparent: true, opacity: .22, depthWrite: false }), 55); const random = seededRandom(543), dummy = new Object3D(); for (let i = 0; i < 55; i++) {
        dummy.position.set(random() * 110 - 55, .025, -19 - random() * 65);
        dummy.rotation.x = -Math.PI / 2;
        dummy.rotation.z = -.12;
        dummy.scale.set(1 + random() * 3, .035 + random() * .055, 1);
        dummy.updateMatrix();
        ripples.setMatrixAt(i, dummy.matrix);
    } ripples.computeBoundingSphere(); this.mesh.add(ripples); }
    dispose() {
        this.mesh.traverse(node => {
            if (!(node instanceof Mesh)) return;
            if (node instanceof InstancedMesh) node.dispose();
            node.geometry.dispose();
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
        });
        this.mesh.clear();
    }
    update(time: number) { this.mesh.position.y = -.12 + Math.sin(time * .7) * .025; }
}
