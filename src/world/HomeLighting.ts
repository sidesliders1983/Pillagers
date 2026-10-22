import { Mesh, MeshStandardMaterial, Object3D, Texture } from 'three';
import { lightingConfig } from '../config/lightingConfig';

export const supportedHomeLights = ['homestead', 'longhouse', 'farmHut'] as const;

/** Borrows the snow owner's instance materials and the asset owner's shared aperture map. */
export class HomeLighting {
    private bindings: { material: MeshStandardMaterial; color: number; intensity: number;
        map: Texture | null }[] = [];
    private inhabited = false;
    private darkness = 0;
    constructor(private root: Object3D, mask: Texture) {
        root.traverse(node => {
            if (!(node instanceof Mesh)) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!(material instanceof MeshStandardMaterial) || this.bindings.some(b => b.material === material)) continue;
                this.bindings.push({ material, color: material.emissive.getHex(),
                    intensity: material.emissiveIntensity, map: material.emissiveMap });
                material.emissive.setHex(lightingConfig.windows.color);
                material.emissiveMap = mask;
                material.emissiveIntensity = 0;
                material.needsUpdate = true;
            }
        });
    }
    get inhabitedRoot() { return this.inhabited ? this.root : undefined; }
    setInhabited(inhabited: boolean) {
        if (this.inhabited === inhabited) return;
        this.inhabited = inhabited;
        this.apply();
    }
    setDarkness(darkness: number) {
        const next = Number.isFinite(darkness) ? Math.max(0, Math.min(1, darkness)) : 0;
        if (next === this.darkness) return;
        this.darkness = next;
        this.apply();
    }
    private apply() {
        const intensity = this.inhabited ? this.darkness * lightingConfig.windows.emissiveIntensity : 0;
        for (const { material } of this.bindings) material.emissiveIntensity = intensity;
    }
    inspect() {
        return { inhabited: this.inhabited, darkness: this.darkness, materials: this.bindings.length,
            intensity: this.bindings[0]?.material.emissiveIntensity ?? 0 };
    }
    dispose() {
        for (const { material, color, intensity, map } of this.bindings) {
            material.emissive.setHex(color);
            material.emissiveIntensity = intensity;
            material.emissiveMap = map;
            material.needsUpdate = true;
        }
        this.bindings = [];
    }
}
