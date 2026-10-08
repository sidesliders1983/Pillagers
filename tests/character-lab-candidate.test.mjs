import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {load} from './load-source.mjs';
import {geometryAsset} from './glb-fixture.mjs';

const {defaultDNA,serializeCharacterDNA}=load('../src/characters/CharacterDNA.ts');
const {CharacterFactory}=load('../src/characters/CharacterFactory.ts');
const {goldenLabBody,labBodyAsset,labCandidatePresetNames}=load('../src/characters/LabBodySources.ts');
const {previewLabBodyPresentation,parseLabBodyPresentation,resolveLabBodyProfile}=load('../src/characters/LabBodyPresentation.ts');
const {parseLabSnapshot,snapshotModules,labSnapshotVersion,fixedLabViews}=load('../src/character-lab/LabSnapshot.ts');
const {characterAssetURL}=load('../src/characters/CharacterAssets.ts');
const bare={hair:'none',beard:'none',outfit:'none',equipment:'none',equipmentSocket:'auto',hairColor:null,technicalWaistWrap:false};
const bytes=()=>readFileSync(new URL('../public'+goldenLabBody.path,import.meta.url));
const meshOf=human=>{let result;human.root.traverse(node=>{if(node.isSkinnedMesh)result=node;});return result;};
function factory(){
 const requests=[];return {requests,factory:new CharacterFactory(async url=>{
  requests.push(url);const path=new URL(url,'http://local.test').pathname;
  if(path!==goldenLabBody.path)return geometryAsset(path.slice(1));
  const b=bytes();return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 })};
}
function snapshot(){
 const dna=defaultDNA(),body={...previewLabBodyPresentation,preset:'giant'},lod=2;
 return {version:labSnapshotVersion,styleVersion:goldenLabBody.styleVersion,contractVersion:1,fitVersion:'pillagers-fit/0.1',dna,presentation:{...bare},body,lod,pose:{animation:'Run',time:.2,paused:true},camera:{...structuredClone(fixedLabViews.front),type:'orthographic',scale:2.4,fov:38},lighting:'lab-neutral/1',modules:snapshotModules(dna,bare,lod,body)};
}

test('Lab candidate has exact sourced bytes and a separate hash/style identity, with explicit LOD2 policy',()=>{
 const actual=createHash('sha256').update(bytes()).digest('hex'),provenance=JSON.parse(readFileSync(new URL('../public'+goldenLabBody.path.replace('.glb','.provenance.json'),import.meta.url)));
 assert.equal(actual,goldenLabBody.sha256);assert.equal(provenance.sha256,actual);assert.equal(provenance.status,'preview-not-accepted');
 assert.equal(labBodyAsset(goldenLabBody.source,2).path,goldenLabBody.path);
 assert.throws(()=>labBodyAsset(goldenLabBody.source,0),/LOD2/);assert.throws(()=>labBodyAsset(goldenLabBody.source,1),/LOD2/);
 assert.equal(labBodyAsset().url,characterAssetURL('body/universal-human',2));
 for(const source of ['unknown','constructor','__proto__',{},null])assert.throws(()=>parseLabBodyPresentation({version:1,preset:'neutral',source}));
});

test('preview builds resolve once through existing strength composition, preserve identity and pause adult overrides for children',()=>{
 const dna=defaultDNA(),identity=serializeCharacterDNA(dna);
 for(const preset of labCandidatePresetNames){
  const result=resolveLabBodyProfile(dna,{...previewLabBodyPresentation,preset});
  assert.equal(result.body.source,goldenLabBody.source);assert.equal(result.profile.age,dna.age);assert.equal(result.status,'override');
  assert.throws(()=>parseLabBodyPresentation({version:1,preset}),/source/);
 }
 const giant=resolveLabBodyProfile(dna,{...previewLabBodyPresentation,preset:'giant'}).profile;
 assert.equal(giant.height,1.58);assert.equal(giant.weights.Powerful,.6);assert.equal(giant.weights.Masculine,.18);
 assert.equal(resolveLabBodyProfile({...dna,age:6},{...previewLabBodyPresentation,preset:'giant'}).status,'unsupported-age');
 const fox=resolveLabBodyProfile(dna,{...previewLabBodyPresentation,preset:'fox',morphs:{Grounded:1}}).profile;
 assert.equal(fox.weights.Agile,0);assert.equal(fox.weights.Grounded,.6);
 assert.equal(serializeCharacterDNA(dna),identity);
});

test('candidate snapshots roundtrip their real source; legacy hashes, incompatible modules and LODs cannot masquerade as that source',()=>{
 const original=snapshot(),parsed=parseLabSnapshot(JSON.parse(JSON.stringify(original)));
 assert.deepEqual(parsed,original);assert.equal(parsed.modules[0].id,goldenLabBody.id);assert.equal(parsed.modules[0].sha256,goldenLabBody.sha256);
 const changes=[s=>s.modules[0].sha256='0'.repeat(64),s=>s.modules[0].id='body/universal-human',s=>s.modules[0].path='/universal-human/UniversalHuman_LOD2.glb',s=>s.styleVersion='pillagers-character-style/0.4-draft.1',s=>s.body.source='published',s=>s.lod=0,s=>s.presentation.hair='hair/short',s=>s.presentation.outfit='garment/cream-tunic',s=>s.presentation.technicalWaistWrap=true];
 for(const mutate of changes){const s=structuredClone(original);mutate(s);assert.throws(()=>parseLabSnapshot(s));}
 parsed.body.preset='raven';parsed.camera.position[0]=5;assert.equal(original.body.preset,'giant');assert.equal(original.camera.position[0],0);
});

test('the real candidate uses the shared factory/fit path with cached immutable source and independent palette, bones, morphs and pose',async()=>{
 const {factory:f,requests}=factory(),dna=defaultDNA(),identity=serializeCharacterDNA(dna);
 const a=await f.create(dna,2,bare,previewLabBodyPresentation),b=await f.create(dna,2,bare,{...previewLabBodyPresentation,preset:'giant'});
 try{
  assert.equal(requests.length,1);assert.equal(requests[0],labBodyAsset(goldenLabBody.source).url);
  assert.equal(a.root.userData.bodySource.sha256,goldenLabBody.sha256);assert.equal(a.fit.sockets.size,16);assert.equal(a.fit.cages.size,4);assert.equal(a.fit.modules.size,0);
  const am=meshOf(a),bm=meshOf(b);
  assert.notEqual(am.geometry,bm.geometry);assert.notEqual(am.geometry.getAttribute('color'),bm.geometry.getAttribute('color'));assert.notEqual(am.material,bm.material);
  assert.notEqual(am.skeleton.bones[1],bm.skeleton.bones[1]);assert.notEqual(am.skeleton.boneInverses,bm.skeleton.boneInverses);assert.notEqual(am.morphTargetInfluences,bm.morphTargetInfluences);
  assert.equal(am.geometry.index.count/3,1322);assert.equal(am.geometry.getAttribute('color').count,3966);assert.equal(am.material.map,null);assert.equal(am.material.vertexColors,true);
  const before=Array.from(am.geometry.getAttribute('color').array),weights=am.morphTargetInfluences.slice();
  bm.geometry.getAttribute('color').setXYZ(0,0,0,0);bm.morphTargetInfluences.fill(0);b.sampleAnimation('Run',.2);
  assert.deepEqual(Array.from(am.geometry.getAttribute('color').array),before);assert.deepEqual(am.morphTargetInfluences,weights);
  assert.equal(serializeCharacterDNA(dna),identity);assert.equal(a.root.scale.y,.8);
  await assert.rejects(()=>f.equip(a,'hair/bun'),/not registered and calibrated/);assert.equal(requests.length,1);
  await assert.rejects(()=>f.create(dna,0,bare,previewLabBodyPresentation),/LOD2/);
  const automatic=await f.create(dna,2,true,previewLabBodyPresentation);
  try{for(const module of automatic.fit.modules.values())assert.ok(module.metadata.id.includes('/v04-'),'Auto must never resolve a legacy module on r3');assert.equal(automatic.fit.modules.has('technical-waist-wrap'),false);}finally{automatic.dispose();}
  await assert.rejects(()=>f.create(dna,2,{...bare,hair:'hair/short'},previewLabBodyPresentation),/compatible/);
 }finally{a.dispose();b.dispose();}
});

test('candidate preview does not replace the published World source or its default LOD behavior',async()=>{
 const {factory:f,requests}=factory(),candidate=await f.create(defaultDNA(),2,bare,previewLabBodyPresentation),world=await f.createWorld(defaultDNA());
 try{
  assert.equal(requests.length,2);assert.equal(requests[1],characterAssetURL('body/universal-human',2));assert.equal(world.lod,2);
  world.setMovementSpeed(2);world.update(.02,1);assert.equal(world.state,'Run');assert.equal(world.lod,2);
  assert.equal(candidate.root.userData.bodySource.status,'preview');
 }finally{candidate.dispose();world.dispose();}
});

test('corrected neutral and permanent feminine source have no proper surface crossings in sampled idle, walk and run',async()=>{
 const {Vector3}=await import('three');
 const {auditSurfaceIntersections}=await import('../scripts/characters/surface-intersections.mjs');
 const {factory:f}=factory();
 const female={...defaultDNA(),sex:'female',morphology:{height:1.5,masculinity:.01}};
 for(const [name,dna,body] of [['neutral',defaultDNA(),previewLabBodyPresentation],['feminine',female,{...previewLabBodyPresentation,preset:'auto'}]]){
  const human=await f.create(dna,2,bare,body),mesh=meshOf(human),base=mesh.geometry.getAttribute('position');
  const correspondenceIds=Array.from({length:base.count},(_,i)=>[base.getX(i),base.getY(i),base.getZ(i)].join(','));
  try{
   if(name==='feminine'){assert.ok(Math.abs(human.root.userData.universalHumanProfile.weights.Breasts-.588)<1e-8);assert.ok(Math.abs(human.root.userData.universalHumanProfile.weights.Feminine-.588)<1e-8);}
   for(const [clip,time] of [['Idle',0],['Walk',.25],['Run',.2]]){
    human.sampleAnimation(clip,time);human.root.updateMatrixWorld(true);mesh.skeleton.update();
    const positions=Array.from({length:base.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
    const audit=auditSurfaceIntersections({positions,triangles:mesh.geometry.index.array,correspondenceIds});
    assert.equal(audit.degenerateTriangleIds.length,0,name+' '+clip+' has collapsed surface');
    assert.equal(audit.properInteriorCrossingPairs,0,name+' '+clip+' has proper source crossings: '+audit.properPairs.map(p=>p.pair).join(','));
   }
  }finally{human.dispose();}
 }
});
test('old preview snapshots cannot silently load the corrected source version',()=>{
 const stale=snapshot();stale.styleVersion='pillagers-character-style/0.4-candidate-002';
 stale.modules[0]={id:'lab-body/golden-v04-candidate-002',lod:2,path:'/character-lab/candidates/golden-v04/body.glb',sha256:'1e958ad5a5fe4fb5b08999cee79d5a5177e189ed6b3f78f308a2bd320f62d647'};
 assert.throws(()=>parseLabSnapshot(stale),/style|snapshot|source|version|asset/i);
});

test('Giant keeps the corrected medial-thigh surface through sampled shared-rig motion',async()=>{
 const {Vector3}=await import('three'),{auditSurfaceIntersections}=await import('../scripts/characters/surface-intersections.mjs');
 const {factory:f}=factory(),human=await f.create(defaultDNA(),2,bare,{...previewLabBodyPresentation,preset:'giant'}),mesh=meshOf(human),base=mesh.geometry.getAttribute('position');
 const correspondenceIds=Array.from({length:base.count},(_,i)=>[base.getX(i),base.getY(i),base.getZ(i)].join(','));
 try{for(const [clip,time] of [['Idle',0],['Idle',.25],['Walk',.25],['Walk',.65],['Run',.2],['Run',.65]]){
  human.sampleAnimation(clip,time);human.root.updateMatrixWorld(true);mesh.skeleton.update();
  const positions=Array.from({length:base.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
  const audit=auditSurfaceIntersections({positions,triangles:mesh.geometry.index.array,correspondenceIds});assert.equal(audit.degenerateTriangleIds.length,0);assert.equal(audit.properInteriorCrossingPairs,0,clip+' '+time);
 }const fit=human.fit.snapshot();assert.equal(fit.cages.HEAD_CAGE.vertices,877);assert.equal(fit.headFrame.vertices,859);assert.equal(fit.bodySurfaceCalibration.sourceSHA256,goldenLabBody.sha256);
 }finally{human.dispose();}
});
test('r1 snapshots cannot silently acquire the revised authored calibration or morphology',()=>{const stale=snapshot();stale.styleVersion='pillagers-character-style/0.4-candidate-002-r1';stale.modules[0]={id:'lab-body/golden-v04-candidate-002-r1',lod:2,path:'/character-lab/candidates/golden-v04/body-r1.glb',sha256:'b5631dc884c0b1dc10969e1fd72f2b46aa5aca99e0caea10952333f1504ec2d8'};assert.throws(()=>parseLabSnapshot(stale));});

test('r2 snapshots cannot silently acquire the r3 source-domain and skin correction',()=>{
 const stale=snapshot();stale.styleVersion='pillagers-character-style/0.4-candidate-002-r2';
 stale.modules[0]={id:'lab-body/golden-v04-candidate-002-r2',lod:2,path:'/character-lab/candidates/golden-v04/body-r2.glb',sha256:'ba27e0a4b9cafe1d5db656473e28263d5bb80d6837475bf72ed4f5e35c806cc0'};
 assert.throws(()=>parseLabSnapshot(stale));
});

test('Powerful and compatible body corners avoid torso folds and hand/body crossings in shared-rig motion',async()=>{
 const {Vector3}=await import('three'),{auditSurfaceIntersections}=await import('../scripts/characters/surface-intersections.mjs');
 const {factory:f}=factory();
 const profiles=[{Powerful:1},{Powerful:1,Masculine:1,Grounded:1,Overweight:1},{Powerful:1,Feminine:1,Breasts:1,Grounded:1,Overweight:1}];
 for(const morphs of profiles){
  const human=await f.create(defaultDNA(),2,bare,{...previewLabBodyPresentation,preset:'neutral',morphs}),mesh=meshOf(human),base=mesh.geometry.getAttribute('position');
  const correspondenceIds=Array.from({length:base.count},(_,i)=>[base.getX(i),base.getY(i),base.getZ(i)].join(','));
  try{for(const [clip,time] of [['Idle',0],['Idle',.25],['Walk',.25],['Walk',.65],['Run',.2],['Run',.65]]){
   human.sampleAnimation(clip,time);human.root.updateMatrixWorld(true);mesh.skeleton.update();
   const positions=Array.from({length:base.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
   const audit=auditSurfaceIntersections({positions,triangles:mesh.geometry.index.array,correspondenceIds});
   assert.equal(audit.degenerateTriangleIds.length,0,JSON.stringify(morphs)+' '+clip+' collapsed');
   assert.equal(audit.properInteriorCrossingPairs,0,JSON.stringify(morphs)+' '+clip+' '+time+' crossings');
  }}finally{human.dispose();}
 }
});
