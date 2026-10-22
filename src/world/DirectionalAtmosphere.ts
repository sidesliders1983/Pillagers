import { Camera, Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import type { WorldLighting } from '../core/WorldLighting';
import { unifiedSunlight } from '../config/UnifiedSunlight';

export const ATMOSPHERE_PARAMETERS = /* glsl */ `
    uniform vec3 uFjordSunDirection;
    uniform vec3 uFjordSunColor;
    uniform vec3 uFjordFogLinear;
    uniform float uFjordSolarStrength;
    uniform float uFjordGlowStrength;
    uniform float uFjordViewDown;
    varying vec3 vFjordAtmospherePosition;

    vec3 fjordAtmosphere(vec3 color, float solarVisibility) {
        #ifdef USE_FOG
            #ifdef FOG_EXP2
                float fogAmount = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            #else
                float fogAmount = smoothstep(fogNear, fogFar, vFogDepth);
            #endif
            vec3 ray = normalize(vFjordAtmospherePosition - cameraPosition);
            vec2 horizontalRay = ray.xz / max(length(ray.xz), 0.0001);
            vec2 horizontalSun = uFjordSunDirection.xz / max(length(uFjordSunDirection.xz), 0.0001);
            float sunward = pow(max(dot(horizontalRay, horizontalSun), 0.0), 6.0);
            float lowView = 1.0 - smoothstep(0.45, 0.75, uFjordViewDown);
            float distanceVeil = smoothstep(${unifiedSunlight.glowStart}.0, ${unifiedSunlight.glowEnd}.0, vFogDepth);
            float alignment = sunward * lowView * min(uFjordSolarStrength, 1.0) * solarVisibility;
            float glow = alignment * distanceVeil * uFjordGlowStrength;
            // Return to the unchanged far fog at full opacity, keeping the apron/sky join continuous.
            vec3 atmosphere = mix(uFjordFogLinear, uFjordSunColor,
                alignment * ${unifiedSunlight.warmFogMix} * (1.0 - fogAmount));
            // One linear display-space atmosphere composition, before output encoding.
            // Keeping native fog colors after tone mapping preserves the fully fogged sky/apron join.
            return mix(color, atmosphere, clamp(fogAmount + glow * (1.0 - fogAmount), 0.0, 1.0));
        #else
            return color;
        #endif
    }
`;

/** Owns only shared uniforms and reversible hooks; no frame loop, render target or scene walk per frame. */
export class DirectionalAtmosphere {
    readonly uniforms = {
        uFjordSunDirection: { value: new Vector3(0, 1, 0) },
        uFjordSunColor: { value: new Color() },
        uFjordFogLinear: { value: new Color() },
        uFjordSolarStrength: { value: 0 },
        uFjordGlowStrength: { value: unifiedSunlight.glowStrength as number },
        uFjordViewDown: { value: 1 },
    };
    private readonly viewDirection = new Vector3();
    private readonly hooks = new Map<MeshStandardMaterial, {
        compile: MeshStandardMaterial['onBeforeCompile']; key: MeshStandardMaterial['customProgramCacheKey'];
        dispose: () => void;
    }>();

    /** Called only when an owning world/model/dressing batch is created or replaced. */
    bind(root: Object3D) {
        root.traverse(node => {
            if (!(node instanceof Mesh)) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!(material instanceof MeshStandardMaterial) || this.hooks.has(material)) continue;
                const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
                const sourceKey = key.call(material);
                const release = () => {
                    material.onBeforeCompile = compile;
                    material.customProgramCacheKey = key;
                    material.removeEventListener('dispose', release);
                    this.hooks.delete(material);
                };
                this.hooks.set(material, { compile, key, dispose: release });
                material.addEventListener('dispose', release);
                material.onBeforeCompile = (shader, renderer) => {
                    compile.call(material, shader, renderer);
                    Object.assign(shader.uniforms, this.uniforms);
                    shader.vertexShader = 'varying vec3 vFjordAtmospherePosition;\n' + shader.vertexShader;
                    // Match native batching/instancing after skinning and authored wind deformation.
                    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
                        #include <project_vertex>
                        vec4 fjordPosition = vec4(transformed, 1.0);
                        #ifdef USE_BATCHING
                            fjordPosition = batchingMatrix * fjordPosition;
                        #endif
                        #ifdef USE_INSTANCING
                            fjordPosition = instanceMatrix * fjordPosition;
                        #endif
                        vFjordAtmospherePosition = (modelMatrix * fjordPosition).xyz;
                    `);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>',
                        '#include <fog_pars_fragment>\n' + ATMOSPHERE_PARAMETERS);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', '');
                    shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `
                        // Native direct diffuse already includes terrain/structure shadow occlusion.
                        // Reuse that result instead of another PCF query or a through-mountain flare.
                        float fjordLit = smoothstep(0.0, 0.05, max(max(reflectedLight.directDiffuse.r,
                            reflectedLight.directDiffuse.g), reflectedLight.directDiffuse.b));
                        gl_FragColor.rgb = fjordAtmosphere(gl_FragColor.rgb, fjordLit);
                        #include <colorspace_fragment>
                    `);
                };
                material.customProgramCacheKey = () => sourceKey + '|fjord-directional-atmosphere-v1';
                material.needsUpdate = true;
            }
        });
    }

    update(lighting: WorldLighting, camera?: Camera) {
        const u = this.uniforms;
        u.uFjordSolarStrength.value = lighting.copySeasonalSun(u.uFjordSunDirection.value, u.uFjordSunColor.value) ?? 0;
        u.uFjordFogLinear.value.copy(lighting.fog.color);
        if (camera) {
            camera.getWorldDirection(this.viewDirection);
            u.uFjordViewDown.value = Math.max(0, -this.viewDirection.y);
        }
    }

    inspect() { return { materials: this.hooks.size, solarStrength: this.uniforms.uFjordSolarStrength.value,
        glowStrength: this.uniforms.uFjordGlowStrength.value, technique: 'Shared linear material fog; no extra pass' }; }

    dispose() {
        for (const [material, hooks] of this.hooks) { hooks.dispose(); material.needsUpdate = true; }
        this.hooks.clear();
    }
}
