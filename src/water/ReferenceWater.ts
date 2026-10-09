import {
    Box3, Camera, Color, Float32BufferAttribute, FrontSide, Mesh, PlaneGeometry, ShaderMaterial, Sphere, Vector3,
    type ColorRepresentation, type DataTexture,
} from 'three';
import { REFERENCE_WATER_FRAGMENT, REFERENCE_WATER_VERTEX } from './ReferenceWaterShaders';
import { createWaterTexture, WATER_TEXTURE_SIZE } from './ReferenceWaterTexture';
import { sampleWaveHeight } from './ReferenceWaterWaves';

export type ReferenceWaterQuality = 'low' | 'medium' | 'high';

export interface ReferenceWaterParameters {
    /** Maximum summed displacement in world metres. */
    waveAmplitude: number;
    /** Dimensionless multiplier; zero freezes all surface motion. */
    waveSpeed: number;
    /** Strength of the small surface slopes, independent of the swell. */
    detailStrength: number;
}

export interface ReferenceWaterOptions extends Partial<ReferenceWaterParameters> {
    size?: number;
    /** Optional open-sea skirt extent; must be at least size. Keeps the same triangle budget. */
    extent?: number;
    level?: number;
    quality?: ReferenceWaterQuality;
    deepColor?: ColorRepresentation;
    shallowColor?: ColorRepresentation;
}

export interface ReferenceWaterLighting {
    /** World-space direction from the surface toward the sun. */
    sunDirection?: Vector3;
    sunColor?: ColorRepresentation;
    skyColor?: ColorRepresentation;
    intensity?: number;
}

export const REFERENCE_WATER_PROFILES = {
    low: { segments: 32, normalSamples: 2 },
    medium: { segments: 64, normalSamples: 2 },
    high: { segments: 96, normalSamples: 3 },
} as const;

export const REFERENCE_WATER_DEFAULTS = {
    size: 40,
    level: 0,
    quality: 'medium' as ReferenceWaterQuality,
    waveAmplitude: 0.18,
    waveSpeed: 1,
    detailStrength: 0.65,
    deepColor: '#073650',
    shallowColor: '#078d92',
} as const;

function nonnegative(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${label} must be finite and nonnegative.`);
    }
}

function validateQuality(quality: ReferenceWaterQuality): void {
    if (!Object.prototype.hasOwnProperty.call(REFERENCE_WATER_PROFILES, quality)) {
        throw new RangeError('Water quality must be low, medium, or high.');
    }
}

/**
 * Reference-inspired open-water surface for Three.js WebGLRenderer.
 *
 * One opaque, front-facing draw with no scene capture, render target, light
 * dependency, external asset, or postprocessing. Add mesh to the scene and call
 * update with elapsed seconds. Pass the camera for orthographic rendering.
 * The surface is horizontal; use mesh.position to place it in the world.
 * This component owns and disposes all its geometry, material, and texture.
 */
export class ReferenceWater {
    readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
    private readonly texture: DataTexture;
    private readonly size: number;
    private readonly extent: number;
    private readonly parameters: ReferenceWaterParameters;
    private quality: ReferenceWaterQuality;
    private disposed = false;

    constructor(options: ReferenceWaterOptions = {}) {
        const config = { ...REFERENCE_WATER_DEFAULTS, ...options };
        nonnegative(config.size, 'Water size');
        if (config.size === 0) throw new RangeError('Water size must be greater than zero.');
        if (!Number.isFinite(config.level)) throw new RangeError('Water level must be finite.');
        validateQuality(config.quality);
        nonnegative(config.waveAmplitude, 'Wave amplitude');
        nonnegative(config.waveSpeed, 'Wave speed');
        nonnegative(config.detailStrength, 'Detail strength');

        const extent = options.extent ?? config.size;
        nonnegative(extent, 'Water extent');
        if (extent < config.size) throw new RangeError('Water extent must be at least water size.');
        this.size = config.size;
        this.extent = extent;
        this.quality = config.quality;
        this.parameters = {
            waveAmplitude: config.waveAmplitude,
            waveSpeed: config.waveSpeed,
            detailStrength: config.detailStrength,
        };
        this.texture = createWaterTexture();
        const material = new ShaderMaterial({
            name: 'Reference water single-pass material',
            vertexShader: REFERENCE_WATER_VERTEX,
            fragmentShader: REFERENCE_WATER_FRAGMENT,
            defines: { WATER_DETAIL_LAYERS: REFERENCE_WATER_PROFILES[this.quality].normalSamples },
            side: FrontSide,
            transparent: false,
            depthWrite: true,
            uniforms: {
                uSurfaceTexture: { value: this.texture },
                uTime: { value: 0 },
                uWaveAmplitude: { value: config.waveAmplitude },
                uGridSpacing: { value: this.size / REFERENCE_WATER_PROFILES[this.quality].segments },
                uWaveSpeed: { value: config.waveSpeed },
                uDetailStrength: { value: config.detailStrength },
                uDeepColor: { value: new Color(config.deepColor) },
                uShallowColor: { value: new Color(config.shallowColor) },
                uSkyColor: { value: new Color('#9cc3d8') },
                uSunColor: { value: new Color('#fff2dc') },
                uSunDirection: { value: new Vector3(-0.4, 0.7, -0.6).normalize() },
                uLightIntensity: { value: 1 },
                uOrthographic: { value: 0 },
                uViewDirection: { value: new Vector3(0, -1, 0) },
            },
        });

        this.mesh = new Mesh(this.createGeometry(), material);
        this.mesh.name = 'Reference water';
        this.mesh.position.y = config.level;
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.updateBounds();
    }

    /** Absolute elapsed time makes playback and reference comparisons deterministic. */
    update(elapsedSeconds: number, camera?: Camera): void {
        this.assertActive();
        nonnegative(elapsedSeconds, 'Elapsed seconds');
        const uniforms = this.mesh.material.uniforms;
        uniforms.uTime.value = elapsedSeconds;
        if (camera) {
            camera.getWorldDirection(uniforms.uViewDirection.value as Vector3);
            uniforms.uOrthographic.value = 'isOrthographicCamera' in camera ? 1 : 0;
        }
    }

    /**
     * World-space height of the rendered triangle at x/z, or null outside the surface.
     * Samples displaced grid vertices and interpolates the same triangle as the GPU.
     * Like rendering, this supports translated horizontal water, without rotation or scale.
     */
    getHeightAt(
        worldX: number, worldZ: number,
        elapsedSeconds: number = this.mesh.material.uniforms.uTime.value,
    ): number | null {
        this.assertActive();
        if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
            throw new RangeError('Water sample coordinates must be finite.');
        }
        nonnegative(elapsedSeconds, 'Elapsed seconds');
        this.mesh.updateWorldMatrix(true, false);
        const worldMatrix = this.mesh.matrixWorld.elements;
        const x = worldX - worldMatrix[12];
        const z = worldZ - worldMatrix[14];
        const positions = this.mesh.geometry.attributes.position;
        const segments = REFERENCE_WATER_PROFILES[this.quality].segments;
        const stride = segments + 1;
        if (x < positions.getX(0) || x > positions.getX(segments)
            || z < positions.getZ(0) || z > positions.getZ(segments * stride)) return null;

        const column = this.findGridCell(x, 1, 0);
        const row = this.findGridCell(z, stride, 2);
        const a = row * stride + column;
        const b = a + stride;
        const d = a + 1;
        const c = b + 1;
        const fractionX = (x - positions.getX(a)) / (positions.getX(d) - positions.getX(a));
        const fractionZ = (z - positions.getZ(a)) / (positions.getZ(b) - positions.getZ(a));
        if (fractionX + fractionZ <= 1) {
            const height = this.vertexHeight(a, elapsedSeconds);
            return height
                + (this.vertexHeight(d, elapsedSeconds) - height) * fractionX
                + (this.vertexHeight(b, elapsedSeconds) - height) * fractionZ;
        }
        const height = this.vertexHeight(c, elapsedSeconds);
        return height
            + (this.vertexHeight(b, elapsedSeconds) - height) * (1 - fractionX)
            + (this.vertexHeight(d, elapsedSeconds) - height) * (1 - fractionZ);
    }

    private findGridCell(coordinate: number, stride: number, axis: number): number {
        const positions = this.mesh.geometry.attributes.position;
        let lower = 0;
        let upper: number = REFERENCE_WATER_PROFILES[this.quality].segments;
        while (upper - lower > 1) {
            const middle = (lower + upper) >> 1;
            const value = positions.getComponent(middle * stride, axis);
            if (coordinate < value) upper = middle;
            else lower = middle;
        }
        return lower;
    }

    private vertexHeight(index: number, elapsedSeconds: number): number {
        const geometry = this.mesh.geometry;
        const positions = geometry.attributes.position;
        const worldMatrix = this.mesh.matrixWorld.elements;
        const height = sampleWaveHeight(
            positions.getX(index) + worldMatrix[12],
            positions.getZ(index) + worldMatrix[14],
            elapsedSeconds,
            this.parameters.waveAmplitude,
            this.parameters.waveSpeed,
            this.size / REFERENCE_WATER_PROFILES[this.quality].segments,
        );
        return worldMatrix[13] + positions.getY(index) + height * geometry.attributes.waveFade.getX(index);
    }

    setParameters(values: Partial<ReferenceWaterParameters>): void {
        this.assertActive();
        const next = { ...this.parameters, ...values };
        nonnegative(next.waveAmplitude, 'Wave amplitude');
        nonnegative(next.waveSpeed, 'Wave speed');
        nonnegative(next.detailStrength, 'Detail strength');
        Object.assign(this.parameters, next);
        const uniforms = this.mesh.material.uniforms;
        uniforms.uWaveAmplitude.value = next.waveAmplitude;
        uniforms.uWaveSpeed.value = next.waveSpeed;
        uniforms.uDetailStrength.value = next.detailStrength;
        this.updateBounds();
    }

    /** Switches geometry and compile-time detail count; the texture stays owned. */
    setQuality(quality: ReferenceWaterQuality): void {
        this.assertActive();
        validateQuality(quality);
        if (quality === this.quality) return;
        this.quality = quality;
        const previous = this.mesh.geometry;
        this.mesh.geometry = this.createGeometry();
        previous.dispose();
        const material = this.mesh.material;
        const samples = REFERENCE_WATER_PROFILES[quality].normalSamples;
        material.uniforms.uGridSpacing.value = this.size / REFERENCE_WATER_PROFILES[quality].segments;
        if (material.defines.WATER_DETAIL_LAYERS !== samples) {
            material.defines.WATER_DETAIL_LAYERS = samples;
            material.needsUpdate = true;
        }
        this.updateBounds();
    }

    setLighting(lighting: ReferenceWaterLighting): void {
        this.assertActive();
        const direction = lighting.sunDirection;
        if (direction && (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)
            || !Number.isFinite(direction.z) || direction.lengthSq() === 0)) {
            throw new RangeError('Sun direction must be finite and nonzero.');
        }
        if (lighting.intensity !== undefined) nonnegative(lighting.intensity, 'Light intensity');
        const uniforms = this.mesh.material.uniforms;
        if (direction) (uniforms.uSunDirection.value as Vector3).copy(direction).normalize();
        if (lighting.sunColor !== undefined) (uniforms.uSunColor.value as Color).set(lighting.sunColor);
        if (lighting.skyColor !== undefined) (uniforms.uSkyColor.value as Color).set(lighting.skyColor);
        if (lighting.intensity !== undefined) uniforms.uLightIntensity.value = lighting.intensity;
    }

    getStats() {
        const profile = REFERENCE_WATER_PROFILES[this.quality];
        // RGBA8 mip chain from 128² through 1², without driver allocation overhead.
        const textureBytes = (WATER_TEXTURE_SIZE * WATER_TEXTURE_SIZE * 4 - 1) / 3 * 4;
        return {
            quality: this.quality,
            triangles: profile.segments * profile.segments * 2,
            normalSamples: profile.normalSamples,
            textureBytes,
            drawCalls: 1 as const,
        };
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.texture.dispose();
    }

    private createGeometry(): PlaneGeometry {
        const segments = REFERENCE_WATER_PROFILES[this.quality].segments;
        const geometry = new PlaneGeometry(this.size, this.size, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        const positions = geometry.attributes.position;
        const waveFade = new Float32Array(positions.count).fill(1);
        if (this.extent > this.size) {
            const halfSize = this.size / 2;
            const halfExtent = this.extent / 2;
            for (let index = 0; index < positions.count; index++) {
                const x = positions.getX(index);
                const z = positions.getZ(index);
                const boundaryX = Math.abs(x) > halfSize - this.size * 0.000001;
                const boundaryZ = Math.abs(z) > halfSize - this.size * 0.000001;
                if (boundaryX) positions.setX(index, Math.sign(x) * halfExtent);
                if (boundaryZ) positions.setZ(index, Math.sign(z) * halfExtent);
                // Both ends of every stretched skirt triangle must be flat.
                // Taper inside the regular grid to avoid horizon-sized slope interpolation.
                const column = index % (segments + 1);
                const row = Math.floor(index / (segments + 1));
                const edgeCells = Math.min(column, row, segments - column, segments - row);
                const fade = Math.max(0, Math.min(1, (edgeCells - 1) / 3));
                waveFade[index] = fade * fade * (3 - 2 * fade);
            }
            positions.needsUpdate = true;
        }
        geometry.setAttribute('waveFade', new Float32BufferAttribute(waveFade, 1));
        return geometry;
    }

    private updateBounds(): void {
        const halfSize = this.extent / 2;
        const amplitude = this.parameters.waveAmplitude;
        this.mesh.geometry.boundingBox = new Box3(
            new Vector3(-halfSize, -amplitude, -halfSize),
            new Vector3(halfSize, amplitude, halfSize),
        );
        this.mesh.geometry.boundingSphere = new Sphere(
            new Vector3(), Math.hypot(halfSize, halfSize, amplitude),
        );
    }

    private assertActive(): void {
        if (this.disposed) throw new Error('Reference water has been disposed.');
    }
}
