import { Scene, Color, Fog, HemisphereLight, DirectionalLight, PointLight, WebGLRenderer, Mesh, ShaderMaterial, CircleGeometry, MathUtils, Vector3, Box3, Object3D, PerspectiveCamera } from 'three';
import { lightingConfig as config, LightingMode, fireFlicker, type SeasonalLightingTreatment } from '../config/lightingConfig';
import { DirectionalShadowCoverage } from './DirectionalShadowCoverage';
import { AssetManager } from './AssetManager';
import { hearth } from '../world/SettlementLayout';
import { surfaceHeightAt } from '../world/Terrain';
import { TimeVisualization, daylight, seasonBlend } from '../config/timeVisualization';
import type { FogPresentation } from '../config/FjordFog';
import { presentationShadowSize } from '../config/PresentationQuality';
import { northernLightState, type SeasonalLightState } from '../config/NorthernSeasonalLight';
import { SeasonalLightTransition } from './SeasonalLightTransition';
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
    private fogPresentation?: FogPresentation;
    private fogViewOffset = 0;
    private baseFog = { near: config.day.fogNear, far: config.day.fogFar, color: new Color(config.day.sky) };
    private readonly lightDirection = new Vector3();
    private shadowCoverage?: DirectionalShadowCoverage;
    private annualProgress?: number;
    private annualState?: SeasonalLightState;
    private readonly annualTransition = new SeasonalLightTransition();
    /** World-space sun authority; shadow-fit positions are never the source of this state. */
    get seasonalLightState() {
        return this.annualProgress === undefined ? undefined : this.annualTransition.snapshot();
    }
    /** Copy the same presentation authority without allocating a frozen snapshot every water frame. */
    copySeasonalSolarLight(direction: Vector3, color: Color) {
        const strength = this.copySeasonalSun(direction, color);
        if (strength === undefined) return false;
        color.multiplyScalar(Math.min(1, strength));
        return true;
    }
    /** Unattenuated linear solar color and actual intensity for independent direct/ambient consumers. */
    copySeasonalSun(direction: Vector3, color: Color) {
        if (this.annualProgress === undefined) return undefined;
        const frame = this.annualTransition.current;
        direction.copy(frame.direction);
        color.copy(frame.solarColor);
        return frame.solarStrength;
    }
    finishSeasonTransition() { this.annualTransition.finish(); }
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
        this.annualProgress=undefined;
        this.annualState=undefined;
        this.shadowCoverage?.invalidate();
        this.visualization='off';
        this.seasonWeather=null;
        this.nightWeight=mode==='night'?1:0;
        this.mode=mode;const night=mode==='night',preset=night?config.night:day;
        (this.scene.background as Color).setHex(preset.sky);this.fog.color.setHex(night?config.night.fogColor:day.sky);
        this.fog.near=preset.fogNear;this.fog.far=preset.fogFar;this.scene.fog=this.fogEnabled?this.fog:null;
        this.rememberFog();
        this.ambient.color.setHex(preset.ambientSky);this.ambient.groundColor.setHex(preset.ambientGround);this.ambient.intensity=preset.ambient;
        this.directional.color.setHex(night?config.night.moon:day.sun);
        this.directional.intensity=night?config.night.moonIntensity:day.sunIntensity;
        this.directional.position.fromArray(night?config.night.moonPosition:day.sunPosition);
        this.directional.name=night?'Moonlight':'Sunlight';
        this.directional.target.position.set(0,0,0);this.directional.target.updateMatrixWorld(true);
        Object.assign(this.directional.shadow.camera,{left:-50,right:50,top:50,bottom:-50,near:1,far:110});
        this.directional.shadow.camera.updateProjectionMatrix();
        this.directional.shadow.bias=0;this.directional.shadow.normalBias=day.shadowNormalBias;this.directional.shadow.radius=day.shadowRadius;
        const size=presentationShadowSize(this.quality,preset.shadowMapSize);
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
        const size = presentationShadowSize(quality,
            this.annualProgress === undefined && this.mode === 'night'
                ? config.night.shadowMapSize : config.day.shadowMapSize);
        if (this.directional.shadow.mapSize.x === size) return;
        this.directional.shadow.map?.dispose();
        this.directional.shadow.map = null;
        this.directional.shadow.mapSize.set(size, size);
        this.renderer.shadowMap.needsUpdate = true;
    }
    get skyColor() { return this.scene.background as Color; }
    setFogPresentation(presentation?: FogPresentation) { this.fogPresentation = presentation; }
    /** Compose from an unmodified base each frame, including when the lighting cycle is off. */
    setFogViewDistance(distance: number) {
        this.fogViewOffset = Number.isFinite(distance) ? Math.max(0, distance - 60) : 0;
    }
    private rememberFog() {
        this.baseFog.near = this.fog.near;
        this.baseFog.far = this.fog.far;
        this.baseFog.color.copy(this.fog.color);
    }
    private composeFog() {
        const presentation = this.fogPresentation;
        this.fog.near = (presentation?.near ?? this.baseFog.near) + this.fogViewOffset;
        this.fog.far = (presentation?.far ?? this.baseFog.far) + this.fogViewOffset;
        this.fog.color.copy(this.baseFog.color);
        if (presentation) this.fog.color.lerp(this.skyColor, presentation.skyMix);
    }
    /** Called on world creation/discovery, never as part of the animation-frame scene walk. */
    includeWorldShadowBounds(root: Object3D) {
        if (!this.seasonTreatment.shadows) return;
        const bounds = new Box3(), casters = new Box3(), meshBounds = new Box3();
        root.updateMatrixWorld(true);
        root.traverse(node => {
            if (node instanceof Mesh && (node.castShadow || node.receiveShadow)) {
                const localReceiverBounds = node.userData.shadowReceiverBounds;
                if (localReceiverBounds instanceof Box3)
                    meshBounds.copy(localReceiverBounds).applyMatrix4(node.matrixWorld);
                else meshBounds.setFromObject(node);
                bounds.union(meshBounds);
                if (node.castShadow) {
                    const localCasterBounds = node.userData.shadowCasterBounds;
                    if (localCasterBounds instanceof Box3)
                        meshBounds.copy(localCasterBounds).applyMatrix4(node.matrixWorld);
                    casters.union(meshBounds);
                }
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
    setSeason(progress:number,weather:DayLightingSettings=config.day,yearProgress?:number,
        transitionSeconds = 0) {
        this.annualProgress=yearProgress;
        this.annualState=undefined;
        this.visualization='seasons';
        this.seasonWeather=weather;
        this.mode='day';
        this.nightWeight=0;
        this.campfire.visible=false;
        this.halo.visible=false;
        if (yearProgress !== undefined) {
            // Compose the approved palette/profile once per canonical anchor, not once per frame.
            this.cycle(progress);
            this.annualTransition.anchor(this.annualState!, this.skyColor, this.fog,
                this.renderer.toneMappingExposure, transitionSeconds);
        }
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
            if (this.annualProgress !== undefined) this.applyAnnualLight();
        }
    }
    private applyAnnualLight() {
        // Rebuild only when canonical progress/weather is anchored by setSeason, not per frame.
        this.annualState ??= northernLightState(this.annualProgress!, {
            solarStrength: this.directional.intensity,
            solarColor: this.directional.color.toArray() as [number, number, number],
            skyColor: this.ambient.color.toArray() as [number, number, number],
            groundColor: this.ambient.groundColor.toArray() as [number, number, number],
            ambientStrength: this.ambient.intensity,
            nightSkyColor: this.blendColor.setHex(config.night.ambientSky).toArray() as [number, number, number],
            nightGroundColor: this.blendColor.setHex(config.night.ambientGround).toArray() as [number, number, number],
        });
        const state = this.annualState;
        this.nightWeight = state.darkness;
        this.mode = state.darkness > .5 ? 'night' : 'day';
        this.directional.name = 'Sunlight';
        this.directional.color.fromArray(state.solarColor);
        this.directional.intensity = state.solarStrength;
        this.lightDirection.fromArray(state.sunDirection);
        this.directional.position.copy(this.directional.target.position).addScaledVector(this.lightDirection, 200);
        this.ambient.color.fromArray(state.ambient.skyColor);
        this.ambient.groundColor.fromArray(state.ambient.groundColor);
        this.ambient.intensity = state.ambient.strength;
        this.skyColor.lerp(this.blendColor.setHex(config.night.sky), state.darkness);
        this.fog.color.lerp(this.blendColor.setHex(config.night.fogColor), state.darkness);
        // Darkness does not counteract itself through exposure or a second directional night source.
    }
    private fireOverride: { lit: boolean; time: number; reducedMotion: boolean } | null = null;
    setCampfire(lit: boolean, time: number, reducedMotion = false) {
        this.fireOverride = { lit, time, reducedMotion };
    }
    update(time:number,progress?:number,delta = 0,running = false){
        if(this.visualization!=='off') {
            if (this.annualProgress !== undefined) {
                this.annualTransition.advance(delta, running);
                const frame = this.annualTransition.current;
                this.lightDirection.copy(frame.direction);
                this.directional.position.copy(this.directional.target.position)
                    .addScaledVector(this.lightDirection, 200);
                this.directional.color.copy(frame.solarColor);
                this.directional.intensity = frame.solarStrength;
                this.ambient.color.copy(frame.skyFill);
                this.ambient.groundColor.copy(frame.groundFill);
                this.ambient.intensity = frame.ambientStrength;
                this.skyColor.copy(frame.sky);
                this.fog.color.copy(frame.fog);
                this.fog.near = frame.fogNear;
                this.fog.far = frame.fogFar;
                this.renderer.toneMappingExposure = frame.exposure;
                this.nightWeight = frame.darkness;
                this.mode = frame.darkness > .5 ? 'night' : 'day';
            } else this.cycle(progress??0);
            this.rememberFog();
        }
        this.composeFog();
        if(this.visualization==='day-night')this.placeWorldLight();
        const flicker=fireFlicker(time),night=this.nightWeight;
        const fire = this.fireOverride;
        const fireWeight = fire ? (fire.lit ? 1 : 0) : night;
        const fireFlickerValue = fire ? (fire.reducedMotion ? 1 : fireFlicker(fire.time)) : flicker;
        if (fire) { this.campfire.visible = fire.lit; this.halo.visible = fire.lit; }
        this.campfire.intensity=config.fire.intensity*fireFlickerValue*fireWeight;
        this.halo.material.uniforms.opacity.value=config.fire.haloOpacity*fireFlickerValue*fireWeight;
        for(const material of this.assets.windowMaterials)material.emissiveIntensity=config.windows.emissiveIntensity*night;
        for(const material of this.assets.fireMaterials)material.emissiveIntensity=config.fire.emissiveIntensity*
            (fire ? fireFlickerValue*fireWeight : flicker)*night;
    }
}
