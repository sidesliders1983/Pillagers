import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {load} from './load-source.mjs';
const require=createRequire(import.meta.url),{GLTFLoader}=require('three/addons/loaders/GLTFLoader.js'),{MeshoptDecoder}=require('three/addons/libs/meshopt_decoder.module.js');
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function asset(path){const b=await readFile(new URL('../public'+path,import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const {MeshyHumanFactory}=load('../src/characters/MeshyHuman.ts'),{generateCharacterDNA}=load('../src/characters/generateCharacterDNA.ts'),{meshyHumanAssetIdentity}=load('../src/characters/MeshyHumanAssetIdentity.ts');
test('Meshy factory exposes native source-bound sockets and body revisions without changing the master',async()=>{
 const source=await asset(meshyHumanAssetIdentity[2].path),factory=new MeshyHumanFactory(async()=>source),dna=generateCharacterDNA(1983);dna.age=32;
 const model=await factory.create(dna,2),fit=model.fit;
 assert.ok(fit,'Meshy Human must expose a BodyFitAdapter');
 assert.equal(fit.body.id,'body/meshy-human');assert.equal(fit.body.sha256,meshyHumanAssetIdentity[2].sha256);assert.equal(fit.nativeSkeleton.bones.length,44);
 assert.equal(fit.sockets.size,16);assert.equal(fit.surface('source').triangles,3219);
 const before=fit.revision,neutral=fit.socketFrame('socket_head_top');assert.ok(neutral.position[1]>1.2);assert.ok(neutral.scale.every(n=>n>0));
 for(const name of ['socket_hand_L','socket_hand_R','socket_shoulder_L','socket_shoulder_R']){const frame=fit.socketFrame(name);assert.ok(Math.abs(Math.hypot(...frame.quaternion)-1)<1e-6);assert.ok(frame.scale.every(n=>n>0));}
 model.sampleAnimation('Walk',.4);assert.equal(fit.revision,before);assert.notDeepEqual(fit.surface('posed').positions,fit.surface('source').positions);
 model.applyDNA({...dna,age:6});assert.ok(fit.revision>before);assert.ok(fit.socketFrame('socket_head_top').position[1]<neutral.position[1]);assert.equal(source.scene.getObjectByName('socket_head_top'),undefined);
 model.dispose();
});

test('Blender proof exports have exact native bindings, editable lineage and no duplicate body payload',async()=>{
 const {NodeIO}=await import('@gltf-transform/core');const io=new NodeIO();
 for(const [id,name] of [['hair/meshy-short-angular','hair'],['beard/meshy-compact-wedge','beard'],['garment/meshy-tunic-trousers','outfit'],['equipment/meshy-belt-pouch','pouch']]){
  const path='/character-lab/modules/meshy-v2/'+name+'.glb',bytes=await readFile(new URL('../public'+path,import.meta.url)),doc=await io.readBinary(bytes);
  assert.equal(doc.getRoot().listTextures().length,0);assert.equal(doc.getRoot().listAnimations().length,0);assert.equal(doc.getRoot().listSkins().length,0);
  assert.ok(doc.getRoot().listMeshes().every(m=>m.getName().startsWith('Module_')));
  for(const primitive of doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives())){assert.ok(primitive.getAttribute('COLOR_0'));assert.equal(primitive.getMaterial().getAlphaMode(),'OPAQUE');assert.deepEqual(primitive.getMaterial().getBaseColorFactor(),[1,1,1,1]);}
  const bind=JSON.parse(await readFile(new URL('../public'+path.replace('.glb','.binding.json'),import.meta.url),'utf8'));
  const {createHash}=await import('node:crypto');assert.equal(bind.id,id);assert.equal(bind.version,'pillagers-fit/0.2');assert.equal(bind.moduleSha256,createHash('sha256').update(bytes).digest('hex'));assert.match(bind.rigSignature,/^[a-f0-9]{64}$/);
  assert.equal(bind.recipe.blender,'4.5.9');for(const lod of [0,1,2])assert.equal(bind.lods[lod].bodySha256,meshyHumanAssetIdentity[lod].sha256);
  const provenance=JSON.parse(await readFile(new URL('../public'+path.replace('.glb','.provenance.json'),import.meta.url),'utf8'));assert.equal(provenance.route,'authored-template');assert.equal(provenance.reviewStatus,'preview');assert.equal(provenance.sourceBodySha256,'be5173fa4f3b6e63fa7bc3506b3d61b4def28b7f67477b9a29b5eb527d80f8fe');assert.equal(provenance.provider,null);
 }
});

test('native module lifecycle preserves source ownership, masks and garment dependencies through DNA and LOD changes',async()=>{
 const {readFileSync}=await import('node:fs');const factory=new MeshyHumanFactory(url=>asset(url.split('?')[0]),async url=>{const b=readFileSync(new URL('../public'+url.split('?')[0],import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
 const dna=generateCharacterDNA(1983);dna.age=32;dna.morphology={masculinity:1,height:1.5};
 const presentation={hair:'hair/meshy-short-angular',beard:'beard/meshy-compact-wedge',outfit:'garment/meshy-tunic-trousers',equipment:'equipment/meshy-belt-pouch',hairColor:'#512c1e'};
 const a=await factory.create(dna,2,undefined,presentation),b=await factory.create(dna,2,undefined,presentation);
 assert.equal(a.fit.modules.size,4);assert.equal(b.fit.modules.size,4);assert.notEqual(a.fit.modules.get(presentation.outfit).children[0].geometry,b.fit.modules.get(presentation.outfit).children[0].geometry);
 const original=a.fit.sourceGeometry.index.count;assert.ok(a.fit.mesh.geometry.index.count<original);assert.equal(a.fit.mesh.skeleton,a.fit.modules.get(presentation.outfit).children[0].skeleton);
 const revision=a.fit.revision;for(const clip of ['Idle','Walk','Run','Attack','Farm']){a.sampleAnimation(clip,.4);a.update(.1);}assert.equal(a.fit.revision,revision);
 a.applyDNA({...dna,age:6});assert.equal(a.fit.modules.has(presentation.beard),false);assert.equal(b.fit.modules.has(presentation.beard),true);
 await factory.equip(a,{hair:'none',beard:'none',outfit:'none',equipment:presentation.equipment});assert.equal(a.fit.modules.size,0);assert.equal(a.fit.mesh.geometry,a.fit.sourceGeometry);assert.equal(b.fit.modules.size,4);
 const snapshot=b.fit.snapshot();assert.equal(snapshot.bindings.length,4);assert.ok(snapshot.bindings.every(v=>/^[a-f0-9]{64}$/.test(v.sha256)));
 for(const lod of [0,1]){const m=await factory.create(dna,lod,undefined,presentation);assert.equal(m.fit.modules.size,4);m.dispose();}
 a.dispose();b.sampleAnimation('Walk',.5);b.dispose();
});

test('Lab snapshots freeze binding identities and reject a stale module sidecar',()=>{
 const {snapshotModules,parseLabSnapshot}=load('../src/character-lab/LabSnapshot.ts');
 const dna=generateCharacterDNA(1983);dna.age=32;dna.morphology={masculinity:1,height:1.5};const body={version:1,preset:'auto',source:'meshy'},presentation={hair:'hair/meshy-short-angular',beard:'beard/meshy-compact-wedge',outfit:'garment/meshy-tunic-trousers',equipment:'equipment/meshy-belt-pouch'};
 const modules=snapshotModules(dna,presentation,2,body);assert.ok(modules.slice(1).every(m=>m.binding?.sha256));
 const snapshot={version:'pillagers-lab-snapshot/1',styleVersion:'pillagers-meshy-human/1',contractVersion:1,fitVersion:'pillagers-fit/0.2',dna,presentation,body,lod:2,pose:{animation:'Walking',time:.5,paused:true},camera:{type:'orthographic',scale:2.4,fov:38,position:[0,.95,3.7],target:[0,.95,0]},lighting:'lab-neutral/1',modules};
 assert.equal(parseLabSnapshot(snapshot).fitVersion,'pillagers-fit/0.2');const stale=structuredClone(snapshot);stale.modules[1].binding.sha256='0'.repeat(64);assert.throws(()=>parseLabSnapshot(stale),/assets differ/);
});

test('export byte identities remain verifiable on HTTP LAN without browser crypto',async()=>{
 const {sha256Bytes}=load('../src/characters/AssetDigest.ts'),{createHash}=await import('node:crypto');
 for(const data of [Buffer.alloc(0),Buffer.from('abc'),Buffer.from('Pillagers · Ægir'),await readFile(new URL('../public/character-lab/modules/meshy-v2/outfit.glb',import.meta.url))])assert.equal(sha256Bytes(data),createHash('sha256').update(data).digest('hex'));
});

test('outfit preview declares designed tunic, trousers and boots with locked opening rims',async()=>{
 const binding=JSON.parse(await readFile(new URL('../public/character-lab/modules/meshy-v2/outfit.binding.json',import.meta.url),'utf8'));
 assert.equal(binding.skinning,'authored-four-native');
 for(const piece of ['Module_tunic_panels','Module_trousers_panels','Module_boots']){assert.ok(binding.regions[piece],piece+' must be designed as part of the outfit');assert.ok(binding.regions[piece].free.length>0);}
 assert.ok(binding.regions.Module_tunic_panels.contact.length>0);assert.ok(binding.regions.Module_boots.contact.length>0);
 assert.equal(binding.supportedAges.min,18,'This milestone qualifies adult shapes only');
 assert.equal(binding.reviewScope,'adult-neutral-narrow-broad/idle-walk-run');
 const provenance=JSON.parse(await readFile(new URL('../public/character-lab/modules/meshy-v2/outfit.provenance.json',import.meta.url),'utf8'));assert.equal(provenance.reviewStatus,'preview');assert.equal(provenance.visualApproval,null);
});

test('visible body surfaces stay outside the fitted outfit during adult shape and movement changes',async()=>{
 const {auditSurfaceIntersections}=await import('../scripts/characters/surface-intersections.mjs'),{Vector3}=require('three'),{resolveLabBodyProfile}=load('../src/characters/LabBodyPresentation.ts');
 const factory=new MeshyHumanFactory(url=>asset(url.split('?')[0]),async url=>{const b=await readFile(new URL('../public'+url.split('?')[0],import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}),dna=generateCharacterDNA(1983);dna.age=32;dna.morphology={height:1.5,masculinity:1};
 for(const lod of [0,1,2])for(const shape of ['neutral','narrow','broad']){const morphs=shape==='narrow'?{Slight:1,Underweight:1}:shape==='broad'?{Powerful:1,Overweight:1}:{},profile=resolveLabBodyProfile(dna,{version:1,source:'meshy',preset:'neutral',morphs}).profile,human=await factory.create(dna,lod,profile,{hair:'none',beard:'none',outfit:'garment/meshy-tunic-trousers',equipment:'none'});
  try{for(const clip of ['Idle','Walk','Run'])for(const time of [0,.25,.6,.9]){human.sampleAnimation(clip,time);human.root.updateMatrixWorld(true);human.fit.nativeSkeleton.update();const body=human.fit.mesh,outfit=human.fit.modules.get('garment/meshy-tunic-trousers').children[0],positions=[],triangles=[];
   for(const mesh of [body,outfit]){const offset=positions.length;for(let v=0;v<mesh.geometry.getAttribute('position').count;v++)positions.push(mesh.getVertexPosition(v,new Vector3()).toArray());const indices=mesh.geometry.index?Array.from(mesh.geometry.index.array):Array.from({length:mesh.geometry.getAttribute('position').count},(_,i)=>i);for(let t=0;t<indices.length;t+=3)triangles.push(indices.slice(t,t+3).map(i=>i+offset));}
   const boundary=body.geometry.index.count/3,crossings=auditSurfaceIntersections({positions,triangles}).properPairs.filter(p=>p.triangles[0]<boundary&&p.triangles[1]>=boundary);assert.equal(crossings.length,0,'LOD'+lod+'/'+shape+'/'+clip+'@'+time+': visible body cuts through the outfit');
  }}finally{human.dispose();}
 }
});
