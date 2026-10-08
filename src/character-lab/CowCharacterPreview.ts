import {AnimationAction,AnimationMixer,Color,DirectionalLight,GridHelper,Group,HemisphereLight,Mesh,MeshStandardMaterial,MOUSE,PerspectiveCamera,PlaneGeometry,Scene} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createRenderer} from '../core/Renderer';
import {defaultDNA} from '../characters/CharacterDNA';
import {meshyHumanFactory,MeshyHuman} from '../characters/MeshyHuman';

import {CharacterLabUI,LabAction} from './CharacterLabUI';

type Clip='Idle'|'Graze'|'Walk'|'HumanInteraction';
interface Manifest {file:string;bytes:number;triangles:number;joints:number;walkSpeedMps:number;withersHeightM:number;blenderVersion:string;sha256:string}
/** Cattle mode uses the existing Character Lab controls and route. */
export class CowCharacterPreview {
 private renderer!:ReturnType<typeof createRenderer>;
 private ui!:CharacterLabUI;
 private scene=new Scene();
 private camera=new PerspectiveCamera(37,1,0.05,80);
 private controls!:OrbitControls;
 private mixer!:AnimationMixer;
 private action!:AnimationAction;
 private actions=new Map<Clip,AnimationAction>();
 private clip:Clip='Idle';
 private paused=false;
 private speed=1;
 private ground=new Group();
 private walkDistance=0;
 private human?:MeshyHuman;
 private humanLoading?:Promise<void>;
 private last=performance.now();
 private time!:HTMLInputElement;
 private canvas!:HTMLCanvasElement;
 private manifest!:Manifest;
 async start(){
  document.title='Character Lab · Adult female cow';
  document.body.className='character-lab';
  document.body.replaceChildren();
  const root=document.createElement('main');document.body.append(root);
  this.ui=new CharacterLabUI(root,defaultDNA(),()=>{},action=>this.handle(action));
  (document.querySelector('#lab-character-type') as HTMLSelectElement).value='cow';
  const sidebar=document.querySelector<HTMLElement>('.lab-controls')!;
  const status=document.querySelector('#lab-status')!;
  sidebar.innerHTML='<div class="lab-section-heading"><h2>01 <span>Adult female cow</span></h2><span class="lab-badge">PROTOTYPE</span></div><p class="lab-note">Four authored animations on the original textured cow. Select an animation below the preview.</p><div class="lab-slider"><label for="lab-cow-speed">Playback speed <output id="lab-cow-speed-value">1.00×</output></label><input id="lab-cow-speed" type="range" min="0.25" max="2" step="0.05" value="1"></div><label class="lab-checkbox"><input id="lab-cow-ground" type="checkbox" checked>Moving ground while walking</label><p class="lab-note">The ground follows the authored walking pace so hoof contact can be inspected. Cow withers: 1.10 m. Reference human: 1.65 m.</p><label class="lab-checkbox"><input id="lab-cow-human" type="checkbox" checked>Show human during interaction</label><p class="lab-note" id="lab-cow-description"></p>';
  sidebar.append(status);
  this.ui.status('Loading adult female cow…');
  for(const selector of ['.lab-results','.lab-fit-debug','.lab-body-controls','.lab-module-controls','.lab-compare','[aria-label="Appearance size ratios"]','[aria-label="Level of detail"]']){
   const section=document.querySelector<HTMLElement>(selector);if(section)section.hidden=true;
  }
  // Keep the same two visible panels and the lab's existing responsive layout.
  document.querySelector<HTMLElement>('.lab-layout')!.classList.add('lab-cattle-layout');
  document.querySelector<HTMLElement>('.lab-stage-heading .lab-eyebrow')!.textContent='LIVE PREVIEW';
  document.querySelector('#lab-current-label')!.textContent='ADULT FEMALE COW';
  const source=document.querySelector<HTMLSelectElement>('#lab-body-source')!;
  source.replaceChildren(new Option('Meshy Cow · adult female · textured','cow'));source.disabled=true;
  document.querySelector('#lab-source-status')!.textContent='Original geometry and skin weights. Four authored bone animations.';
  this.canvas=document.querySelector<HTMLCanvasElement>('#lab-preview')!;
  this.canvas.setAttribute('aria-label','Animated adult female cow. Right drag to rotate, scroll to zoom.');
  this.time=document.querySelector<HTMLInputElement>('#lab-pose-time')!;
  document.querySelector('.lab-preview-tools>span')!.textContent='Right drag to rotate · Left drag to pan · Scroll to zoom';
  this.renderer=createRenderer(this.canvas);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  this.scene.background=new Color('#dbe1d7');
  this.scene.add(new HemisphereLight('#fff8eb','#747a58',2.2));
  const sun=new DirectionalLight('#fff5df',3.0);
  sun.position.set(3,6,4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-4;sun.shadow.camera.right=4;sun.shadow.camera.top=4;sun.shadow.camera.bottom=-4;sun.shadow.bias=-0.00015;
  this.scene.add(sun);
  const floor=new Mesh(new PlaneGeometry(20,20),new MeshStandardMaterial({color:'#a1a583',roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-0.009;floor.receiveShadow=true;this.scene.add(floor);
  const grid=new GridHelper(20,20,'#828767','#969b79');grid.position.y=-0.006;
  this.ground.add(grid);this.scene.add(this.ground);
  this.controls=new OrbitControls(this.camera,this.canvas);
  this.controls.target.set(0,.80,0);this.controls.mouseButtons={LEFT:MOUSE.PAN,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.ROTATE};
  this.controls.minDistance=2;this.controls.maxDistance=15;this.controls.maxPolarAngle=Math.PI/2-0.02;
  this.canvas.addEventListener('contextmenu',event=>event.preventDefault());
  this.setCamera('side');
  const resize=()=>{const r=this.canvas.getBoundingClientRect();this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/Math.max(1,r.height);this.camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(this.canvas);resize();
  document.querySelector('#lab-cow-speed')!.addEventListener('input',event=>{this.speed=Number((event.target as HTMLInputElement).value);document.querySelector('#lab-cow-speed-value')!.textContent=this.speed.toFixed(2)+'×';});
  document.querySelector('#lab-cow-human')!.addEventListener('change',()=>{if(this.clip==='HumanInteraction')void this.ensureHuman();if(this.human)this.human.root.visible=this.showHuman();});
  try{
   const response=await fetch('/game-assets/cattle/adult-female/manifest.json');
   if(!response.ok)throw new Error('Prepared cow assets are unavailable. Run assets:cow first.');
   this.manifest=await response.json();
   const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/game-assets/cattle/adult-female/'+this.manifest.file+'?v='+this.manifest.sha256.slice(0,12));
   gltf.scene.traverse(object=>{if(object instanceof Mesh){object.castShadow=true;object.receiveShadow=true;}});
   this.scene.add(gltf.scene);this.mixer=new AnimationMixer(gltf.scene);
   for(const clip of gltf.animations)this.actions.set(clip.name as Clip,this.mixer.clipAction(clip));
   const choices=[['Idle','Standing'],['Graze','Grazing'],['Walk','Walking'],['HumanInteraction','Human interaction']] as const;
   for(const [name] of choices)if(!this.actions.has(name))throw new Error('Missing animation: '+name);
   document.querySelector<HTMLSelectElement>('#lab-animation')!.replaceChildren(...choices.map(([name,label])=>new Option(label,name)));
   document.querySelector('#lab-dimensions')!.innerHTML='<div><span>COW TRIANGLES</span><strong>'+this.manifest.triangles.toLocaleString()+'</strong></div><div><span>BONES</span><strong>'+this.manifest.joints+'</strong></div><div><span>ANIMATIONS</span><strong>4</strong></div><div><span>RUNTIME ASSET</span><strong>'+(this.manifest.bytes/1048576).toFixed(2)+' <small>MiB</small></strong></div>';
   this.play('Idle');this.canvas.dataset.ready='true';this.canvas.dataset.bodySource='cow';this.canvas.dataset.withersHeight=String(this.manifest.withersHeightM);
  }catch(error){this.ui.status((error as Error).message,true);console.error(error);}
  this.last=performance.now();
  this.renderer.setAnimationLoop(()=>{
   const now=performance.now(),dt=Math.min((now-this.last)/1000,.05);this.last=now;
   if(this.mixer&&this.action&&!this.paused){this.mixer.update(dt*this.speed);if(this.clip==='Walk')this.walkDistance+=dt*this.speed*this.manifest.walkSpeedMps;}
   if(this.human&&!this.paused)this.human.update(dt*this.speed);
   const move=(document.querySelector('#lab-cow-ground') as HTMLInputElement).checked;
   this.ground.position.z=this.clip==='Walk'&&move?-(this.walkDistance%1):0;
   if(this.action){if(document.activeElement!==this.time)this.time.value=this.action.time.toFixed(3);this.canvas.dataset.time=this.action.time.toFixed(3);}
   this.renderer.render(this.scene,this.camera);
  });
 }
 private handle(action:LabAction){
  if(action.startsWith('animation-')){this.play(action.slice(10) as Clip);return;}
  if(action.startsWith('view-')){this.setCamera(action.slice(5));return;}
  if(action==='reset-view'){this.setCamera('side');return;}
  if(action==='overview'){this.setCamera('rts');return;}
  if(action==='freeze-pose'){
   const time=Number(this.time.value);
   if(!Number.isFinite(time)||time<0||time>this.action?.getClip().duration){this.ui.status('Clip time must be within the current animation.',true);return;}
   this.paused=true;this.sample(time);this.report();return;
  }
  if(action==='play'){this.paused=false;this.report();}
 }
 private setCamera(view:string){
  const positions:Record<string,[number,number,number]>={side:[4.6,1.65,0],front:[0,1.6,5.2],back:[0,1.6,-5.2],rts:[4.2,3.2,3.8]};
  this.camera.position.set(...(positions[view]??positions.side));this.controls.target.set(0,.8,0);this.controls.update();
 }
 private play(clip:Clip){
  if(!this.mixer||!this.actions.has(clip))return;
  this.mixer.stopAllAction();this.clip=clip;this.action=this.actions.get(clip)!;this.action.reset().play();this.mixer.update(0);this.walkDistance=0;this.paused=false;
  this.time.max=String(this.action.getClip().duration);
  (document.querySelector('#lab-animation') as HTMLSelectElement).value=clip;this.canvas.dataset.animation=clip;
  const descriptions:Record<Clip,string>={Idle:'Quiet standing with subtle breathing, ears and tail.',Graze:'Head lowers to a gentle grazing pose with subtle shoulder and head turns, then lifts.',Walk:'Four-beat walk. The moving ground follows the authored '+this.manifest.walkSpeedMps.toFixed(2)+' m/s pace.',HumanInteraction:'Attentive head lift with gentle up-and-down movement toward a human.'};
  document.querySelector('#lab-cow-description')!.textContent=descriptions[clip];this.report();
  if(this.human)this.human.root.visible=this.showHuman();
  if(clip==='HumanInteraction')void this.ensureHuman();
 }
 private sample(time:number){if(!this.action)return;this.action.time=Math.max(0,Math.min(time,this.action.getClip().duration));this.mixer.update(0);this.walkDistance=this.action.time*this.manifest.walkSpeedMps;}
 private report(){this.canvas.dataset.paused=String(this.paused);this.ui.status('Adult female cow · '+this.clip+(this.paused?' · frozen pose':'')+' · Blender '+this.manifest.blenderVersion);}
 private showHuman(){return this.clip==='HumanInteraction'&&(document.querySelector('#lab-cow-human') as HTMLInputElement).checked;}
 private ensureHuman(){
  if(!this.showHuman())return Promise.resolve();
  if(!this.humanLoading)this.humanLoading=meshyHumanFactory.create(defaultDNA(),2).then(human=>{
   this.human=human;human.root.scale.setScalar(1.65/human.root.userData.character.height);human.root.position.set(0,0,1.60);this.canvas.dataset.humanHeight='1.65';human.root.rotation.y=Math.PI;human.setAnimation('Listen');human.root.visible=this.showHuman();this.scene.add(human.root);this.canvas.dataset.humanReady='true';
  }).catch(error=>{console.warn('Human preview unavailable',error);(document.querySelector('#lab-cow-human') as HTMLInputElement).checked=false;this.humanLoading=undefined;this.ui.status('Cow loaded. The optional human preview is unavailable.',true);});
  return this.humanLoading;
 }
}
