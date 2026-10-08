import './environment-lab.css';
import {Clock,Color,Group,Mesh,PerspectiveCamera,Scene,WebGLRenderer} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {AssetManager} from '../core/AssetManager';
import {WorldLighting} from '../core/WorldLighting';
import {createTerrain,heightAt} from '../world/Terrain';
import {loadGroundMaterials} from '../world/GroundMaterials';
import {createPaths} from '../world/Paths';
import {Water} from '../world/Water';
import {FjordWater} from '../world/FjordWater';
import {fjordWaterConfig,WaterQuality} from '../config/FjordWaterConfig';
import {seededRandom,worldConfig} from '../config/worldConfig';
export class EnvironmentLab {
 async start(){
  document.title='Environment Lab · Pillagers';document.body.className='environment-lab';
  document.body.innerHTML=`<main><header><h1>Environment Lab · Ground v0.2</h1><a href="/">Fjordside</a><a href="/character-lab">Character Lab</a><a href="/play">Settlement</a></header><nav><label>Seed<input value="${worldConfig.seed}" readonly aria-label="Fixed scene seed"></label><label>Camera<select id="environment-camera"><option value="shore">Shore</option><option value="overview">Overview</option><option value="water">Water level</option></select></label><label>Lighting<select id="environment-light"><option value="day">Day</option><option value="night">Night</option></select></label><label>Quality<select id="environment-quality"><option value="standard">Standard</option><option value="low">Low</option><option value="legacy">Compatibility fallback</option></select></label><label><input id="environment-water" type="checkbox" checked>Water</label><label><input id="environment-pause" type="checkbox">Pause waves</label></nav><canvas id="environment-canvas" aria-label="Fjord environment preview"></canvas><pre id="environment-metrics"></pre><p id="environment-status" role="status">Loading shared scenery…</p><p>Drag to orbit · scroll to zoom. Renderer statistics are indicative, not GPU memory measurements. Environment preview.</p></main>`;
  const canvas=document.querySelector<HTMLCanvasElement>('#environment-canvas')!,status=document.querySelector<HTMLElement>('#environment-status')!;
  const renderer=new WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;
  const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,300),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
  const assets=new AssetManager();await assets.load();const ground=await loadGroundMaterials();scene.add(createTerrain({treatment:'ground-v02',maps:ground}),createPaths());
  const props=new Group(),random=seededRandom(worldConfig.seed);
  for(let i=0;i<12;i++){const model=assets.get(i%3===0?'boulder':'spruce'),x=-12+random()*24,z=-3+random()*12;model.position.set(x,heightAt(x,z),z);model.rotation.y=random()*Math.PI*2;model.scale.setScalar(i%3===0?.65:.8);props.add(model);}
  const house=assets.get('hut');house.position.set(8,heightAt(8,3),3);props.add(house);scene.add(props);
  const lighting=new WorldLighting(scene,renderer,assets),legacy=new Water();let candidate=new FjordWater();scene.add(legacy.mesh,candidate.mesh);
  const quality=document.querySelector<HTMLSelectElement>('#environment-quality')!,water=document.querySelector<HTMLInputElement>('#environment-water')!;
  const sync=()=>{const useCandidate=quality.value!=='legacy';legacy.mesh.visible=water.checked&&!useCandidate;candidate.mesh.visible=water.checked&&useCandidate;canvas.dataset.variant=useCandidate?'candidate':'legacy';canvas.dataset.water=String(water.checked);};
  water.addEventListener('change',sync);
  quality.addEventListener('change',()=>{scene.remove(candidate.mesh);candidate.dispose();candidate=new FjordWater({...fjordWaterConfig,quality:quality.value as WaterQuality});scene.add(candidate.mesh);sync();});
  const presets={shore:{position:[18,9,-26],target:[0,0,-10]},overview:{position:[25,28,-40],target:[0,0,-4]},water:{position:[8,2.5,-22],target:[0,0,-10]}};
  const setCamera=(name:keyof typeof presets)=>{const preset=presets[name];controls.enableDamping=false;controls.update();camera.position.fromArray(preset.position);controls.target.fromArray(preset.target);controls.update();controls.enableDamping=true;};
  document.querySelector('#environment-camera')!.addEventListener('change',e=>setCamera((e.target as HTMLSelectElement).value as keyof typeof presets));
  document.querySelector('#environment-light')!.addEventListener('change',e=>lighting.setMode((e.target as HTMLSelectElement).value as 'day'|'night'));
  const resize=()=>{const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(canvas);resize();setCamera('shore');sync();
  const clock=new Clock();let time=0,frames=0,elapsed=0;const pause=document.querySelector<HTMLInputElement>('#environment-pause')!;
  renderer.setAnimationLoop(()=>{const dt=clock.getDelta();if(!pause.checked)time+=Math.min(dt,.1);legacy.update(time);lighting.update(time);candidate.update(time,lighting);controls.update();renderer.render(scene,camera);frames++;elapsed+=dt;if(elapsed>.5){const info=renderer.info;document.querySelector('#environment-metrics')!.textContent=`Fjord water · ${quality.value==='legacy'?'compatibility fallback':quality.value} · seed ${worldConfig.seed}\n${(frames/elapsed).toFixed(1)} FPS · ${(elapsed/frames*1000).toFixed(1)} ms/frame\n${info.render.calls} draw calls · ${info.render.triangles.toLocaleString()} triangles\n${info.memory.geometries} geometries · ${info.memory.textures} textures`;canvas.dataset.metrics=JSON.stringify({variant:canvas.dataset.variant,ms:elapsed/frames*1000,calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures});frames=elapsed=0;}});
  status.textContent='Ground v0.2 · ambientCG Ground037 + Ground054 (CC0) · native standard material · fjord water: boona13/threejs-grass-water-shaders';canvas.dataset.ready='true';
  window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();ground.dispose();candidate.dispose();scene.traverse(node=>{if(node instanceof Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});renderer.dispose();},{once:true});
 }
}
