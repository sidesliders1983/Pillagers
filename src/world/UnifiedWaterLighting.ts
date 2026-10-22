import { Color, Matrix4, ShaderMaterial, Vector2 } from 'three';
import type { WorldLighting } from '../core/WorldLighting';
import type { DirectionalAtmosphere } from './DirectionalAtmosphere';
import { ATMOSPHERE_PARAMETERS } from './DirectionalAtmosphere';
import { unifiedSunlight } from '../config/UnifiedSunlight';

export const WATER_SOLAR_SHADOW = /* glsl */ `
    #include <packing>
    uniform sampler2D uFjordShadowMap;
    uniform mat4 uFjordShadowMatrix;
    uniform vec2 uFjordShadowTexel;
    uniform float uFjordShadowReady;
    uniform float uFjordShadowBias;
    uniform float uFjordShadowNormalBias;
    uniform float uFjordShadowIntensity;

    float fjordCompare(vec2 uv, float depth) {
        return step(depth, unpackRGBAToDepth(texture2D(uFjordShadowMap, uv)));
    }
    float fjordSolarVisibility(vec3 worldPosition, vec3 normal) {
        if (uFjordShadowReady < 0.5) return 1.0;
        vec4 projected = uFjordShadowMatrix * vec4(worldPosition + normal * uFjordShadowNormalBias, 1.0);
        vec3 coord = projected.xyz / projected.w;
        if (coord.z < 0.0 || coord.z > 1.0) return 1.0;
        float edge = min(min(coord.x, coord.y), min(1.0 - coord.x, 1.0 - coord.y));
        if (edge <= 0.0) return 1.0;
        float depth = coord.z + uFjordShadowBias;
        float visibility = 0.0;
        #if FJORD_SHADOW_SAMPLES == 4
            visibility += fjordCompare(coord.xy + vec2(-0.5, -0.5) * uFjordShadowTexel, depth);
            visibility += fjordCompare(coord.xy + vec2( 0.5, -0.5) * uFjordShadowTexel, depth);
            visibility += fjordCompare(coord.xy + vec2(-0.5,  0.5) * uFjordShadowTexel, depth);
            visibility += fjordCompare(coord.xy + vec2( 0.5,  0.5) * uFjordShadowTexel, depth);
            visibility *= 0.25;
        #else
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++)
                visibility += fjordCompare(coord.xy + vec2(float(x), float(y)) * uFjordShadowTexel, depth);
            visibility /= 9.0;
        #endif
        // Outside the fitted map the sea retains ambient and unoccluded solar light.
        // Fade the last few texels rather than drawing a hard rectangular map edge.
        float coverage = smoothstep(0.0, max(uFjordShadowTexel.x, uFjordShadowTexel.y)
            * ${unifiedSunlight.shadowEdgeTexels}.0, edge);
        return mix(1.0, visibility, coverage * uFjordShadowIntensity);
    }
`;

/** One-time shader adaptation of the existing ReferenceWater; no new surface, texture or shadow pass. */
export class UnifiedWaterLighting {
    private readonly solarColor = new Color();
    constructor(private material: ShaderMaterial, atmosphere: DirectionalAtmosphere,
        quality: 'low' | 'standard') {
        Object.assign(material.uniforms, atmosphere.uniforms, {
            uFjordShadowMap: { value: null },
            uFjordShadowMatrix: { value: new Matrix4() },
            uFjordShadowTexel: { value: new Vector2() },
            uFjordShadowReady: { value: 0 },
            uFjordShadowBias: { value: 0 },
            uFjordShadowNormalBias: { value: 0 },
            uFjordShadowIntensity: { value: 1 },
        });
        material.vertexShader = 'varying vec3 vFjordAtmospherePosition;\n' + material.vertexShader;
        material.vertexShader = material.vertexShader.replace('vWorldPosition = worldPosition.xyz;',
            'vWorldPosition = worldPosition.xyz;\nvFjordAtmospherePosition = worldPosition.xyz;');
        material.fragmentShader = material.fragmentShader.replace('void main() {',
            WATER_SOLAR_SHADOW + '\n' + ATMOSPHERE_PARAMETERS + '\nvoid main() {');
        material.fragmentShader = material.fragmentShader.replace('body *= 0.72 + diffuse * 0.28;',
            'float solarVisibility = uFjordSolarStrength > 0.0 ? fjordSolarVisibility(vWorldPosition, normal) : 1.0;');
        material.fragmentShader = material.fragmentShader.replace('vec3 color = mix(body, sky, reflection);', `
            // Keep body/sky fill independent from true solar diffuse and wave-normal glitter.
            vec3 color = mix(body * 0.72, sky, reflection) * uLightIntensity;
            color += body * uSunColor * (0.28 * diffuse * (1.0 - reflection))
                * uFjordSolarStrength * solarVisibility;
        `);
        material.fragmentShader = material.fragmentShader.replace(
            'color += uSunColor * (broadHighlight + crispHighlight) * diffuse;',
            'color += uSunColor * (broadHighlight + crispHighlight) * diffuse * uFjordSolarStrength * solarVisibility;');
        material.fragmentShader = material.fragmentShader.replace('color *= uLightIntensity;', '');
        material.fragmentShader = material.fragmentShader.replace('#include <fog_fragment>', '');
        material.fragmentShader = material.fragmentShader.replace('#include <colorspace_fragment>',
            'gl_FragColor.rgb = fjordAtmosphere(gl_FragColor.rgb, solarVisibility);\n#include <colorspace_fragment>');
        this.setQuality(quality);
    }

    setQuality(quality: 'low' | 'standard') {
        const samples = quality === 'low' ? 4 : 9;
        if (this.material.defines.FJORD_SHADOW_SAMPLES === samples) return;
        this.material.defines.FJORD_SHADOW_SAMPLES = samples;
        this.material.needsUpdate = true;
    }

    update(lighting: WorldLighting) {
        const u = this.material.uniforms;
        // The shared matrix object is updated by the native shadow pass before this draw.
        // Copying it here would lag the renderer's final shadow transform by one frame.
        const shadow = lighting.directional.shadow;
        u.uFjordShadowMatrix.value = shadow.matrix;
        u.uFjordShadowMap.value = shadow.map?.texture ?? null;
        u.uFjordShadowReady.value = shadow.map && lighting.directional.castShadow ? 1 : 0;
        u.uFjordShadowTexel.value.set(1 / shadow.mapSize.x, 1 / shadow.mapSize.y);
        u.uFjordShadowBias.value = shadow.bias;
        u.uFjordShadowNormalBias.value = shadow.normalBias;
        u.uFjordShadowIntensity.value = shadow.intensity;
        lighting.copySeasonalSun(u.uSunDirection.value, this.solarColor);
        u.uSunColor.value.copy(this.solarColor);
    }
}
