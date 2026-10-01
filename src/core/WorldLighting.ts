import { Scene, Color, Fog, HemisphereLight, DirectionalLight, PointLight, WebGLRenderer, Mesh, ShaderMaterial, CircleGeometry } from 'three';
import { lightingConfig as config, LightingMode, fireFlicker } from '../config/lightingConfig';
import { AssetManager } from './AssetManager';
import { hearth } from '../world/SettlementLayout';
import { surfaceHeightAt } from '../world/Terrain';
export class WorldLighting {
    readonly ambient=new HemisphereLight();
    // Reuse one directional source and one shadow map across presets.
    readonly directional=new DirectionalLight();
    readonly campfire=new PointLight(config.fire.color,0,config.fire.radius,config.fire.decay);
    readonly fog=new Fog(config.day.sky,config.day.fogNear,config.day.fogFar);
    readonly halo:Mesh<CircleGeometry,ShaderMaterial>;
    mode:LightingMode='day';
    private fogEnabled=true;
    constructor(private scene:Scene,private renderer:WebGLRenderer,private assets:AssetManager){
        scene.background=new Color(config.day.sky);scene.add(this.ambient,this.directional,this.campfire);
        this.directional.castShadow=true;
        const sun=config.day;
        this.directional.shadow.mapSize.set(sun.shadowMapSize,sun.shadowMapSize);
        Object.assign(this.directional.shadow.camera,{left:-50,right:50,top:50,bottom:-50,near:1,far:110});
        Object.assign(this.directional.shadow,{radius:sun.shadowRadius,blurSamples:sun.shadowBlurSamples,normalBias:sun.shadowNormalBias});
        const ground=surfaceHeightAt(hearth.x,hearth.z);
        this.campfire.position.set(hearth.x,ground+config.fire.height,hearth.z);
        // No point-light cube shadow maps: one warm light + cheap surface halo.
        this.campfire.castShadow=false;
        const material=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:{color:{value:new Color(config.fire.color)},opacity:{value:0}},
            vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader:`uniform vec3 color; uniform float opacity; varying vec2 vUv;
                void main(){float d=length(vUv-.5)*2.0;gl_FragColor=vec4(color,opacity*pow(max(0.0,1.0-d),2.0));
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                }`});
        this.halo=new Mesh(new CircleGeometry(config.fire.haloRadius,32),material);this.halo.name='fire-ground-glow';
        this.halo.rotation.x=-Math.PI/2;this.halo.position.set(hearth.x,ground+.035,hearth.z);scene.add(this.halo);
        // Decorative light-spill geometry must not intercept resident selection.
        this.halo.raycast=()=>{};
        for(const material of assets.windowMaterials)material.emissive.setHex(config.windows.color);
        for(const material of assets.fireMaterials)material.emissive.setHex(config.fire.emissive);
        this.setMode('day');
    }
    setMode(mode:LightingMode){
        this.mode=mode;const night=mode==='night',preset=night?config.night:config.day;
        (this.scene.background as Color).setHex(preset.sky);this.fog.color.setHex(night?config.night.fogColor:config.day.sky);
        this.fog.near=preset.fogNear;this.fog.far=preset.fogFar;this.scene.fog=this.fogEnabled?this.fog:null;
        this.ambient.color.setHex(preset.ambientSky);this.ambient.groundColor.setHex(preset.ambientGround);this.ambient.intensity=preset.ambient;
        this.directional.color.setHex(night?config.night.moon:config.day.sun);
        this.directional.intensity=night?config.night.moonIntensity:config.day.sunIntensity;
        this.directional.position.fromArray(night?config.night.moonPosition:config.day.sunPosition);
        this.directional.name=night?'Moonlight':'Sunlight';
        const size=preset.shadowMapSize;
        if(this.directional.shadow.mapSize.x!==size){this.directional.shadow.map?.dispose();this.directional.shadow.map=null;this.directional.shadow.mapSize.set(size,size);}
        this.renderer.shadowMap.needsUpdate=true;this.renderer.toneMappingExposure=preset.exposure;
        this.campfire.visible=night;this.halo.visible=night;
        for(const material of this.assets.windowMaterials)material.emissiveIntensity=night?config.windows.emissiveIntensity:0;
        for(const material of this.assets.fireMaterials)material.emissiveIntensity=night?config.fire.emissiveIntensity:0;
        this.update(0);
    }
    setFog(enabled:boolean){this.fogEnabled=enabled;this.scene.fog=enabled?this.fog:null;}
    update(time:number){
        if(this.mode!=='night')return;
        const flicker=fireFlicker(time);this.campfire.intensity=config.fire.intensity*flicker;
        this.halo.material.uniforms.opacity.value=config.fire.haloOpacity*flicker;
        for(const material of this.assets.fireMaterials)material.emissiveIntensity=config.fire.emissiveIntensity*flicker;
    }
}
