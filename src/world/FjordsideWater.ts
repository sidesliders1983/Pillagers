import { Camera, UniformsLib, UniformsUtils, Vector3 } from 'three';
import { ReferenceWater, REFERENCE_WATER_DEFAULTS } from '../water/ReferenceWater';
import { lightingConfig } from '../config/lightingConfig';
import type { WorldLighting } from '../core/WorldLighting';

/** Approved water with native world atmosphere; the wave/detail implementation is unchanged. */
export class FjordsideWater {
    readonly surface: ReferenceWater;
    readonly mesh: ReferenceWater['mesh'];
    private readonly sunDirection = new Vector3();
    private time = 0;

    constructor(level: number, center: { x: number; z: number }, quality: 'standard' | 'low') {
        this.surface = new ReferenceWater({
            size: 80, extent: 2000, level,
            quality: quality === 'low' ? 'low' : 'medium',
        });
        this.mesh = this.surface.mesh;
        this.mesh.position.set(center.x, level, center.z);
        // Stock fog joins the sparse horizon to the existing atmosphere without changing the waves.
        const material = this.mesh.material;
        material.fog = true;
        Object.assign(material.uniforms, UniformsUtils.clone(UniformsLib.fog));
        material.vertexShader = '#include <fog_pars_vertex>\n' + material.vertexShader;
        material.vertexShader = material.vertexShader.replace(
            'gl_Position = projectionMatrix * viewMatrix * worldPosition;',
            'vec4 mvPosition = viewMatrix * worldPosition;\n' +
            'gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>');
        material.fragmentShader = '#include <fog_pars_fragment>\n' + material.fragmentShader;
        material.fragmentShader = material.fragmentShader.replace(
            '#include <colorspace_fragment>',
            '#include <colorspace_fragment>\n#include <fog_fragment>');
    }

    update(time: number, lighting?: WorldLighting, camera?: Camera) {
        this.time = time;
        this.surface.update(time, camera);
        if (lighting) {
            this.sunDirection.copy(lighting.directional.position).sub(lighting.directional.target.position);
            this.surface.setLighting({
                sunDirection: this.sunDirection,
                sunColor: lighting.directional.color,
                skyColor: lighting.skyColor,
                intensity: lighting.ambient.intensity / lightingConfig.day.ambient,
            });
        }
    }

    describe() {
        return {
            source: 'reference-water', ...this.surface.getStats(), time: this.time,
            level: this.mesh.position.y, center: { x: this.mesh.position.x, z: this.mesh.position.z },
            denseSize: 80, extent: 2000,
            parameters: {
                waveAmplitude: REFERENCE_WATER_DEFAULTS.waveAmplitude,
                waveSpeed: REFERENCE_WATER_DEFAULTS.waveSpeed,
                detailStrength: REFERENCE_WATER_DEFAULTS.detailStrength,
            },
        };
    }

    dispose() { this.surface.dispose(); }
}
