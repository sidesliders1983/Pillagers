import './environment-lab.css';
import {Clock,Group,Mesh,PerspectiveCamera,Scene,Box3,Vector3,Raycaster} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {AssetManager} from '../core/AssetManager';
import {createRenderer} from '../core/Renderer';
import {WorldLighting} from '../core/WorldLighting';
import {createTerrain,surfaceHeightAt} from '../world/Terrain';
import {loadGroundMaterials} from '../world/GroundMaterials';
import {SettlementGrass} from '../world/SettlementGrass';
import {createNature} from '../world/KayKitNature';
import {buildings} from '../world/SettlementLayout';
import {createPaths} from '../world/Paths';
import {Water} from '../world/Water';
import {FjordWater} from '../world/FjordWater';
import {fjordWaterConfig,WaterQuality} from '../config/FjordWaterConfig';
import {worldConfig} from '../config/worldConfig';
export class EnvironmentLab {
 async start(){
  document.title='Environment Lab · Pillagers';document.body.className='environment-lab';
  document.body.innerHTML=`<main><header><h1>Environment Lab · Nature v0.3</h1><a href="/">Fjordside</a><a href="/character-lab">Character Lab</a><a href="/play">Settlement</a></header><nav><label>Seed<input value="${worldConfig.seed}" readonly aria-label="Fixed scene seed"></label><label>Camera<select id="environment-camera"><option value="shore">Shore</option><option value="village">Village</option><option value="forest">Forest edge</option><option value="overview">Overview</option><option value="water">Water level</option></select></label><label>Lighting<select id="environment-light"><option value="day">Day</option><option value="night">Night</option></select></label><label>Quality<select id="environment-quality"><option value="standard">Standard</option><option value="low">Low</option><option value="legacy">Compatibility fallback</option></select></label><label><input id="environment-ground" type="checkbox" checked>Ground</label><label><input id="environment-nature" type="checkbox" checked>KayKit nature</label><label><input id="environment-village" type="checkbox" checked>Meshy village</label><label><input id="environment-water" type="checkbox" checked>Water</label><label><input id="environment-grass" type="checkbox">Optional GrassField</label><label><input id="environment-pause" type="checkbox">Pause waves &amp; wind</label></nav><canvas id="environment-canvas" aria-label="Fjord environment preview"></canvas><pre id="environment-metrics"></pre><p id="environment-status" role="status">Loading required authored scenery…</p><p>Drag to orbit · scroll to zoom. Renderer statistics are indicative, not GPU memory measurements. Preview awaiting reference review; distant cliffs and geometry reflections are not included.</p></main>`;
  const canvas=document.querySelector<HTMLCanvasElement>('#environment-canvas')!,status=document.querySelector<HTMLElement>('#environment-status')!;
  const renderer=createRenderer(canvas);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,300),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
  const assets=new AssetManager();await assets.load();await assets.loadNature();
  const ground=await loadGroundMaterials(),terrain=new Group();terrain.add(createTerrain({treatment:'ground-v02',maps:ground}),createPaths());scene.add(terrain);
  const nature=createNature(assets,worldConfig.seed);scene.add(nature);
  const village=new Group();
  for(const b of buildings){
   if(b.key==='storehouse')continue;const parcel=new Group();parcel.position.set(b.x,surfaceHeightAt(b.x,b.z),b.z);parcel.rotation.y=b.rotation;
   let floor=0;if('terrainKey' in b){const yard=assets.get(b.terrainKey);yard.updateMatrixWorld(true);floor=new Raycaster(new Vector3(0,20,0),new Vector3(0,-1,0)).intersectObject(yard,true)[0]?.point.y??0;parcel.add(yard);}
   const house=assets.get(b.key);house.position.y=floor;parcel.add(house);village.add(parcel);
  }
  // Unchanged approved Meshy body at real 1.8m height, rather than a substitute figure.
  const {scene:person}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL+'game-assets/human/Human_LOD2.glb');
  person.updateMatrixWorld(true);const box=new Box3().setFromObject(person),center=box.getCenter(new Vector3()),size=box.getSize(new Vector3());
  person.scale.setScalar(1.8/size.y);person.position.set(-6-center.x*person.scale.x,surfaceHeightAt(-6,11)-box.min.y*person.scale.x,11-center.z*person.scale.x);village.add(person);scene.add(village);
  const lighting=new WorldLighting(scene,renderer,assets),legacy=new Water();let candidate=new FjordWater();scene.add(legacy.mesh,candidate.mesh);let grass=new SettlementGrass(scene);grass.mesh.visible=false;
  const quality=document.querySelector<HTMLSelectElement>('#environment-quality')!,water=document.querySelector<HTMLInputElement>('#environment-water')!,grassControl=document.querySelector<HTMLInputElement>('#environment-grass')!;
  for(const [id,group] of [['ground',terrain],['nature',nature],['village',village]] as const)document.querySelector('#environment-'+id)!.addEventListener('change',e=>{group.visible=(e.target as HTMLInputElement).checked;});
  grassControl.addEventListener('change',()=>{grass.mesh.visible=grassControl.checked;});
  const sync=()=>{const useCandidate=quality.value!=='legacy';legacy.mesh.visible=water.checked&&!useCandidate;candidate.mesh.visible=water.checked&&useCandidate;canvas.dataset.variant=useCandidate?'candidate':'legacy';canvas.dataset.water=String(water.checked);};water.addEventListener('change',sync);
  quality.addEventListener('change',()=>{scene.remove(candidate.mesh);candidate.dispose();candidate=new FjordWater({...fjordWaterConfig,quality:quality.value as WaterQuality});scene.add(candidate.mesh);grass.dispose();grass=new SettlementGrass(scene,quality.value);grass.mesh.visible=grassControl.checked;sync();});
  const presets={shore:{position:[30,14,-34],target:[0,4,14]},village:{position:[26,12,-2],target:[0,3,18]},forest:{position:[-40,16,4],target:[-16,6,28]},overview:{position:[40,36,-40],target:[0,5,18]},water:{position:[14,4,-20],target:[0,3,6]}};
  const setCamera=(name:keyof typeof presets)=>{const preset=presets[name];controls.enableDamping=false;controls.update();camera.position.fromArray(preset.position);controls.target.fromArray(preset.target);controls.update();controls.enableDamping=true;};
  document.querySelector('#environment-camera')!.addEventListener('change',e=>setCamera((e.target as HTMLSelectElement).value as keyof typeof presets));
  document.querySelector('#environment-light')!.addEventListener('change',e=>lighting.setMode((e.target as HTMLSelectElement).value as 'day'|'night'));
  const resize=()=>{const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(canvas);resize();setCamera('shore');sync();
  const clock=new Clock();let time=0,frames=0,elapsed=0;const pause=document.querySelector<HTMLInputElement>('#environment-pause')!;
  renderer.setAnimationLoop(()=>{const dt=clock.getDelta();if(!pause.checked)time+=Math.min(dt,.1);legacy.update(time);lighting.update(time);candidate.update(time,lighting);grass.update(time,lighting);controls.update();renderer.render(scene,camera);frames++;elapsed+=dt;if(elapsed>.5){const info=renderer.info;document.querySelector('#environment-metrics')!.textContent=`Fjord water · ${quality.value==='legacy'?'compatibility fallback':quality.value} · seed ${worldConfig.seed}\n${(frames/elapsed).toFixed(1)} FPS · ${(elapsed/frames*1000).toFixed(1)} ms/frame\n${info.render.calls} draw calls · ${info.render.triangles.toLocaleString()} triangles\n${info.memory.geometries} geometries · ${info.memory.textures} textures`;canvas.dataset.metrics=JSON.stringify({variant:canvas.dataset.variant,ms:elapsed/frames*1000,calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures});canvas.dataset.fixture=JSON.stringify({seed:worldConfig.seed,time,camera:{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,zoom:camera.zoom},lighting:lighting.mode,pixelRatio:renderer.getPixelRatio(),toneMapping:'ACESFilmic (shared renderer)'});frames=elapsed=0;}});
  status.textContent='Ground v0.2 · KayKit Forest Nature Pack 1.0 FREE (CC0) · Meshy houses/person unchanged · boona13 water (MIT) · ambientCG Ground037 + Ground054 / Poly Haven mossy_rock (CC0)';canvas.dataset.ready='true';
  window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();ground.dispose();grass.dispose();candidate.dispose();assets.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(node=>{if(node instanceof Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){materials.add(material);for(const value of Object.values(material))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value);}}});for(const resource of [...geometries,...materials,...textures] as {dispose:()=>void}[])resource.dispose();renderer.dispose();},{once:true});
 }
}
