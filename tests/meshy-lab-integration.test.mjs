import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './load-source.mjs';
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');const {defaultCharacterPresentation}=load('../src/characters/CharacterPresentation.ts');const {labBodyAsset,validateLabBodyUsage}=load('../src/characters/LabBodySources.ts');const {resolveLabBodyProfile}=load('../src/characters/LabBodyPresentation.ts');const {meshyBoneProportion}=load('../src/characters/MeshyHumanDynamics.ts');const {snapshotModules,parseLabSnapshot,labSnapshotVersion,fixedLabViews}=load('../src/character-lab/LabSnapshot.ts');const {characterContract}=load('../src/characters/CharacterContract.ts');
test('original Lab snapshots record the exact Meshy source and roundtrip body controls and pose',()=>{
 const dna=defaultDNA(),body={version:1,preset:'auto',source:'meshy'},presentation={...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'};
 for(const lod of [0,1,2]){
  const identity=labBodyAsset('meshy',lod),modules=snapshotModules(dna,presentation,lod,body);assert.equal(modules.length,1);assert.equal(modules[0].id,'body/meshy-human');assert.equal(modules[0].sha256,identity.sha256);
  const snapshot={version:labSnapshotVersion,styleVersion:identity.styleVersion,contractVersion:1,fitVersion:characterContract.attachmentVersion,dna,presentation,body,lod,pose:{animation:'Walk',time:.25,paused:true},camera:{...fixedLabViews.front,type:'orthographic',scale:2.4,fov:38},lighting:'lab-neutral/1',modules};
  assert.equal(parseLabSnapshot(snapshot).body.source,'meshy');assert.equal(parseLabSnapshot(snapshot).pose.time,.25);
  for(const animation of load('../src/characters/MeshyHumanAssetIdentity.ts').meshyHumanAvailableClips){assert.equal(parseLabSnapshot({...snapshot,pose:{...snapshot.pose,animation}}).pose.animation,animation);}
  assert.throws(()=>parseLabSnapshot({...snapshot,pose:{...snapshot.pose,animation:'missing clip'}}),/Invalid snapshot animation/);
  assert.throws(()=>parseLabSnapshot({...snapshot,modules:[{...modules[0],sha256:'old-source'}]}),/assets differ/);
 }
 assert.throws(()=>validateLabBodyUsage('meshy',2,{...presentation,hair:'hair/'+load('../src/characters/UniversalHumanProfile.ts').universalHumanProfile(dna).appearance.hairStyle}),/not compatible/);
});
test('original Lab build overrides drive the Meshy rig while identity DNA stays unchanged',()=>{
 const dna=defaultDNA(),before=JSON.stringify(dna),auto=resolveLabBodyProfile(dna,{version:1,preset:'auto',source:'meshy'}),powerful=resolveLabBodyProfile(dna,{version:1,preset:'auto',source:'meshy',morphs:{Powerful:1}});
 assert.ok(meshyBoneProportion('mixamorigLeftArm',powerful.profile)>meshyBoneProportion('mixamorigLeftArm',auto.profile));assert.equal(JSON.stringify(dna),before);
});
