import {AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
    Group, Mesh, MeshStandardMaterial, PointLight, ShaderMaterial, UniformsLib, UniformsUtils} from 'three';

/** Authored lantern socket measured on the supplied mine; no shadow map or flicker clock. */
export class MineWinterLight {
    readonly root = new Group();
    private cylinder = new CylinderGeometry(.05,.05,.13,6);
    private lampMaterial = new MeshStandardMaterial({color: '#ffda91', emissive: '#ffab40',
        emissiveIntensity: 3, roughness: .6});
    private glowGeometry = new BufferGeometry();
    private glow = new ShaderMaterial({transparent: true, depthWrite: false, side: DoubleSide,
        blending: AdditiveBlending, fog: true,
        uniforms: UniformsUtils.merge([UniformsLib.fog, {warmColor: {value: new Color('#ffbc70')}, opacity: {value: 0}}]),
        vertexShader: `attribute float strength; varying vec2 glowUv; varying float glowStrength;
            #include <fog_pars_vertex>
            void main(){glowUv=uv;glowStrength=strength;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
                gl_Position=projectionMatrix*mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform vec3 warmColor;uniform float opacity;varying vec2 glowUv;varying float glowStrength;
            #include <fog_pars_fragment>
            void main(){float across=pow(max(0.0,1.0-abs(glowUv.x*2.0-1.0)),1.5);
                float along=smoothstep(0.0,.12,glowUv.y)*(1.0-smoothstep(.3,1.0,glowUv.y));
                gl_FragColor=vec4(warmColor,opacity*glowStrength*across*along);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                #ifdef USE_FOG
                    #ifdef FOG_EXP2
                        float fade=1.0-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
                    #else
                        float fade=smoothstep(fogNear,fogFar,vFogDepth);
                    #endif
                    gl_FragColor.a*=1.0-fade;
                #endif
            }`,
    });
    private light = new PointLight('#ffc27d', 0, 3.4, 2);
    private winter = 0;
    constructor() {
        this.root.name = 'Mine winter lantern and shaft light';
        const lantern = new Mesh(this.cylinder,this.lampMaterial);
        lantern.name = 'Warm cylinder inside authored exterior lantern';
        lantern.position.set(.75,1.2,2.15);
        this.light.position.set(.75,1.22,2.28);
        this.light.castShadow = false;
        const positions: number[] = [], uv: number[] = [], strength: number[] = [];
        const quad = (points: number[][], power: number) => {
            const coords = [[0,0],[1,0],[1,1],[0,1]];
            for (const i of [0,1,2,0,2,3]) {positions.push(...points[i]);uv.push(...coords[i]);strength.push(power);}
        };
        // The source doorway is behind its projecting rails. Both patches remain inside the frame/pad.
        quad([[-.48,.12,1.75],[.48,.12,1.75],[.48,1.6,1.75],[-.48,1.6,1.75]], .45);
        quad([[-.6,.075,1.85],[.6,.075,1.85],[.9,.075,3.1],[-.9,.075,3.1]], .2);
        this.glowGeometry.setAttribute('position',new Float32BufferAttribute(positions,3));
        this.glowGeometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
        this.glowGeometry.setAttribute('strength',new Float32BufferAttribute(strength,1));
        const spill = new Mesh(this.glowGeometry,this.glow); spill.raycast = () => {};
        this.root.add(lantern,spill,this.light);
        this.setWinterWeight(0);
    }
    setWinterWeight(value: number) {
        this.winter = Math.max(0,Math.min(1,Number.isFinite(value) ? value : 0));
        this.root.visible = this.winter > .001;
        this.light.intensity = 2.5 * this.winter;
        this.glow.uniforms.opacity.value = this.winter;
    }
    inspect() {return {active: this.root.visible, winterWeight: this.winter,
        lanternPosition: [.75,1.2,2.15], shadowLights: 0, triangles: 28};}
    dispose() {
        this.root.removeFromParent(); this.light.dispose(); this.cylinder.dispose(); this.lampMaterial.dispose();
        this.glowGeometry.dispose(); this.glow.dispose();
    }
}
