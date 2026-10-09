import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';import {Vector3,Matrix4} from 'three';
import {loadTypeScript} from '../load-typescript.mjs';import {publicFile} from './glb-inspection.mjs';
/** Real public native factory seam, separate from the historical Golden contract. */
export async function validateMeshyRuntime({allowLabPreview=false}={}){
 const {MeshyHumanFactory}=loadTypeScript(new URL('../../src/characters/MeshyHuman.ts',import.meta.url)),{generateCharacterDNA}=loadTypeScript(new URL('../../src/characters/generateCharacterDNA.ts',import.meta.url)),{resolveLabBodyProfile}=loadTypeScript(new URL('../../src/characters/LabBodyPresentation.ts',import.meta.url)),{characterAssets}=loadTypeScript(new URL('../../src/characters/CharacterAssets.ts',import.meta.url));
 const modules=characterAssets.filter(a=>a.scope==='body-bound');assert.ok(modules.every(a=>a.reviewStatus==='accepted'||allowLabPreview&&a.reviewStatus==='preview'),'Native proofs require independent visual approval');
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:2048,height:2048,close(){}});const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),sources=new Map();
 const factory=new MeshyHumanFactory(async url=>{const path=url.split('?')[0];if(!sources.has(path)){const b=readFileSync(publicFile(path));sources.set(path,await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''));}return sources.get(path);},async url=>{const b=readFileSync(publicFile(url.split('?')[0]));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
 const baseline=generateCharacterDNA(1983);baseline.age=32;baseline.morphology={height:1.5,masculinity:1};
 const together={hair:'hair/meshy-short-angular',beard:'beard/meshy-compact-wedge',outfit:'garment/meshy-tunic-trousers',equipment:'equipment/meshy-belt-pouch'},bare={hair:'none',beard:'none',outfit:'none',equipment:'none'};
 let instances=0,motionSamples=0,maxContactDistance=0,maxRimTransportError=0,maxCoverageWeightError=0,maxJoinedRimDrift=0;
 for(const lod of [0,1,2])for(const variant of ['neutral','broad','narrow']){
  const dna={...baseline},morphs=variant==='broad'?{Powerful:1,Overweight:1}:variant==='narrow'?{Slight:1,Underweight:1}:{};
  const {profile}=resolveLabBodyProfile(dna,{version:1,source:'meshy',preset:'neutral',morphs});
  const model=await factory.create(dna,lod,profile,together);instances++;
  try{const fitRuns=model.modules.fitRuns,joinedRims=[];
   const visible=[...new Set(model.fit.mesh.geometry.index.array)],bp=model.fit.mesh.geometry.getAttribute('position');
   for(const [id,group] of model.fit.modules){const binding=JSON.parse(readFileSync(publicFile(modules.find(a=>a.id===id).metadata.nativeBinding.path))),mesh=group.children[0],mp=mesh.geometry.getAttribute('position');for(const v of binding.coverageRimContacts??[]){const point=new Vector3().fromBufferAttribute(mp,v);let best,distance=Infinity;for(const b of visible){const d=point.distanceToSquared(new Vector3().fromBufferAttribute(bp,b));if(d<distance){distance=d;best=b;}}assert.ok(distance<1e-12,'Garment contact lacks a visible matching body rim');joinedRims.push({mesh,v,b:best});}}

   for(const clip of ['Idle','Walk','Run'])for(const time of [0,.25,.6,.9]){
    model.sampleAnimation(clip,time);model.root.updateMatrixWorld(true);model.fit.nativeSkeleton.update();const posed=model.fit.surface('posed');
    for(const [id,group] of model.fit.modules){const mesh=group.children[0];if(!mesh.isSkinnedMesh)continue;const positions=mesh.geometry.getAttribute('position'),binding=JSON.parse(readFileSync(publicFile(modules.find(a=>a.id===id).metadata.nativeBinding.path))),entry=binding.lods[lod];
     for(let v=0;v<positions.count;v++){const p=mesh.getVertexPosition(v,new Vector3());assert.ok(p.toArray().every(Number.isFinite),id+' nonfinite pose');}
     for(const seam of binding.seams){const first=mesh.getVertexPosition(seam[0],new Vector3());for(const v of seam.slice(1))assert.ok(first.distanceTo(mesh.getVertexPosition(v,new Vector3()))<.00001,id+' opens a sewn seam');}
     // Declared contacts use exact triangle correspondence, never a silhouette cage.
     for(const region of Object.values(binding.regions))for(const v of region.contact){const anchor=entry.anchors[entry.vertexAnchors[v]],point=new Vector3();for(let k=0;k<3;k++)point.addScaledVector(new Vector3().fromArray(posed.positions,posed.indices[anchor.triangle*3+k]*3),anchor.barycentric[k]);const distance=point.distanceTo(mesh.getVertexPosition(v,new Vector3()));maxContactDistance=Math.max(maxContactDistance,distance);assert.ok(distance<.080,id+' exceeds bounded source contact transport');}
     // Free panels have designed four-influence weights. Only the fixed opening
     // rims interpolate source contact weights; check their four-influence
     // transport against the full native mixture (8mm maximum, unchanged).
     if(binding.skinning==='authored-four-native')for(const region of Object.values(binding.regions))for(const v of region.contact){
      const anchor=entry.anchors[entry.vertexAnchors[v]],full=new Map(),bi=model.fit.mesh.geometry.getAttribute('skinIndex'),bw=model.fit.mesh.geometry.getAttribute('skinWeight');
      assert.ok(new Vector3(...anchor.offset).length()<=.055,'Opening exceeds the authored 55mm contact band');
      for(let k=0;k<3;k++){const bodyVertex=posed.indices[anchor.triangle*3+k];for(let j=0;j<4;j++){const joint=bi.getComponent(bodyVertex,j);full.set(joint,(full.get(joint)??0)+bw.getComponent(bodyVertex,j)*anchor.barycentric[k]);}}
      const authored=new Vector3().fromBufferAttribute(positions,v),expected=new Vector3(),total=[...full.values()].reduce((a,b)=>a+b,0);
      for(const [joint,weight] of full)expected.addScaledVector(authored.clone().applyMatrix4(model.fit.nativeSkeleton.boneInverses[joint]).applyMatrix4(model.fit.nativeSkeleton.bones[joint].matrixWorld),weight/total);expected.applyMatrix4(mesh.bindMatrixInverse);
      const error=expected.distanceTo(mesh.getVertexPosition(v,new Vector3()));maxRimTransportError=Math.max(maxRimTransportError,error);assert.ok(error<.008,'Fixed garment rim exceeded 8mm contact transport: '+JSON.stringify({lod,variant,clip,time,v,error}));
     }
    }
    for(const join of joinedRims){const error=join.mesh.getVertexPosition(join.v,new Vector3()).distanceTo(model.fit.mesh.getVertexPosition(join.b,new Vector3()));maxJoinedRimDrift=Math.max(maxJoinedRimDrift,error);assert.ok(error<.00001,'Shared body/garment rim opens during native playback');}
    for(const rim of model.fit.mesh.geometry.userData.coverageWeights??[]){const p=new Vector3().fromBufferAttribute(model.fit.mesh.geometry.getAttribute('position'),rim.vertex),expected=new Vector3(),total=rim.influences.reduce((s,[,w])=>s+w,0);for(const [joint,weight] of rim.influences)expected.addScaledVector(p.clone().applyMatrix4(model.fit.nativeSkeleton.boneInverses[joint]).applyMatrix4(model.fit.nativeSkeleton.bones[joint].matrixWorld),weight/total);expected.applyMatrix4(model.fit.mesh.bindMatrixInverse);const error=expected.distanceTo(model.fit.mesh.getVertexPosition(rim.vertex,new Vector3()));maxCoverageWeightError=Math.max(maxCoverageWeightError,error);assert.ok(error<.008,'Clipped body rim exceeded 8mm native skin transport');}
    assert.equal(model.modules.fitRuns,fitRuns,'Ordinary animation refitted modules');motionSamples++;
   }
   await factory.equip(model,bare);assert.equal(model.fit.modules.size,0);assert.equal(model.fit.mesh.geometry,model.fit.sourceGeometry);
  }finally{model.dispose();}
 }
 // Each proof is inspectable in isolation; a pouch requires its garment.
 for(const module of modules){const key=module.type==='garment'?'outfit':module.type;const selected={...bare,[key]:module.id};if(module.metadata.dependency)selected.outfit=module.metadata.dependency.module;const model=await factory.create(baseline,2,undefined,selected);assert.ok(model.fit.modules.has(module.id));model.dispose();instances++;}
 return {modules:modules.length,instances,motionSamples,maxContactDistance,maxRimTransportError,maxCoverageWeightError,maxJoinedRimDrift,fitDuringPlayback:0};
}
