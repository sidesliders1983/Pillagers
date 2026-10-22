import { Mesh, MeshStandardMaterial, Object3D } from 'three';

/** Animal coats reflect scene lighting; imported emission must never act as a fill light. */
export function prepareFaunaLighting(root: Object3D) {
    const seen = new Set<MeshStandardMaterial>();
    root.traverse(node => {
        if (!(node instanceof Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (!(material instanceof MeshStandardMaterial) || seen.has(material)) continue;
            seen.add(material);
            material.emissive.setRGB(0, 0, 0);
            material.emissiveIntensity = 0;
            // Keep texture references so the source owner can release all imported maps.
        }
    });
    return seen.size;
}
