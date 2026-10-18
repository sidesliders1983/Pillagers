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
                const compile = material.onBeforeCompile;
                material.onBeforeCompile = (shader, renderer) => {
                    compile.call(material, shader, renderer);
                    // Independent world-position phase; trunks stay fixed and no CPU tree animation is added.
                    shader.vertexShader = shader.vertexShader.replace(
                        'float windOffset = 2.0 * 3.14 * simplex3(mvPosition.xyz / uWindScale);',
                        'float windOffset = 2.0 * 3.14 * simplex3(mvPosition.xyz / uWindScale);' +
                        '\n#ifdef USE_INSTANCING\n' +
                        'windOffset += dot(instanceMatrix[3].xz, vec2(0.37, 0.23));\n#endif');
                };
                material.customProgramCacheKey = () => 'ez-tree-dcf309b-instanced-wind-v1:world-phase';
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
