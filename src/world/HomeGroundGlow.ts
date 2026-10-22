import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Mesh,
    Object3D, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';
import { lightingConfig } from '../config/lightingConfig';

interface WindowOpening { position: number[]; outward: number[] }

/** One terrain-conforming transparent batch per settlement; no per-window light or shadow. */
export class HomeGroundGlow {
    private readonly geometry = new BufferGeometry();
    private readonly material = new ShaderMaterial({
        transparent: true, depthWrite: false, fog: true, blending: AdditiveBlending,
        uniforms: UniformsUtils.merge([UniformsLib.fog, {
            color: { value: new Color(lightingConfig.windows.color) }, opacity: { value: 0 },
        }]),
        vertexShader: `
            varying vec2 vGlowUv;
            #include <fog_pars_vertex>
            void main() {
                vGlowUv = uv;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `
            uniform vec3 color;
            uniform float opacity;
            varying vec2 vGlowUv;
            #include <fog_pars_fragment>
            void main() {
                float across = pow(max(0.0, 1.0 - abs(vGlowUv.x * 2.0 - 1.0)), 1.6);
                float along = smoothstep(0.0, 0.12, vGlowUv.y) *
                    (1.0 - smoothstep(0.2, 1.0, vGlowUv.y));
                gl_FragColor = vec4(color, opacity * across * along);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                // An additive glow fades to black in distance fog, never adds the fog color.
                #ifdef USE_FOG
                    #ifdef FOG_EXP2
                        float glowFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
                    #else
                        float glowFog = smoothstep(fogNear, fogFar, vFogDepth);
                    #endif
                    gl_FragColor.a *= 1.0 - glowFog;
                #endif
            }`,
    });
    readonly mesh = new Mesh(this.geometry, this.material);
    private signature = '';
    private visibilityVersion = '';
    private patches = 0;
    private rebuilds = 0;
    private darkness = 0;
    constructor(private heightAt: (x: number, z: number) => number,
        private visible: (x: number, z: number) => boolean = () => true) {
        this.mesh.name = 'Warm window ground glow';
        this.mesh.raycast = () => {};
        this.mesh.visible = false;
    }
    setVisibilityVersion(version: string) { this.visibilityVersion = version; }
    sync(houses: readonly Object3D[]) {
        for (const house of houses) house.updateWorldMatrix(true, false);
        const signature = this.visibilityVersion + '|' + houses.map(house =>
            house.uuid + ':' + house.matrixWorld.elements.join(',')).join('|');
        if (signature === this.signature) return;
        this.signature = signature;
        this.rebuilds++;
        const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
        const config = lightingConfig.windows.spill, segments = config.segments;
        const origin = new Vector3(), outward = new Vector3();
        this.patches = 0;
        for (const house of houses) {
            const windows = house.userData.homeLightWindows as WindowOpening[] | undefined;
            for (const window of windows ?? []) {
                origin.fromArray(window.position).applyMatrix4(house.matrixWorld);
                outward.fromArray(window.outward).transformDirection(house.matrixWorld);
                const length = Math.hypot(outward.x, outward.z);
                if (length < .01) continue;
                outward.x /= length; outward.z /= length;
                const base = positions.length / 3, allowed: boolean[] = [];
                for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
                    const u = col / segments, v = row / segments;
                    const distance = .12 + v * config.length;
                    const across = (u * 2 - 1) * config.halfWidth * (.45 + .55 * v);
                    const x = origin.x + outward.x * distance + outward.z * across;
                    const z = origin.z + outward.z * distance - outward.x * across;
                    positions.push(x, this.heightAt(x, z) + config.surfaceOffset, z);
                    uvs.push(u, v);
                    allowed.push(this.visible(x, z));
                }
                let emitted = false;
                for (let row = 0; row < segments; row++) for (let col = 0; col < segments; col++) {
                    const a = row * (segments + 1) + col, b = a + 1;
                    const c = a + segments + 1, d = c + 1;
                    if (![a, b, c, d].every(index => allowed[index])) continue;
                    const centerX = (positions[(base + a) * 3] + positions[(base + d) * 3]) / 2;
                    const centerZ = (positions[(base + a) * 3 + 2] + positions[(base + d) * 3 + 2]) / 2;
                    if (!this.visible(centerX, centerZ)) continue;
                    indices.push(base + a, base + c, base + b, base + b, base + c, base + d);
                    emitted = true;
                }
                if (emitted) this.patches++;
            }
        }
        // Replacing attributes on a retained geometry leaks old GPU buffers in Three.
        this.geometry.dispose();
        this.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        this.geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        this.geometry.setIndex(indices);
        this.geometry.computeBoundingSphere();
        this.setDarkness(this.darkness);
    }
    setDarkness(darkness: number) {
        this.darkness = Math.max(0, Math.min(1, darkness));
        this.material.uniforms.opacity.value = this.darkness * lightingConfig.windows.spill.opacity;
        this.mesh.visible = this.patches > 0 && this.darkness > 0;
    }
    inspect() {
        return { patches: this.patches, rebuilds: this.rebuilds, visible: this.mesh.visible,
            opacity: this.material.uniforms.opacity.value, drawCalls: this.mesh.visible ? 1 : 0 };
    }
    dispose() {
        this.mesh.removeFromParent();
        this.geometry.dispose(); this.material.dispose();
    }
}
