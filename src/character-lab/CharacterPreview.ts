import { Scene, Color, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Mesh, CylinderGeometry, MeshStandardMaterial, ACESFilmicToneMapping, PCFSoftShadowMap, Clock } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Phenotype } from '../characters/Phenotype';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterDNA } from '../characters/CharacterDNA';
import { universalHumanProfile } from '../characters/UniversalHumanProfile';
import { UniversalHuman, HumanAnimation } from './UniversalHuman';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
export class CharacterPreview {
    private scene=new Scene();
    private camera=new PerspectiveCamera(38,1,.05,60);
    private renderer:WebGLRenderer;
    private controls:OrbitControls;
    private current:UniversalHuman|null=null;
    private comparison:UniversalHuman|null=null;
    private assets=new Map<number,Promise<GLTF>>();
    private currentDNA:CharacterDNA|null=null;
    private comparisonDNA:CharacterDNA|null=null;
    private currentPhenotype:Phenotype|null=null;
    private comparisonPhenotype:Phenotype|null=null;
    private revision=0;
    private lod=0;
    private animation:HumanAnimation='Idle';
    private clock=new Clock();
    private observer:ResizeObserver;
    constructor(canvas:HTMLCanvasElement,private report:(message:string,error?:boolean)=>void=()=>{}){
        this.scene.background=new Color('#dbe1d7');
        this.renderer=new WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
        this.renderer.toneMapping=ACESFilmicToneMapping;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=PCFSoftShadowMap;
        this.scene.add(new HemisphereLight(0xfff3e3,0x9caa9a,2.2));
        const sun=new DirectionalLight(0xffead5,1.7);sun.position.set(-3,6,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:15});sun.shadow.normalBias=.025;this.scene.add(sun);
        const stage=new Mesh(new CylinderGeometry(3.1,3.15,.06,64),new MeshStandardMaterial({color:0xd3d7cc,roughness:1}));stage.position.y=-.045;stage.receiveShadow=true;this.scene.add(stage);
        this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.minDistance=2;this.controls.maxDistance=14;this.controls.maxPolarAngle=Math.PI*.49;
        this.resetView();
        this.observer=new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect();this.renderer.setSize(rect.width,rect.height,false);this.camera.aspect=rect.width/Math.max(1,rect.height);this.camera.updateProjectionMatrix();});this.observer.observe(canvas);
        this.renderer.setAnimationLoop(()=>{const delta=Math.min(this.clock.getDelta(),.05);this.current?.update(delta);this.comparison?.update(delta);this.controls.update();this.renderer.render(this.scene,this.camera);});
    }
    setCharacter(phenotype:Phenotype,dna:CharacterDNA){this.currentDNA=dna;this.currentPhenotype=phenotype;void this.refresh();}
    setComparison(phenotype:Phenotype|null,dna:CharacterDNA|null=null){this.comparisonDNA=dna;this.comparisonPhenotype=phenotype;void this.refresh();this.resetView();}
    setLOD(lod:number){this.lod=lod;void this.refresh();}
    setAnimation(animation:HumanAnimation){this.animation=animation;this.current?.setAnimation(animation);this.comparison?.setAnimation(animation);this.report(`Universal Human · LOD${this.lod} · ${this.animation} · one shared rig`);}
    private async refresh(){
        const revision=++this.revision;
        try{
            let promise=this.assets.get(this.lod);
            if(!promise){promise=new GLTFLoader().loadAsync(`/universal-human/UniversalHuman_LOD${this.lod}.glb`);this.assets.set(this.lod,promise);this.report('Loading Universal Human…');}
            const asset=await promise;if(revision!==this.revision)return;
            for(const model of [this.current,this.comparison])if(model){this.scene.remove(model.root);model.dispose();}
            this.current=this.currentDNA&&this.currentPhenotype?new UniversalHuman(asset,universalHumanProfile(this.currentDNA),this.currentPhenotype.skinTone):null;
            this.comparison=this.comparisonDNA&&this.comparisonPhenotype?new UniversalHuman(asset,universalHumanProfile(this.comparisonDNA),this.comparisonPhenotype.skinTone):null;
            for(const model of [this.current,this.comparison])if(model){model.setAnimation(this.animation);this.scene.add(model.root);}
            this.layout();this.report(`Universal Human · LOD${this.lod} · ${this.animation} · one shared rig`);
        }catch(error){if(revision!==this.revision)return;this.assets.delete(this.lod);this.report(`Universal Human could not load: ${error instanceof Error?error.message:String(error)}`,true);}
    }
    private layout(){if(this.current)this.current.root.position.x=this.comparison?-1:0;if(this.comparison)this.comparison.root.position.x=1;}
    resetView(){const comparing=this.comparisonDNA!==null;this.controls.target.set(0,.95,0);this.camera.position.set(comparing?0:1.8,1.75,comparing?4.7:3.2);this.controls.update();}
    overview(){this.controls.target.set(0,.8,0);this.camera.position.set(5.5,6.5,9);this.controls.update();}
    async exportGLB(){
        if(!this.current||!this.currentDNA)throw new Error('Wait until the character has loaded.');
        const model=this.current,dna=this.currentDNA,lod=this.lod;
        const position=model.root.position.clone();model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
        try{
            const data=await new GLTFExporter().parseAsync(model.root,{binary:true,animations:model.clips});
            const url=URL.createObjectURL(new Blob([data as ArrayBuffer],{type:'model/gltf-binary'}));
            const link=document.createElement('a');link.href=url;link.download=`pillagers-${dna.seed}-age-${dna.age}-LOD${lod}.glb`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }finally{model.root.position.copy(position);}
    }
}
