import './meshy-lab.css';
import {Clock, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {meshyHumanFactory, MeshyHuman} from '../characters/MeshyHuman';
import {generateCharacterDNA} from '../characters/generateCharacterDNA';

export class MeshyCharacterLab {
 async start(){
  document.title='Character Lab · Meshy Human';document.body.className='meshy-lab';
  document.body.innerHTML=`<main class="meshy-shell"><header><h1>Character Lab · Human</h1><nav><a href="/?characters=meshy">Open in Fjord</a><a href="/?characters=meshy&amp;residents=40">Fjord · 40 residents</a><a href="/character-lab">Existing Character Lab</a></nav></header>
   <aside><p>Your textured Meshy body and all exported animations.</p><label>Animation<select id="meshy-clip"></select></label>
   <label>Detail<select id="meshy-lod"><option value="0">Full · 7,644 triangles</option><option value="1">Medium</option><option value="2">Distant</option></select></label>
   <label>Residents<select id="meshy-count"><option value="10">10 · standard</option><option value="1">1 · inspect</option><option value="40">40 · performance test</option></select></label>
   <label>Age <output id="meshy-age-value">32</output><input id="meshy-age" type="range" min="6" max="100" step="1" value="32"></label>
   <label>Femininity / masculinity<input id="meshy-masculinity" type="range" min="0" max="1" step=".01" value=".51"></label>
   <label>Intelligence · weight tendency<input id="meshy-intelligence" type="range" min="0" max="1" step=".01" value=".5"></label>
   <label>Agility<input id="meshy-agility" type="range" min="0" max="1" step=".01" value=".5"></label>
   <label>Adult height <output id="meshy-height-value">1.44 m</output><input id="meshy-height" type="range" min="1.16" max="1.60" step=".01" value="1.44"></label>
   <label>Clip time<input id="meshy-time" type="range" min="0" max="10" step=".01" value="0"></label>
   <button id="meshy-pause">Pause</button><button id="meshy-restart">Restart clip</button>
   <p>Original Meshy textures. Age changes head, body and limb proportions; DNA controls build and movement rhythm. Skin follows DNA with a subtle 20% tint. Hair, beards and additional clothing still need preparation.</p>
   <p id="meshy-status" role="status">Loading human…</p><pre id="meshy-metrics"></pre></aside><canvas id="meshy-canvas" aria-label="Animated Meshy human preview"></canvas></main>`;
  const canvas=document.querySelector<HTMLCanvasElement>('#meshy-canvas')!;
  const scene=new Scene();scene.background=new Color('#dbe1d7');
  const renderer=new WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;
  const camera=new PerspectiveCamera(38,1,.05,100),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
  scene.add(new HemisphereLight(0xfff3e3,0x9caa9a,2.2));const sun=new DirectionalLight(0xffead5,1.7);sun.position.set(-3,6,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:40});scene.add(sun);
  const floor=new Mesh(new PlaneGeometry(50,50),new MeshStandardMaterial({color:0xd3d7cc,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;floor.receiveShadow=true;scene.add(floor);
  const select=document.querySelector<HTMLSelectElement>('#meshy-clip')!,lod=document.querySelector<HTMLSelectElement>('#meshy-lod')!,count=document.querySelector<HTMLSelectElement>('#meshy-count')!;
  const time=document.querySelector<HTMLInputElement>('#meshy-time')!,height=document.querySelector<HTMLInputElement>('#meshy-height')!,status=document.querySelector<HTMLElement>('#meshy-status')!;
  let models:MeshyHuman[]=[],paused=false,revision=0,closed=false;
  const dna=generateCharacterDNA(1983);dna.age=32;dna.morphology={masculinity:.51,height:1.44};
  const pauseButton=document.querySelector<HTMLButtonElement>('#meshy-pause')!;
  const play=()=>{for(const model of models)model.playClip(select.value);time.max=String(models[0]?.duration??10);time.value='0';paused=false;pauseButton.textContent='Pause';canvas.dataset.clip=select.value;};
  const load=async()=>{
   const ticket=++revision;canvas.dataset.ready='false';status.textContent='Loading human…';
   let next:MeshyHuman[]=[];
   try{
    // Resolve all instances before replacing the currently visible set.
    const results=await Promise.allSettled(Array.from({length:Number(count.value)},()=>meshyHumanFactory.create(dna,Number(lod.value))));
    next=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
    const failure=results.find(result=>result.status==='rejected');
    if(failure?.status==='rejected')throw failure.reason;
    if(ticket!==revision||closed){next.forEach(model=>model.dispose());return;}
    models.forEach(model=>{scene.remove(model.root);model.dispose();});models=next;
    if(!select.options.length){for(const clip of models[0].clips){const option=document.createElement('option');option.value=clip.name;option.textContent=clip.name.replaceAll('_',' ');select.add(option);}select.value='Idle_02';}
    models.forEach((model,i)=>{if(models.length>1)model.root.position.set((i%Math.min(8,Math.ceil(Math.sqrt(models.length)))-(Math.min(8,Math.ceil(Math.sqrt(models.length)))-1)/2)*1.6,0,(Math.floor(i/Math.min(8,Math.ceil(Math.sqrt(models.length))))-(Math.ceil(models.length/Math.min(8,Math.ceil(Math.sqrt(models.length))))-1)/2)*1.6);scene.add(model.root);});
    camera.position.set(models.length>1?12:2.8,models.length>1?10:1.8,models.length>1?15:4);controls.target.set(0,.75,0);controls.update();
    play();canvas.dataset.ready='true';canvas.dataset.instances=String(models.length);canvas.dataset.lod=lod.value;status.textContent=models.length+' resident'+(models.length===1?'':'s')+' · '+models[0].clips.length+' clips · shared source';
   }catch(error){next.forEach(model=>model.dispose());if(ticket===revision&&!closed){status.textContent='Could not load human: '+(error as Error).message;canvas.dataset.error=String(error);}}
  };
  select.addEventListener('change',play);lod.addEventListener('change',()=>void load());count.addEventListener('change',()=>void load());
  for(const axis of ['age','masculinity','intelligence','agility'])document.querySelector<HTMLInputElement>('#meshy-'+axis)!.addEventListener('input',event=>{
   const value=Number((event.target as HTMLInputElement).value);
   if(axis==='age'){dna.age=value;document.querySelector('#meshy-age-value')!.textContent=String(value);}
   else if(axis==='masculinity'){const masculinity=value===.5?.51:value;dna.morphology!.masculinity=masculinity;dna.sex=masculinity<.5?'female':'male';}
   else dna.traits[axis as 'intelligence'|'agility']=value;
   for(const model of models)model.applyDNA(dna);
  });
  height.addEventListener('input',()=>{dna.morphology!.height=Number(height.value);for(const model of models)model.applyDNA(dna);document.querySelector('#meshy-height-value')!.textContent=Number(height.value).toFixed(2)+' m';});
  pauseButton.addEventListener('click',()=>{paused=!paused;pauseButton.textContent=paused?'Resume':'Pause';});
  time.addEventListener('input',()=>{paused=true;pauseButton.textContent='Resume';for(const model of models)model.sample(Number(time.value));});
  document.querySelector('#meshy-restart')!.addEventListener('click',()=>{for(const model of models)model.sample(0);paused=false;pauseButton.textContent='Pause';});
  const resize=()=>{const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const clock=new Clock();let frames=0,elapsed=0;
  renderer.setAnimationLoop(()=>{const dt=clock.getDelta();if(!paused)for(const model of models)model.update(Math.min(dt,.05));controls.update();renderer.render(scene,camera);frames++;elapsed+=dt;if(elapsed>.5){document.querySelector('#meshy-metrics')!.textContent=Math.round(frames/elapsed)+' FPS\n'+renderer.info.render.calls+' draw calls\n'+renderer.info.render.triangles.toLocaleString()+' rendered triangles';canvas.dataset.fps=String(Math.round(frames/elapsed));frames=0;elapsed=0;}});
  window.addEventListener('pagehide',()=>{closed=true;revision++;renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();models.forEach(model=>model.dispose());floor.geometry.dispose();(floor.material as MeshStandardMaterial).dispose();renderer.dispose();},{once:true});
  await load();
 }
}

