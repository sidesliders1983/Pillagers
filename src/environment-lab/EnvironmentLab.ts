import './environment-lab.css';
import {Clock,Group,Mesh,PerspectiveCamera,Scene,Box3,Vector3,Raycaster,InstancedMesh} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {AssetManager} from '../core/AssetManager';
import {createRenderer} from '../core/Renderer';
import {WorldLighting} from '../core/WorldLighting';
import {createTerrain,createRegionalTerrain,surfaceHeightAt} from '../world/Terrain';
import {loadRegionalGroundMaterials} from '../world/RegionalGroundMaterials';
import {loadGroundMaterials} from '../world/GroundMaterials';
import {SettlementGrass} from '../world/SettlementGrass';
import {createNature} from '../world/KayKitNature';
import {loadLabPines} from './LabPines';
import {LabLighting,LabLight} from './LabLighting';
import {auditLabScene} from './LabSceneAudit';
import {LabWorldGeneration} from './LabWorldGeneration';
import {LabEnvironment} from './LabEnvironment';
import {buildings} from '../world/SettlementLayout';
import {createPaths} from '../world/Paths';
import {Water} from '../world/Water';
import {FjordWater} from '../world/FjordWater';
import {fjordWaterConfig,WaterQuality} from '../config/FjordWaterConfig';
import {worldConfig} from '../config/worldConfig';
export class EnvironmentLab {
 async start(){
  document.title='Environment Lab · Pillagers';document.body.className='environment-lab';
  document.body.innerHTML=`<main><header><h1>Environment Lab · Ground v0.4</h1><a href="/">Fjordside</a><a href="/character-lab">Character Lab</a><a href="/play">Settlement</a></header><nav><label>Reference seed<input value="${worldConfig.seed}" readonly aria-label="Fixed scene seed"></label><label>Camera<select id="environment-camera"><option value="shore">Shore</option><option value="village">Village</option><option value="forest">Forest edge</option><option value="overview">Overview</option><option value="landscape">High overlook</option><option value="water">Water level</option><option value="close">House &amp; resident close</option></select></label><label>Lighting<select id="environment-light"><option value="day">Current day</option><option value="sun10">Low sun · 10°</option><option value="sun20">Low sun · 20°</option><option value="sun30">Low sun · 30°</option><option value="sun20-front">Low sun · 20° front light</option><option value="night">Night</option></select></label><label>Low-sun sky fill<input id="environment-fill" aria-label="Low-sun sky fill" type="number" min="0" max="3" step="0.05" value="0.65" disabled></label><label>Low-sun exposure<input id="environment-exposure" aria-label="Low-sun exposure" type="number" min="0.5" max="2" step="0.05" value="1.05" disabled></label><label>PCF shadow radius<input id="environment-shadow-radius" aria-label="PCF shadow radius" type="number" min="0.5" max="4" step="0.5" value="4" disabled></label><label><input id="environment-hdr" type="checkbox">HDR material lighting</label><label>Quality<select id="environment-quality"><option value="standard">Standard</option><option value="low">Low</option><option value="legacy">Compatibility fallback</option></select></label><label>Conifers<select id="environment-conifers" aria-label="Conifers"><option value="ez-tree">EZ-Tree Large · varied heights</option><option value="kaykit">KayKit FREE conifers</option></select></label><label>Ground materials<select id="environment-material"><option value="regional">Sourced regional maps</option><option value="baseline">Previous ground v0.2</option></select></label><label><input id="environment-ground" type="checkbox" checked>Ground</label><label><input id="environment-nature" type="checkbox" checked>Nature</label><label><input id="environment-village" type="checkbox" checked>Meshy village</label><label><input id="environment-water" type="checkbox" checked>Water</label><label><input id="environment-grass" type="checkbox">Optional GrassField</label><label><input id="environment-fog" type="checkbox" checked>Atmospheric fog</label><label><input id="environment-pause" type="checkbox">Pause waves &amp; wind</label></nav><canvas id="environment-canvas" aria-label="Fjord environment preview"></canvas><p id="environment-conifers-status" role="status"></p><p id="environment-lighting-status" role="status"></p><p id="environment-hdr-status" role="status"></p><pre id="environment-metrics"></pre><p id="environment-status" role="status">Loading required authored scenery…</p><p>Drag to orbit · scroll to zoom. Renderer statistics are indicative, not GPU memory measurements. Preview awaiting reference review; distant cliffs and geometry reflections are not included.</p></main>`;
  const canvas=document.querySelector<HTMLCanvasElement>('#environment-canvas')!,status=document.querySelector<HTMLElement>('#environment-status')!;
  const renderer=createRenderer(canvas);renderer.info.autoReset=false;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,300),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
  const assets=new AssetManager();await assets.load();await assets.loadNature();
  const ground=await loadGroundMaterials(),terrain=new Group();
  let regional=await loadRegionalGroundMaterials('standard',renderer.capabilities.getMaxAnisotropy());terrain.add(createRegionalTerrain(regional.regions));scene.add(terrain);
  canvas.dataset.groundTier='standard';canvas.dataset.ground=JSON.stringify({regions:12,colourSpace:'sRGB',dataSpace:'NoColorSpace',density:[32,960/28],mipmaps:true,anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy())});
  const nature=new Group(),kaykitNature=createNature(assets,worldConfig.seed),pineNature=createNature(assets,worldConfig.seed,await loadLabPines(assets));
  pineNature.name='EZ-Tree Large + KayKit FREE undergrowth';nature.add(kaykitNature,pineNature);scene.add(nature);
  const conifers=document.querySelector<HTMLSelectElement>('#environment-conifers')!;
  const syncConifers=()=>{
   const pine=conifers.value==='ez-tree';kaykitNature.visible=!pine;pineNature.visible=pine;
   const heights=(pine?pineNature:kaykitNature).userData.coniferHeights as number[];
   const summary={source:conifers.value,preset:pine?'Large':null,count:heights.length,minHeight:Math.min(...heights),maxHeight:Math.max(...heights)};
   canvas.dataset.conifers=JSON.stringify(summary);
   document.querySelector('#environment-conifers-status')!.textContent=`${pine?'EZ-Tree Large':'KayKit FREE'} · varied heights · ${summary.count} pines · height range ${summary.minHeight.toFixed(1)}–${summary.maxHeight.toFixed(1)} m`;
  };
  conifers.addEventListener('change',syncConifers);syncConifers();
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
  document.querySelector('#environment-fog')!.addEventListener('change', event => lighting.setFog((event.target as HTMLInputElement).checked));
  const environment=new LabEnvironment(scene,renderer,document.querySelector<HTMLElement>('#environment-hdr-status')!);
  const hdr=document.querySelector<HTMLInputElement>('#environment-hdr')!;
  let generation:LabWorldGeneration|undefined;
  const study=new LabLighting(scene,renderer,lighting,person);
  const quality=document.querySelector<HTMLSelectElement>('#environment-quality')!,water=document.querySelector<HTMLInputElement>('#environment-water')!,grassControl=document.querySelector<HTMLInputElement>('#environment-grass')!;
  for(const [id,group] of [['ground',terrain],['nature',nature],['village',village]] as const)document.querySelector('#environment-'+id)!.addEventListener('change',e=>{group.visible=(e.target as HTMLInputElement).checked;syncLighting();});
  grassControl.addEventListener('change',()=>{grass.mesh.visible=grassControl.checked;syncLighting();});
  const sync=()=>{const useCandidate=quality.value!=='legacy';legacy.mesh.visible=water.checked&&!useCandidate&&!generation?.active;candidate.mesh.visible=water.checked&&useCandidate&&!generation?.active;generation?.syncVisibility();canvas.dataset.variant=useCandidate?'candidate':'legacy';canvas.dataset.water=String(water.checked);};water.addEventListener('change',()=>{sync();syncLighting();});
  quality.addEventListener('change',()=>{if(generation?.active)return;scene.remove(candidate.mesh);candidate.dispose();candidate=new FjordWater({...fjordWaterConfig,quality:quality.value as WaterQuality});scene.add(candidate.mesh);grass.dispose();grass=new SettlementGrass(scene,quality.value);grass.mesh.visible=grassControl.checked;sync();});

  const materialControl=document.querySelector<HTMLSelectElement>('#environment-material')!;
  let groundRevision=0;
  const rebuildGround=async()=>{
   if(generation?.active)return;
   const revision=++groundRevision,tier=quality.value==='standard'?'standard':'low',baseline=materialControl.value==='baseline';
   status.textContent='Loading ground materials…';
   try{
    const next=baseline?null:await loadRegionalGroundMaterials(tier,renderer.capabilities.getMaxAnisotropy());
    if(revision!==groundRevision){next?.dispose();return;}
    terrain.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});terrain.clear();regional.dispose();
    if(next){regional=next;terrain.add(createRegionalTerrain(next.regions,tier));}else terrain.add(createTerrain({treatment:'ground-v02',maps:ground}),createPaths());
    canvas.dataset.groundTier=baseline?'baseline':tier;canvas.dataset.ground=JSON.stringify({regions:baseline?1:12,density:baseline?[1024/116,1024/80]:tier==='standard'?[32,960/28]:[16,480/28],colourSpace:baseline?'vertex colour':'sRGB',dataSpace:'NoColorSpace',mipmaps:true,anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy())});
    status.textContent=baseline?'Previous ground v0.2 · vertex colour + normal/roughness':'Ground v0.4 · sourced regional albedo / OpenGL normal / roughness · '+tier+' · CC0 ambientCG / Poly Haven';
    syncLighting();
   }catch(error){status.textContent='Ground loading failed: '+(error instanceof Error?error.message:String(error));}
  };
  materialControl.addEventListener('change',rebuildGround);quality.addEventListener('change',rebuildGround);
  const presets={landscape:{position:[88,78,-78],target:[0,5,16]},shore:{position:[30,14,-34],target:[0,4,14]},village:{position:[26,12,-2],target:[0,3,18]},forest:{position:[-40,16,4],target:[-16,6,28]},overview:{position:[40,36,-40],target:[0,5,18]},water:{position:[14,4,-20],target:[0,3,6]},close:{position:[6,5,-1],target:[-5,2,12]}};
  const setCamera=(name:keyof typeof presets)=>{if(generation?.setCamera(name))return;const preset=presets[name];controls.enableDamping=false;controls.update();camera.position.fromArray(preset.position);controls.target.fromArray(preset.target);controls.update();controls.enableDamping=true;};
  document.querySelector('#environment-camera')!.addEventListener('change',e=>setCamera((e.target as HTMLSelectElement).value as keyof typeof presets));
  const lightControl=document.querySelector<HTMLSelectElement>('#environment-light')!;
  const fill=document.querySelector<HTMLInputElement>('#environment-fill')!,exposure=document.querySelector<HTMLInputElement>('#environment-exposure')!,radius=document.querySelector<HTMLInputElement>('#environment-shadow-radius')!;
  const syncLighting=()=>{generation?.syncVisibility();const pilot=lightControl.value.startsWith('sun');fill.disabled=exposure.disabled=radius.disabled=!pilot;study.select(lightControl.value as LabLight,quality.value!=='standard',Math.max(0,Math.min(3,Number(fill.value))),Math.max(.5,Math.min(2,Number(exposure.value))),Math.max(.5,Math.min(4,Number(radius.value))),generation?.active??false);document.querySelector('#environment-lighting-status')!.textContent=study.label();canvas.dataset.sceneAudit=JSON.stringify(auditLabScene(scene));void environment.set(hdr.checked,lighting.mode==='night',lighting.directional.position.clone().sub(lighting.directional.target.position));};
  radius.addEventListener('change',syncLighting);hdr.addEventListener('change',syncLighting);fill.addEventListener('change',syncLighting);exposure.addEventListener('change',syncLighting);lightControl.addEventListener('change',syncLighting);conifers.addEventListener('change',syncLighting);quality.addEventListener('change',syncLighting);syncLighting();
  const resize=()=>{const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(canvas);resize();setCamera('shore');sync();
  generation=new LabWorldGeneration(scene,assets,renderer,canvas,camera,controls,{terrain,nature,village},()=>{
   syncConifers();sync();grass.mesh.visible=grassControl.checked&&!generation!.active;
   syncLighting();setCamera((document.querySelector('#environment-camera') as HTMLSelectElement).value as keyof typeof presets);
  });
  const clock=new Clock();let time=0,frames=0,elapsed=0;const pause=document.querySelector<HTMLInputElement>('#environment-pause')!;
  renderer.setAnimationLoop(()=>{const dt=clock.getDelta();if(!pause.checked)time+=Math.min(dt,.1);legacy.update(time);lighting.update(time);candidate.update(time,lighting);grass.update(time,lighting);generation?.update(pause.checked?0:Math.min(dt,.05),time,lighting);controls.update();renderer.info.reset();renderer.render(scene,camera);frames++;elapsed+=dt;if(elapsed>.5){const info=renderer.info;document.querySelector('#environment-metrics')!.textContent=`Fjord water · ${quality.value==='legacy'?'compatibility fallback':quality.value} · seed ${generation?.blueprint?.config.seed??worldConfig.seed}\n${(frames/elapsed).toFixed(1)} FPS · ${(elapsed/frames*1000).toFixed(1)} ms/frame\n${info.render.calls} draw calls (including shadows) · ${info.render.triangles.toLocaleString()} triangles\n${info.memory.geometries} geometries · ${info.memory.textures} textures`;canvas.dataset.metrics=JSON.stringify({variant:canvas.dataset.variant,ms:elapsed/frames*1000,calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,callsIncludeShadows:true});canvas.dataset.fixture=JSON.stringify({seed:generation?.blueprint?.config.seed??worldConfig.seed,time,camera:{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,zoom:camera.zoom},lighting:lighting.mode,fog:scene.fog?{near:lighting.fog.near,far:lighting.fog.far}:null,conifers:JSON.parse(canvas.dataset.conifers!),pixelRatio:renderer.getPixelRatio(),toneMapping:'ACESFilmic (shared renderer)',lightSettings:study.describe(),environment:environment.describe()});frames=elapsed=0;}});
  status.textContent='Ground v0.4 · sourced regional albedo, normals and roughness · EZ-Tree Large pines (MIT) / KayKit FREE undergrowth (CC0) · Meshy houses/person unchanged · boona13 water (MIT) · ambientCG Ground037 + Ground054 / Poly Haven mossy_rock (CC0)';canvas.dataset.ready='true';
  window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();groundRevision++;generation?.dispose();environment.dispose();lighting.directional.shadow.dispose();ground.dispose();regional.dispose();grass.dispose();candidate.dispose();assets.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(node=>{if(node instanceof InstancedMesh)node.dispose();if(node instanceof Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){materials.add(material);for(const value of Object.values(material))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value);}}});for(const resource of [...geometries,...materials,...textures] as {dispose:()=>void}[])resource.dispose();renderer.dispose();},{once:true});
 }
}
