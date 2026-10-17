import { Scene, Color, Fog, HemisphereLight, DirectionalLight, PointLight, WebGLRenderer, Mesh, ShaderMaterial, CircleGeometry, MathUtils, Vector3, Box3, Object3D, PerspectiveCamera } from 'three';
import { lightingConfig as config, LightingMode, fireFlicker, type SeasonalLightingTreatment } from '../config/lightingConfig';
import { DirectionalShadowCoverage } from './DirectionalShadowCoverage';
import { AssetManager } from './AssetManager';
import { hearth } from '../world/SettlementLayout';
import { surfaceHeightAt } from '../world/Terrain';
import { TimeVisualization, daylight, seasonBlend } from '../config/timeVisualization';
type DayLightingSettings = {[K in keyof typeof config.day]: K extends 'sunPosition' ? readonly number[] : number};
export class WorldLighting {
    readonly ambient=new HemisphereLight();
    // Reuse one directional source and one shadow map across presets.
    readonly directional=new DirectionalLight();
    readonly campfire=new PointLight(config.fire.color,0,config.fire.radius,config.fire.decay);
    readonly fog=new Fog(config.day.sky,config.day.fogNear,config.day.fogFar);
    readonly halo:Mesh<CircleGeometry,ShaderMaterial>;
    mode:LightingMode='day';
    visualization:TimeVisualization='off';
    private nightWeight=0;
    private blendColor=new Color();
    private weatherColor=new Color();
    private dayColor=new Color();
    private seasonWeather:DayLightingSettings|null=null;
    private fogEnabled=true;
    private readonly lightDirection = new Vector3();
    private shadowCoverage?: DirectionalShadowCoverage;
    constructor(private scene:Scene,private renderer:WebGLRenderer,private assets:AssetManager,fireAnchor?:Vector3,
        private worldAnchor?:Vector3,private quality: 'standard' | 'low' = 'standard',
        private seasonTreatment: SeasonalLightingTreatment = { ambientScale: 1, directScale: 1 }){
        scene.background=new Color(config.day.sky);scene.add(this.ambient,this.directional,this.campfire);
        this.directional.castShadow=true;
        const sun=config.day;
        this.directional.shadow.mapSize.set(sun.shadowMapSize,sun.shadowMapSize);
        Object.assign(this.directional.shadow.camera,{left:-50,right:50,top:50,bottom:-50,near:1,far:110});
        Object.assign(this.directional.shadow,{radius:sun.shadowRadius,blurSamples:sun.shadowBlurSamples,normalBias:sun.shadowNormalBias});
        const ground=fireAnchor?.y??surfaceHeightAt(hearth.x,hearth.z);
        const fireX=fireAnchor?.x??hearth.x,fireZ=fireAnchor?.z??hearth.z;
        this.campfire.position.set(fireX,ground+config.fire.height,fireZ);
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
        this.halo.rotation.x=-Math.PI/2;this.halo.position.set(fireX,ground+.035,fireZ);scene.add(this.halo);
        // Decorative light-spill geometry must not intercept resident selection.
        this.halo.raycast=()=>{};
        for(const material of assets.windowMaterials)material.emissive.setHex(config.windows.color);
        for(const material of assets.fireMaterials)material.emissive.setHex(config.fire.emissive);
        this.setMode('day');
    }
    setMode(mode:LightingMode,day:DayLightingSettings=config.day){
        this.shadowCoverage?.invalidate();
        this.visualization='off';
        this.seasonWeather=null;
        this.nightWeight=mode==='night'?1:0;
        this.mode=mode;const night=mode==='night',preset=night?config.night:day;
        (this.scene.background as Color).setHex(preset.sky);this.fog.color.setHex(night?config.night.fogColor:day.sky);
        this.fog.near=preset.fogNear;this.fog.far=preset.fogFar;this.scene.fog=this.fogEnabled?this.fog:null;
        this.ambient.color.setHex(preset.ambientSky);this.ambient.groundColor.setHex(preset.ambientGround);this.ambient.intensity=preset.ambient;
        this.directional.color.setHex(night?config.night.moon:day.sun);
        this.directional.intensity=night?config.night.moonIntensity:day.sunIntensity;
        this.directional.position.fromArray(night?config.night.moonPosition:day.sunPosition);
        this.directional.name=night?'Moonlight':'Sunlight';
        this.directional.target.position.set(0,0,0);this.directional.target.updateMatrixWorld(true);
        Object.assign(this.directional.shadow.camera,{left:-50,right:50,top:50,bottom:-50,near:1,far:110});
        this.directional.shadow.camera.updateProjectionMatrix();
        this.directional.shadow.bias=0;this.directional.shadow.normalBias=day.shadowNormalBias;this.directional.shadow.radius=day.shadowRadius;
        const size=this.quality==='low'?Math.min(1024,preset.shadowMapSize):preset.shadowMapSize;
        if(this.directional.shadow.mapSize.x!==size){this.directional.shadow.map?.dispose();this.directional.shadow.map=null;this.directional.shadow.mapSize.set(size,size);}
        this.placeWorldLight();
        this.renderer.shadowMap.needsUpdate=true;this.renderer.toneMappingExposure=preset.exposure;
        this.campfire.visible=night;this.halo.visible=night;
        for(const material of this.assets.windowMaterials)material.emissiveIntensity=night?config.windows.emissiveIntensity:0;
        for(const material of this.assets.fireMaterials)material.emissiveIntensity=night?config.fire.emissiveIntensity:0;
        this.update(0);
    }
    private placeWorldLight() {
        if (!this.worldAnchor) return;
        const direction=this.directional.position.clone().sub(this.directional.target.position).normalize();
        this.directional.target.position.copy(this.worldAnchor);
        this.directional.target.updateMatrixWorld(true);
        this.directional.position.copy(this.worldAnchor).addScaledVector(direction,200);
        Object.assign(this.directional.shadow.camera,{left:-130,right:130,top:130,bottom:-130,near:.1,far:400});
        this.directional.shadow.camera.updateProjectionMatrix();
    }
    dispose() {
        this.directional.shadow.dispose();
        this.halo.geometry.dispose();
        this.halo.material.dispose();
        for (const object of [this.halo,this.ambient,this.directional,this.directional.target,this.campfire])
            object.removeFromParent();
    }
    setQuality(quality: 'standard' | 'low') {
        this.quality = quality;
        const size = quality === 'low' ? 1024 :
            (this.mode === 'night' ? config.night.shadowMapSize : config.day.shadowMapSize);
        if (this.directional.shadow.mapSize.x === size) return;
        this.directional.shadow.map?.dispose();
        this.directional.shadow.map = null;
        this.directional.shadow.mapSize.set(size, size);
        this.renderer.shadowMap.needsUpdate = true;
    }
    get skyColor() { return this.scene.background as Color; }
    /** Called on world creation/discovery, never as part of the animation-frame scene walk. */
    includeWorldShadowBounds(root: Object3D) {
        if (!this.seasonTreatment.shadows) return;
        const bounds = new Box3(), casters = new Box3(), meshBounds = new Box3();
        root.updateMatrixWorld(true);
        root.traverse(node => {
            if (node instanceof Mesh && (node.castShadow || node.receiveShadow)) {
                meshBounds.setFromObject(node);
                bounds.union(meshBounds);
                if (node.castShadow) casters.union(meshBounds);
            }
        });
        if (bounds.isEmpty()) return;
        bounds.expandByScalar(2); // Include existing wind motion outside the static source bounds.
        if (this.shadowCoverage) {
            this.shadowCoverage.include(bounds, false);
            this.shadowCoverage.include(casters);
        } else this.shadowCoverage = new DirectionalShadowCoverage(bounds, this.seasonTreatment.shadows, casters);
    }
    includeEntityShadowBounds(bounds: { min: { x: number; y: number; z: number };
        max: { x: number; y: number; z: number } } | null | undefined) {
        if (bounds) this.shadowCoverage?.include(bounds);
    }
    updateShadowView(camera: PerspectiveCamera) {
        if (this.visualization === 'seasons')
            this.shadowCoverage?.update(this.directional, camera, this.fogEnabled ? this.fog.far : camera.far);
    }
    inspectShadowCoverage() { return this.shadowCoverage?.inspect() ?? null; }
    setFog(enabled:boolean){this.fogEnabled=enabled;this.scene.fog=enabled?this.fog:null;}
    setVisualization(mode:TimeVisualization){
        this.setMode('day');this.visualization=mode;
        // Keep the same light set and shadow allocation throughout an animated cycle.
        if(mode==='day-night'){this.campfire.visible=true;this.halo.visible=true;}
    }
    /** Compose the existing season palette with annual weather, without resetting day/shadow settings. */
    setSeason(progress:number,weather:DayLightingSettings=config.day) {
        this.visualization='seasons';
        this.seasonWeather=weather;
        this.mode='day';
        this.nightWeight=0;
        this.campfire.visible=false;
        this.halo.visible=false;
        this.update(0,progress);
    }
    private weatherColorDelta(target:Color,value:number,baseline:number,weight:number) {
        this.weatherColor.setHex(value);
        this.dayColor.setHex(baseline);
        // Color.sub clamps negative channels; signed deltas must also preserve darker weather.
        target.r=MathUtils.clamp(target.r+(this.weatherColor.r-this.dayColor.r)*weight,0,1);
        target.g=MathUtils.clamp(target.g+(this.weatherColor.g-this.dayColor.g)*weight,0,1);
        target.b=MathUtils.clamp(target.b+(this.weatherColor.b-this.dayColor.b)*weight,0,1);
    }
    private cycle(progress:number){
        const blend=(target:Color,a:number,b:number,t:number)=>target.setHex(a).lerp(this.blendColor.setHex(b),t);
        if(this.visualization==='day-night'){
            const day=daylight(progress),night=1-MathUtils.smoothstep(day,.12,.65);this.nightWeight=night;
            this.mode=night>.5?'night':'day';
            blend(this.scene.background as Color,config.day.sky,config.night.sky,night);
            blend(this.fog.color,config.day.sky,config.night.fogColor,night);
            this.fog.near=MathUtils.lerp(config.day.fogNear,config.night.fogNear,night);this.fog.far=MathUtils.lerp(config.day.fogFar,config.night.fogFar,night);
            blend(this.ambient.color,config.day.ambientSky,config.night.ambientSky,night);
            blend(this.ambient.groundColor,config.day.ambientGround,config.night.ambientGround,night);
            this.ambient.intensity=MathUtils.lerp(config.day.ambient,config.night.ambient,night);
            blend(this.directional.color,config.day.sun,config.night.moon,night);
            this.directional.intensity=MathUtils.lerp(config.day.sunIntensity,config.night.moonIntensity,night);
            const angle=progress*Math.PI*2+Math.PI;this.directional.target.position.set(0,0,0);this.directional.position.set(-28*Math.cos(angle)+35*Math.sin(angle),8+40*Math.abs(Math.cos(angle)),18*Math.cos(angle));
            this.renderer.toneMappingExposure=MathUtils.lerp(config.day.exposure,config.night.exposure,night);
        }else if(this.visualization==='seasons'){
            const {from,to,mix}=seasonBlend(progress);this.nightWeight=0;this.mode='day';
            blend(this.scene.background as Color,from.sky,to.sky,mix);blend(this.fog.color,from.fog,to.fog,mix);
            blend(this.directional.color,from.sun,to.sun,mix);
            const winter=from.name==='Winter'?1-mix:to.name==='Winter'?mix:0;
            const weather=this.seasonWeather??config.day;
            this.weatherColorDelta(this.scene.background as Color,weather.sky,config.day.sky,winter);
            this.weatherColorDelta(this.fog.color,weather.sky,config.day.sky,winter);
            this.weatherColorDelta(this.directional.color,weather.sun,config.day.sun,winter);
            this.ambient.color.setHex(config.day.ambientSky);
            this.ambient.groundColor.setHex(config.day.ambientGround);
            this.weatherColorDelta(this.ambient.color,weather.ambientSky,config.day.ambientSky,winter);
            this.weatherColorDelta(this.ambient.groundColor,weather.ambientGround,config.day.ambientGround,winter);
            this.ambient.intensity=MathUtils.lerp(from.ambient,to.ambient,mix)*
                MathUtils.lerp(1,weather.ambient/config.day.ambient,winter);
            this.directional.intensity=MathUtils.lerp(from.intensity,to.intensity,mix)*
                MathUtils.lerp(1,weather.sunIntensity/config.day.sunIntensity,winter);
            // Rebalance form after composing seasonal weather, preserving every weather ratio.
            this.ambient.intensity *= this.seasonTreatment.ambientScale;
            this.directional.intensity *= this.seasonTreatment.directScale;
            const treatment = this.seasonTreatment;
            if (treatment.skyFill)
                this.ambient.color.lerp(this.blendColor.setHex(treatment.skyFill.color), treatment.skyFill.mix);
            if (treatment.groundFill)
                this.ambient.groundColor.lerp(this.blendColor.setHex(treatment.groundFill.color), treatment.groundFill.mix);
            if (treatment.sunTint)
                this.directional.color.lerp(this.blendColor.setHex(treatment.sunTint.color), treatment.sunTint.mix);
            if (treatment.sunDirection) {
                this.lightDirection.fromArray(treatment.sunDirection).normalize();
                this.directional.position.copy(this.directional.target.position).addScaledVector(this.lightDirection, 200);
            }
            if (treatment.shadows) {
                this.directional.shadow.radius = treatment.shadows.radius;
                this.directional.shadow.bias = treatment.shadows.bias;
                this.directional.shadow.normalBias = treatment.shadows.normalBias;
            }
            this.fog.near=MathUtils.lerp(config.day.fogNear,weather.fogNear,winter);
            this.fog.far=MathUtils.lerp(config.day.fogFar,weather.fogFar,winter);
            this.renderer.toneMappingExposure=MathUtils.lerp(config.day.exposure,weather.exposure,winter);
        }
    }
    private fireOverride: { lit: boolean; time: number; reducedMotion: boolean } | null = null;
    setCampfire(lit: boolean, time: number, reducedMotion = false) {
        this.fireOverride = { lit, time, reducedMotion };
    }
    update(time:number,progress?:number){
        if(this.visualization!=='off')this.cycle(progress??0);
        if(this.visualization==='day-night')this.placeWorldLight();
        const flicker=fireFlicker(time),night=this.nightWeight;
        const fire = this.fireOverride;
        const fireWeight = fire ? (fire.lit ? 1 : 0) : night;
        const fireFlickerValue = fire ? (fire.reducedMotion ? 1 : fireFlicker(fire.time)) : flicker;
        if (fire) { this.campfire.visible = fire.lit; this.halo.visible = fire.lit; }
        this.campfire.intensity=config.fire.intensity*fireFlickerValue*fireWeight;
        this.halo.material.uniforms.opacity.value=config.fire.haloOpacity*fireFlickerValue*fireWeight;
        for(const material of this.assets.windowMaterials)material.emissiveIntensity=config.windows.emissiveIntensity*night;
        for(const material of this.assets.fireMaterials)material.emissiveIntensity=config.fire.emissiveIntensity*flicker*night;
    }
}
