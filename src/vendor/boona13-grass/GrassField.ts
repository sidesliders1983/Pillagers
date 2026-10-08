import * as THREE from 'three';
import { GRASS_FRAGMENT, GRASS_VERTEX } from './grassShader.glsl';

/**
 * Optional configuration. Sensible defaults match the demo screenshot.
 *
 * The defaults produce ~30k blades over a 44 m square at 0.18 m spacing,
 * which renders smoothly on integrated GPUs in a forward pipeline.
 */
export interface GrassFieldOptions {
  /** Edge length of the square grass patch (world units). Default 44. */
  groundSize?: number;
  /** Average blade-to-blade spacing (world units). Smaller = denser. Default 0.18. */
  spacing?: number;
  /** Blade height (world units). Default 0.5. */
  bladeHeight?: number;
  /** Random multiplier on blade height (±). Default 0.4. */
  bladeHeightVariation?: number;
  /** Blade base width (world units). Default 0.06. */
  bladeWidth?: number;
  /** Number of vertical segments per blade. 2 is cheap, 4 looks lush. Default 4. */
  segments?: number;
  /** Number of blades per tuft (3 is a nice triangle, 2 is cheaper). Default 3. */
  bladesPerTuft?: number;
  /** Base color for blades. Default #7da653. */
  baseColor?: THREE.Color;
  /** Tip color for blades — used to compute the tip-lift highlight. Default #d3e07f. */
  tipColor?: THREE.Color;
  /** Hue jitter applied per blade. Default 0.06. */
  hueVariation?: number;
  /** Lightness jitter applied per blade. Default 0.18. */
  lightnessVariation?: number;
  /** Wind speed (Hz-ish). Default 1.1. */
  windSpeed?: number;
  /** Wind base strength. Default 1.0. */
  windStrength?: number;
  /** Wind gust strength (faster octave). Default 0.55. */
  gustStrength?: number;
  /** Forward-bend amount applied to tips. Default 0.18. */
  bladeLean?: number;
  /** Time (seconds) for blades to grow in after first appearing. Default 0.6. */
  growthDuration?: number;
  /** Random seed for placement + colors. Default 1. */
  seed?: number;
}

const DEFAULTS: Required<GrassFieldOptions> = {
  groundSize: 44,
  spacing: 0.18,
  bladeHeight: 0.5,
  bladeHeightVariation: 0.4,
  bladeWidth: 0.06,
  segments: 4,
  bladesPerTuft: 3,
  baseColor: new THREE.Color('#7da653'),
  tipColor: new THREE.Color('#d3e07f'),
  hueVariation: 0.06,
  lightnessVariation: 0.18,
  windSpeed: 1.1,
  windStrength: 1.0,
  gustStrength: 0.55,
  bladeLean: 0.18,
  growthDuration: 0.6,
  seed: 1,
};

/**
 * A self-contained instanced grass renderer.
 *
 * Usage:
 * ```ts
 * const field = new GrassField(scene, { groundSize: 50 });
 * field.setTerrainHeightTexture(myHeightTex, 50, 128); // optional — flat by default
 * function tick(t: number) { field.update(t); }
 * ```
 */
export class GrassField {
  readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.InstancedMesh;
  private readonly opts: Required<GrassFieldOptions>;
  private readonly geometry: THREE.BufferGeometry;
  private readonly flatHeight: THREE.DataTexture;
  private readonly instanceCount: number;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, options: GrassFieldOptions = {}) {
    this.scene = scene;
    this.opts = { ...DEFAULTS, ...options };

    this.geometry = createTuftGeometry(
      this.opts.bladesPerTuft,
      this.opts.segments,
      this.opts.bladeWidth,
    );

    const flatHeight = this.flatHeight = createFlatHeightTexture();
    const tipLift = computeTipLift(this.opts.baseColor, this.opts.tipColor);

    this.material = new THREE.ShaderMaterial({
      vertexShader: GRASS_VERTEX,
      fragmentShader: GRASS_FRAGMENT,
      glslVersion: THREE.GLSL3,
      lights: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.lights,
        {
          time:           { value: 0 },
          windSpeed:      { value: this.opts.windSpeed },
          windStrength:   { value: this.opts.windStrength },
          gustStrength:   { value: this.opts.gustStrength },
          bendStrength:   { value: this.opts.bladeLean },
          growthDuration: { value: this.opts.growthDuration },
          tipLift:        { value: tipLift },
          uSunDir:        { value: new THREE.Vector3(0.45, 0.88, 0.25).normalize() },
          uSunColor:      { value: new THREE.Vector3(0.34, 0.32, 0.30) },
          uAmbientColor:  { value: new THREE.Vector3(0.48, 0.58, 0.34) },
          uFillDir:       { value: new THREE.Vector3(-0.35, 1.0, -0.18).normalize() },
          uFillColor:     { value: new THREE.Vector3(0.12, 0.14, 0.10) },
          pushCenter:     { value: new THREE.Vector2() },
          pushRadius:     { value: 1.1 },
          pushStrength:   { value: 0.22 },
          pushEnabled:    { value: 0 },
          uTerrainHeightmap: { value: flatHeight },
          uTerrainParams:    { value: new THREE.Vector2(this.opts.groundSize, 1 / 128) },
        },
      ]),
    });

    this.material.uniforms.uTerrainHeightmap.value = flatHeight;

    const tufts = generateTufts(this.opts);
    this.instanceCount = tufts.length;

    const birth = new Float32Array(this.instanceCount);
    for (let i = 0; i < this.instanceCount; i++) birth[i] = tufts[i].birthTime;
    this.geometry.setAttribute('birthTime', new THREE.InstancedBufferAttribute(birth, 1));

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.instanceCount);
    this.mesh.name = 'grass-field';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.instanceCount; i++) {
      const t = tufts[i];
      quaternion.setFromAxisAngle(up, t.rotation);
      matrix.compose(t.position, quaternion, t.scale);
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, t.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    scene.add(this.mesh);
  }

  /** Number of blade tufts placed in the field. */
  get count(): number {
    return this.instanceCount;
  }

  /**
   * Bind a terrain heightmap for GPU height conformance and slope-based
   * culling. The texture must be a single-channel float DataTexture mapped
   * over a square region of `worldSize` world units, sampled at `resolution`
   * texels per side.
   */
  setTerrainHeightTexture(tex: THREE.DataTexture, worldSize: number, resolution: number): void {
    this.material.uniforms.uTerrainHeightmap.value = tex;
    (this.material.uniforms.uTerrainParams.value as THREE.Vector2).set(worldSize, 1 / resolution);
  }

  /**
   * Push the grass aside from a moving point — e.g. a player's feet.
   * Pass `null` to disable.
   */
  setPushField(center: THREE.Vector2 | null, radius = 1.1, strength = 0.22): void {
    if (!center) {
      this.material.uniforms.pushEnabled.value = 0;
      return;
    }
    (this.material.uniforms.pushCenter.value as THREE.Vector2).copy(center);
    this.material.uniforms.pushRadius.value = radius;
    this.material.uniforms.pushStrength.value = strength;
    this.material.uniforms.pushEnabled.value = 1;
  }

  /** Override the sun direction. */
  setSunDirection(dir: THREE.Vector3): void {
    (this.material.uniforms.uSunDir.value as THREE.Vector3).copy(dir).normalize();
  }

  /** Set the three light colors. Pass plain THREE.Colors. */
  setLightColors(sun: THREE.Color, ambient: THREE.Color, fill: THREE.Color): void {
    (this.material.uniforms.uSunColor.value as THREE.Vector3).set(sun.r, sun.g, sun.b);
    (this.material.uniforms.uAmbientColor.value as THREE.Vector3).set(ambient.r, ambient.g, ambient.b);
    (this.material.uniforms.uFillColor.value as THREE.Vector3).set(fill.r, fill.g, fill.b);
  }

  /** Live-tweak wind. */
  setWind(speed: number, strength: number, gust: number): void {
    this.material.uniforms.windSpeed.value = speed;
    this.material.uniforms.windStrength.value = strength;
    this.material.uniforms.gustStrength.value = gust;
  }

  /** Advance the shader clock. Call once per frame. */
  update(timeSeconds: number): void {
    this.material.uniforms.time.value = timeSeconds;
  }

  /** Remove from the scene and free GPU memory. */
  dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
    this.flatHeight.dispose();
  }
}

interface Tuft {
  position: THREE.Vector3;
  rotation: number;
  scale: THREE.Vector3;
  color: THREE.Color;
  birthTime: number;
}

function generateTufts(opts: Required<GrassFieldOptions>): Tuft[] {
  const tufts: Tuft[] = [];
  const halfSize = opts.groundSize * 0.5;
  const spacing = opts.spacing;
  const jitter = spacing * 0.5;
  const start = -halfSize + spacing * 0.5;
  const end = halfSize - spacing * 0.5;
  const rng = mulberry32(opts.seed);

  for (let x = start; x <= end; x += spacing) {
    for (let z = start; z <= end; z += spacing) {
      const px = x + (rng() - 0.5) * 2 * jitter;
      const pz = z + (rng() - 0.5) * 2 * jitter;

      const edge = edgeCoverage(px, pz, halfSize);
      if (edge <= 0.01) continue;
      if (rng() > edge) continue;

      const heightFactor = THREE.MathUtils.lerp(
        Math.max(0.2, 1 - opts.bladeHeightVariation),
        1 + opts.bladeHeightVariation,
        rng(),
      );
      const height = opts.bladeHeight * heightFactor;
      const widthFactor = THREE.MathUtils.lerp(0.86, 1.18, rng());

      const color = opts.baseColor.clone().offsetHSL(
        (rng() - 0.5) * opts.hueVariation,
        (rng() - 0.5) * opts.hueVariation * 0.25,
        (rng() - 0.5) * opts.lightnessVariation,
      );

      tufts.push({
        position: new THREE.Vector3(px, 0, pz),
        rotation: rng() * Math.PI * 2,
        scale: new THREE.Vector3(widthFactor, height, widthFactor),
        color,
        birthTime: 0,
      });
    }
  }

  return tufts;
}

function createTuftGeometry(bladeCount: number, segments: number, width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = Math.max(2, segments);

  for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex++) {
    const angle = (bladeIndex / bladeCount) * Math.PI;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const vertexOffset = positions.length / 3;

    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const widthProfile = Math.pow(1 - t, 0.58) * (0.38 + Math.sin((1 - t) * Math.PI * 0.5) * 0.62);
      const halfWidth = Math.max(width * 0.04, width * widthProfile);

      const leftX = -halfWidth * cosAngle;
      const leftZ = -halfWidth * sinAngle;
      const rightX = halfWidth * cosAngle;
      const rightZ = halfWidth * sinAngle;

      positions.push(leftX, t, leftZ, rightX, t, rightZ);
      uvs.push(0, t, 1, t);

      if (row < rows) {
        const base = vertexOffset + row * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function edgeCoverage(x: number, z: number, halfSize: number): number {
  const margin = 1.8;
  const boundary = Math.max(Math.abs(x), Math.abs(z));
  return 1 - THREE.MathUtils.smoothstep(boundary, halfSize - margin, halfSize);
}

function computeTipLift(base: THREE.Color, tip: THREE.Color): number {
  return Math.max(0.04, ((tip.r - base.r) + (tip.g - base.g) + (tip.b - base.b)) / 3);
}

function createFlatHeightTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    new Float32Array([0]),
    1,
    1,
    THREE.RedFormat,
    THREE.FloatType,
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
