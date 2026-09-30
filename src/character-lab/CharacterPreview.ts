import { Scene, Color, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Mesh, CylinderGeometry, MeshStandardMaterial, ACESFilmicToneMapping, PCFSoftShadowMap, Clock } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Phenotype } from '../characters/Phenotype';
import { Mannequin } from './Mannequin';
export class CharacterPreview {
    private scene=new Scene();
    private camera=new PerspectiveCamera(38,1,.05,60);
    private renderer:WebGLRenderer;
    private controls:OrbitControls;
    private current:Mannequin|null=null;
    private comparison:Mannequin|null=null;
    private clock=new Clock();
    private time=0;
    private observer:ResizeObserver;
    constructor(canvas:HTMLCanvasElement){
        this.scene.background=new Color('#dbe1d7');
        this.renderer=new WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
        this.renderer.toneMapping=ACESFilmicToneMapping;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=PCFSoftShadowMap;
        this.scene.add(new HemisphereLight(0xfff3e3,0x9caa9a,2.2));
        const sun=new DirectionalLight(0xffead5,1.7);sun.position.set(-3,6,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:15});sun.shadow.normalBias=.025;this.scene.add(sun);
        const stage=new Mesh(new CylinderGeometry(3.1,3.15,.06,64),new MeshStandardMaterial({color:0xd3d7cc,roughness:1}));stage.position.y=-.045;stage.receiveShadow=true;this.scene.add(stage);
        this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.minDistance=2;this.controls.maxDistance=14;this.controls.maxPolarAngle=Math.PI*.49;
        this.resetView();
        this.observer=new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect();this.renderer.setSize(rect.width,rect.height,false);this.camera.aspect=rect.width/Math.max(1,rect.height);this.camera.updateProjectionMatrix();});this.observer.observe(canvas);
        this.renderer.setAnimationLoop(()=>{this.time+=Math.min(this.clock.getDelta(),.05);this.current?.update(this.time);this.comparison?.update(this.time);this.controls.update();this.renderer.render(this.scene,this.camera);});
    }
    setCharacter(phenotype:Phenotype){if(this.current){this.scene.remove(this.current.root);this.current.dispose();}this.current=new Mannequin(phenotype);this.scene.add(this.current.root);this.layout();}
    setComparison(phenotype:Phenotype|null){if(this.comparison){this.scene.remove(this.comparison.root);this.comparison.dispose();}this.comparison=phenotype?new Mannequin(phenotype):null;if(this.comparison)this.scene.add(this.comparison.root);this.layout();this.resetView();}
    private layout(){if(this.current)this.current.root.position.x=this.comparison?-1:0;if(this.comparison)this.comparison.root.position.x=1;}
    resetView(){this.controls.target.set(0,.88,0);this.camera.position.set(this.comparison?2.7:2.25,1.85,this.comparison?4.6:4.1);this.controls.update();}
    overview(){this.controls.target.set(0,.8,0);this.camera.position.set(5.5,6.5,9);this.controls.update();}
}
