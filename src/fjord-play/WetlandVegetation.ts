import {Color, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Scene, Vector3, type Object3D} from 'three';
import type {WorldLighting} from '../core/WorldLighting';
import {GrassField} from '../vendor/boona13-grass/GrassField';
import {StructureSeasonTint} from '../world/StructureSeasonTint';
import {WetlandModelAsset} from './WetlandModelAsset';

export interface MarshPlant {
    x: number; y: number; z: number;
    height: number; width: number; rotation: number;
}

/** Bounded decorative instances; placement is supplied by discovered canonical peat cells. */
export class WetlandVegetation {
    readonly root = new Group();
    private grass?: GrassField;
    private cattails: InstancedMesh[] = [];
    private points: MarshPlant[] = [];
    private template?: Object3D;
    private preparation?: Promise<void>;
    private tint?: StructureSeasonTint;
    private disposed = false;
    private time = 0;
    private snow = {value: 0};
    private fogColor = {value: new Color('#81969d')};
    private fogNear = {value: 80};
    private fogFar = {value: 180};
    private sunDirection = new Vector3();
    private sunColor = new Color();
    private ambientColor = new Color();
    private fillColor = new Color();
    constructor(private source: WetlandModelAsset, private decorate?: (root: Object3D) => void) {}
    sync(grass: MarshPlant[], cattails: MarshPlant[]) {
        if (this.disposed) return;
        this.clear();
        this.points = cattails.slice(0, 32);
        if (grass.length) this.createGrass(grass.slice(0, 256));
        this.createCattails();
        if (this.points.length && !this.preparation) this.preparation = this.source.prepare().then(template => {
            if (this.disposed || !template) return;
            this.template = template;
            this.createCattails();
        });
    }
    private matrix(point: MarshPlant, target: Matrix4) {
        return target.compose(new Vector3(point.x, point.y, point.z),
            new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), point.rotation),
            new Vector3(point.width, point.height, point.width));
    }
    private createGrass(points: MarshPlant[]) {
        // GrassField requires a Scene owner. Take its public mesh into this owned group;
        // the empty staging scene is retained only by its normal resource disposer.
        const field = this.grass = new GrassField(new Scene(), {
            groundSize: 24, spacing: 1, segments: 3, bladesPerTuft: 3,
            bladeHeight: 1, bladeWidth: .045, seed: 22367,
            baseColor: new Color('#53663a').convertLinearToSRGB(),
            tipColor: new Color('#8f9b58').convertLinearToSRGB(),
            windSpeed: 1.1, windStrength: 3, gustStrength: 1, bladeLean: .12,
        });
        const mesh = field.mesh, matrix = new Matrix4(), births = mesh.geometry.getAttribute('birthTime');
        mesh.name = 'Tall marsh grass';
        mesh.count = Math.min(points.length, field.count);
        for (let i = 0; i < mesh.count; i++) {
            mesh.setMatrixAt(i, this.matrix(points[i], matrix));
            births.setX(i, -1); // A paused campaign starts with mature blades, not an invisible grow-in.
        }
        mesh.instanceMatrix.needsUpdate = true;
        births.needsUpdate = true;
        mesh.raycast = () => {};
        mesh.computeBoundingSphere();
        // Shader wind bends wide blades beyond their static geometry bounds.
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 1.1;
        mesh.frustumCulled = true;
        field.material.onBeforeCompile = shader => {
            shader.uniforms.marshSnow = this.snow;
            shader.uniforms.marshFogColor = this.fogColor;
            shader.uniforms.marshFogNear = this.fogNear;
            shader.uniforms.marshFogFar = this.fogFar;
            shader.fragmentShader = `uniform float marshSnow;uniform vec3 marshFogColor;
                uniform float marshFogNear;uniform float marshFogFar;\n` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('fragColor = vec4(color, 1.0);', `
                float viewDepth = -(viewMatrix * vec4(vWorldPos, 1.0)).z;
                float fogAmount = smoothstep(marshFogNear, marshFogFar, viewDepth);
                vec3 snowyGrass = mix(color, vec3(.76,.79,.75), marshSnow*.7);
                fragColor = vec4(mix(snowyGrass, marshFogColor, fogAmount), 1.0);`);
        };
        field.material.customProgramCacheKey = () => 'marsh-grass-fog-snow-v1';
        this.root.add(mesh);
        field.update(this.time);
    }
    private clearCattails() {
        this.tint?.dispose(); this.tint = undefined;
        for (const mesh of this.cattails) {mesh.removeFromParent(); mesh.dispose();}
        this.cattails = [];
    }
    private createCattails() {
        this.clearCattails();
        if (!this.template || !this.points.length || this.disposed) return;
        this.template.updateMatrixWorld(true);
        const matrix = new Matrix4();
        this.template.traverse(node => {
            if (!(node instanceof Mesh)) return;
            const mesh = new InstancedMesh(node.geometry, node.material, this.points.length);
            mesh.name = 'Marsh Cattails';
            for (let i = 0; i < this.points.length; i++)
                mesh.setMatrixAt(i, this.matrix({...this.points[i], width: this.points[i].width * this.points[i].height}, matrix)
                    .multiply(node.matrixWorld));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere(); mesh.receiveShadow = true; mesh.castShadow = false;
            mesh.raycast = () => {};
            this.cattails.push(mesh); this.root.add(mesh);
        });
        this.tint = new StructureSeasonTint(this.root);
        this.tint.setSnowAmount(this.snow.value);
        this.decorate?.(this.root);
    }
    setTime(time: number) {this.time = time; this.grass?.update(time);}
    setSnowAmount(amount: number) {this.snow.value = amount; this.tint?.setSnowAmount(amount);}
    setLighting(lighting: WorldLighting) {
        if (!this.grass) return;
        let strength = lighting.copySeasonalSun(this.sunDirection, this.sunColor);
        if (strength === undefined) {
            this.sunDirection.copy(lighting.directional.position).sub(lighting.directional.target.position).normalize();
            this.sunColor.copy(lighting.directional.color); strength = lighting.directional.intensity;
        }
        this.sunColor.convertLinearToSRGB().multiplyScalar(Math.min(1.5, strength) * .45);
        this.ambientColor.copy(lighting.ambient.color).convertLinearToSRGB()
            .multiplyScalar(Math.max(.12, Math.min(.7, lighting.ambient.intensity * .7)));
        this.fillColor.copy(lighting.ambient.groundColor).convertLinearToSRGB().multiplyScalar(.12);
        this.grass.setSunDirection(this.sunDirection);
        this.grass.setLightColors(this.sunColor, this.ambientColor, this.fillColor);
        this.fogColor.value.copy(lighting.fog.color).convertLinearToSRGB();
        this.fogNear.value = lighting.fog.near; this.fogFar.value = lighting.fog.far;
    }
    inspect() {
        const meshes = [...(this.grass ? [this.grass.mesh] : []), ...this.cattails];
        const triangles = meshes.reduce((sum, mesh) => sum +
            (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count, 0);
        return {grassTufts: this.grass?.mesh.count ?? 0, reedInstances: this.cattails.length ? this.points.length : 0,
            triangles, drawCalls: meshes.filter(mesh => mesh.count > 0).length, windTime: this.time, asset: this.source.inspect()};
    }
    clear() {
        this.clearCattails();
        this.grass?.mesh.removeFromParent(); this.grass?.dispose(); this.grass = undefined;
        this.root.clear(); this.points = [];
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.clear(); this.source.dispose(); this.root.removeFromParent();
    }
}
