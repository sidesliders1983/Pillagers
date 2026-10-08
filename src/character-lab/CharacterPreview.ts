import { Scene, Color, PerspectiveCamera, OrthographicCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Mesh, CylinderGeometry, MeshStandardMaterial, ACESFilmicToneMapping, PCFSoftShadowMap, Clock } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Phenotype } from '../characters/Phenotype';
import {meshyHumanFactory,MeshyHuman} from '../characters/MeshyHuman';
import {resolveLabBodyProfile} from '../characters/LabBodyPresentation';
import { characterFactory } from '../characters/CharacterFactory';
import { CharacterDNA } from '../characters/CharacterDNA';
import { UniversalHuman, HumanAnimation } from './UniversalHuman';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FitDebugOptions, noFitDebug } from '../characters/CharacterFitSystem';
import { deduplicateSharedSkins } from '../characters/CharacterExport';
import { createStaticPoseExport } from './StaticPoseExport';
import { CharacterPresentation, defaultCharacterPresentation, parseCharacterPresentation } from '../characters/CharacterPresentation';
import { fixedLabViews, LabTestSnapshot, labSnapshotVersion, labStyleVersion, parseLabSnapshot, snapshotModules } from './LabSnapshot';
import { characterContract } from '../characters/CharacterContract';
import { goldenLabBody, labBodyAsset } from '../characters/LabBodySources';
import { LabBodyPresentation, defaultLabBodyPresentation, parseLabBodyPresentation } from '../characters/LabBodyPresentation';
export class CharacterPreview {
    private scene=new Scene();
    private perspectiveCamera=new PerspectiveCamera(38,1,.05,60);
    private orthographicCamera=new OrthographicCamera(-1.2,1.2,1.2,-1.2,.05,60);
    private orthographicScale=2.4;
    private camera:PerspectiveCamera|OrthographicCamera=this.perspectiveCamera;
    private renderer:WebGLRenderer;
    private controls:OrbitControls;
    private current:UniversalHuman|MeshyHuman|null=null;
    private comparison:UniversalHuman|MeshyHuman|null=null;
    private currentDNA:CharacterDNA|null=null;
    private presentation:CharacterPresentation={...defaultCharacterPresentation};
    private comparisonSnapshot:LabTestSnapshot|null=null;
    private bodyPresentation:LabBodyPresentation={...defaultLabBodyPresentation};
    private revision=0;
    private lod=2;
    private animation:string='Idle';
    private poseTime=0;
    private paused=false;
    private clock=new Clock();
    private observer:ResizeObserver;
    private fitDebug={...noFitDebug};
    constructor(private canvas:HTMLCanvasElement,private report:(message:string,error?:boolean)=>void=()=>{}){
        this.scene.background=new Color('#dbe1d7');
        this.renderer=new WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
        this.renderer.toneMapping=ACESFilmicToneMapping;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=PCFSoftShadowMap;
        this.scene.add(new HemisphereLight(0xfff3e3,0x9caa9a,2.2));
        const sun=new DirectionalLight(0xffead5,1.7);sun.position.set(-3,6,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:15});sun.shadow.normalBias=.025;this.scene.add(sun);
        const stage=new Mesh(new CylinderGeometry(3.1,3.15,.06,64),new MeshStandardMaterial({color:0xd3d7cc,roughness:1}));stage.position.y=-.045;stage.receiveShadow=true;this.scene.add(stage);
        this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.minDistance=2;this.controls.maxDistance=14;this.controls.minZoom=.24;this.controls.maxZoom=4;this.controls.maxPolarAngle=Math.PI*.5;
        this.resetView();
        this.observer=new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect();this.renderer.setSize(rect.width,rect.height,false);this.resizeCameras(rect.width/Math.max(1,rect.height));});this.observer.observe(canvas);
        this.renderer.setAnimationLoop(()=>{const delta=Math.min(this.clock.getDelta(),.05);if(!this.paused)this.current?.update(delta);if(this.comparisonSnapshot&&!this.comparisonSnapshot.pose.paused)this.comparison?.update(delta);this.controls.update();this.renderer.render(this.scene,this.camera);});
    }
    setCharacter(_phenotype:Phenotype,dna:CharacterDNA,presentation:CharacterPresentation=this.presentation,body:LabBodyPresentation=this.bodyPresentation){this.currentDNA=dna;this.presentation=parseCharacterPresentation(presentation);this.bodyPresentation=parseLabBodyPresentation(body);if(this.bodyPresentation.source===goldenLabBody.source)this.lod=2;void this.refresh();}
    setComparison(snapshot:LabTestSnapshot|null){this.comparisonSnapshot=snapshot?parseLabSnapshot(snapshot):null;void this.refresh();}
    setLOD(lod:number){if(!Number.isInteger(lod)||lod<0||lod>2)throw new Error('Invalid body LOD.');labBodyAsset(this.bodyPresentation.source??'published',lod);this.lod=lod;void this.refresh();}
    toggleFitDebug(key:keyof FitDebugOptions){this.fitDebug[key]=!this.fitDebug[key];for(const model of [this.current,this.comparison])model?.fit?.setDebug(this.fitDebug);this.reportModel();}
    setAnimation(animation:string){this.animation=animation;this.paused=false;this.poseTime=0;if(this.current)this.playModel(this.current,animation);this.reportModel();}
    setPose(time:number){if(!Number.isFinite(time)||time<0||time>60)throw new Error('Clip time must be between 0 and 60 seconds.');this.poseTime=time;this.paused=true;if(this.current)this.sampleModel(this.current,this.animation,time);this.reportModel();}
    resume(){this.paused=false;this.reportModel();}
    /** Restore camera/clock before the controller issues its single character refresh. */
    restoreReviewState(snapshot:LabTestSnapshot){const s=parseLabSnapshot(snapshot);this.lod=s.lod;this.animation=s.pose.animation;this.poseTime=s.pose.time;this.paused=s.pose.paused;this.setCamera(s.camera.position,s.camera.target,s.camera.type,s.camera.scale??2.4);}
    captureSnapshot():LabTestSnapshot {
        if(!this.current||!this.currentDNA||this.canvas.dataset.ready!=='true')throw new Error('Wait until the character has loaded.');
        this.setPose(this.current.animationState.time);
        return parseLabSnapshot({version:labSnapshotVersion,styleVersion:labBodyAsset(this.bodyPresentation.source??'published',this.lod).styleVersion,contractVersion:1,fitVersion:characterContract.attachmentVersion,
            dna:this.currentDNA,presentation:this.presentation,body:this.bodyPresentation,lod:this.lod,pose:{animation:this.animation,time:this.current.animationState.time,paused:true},
            camera:{type:this.camera===this.orthographicCamera?'orthographic':'perspective',scale:this.camera===this.orthographicCamera?this.orthographicScale/this.orthographicCamera.zoom:null,fov:38,position:this.camera.position.toArray(),target:this.controls.target.toArray()},lighting:'lab-neutral/1',modules:snapshotModules(this.currentDNA,this.presentation,this.lod,this.bodyPresentation)});
    }
    private async createPreview(dna:CharacterDNA,lod:number,presentation:CharacterPresentation,body:LabBodyPresentation){
        if(body.source!=='meshy')return characterFactory.create(dna,lod,presentation,body);
        const resolved=resolveLabBodyProfile(dna,body),model=await meshyHumanFactory.create(dna,lod,resolved.profile);
        model.root.userData.bodySource=labBodyAsset('meshy',lod);model.root.userData.presentation={...presentation};
        model.root.userData.bodyPresentation=resolved.body;model.root.userData.bodyPresentationStatus=resolved.status;
        model.root.userData.selectedAssets={hair:null,beard:null,outfit:null,equipment:null};return model;
    }
    private async refresh(){
        const revision=++this.revision;this.canvas.dataset.ready='false';
        try{
            const pinned=this.comparisonSnapshot;
            const models=await Promise.all([this.currentDNA?this.createPreview(this.currentDNA,this.lod,this.presentation,this.bodyPresentation):null,pinned?this.createPreview(pinned.dna,pinned.lod,pinned.presentation,pinned.body):null]);
            if(revision!==this.revision){for(const model of models)model?.dispose();return;}
            for(const model of [this.current,this.comparison])if(model){this.scene.remove(model.root);model.dispose();}
            [this.current,this.comparison]=models;
            if(this.current){if(!(this.current instanceof MeshyHuman)&&!['Idle','Walk','Run'].includes(this.animation)){this.animation='Idle';this.poseTime=0;}this.sampleModel(this.current,this.animation,this.poseTime);}
            if(this.comparison&&pinned)this.sampleModel(this.comparison,pinned.pose.animation,pinned.pose.time);
            for(const model of [this.current,this.comparison])if(model){this.scene.add(model.root);model.fit?.setDebug(this.fitDebug);}
            this.layout();this.canvas.dataset.ready='true';this.reportModel();
        }catch(error){if(revision!==this.revision)return;this.report(`Universal Human could not load: ${error instanceof Error?error.message:String(error)}`,true);}
    }
    private playModel(model:UniversalHuman|MeshyHuman,animation:string){
        if(model instanceof MeshyHuman)model.sampleAnimation(animation,0);else model.setAnimation(animation as HumanAnimation);
    }
    private sampleModel(model:UniversalHuman|MeshyHuman,animation:string,time:number){
        if(model instanceof MeshyHuman)model.sampleAnimation(animation,time);else model.sampleAnimation(animation as HumanAnimation,time);
    }
    private reportModel(){
        const select=document.getElementById('lab-animation') as HTMLSelectElement|null;
        if(select&&this.current){
            const aliases:Record<string,string>={Idle:'Idle_02',Walk:'Walking',Run:'Running'};
            const selected=this.current instanceof MeshyHuman?(aliases[this.animation]??this.animation):this.animation;
            select.replaceChildren(...this.current.clips.map((clip,index)=>{const option=document.createElement('option');option.value=clip.name;option.textContent=/^[0-9a-f]{8}-/.test(clip.name)?'Unnamed clip '+(clip.name.endsWith('.001')?'2':'1'):clip.name.replaceAll('_',' ');option.title=clip.name;return option;}));
            select.value=selected;
            document.querySelectorAll<HTMLButtonElement>('[aria-label="Animation"] button').forEach(button=>button.setAttribute('aria-pressed',String((aliases[button.dataset.action==='idle'?'Idle':button.dataset.action==='walk'?'Walk':'Run']??'')===selected||button.dataset.action===selected.toLowerCase())));
        }

        const metadata=document.getElementById('lab-fit-metadata');if(metadata)metadata.textContent=JSON.stringify({...this.current?.fit?.snapshot(),bodySource:this.current?.root.userData.bodySource,presentation:this.current?.root.userData.presentation,selectedAssets:this.current?.root.userData.selectedAssets,bodyPresentation:this.current?.root.userData.bodyPresentation,bodyPresentationStatus:this.current?.root.userData.bodyPresentationStatus,displayedBodyHeight:this.current?.root.userData.universalHumanProfile.height,comparison:this.comparison?{bodySource:this.comparison.root.userData.bodySource,presentation:this.comparison.root.userData.presentation,selectedAssets:this.comparison.root.userData.selectedAssets,bodyPresentation:this.comparison.root.userData.bodyPresentation,bodyPresentationStatus:this.comparison.root.userData.bodyPresentationStatus,pose:this.comparison.animationState}:null},null,2);
        const pose=document.getElementById('lab-pose-time') as HTMLInputElement|null;if(pose&&document.activeElement!==pose)pose.value=String(Number((this.current?.animationState.time??this.poseTime).toFixed(3)));
        this.canvas.dataset.paused=String(this.paused);this.canvas.dataset.animation=this.animation;this.canvas.dataset.lod=String(this.lod);this.canvas.dataset.bodySource=this.bodyPresentation.source??'published';
        document.querySelectorAll<HTMLButtonElement>('[aria-label="Level of detail"] button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.action==='lod'+this.lod)));
        this.report(`${this.bodyPresentation.source==='meshy'?'Meshy Human':this.bodyPresentation.source===goldenLabBody.source?'v0.4 body preview':'Published body'} · LOD${this.lod} · ${this.animation}${this.paused?' · frozen pose':''}`);
    }
    private layout(){if(this.current)this.current.root.position.x=this.comparison?-1:0;if(this.comparison)this.comparison.root.position.x=1;}
    private resizeCameras(aspect:number){
        this.perspectiveCamera.aspect=aspect;this.perspectiveCamera.updateProjectionMatrix();
        const half=this.orthographicScale/2;Object.assign(this.orthographicCamera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.orthographicCamera.updateProjectionMatrix();
    }
    private setCamera(position:readonly number[],target:readonly number[],type:'perspective'|'orthographic'='perspective',scale=2.4){
        // Clear damping velocity before setting an exact reproducible view.
        this.controls.enableDamping=false;this.controls.update();
        this.camera=type==='orthographic'?this.orthographicCamera:this.perspectiveCamera;this.controls.object=this.camera;
        this.orthographicScale=scale;this.orthographicCamera.zoom=1;this.resizeCameras(this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight));
        this.controls.target.fromArray(target);this.camera.position.fromArray(position);this.controls.update();this.controls.enableDamping=true;
        this.canvas.dataset.camera=type;this.canvas.dataset.cameraScale=type==='orthographic'?String(scale):'';
    }
    fixedView(view:keyof typeof fixedLabViews){const camera=fixedLabViews[view];this.setCamera(camera.position,camera.target,view==='rts'?'perspective':'orthographic',2.4);}
    resetView(){this.setCamera(this.comparisonSnapshot?[0,1.75,4.7]:[1.8,1.75,3.2],[0,.95,0]);}
    overview(){this.fixedView('rts');}
    async exportStaticGLB(){
        if(!this.current||!this.currentDNA||this.canvas.dataset.ready!=='true')throw new Error('Wait until the character has loaded.');
        const model=this.current,snapshot=this.captureSnapshot();
        const frozen=createStaticPoseExport(model.root,{snapshot,source:model.root.userData.bodySource},{excludedRoots:model.fit?[model.fit.debug]:[]});
        try {
            const data=await new GLTFExporter().parseAsync(frozen.root,{binary:true,onlyVisible:true});
            if(!(data instanceof ArrayBuffer))throw new Error('Static GLB export returned invalid binary data.');
            const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'})),link=document.createElement('a');
            link.href=url;link.download='pillagers-'+snapshot.dna.seed+'-age-'+snapshot.dna.age+'-LOD'+snapshot.lod+(snapshot.body.source===goldenLabBody.source?'-v04-preview':'')+'-static-pose.glb';
            link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }finally{frozen.dispose();}
    }
    async exportGLB(){
        if(!this.current||!this.currentDNA||this.canvas.dataset.ready!=='true')throw new Error('Wait until the character has loaded.');
        const model=this.current,dna=this.currentDNA,lod=this.lod;
        model.fit?.setDebug(noFitDebug);
        const position=model.root.position.clone();model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
        try{
            const data=await new GLTFExporter().parseAsync(model.root,{binary:true,animations:model.clips});
            const url=URL.createObjectURL(new Blob([deduplicateSharedSkins(data as ArrayBuffer)],{type:'model/gltf-binary'}));
            const link=document.createElement('a');link.href=url;link.download=`pillagers-${dna.seed}-age-${dna.age}-LOD${lod}${this.bodyPresentation.source===goldenLabBody.source?'-v04-preview':''}.glb`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }finally{model.root.position.copy(position);model.fit?.setDebug(this.fitDebug);}
    }
}
