import { InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { applyLeafWind } from '../vendor/ez-tree/LeafWind';

/** Instance-owned leaf materials; authored geometry, bark, textures and placement stay shared. */
export class NatureWind {
    private readonly time = { value: 0 };
    private readonly materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    constructor(root: Object3D, enabled: boolean) {
        if (!enabled) return;
        root.traverse(node => {
            if (!(node instanceof InstancedMesh)) return;
            const source = node.material;
            if (!(source instanceof MeshStandardMaterial) || source.name !== 'leaves') return;
            let material = this.materials.get(source);
            if (!material) {
                material = source.clone();
                applyLeafWind(material, this.time);
                this.materials.set(source, material);
            }
            node.material = material;
        });
    }
    update(time: number) { this.time.value = time; }
    dispose() {
        for (const material of this.materials.values()) material.dispose();
        this.materials.clear();
    }
}
