// Test-only browser harness. It uses the production factory/registry/fit path;
// explicit module selection and frozen animation sampling never enter Lab UI.
import * as T from 'three';
import {CharacterFactory} from '/src/characters/CharacterFactory.ts';
import {goldenCharacters} from '/src/characters/GoldenCharacters.ts';
import {characterAssets,characterAssetURL} from '/src/characters/CharacterAssets.ts';
import {universalHumanProfile} from '/src/characters/UniversalHumanProfile.ts';
import {inspectFittedGeometry} from './fitted-geometry-audit.mjs';

const canvas=document.querySelector('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(640,720);renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color('#dbe1d7');
scene.add(new T.HemisphereLight(0xfff3e3,0x9caa9a,2.2));
const sun=new T.DirectionalLight(0xffead5,1.7);sun.position.set(-3,6,5);scene.add(sun);
const camera=new T.PerspectiveCamera(32,640/720,.01,50),factory=new CharacterFactory();
const assets=characterAssets.filter(a=>a.type!=='body'),frameOverrides=new Map(),metadataOverrides=new Map();let human,current,bodyIndices,restRotations,bindHeadWorld;
const modes={front:[0,.06,1],side:[1,.06,0],opposite:[-1,.06,0],back:[0,.06,-1],top:[.06,1,.35],underside:[.2,-1,.5],three:[.55,.16,1]};
function inspect(){
 human.root.updateMatrixWorld(true);const module=human.fit.modules.get(current.id)?.object;
 const materials=new Set(),fittedGeometry=[];let triangles=0,vertices=0,finite=true;
 module?.traverse(o=>{if(!o.isMesh)return;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  fittedGeometry.push({mesh:o.name,...inspectFittedGeometry(o.geometry,index=>o.getVertexPosition(index,new T.Vector3()).toArray())});
  for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
  const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)))finite=false;
 });
 const body=human.root.getObjectByName('UniversalHuman');return {modulePresent:!!module,triangles,vertices,materials:materials.size,finite,
  fittedGeometry,unusedFittedAttributeRows:fittedGeometry.reduce((n,g)=>n+g.unusedAttributeRows,0),
  missingFittedAttributeRows:fittedGeometry.reduce((n,g)=>n+g.missingAttributeRows,0),
  invalidFittedIndexEntries:fittedGeometry.reduce((n,g)=>n+g.invalidIndexEntries,0),
  nonFinitePosedModuleRows:fittedGeometry.reduce((n,g)=>n+g.nonFinitePositionRows,0),
  degeneratePosedModuleTriangles:fittedGeometry.reduce((n,g)=>n+g.degenerateTriangles,0),
  bodyIndices:body.geometry.index?.count??body.geometry.attributes.position.count,bodyIndicesUnchanged:(body.geometry.index?.count??body.geometry.attributes.position.count)===bodyIndices,
  fitRevision:human.fit.revision,modules:human.fit.snapshot().modules.map(m=>m.id)};
}
function pose(clip='Idle',phase=0){
 const asset=human.asset,mixer=human.mixer,animation=asset.animations.find(a=>a.name===clip);
 if(!animation)throw new Error(`Missing ${clip}`);
 mixer.stopAllAction();human.action=null;human.setAnimation(clip);
 // Exercise UniversalHuman.update, including stride attenuation and soft parts,
 // while sampling repeatable points and avoiding cross-fades between QA cells.
 mixer.time=0;human.elapsed=0;for(const [bone,q]of restRotations)bone.quaternion.copy(q);
 human.belly.reset();human.breasts.reset();human.previousPosition=null;human.previousVelocity.set(0,0,0);
 for(const mesh of human.meshes)for(const name of ['BellyJiggle','BreastJiggle']){const index=mesh.morphTargetDictionary?.[name];if(index!==undefined)mesh.morphTargetInfluences[index]=0;}
 const seconds=animation.duration*phase/human.motion.cadence;
 for(let t=0;t<seconds;t+=1/60)human.update(Math.min(1/60,seconds-t));
 human.root.updateMatrixWorld(true);for(const mesh of human.meshes)mesh.skeleton.update();
}
function view(angle='front'){
 const isHead=current.type==='hair'||current.type==='beard'||current.focus==='head';let target,distance;
 if(isHead){
  const bounds=human.fit.cages.get('HEAD_CAGE').bounds,centre=bounds.getCenter(new T.Vector3());
  const head=human.bones.find(b=>b.name==='Head');
  // Cage centre is in the fitted bind frame; transform it through the head bone
  // delta so the review follows older slouch/animation rather than a static point.
  target=centre.clone();human.root.localToWorld(target);
  const actual=head.getWorldPosition(new T.Vector3());target.add(actual.sub(bindHeadWorld));
  distance=current.type==='hair'&&['long','braid','tied'].includes(current.style)?1.22:1.0;
  if(current.type==='beard'){
   // Review all authored beard tips and their chest clearance at ratio endpoints.
   // A fixed skull crop hid long tips; this camera rule has no fit side effects.
   const module=human.fit.modules.get(current.id)?.object;
   const complete=new T.Box3().setFromObject(module,true),headBounds=bounds.clone().applyMatrix4(human.root.matrixWorld);
   headBounds.translate(actual);complete.union(headBounds);
   const size=complete.getSize(new T.Vector3()),tangent=Math.tan(T.MathUtils.degToRad(camera.fov*.5));
   target=complete.getCenter(new T.Vector3());distance=Math.max(1,size.y/(2*tangent)*1.18,size.x/(2*tangent*camera.aspect)*1.18);
  }
 }else{const box=new T.Box3().setFromObject(human.root);target=new T.Vector3(0,box.max.y*.50,0);distance=box.getSize(new T.Vector3()).y*2.38;}
 camera.position.copy(target).add(new T.Vector3(...modes[angle]).normalize().multiplyScalar(distance));camera.lookAt(target);
 renderer.render(scene,camera);document.querySelector('#label').textContent=`${current.id} | ${current.profile} | body LOD${current.lod} | ratio ${current.ratio} | ${current.clip} ${current.phase} | ${angle}`;
}
window.review={
 overrideFrames(ids,authoringFrame){for(const id of ids){const asset=assets.find(a=>a.id===id);if(!asset?.metadata)throw new Error(`Unknown module ${id}`);frameOverrides.set(id,authoringFrame);}},
 overrideMetadata(patches){for(const [id,patch]of Object.entries(patches)){const asset=assets.find(a=>a.id===id);if(!asset?.metadata)throw new Error(`Unknown module ${id}`);metadataOverrides.set(id,structuredClone(patch));}},
 size(width=640,height=720){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();},
 assets:assets.map(a=>({id:a.id,type:a.type,style:a.style,budgets:a.budgets})),
 profiles:goldenCharacters.map(p=>({id:p.id,label:p.label,sex:p.dna.sex,eligibleBeard:p.dna.age>=18&&p.dna.sex==='male'})),
 async load(id,profile='golden_neutral_01',lod=2,ratio=1){
  const a=characterAssets.find(a=>a.id===id),gold=goldenCharacters.find(p=>p.id===profile);if(!a||!gold)throw new Error('Unknown fixture/module');
  const dna=structuredClone(gold.dna);
  if(a.type==='beard'&&(dna.age<18||dna.sex!=='male'))return {skipped:'Beards require a male profile aged 18+; Golden DNA was not changed.'};
  if(a.type!=='body')dna.appearanceFit={hair:1,beard:1,clothing:1,...dna.appearanceFit,[a.type==='garment'?'clothing':a.type]:ratio};
  if(human){scene.remove(human.root);human.dispose();}human=await factory.create(dna,lod,false);
  const body=human.root.getObjectByName('UniversalHuman');bodyIndices=body.geometry.index?.count??body.geometry.attributes.position.count;
  const metadata=a.metadata?{...a.metadata,...metadataOverrides.get(id),...(frameOverrides.has(id)?{authoringFrame:frameOverrides.get(id)}:{})}:null;
  if(a.type!=='body'){factory.registerModule(metadata,characterAssetURL(id,lod));await factory.equip(human,id);}
  scene.add(human.root);human.root.updateMatrixWorld(true);bindHeadWorld=human.bones.find(b=>b.name==='Head').getWorldPosition(new T.Vector3());restRotations=new Map([...human.restRotation].map(([b,q])=>[b,q.clone()]));current={...a,profile,lod,ratio,clip:'Idle',phase:0,...(a.type==='body'?{focus:'head'}:{})};
  pose();view();return {...inspect(),effectiveMetadata:metadata?structuredClone(metadata):null,bodyURL:characterAssetURL('body/universal-human',lod),moduleURL:characterAssetURL(id,lod)};
 },
 sample(angle='front',clip='Idle',phase=0){current.clip=clip;current.phase=phase;pose(clip,phase);view(angle);return inspect();},
 bodyDiagnostic(doubleSided=false){for(const mesh of human.meshes){const material=new T.MeshStandardMaterial({color:'#b4b4b4',roughness:1,flatShading:true,side:doubleSided?T.DoubleSide:T.FrontSide});mesh.material=material;human.materials.push(material);}view();},
 moduleDiagnostic({hideBody=false,doubleSided=false,neutral=false}={}){
  for(const mesh of human.meshes)mesh.visible=!hideBody;
  const object=human.fit.modules.get(current.id)?.object;
  object?.traverse(mesh=>{if(!mesh.isMesh)return;const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(source=>{
   const material=source.clone();material.side=doubleSided?T.DoubleSide:T.FrontSide;
   if(neutral){material.map=null;material.color.set('#997451');}material.needsUpdate=true;human.materials.push(material);return material;
  });mesh.material=Array.isArray(mesh.material)?materials:materials[0];});view();
 },
 seamDiagnostic(){
  const result=[];for(const mesh of human.meshes){const groups=new Map(),position=mesh.geometry.attributes.position;
   for(let i=0;i<position.count;i++){const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*1e5)).join(',');const group=groups.get(key)??[];group.push(i);groups.set(key,group);}
   let maxGap=0,maxGroup=[];for(const ids of groups.values()){if(ids.length<2)continue;const first=mesh.getVertexPosition(ids[0],new T.Vector3());for(const id of ids.slice(1)){const gap=first.distanceTo(mesh.getVertexPosition(id,new T.Vector3()));if(gap>maxGap){maxGap=gap;maxGroup=ids;}}}
   result.push({mesh:mesh.name,coincidentGroups:[...groups.values()].filter(g=>g.length>1).length,maxGap,maxGroup});
  }return result;
 },
 get human(){return human;},get current(){return current;}
};window.ready=true;
