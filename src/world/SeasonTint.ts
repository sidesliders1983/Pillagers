import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { seasonBlend, seasonPresets } from '../config/timeVisualization';
import { fjordTerrain } from '../config/FjordTerrain';

/** Only material uniforms change during the cycle; geometry and instancing stay intact. */
export class SeasonTint {
    private materials = new Map<MeshStandardMaterial, Color>();
    private grounds = new Map<MeshStandardMaterial, Color>();
    private groundHooks = new Map<MeshStandardMaterial, {
        compile: MeshStandardMaterial['onBeforeCompile'];
        cacheKey: MeshStandardMaterial['customProgramCacheKey'];
    }>();
    private foliageSources = new Map<Mesh, Mesh['material']>();
    private tint = new Color();
    private next = new Color();
    private snow = new Map<MeshStandardMaterial, { value: number }>();
    private snowTone = new Color('#edf2f3');

    constructor(root: Group, terrain: Mesh, private summitLine: number | null = null) {
        // Generated terrain has child sand, rock and path layers. Tint their existing materials too.
        terrain.traverse(node => {
            if (!(node instanceof Mesh)) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!(material instanceof MeshStandardMaterial) || this.grounds.has(material)) continue;
                this.grounds.set(material, material.color.clone());
                this.groundHooks.set(material, {
                    compile: material.onBeforeCompile, cacheKey: material.customProgramCacheKey
                });
                this.addSnow(material, false);
            }
        });
        this.refreshFoliage(root);
    }

    /** Discovery replaces scenery, while the terrain and its GPU-bound uniforms remain alive. */
    refreshFoliage(root: Group) {
        this.releaseFoliage();
        const clones = new Map<MeshStandardMaterial, MeshStandardMaterial>();
        const copy = (source: MeshStandardMaterial) => {
            let material = clones.get(source);
            if (!material) {
                material = source.clone();
                material.onBeforeCompile = source.onBeforeCompile;
                material.customProgramCacheKey = source.customProgramCacheKey;
                clones.set(source, material);
                this.materials.set(material, source.color.clone());
                this.addSnow(material, true);
            }
            return material;
        };
        root.traverse(node => {
            if (!(node instanceof Mesh) || !node.userData.seasonalFoliage) return;
            this.foliageSources.set(node, node.material);
            node.material = Array.isArray(node.material)
                ? node.material.map(material => copy(material as MeshStandardMaterial))
                : copy(node.material as MeshStandardMaterial);
        });
    }

    private releaseFoliage() {
        for (const [node, source] of this.foliageSources) node.material = source;
        this.foliageSources.clear();
        for (const material of this.materials.keys()) {
            this.snow.delete(material);
            material.dispose();
        }
        this.materials.clear();
    }

    private addSnow(material: MeshStandardMaterial, foliage: boolean) {
        const amount = { value: 0 };
        this.snow.set(material, amount);
        const previous = material.onBeforeCompile;
        const key = material.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
            previous.call(material, shader, renderer);
            shader.uniforms.seasonSnowAmount = amount;
            shader.uniforms.seasonSnowTone = { value: this.snowTone };
            shader.fragmentShader = 'uniform float seasonSnowAmount; uniform vec3 seasonSnowTone;\n' + shader.fragmentShader;
            if (foliage) {
                // Fragment USE_COLOR also includes instanceColor. Classify the original
                // vertex colour instead, so a per-tree tint cannot remove winter snow.
                // Textured canopies without vertex colours are entirely foliage.
                shader.vertexShader = 'varying vec3 vSeasonSourceColor;\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>',
                    '#include <color_vertex>\n' +
                    'vSeasonSourceColor=vec3(0.0,1.0,0.0);\n' +
                    '#ifdef USE_COLOR\nvSeasonSourceColor=color.rgb;\n#endif');
                shader.fragmentShader = 'varying vec3 vSeasonSourceColor;\n' + shader.fragmentShader;
            }
            const mask = foliage ? '\n#ifdef USE_COLOR\nseasonMask=smoothstep(1.0,1.2,' +
                'vSeasonSourceColor.g/max(max(vSeasonSourceColor.r,vSeasonSourceColor.b),0.001));\n#endif\n' : '';
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\nfloat seasonMask=1.0;${mask}\ndiffuseColor.rgb=mix(diffuseColor.rgb,seasonSnowTone,seasonSnowAmount*seasonMask);`);
            if (!foliage && this.summitLine !== null) {
                shader.uniforms.fjordSummitLine = { value: this.summitLine };
                shader.uniforms.fjordIceTone = { value: new Color(fjordTerrain.permanentColor) };
                shader.vertexShader = 'varying vec3 fjordWorldNormal; varying float fjordWorldY;\n' +
                    shader.vertexShader.replace('#include <defaultnormal_vertex>',
                        '#include <defaultnormal_vertex>\nfjordWorldNormal=inverseTransformDirection(transformedNormal,viewMatrix);')
                        .replace('#include <project_vertex>',
                            '#include <project_vertex>\nfjordWorldY=(modelMatrix*vec4(transformed,1.0)).y;');
                shader.fragmentShader = 'varying vec3 fjordWorldNormal; varying float fjordWorldY;\n' +
                    'uniform float fjordSummitLine; uniform vec3 fjordIceTone;\n' + shader.fragmentShader;
                if (material.name === 'mossy_rock') {
                    shader.fragmentShader = shader.fragmentShader.replace('float seasonMask=1.0;',
                        `float seasonMask=smoothstep(${fjordTerrain.rockSnowRetention[0]},${fjordTerrain.rockSnowRetention[1]},normalize(fjordWorldNormal).y);`);
                }
                shader.fragmentShader = shader.fragmentShader.replace('seasonSnowAmount*seasonMask);',
                    'seasonSnowAmount*seasonMask);\n' +
                    `float summitCap=step(fjordSummitLine,fjordWorldY)*step(${fjordTerrain.permanentMinimumUp},fjordWorldNormal.y);\n` +
                    'diffuseColor.rgb=mix(diffuseColor.rgb,fjordIceTone,summitCap);');
            }
        };
        material.customProgramCacheKey = () => key + (foliage ? 'season-foliage-v2-source-color' : 'season-ground-v1') +
            (!foliage && this.summitLine !== null ? '|fjord-summit-v1:' + material.name : '');
    }

    update(progress: number | null) {
        if (progress === null) {
            for (const [ground, base] of this.grounds) ground.color.copy(base);
            for (const [material, base] of this.materials) material.color.copy(base);
            for (const amount of this.snow.values()) amount.value = 0;
            return;
        }
        const { from, to, mix } = seasonBlend(progress);
        const winter = from.name === 'Winter' ? 1 - mix : to.name === 'Winter' ? mix : 0;
        for (const amount of this.snow.values()) amount.value = winter * .65;
        this.tint.setHex(from.ground).lerp(this.next.setHex(to.ground), mix);
        for (const [ground, base] of this.grounds) {
            ground.color.copy(base);
            if (this.summitLine === null || ground.name !== 'mossy_rock') ground.color.multiply(this.tint);
        }
        this.tint.setHex(from.foliage).lerp(this.next.setHex(to.foliage), mix);
        for (const [material, base] of this.materials) material.color.copy(base).multiply(this.tint);
    }

    /** Apply a canonical weather severity without inventing a seasonal clock. */
    setWinter(weight: number) {
        const amount = Math.max(0, Math.min(1, weight));
        const winter = seasonPresets.find(preset => preset.name === 'Winter')!;
        for (const snow of this.snow.values()) snow.value = amount * .65;
        this.tint.setHex(0xffffff).lerp(this.next.setHex(winter.ground), amount);
        for (const [ground, base] of this.grounds) {
            ground.color.copy(base);
            if (this.summitLine === null || ground.name !== 'mossy_rock') ground.color.multiply(this.tint);
        }
        this.tint.setHex(0xffffff).lerp(this.next.setHex(winter.foliage), amount);
        for (const [material, base] of this.materials) material.color.copy(base).multiply(this.tint);
    }

    inspect() {
        return {
            groundColors: [...this.grounds.keys()].map(material => material.color.getHex()),
            foliageColors: [...this.materials.keys()].map(material => material.color.getHex()),
            snowAmounts: [...this.snow.values()].map(amount => amount.value),
            materials: [...this.snow.keys()].map(material => material.uuid)
        };
    }

    dispose() {
        // A surviving terrain must never be mistaken for an untinted material on reattachment.
        for (const [material, base] of this.grounds) {
            material.color.copy(base);
            const hooks = this.groundHooks.get(material)!;
            material.onBeforeCompile = hooks.compile;
            material.customProgramCacheKey = hooks.cacheKey;
            material.needsUpdate = true;
        }
        this.releaseFoliage();
        this.grounds.clear();
        this.groundHooks.clear();
        this.snow.clear();
    }
}
