import { Color, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { seasonBlend } from '../config/timeVisualization';

/** Instance-owned seasonal snow on static, authored structures; source assets stay untouched. */
export class StructureSeasonTint {
    private seasonalAmount = 0;
    private snowMultiplier = 1;
    private amount = { value: 0 };
    private snowTone = new Color('#edf2f3');
    private materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    private bindings: { mesh: Mesh; original: Mesh['material'] }[] = [];

    constructor(root: Object3D, private coverage: 'upward' | 'all' = 'upward') {
        root.traverse(node => {
            if (!(node instanceof Mesh)) return;
            const original = node.material;
            // Retain exact bindings so an upgrade/removal can release the original instance resources.
            this.bindings.push({ mesh: node, original });
            node.material = Array.isArray(original)
                ? original.map(material => this.copy(material))
                : this.copy(original);
        });
    }

    private copy(source: import('three').Material) {
        if (!(source instanceof MeshStandardMaterial)) return source;
        const existing = this.materials.get(source);
        if (existing) return existing;
        const material = source.clone();
        const previous = source.onBeforeCompile;
        const sourceKey = source.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
            previous.call(material, shader, renderer);
            shader.uniforms.structureSnowAmount = this.amount;
            shader.uniforms.structureSnowTone = { value: this.snowTone };
            // The native transformed normal includes source rotations and non-uniform scale.
            // Returning it to world space makes snow coverage independent of the camera angle.
            shader.vertexShader = 'varying vec3 vStructureWorldNormal;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>',
                '#include <defaultnormal_vertex>\n' +
                'vStructureWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);');
            shader.fragmentShader = [
                'varying vec3 vStructureWorldNormal;',
                'uniform float structureSnowAmount;',
                'uniform vec3 structureSnowTone;',
                shader.fragmentShader
            ].join('\n');
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', [
                '#include <color_fragment>',
                this.coverage === 'all' ? 'float structureSnowMask = 1.0;' :
                    'float structureSnowMask = smoothstep(0.25, 0.8, normalize(vStructureWorldNormal).y);',
                'diffuseColor.rgb = mix(diffuseColor.rgb, structureSnowTone,',
                '    structureSnowAmount * structureSnowMask);'
            ].join('\n'));
        };
        material.customProgramCacheKey = () => sourceKey + ':structure-season-snow-v1' +
            (this.coverage === 'all' ? ':all-faces' : '');
        this.materials.set(source, material);
        return material;
    }

    setSnowMultiplier(value: number) {
        this.snowMultiplier = Math.max(0, Math.min(1, value));
        this.amount.value = this.seasonalAmount * this.snowMultiplier;
    }
    setSnowAmount(value: number) {
        this.seasonalAmount = Math.max(0, Math.min(.65, value));
        this.amount.value = this.seasonalAmount * this.snowMultiplier;
    }
    update(progress: number | null) {
        if (progress === null) {
            this.seasonalAmount = this.amount.value = 0;
            return;
        }
        const { from, to, mix } = seasonBlend(progress);
        const winter = from.name === 'Winter' ? 1 - mix : to.name === 'Winter' ? mix : 0;
        this.seasonalAmount = winter * .65;
        this.amount.value = this.seasonalAmount * this.snowMultiplier;
    }

    inspect() {
        return { amount: this.amount.value, materials: [...this.materials.values()].map(m => m.uuid) };
    }

    dispose() {
        for (const { mesh, original } of this.bindings) mesh.material = original;
        for (const material of this.materials.values()) material.dispose();
        this.bindings = [];
        this.materials.clear();
    }
}
