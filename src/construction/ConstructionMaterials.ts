import { Material, Mesh, Object3D, Plane } from 'three';

/** Temporary instance bindings, preserving seasonal hooks and authored opacity. */
export class ConstructionMaterials {
    private bindings: { mesh: Mesh; original: Mesh['material'] }[] = [];
    private copies = new Map<Material, Material>();

    constructor(root: Object3D, mode: 'fade' | 'reveal', plane?: Plane) {
        const copy = (source: Material) => {
            let material = this.copies.get(source);
            if (material) return material;
            material = source.clone();
            material.onBeforeCompile = source.onBeforeCompile;
            material.customProgramCacheKey = source.customProgramCacheKey.bind(source);
            if (mode === 'reveal' && plane) {
                material.clippingPlanes = [...(source.clippingPlanes ?? []), plane];
                material.clipShadows = true;
            }
            this.copies.set(source, material);
            return material;
        };
        root.traverse(node => {
            if (!(node instanceof Mesh)) return;
            const original = node.material;
            this.bindings.push({ mesh: node, original });
            node.material = Array.isArray(original) ? original.map(copy) : copy(original);
        });
    }

    setOpacity(amount: number) {
        const opacity = Math.max(0, Math.min(1, amount));
        for (const [source, copy] of this.copies) {
            const transparent = source.transparent || opacity < 1;
            if (copy.transparent !== transparent) {
                copy.transparent = transparent;
                copy.needsUpdate = true;
            }
            copy.depthWrite = opacity < 1 ? false : source.depthWrite;
            copy.opacity = source.opacity * opacity;
            // Keep authored cutout edges while fading; a fixed cutoff would pop at half opacity.
            copy.alphaTest = source.alphaTest * opacity;
        }
    }

    dispose() {
        for (const binding of this.bindings) binding.mesh.material = binding.original;
        for (const material of this.copies.values()) material.dispose();
        this.bindings = [];
        this.copies.clear();
    }
}
